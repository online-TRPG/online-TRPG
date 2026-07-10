import { Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  MAIN_COMMAND_CHECK_EFFECT_TYPES,
  MainCommandResponseDto,
  MainCommandStatus,
  ResolveMainCommandCheckDto,
  VttDoorCheckEffectDto,
  VttHazardCheckEffectDto,
  VttObjectCheckEffectDto,
  VTT_CHECK_EFFECT_ACTIONS,
} from "@trpg/shared-types";
import { randomUUID } from "node:crypto";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { MainCommandCheckEffectParserService } from "./main-command-check-effect-parser.service";
import { MainCommandCheckResultNarrationService } from "./main-command-check-result-narration.service";

type VttCheckEffect = VttDoorCheckEffectDto | VttHazardCheckEffectDto | VttObjectCheckEffectDto;

@Injectable()
export class MainCommandVttCheckResultService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly turnLogsService: TurnLogsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly mainCommandCheckEffectParser: MainCommandCheckEffectParserService,
    private readonly mainCommandCheckResultNarration: MainCommandCheckResultNarrationService,
  ) {}

  async resolveVttCheckResult(params: {
    userId: string;
    sessionId: string;
    sessionScenarioId: string;
    currentNodeId: string | null;
    dto: ResolveMainCommandCheckDto;
  }): Promise<MainCommandResponseDto | null> {
    const effect =
      this.mainCommandCheckEffectParser.parseVttDoorCheckEffect(params.dto.effect) ??
      this.mainCommandCheckEffectParser.parseVttHazardCheckEffect(params.dto.effect) ??
      this.mainCommandCheckEffectParser.parseVttObjectCheckEffect(params.dto.effect);
    if (!effect) {
      return null;
    }

    if (params.currentNodeId && effect.nodeId !== params.currentNodeId) {
      return {
        requestId: params.dto.requestId ?? randomUUID(),
        status: MainCommandStatus.IMPOSSIBLE,
        message: this.buildNodeMismatchMessage(effect),
      };
    }

    const checkDiceResult = this.mainCommandCheckResultNarration.sanitizeDiceResult(params.dto.diceResult);
    const checkRollSummary = this.mainCommandCheckResultNarration.formatRollSummary(checkDiceResult, params.dto.outcome);
    const result = await this.resolveEffectResult(params.sessionId, params.sessionScenarioId, effect, params.dto.outcome);
    const message = this.mainCommandCheckResultNarration.withRollSummary(result.message, checkRollSummary);

    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      actorUserId: params.userId,
      sessionCharacterId: params.dto.actorId ?? null,
      rawInput: null,
      structuredAction: {
        type: "main_command_check_result",
        requestId: params.dto.requestId ?? null,
        outcome: params.dto.outcome,
        effect,
        diceResult: checkDiceResult,
      },
      outcome: params.dto.outcome,
      narration: message,
    });
    this.realtimeEvents.emitTurnLogCreated(params.sessionId, turnLog);

    return {
      requestId: params.dto.requestId ?? randomUUID(),
      status: result.status,
      message,
      data: { effect },
    };
  }

  private buildNodeMismatchMessage(effect: VttCheckEffect): string {
    switch (effect.type) {
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_DOOR:
        return "현재 노드와 다른 문 판정 결과는 반영할 수 없습니다.";
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_HAZARD:
        return "현재 노드와 다른 함정 판정 결과는 반영할 수 없습니다.";
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_OBJECT:
        return "현재 노드와 다른 오브젝트 판정 결과는 반영할 수 없습니다.";
    }
  }

  private async resolveEffectResult(
    sessionId: string,
    sessionScenarioId: string,
    effect: VttCheckEffect,
    outcome: ActionOutcome,
  ): Promise<{ status: MainCommandStatus; message: string }> {
    if (outcome !== ActionOutcome.SUCCESS) {
      return this.buildFailureResult(effect);
    }

    switch (effect.type) {
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_DOOR:
        return this.sessionsService.applyVttDoorCheckSuccess({
          sessionId,
          sessionScenarioId,
          doorId: effect.doorId,
          nodeId: effect.nodeId,
          effect: effect.effect,
        });
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_HAZARD:
        return this.sessionsService.applyVttHazardDisarmSuccess({
          sessionId,
          sessionScenarioId,
          nodeId: effect.nodeId,
          hazardId: effect.hazardId,
        });
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_OBJECT:
        return this.sessionsService.applyVttObjectBreakSuccess({
          sessionId,
          sessionScenarioId,
          nodeId: effect.nodeId,
          objectId: effect.objectId,
        });
    }
  }

  private buildFailureResult(effect: VttCheckEffect): { status: MainCommandStatus; message: string } {
    switch (effect.type) {
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_DOOR:
        return {
          status: MainCommandStatus.MESSAGE,
          message:
            effect.effect === VTT_CHECK_EFFECT_ACTIONS.OPEN
              ? "판정에 실패해 문은 아직 잠겨 있습니다."
              : "판정에 실패해 문은 부서지지 않았습니다.",
        };
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_HAZARD:
        return {
          status: MainCommandStatus.MESSAGE,
          message: "판정에 실패해 함정은 아직 작동 가능한 상태입니다.",
        };
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_OBJECT:
        return {
          status: MainCommandStatus.MESSAGE,
          message: "판정에 실패해 오브젝트는 부서지지 않았습니다.",
        };
    }
  }
}
