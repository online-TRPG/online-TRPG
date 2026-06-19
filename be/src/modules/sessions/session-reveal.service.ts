import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ActionOutcome,
  MainCommandTargetType,
  PlayerCheckOptionDto,
  PlayerScenarioClueDto,
  PlayerScenarioNodeDto,
  PlayerScenarioViewDto,
  PlayerVisibleTargetDto,
  RevealSessionContentDto,
  ScenarioNodeType,
  SessionRevealResponseDto,
} from "@trpg/shared-types";
import { randomUUID } from "crypto";
import type { SessionsService } from "./sessions.service";

type SessionRevealRuntime = ReturnType<SessionsService["createSessionRevealRuntime"]>;
type HumanGmOverrideLogResult = Awaited<ReturnType<SessionRevealRuntime["createHumanGmOverrideTurnLog"]>>;

export type RevealPolicyMode = "AUTO_REVEAL" | "PLAYER_ACTION" | "CHECK_SUCCESS" | "CHECK_PARTIAL" | "POST_COMBAT" | "GM_APPROVAL";

const revealContentKinds = new Set(["clue", "item", "event"]);

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
    const visitedNodes = visitedNodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => this.mapPlayerScenarioNode(runtime, node, revealedClueSnapshots));
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
      .map((clue) => this.mapPlayerScenarioClue(runtime, clue))
      .filter((clue): clue is PlayerScenarioClueDto => Boolean(clue))
      .map((clue) => `${clue.title}: ${clue.text}`);
  }

  async revealSessionContent(
    runtime: SessionRevealRuntime,
    userId: string,
    sessionId: string,
    dto: RevealSessionContentDto,
  ): Promise<SessionRevealResponseDto> {
    const session = await runtime.getHumanGmSessionForOperator(userId, sessionId);
    const resolvedSessionId = session.id;
    const activeScenario = await runtime.getActiveSessionScenarioEntityOrThrow(resolvedSessionId);
    await runtime.ensureSessionScenarioNodeSnapshotForScenario(activeScenario.id, activeScenario.scenarioId);
    const contentKind = dto.contentKind?.trim() || "clue";
    if (!revealContentKinds.has(contentKind)) {
      throw new BadRequestException("Unsupported reveal content kind.");
    }
    const scope = dto.scope ?? "party";
    const recipientId = dto.recipientId?.trim() || null;
    const content = await this.findSessionScenarioRevealable(runtime, activeScenario.id, dto.contentId);
    let gmTurnLog: HumanGmOverrideLogResult | null = null;

    const reveal = await runtime.prisma.$transaction(async (tx) => {
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
      gmTurnLog = await runtime.createHumanGmOverrideTurnLog({
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
      return createdReveal;
    });

    const snapshot = await runtime.buildSnapshot(resolvedSessionId);
    const emittedGmTurnLog = gmTurnLog as HumanGmOverrideLogResult | null;
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
  ): Promise<number> {
    const revealedClues = await this.revealCurrentNodeCluesAfterActionWithDetails(runtime, params);
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
  ): Promise<Array<{ id: string; title: string; text: string | null }>> {
    return runtime.prisma.$transaction((tx) =>
      this.recordCurrentNodeCluesByPolicy(runtime, tx, {
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.nodeId,
        actionText: params.actionText,
        outcome: params.outcome,
        policyModes: params.policyModes ?? ["PLAYER_ACTION", "CHECK_SUCCESS", "CHECK_PARTIAL"],
        turnLogId: params.turnLogId,
        revealedBy: params.revealedBy ?? "system",
      }),
    );
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
    revealedClueSnapshots: Map<string, Record<string, unknown>>,
  ): PlayerScenarioNodeDto {
    const clues = runtime.parseJson<Record<string, unknown>[]>(node.cluesJson, []);

    return {
      id: node.nodeId ?? node.id,
      nodeType: this.toScenarioNodeType(runtime, node.nodeType),
      title: node.title,
      sceneText: node.sceneText,
      imageUrl: node.imageUrl ?? null,
      checkOptions: this.mapPlayerCheckOptions(runtime, runtime.extractChecksFromCheckOptions(node.checkOptionsJson)),
      publicClues: clues
        .map((clue) => {
          const clueId = runtime.getStringProperty(clue, "id");
          return clueId ? (revealedClueSnapshots.get(clueId) ?? null) : null;
        })
        .filter((clue): clue is Record<string, unknown> => Boolean(clue))
        .map((clue) => this.mapPlayerScenarioClue(runtime, clue))
        .filter((clue): clue is PlayerScenarioClueDto => Boolean(clue)),
      visibleTargets: this.mapPlayerVisibleTargets(runtime, node.nodeMetaJson ?? null),
    };
  }

  mapPlayerVisibleTargets(runtime: SessionRevealRuntime, nodeMetaJson: string | null): PlayerVisibleTargetDto[] {
    const nodeMeta = runtime.parseJson<Record<string, unknown> | null>(nodeMetaJson, null);
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

    return value
      .map((entry): PlayerVisibleTargetDto | null => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const record = entry as Record<string, unknown>;
        if (record.isVisible === false) {
          return null;
        }

        const id = runtime.getStringProperty(record, "id");
        const name = runtime.getStringProperty(record, "name") ?? runtime.getStringProperty(record, "title");
        if (!id || !name) {
          return null;
        }

        return {
          id,
          name,
          targetType,
          summary:
            runtime.getStringProperty(record, "shortDescription") ??
            runtime.getStringProperty(record, "description") ??
            runtime.getStringProperty(record, "summary") ??
            name,
          disposition: runtime.getStringProperty(record, "disposition") ?? null,
        };
      })
      .filter((entry): entry is PlayerVisibleTargetDto => Boolean(entry));
  }

  mapPlayerCheckOptions(runtime: SessionRevealRuntime, options: Record<string, unknown>[]): PlayerCheckOptionDto[] {
    return options
      .map((option) => {
        const id = runtime.getStringProperty(option, "id");
        const type = runtime.getStringProperty(option, "type");
        const skill = runtime.getStringProperty(option, "skill");
        const label = runtime.getStringProperty(option, "playerLabel") ?? runtime.getStringProperty(option, "label") ?? skill ?? id;
        if (!label) {
          return null;
        }

        return {
          ...(id ? { id } : {}),
          label,
          ...(type ? { type } : {}),
          ...(skill ? { skill } : {}),
        };
      })
      .filter((option): option is PlayerCheckOptionDto => Boolean(option));
  }

  mapPlayerScenarioClue(runtime: SessionRevealRuntime, clue: Record<string, unknown>): PlayerScenarioClueDto | null {
    const playerText = runtime.getStringProperty(clue, "handoutText") ?? runtime.getStringProperty(clue, "playerText");
    if (!playerText) {
      return null;
    }
    const title = runtime.getStringProperty(clue, "title") ?? playerText.slice(0, 40) ?? "단서";
    const text = playerText;

    return {
      id: runtime.getStringProperty(clue, "id") ?? randomUUID(),
      title,
      text,
      importance: runtime.getStringProperty(clue, "importance"),
    };
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
  ): Promise<Map<string, Record<string, unknown>>> {
    const characterRecipients = await runtime.prisma.sessionCharacter.findMany({
      where: { sessionId, userId },
      select: { id: true, characterId: true },
    });
    const recipientIds = [userId, ...characterRecipients.flatMap((character) => [character.id, character.characterId])];
    const reveals = await runtime.prisma.sessionReveal.findMany({
      where: {
        sessionScenarioId,
        contentKind: "clue",
        OR: [{ scope: "party" }, { scope: "user", recipientId: userId }, { scope: "character", recipientId: { in: recipientIds } }],
      },
      select: { contentId: true, snapshotJson: true },
    });
    const revealed = new Map<string, Record<string, unknown>>();
    for (const reveal of reveals) {
      revealed.set(reveal.contentId, runtime.parseJson<Record<string, unknown>>(reveal.snapshotJson, { id: reveal.contentId }));
    }
    return revealed;
  }

  async findSessionScenarioRevealable(runtime: SessionRevealRuntime, sessionScenarioId: string, contentId: string): Promise<Record<string, unknown>> {
    const nodes = await runtime.prisma.sessionScenarioNode.findMany({
      where: { sessionScenarioId },
      select: { nodeId: true, cluesJson: true },
    });

    for (const node of nodes) {
      const clues = runtime.parseJson<Record<string, unknown>[]>(node.cluesJson, []);
      const clue = clues.find((candidate) => runtime.getStringProperty(candidate, "id") === contentId);
      if (clue) {
        return { ...clue, nodeId: node.nodeId };
      }
    }

    throw new NotFoundException(`Revealable content ${contentId} was not found in the active scenario.`);
  }

  shouldRevealOnNodeVisit(runtime: SessionRevealRuntime, clue: Record<string, unknown>): boolean {
    return this.getRevealPolicyMode(runtime, clue) === "AUTO_REVEAL";
  }

  getRevealPolicyMode(runtime: SessionRevealRuntime, clue: Record<string, unknown>): RevealPolicyMode {
    const revealPolicy = clue.revealPolicy;
    const policyMode = revealPolicy && typeof revealPolicy === "object" ? runtime.getStringProperty(revealPolicy as Record<string, unknown>, "mode") : null;
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

    const clues = runtime.parseJson<Record<string, unknown>[]>(node.cluesJson, []);
    const revealInputs = clues.flatMap((clue) => {
      const policyMode = this.getRevealPolicyMode(runtime, clue);
      if (params.policyModes && !params.policyModes.includes(policyMode)) {
        return [];
      }
      if (!this.shouldRevealClueForPolicy(runtime, clue, policyMode, params)) {
        return [];
      }

      const contentId = runtime.getStringProperty(clue, "id");
      if (!contentId) {
        return [];
      }

      return [
        {
          contentId,
          reason: params.reason ?? this.getRevealReason(runtime, policyMode, params.outcome),
          snapshot: clue,
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
    clue: Record<string, unknown>,
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

  matchesDiscoverySource(runtime: SessionRevealRuntime, clue: Record<string, unknown>, actionText: string | null | undefined): boolean {
    const source = runtime.getStringProperty(clue, "source") ?? runtime.getStringProperty(clue, "discoverySource");
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

  buildRecipientKey(runtime: SessionRevealRuntime, scope: string, recipientId: string | null | undefined): string {
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
      contentKind: reveal.contentKind,
      scope: reveal.scope,
      recipientId: reveal.recipientId,
      revealedAt: reveal.revealedAt.toISOString(),
      revealedBy: reveal.revealedBy,
      reason: reveal.reason,
    };
  }

  toRevealClueSummary(runtime: SessionRevealRuntime, contentId: string, snapshot: Record<string, unknown>): { id: string; title: string; text: string | null } {
    return {
      id: contentId,
      title: runtime.getStringProperty(snapshot, "title") ?? contentId,
      text:
        runtime.getStringProperty(snapshot, "handoutText") ??
        runtime.getStringProperty(snapshot, "playerText") ??
        runtime.getStringProperty(snapshot, "text") ??
        runtime.getStringProperty(snapshot, "revelation"),
    };
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

    const clues = runtime.parseJson<Record<string, unknown>[]>(node.cluesJson, []);

    await Promise.all(
      clues
        .filter((clue) => this.shouldRevealOnNodeVisit(runtime, clue))
        .map((clue) => {
          const contentId = runtime.getStringProperty(clue, "id");
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
            snapshot: clue,
          });
        }),
    );
  }

  async recordSessionReveal(
    runtime: SessionRevealRuntime,
    tx: Prisma.TransactionClient,
    params: {
      sessionScenarioId: string;
      contentId: string;
      contentKind: string;
      scope: string;
      recipientId?: string | null;
      revealedBy: string;
      reason?: string | null;
      turnLogId?: string | null;
      snapshot?: Record<string, unknown> | null;
    },
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
}
