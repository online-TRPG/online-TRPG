import { Injectable, Logger } from "@nestjs/common";
import { decodeLenientScenarioClueArray, isRecord } from "@trpg/shared-types";
import {
  parseJsonOrFallback,
  parseJsonRecordOrFallback,
} from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { readCompletedCombatNodeIds } from "../sessions/session-completion-flag-store.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandTransitionEvaluatorService } from "./main-command-transition-evaluator.service";
import type { TransitionCandidate, TransitionEvidence } from "./main-command-transition-evaluator.service";

export type RevealedClueState = {
  ids: string[];
  summaries: string[];
};

type RevealEvidenceRow = {
  contentId: string;
  snapshotJson: string | null;
};

const MAX_RECENT_REVEALED_CLUES = 50;

@Injectable()
export class MainCommandProgressEvidenceService {
  private readonly logger = new Logger(MainCommandProgressEvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mainCommandTransitionEvaluator: MainCommandTransitionEvaluatorService,
  ) {}

  async buildTransitionEvidence(
    context: LoadedContext,
    recentLogs: string[],
    candidates: TransitionCandidate[] = [],
  ): Promise<TransitionEvidence> {
    const startedAt = performance.now();
    const flags = parseJsonRecordOrFallback(context.flagsJson);
    const completedCombatNodeIds = readCompletedCombatNodeIds(flags);
    const evidenceKeys = this.collectEvidenceKeys(candidates, context.currentNodeId);
    const [revealedClueState, visitedNodeIds] = await Promise.all([
      this.loadRelevantRevealedClueState(
        context.sessionScenarioId,
        evidenceKeys.clueIds,
        evidenceKeys.includeTextEvidence,
      ),
      this.loadVisitedNodeIds(context.sessionScenarioId, evidenceKeys.nodeIds),
    ]);
    const revealedClues = revealedClueState.summaries;
    const revealedClueText = this.mainCommandTransitionEvaluator.normalizeTransitionConditionText(revealedClues.join(" "));
    const unrevealedClues = evidenceKeys.includeTextEvidence
      ? this.extractPublicClueSummaries(context.currentNodeCluesJson).filter(
          (clue) => !this.mainCommandTransitionEvaluator.textEvidenceMatches(clue, revealedClueText),
        )
      : [];

    const evidence: TransitionEvidence = {
      recentLogs,
      revealedClues,
      revealedClueIds: revealedClueState.ids,
      unrevealedClues,
      visitedNodeIds,
      flags,
      currentNodeId: context.currentNodeId,
      combatResolvedForCurrentNode: completedCombatNodeIds.includes(context.currentNodeId),
    };
    this.logTransitionEvidenceMetrics(
      context.sessionScenarioId,
      candidates.length,
      evidenceKeys,
      evidence,
      startedAt,
    );
    return evidence;
  }

  async loadRevealedClueSummaries(sessionScenarioId: string): Promise<string[]> {
    return (await this.loadRevealedClueState(sessionScenarioId)).summaries;
  }

  async loadRevealedClueState(sessionScenarioId: string): Promise<RevealedClueState> {
    return this.loadRelevantRevealedClueState(sessionScenarioId, [], true);
  }

  async loadRevealedClueStateByIds(
    sessionScenarioId: string,
    clueIds: string[],
  ): Promise<RevealedClueState> {
    return this.loadRelevantRevealedClueState(sessionScenarioId, clueIds, false);
  }

  async loadVisitedNodeIds(sessionScenarioId: string, nodeIds: string[]): Promise<string[]> {
    if (!nodeIds.length) {
      return [];
    }

    const visits = await this.prisma.sessionNodeVisit.findMany({
      where: {
        sessionScenarioId,
        nodeId: { in: nodeIds },
      },
      select: { nodeId: true },
    });
    return visits.map((visit) => visit.nodeId);
  }

  extractPublicClueSummaries(cluesJson: string): string[] {
    const clues = parseJsonOrFallback(cluesJson, [], decodeLenientScenarioClueArray);
    return clues
      .map((clue) => {
        const title = clue.title?.trim() || null;
        const text = clue.handoutText?.trim() || clue.playerText?.trim() || null;
        if (!title || !text) {
          return null;
        }
        return `${title}: ${text}`;
      })
      .flatMap((entry) => compactStrings([entry]));
  }

  extractPublicClueIds(cluesJson: string): string[] {
    const clues = parseJsonOrFallback(cluesJson, [], decodeLenientScenarioClueArray);
    return Array.from(
      new Set(
        clues
          .map((clue) => this.readString(clue.id))
          .filter((clueId): clueId is string => Boolean(clueId)),
      ),
    );
  }

  async loadRecentLogLines(sessionId: string): Promise<string[]> {
    const rows = await this.prisma.turnLog.findMany({
      where: { sessionId },
      orderBy: { turnNumber: "desc" },
      take: 12,
      select: {
        rawInput: true,
        narration: true,
      },
    });

    return rows
      .slice()
      .reverse()
      .map((row) => {
        const parts = compactStrings([row.rawInput, row.narration]);
        return parts.join(" => ").trim().slice(-1000);
      })
      .flatMap((line) => compactStrings([line]));
  }

