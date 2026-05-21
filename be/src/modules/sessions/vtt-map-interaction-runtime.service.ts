import { Injectable } from "@nestjs/common";
import {
  MainCommandCheckOptionDto,
  MainCommandStatus,
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
} from "@trpg/shared-types";
import { SessionsService } from "./sessions.service";

@Injectable()
export class VttMapInteractionRuntimeService {
  constructor(private readonly sessionsService: SessionsService) {}

  async runVttMapInteraction(
    userId: string,
    sessionId: string,
    dto: VttMapInteractionDto,
  ): Promise<VttMapInteractionResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.sessionsService.ensureMembership(userId, resolvedSessionId);
    const { state, sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(resolvedSessionId);
    if (!state.currentNodeId) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "현재 노드가 없어 맵 상호작용을 처리할 수 없습니다.",
        map: await this.sessionsService.getVttMapForUser(userId, resolvedSessionId),
      };
    }

    const mapPoint = await this.sessionsService.resolveVttMapInteractionPoint(
      resolvedSessionId,
      sessionScenario.id,
      state,
      dto,
    );
    if (!mapPoint) {
      return {
        status: MainCommandStatus.IMPOSSIBLE,
        message: "상호작용할 맵 대상을 찾을 수 없습니다.",
        map: await this.sessionsService.getVttMapForUser(userId, resolvedSessionId),
      };
    }
    const actorSessionCharacterId =
      dto.actorSessionCharacterId ??
      Array.from(await this.sessionsService.getControlledSessionCharacterIds(userId, resolvedSessionId))[0] ??
      null;

    let result:
      | {
          status: MainCommandStatus;
          message: string;
          checkOptions?: MainCommandCheckOptionDto[];
          checkEffect?: Record<string, unknown>;
        }
      | null = null;

    if (dto.kind === "open_door") {
      result = await this.sessionsService.openVttDoorAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
        itemId: dto.itemId,
      });
    } else if (dto.kind === "break_door") {
      result = await this.sessionsService.breakVttDoorAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
      });
    } else if (dto.kind === "close_door") {
      result = await this.sessionsService.closeVttDoorAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
      });
    } else if (dto.kind === "disarm_hazard") {
      result = await this.sessionsService.disarmVttHazardAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
      });
    } else if (dto.kind === "investigate_object") {
      result = await this.runObjectInvestigation({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
        actorSessionCharacterId,
      });
    } else if (dto.kind === "detect_hazard") {
      const observed = await this.sessionsService.revealObservableVttObjectsInPartyVision({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
      });
      result = {
        status: observed.count > 0 ? MainCommandStatus.RESOLVED : MainCommandStatus.MESSAGE,
        message:
          observed.count > 0
            ? `시야 안에서 수상한 오브젝트를 발견했습니다: ${observed.objectNames.join(", ")}.`
            : "새로 발견한 위험 요소는 없습니다.",
      };
    } else {
      result = await this.sessionsService.triggerVttObjectEventAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
      });
    }

    const map = await this.sessionsService.getVttMapForUser(userId, resolvedSessionId);
    return {
      status: result?.status ?? MainCommandStatus.IMPOSSIBLE,
      message: result?.message ?? "맵 상호작용을 처리하지 못했습니다.",
      map,
      checkOptions: result?.checkOptions as Record<string, unknown>[] | undefined,
      data: result?.checkEffect ? { checkEffect: result.checkEffect } : null,
    };
  }

  private async runObjectInvestigation(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: { x: number; y: number };
    actorSessionCharacterId: string | null;
  }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
  }> {
    const description = await this.sessionsService.describeVttObjectAtPoint({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      nodeId: params.nodeId,
      mapPoint: params.mapPoint,
    });
    if (description?.checkOptions?.length) {
      return {
        status: MainCommandStatus.CHECK_REQUIRED,
        message: description.message,
        checkOptions: description.checkOptions,
      };
    }

    const reveal = await this.sessionsService.revealVttObjectContentsAtPoint({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      nodeId: params.nodeId,
      mapPoint: params.mapPoint,
      sessionCharacterId: params.actorSessionCharacterId,
      revealedBy: "player",
    });
    const revealSummary = [
      reveal.revealedClues.length
        ? `단서 ${reveal.revealedClues.map((clue) => clue.title).join(", ")}`
        : null,
      reveal.revealedItems.length
        ? `아이템 ${reveal.revealedItems.map((item) => item.name).join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join(" / ");

    return {
      status: MainCommandStatus.RESOLVED,
      message:
        reveal.count > 0
          ? `${description?.message ?? "오브젝트를 조사했습니다."}\n${revealSummary}을 발견했습니다.`
          : (description?.message ?? "여기에는 더 숨겨진 것이 없습니다."),
    };
  }
}
