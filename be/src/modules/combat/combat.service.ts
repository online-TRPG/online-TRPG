import { Injectable, Logger } from "@nestjs/common";
import {
  CombatEntityType as PrismaCombatEntityType,
  CombatStatus as PrismaCombatStatus,
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  ActionOutcome,
  AvailableActionsResponseDto,
  ApplyCombatDamageDto,
  AutoMonsterTurnDto,
  CastCombatSpellDto,
  CombatActorActionDto,
  CombatBasicActionDto,
  CombatActionResultDto,
  CombatMoveResultDto,
  CombatReactionPromptDto,
  CombatReactionResponseDto,
  CombatResponseDto,
  CombatStatus,
  DiceAdvantageState,
  DiceRollResponseDto,
  EquippedWeaponAttackDto,
  EndTurnDto,
  ForceMoveCombatParticipantDto,
  GamePhase,
  MoveCombatParticipantDto,
  ResolveCombatAttackDto,
  StartCombatDto,
  TurnAdvanceResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import { conflict, forbidden, notFound, unprocessable } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { ActionRuleService } from "../rules/action-rule.service";
import { ActionEconomyService } from "../rules/action-economy.service";
import { AoeDamageService } from "../rules/aoe-damage.service";
import type { AoeDamageTarget } from "../rules/aoe-damage.service";
import { AoeTargetingService } from "../rules/aoe-targeting.service";
import { CharacterResourceService } from "../rules/character-resource.service";
import { ConcentrationRuntimeService } from "../rules/concentration-runtime.service";
import { ConditionRuntimeService } from "../rules/condition-runtime.service";
import type { ConditionInstance } from "../rules/condition-runtime.service";
import { CoverPositionService } from "../rules/cover-position.service";
import { DiceService } from "../rules/dice.service";
import { ForcedMovementService } from "../rules/forced-movement.service";
import type { ForcedMovementMode } from "../rules/forced-movement.service";
import { MonsterAbilityService } from "../rules/monster-ability.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";
import { TerrainEffectService } from "../rules/terrain-effect.service";
import type { TerrainEffectTrigger } from "../rules/terrain-effect.service";
import { PENDING_READY_ACTIONS_FLAG, ReadyActionService, TRIGGERED_READY_ACTIONS_FLAG } from "../rules/ready-action.service";
import type { PendingReadyAction } from "../rules/ready-action.service";
import type { TriggeredReadyAction } from "../rules/ready-action.service";
import { RuleEngineService } from "../rules/rule-engine.service";
import type { CoverModifierProduced, SavingThrowAbility } from "../rules/rule-engine.types";
import { SpellSlotService } from "../rules/spell-slot.service";
import { SpellScalingService } from "../rules/spell-scaling.service";
import { MapRuntimeService } from "../sessions/map-runtime.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { CombatActionService } from "./combat-action.service";
import { CombatConditionService } from "./combat-condition.service";
import { CombatCoverService } from "./combat-cover.service";
import { CombatMapperService } from "./combat-mapper.service";
import { CombatMovementService } from "./combat-movement.service";
import type { EnteredTerrainEffect } from "./combat-movement.service";
import { CombatMonsterActionService } from "./combat-monster-action.service";
import { CombatMonsterResourceService } from "./combat-monster-resource.service";
import {
  CombatReactionService,
  type PendingOpportunityAttackContinuation,
  type PendingOpportunityAttackReaction,
  type PendingShieldReaction,
} from "./combat-reaction.service";
import { CombatSpellService } from "./combat-spell.service";
import { CombatStatsService } from "./combat-stats.service";
import { CombatTargetingService } from "./combat-targeting.service";
import { CombatTerrainService } from "./combat-terrain.service";
import type { CombatConcentrationCheckResult, CombatTerrainEffectApplication } from "./combat-terrain.types";
import { CombatTurnService } from "./combat-turn.service";
import { SrdEngineLoaderService } from "./srd-engine-loader.service";
import type { SrdEngineExecutableMonsterAction } from "./srd-engine.types";

type CombatWithParticipants = Awaited<ReturnType<CombatService["getActiveCombatEntity"]>>;
type CombatParticipantEntity = NonNullable<CombatWithParticipants>["participants"][number];
type VttMapToken = VttMapStateDto["tokens"][number];
type MonsterActionConditionRiderApplication = {
  saveRolls: DiceRollResponseDto[];
  appliedConditionTags: string[];
};
type EquippedWeaponProfile = {
  weaponId?: string | null;
  quantity?: number;
  name: string;
  attackBonus: number;
  damageDice?: string;
  damageBonus?: number;
  rangeFt: number;
  properties?: string[];
  attackKind?: "melee_weapon_attack" | "ranged_weapon_attack";
  isLightMeleeWeapon?: boolean;
  fixedDamageTotal?: number;
  isBasicAttack?: boolean;
};

type OpportunityAttackCheckResult = {
  prompt: CombatReactionPromptDto | null;
  automaticMessages: string[];
};

type CombatMovementResolution = CombatMoveResultDto & {
  movementDistanceFt: number;
  movementCostFt: number;
};

type ReadyActionMovementResult = {
  count: number;
  prompts: CombatReactionPromptDto[];
};

const RAGE_CONDITION_TAGS = ["rage", "condition.rage", "resistance:bludgeoning", "resistance:piercing", "resistance:slashing"];

const DEFAULT_MONSTER_AC = 10;
const DEFAULT_MONSTER_HP = 1;
const COMBAT_CONDITION_DODGE = "combat:dodge";
const COMBAT_CONDITION_DISENGAGE = "combat:disengage";
const COMBAT_CONDITION_HIDDEN = "combat:hidden";
const COMBAT_CONDITION_SLEEP = "combat:sleep";
const COMBAT_CONDITION_UNCONSCIOUS = "condition:unconscious";
const COMBAT_INCAPACITATING_CONDITION_TAGS = new Set([
  COMBAT_CONDITION_SLEEP,
  COMBAT_CONDITION_UNCONSCIOUS,
  "condition:incapacitated",
  "condition:paralyzed",
  "condition:petrified",
  "condition:stunned",
]);
const COMBAT_JUMP_EXTRA_MOVEMENT_FT = 10;
@Injectable()
export class CombatService {
  private readonly logger = new Logger(CombatService.name);
  private readonly serverAutoMonsterTurnSessions = new Set<string>();
  private readonly serverAutoMonsterTurnScheduledSessions = new Set<string>();
  private readonly terrainEffects = new TerrainEffectService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly mapRuntimeService: MapRuntimeService,
    private readonly diceService: DiceService,
    private readonly actionRules: ActionRuleService,
    private readonly actionEconomy: ActionEconomyService,
    private readonly characterResources: CharacterResourceService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly turnLogsService: TurnLogsService,
    private readonly ruleEngine: RuleEngineService,
    private readonly srdEngine: SrdEngineLoaderService,
    private readonly monsterAbilities: MonsterAbilityService,
    private readonly readyActions: ReadyActionService = new ReadyActionService(),
    private readonly spellSlots: SpellSlotService = new SpellSlotService(),
    private readonly concentrationRuntime: ConcentrationRuntimeService = new ConcentrationRuntimeService(),
    private readonly conditionRuntime: ConditionRuntimeService = new ConditionRuntimeService(),
    private readonly coverPositions: CoverPositionService = new CoverPositionService(),
    private readonly forcedMovement: ForcedMovementService = new ForcedMovementService(),
    private readonly spellScaling: SpellScalingService = new SpellScalingService(),
    private readonly aoeTargeting: AoeTargetingService = new AoeTargetingService(),
    private readonly aoeDamage: AoeDamageService = new AoeDamageService(diceService, ruleEngine),
    private readonly ruleCatalog: RuleCatalogService = new RuleCatalogService(),
    private readonly combatConditions: CombatConditionService = new CombatConditionService(prisma, conditionRuntime),
    private readonly combatMovement: CombatMovementService = new CombatMovementService(),
    private readonly combatCover: CombatCoverService = new CombatCoverService(coverPositions, ruleEngine, combatMovement),
    private readonly combatMonsterResources: CombatMonsterResourceService = new CombatMonsterResourceService(prisma, sessionsService, diceService),
    private readonly combatMonsterActions: CombatMonsterActionService = new CombatMonsterActionService(
      monsterAbilities,
      srdEngine,
      combatMovement,
      combatMonsterResources,
    ),
    private readonly combatReactions: CombatReactionService = new CombatReactionService(prisma, sessionsService),
    private readonly combatSpells: CombatSpellService = new CombatSpellService(prisma, sessionsService, ruleCatalog, spellScaling, spellSlots),
    private readonly combatStats: CombatStatsService = new CombatStatsService(srdEngine),
    private readonly combatTargeting: CombatTargetingService = new CombatTargetingService(combatMovement, combatCover, combatStats),
    private readonly combatTerrain: CombatTerrainService = new CombatTerrainService(),
    private readonly combatActions: CombatActionService = new CombatActionService(),
    private readonly combatTurns: CombatTurnService = new CombatTurnService(),
    private readonly combatMapper: CombatMapperService = new CombatMapperService(
      prisma,
      sessionsService,
      conditionRuntime,
      concentrationRuntime,
      combatConditions,
      combatSpells,
    ),
  ) {}

  createCombatActionRuntime() {
    return {
      prisma: this.prisma,
      sessionsService: this.sessionsService,
      mapRuntimeService: this.mapRuntimeService,
      diceService: this.diceService,
      actionEconomy: this.actionEconomy,
      characterResources: this.characterResources,
      realtimeEvents: this.realtimeEvents,
      turnLogsService: this.turnLogsService,
      ruleEngine: this.ruleEngine,
      conditionRuntime: this.conditionRuntime,
      aoeTargeting: this.aoeTargeting,
      aoeDamage: this.aoeDamage,
      combatConditions: this.combatConditions,
      combatMovement: this.combatMovement,
      combatCover: this.combatCover,
      combatMonsterActions: this.combatMonsterActions,
      combatReactions: this.combatReactions,
      combatSpells: this.combatSpells,
      combatTargeting: this.combatTargeting,
      ensureHost: this.ensureHost.bind(this),
      getActiveCombatEntity: this.getActiveCombatEntity.bind(this),
      findCombatParticipantOrThrow: this.findCombatParticipantOrThrow.bind(this),
      applyHitPointDelta: this.applyHitPointDelta.bind(this),
      finalizeCombatDamage: this.finalizeCombatDamage.bind(this),
      completeCombatIfResolved: this.completeCombatIfResolved.bind(this),
      getGmRuntimeUserId: this.getGmRuntimeUserId.bind(this),
      parseConditions: this.parseConditions.bind(this),
      resolveAttack: this.resolveAttack.bind(this),
      spendCurrentActionIfNeeded: this.spendCurrentActionIfNeeded.bind(this),
      toCombatAoeDamageTarget: this.toCombatAoeDamageTarget.bind(this),
      clampNumber: this.clampNumber.bind(this),
      ensureActorCanAct: this.ensureActorCanAct.bind(this),
      ensureReactionActorCanAct: this.ensureReactionActorCanAct.bind(this),
      resolveAttackAdvantageState: this.resolveAttackAdvantageState.bind(this),
      hasAllyWithinFeetOfTarget: this.hasAllyWithinFeetOfTarget.bind(this),
      isParticipantInHeavilyObscuredTerrain: this.isParticipantInHeavilyObscuredTerrain.bind(this),
      resolveParticipantArmorClass: this.resolveParticipantArmorClass.bind(this),
      spendCurrentBonusActionIfNeeded: this.spendCurrentBonusActionIfNeeded.bind(this),
      selectNaturalD20: this.selectNaturalD20.bind(this),
      canPromptShieldReaction: this.canPromptShieldReaction.bind(this),
      storePendingShieldReaction: this.storePendingShieldReaction.bind(this),
      mapCombat: this.mapCombat.bind(this),
      buildDamageExpression: this.buildDamageExpression.bind(this),
      resolveEquippedWeaponProfile: this.resolveEquippedWeaponProfile.bind(this),
      isSneakAttackWeaponProfile: this.isSneakAttackWeaponProfile.bind(this),
      getCurrentPlayerParticipantOrThrow: this.getCurrentPlayerParticipantOrThrow.bind(this),
      resolveParticipantSpeedFt: this.resolveParticipantSpeedFt.bind(this),
      resolveStealthModifier: this.resolveStealthModifier.bind(this),
      resolveActorDashAction: this.resolveActorDashAction.bind(this),
      resolveActorDodgeAction: this.resolveActorDodgeAction.bind(this),
      resolveActorHideAction: this.resolveActorHideAction.bind(this),
      resolveMonsterAttackAction: this.resolveMonsterAttackAction.bind(this),
      resolveMonsterSpecialAction: this.resolveMonsterSpecialAction.bind(this),
    };
  }

  createCombatTurnRuntime() {
    return {
      prisma: this.prisma,
      sessionsService: this.sessionsService,
      actionEconomy: this.actionEconomy,
      diceService: this.diceService,
      realtimeEvents: this.realtimeEvents,
      turnLogsService: this.turnLogsService,
      ruleEngine: this.ruleEngine,
      srdEngine: this.srdEngine,
      monsterAbilities: this.monsterAbilities,
      conditionRuntime: this.conditionRuntime,
      logger: this.logger,
      combatConditions: this.combatConditions,
      combatMovement: this.combatMovement,
      combatMonsterActions: this.combatMonsterActions,
      combatMonsterResources: this.combatMonsterResources,
      combatReactions: this.combatReactions,
      combatTargeting: this.combatTargeting,
      combatTerrain: this.combatTerrain,
      terrainEffects: this.terrainEffects,
      serverAutoMonsterTurnSessions: this.serverAutoMonsterTurnSessions,
      serverAutoMonsterTurnScheduledSessions: this.serverAutoMonsterTurnScheduledSessions,
      ensureHost: this.ensureHost.bind(this),
      getGmRuntimeUserId: this.getGmRuntimeUserId.bind(this),
      findCombatParticipantOrThrow: this.findCombatParticipantOrThrow.bind(this),
      resolveCombatMovement: this.resolveCombatMovement.bind(this),
      resolveMonsterAttackAction: this.resolveMonsterAttackAction.bind(this),
      resolveMonsterSpecialAction: this.resolveMonsterSpecialAction.bind(this),
      resolveAttack: this.resolveAttack.bind(this),
      resolveParticipantSavingThrowProfile: this.resolveParticipantSavingThrowProfile.bind(this),
      selectNaturalD20: this.selectNaturalD20.bind(this),
      ensureActorCanAct: this.ensureActorCanAct.bind(this),
      spendCurrentActionIfNeeded: this.spendCurrentActionIfNeeded.bind(this),
      spendCurrentBonusActionIfNeeded: this.spendCurrentBonusActionIfNeeded.bind(this),
      applyMonsterActionConditionRiders: this.applyMonsterActionConditionRiders.bind(this),
      resolveMonsterActionRiderSave: this.resolveMonsterActionRiderSave.bind(this),
      resolveMonsterActionSaveEnds: this.resolveMonsterActionSaveEnds.bind(this),
      resolveMonsterActionSaveDc: this.resolveMonsterActionSaveDc.bind(this),
      toSavingThrowAbility: this.toSavingThrowAbility.bind(this),
      resolveMonsterMultiattackAction: this.resolveMonsterMultiattackAction.bind(this),
      parseMonsterMultiattackTags: this.parseMonsterMultiattackTags.bind(this),
      getCombatEntityById: this.getCombatEntityById.bind(this),
      completeCombat: this.completeCombat.bind(this),
      isCombatResolved: this.isCombatResolved.bind(this),
      advanceCurrentTurn: this.advanceCurrentTurn.bind(this),
      executeAutoMonsterTurn: this.executeAutoMonsterTurn.bind(this),
      runServerAutoMonsterTurns: this.runServerAutoMonsterTurns.bind(this),
      logAutoMonsterTurn: this.logAutoMonsterTurn.bind(this),
      extractErrorMessage: this.extractErrorMessage.bind(this),
      isCurrentTurnAutoMonster: this.isCurrentTurnAutoMonster.bind(this),
      applyTurnEndTerrainConditionEffects: this.applyTurnEndTerrainConditionEffects.bind(this),
      applyTurnStartTerrainEffects: this.applyTurnStartTerrainEffects.bind(this),
      applyEnteredTerrainEffects: this.applyEnteredTerrainEffects.bind(this),
      applyExitedTerrainEffects: this.applyExitedTerrainEffects.bind(this),
      finalizeCombatDamage: this.finalizeCombatDamage.bind(this),
      endExpiredRagesForCombat: this.endExpiredRagesForCombat.bind(this),
      expireReadyActionsForTurn: this.expireReadyActionsForTurn.bind(this),
      getActiveCombatEntity: this.getActiveCombatEntity.bind(this),
      completeCombatIfResolved: this.completeCombatIfResolved.bind(this),
      mapCombat: this.mapCombat.bind(this),
    };
  }

  async startCombat(userId: string, sessionId: string, dto: StartCombatDto): Promise<CombatResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);

    if (session.status !== PrismaSessionStatus.PLAYING) {
      throw forbidden("COMBAT_403", "전투를 시작할 수 없습니다.", {
        reason: "SESSION_NOT_PLAYING",
      });
    }

    if (session.gmMode === PrismaGmMode.HUMAN) {
      await this.ensureHost(userId, session.id);
    }

    const existing = await this.prisma.combat.findFirst({
      where: { sessionId: session.id, status: PrismaCombatStatus.ACTIVE },
    });
    if (existing) {
      throw conflict("COMBAT_409", "이미 전투가 진행 중입니다.", {
        reason: "ACTIVE_COMBAT_EXISTS",
      });
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);

    // 이미 전투를 끝낸 노드에서는 전투 재시작을 막는다. 전투 종료 후 탐색 단계로
    // 넘어간 노드를 FE 가 (스냅샷 전파 지연 등으로) 미완료로 오인해 startCombat 을
    // 다시 호출하면, 새 ACTIVE 전투가 생겨 applyPlayerVttMapUpdate 의 "현재 전투
    // 행동자만 맵 조작" 규칙에 걸려 비방장 플레이어 이동이 전부 403 으로 막힌다.
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const completedCombatNodeIds = Array.isArray(flags.completedCombatNodeIds)
      ? flags.completedCombatNodeIds.filter((value): value is string => typeof value === "string")
      : [];
    if (state.currentNodeId && completedCombatNodeIds.includes(state.currentNodeId)) {
      throw conflict("COMBAT_409", "이미 종료된 전투입니다.", {
        reason: "COMBAT_NODE_ALREADY_COMPLETED",
      });
    }

    const candidates = await this.prisma.sessionCharacter.findMany({
      where: {
        sessionId: session.id,
        status: PrismaSessionCharacterStatus.ACTIVE,
        id: dto.participantEntityIds?.length ? { in: dto.participantEntityIds } : undefined,
      },
      include: { character: true },
      orderBy: { createdAt: "asc" },
    });

    // S14P31A201-71: participantEntityIds 가 명시되면 모두 호출자 본인 소유 캐릭터여야 한다.
    // 비어 있을 때(자동: 세션 전체 ACTIVE 포함)는 검사 대상이 아니다. 호스트가 일부 인원만
    // 끼우려면 본인 캐릭터만 명시 가능 — 다른 인원을 빼려면 dto 를 비워두고 자동 전체 모드를 쓴다.
    if (dto.participantEntityIds?.length) {
      const foreign = candidates.find((row) => row.character.ownerUserId !== userId);
      if (foreign) {
        throw forbidden("COMBAT_403", "다른 유저의 캐릭터로 전투를 시작할 수 없습니다.", {
          reason: "FOREIGN_CHARACTER_IN_PARTICIPANTS",
          sessionCharacterId: foreign.id,
        });
      }
    }

    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const playerTokenIdBySessionCharacterId = new Map(
      (map.tokens ?? []).filter((token) => token.sessionCharacterId).map((token) => [token.sessionCharacterId as string, token.id]),
    );
    const rawMonsterTokens = (map.tokens ?? [])
      .filter((token) => token.hidden !== true && token.isHostile === true)
      .filter((token) => !dto.participantEntityIds?.length || dto.participantEntityIds.includes(token.id));
    const scalingResult = dto.participantEntityIds?.length
      ? {
          monsterTokens: rawMonsterTokens,
          excludedTokenIds: [] as string[],
          applied: false,
        }
      : this.combatStats.scaleMonsterTokensForParty(rawMonsterTokens, candidates.length, map);
    const monsterTokens = scalingResult.monsterTokens;
    const excludedTokenIdSet = new Set(scalingResult.excludedTokenIds);
    const runtimeMap =
      excludedTokenIdSet.size > 0
        ? {
            ...map,
            tokens: map.tokens.map((token) => (excludedTokenIdSet.has(token.id) ? { ...token, hidden: true } : token)),
            updatedAt: new Date().toISOString(),
          }
        : map;

    this.logAutoMonsterTurn("startCombat participants prepared", {
      sessionId: session.id,
      nodeId: state.currentNodeId,
      gmMode: session.gmMode,
      playerCount: candidates.length,
      monsterTokenCount: monsterTokens.length,
      excludedMonsterTokenCount: scalingResult.excludedTokenIds.length,
      playerIds: candidates.map((candidate) => candidate.id),
      monsterTokens: monsterTokens.map((token) => ({
        tokenId: token.id,
        name: this.combatStats.resolveTokenName(token),
        isHostile: token.isHostile,
        hidden: token.hidden,
      })),
    });

    const playerInitiativeRows = candidates.map((candidate) => ({
      kind: "player" as const,
      candidate,
      initiative: this.rollInitiative(this.combatStats.resolveCharacterDexterityModifier(candidate.character.abilitiesJson), dto.autoRollInitiative),
      tieBreaker: Math.random(),
    }));
    const monsterInitiativeRows = monsterTokens.map((token) => ({
      kind: "monster" as const,
      token,
      initiative: this.rollInitiative(this.combatStats.resolveMonsterDexterityModifier(token), dto.autoRollInitiative),
      tieBreaker: Math.random(),
    }));
    const initiativeRows = [...playerInitiativeRows, ...monsterInitiativeRows].sort(
      (left, right) => right.initiative - left.initiative || right.tieBreaker - left.tieBreaker,
    );

    if (!initiativeRows.length) {
      throw unprocessable("COMBAT_422", "전투를 시작할 수 없습니다.", {
        reason: "NO_COMBAT_PARTICIPANTS",
      });
    }

    const combat = await this.prisma
      .$transaction(async (tx) => {
        await this.lockSessionRuntime(tx, session.id);
        const created = await tx.combat.create({
          data: {
            sessionId: session.id,
            sessionScenarioId: sessionScenario.id,
            status: PrismaCombatStatus.ACTIVE,
            roundNo: 1,
            turnNo: 1,
          },
        });

        const participants = await Promise.all(
          initiativeRows.map((row, index) => {
            const monsterStats = row.kind === "monster" ? this.combatStats.resolveMonsterTokenCombatStats(row.token) : null;
            return tx.combatParticipant.create({
              data: {
                combatId: created.id,
                entityType: row.kind === "player" ? PrismaCombatEntityType.PLAYER_CHARACTER : PrismaCombatEntityType.MONSTER,
                sessionCharacterId: row.kind === "player" ? row.candidate.id : null,
                tokenId: row.kind === "monster" ? row.token.id : (playerTokenIdBySessionCharacterId.get(row.candidate.id) ?? null),
                nameSnapshot: row.kind === "player" ? row.candidate.character.name : this.combatStats.resolveTokenName(row.token),
                currentHp: row.kind === "player" ? row.candidate.currentHp : monsterStats?.currentHp,
                maxHp: row.kind === "player" ? row.candidate.character.maxHp : monsterStats?.maxHp,
                armorClass: row.kind === "player" ? row.candidate.character.armorClass : monsterStats?.armorClass,
                speedFt: row.kind === "player" ? row.candidate.character.speed : this.combatStats.resolveMonsterSpeedFt(row.token),
                conditionsJson: row.kind === "player" ? row.candidate.conditionsJson : JSON.stringify([]),
                initiative: row.initiative,
                turnOrder: index + 1,
                isAlive: row.kind === "player" ? row.candidate.currentHp > 0 : (monsterStats?.currentHp ?? 0) > 0,
                isHostile: row.kind === "monster",
              },
            });
          }),
        );

        const firstParticipant = participants[0];
        await tx.combat.update({
          where: { id: created.id },
          data: { currentParticipantId: firstParticipant.id },
        });

        // 전투 시작 직후 현재 턴의 행동/반응 자원이 모든 참여자에게 보이도록 만든다.
        // 기회공격은 자기 턴이 아닌 참여자의 reaction도 조회하므로 몬스터 포함 전체를 초기화한다.
        await Promise.all(
          participants.map((participant) =>
            tx.combatTurnState.upsert({
              where: {
                combatId_roundNo_turnNo_combatParticipantId: {
                  combatId: created.id,
                  roundNo: 1,
                  turnNo: 1,
                  combatParticipantId: participant.id,
                },
              },
              create: {
                combatId: created.id,
                combatParticipantId: participant.id,
                roundNo: 1,
                turnNo: 1,
                sessionCharacterId: participant.sessionCharacterId,
              },
              update: {},
            }),
          ),
        );

        // 전투 시작은 세션 전체 UI가 바뀌는 상태 전환이므로 GameState phase와 version을 함께 올린다.
        // flags/completedCombatNodeIds 는 위 가드에서 파싱한 값을 그대로 재사용한다.
        const encounterScalingApplied =
          scalingResult.applied || scalingResult.excludedTokenIds.length
            ? {
                nodeId: state.currentNodeId,
                playerCount: candidates.length,
                basePartySize: map.encounterScaling?.basePartySize ?? 4,
                includedTokenIds: monsterTokens.map((token) => token.id),
                excludedTokenIds: scalingResult.excludedTokenIds,
                appliedAt: new Date().toISOString(),
              }
            : undefined;
        await tx.gameState.update({
          where: { sessionScenarioId: sessionScenario.id },
          data: {
            phase: PrismaGamePhase.COMBAT,
            flagsJson: JSON.stringify({
              ...flags,
              ...(scalingResult.excludedTokenIds.length ? { vttMap: runtimeMap } : {}),
              ...(encounterScalingApplied ? { encounterScalingApplied } : {}),
              completedCombatNodeIds,
            }),
            version: state.version + 1,
          },
        });

        return tx.combat.findUniqueOrThrow({
          where: { id: created.id },
          include: { participants: { orderBy: { turnOrder: "asc" } } },
        });
      })
      .catch((error: unknown) => {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
          throw conflict("COMBAT_409", "이미 전투가 진행 중입니다.", {
            reason: "ACTIVE_COMBAT_EXISTS",
          });
        }
        throw error;
      });

    const response = await this.mapCombat(combat);
    this.logAutoMonsterTurn("startCombat created combat", {
      sessionId: session.id,
      combatId: combat.id,
      status: combat.status,
      currentParticipantId: combat.currentParticipantId,
      participants: combat.participants.map((participant) => ({
        id: participant.id,
        name: participant.nameSnapshot,
        type: participant.entityType,
        isHostile: participant.isHostile,
        turnOrder: participant.turnOrder,
        initiative: participant.initiative,
        isCurrent: participant.id === combat.currentParticipantId,
      })),
    });
    const currentParticipant = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    this.realtimeEvents.emitSystemMessage(
      session.id,
      "COMBAT_STARTED",
      currentParticipant ? `전투가 시작되었습니다. 현재 턴: ${currentParticipant.nameSnapshot}` : "전투가 시작되었습니다.",
    );
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));
    if (session.gmMode !== PrismaGmMode.HUMAN && this.isCurrentTurnAutoMonster(combat)) {
      this.logAutoMonsterTurn("startCombat detected monster current turn", {
        sessionId: session.id,
        combatId: combat.id,
        currentParticipantId: combat.currentParticipantId,
      });
      await this.runServerAutoMonsterTurns(session.id);
      return this.mapCombat(await this.getCombatEntityById(combat.id));
    }
    return response;
  }

  async getCombat(userId: string, sessionId: string): Promise<CombatResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    if (session.gmMode !== PrismaGmMode.HUMAN && this.isCurrentTurnAutoMonster(combat)) {
      this.logAutoMonsterTurn("getCombat detected monster current turn", {
        sessionId: session.id,
        combatId: combat.id,
        currentParticipantId: combat.currentParticipantId,
      });
      await this.runServerAutoMonsterTurns(session.id);
      return this.mapCombat(await this.getCombatEntityById(combat.id));
    }
    return this.mapCombat(combat);
  }

  async endCombat(userId: string, sessionId: string): Promise<CombatResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    await this.ensureHost(userId, session.id);

    const combat = await this.getActiveCombatEntity(session.id);
    const response = await this.completeCombat(session.id, combat.id);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));
    return response;
  }

  async getAvailableActions(userId: string, sessionId: string): Promise<AvailableActionsResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const { state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      include: { character: true },
    });

    if (!sessionCharacter) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    const combat = await this.prisma.combat.findFirst({
      where: { sessionId: session.id, status: PrismaCombatStatus.ACTIVE },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });
    const current = combat?.participants.find((participant) => participant.id === combat.currentParticipantId);
    const isCurrentTurn = current?.sessionCharacterId === sessionCharacter.id;

    return {
      sessionId: session.id,
      characterId: sessionCharacter.characterId,
      isCurrentTurn,
      actions: this.actionRules.getAvailableActions({
        phase: state.phase.toLowerCase() as GamePhase,
        hasActiveCombat: Boolean(combat),
        isCurrentTurn,
        isAlive: sessionCharacter.status === PrismaSessionCharacterStatus.ACTIVE && sessionCharacter.currentHp > 0,
      }),
    };
  }

  async endTurn(userId: string, sessionId: string, dto: EndTurnDto): Promise<TurnAdvanceResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const current = combat.participants.find((participant) => participant.id === combat.currentParticipantId);

    if (!current) {
      throw conflict("TURN_409", "이미 턴이 종료되었습니다.", {
        reason: "CURRENT_TURN_NOT_FOUND",
      });
    }

    if (dto.force) {
      await this.ensureHost(userId, session.id);
    } else {
      const actor = await this.prisma.sessionCharacter.findUnique({
        where: {
          sessionId_userId: {
            sessionId: session.id,
            userId,
          },
        },
        include: { character: { select: { ownerUserId: true } } },
      });

      // S14P31A201-71: sessionId+userId 복합키로 본인 sessionCharacter 만 얻지만,
      // 캐릭터 이양/공유 등 향후 기능 대비해 Character.ownerUserId 도 명시 검증.
      if (!actor || actor.id !== current.sessionCharacterId || actor.character.ownerUserId !== userId) {
        throw forbidden("TURN_403", "현재 턴이 아닙니다.", {
          reason: "NOT_YOUR_TURN",
        });
      }
    }

    return this.advanceCurrentTurn(session.id, combat);
  }

  async moveParticipant(userId: string, sessionId: string, dto: MoveCombatParticipantDto): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const mover = this.findCombatParticipantOrThrow(combat, dto.participantId);

    if (combat.currentParticipantId !== mover.id) {
      throw conflict("COMBAT_409", "현재 턴의 전투 참여자만 이동할 수 있습니다.", {
        reason: "NOT_CURRENT_COMBATANT",
      });
    }
    await this.ensureActorCanAct(userId, session.id, combat, mover);

    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const moverToken = this.combatTargeting.findParticipantToken(map, mover);
    if (!moverToken) {
      throw conflict("COMBAT_409", "이동할 토큰을 찾을 수 없습니다.", {
        reason: "MOVER_TOKEN_NOT_FOUND",
      });
    }

    return this.resolveCombatMovement({
      session,
      userId,
      combat,
      mover,
      map,
      moverToken,
      to: dto.to,
      path: dto.path,
      movementMode: dto.movementMode === "jump" ? "jump" : "normal",
    });
  }

  async forceMoveParticipant(userId: string, sessionId: string, dto: ForceMoveCombatParticipantDto): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    await this.ensureHost(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const target = this.findCombatParticipantOrThrow(combat, dto.participantId);
    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const targetToken = this.combatTargeting.findParticipantToken(map, target);
    if (!targetToken) {
      throw conflict("COMBAT_409", "강제이동 대상 토큰을 찾을 수 없습니다.", {
        reason: "FORCED_MOVE_TOKEN_NOT_FOUND",
      });
    }

    const resolution = this.forcedMovement.resolveForcedMovement({
      mode: this.normalizeForcedMovementMode(dto.mode),
      origin: this.combatMovement.mapPointToGridPoint(map, dto.origin),
      target: this.combatCover.toCoverGridPoint(map, targetToken),
      distanceFt: Math.max(0, Math.floor(dto.distanceFt)),
      grid: {
        width: Math.ceil(map.width / map.gridSize),
        height: Math.ceil(map.height / map.gridSize),
      },
      obstacles: this.mapForcedMovementObstacles(map),
      tokens: map.tokens
        .filter((token) => token.id !== targetToken.id && token.hidden !== true)
        .map((token) => ({
          id: token.id,
          point: this.combatCover.toCoverGridPoint(map, token),
          blocksMovement: true,
        })),
      hazards: this.mapForcedMovementHazards(map),
    });

    const destination = {
      x: this.clampNumber(resolution.destination.x * map.gridSize, 0, Math.max(0, map.width - targetToken.size)),
      y: this.clampNumber(resolution.destination.y * map.gridSize, 0, Math.max(0, map.height - targetToken.size)),
    };
    const nextMap: VttMapStateDto = {
      ...map,
      tokens: map.tokens.map((token) => (token.id === targetToken.id ? { ...token, ...destination } : token)),
      updatedAt: new Date().toISOString(),
    };
    const savedMap = await this.mapRuntimeService.saveSystemVttMap(session.id, nextMap);
    const enteredTerrainEffectApplication = await this.applyEnteredTerrainEffects(combat, target, resolution.enteredTerrainEffects, "on_enter");
    const exitedTerrainEffectApplication = await this.applyExitedTerrainEffects(
      target,
      this.combatMovement.resolveExitedTerrainEffects(map, { x: targetToken.x, y: targetToken.y }, destination),
    );
    const terrainEffectApplication = this.combatTerrain.mergeApplications(enteredTerrainEffectApplication, exitedTerrainEffectApplication);
    const responseMap =
      terrainEffectApplication.damageRoll && !target.isAlive
        ? await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id)
        : savedMap;
    let triggeredReadyActions: ReadyActionMovementResult = {
      count: 0,
      prompts: [],
    };
    if (resolution.distanceMovedFt > 0) {
      const latestCombat = await this.getActiveCombatEntity(session.id);
      const latestTarget = this.findCombatParticipantOrThrow(latestCombat, target.id);
      if (latestTarget.isAlive) {
        triggeredReadyActions = await this.resolveReadyActionsForMovement({
          sessionId: session.id,
          combat: latestCombat,
          mover: latestTarget,
          map: savedMap,
          nextMoverToken: { ...targetToken, ...destination },
        });
      }
    }
    const response = await this.mapCombat(await this.getActiveCombatEntity(session.id));
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const readyActionMessage = triggeredReadyActions.count > 0 ? `준비행동 ${triggeredReadyActions.count}개가 발동 대기 중입니다.` : null;
    const terrainDamageMessage = this.combatTerrain.describeDamage(terrainEffectApplication);
    const terrainConditionMessage = this.combatTerrain.describeConditions(terrainEffectApplication);
    const message = [
      `${target.nameSnapshot} 강제이동: ${resolution.distanceMovedFt}ft (${resolution.stoppedReason})`,
      terrainDamageMessage,
      terrainConditionMessage,
      readyActionMessage,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(" / ");
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: target.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "forced_movement",
        targetParticipantId: target.id,
        mode: resolution.mode,
        origin: dto.origin,
        start: resolution.start,
        destination: resolution.destination,
        path: resolution.path,
        distanceMovedFt: resolution.distanceMovedFt,
        movementCostFt: resolution.movementCostFt,
        provokesOpportunityAttack: resolution.provokesOpportunityAttack,
        stoppedReason: resolution.stoppedReason,
        collision: resolution.collision,
        enteredHazards: resolution.enteredHazards,
        enteredTerrainEffects: resolution.enteredTerrainEffects,
        combinedEnteredTerrainEffect: resolution.combinedEnteredTerrainEffect,
        terrainEffectApplication,
        fall: resolution.fall,
      },
      diceResult: terrainEffectApplication.damageRoll ? { ...terrainEffectApplication.damageRoll } : null,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });

    for (const saveRoll of terrainEffectApplication.saveRolls) {
      this.realtimeEvents.emitDiceRolled(session.id, saveRoll);
    }
    for (const damage of terrainEffectApplication.damageRolls) {
      this.realtimeEvents.emitDiceRolled(session.id, damage.roll);
    }
    if (terrainEffectApplication.concentrationCheck) {
      this.realtimeEvents.emitDiceRolled(session.id, terrainEffectApplication.concentrationCheck.diceResult);
    }
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));
    return {
      combat: response,
      map: responseMap,
      message,
      pendingReaction: triggeredReadyActions.prompts[0] ?? null,
      terrainEffects: this.combatTerrain.toResult(this.combatTerrain.resolveMovementResultTrigger(terrainEffectApplication), terrainEffectApplication),
    };
  }

  private async resolveCombatMovement(params: {
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
    userId: string;
    combat: NonNullable<CombatWithParticipants>;
    mover: CombatParticipantEntity;
    map: VttMapStateDto;
    moverToken: VttMapToken;
    to: { x: number; y: number };
    path?: Array<{ x: number; y: number }> | null;
    movementMode?: "normal" | "jump";
    continuation?: PendingOpportunityAttackContinuation | null;
    reactionCost?: {
      sessionCharacterId: string;
    } | null;
  }): Promise<CombatMovementResolution> {
    const to = {
      x: this.clampNumber(Math.floor(params.to.x), 0, Math.max(0, params.map.width - params.moverToken.size)),
      y: this.clampNumber(Math.floor(params.to.y), 0, Math.max(0, params.map.height - params.moverToken.size)),
    };
    const movementMode = params.movementMode === "jump" ? "jump" : "normal";
    const movementPath = this.combatMovement.normalizeCombatMovementPath(params.map, params.moverToken, params.path, to);
    this.combatMovement.assertCombatMovementPathOpen(params.map, params.moverToken, movementPath, movementMode);
    const movementDistanceFt = this.combatMovement.calculateMovementPathDistanceFt(params.map, params.moverToken, movementPath);
    if (movementDistanceFt <= 0) {
      return {
        combat: await this.mapCombat(params.combat),
        map: params.map,
        message: "이동하지 않았습니다.",
        pendingReaction: null,
        movementDistanceFt: 0,
        movementCostFt: 0,
      };
    }
    const movementCostFt =
      movementMode === "jump"
        ? movementDistanceFt + COMBAT_JUMP_EXTRA_MOVEMENT_FT
        : this.combatMovement.calculateTerrainAdjustedMovementCostFt(params.map, params.moverToken, movementPath);
    await this.assertMovementAvailable(params.combat, params.mover, movementCostFt);
    if (params.reactionCost) {
      await this.actionEconomy.spendReaction({
        combatId: params.combat.id,
        combatParticipantId: params.mover.id,
        roundNo: params.combat.roundNo,
        turnNo: params.combat.turnNo,
        sessionCharacterId: params.reactionCost.sessionCharacterId,
      });
    }

    const nextMap: VttMapStateDto = {
      ...params.map,
      tokens: params.map.tokens.map((token) => (token.id === params.moverToken.id ? { ...token, x: to.x, y: to.y } : token)),
      updatedAt: new Date().toISOString(),
    };
    const opportunityAttack = await this.createOpportunityAttackPromptIfNeeded({
      sessionId: params.session.id,
      combat: params.combat,
      mover: params.mover,
      moverToken: params.moverToken,
      nextMoverToken: { ...params.moverToken, x: to.x, y: to.y },
      movementPath,
      map: params.map,
      nextMap,
      movementDistanceFt,
      movementCostFt,
      moverUserId: params.userId,
      continuation: params.continuation ?? null,
    });

    if (opportunityAttack.prompt) {
      return {
        combat: await this.mapCombat(params.combat),
        map: params.map,
        message: opportunityAttack.prompt.message,
        pendingReaction: opportunityAttack.prompt,
        movementDistanceFt,
        movementCostFt,
      };
    }

    const latestCombat = await this.getActiveCombatEntity(params.session.id);
    const latestMover = this.findCombatParticipantOrThrow(latestCombat, params.mover.id);
    if (!latestMover.isAlive) {
      const response = await this.completeCombatIfResolved(params.session.id, latestCombat);
      this.realtimeEvents.emitCombatUpdated(params.session.id, response);
      const currentMap = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(params.session), params.session.id);
      return {
        combat: response,
        map: currentMap,
        message:
          opportunityAttack.automaticMessages[opportunityAttack.automaticMessages.length - 1] ??
          `${params.mover.nameSnapshot}은(는) 기회공격으로 쓰러져 이동하지 못했습니다.`,
        pendingReaction: null,
        movementDistanceFt,
        movementCostFt,
      };
    }

    const savedMap = await this.commitCombatMove(params.session.id, latestCombat, latestMover, nextMap, movementCostFt);
    const enteredTerrainEffects = movementMode === "normal" ? this.combatMovement.resolveEnteredTerrainEffectsForMovement(params.map, movementPath) : [];
    const enteredTerrainEffectApplication = await this.applyEnteredTerrainEffects(latestCombat, latestMover, enteredTerrainEffects, "on_enter");
    const exitedTerrainEffectApplication = await this.applyExitedTerrainEffects(
      latestMover,
      this.combatMovement.resolveExitedTerrainEffects(params.map, { x: params.moverToken.x, y: params.moverToken.y }, to),
    );
    const terrainEffectApplication = this.combatTerrain.mergeApplications(enteredTerrainEffectApplication, exitedTerrainEffectApplication);
    for (const saveRoll of terrainEffectApplication.saveRolls) {
      this.realtimeEvents.emitDiceRolled(params.session.id, saveRoll);
    }
    for (const damage of terrainEffectApplication.damageRolls) {
      this.realtimeEvents.emitDiceRolled(params.session.id, damage.roll);
    }
    if (terrainEffectApplication.concentrationCheck) {
      this.realtimeEvents.emitDiceRolled(params.session.id, terrainEffectApplication.concentrationCheck.diceResult);
    }
    if (!latestMover.isAlive) {
      const response = await this.completeCombatIfResolved(params.session.id, await this.getActiveCombatEntity(params.session.id));
      this.realtimeEvents.emitCombatUpdated(params.session.id, response);
      this.realtimeEvents.emitSessionSnapshot(params.session.id, await this.sessionsService.buildSnapshot(params.session.id));
      const currentMap = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(params.session), params.session.id);
      return {
        combat: response,
        map: currentMap,
        message: [
          `${params.mover.nameSnapshot} 이동: ${movementDistanceFt}ft`,
          this.combatTerrain.describeDamage(terrainEffectApplication),
          this.combatTerrain.describeConditions(terrainEffectApplication),
        ]
          .filter((message): message is string => Boolean(message))
          .join(" / "),
        pendingReaction: null,
        movementDistanceFt,
        movementCostFt,
        terrainEffects: this.combatTerrain.toResult(this.combatTerrain.resolveMovementResultTrigger(terrainEffectApplication), terrainEffectApplication),
      };
    }
    const triggeredReadyActions = await this.resolveReadyActionsForMovement({
      sessionId: params.session.id,
      combat: latestCombat,
      mover: latestMover,
      map: savedMap,
      nextMoverToken: { ...params.moverToken, x: to.x, y: to.y },
    });
    const triggeredReadyActionCount = triggeredReadyActions.count;
    const response = await this.mapCombat(await this.getActiveCombatEntity(params.session.id));
    this.realtimeEvents.emitCombatUpdated(params.session.id, response);
    if (
      triggeredReadyActionCount > 0 ||
      terrainEffectApplication.damageRoll ||
      terrainEffectApplication.appliedConditionTags.length > 0 ||
      terrainEffectApplication.removedConditionTags.length > 0
    ) {
      this.realtimeEvents.emitSessionSnapshot(params.session.id, await this.sessionsService.buildSnapshot(params.session.id));
    }
    const terrainConditionMessage = this.combatTerrain.describeConditions(terrainEffectApplication);
    const terrainDamageMessage = this.combatTerrain.describeDamage(terrainEffectApplication);
    const readyActionMessage = triggeredReadyActionCount > 0 ? `준비행동 ${triggeredReadyActionCount}개가 발동 대기 중입니다.` : null;
    const movementMessage =
      movementMode === "jump"
        ? `${params.mover.nameSnapshot} 도약: ${movementDistanceFt}ft + 추가 ${COMBAT_JUMP_EXTRA_MOVEMENT_FT}ft`
        : `${params.mover.nameSnapshot} 이동: ${movementDistanceFt}ft`;
    const resolvedMovementMessage = [
      opportunityAttack.automaticMessages.length ? opportunityAttack.automaticMessages.join(" / ") : null,
      movementMessage,
      terrainDamageMessage,
      terrainConditionMessage,
      readyActionMessage,
    ]
      .filter((message): message is string => Boolean(message))
      .join(" / ");
    return {
      combat: response,
      map: savedMap,
      message: resolvedMovementMessage,
      pendingReaction: triggeredReadyActions.prompts[0] ?? null,
      movementDistanceFt,
      movementCostFt,
      terrainEffects: this.combatTerrain.toResult(this.combatTerrain.resolveMovementResultTrigger(terrainEffectApplication), terrainEffectApplication),
    };
  }

  async acceptReaction(userId: string, sessionId: string, dto: CombatReactionResponseDto): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    if (dto.reactionId.startsWith("triggered:")) {
      return this.resolveTriggeredReadyAction(userId, session.id, dto.reactionId, true);
    }
    const pending = await this.combatReactions.consumePendingCombatReaction(session.id, dto.reactionId);
    if (pending.type === "shield") {
      return this.resolvePendingShieldReaction(userId, session.id, pending, true);
    }
    if (pending.reactorUserId !== userId) {
      await this.ensureHost(userId, session.id);
    }

    const combat = await this.getActiveCombatEntity(session.id);
    const reactor = this.findCombatParticipantOrThrow(combat, pending.reactorParticipantId);
    const mover = this.findCombatParticipantOrThrow(combat, pending.moverParticipantId);
    const weapon = reactor.sessionCharacterId
      ? await this.resolveEquippedWeaponProfile(reactor.sessionCharacterId)
      : this.resolveMonsterOpportunityWeapon(reactor);

    const attackResult = await this.resolveAttack(
      userId,
      session.id,
      {
        attackerParticipantId: reactor.id,
        targetParticipantId: mover.id,
        attackBonus: weapon.attackBonus,
        damageDice: weapon.damageDice,
        damageBonus: weapon.damageBonus,
      },
      {
        messagePrefix: `${reactor.nameSnapshot} 기회공격`,
        fixedDamageTotal: weapon.fixedDamageTotal,
        actionCost: "reaction",
        reactionUserId: userId,
      },
    );

    const latestCombat = await this.getActiveCombatEntity(session.id);
    const latestMover = this.findCombatParticipantOrThrow(latestCombat, mover.id);
    let savedMap = pending.map;
    let message = `${attackResult.message}`;
    if (latestMover.isAlive) {
      savedMap = await this.commitCombatMove(session.id, latestCombat, latestMover, pending.map, pending.movementCostFt ?? pending.movementDistanceFt);
      message = `${message} 이동 완료: ${pending.movementDistanceFt}ft`;
    } else {
      savedMap = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
      message = `${message} 이동 중단`;
    }

    if (latestMover.isAlive && pending.continuation) {
      return this.resolvePendingOpportunityContinuation({
        session,
        pending,
        map: savedMap,
        prefixMessage: message,
      });
    }

    const response = await this.completeCombatIfResolved(session.id, await this.getActiveCombatEntity(session.id));
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));
    return { combat: response, map: savedMap, message, pendingReaction: null };
  }

  async declineReaction(userId: string, sessionId: string, dto: CombatReactionResponseDto): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    if (dto.reactionId.startsWith("triggered:")) {
      return this.resolveTriggeredReadyAction(userId, session.id, dto.reactionId, false);
    }
    const pending = await this.combatReactions.consumePendingCombatReaction(session.id, dto.reactionId);
    if (pending.type === "shield") {
      return this.resolvePendingShieldReaction(userId, session.id, pending, false);
    }
    if (pending.reactorUserId !== userId) {
      await this.ensureHost(userId, session.id);
    }

    const combat = await this.getActiveCombatEntity(session.id);
    const mover = this.findCombatParticipantOrThrow(combat, pending.moverParticipantId);
    const savedMap = await this.commitCombatMove(session.id, combat, mover, pending.map, pending.movementCostFt ?? pending.movementDistanceFt);
    if (pending.continuation) {
      return this.resolvePendingOpportunityContinuation({
        session,
        pending,
        map: savedMap,
        prefixMessage: "기회공격을 하지 않고 이동을 완료했습니다.",
      });
    }
    const response = await this.mapCombat(await this.getActiveCombatEntity(session.id));
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    return {
      combat: response,
      map: savedMap,
      message: "기회공격을 하지 않고 이동을 완료했습니다.",
      pendingReaction: null,
    };
  }

  private async resolvePendingOpportunityContinuation(params: {
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
    pending: PendingOpportunityAttackReaction;
    map: VttMapStateDto;
    prefixMessage: string;
  }): Promise<CombatMoveResultDto> {
    const continuation = params.pending.continuation;
    if (!continuation) {
      const response = await this.mapCombat(await this.getActiveCombatEntity(params.session.id));
      return {
        combat: response,
        map: params.map,
        message: params.prefixMessage,
        pendingReaction: null,
      };
    }

    const combat = await this.getActiveCombatEntity(params.session.id);
    const mover = this.findCombatParticipantOrThrow(combat, params.pending.moverParticipantId);
    const target = this.findCombatParticipantOrThrow(combat, continuation.targetParticipantId);
    if (!mover.isAlive || !target.isAlive) {
      const response = await this.completeCombatIfResolved(params.session.id, combat);
      this.realtimeEvents.emitCombatUpdated(params.session.id, response);
      return {
        combat: response,
        map: params.map,
        message: `${params.prefixMessage} / 후속 공격 대상이 없어 턴을 멈췄습니다.`,
        pendingReaction: null,
      };
    }

    const rangeCheck = this.combatMonsterActions.getMonsterActionRangeCheck(params.map, {
      action: continuation.action,
      sourceTokenId: mover.tokenId,
      targetTokenId: continuation.targetTokenId ?? target.tokenId,
    });
    if (!rangeCheck.inRange) {
      if (continuation.autoEndTurn !== false && combat.currentParticipantId === mover.id) {
        await this.advanceCurrentTurn(params.session.id, combat);
      }
      const response = await this.mapCombat(await this.getCombatEntityById(combat.id));
      this.realtimeEvents.emitCombatUpdated(params.session.id, response);
      return {
        combat: response,
        map: params.map,
        message: `${params.prefixMessage} / ${mover.nameSnapshot}의 ${continuation.action.label}: 대상이 사거리 밖입니다.`,
        pendingReaction: null,
      };
    }

    const attackResult = await this.resolveAttack(
      continuation.userId,
      params.session.id,
      {
        attackerParticipantId: mover.id,
        targetParticipantId: target.id,
        attackBonus: continuation.action.attackBonus,
        damageDice: continuation.action.damageDice,
        damageBonus: 0,
      },
      {
        forceDisadvantage: rangeCheck.longRangeDisadvantage,
      },
    );

    let response = attackResult.combat;
    const pendingReactionAfterAttack = await this.combatReactions.hasPendingCombatReaction(params.session.id);
    if (!pendingReactionAfterAttack && continuation.autoEndTurn !== false && attackResult.combat.status === CombatStatus.ACTIVE) {
      const latestCombat = await this.getActiveCombatEntity(params.session.id);
      if (latestCombat.currentParticipantId === mover.id) {
        await this.advanceCurrentTurn(params.session.id, latestCombat);
        response = await this.mapCombat(await this.getCombatEntityById(latestCombat.id));
      }
    }

    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(params.session), params.session.id);
    this.realtimeEvents.emitCombatUpdated(params.session.id, response);
    this.realtimeEvents.emitSessionSnapshot(params.session.id, await this.sessionsService.buildSnapshot(params.session.id));
    return {
      combat: response,
      map,
      message: `${params.prefixMessage} / ${mover.nameSnapshot} ${continuation.action.label}: ${attackResult.message}${
        pendingReactionAfterAttack || continuation.autoEndTurn === false || response.status !== CombatStatus.ACTIVE ? "" : " / 턴 종료"
      }`,
      pendingReaction: attackResult.pendingReaction ?? null,
    };
  }

  private async advanceCurrentTurn(sessionId: string, combat: NonNullable<CombatWithParticipants>): Promise<TurnAdvanceResponseDto> {
    return this.combatTurns.advanceCurrentTurn(this.createCombatTurnRuntime(), sessionId, combat);
  }

  async applyDamage(userId: string, sessionId: string, dto: ApplyCombatDamageDto): Promise<CombatActionResultDto> {
    return this.combatActions.applyDamage(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  async castSpell(userId: string, sessionId: string, dto: CastCombatSpellDto): Promise<CombatActionResultDto> {
    return this.combatActions.castSpell(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  async resolveAttack(
    userId: string,
    sessionId: string,
    dto: ResolveCombatAttackDto,
    options: {
      messagePrefix?: string;
      fixedDamageTotal?: number;
      actionCost?: "action" | "bonus_action" | "reaction" | "none";
      attackAction?: { weaponId?: string | null; weaponIsLightMelee: boolean };
      reactionUserId?: string;
      forceDisadvantage?: boolean;
      sneakAttack?: {
        rogueLevel: number;
        weaponProperties: string[];
        attackKind: "melee_weapon_attack" | "ranged_weapon_attack";
      };
      onHitCondition?: ConditionInstance;
    } = {},
  ): Promise<CombatActionResultDto> {
    return this.combatActions.resolveAttack(this.createCombatActionRuntime(), userId, sessionId, dto, options);
  }

  async resolveEquippedWeaponAttack(userId: string, sessionId: string, dto: EquippedWeaponAttackDto): Promise<CombatActionResultDto> {
    return this.combatActions.resolveEquippedWeaponAttack(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  async resolveSneakAttack(userId: string, sessionId: string, dto: EquippedWeaponAttackDto): Promise<CombatActionResultDto> {
    return this.combatActions.resolveSneakAttack(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  async resolveOffhandWeaponAttack(userId: string, sessionId: string, dto: EquippedWeaponAttackDto): Promise<CombatActionResultDto> {
    return this.combatActions.resolveOffhandWeaponAttack(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  async useSecondWind(userId: string, sessionId: string, dto: CombatBasicActionDto = {}): Promise<CombatActionResultDto> {
    return this.combatActions.useSecondWind(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  async dash(userId: string, sessionId: string, dto: CombatBasicActionDto = {}): Promise<CombatActionResultDto> {
    return this.combatActions.dash(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  async dodge(userId: string, sessionId: string, dto: CombatBasicActionDto = {}): Promise<CombatActionResultDto> {
    return this.combatActions.dodge(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  async hide(userId: string, sessionId: string, dto: CombatBasicActionDto = {}): Promise<CombatActionResultDto> {
    return this.combatActions.hide(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  private async resolveActorDashAction(
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
  ): Promise<CombatActionResultDto> {
    return this.combatActions.resolveActorDashAction(this.createCombatActionRuntime(), userId, session, combat, actor);
  }

  private async resolveActorDodgeAction(
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
  ): Promise<CombatActionResultDto> {
    return this.combatActions.resolveActorDodgeAction(this.createCombatActionRuntime(), userId, session, combat, actor);
  }

  private async resolveActorHideAction(
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
  ): Promise<CombatActionResultDto> {
    return this.combatActions.resolveActorHideAction(this.createCombatActionRuntime(), userId, session, combat, actor);
  }

  async resolveActorAction(userId: string, sessionId: string, dto: CombatActorActionDto = {}): Promise<CombatActionResultDto> {
    return this.combatActions.resolveActorAction(this.createCombatActionRuntime(), userId, sessionId, dto);
  }

  async autoMonsterTurn(userId: string, sessionId: string, dto: AutoMonsterTurnDto = {}): Promise<CombatActionResultDto> {
    return this.combatTurns.autoMonsterTurn(this.createCombatTurnRuntime(), userId, sessionId, dto);
  }

  private async executeAutoMonsterTurn(
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    dto: AutoMonsterTurnDto = {},
  ): Promise<CombatActionResultDto> {
    return this.combatTurns.executeAutoMonsterTurn(this.createCombatTurnRuntime(), userId, session, dto);
  }

  private scheduleServerAutoMonsterTurns(sessionId: string): void {
    this.combatTurns.scheduleServerAutoMonsterTurns(this.createCombatTurnRuntime(), sessionId);
  }

  private isCurrentTurnAutoMonster(combat: NonNullable<CombatWithParticipants>): boolean {
    return this.combatTurns.isCurrentTurnAutoMonster(this.createCombatTurnRuntime(), combat);
  }

  private async resolveMonsterAttackAction(params: {
    userId: string;
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
    combat: NonNullable<CombatWithParticipants>;
    attacker: CombatParticipantEntity;
    target: CombatParticipantEntity;
    action: SrdEngineExecutableMonsterAction;
    map: VttMapStateDto;
    sourceTokenId: string | null;
    targetTokenId: string | null;
    movementDistanceFt?: number;
    actionCost?: "action" | "none";
    autoEndTurn: boolean;
    autoEndTurnWhenOutOfRange: boolean;
  }): Promise<CombatActionResultDto> {
    return this.combatTurns.resolveMonsterAttackAction(this.createCombatTurnRuntime(), params);
  }

  private async applyMonsterActionConditionRiders(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    target: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<MonsterActionConditionRiderApplication> {
    return this.combatTurns.applyMonsterActionConditionRiders(this.createCombatTurnRuntime(), sessionId, combat, target, action);
  }

  private async resolveMonsterActionRiderSave(
    target: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<{
    diceResult: DiceRollResponseDto | null;
    success: boolean;
  } | null> {
    return this.combatTurns.resolveMonsterActionRiderSave(this.createCombatTurnRuntime(), target, action);
  }

  private resolveMonsterActionSaveEnds(action: SrdEngineExecutableMonsterAction): ConditionInstance["saveEnds"] {
    return this.combatTurns.resolveMonsterActionSaveEnds(this.createCombatTurnRuntime(), action);
  }

  private resolveMonsterActionSaveDc(action: SrdEngineExecutableMonsterAction): number | null {
    return this.combatTurns.resolveMonsterActionSaveDc(this.createCombatTurnRuntime(), action);
  }

  private toSavingThrowAbility(value: string | null | undefined): SavingThrowAbility | null {
    return this.combatTurns.toSavingThrowAbility(this.createCombatTurnRuntime(), value);
  }

  private async resolveMonsterSpecialAction(params: {
    userId: string;
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
    combat: NonNullable<CombatWithParticipants>;
    actor: CombatParticipantEntity;
    action: SrdEngineExecutableMonsterAction;
    targetParticipantId?: string | null;
    autoEndTurn: boolean;
  }): Promise<CombatActionResultDto> {
    return this.combatTurns.resolveMonsterSpecialAction(this.createCombatTurnRuntime(), params);
  }

  private async resolveMonsterMultiattackAction(params: {
    userId: string;
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
    combat: NonNullable<CombatWithParticipants>;
    actor: CombatParticipantEntity;
    action: SrdEngineExecutableMonsterAction;
    effectTags: string[];
    targetParticipantId?: string | null;
    autoEndTurn: boolean;
  }): Promise<CombatActionResultDto> {
    return this.combatTurns.resolveMonsterMultiattackAction(this.createCombatTurnRuntime(), params);
  }

  private parseMonsterMultiattackTags(effectTags: string[]): Array<{ actionId: string; count: number }> {
    return this.combatTurns.parseMonsterMultiattackTags(this.createCombatTurnRuntime(), effectTags);
  }

  private mapForcedMovementObstacles(map: VttMapStateDto): Array<{ x: number; y: number }> {
    return [
      ...(map.wallCells ?? []).flatMap((cell) => this.combatMovement.cellGridPoints(map, cell)),
      ...(map.doorCells ?? [])
        .filter((door) => door.state !== "open" && door.state !== "broken")
        .flatMap((cell) => this.combatMovement.cellGridPoints(map, cell)),
    ];
  }

  private mapForcedMovementHazards(map: VttMapStateDto): Array<{ point: { x: number; y: number }; terrainEffectId: string }> {
    return (map.terrainCells ?? []).flatMap((cell) => {
      const terrainEffectId = this.combatMovement.extractTerrainEffectId(cell);
      if (!terrainEffectId) {
        return [];
      }
      return this.combatMovement.cellGridPoints(map, cell).map((point) => ({ point, terrainEffectId }));
    });
  }

  private normalizeForcedMovementMode(value: string): ForcedMovementMode {
    if (value === "push" || value === "pull" || value === "slide") {
      return value;
    }
    throw conflict("COMBAT_409", "지원하지 않는 강제이동 방식입니다.", {
      reason: "INVALID_FORCED_MOVEMENT_MODE",
      mode: value,
    });
  }

  private async applyEnteredTerrainEffects(
    combat: NonNullable<CombatWithParticipants>,
    target: CombatParticipantEntity,
    enteredEffects: EnteredTerrainEffect[],
    trigger: TerrainEffectTrigger,
  ): Promise<CombatTerrainEffectApplication> {
    return this.combatTurns.applyEnteredTerrainEffects(this.createCombatTurnRuntime(), combat, target, enteredEffects, trigger);
  }

  private async applyTurnStartTerrainEffects(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    participant: CombatParticipantEntity,
  ): Promise<CombatTerrainEffectApplication> {
    return this.combatTurns.applyTurnStartTerrainEffects(this.createCombatTurnRuntime(), sessionId, combat, participant);
  }

  private async applyTurnEndTerrainConditionEffects(
    combat: NonNullable<CombatWithParticipants>,
    participant: CombatParticipantEntity,
  ): Promise<CombatTerrainEffectApplication> {
    return this.combatTurns.applyTurnEndTerrainConditionEffects(this.createCombatTurnRuntime(), combat, participant);
  }

  private async applyExitedTerrainEffects(
    participant: CombatParticipantEntity,
    exitedEffects: EnteredTerrainEffect[],
  ): Promise<CombatTerrainEffectApplication> {
    return this.combatTurns.applyExitedTerrainEffects(this.createCombatTurnRuntime(), participant, exitedEffects);
  }

  private async resolveCombatConcentrationDamageCheck(target: CombatParticipantEntity, damageTaken: number): Promise<CombatConcentrationCheckResult | null> {
    const current = await this.combatConditions.readCombatConditionEntries(target);
    const conditions = this.conditionRuntime.parseConditionsJson(JSON.stringify(current));
    if (!conditions.some((condition) => condition.conditionId === "condition.concentration" || condition.tags.includes("concentration"))) {
      return null;
    }

    const profile = await this.resolveParticipantConstitutionSaveProfile(target);
    const diceResult = this.diceService.roll(`1d20${profile.saveModifier >= 0 ? "+" : ""}${profile.saveModifier}`);
    const result = this.concentrationRuntime.resolveDamageCheck({
      conditions,
      damageTaken,
      naturalD20: this.selectNaturalD20(diceResult.rolls, DiceAdvantageState.NORMAL),
      constitutionModifier: profile.constitutionModifier,
      proficiencyBonus: profile.proficiencyBonus,
      proficient: profile.proficient,
    });

    if (!result.concentrationMaintained) {
      await this.combatConditions.writeCombatConditionEntries(target, this.removeExpiredConditionEntries(current, result.removedConditions));
    }

    return {
      diceResult,
      concentrationState: result.concentrationState,
      concentrationMaintained: result.concentrationMaintained,
      removedConditions: result.removedConditions,
    };
  }

  private async resolveParticipantConstitutionSaveProfile(participant: CombatParticipantEntity): Promise<{
    constitutionModifier: number;
    proficiencyBonus: number;
    proficient: boolean;
    saveModifier: number;
  }> {
    if (!participant.sessionCharacterId) {
      return {
        constitutionModifier: 0,
        proficiencyBonus: 0,
        proficient: false,
        saveModifier: 0,
      };
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: participant.sessionCharacterId },
      include: {
        character: {
          select: {
            abilitiesJson: true,
            proficiencyBonus: true,
          },
        },
      },
    });
    const abilities = this.parseJson<Record<string, number>>(sessionCharacter?.character.abilitiesJson ?? "{}", {});
    const constitutionModifier = this.getAbilityModifier(abilities.con ?? abilities.constitution ?? 10);
    const proficiencyBonus = sessionCharacter?.character.proficiencyBonus ?? 0;
    const proficient = this.combatConditions
      .combatConditionTags(await this.combatConditions.readCombatConditionEntries(participant))
      .some((tag) => tag === "save_proficiency:con" || tag === "save:con:proficient");

    return {
      constitutionModifier,
      proficiencyBonus,
      proficient,
      saveModifier: constitutionModifier + (proficient ? proficiencyBonus : 0),
    };
  }

  private async resolveParticipantSavingThrowProfile(
    participant: CombatParticipantEntity,
    ability: SavingThrowAbility,
  ): Promise<{
    abilityModifier: number;
    proficiencyBonus: number;
    proficient: boolean;
    saveModifier: number;
  }> {
    if (!participant.sessionCharacterId) {
      return {
        abilityModifier: 0,
        proficiencyBonus: 0,
        proficient: false,
        saveModifier: 0,
      };
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: participant.sessionCharacterId },
      include: {
        character: {
          select: {
            abilitiesJson: true,
            proficiencyBonus: true,
          },
        },
      },
    });
    const abilities = this.parseJson<Record<string, number>>(sessionCharacter?.character.abilitiesJson ?? "{}", {});
    const abilityModifier = this.getAbilityModifier(abilities[ability] ?? 10);
    const proficiencyBonus = sessionCharacter?.character.proficiencyBonus ?? 0;
    const proficient = this.combatConditions
      .combatConditionTags(await this.combatConditions.readCombatConditionEntries(participant))
      .some((tag) => tag === `save_proficiency:${ability}` || tag === `save:${ability}:proficient`);

    return {
      abilityModifier,
      proficiencyBonus,
      proficient,
      saveModifier: abilityModifier + (proficient ? proficiencyBonus : 0),
    };
  }

  private removeExpiredConditionEntries(current: unknown[], removedConditions: unknown[]): unknown[] {
    const removedKeys = new Set(removedConditions.map((condition) => this.toConditionEntryKey(condition)).filter((key): key is string => key !== null));
    return current.filter((entry) => {
      const key = this.toConditionEntryKey(entry);
      return key === null || !removedKeys.has(key);
    });
  }

  private toConditionEntryKey(entry: unknown): string | null {
    const parsed = this.conditionRuntime.parseConditionsJson(JSON.stringify([entry]))[0];
    return parsed ? this.combatConditions.conditionEntryKey(parsed) : null;
  }

  private async resolveEquippedWeaponProfile(sessionCharacterId: string, slot: "main" | "offhand" = "main"): Promise<EquippedWeaponProfile> {
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: sessionCharacterId },
      include: {
        character: true,
        inventoryEntries: { include: { itemDefinition: true } },
      },
    });
    if (!sessionCharacter) {
      throw notFound("COMBAT_404", "캐릭터 전투 참여자를 찾을 수 없습니다.", {
        reason: "SESSION_CHARACTER_NOT_FOUND",
      });
    }

    const buildBasicAttackProfile = (): EquippedWeaponProfile => {
      const abilities = this.parseJson<Record<string, number>>(sessionCharacter.character.abilitiesJson, {});
      const strMod = this.getAbilityModifier(abilities.str);
      return {
        name: "맨손공격",
        attackBonus: sessionCharacter.character.proficiencyBonus + strMod,
        rangeFt: 5,
        // 룰북 기준: 비무장 공격은 피해 주사위가 아니라 1 + 근력 수정치 고정 피해입니다.
        fixedDamageTotal: 1 + strMod,
        isBasicAttack: true,
      };
    };

    const equippedWeaponId = slot === "offhand" ? sessionCharacter.character.offhandWeaponId : sessionCharacter.character.equippedWeaponId;
    if (!equippedWeaponId) {
      if (slot === "offhand") {
        throw conflict("COMBAT_409", "보조 손에 장착한 무기가 없습니다.", {
          reason: "OFFHAND_WEAPON_NOT_EQUIPPED",
        });
      }
      // 장착 무기가 없어도 전투 턴이 막히지 않도록 5ft 기본 공격으로 내려갑니다.
      return buildBasicAttackProfile();
    }

    const entry = sessionCharacter.inventoryEntries.find((candidate) => candidate.id === equippedWeaponId || candidate.itemDefinitionId === equippedWeaponId);
    const snapshotInventory = !entry
      ? this.parseJsonArray<{
          id?: string;
          itemDefinitionId?: string;
          name?: string;
          quantity?: number;
          itemType?: string;
          damageDice?: string;
          damageType?: string;
          properties?: string[];
        }>(sessionCharacter.inventorySnapshotJson ?? sessionCharacter.character.inventoryJson)
      : [];
    const snapshotItem = snapshotInventory.find((item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId);
    const item = entry
      ? {
          id: entry.id,
          itemDefinitionId: entry.itemDefinitionId,
          name: entry.itemDefinition.name,
          quantity: entry.quantity,
          itemType: entry.itemDefinition.itemType,
          damageDice: entry.itemDefinition.damageDice ?? undefined,
          properties: this.parseStringArray(entry.itemDefinition.propertiesJson),
        }
      : snapshotItem;

    if (!item || (item.itemType !== "weapon" && !item.damageDice)) {
      // 세션 스냅샷과 장착 무기 ID가 어긋난 경우도 플레이를 멈추지 않고 기본 공격으로 복구합니다.
      return buildBasicAttackProfile();
    }

    const fallback = this.getFallbackWeaponProfile([item.itemDefinitionId, item.id, item.name].filter(Boolean).join(" "));
    const properties = new Set([...(item.properties ?? []), ...(fallback.properties ?? [])].map((value) => value.toLowerCase().replace(/[_\s]+/g, "-")));
    const abilities = this.parseJson<Record<string, number>>(sessionCharacter.character.abilitiesJson, {});
    const strMod = this.getAbilityModifier(abilities.str);
    const dexMod = this.getAbilityModifier(abilities.dex);
    const isRanged = properties.has("ranged");
    const isMelee = properties.has("melee") || !isRanged;
    const isFinesse = properties.has("finesse");
    const isTwoHanded = properties.has("two-handed");
    const isLightMeleeWeapon = isMelee && properties.has("light") && !isTwoHanded;
    if (slot === "offhand" && !isLightMeleeWeapon) {
      throw conflict("COMBAT_409", "쌍수 보조 공격은 light 속성의 근접 무기로만 할 수 있습니다.", {
        reason: "INVALID_OFFHAND_WEAPON",
      });
    }
    const abilityMod = isRanged ? dexMod : isFinesse ? Math.max(strMod, dexMod) : strMod;
    const featureTags = this.parseJsonArray<string>(sessionCharacter.character.featuresJson);
    const hasTwoWeaponFighting = featureTags.some((feature) => feature.toLowerCase() === "fighting_style:two_weapon_fighting");

    return {
      weaponId: equippedWeaponId,
      quantity: item.quantity,
      name: item.name ?? fallback.name ?? "무기",
      attackBonus: sessionCharacter.character.proficiencyBonus + abilityMod,
      damageDice: item.damageDice ?? fallback.damageDice ?? "1d6",
      damageBonus: slot === "offhand" && !hasTwoWeaponFighting ? Math.min(0, abilityMod) : abilityMod,
      rangeFt: fallback.rangeFt ?? (isRanged ? 80 : 5),
      properties: Array.from(properties),
      attackKind: isRanged ? "ranged_weapon_attack" : "melee_weapon_attack",
      isLightMeleeWeapon,
    };
  }

  private getFallbackWeaponProfile(key: string): {
    name?: string;
    damageDice?: string;
    rangeFt?: number;
    properties?: string[];
  } {
    const normalized = key.toLowerCase().replace(/_/g, "-");
    const profiles: Record<string, { damageDice: string; rangeFt: number; properties: string[] }> = {
      dagger: {
        damageDice: "1d4",
        rangeFt: 20,
        properties: ["finesse", "light", "thrown"],
      },
      dart: {
        damageDice: "1d4",
        rangeFt: 20,
        properties: ["ranged", "thrown"],
      },
      greataxe: {
        damageDice: "1d12",
        rangeFt: 5,
        properties: ["melee", "heavy", "two-handed"],
      },
      handaxe: {
        damageDice: "1d6",
        rangeFt: 20,
        properties: ["light", "thrown"],
      },
      javelin: { damageDice: "1d6", rangeFt: 30, properties: ["thrown"] },
      "light-crossbow": {
        damageDice: "1d8",
        rangeFt: 80,
        properties: ["ranged", "two-handed"],
      },
      longsword: {
        damageDice: "1d8",
        rangeFt: 5,
        properties: ["melee", "versatile"],
      },
      longbow: {
        damageDice: "1d8",
        rangeFt: 150,
        properties: ["ranged", "two-handed"],
      },
      mace: { damageDice: "1d6", rangeFt: 5, properties: ["melee"] },
      quarterstaff: {
        damageDice: "1d6",
        rangeFt: 5,
        properties: ["melee", "versatile"],
      },
      rapier: {
        damageDice: "1d8",
        rangeFt: 5,
        properties: ["melee", "finesse"],
      },
      scimitar: {
        damageDice: "1d6",
        rangeFt: 5,
        properties: ["melee", "finesse", "light"],
      },
      shortbow: {
        damageDice: "1d6",
        rangeFt: 80,
        properties: ["ranged", "two-handed"],
      },
      shortsword: {
        damageDice: "1d6",
        rangeFt: 5,
        properties: ["melee", "finesse", "light"],
      },
      warhammer: {
        damageDice: "1d8",
        rangeFt: 5,
        properties: ["melee", "versatile"],
      },
    };

    const matchedKey = Object.keys(profiles).find((profileKey) => normalized.includes(profileKey));
    if (matchedKey) return profiles[matchedKey];

    const koreanProfiles: Array<[string, { damageDice: string; rangeFt: number; properties: string[] }]> = [
      ["단검", profiles.dagger],
      ["다트", profiles.dart],
      ["그레이트액스", profiles.greataxe],
      ["핸드액스", profiles.handaxe],
      ["재블린", profiles.javelin],
      ["라이트 크로스보우", profiles["light-crossbow"]],
      ["롱소드", profiles.longsword],
      ["롱보우", profiles.longbow],
      ["메이스", profiles.mace],
      ["쿼터스태프", profiles.quarterstaff],
      ["레이피어", profiles.rapier],
      ["시미터", profiles.scimitar],
      ["쇼트보우", profiles.shortbow],
      ["쇼트소드", profiles.shortsword],
      ["워해머", profiles.warhammer],
    ];
    return koreanProfiles.find(([name]) => key.includes(name))?.[1] ?? {};
  }

  private parseJsonArray<T>(value: string | null | undefined): T[] {
    const parsed = this.parseJson<unknown>(value, []);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }

  private parseStringArray(value: string | null | undefined): string[] {
    return this.parseJsonArray<string>(value).filter((entry): entry is string => typeof entry === "string");
  }

  private async runServerAutoMonsterTurns(sessionId: string): Promise<void> {
    return this.combatTurns.runServerAutoMonsterTurns(this.createCombatTurnRuntime(), sessionId);
  }

  private logAutoMonsterTurn(message: string, data: Record<string, unknown> = {}): void {
    this.combatTurns.logAutoMonsterTurn(this.createCombatTurnRuntime(), message, data);
  }

  private extractErrorMessage(error: unknown): string {
    return this.combatTurns.extractErrorMessage(this.createCombatTurnRuntime(), error);
  }

  private async getActiveCombatEntity(sessionId: string) {
    const combat = await this.prisma.combat.findFirst({
      where: { sessionId, status: PrismaCombatStatus.ACTIVE },
      include: { participants: { orderBy: { turnOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    });

    if (!combat) {
      throw notFound("COMBAT_404", "전투가 존재하지 않습니다.", {
        reason: "ACTIVE_COMBAT_NOT_FOUND",
      });
    }

    return combat;
  }

  private async assertMovementAvailable(
    combat: NonNullable<CombatWithParticipants>,
    mover: CombatParticipantEntity,
    movementDistanceFt: number,
  ): Promise<void> {
    const movementFtTotal = await this.resolveParticipantSpeedFt(mover);
    const turnState = await this.actionEconomy.getOrCreateTurnState({
      combatId: combat.id,
      combatParticipantId: mover.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: mover.sessionCharacterId,
    });
    if (turnState.movementFtSpent + movementDistanceFt > movementFtTotal) {
      throw conflict("COMBAT_409", "이동 가능 거리가 부족합니다.", {
        reason: "NOT_ENOUGH_MOVEMENT",
        movementFtTotal,
        movementFtSpent: turnState.movementFtSpent,
        movementDistanceFt,
      });
    }
  }

  private async commitCombatMove(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    mover: CombatParticipantEntity,
    map: VttMapStateDto,
    movementDistanceFt: number,
  ): Promise<VttMapStateDto> {
    await this.actionEconomy.getOrCreateTurnState({
      combatId: combat.id,
      combatParticipantId: mover.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: mover.sessionCharacterId,
    });
    await this.prisma.combatTurnState.update({
      where: {
        combatId_roundNo_turnNo_combatParticipantId: {
          combatId: combat.id,
          roundNo: combat.roundNo,
          turnNo: combat.turnNo,
          combatParticipantId: mover.id,
        },
      },
      data: { movementFtSpent: { increment: movementDistanceFt } },
    });
    return this.mapRuntimeService.saveSystemVttMap(sessionId, map);
  }

  private async createOpportunityAttackPromptIfNeeded(params: {
    sessionId: string;
    combat: NonNullable<CombatWithParticipants>;
    mover: CombatParticipantEntity;
    moverToken: VttMapStateDto["tokens"][number];
    nextMoverToken: VttMapStateDto["tokens"][number];
    movementPath: Array<{ x: number; y: number }>;
    map: VttMapStateDto;
    nextMap: VttMapStateDto;
    movementDistanceFt: number;
    movementCostFt: number;
    moverUserId: string;
    continuation?: PendingOpportunityAttackContinuation | null;
  }): Promise<OpportunityAttackCheckResult> {
    const reactors = await this.findOpportunityAttackReactors(params);
    const automaticMessages: string[] = [];
    for (const reactor of reactors.filter((candidate) => !candidate.sessionCharacterId)) {
      if (reactor.isHostile) {
        const result = await this.resolveAutomaticOpportunityAttack({
          sessionId: params.sessionId,
          combat: params.combat,
          reactor,
          mover: params.mover,
        });
        automaticMessages.push(result.message);
        const latestCombat = await this.getActiveCombatEntity(params.sessionId);
        const latestMover = this.findCombatParticipantOrThrow(latestCombat, params.mover.id);
        if (!latestMover.isAlive) {
          return { prompt: null, automaticMessages };
        }
      }
    }

    const reactor = reactors.find((candidate) => candidate.sessionCharacterId);
    if (!reactor) {
      return { prompt: null, automaticMessages };
    }
    const reactorSessionCharacterId = reactor.sessionCharacterId;
    if (!reactorSessionCharacterId) {
      return { prompt: null, automaticMessages };
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: reactorSessionCharacterId },
      include: { character: { select: { ownerUserId: true } } },
    });
    const reactorUserId = sessionCharacter?.userId ?? sessionCharacter?.character.ownerUserId;
    if (!reactorUserId) {
      return { prompt: null, automaticMessages };
    }

    const reactionId = `reaction:opportunity:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const pending: PendingOpportunityAttackReaction = {
      id: reactionId,
      type: "opportunity_attack",
      sessionId: params.sessionId,
      combatId: params.combat.id,
      roundNo: params.combat.roundNo,
      turnNo: params.combat.turnNo,
      reactorParticipantId: reactor.id,
      reactorUserId,
      moverParticipantId: params.mover.id,
      movementDistanceFt: params.movementDistanceFt,
      movementCostFt: params.movementCostFt,
      map: params.nextMap,
      createdAt: new Date().toISOString(),
      continuation: params.continuation ?? null,
    };
    await this.combatReactions.storePendingCombatReaction(params.sessionId, pending);

    const prompt: CombatReactionPromptDto = {
      id: reactionId,
      type: "opportunity_attack",
      reactorParticipantId: reactor.id,
      reactorName: reactor.nameSnapshot,
      moverParticipantId: params.mover.id,
      moverName: params.mover.nameSnapshot,
      message: `${params.mover.nameSnapshot}이(가) ${reactor.nameSnapshot}의 근접 범위를 벗어납니다. 기회공격을 할까요?`,
    };
    if (reactorUserId !== params.moverUserId) {
      this.realtimeEvents.emitCombatReactionPrompt(params.sessionId, reactorUserId, prompt);
    }
    return { prompt, automaticMessages };
  }

  private async findOpportunityAttackReactors(params: {
    combat: NonNullable<CombatWithParticipants>;
    mover: CombatParticipantEntity;
    moverToken: VttMapStateDto["tokens"][number];
    nextMoverToken: VttMapStateDto["tokens"][number];
    movementPath: Array<{ x: number; y: number }>;
    map: VttMapStateDto;
  }): Promise<CombatParticipantEntity[]> {
    const moverConditions = this.combatConditions.combatConditionTags(await this.combatConditions.readCombatConditionEntries(params.mover));
    if (moverConditions.includes(COMBAT_CONDITION_DISENGAGE)) {
      return [];
    }
    const reactors: CombatParticipantEntity[] = [];
    for (const candidate of params.combat.participants) {
      if (candidate.id === params.mover.id || !candidate.isAlive || candidate.isHostile === params.mover.isHostile) {
        continue;
      }
      const token = this.combatTargeting.findParticipantToken(params.map, candidate);
      if (!token) {
        continue;
      }
      if (!this.combatMovement.doesMovementLeaveThreatenedArea(params.map, token, params.moverToken, params.movementPath)) {
        continue;
      }
      const turnState = await this.actionEconomy.getOrCreateTurnState({
        combatId: params.combat.id,
        combatParticipantId: candidate.id,
        roundNo: params.combat.roundNo,
        turnNo: params.combat.turnNo,
        sessionCharacterId: candidate.sessionCharacterId,
      });
      if (!turnState.reactionUsed) {
        reactors.push(candidate);
      }
    }
    return reactors;
  }

  private async resolveAutomaticOpportunityAttack(params: {
    sessionId: string;
    combat: NonNullable<CombatWithParticipants>;
    reactor: CombatParticipantEntity;
    mover: CombatParticipantEntity;
  }): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(params.sessionId);
    const weapon = this.resolveMonsterOpportunityWeapon(params.reactor);
    return this.resolveAttack(
      session.hostUserId,
      params.sessionId,
      {
        attackerParticipantId: params.reactor.id,
        targetParticipantId: params.mover.id,
        attackBonus: weapon.attackBonus,
        damageDice: weapon.damageDice,
        damageBonus: weapon.damageBonus,
      },
      {
        messagePrefix: `${params.reactor.nameSnapshot} 기회공격`,
        fixedDamageTotal: weapon.fixedDamageTotal,
        actionCost: "reaction",
        reactionUserId: this.getGmRuntimeUserId(session),
      },
    );
  }

  private async toCombatAoeDamageTarget(
    participant: CombatParticipantEntity,
    map: VttMapStateDto,
    saveAbility: SavingThrowAbility,
    cover?: CoverModifierProduced,
  ): Promise<AoeDamageTarget> {
    const damageTags = this.combatConditions.combatConditionTags(await this.combatConditions.readCombatConditionEntries(participant));
    const coverSaveBonus =
      cover && cover.dexteritySaveBonus > 0
        ? [
            {
              source: `cover:${cover.coverLevel}:dex_save`,
              value: cover.dexteritySaveBonus,
            },
          ]
        : undefined;
    if (!participant.sessionCharacterId) {
      const token = this.combatTargeting.findParticipantToken(map, participant);
      return {
        id: participant.id,
        currentHp: participant.currentHp ?? participant.maxHp ?? DEFAULT_MONSTER_HP,
        abilityModifiers: {
          [saveAbility]: saveAbility === "dex" && token ? this.combatStats.resolveMonsterDexterityModifier(token) : 0,
        },
        bonusModifiers: coverSaveBonus,
        immunities: this.getDamageTypesByPrefix(damageTags, "immunity"),
        resistances: this.getDamageTypesByPrefix(damageTags, "resistance"),
        vulnerabilities: this.getDamageTypesByPrefix(damageTags, "vulnerability"),
      };
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: participant.sessionCharacterId },
      include: {
        character: {
          select: {
            abilitiesJson: true,
            proficiencyBonus: true,
          },
        },
      },
    });
    const abilities = this.parseJson<Record<string, number>>(sessionCharacter?.character.abilitiesJson ?? "{}", {});
    const proficientSaves = damageTags.flatMap((tag) => {
      const ability = tag.startsWith("save_proficiency:") ? tag.slice("save_proficiency:".length) : null;
      return this.isSavingThrowAbility(ability) ? [ability] : [];
    });

    return {
      id: participant.id,
      currentHp: participant.currentHp ?? 0,
      abilityModifiers: {
        [saveAbility]: this.getAbilityModifier(abilities[saveAbility] ?? 10),
      },
      proficiencyBonus: sessionCharacter?.character.proficiencyBonus ?? 0,
      proficientSaves,
      bonusModifiers: coverSaveBonus,
      immunities: this.getDamageTypesByPrefix(damageTags, "immunity"),
      resistances: this.getDamageTypesByPrefix(damageTags, "resistance"),
      vulnerabilities: this.getDamageTypesByPrefix(damageTags, "vulnerability"),
    };
  }

  private getDamageTypesByPrefix(tags: string[], prefix: "immunity" | "resistance" | "vulnerability"): string[] {
    const tokenPrefix = `${prefix}:`;
    return tags
      .map((tag) =>
        tag
          .trim()
          .toLowerCase()
          .replace(/[\s_]+/g, "_"),
      )
      .filter((tag) => tag.startsWith(tokenPrefix))
      .map((tag) => tag.slice(tokenPrefix.length));
  }

  private isSavingThrowAbility(value: unknown): value is SavingThrowAbility {
    return value === "str" || value === "dex" || value === "con" || value === "int" || value === "wis" || value === "cha";
  }

  private async canPromptShieldReaction(sessionId: string, combat: NonNullable<CombatWithParticipants>, target: CombatParticipantEntity): Promise<boolean> {
    if (!target.sessionCharacterId) return false;
    const sessionCharacter = await this.combatSpells.getSessionCharacterForSpell(target.sessionCharacterId);
    try {
      this.combatSpells.assertMvpSpellKnown(sessionCharacter, "spell.shield");
    } catch {
      return false;
    }
    const turnState = await this.actionEconomy.getOrCreateTurnState({
      combatId: combat.id,
      combatParticipantId: target.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: target.sessionCharacterId,
    });
    if (turnState.reactionUsed) return false;
    return (await this.combatSpells.getRemainingSpellSlots(sessionId, target.sessionCharacterId, 1)) > 0;
  }

  private async storePendingShieldReaction(params: {
    sessionId: string;
    combat: NonNullable<CombatWithParticipants>;
    attacker: CombatParticipantEntity;
    target: CombatParticipantEntity;
    attackTotal: number;
    targetArmorClass: number;
    cover: CoverModifierProduced;
    damageDice?: string;
    damageBonus?: number;
  }): Promise<PendingShieldReaction> {
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: params.target.sessionCharacterId ?? "" },
      include: { character: { select: { ownerUserId: true } } },
    });
    const pending: PendingShieldReaction = {
      id: `reaction:shield:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      type: "shield",
      sessionId: params.sessionId,
      combatId: params.combat.id,
      roundNo: params.combat.roundNo,
      turnNo: params.combat.turnNo,
      reactorParticipantId: params.target.id,
      reactorUserId: sessionCharacter?.userId ?? sessionCharacter?.character.ownerUserId ?? "",
      attackerParticipantId: params.attacker.id,
      targetParticipantId: params.target.id,
      attackTotal: params.attackTotal,
      targetArmorClass: params.targetArmorClass,
      cover: params.cover,
      damageDice: params.damageDice,
      damageBonus: params.damageBonus,
      createdAt: new Date().toISOString(),
    };
    if (!pending.reactorUserId) {
      throw conflict("COMBAT_409", "Shield 반응 사용자를 찾을 수 없습니다.", {
        reason: "SHIELD_USER_NOT_FOUND",
      });
    }
    await this.combatReactions.storePendingCombatReaction(params.sessionId, pending);
    return pending;
  }

  private async resolvePendingShieldReaction(
    userId: string,
    sessionId: string,
    pending: PendingShieldReaction,
    accepted: boolean,
  ): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    if (pending.reactorUserId !== userId) await this.ensureHost(userId, sessionId);
    const combat = await this.getActiveCombatEntity(sessionId);
    const attacker = this.findCombatParticipantOrThrow(combat, pending.attackerParticipantId);
    const target = this.findCombatParticipantOrThrow(combat, pending.targetParticipantId);
    if (accepted && target.sessionCharacterId) {
      await this.actionEconomy.spendReaction({
        combatId: combat.id,
        combatParticipantId: target.id,
        roundNo: combat.roundNo,
        turnNo: combat.turnNo,
        sessionCharacterId: target.sessionCharacterId,
      });
      await this.combatSpells.spendSpellSlot(sessionId, target.sessionCharacterId, 1);
    }
    const effectiveAc = pending.targetArmorClass + (accepted ? 5 : 0);
    const hit = pending.attackTotal >= effectiveAc;
    const damageRoll = hit ? this.diceService.roll(this.buildDamageExpression(pending.damageDice, pending.damageBonus, false)) : null;
    const { concentrationCheck } = await this.finalizeCombatDamage(combat, target, damageRoll?.total ?? 0);
    const updated = await this.getActiveCombatEntity(sessionId);
    const response = await this.completeCombatIfResolved(sessionId, updated);
    const message = hit
      ? `${accepted ? "Shield 후에도 " : ""}${attacker.nameSnapshot} 공격 명중: ${target.nameSnapshot}에게 ${damageRoll?.total ?? 0} 피해`
      : `${accepted ? "Shield: " : ""}${attacker.nameSnapshot} 공격 빗나감: ${pending.attackTotal} vs AC ${effectiveAc}`;
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId,
      sessionScenarioId: sessionScenario.id,
      actorUserId: this.getGmRuntimeUserId(session),
      sessionCharacterId: attacker.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "attack",
        shieldAccepted: accepted,
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        concentrationCheck: concentrationCheck
          ? {
              concentrationMaintained: concentrationCheck.concentrationMaintained,
              removedConditions: concentrationCheck.removedConditions,
              concentrationState: concentrationCheck.concentrationState,
            }
          : null,
      },
      diceResult: damageRoll ? { ...damageRoll } : null,
      outcome: hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: message,
    });
    if (concentrationCheck) {
      this.realtimeEvents.emitDiceRolled(sessionId, concentrationCheck.diceResult);
    }
    this.realtimeEvents.emitTurnLogCreated(sessionId, turnLog);
    this.realtimeEvents.emitCombatUpdated(sessionId, response);
    this.realtimeEvents.emitSessionSnapshot(sessionId, await this.sessionsService.buildSnapshot(sessionId));
    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), sessionId);
    return { combat: response, map, message, pendingReaction: null };
  }

  private async resolveTriggeredReadyAction(userId: string, sessionId: string, triggeredId: string, accepted: boolean): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    const triggered = await this.consumeTriggeredReadyAction(sessionId, triggeredId);
    if (triggered.pending.actorUserId !== userId) {
      await this.ensureHost(userId, sessionId);
    }

    const combat = await this.getActiveCombatEntity(sessionId);
    const actor = this.findCombatParticipantOrThrow(combat, triggered.pending.actorParticipantId);
    if (!accepted) {
      const response = await this.mapCombat(combat);
      const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), sessionId);
      this.realtimeEvents.emitCombatUpdated(sessionId, response);
      this.realtimeEvents.emitSessionSnapshot(sessionId, await this.sessionsService.buildSnapshot(sessionId));
      return {
        combat: response,
        map,
        message: `${actor.nameSnapshot}이(가) 준비행동을 취소했습니다.`,
        pendingReaction: null,
      };
    }

    if (triggered.pending.heldAction.type === "attack") {
      const targetParticipantId = triggered.pending.heldAction.targetParticipantId ?? triggered.triggerEvent.targetParticipantId;
      if (!targetParticipantId) {
        throw conflict("COMBAT_409", "준비행동 공격 대상이 없습니다.", {
          reason: "READY_ACTION_TARGET_NOT_FOUND",
        });
      }
      const weapon = actor.sessionCharacterId ? await this.resolveEquippedWeaponProfile(actor.sessionCharacterId) : this.resolveMonsterOpportunityWeapon(actor);
      const attackResult = await this.resolveAttack(
        userId,
        sessionId,
        {
          attackerParticipantId: actor.id,
          targetParticipantId,
          attackBonus: weapon.attackBonus,
          damageDice: weapon.damageDice,
          damageBonus: weapon.damageBonus,
        },
        {
          messagePrefix: `${actor.nameSnapshot} 준비행동`,
          fixedDamageTotal: weapon.fixedDamageTotal,
          actionCost: "reaction",
          reactionUserId: userId,
        },
      );
      const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), sessionId);
      return {
        combat: attackResult.combat,
        map,
        message: attackResult.message,
        pendingReaction: null,
      };
    }

    if (triggered.pending.heldAction.type === "cast_spell") {
      return this.resolveTriggeredReadySpellAction({
        userId,
        session,
        combat,
        actor,
        triggered,
      });
    }

    if (triggered.pending.heldAction.type === "move") {
      return this.resolveTriggeredReadyMoveAction({
        session,
        combat,
        actor,
        triggered,
      });
    }

    if (actor.sessionCharacterId) {
      await this.actionEconomy.spendReaction({
        combatId: combat.id,
        combatParticipantId: actor.id,
        roundNo: combat.roundNo,
        turnNo: combat.turnNo,
        sessionCharacterId: actor.sessionCharacterId,
      });
    }
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const message = triggered.pending.heldAction.description?.trim() || `${actor.nameSnapshot}이(가) 준비행동을 실행했습니다.`;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId,
      sessionScenarioId: sessionScenario.id,
      actorUserId: triggered.pending.actorUserId,
      sessionCharacterId: actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "ready_action_execute",
        readyActionId: triggered.pending.id,
        heldAction: triggered.pending.heldAction,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    const response = await this.mapCombat(await this.getActiveCombatEntity(sessionId));
    this.realtimeEvents.emitTurnLogCreated(sessionId, turnLog);
    this.realtimeEvents.emitCombatUpdated(sessionId, response);
    this.realtimeEvents.emitSessionSnapshot(sessionId, await this.sessionsService.buildSnapshot(sessionId));
    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), sessionId);
    return { combat: response, map, message, pendingReaction: null };
  }

  private async resolveTriggeredReadyMoveAction(params: {
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
    combat: NonNullable<CombatWithParticipants>;
    actor: CombatParticipantEntity;
    triggered: TriggeredReadyAction;
  }): Promise<CombatMoveResultDto> {
    if (!params.actor.sessionCharacterId) {
      throw conflict("COMBAT_409", "몬스터 준비 이동은 아직 지원하지 않습니다.", {
        reason: "READY_MONSTER_MOVE_UNSUPPORTED",
      });
    }
    const targetPoint = params.triggered.pending.heldAction.targetPoint;
    if (!targetPoint) {
      throw conflict("COMBAT_409", "준비 이동 목적지가 없습니다.", {
        reason: "READY_MOVE_TARGET_POINT_REQUIRED",
      });
    }

    const map = await this.sessionsService.getVttMapForUser(params.session.hostUserId, params.session.id);
    const actorToken = this.combatTargeting.findParticipantToken(map, params.actor);
    if (!actorToken) {
      throw conflict("COMBAT_409", "준비 이동 토큰을 찾을 수 없습니다.", {
        reason: "READY_MOVE_TOKEN_NOT_FOUND",
      });
    }

    const movementResult = await this.resolveCombatMovement({
      session: params.session,
      userId: params.triggered.pending.actorUserId,
      combat: params.combat,
      mover: params.actor,
      map,
      moverToken: actorToken,
      to: targetPoint,
      path: params.triggered.pending.heldAction.path ?? null,
      movementMode: "normal",
      reactionCost: {
        sessionCharacterId: params.actor.sessionCharacterId,
      },
    });

    if (!movementResult.pendingReaction) {
      const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(params.session.id);
      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: params.session.id,
        sessionScenarioId: sessionScenario.id,
        actorUserId: params.triggered.pending.actorUserId,
        sessionCharacterId: params.actor.sessionCharacterId,
        rawInput: null,
        structuredAction: {
          type: "ready_action_execute",
          readyActionId: params.triggered.pending.id,
          heldAction: params.triggered.pending.heldAction,
          movementDistanceFt: movementResult.movementDistanceFt,
          movementCostFt: movementResult.movementCostFt,
        },
        diceResult: null,
        outcome: ActionOutcome.SUCCESS,
        narration: movementResult.message,
      });
      this.realtimeEvents.emitTurnLogCreated(params.session.id, turnLog);
    }

    return movementResult;
  }

  private async resolveTriggeredReadySpellAction(params: {
    userId: string;
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
    combat: NonNullable<CombatWithParticipants>;
    actor: CombatParticipantEntity;
    triggered: TriggeredReadyAction;
  }): Promise<CombatMoveResultDto> {
    if (!params.actor.sessionCharacterId) {
      throw conflict("COMBAT_409", "몬스터 준비 주문은 아직 지원하지 않습니다.", {
        reason: "READY_MONSTER_SPELL_UNSUPPORTED",
      });
    }

    const spellId = this.combatSpells.normalizeSpellId(params.triggered.pending.heldAction.spellId ?? "");
    this.combatSpells.assertMvpSpellKnown(await this.combatSpells.getSessionCharacterForSpell(params.actor.sessionCharacterId), spellId);

    if (spellId === "spell.magic_missile") {
      return this.resolveTriggeredReadyMagicMissileAction({
        userId: params.userId,
        session: params.session,
        combat: params.combat,
        actor: params.actor,
        triggered: params.triggered,
      });
    }

    if (spellId !== "spell.fire_bolt") {
      throw conflict("COMBAT_409", "지원하지 않는 준비행동 주문입니다.", {
        reason: "READY_SPELL_UNSUPPORTED",
        spellId,
      });
    }

    const targetParticipantId = params.triggered.pending.heldAction.targetParticipantId ?? params.triggered.triggerEvent.targetParticipantId;
    if (!targetParticipantId) {
      throw conflict("COMBAT_409", "준비 주문 대상이 없습니다.", {
        reason: "READY_SPELL_TARGET_NOT_FOUND",
      });
    }

    const map = await this.sessionsService.getVttMapForUser(params.session.hostUserId, params.session.id);
    const casterToken = this.combatTargeting.findParticipantToken(map, params.actor);
    if (!casterToken) {
      throw conflict("COMBAT_409", "준비 주문 시전자 토큰을 찾을 수 없습니다.", {
        reason: "READY_SPELL_CASTER_TOKEN_NOT_FOUND",
      });
    }
    const target = this.findCombatParticipantOrThrow(params.combat, targetParticipantId);
    this.combatTargeting.assertSpellTargetInRange(
      map,
      casterToken,
      target,
      this.combatSpells.resolveCombatSpellRangeFt(this.combatSpells.resolveCombatSpellDefinition(spellId), 120),
    );

    const attackResult = await this.resolveAttack(
      params.userId,
      params.session.id,
      {
        attackerParticipantId: params.actor.id,
        targetParticipantId: target.id,
        attackBonus: await this.combatSpells.resolveSpellAttackBonus(params.actor.sessionCharacterId),
        damageDice: this.combatSpells.resolveCantripDamageDice("1d10", await this.combatSpells.resolveCharacterLevel(params.actor.sessionCharacterId)),
        damageBonus: 0,
      },
      {
        messagePrefix: `${params.actor.nameSnapshot} 준비 주문 Fire Bolt`,
        actionCost: "reaction",
        reactionUserId: params.userId,
      },
    );
    const latestMap = await this.sessionsService.getVttMapForUser(params.session.hostUserId, params.session.id);
    return {
      combat: attackResult.combat,
      map: latestMap,
      message: attackResult.message,
      pendingReaction: attackResult.pendingReaction ?? null,
    };
  }

  private async resolveTriggeredReadyMagicMissileAction(params: {
    userId: string;
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
    combat: NonNullable<CombatWithParticipants>;
    actor: CombatParticipantEntity;
    triggered: TriggeredReadyAction;
  }): Promise<CombatMoveResultDto> {
    if (!params.actor.sessionCharacterId) {
      throw conflict("COMBAT_409", "몬스터 준비 주문은 아직 지원하지 않습니다.", {
        reason: "READY_MONSTER_SPELL_UNSUPPORTED",
      });
    }

    const targetParticipantId = params.triggered.pending.heldAction.targetParticipantId ?? params.triggered.triggerEvent.targetParticipantId;
    if (!targetParticipantId) {
      throw conflict("COMBAT_409", "준비 주문 대상이 없습니다.", {
        reason: "READY_SPELL_TARGET_NOT_FOUND",
      });
    }

    const map = await this.sessionsService.getVttMapForUser(params.session.hostUserId, params.session.id);
    const casterToken = this.combatTargeting.findParticipantToken(map, params.actor);
    if (!casterToken) {
      throw conflict("COMBAT_409", "준비 주문 시전자 토큰을 찾을 수 없습니다.", {
        reason: "READY_SPELL_CASTER_TOKEN_NOT_FOUND",
      });
    }
    const target = this.findCombatParticipantOrThrow(params.combat, targetParticipantId);
    this.combatTargeting.assertSpellTargetInRange(
      map,
      casterToken,
      target,
      this.combatSpells.resolveCombatSpellRangeFt(this.combatSpells.resolveCombatSpellDefinition("spell.magic_missile"), 120),
    );
    this.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);

    await this.actionEconomy.spendReaction({
      combatId: params.combat.id,
      combatParticipantId: params.actor.id,
      roundNo: params.combat.roundNo,
      turnNo: params.combat.turnNo,
      sessionCharacterId: params.actor.sessionCharacterId,
    });
    await this.combatSpells.spendSpellSlot(params.session.id, params.actor.sessionCharacterId, 1);

    const damageRoll = this.diceService.roll(
      this.combatSpells.resolveCombatSpellBaseDamageDice(this.combatSpells.resolveCombatSpellDefinition("spell.magic_missile")) ?? "3d4+3",
    );
    const { concentrationCheck } = await this.finalizeCombatDamage(params.combat, target, damageRoll.total);
    const updated = await this.getActiveCombatEntity(params.session.id);
    const response = await this.completeCombatIfResolved(params.session.id, updated);
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(params.session.id);
    const message = `${params.actor.nameSnapshot} 준비 주문 Magic Missile: ${target.nameSnapshot} ${damageRoll.total} 역장 피해`;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: params.triggered.pending.actorUserId,
      sessionCharacterId: params.actor.sessionCharacterId,
      rawInput: null,
      structuredAction: {
        type: "ready_action_execute",
        readyActionId: params.triggered.pending.id,
        heldAction: params.triggered.pending.heldAction,
        spellId: "spell.magic_missile",
        targetParticipantId: target.id,
        damageTotal: damageRoll.total,
        concentrationCheck: concentrationCheck
          ? {
              concentrationMaintained: concentrationCheck.concentrationMaintained,
              removedConditions: concentrationCheck.removedConditions,
              concentrationState: concentrationCheck.concentrationState,
            }
          : null,
      },
      diceResult: { ...damageRoll },
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });

    this.realtimeEvents.emitDiceRolled(params.session.id, damageRoll);
    if (concentrationCheck) {
      this.realtimeEvents.emitDiceRolled(params.session.id, concentrationCheck.diceResult);
    }
    this.realtimeEvents.emitTurnLogCreated(params.session.id, turnLog);
    this.realtimeEvents.emitCombatUpdated(params.session.id, response);
    this.realtimeEvents.emitSessionSnapshot(params.session.id, await this.sessionsService.buildSnapshot(params.session.id));

    return {
      combat: response,
      map,
      message,
      pendingReaction: null,
    };
  }

  private resolveMonsterOpportunityWeapon(participant: CombatParticipantEntity): EquippedWeaponProfile {
    return {
      name: "기회공격",
      attackBonus: 3,
      damageDice: "1d6",
      damageBonus: 1,
      rangeFt: 5,
      isBasicAttack: true,
    };
  }

  private async consumeTriggeredReadyAction(sessionId: string, reactionId: string): Promise<TriggeredReadyAction> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const triggeredActions = this.parseTriggeredReadyActions(flags[TRIGGERED_READY_ACTIONS_FLAG]);
    const triggered = triggeredActions.find((candidate) => candidate.id === reactionId) ?? null;
    if (!triggered) {
      throw notFound("COMBAT_404", "처리할 준비행동 요청을 찾을 수 없습니다.", {
        reason: "TRIGGERED_READY_ACTION_NOT_FOUND",
      });
    }

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [TRIGGERED_READY_ACTIONS_FLAG]: triggeredActions.filter((candidate) => candidate.id !== reactionId),
        }),
      },
    });
    return triggered;
  }

  private async getCombatEntityById(combatId: string) {
    return this.prisma.combat.findUniqueOrThrow({
      where: { id: combatId },
      include: { participants: { orderBy: { turnOrder: "asc" } } },
    });
  }

  private async completeCombatIfResolved(sessionId: string, combat: NonNullable<CombatWithParticipants>): Promise<CombatResponseDto> {
    if (!this.isCombatResolved(combat)) {
      return this.mapCombat(combat);
    }

    return this.completeCombat(sessionId, combat.id);
  }

  private async completeCombat(sessionId: string, combatId: string): Promise<CombatResponseDto> {
    const combat = await this.getCombatEntityById(combatId);
    await this.combatMonsterResources.clearCombatBoundMonsterLimitedUses(sessionId);
    if (this.isPartyDefeated(combat)) {
      await this.sessionsService.completeSessionAfterPartyDefeat(sessionId, combatId);
      return this.mapCombat(await this.getCombatEntityById(combatId));
    }

    await this.sessionsService.completeActiveCombatState(sessionId, combatId);
    return this.mapCombat(await this.getCombatEntityById(combatId));
  }

  private isPartyDefeated(combat: NonNullable<CombatWithParticipants>): boolean {
    return combat.participants.filter((participant) => !participant.isHostile && participant.isAlive).length === 0;
  }

  private isCombatResolved(combat: NonNullable<CombatWithParticipants>): boolean {
    const aliveHostileCount = combat.participants.filter((participant) => participant.isHostile && participant.isAlive).length;
    const alivePlayerCount = combat.participants.filter((participant) => !participant.isHostile && participant.isAlive).length;

    return aliveHostileCount === 0 || alivePlayerCount === 0;
  }

  private async ensureHost(userId: string, sessionId: string): Promise<void> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId,
        },
      },
    });

    if (participant?.role !== PrismaParticipantRole.HOST && participant?.role !== PrismaParticipantRole.GM) {
      throw forbidden("GM_403", "GM 권한이 필요합니다.", {
        reason: "GM_OR_HOST_REQUIRED",
      });
    }
  }

  private getGmRuntimeUserId(session: { hostUserId: string; gmMode?: PrismaGmMode; gmUserId?: string | null }): string {
    return session.gmMode === PrismaGmMode.HUMAN ? (session.gmUserId ?? session.hostUserId) : session.hostUserId;
  }

  private async lockSessionRuntime(tx: unknown, sessionId: string): Promise<void> {
    const client = tx as {
      $executeRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
    };
    if (!client.$executeRaw) {
      return;
    }
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;
  }

  private async ensureActorCanAct(
    userId: string,
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    attacker: CombatParticipantEntity,
  ): Promise<void> {
    const isCurrentTurn = combat.currentParticipantId === attacker.id;
    if (!isCurrentTurn) {
      await this.ensureHost(userId, sessionId);
      return;
    }

    if (this.combatConditions.isCombatParticipantIncapacitated(attacker)) {
      throw conflict("COMBAT_409", "행동할 수 없는 상태입니다.", {
        reason: "COMBATANT_INCAPACITATED",
        conditions: this.parseConditions(attacker.conditionsJson ?? "[]"),
      });
    }

    if (!attacker.sessionCharacterId) {
      await this.ensureHost(userId, sessionId);
      return;
    }

    const actor = await this.prisma.sessionCharacter.findUnique({
      where: { id: attacker.sessionCharacterId },
      include: { character: { select: { ownerUserId: true } } },
    });
    if (actor?.userId !== userId && actor?.character.ownerUserId !== userId) {
      await this.ensureHost(userId, sessionId);
    }
  }

  private async ensureReactionActorCanAct(userId: string, sessionId: string, reactor: CombatParticipantEntity): Promise<void> {
    if (!reactor.sessionCharacterId) {
      return;
    }

    const actor = await this.prisma.sessionCharacter.findUnique({
      where: { id: reactor.sessionCharacterId },
      include: { character: { select: { ownerUserId: true } } },
    });
    if (actor?.userId !== userId && actor?.character.ownerUserId !== userId) {
      await this.ensureHost(userId, sessionId);
    }
  }

  private findCombatParticipantOrThrow(combat: NonNullable<CombatWithParticipants>, participantId: string): CombatParticipantEntity {
    const participant = combat.participants.find((candidate) => candidate.id === participantId);
    if (!participant) {
      throw notFound("COMBAT_404", "전투 참여자를 찾을 수 없습니다.", {
        reason: "COMBAT_PARTICIPANT_NOT_FOUND",
        participantId,
      });
    }
    return participant;
  }

  private async finalizeCombatDamage(
    combat: NonNullable<CombatWithParticipants>,
    target: CombatParticipantEntity,
    damage: number,
  ): Promise<{
    damageApplied: number;
    concentrationCheck: CombatConcentrationCheckResult | null;
  }> {
    const damageApplied = Number.isFinite(damage) ? Math.max(0, Math.floor(damage)) : 0;
    if (damageApplied === 0) {
      return { damageApplied, concentrationCheck: null };
    }

    await this.applyHitPointDelta(combat, target, -damageApplied);
    const concentrationCheck = await this.resolveCombatConcentrationDamageCheck(target, damageApplied);
    return { damageApplied, concentrationCheck };
  }

  private async applyHitPointDelta(combat: NonNullable<CombatWithParticipants>, participant: CombatParticipantEntity, delta: number): Promise<void> {
    if (participant.sessionCharacterId) {
      const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
        where: { id: participant.sessionCharacterId },
        include: { character: { select: { maxHp: true } } },
      });
      if (!sessionCharacter) {
        throw notFound("COMBAT_404", "캐릭터 전투 참여자를 찾을 수 없습니다.", {
          reason: "SESSION_CHARACTER_NOT_FOUND",
        });
      }
      const nextHp = this.clampNumber(sessionCharacter.currentHp + delta, 0, sessionCharacter.character.maxHp);
      await this.prisma.$transaction([
        this.prisma.sessionCharacter.update({
          where: { id: sessionCharacter.id },
          data: { currentHp: nextHp },
        }),
        this.prisma.combatParticipant.update({
          where: { id: participant.id },
          data: { currentHp: nextHp, isAlive: nextHp > 0 },
        }),
      ]);
      if (nextHp <= 0) {
        if (participant.tokenId) {
          await this.sessionsService.hideVttToken(combat.sessionId, participant.tokenId);
        } else {
          await this.sessionsService.hideVttTokenForSessionCharacter(combat.sessionId, sessionCharacter.id);
        }
      }
      participant.currentHp = nextHp;
      participant.isAlive = nextHp > 0;
      if (delta < 0 && nextHp > 0) {
        await this.combatConditions.wakeSleepingCombatParticipant(participant);
      }
      return;
    }

    const maxHp = participant.maxHp ?? DEFAULT_MONSTER_HP;
    const currentHp = participant.currentHp ?? maxHp;
    const nextHp = this.clampNumber(currentHp + delta, 0, maxHp);
    await this.prisma.combatParticipant.update({
      where: { id: participant.id },
      data: { currentHp: nextHp, isAlive: nextHp > 0 },
    });
    participant.currentHp = nextHp;
    participant.isAlive = nextHp > 0;
    if (delta < 0 && nextHp > 0) {
      await this.combatConditions.wakeSleepingCombatParticipant(participant);
    }
    if (nextHp <= 0 && participant.tokenId) {
      await this.sessionsService.hideVttToken(combat.sessionId, participant.tokenId);
    }
  }

  private resolveAttackAdvantageState(params: {
    attackerConditions: string[];
    targetConditions: string[];
    targetHeavilyObscured?: boolean;
    allyWithin5FtOfTarget: boolean;
    forceDisadvantage?: boolean;
  }): DiceAdvantageState {
    const hasAdvantage =
      params.attackerConditions.includes(COMBAT_CONDITION_HIDDEN) ||
      params.targetConditions.some((condition) => COMBAT_INCAPACITATING_CONDITION_TAGS.has(condition)) ||
      params.allyWithin5FtOfTarget;
    const hasDisadvantage =
      params.targetConditions.includes(COMBAT_CONDITION_DODGE) || params.targetHeavilyObscured === true || params.forceDisadvantage === true;
    if (hasAdvantage === hasDisadvantage) {
      return DiceAdvantageState.NORMAL;
    }
    return hasAdvantage ? DiceAdvantageState.ADVANTAGE : DiceAdvantageState.DISADVANTAGE;
  }

  private hasAllyWithinFeetOfTarget(
    map: VttMapStateDto,
    combat: CombatWithParticipants,
    attacker: CombatParticipantEntity,
    target: CombatParticipantEntity,
    feet: number,
  ): boolean {
    const attackerToken = this.combatTargeting.findParticipantToken(map, attacker);
    const targetToken = this.combatTargeting.findParticipantToken(map, target);
    if (!attackerToken || !targetToken || attacker.isHostile === target.isHostile) {
      return false;
    }

    return combat.participants.some((participant) => {
      if (participant.id === attacker.id || participant.id === target.id || !participant.isAlive || participant.isHostile !== attacker.isHostile) {
        return false;
      }

      const allyToken = this.combatTargeting.findParticipantToken(map, participant);
      return Boolean(allyToken && this.combatMovement.getTokenGridDistanceFt(map, allyToken, targetToken) <= feet);
    });
  }

  private isSneakAttackWeaponProfile(weapon: EquippedWeaponProfile): boolean {
    const properties = new Set((weapon.properties ?? []).map((property) => property.toLowerCase().replace(/[_\s]+/g, "-")));
    return weapon.attackKind === "ranged_weapon_attack" || properties.has("ranged") || properties.has("finesse");
  }

  private selectNaturalD20(rolls: number[], advantageState: DiceAdvantageState): number {
    if (advantageState === DiceAdvantageState.ADVANTAGE) {
      return Math.max(...rolls);
    }
    if (advantageState === DiceAdvantageState.DISADVANTAGE) {
      return Math.min(...rolls);
    }
    return rolls[0] ?? 0;
  }

  private async resolveParticipantSpeedFt(participant: CombatParticipantEntity): Promise<number> {
    if (!participant.sessionCharacterId) {
      return this.applyMovementSpeedPenalties(participant.speedFt ?? 30, participant.conditionsJson ?? "[]");
    }
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: participant.sessionCharacterId },
      select: {
        conditionsJson: true,
        character: { select: { speed: true } },
      },
    });
    return this.applyMovementSpeedPenalties(
      sessionCharacter?.character.speed ?? participant.speedFt ?? 30,
      sessionCharacter?.conditionsJson ?? participant.conditionsJson ?? "[]",
    );
  }

  private rollInitiative(dexterityModifier: number, autoRollInitiative: boolean | undefined): number {
    const baseRoll = autoRollInitiative === false ? 10 : this.diceService.roll("1d20").total;
    return baseRoll + dexterityModifier;
  }

  private applyMovementSpeedPenalties(baseSpeedFt: number, conditionsJson: string): number {
    const penaltyFt = this.parseConditions(conditionsJson)
      .filter((tag) => tag.startsWith("movement_speed_penalty:"))
      .map((tag) => Number(tag.slice("movement_speed_penalty:".length)))
      .filter((value) => Number.isFinite(value) && value > 0)
      .reduce((total, value) => total + value, 0);
    return Math.max(0, baseSpeedFt - penaltyFt);
  }

  private async resolveStealthModifier(participant: CombatParticipantEntity): Promise<number> {
    if (!participant.sessionCharacterId) {
      return this.getAbilityModifier(10);
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: participant.sessionCharacterId },
      include: {
        character: {
          select: {
            abilitiesJson: true,
            proficiencyBonus: true,
            proficientSkillsJson: true,
          },
        },
      },
    });
    const character = sessionCharacter?.character;
    if (!character) {
      return 0;
    }

    const abilities = this.parseJson<Record<string, number>>(character.abilitiesJson, {});
    const proficientSkills = this.parseJson<string[]>(character.proficientSkillsJson, []).map((skill) => skill.trim().toLowerCase());
    const dexterityModifier = this.getAbilityModifier(abilities.dex ?? abilities.dexterity ?? abilities.dexterityScore);
    const isStealthProficient = proficientSkills.some((skill) => ["stealth", "dexterity_stealth", "은신"].includes(skill));
    return dexterityModifier + (isStealthProficient ? character.proficiencyBonus : 0);
  }

  private buildDamageExpression(damageDice: string | null | undefined, damageBonus: number | null | undefined, criticalHit: boolean): string {
    const base = damageDice?.trim() || "1d6";
    const doubled = criticalHit ? base.replace(/^(\d+)d(\d+)/i, (_match, count: string, sides: string) => `${Number(count) * 2}d${sides}`) : base;
    const bonus = Math.floor(damageBonus ?? 0);
    if (!bonus) {
      return doubled;
    }
    return `${doubled}${bonus >= 0 ? "+" : ""}${bonus}`;
  }

  private resolveParticipantArmorClass(participant: CombatParticipantEntity): number {
    return participant.armorClass ?? DEFAULT_MONSTER_AC;
  }

  private isParticipantInHeavilyObscuredTerrain(map: VttMapStateDto, participant: CombatParticipantEntity): boolean {
    const token = this.combatTargeting.findParticipantToken(map, participant);
    if (!token) {
      return false;
    }
    return this.combatMovement.resolveTerrainEffectsAtPoint(map, { x: token.x, y: token.y }).some((entered) => entered.effect.heavilyObscured);
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

  private getAbilityModifier(score: number | null | undefined): number {
    return Math.floor(((score ?? 10) - 10) / 2);
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  private async endExpiredRagesForCombat(combat: NonNullable<CombatWithParticipants>): Promise<number> {
    const sessionCharacterIds = combat.participants.map((participant) => participant.sessionCharacterId).filter((id): id is string => Boolean(id));

    if (!sessionCharacterIds.length) {
      return 0;
    }

    const resources = await this.prisma.sessionCharacterResource.findMany({
      where: {
        sessionCharacterId: { in: sessionCharacterIds },
        rageActive: true,
      },
    });
    const expiredResources = resources.filter((resource) => this.isRageExpired(resource, combat.roundNo, combat.turnNo));

    for (const resource of expiredResources) {
      await this.characterResources.endRage(resource.sessionCharacterId);
      await this.removeRageConditionTags(resource.sessionCharacterId);
    }

    return expiredResources.length;
  }

  private async expireReadyActionsForTurn(sessionId: string, combat: NonNullable<CombatWithParticipants>): Promise<number> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const pendingActions = this.parsePendingReadyActions(flags[PENDING_READY_ACTIONS_FLAG]);
    if (pendingActions.length === 0) {
      return 0;
    }

    const resolution = this.readyActions.resolvePendingActions(pendingActions, {
      type: "manual",
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
    });
    if (resolution.expired.length === 0) {
      return 0;
    }

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [PENDING_READY_ACTIONS_FLAG]: [...resolution.triggered.map((entry) => entry.pending), ...resolution.remaining],
        }),
      },
    });
    return resolution.expired.length;
  }

  private async resolveReadyActionsForMovement(params: {
    sessionId: string;
    combat: NonNullable<CombatWithParticipants>;
    mover: CombatParticipantEntity;
    map: VttMapStateDto;
    nextMoverToken: VttMapToken;
  }): Promise<ReadyActionMovementResult> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(params.sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const pendingActions = this.parsePendingReadyActions(flags[PENDING_READY_ACTIONS_FLAG]);
    if (pendingActions.length === 0) {
      return { count: 0, prompts: [] };
    }

    const triggered = [];
    const prompts: CombatReactionPromptDto[] = [];
    const remaining: PendingReadyAction[] = [];
    for (const pending of pendingActions) {
      if (pending.actorParticipantId === params.mover.id) {
        remaining.push(pending);
        continue;
      }

      const actor = params.combat.participants.find((participant) => participant.id === pending.actorParticipantId);
      const actorToken = actor ? this.combatTargeting.findParticipantToken(params.map, actor) : null;
      if (!actor || !actorToken) {
        remaining.push(pending);
        continue;
      }

      const event = {
        type: "creature_enters_range" as const,
        targetParticipantId: params.mover.id,
        distanceFt: this.combatMovement.getTokenGridDistanceFt(params.map, actorToken, params.nextMoverToken),
        roundNo: params.combat.roundNo,
        turnNo: params.combat.turnNo,
        tags: [params.mover.isHostile === actor.isHostile ? "ally" : "enemy"],
      };
      const resolution = this.readyActions.resolveTrigger(pending, event);
      if (resolution.expired) {
        remaining.push(pending);
        continue;
      }
      if (resolution.triggered) {
        const triggeredReadyAction = this.readyActions.createTriggeredReadyAction(pending, event);
        triggered.push(triggeredReadyAction);
        const actorName = actor.nameSnapshot || "준비행동 사용자";
        const prompt: CombatReactionPromptDto = {
          id: triggeredReadyAction.id,
          type: "ready_action",
          reactorParticipantId: pending.actorParticipantId,
          reactorName: actorName,
          moverParticipantId: params.mover.id,
          moverName: params.mover.nameSnapshot,
          message: `${actorName}의 준비행동 조건이 충족되었습니다. 실행할까요?`,
        };
        prompts.push(prompt);
        this.realtimeEvents.emitCombatReactionPrompt(params.sessionId, pending.actorUserId, prompt);
        continue;
      }
      remaining.push(pending);
    }

    if (triggered.length === 0) {
      return { count: 0, prompts: [] };
    }

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [PENDING_READY_ACTIONS_FLAG]: remaining,
          [TRIGGERED_READY_ACTIONS_FLAG]: [...(Array.isArray(flags[TRIGGERED_READY_ACTIONS_FLAG]) ? flags[TRIGGERED_READY_ACTIONS_FLAG] : []), ...triggered],
        }),
      },
    });
    if (triggered.length > 0) {
      this.realtimeEvents.emitSystemMessage(params.sessionId, "READY_ACTION_TRIGGERED", `준비행동 ${triggered.length}개가 발동 대기 중입니다.`);
    }
    return { count: triggered.length, prompts };
  }

  private parsePendingReadyActions(value: unknown): PendingReadyAction[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((candidate): candidate is PendingReadyAction => {
      if (!candidate || typeof candidate !== "object") {
        return false;
      }
      const pending = candidate as Partial<PendingReadyAction>;
      return (
        typeof pending.id === "string" &&
        pending.type === "ready_action" &&
        typeof pending.actorParticipantId === "string" &&
        typeof pending.actorUserId === "string" &&
        typeof pending.combatId === "string" &&
        typeof pending.roundNo === "number" &&
        typeof pending.turnNo === "number" &&
        typeof pending.expiresAtRound === "number" &&
        typeof pending.expiresAtTurn === "number" &&
        Boolean(pending.trigger) &&
        Boolean(pending.heldAction)
      );
    });
  }

  private parseTriggeredReadyActions(value: unknown): TriggeredReadyAction[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((candidate): candidate is TriggeredReadyAction => {
      if (!candidate || typeof candidate !== "object") {
        return false;
      }
      const triggered = candidate as Partial<TriggeredReadyAction>;
      return (
        typeof triggered.id === "string" &&
        triggered.type === "triggered_ready_action" &&
        triggered.status === "pending_response" &&
        typeof triggered.triggeredAtRound === "number" &&
        typeof triggered.triggeredAtTurn === "number" &&
        Boolean(triggered.pending) &&
        Boolean(triggered.triggerEvent)
      );
    });
  }

  private isRageExpired(
    resource: {
      rageEndsAtRound: number | null;
      rageEndsAtTurn: number | null;
    },
    roundNo: number,
    turnNo: number,
  ): boolean {
    if (resource.rageEndsAtRound === null) {
      return false;
    }

    if (roundNo > resource.rageEndsAtRound) {
      return true;
    }

    return roundNo === resource.rageEndsAtRound && (resource.rageEndsAtTurn === null || turnNo >= resource.rageEndsAtTurn);
  }

  private async removeRageConditionTags(sessionCharacterId: string): Promise<void> {
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: sessionCharacterId },
      select: { conditionsJson: true },
    });
    if (!sessionCharacter) {
      return;
    }

    const currentConditions = this.parseConditions(sessionCharacter.conditionsJson);
    const removedTags = new Set(RAGE_CONDITION_TAGS);
    const nextConditions = currentConditions.filter((condition) => !removedTags.has(condition.trim().toLowerCase()));

    if (nextConditions.length === currentConditions.length) {
      return;
    }

    // Rage가 끝난 뒤에도 resistance 태그가 남으면 피해 감소가 계속 적용되므로 함께 정리한다.
    await this.prisma.sessionCharacter.update({
      where: { id: sessionCharacterId },
      data: { conditionsJson: JSON.stringify(nextConditions) },
    });
  }

  private parseConditions(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? this.combatConditions.combatConditionTags(parsed) : [];
    } catch {
      return [];
    }
  }

  private getCurrentPlayerParticipantOrThrow(combat: NonNullable<CombatWithParticipants>): CombatParticipantEntity {
    const actor = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    if (!actor || actor.isHostile || !actor.sessionCharacterId || !actor.isAlive) {
      throw conflict("COMBAT_409", "현재 플레이어 캐릭터 턴이 아닙니다.", {
        reason: "CURRENT_TURN_IS_NOT_PLAYER_CHARACTER",
      });
    }
    return actor;
  }

  private async spendCurrentActionIfNeeded(combat: NonNullable<CombatWithParticipants>, attacker: CombatParticipantEntity): Promise<void> {
    if (combat.currentParticipantId !== attacker.id) {
      return;
    }

    await this.actionEconomy.spendAction({
      combatId: combat.id,
      combatParticipantId: attacker.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: attacker.sessionCharacterId,
    });
  }

  private async spendCurrentBonusActionIfNeeded(combat: NonNullable<CombatWithParticipants>, attacker: CombatParticipantEntity): Promise<void> {
    if (combat.currentParticipantId !== attacker.id) {
      return;
    }

    await this.actionEconomy.spendBonusAction({
      combatId: combat.id,
      combatParticipantId: attacker.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: attacker.sessionCharacterId,
    });
  }

  private async mapCombat(combat: NonNullable<CombatWithParticipants>): Promise<CombatResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(combat.sessionId);

    return this.combatMapper.mapCombat(combat, {
      gmRuntimeUserId: this.getGmRuntimeUserId(session),
      findParticipantToken: (map, participant) => this.combatTargeting.findParticipantToken(map, participant as CombatParticipantEntity),
      listMonsterActionOptionsForParticipant: (participant, token, flags) =>
        this.combatMonsterActions.listMonsterActionOptionsForParticipant(participant as CombatParticipantEntity, token, flags),
    });
  }
}
