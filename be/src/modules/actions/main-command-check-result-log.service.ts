import { Injectable } from "@nestjs/common";
import { ActionOutcome, MainCommandNarrativeCheckEffectDto, ResolveMainCommandCheckDto } from "@trpg/shared-types";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import type { SanitizedMainCommandDiceResult } from "./main-command-check-result-narration.service";

@Injectable()
export class MainCommandCheckResultLogService {
  constructor(
    private readonly turnLogsService: TurnLogsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async createAndPublishMainCommandCheckResult(params: {
    sessionId: string;
    sessionScenarioId: string;
    actorUserId: string;
    dto: ResolveMainCommandCheckDto;
    effect: MainCommandNarrativeCheckEffectDto;
    diceResult: SanitizedMainCommandDiceResult | null;
    outcome: ActionOutcome;
    narration: string;
  }): Promise<{ turnLogId: string }> {
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      actorUserId: params.actorUserId,
      sessionCharacterId: params.dto.actorId ?? null,
      rawInput: null,
      structuredAction: {
        type: "main_command_check_result",
        requestId: params.dto.requestId ?? null,
        outcome: params.dto.outcome,
        effect: params.effect,
        diceResult: params.diceResult,
      },
      outcome: params.outcome,
      narration: params.narration,
    });
    this.realtimeEvents.emitTurnLogCreated(params.sessionId, turnLog);
    return turnLog;
  }
}
