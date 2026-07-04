import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
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
    const flags = this.parseJson<Record<string, unknown>>(context.flagsJson, {});
    const completedCombatNodeIds = Array.isArray(flags.completedCombatNodeIds)
      ? flags.completedCombatNodeIds.filter((value): value is string => typeof value === "string")
      : [];
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
          const snapshot = this.parseJson<Record<string, unknown>>(reveal.snapshotJson, {});
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

  async loadVisitedNodeIds(sessionScenarioId: string): Promise<string[]> {
    const visits = await this.prisma.sessionNodeVisit.findMany({
      where: { sessionScenarioId },
      select: { nodeId: true },
    });
    return visits.map((visit) => visit.nodeId);
  }

  extractPublicClueSummaries(cluesJson: string): string[] {
    const clues = this.parseJson<Record<string, unknown>[]>(cluesJson, []);
    return clues
      .map((clue) => {
        const title = this.readString(clue.title);
        const text = this.readString(clue.handoutText) ?? this.readString(clue.playerText);
        if (!title || !text) {
          return null;
        }
        return `${title}: ${text}`;
      })
      .filter((entry): entry is string => Boolean(entry));
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
        const parts = [row.rawInput, row.narration].filter((value): value is string => Boolean(value));
        return parts.join(" => ").trim();
      })
      .filter((line) => Boolean(line));
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
