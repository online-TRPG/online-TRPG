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
import { InterpreterResponsePayload } from "../ai/ai.client";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import {
  ActionResolution,
  ActionRuleService,
  ActionRuntimeEffect,
  RuleRuntimeContext,
} from "../rules/action-rule.service";
import { ActionEconomyService } from "../rules/action-economy.service";
import { CharacterResourceService } from "../rules/character-resource.service";
import { MapPositionService } from "../rules/map-position.service";
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
    private readonly mapPositions: MapPositionService,
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
      include: {
        character: true,
        // 룰 판정에서 장착 무기 속성을 확인해야 하므로 아이템 정의까지 함께 읽는다.
        inventoryEntries: {
          include: { itemDefinition: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const combatTargets = await this.getActiveCombatTargets(session.id);
    const ruleTargets = [...sessionCharacters, ...combatTargets];
    const actor =
      sessionCharacters.find((candidate) => candidate.id === action.sessionCharacterId) ??
      null;

    if (!actor) {
      throw new Error("ACTION_ACTOR_NOT_FOUND");
    }

    const runtime = await this.buildRuntime(action.sessionId, actor, state.flagsJson);

    // BE -> AI Interpreter (AI-SERVER-001). 자연어 액션은 구조화 후보로 바꾼 뒤
    // 기존 명령 기반 룰 엔진 입력으로 변환한다. 실패하면 rawText fallback을 유지한다.
    let interpreterResponse: InterpreterResponsePayload | null = null;
    try {
      interpreterResponse = await this.aiService.runInterpreter(session.id, action.userId, {
        rawText: action.rawText,
        actorCharacterId: actor.character.id,
        sceneSummary: `${session.title} - ${actor.character.name}의 행동`,
        availableTargets: ruleTargets.map((c) => c.character.name),
      });
    } catch (error) {
      this.logger.warn(
        `Interpreter call failed for action=${action.id}: ${this.toErrorMessage(error)}`,
      );
    }

    const ruleInput = this.toRuleInput(action.rawText, interpreterResponse);
    const resolution = this.actionRules.resolveAction(
      ruleInput,
      actor,
      ruleTargets,
      runtime.context,
    );
    let narration = resolution.narration;

    try {
      const narratorResponse = await this.aiService.runNarration(action.userId, session.id, {
        rawInput: action.rawText,
        actionSummary: resolution.narration,
        diceSummary: this.toDiceSummary(resolution.diceResult),
        sceneTone: this.toNarrationTone(resolution.outcome),
      });
      narration = narratorResponse.parsed.narration;
    } catch (error) {
      this.logger.warn(
        `Narrator call failed for action=${action.id}: ${this.toErrorMessage(error)}`,
      );
    }
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      playerActionId: action.id,
      actorUserId: action.userId,
      sessionCharacterId: actor.id,
      rawInput: action.rawText,
      structuredAction: {
        ...resolution.structuredAction,
        interpreterAction: interpreterResponse?.parsed.action ?? null,
        ruleInput,
        inputType: this.toSharedInputType(action.inputType),
        actionScope: this.toSharedActionScope(action.actionScope),
      },
      diceResult: resolution.diceResult ? { ...resolution.diceResult } : null,
      outcome: resolution.outcome,
      narration,
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
    flagsJson: string | null,
  ): Promise<{
    context: RuleRuntimeContext;
    turnStateKey: RuntimeTurnStateKey | null;
  }> {
    const map = this.mapPositions.createRuntimeMapFromFlagsJson(flagsJson);
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
          map,
          hasActiveCombat: Boolean(combat),
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
        map,
        hasActiveCombat: true,
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
      case "RECOVER_SHORT_REST":
        // 휴식은 캐릭터 HP 변경과 별도로 class resource row도 회복해야 해서 runtime effect로 처리한다.
        await this.characterResources.recoverShortRest({
          sessionCharacterId: params.sessionCharacterId,
          actionSurgeUses: effect.actionSurgeUses,
        });
        return;
      case "RECOVER_LONG_REST":
        // Long Rest는 Rage/Frenzy 같은 지속 자원까지 종료하므로 전용 회복 메서드에 위임한다.
        await this.characterResources.recoverLongRest({
          sessionCharacterId: params.sessionCharacterId,
          actionSurgeUses: effect.actionSurgeUses,
          rageUses: effect.rageUses,
          reduceExhaustionBy: effect.reduceExhaustionBy,
        });
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

  private async getActiveCombatTargets(sessionId: string) {
    const combat = await this.prisma.combat.findFirst({
      where: { sessionId, status: "ACTIVE" },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });

    if (!combat) {
      return [];
    }

    return combat.participants
      .filter((participant) => participant.isHostile && participant.currentHp !== null)
      .map((participant) => ({
        id: participant.id,
        characterId: participant.id,
        combatParticipantId: participant.id,
        currentHp: participant.currentHp ?? 1,
        tempHp: participant.tempHp,
        conditionsJson: participant.conditionsJson,
        character: {
          id: participant.id,
          name: participant.nameSnapshot,
          className: participant.entityType.toLowerCase(),
          subclassName: null,
          level: 1,
          maxHp: participant.maxHp ?? participant.currentHp ?? 1,
          abilitiesJson: JSON.stringify({ str: 10, dex: 10, con: 10, int: 6, wis: 10, cha: 6 }),
          proficiencyBonus: 2,
          featuresJson: JSON.stringify([]),
          proficientSkillsJson: JSON.stringify([]),
          armorClass: participant.armorClass ?? 10,
          speed: 30,
        },
      }));
  }

  private toRuleInput(
    rawText: string,
    interpreterResponse: InterpreterResponsePayload | null,
  ): string {
    const trimmed = rawText.trim();
    if (trimmed.startsWith("/") || !interpreterResponse || interpreterResponse.parsed.needsClarification) {
      return trimmed;
    }

    const parsed = interpreterResponse.parsed;
    const action = parsed.action;
    const target = action.targetId ?? "";
    const actionType = action.type.toLowerCase();

    if (actionType.includes("cast") || actionType.includes("spell")) {
      const spellId = action.spellId ?? parsed.mentionedSpellId;
      if (spellId && target) {
        return `/cast ${spellId} ${target} 90`;
      }
    }

    if (actionType.includes("attack") && target) {
      return `/attack ${target}`;
    }

    if (actionType.includes("check") || actionType.includes("skill")) {
      const checkName = action.skill ?? action.ability ?? "perception";
      return `/check ${checkName} ${this.toDefaultDc(action.suggestedDifficulty)}`;
    }

    if (actionType.includes("feature") && action.featureId) {
      return `/feature ${action.featureId}`;
    }

    if (actionType.includes("item") && parsed.mentionedItemId && target) {
      return `/item ${parsed.mentionedItemId} ${target}`;
    }

    return trimmed;
  }

  private toDefaultDc(difficulty: string | null | undefined): number {
    switch (difficulty?.toLowerCase()) {
      case "easy":
        return 10;
      case "hard":
        return 20;
      case "very_hard":
      case "very hard":
        return 25;
      case "nearly_impossible":
      case "nearly impossible":
        return 30;
      case "medium":
      default:
        return 15;
    }
  }

  private toDiceSummary(diceResult: ReturnType<ActionRuleService["resolveAction"]>["diceResult"]): string | undefined {
    if (!diceResult) {
      return undefined;
    }
    return `${diceResult.expression} = ${diceResult.total}`;
  }

  private toNarrationTone(outcome: ReturnType<ActionRuleService["resolveAction"]>["outcome"]): string {
    switch (outcome) {
      case "SUCCESS":
        return "heroic";
      case "FAILURE":
      case "IMPOSSIBLE":
        return "tense";
      default:
        return "mysterious";
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
