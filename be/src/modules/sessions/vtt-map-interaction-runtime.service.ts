import { Injectable } from "@nestjs/common";
import {
  MainCommandCheckOptionDto,
  MainCommandStatus,
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
} from "@trpg/shared-types";
import { SessionsService } from "./sessions.service";
import { VttMapDoorRuntimeService } from "./vtt-map-door-runtime.service";
import { VttMapHazardRuntimeService } from "./vtt-map-hazard-runtime.service";
import { VttMapObjectRuntimeService } from "./vtt-map-object-runtime.service";

@Injectable()
export class VttMapInteractionRuntimeService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly doorRuntime: VttMapDoorRuntimeService,
    private readonly hazardRuntime: VttMapHazardRuntimeService,
    private readonly objectRuntime: VttMapObjectRuntimeService,
  ) {}

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

    let result: {
      status: MainCommandStatus;
      message: string;
      checkOptions?: MainCommandCheckOptionDto[];
      checkEffect?: Record<string, unknown>;
    } | null = null;

    if (dto.kind === "open_door") {
      result = await this.doorRuntime.openAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
        itemId: dto.itemId,
      });
    } else if (dto.kind === "break_door") {
      result = await this.doorRuntime.breakAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
      });
    } else if (dto.kind === "close_door") {
      result = await this.doorRuntime.closeAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
      });
    } else if (dto.kind === "disarm_hazard") {
      result = await this.hazardRuntime.disarmAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
      });
    } else if (dto.kind === "investigate_object") {
      result = await this.objectRuntime.investigateAtPoint({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
        mapPoint,
        actorSessionCharacterId,
      });
    } else if (dto.kind === "detect_hazard") {
      result = await this.objectRuntime.detectObservableInPartyVision({
        sessionId: resolvedSessionId,
        sessionScenarioId: sessionScenario.id,
        nodeId: state.currentNodeId,
      });
    } else {
      result = await this.objectRuntime.triggerEventAtPoint({
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
}
