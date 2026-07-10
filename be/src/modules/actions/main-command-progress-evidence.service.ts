import { Injectable } from "@nestjs/common";
import { decodeLenientScenarioClueArray, isRecord } from "@trpg/shared-types";
import {
  parseJsonOrFallback,
  parseJsonRecordOrFallback,
} from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { readCompletedCombatNodeIds } from "../sessions/session-completion-flag-store.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandTransitionEvaluatorService } from "./main-command-transition-evaluator.service";
import type { TransitionEvidence } from "./main-command-transition-evaluator.service";

export type RevealedClueState = {
  ids: string[];
  summaries: string[];
};

@Injectable()
export class MainCommandProgressEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mainCommandTransitionEvaluator: MainCommandTransitionEvaluatorService,
  ) {}

  async buildTransitionEvidence(context: LoadedContext, recentLogs: string[]): Promise<TransitionEvidence> {
    const flags = parseJsonRecordOrFallback(context.flagsJson);
    const completedCombatNodeIds = readCompletedCombatNodeIds(flags);
    const revealedClueState = await this.loadRevealedClueState(context.sessionScenarioId);
    const revealedClues = revealedClueState.summaries;
    const revealedClueText = this.mainCommandTransitionEvaluator.normalizeTransitionConditionText(revealedClues.join(" "));
    const unrevealedClues = this.extractPublicClueSummaries(context.currentNodeCluesJson).filter(
      (clue) => !this.mainCommandTransitionEvaluator.textEvidenceMatches(clue, revealedClueText),
    );
    const visitedNodeIds = await this.loadVisitedNodeIds(context.sessionScenarioId);

    return {
      recentLogs,
      revealedClues,
      revealedClueIds: revealedClueState.ids,
      unrevealedClues,
      visitedNodeIds,
      flags,
      currentNodeId: context.currentNodeId,
      combatResolvedForCurrentNode: completedCombatNodeIds.includes(context.currentNodeId),
    };
  }

  async loadRevealedClueSummaries(sessionScenarioId: string): Promise<string[]> {
    return (await this.loadRevealedClueState(sessionScenarioId)).summaries;
  }

  async loadRevealedClueState(sessionScenarioId: string): Promise<RevealedClueState> {
    const reveals = await this.prisma.sessionReveal.findMany({
      where: {
        sessionScenarioId,
        contentKind: "clue",
      },
      orderBy: { revealedAt: "asc" },
    });

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
          return compactStrings([title, text]).join(": ");
        })
      .flatMap((summary) => compactStrings([summary])),
    };
  }

  private parseRevealedClueEvidenceSnapshot(value: string | null | undefined): Record<string, string | undefined> {
    return parseJsonOrFallback(value, {}, (parsed) => this.decodeRevealedClueEvidenceSnapshot(parsed));
  }

  private decodeRevealedClueEvidenceSnapshot(value: unknown): Record<string, string | undefined> {
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

  async loadVisitedNodeIds(sessionScenarioId: string): Promise<string[]> {
    const visits = await this.prisma.sessionNodeVisit.findMany({
      where: { sessionScenarioId },
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

  async loadRecentLogLines(sessionId: string): Promise<string[]> {
    const rows = await this.prisma.turnLog.findMany({
      where: { sessionId },
      orderBy: { turnNumber: "desc" },
      take: 12,
    });

    return rows
      .slice()
      .reverse()
      .map((row) => {
        const parts = compactStrings([row.rawInput, row.narration]);
        return parts.join(" => ").trim();
      })
      .flatMap((line) => compactStrings([line]));
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.flatMap((value) => typeof value === "string" && value.length > 0 ? [value] : []);
}
