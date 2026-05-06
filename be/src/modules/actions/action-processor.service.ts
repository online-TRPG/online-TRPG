import { Injectable, Logger } from "@nestjs/common";
import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
  CombatStatus as PrismaCombatStatus,
  DiceAdvantageState as PrismaDiceAdvantageState,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import {
  DiceAdvantageState,
  TurnLogResponseDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { AiService } from "../ai/ai.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import {
  ActionResolution,
  ActionRuleService,
  ActionRuntimeEffect,
  RuleRuntimeContext,
} from "../rules/action-rule.service";
import { ActionEconomyService } from "../rules/action-economy.service";
import { CharacterResourceService } from "../rules/character-resource.service";
import { StateDiffService } from "../rules/state-diff.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";

type RuntimeTurnStateKey = {
  combatId: string;
  roundNo: number;
  turnNo: number;
  sessionCharacterId: string;
};

type RuntimeActor = {
  id: string;
  character: {
    className: string;
    level: number;
  };
};

@Injectable()
export class ActionProcessorService {
  private readonly logger = new Logger(ActionProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly actionRules: ActionRuleService,
    private readonly stateDiffService: StateDiffService,
    private readonly turnLogsService: TurnLogsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly aiService: AiService,
    private readonly actionEconomy: ActionEconomyService,
    private readonly characterResources: CharacterResourceService,
  ) {}

  async processNext(sessionId: string): Promise<void> {
    const action = await this.prisma.playerAction.findFirst({
      where: { sessionId, queueStatus: PrismaActionQueueStatus.PENDING },
      orderBy: { createdAt: "asc" },
    });

    if (!action) {
      return;
    }

    await this.prisma.playerAction.update({
      where: { id: action.id },
      data: { queueStatus: PrismaActionQueueStatus.PROCESSING },
    });

    try {
      const turnLog = await this.processAction(action.id);
      await this.prisma.playerAction.update({
        where: { id: action.id },
        data: {
          queueStatus: PrismaActionQueueStatus.COMPLETED,
          processedAt: new Date(),
        },
      });
      this.realtimeEvents.emitTurnLogCreated(action.sessionId, turnLog);
    } catch (error) {
      await this.prisma.playerAction.update({
        where: { id: action.id },
        data: {
          queueStatus: PrismaActionQueueStatus.FAILED,
          failureReason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
          processedAt: new Date(),
        },
      });
      this.realtimeEvents.emitSystemMessage(
        action.sessionId,
        "ACTION_FAILED",
        "행동 처리 중 오류가 발생했습니다.",
      );
    }
  }

