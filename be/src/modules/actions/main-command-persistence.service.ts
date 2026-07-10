import { Injectable } from "@nestjs/common";
import { ActionOutcome, MainCommandResponseDto, MainCommandStatus, SubmitMainCommandDto, isRecord } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import type { LoadedContext } from "./main-commands.service";

export type EffectiveMainCommandData = {
  commandId: SubmitMainCommandDto["commandId"];
  category: SubmitMainCommandDto["category"];
  intent: SubmitMainCommandDto["intent"];
  screenType: SubmitMainCommandDto["screenType"];
  targetId: string | null;
  targetType: SubmitMainCommandDto["targetType"] | null;
  itemId: string | null;
  spellId: string | null;
};

@Injectable()
export class MainCommandPersistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly turnLogsService: TurnLogsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async persistResult(userId: string, context: LoadedContext, dto: SubmitMainCommandDto, response: MainCommandResponseDto) {
    const outcome = this.toActionOutcome(response);
    const persistedCommand = this.resolvePersistedMainCommand(dto, response);
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: context.sessionId,
      sessionScenarioId: context.sessionScenarioId,
      actorUserId: userId,
      sessionCharacterId: context.sessionCharacterId,
      rawInput: this.getMainCommandRawInput(dto),
      structuredAction: {
        type: "main_command",
        commandId: persistedCommand.commandId,
        category: persistedCommand.category,
        intent: persistedCommand.intent,
        screenType: persistedCommand.screenType,
        targetId: persistedCommand.targetId,
        targetType: persistedCommand.targetType,
        itemId: persistedCommand.itemId,
        spellId: persistedCommand.spellId,
        status: response.status,
        checkOptions: response.checkOptions ?? [],
        actionCandidate: response.actionCandidate ?? null,
        data: response.data ?? null,
      },
      outcome,
      narration: response.message,
      stateDiff: response.statePatch ?? null,
    });

    this.realtimeEvents.emitTurnLogCreated(context.sessionId, turnLog);
    return turnLog;
  }

  async markScenarioStateChanged(sessionScenarioId: string): Promise<void> {
    await this.prisma.gameState.update({
      where: { sessionScenarioId },
      data: { version: { increment: 1 } },
    });
  }

  buildEffectiveMainCommandData(dto: SubmitMainCommandDto): EffectiveMainCommandData {
    return {
      commandId: dto.commandId,
      category: dto.category,
      intent: dto.intent,
      screenType: dto.screenType,
      targetId: dto.targetId ?? null,
      targetType: dto.targetType ?? null,
      itemId: dto.itemId ?? null,
      spellId: dto.spellId ?? null,
    };
  }

  toActionOutcome(response: MainCommandResponseDto): ActionOutcome {
    return response.status === MainCommandStatus.IMPOSSIBLE
      ? ActionOutcome.IMPOSSIBLE
      : response.status === MainCommandStatus.RESOLVED
        ? ActionOutcome.SUCCESS
        : ActionOutcome.NO_ROLL;
  }

  private resolvePersistedMainCommand(dto: SubmitMainCommandDto, response: MainCommandResponseDto): EffectiveMainCommandData {
    const fallback = this.buildEffectiveMainCommandData(dto);
    const data = response.data;
    const effectiveMainCommand = isRecord(data?.effectiveMainCommand) ? data.effectiveMainCommand : null;

    if (!effectiveMainCommand) {
      return fallback;
    }

    return {
      commandId: typeof effectiveMainCommand.commandId === "string" ? effectiveMainCommand.commandId : fallback.commandId,
      category:
        typeof effectiveMainCommand.category === "string" && effectiveMainCommand.category === fallback.category
          ? effectiveMainCommand.category
          : fallback.category,
      intent:
        typeof effectiveMainCommand.intent === "string" && effectiveMainCommand.intent === fallback.intent
          ? effectiveMainCommand.intent
          : fallback.intent,
      screenType:
        typeof effectiveMainCommand.screenType === "string" && effectiveMainCommand.screenType === fallback.screenType
          ? effectiveMainCommand.screenType
          : fallback.screenType,
      targetId:
        typeof effectiveMainCommand.targetId === "string" ? effectiveMainCommand.targetId : effectiveMainCommand.targetId === null ? null : fallback.targetId,
      targetType:
        effectiveMainCommand.targetType === fallback.targetType
          ? fallback.targetType
          : effectiveMainCommand.targetType === null
            ? null
            : fallback.targetType,
      itemId: typeof effectiveMainCommand.itemId === "string" ? effectiveMainCommand.itemId : effectiveMainCommand.itemId === null ? null : fallback.itemId,
      spellId:
        typeof effectiveMainCommand.spellId === "string" ? effectiveMainCommand.spellId : effectiveMainCommand.spellId === null ? null : fallback.spellId,
    };
  }

  private getMainCommandRawInput(dto: SubmitMainCommandDto): string {
    // 슬래시 명령어는 처리용 본문과 사용자가 친 원문이 달라서 로그에는 원문을 우선 남긴다.
    return dto.rawInputText?.trim() || dto.playerText.trim();
  }
}
