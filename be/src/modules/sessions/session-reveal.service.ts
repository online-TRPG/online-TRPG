import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ActionOutcome,
  isRecord,
  MainCommandTargetType,
  PlayerCheckOptionDto,
  PlayerScenarioClueDto,
  PlayerScenarioNodeDto,
  PlayerScenarioViewDto,
  PlayerVisibleTargetDto,
  RevealSessionContentDto,
  ScenarioClueDto,
  ScenarioCheckOptionDto,
  ScenarioNodeType,
  SessionRevealResponseDto,
  VttObjectProximityTriggerDto,
  VttObjectRevealFogEffectDto,
  decodeLenientScenarioClueArray,
  decodeScenarioNodeMeta,
} from "@trpg/shared-types";
import { randomUUID } from "crypto";
import {
  parseJsonOrFallback,
} from "../../common/utils/json-runtime";
import type { SessionsService } from "./sessions.service";

type SessionRevealRuntime = ReturnType<SessionsService["createSessionRevealRuntime"]>;
type HumanGmOverrideLogResult = Awaited<ReturnType<SessionRevealRuntime["createHumanGmOverrideTurnLog"]>>;
export type RevealableScenarioClue = ScenarioClueDto & { nodeId: string };
export type RevealContentKind = "clue" | "item" | "event";
export type RevealScope = "party" | "user" | "character";
export type RevealClueSnapshot = ScenarioClueDto & {
  nodeId?: string;
  sourceHazardId?: string;
  sourceHazardName?: string | null;
};
export type RevealedClueSnapshot = {
  id?: string;
  title?: string;
  handoutText?: string;
  playerText?: string;
  importance?: string;
};
export type RevealItemSnapshot = {
  id: string;
  name?: string | null;
  sourceObjectId?: string;
};
export type RevealEventSnapshot = {
  id: string;
  name?: string | null;
  type?: "REVEAL_FOG_ON_PROXIMITY";
  sourceObjectId?: string;
  sourceObjectName?: string | null;
  currentNodeId?: string | null;
  trigger?: VttObjectProximityTriggerDto;
  effect?: VttObjectRevealFogEffectDto;
};
type RecordSessionRevealBaseParams = {
  sessionScenarioId: string;
  contentId: string;
  scope: RevealScope;
  recipientId?: string | null;
  revealedBy: string;
  reason?: string | null;
  turnLogId?: string | null;
};
export type RecordSessionRevealParams =
  | (RecordSessionRevealBaseParams & { contentKind: "clue"; snapshot?: RevealClueSnapshot | null })
  | (RecordSessionRevealBaseParams & { contentKind: "item"; snapshot?: RevealItemSnapshot | null })
  | (RecordSessionRevealBaseParams & { contentKind: "event"; snapshot?: RevealEventSnapshot | null });

export type RevealPolicyMode = "AUTO_REVEAL" | "PLAYER_ACTION" | "CHECK_SUCCESS" | "CHECK_PARTIAL" | "POST_COMBAT" | "GM_APPROVAL";

@Injectable()
export class SessionRevealService {
  async getPlayerScenarioForUser(runtime: SessionRevealRuntime, userId: string, sessionId: string): Promise<PlayerScenarioViewDto> {
    const session = await runtime.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await runtime.ensureMembership(userId, resolvedSessionId);
    const { sessionScenario, state } = await runtime.getGameStateEntityOrThrow(resolvedSessionId);
    await runtime.ensureSessionScenarioNodeSnapshotForScenario(sessionScenario.id, sessionScenario.scenarioId);
    const visits = await runtime.prisma.sessionNodeVisit.findMany({
      where: { sessionScenarioId: sessionScenario.id },
      orderBy: { firstVisitedAt: "asc" },
    });
    const visitedNodeIds = Array.from(new Set([...visits.map((visit) => visit.nodeId), ...(state.currentNodeId ? [state.currentNodeId] : [])]));
    const nodes = visitedNodeIds.length
      ? await runtime.prisma.sessionScenarioNode.findMany({
          where: {
            sessionScenarioId: sessionScenario.id,
            nodeId: { in: visitedNodeIds },
          },
        })
      : [];
    const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
    const revealedClueSnapshots = await this.getRevealedClueSnapshotsForUser(runtime, sessionScenario.id, resolvedSessionId, userId);
    const visitedNodes = visitedNodeIds.flatMap((nodeId) => {
      const node = nodeById.get(nodeId);
      return node ? [this.mapPlayerScenarioNode(runtime, node, revealedClueSnapshots)] : [];
    });
    const revealedClues = this.getUniquePlayerClues(
      runtime,
      visitedNodes.flatMap((node) => node.publicClues),
    );

    return {
      sessionScenarioId: sessionScenario.id,
      scenarioId: sessionScenario.scenarioId,
      currentNodeId: state.currentNodeId ?? null,
      currentNode: state.currentNodeId ? (visitedNodes.find((node) => node.id === state.currentNodeId) ?? null) : null,
      visitedNodes,
      revealedClues,
    };
  }

