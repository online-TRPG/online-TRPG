import { HttpException, Injectable, Logger } from "@nestjs/common";
import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
  CombatStatus as PrismaCombatStatus,
  DiceAdvantageState as PrismaDiceAdvantageState,
  Prisma,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import {
  ActionOutcome,
  DiceAdvantageState,
  TurnLogResponseDto,
  VttMapStateDto,
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
import { InventoryRuntimeService } from "../rules/inventory-runtime.service";
import { MapPositionService } from "../rules/map-position.service";
import { PENDING_READY_ACTIONS_FLAG } from "../rules/ready-action.service";
import { SpellSlotService } from "../rules/spell-slot.service";
import { StateDiffService } from "../rules/state-diff.service";
import { MapRuntimeService } from "../sessions/map-runtime.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { badRequest, conflict, notFound } from "../../common/exceptions/domain-error";

type RuntimeTurnStateKey = {
  combatId: string;
  combatParticipantId: string;
  roundNo: number;
  turnNo: number;
  sessionCharacterId?: string | null;
};

type RuntimeActor = {
  id: string;
  character: {
    className: string;
    level: number;
    featuresJson?: string | null;
  };
};

type RuleTargetCharacter = {
  id: string;
  userId: string;
  characterId: string;
  tokenId?: string | null;
  combatParticipantId?: string | null;
  isCombatParticipantOnly?: boolean;
  currentHp: number;
  tempHp: number;
  conditionsJson: string;
  inventorySnapshotJson?: string | null;
  inventoryEntries?: Array<{
    id: string;
    itemDefinitionId: string;
    itemDefinition: {
      id: string;
      itemType: string;
      damageDice?: string | null;
      damageType?: string | null;
      propertiesJson?: string | null;
    };
  }>;
  character: {
    id: string;
    name: string;
    className: string;
    subclassName?: string | null;
    level: number;
    maxHp: number;
    abilitiesJson: string;
    proficiencyBonus: number;
    featuresJson?: string | null;
    proficientSkillsJson: string;
    armorClass: number;
    speed: number;
    spellsJson?: string | null;
    inventoryJson?: string | null;
    equippedWeaponId?: string | null;
  };
  user?: {
    id: string;
    displayName: string;
    profile?: { nickname: string } | null;
  } | null;
};

type RuntimeCombatParticipant = {
  id: string;
  sessionCharacterId: string | null;
  tokenId: string | null;
  nameSnapshot: string;
  currentHp: number | null;
  maxHp: number | null;
  armorClass: number | null;
  speedFt: number | null;
  conditionsJson: string | null;
  isHostile: boolean;
};

type RuntimeEffectParams = {
  sessionId: string;
  sessionScenarioId: string;
  sessionCharacterId: string;
  turnStateKey: RuntimeTurnStateKey | null;
};

type InventoryMapRuntimeEffect = Extract<
  ActionRuntimeEffect,
  | { type: "ADD_ITEM" }
  | { type: "REMOVE_ITEM" }
  | { type: "CREATE_MAP_OBJECT" }
  | { type: "UPDATE_MAP_OBJECT_QUANTITY" }
  | { type: "REMOVE_MAP_OBJECT" }
>;

const ACTION_SURGE_FEATURE_ID = "class.fighter.feature.action_surge";
const RAGE_FEATURE_ID = "class.barbarian.feature.rage";

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
    private readonly inventoryRuntime: InventoryRuntimeService,
    private readonly mapPositions: MapPositionService,
    private readonly mapRuntime: MapRuntimeService,
    private readonly spellSlots: SpellSlotService = new SpellSlotService(),
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
      const errorMessage = this.toErrorMessage(error);
      await this.prisma.playerAction.update({
        where: { id: action.id },
        data: {
          queueStatus: PrismaActionQueueStatus.FAILED,
          failureReason: errorMessage,
          processedAt: new Date(),
        },
      });

      const failureTurnLog = await this.createFailureTurnLog(action, errorMessage);
      if (failureTurnLog) {
        this.realtimeEvents.emitTurnLogCreated(action.sessionId, failureTurnLog);
        return;
      }

      this.realtimeEvents.emitSystemMessage(action.sessionId, "ACTION_FAILED", `행동 처리 실패: ${errorMessage}`, {
        playerActionId: action.id,
      });
    }
  }

  private async createFailureTurnLog(
    action: {
      id: string;
      sessionId: string;
      userId: string;
      sessionCharacterId: string | null;
      rawText: string;
    },
    errorMessage: string,
  ): Promise<TurnLogResponseDto | null> {
    try {
      const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(
        action.sessionId,
      );

      // 처리 실패도 TurnLog로 남겨야 새로고침/재접속 후 사용자 입력과 실패 응답을 같은 순서로 복원할 수 있습니다.
      return await this.turnLogsService.createTurnLog({
        sessionId: action.sessionId,
        sessionScenarioId: sessionScenario.id,
        playerActionId: action.id,
        actorUserId: action.userId,
        sessionCharacterId: action.sessionCharacterId,
        rawInput: action.rawText,
        structuredAction: {
          type: "action_error",
          error: errorMessage,
        },
        diceResult: null,
        stateDiff: null,
        outcome: ActionOutcome.FAILURE,
        narration: `행동 처리 실패: ${errorMessage}`,
      });
    } catch (turnLogError) {
      this.logger.warn(
        `Failed to create failure turn log for action=${action.id}: ${this.toErrorMessage(turnLogError)}`,
      );
      return null;
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
        user: {
          include: { profile: true },
        },
        // 룰 판정에서 장착 무기 속성을 확인해야 하므로 아이템 정의까지 함께 읽는다.
        inventoryEntries: {
          include: { itemDefinition: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const actor =
      sessionCharacters.find((candidate) => candidate.id === action.sessionCharacterId) ??
      null;

    if (!actor) {
      throw new Error("ACTION_ACTOR_NOT_FOUND");
    }

    const runtime = await this.buildRuntime(session.id, sessionScenario.id, actor, state);
    const ruleTargets = this.createRuleTargets(sessionCharacters, runtime.combatParticipants);

    // BE → AI Interpreter (AI-SERVER-001). 자연어 → 구조화 action 후보를 AiTrace 로 영속.
    // Phase 1: 결과를 룰 판정에 사용하지 않음 (actionRules 시그니처 변경 동반이라 별 PR).
    // Phase 2: actionRules.resolveAction 가 interpreter 결과 받아 활용.
    // 실패해도 진행 — AI 서버 자체에 fallback 있고, 룰은 rawText 로 독립 판정.
    try {
      await this.aiService.runInterpreter(session.id, action.userId, {
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

    const resolution = this.actionRules.resolveAction(
      action.rawText,
      actor,
      ruleTargets,
      runtime.context,
    );
    const runtimeEffectParams = {
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      sessionCharacterId: actor.id,
      turnStateKey: runtime.turnStateKey,
    };
    await this.assertRuntimeEffectPreconditions(resolution, runtimeEffectParams);
    const earlyRuntimeStateChanged = await this.applyEarlyRuntimeEffects(
      resolution,
      runtimeEffectParams,
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
    const revealCount = state.currentNodeId
      ? await this.sessionsService.revealCurrentNodeCluesAfterAction({
          sessionScenarioId: sessionScenario.id,
          nodeId: state.currentNodeId,
          actionText: action.rawText,
          outcome: resolution.outcome,
          turnLogId: turnLog.turnLogId,
          revealedBy: "system",
        })
      : 0;

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

    const laterRuntimeStateChanged = await this.applyRuntimeEffects(resolution, runtimeEffectParams);
    const runtimeStateChanged = earlyRuntimeStateChanged || laterRuntimeStateChanged;

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

    if (runtimeStateChanged || revealCount > 0) {
      const latestSnapshot = await this.sessionsService.buildSnapshot(session.id);
      this.realtimeEvents.emitSessionSnapshot(session.id, latestSnapshot);
    }

    return turnLog;
  }

  private async buildRuntime(
    sessionId: string,
    sessionScenarioId: string,
    actor: RuntimeActor,
    state: { currentNodeId: string | null; flagsJson: string | null },
  ): Promise<{
    context: RuleRuntimeContext;
    turnStateKey: RuntimeTurnStateKey | null;
    combatParticipants: RuntimeCombatParticipant[];
  }> {
    const vttMap = await this.sessionsService.getVttMapBaseline(sessionId, sessionScenarioId, state);
    const map = this.mapPositions.createRuntimeMap(vttMap);
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
    const actorParticipant = combat?.participants.find(
      (participant) => participant.sessionCharacterId === actor.id,
    );

    if (!combat || currentParticipant?.sessionCharacterId !== actor.id) {
      return {
        context: {
          map,
          hasActiveCombat: Boolean(combat),
          resource: this.toRuntimeResource(resource),
          turnState: null,
          combat: combat
            ? {
                combatId: combat.id,
                roundNo: combat.roundNo,
                turnNo: combat.turnNo,
                actorParticipantId: actorParticipant?.id ?? null,
              }
            : null,
        },
        turnStateKey: null,
        combatParticipants: combat?.participants ?? [],
      };
    }

    const turnStateKey = {
      combatId: combat.id,
      combatParticipantId: currentParticipant.id,
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
        combat: {
          combatId: combat.id,
          roundNo: combat.roundNo,
          turnNo: combat.turnNo,
          actorParticipantId: currentParticipant.id,
        },
      },
      turnStateKey,
      combatParticipants: combat.participants,
    };
  }

  private createRuleTargets(
    sessionCharacters: RuleTargetCharacter[],
    combatParticipants: RuntimeCombatParticipant[],
  ): RuleTargetCharacter[] {
    const participantBySessionCharacterId = new Map(
      combatParticipants
        .filter((participant) => participant.sessionCharacterId)
        .map((participant) => [participant.sessionCharacterId as string, participant]),
    );
    const sessionTargets = sessionCharacters.map((sessionCharacter) => {
      const participant = participantBySessionCharacterId.get(sessionCharacter.id);
      return {
        ...sessionCharacter,
        tokenId: participant?.tokenId ?? sessionCharacter.tokenId,
        combatParticipantId: participant?.id ?? sessionCharacter.combatParticipantId,
      };
    });
    const participantOnlyTargets = combatParticipants
      .filter((participant) => !participant.sessionCharacterId)
      .map((participant): RuleTargetCharacter => ({
        id: `combat-participant:${participant.id}`,
        userId: `combat-participant:${participant.id}`,
        characterId: `combat-participant:${participant.id}`,
        tokenId: participant.tokenId,
        combatParticipantId: participant.id,
        isCombatParticipantOnly: true,
        currentHp: participant.currentHp ?? 0,
        tempHp: 0,
        conditionsJson: participant.conditionsJson ?? "[]",
        inventorySnapshotJson: null,
        inventoryEntries: [],
        user: null,
        character: {
          id: `combat-participant:${participant.id}`,
          name: participant.nameSnapshot,
          className: participant.isHostile ? "monster" : "npc",
          subclassName: null,
          level: 1,
          maxHp: participant.maxHp ?? participant.currentHp ?? 1,
          abilitiesJson: "{}",
          proficiencyBonus: 2,
          featuresJson: "[]",
          proficientSkillsJson: "[]",
          armorClass: participant.armorClass ?? 10,
          speed: participant.speedFt ?? 30,
          spellsJson: null,
          inventoryJson: "[]",
          equippedWeaponId: null,
        },
      }));

    return [...sessionTargets, ...participantOnlyTargets];
  }

  private async applyRuntimeEffects(
    resolution: ActionResolution,
    params: RuntimeEffectParams,
  ): Promise<boolean> {
    let changed = false;
    let effects = (resolution.runtimeEffects ?? []).filter((effect) => !this.isEarlyRuntimeEffect(effect));
    if (this.hasInventoryMapRuntimeEffects(effects)) {
      await this.applyInventoryMapRuntimeEffectsAtomically(
        params,
        effects.filter((effect): effect is InventoryMapRuntimeEffect =>
          this.isInventoryMapRuntimeEffect(effect),
        ),
      );
      effects = effects.filter((effect) => !this.isInventoryMapRuntimeEffect(effect));
      changed = true;
    }

    for (const effect of effects) {
      await this.applyRuntimeEffect(effect, params);
      changed = true;
    }
    return changed;
  }

  private async applyEarlyRuntimeEffects(
    resolution: ActionResolution,
    params: RuntimeEffectParams,
  ): Promise<boolean> {
    let changed = false;
    for (const effect of resolution.runtimeEffects ?? []) {
      if (!this.isEarlyRuntimeEffect(effect)) {
        continue;
      }
      await this.applyRuntimeEffect(effect, params);
      changed = true;
    }
    return changed;
  }

  private async applyRuntimeEffect(
    effect: ActionRuntimeEffect,
    params: {
      sessionId: string;
      sessionScenarioId: string;
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
      case "SPEND_SPELL_SLOT":
        await this.spendSpellSlot(
          params.sessionScenarioId,
          params.sessionCharacterId,
          effect.slotLevel,
        );
        return;
      case "STORE_READY_ACTION":
        await this.storePendingReadyAction(params.sessionScenarioId, effect.pending);
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
          hitDiceSpent: effect.hitDiceSpent,
        });
        return;
      case "RECOVER_LONG_REST":
        // Long Rest는 Rage/Frenzy 같은 지속 자원까지 종료하므로 전용 회복 메서드에 위임한다.
        await this.characterResources.recoverLongRest({
          sessionCharacterId: params.sessionCharacterId,
          actionSurgeUses: effect.actionSurgeUses,
          rageUses: effect.rageUses,
          reduceExhaustionBy: effect.reduceExhaustionBy,
          hitDiceSpent: effect.hitDiceSpent,
        });
        await this.recoverLongRestSpellSlots(params.sessionScenarioId, params.sessionCharacterId);
        return;
      case "ADD_ITEM":
        await this.inventoryRuntime.addItem({
          sessionCharacterId: params.sessionCharacterId,
          itemDefinitionId: effect.itemDefinitionId,
          quantity: effect.quantity,
          containerEntryId: effect.containerEntryId ?? null,
        });
        return;
      case "REMOVE_ITEM":
        await this.inventoryRuntime.removeItemFromCharacter({
          sessionCharacterId: params.sessionCharacterId,
          itemId: effect.itemId,
          quantity: effect.quantity,
        });
        return;
      case "CREATE_MAP_OBJECT":
        await this.createMapObjectFromRuntimeEffect(params.sessionId, effect);
        return;
      case "UPDATE_MAP_OBJECT_QUANTITY":
        await this.updateMapObjectQuantityFromRuntimeEffect(params.sessionId, effect);
        return;
      case "REMOVE_MAP_OBJECT":
        await this.removeMapObjectFromRuntimeEffect(params.sessionId, effect.objectId);
        return;
    }
  }

  private async assertRuntimeEffectPreconditions(
    resolution: ActionResolution,
    params: RuntimeEffectParams,
  ): Promise<void> {
    for (const effect of resolution.runtimeEffects ?? []) {
      if (effect.type === "SPEND_SPELL_SLOT") {
        await this.assertSpellSlotAvailable(
          params.sessionScenarioId,
          params.sessionCharacterId,
          effect.slotLevel,
        );
      }
    }
  }

  private hasInventoryMapRuntimeEffects(effects: ActionRuntimeEffect[]): boolean {
    return effects.some((effect) => this.isInventoryRuntimeEffect(effect)) &&
      effects.some((effect) => this.isMapRuntimeEffect(effect));
  }

  private isInventoryMapRuntimeEffect(effect: ActionRuntimeEffect): effect is InventoryMapRuntimeEffect {
    return this.isInventoryRuntimeEffect(effect) || this.isMapRuntimeEffect(effect);
  }

  private isInventoryRuntimeEffect(effect: ActionRuntimeEffect): boolean {
    return effect.type === "ADD_ITEM" || effect.type === "REMOVE_ITEM";
  }

  private isMapRuntimeEffect(effect: ActionRuntimeEffect): boolean {
    return effect.type === "CREATE_MAP_OBJECT" ||
      effect.type === "UPDATE_MAP_OBJECT_QUANTITY" ||
      effect.type === "REMOVE_MAP_OBJECT";
  }

  private isEarlyRuntimeEffect(effect: ActionRuntimeEffect): boolean {
    return effect.type === "SPEND_ACTION" ||
      effect.type === "SPEND_BONUS_ACTION" ||
      effect.type === "SPEND_REACTION" ||
      effect.type === "SPEND_SPELL_SLOT";
  }

  private async applyInventoryMapRuntimeEffectsAtomically(
    params: RuntimeEffectParams,
    effects: InventoryMapRuntimeEffect[],
  ): Promise<void> {
    const session = await this.sessionsService.getSessionEntityOrThrow(params.sessionId);
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(params.sessionId);
    const baselineMap = await this.sessionsService.getVttMapBaseline(
      params.sessionId,
      sessionScenario.id,
      state,
    );
    this.assertMapRuntimeEffectsApplicable(baselineMap, effects);
    const nextMap = this.applyMapRuntimeEffectsToMap(baselineMap, effects);

    const savedMap = await this.prisma.$transaction(async (tx) => {
      for (const effect of effects) {
        if (effect.type === "ADD_ITEM") {
          await this.addInventoryItemWithClient(tx, params.sessionCharacterId, effect);
        } else if (effect.type === "REMOVE_ITEM") {
          await this.removeInventoryItemWithClient(tx, params.sessionCharacterId, effect);
        }
      }

      await this.syncSessionInventorySnapshotWithClient(tx, params.sessionCharacterId);

      const currentState = await tx.gameState.findUnique({
        where: { sessionScenarioId: params.sessionScenarioId },
        select: { currentNodeId: true, flagsJson: true },
      });
      const flags = this.parseJson<Record<string, unknown>>(currentState?.flagsJson, {});
      const normalizedMap = this.sessionsService.normalizeVttMap(
        nextMap,
        currentState?.currentNodeId ?? state.currentNodeId ?? null,
      );
      await tx.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          flagsJson: JSON.stringify({
            ...flags,
            vttMap: normalizedMap,
          }),
        },
      });
      return normalizedMap;
    });

    this.realtimeEvents.emitVttMapUpdated(params.sessionId, {
      hostUserId: session.hostUserId,
      hostMap: savedMap,
      playerMap: this.sessionsService.redactVttMapForPlayer(savedMap),
    });
  }

  private applyMapRuntimeEffectsToMap(
    map: VttMapStateDto,
    effects: InventoryMapRuntimeEffect[],
  ): VttMapStateDto {
    const gridSize = map.gridSize || 50;
    let objectCells = [...(map.objectCells ?? [])];
    for (const effect of effects) {
      if (effect.type === "CREATE_MAP_OBJECT") {
        objectCells = [
          ...objectCells.filter((cell) => cell.id !== effect.objectId),
          {
            id: effect.objectId,
            x: effect.point.x * gridSize,
            y: effect.point.y * gridSize,
            width: gridSize,
            height: gridSize,
            name: effect.name,
            description: `${effect.itemDefinitionId} x${effect.quantity}`,
            visibleToPlayers: true,
            hiddenItemIds: [effect.itemDefinitionId],
          },
        ];
      } else if (effect.type === "UPDATE_MAP_OBJECT_QUANTITY") {
        objectCells = objectCells.map((cell) =>
          cell.id === effect.objectId
            ? { ...cell, description: `${effect.itemDefinitionId} x${effect.quantity}` }
            : cell,
        );
      } else if (effect.type === "REMOVE_MAP_OBJECT") {
        objectCells = objectCells.filter((cell) => cell.id !== effect.objectId);
      }
    }

    return {
      ...map,
      objectCells,
      updatedAt: new Date().toISOString(),
    };
  }

  private assertMapRuntimeEffectsApplicable(
    map: VttMapStateDto,
    effects: InventoryMapRuntimeEffect[],
  ): void {
    const objectIds = new Set((map.objectCells ?? []).map((cell) => cell.id));
    for (const effect of effects) {
      if (
        (effect.type === "UPDATE_MAP_OBJECT_QUANTITY" || effect.type === "REMOVE_MAP_OBJECT") &&
        !objectIds.has(effect.objectId)
      ) {
        throw conflict("VTT_409", "맵 오브젝트가 이미 사라졌습니다.", {
          reason: "MAP_OBJECT_NOT_FOUND",
          objectId: effect.objectId,
        });
      }
      if (effect.type === "CREATE_MAP_OBJECT") {
        objectIds.add(effect.objectId);
      }
      if (effect.type === "REMOVE_MAP_OBJECT") {
        objectIds.delete(effect.objectId);
      }
    }
  }

  private async addInventoryItemWithClient(
    tx: Prisma.TransactionClient,
    sessionCharacterId: string,
    effect: Extract<ActionRuntimeEffect, { type: "ADD_ITEM" }>,
  ): Promise<void> {
    const quantity = this.normalizeInventoryQuantity(effect.quantity);
    const itemDefinition = await tx.itemDefinition.findFirst({
      where: {
        OR: [
          { id: effect.itemDefinitionId },
          { name: { equals: effect.itemDefinitionId, mode: "insensitive" } },
        ],
      },
    });
    if (!itemDefinition) {
      throw notFound("INVENTORY_404", "아이템 정의를 찾을 수 없습니다.", {
        reason: "ITEM_DEFINITION_NOT_FOUND",
      });
    }

    await tx.inventoryEntry.create({
      data: {
        sessionCharacterId,
        itemDefinitionId: itemDefinition.id,
        quantity,
        containerEntryId: effect.containerEntryId ?? null,
      },
    });
  }

  private async removeInventoryItemWithClient(
    tx: Prisma.TransactionClient,
    sessionCharacterId: string,
    effect: Extract<ActionRuntimeEffect, { type: "REMOVE_ITEM" }>,
  ): Promise<void> {
    const quantity = this.normalizeInventoryQuantity(effect.quantity);
    const entry = await tx.inventoryEntry.findFirst({
      where: {
        sessionCharacterId,
        OR: [
          { id: effect.itemId },
          { itemDefinitionId: effect.itemId },
          {
            itemDefinition: {
              is: {
                OR: [
                  { id: effect.itemId },
                  { name: { equals: effect.itemId, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!entry) {
      throw notFound("INVENTORY_404", "인벤토리 아이템을 찾을 수 없습니다.", {
        reason: "INVENTORY_ENTRY_NOT_FOUND",
        itemId: effect.itemId,
      });
    }
    if (quantity >= entry.quantity) {
      const containedCount = await tx.inventoryEntry.count({
        where: { containerEntryId: entry.id },
      });
      if (containedCount > 0) {
        throw badRequest("INVENTORY_400", "내용물이 있는 컨테이너는 삭제할 수 없습니다.", {
          reason: "CONTAINER_NOT_EMPTY",
        });
      }
      await tx.inventoryEntry.delete({ where: { id: entry.id } });
      return;
    }

    await tx.inventoryEntry.update({
      where: { id: entry.id },
      data: { quantity: { decrement: quantity } },
    });
  }

  private async syncSessionInventorySnapshotWithClient(
    tx: Prisma.TransactionClient,
    sessionCharacterId: string,
  ): Promise<void> {
    const entries = await tx.inventoryEntry.findMany({
      where: { sessionCharacterId },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });
    await tx.sessionCharacter.update({
      where: { id: sessionCharacterId },
      data: {
        inventorySnapshotJson: JSON.stringify(
          entries.map((entry) => ({
            id: entry.id,
            name: entry.itemDefinition.name,
            quantity: entry.quantity,
            itemDefinitionId: entry.itemDefinitionId,
            itemType: entry.itemDefinition.itemType,
            description: entry.itemDefinition.description ?? undefined,
            weightLb: entry.itemDefinition.weightLb ?? undefined,
            volumeCuFt: entry.itemDefinition.volumeCuFt ?? undefined,
            damageDice: entry.itemDefinition.damageDice ?? undefined,
            damageType: entry.itemDefinition.damageType ?? undefined,
            armorClassBase: entry.itemDefinition.armorClassBase ?? undefined,
            armorClassBonus: entry.itemDefinition.armorClassBonus ?? undefined,
            armorStrengthRequirement: entry.itemDefinition.armorStrengthRequirement ?? undefined,
            armorStealthDisadvantage: entry.itemDefinition.armorStealthDisadvantage ?? undefined,
            useEffect: entry.itemDefinition.useEffect ?? undefined,
            containerId: entry.containerEntryId ?? undefined,
          })),
        ),
      },
    });
  }

  private normalizeInventoryQuantity(quantity: number | undefined): number {
    const normalized = quantity ?? 1;
    if (!Number.isInteger(normalized) || normalized < 1) {
      throw badRequest("INVENTORY_400", "아이템 수량이 올바르지 않습니다.", {
        reason: "INVALID_ITEM_QUANTITY",
      });
    }
    return normalized;
  }

  private resolveInitialResourceDefaults(actor: RuntimeActor): {
    secondWindAvailable: boolean;
    actionSurgeUses: number;
    rageUses: number;
  } {
    const className = actor.character.className.toLowerCase();
    const featureIds = this.parseFeatureIds(actor.character.featuresJson);
    const hasActionSurge =
      featureIds.has(ACTION_SURGE_FEATURE_ID) ||
      (className.includes("fighter") && actor.character.level >= 2);
    const hasRage =
      featureIds.has(RAGE_FEATURE_ID) ||
      className.includes("barbarian");

    return {
      secondWindAvailable: true,
      actionSurgeUses: hasActionSurge ? this.resolveActionSurgeUses(actor.character.level) : 0,
      rageUses: hasRage ? this.resolveRageUses(actor.character.level) : 0,
    };
  }

  private resolveActionSurgeUses(level: number): number {
    if (level >= 17) {
      return 2;
    }
    if (level >= 2) {
      return 1;
    }
    return 0;
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

  private parseFeatureIds(featuresJson: string | null | undefined): Set<string> {
    if (!featuresJson) {
      return new Set();
    }
    try {
      const parsed = JSON.parse(featuresJson) as unknown;
      if (!Array.isArray(parsed)) {
        return new Set();
      }
      return new Set(
        parsed
          .filter((feature): feature is string => typeof feature === "string")
          .map((feature) => feature.trim().toLowerCase())
          .filter(Boolean),
      );
    } catch {
      return new Set();
    }
  }

  private async createMapObjectFromRuntimeEffect(
    sessionId: string,
    effect: Extract<ActionRuntimeEffect, { type: "CREATE_MAP_OBJECT" }>,
  ): Promise<void> {
    const map = await this.getCurrentVttMap(sessionId);
    if (!map) {
      return;
    }

    const gridSize = map.gridSize || 50;
    const objectCells = (map.objectCells ?? []).filter((cell) => cell.id !== effect.objectId);
    await this.mapRuntime.saveSystemVttMap(sessionId, {
      ...map,
      objectCells: [
        ...objectCells,
        {
          id: effect.objectId,
          x: effect.point.x * gridSize,
          y: effect.point.y * gridSize,
          width: gridSize,
          height: gridSize,
          name: effect.name,
          description: `${effect.itemDefinitionId} x${effect.quantity}`,
          visibleToPlayers: true,
          hiddenItemIds: [effect.itemDefinitionId],
        },
      ],
      updatedAt: new Date().toISOString(),
    });
  }

  private async removeMapObjectFromRuntimeEffect(
    sessionId: string,
    objectId: string,
  ): Promise<void> {
    const map = await this.getCurrentVttMap(sessionId);
    if (!map) {
      return;
    }

    const objectCells = (map.objectCells ?? []).filter((cell) => cell.id !== objectId);
    if (objectCells.length === (map.objectCells ?? []).length) {
      return;
    }

    await this.mapRuntime.saveSystemVttMap(sessionId, {
      ...map,
      objectCells,
      updatedAt: new Date().toISOString(),
    });
  }

  private async updateMapObjectQuantityFromRuntimeEffect(
    sessionId: string,
    effect: Extract<ActionRuntimeEffect, { type: "UPDATE_MAP_OBJECT_QUANTITY" }>,
  ): Promise<void> {
    const map = await this.getCurrentVttMap(sessionId);
    const objectCells = map.objectCells ?? [];
    const objectIndex = objectCells.findIndex((cell) => cell.id === effect.objectId);
    if (objectIndex < 0) {
      return;
    }

    await this.mapRuntime.saveSystemVttMap(sessionId, {
      ...map,
      objectCells: objectCells.map((cell, index) =>
        index === objectIndex
          ? {
              ...cell,
              description: `${effect.itemDefinitionId} x${effect.quantity}`,
            }
          : cell,
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  private async getCurrentVttMap(sessionId: string): Promise<VttMapStateDto> {
    const { sessionScenario, state } =
      await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    return this.sessionsService.getVttMapBaseline(sessionId, sessionScenario.id, state);
  }

  private async storePendingReadyAction(
    sessionScenarioId: string,
    pending: Extract<ActionRuntimeEffect, { type: "STORE_READY_ACTION" }>["pending"],
  ): Promise<void> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId },
      select: { flagsJson: true },
    });
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
    const current = Array.isArray(flags[PENDING_READY_ACTIONS_FLAG])
      ? flags[PENDING_READY_ACTIONS_FLAG]
      : [];
    const readyActions = current.filter(
      (candidate): candidate is Record<string, unknown> =>
        typeof candidate === "object" &&
        candidate !== null &&
        candidate["id"] !== pending.id,
    );

    await this.prisma.gameState.update({
      where: { sessionScenarioId },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [PENDING_READY_ACTIONS_FLAG]: [...readyActions, pending],
        }),
      },
    });
  }

  private async recoverLongRestSpellSlots(
    sessionScenarioId: string,
    sessionCharacterId: string,
  ): Promise<void> {
    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId },
      select: { flagsJson: true },
    });
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
    const spellSlotsBySessionCharacterId = this.parseJson<Record<string, Record<string, number>>>(
      JSON.stringify(flags.spellSlotsBySessionCharacterId ?? {}),
      {},
    );

    if (!Object.prototype.hasOwnProperty.call(spellSlotsBySessionCharacterId, sessionCharacterId)) {
      return;
    }

    const {
      [sessionCharacterId]: _recovered,
      ...remainingSpellSlotsBySessionCharacterId
    } = spellSlotsBySessionCharacterId;

    await this.prisma.gameState.update({
      where: { sessionScenarioId },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          spellSlotsBySessionCharacterId: remainingSpellSlotsBySessionCharacterId,
        }),
      },
    });
  }

  private async spendSpellSlot(
    sessionScenarioId: string,
    sessionCharacterId: string,
    slotLevel: number,
  ): Promise<void> {
    if (slotLevel < 1) {
      return;
    }

    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId },
      select: { flagsJson: true },
    });
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
    const spellSlotsBySessionCharacterId = this.parseJson<Record<string, Record<string, number>>>(
      JSON.stringify(flags.spellSlotsBySessionCharacterId ?? {}),
      {},
    );
    const slotKey = String(slotLevel);
    const maximumSlots = await this.resolveSpellSlotMaximum(
      sessionCharacterId,
      slotLevel,
    );
    const currentSlots = spellSlotsBySessionCharacterId[sessionCharacterId] ?? {
      [slotKey]: maximumSlots,
    };
    const remaining = Math.max(
      0,
      Math.floor(currentSlots[slotKey] ?? maximumSlots),
    );
    if (remaining < 1) {
      throw new Error("No spell slot remaining.");
    }

    await this.prisma.gameState.update({
      where: { sessionScenarioId },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          spellSlotsBySessionCharacterId: {
            ...spellSlotsBySessionCharacterId,
            [sessionCharacterId]: {
              ...currentSlots,
              [slotKey]: remaining - 1,
            },
          },
        }),
      },
    });
  }

  private async assertSpellSlotAvailable(
    sessionScenarioId: string,
    sessionCharacterId: string,
    slotLevel: number,
  ): Promise<void> {
    if (slotLevel < 1) {
      return;
    }

    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId },
      select: { flagsJson: true },
    });
    const flags = this.parseJson<Record<string, unknown>>(state?.flagsJson, {});
    const spellSlotsBySessionCharacterId = this.parseJson<Record<string, Record<string, number>>>(
      JSON.stringify(flags.spellSlotsBySessionCharacterId ?? {}),
      {},
    );
    const slotKey = String(slotLevel);
    const maximumSlots = await this.resolveSpellSlotMaximum(
      sessionCharacterId,
      slotLevel,
    );
    const currentSlots = spellSlotsBySessionCharacterId[sessionCharacterId] ?? {
      [slotKey]: maximumSlots,
    };
    const remaining = Math.max(
      0,
      Math.floor(currentSlots[slotKey] ?? maximumSlots),
    );
    if (remaining < 1) {
      throw badRequest("ACTION_400", `사용 가능한 ${slotLevel}레벨 주문 슬롯이 없습니다.`, {
        reason: "NO_SPELL_SLOT",
      });
    }
  }

  private async resolveSpellSlotMaximum(
    sessionCharacterId: string,
    slotLevel: number,
  ): Promise<number> {
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: sessionCharacterId },
      include: {
        character: {
          select: {
            className: true,
            level: true,
          },
        },
      },
    });
    return this.spellSlots.resolveMaximumForCharacter(
      sessionCharacter?.character ?? null,
      slotLevel,
    );
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
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === "object" && response && "message" in response) {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) {
          return message.join(", ");
        }
        if (typeof message === "string") {
          return message;
        }
      }
    }

    return error instanceof Error ? error.message : String(error);
  }
}