  private collectEvidenceKeys(candidates: TransitionCandidate[], currentNodeId: string) {
    const clueIds = new Set<string>();
    const nodeIds = new Set<string>();
    let includeTextEvidence = candidates.length === 0;

    for (const candidate of candidates) {
      if (!candidate.conditionRule) {
        const condition = candidate.condition?.trim() ?? "";
        if (!this.mainCommandTransitionEvaluator.isAutoTransitionCondition(condition)) {
          includeTextEvidence = true;
        }
        continue;
      }

      for (const requirement of candidate.conditionRule.requirements) {
        if (requirement.type === "CLUE_REVEALED" && requirement.targetId) {
          clueIds.add(requirement.targetId);
        }
        if (requirement.type === "NODE_VISITED") {
          nodeIds.add(requirement.targetId || currentNodeId);
        }
      }
    }

    return {
      clueIds: Array.from(clueIds),
      nodeIds: Array.from(nodeIds),
      includeTextEvidence,
    };
  }

  private async loadRelevantRevealedClueState(
    sessionScenarioId: string,
    clueIds: string[],
    includeRecent: boolean,
  ): Promise<RevealedClueState> {
    const queries: Array<Promise<RevealEvidenceRow[]>> = [];
    const select = {
      contentId: true,
      snapshotJson: true,
    } as const;

    if (clueIds.length) {
      queries.push(
        this.prisma.sessionReveal.findMany({
          where: {
            sessionScenarioId,
            contentKind: "clue",
            contentId: { in: clueIds },
          },
          orderBy: { revealedAt: "asc" },
          select,
        }),
      );
    }

    if (includeRecent) {
      queries.push(
        this.prisma.sessionReveal.findMany({
          where: {
            sessionScenarioId,
            contentKind: "clue",
          },
          orderBy: { revealedAt: "desc" },
          take: MAX_RECENT_REVEALED_CLUES,
          select,
        }),
      );
    }

    if (!queries.length) {
      return { ids: [], summaries: [] };
    }

    const revealById = new Map<string, RevealEvidenceRow>();
    for (const batch of await Promise.all(queries)) {
      for (const reveal of batch) {
        revealById.set(reveal.contentId, reveal);
      }
    }
    const reveals = Array.from(revealById.values());

    return {
      ids: reveals.map((reveal) => reveal.contentId),
      summaries: reveals
        .map((reveal) => {
          const snapshot = this.parseRevealedClueEvidenceSnapshot(reveal.snapshotJson);
          const title = this.readString(snapshot.title) ?? reveal.contentId;
          const text =
            this.readString(snapshot.handoutText) ??
            this.readString(snapshot.playerText) ??
            this.readString(snapshot.text) ??
            this.readString(snapshot.revelation);
          return [title, text].filter((value): value is string => Boolean(value)).join(": ");
        })
        .filter(Boolean),
    };
  }

  private logTransitionEvidenceMetrics(
    sessionScenarioId: string,
    candidateCount: number,
    evidenceKeys: { clueIds: string[]; nodeIds: string[]; includeTextEvidence: boolean },
    evidence: TransitionEvidence,
    startedAt: number,
  ): void {
    if (process.env.PERFORMANCE_DIAGNOSTICS !== "1") return;
    this.logger.debug({
      event: "transition_evidence_built",
      sessionScenarioId,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
      queryCount:
        Number(evidenceKeys.clueIds.length > 0) +
        Number(evidenceKeys.includeTextEvidence) +
        Number(evidenceKeys.nodeIds.length > 0),
      candidateCount,
      requestedClueIdCount: evidenceKeys.clueIds.length,
      requestedNodeIdCount: evidenceKeys.nodeIds.length,
      includeTextEvidence: evidenceKeys.includeTextEvidence,
      recentLogCount: evidence.recentLogs.length,
      revealedClueCount: evidence.revealedClues.length,
      unrevealedClueCount: evidence.unrevealedClues.length,
      visitedNodeCount: evidence.visitedNodeIds.length,
      jsonBytes: Buffer.byteLength(JSON.stringify(evidence), "utf8"),
    });
  }

  private parseRevealedClueEvidenceSnapshot(
    value: string | null | undefined,
  ): Record<string, string | undefined> {
    return parseJsonOrFallback(value, {}, (parsed) =>
      this.decodeRevealedClueEvidenceSnapshot(parsed),
    );
  }

  private decodeRevealedClueEvidenceSnapshot(
    value: unknown,
  ): Record<string, string | undefined> {
    if (!isRecord(value)) {
      throw new Error("revealed clue snapshot must be an object.");
    }
    return {
      title: this.readString(value.title) ?? undefined,
      handoutText: this.readString(value.handoutText) ?? undefined,
      playerText: this.readString(value.playerText) ?? undefined,
      text: this.readString(value.text) ?? undefined,
      revelation: this.readString(value.revelation) ?? undefined,
    };
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.flatMap((value) => typeof value === "string" && value.length > 0 ? [value] : []);
}