  async getPublicClueSummariesForUser(runtime: SessionRevealRuntime, userId: string, sessionId: string): Promise<string[]> {
    const session = await runtime.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await runtime.ensureMembership(userId, resolvedSessionId);
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    const revealedClueSnapshots = await this.getRevealedClueSnapshotsForUser(runtime, activeScenario.id, resolvedSessionId, userId);
    if (!revealedClueSnapshots.size) {
      return [];
    }

    return Array.from(revealedClueSnapshots.values())
      .flatMap((clue) => this.mapPlayerScenarioClueEntry(clue))
      .map((clue) => `${clue.title}: ${clue.text}`);
  }

  async revealSessionContent(
    runtime: SessionRevealRuntime,
    userId: string,
    sessionId: string,
    dto: Omit<RevealSessionContentDto, "contentKind"> & { contentKind?: string },
  ): Promise<SessionRevealResponseDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    await runtime.ensureSessionScenarioNodeSnapshotForScenario(activeScenario.id, activeScenario.scenarioId);
    const contentKind = this.toRevealContentKind(dto.contentKind);
    if (contentKind !== "clue") {
      throw new BadRequestException("Manual session reveal currently supports clue content only.");
    }
    const scope = dto.scope ?? "party";
    const recipientId = dto.recipientId?.trim() || null;
    const content = await runtime.findSessionScenarioRevealable(activeScenario.id, dto.contentId);
    const { reveal, gmTurnLog } = await runtime.prisma.$transaction(async (tx) => {
      const createdReveal = await this.recordSessionReveal(runtime, tx, {
        sessionScenarioId: activeScenario.id,
        contentId: dto.contentId,
        contentKind,
        scope,
        recipientId,
        revealedBy: "human_gm",
        reason: dto.reason?.trim() || "manual_gm_reveal",
        snapshot: content,
      });
      const gmTurnLog = await runtime.createHumanGmOverrideTurnLog({
        tx,
        kind: "reveal_handout",
        sessionId: resolvedSessionId,
        sessionScenarioId: activeScenario.id,
        gmUserId: userId,
        publicNarration: dto.reason?.trim() || "GM revealed session content.",
        targetId: dto.contentId,
        statePatch: {
          revealId: createdReveal.id,
          contentId: dto.contentId,
          contentKind,
          scope,
          recipientId,
        },
        metadata: {
          reason: dto.reason?.trim() || "manual_gm_reveal",
        },
      });
      await tx.sessionReveal.update({
        where: { id: createdReveal.id },
        data: { turnLogId: gmTurnLog.turnLog.turnLogId },
      });
      return { reveal: createdReveal, gmTurnLog };
    });

    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    const emittedGmTurnLog = gmTurnLog;
    if (emittedGmTurnLog) {
      runtime.realtimeEvents.emitTurnLogCreated(resolvedSessionId, emittedGmTurnLog.turnLog);
      if (emittedGmTurnLog.stateDiff) {
        runtime.realtimeEvents.emitStateDiffApplied(resolvedSessionId, emittedGmTurnLog.stateDiff);
      }
    }
    runtime.realtimeEvents.emitSessionSnapshot(resolvedSessionId, snapshot);
    return this.mapSessionReveal(runtime, reveal);
  }

  async revealCurrentNodeCluesAfterAction(
    runtime: SessionRevealRuntime,
    params: {
      sessionScenarioId: string;
      nodeId: string;
      actionText: string;
      outcome: ActionOutcome;
      policyModes?: RevealPolicyMode[];
      turnLogId?: string | null;
      revealedBy?: string;
    },
    client?: Prisma.TransactionClient,
  ): Promise<number> {
    const revealedClues = await this.revealCurrentNodeCluesAfterActionWithDetails(
      runtime,
      params,
      client,
    );
    return revealedClues.length;
  }

  async revealCurrentNodeCluesAfterActionWithDetails(
    runtime: SessionRevealRuntime,
    params: {
      sessionScenarioId: string;
      nodeId: string;
      actionText: string;
      outcome: ActionOutcome;
      policyModes?: RevealPolicyMode[];
      turnLogId?: string | null;
      revealedBy?: string;
    },
    client?: Prisma.TransactionClient,
  ): Promise<Array<{ id: string; title: string; text: string | null }>> {
    const reveal = (tx: Prisma.TransactionClient) =>
      this.recordCurrentNodeCluesByPolicy(runtime, tx, {
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.nodeId,
        actionText: params.actionText,
        outcome: params.outcome,
        policyModes: params.policyModes ?? ["PLAYER_ACTION", "CHECK_SUCCESS", "CHECK_PARTIAL"],
        turnLogId: params.turnLogId,
        revealedBy: params.revealedBy ?? "system",
      });
    return client ? reveal(client) : runtime.prisma.$transaction(reveal);
  }

  mapPlayerScenarioNode(
    runtime: SessionRevealRuntime,
    node: {
      id: string;
      nodeId?: string;
      nodeType: string;
      title: string;
      sceneText: string;
      imageUrl: string | null;
      checkOptionsJson: string;
      cluesJson: string;
      nodeMetaJson?: string | null;
    },
    revealedClueSnapshots: Map<string, RevealedClueSnapshot>,
  ): PlayerScenarioNodeDto {
    const clues = this.parseScenarioCluesJson(node.cluesJson);

    return {
      id: node.nodeId ?? node.id,
      nodeType: this.toScenarioNodeType(runtime, node.nodeType),
      title: node.title,
      sceneText: node.sceneText,
      imageUrl: node.imageUrl ?? null,
      checkOptions: this.mapPlayerCheckOptions(runtime, runtime.extractChecksFromCheckOptions(node.checkOptionsJson)),
      publicClues: clues
        .flatMap((clue) => {
          const clueId = clue.id;
          const revealedClue = clueId ? revealedClueSnapshots.get(clueId) : null;
          return revealedClue ? [revealedClue] : [];
        })
        .flatMap((clue) => this.mapPlayerScenarioClueEntry(clue)),
      visibleTargets: this.mapPlayerVisibleTargets(runtime, node.nodeMetaJson ?? null),
    };
  }

  mapPlayerVisibleTargets(runtime: SessionRevealRuntime, nodeMetaJson: string | null): PlayerVisibleTargetDto[] {
    const nodeMeta = parseJsonOrFallback(nodeMetaJson, null, decodeScenarioNodeMeta);
    if (!nodeMeta) {
      return [];
    }

    return [
      ...this.normalizePlayerVisibleTargets(runtime, nodeMeta.npcs, MainCommandTargetType.NPC),
      ...this.normalizePlayerVisibleTargets(runtime, nodeMeta.objects, MainCommandTargetType.OBJECT),
      ...this.normalizePlayerVisibleTargets(runtime, nodeMeta.items, MainCommandTargetType.OBJECT),
      ...this.normalizePlayerVisibleTargets(runtime, nodeMeta.areas, MainCommandTargetType.AREA),
    ];
  }

  normalizePlayerVisibleTargets(runtime: SessionRevealRuntime, value: unknown, targetType: MainCommandTargetType): PlayerVisibleTargetDto[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }
      const record = entry;
      if (record.isVisible === false) {
        return [];
      }

      const id = runtime.getStringProperty(record, "id");
      const name = runtime.getStringProperty(record, "name") ?? runtime.getStringProperty(record, "title");
      if (!id || !name) {
        return [];
      }

      return [{
        id,
        name,
        targetType,
        summary:
          runtime.getStringProperty(record, "shortDescription") ??
          runtime.getStringProperty(record, "description") ??
          runtime.getStringProperty(record, "summary") ??
          name,
        disposition: runtime.getStringProperty(record, "disposition") ?? null,
      }];
    });
  }

  mapPlayerCheckOptions(runtime: SessionRevealRuntime, options: ScenarioCheckOptionDto[]): PlayerCheckOptionDto[] {
    return options.flatMap((option) => {
      const id = option.id;
      const type = option.type;
      const skill = option.skill;
      const label = option.playerLabel ?? option.label ?? skill ?? id;
      if (!label) {
        return [];
      }

      return [{
        ...(id ? { id } : {}),
        label,
        ...(type ? { type } : {}),
        ...(skill ? { skill } : {}),
      }];
    });
  }

  mapPlayerScenarioClue(clue: RevealedClueSnapshot): PlayerScenarioClueDto | null {
    const playerText = clue.handoutText ?? clue.playerText ?? null;
    if (!playerText) {
      return null;
    }
    const title = clue.title ?? playerText.slice(0, 40) ?? "단서";
    const text = playerText;

    return {
      id: clue.id ?? randomUUID(),
      title,
      text,
      importance: clue.importance ?? null,
    };
  }

  private mapPlayerScenarioClueEntry(clue: RevealedClueSnapshot): PlayerScenarioClueDto[] {
    const mapped = this.mapPlayerScenarioClue(clue);
    return mapped ? [mapped] : [];
  }

  getUniquePlayerClues(runtime: SessionRevealRuntime, clues: PlayerScenarioClueDto[]): PlayerScenarioClueDto[] {
    const seen = new Set<string>();
    return clues.filter((clue) => {
      if (seen.has(clue.id)) {
        return false;
      }
      seen.add(clue.id);
      return true;
    });
  }

  async getRevealedClueSnapshotsForUser(
    runtime: SessionRevealRuntime,
    sessionScenarioId: string,
    sessionId: string,
    userId: string,
  ): Promise<Map<string, RevealedClueSnapshot>> {
    const characterRecipients = await runtime.prisma.sessionCharacter.findMany({
      where: { sessionId, userId },
      select: { id: true, characterId: true },
    });
    const recipientIds = [userId, ...characterRecipients.flatMap((character) => [character.id, character.characterId])];
    if (!runtime.prisma.sessionReveal?.findMany) {
      return new Map();
    }
    const reveals = await runtime.prisma.sessionReveal.findMany({
      where: {
        sessionScenarioId,
        contentKind: "clue",
        OR: [{ scope: "party" }, { scope: "user", recipientId: userId }, { scope: "character", recipientId: { in: recipientIds } }],
      },
      select: { contentId: true, snapshotJson: true },
    });
    const revealed = new Map<string, RevealedClueSnapshot>();
    for (const reveal of reveals) {
      revealed.set(reveal.contentId, this.parseRevealedClueSnapshot(reveal.snapshotJson, reveal.contentId));
    }
    return revealed;
  }

  private parseRevealedClueSnapshot(value: string | null | undefined, fallbackId: string): RevealedClueSnapshot {
    return parseJsonOrFallback(value, { id: fallbackId }, (parsed) => this.decodeRevealedClueSnapshot(parsed, fallbackId));
  }

  private decodeRevealedClueSnapshot(value: unknown, fallbackId: string): RevealedClueSnapshot {
    if (!isRecord(value)) {
      throw new Error("revealed clue snapshot must be an object.");
    }
    return {
      id: this.readOptionalString(value.id) ?? fallbackId,
      title: this.readOptionalString(value.title),
      handoutText: this.readOptionalString(value.handoutText),
      playerText: this.readOptionalString(value.playerText),
      importance: this.readOptionalString(value.importance),
    };
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  async findSessionScenarioRevealable(runtime: SessionRevealRuntime, sessionScenarioId: string, contentId: string): Promise<RevealableScenarioClue> {
    const nodes = await runtime.prisma.sessionScenarioNode.findMany({
      where: { sessionScenarioId },
      select: { nodeId: true, cluesJson: true },
    });

    for (const node of nodes) {
      const clues = this.parseScenarioCluesJson(node.cluesJson);
      const clue = clues.find((candidate) => candidate.id === contentId);
      if (clue) {
        return { ...clue, nodeId: node.nodeId };
      }
    }

    throw new NotFoundException(`Revealable content ${contentId} was not found in the active scenario.`);
  }

  shouldRevealOnNodeVisit(runtime: SessionRevealRuntime, clue: ScenarioClueDto): boolean {
    return this.getRevealPolicyMode(runtime, clue) === "AUTO_REVEAL";
  }

  getRevealPolicyMode(runtime: SessionRevealRuntime, clue: ScenarioClueDto): RevealPolicyMode {
    const revealPolicy = clue.revealPolicy;
    const policyMode = isRecord(revealPolicy) ? runtime.getStringProperty(revealPolicy, "mode") : null;
    switch (policyMode) {
      case "AUTO_REVEAL":
      case "PLAYER_ACTION":
      case "CHECK_SUCCESS":
      case "CHECK_PARTIAL":
      case "POST_COMBAT":
      case "GM_APPROVAL":
        return policyMode;
      case "on_node_visit":
        return "AUTO_REVEAL";
      case "manual":
        return "GM_APPROVAL";
      case "conditional":
        return "PLAYER_ACTION";
      default:
        return "PLAYER_ACTION";
    }
  }

  async recordCurrentNodeCluesByPolicy(
    runtime: SessionRevealRuntime,
    tx: Prisma.TransactionClient,
    params: {
      sessionScenarioId: string;
      nodeId: string;
      actionText?: string | null;
      outcome?: ActionOutcome | null;
      policyModes?: RevealPolicyMode[];
      revealedBy: string;
      reason?: string | null;
      turnLogId?: string | null;
    },
  ): Promise<Array<{ id: string; title: string; text: string | null }>> {
    const node = await tx.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: params.nodeId,
        },
      },
      select: { cluesJson: true },
    });
    if (!node) {
      return [];
    }

    const clues = this.parseScenarioCluesJson(node.cluesJson);
    const revealInputs = clues.flatMap((clue) => {
      const policyMode = this.getRevealPolicyMode(runtime, clue);
      if (params.policyModes && !params.policyModes.includes(policyMode)) {
        return [];
      }
      if (!this.shouldRevealClueForPolicy(runtime, clue, policyMode, params)) {
        return [];
      }

      const contentId = clue.id;
      if (!contentId) {
        return [];
      }

      return [
        {
          contentId,
          reason: params.reason ?? this.getRevealReason(runtime, policyMode, params.outcome),
          snapshot: this.toScenarioClueRecord(clue),
        },
      ];
    });

    const existingReveals = revealInputs.length
      ? await tx.sessionReveal.findMany({
          where: {
            sessionScenarioId: params.sessionScenarioId,
            contentKind: "clue",
            scope: "party",
            recipientKey: "party",
            contentId: { in: revealInputs.map((input) => input.contentId) },
          },
          select: { contentId: true },
        })
      : [];
    const existingIds = new Set(existingReveals.map((reveal) => reveal.contentId));
    const newRevealInputs = revealInputs.filter((input) => !existingIds.has(input.contentId));

    await Promise.all(
      newRevealInputs.map((input) =>
        this.recordSessionReveal(runtime, tx, {
          sessionScenarioId: params.sessionScenarioId,
          contentId: input.contentId,
          contentKind: "clue",
          scope: "party",
          revealedBy: params.revealedBy,
          reason: input.reason,
          turnLogId: params.turnLogId,
          snapshot: input.snapshot,
        }),
      ),
    );
    return newRevealInputs.map((input) => this.toRevealClueSummary(runtime, input.contentId, input.snapshot));
  }

  shouldRevealClueForPolicy(
    runtime: SessionRevealRuntime,
    clue: ScenarioClueDto,
    policyMode: RevealPolicyMode,
    params: {
      actionText?: string | null;
      outcome?: ActionOutcome | null;
    },
  ): boolean {
    switch (policyMode) {
      case "AUTO_REVEAL":
      case "POST_COMBAT":
        return true;
      case "PLAYER_ACTION":
        return this.matchesDiscoverySource(runtime, clue, params.actionText);
      case "CHECK_SUCCESS":
        return params.outcome === ActionOutcome.SUCCESS && this.matchesDiscoverySource(runtime, clue, params.actionText);
      case "CHECK_PARTIAL":
        return this.matchesDiscoverySource(runtime, clue, params.actionText);
      case "GM_APPROVAL":
        return false;
    }
  }

  getRevealReason(runtime: SessionRevealRuntime, policyMode: RevealPolicyMode, outcome?: ActionOutcome | null): string {
    if (policyMode === "CHECK_PARTIAL" && outcome !== ActionOutcome.SUCCESS) {
      return "check_partial";
    }
    switch (policyMode) {
      case "AUTO_REVEAL":
        return "node_visit";
      case "PLAYER_ACTION":
        return "player_action";
      case "CHECK_SUCCESS":
      case "CHECK_PARTIAL":
        return "check_success";
      case "POST_COMBAT":
        return "post_combat";
      case "GM_APPROVAL":
        return "gm_approval";
    }
  }

  matchesDiscoverySource(runtime: SessionRevealRuntime, clue: ScenarioClueDto, actionText: string | null | undefined): boolean {
    const source = clue.source ?? clue.discoverySource ?? null;
    if (!source || !actionText?.trim()) {
      return false;
    }

    const normalizedAction = this.normalizeDiscoveryText(runtime, actionText);
    const normalizedSource = this.normalizeDiscoveryText(runtime, source);
    if (!normalizedAction || !normalizedSource) {
      return false;
    }
    if (normalizedAction.includes(normalizedSource) || normalizedSource.includes(normalizedAction)) {
      return true;
    }

    return source
      .split(/[\s,;/|(){}\[\]"'`]+/u)
      .map((part) => this.normalizeDiscoveryText(runtime, part))
      .filter((part) => part.length >= 2)
      .some((part) => normalizedAction.includes(part));
  }

  normalizeDiscoveryText(runtime: SessionRevealRuntime, value: string): string {
    return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
  }

  buildRecipientKey(runtime: SessionRevealRuntime, scope: RevealScope, recipientId: string | null | undefined): string {
    return scope === "party" ? "party" : `${scope}:${recipientId ?? "unknown"}`;
  }

  mapSessionReveal(
    runtime: SessionRevealRuntime,
    reveal: {
      id: string;
      sessionScenarioId: string;
      contentId: string;
      contentKind: string;
      scope: string;
      recipientId: string | null;
      revealedAt: Date;
      revealedBy: string;
      reason: string | null;
    },
  ): SessionRevealResponseDto {
    return {
      id: reveal.id,
      sessionScenarioId: reveal.sessionScenarioId,
      contentId: reveal.contentId,
      contentKind: this.toRevealContentKind(reveal.contentKind),
      scope: this.toRevealScope(reveal.scope),
      recipientId: reveal.recipientId,
      revealedAt: reveal.revealedAt.toISOString(),
      revealedBy: reveal.revealedBy,
      reason: reveal.reason,
    };
  }

  toRevealClueSummary(runtime: SessionRevealRuntime, contentId: string, snapshot: RevealClueSnapshot): { id: string; title: string; text: string | null } {
    return {
      id: contentId,
      title: snapshot.title ?? contentId,
      text: snapshot.handoutText ?? snapshot.playerText ?? snapshot.text ?? snapshot.revelation ?? null,
    };
  }

  private toRevealContentKind(value: string | null | undefined): RevealContentKind {
    const contentKind = value?.trim() || "clue";
    switch (contentKind) {
      case "clue":
      case "item":
      case "event":
        return contentKind;
      default:
        throw new BadRequestException("Unsupported reveal content kind.");
    }
  }

  private toRevealScope(value: string | null | undefined): RevealScope {
    const scope = value?.trim() || "party";
    switch (scope) {
      case "party":
      case "user":
      case "character":
        return scope;
      default:
        throw new BadRequestException("Unsupported reveal scope.");
    }
  }

  toScenarioNodeType(runtime: SessionRevealRuntime, value: string): PlayerScenarioNodeDto["nodeType"] {
    switch (value) {
      case ScenarioNodeType.EXPLORATION:
        return ScenarioNodeType.EXPLORATION;
      case ScenarioNodeType.COMBAT:
        return ScenarioNodeType.COMBAT;
      case ScenarioNodeType.STORY:
        return ScenarioNodeType.STORY;
      default:
        return ScenarioNodeType.STORY;
    }
  }

  async recordNodeVisit(
    runtime: SessionRevealRuntime,
    tx: Prisma.TransactionClient,
    params: {
      sessionScenarioId: string;
      nodeId: string;
      enteredByTurnLogId?: string | null;
    },
  ): Promise<void> {
    const node = await tx.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: params.nodeId,
        },
      },
      select: { id: true, cluesJson: true },
    });

    if (!node) {
      throw new NotFoundException(`Session scenario node ${params.nodeId} was not found.`);
    }

    await tx.sessionNodeVisit.upsert({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: params.nodeId,
        },
      },
      create: {
        sessionScenarioId: params.sessionScenarioId,
        sessionScenarioNodeId: node.id,
        nodeId: params.nodeId,
        enteredByTurnLogId: params.enteredByTurnLogId ?? null,
      },
      update: {
        visitCount: { increment: 1 },
        enteredByTurnLogId: params.enteredByTurnLogId ?? undefined,
      },
    });

    const clues = this.parseScenarioCluesJson(node.cluesJson);

    await Promise.all(
      clues
        .filter((clue) => this.shouldRevealOnNodeVisit(runtime, clue))
        .map((clue) => {
          const contentId = clue.id;
          if (!contentId) {
            return Promise.resolve();
          }
          return this.recordSessionReveal(runtime, tx, {
            sessionScenarioId: params.sessionScenarioId,
            contentId,
            contentKind: "clue",
            scope: "party",
            revealedBy: "system",
            reason: "node_visit",
            turnLogId: params.enteredByTurnLogId,
            snapshot: this.toScenarioClueRecord(clue),
          });
        }),
    );
  }

  private toScenarioClueRecord(clue: ScenarioClueDto): RevealClueSnapshot {
    return { ...clue };
  }

  async recordSessionReveal(
    runtime: SessionRevealRuntime,
    tx: Prisma.TransactionClient,
    params: RecordSessionRevealParams,
  ) {
    const recipientId = params.scope === "party" ? null : (params.recipientId ?? null);
    const recipientKey = this.buildRecipientKey(runtime, params.scope, recipientId);

    return tx.sessionReveal.upsert({
      where: {
        sessionScenarioId_contentId_contentKind_scope_recipientKey: {
          sessionScenarioId: params.sessionScenarioId,
          contentId: params.contentId,
          contentKind: params.contentKind,
          scope: params.scope,
          recipientKey,
        },
      },
      create: {
        sessionScenarioId: params.sessionScenarioId,
        contentId: params.contentId,
        contentKind: params.contentKind,
        scope: params.scope,
        recipientId,
        recipientKey,
        revealedBy: params.revealedBy,
        reason: params.reason ?? null,
        turnLogId: params.turnLogId ?? null,
        snapshotJson: params.snapshot ? JSON.stringify(params.snapshot) : null,
      },
      update: {
        reason: params.reason ?? undefined,
        turnLogId: params.turnLogId ?? undefined,
        snapshotJson: params.snapshot ? JSON.stringify(params.snapshot) : undefined,
      },
    });
  }

  private parseScenarioCluesJson(value: string | null | undefined): ScenarioClueDto[] {
    return parseJsonOrFallback(value, [], decodeLenientScenarioClueArray);
  }
}