  private async processAction(playerActionId: string): Promise<TurnLogResponseDto> {
    const action = await this.prisma.playerAction.findUnique({
      where: { id: playerActionId },
    });

    if (!action) {
      throw new Error(`PlayerAction ${playerActionId} was not found.`);
    }

    const session = await this.sessionsService.getSessionEntityOrThrow(action.sessionId);
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(
      session.id,
    );
    const sessionCharacters = await this.prisma.sessionCharacter.findMany({
      where: {
        sessionId: session.id,
        status: {
          in: [PrismaSessionCharacterStatus.ACTIVE, PrismaSessionCharacterStatus.DEAD],
        },
      },
      include: { character: true },
      orderBy: { createdAt: "asc" },
    });
    const actor =
      sessionCharacters.find((candidate) => candidate.id === action.sessionCharacterId) ??
      null;

    if (!actor) {
      throw new Error("ACTION_ACTOR_NOT_FOUND");
    }

    const runtime = await this.buildRuntime(action.sessionId, actor);

    // BE → AI Interpreter (AI-SERVER-001). 자연어 → 구조화 action 후보를 AiTrace 로 영속.
    // Phase 1: 결과를 룰 판정에 사용하지 않음 (actionRules 시그니처 변경 동반이라 별 PR).
    // Phase 2: actionRules.resolveAction 가 interpreter 결과 받아 활용.
    // 실패해도 진행 — AI 서버 자체에 fallback 있고, 룰은 rawText 로 독립 판정.
    try {
      await this.aiService.runInterpreter(session.id, action.userId, {
        rawText: action.rawText,
        actorCharacterId: actor.character.id,
        sceneSummary: `${session.title} - ${actor.character.name}의 행동`,
        availableTargets: sessionCharacters.map((c) => c.character.name),
      });
    } catch (error) {
      this.logger.warn(
        `Interpreter call failed for action=${action.id}: ${this.toErrorMessage(error)}`,
      );
    }

    const resolution = this.actionRules.resolveAction(
      action.rawText,
      actor,
      sessionCharacters,
      runtime.context,
    );
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      playerActionId: action.id,
      actorUserId: action.userId,
      sessionCharacterId: actor.id,
      rawInput: action.rawText,
      structuredAction: {
        ...resolution.structuredAction,
        inputType: this.toSharedInputType(action.inputType),
        actionScope: this.toSharedActionScope(action.actionScope),
      },
      diceResult: resolution.diceResult ? { ...resolution.diceResult } : null,
      outcome: resolution.outcome,
      narration: resolution.narration,
    });

    if (resolution.diceResult) {
      await this.prisma.diceRollLog.create({
        data: {
          sessionId: session.id,
          userId: action.userId,
          expression: resolution.diceResult.expression,
          rollsJson: JSON.stringify(resolution.diceResult.rolls),
          modifier: resolution.diceResult.modifier,
          total: resolution.diceResult.total,
          advantageState: this.toPrismaAdvantage(resolution.diceResult.advantageState),
          reason: action.rawText,
          turnLogId: turnLog.turnLogId,
        },
      });
      this.realtimeEvents.emitDiceRolled(session.id, resolution.diceResult);
    }

    const stateDiff = await this.stateDiffService.applyCharacterChanges({
      sessionScenarioId: sessionScenario.id,
      baseVersion: state.version,
      turnLogId: turnLog.turnLogId,
      reason: String(resolution.structuredAction.type ?? "action_result"),
      changes: resolution.stateChanges,
    });

    await this.applyRuntimeEffects(resolution, {
      sessionCharacterId: actor.id,
      turnStateKey: runtime.turnStateKey,
    });

    if (stateDiff) {
      await this.turnLogsService.attachStateDiff(turnLog.turnLogId, { ...stateDiff });
      this.realtimeEvents.emitStateDiffApplied(session.id, stateDiff);
      const latestSnapshot = await this.sessionsService.buildSnapshot(session.id);
      this.realtimeEvents.emitSessionSnapshot(session.id, latestSnapshot);
      return {
        ...turnLog,
        stateDiff: { ...stateDiff },
      };
    }

    return turnLog;
  }

  private async buildRuntime(
    sessionId: string,
    actor: RuntimeActor,
  ): Promise<{
    context: RuleRuntimeContext;
    turnStateKey: RuntimeTurnStateKey | null;
  }> {
    const resource = await this.characterResources.getOrCreateResource(
      actor.id,
      this.resolveInitialResourceDefaults(actor),
    );
    const combat = await this.prisma.combat.findFirst({
      where: {
        sessionId,
        status: PrismaCombatStatus.ACTIVE,
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });
    const currentParticipant = combat?.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );

    if (!combat || currentParticipant?.sessionCharacterId !== actor.id) {
      return {
        context: {
          resource: this.toRuntimeResource(resource),
          turnState: null,
        },
        turnStateKey: null,
      };
    }

    const turnStateKey = {
      combatId: combat.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: actor.id,
    };
    const turnState = await this.actionEconomy.getOrCreateTurnState(turnStateKey);

    return {
      context: {
        resource: this.toRuntimeResource(resource),
        turnState: {
          actionUsed: turnState.actionUsed,
          bonusActionUsed: turnState.bonusActionUsed,
          reactionUsed: turnState.reactionUsed,
          additionalActionGranted: turnState.additionalActionGranted,
          sneakAttackUsed: turnState.sneakAttackUsed,
        },
      },
      turnStateKey,
    };
  }

  private async applyRuntimeEffects(
    resolution: ActionResolution,
    params: {
      sessionCharacterId: string;
      turnStateKey: RuntimeTurnStateKey | null;
    },
  ): Promise<void> {
    for (const effect of resolution.runtimeEffects ?? []) {
      await this.applyRuntimeEffect(effect, params);
    }
  }

  private async applyRuntimeEffect(
    effect: ActionRuntimeEffect,
    params: {
      sessionCharacterId: string;
      turnStateKey: RuntimeTurnStateKey | null;
    },
  ): Promise<void> {
    switch (effect.type) {
      case "SPEND_ACTION":
        if (params.turnStateKey) {
          await this.actionEconomy.spendAction(params.turnStateKey);
        }
        return;
      case "SPEND_BONUS_ACTION":
        if (params.turnStateKey) {
          await this.actionEconomy.spendBonusAction(params.turnStateKey);
        }
        return;
      case "SPEND_REACTION":
        if (params.turnStateKey) {
          await this.actionEconomy.spendReaction(params.turnStateKey);
        }
        return;
      case "GRANT_ADDITIONAL_ACTION":
        if (params.turnStateKey) {
          await this.actionEconomy.grantAdditionalAction(params.turnStateKey);
        }
        return;
      case "SPEND_SNEAK_ATTACK":
        if (params.turnStateKey) {
          await this.actionEconomy.spendSneakAttack(params.turnStateKey);
        }
        return;
      case "SPEND_SECOND_WIND":
        await this.characterResources.spendSecondWind(params.sessionCharacterId);
        return;
      case "SPEND_ACTION_SURGE_USE":
        await this.characterResources.spendActionSurgeUse(params.sessionCharacterId);
        return;
      case "START_RAGE":
        await this.characterResources.startRage({
          sessionCharacterId: params.sessionCharacterId,
          // Rage는 기본 1분(10라운드) 지속으로 잡아둔다.
          // 정확한 종료 처리는 이후 턴 lifecycle에서 이 값을 읽어 처리한다.
          rageEndsAtRound: params.turnStateKey ? params.turnStateKey.roundNo + 10 : null,
          rageEndsAtTurn: params.turnStateKey?.turnNo ?? null,
        });
        return;
      case "START_FRENZY":
        await this.characterResources.startFrenzy(params.sessionCharacterId);
        return;
    }
  }

  private resolveInitialResourceDefaults(actor: RuntimeActor): {
    secondWindAvailable: boolean;
    actionSurgeUses: number;
    rageUses: number;
  } {
    const className = actor.character.className.toLowerCase();

    return {
      secondWindAvailable: true,
      actionSurgeUses:
        className.includes("fighter") && actor.character.level >= 17
          ? 2
          : className.includes("fighter") && actor.character.level >= 2
            ? 1
            : 0,
      rageUses: className.includes("barbarian")
        ? this.resolveRageUses(actor.character.level)
        : 0,
    };
  }

  private resolveRageUses(level: number): number {
    if (level >= 20) {
      return 6;
    }
    if (level >= 17) {
      return 6;
    }
    if (level >= 12) {
      return 5;
    }
    if (level >= 6) {
      return 4;
    }
    if (level >= 3) {
      return 3;
    }
    if (level >= 1) {
      return 2;
    }
    return 0;
  }

  private toRuntimeResource(resource: {
    secondWindAvailable: boolean;
    actionSurgeUses: number;
    rageUses: number;
    rageActive: boolean;
    frenzyActive: boolean;
    exhaustionLevel: number;
  }): NonNullable<RuleRuntimeContext["resource"]> {
    return {
      secondWindAvailable: resource.secondWindAvailable,
      actionSurgeUses: resource.actionSurgeUses,
      rageUses: resource.rageUses,
      rageActive: resource.rageActive,
      frenzyActive: resource.frenzyActive,
      exhaustionLevel: resource.exhaustionLevel,
    };
  }

  private toPrismaAdvantage(value: DiceAdvantageState): PrismaDiceAdvantageState {
    switch (value) {
      case DiceAdvantageState.ADVANTAGE:
        return PrismaDiceAdvantageState.ADVANTAGE;
      case DiceAdvantageState.DISADVANTAGE:
        return PrismaDiceAdvantageState.DISADVANTAGE;
      case DiceAdvantageState.NORMAL:
      default:
        return PrismaDiceAdvantageState.NORMAL;
    }
  }

  private toSharedInputType(value: PrismaActionInputType): string {
    return value;
  }

  private toSharedActionScope(value: PrismaActionScope): string {
    return value;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
