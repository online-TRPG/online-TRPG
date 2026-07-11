import { Injectable } from "@nestjs/common";
import { VttMapStateDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { SessionsService } from "../sessions/sessions.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandProgressEvidenceService } from "./main-command-progress-evidence.service";
import { MainCommandTransitionEvaluatorService } from "./main-command-transition-evaluator.service";

type VttObjectEventHint = {
  objectName: string;
  eventName: string | null;
  distanceFeet: number;
  revealRadiusFeet: number;
};

@Injectable()
export class MainCommandHintContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly mainCommandTransitionEvaluator: MainCommandTransitionEvaluatorService,
    private readonly mainCommandProgressEvidence: MainCommandProgressEvidenceService,
  ) {}

  async areAllPublicCluesRevealed(context: LoadedContext, publicClues: string[]): Promise<boolean> {
    if (!publicClues.length) {
      return false;
    }

    const currentClueIds = this.mainCommandProgressEvidence.extractPublicClueIds(
      context.currentNodeCluesJson,
    );
    const revealedClueState = currentClueIds.length
      ? await this.mainCommandProgressEvidence.loadRevealedClueStateByIds(
          context.sessionScenarioId,
          currentClueIds,
        )
      : await this.mainCommandProgressEvidence.loadRevealedClueState(
          context.sessionScenarioId,
        );
    const revealedClues = revealedClueState.summaries;
    const revealedClueText = this.mainCommandTransitionEvaluator.normalizeTransitionConditionText(revealedClues.join(" "));
    const unrevealedClues = publicClues.filter((clue) => !this.mainCommandTransitionEvaluator.textEvidenceMatches(clue, revealedClueText));
    return unrevealedClues.length === 0;
  }

  async loadUntriggeredVttEventHintSummaries(context: LoadedContext): Promise<string[]> {
    const map = await this.sessionsService.getVttMapForSessionScenario(context.sessionId, context.sessionScenarioId).catch(() => null);
    if (!map) {
      return [];
    }

    const eventEntries = this.extractUntriggeredVttObjectEventHints(map);
    if (!eventEntries.length) {
      return [];
    }

    const onceEventIds = eventEntries.map((entry) => entry.eventId);
    const revealedEventIds = new Set(
      (
        await this.prisma.sessionReveal.findMany({
          where: {
            sessionScenarioId: context.sessionScenarioId,
            contentKind: "event",
            contentId: { in: onceEventIds },
          },
          select: { contentId: true },
        })
      ).map((reveal) => reveal.contentId),
    );

    return eventEntries
      .filter((entry) => !revealedEventIds.has(entry.eventId))
      .slice(0, 5)
      .map(({ hint }) => this.formatVttObjectEventHint(hint));
  }

  private extractUntriggeredVttObjectEventHints(map: VttMapStateDto): Array<{ eventId: string; hint: VttObjectEventHint }> {
    return (map.objectCells ?? []).flatMap((objectCell) => {
      if (objectCell.visibleToPlayers === false) {
        return [];
      }

      const objectName = objectCell.name?.trim() || objectCell.description?.trim().slice(0, 80) || "지도 오브젝트";

      return (objectCell.events ?? [])
        .filter((event) => event.type === "REVEAL_FOG_ON_PROXIMITY" && event.trigger?.once !== false)
        .map((event) => ({
          eventId: event.id,
          hint: {
            objectName,
            eventName: event.name?.trim() || null,
            distanceFeet: this.clampHintNumber(event.trigger?.distanceFeet, 0, 500, 15),
            revealRadiusFeet: this.clampHintNumber(event.effect?.revealRadiusFeet, 5, 500, 30),
          },
        }));
    });
  }

  private formatVttObjectEventHint(hint: VttObjectEventHint): string {
    const eventLabel = hint.eventName ? ` (${hint.eventName})` : "";
    return [
      `아직 발동하지 않은 지도 이벤트: ${hint.objectName}${eventLabel}`,
      `${hint.distanceFeet}ft 이내로 접근하면 숨겨진 공간이나 안개가 드러날 수 있습니다.`,
      `드러나는 범위: ${hint.revealRadiusFeet}ft.`,
    ].join(" ");
  }

  private clampHintNumber(value: unknown, min: number, max: number, fallback: number): number {
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(numberValue)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, numberValue));
  }
}
