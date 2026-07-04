import { Injectable } from "@nestjs/common";
import { ActionOutcome, MainCommandIntent, MainCommandNarrativeCheckEffectDto, MainCommandResponseDto, MainCommandStatus } from "@trpg/shared-types";
import { SessionsService } from "../sessions/sessions.service";

type CheckResultDraft = {
  status: MainCommandStatus;
  message: string;
};

export type RevealCountSummary = {
  actionRevealCount: number;
  objectRevealCount: number;
  observedObjectCount: number;
};

@Injectable()
export class MainCommandCheckRevealService {
  constructor(private readonly sessionsService: SessionsService) {}

  async applyImmediateObjectInvestigation(params: {
    intent: MainCommandIntent;
    mapPoint?: { x: number; y: number } | null;
    response: MainCommandResponseDto;
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    sessionCharacterId: string;
  }): Promise<{ response: MainCommandResponseDto; objectRevealCount: number; handledObjectInvestigation: boolean }> {
    const handledObjectInvestigation = params.intent === MainCommandIntent.INVESTIGATE_OBJECT && Boolean(params.mapPoint);
    if (!handledObjectInvestigation || params.response.status === MainCommandStatus.CHECK_REQUIRED || !params.mapPoint) {
      return {
        response: params.response,
        objectRevealCount: 0,
        handledObjectInvestigation,
      };
    }

    const objectRevealResult = await this.sessionsService.revealVttObjectContentsAtPoint({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      nodeId: params.nodeId,
      mapPoint: params.mapPoint,
      sessionCharacterId: params.sessionCharacterId,
      revealedBy: "system",
    });

    return {
      response:
        objectRevealResult.count > 0
          ? this.withRevealedObjectContents(params.response, objectRevealResult.revealedClues, objectRevealResult.revealedItems)
          : params.response,
      objectRevealCount: objectRevealResult.count,
      handledObjectInvestigation,
    };
  }

  async applySuccessfulCheckReveals(params: {
    requestId: string;
    sessionId: string;
    sessionScenarioId: string;
    effect: MainCommandNarrativeCheckEffectDto;
    result: CheckResultDraft;
  }): Promise<{ result: CheckResultDraft; counts: RevealCountSummary }> {
    let result = params.result;
    let objectRevealCount = 0;
    let observedObjectCount = 0;
    let actionRevealCount = 0;

    if (params.effect.intent === MainCommandIntent.INVESTIGATE_OBJECT && params.effect.mapPoint) {
      const objectRevealResult = await this.sessionsService.revealVttObjectContentsAtPoint({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.effect.nodeId,
        mapPoint: params.effect.mapPoint,
        sessionCharacterId: params.effect.sessionCharacterId,
        revealedBy: "system",
        checkOption: params.effect.checkOption,
      });
      objectRevealCount = objectRevealResult.count;
      if (objectRevealResult.count > 0) {
        const augmented = this.withRevealedObjectContents(
          {
            requestId: params.requestId,
            status: result.status,
            message: result.message,
          },
          objectRevealResult.revealedClues,
          objectRevealResult.revealedItems,
        );
        result = {
          status: augmented.status,
          message: augmented.message,
        };
      }
    }

    if (params.effect.intent === MainCommandIntent.OBSERVE_AREA) {
      const observedObjectResult = await this.sessionsService.revealObservableVttObjectsInPartyVision({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.effect.nodeId,
      });
      observedObjectCount = observedObjectResult.count;
      if (observedObjectResult.count > 0) {
        result = {
          ...result,
          message: `${result.message}\n\n시야 안에서 수상한 오브젝트를 발견했습니다: ${observedObjectResult.objectNames.join(", ")}. 맵에 표시됩니다.`,
        };
      }
    }

    const revealedActionClues =
      params.effect.actionCandidate &&
      result.status !== MainCommandStatus.IMPOSSIBLE &&
      params.effect.intent !== MainCommandIntent.OBSERVE_AREA &&
      !(params.effect.intent === MainCommandIntent.INVESTIGATE_OBJECT && params.effect.mapPoint)
        ? await this.sessionsService.revealCurrentNodeCluesAfterActionWithDetails({
            sessionScenarioId: params.sessionScenarioId,
            nodeId: params.effect.nodeId,
            actionText: params.effect.playerText,
            outcome: ActionOutcome.SUCCESS,
            policyModes: ["PLAYER_ACTION"],
            turnLogId: null,
            revealedBy: "system",
          })
        : [];
    actionRevealCount = revealedActionClues.length;
    if (revealedActionClues.length > 0) {
      const augmented = this.withRevealedObjectContents(
        {
          requestId: params.requestId,
          status: result.status,
          message: result.message,
        },
        revealedActionClues,
      );
      result = {
        status: augmented.status,
        message: augmented.message,
      };
    }

    return {
      result,
      counts: {
        actionRevealCount,
        objectRevealCount,
        observedObjectCount,
      },
    };
  }

  withRevealedObjectContents(
    response: MainCommandResponseDto,
    revealedClues: Array<{ id: string; title: string; text: string | null }>,
    revealedItems: Array<{ id: string; name: string; quantity: number; description?: string | null }> = [],
  ): MainCommandResponseDto {
    if (!revealedClues.length && !revealedItems.length) {
      return response;
    }

    const clueLines = revealedClues.map((clue) => (clue.text?.trim() ? `- ${clue.title}: ${clue.text.trim()}` : `- ${clue.title}`));
    const itemLines = revealedItems.map((item) => {
      const itemLabel = item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name;
      return item.description?.trim() ? `- ${itemLabel}: ${item.description.trim()}` : `- ${itemLabel}`;
    });
    const sections = [
      clueLines.length ? `새 단서를 발견했습니다.\n${clueLines.join("\n")}` : null,
      itemLines.length ? `아이템을 획득했습니다. 인벤토리에 추가되었습니다.\n${itemLines.join("\n")}` : null,
    ].filter((section): section is string => Boolean(section));

    return {
      ...response,
      status: response.status === MainCommandStatus.MESSAGE ? MainCommandStatus.RESOLVED : response.status,
      message: `${response.message.trim()}\n\n${sections.join("\n\n")}`,
      data: {
        ...(response.data ?? {}),
        revealedClues,
        revealedItems,
      },
    };
  }
}
