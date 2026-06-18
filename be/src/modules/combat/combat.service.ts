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
  CombatMonsterActionOptionDto,
  CombatEntityType,
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
import type { CoverBlocker } from "../rules/cover-position.service";
import { DiceService } from "../rules/dice.service";
import { ForcedMovementService } from "../rules/forced-movement.service";
import type { ForcedMovementMode } from "../rules/forced-movement.service";
import { MonsterAbilityService } from "../rules/monster-ability.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";
import type { RuleCatalogEntry } from "../rules/rule-catalog.types";
import { TerrainEffectService } from "../rules/terrain-effect.service";
import type { TerrainEffectResolution } from "../rules/terrain-effect.service";
import {
  PENDING_READY_ACTIONS_FLAG,
  ReadyActionService,
  TRIGGERED_READY_ACTIONS_FLAG,
} from "../rules/ready-action.service";
import type { PendingReadyAction } from "../rules/ready-action.service";
import type { TriggeredReadyAction } from "../rules/ready-action.service";
import { RuleEngineService } from "../rules/rule-engine.service";
import type { CoverModifierProduced, SavingThrowAbility } from "../rules/rule-engine.types";
import { SpellSlotService } from "../rules/spell-slot.service";
import { SpellScalingService } from "../rules/spell-scaling.service";
import type { SpellScalingResult, SpellScalingRule } from "../rules/spell-scaling.service";
import { MapRuntimeService } from "../sessions/map-runtime.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { SrdEngineLoaderService } from "./srd-engine-loader.service";
import type { SrdEngineExecutableMonsterAction } from "./srd-engine.types";

type CombatWithParticipants = Awaited<ReturnType<CombatService["getActiveCombatEntity"]>>;
type CombatParticipantEntity = NonNullable<CombatWithParticipants>["participants"][number];
type VttMapToken = VttMapStateDto["tokens"][number];
type CombatConcentrationCheckResult = {
  diceResult: DiceRollResponseDto;
  concentrationState: unknown;
  concentrationMaintained: boolean;
  removedConditions: unknown[];
};
type CombatTerrainEffectApplication = {
  damageRoll: DiceRollResponseDto | null;
  saveRolls: DiceRollResponseDto[];
  appliedConditionTags: string[];
  concentrationCheck: CombatConcentrationCheckResult | null;
};
type MonsterActionConditionRiderApplication = {
  saveRolls: DiceRollResponseDto[];
  appliedConditionTags: string[];
};
type EnteredTerrainEffect = {
  terrainEffectId: string;
  effect: TerrainEffectResolution;
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

type PendingOpportunityAttackReaction = {
  id: string;
  type: "opportunity_attack";
  sessionId: string;
  combatId: string;
  roundNo: number;
  turnNo: number;
  reactorParticipantId: string;
  reactorUserId: string;
  moverParticipantId: string;
  movementDistanceFt: number;
  movementCostFt?: number;
  map: VttMapStateDto;
  createdAt: string;
  continuation?: PendingOpportunityAttackContinuation | null;
};

type PendingOpportunityAttackContinuation = {
  type: "auto_monster_attack";
  userId: string;
  targetParticipantId: string;
  targetTokenId: string | null;
  autoEndTurn: boolean;
  action: SrdEngineExecutableMonsterAction;
};

type PendingShieldReaction = {
  id: string;
  type: "shield";
  sessionId: string;
  combatId: string;
  roundNo: number;
  turnNo: number;
  reactorParticipantId: string;
  reactorUserId: string;
  attackerParticipantId: string;
  targetParticipantId: string;
  attackTotal: number;
  targetArmorClass: number;
  cover?: CoverModifierProduced;
  damageDice?: string;
  damageBonus?: number;
  createdAt: string;
};

type PendingCombatReaction = PendingOpportunityAttackReaction | PendingShieldReaction;

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

const RAGE_CONDITION_TAGS = [
  "rage",
  "condition.rage",
  "resistance:bludgeoning",
  "resistance:piercing",
  "resistance:slashing",
];

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
const COMBAT_HIDE_DC = 12;
const DEFAULT_MELEE_ATTACK_DISTANCE_FT = 5;
const COMBAT_JUMP_EXTRA_MOVEMENT_FT = 10;
const SECOND_WIND_EXPENDED_TAG = "resource:second_wind_expended";
const PENDING_COMBAT_REACTION_FLAG = "pendingCombatReaction";
const MONSTER_RECHARGE_EXPENDED_FLAG = "monsterRechargeExpended";
const MONSTER_LIMITED_USE_EXPENDED_FLAG = "monsterLimitedUseExpended";

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
  ) {}

  async startCombat(
    userId: string,
    sessionId: string,
    dto: StartCombatDto,
  ): Promise<CombatResponseDto> {
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

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(
      session.id,
    );

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
      (map.tokens ?? [])
        .filter((token) => token.sessionCharacterId)
        .map((token) => [token.sessionCharacterId as string, token.id]),
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
      : this.scaleMonsterTokensForParty(rawMonsterTokens, candidates.length, map);
    const monsterTokens = scalingResult.monsterTokens;
    const excludedTokenIdSet = new Set(scalingResult.excludedTokenIds);
    const runtimeMap =
      excludedTokenIdSet.size > 0
        ? {
            ...map,
            tokens: map.tokens.map((token) =>
              excludedTokenIdSet.has(token.id) ? { ...token, hidden: true } : token,
            ),
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
        name: this.resolveTokenName(token),
        isHostile: token.isHostile,
        hidden: token.hidden,
      })),
    });

    const playerInitiativeRows = candidates.map((candidate) => ({
      kind: "player" as const,
      candidate,
      initiative: this.rollInitiative(
        this.resolveCharacterDexterityModifier(candidate.character.abilitiesJson),
        dto.autoRollInitiative,
      ),
      tieBreaker: Math.random(),
    }));
    const monsterInitiativeRows = monsterTokens.map((token) => ({
      kind: "monster" as const,
      token,
      initiative: this.rollInitiative(
        this.resolveMonsterDexterityModifier(token),
        dto.autoRollInitiative,
      ),
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

    const combat = await this.prisma.$transaction(async (tx) => {
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
          const monsterStats =
            row.kind === "monster" ? this.resolveMonsterTokenCombatStats(row.token) : null;
          return tx.combatParticipant.create({
            data: {
              combatId: created.id,
              entityType:
                row.kind === "player"
                  ? PrismaCombatEntityType.PLAYER_CHARACTER
                  : PrismaCombatEntityType.MONSTER,
              sessionCharacterId: row.kind === "player" ? row.candidate.id : null,
              tokenId:
                row.kind === "monster"
                  ? row.token.id
                  : (playerTokenIdBySessionCharacterId.get(row.candidate.id) ?? null),
              nameSnapshot:
                row.kind === "player"
                  ? row.candidate.character.name
                  : this.resolveTokenName(row.token),
              currentHp:
                row.kind === "player" ? row.candidate.currentHp : monsterStats?.currentHp,
              maxHp:
                row.kind === "player" ? row.candidate.character.maxHp : monsterStats?.maxHp,
              armorClass:
                row.kind === "player" ? row.candidate.character.armorClass : monsterStats?.armorClass,
              speedFt:
                row.kind === "player"
                  ? row.candidate.character.speed
                  : this.resolveMonsterSpeedFt(row.token),
              conditionsJson: row.kind === "player" ? row.candidate.conditionsJson : JSON.stringify([]),
              initiative: row.initiative,
              turnOrder: index + 1,
              isAlive:
                row.kind === "player" ? row.candidate.currentHp > 0 : (monsterStats?.currentHp ?? 0) > 0,
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
    }).catch((error: unknown) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
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
    const currentParticipant = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );
    this.realtimeEvents.emitSystemMessage(
      session.id,
      "COMBAT_STARTED",
      currentParticipant
        ? `전투가 시작되었습니다. 현재 턴: ${currentParticipant.nameSnapshot}`
        : "전투가 시작되었습니다.",
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
    this.realtimeEvents.emitSessionSnapshot(
      session.id,
      await this.sessionsService.buildSnapshot(session.id),
    );
    return response;
  }

  async getAvailableActions(
    userId: string,
    sessionId: string,
  ): Promise<AvailableActionsResponseDto> {
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
    const current = combat?.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );
    const isCurrentTurn = current?.sessionCharacterId === sessionCharacter.id;

    return {
      sessionId: session.id,
      characterId: sessionCharacter.characterId,
      isCurrentTurn,
      actions: this.actionRules.getAvailableActions({
        phase: state.phase.toLowerCase() as GamePhase,
        hasActiveCombat: Boolean(combat),
        isCurrentTurn,
        isAlive:
          sessionCharacter.status === PrismaSessionCharacterStatus.ACTIVE &&
          sessionCharacter.currentHp > 0,
      }),
    };
  }

  async endTurn(
    userId: string,
    sessionId: string,
    dto: EndTurnDto,
  ): Promise<TurnAdvanceResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const current = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );

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
      if (
        !actor ||
        actor.id !== current.sessionCharacterId ||
        actor.character.ownerUserId !== userId
      ) {
        throw forbidden("TURN_403", "현재 턴이 아닙니다.", {
          reason: "NOT_YOUR_TURN",
        });
      }
    }

    return this.advanceCurrentTurn(session.id, combat);
  }

  async moveParticipant(
    userId: string,
    sessionId: string,
    dto: MoveCombatParticipantDto,
  ): Promise<CombatMoveResultDto> {
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
    const moverToken = this.findParticipantToken(map, mover);
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

  async forceMoveParticipant(
    userId: string,
    sessionId: string,
    dto: ForceMoveCombatParticipantDto,
  ): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    await this.ensureHost(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const target = this.findCombatParticipantOrThrow(combat, dto.participantId);
    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const targetToken = this.findParticipantToken(map, target);
    if (!targetToken) {
      throw conflict("COMBAT_409", "강제이동 대상 토큰을 찾을 수 없습니다.", {
        reason: "FORCED_MOVE_TOKEN_NOT_FOUND",
      });
    }

    const resolution = this.forcedMovement.resolveForcedMovement({
      mode: this.normalizeForcedMovementMode(dto.mode),
      origin: this.mapPointToGridPoint(map, dto.origin),
      target: this.toCoverGridPoint(map, targetToken),
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
          point: this.toCoverGridPoint(map, token),
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
      tokens: map.tokens.map((token) =>
        token.id === targetToken.id ? { ...token, ...destination } : token,
      ),
      updatedAt: new Date().toISOString(),
    };
    const savedMap = await this.mapRuntimeService.saveSystemVttMap(session.id, nextMap);
    const terrainEffectApplication = await this.applyEnteredTerrainEffects(
      combat,
      target,
      resolution.combinedEnteredTerrainEffect,
      resolution.enteredTerrainEffects,
    );
    const responseMap = terrainEffectApplication.damageRoll && !target.isAlive
      ? await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id)
      : savedMap;
    let triggeredReadyActions: ReadyActionMovementResult = { count: 0, prompts: [] };
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
    const readyActionMessage =
      triggeredReadyActions.count > 0 ? `준비행동 ${triggeredReadyActions.count}개가 발동 대기 중입니다.` : null;
    const message = [
      `${target.nameSnapshot} 강제이동: ${resolution.distanceMovedFt}ft (${resolution.stoppedReason})`,
      readyActionMessage,
    ].filter((entry): entry is string => Boolean(entry)).join(" / ");
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
    if (terrainEffectApplication.damageRoll) {
      this.realtimeEvents.emitDiceRolled(session.id, terrainEffectApplication.damageRoll);
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
    const movementPath = this.normalizeCombatMovementPath(params.map, params.moverToken, params.path, to);
    this.assertCombatMovementPathOpen(params.map, params.moverToken, movementPath, movementMode);
    const movementDistanceFt = this.calculateMovementPathDistanceFt(params.map, params.moverToken, movementPath);
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
        : this.calculateTerrainAdjustedMovementCostFt(params.map, params.moverToken, movementPath);
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
      tokens: params.map.tokens.map((token) =>
        token.id === params.moverToken.id ? { ...token, x: to.x, y: to.y } : token,
      ),
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

    const savedMap = await this.commitCombatMove(
      params.session.id,
      latestCombat,
      latestMover,
      nextMap,
      movementCostFt,
    );
    const enteredTerrainEffects =
      movementMode === "normal"
        ? this.resolveEnteredTerrainEffectsForMovement(params.map, movementPath)
        : [];
    const terrainEffectApplication = await this.applyEnteredTerrainEffects(
      latestCombat,
      latestMover,
      enteredTerrainEffects.length
        ? this.terrainEffects.resolveCombinedEffects(enteredTerrainEffects.map((entered) => entered.terrainEffectId))
        : null,
      enteredTerrainEffects,
    );
    for (const saveRoll of terrainEffectApplication.saveRolls) {
      this.realtimeEvents.emitDiceRolled(params.session.id, saveRoll);
    }
    if (terrainEffectApplication.damageRoll) {
      this.realtimeEvents.emitDiceRolled(params.session.id, terrainEffectApplication.damageRoll);
    }
    if (terrainEffectApplication.concentrationCheck) {
      this.realtimeEvents.emitDiceRolled(
        params.session.id,
        terrainEffectApplication.concentrationCheck.diceResult,
      );
    }
    if (!latestMover.isAlive) {
      const response = await this.completeCombatIfResolved(
        params.session.id,
        await this.getActiveCombatEntity(params.session.id),
      );
      this.realtimeEvents.emitCombatUpdated(params.session.id, response);
      this.realtimeEvents.emitSessionSnapshot(params.session.id, await this.sessionsService.buildSnapshot(params.session.id));
      const currentMap = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(params.session), params.session.id);
      return {
        combat: response,
        map: currentMap,
        message: `${params.mover.nameSnapshot} 이동: ${movementDistanceFt}ft / 지형 피해 ${terrainEffectApplication.damageRoll?.total ?? 0}`,
        pendingReaction: null,
        movementDistanceFt,
        movementCostFt,
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
      terrainEffectApplication.appliedConditionTags.length > 0
    ) {
      this.realtimeEvents.emitSessionSnapshot(
        params.session.id,
        await this.sessionsService.buildSnapshot(params.session.id),
      );
    }
    const terrainConditionMessage = terrainEffectApplication.appliedConditionTags.length
      ? `지형 상태 ${terrainEffectApplication.appliedConditionTags.join(", ")}`
      : null;
    const readyActionMessage =
      triggeredReadyActionCount > 0 ? `준비행동 ${triggeredReadyActionCount}개가 발동 대기 중입니다.` : null;
    const movementMessage =
      movementMode === "jump"
        ? `${params.mover.nameSnapshot} 도약: ${movementDistanceFt}ft + 추가 ${COMBAT_JUMP_EXTRA_MOVEMENT_FT}ft`
        : `${params.mover.nameSnapshot} 이동: ${movementDistanceFt}ft`;
    return {
      combat: response,
      map: savedMap,
      message: terrainEffectApplication.damageRoll
        ? `${params.mover.nameSnapshot} 이동: ${movementDistanceFt}ft / 지형 피해 ${terrainEffectApplication.damageRoll.total}`
        : opportunityAttack.automaticMessages.length
        ? [
            opportunityAttack.automaticMessages.join(" / "),
            terrainConditionMessage,
            readyActionMessage,
          ].filter((message): message is string => Boolean(message)).join(" / ")
        : [movementMessage, terrainConditionMessage, readyActionMessage]
            .filter((message): message is string => Boolean(message))
            .join(" / "),
      pendingReaction: triggeredReadyActions.prompts[0] ?? null,
      movementDistanceFt,
      movementCostFt,
    };
  }

  async acceptReaction(
    userId: string,
    sessionId: string,
    dto: CombatReactionResponseDto,
  ): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    if (dto.reactionId.startsWith("triggered:")) {
      return this.resolveTriggeredReadyAction(userId, session.id, dto.reactionId, true);
    }
    const pending = await this.consumePendingOpportunityReaction(session.id, dto.reactionId);
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
      savedMap = await this.commitCombatMove(
        session.id,
        latestCombat,
        latestMover,
        pending.map,
        pending.movementCostFt ?? pending.movementDistanceFt,
      );
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

    const response = await this.completeCombatIfResolved(
      session.id,
      await this.getActiveCombatEntity(session.id),
    );
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));
    return { combat: response, map: savedMap, message, pendingReaction: null };
  }

  async declineReaction(
    userId: string,
    sessionId: string,
    dto: CombatReactionResponseDto,
  ): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    if (dto.reactionId.startsWith("triggered:")) {
      return this.resolveTriggeredReadyAction(userId, session.id, dto.reactionId, false);
    }
    const pending = await this.consumePendingOpportunityReaction(session.id, dto.reactionId);
    if (pending.type === "shield") {
      return this.resolvePendingShieldReaction(userId, session.id, pending, false);
    }
    if (pending.reactorUserId !== userId) {
      await this.ensureHost(userId, session.id);
    }

    const combat = await this.getActiveCombatEntity(session.id);
    const mover = this.findCombatParticipantOrThrow(combat, pending.moverParticipantId);
    const savedMap = await this.commitCombatMove(
      session.id,
      combat,
      mover,
      pending.map,
      pending.movementCostFt ?? pending.movementDistanceFt,
    );
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

    const rangeCheck = this.getMonsterActionRangeCheck(params.map, {
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

    const attackResult = await this.resolveAttack(continuation.userId, params.session.id, {
      attackerParticipantId: mover.id,
      targetParticipantId: target.id,
      attackBonus: continuation.action.attackBonus,
      damageDice: continuation.action.damageDice,
      damageBonus: 0,
    }, {
      forceDisadvantage: rangeCheck.longRangeDisadvantage,
    });

    let response = attackResult.combat;
    const pendingReactionAfterAttack = await this.hasPendingCombatReaction(params.session.id);
    if (
      !pendingReactionAfterAttack &&
      continuation.autoEndTurn !== false &&
      attackResult.combat.status === CombatStatus.ACTIVE
    ) {
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
        pendingReactionAfterAttack || continuation.autoEndTurn === false || response.status !== CombatStatus.ACTIVE
          ? ""
          : " / 턴 종료"
      }`,
      pendingReaction: attackResult.pendingReaction ?? null,
    };
  }

  private async advanceCurrentTurn(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
  ): Promise<TurnAdvanceResponseDto> {
    const current = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );

    if (!current) {
      throw conflict("TURN_409", "이미 턴이 종료되었습니다.", {
        reason: "CURRENT_TURN_NOT_FOUND",
      });
    }

    const aliveParticipants = combat.participants.filter((participant) => participant.isAlive);
    const actionableParticipants = aliveParticipants.filter(
      (participant) => !this.isCombatParticipantIncapacitated(participant),
    );
    const turnParticipants = actionableParticipants.length > 0 ? actionableParticipants : aliveParticipants;
    const currentIndex = turnParticipants.findIndex((participant) => participant.id === current.id);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % turnParticipants.length : 0;
    const next = turnParticipants[nextIndex] ?? null;
    const wrappedRound = turnParticipants.length > 0 && nextIndex === 0;
    const nextRoundNo = wrappedRound ? combat.roundNo + 1 : combat.roundNo;
    const nextTurnNo = combat.turnNo + 1;

    const updated = await this.prisma.$transaction(async (tx) => {
      // S14P31A201-80: 동시 endTurn 호출 시 currentParticipantId 조건부 update 로
      // 한 번만 통과시킨다. 이미 다음 턴으로 넘어간 뒤 재호출되면 count=0 이므로
      // race 패배자에게 TURN_409 를 명시 반환한다 (앞단 NOT_YOUR_TURN 검증과 트랜잭션 사이의 윈도우 차단).
      const advanced = await tx.combat.updateMany({
        where: {
          id: combat.id,
          currentParticipantId: current.id,
        },
        data: {
          currentParticipantId: next?.id ?? null,
          turnNo: nextTurnNo,
          roundNo: nextRoundNo,
        },
      });

      if (advanced.count === 0) {
        throw conflict("TURN_409", "이미 턴이 종료되었습니다.", {
          reason: "TURN_ALREADY_ADVANCED",
        });
      }

      await tx.combatParticipant.update({
        where: { id: current.id },
        data: { turnEndedAt: new Date() },
      });

      return tx.combat.findUniqueOrThrow({
        where: { id: combat.id },
        include: { participants: { orderBy: { turnOrder: "asc" } } },
      });
    });

    if (next) {
      await this.removeCombatCondition(next, COMBAT_CONDITION_DODGE);
    }
    await this.removeCombatCondition(current, COMBAT_CONDITION_DISENGAGE);
    await Promise.all(
      updated.participants
        .filter((participant) => participant.isAlive)
        .map((participant) =>
          this.actionEconomy.getOrCreateTurnState({
            combatId: updated.id,
            combatParticipantId: participant.id,
            roundNo: updated.roundNo,
            turnNo: updated.turnNo,
            sessionCharacterId: participant.sessionCharacterId,
          }),
        ),
    );

    const expiredRageCount = await this.endExpiredRagesForCombat(updated);
    const expiredReadyActionCount = await this.expireReadyActionsForTurn(sessionId, updated);
    const expiredConditionCount = await this.resolveTurnEndConditions(
      current,
      updated.roundNo,
      updated.turnNo,
    );
    const turnStartTerrainApplication = next
      ? await this.applyTurnStartTerrainEffects(sessionId, updated, next)
      : { damageRoll: null, saveRolls: [], appliedConditionTags: [], concentrationCheck: null };
    const monsterRecharge = next
      ? await this.resolveMonsterRechargeActionsForTurnStart(sessionId, next)
      : { rechargedCount: 0, diceRolls: [] };

    const response: TurnAdvanceResponseDto = {
      combatId: updated.id,
      endedEntityId: current.id,
      nextEntityId: next?.id ?? null,
      roundNo: updated.roundNo,
      turnNo: updated.turnNo,
    };

    this.realtimeEvents.emitTurnChanged(sessionId, response);
    for (const saveRoll of turnStartTerrainApplication.saveRolls) {
      this.realtimeEvents.emitDiceRolled(sessionId, saveRoll);
    }
    if (turnStartTerrainApplication.damageRoll) {
      this.realtimeEvents.emitDiceRolled(sessionId, turnStartTerrainApplication.damageRoll);
    }
    if (turnStartTerrainApplication.concentrationCheck) {
      this.realtimeEvents.emitDiceRolled(sessionId, turnStartTerrainApplication.concentrationCheck.diceResult);
    }
    for (const rechargeRoll of monsterRecharge.diceRolls) {
      this.realtimeEvents.emitDiceRolled(sessionId, rechargeRoll);
    }
    this.realtimeEvents.emitCombatUpdated(sessionId, await this.mapCombat(await this.getActiveCombatEntity(sessionId)));
    if (
      expiredRageCount > 0 ||
      expiredReadyActionCount > 0 ||
      expiredConditionCount > 0 ||
      monsterRecharge.rechargedCount > 0 ||
      turnStartTerrainApplication.damageRoll ||
      turnStartTerrainApplication.appliedConditionTags.length > 0
    ) {
      this.realtimeEvents.emitSessionSnapshot(
        sessionId,
        await this.sessionsService.buildSnapshot(sessionId),
      );
    }
    if (!this.serverAutoMonsterTurnSessions.has(sessionId)) {
      this.logAutoMonsterTurn("advanceCurrentTurn checking monster automation", {
        sessionId,
        combatId: updated.id,
        currentParticipantId: updated.currentParticipantId,
      });
      await this.runServerAutoMonsterTurns(sessionId);
    }
    return response;
  }

  async applyDamage(
    userId: string,
    sessionId: string,
    dto: ApplyCombatDamageDto,
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    await this.ensureHost(userId, session.id);

    const combat = await this.getActiveCombatEntity(session.id);
    const target = this.findCombatParticipantOrThrow(combat, dto.targetParticipantId);
    const amount = Math.max(0, Math.floor(dto.amount));
    const healing = dto.healing === true;

    await this.applyHitPointDelta(combat, target, healing ? amount : -amount);
    const concentrationCheck =
      !healing && amount > 0
        ? await this.resolveCombatConcentrationDamageCheck(target, amount)
        : null;
    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.completeCombatIfResolved(session.id, updated);
    if (concentrationCheck) {
      this.realtimeEvents.emitDiceRolled(session.id, concentrationCheck.diceResult);
    }
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message: `${target.nameSnapshot} ${healing ? "회복" : "피해"} ${amount}`,
      attackTotal: null,
      damageTotal: amount,
    };
  }

  async castSpell(
    userId: string,
    sessionId: string,
    dto: CastCombatSpellDto,
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const caster = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    if (!caster) {
      throw conflict("COMBAT_409", "현재 턴 전투 참여자를 찾을 수 없습니다.", { reason: "CURRENT_COMBATANT_NOT_FOUND" });
    }
    await this.ensureActorCanAct(userId, session.id, combat, caster);
    if (!caster.sessionCharacterId) {
      throw conflict("COMBAT_409", "몬스터 주문 시전은 아직 지원하지 않습니다.", { reason: "MONSTER_SPELL_UNSUPPORTED" });
    }
    const spellId = this.normalizeSpellId(dto.spellId);
    const spellDefinition = this.resolveCombatSpellDefinition(spellId);
    this.assertMvpSpellKnown(await this.getSessionCharacterForSpell(caster.sessionCharacterId), spellId);

    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const casterToken = this.findParticipantToken(map, caster);
    if (!casterToken) {
      throw conflict("COMBAT_409", "시전자 토큰을 찾을 수 없습니다.", { reason: "CASTER_TOKEN_NOT_FOUND" });
    }

    if (
      spellId === "spell.fire_bolt" ||
      spellId === "spell.chill_touch" ||
      spellId === "spell.ray_of_frost"
    ) {
      this.resolveCombatSpellSlotLevel(spellId, dto.slotLevel);
      const target = this.findCombatParticipantOrThrow(combat, dto.targetParticipantIds?.[0] ?? "");
      this.assertSpellTargetInRange(
        map,
        casterToken,
        target,
        this.resolveCombatSpellRangeFt(spellDefinition, 120),
      );
      const spellAttackBonus = await this.resolveSpellAttackBonus(caster.sessionCharacterId);
      return this.resolveAttack(
        userId,
        session.id,
        {
          attackerParticipantId: caster.id,
          targetParticipantId: target.id,
          attackBonus: spellAttackBonus,
          damageDice: this.resolveCantripDamageDice(
            this.resolveCombatSpellBaseDamageDice(spellDefinition) ?? "1d10",
            await this.resolveCharacterLevel(caster.sessionCharacterId),
          ),
          damageBonus: 0,
        },
        {
          messagePrefix:
            spellId === "spell.chill_touch"
              ? "Chill Touch"
              : spellId === "spell.ray_of_frost"
                ? "Ray of Frost"
                : "Fire Bolt",
          ...(spellId === "spell.ray_of_frost"
            ? {
                onHitCondition: this.conditionRuntime.createCondition({
                  conditionId: "condition.spell.ray_of_frost",
                  sourceId: spellId,
                  duration: { type: "rounds", remaining: 1 },
                  stackPolicy: "replace",
                  appliedAtRound: combat.roundNo,
                  tags: ["movement_speed_penalty:10"],
                }),
              }
            : {}),
        },
      );
    }

    const slotLevel = this.resolveCombatSpellSlotLevel(spellId, dto.slotLevel);
    let message = "";
    let attackTotal: number | null = null;
    let damageTotal: number | null = null;
    let responseMap: VttMapStateDto | null = null;
    let spellScaling: SpellScalingResult | null = null;
    const diceResults: DiceRollResponseDto[] = [];
    const concentrationChecks: Array<CombatConcentrationCheckResult & { targetParticipantId: string }> = [];

    if (spellId === "spell.magic_missile") {
      spellScaling = this.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const targets = (dto.targetParticipantIds?.length ? dto.targetParticipantIds : [dto.targetParticipantIds?.[0]])
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .slice(0, spellScaling.targetCount ?? 3)
        .map((id) => this.findCombatParticipantOrThrow(combat, id));
      if (!targets.length) {
        throw conflict("COMBAT_409", "Magic Missile 대상이 필요합니다.", { reason: "SPELL_TARGET_REQUIRED" });
      }
      targets.forEach((target) =>
        this.assertSpellTargetInRange(
          map,
          casterToken,
          target,
          this.resolveCombatSpellRangeFt(spellDefinition, 120),
        ),
      );
      targets.forEach((target) => this.assertSpellTargetLineOfEffect(map, casterToken, target));
      await this.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel);
      await this.spendCurrentActionIfNeeded(combat, caster);
      await this.spendSpellSlot(session.id, caster.sessionCharacterId, slotLevel);
      const missileDamageDice = this.resolveMagicMissileDamageDice(spellDefinition, spellScaling.targetCount ?? 3);
      const applied: string[] = [];
      for (let index = 0; index < (spellScaling.targetCount ?? 3); index += 1) {
        const target = targets[Math.min(index, targets.length - 1)];
        const roll = this.diceService.roll(missileDamageDice);
        diceResults.push(roll);
        await this.applyHitPointDelta(combat, target, -roll.total);
        const concentrationCheck = await this.resolveCombatConcentrationDamageCheck(target, roll.total);
        if (concentrationCheck) {
          concentrationChecks.push({ targetParticipantId: target.id, ...concentrationCheck });
        }
        applied.push(`${target.nameSnapshot} ${roll.total}`);
        damageTotal = (damageTotal ?? 0) + roll.total;
      }
      message = `Magic Missile: ${applied.join(", ")} 역장 피해`;
    } else if (spellId === "spell.cure_wounds") {
      spellScaling = this.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const target = this.findCombatParticipantOrThrow(combat, dto.targetParticipantIds?.[0] ?? "");
      this.assertSpellTargetInRange(
        map,
        casterToken,
        target,
        this.resolveCombatSpellRangeFt(spellDefinition, 5),
      );
      this.assertSpellTargetLineOfEffect(map, casterToken, target);
      await this.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel);
      await this.spendCurrentActionIfNeeded(combat, caster);
      await this.spendSpellSlot(session.id, caster.sessionCharacterId, slotLevel);
      const healingModifier = await this.resolveSpellcastingAbilityModifier(caster.sessionCharacterId);
      const healingBaseDice =
        spellScaling.damageDice ?? this.resolveCombatSpellBaseDamageDice(spellDefinition) ?? "1d8";
      const healingDice = `${healingBaseDice}${healingModifier >= 0 ? "+" : ""}${healingModifier}`;
      const healingRoll = this.diceService.roll(healingDice);
      diceResults.push(healingRoll);
      await this.applyHitPointDelta(combat, target, healingRoll.total);
      damageTotal = healingRoll.total;
      message = `Cure Wounds: ${target.nameSnapshot} ${healingRoll.total} 회복`;
    } else if (spellId === "spell.sleep") {
      spellScaling = this.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const point = dto.point ?? this.requireTargetPoint(map, casterToken);
      this.assertPointInRange(map, casterToken, point, this.resolveCombatSpellRangeFt(spellDefinition, 90));
      await this.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel);
      await this.spendCurrentActionIfNeeded(combat, caster);
      await this.spendSpellSlot(session.id, caster.sessionCharacterId, slotLevel);
      const poolRoll = this.diceService.roll(spellScaling.damageDice ?? "5d8");
      diceResults.push(poolRoll);
      let remaining = poolRoll.total;
      const targets = combat.participants
        .filter((participant) => participant.isAlive && participant.id !== caster.id && (participant.currentHp ?? 0) > 0)
        .filter((participant) => {
          const token = this.findParticipantToken(map, participant);
          return token
            ? this.getGridPointDistanceFt(map, point, token) <= 20 &&
                this.resolveAoeCover(map, point, participant, false).targetable
            : false;
        })
        .sort((left, right) => (left.currentHp ?? 0) - (right.currentHp ?? 0));
      const slept: string[] = [];
      for (const target of targets) {
        const hp = target.currentHp ?? 0;
        if (hp <= 0 || hp > remaining) continue;
        remaining -= hp;
        await this.addCombatConditionInstance(
          target,
          this.conditionRuntime.createCondition({
            conditionId: COMBAT_CONDITION_SLEEP,
            sourceId: spellId,
            duration: { type: "rounds", remaining: 10 },
            stackPolicy: "replace",
            appliedAtRound: combat.roundNo,
            tags: [COMBAT_CONDITION_UNCONSCIOUS, "condition:incapacitated"],
          }),
        );
        slept.push(target.nameSnapshot);
      }
      damageTotal = poolRoll.total;
      message = slept.length
        ? `Sleep: ${poolRoll.total} HP 분량으로 ${slept.join(", ")} 수면`
        : `Sleep: ${poolRoll.total} HP 분량, 잠든 대상 없음`;
    } else if (spellId === "spell.fireball") {
      spellScaling = this.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const areaTargeting = this.resolveCombatAreaTargeting(spellDefinition, spellId);
      const saveAbility = this.resolveCombatSpellSaveAbility(spellDefinition, "dex");
      const damageType = this.resolveCombatSpellDamageType(spellDefinition, "fire");
      const point = dto.point ?? this.requireTargetPoint(map, casterToken);
      this.assertPointInRange(map, casterToken, point, this.resolveCombatSpellRangeFt(spellDefinition, 150));
      const targetTokenIds = this.aoeTargeting.resolveTargets({
        shape: areaTargeting.shape,
        origin: this.toAoeGridCell(this.mapPointToGridPoint(map, point)),
        sizeFt: areaTargeting.sizeFt,
        grid: {
          columns: Math.ceil(map.width / map.gridSize),
          rows: Math.ceil(map.height / map.gridSize),
        },
        tokens: map.tokens.map((token) => ({
          id: token.id,
          ...this.toAoeGridCell(this.toCoverGridPoint(map, token)),
          hidden: token.hidden,
        })),
      }).tokenIds;
      const possibleTargets = combat.participants.filter(
        (participant) => participant.tokenId && targetTokenIds.includes(participant.tokenId),
      );
      const targetsWithCover = possibleTargets
        .map((target) => ({
          target,
          cover: this.resolveAoeCover(map, point, target, saveAbility === "dex"),
        }))
        .filter(({ cover }) => cover.targetable);
      const targets = targetsWithCover.map(({ target }) => target);
      if (!targets.length) {
        throw conflict("COMBAT_409", "Fireball 범위 안에 대상이 없습니다.", { reason: "SPELL_TARGET_REQUIRED" });
      }
      const saveDc = await this.resolveCombatSpellSaveDc(caster.sessionCharacterId);
      const aoeTargets = await Promise.all(
        targetsWithCover.map(({ target, cover }) => this.toCombatAoeDamageTarget(target, map, saveAbility, cover)),
      );
      await this.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel);
      await this.spendCurrentActionIfNeeded(combat, caster);
      await this.spendSpellSlot(session.id, caster.sessionCharacterId, slotLevel);
      const aoeResolution = this.aoeDamage.resolveDamage({
        sourceId: spellId,
        damageDice: spellScaling.damageDice ?? this.resolveCombatSpellBaseDamageDice(spellDefinition ?? null) ?? "8d6",
        damageType,
        save: {
          ability: saveAbility,
          dc: saveDc,
          halfDamageOnSuccess: this.resolveCombatSpellHalfDamageOnSuccess(spellDefinition),
        },
        targets: aoeTargets,
      });
      diceResults.push(aoeResolution.damageRoll, ...aoeResolution.targetResults.map((target) => target.saveRoll));
      const applied: string[] = [];
      for (const targetResult of aoeResolution.targetResults) {
        const target = targets.find((candidate) => candidate.id === targetResult.targetId);
        if (!target) {
          continue;
        }
        if (targetResult.finalDamage > 0) {
          await this.applyHitPointDelta(combat, target, -targetResult.finalDamage);
          const concentrationCheck = await this.resolveCombatConcentrationDamageCheck(target, targetResult.finalDamage);
          if (concentrationCheck) {
            concentrationChecks.push({ targetParticipantId: target.id, ...concentrationCheck });
          }
        }
        applied.push(`${target.nameSnapshot} ${targetResult.finalDamage}`);
        damageTotal = (damageTotal ?? 0) + targetResult.finalDamage;
      }
      message = `Fireball: ${applied.join(", ")} 화염 피해`;
    } else if (spellId === "spell.light") {
      const point = dto.point ?? this.requireTargetPoint(map, casterToken);
      this.assertPointInRange(map, casterToken, point, this.resolveCombatSpellRangeFt(spellDefinition, 5));
      this.assertLightPointAllowed(map, point);
      await this.spendCurrentActionIfNeeded(combat, caster);
      const lightSource = {
        id: `light:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        x: this.clampNumber(Math.floor(point.x), 0, Math.max(0, map.width - map.gridSize)),
        y: this.clampNumber(Math.floor(point.y), 0, Math.max(0, map.height - map.gridSize)),
        rangeFt: this.resolveCombatLightRadiusFt(spellDefinition),
        label: "Light",
        createdBySessionCharacterId: caster.sessionCharacterId,
      };
      responseMap = await this.mapRuntimeService.saveSystemVttMap(session.id, {
        ...map,
        lightSources: [...(map.lightSources ?? []), lightSource].slice(-40),
        updatedAt: new Date().toISOString(),
      });
      message = `Light: 선택한 타일 기준 ${lightSource.rangeFt}ft 파티 시야를 제공합니다.`;
    } else {
      throw conflict("COMBAT_409", "지원하지 않는 주문입니다.", { reason: "UNSUPPORTED_SPELL", spellId });
    }

    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.completeCombatIfResolved(session.id, updated);
    const turnLogDiceResult =
      (spellId === "spell.cure_wounds" || spellId === "spell.sleep" || spellId === "spell.fireball") && diceResults[0]
        ? { ...diceResults[0] }
        : null;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: caster.sessionCharacterId,
      rawInput: null,
      structuredAction: {
        type: "spell_cast",
        spellId,
        baseSpellLevel: this.resolveCombatBaseSpellLevel(spellId),
        slotLevel,
        spellScaling,
        targetParticipantIds: dto.targetParticipantIds ?? [],
        point: dto.point ?? null,
        aoe: spellId === "spell.fireball"
          ? {
              shape: this.resolveCombatAreaTargeting(spellDefinition, spellId).shape,
              sizeFt: this.resolveCombatAreaTargeting(spellDefinition, spellId).sizeFt,
              saveAbility: this.resolveCombatSpellSaveAbility(spellDefinition, "dex"),
              damageType: this.resolveCombatSpellDamageType(spellDefinition, "fire"),
            }
          : null,
        concentrationChecks: concentrationChecks.map((check) => ({
          targetParticipantId: check.targetParticipantId,
          concentrationMaintained: check.concentrationMaintained,
          removedConditions: check.removedConditions,
          concentrationState: check.concentrationState,
        })),
      },
      diceResult: turnLogDiceResult,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    diceResults.forEach((roll) => this.realtimeEvents.emitDiceRolled(session.id, roll));
    concentrationChecks.forEach((check) => this.realtimeEvents.emitDiceRolled(session.id, check.diceResult));
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));
    return { combat: response, message, attackTotal, damageTotal, turnLogId: turnLog.turnLogId, map: responseMap };
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
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const attacker = this.findCombatParticipantOrThrow(combat, dto.attackerParticipantId);
    const target = this.findCombatParticipantOrThrow(combat, dto.targetParticipantId);

    if (options.reactionUserId) {
      await this.ensureReactionActorCanAct(options.reactionUserId, session.id, attacker);
    } else if (session.gmMode === PrismaGmMode.HUMAN) {
      await this.ensureActorCanAct(userId, session.id, combat, attacker);
    }
    if (!options.reactionUserId && options.actionCost !== "reaction" && combat.currentParticipantId !== attacker.id) {
      throw conflict("COMBAT_409", "현재 턴의 전투 참여자만 공격할 수 있습니다.", {
        reason: "NOT_CURRENT_COMBATANT",
        currentParticipantId: combat.currentParticipantId,
        attackerParticipantId: attacker.id,
      });
    }

    if (!attacker.isAlive || !target.isAlive) {
      throw conflict("COMBAT_409", "행동할 수 없는 전투 참여자입니다.", {
        reason: "COMBATANT_DEFEATED",
      });
    }

    const attackerConditions = this.parseConditions(attacker.conditionsJson ?? "[]");
    const targetConditions = this.parseConditions(target.conditionsJson ?? "[]");
    const vttMap = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const targetHeavilyObscured = this.isParticipantInHeavilyObscuredTerrain(vttMap, target);
    const attackAdvantageState = this.resolveAttackAdvantageState({
      attackerConditions,
      targetConditions,
      targetHeavilyObscured,
      allyWithin5FtOfTarget: this.hasAllyWithinFeetOfTarget(
        vttMap,
        combat,
        attacker,
        target,
        DEFAULT_MELEE_ATTACK_DISTANCE_FT,
      ),
      forceDisadvantage: options.forceDisadvantage === true,
    });
    const attackBonus = Math.floor(dto.attackBonus ?? 0);
    const baseTargetArmorClass = this.resolveParticipantArmorClass(target);
    const coverResolution = this.resolveAttackCover(vttMap, attacker, target);
    const coverRuleResult = this.ruleEngine.resolveCoverModifiers({
      coverLevel: coverResolution.coverLevel,
      appliesToAttackRoll: true,
      appliesToDexteritySave: false,
    });
    if (!coverRuleResult.produced.targetable) {
      throw conflict("COMBAT_409", "완전 엄폐 대상은 공격할 수 없습니다.", {
        reason: "TARGET_HAS_FULL_COVER",
        coverLevel: coverRuleResult.produced.coverLevel,
      });
    }
    const targetArmorClass = baseTargetArmorClass + coverRuleResult.produced.armorClassBonus;

    if (options.actionCost === "reaction") {
      await this.actionEconomy.spendReaction({
        combatId: combat.id,
        combatParticipantId: attacker.id,
        roundNo: combat.roundNo,
        turnNo: combat.turnNo,
        sessionCharacterId: attacker.sessionCharacterId,
      });
    } else if (options.actionCost === "bonus_action") {
      await this.spendCurrentBonusActionIfNeeded(combat, attacker);
    } else if (options.actionCost === "none") {
      // Multiattack pays the action cost once before resolving child attacks.
    } else {
      await this.spendCurrentActionIfNeeded(combat, attacker);
      if (options.attackAction && combat.currentParticipantId === attacker.id) {
        await this.actionEconomy.recordAttackAction({
          combatId: combat.id,
          combatParticipantId: attacker.id,
          roundNo: combat.roundNo,
          turnNo: combat.turnNo,
          sessionCharacterId: attacker.sessionCharacterId,
          weaponId: options.attackAction.weaponId,
          weaponIsLightMelee: options.attackAction.weaponIsLightMelee,
        });
      }
    }

    const attackRoll = this.diceService.roll(`1d20+${attackBonus}`, attackAdvantageState);
    const naturalD20 = this.selectNaturalD20(attackRoll.rolls, attackAdvantageState);
    const criticalHit = naturalD20 === 20;
    const criticalMiss = naturalD20 === 1;
    const hit = criticalHit || (!criticalMiss && attackRoll.total >= targetArmorClass);
    if (hit && !criticalHit && !options.reactionUserId && await this.canPromptShieldReaction(session.id, combat, target)) {
      const pending = await this.storePendingShieldReaction({
        sessionId: session.id,
        combat,
        attacker,
        target,
        attackTotal: attackRoll.total,
        targetArmorClass,
        cover: coverRuleResult.produced,
        damageDice: dto.damageDice,
        damageBonus: dto.damageBonus,
      });
      const prompt = {
        id: pending.id,
        type: "shield",
        reactorParticipantId: target.id,
        reactorName: target.nameSnapshot,
        moverParticipantId: attacker.id,
        moverName: attacker.nameSnapshot,
        message: `${target.nameSnapshot}이(가) 공격에 맞았습니다. Shield를 사용해 AC +5를 적용할까요?`,
      } as const;
      this.realtimeEvents.emitCombatReactionPrompt(session.id, pending.reactorUserId, prompt);
      return {
        combat: await this.mapCombat(combat),
        message: "Shield 반응을 기다리는 중입니다.",
        attackTotal: attackRoll.total,
        damageTotal: null,
        turnLogId: null,
        pendingReaction: prompt,
      };
    }
    const fixedDamageTotal =
      hit && options.fixedDamageTotal !== undefined
        ? Math.max(0, Math.floor(options.fixedDamageTotal))
        : null;
    const damageRoll = hit && fixedDamageTotal === null
      ? this.diceService.roll(this.buildDamageExpression(dto.damageDice, dto.damageBonus, criticalHit))
      : null;
    const baseDamageTotal = fixedDamageTotal ?? damageRoll?.total ?? null;
    let damageTotal = baseDamageTotal;
    let sneakAttackDamage = 0;
    if (hit && baseDamageTotal !== null && options.sneakAttack) {
      const sneakAttackRoll = this.diceService.roll(
        `${Math.max(Math.ceil(options.sneakAttack.rogueLevel / 2), 1)}d6`,
      );
      const sneakAttackResult = this.ruleEngine.applySneakAttack({
        rogueLevel: options.sneakAttack.rogueLevel,
        attackKind: options.sneakAttack.attackKind,
        weaponProperties: options.sneakAttack.weaponProperties,
        hasAdvantage: attackAdvantageState === DiceAdvantageState.ADVANTAGE,
        hasDisadvantage: attackAdvantageState === DiceAdvantageState.DISADVANTAGE,
        sneakAttackAvailableThisTurn: true,
        baseDamage: baseDamageTotal,
        sneakAttackDamageRollTotal: sneakAttackRoll.total,
      });
      if (sneakAttackResult.accepted && sneakAttackResult.produced.damagePacket) {
        sneakAttackDamage = sneakAttackResult.produced.sneakAttackDamage;
        damageTotal = sneakAttackResult.produced.damagePacket.totalDamage;
        this.realtimeEvents.emitDiceRolled(session.id, sneakAttackRoll);
      }
    }

    if (damageTotal !== null && damageTotal > 0) {
      await this.applyHitPointDelta(combat, target, -damageTotal);
    }
    if (hit && options.onHitCondition) {
      await this.addCombatConditionInstance(target, options.onHitCondition);
    }
    const concentrationCheck =
      damageTotal !== null && damageTotal > 0
        ? await this.resolveCombatConcentrationDamageCheck(target, damageTotal)
        : null;
    if (hit && options.sneakAttack) {
      await this.actionEconomy.spendSneakAttack({
        combatId: combat.id,
        combatParticipantId: attacker.id,
        roundNo: combat.roundNo,
        turnNo: combat.turnNo,
        sessionCharacterId: attacker.sessionCharacterId,
      });
    }
    if (attackerConditions.includes(COMBAT_CONDITION_HIDDEN)) {
      await this.removeCombatCondition(attacker, COMBAT_CONDITION_HIDDEN);
    }

    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.completeCombatIfResolved(session.id, updated);
    const baseMessage = hit
      ? `${attacker.nameSnapshot} 공격 명중: ${target.nameSnapshot}에게 ${damageTotal ?? 0} 피해${sneakAttackDamage > 0 ? ` (암습 +${sneakAttackDamage})` : ""}`
      : `${attacker.nameSnapshot} 공격 빗나감: ${attackRoll.total} vs AC ${targetArmorClass}`;
    const message = options.messagePrefix ? `${options.messagePrefix}: ${baseMessage}` : baseMessage;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: attacker.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "attack",
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        baseTargetArmorClass,
        targetArmorClass,
        cover: coverRuleResult.produced,
        attackTotal: attackRoll.total,
        hit,
        criticalHit,
        criticalMiss,
        advantageState: attackAdvantageState,
        damageTotal,
        appliedCondition: hit && options.onHitCondition ? options.onHitCondition : null,
        concentrationCheck: concentrationCheck
          ? {
              concentrationMaintained: concentrationCheck.concentrationMaintained,
              removedConditions: concentrationCheck.removedConditions,
              concentrationState: concentrationCheck.concentrationState,
            }
          : null,
        ...(options.sneakAttack
          ? {
              sneakAttackApplied: sneakAttackDamage > 0,
              sneakAttackDamage,
            }
          : {}),
      },
      diceResult: { ...attackRoll },
      outcome: hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: message,
    });
    this.realtimeEvents.emitDiceRolled(session.id, attackRoll);
    if (concentrationCheck) {
      this.realtimeEvents.emitDiceRolled(session.id, concentrationCheck.diceResult);
    }
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message,
      attackTotal: attackRoll.total,
      damageTotal,
      turnLogId: turnLog.turnLogId,
    };
  }

  async resolveEquippedWeaponAttack(
    userId: string,
    sessionId: string,
    dto: EquippedWeaponAttackDto,
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const attacker = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );
    if (!attacker || attacker.isHostile || !attacker.sessionCharacterId) {
      throw conflict("COMBAT_409", "현재 플레이어 캐릭터 턴이 아닙니다.", {
        reason: "CURRENT_TURN_IS_NOT_PLAYER_CHARACTER",
      });
    }
    await this.ensureActorCanAct(userId, session.id, combat, attacker);

    const target = this.findCombatParticipantOrThrow(combat, dto.targetParticipantId);
    if (!target.isHostile || !target.isAlive) {
      throw conflict("COMBAT_409", "공격할 수 있는 대상이 아닙니다.", {
        reason: "INVALID_ATTACK_TARGET",
      });
    }

    const weapon = await this.resolveEquippedWeaponProfile(attacker.sessionCharacterId);
    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const attackerToken = attacker.tokenId
      ? map.tokens.find((token) => token.id === attacker.tokenId && token.hidden !== true)
      : map.tokens.find(
          (token) => token.sessionCharacterId === attacker.sessionCharacterId && token.hidden !== true,
        );
    const targetToken = target.tokenId
      ? map.tokens.find((token) => token.id === target.tokenId && token.hidden !== true)
      : map.tokens.find(
          (token) => token.sessionCharacterId === target.sessionCharacterId && token.hidden !== true,
        );

    if (!attackerToken || !targetToken) {
      throw conflict("COMBAT_409", "공격 거리 판정에 필요한 토큰을 찾을 수 없습니다.", {
        reason: "ATTACK_TOKEN_NOT_FOUND",
      });
    }

    const distanceFt = this.getTokenGridDistanceFt(map, attackerToken, targetToken);
    if (distanceFt > weapon.rangeFt) {
      throw conflict("COMBAT_409", "대상이 무기 사거리 밖에 있습니다.", {
        reason: "TARGET_OUT_OF_WEAPON_RANGE",
        distanceFt,
        rangeFt: weapon.rangeFt,
      });
    }

    return this.resolveAttack(
      userId,
      session.id,
      {
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        attackBonus: weapon.attackBonus,
        damageDice: weapon.damageDice,
        damageBonus: weapon.damageBonus,
      },
      {
        messagePrefix: weapon.isBasicAttack
          ? `${attacker.nameSnapshot} 기본 공격 처리`
          : `${attacker.nameSnapshot} ${weapon.name}`,
        fixedDamageTotal: weapon.fixedDamageTotal,
        attackAction: {
          weaponId: weapon.weaponId,
          weaponIsLightMelee: Boolean(weapon.isLightMeleeWeapon),
        },
      },
    );
  }

  async resolveSneakAttack(
    userId: string,
    sessionId: string,
    dto: EquippedWeaponAttackDto,
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const attacker = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );
    if (!attacker || attacker.isHostile || !attacker.sessionCharacterId) {
      throw conflict("COMBAT_409", "현재 플레이어 캐릭터 턴이 아닙니다.", {
        reason: "CURRENT_TURN_IS_NOT_PLAYER_CHARACTER",
      });
    }
    await this.ensureActorCanAct(userId, session.id, combat, attacker);

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: attacker.sessionCharacterId },
      include: { character: true },
    });
    if (!sessionCharacter || !sessionCharacter.character.className.toLowerCase().includes("rogue")) {
      throw conflict("COMBAT_409", "암습은 로그만 사용할 수 있습니다.", {
        reason: "SNEAK_ATTACK_REQUIRES_ROGUE",
      });
    }

    const target = this.findCombatParticipantOrThrow(combat, dto.targetParticipantId);
    if (!target.isHostile || !target.isAlive) {
      throw conflict("COMBAT_409", "암습할 수 있는 대상이 아닙니다.", {
        reason: "INVALID_SNEAK_ATTACK_TARGET",
      });
    }

    const turnState = await this.actionEconomy.getOrCreateTurnState({
      combatId: combat.id,
      combatParticipantId: attacker.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: attacker.sessionCharacterId,
    });
    if (turnState.actionUsed && !turnState.additionalActionGranted) {
      throw conflict("COMBAT_409", "암습 공격에 사용할 action이 없습니다.", {
        reason: "ACTION_ALREADY_USED",
      });
    }
    if (turnState.sneakAttackUsed) {
      throw conflict("COMBAT_409", "암습은 한 턴에 한 번만 사용할 수 있습니다.", {
        reason: "SNEAK_ATTACK_ALREADY_USED",
      });
    }

    const weapon = await this.resolveEquippedWeaponProfile(attacker.sessionCharacterId);
    if (!this.isSneakAttackWeaponProfile(weapon)) {
      throw conflict("COMBAT_409", "암습은 finesse 또는 원거리 무기로만 사용할 수 있습니다.", {
        reason: "SNEAK_ATTACK_REQUIRES_FINESSE_OR_RANGED_WEAPON",
      });
    }

    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const attackerToken = this.findParticipantToken(map, attacker);
    const targetToken = this.findParticipantToken(map, target);
    if (!attackerToken || !targetToken) {
      throw conflict("COMBAT_409", "암습 거리 판정에 필요한 토큰을 찾을 수 없습니다.", {
        reason: "ATTACK_TOKEN_NOT_FOUND",
      });
    }

    const distanceFt = this.getTokenGridDistanceFt(map, attackerToken, targetToken);
    if (distanceFt > weapon.rangeFt) {
      throw conflict("COMBAT_409", "대상이 무기 사거리 밖에 있습니다.", {
        reason: "TARGET_OUT_OF_WEAPON_RANGE",
        distanceFt,
        rangeFt: weapon.rangeFt,
      });
    }

    const attackAdvantageState = this.resolveAttackAdvantageState({
      attackerConditions: this.parseConditions(attacker.conditionsJson ?? "[]"),
      targetConditions: this.parseConditions(target.conditionsJson ?? "[]"),
      allyWithin5FtOfTarget: this.hasAllyWithinFeetOfTarget(
        map,
        combat,
        attacker,
        target,
        DEFAULT_MELEE_ATTACK_DISTANCE_FT,
      ),
    });
    if (attackAdvantageState !== DiceAdvantageState.ADVANTAGE) {
      throw conflict("COMBAT_409", "암습은 공격에 이점이 있어야 사용할 수 있습니다.", {
        reason: "SNEAK_ATTACK_REQUIRES_ADVANTAGE",
      });
    }

    return this.resolveAttack(
      userId,
      session.id,
      {
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        attackBonus: weapon.attackBonus,
        damageDice: weapon.damageDice,
        damageBonus: weapon.damageBonus,
      },
      {
        messagePrefix: `${attacker.nameSnapshot} 암습(${weapon.name})`,
        attackAction: {
          weaponId: weapon.weaponId,
          weaponIsLightMelee: Boolean(weapon.isLightMeleeWeapon),
        },
        sneakAttack: {
          rogueLevel: sessionCharacter.character.level,
          weaponProperties: weapon.properties ?? [],
          attackKind: weapon.attackKind ?? "melee_weapon_attack",
        },
      },
    );
  }

  async resolveOffhandWeaponAttack(
    userId: string,
    sessionId: string,
    dto: EquippedWeaponAttackDto,
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const attacker = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );
    if (!attacker || attacker.isHostile || !attacker.sessionCharacterId) {
      throw conflict("COMBAT_409", "현재 플레이어 캐릭터 턴이 아닙니다.", {
        reason: "CURRENT_TURN_IS_NOT_PLAYER_CHARACTER",
      });
    }
    await this.ensureActorCanAct(userId, session.id, combat, attacker);

    const target = this.findCombatParticipantOrThrow(combat, dto.targetParticipantId);
    if (!target.isHostile || !target.isAlive) {
      throw conflict("COMBAT_409", "공격할 수 있는 대상이 아닙니다.", {
        reason: "INVALID_ATTACK_TARGET",
      });
    }
    const turnState = await this.actionEconomy.getOrCreateTurnState({
      combatId: combat.id,
      combatParticipantId: attacker.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: attacker.sessionCharacterId,
    });
    if (turnState.bonusActionUsed) {
      throw conflict("COMBAT_409", "사용 가능한 bonus action이 없습니다.", {
        reason: "BONUS_ACTION_ALREADY_USED",
      });
    }
    if (!turnState.attackActionWeaponIsLightMelee) {
      throw conflict(
        "COMBAT_409",
        "쌍수 보조 공격은 이번 턴에 Attack action으로 light 근접 무기 공격을 한 뒤에만 할 수 있습니다.",
        { reason: "TWO_WEAPON_ATTACK_ACTION_REQUIRED" },
      );
    }

    const weapon = await this.resolveEquippedWeaponProfile(attacker.sessionCharacterId, "offhand");
    if (!weapon.isLightMeleeWeapon) {
      throw conflict("COMBAT_409", "쌍수 보조 공격은 light 속성의 근접 무기로만 할 수 있습니다.", {
        reason: "OFFHAND_WEAPON_MUST_BE_LIGHT_MELEE",
      });
    }
    if (
      turnState.attackActionWeaponId &&
      turnState.attackActionWeaponId === weapon.weaponId &&
      (weapon.quantity ?? 1) < 2
    ) {
      throw conflict("COMBAT_409", "쌍수 보조 공격은 다른 손에 든 다른 무기로 해야 합니다.", {
        reason: "OFFHAND_WEAPON_MUST_BE_DIFFERENT",
      });
    }
    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const attackerToken = attacker.tokenId
      ? map.tokens.find((token) => token.id === attacker.tokenId && token.hidden !== true)
      : map.tokens.find(
          (token) => token.sessionCharacterId === attacker.sessionCharacterId && token.hidden !== true,
        );
    const targetToken = target.tokenId
      ? map.tokens.find((token) => token.id === target.tokenId && token.hidden !== true)
      : map.tokens.find(
          (token) => token.sessionCharacterId === target.sessionCharacterId && token.hidden !== true,
        );

    if (!attackerToken || !targetToken) {
      throw conflict("COMBAT_409", "공격 거리 판정에 필요한 토큰을 찾을 수 없습니다.", {
        reason: "ATTACK_TOKEN_NOT_FOUND",
      });
    }

    const distanceFt = this.getTokenGridDistanceFt(map, attackerToken, targetToken);
    if (distanceFt > weapon.rangeFt) {
      throw conflict("COMBAT_409", "대상이 무기 사거리 밖에 있습니다.", {
        reason: "TARGET_OUT_OF_WEAPON_RANGE",
        distanceFt,
        rangeFt: weapon.rangeFt,
      });
    }

    return this.resolveAttack(
      userId,
      session.id,
      {
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        attackBonus: weapon.attackBonus,
        damageDice: weapon.damageDice,
        damageBonus: weapon.damageBonus,
      },
      {
        messagePrefix: `${attacker.nameSnapshot} 보조 공격(${weapon.name})`,
        fixedDamageTotal: weapon.fixedDamageTotal,
        actionCost: "bonus_action",
      },
    );
  }

  async useSecondWind(
    userId: string,
    sessionId: string,
    _dto: CombatBasicActionDto = {},
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const actor = this.getCurrentPlayerParticipantOrThrow(combat);
    await this.ensureActorCanAct(userId, session.id, combat, actor);
    if (!actor.sessionCharacterId) {
      throw conflict("COMBAT_409", "Second Wind를 사용할 캐릭터를 찾을 수 없습니다.", {
        reason: "SESSION_CHARACTER_NOT_FOUND",
      });
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: actor.sessionCharacterId },
      include: { character: true },
    });
    if (!sessionCharacter) {
      throw notFound("COMBAT_404", "캐릭터 전투 참여자를 찾을 수 없습니다.", {
        reason: "SESSION_CHARACTER_NOT_FOUND",
      });
    }
    if (!sessionCharacter.character.className.toLowerCase().includes("fighter")) {
      throw conflict("COMBAT_409", "Second Wind는 Fighter만 사용할 수 있습니다.", {
        reason: "SECOND_WIND_REQUIRES_FIGHTER",
      });
    }

    const turnState = await this.actionEconomy.getOrCreateTurnState({
      combatId: combat.id,
      combatParticipantId: actor.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: actor.sessionCharacterId,
    });
    if (turnState.bonusActionUsed) {
      throw conflict("COMBAT_409", "사용 가능한 bonus action이 없습니다.", {
        reason: "BONUS_ACTION_ALREADY_USED",
      });
    }

    const resource = await this.characterResources.getOrCreateResource(actor.sessionCharacterId, {
      secondWindAvailable: true,
    });
    if (!resource.secondWindAvailable) {
      throw conflict("COMBAT_409", "Second Wind를 이미 사용했습니다.", {
        reason: "SECOND_WIND_UNAVAILABLE",
      });
    }

    const roll = this.diceService.roll("1d10");
    const healingAmount = roll.total + sessionCharacter.character.level;
    await this.spendCurrentBonusActionIfNeeded(combat, actor);
    await this.characterResources.spendSecondWind(actor.sessionCharacterId);
    await this.addCombatCondition(actor, SECOND_WIND_EXPENDED_TAG);
    await this.applyHitPointDelta(combat, actor, healingAmount);

    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.mapCombat(updated);
    const healedActor = response.participants.find(
      (participant) => participant.sessionEntityId === actor.id,
    );
    const message = `${actor.nameSnapshot}은(는) Second Wind로 HP를 ${healedActor?.currentHp ?? "-"}까지 회복했습니다.`;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: actor.sessionCharacterId,
      rawInput: null,
      structuredAction: {
        type: "use_class_feature",
        featureId: "class.fighter.feature.second_wind",
        healingAmount,
      },
      diceResult: { ...roll },
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    this.realtimeEvents.emitDiceRolled(session.id, roll);
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message,
      attackTotal: null,
      damageTotal: healingAmount,
      turnLogId: turnLog.turnLogId,
    };
  }

  async dash(
    userId: string,
    sessionId: string,
    _dto: CombatBasicActionDto = {},
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const actor = this.getCurrentPlayerParticipantOrThrow(combat);
    return this.resolveActorDashAction(userId, session, combat, actor);
  }

  async dodge(
    userId: string,
    sessionId: string,
    _dto: CombatBasicActionDto = {},
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const actor = this.getCurrentPlayerParticipantOrThrow(combat);
    return this.resolveActorDodgeAction(userId, session, combat, actor);
  }

  async hide(
    userId: string,
    sessionId: string,
    _dto: CombatBasicActionDto = {},
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const actor = this.getCurrentPlayerParticipantOrThrow(combat);
    return this.resolveActorHideAction(userId, session, combat, actor);
  }

  private async resolveActorDashAction(
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
  ): Promise<CombatActionResultDto> {
    await this.ensureActorCanAct(userId, session.id, combat, actor);
    await this.spendCurrentActionIfNeeded(combat, actor);
    const speedFt = await this.resolveParticipantSpeedFt(actor);
    await this.actionEconomy.grantMovement({
      combatId: combat.id,
      combatParticipantId: actor.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: actor.sessionCharacterId,
      amountFt: speedFt,
    });

    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.mapCombat(updated);
    const message = `${actor.nameSnapshot}은(는) 전력으로 움직일 준비를 마쳤습니다. 이번 턴 이동 가능 거리가 ${speedFt}ft 증가합니다.`;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: { type: "combat_dash", movementBonusFt: speedFt },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));

    return { combat: response, message, attackTotal: null, damageTotal: null, turnLogId: turnLog.turnLogId };
  }

  private async resolveActorDodgeAction(
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
  ): Promise<CombatActionResultDto> {
    await this.ensureActorCanAct(userId, session.id, combat, actor);
    await this.spendCurrentActionIfNeeded(combat, actor);
    await this.addCombatCondition(actor, COMBAT_CONDITION_DODGE);

    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.mapCombat(updated);
    const message = `${actor.nameSnapshot}은(는) 방어 자세를 취했습니다. 다음 자기 턴 시작 전까지 자신을 향한 공격 굴림에 불리점이 적용됩니다.`;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: { type: "combat_dodge", condition: COMBAT_CONDITION_DODGE },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));

    return { combat: response, message, attackTotal: null, damageTotal: null, turnLogId: turnLog.turnLogId };
  }

  private async resolveActorHideAction(
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
  ): Promise<CombatActionResultDto> {
    await this.ensureActorCanAct(userId, session.id, combat, actor);
    await this.spendCurrentActionIfNeeded(combat, actor);
    const stealthModifier = await this.resolveStealthModifier(actor);
    const expression = stealthModifier >= 0 ? `1d20+${stealthModifier}` : `1d20${stealthModifier}`;
    const diceResult = this.diceService.roll(expression);
    const success = diceResult.total >= COMBAT_HIDE_DC;
    if (success) {
      await this.addCombatCondition(actor, COMBAT_CONDITION_HIDDEN);
    }

    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.mapCombat(updated);
    const message = success
      ? `${actor.nameSnapshot}은(는) 몸을 낮추고 시야의 빈틈으로 숨어듭니다. 다음 공격 굴림에 이점이 적용됩니다.`
      : `${actor.nameSnapshot}은(는) 숨을 곳을 찾으려 했지만 적의 시선을 완전히 피하지 못했습니다.`;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "combat_hide",
        checkName: "dexterity_stealth",
        dc: COMBAT_HIDE_DC,
        success,
        condition: success ? COMBAT_CONDITION_HIDDEN : null,
      },
      diceResult: { ...diceResult },
      outcome: success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: message,
    });
    this.realtimeEvents.emitDiceRolled(session.id, diceResult);
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message,
      attackTotal: diceResult.total,
      damageTotal: null,
      turnLogId: turnLog.turnLogId,
    };
  }

  async resolveActorAction(
    userId: string,
    sessionId: string,
    dto: CombatActorActionDto = {},
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const actor = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );
    if (!actor) {
      throw conflict("COMBAT_409", "현재 턴 전투 참여자를 찾을 수 없습니다.", {
        reason: "CURRENT_COMBATANT_NOT_FOUND",
      });
    }
    const actionType = dto.actionType ?? "attack";

    if (actionType === "dash") {
      return this.resolveActorDashAction(userId, session, combat, actor);
    }
    if (actionType === "dodge") {
      return this.resolveActorDodgeAction(userId, session, combat, actor);
    }
    if (actionType === "hide") {
      return this.resolveActorHideAction(userId, session, combat, actor);
    }

    if (
      actionType === "attack" &&
      actor.entityType === PrismaCombatEntityType.MONSTER &&
      actor.isHostile &&
      actor.isAlive &&
      !this.isCombatParticipantIncapacitated(actor)
    ) {
      await this.ensureActorCanAct(userId, session.id, combat, actor);
      const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
      const actorToken = this.findParticipantToken(map, actor);
      const monsterAction = this.resolveMonsterActionForParticipant(actor, actorToken, dto.actionId);
      if (monsterAction.attackKind === "special") {
        return this.resolveMonsterSpecialAction({
          userId,
          session,
          combat,
          actor,
          action: monsterAction,
          targetParticipantId: dto.targetParticipantId ?? null,
          autoEndTurn: dto.autoEndTurn === true,
        });
      }
      const target = dto.targetParticipantId
        ? this.findCombatParticipantOrThrow(combat, dto.targetParticipantId)
        : combat.participants.find((participant) => !participant.isHostile && participant.isAlive);
      if (!target || target.isHostile || !target.isAlive) {
        throw unprocessable("COMBAT_422", "몬스터가 공격할 수 있는 대상이 없습니다.", {
          reason: "MONSTER_TARGET_NOT_FOUND",
        });
      }
      const targetToken = this.findParticipantToken(map, target);
      return this.resolveMonsterAttackAction({
        userId,
        session,
        combat,
        attacker: actor,
        target,
        action: monsterAction,
        map,
        sourceTokenId: actorToken?.id ?? actor.tokenId ?? null,
        targetTokenId: targetToken?.id ?? target.tokenId ?? null,
        movementDistanceFt: 0,
        autoEndTurn: dto.autoEndTurn === true,
        autoEndTurnWhenOutOfRange: false,
      });
    }

    throw conflict("COMBAT_409", "현재 액터의 공통 행동은 아직 지원하지 않습니다.", {
      reason: "ACTOR_ACTION_UNSUPPORTED",
      actorParticipantId: actor.id,
      entityType: actor.entityType,
    });
  }

  async autoMonsterTurn(
    userId: string,
    sessionId: string,
    dto: AutoMonsterTurnDto = {},
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    if (session.gmMode === PrismaGmMode.HUMAN) {
      await this.ensureHost(userId, session.id);
    }

    return this.executeAutoMonsterTurn(userId, session, dto);
  }

  private async executeAutoMonsterTurn(
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    dto: AutoMonsterTurnDto = {},
  ): Promise<CombatActionResultDto> {
    this.logAutoMonsterTurn("executeAutoMonsterTurn entered", {
      sessionId: session.id,
      userId,
      targetParticipantId: dto.targetParticipantId ?? null,
      actionId: dto.actionId ?? null,
      autoEndTurn: dto.autoEndTurn ?? null,
    });
    const combat = await this.getActiveCombatEntity(session.id);
    const attacker = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );
    if (
      !attacker ||
      attacker.entityType !== PrismaCombatEntityType.MONSTER ||
      !attacker.isHostile ||
      !attacker.isAlive ||
      this.isCombatParticipantIncapacitated(attacker)
    ) {
      this.logAutoMonsterTurn("executeAutoMonsterTurn rejected: current turn is not hostile monster", {
        sessionId: session.id,
        combatId: combat.id,
        currentParticipantId: combat.currentParticipantId,
        currentParticipant: attacker
          ? {
              id: attacker.id,
              name: attacker.nameSnapshot,
              entityType: attacker.entityType,
              isHostile: attacker.isHostile,
              isAlive: attacker.isAlive,
            }
          : null,
      });
      throw conflict("COMBAT_409", "현재 턴의 몬스터가 없습니다.", {
        reason: "CURRENT_TURN_IS_NOT_MONSTER",
      });
    }

    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), session.id);
    const token = this.findParticipantToken(map, attacker);
    const action = this.resolveMonsterActionForParticipant(attacker, token, dto.actionId);
    if (action.attackKind === "special") {
      return this.resolveMonsterSpecialAction({
        userId,
        session,
        combat,
        actor: attacker,
        action,
        targetParticipantId: dto.targetParticipantId ?? null,
        autoEndTurn: dto.autoEndTurn !== false,
      });
    }
    this.logAutoMonsterTurn("monster action selected", {
      sessionId: session.id,
      combatId: combat.id,
      attackerId: attacker.id,
      attackerName: attacker.nameSnapshot,
      tokenId: token?.id ?? attacker.tokenId,
      tokenFound: Boolean(token),
      tokenMonsterId: token?.monster?.id ?? null,
      inferredMonsterId: action.monsterId,
      actionId: action?.actionId ?? null,
      actionLabel: action?.label ?? null,
    });

    const target = dto.targetParticipantId
      ? this.findCombatParticipantOrThrow(combat, dto.targetParticipantId)
      : combat.participants.find((participant) => !participant.isHostile && participant.isAlive);
    this.logAutoMonsterTurn("monster target selected", {
      sessionId: session.id,
      combatId: combat.id,
      attackerId: attacker.id,
      targetId: target?.id ?? null,
      targetName: target?.nameSnapshot ?? null,
      targetIsHostile: target?.isHostile ?? null,
      targetIsAlive: target?.isAlive ?? null,
    });
    if (!target || target.isHostile || !target.isAlive) {
      throw unprocessable("COMBAT_422", "몬스터가 공격할 수 있는 대상이 없습니다.", {
        reason: "MONSTER_TARGET_NOT_FOUND",
      });
    }

    const targetToken = target.tokenId
      ? (map.tokens ?? []).find((candidate) => candidate.id === target.tokenId)
      : (map.tokens ?? []).find((candidate) => candidate.sessionCharacterId === target.sessionCharacterId);
    const movementTarget =
      token && targetToken
        ? this.calculateCombatTokenStepTowardTarget(map, {
            sourceTokenId: token.id,
            targetTokenId: targetToken.id,
            maxDistanceFt: attacker.speedFt ?? 30,
            stopWithinFt: action.reachFt ?? 5,
          })
        : null;
    const movementResult =
      movementTarget && token
        ? await this.resolveCombatMovement({
            session,
            userId,
            combat,
            mover: attacker,
            map,
            moverToken: token,
            to: movementTarget,
            path: movementTarget.path,
            movementMode: "normal",
            continuation: {
              type: "auto_monster_attack",
              userId,
              targetParticipantId: target.id,
              targetTokenId: targetToken?.id ?? null,
              autoEndTurn: dto.autoEndTurn !== false,
              action,
            },
          })
        : null;
    this.logAutoMonsterTurn("monster movement resolved", {
      sessionId: session.id,
      combatId: combat.id,
      attackerId: attacker.id,
      sourceTokenId: token?.id ?? attacker.tokenId,
      targetTokenId: targetToken?.id ?? null,
      targetTokenFound: Boolean(targetToken),
      moved: (movementResult?.movementDistanceFt ?? 0) > 0,
      distanceMovedFt: movementResult?.movementDistanceFt ?? 0,
    });

    const mapAfterMovement = movementResult?.map ?? map;
    if (movementResult?.pendingReaction) {
      return {
        combat: movementResult.combat,
        message: movementResult.message,
        attackTotal: null,
        damageTotal: null,
        map: movementResult.map,
        pendingReaction: movementResult.pendingReaction,
      };
    }
    if (movementResult && movementResult.combat.status !== CombatStatus.ACTIVE) {
      return {
        combat: movementResult.combat,
        message: movementResult.message,
        attackTotal: null,
        damageTotal: null,
        map: movementResult.map,
      };
    }
    const latestAfterMovement = await this.getActiveCombatEntity(session.id);
    const attackerAfterMovement = this.findCombatParticipantOrThrow(latestAfterMovement, attacker.id);
    if (!attackerAfterMovement.isAlive) {
      const response = await this.completeCombatIfResolved(session.id, latestAfterMovement);
      this.realtimeEvents.emitCombatUpdated(session.id, response);
      return {
        combat: response,
        message: movementResult?.message ?? `${attacker.nameSnapshot}은(는) 이동 중 쓰러졌습니다.`,
        attackTotal: null,
        damageTotal: null,
        map: mapAfterMovement,
      };
    }
    return this.resolveMonsterAttackAction({
      userId,
      session,
      combat: latestAfterMovement,
      attacker: attackerAfterMovement,
      target,
      action,
      map: mapAfterMovement,
      sourceTokenId: token?.id ?? attacker.tokenId ?? null,
      targetTokenId: targetToken?.id ?? null,
      movementDistanceFt: movementResult?.movementDistanceFt ?? 0,
      autoEndTurn: dto.autoEndTurn !== false,
      autoEndTurnWhenOutOfRange: true,
    });
  }

  private scheduleServerAutoMonsterTurns(sessionId: string): void {
    if (
      this.serverAutoMonsterTurnSessions.has(sessionId) ||
      this.serverAutoMonsterTurnScheduledSessions.has(sessionId)
    ) {
      this.logAutoMonsterTurn("schedule skipped: automation already running or scheduled", {
        sessionId,
        running: this.serverAutoMonsterTurnSessions.has(sessionId),
        scheduled: this.serverAutoMonsterTurnScheduledSessions.has(sessionId),
      });
      return;
    }

    this.logAutoMonsterTurn("schedule queued", { sessionId });
    this.serverAutoMonsterTurnScheduledSessions.add(sessionId);
    setTimeout(() => {
      this.serverAutoMonsterTurnScheduledSessions.delete(sessionId);
      this.logAutoMonsterTurn("scheduled run starting", { sessionId });
      void this.runServerAutoMonsterTurns(sessionId);
    }, 50);
  }

  private isCurrentTurnAutoMonster(combat: NonNullable<CombatWithParticipants>): boolean {
    const current = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );
    return Boolean(
      current &&
        current.entityType === PrismaCombatEntityType.MONSTER &&
        current.isHostile &&
        current.isAlive &&
        !this.isCombatParticipantIncapacitated(current),
    );
  }

  private inferMvpMonsterId(name: string | null | undefined): string | null {
    const normalized = (name ?? "").trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (normalized.includes("goblin") || normalized.includes("고블린")) {
      return "monster.goblin";
    }
    if (
      normalized.includes("giant rat") ||
      normalized.includes("거대 쥐") ||
      normalized.includes("큰 쥐")
    ) {
      return "monster.giant_rat";
    }
    if (
      normalized.includes("giant spider") ||
      normalized.includes("거대 거미") ||
      normalized.includes("왕거미")
    ) {
      return "monster.giant_spider";
    }
    return null;
  }

  private resolveMonsterActionForParticipant(
    participant: CombatParticipantEntity,
    token: VttMapStateDto["tokens"][number] | null,
    preferredActionId?: string | null,
  ): SrdEngineExecutableMonsterAction {
    const monsterId = token?.monster?.id ?? this.inferMvpMonsterId(participant.nameSnapshot);
    const action =
      this.monsterAbilities.chooseAction(monsterId, preferredActionId) ??
      this.srdEngine.chooseMvpMonsterAction(monsterId, preferredActionId) ??
      this.buildFallbackMonsterAction(monsterId, participant.nameSnapshot);
    if (!action) {
      throw unprocessable("COMBAT_422", "실행 가능한 몬스터 행동이 없습니다.", {
        reason: "EXECUTABLE_MONSTER_ACTION_NOT_FOUND",
        monsterId,
      });
    }
    return action;
  }

  private listMonsterActionOptionsForParticipant(
    participant: CombatParticipantEntity,
    token: VttMapStateDto["tokens"][number] | null,
    flags: Record<string, unknown> = {},
  ): CombatMonsterActionOptionDto[] {
    if (participant.entityType !== PrismaCombatEntityType.MONSTER) {
      return [];
    }

    const monsterId = token?.monster?.id ?? this.inferMvpMonsterId(participant.nameSnapshot);
    const seenActionIds = new Set<string>();
    const actions = [
      ...this.monsterAbilities.listExecutableActions(monsterId),
      ...this.srdEngine.getExecutableMonsterActions(monsterId),
      this.buildFallbackMonsterAction(monsterId, participant.nameSnapshot),
    ];

    return actions
      .filter((action) => {
        if (!action.actionId || seenActionIds.has(action.actionId)) {
          return false;
        }
        seenActionIds.add(action.actionId);
        return true;
      })
      .map((action) => {
        const unavailableReason = this.resolveMonsterActionUnavailableReason(participant, action, flags);
        return {
          actionId: action.actionId,
          label: action.label,
          attackKind: action.attackKind,
          attackBonus: action.attackBonus,
          damageDice: action.damageDice,
          damageType: action.damageType,
          rangeFt: this.getMonsterActionRangeFt(action),
          longRangeFt: action.rangeFt?.long ?? null,
          confidence: action.confidence,
          costType:
            "costType" in action && typeof action.costType === "string"
              ? action.costType
              : "action",
          specialType:
            "specialType" in action && typeof action.specialType === "string"
              ? action.specialType
              : null,
          usage:
            "usage" in action && typeof action.usage === "string"
              ? action.usage
              : null,
          recharge:
            "recharge" in action && typeof action.recharge === "string"
              ? action.recharge
              : null,
          save:
            "save" in action && action.save
              ? action.save
              : null,
          conditionRiders:
            "conditionRiders" in action && Array.isArray(action.conditionRiders)
              ? action.conditionRiders
              : [],
          effectTags:
            "effectTags" in action && Array.isArray(action.effectTags)
              ? action.effectTags
              : [],
          ...(unavailableReason
            ? { available: false, unavailableReason }
            : {}),
        };
      });
  }

  private resolveMonsterActionUnavailableReason(
    participant: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
    flags: Record<string, unknown>,
  ): string | null {
    const rechargeExpended = this.parseMonsterRechargeExpended(flags[MONSTER_RECHARGE_EXPENDED_FLAG]);
    if (this.isRechargeMonsterAction(action) && rechargeExpended[participant.id]?.[action.actionId]) {
      return "MONSTER_RECHARGE_ACTION_EXPENDED";
    }

    const limitedUseLimit = this.resolveMonsterLimitedUseLimit(action);
    if (limitedUseLimit !== null) {
      const limitedUseExpended = this.parseMonsterLimitedUseExpended(flags[MONSTER_LIMITED_USE_EXPENDED_FLAG]);
      const used = this.extractMonsterLimitedUseUsed(limitedUseExpended[participant.id]?.[action.actionId]);
      if (used >= limitedUseLimit) {
        return "MONSTER_LIMITED_USE_ACTION_EXPENDED";
      }
    }

    return null;
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
    const rangeCheck = this.getMonsterActionRangeCheck(params.map, {
      action: params.action,
      sourceTokenId: params.sourceTokenId,
      targetTokenId: params.targetTokenId,
    });
    if (!rangeCheck.inRange) {
      this.logAutoMonsterTurn("monster attack skipped: target out of range", {
        sessionId: params.session.id,
        combatId: params.combat.id,
        attackerId: params.attacker.id,
        sourceTokenId: params.sourceTokenId,
        targetTokenId: params.targetTokenId,
        actionId: params.action.actionId,
        actionLabel: params.action.label,
        distanceFt: rangeCheck.distanceFt,
        rangeFt: rangeCheck.rangeFt,
      });

      if (params.autoEndTurn && params.autoEndTurnWhenOutOfRange) {
        const latestCombat = await this.getActiveCombatEntity(params.session.id);
        if (latestCombat.currentParticipantId === params.attacker.id) {
          await this.advanceCurrentTurn(params.session.id, latestCombat);
        }
        return {
          combat: await this.mapCombat(await this.getActiveCombatEntity(params.session.id)),
          message: "",
          attackTotal: null,
          damageTotal: null,
        };
      }

      throw conflict("COMBAT_409", "대상이 몬스터 행동 사거리 밖에 있습니다.", {
        reason: "TARGET_OUT_OF_MONSTER_ACTION_RANGE",
        distanceFt: rangeCheck.distanceFt,
        rangeFt: rangeCheck.rangeFt,
      });
    }

    this.logAutoMonsterTurn("monster attack resolving", {
      sessionId: params.session.id,
      combatId: params.combat.id,
      attackerId: params.attacker.id,
      targetId: params.target.id,
      attackBonus: params.action.attackBonus,
      damageDice: params.action.damageDice,
    });
    await this.assertMonsterRechargeActionAvailable(params.session.id, params.attacker, params.action);
    await this.assertMonsterLimitedUseActionAvailable(params.session.id, params.attacker, params.action);
    await this.recordMonsterRechargeActionExpended(params.session.id, params.combat, params.attacker, params.action);
    await this.recordMonsterLimitedUseActionExpended(params.session.id, params.combat, params.attacker, params.action);
    const result = await this.resolveAttack(params.userId, params.session.id, {
      attackerParticipantId: params.attacker.id,
      targetParticipantId: params.target.id,
      attackBonus: params.action.attackBonus,
      damageDice: params.action.damageDice,
      damageBonus: 0,
    }, {
      actionCost: params.actionCost ?? "action",
      forceDisadvantage: rangeCheck.longRangeDisadvantage,
    });
    this.logAutoMonsterTurn("monster attack resolved", {
      sessionId: params.session.id,
      combatId: result.combat.combatId,
      attackerId: params.attacker.id,
      targetId: params.target.id,
      attackTotal: result.attackTotal,
      damageTotal: result.damageTotal,
      combatStatus: result.combat.status,
    });
    const conditionRiders =
      result.damageTotal !== null
        ? await this.applyMonsterActionConditionRiders(params.session.id, params.combat, params.target, params.action)
        : { saveRolls: [], appliedConditionTags: [] };
    conditionRiders.saveRolls.forEach((roll) => this.realtimeEvents.emitDiceRolled(params.session.id, roll));
    let resultWithRiders = result;
    if (conditionRiders.appliedConditionTags.length > 0) {
      const latestCombat = await this.getActiveCombatEntity(params.session.id);
      const refreshedCombat = await this.mapCombat(latestCombat);
      this.realtimeEvents.emitCombatUpdated(params.session.id, refreshedCombat);
      this.realtimeEvents.emitSessionSnapshot(
        params.session.id,
        await this.sessionsService.buildSnapshot(params.session.id),
      );
      resultWithRiders = { ...result, combat: refreshedCombat };
    }

    const movementMessage =
      (params.movementDistanceFt ?? 0) > 0 ? ` ${params.movementDistanceFt ?? 0}ft 이동 후` : "";
    const actionMessage = `${params.attacker.nameSnapshot}${movementMessage} ${params.action.label}`;
    const riderMessage = conditionRiders.appliedConditionTags.length
      ? ` / ${conditionRiders.appliedConditionTags.join(", ")} 적용`
      : "";
    if (await this.hasPendingCombatReaction(params.session.id)) {
      return {
        ...resultWithRiders,
        message: `${actionMessage}: ${resultWithRiders.message}${riderMessage}`,
      };
    }
    if (!params.autoEndTurn || resultWithRiders.combat.status !== CombatStatus.ACTIVE) {
      return {
        ...resultWithRiders,
        message: `${actionMessage}: ${resultWithRiders.message}${riderMessage}`,
      };
    }

    const updated = await this.getActiveCombatEntity(params.session.id);
    if (updated.currentParticipantId === params.attacker.id) {
      this.logAutoMonsterTurn("monster auto ending turn", {
        sessionId: params.session.id,
        combatId: updated.id,
        attackerId: params.attacker.id,
      });
      await this.advanceCurrentTurn(params.session.id, updated);
    }

    return {
      ...resultWithRiders,
      combat: await this.mapCombat(await this.getCombatEntityById(resultWithRiders.combat.combatId)),
      message: `${actionMessage}: ${resultWithRiders.message}${riderMessage} / 턴 종료`,
    };
  }

  private async applyMonsterActionConditionRiders(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    target: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<MonsterActionConditionRiderApplication> {
    const conditionRiders = Array.isArray(action.conditionRiders)
      ? action.conditionRiders.filter(Boolean)
      : [];
    if (conditionRiders.length === 0) {
      return { saveRolls: [], appliedConditionTags: [] };
    }

    const saveResolution = await this.resolveMonsterActionRiderSave(target, action);
    if (saveResolution && saveResolution.success) {
      return { saveRolls: saveResolution.diceResult ? [saveResolution.diceResult] : [], appliedConditionTags: [] };
    }

    const appliedConditionTags: string[] = [];
    for (const conditionId of conditionRiders) {
      appliedConditionTags.push(conditionId);
      await this.addCombatConditionInstance(
        target,
        this.conditionRuntime.createCondition({
          conditionId,
          sourceId: action.actionId,
          saveEnds: this.resolveMonsterActionSaveEnds(action),
          appliedAtRound: combat.roundNo,
          tags: ["monster_action", `monster_action:${action.actionId}`],
        }),
      );
    }

    return {
      saveRolls: saveResolution?.diceResult ? [saveResolution.diceResult] : [],
      appliedConditionTags: Array.from(new Set(appliedConditionTags)),
    };
  }

  private async resolveMonsterActionRiderSave(
    target: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<{ diceResult: DiceRollResponseDto | null; success: boolean } | null> {
    const saveEnds = this.resolveMonsterActionSaveEnds(action);
    if (!saveEnds) {
      return null;
    }
    const profile = await this.resolveParticipantSavingThrowProfile(target, saveEnds.ability);
    const diceResult = this.diceService.roll(
      `1d20${profile.saveModifier >= 0 ? "+" : ""}${profile.saveModifier}`,
    );
    const result = this.ruleEngine.resolveSavingThrow({
      ability: saveEnds.ability,
      naturalD20: this.selectNaturalD20(diceResult.rolls, DiceAdvantageState.NORMAL),
      difficultyClass: saveEnds.dc,
      abilityModifier: profile.abilityModifier,
      proficiencyBonus: profile.proficiencyBonus,
      proficient: profile.proficient,
      advantageState: "normal",
    });
    return { diceResult, success: result.produced.success };
  }

  private resolveMonsterActionSaveEnds(action: SrdEngineExecutableMonsterAction): ConditionInstance["saveEnds"] {
    const ability = this.toSavingThrowAbility(action.save?.ability);
    const dc = this.resolveMonsterActionSaveDc(action);
    if (!ability || dc === null) {
      return null;
    }
    return { ability, dc };
  }

  private resolveMonsterActionSaveDc(action: SrdEngineExecutableMonsterAction): number | null {
    if (typeof action.save?.fixedDc === "number" && Number.isInteger(action.save.fixedDc)) {
      return action.save.fixedDc;
    }
    const tagDc = (action.effectTags ?? [])
      .map((tag) => /^save_dc:(\d+)$/.exec(tag)?.[1] ?? null)
      .find((value): value is string => value !== null);
    if (!tagDc) {
      return null;
    }
    const dc = Number(tagDc);
    return Number.isInteger(dc) ? dc : null;
  }

  private toSavingThrowAbility(value: string | null | undefined): SavingThrowAbility | null {
    return value === "str" || value === "dex" || value === "con" || value === "int" || value === "wis" || value === "cha"
      ? value
      : null;
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
    await this.ensureActorCanAct(params.userId, params.session.id, params.combat, params.actor);
    const costType =
      "costType" in params.action && typeof params.action.costType === "string"
        ? params.action.costType
        : "action";
    if (costType === "bonus_action") {
      await this.spendCurrentBonusActionIfNeeded(params.combat, params.actor);
    } else {
      await this.spendCurrentActionIfNeeded(params.combat, params.actor);
    }

    const effectTags =
      "effectTags" in params.action && Array.isArray(params.action.effectTags)
        ? params.action.effectTags
        : [];
    const specialType =
      "specialType" in params.action && typeof params.action.specialType === "string"
        ? params.action.specialType
        : null;
    if (specialType === "multiattack") {
      return this.resolveMonsterMultiattackAction({
        userId: params.userId,
        session: params.session,
        combat: params.combat,
        actor: params.actor,
        action: params.action,
        effectTags,
        targetParticipantId: params.targetParticipantId ?? null,
        autoEndTurn: params.autoEndTurn,
      });
    }
    const condition =
      specialType === "mobility" && effectTags.includes("disengage")
        ? COMBAT_CONDITION_DISENGAGE
        : null;
    if (!condition) {
      throw unprocessable("COMBAT_422", "지원하지 않는 몬스터 특수 행동입니다.", {
        reason: "MONSTER_SPECIAL_ACTION_UNSUPPORTED",
        actionId: params.action.actionId,
        specialType,
        effectTags,
      });
    }

    await this.assertMonsterRechargeActionAvailable(params.session.id, params.actor, params.action);
    await this.assertMonsterLimitedUseActionAvailable(params.session.id, params.actor, params.action);
    await this.recordMonsterRechargeActionExpended(params.session.id, params.combat, params.actor, params.action);
    await this.recordMonsterLimitedUseActionExpended(params.session.id, params.combat, params.actor, params.action);
    await this.addCombatCondition(params.actor, condition);
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(params.session.id);
    if (params.autoEndTurn) {
      const latestCombat = await this.getActiveCombatEntity(params.session.id);
      if (latestCombat.currentParticipantId === params.actor.id) {
        await this.advanceCurrentTurn(params.session.id, latestCombat);
      }
    }

    const updated = await this.getActiveCombatEntity(params.session.id);
    const response = await this.mapCombat(updated);
    const message = `${params.actor.nameSnapshot}은(는) ${params.action.label}로 교전에서 빠져나갈 틈을 만들었습니다.`;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: params.userId,
      sessionCharacterId: params.actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "monster_special",
        actionId: params.action.actionId,
        specialType,
        condition,
        effectTags,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    this.realtimeEvents.emitTurnLogCreated(params.session.id, turnLog);
    this.realtimeEvents.emitCombatUpdated(params.session.id, response);
    this.realtimeEvents.emitSessionSnapshot(
      params.session.id,
      await this.sessionsService.buildSnapshot(params.session.id),
    );

    return {
      combat: response,
      message: params.autoEndTurn ? `${message} / 턴 종료` : message,
      attackTotal: null,
      damageTotal: null,
      turnLogId: turnLog.turnLogId,
    };
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
    const attacks = this.parseMonsterMultiattackTags(params.effectTags);
    if (attacks.length === 0) {
      throw unprocessable("COMBAT_422", "몬스터 multiattack 구성이 비어 있습니다.", {
        reason: "MONSTER_MULTIATTACK_EMPTY",
        actionId: params.action.actionId,
      });
    }

    await this.assertMonsterRechargeActionAvailable(params.session.id, params.actor, params.action);
    await this.assertMonsterLimitedUseActionAvailable(params.session.id, params.actor, params.action);
    await this.recordMonsterRechargeActionExpended(params.session.id, params.combat, params.actor, params.action);
    await this.recordMonsterLimitedUseActionExpended(params.session.id, params.combat, params.actor, params.action);

    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(params.session), params.session.id);
    const actorToken = this.findParticipantToken(map, params.actor);
    const target = params.targetParticipantId
      ? this.findCombatParticipantOrThrow(params.combat, params.targetParticipantId)
      : params.combat.participants.find((participant) => !participant.isHostile && participant.isAlive);
    if (!target || target.isHostile || !target.isAlive) {
      throw unprocessable("COMBAT_422", "몬스터가 공격할 수 있는 대상이 없습니다.", {
        reason: "MONSTER_TARGET_NOT_FOUND",
      });
    }
    const targetToken = this.findParticipantToken(map, target);
    const childActions = [
      ...this.monsterAbilities.listExecutableActions(params.action.monsterId),
      ...this.srdEngine.getExecutableMonsterActions(params.action.monsterId),
    ];

    const results: CombatActionResultDto[] = [];
    for (const attack of attacks) {
      const childAction = childActions.find((candidate) =>
        candidate.actionId === attack.actionId ||
        ("catalogEntryId" in candidate && candidate.catalogEntryId === attack.actionId),
      );
      if (!childAction || childAction.attackKind === "special") {
        throw unprocessable("COMBAT_422", "몬스터 multiattack 하위 공격을 찾을 수 없습니다.", {
          reason: "MONSTER_MULTIATTACK_CHILD_NOT_FOUND",
          actionId: params.action.actionId,
          childActionId: attack.actionId,
        });
      }
      for (let index = 0; index < attack.count; index += 1) {
        const result = await this.resolveMonsterAttackAction({
          userId: params.userId,
          session: params.session,
          combat: params.combat,
          attacker: params.actor,
          target,
          action: childAction,
          map,
          sourceTokenId: actorToken?.id ?? params.actor.tokenId ?? null,
          targetTokenId: targetToken?.id ?? target.tokenId ?? null,
          movementDistanceFt: 0,
          actionCost: "none",
          autoEndTurn: false,
          autoEndTurnWhenOutOfRange: false,
        });
        results.push(result);
        if (await this.hasPendingCombatReaction(params.session.id)) {
          return {
            ...result,
            message: `${params.actor.nameSnapshot} ${params.action.label}: ${result.message}`,
          };
        }
      }
    }

    if (params.autoEndTurn) {
      const latestCombat = await this.getActiveCombatEntity(params.session.id);
      if (latestCombat.currentParticipantId === params.actor.id) {
        await this.advanceCurrentTurn(params.session.id, latestCombat);
      }
    }

    const updated = await this.getActiveCombatEntity(params.session.id);
    const response = await this.mapCombat(updated);
    const totalDamage = results.reduce((sum, result) => sum + (result.damageTotal ?? 0), 0);
    const lastAttackTotal = results.length ? results[results.length - 1].attackTotal : null;
    const message = `${params.actor.nameSnapshot} ${params.action.label}: ${results
      .map((result) => result.message)
      .join(" / ")}${params.autoEndTurn ? " / 턴 종료" : ""}`;

    this.realtimeEvents.emitCombatUpdated(params.session.id, response);
    this.realtimeEvents.emitSessionSnapshot(
      params.session.id,
      await this.sessionsService.buildSnapshot(params.session.id),
    );

    return {
      combat: response,
      message,
      attackTotal: lastAttackTotal,
      damageTotal: totalDamage,
      turnLogId: results[results.length - 1]?.turnLogId,
    };
  }

  private parseMonsterMultiattackTags(effectTags: string[]): Array<{ actionId: string; count: number }> {
    return effectTags.flatMap((tag) => {
      const match = /^multiattack:([^:]+)(?::(\d+))?$/.exec(tag);
      if (!match) {
        return [];
      }
      const count = match[2] ? Number(match[2]) : 1;
      if (!Number.isInteger(count) || count <= 0) {
        return [];
      }
      return [{ actionId: match[1], count }];
    });
  }

  private buildFallbackMonsterAction(
    monsterId: string | null,
    name: string,
  ): SrdEngineExecutableMonsterAction {
    if (monsterId === "monster.goblin") {
      return {
        monsterId,
        actionId: "fallback.scimitar",
        label: "Scimitar",
        attackKind: "melee",
        attackBonus: 4,
        damageDice: "1d6+2",
        damageType: "slashing",
        reachFt: 5,
        rangeFt: null,
        confidence: "medium",
      };
    }

    if (monsterId === "monster.giant_rat") {
      return {
        monsterId,
        actionId: "fallback.bite",
        label: "Bite",
        attackKind: "melee",
        attackBonus: 4,
        damageDice: "1d4+2",
        damageType: "piercing",
        reachFt: 5,
        rangeFt: null,
        confidence: "medium",
      };
    }

    return {
      monsterId: monsterId ?? "monster.unknown",
      actionId: "fallback.strike",
      label: `${name} Attack`,
      attackKind: "melee",
      attackBonus: 3,
      damageDice: "1d6+1",
      damageType: null,
      reachFt: 5,
      rangeFt: null,
      confidence: "low",
    };
  }

  private getMonsterActionRangeCheck(
    map: VttMapStateDto,
    params: {
      action: SrdEngineExecutableMonsterAction;
      sourceTokenId: string | null;
      targetTokenId: string | null;
    },
  ): { inRange: boolean; distanceFt: number | null; rangeFt: number; longRangeDisadvantage: boolean } {
    const normalRangeFt = this.getMonsterActionRangeFt(params.action);
    const longRangeFt =
      typeof params.action.rangeFt?.long === "number" && params.action.rangeFt.long > normalRangeFt
        ? params.action.rangeFt.long
        : normalRangeFt;
    if (!params.sourceTokenId || !params.targetTokenId) {
      return { inRange: false, distanceFt: null, rangeFt: longRangeFt, longRangeDisadvantage: false };
    }

    const sourceToken = map.tokens.find((token) => token.id === params.sourceTokenId);
    const targetToken = map.tokens.find((token) => token.id === params.targetTokenId);
    if (!sourceToken || !targetToken) {
      return { inRange: false, distanceFt: null, rangeFt: longRangeFt, longRangeDisadvantage: false };
    }

    const distanceFt = this.getTokenGridDistanceFt(map, sourceToken, targetToken);
    return {
      inRange: distanceFt <= longRangeFt,
      distanceFt,
      rangeFt: longRangeFt,
      longRangeDisadvantage: distanceFt > normalRangeFt && distanceFt <= longRangeFt,
    };
  }

  private getMonsterActionRangeFt(action: SrdEngineExecutableMonsterAction): number {
    if (action.attackKind === "special") {
      return 0;
    }
    if (typeof action.reachFt === "number" && action.reachFt > 0) {
      return action.reachFt;
    }
    if (typeof action.rangeFt?.normal === "number" && action.rangeFt.normal > 0) {
      return action.rangeFt.normal;
    }
    return 5;
  }

  private resolveAttackCover(
    map: VttMapStateDto,
    attacker: CombatParticipantEntity,
    target: CombatParticipantEntity,
  ): ReturnType<CoverPositionService["resolveCover"]> {
    const attackerToken = this.findParticipantToken(map, attacker);
    const targetToken = this.findParticipantToken(map, target);
    if (!attackerToken || !targetToken) {
      return this.coverPositions.resolveCover({
        attacker: { x: 0, y: 0 },
        target: { x: 0, y: 0 },
        blockers: [],
      });
    }
    if (this.getTokenGridDistanceFt(map, attackerToken, targetToken) <= DEFAULT_MELEE_ATTACK_DISTANCE_FT) {
      return this.coverPositions.resolveCover({
        attacker: this.toCoverGridPoint(map, attackerToken),
        target: this.toCoverGridPoint(map, targetToken),
        blockers: [],
      });
    }

    return this.coverPositions.resolveCover({
      attacker: this.toCoverGridPoint(map, attackerToken),
      target: this.toCoverGridPoint(map, targetToken),
      blockers: this.mapCoverBlockers(map),
    });
  }

  private mapCoverBlockers(map: VttMapStateDto): CoverBlocker[] {
    return [
      ...(map.wallCells ?? []).flatMap((cell) => this.cellCoverBlockers(map, cell, "full", true)),
      ...(map.doorCells ?? [])
        .filter((door) => door.state !== "open" && door.state !== "broken")
        .flatMap((cell) => this.cellCoverBlockers(map, cell, "full", true)),
      ...(map.objectCells ?? []).flatMap((cell) => this.cellCoverBlockers(map, cell, "half", false)),
    ];
  }

  private cellCoverBlockers(
    map: VttMapStateDto,
    cell: { x: number; y: number; width: number; height: number },
    coverLevel: CoverBlocker["coverLevel"],
    blocksLineOfEffect: boolean,
  ): CoverBlocker[] {
    const minColumn = this.getGridIndex(cell.x, map.gridSize, map.width);
    const minRow = this.getGridIndex(cell.y, map.gridSize, map.height);
    const maxColumn = this.getGridIndex(cell.x + Math.max(cell.width, 1) - 1, map.gridSize, map.width);
    const maxRow = this.getGridIndex(cell.y + Math.max(cell.height, 1) - 1, map.gridSize, map.height);
    const blockers: CoverBlocker[] = [];
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        blockers.push({
          point: { x: column, y: row },
          coverLevel,
          blocksLineOfEffect,
        });
      }
    }
    return blockers;
  }

  private toCoverGridPoint(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
  ): { x: number; y: number } {
    return {
      x: this.getGridIndex(token.x, map.gridSize, map.width),
      y: this.getGridIndex(token.y, map.gridSize, map.height),
    };
  }

  private mapPointToGridPoint(
    map: VttMapStateDto,
    point: { x: number; y: number },
  ): { x: number; y: number } {
    return {
      x: this.getGridIndex(point.x, map.gridSize, map.width),
      y: this.getGridIndex(point.y, map.gridSize, map.height),
    };
  }

  private toAoeGridCell(point: { x: number; y: number }): { column: number; row: number } {
    return { column: point.x, row: point.y };
  }

  private mapForcedMovementObstacles(map: VttMapStateDto): Array<{ x: number; y: number }> {
    return [
      ...(map.wallCells ?? []).flatMap((cell) => this.cellGridPoints(map, cell)),
      ...(map.doorCells ?? [])
        .filter((door) => door.state !== "open" && door.state !== "broken")
        .flatMap((cell) => this.cellGridPoints(map, cell)),
    ];
  }

  private mapForcedMovementHazards(map: VttMapStateDto): Array<{ point: { x: number; y: number }; terrainEffectId: string }> {
    return (map.terrainCells ?? []).flatMap((cell) => {
      const terrainEffectId = this.extractTerrainEffectId(cell);
      if (!terrainEffectId) {
        return [];
      }
      return this.cellGridPoints(map, cell).map((point) => ({ point, terrainEffectId }));
    });
  }

  private cellGridPoints(
    map: VttMapStateDto,
    cell: { x: number; y: number; width: number; height: number },
  ): Array<{ x: number; y: number }> {
    const minColumn = this.getGridIndex(cell.x, map.gridSize, map.width);
    const minRow = this.getGridIndex(cell.y, map.gridSize, map.height);
    const maxColumn = this.getGridIndex(cell.x + Math.max(cell.width, 1) - 1, map.gridSize, map.width);
    const maxRow = this.getGridIndex(cell.y + Math.max(cell.height, 1) - 1, map.gridSize, map.height);
    const points: Array<{ x: number; y: number }> = [];
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        points.push({ x: column, y: row });
      }
    }
    return points;
  }

  private extractTerrainEffectId(cell: {
    id?: string;
    name?: string | null;
    description?: string | null;
    terrainEffectId?: string | null;
  }): string | null {
    const explicitEffectId =
      typeof cell.terrainEffectId === "string" && cell.terrainEffectId.trim()
        ? cell.terrainEffectId.trim().toLowerCase().replace(/[\s-]+/g, "_")
        : null;
    if (explicitEffectId) {
      return explicitEffectId;
    }

    const candidates = [cell.id, cell.name, cell.description].filter(
      (value): value is string => typeof value === "string",
    );
    return candidates
      .flatMap((value) => value.match(/terrain\.[a-z0-9_.-]+/gi) ?? [])
      .map((value) => value.toLowerCase().replace(/-/g, "_"))[0] ?? null;
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
    combinedEffect: TerrainEffectResolution | null,
    enteredEffects: EnteredTerrainEffect[],
  ): Promise<CombatTerrainEffectApplication> {
    if (!combinedEffect) {
      return { damageRoll: null, saveRolls: [], appliedConditionTags: [], concentrationCheck: null };
    }

    const saveRolls: DiceRollResponseDto[] = [];
    const failedOrUnavoidableEffects: EnteredTerrainEffect[] = [];
    for (const entered of enteredEffects) {
      const saveEnds = this.resolveTerrainEffectSaveEnds(entered.effect);
      if (!saveEnds) {
        failedOrUnavoidableEffects.push(entered);
        continue;
      }
      const profile = await this.resolveParticipantSavingThrowProfile(target, saveEnds.ability);
      const diceResult = this.diceService.roll(
        `1d20${profile.saveModifier >= 0 ? "+" : ""}${profile.saveModifier}`,
      );
      saveRolls.push(diceResult);
      const result = this.ruleEngine.resolveSavingThrow({
        ability: saveEnds.ability,
        naturalD20: this.selectNaturalD20(diceResult.rolls, DiceAdvantageState.NORMAL),
        difficultyClass: saveEnds.dc,
        abilityModifier: profile.abilityModifier,
        proficiencyBonus: profile.proficiencyBonus,
        proficient: profile.proficient,
        advantageState: "normal",
      });
      if (!result.produced.success) {
        failedOrUnavoidableEffects.push(entered);
      }
    }

    const effectiveCombinedEffect = failedOrUnavoidableEffects.length
      ? this.terrainEffects.resolveCombinedEffects(
          failedOrUnavoidableEffects.map((entered) => entered.terrainEffectId),
        )
      : null;
    const damageRoll = effectiveCombinedEffect?.damage
      ? this.diceService.roll(effectiveCombinedEffect.damage.dice)
      : null;
    let concentrationCheck: CombatConcentrationCheckResult | null = null;
    if (damageRoll && damageRoll.total > 0) {
      await this.applyHitPointDelta(combat, target, -damageRoll.total);
      concentrationCheck = await this.resolveCombatConcentrationDamageCheck(target, damageRoll.total);
    }

    const appliedConditionTags: string[] = [];
    for (const entered of failedOrUnavoidableEffects) {
      for (const condition of entered.effect.conditionTags) {
        appliedConditionTags.push(condition);
        await this.addCombatConditionInstance(
          target,
          this.conditionRuntime.createCondition({
            conditionId: condition,
            sourceId: entered.terrainEffectId,
            saveEnds: this.resolveTerrainEffectSaveEnds(entered.effect),
            appliedAtRound: combat.roundNo,
            tags: entered.effect.runtimeTags,
          }),
        );
      }
    }

    return {
      damageRoll,
      saveRolls,
      appliedConditionTags: Array.from(new Set(appliedConditionTags)),
      concentrationCheck,
    };
  }

  private async applyTurnStartTerrainEffects(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    participant: CombatParticipantEntity,
  ): Promise<CombatTerrainEffectApplication> {
    if (!participant.isAlive || !participant.tokenId) {
      return { damageRoll: null, saveRolls: [], appliedConditionTags: [], concentrationCheck: null };
    }
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    const map = await this.sessionsService.getVttMapForUser(this.getGmRuntimeUserId(session), sessionId);
    const token = this.findParticipantToken(map, participant);
    if (!token) {
      return { damageRoll: null, saveRolls: [], appliedConditionTags: [], concentrationCheck: null };
    }

    const enteredEffects = this.resolveTerrainEffectsAtPoint(map, {
      x: token.x,
      y: token.y,
    });
    return this.applyEnteredTerrainEffects(
      combat,
      participant,
      enteredEffects.length
        ? this.terrainEffects.resolveCombinedEffects(enteredEffects.map((entered) => entered.terrainEffectId))
        : null,
      enteredEffects,
    );
  }

  private resolveTerrainEffectSaveEnds(
    effect: TerrainEffectResolution,
  ): ConditionInstance["saveEnds"] {
    if (effect.saveDc === null) {
      return null;
    }
    const saveTag = effect.runtimeTags.find((tag) => tag.startsWith("save:"));
    const ability = saveTag?.slice("save:".length);
    if (
      ability !== "str" &&
      ability !== "dex" &&
      ability !== "con" &&
      ability !== "int" &&
      ability !== "wis" &&
      ability !== "cha"
    ) {
      return null;
    }
    return { ability, dc: effect.saveDc };
  }

  private async resolveCombatConcentrationDamageCheck(
    target: CombatParticipantEntity,
    damageTaken: number,
  ): Promise<CombatConcentrationCheckResult | null> {
    const current = await this.readCombatConditionEntries(target);
    const conditions = this.conditionRuntime.parseConditionsJson(JSON.stringify(current));
    if (
      !conditions.some(
        (condition) =>
          condition.conditionId === "condition.concentration" ||
          condition.tags.includes("concentration"),
      )
    ) {
      return null;
    }

    const profile = await this.resolveParticipantConstitutionSaveProfile(target);
    const diceResult = this.diceService.roll(
      `1d20${profile.saveModifier >= 0 ? "+" : ""}${profile.saveModifier}`,
    );
    const result = this.concentrationRuntime.resolveDamageCheck({
      conditions,
      damageTaken,
      naturalD20: this.selectNaturalD20(diceResult.rolls, DiceAdvantageState.NORMAL),
      constitutionModifier: profile.constitutionModifier,
      proficiencyBonus: profile.proficiencyBonus,
      proficient: profile.proficient,
    });

    if (!result.concentrationMaintained) {
      await this.writeCombatConditionEntries(
        target,
        this.removeExpiredConditionEntries(current, result.removedConditions),
      );
    }

    return {
      diceResult,
      concentrationState: result.concentrationState,
      concentrationMaintained: result.concentrationMaintained,
      removedConditions: result.removedConditions,
    };
  }

  private async resolveParticipantConstitutionSaveProfile(
    participant: CombatParticipantEntity,
  ): Promise<{
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
    const abilities = this.parseJson<Record<string, number>>(
      sessionCharacter?.character.abilitiesJson ?? "{}",
      {},
    );
    const constitutionModifier = this.getAbilityModifier(abilities.con ?? abilities.constitution ?? 10);
    const proficiencyBonus = sessionCharacter?.character.proficiencyBonus ?? 0;
    const proficient = this.combatConditionTags(await this.readCombatConditionEntries(participant)).some(
      (tag) => tag === "save_proficiency:con" || tag === "save:con:proficient",
    );

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
    const abilities = this.parseJson<Record<string, number>>(
      sessionCharacter?.character.abilitiesJson ?? "{}",
      {},
    );
    const abilityModifier = this.getAbilityModifier(abilities[ability] ?? 10);
    const proficiencyBonus = sessionCharacter?.character.proficiencyBonus ?? 0;
    const proficient = this.combatConditionTags(await this.readCombatConditionEntries(participant)).some(
      (tag) =>
        tag === `save_proficiency:${ability}` ||
        tag === `save:${ability}:proficient`,
    );

    return {
      abilityModifier,
      proficiencyBonus,
      proficient,
      saveModifier: abilityModifier + (proficient ? proficiencyBonus : 0),
    };
  }

  private removeExpiredConditionEntries(
    current: unknown[],
    removedConditions: unknown[],
  ): unknown[] {
    const removedKeys = new Set(
      removedConditions
        .map((condition) => this.toConditionEntryKey(condition))
        .filter((key): key is string => key !== null),
    );
    return current.filter((entry) => {
      const key = this.toConditionEntryKey(entry);
      return key === null || !removedKeys.has(key);
    });
  }

  private toConditionEntryKey(entry: unknown): string | null {
    const parsed = this.conditionRuntime.parseConditionsJson(JSON.stringify([entry]))[0];
    return parsed ? this.conditionEntryKey(parsed) : null;
  }

  private getTokenGridDistanceFt(
    map: VttMapStateDto,
    sourceToken: VttMapStateDto["tokens"][number],
    targetToken: VttMapStateDto["tokens"][number],
  ): number {
    const sourceColumn = this.getGridIndex(sourceToken.x, map.gridSize, map.width);
    const sourceRow = this.getGridIndex(sourceToken.y, map.gridSize, map.height);
    const targetColumn = this.getGridIndex(targetToken.x, map.gridSize, map.width);
    const targetRow = this.getGridIndex(targetToken.y, map.gridSize, map.height);
    return Math.max(Math.abs(sourceColumn - targetColumn), Math.abs(sourceRow - targetRow)) * 5;
  }

  private getGridIndex(value: number, gridSize: number, maxSize: number): number {
    return Math.floor(Math.min(Math.max(value, 0), Math.max(0, maxSize - 1)) / gridSize);
  }

  private async resolveEquippedWeaponProfile(
    sessionCharacterId: string,
    slot: "main" | "offhand" = "main",
  ): Promise<EquippedWeaponProfile> {
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

    const equippedWeaponId =
      slot === "offhand"
        ? sessionCharacter.character.offhandWeaponId
        : sessionCharacter.character.equippedWeaponId;
    if (!equippedWeaponId) {
      if (slot === "offhand") {
        throw conflict("COMBAT_409", "보조 손에 장착한 무기가 없습니다.", {
          reason: "OFFHAND_WEAPON_NOT_EQUIPPED",
        });
      }
      // 장착 무기가 없어도 전투 턴이 막히지 않도록 5ft 기본 공격으로 내려갑니다.
      return buildBasicAttackProfile();
    }

    const entry = sessionCharacter.inventoryEntries.find(
      (candidate) =>
        candidate.id === equippedWeaponId || candidate.itemDefinitionId === equippedWeaponId,
    );
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
        }>(
          sessionCharacter.inventorySnapshotJson ?? sessionCharacter.character.inventoryJson,
        )
      : [];
    const snapshotItem = snapshotInventory.find(
      (item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
    );
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

    const fallback = this.getFallbackWeaponProfile(
      [item.itemDefinitionId, item.id, item.name].filter(Boolean).join(" "),
    );
    const properties = new Set(
      [...(item.properties ?? []), ...(fallback.properties ?? [])].map((value) =>
        value.toLowerCase().replace(/[_\s]+/g, "-"),
      ),
    );
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
    const hasTwoWeaponFighting = featureTags.some(
      (feature) => feature.toLowerCase() === "fighting_style:two_weapon_fighting",
    );

    return {
      weaponId: equippedWeaponId,
      quantity: item.quantity,
      name: item.name ?? fallback.name ?? "무기",
      attackBonus: sessionCharacter.character.proficiencyBonus + abilityMod,
      damageDice: item.damageDice ?? fallback.damageDice ?? "1d6",
      damageBonus:
        slot === "offhand" && !hasTwoWeaponFighting ? Math.min(0, abilityMod) : abilityMod,
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
      dagger: { damageDice: "1d4", rangeFt: 20, properties: ["finesse", "light", "thrown"] },
      dart: { damageDice: "1d4", rangeFt: 20, properties: ["ranged", "thrown"] },
      greataxe: { damageDice: "1d12", rangeFt: 5, properties: ["melee", "heavy", "two-handed"] },
      handaxe: { damageDice: "1d6", rangeFt: 20, properties: ["light", "thrown"] },
      javelin: { damageDice: "1d6", rangeFt: 30, properties: ["thrown"] },
      "light-crossbow": { damageDice: "1d8", rangeFt: 80, properties: ["ranged", "two-handed"] },
      longsword: { damageDice: "1d8", rangeFt: 5, properties: ["melee", "versatile"] },
      longbow: { damageDice: "1d8", rangeFt: 150, properties: ["ranged", "two-handed"] },
      mace: { damageDice: "1d6", rangeFt: 5, properties: ["melee"] },
      quarterstaff: { damageDice: "1d6", rangeFt: 5, properties: ["melee", "versatile"] },
      rapier: { damageDice: "1d8", rangeFt: 5, properties: ["melee", "finesse"] },
      scimitar: { damageDice: "1d6", rangeFt: 5, properties: ["melee", "finesse", "light"] },
      shortbow: { damageDice: "1d6", rangeFt: 80, properties: ["ranged", "two-handed"] },
      shortsword: { damageDice: "1d6", rangeFt: 5, properties: ["melee", "finesse", "light"] },
      warhammer: { damageDice: "1d8", rangeFt: 5, properties: ["melee", "versatile"] },
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
    if (this.serverAutoMonsterTurnSessions.has(sessionId)) {
      this.logAutoMonsterTurn("run skipped: automation already running", { sessionId });
      return;
    }

    this.logAutoMonsterTurn("run started", { sessionId });
    this.serverAutoMonsterTurnSessions.add(sessionId);
    try {
      for (let step = 0; step < 20; step += 1) {
        const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
        this.logAutoMonsterTurn("run step session loaded", {
          sessionId: session.id,
          step,
          gmMode: session.gmMode,
        });
        if (session.gmMode === PrismaGmMode.HUMAN) {
          this.logAutoMonsterTurn("run stopped: HUMAN GM session", { sessionId: session.id, step });
          return;
        }

        let combat: NonNullable<CombatWithParticipants>;
        try {
          combat = await this.getActiveCombatEntity(session.id);
        } catch {
          this.logAutoMonsterTurn("run stopped: active combat not found", { sessionId: session.id, step });
          return;
        }

        const current = combat.participants.find(
          (participant) => participant.id === combat.currentParticipantId,
        );
        this.logAutoMonsterTurn("run step combat loaded", {
          sessionId: session.id,
          step,
          combatId: combat.id,
          status: combat.status,
          roundNo: combat.roundNo,
          turnNo: combat.turnNo,
          currentParticipantId: combat.currentParticipantId,
          currentParticipant: current
            ? {
                id: current.id,
                name: current.nameSnapshot,
                entityType: current.entityType,
                isHostile: current.isHostile,
                isAlive: current.isAlive,
                tokenId: current.tokenId,
              }
            : null,
        });
        if (this.isCombatResolved(combat)) {
          this.logAutoMonsterTurn("run completing resolved combat", {
            sessionId: session.id,
            step,
            combatId: combat.id,
          });
          await this.completeCombat(session.id, combat.id);
          return;
        }
        if (
          current &&
          current.entityType === PrismaCombatEntityType.MONSTER &&
          current.isHostile &&
          current.isAlive &&
          this.isCombatParticipantIncapacitated(current)
        ) {
          this.logAutoMonsterTurn("run skipping incapacitated monster", {
            sessionId: session.id,
            step,
            currentParticipantId: current.id,
          });
          await this.advanceCurrentTurn(session.id, combat);
          continue;
        }
        if (
          !current ||
          current.entityType !== PrismaCombatEntityType.MONSTER ||
          !current.isHostile ||
          !current.isAlive ||
          this.isCombatParticipantIncapacitated(current)
        ) {
          this.logAutoMonsterTurn("run stopped: current participant is not actionable monster", {
            sessionId: session.id,
            step,
            currentParticipantId: combat.currentParticipantId,
          });
          return;
        }

        try {
          await this.executeAutoMonsterTurn(this.getGmRuntimeUserId(session), session, {});
          if (await this.hasPendingCombatReaction(session.id)) {
            this.logAutoMonsterTurn("run stopped: pending combat reaction", {
              sessionId: session.id,
              step,
            });
            return;
          }
        } catch (error) {
          const message = this.extractErrorMessage(error);
          this.logger.warn(
            `Auto monster turn failed session=${session.id} participant=${current.id}: ${message}`,
          );
          this.realtimeEvents.emitSystemMessage(
            session.id,
            "AUTO_MONSTER_TURN_FAILED",
            `몬스터 자동 턴 실패: ${current.nameSnapshot} 행동을 처리하지 못했습니다. 원인: ${message}. 턴을 넘깁니다.`,
          );

          const latestCombat = await this.getActiveCombatEntity(session.id);
          if (latestCombat.currentParticipantId === current.id) {
            await this.advanceCurrentTurn(session.id, latestCombat);
          }
        }
      }
      this.logAutoMonsterTurn("run stopped: max step guard reached", { sessionId, maxSteps: 20 });
    } catch (error) {
      this.realtimeEvents.emitSystemMessage(
        sessionId,
        "AUTO_MONSTER_TURN_LOOP_FAILED",
        `몬스터 자동 턴 루프가 중단되었습니다. 원인: ${this.extractErrorMessage(error)}`,
      );
      this.logger.error(
        `Auto monster turn loop failed session=${sessionId}: ${this.extractErrorMessage(error)}`,
      );
    } finally {
      this.serverAutoMonsterTurnSessions.delete(sessionId);
      this.logAutoMonsterTurn("run finished", { sessionId });
    }
  }

  private logAutoMonsterTurn(message: string, data: Record<string, unknown> = {}): void {
    const line = `[AUTO_MONSTER] ${message} ${JSON.stringify(data)}`;
    this.logger.log(line);
    // Nest Logger 설정/transport가 꺼져 있어도 전투 자동 진행 추적은 개발 콘솔에 반드시 남긴다.
    console.log(line);
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (error && typeof error === "object" && "response" in error) {
      const response = (error as { response?: unknown }).response;
      if (response && typeof response === "object" && "message" in response) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) {
          return message;
        }
      }
    }
    return "알 수 없는 오류";
  }

  private async hasPendingCombatReaction(sessionId: string): Promise<boolean> {
    const { state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    return Boolean(flags[PENDING_COMBAT_REACTION_FLAG]);
  }

  private async resolveMonsterRechargeActionsForTurnStart(
    sessionId: string,
    actor: CombatParticipantEntity,
  ): Promise<{ rechargedCount: number; diceRolls: DiceRollResponseDto[] }> {
    if (actor.entityType !== PrismaCombatEntityType.MONSTER || !actor.isAlive) {
      return { rechargedCount: 0, diceRolls: [] };
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const expended = this.parseMonsterRechargeExpended(flags[MONSTER_RECHARGE_EXPENDED_FLAG]);
    const actorActions = expended[actor.id];
    if (!actorActions || Object.keys(actorActions).length === 0) {
      return { rechargedCount: 0, diceRolls: [] };
    }

    const remainingActorActions: Record<string, unknown> = {};
    const diceRolls: DiceRollResponseDto[] = [];
    let rechargedCount = 0;
    for (const [actionId, entry] of Object.entries(actorActions)) {
      const recharge = this.extractMonsterRechargeValue(entry);
      if (!recharge) {
        continue;
      }
      const roll = this.diceService.roll("1d6");
      diceRolls.push(roll);
      if (this.isMonsterRechargeRollSuccessful(recharge, roll.total)) {
        rechargedCount += 1;
      } else {
        remainingActorActions[actionId] = entry;
      }
    }

    if (rechargedCount === 0) {
      return { rechargedCount, diceRolls };
    }

    const nextExpended = { ...expended };
    if (Object.keys(remainingActorActions).length > 0) {
      nextExpended[actor.id] = remainingActorActions;
    } else {
      delete nextExpended[actor.id];
    }

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [MONSTER_RECHARGE_EXPENDED_FLAG]: nextExpended,
        }),
      },
    });

    return { rechargedCount, diceRolls };
  }

  private async assertMonsterRechargeActionAvailable(
    sessionId: string,
    actor: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<void> {
    if (!this.isRechargeMonsterAction(action)) {
      return;
    }

    const { state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const expended = this.parseMonsterRechargeExpended(flags[MONSTER_RECHARGE_EXPENDED_FLAG]);
    if (expended[actor.id]?.[action.actionId]) {
      throw conflict("COMBAT_409", "아직 재충전되지 않은 몬스터 행동입니다.", {
        reason: "MONSTER_RECHARGE_ACTION_EXPENDED",
        actorParticipantId: actor.id,
        actionId: action.actionId,
        recharge: action.recharge ?? null,
      });
    }
  }

  private async recordMonsterRechargeActionExpended(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<void> {
    if (!this.isRechargeMonsterAction(action)) {
      return;
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const expended = this.parseMonsterRechargeExpended(flags[MONSTER_RECHARGE_EXPENDED_FLAG]);
    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [MONSTER_RECHARGE_EXPENDED_FLAG]: {
            ...expended,
            [actor.id]: {
              ...(expended[actor.id] ?? {}),
              [action.actionId]: {
                recharge: action.recharge ?? null,
                roundNo: combat.roundNo,
                turnNo: combat.turnNo,
              },
            },
          },
        }),
      },
    });
  }

  private resolveAoeCover(
    map: VttMapStateDto,
    origin: { x: number; y: number },
    target: CombatParticipantEntity,
    appliesToDexteritySave: boolean,
  ): CoverModifierProduced {
    const targetToken = this.findParticipantToken(map, target);
    const coverResolution =
      targetToken
        ? this.coverPositions.resolveCover({
            attacker: this.mapPointToGridPoint(map, origin),
            target: this.toCoverGridPoint(map, targetToken),
            blockers: this.mapCoverBlockers(map),
          })
        : this.coverPositions.resolveCover({
            attacker: { x: 0, y: 0 },
            target: { x: 0, y: 0 },
            blockers: [],
          });

    return this.ruleEngine.resolveCoverModifiers({
      coverLevel: coverResolution.coverLevel,
      appliesToAttackRoll: false,
      appliesToDexteritySave,
    }).produced;
  }

  private async assertMonsterLimitedUseActionAvailable(
    sessionId: string,
    actor: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<void> {
    const limit = this.resolveMonsterLimitedUseLimit(action);
    if (limit === null) {
      return;
    }

    const { state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const expended = this.parseMonsterLimitedUseExpended(flags[MONSTER_LIMITED_USE_EXPENDED_FLAG]);
    const used = this.extractMonsterLimitedUseUsed(expended[actor.id]?.[action.actionId]);
    if (used >= limit) {
      throw conflict("COMBAT_409", "사용 횟수가 남지 않은 몬스터 행동입니다.", {
        reason: "MONSTER_LIMITED_USE_ACTION_EXPENDED",
        actorParticipantId: actor.id,
        actionId: action.actionId,
        usage: action.usage ?? null,
        used,
        limit,
      });
    }
  }

  private async recordMonsterLimitedUseActionExpended(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<void> {
    const limit = this.resolveMonsterLimitedUseLimit(action);
    if (limit === null) {
      return;
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const expended = this.parseMonsterLimitedUseExpended(flags[MONSTER_LIMITED_USE_EXPENDED_FLAG]);
    const used = this.extractMonsterLimitedUseUsed(expended[actor.id]?.[action.actionId]) + 1;
    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [MONSTER_LIMITED_USE_EXPENDED_FLAG]: {
            ...expended,
            [actor.id]: {
              ...(expended[actor.id] ?? {}),
              [action.actionId]: {
                usage: action.usage ?? null,
                used,
                limit,
                roundNo: combat.roundNo,
                turnNo: combat.turnNo,
              },
            },
          },
        }),
      },
    });
  }

  private isRechargeMonsterAction(action: SrdEngineExecutableMonsterAction): boolean {
    return typeof action.recharge === "string" && action.recharge.trim().length > 0;
  }

  private resolveMonsterLimitedUseLimit(action: SrdEngineExecutableMonsterAction): number | null {
    if (typeof action.usage !== "string") {
      return null;
    }
    const match = action.usage.trim().match(/^(\d+)\s*\/\s*(day|combat|rest)$/i);
    if (!match) {
      return null;
    }
    const limit = Number(match[1]);
    return Number.isInteger(limit) && limit > 0 ? limit : null;
  }

  private extractMonsterLimitedUseUsed(entry: unknown): number {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return 0;
    }
    const used = (entry as { used?: unknown }).used;
    return typeof used === "number" && Number.isInteger(used) && used > 0 ? used : 0;
  }

  private extractMonsterRechargeValue(entry: unknown): string | null {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const recharge = (entry as { recharge?: unknown }).recharge;
    return typeof recharge === "string" && recharge.trim() ? recharge.trim() : null;
  }

  private isMonsterRechargeRollSuccessful(recharge: string, rollTotal: number): boolean {
    const match = recharge.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) {
      return false;
    }
    const min = Number(match[1]);
    const max = match[2] ? Number(match[2]) : min;
    return rollTotal >= min && rollTotal <= max;
  }

  private parseMonsterRechargeExpended(value: unknown): Record<string, Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const result: Record<string, Record<string, unknown>> = {};
    for (const [participantId, actions] of Object.entries(value)) {
      if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
        continue;
      }
      result[participantId] = { ...(actions as Record<string, unknown>) };
    }
    return result;
  }

  private parseMonsterLimitedUseExpended(value: unknown): Record<string, Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const result: Record<string, Record<string, unknown>> = {};
    for (const [participantId, actions] of Object.entries(value)) {
      if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
        continue;
      }
      result[participantId] = { ...(actions as Record<string, unknown>) };
    }
    return result;
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

  private normalizeCombatMovementPath(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    requestedPath: Array<{ x: number; y: number }> | null | undefined,
    to: { x: number; y: number },
  ): Array<{ x: number; y: number }> {
    const points = [
      { x: token.x, y: token.y },
      ...(requestedPath ?? []),
      to,
    ];
    const normalized: Array<{ x: number; y: number }> = [];
    for (const point of points) {
      const next = {
        x: this.clampNumber(Math.floor(point.x), 0, Math.max(0, map.width - token.size)),
        y: this.clampNumber(Math.floor(point.y), 0, Math.max(0, map.height - token.size)),
      };
      const previous = normalized[normalized.length - 1];
      if (!previous || previous.x !== next.x || previous.y !== next.y) {
        normalized.push(next);
      }
    }
    return normalized.length ? normalized : [{ x: token.x, y: token.y }];
  }

  private calculateMovementPathDistanceFt(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    path: Array<{ x: number; y: number }>,
  ): number {
    let distanceFt = 0;
    for (let index = 1; index < path.length; index += 1) {
      distanceFt += this.getTokenGridDistanceFt(
        map,
        { ...token, ...path[index - 1] },
        { ...token, ...path[index] },
      );
    }
    return distanceFt;
  }

  private calculateTerrainAdjustedMovementCostFt(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    path: Array<{ x: number; y: number }>,
  ): number {
    let costFt = 0;
    for (let index = 1; index < path.length; index += 1) {
      const segmentDistanceFt = this.getTokenGridDistanceFt(
        map,
        { ...token, ...path[index - 1] },
        { ...token, ...path[index] },
      );
      const multiplier = this.resolveMovementCostMultiplierAtPoint(map, path[index]);
      costFt += segmentDistanceFt * multiplier;
    }
    return costFt;
  }

  private resolveMovementCostMultiplierAtPoint(
    map: VttMapStateDto,
    point: { x: number; y: number },
  ): number {
    const terrainEffectIds = this.resolveTerrainEffectIdsAtPoint(map, point);
    if (!terrainEffectIds.length) {
      return 1;
    }
    return this.terrainEffects.resolveCombinedEffects(terrainEffectIds).movementCostMultiplier;
  }

  private resolveEnteredTerrainEffectsForMovement(
    map: VttMapStateDto,
    path: Array<{ x: number; y: number }>,
  ): EnteredTerrainEffect[] {
    const seen = new Set<string>();
    const entered: EnteredTerrainEffect[] = [];
    for (let index = 1; index < path.length; index += 1) {
      const point = path[index];
      const gridPoint = this.mapPointToGridPoint(map, point);
      for (const enteredEffect of this.resolveTerrainEffectsAtPoint(map, point)) {
        const terrainEffectId = enteredEffect.terrainEffectId;
        const key = `${gridPoint.x}:${gridPoint.y}:${terrainEffectId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        entered.push(enteredEffect);
      }
    }
    return entered;
  }

  private resolveTerrainEffectsAtPoint(
    map: VttMapStateDto,
    point: { x: number; y: number },
  ): EnteredTerrainEffect[] {
    return this.resolveTerrainEffectIdsAtPoint(map, point).flatMap((terrainEffectId) => {
      const effect = this.terrainEffects.resolveEffect(terrainEffectId);
      return effect ? [{ terrainEffectId, effect }] : [];
    });
  }

  private resolveTerrainEffectIdsAtPoint(
    map: VttMapStateDto,
    point: { x: number; y: number },
  ): string[] {
    const gridPoint = this.mapPointToGridPoint(map, point);
    return (map.terrainCells ?? [])
      .filter((cell) => this.cellGridPoints(map, cell).some((cellPoint) =>
        cellPoint.x === gridPoint.x && cellPoint.y === gridPoint.y,
      ))
      .map((cell) => this.extractTerrainEffectId(cell))
      .filter((terrainEffectId): terrainEffectId is string => terrainEffectId !== null);
  }

  private assertCombatMovementPathOpen(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    path: Array<{ x: number; y: number }>,
    movementMode: "normal" | "jump",
  ): void {
    for (let index = 1; index < path.length; index += 1) {
      const point = path[index];
      const isDestination = index === path.length - 1;
      const ignoreTokens = movementMode === "jump" && !isDestination;
      if (this.isCombatTokenPlacementBlocked(map, token, point.x, point.y, { ignoreTokens })) {
        throw conflict("COMBAT_409", "이동 경로가 막혀 있습니다.", {
          reason: isDestination ? "DESTINATION_BLOCKED" : "MOVEMENT_PATH_BLOCKED",
          movementMode,
        });
      }
    }
  }

  private calculateCombatTokenStepTowardTarget(
    map: VttMapStateDto,
    params: {
      sourceTokenId: string;
      targetTokenId: string;
      maxDistanceFt: number;
      stopWithinFt: number;
    },
  ): { x: number; y: number; distanceMovedFt: number; path: Array<{ x: number; y: number }> } | null {
    const sourceToken = map.tokens.find((token) => token.id === params.sourceTokenId);
    const targetToken = map.tokens.find((token) => token.id === params.targetTokenId);
    if (!sourceToken || !targetToken) {
      return null;
    }

    const startColumn = this.getGridIndex(sourceToken.x, map.gridSize, map.width);
    const startRow = this.getGridIndex(sourceToken.y, map.gridSize, map.height);
    const targetColumn = this.getGridIndex(targetToken.x, map.gridSize, map.width);
    const targetRow = this.getGridIndex(targetToken.y, map.gridSize, map.height);
    const stopWithinCells = Math.max(1, Math.ceil(params.stopWithinFt / 5));
    const maxSteps = Math.max(0, Math.floor(params.maxDistanceFt / 5));
    if (!maxSteps || this.getChebyshevDistance(startColumn, startRow, targetColumn, targetRow) <= stopWithinCells) {
      return null;
    }

    const maxColumn = Math.max(0, Math.ceil(map.width / map.gridSize) - 1);
    const maxRow = Math.max(0, Math.ceil(map.height / map.gridSize) - 1);
    type MovementNode = {
      column: number;
      row: number;
      steps: number;
      previousKey: string | null;
    };
    const startKey = `${startColumn}:${startRow}`;
    const queue: MovementNode[] = [{ column: startColumn, row: startRow, steps: 0, previousKey: null }];
    const visited = new Set([startKey]);
    const nodeByKey = new Map<string, MovementNode>([[startKey, queue[0]]]);
    const reachable: Array<MovementNode & { targetDistance: number }> = [];
    const directions = [
      { column: 1, row: 0 },
      { column: -1, row: 0 },
      { column: 0, row: 1 },
      { column: 0, row: -1 },
      { column: 1, row: 1 },
      { column: 1, row: -1 },
      { column: -1, row: 1 },
      { column: -1, row: -1 },
    ];

    while (queue.length) {
      const current = queue.shift()!;
      const targetDistance = this.getChebyshevDistance(
        current.column,
        current.row,
        targetColumn,
        targetRow,
      );
      if (current.steps > 0 && targetDistance >= stopWithinCells) {
        reachable.push({ ...current, targetDistance });
      }
      if (current.steps >= maxSteps) {
        continue;
      }

      for (const direction of directions) {
        const next = {
          column: current.column + direction.column,
          row: current.row + direction.row,
          steps: current.steps + 1,
          previousKey: `${current.column}:${current.row}`,
        };
        const key = `${next.column}:${next.row}`;
        if (
          next.column < 0 ||
          next.row < 0 ||
          next.column > maxColumn ||
          next.row > maxRow ||
          visited.has(key)
        ) {
          continue;
        }

        const x = Math.min(Math.max(next.column * map.gridSize, 0), map.width - sourceToken.size);
        const y = Math.min(Math.max(next.row * map.gridSize, 0), map.height - sourceToken.size);
        if (
          this.isCombatTokenPlacementBlocked(map, sourceToken, x, y) ||
          !this.canCombatTokenMoveBetweenGridCells(map, sourceToken, current, next)
        ) {
          continue;
        }

        visited.add(key);
        nodeByKey.set(key, next);
        queue.push(next);
      }
    }

    const best = reachable.sort((left, right) => {
      if (left.targetDistance !== right.targetDistance) {
        return left.targetDistance - right.targetDistance;
      }
      return right.steps - left.steps;
    })[0];
    if (!best || (best.column === startColumn && best.row === startRow)) {
      return null;
    }

    const path = this.buildCombatTokenMovementPath(map, sourceToken, best, nodeByKey);
    if (!path.length) {
      return null;
    }

    const destination = path[path.length - 1];
    return {
      x: destination.x,
      y: destination.y,
      distanceMovedFt: best.steps * 5,
      path,
    };
  }

  private buildCombatTokenMovementPath(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    destination: { column: number; row: number; previousKey: string | null },
    nodeByKey: Map<string, { column: number; row: number; previousKey: string | null }>,
  ): Array<{ x: number; y: number }> {
    const cells: Array<{ column: number; row: number }> = [];
    let current: { column: number; row: number; previousKey: string | null } | undefined = destination;

    while (current) {
      cells.push({ column: current.column, row: current.row });
      current = current.previousKey ? nodeByKey.get(current.previousKey) : undefined;
    }

    return cells
      .reverse()
      .slice(1)
      .map((cell) => ({
        x: Math.min(Math.max(cell.column * map.gridSize, 0), map.width - token.size),
        y: Math.min(Math.max(cell.row * map.gridSize, 0), map.height - token.size),
      }));
  }

  private canCombatTokenMoveBetweenGridCells(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    from: { column: number; row: number },
    to: { column: number; row: number },
  ): boolean {
    const deltaColumn = to.column - from.column;
    const deltaRow = to.row - from.row;
    if (Math.abs(deltaColumn) !== 1 || Math.abs(deltaRow) !== 1) {
      return true;
    }

    const horizontalX = Math.min(Math.max((from.column + deltaColumn) * map.gridSize, 0), map.width - token.size);
    const horizontalY = Math.min(Math.max(from.row * map.gridSize, 0), map.height - token.size);
    const verticalX = Math.min(Math.max(from.column * map.gridSize, 0), map.width - token.size);
    const verticalY = Math.min(Math.max((from.row + deltaRow) * map.gridSize, 0), map.height - token.size);

    return (
      !this.isCombatTokenPlacementBlocked(map, token, horizontalX, horizontalY) &&
      !this.isCombatTokenPlacementBlocked(map, token, verticalX, verticalY)
    );
  }

  private getChebyshevDistance(
    sourceColumn: number,
    sourceRow: number,
    targetColumn: number,
    targetRow: number,
  ): number {
    return Math.max(Math.abs(sourceColumn - targetColumn), Math.abs(sourceRow - targetRow));
  }

  private isCombatTokenPlacementBlocked(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    x: number,
    y: number,
    options: { ignoreTokens?: boolean } = {},
  ): boolean {
    const blockers = [
      ...(map.wallCells ?? []),
      ...(map.doorCells ?? []).filter((door) => door.state !== "open" && door.state !== "broken"),
      ...(options.ignoreTokens
        ? []
        : map.tokens
            .filter((otherToken) => otherToken.id !== token.id && otherToken.hidden !== true)
            .map((otherToken) => ({
              x: otherToken.x,
              y: otherToken.y,
              width: otherToken.size,
              height: otherToken.size,
            }))),
    ];
    const tokenRect = { x, y, width: token.size, height: token.size };
    return blockers.some((blocker) => this.rectsOverlap(tokenRect, blocker));
  }

  private rectsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  private doesMovementLeaveThreatenedArea(
    map: VttMapStateDto,
    threatenerToken: VttMapStateDto["tokens"][number],
    moverToken: VttMapStateDto["tokens"][number],
    moverPath: Array<{ x: number; y: number }>,
  ): boolean {
    for (let index = 1; index < moverPath.length; index += 1) {
      const previousMoverToken = { ...moverToken, ...moverPath[index - 1] };
      const nextMoverToken = { ...moverToken, ...moverPath[index] };
      const wasAdjacent = this.getTokenGridDistanceFt(map, threatenerToken, previousMoverToken) <= 5;
      const isAdjacentAfter = this.getTokenGridDistanceFt(map, threatenerToken, nextMoverToken) <= 5;
      if (wasAdjacent && !isAdjacentAfter) {
        return true;
      }
    }
    return false;
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
    await this.storePendingOpportunityReaction(params.sessionId, pending);

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
    const moverConditions = this.combatConditionTags(await this.readCombatConditionEntries(params.mover));
    if (moverConditions.includes(COMBAT_CONDITION_DISENGAGE)) {
      return [];
    }
    const reactors: CombatParticipantEntity[] = [];
    for (const candidate of params.combat.participants) {
      if (
        candidate.id === params.mover.id ||
        !candidate.isAlive ||
        candidate.isHostile === params.mover.isHostile
      ) {
        continue;
      }
      const token = this.findParticipantToken(params.map, candidate);
      if (!token) {
        continue;
      }
      if (!this.doesMovementLeaveThreatenedArea(params.map, token, params.moverToken, params.movementPath)) {
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

  private normalizeSpellId(spellId: string): string {
    const normalized = spellId.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return normalized.startsWith("spell.") ? normalized : `spell.${normalized}`;
  }

  private async getSessionCharacterForSpell(sessionCharacterId: string) {
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: sessionCharacterId },
      include: { character: true },
    });
    if (!sessionCharacter) {
      throw notFound("COMBAT_404", "주문 시전자 캐릭터를 찾을 수 없습니다.", { reason: "SPELL_CASTER_NOT_FOUND" });
    }
    return sessionCharacter;
  }

  private assertMvpSpellKnown(
    sessionCharacter: {
      character: {
        className: string;
        spellsJson: string | null;
      };
    },
    spellId: string,
  ): void {
    const allowed = new Set([
      "spell.chill_touch",
      "spell.cure_wounds",
      "spell.fire_bolt",
      "spell.ray_of_frost",
      "spell.fireball",
      "spell.light",
      "spell.magic_missile",
      "spell.shield",
      "spell.sleep",
    ]);
    if (!allowed.has(spellId)) {
      throw conflict("COMBAT_409", "MVP 범위 밖의 주문입니다.", { reason: "SPELL_NOT_MVP", spellId });
    }
    const spells = this.parseJson<{ cantrips?: string[]; spells?: string[]; preparedSpells?: string[] } | null>(
      sessionCharacter.character.spellsJson,
      null,
    );
    const knownCantrips = (spells?.cantrips ?? []).map((value) => this.normalizeSpellId(value));
    const knownSpells = (spells?.spells ?? []).map((value) => this.normalizeSpellId(value));
    if (knownCantrips.includes(spellId)) return;

    const baseSpellLevel = this.resolveCombatBaseSpellLevel(spellId);
    const preparedSpells = Array.isArray(spells?.preparedSpells)
      ? spells.preparedSpells.map((value) => this.normalizeSpellId(value))
      : null;
    if (preparedSpells && baseSpellLevel > 0) {
      if (knownSpells.includes(spellId) && preparedSpells.includes(spellId)) return;
      if (knownSpells.includes(spellId)) {
        throw conflict("COMBAT_409", "준비되지 않은 주문입니다.", { reason: "SPELL_NOT_PREPARED", spellId });
      }
    }

    if (knownSpells.includes(spellId)) return;
    throw conflict("COMBAT_409", "해당 캐릭터가 익힌 주문이 아닙니다.", { reason: "SPELL_NOT_KNOWN", spellId });
  }

  private resolveCombatSpellSlotLevel(spellId: string, requestedSlotLevel: number | null | undefined): number {
    const baseSpellLevel = this.resolveCombatBaseSpellLevel(spellId);
    const slotLevel = requestedSlotLevel ?? baseSpellLevel;
    if (!Number.isInteger(slotLevel) || slotLevel < 0 || slotLevel > 9) {
      throw conflict("COMBAT_409", "주문 슬롯 레벨이 유효하지 않습니다.", {
        reason: "INVALID_SPELL_SLOT_LEVEL",
        spellId,
        slotLevel,
      });
    }
    if (baseSpellLevel === 0 && slotLevel !== 0) {
      throw conflict("COMBAT_409", "Cantrip은 주문 슬롯을 사용하지 않습니다.", {
        reason: "CANTRIP_SLOT_LEVEL_NOT_ALLOWED",
        spellId,
        slotLevel,
      });
    }
    if (slotLevel < baseSpellLevel) {
      throw conflict("COMBAT_409", "주문 슬롯 레벨이 주문 레벨보다 낮습니다.", {
        reason: "SPELL_SLOT_BELOW_SPELL_LEVEL",
        spellId,
        baseSpellLevel,
        slotLevel,
      });
    }
    return slotLevel;
  }

  private resolveCombatBaseSpellLevel(spellId: string): number {
    const catalogSpellLevel = this.resolveCombatSpellLevel(this.resolveCombatSpellDefinition(spellId));
    if (catalogSpellLevel !== null) {
      return catalogSpellLevel;
    }
    switch (spellId) {
      case "spell.fire_bolt":
      case "spell.chill_touch":
      case "spell.ray_of_frost":
      case "spell.light":
        return 0;
      case "spell.cure_wounds":
      case "spell.magic_missile":
      case "spell.shield":
      case "spell.sleep":
        return 1;
      case "spell.fireball":
        return 3;
      default:
        return 0;
    }
  }

  private resolveCombatSpellDefinition(spellId: string): RuleCatalogEntry | null {
    const entry = this.ruleCatalog.getEntry(spellId);
    return entry?.kind === "spell_definitions" ? entry : null;
  }

  private resolveCombatSpellLevel(spellDefinition: RuleCatalogEntry | null): number | null {
    const spellLevelTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("spell_level:"));
    const spellLevel = Number(spellLevelTag?.slice("spell_level:".length));
    return Number.isInteger(spellLevel) && spellLevel >= 0 ? spellLevel : null;
  }

  private resolveCombatSpellScalingFromCatalog(
    spellDefinition: RuleCatalogEntry | null,
    slotLevel: number,
  ): SpellScalingResult {
    if (!spellDefinition) {
      throw conflict("COMBAT_409", "주문 정의를 찾을 수 없습니다.", {
        reason: "SPELL_DEFINITION_NOT_FOUND",
      });
    }
    return this.resolveCombatSpellScaling({
      spellId: spellDefinition.id,
      baseSpellLevel: this.resolveCombatSpellLevel(spellDefinition) ?? 0,
      slotLevel,
      baseDamageDice: this.resolveCombatSpellBaseDamageDice(spellDefinition),
      baseTargetCount: this.resolveCombatSpellBaseTargetCount(spellDefinition),
      scalingRules: this.toCombatSpellScalingRules(spellDefinition),
    });
  }

  private resolveCombatAreaTargeting(
    spellDefinition: RuleCatalogEntry | null,
    spellId: string,
  ): Extract<RuleCatalogEntry["targeting"], { type: "area" }> {
    if (spellDefinition?.targeting.type !== "area") {
      throw conflict("COMBAT_409", "범위 주문 정의가 유효하지 않습니다.", {
        reason: "SPELL_AREA_TARGETING_REQUIRED",
        spellId,
      });
    }
    return spellDefinition.targeting;
  }

  private resolveCombatSpellRangeFt(spellDefinition: RuleCatalogEntry | null, fallback: number): number {
    if (spellDefinition?.targeting.type === "creature" && spellDefinition.targeting.rangeFt !== null) {
      return spellDefinition.targeting.rangeFt;
    }
    const rangeTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("range:"));
    const rangeFt = Number(rangeTag?.slice("range:".length));
    return Number.isInteger(rangeFt) && rangeFt > 0 ? rangeFt : fallback;
  }

  private resolveCombatSpellSaveAbility(
    spellDefinition: RuleCatalogEntry | null,
    fallback: SavingThrowAbility,
  ): SavingThrowAbility {
    return spellDefinition?.save?.ability ?? fallback;
  }

  private resolveCombatSpellDamageType(spellDefinition: RuleCatalogEntry | null, fallback: string): string {
    return spellDefinition?.damage?.type ?? fallback;
  }

  private resolveCombatSpellHalfDamageOnSuccess(spellDefinition: RuleCatalogEntry | null): boolean {
    return spellDefinition?.runtimeEffect.tags.includes("half_damage_on_success") ?? true;
  }

  private resolveCombatLightRadiusFt(spellDefinition: RuleCatalogEntry | null): number {
    const radiusTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("light_radius:"));
    const radiusFt = Number(radiusTag?.slice("light_radius:".length));
    return Number.isInteger(radiusFt) && radiusFt > 0 ? radiusFt : 40;
  }

  private resolveCombatSpellBaseDamageDice(spellDefinition: RuleCatalogEntry | null): string | null {
    const poolTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("hit_point_pool:"));
    return poolTag?.slice("hit_point_pool:".length) ?? spellDefinition?.damage?.dice ?? null;
  }

  private resolveCombatSpellBaseTargetCount(spellDefinition: RuleCatalogEntry): number | null {
    const missileTag = spellDefinition.runtimeEffect.tags.find((tag) => tag.startsWith("missile_count:"));
    const missileCount = Number(missileTag?.slice("missile_count:".length));
    if (Number.isInteger(missileCount) && missileCount > 0) {
      return missileCount;
    }
    return spellDefinition.targeting.type === "creature" ? 1 : null;
  }

  private resolveMagicMissileDamageDice(
    spellDefinition: RuleCatalogEntry | null,
    missileCount: number,
  ): string {
    const damageDice = spellDefinition?.damage?.dice ?? "3d4+3";
    const normalizedMissileCount = Number.isInteger(missileCount) && missileCount > 0 ? missileCount : 3;
    const match = damageDice.trim().toLowerCase().match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!match) {
      return "1d4+1";
    }

    const diceCount = Number(match[1]);
    const diceSides = Number(match[2]);
    const modifier = match[3] ? Number(match[3]) : 0;
    if (
      diceCount <= 0 ||
      diceSides <= 0 ||
      diceCount % normalizedMissileCount !== 0 ||
      modifier % normalizedMissileCount !== 0
    ) {
      return "1d4+1";
    }

    const perMissileDiceCount = diceCount / normalizedMissileCount;
    const perMissileModifier = modifier / normalizedMissileCount;
    const modifierText =
      perMissileModifier === 0
        ? ""
        : perMissileModifier > 0
          ? `+${perMissileModifier}`
          : String(perMissileModifier);
    return `${perMissileDiceCount}d${diceSides}${modifierText}`;
  }

  private toCombatSpellScalingRules(spellDefinition: RuleCatalogEntry): SpellScalingRule[] {
    const table = spellDefinition.scaling?.table;
    if (!table || typeof table !== "object" || Array.isArray(table)) {
      return [];
    }

    const mode = table.mode;
    switch (mode) {
      case "damage_dice":
        return typeof table.dice === "string"
          ? [{ mode, dice: table.dice, perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove) }]
          : [];
      case "target_count":
      case "summon_count":
        return typeof table.count === "number"
          ? [{ mode, count: table.count, perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove) }]
          : [];
      case "duration":
        return typeof table.unit === "string" && typeof table.amountPerSlotAbove === "number"
          ? [{
              mode,
              unit: table.unit as "round" | "minute" | "hour" | "day",
              amountPerSlotAbove: table.amountPerSlotAbove,
              perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove),
            }]
          : [];
      default:
        return [];
    }
  }

  private toOptionalPositiveInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private resolveCombatSpellScaling(input: {
    spellId: string;
    baseSpellLevel: number;
    slotLevel: number;
    baseDamageDice?: string | null;
    baseTargetCount?: number | null;
    scalingRules: SpellScalingRule[];
  }): SpellScalingResult {
    try {
      return this.spellScaling.resolveUpcast(input);
    } catch (error) {
      throw conflict("COMBAT_409", "주문 슬롯 스케일링을 적용할 수 없습니다.", {
        reason: "INVALID_SPELL_SCALING",
        spellId: input.spellId,
        slotLevel: input.slotLevel,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async resolveSpellAttackBonus(sessionCharacterId: string): Promise<number> {
    const sessionCharacter = await this.getSessionCharacterForSpell(sessionCharacterId);
    const abilities = this.parseJson<Record<string, number>>(sessionCharacter.character.abilitiesJson, {});
    return sessionCharacter.character.proficiencyBonus + this.getAbilityModifier(abilities.int);
  }

  private async resolveSpellcastingAbilityModifier(sessionCharacterId: string): Promise<number> {
    const sessionCharacter = await this.getSessionCharacterForSpell(sessionCharacterId);
    const abilities = this.parseJson<Record<string, number>>(sessionCharacter.character.abilitiesJson, {});
    const classKey = sessionCharacter.character.className.trim().toLowerCase();
    let abilityKey = "int";
    if (classKey === "cleric" || classKey === "druid" || classKey === "ranger") {
      abilityKey = "wis";
    } else if (
      classKey === "bard" ||
      classKey === "paladin" ||
      classKey === "sorcerer" ||
      classKey === "warlock"
    ) {
      abilityKey = "cha";
    }
    return this.getAbilityModifier(abilities[abilityKey] ?? 10);
  }

  private async resolveCombatSpellSaveDc(sessionCharacterId: string): Promise<number> {
    const sessionCharacter = await this.getSessionCharacterForSpell(sessionCharacterId);
    const abilities = this.parseJson<Record<string, number>>(sessionCharacter.character.abilitiesJson, {});
    return 8 + sessionCharacter.character.proficiencyBonus + this.getAbilityModifier(abilities.int);
  }

  private async toCombatAoeDamageTarget(
    participant: CombatParticipantEntity,
    map: VttMapStateDto,
    saveAbility: SavingThrowAbility,
    cover?: CoverModifierProduced,
  ): Promise<AoeDamageTarget> {
    const damageTags = this.combatConditionTags(await this.readCombatConditionEntries(participant));
    const coverSaveBonus =
      cover && cover.dexteritySaveBonus > 0
        ? [{ source: `cover:${cover.coverLevel}:dex_save`, value: cover.dexteritySaveBonus }]
        : undefined;
    if (!participant.sessionCharacterId) {
      const token = this.findParticipantToken(map, participant);
      return {
        id: participant.id,
        currentHp: participant.currentHp ?? participant.maxHp ?? DEFAULT_MONSTER_HP,
        abilityModifiers: {
          [saveAbility]: saveAbility === "dex" && token ? this.resolveMonsterDexterityModifier(token) : 0,
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
    const abilities = this.parseJson<Record<string, number>>(
      sessionCharacter?.character.abilitiesJson ?? "{}",
      {},
    );
    const proficientSaves = damageTags.flatMap((tag) => {
      const ability = tag.startsWith("save_proficiency:")
        ? tag.slice("save_proficiency:".length)
        : null;
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
      .map((tag) => tag.trim().toLowerCase().replace(/[\s_]+/g, "_"))
      .filter((tag) => tag.startsWith(tokenPrefix))
      .map((tag) => tag.slice(tokenPrefix.length));
  }

  private isSavingThrowAbility(value: unknown): value is SavingThrowAbility {
    return value === "str" || value === "dex" || value === "con" || value === "int" || value === "wis" || value === "cha";
  }

  private async resolveCharacterLevel(sessionCharacterId: string): Promise<number> {
    const sessionCharacter = await this.getSessionCharacterForSpell(sessionCharacterId);
    return sessionCharacter.character.level;
  }

  private resolveCantripDamageDice(baseDice: string, level: number): string {
    if (level >= 17) return baseDice.replace(/^1d/, "4d");
    if (level >= 11) return baseDice.replace(/^1d/, "3d");
    if (level >= 5) return baseDice.replace(/^1d/, "2d");
    return baseDice;
  }

  private async spendSpellSlot(sessionId: string, sessionCharacterId: string, slotLevel: number): Promise<void> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const spellSlots = this.parseJson<Record<string, Record<string, number>>>(
      JSON.stringify(flags.spellSlotsBySessionCharacterId ?? {}),
      {},
    );
    const key = String(slotLevel);
    const maximumSlots = await this.resolveSpellSlotMaximum(sessionCharacterId, slotLevel);
    const characterSlots = spellSlots[sessionCharacterId] ?? { [key]: maximumSlots };
    const remaining = Math.max(0, Math.floor(characterSlots[key] ?? maximumSlots));
    if (remaining <= 0) {
      throw conflict("COMBAT_409", `사용 가능한 ${slotLevel}레벨 주문 슬롯이 없습니다.`, { reason: "NO_SPELL_SLOT" });
    }
    spellSlots[sessionCharacterId] = { ...characterSlots, [key]: remaining - 1 };
    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: { flagsJson: JSON.stringify({ ...flags, spellSlotsBySessionCharacterId: spellSlots }) },
    });
  }

  private async assertSpellSlotAvailable(
    sessionId: string,
    sessionCharacterId: string,
    slotLevel: number,
  ): Promise<void> {
    if (slotLevel < 1) return;
    if ((await this.getRemainingSpellSlots(sessionId, sessionCharacterId, slotLevel)) <= 0) {
      throw conflict("COMBAT_409", `사용 가능한 ${slotLevel}레벨 주문 슬롯이 없습니다.`, {
        reason: "NO_SPELL_SLOT",
      });
    }
  }

  private assertSpellTargetInRange(
    map: VttMapStateDto,
    casterToken: VttMapStateDto["tokens"][number],
    target: CombatParticipantEntity,
    rangeFt: number,
  ): void {
    const targetToken = this.findParticipantToken(map, target);
    if (!targetToken || this.getTokenGridDistanceFt(map, casterToken, targetToken) > rangeFt) {
      throw conflict("COMBAT_409", "주문 대상이 사거리 밖입니다.", { reason: "SPELL_TARGET_OUT_OF_RANGE" });
    }
  }

  private assertSpellTargetLineOfEffect(
    map: VttMapStateDto,
    casterToken: VttMapStateDto["tokens"][number],
    target: CombatParticipantEntity,
  ): void {
    const targetToken = this.findParticipantToken(map, target);
    if (!targetToken) {
      return;
    }
    const coverResolution = this.coverPositions.resolveCover({
      attacker: this.toCoverGridPoint(map, casterToken),
      target: this.toCoverGridPoint(map, targetToken),
      blockers: this.mapCoverBlockers(map),
    });
    const coverRuleResult = this.ruleEngine.resolveCoverModifiers({
      coverLevel: coverResolution.coverLevel,
      appliesToAttackRoll: false,
      appliesToDexteritySave: false,
    });
    if (!coverRuleResult.produced.targetable) {
      throw conflict("COMBAT_409", "대상이 완전 엄폐 상태입니다.", {
        reason: "TARGET_HAS_FULL_COVER",
        coverLevel: coverRuleResult.produced.coverLevel,
      });
    }
  }

  private requireTargetPoint(
    map: VttMapStateDto,
    casterToken: VttMapStateDto["tokens"][number],
  ): { x: number; y: number } {
    return { x: casterToken.x, y: casterToken.y };
  }

  private assertPointInRange(
    map: VttMapStateDto,
    casterToken: VttMapStateDto["tokens"][number],
    point: { x: number; y: number },
    rangeFt: number,
  ): void {
    if (this.getGridPointDistanceFt(map, point, casterToken) > rangeFt) {
      throw conflict("COMBAT_409", "주문 지점이 사거리 밖입니다.", { reason: "SPELL_POINT_OUT_OF_RANGE" });
    }
  }

  private getGridPointDistanceFt(
    map: VttMapStateDto,
    point: { x: number; y: number },
    token: VttMapStateDto["tokens"][number],
  ): number {
    const pointToken = { ...token, x: point.x, y: point.y };
    return this.getTokenGridDistanceFt(map, pointToken, token);
  }

  private assertLightPointAllowed(map: VttMapStateDto, point: { x: number; y: number }): void {
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    const blocked = [
      ...(map.terrainCells ?? []),
      ...(map.wallCells ?? []),
      ...(map.doorCells ?? []).filter((door) => door.state !== "open" && door.state !== "broken"),
    ].some((cell) => x >= cell.x && x < cell.x + cell.width && y >= cell.y && y < cell.y + cell.height);
    if (blocked) {
      throw conflict("COMBAT_409", "Light는 벽이나 이동불가 타일에 사용할 수 없습니다.", { reason: "LIGHT_POINT_BLOCKED" });
    }
  }

  private async canPromptShieldReaction(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    target: CombatParticipantEntity,
  ): Promise<boolean> {
    if (!target.sessionCharacterId) return false;
    const sessionCharacter = await this.getSessionCharacterForSpell(target.sessionCharacterId);
    try {
      this.assertMvpSpellKnown(sessionCharacter, "spell.shield");
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
    return (await this.getRemainingSpellSlots(sessionId, target.sessionCharacterId, 1)) > 0;
  }

  private async getRemainingSpellSlots(sessionId: string, sessionCharacterId: string, slotLevel: number): Promise<number> {
    const { state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const spellSlots = this.parseJson<Record<string, Record<string, number>>>(
      JSON.stringify(flags.spellSlotsBySessionCharacterId ?? {}),
      {},
    );
    const maximumSlots = await this.resolveSpellSlotMaximum(sessionCharacterId, slotLevel);
    return Math.max(
      0,
      Math.min(
        maximumSlots,
        Math.floor(spellSlots[sessionCharacterId]?.[String(slotLevel)] ?? maximumSlots),
      ),
    );
  }

  private async resolveSpellSlotMaximum(sessionCharacterId: string, slotLevel: number): Promise<number> {
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
      throw conflict("COMBAT_409", "Shield 반응 사용자를 찾을 수 없습니다.", { reason: "SHIELD_USER_NOT_FOUND" });
    }
    await this.storePendingOpportunityReaction(params.sessionId, pending);
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
      await this.spendSpellSlot(sessionId, target.sessionCharacterId, 1);
    }
    const effectiveAc = pending.targetArmorClass + (accepted ? 5 : 0);
    const hit = pending.attackTotal >= effectiveAc;
    const damageRoll = hit ? this.diceService.roll(this.buildDamageExpression(pending.damageDice, pending.damageBonus, false)) : null;
    if (damageRoll && damageRoll.total > 0) {
      await this.applyHitPointDelta(combat, target, -damageRoll.total);
    }
    const concentrationCheck =
      damageRoll && damageRoll.total > 0
        ? await this.resolveCombatConcentrationDamageCheck(target, damageRoll.total)
        : null;
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

  private async resolveTriggeredReadyAction(
    userId: string,
    sessionId: string,
    triggeredId: string,
    accepted: boolean,
  ): Promise<CombatMoveResultDto> {
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
      const targetParticipantId =
        triggered.pending.heldAction.targetParticipantId ??
        triggered.triggerEvent.targetParticipantId;
      if (!targetParticipantId) {
        throw conflict("COMBAT_409", "준비행동 공격 대상이 없습니다.", {
          reason: "READY_ACTION_TARGET_NOT_FOUND",
        });
      }
      const weapon = actor.sessionCharacterId
        ? await this.resolveEquippedWeaponProfile(actor.sessionCharacterId)
        : this.resolveMonsterOpportunityWeapon(actor);
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
    const message =
      triggered.pending.heldAction.description?.trim() ||
      `${actor.nameSnapshot}이(가) 준비행동을 실행했습니다.`;
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

    const map = await this.sessionsService.getVttMapForUser(
      params.session.hostUserId,
      params.session.id,
    );
    const actorToken = this.findParticipantToken(map, params.actor);
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

    const spellId = this.normalizeSpellId(params.triggered.pending.heldAction.spellId ?? "");
    this.assertMvpSpellKnown(
      await this.getSessionCharacterForSpell(params.actor.sessionCharacterId),
      spellId,
    );

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

    const targetParticipantId =
      params.triggered.pending.heldAction.targetParticipantId ??
      params.triggered.triggerEvent.targetParticipantId;
    if (!targetParticipantId) {
      throw conflict("COMBAT_409", "준비 주문 대상이 없습니다.", {
        reason: "READY_SPELL_TARGET_NOT_FOUND",
      });
    }

    const map = await this.sessionsService.getVttMapForUser(
      params.session.hostUserId,
      params.session.id,
    );
    const casterToken = this.findParticipantToken(map, params.actor);
    if (!casterToken) {
      throw conflict("COMBAT_409", "준비 주문 시전자 토큰을 찾을 수 없습니다.", {
        reason: "READY_SPELL_CASTER_TOKEN_NOT_FOUND",
      });
    }
    const target = this.findCombatParticipantOrThrow(params.combat, targetParticipantId);
    this.assertSpellTargetInRange(
      map,
      casterToken,
      target,
      this.resolveCombatSpellRangeFt(this.resolveCombatSpellDefinition(spellId), 120),
    );

    const attackResult = await this.resolveAttack(
      params.userId,
      params.session.id,
      {
        attackerParticipantId: params.actor.id,
        targetParticipantId: target.id,
        attackBonus: await this.resolveSpellAttackBonus(params.actor.sessionCharacterId),
        damageDice: this.resolveCantripDamageDice(
          "1d10",
          await this.resolveCharacterLevel(params.actor.sessionCharacterId),
        ),
        damageBonus: 0,
      },
      {
        messagePrefix: `${params.actor.nameSnapshot} 준비 주문 Fire Bolt`,
        actionCost: "reaction",
        reactionUserId: params.userId,
      },
    );
    const latestMap = await this.sessionsService.getVttMapForUser(
      params.session.hostUserId,
      params.session.id,
    );
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

    const targetParticipantId =
      params.triggered.pending.heldAction.targetParticipantId ??
      params.triggered.triggerEvent.targetParticipantId;
    if (!targetParticipantId) {
      throw conflict("COMBAT_409", "준비 주문 대상이 없습니다.", {
        reason: "READY_SPELL_TARGET_NOT_FOUND",
      });
    }

    const map = await this.sessionsService.getVttMapForUser(
      params.session.hostUserId,
      params.session.id,
    );
    const casterToken = this.findParticipantToken(map, params.actor);
    if (!casterToken) {
      throw conflict("COMBAT_409", "준비 주문 시전자 토큰을 찾을 수 없습니다.", {
        reason: "READY_SPELL_CASTER_TOKEN_NOT_FOUND",
      });
    }
    const target = this.findCombatParticipantOrThrow(params.combat, targetParticipantId);
    this.assertSpellTargetInRange(
      map,
      casterToken,
      target,
      this.resolveCombatSpellRangeFt(this.resolveCombatSpellDefinition("spell.magic_missile"), 120),
    );
    this.assertSpellTargetLineOfEffect(map, casterToken, target);

    await this.actionEconomy.spendReaction({
      combatId: params.combat.id,
      combatParticipantId: params.actor.id,
      roundNo: params.combat.roundNo,
      turnNo: params.combat.turnNo,
      sessionCharacterId: params.actor.sessionCharacterId,
    });
    await this.spendSpellSlot(params.session.id, params.actor.sessionCharacterId, 1);

    const damageRoll = this.diceService.roll(
      this.resolveCombatSpellBaseDamageDice(this.resolveCombatSpellDefinition("spell.magic_missile")) ?? "3d4+3",
    );
    await this.applyHitPointDelta(params.combat, target, -damageRoll.total);
    const concentrationCheck = await this.resolveCombatConcentrationDamageCheck(target, damageRoll.total);
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
    this.realtimeEvents.emitSessionSnapshot(
      params.session.id,
      await this.sessionsService.buildSnapshot(params.session.id),
    );

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

  private findParticipantToken(
    map: VttMapStateDto,
    participant: CombatParticipantEntity,
  ): VttMapStateDto["tokens"][number] | null {
    if (participant.tokenId) {
      return map.tokens.find((token) => token.id === participant.tokenId && token.hidden !== true) ?? null;
    }
    if (!participant.sessionCharacterId) {
      const matchingHostileTokens = map.tokens.filter(
        (token) =>
          token.hidden !== true &&
          token.isHostile === true &&
          this.resolveTokenName(token).trim() === participant.nameSnapshot.trim(),
      );
      return matchingHostileTokens.length === 1 ? matchingHostileTokens[0] : null;
    }
    return (
      map.tokens.find(
        (token) =>
          token.sessionCharacterId === participant.sessionCharacterId && token.hidden !== true,
      ) ?? null
    );
  }

  private async storePendingOpportunityReaction(
    sessionId: string,
    pending: PendingCombatReaction,
  ): Promise<void> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [PENDING_COMBAT_REACTION_FLAG]: pending,
        }),
      },
    });
  }

  private async consumePendingOpportunityReaction(
    sessionId: string,
    reactionId: string,
  ): Promise<PendingCombatReaction> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const pending = flags[PENDING_COMBAT_REACTION_FLAG] as PendingCombatReaction | undefined;
    if (!pending || pending.id !== reactionId) {
      throw notFound("COMBAT_404", "처리할 반응 요청을 찾을 수 없습니다.", {
        reason: "PENDING_REACTION_NOT_FOUND",
      });
    }
    const { [PENDING_COMBAT_REACTION_FLAG]: _removed, ...nextFlags } = flags;
    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: { flagsJson: JSON.stringify(nextFlags) },
    });
    return pending;
  }

  private async consumeTriggeredReadyAction(
    sessionId: string,
    reactionId: string,
  ): Promise<TriggeredReadyAction> {
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
          [TRIGGERED_READY_ACTIONS_FLAG]: triggeredActions.filter(
            (candidate) => candidate.id !== reactionId,
          ),
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

  private async completeCombatIfResolved(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
  ): Promise<CombatResponseDto> {
    if (!this.isCombatResolved(combat)) {
      return this.mapCombat(combat);
    }

    return this.completeCombat(sessionId, combat.id);
  }

  private async completeCombat(sessionId: string, combatId: string): Promise<CombatResponseDto> {
    const combat = await this.getCombatEntityById(combatId);
    await this.clearCombatBoundMonsterLimitedUses(sessionId);
    if (this.isPartyDefeated(combat)) {
      await this.sessionsService.completeSessionAfterPartyDefeat(sessionId, combatId);
      return this.mapCombat(await this.getCombatEntityById(combatId));
    }

    await this.sessionsService.completeActiveCombatState(sessionId, combatId);
    return this.mapCombat(await this.getCombatEntityById(combatId));
  }

  private async clearCombatBoundMonsterLimitedUses(sessionId: string): Promise<void> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const expended = this.parseMonsterLimitedUseExpended(flags[MONSTER_LIMITED_USE_EXPENDED_FLAG]);
    let changed = false;
    const remaining: Record<string, Record<string, unknown>> = {};

    for (const [participantId, actions] of Object.entries(expended)) {
      const remainingActions: Record<string, unknown> = {};
      for (const [actionId, entry] of Object.entries(actions)) {
        if (this.isCombatBoundMonsterLimitedUse(entry)) {
          changed = true;
          continue;
        }
        remainingActions[actionId] = entry;
      }
      if (Object.keys(remainingActions).length > 0) {
        remaining[participantId] = remainingActions;
      } else {
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [MONSTER_LIMITED_USE_EXPENDED_FLAG]: remaining,
        }),
      },
    });
  }

  private isCombatBoundMonsterLimitedUse(entry: unknown): boolean {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    const usage = (entry as { usage?: unknown }).usage;
    return typeof usage === "string" && /^\d+\s*\/\s*combat$/i.test(usage.trim());
  }

  private isPartyDefeated(combat: NonNullable<CombatWithParticipants>): boolean {
    return combat.participants.filter((participant) => !participant.isHostile && participant.isAlive).length === 0;
  }

  private isCombatResolved(combat: NonNullable<CombatWithParticipants>): boolean {
    const aliveHostileCount = combat.participants.filter(
      (participant) => participant.isHostile && participant.isAlive,
    ).length;
    const alivePlayerCount = combat.participants.filter(
      (participant) => !participant.isHostile && participant.isAlive,
    ).length;

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

    if (
      participant?.role !== PrismaParticipantRole.HOST &&
      participant?.role !== PrismaParticipantRole.GM
    ) {
      throw forbidden("GM_403", "GM 권한이 필요합니다.", {
        reason: "GM_OR_HOST_REQUIRED",
      });
    }
  }

  private getGmRuntimeUserId(session: {
    hostUserId: string;
    gmMode?: PrismaGmMode;
    gmUserId?: string | null;
  }): string {
    return session.gmMode === PrismaGmMode.HUMAN
      ? (session.gmUserId ?? session.hostUserId)
      : session.hostUserId;
  }

  private async lockSessionRuntime(tx: unknown, sessionId: string): Promise<void> {
    const client = tx as { $executeRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> };
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

    if (this.isCombatParticipantIncapacitated(attacker)) {
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

  private async ensureReactionActorCanAct(
    userId: string,
    sessionId: string,
    reactor: CombatParticipantEntity,
  ): Promise<void> {
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

  private findCombatParticipantOrThrow(
    combat: NonNullable<CombatWithParticipants>,
    participantId: string,
  ): CombatParticipantEntity {
    const participant = combat.participants.find((candidate) => candidate.id === participantId);
    if (!participant) {
      throw notFound("COMBAT_404", "전투 참여자를 찾을 수 없습니다.", {
        reason: "COMBAT_PARTICIPANT_NOT_FOUND",
        participantId,
      });
    }
    return participant;
  }

  private async applyHitPointDelta(
    combat: NonNullable<CombatWithParticipants>,
    participant: CombatParticipantEntity,
    delta: number,
  ): Promise<void> {
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
      const nextHp = this.clampNumber(
        sessionCharacter.currentHp + delta,
        0,
        sessionCharacter.character.maxHp,
      );
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
        await this.wakeSleepingCombatParticipant(participant);
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
      await this.wakeSleepingCombatParticipant(participant);
    }
    if (nextHp <= 0 && participant.tokenId) {
      await this.sessionsService.hideVttToken(combat.sessionId, participant.tokenId);
    }
  }

  private async wakeSleepingCombatParticipant(participant: CombatParticipantEntity): Promise<void> {
    const current = await this.readCombatConditionEntries(participant);
    const tags = this.combatConditionTags(current);
    if (!tags.includes(COMBAT_CONDITION_SLEEP)) {
      return;
    }
    const remaining = current.filter((entry) => {
      const entryTags = this.conditionEntryTags(entry);
      return !entryTags.includes(COMBAT_CONDITION_SLEEP) &&
        !entryTags.includes(COMBAT_CONDITION_UNCONSCIOUS);
    });
    await this.writeCombatConditionEntries(participant, remaining);
  }

  private getCurrentPlayerParticipantOrThrow(
    combat: NonNullable<CombatWithParticipants>,
  ): CombatParticipantEntity {
    const actor = combat.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );
    if (!actor || actor.isHostile || !actor.sessionCharacterId || !actor.isAlive) {
      throw conflict("COMBAT_409", "현재 플레이어 캐릭터 턴이 아닙니다.", {
        reason: "CURRENT_TURN_IS_NOT_PLAYER_CHARACTER",
      });
    }
    return actor;
  }

  private async spendCurrentActionIfNeeded(
    combat: NonNullable<CombatWithParticipants>,
    attacker: CombatParticipantEntity,
  ): Promise<void> {
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

  private async spendCurrentBonusActionIfNeeded(
    combat: NonNullable<CombatWithParticipants>,
    attacker: CombatParticipantEntity,
  ): Promise<void> {
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

  private async addCombatCondition(
    participant: CombatParticipantEntity,
    condition: string,
  ): Promise<void> {
    const current = await this.readCombatConditionEntries(participant);
    if (!this.combatConditionTags(current).includes(condition)) {
      current.push(condition);
    }
    await this.writeCombatConditionEntries(participant, current);
  }

  private async addCombatConditionInstance(
    participant: CombatParticipantEntity,
    condition: ConditionInstance,
  ): Promise<void> {
    const current = await this.readCombatConditionEntries(participant);
    if (condition.stackPolicy === "replace") {
      await this.writeCombatConditionEntries(
        participant,
        [
          ...current.filter((entry) => !this.conditionEntryTags(entry).includes(condition.conditionId)),
          condition,
        ],
      );
      return;
    }
    if (
      condition.stackPolicy === "ignore_duplicate" &&
      this.combatConditionTags(current).includes(condition.conditionId)
    ) {
      return;
    }
    await this.writeCombatConditionEntries(participant, [...current, condition]);
  }

  private async removeCombatCondition(
    participant: CombatParticipantEntity,
    condition: string,
  ): Promise<void> {
    const current = await this.readCombatConditionEntries(participant);
    const next = current.filter((entry) => !this.conditionEntryTags(entry).includes(condition));
    if (next.length === current.length) {
      return;
    }
    await this.writeCombatConditionEntries(participant, next);
  }

  private async resolveTurnEndConditions(
    participant: CombatParticipantEntity,
    roundNo: number,
    turnNo: number,
  ): Promise<number> {
    const current = await this.readCombatConditionEntries(participant);
    if (current.length === 0) {
      return 0;
    }

    const parsed = this.conditionRuntime.parseConditionsJson(JSON.stringify(current));
    const resolution = this.conditionRuntime.resolveTurnEnd(parsed, { round: roundNo, turn: turnNo });
    if (resolution.expiredConditions.length === 0 && resolution.updatedConditions.length === 0) {
      return 0;
    }

    const remainingByKey = new Map(
      resolution.conditions.map((condition) => [this.conditionEntryKey(condition), condition]),
    );
    const nextConditions = current.flatMap((entry, index) => {
      const parsedCondition = parsed[index];
      if (!parsedCondition) {
        return [];
      }
      const remaining = remainingByKey.get(this.conditionEntryKey(parsedCondition));
      if (!remaining) {
        return [];
      }
      return [typeof entry === "string" ? entry : remaining];
    });

    await this.writeCombatConditionEntries(participant, nextConditions);
    return resolution.expiredConditions.length + resolution.updatedConditions.length;
  }

  private async readCombatConditions(participant: CombatParticipantEntity): Promise<string[]> {
    if (!participant.sessionCharacterId) {
      return this.parseConditions(participant.conditionsJson ?? "[]");
    }
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: participant.sessionCharacterId },
      select: { conditionsJson: true },
    });
    return this.parseConditions(sessionCharacter?.conditionsJson ?? participant.conditionsJson ?? "[]");
  }

  private combatConditionTags(entries: unknown[]): string[] {
    return Array.from(new Set(entries.flatMap((entry) => this.conditionEntryTags(entry))));
  }

  private isCombatParticipantIncapacitated(participant: CombatParticipantEntity): boolean {
    const tags = this.parseConditions(participant.conditionsJson ?? "[]");
    return tags.some((tag) => COMBAT_INCAPACITATING_CONDITION_TAGS.has(tag));
  }

  private conditionEntryTags(entry: unknown): string[] {
    return this.conditionRuntime.toConditionTags(JSON.stringify([entry]));
  }

  private async writeCombatConditions(
    participant: CombatParticipantEntity,
    conditions: string[],
  ): Promise<void> {
    const conditionsJson = JSON.stringify(conditions);
    await this.prisma.combatParticipant.update({
      where: { id: participant.id },
      data: { conditionsJson },
    });
    if (participant.sessionCharacterId) {
      await this.prisma.sessionCharacter.update({
        where: { id: participant.sessionCharacterId },
        data: { conditionsJson },
      });
    }
    participant.conditionsJson = conditionsJson;
  }

  private async readCombatConditionEntries(participant: CombatParticipantEntity): Promise<unknown[]> {
    const raw = participant.sessionCharacterId
      ? (await this.prisma.sessionCharacter.findUnique({
          where: { id: participant.sessionCharacterId },
          select: { conditionsJson: true },
        }))?.conditionsJson ?? participant.conditionsJson ?? "[]"
      : participant.conditionsJson ?? "[]";
    return this.parseConditionEntries(raw);
  }

  private async writeCombatConditionEntries(
    participant: CombatParticipantEntity,
    conditions: unknown[],
  ): Promise<void> {
    const conditionsJson = JSON.stringify(conditions);
    await this.prisma.combatParticipant.update({
      where: { id: participant.id },
      data: { conditionsJson },
    });
    if (participant.sessionCharacterId) {
      await this.prisma.sessionCharacter.update({
        where: { id: participant.sessionCharacterId },
        data: { conditionsJson },
      });
    }
    participant.conditionsJson = conditionsJson;
  }

  private conditionEntryKey(condition: {
    conditionId: string;
    sourceId: string | null;
    appliedAtRound: number | null;
  }): string {
    return `${condition.conditionId}:${condition.sourceId ?? ""}:${condition.appliedAtRound ?? ""}`;
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
      params.targetConditions.includes(COMBAT_CONDITION_DODGE) ||
      params.targetHeavilyObscured === true ||
      params.forceDisadvantage === true;
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
    const attackerToken = this.findParticipantToken(map, attacker);
    const targetToken = this.findParticipantToken(map, target);
    if (!attackerToken || !targetToken || attacker.isHostile === target.isHostile) {
      return false;
    }

    return combat.participants.some((participant) => {
      if (
        participant.id === attacker.id ||
        participant.id === target.id ||
        !participant.isAlive ||
        participant.isHostile !== attacker.isHostile
      ) {
        return false;
      }

      const allyToken = this.findParticipantToken(map, participant);
      return Boolean(
        allyToken &&
          this.getTokenGridDistanceFt(map, allyToken, targetToken) <= feet,
      );
    });
  }

  private isSneakAttackWeaponProfile(weapon: EquippedWeaponProfile): boolean {
    const properties = new Set(
      (weapon.properties ?? []).map((property) => property.toLowerCase().replace(/[_\s]+/g, "-")),
    );
    return (
      weapon.attackKind === "ranged_weapon_attack" ||
      properties.has("ranged") ||
      properties.has("finesse")
    );
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
      return this.applyMovementSpeedPenalties(
        participant.speedFt ?? 30,
        participant.conditionsJson ?? "[]",
      );
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
    const proficientSkills = this.parseJson<string[]>(character.proficientSkillsJson, []).map((skill) =>
      skill.trim().toLowerCase(),
    );
    const dexterityModifier = this.getAbilityModifier(
      abilities.dex ?? abilities.dexterity ?? abilities.dexterityScore,
    );
    const isStealthProficient = proficientSkills.some((skill) =>
      ["stealth", "dexterity_stealth", "은신"].includes(skill),
    );
    return dexterityModifier + (isStealthProficient ? character.proficiencyBonus : 0);
  }

  private buildDamageExpression(
    damageDice: string | null | undefined,
    damageBonus: number | null | undefined,
    criticalHit: boolean,
  ): string {
    const base = damageDice?.trim() || "1d6";
    const doubled = criticalHit
      ? base.replace(/^(\d+)d(\d+)/i, (_match, count: string, sides: string) => `${Number(count) * 2}d${sides}`)
      : base;
    const bonus = Math.floor(damageBonus ?? 0);
    if (!bonus) {
      return doubled;
    }
    return `${doubled}${bonus >= 0 ? "+" : ""}${bonus}`;
  }

  private resolveParticipantArmorClass(participant: CombatParticipantEntity): number {
    return participant.armorClass ?? DEFAULT_MONSTER_AC;
  }

  private isParticipantInHeavilyObscuredTerrain(
    map: VttMapStateDto,
    participant: CombatParticipantEntity,
  ): boolean {
    const token = this.findParticipantToken(map, participant);
    if (!token) {
      return false;
    }
    return this.resolveTerrainEffectsAtPoint(map, { x: token.x, y: token.y }).some(
      (entered) => entered.effect.heavilyObscured,
    );
  }

  private resolveMonsterTokenCombatStats(token: VttMapStateDto["tokens"][number]): {
    currentHp: number;
    maxHp: number;
    armorClass: number;
  } {
    const engineStats = this.srdEngine.getMonsterCombatStats(token.monster?.id);
    if (engineStats) {
      return {
        currentHp: engineStats.currentHp,
        maxHp: engineStats.maxHp,
        armorClass: engineStats.armorClass,
      };
    }

    const maxHp =
      this.parseFirstInteger(token.monster?.hitPointsRaw) ??
      this.parseFirstInteger(token.monster?.basicRaw) ??
      DEFAULT_MONSTER_HP;
    const armorClass =
      this.parseFirstInteger(token.monster?.armorClassRaw) ??
      DEFAULT_MONSTER_AC;

    return { currentHp: maxHp, maxHp, armorClass };
  }

  private scaleMonsterTokensForParty(
    monsterTokens: VttMapToken[],
    playerCount: number,
    map: VttMapStateDto,
  ): { monsterTokens: VttMapToken[]; excludedTokenIds: string[]; applied: boolean } {
    const scaling = map.encounterScaling;
    if (!scaling?.enabled || scaling.mode !== "by_party_ratio" || !monsterTokens.length) {
      return { monsterTokens, excludedTokenIds: [], applied: false };
    }

    const basePartySize = this.clampNumber(Number(scaling.basePartySize) || 4, 1, 12);
    const minMonsterCount = this.clampNumber(Number(scaling.minMonsterCount) || 1, 0, monsterTokens.length);
    const fixedTokens = monsterTokens.filter((token) => token.encounterRole === "fixed");
    const scalableEntries = monsterTokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token.encounterRole !== "fixed");

    if (!scalableEntries.length || playerCount >= basePartySize) {
      return { monsterTokens, excludedTokenIds: [], applied: true };
    }

    const groups = new Map<string, Array<{ token: VttMapToken; index: number }>>();
    for (const entry of scalableEntries) {
      const groupId =
        entry.token.encounterGroupId?.trim() ||
        entry.token.monster?.id ||
        entry.token.name?.trim() ||
        "default";
      groups.set(groupId, [...(groups.get(groupId) ?? []), entry]);
    }

    const includedIds = new Set(fixedTokens.map((token) => token.id));
    for (const entries of groups.values()) {
      const targetCount = this.clampNumber(
        Math.ceil((entries.length * Math.max(playerCount, 1)) / basePartySize),
        0,
        entries.length,
      );
      entries
        .slice()
        .sort((left, right) => {
          const leftPriority = left.token.encounterPriority ?? 0;
          const rightPriority = right.token.encounterPriority ?? 0;
          return rightPriority - leftPriority || left.index - right.index;
        })
        .slice(0, targetCount)
        .forEach(({ token }) => includedIds.add(token.id));
    }

    if (includedIds.size < minMonsterCount) {
      scalableEntries
        .filter(({ token }) => !includedIds.has(token.id))
        .sort((left, right) => {
          const leftPriority = left.token.encounterPriority ?? 0;
          const rightPriority = right.token.encounterPriority ?? 0;
          return rightPriority - leftPriority || left.index - right.index;
        })
        .slice(0, minMonsterCount - includedIds.size)
        .forEach(({ token }) => includedIds.add(token.id));
    }

    const scaledMonsterTokens = monsterTokens.filter((token) => includedIds.has(token.id));
    const excludedTokenIds = monsterTokens
      .filter((token) => !includedIds.has(token.id))
      .map((token) => token.id);

    return { monsterTokens: scaledMonsterTokens, excludedTokenIds, applied: true };
  }

  private rollInitiative(dexterityModifier: number, autoRollInitiative: boolean | undefined): number {
    const baseRoll = autoRollInitiative === false ? 10 : this.diceService.roll("1d20").total;
    return baseRoll + dexterityModifier;
  }

  private resolveCharacterDexterityModifier(abilitiesJson: string | null | undefined): number {
    return this.getAbilityModifier(this.resolveDexterityScoreFromUnknown(this.parseJsonObject(abilitiesJson)));
  }

  private resolveMonsterDexterityModifier(token: VttMapStateDto["tokens"][number]): number {
    const monster = token.monster as Record<string, unknown> | null | undefined;
    const score =
      this.resolveDexterityScoreFromUnknown(monster) ??
      this.parseAbilityScoreFromText("dex", token.monster?.basicRaw) ??
      this.parseAbilityScoreFromText("dex", token.monster?.playReference) ??
      10;

    return this.getAbilityModifier(score);
  }

  private resolveMonsterSpeedFt(token: VttMapStateDto["tokens"][number]): number {
    const engineStats = this.srdEngine.getMonsterCombatStats(token.monster?.id);
    if (engineStats) {
      return engineStats.speedFt;
    }

    return (
      this.parseFirstInteger(token.monster?.speedRaw) ??
      this.parseSpeedFromText(token.monster?.basicRaw) ??
      this.parseSpeedFromText(token.monster?.playReference) ??
      30
    );
  }

  private resolveDexterityScoreFromUnknown(source: unknown): number | null {
    if (!source || typeof source !== "object") {
      return null;
    }

    const record = source as Record<string, unknown>;
    const directScore =
      this.parseNumericValue(record.dex) ??
      this.parseNumericValue(record.dexterity) ??
      this.parseNumericValue(record.dexterityScore);
    if (directScore !== null) {
      return directScore;
    }

    return (
      this.resolveDexterityScoreFromUnknown(record.abilities) ??
      this.resolveDexterityScoreFromUnknown(record.abilityScores) ??
      this.resolveDexterityScoreFromUnknown(record.stats)
    );
  }

  private parseAbilityScoreFromText(ability: string, value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }

    const pattern = new RegExp(`\\b${ability}\\b\\s*[:=]?\\s*(\\d{1,2})`, "i");
    const match = value.match(pattern);
    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseSpeedFromText(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }

    const match = value.match(/\bspeed\b[^0-9]*(\d{1,3})\s*ft\b/i);
    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
    if (!value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
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

  private parseNumericValue(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== "string") {
      return null;
    }

    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getAbilityModifier(score: number | null | undefined): number {
    return Math.floor(((score ?? 10) - 10) / 2);
  }

  private resolveTokenName(token: VttMapStateDto["tokens"][number]): string {
    return token.name?.trim() || token.monster?.nameKo?.trim() || token.monster?.nameEn?.trim() || "Monster";
  }

  private parseFirstInteger(value: string | null | undefined): number | null {
    const match = value?.match(/\d+/);
    if (!match) {
      return null;
    }
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  private async endExpiredRagesForCombat(
    combat: NonNullable<CombatWithParticipants>,
  ): Promise<number> {
    const sessionCharacterIds = combat.participants
      .map((participant) => participant.sessionCharacterId)
      .filter((id): id is string => Boolean(id));

    if (!sessionCharacterIds.length) {
      return 0;
    }

    const resources = await this.prisma.sessionCharacterResource.findMany({
      where: {
        sessionCharacterId: { in: sessionCharacterIds },
        rageActive: true,
      },
    });
    const expiredResources = resources.filter((resource) =>
      this.isRageExpired(resource, combat.roundNo, combat.turnNo),
    );

    for (const resource of expiredResources) {
      await this.characterResources.endRage(resource.sessionCharacterId);
      await this.removeRageConditionTags(resource.sessionCharacterId);
    }

    return expiredResources.length;
  }

  private async expireReadyActionsForTurn(
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
  ): Promise<number> {
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
          [PENDING_READY_ACTIONS_FLAG]: [
            ...resolution.triggered.map((entry) => entry.pending),
            ...resolution.remaining,
          ],
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

      const actor = params.combat.participants.find(
        (participant) => participant.id === pending.actorParticipantId,
      );
      const actorToken = actor ? this.findParticipantToken(params.map, actor) : null;
      if (!actor || !actorToken) {
        remaining.push(pending);
        continue;
      }

      const event = {
        type: "creature_enters_range" as const,
        targetParticipantId: params.mover.id,
        distanceFt: this.getTokenGridDistanceFt(params.map, actorToken, params.nextMoverToken),
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
          [TRIGGERED_READY_ACTIONS_FLAG]: [
            ...(Array.isArray(flags[TRIGGERED_READY_ACTIONS_FLAG])
              ? flags[TRIGGERED_READY_ACTIONS_FLAG]
              : []),
            ...triggered,
          ],
        }),
      },
    });
    if (triggered.length > 0) {
      this.realtimeEvents.emitSystemMessage(
        params.sessionId,
        "READY_ACTION_TRIGGERED",
        `준비행동 ${triggered.length}개가 발동 대기 중입니다.`,
      );
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

    return (
      roundNo === resource.rageEndsAtRound &&
      (resource.rageEndsAtTurn === null || turnNo >= resource.rageEndsAtTurn)
    );
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
    const nextConditions = currentConditions.filter(
      (condition) => !removedTags.has(condition.trim().toLowerCase()),
    );

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
      return Array.isArray(parsed) ? this.combatConditionTags(parsed) : [];
    } catch {
      return [];
    }
  }

  private parseConditionEntries(value: string): unknown[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private resolveCombatSpellSlotResources(
    character: { className: string; level: number } | null,
    rawSlots: Record<string, number> | undefined,
  ): Record<string, { total: number; remaining: number }> {
    const resources: Record<string, { total: number; remaining: number }> = {};

    for (let slotLevel = 1; slotLevel <= 9; slotLevel += 1) {
      const total = this.spellSlots.resolveMaximumForCharacter(character, slotLevel);
      if (total <= 0) continue;

      const rawRemaining = rawSlots?.[String(slotLevel)];
      resources[String(slotLevel)] = {
        total,
        remaining: Math.min(total, Math.max(0, Math.floor(rawRemaining ?? total))),
      };
    }

    return resources;
  }

  private async mapCombat(combat: NonNullable<CombatWithParticipants>): Promise<CombatResponseDto> {
    const sessionCharacterIds = combat.participants
      .map((participant) => participant.sessionCharacterId)
      .filter((id): id is string => Boolean(id));
    const sessionCharacters = sessionCharacterIds.length
      ? await this.prisma.sessionCharacter.findMany({
          where: { id: { in: sessionCharacterIds } },
          include: {
            character: {
              select: {
                className: true,
                level: true,
                maxHp: true,
                armorClass: true,
                speed: true,
              },
            },
          },
        })
      : [];
    const sessionCharacterById = new Map(sessionCharacters.map((row) => [row.id, row]));
    const participantIds = combat.participants.map((participant) => participant.id);
    const turnStates = participantIds.length
      ? await this.prisma.combatTurnState.findMany({
          where: {
            combatId: combat.id,
            roundNo: combat.roundNo,
            turnNo: combat.turnNo,
            combatParticipantId: { in: participantIds },
          },
        })
      : [];
    const turnStateByParticipantId = new Map(
      turnStates.map((turnState) => [turnState.combatParticipantId, turnState]),
    );
    const { state } = await this.sessionsService.getGameStateEntityOrThrow(combat.sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const spellSlotsBySessionCharacterId = this.parseJson<Record<string, Record<string, number>>>(
      JSON.stringify(flags.spellSlotsBySessionCharacterId ?? {}),
      {},
    );
    const aliveParticipants = combat.participants.filter((participant) => participant.isAlive);
    const currentParticipant =
      combat.participants.find((participant) => participant.id === combat.currentParticipantId) ?? null;
    const roundTurnNo = currentParticipant
      ? Math.max(
          1,
          aliveParticipants.findIndex((participant) => participant.id === currentParticipant.id) + 1,
        )
      : 0;
    const currentTurnOrder = currentParticipant?.turnOrder ?? Number.MAX_SAFE_INTEGER;
    const map = await this.sessionsService.getVttMapForUser(
      this.getGmRuntimeUserId(await this.sessionsService.getSessionEntityOrThrow(combat.sessionId)),
      combat.sessionId,
    );

    return {
      combatId: combat.id,
      sessionId: combat.sessionId,
      status: combat.status as CombatStatus,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      roundTurnNo,
      currentEntityId: combat.currentParticipantId,
      participants: combat.participants.map((participant) => {
        const sessionCharacter = participant.sessionCharacterId
          ? sessionCharacterById.get(participant.sessionCharacterId)
          : null;
        const currentHp = sessionCharacter?.currentHp ?? participant.currentHp ?? null;
        const maxHp = sessionCharacter?.character.maxHp ?? participant.maxHp ?? null;
        const armorClass = sessionCharacter?.character.armorClass ?? participant.armorClass ?? null;
        const conditionsJson =
          sessionCharacter?.conditionsJson ?? participant.conditionsJson ?? "[]";
        const conditionEntries = this.parseConditionEntries(conditionsJson);
        const conditionInstances = this.conditionRuntime.parseConditionsJson(
          JSON.stringify(conditionEntries),
        );
        const concentrationState =
          this.concentrationRuntime.readActiveConcentration(conditionInstances);
        const movementFtTotal = this.applyMovementSpeedPenalties(
          sessionCharacter?.character.speed ?? participant.speedFt ?? 30,
          conditionsJson,
        );
        const turnState = turnStateByParticipantId.get(participant.id) ?? null;
        const spellSlots = this.resolveCombatSpellSlotResources(
          sessionCharacter?.character ?? null,
          participant.sessionCharacterId
            ? spellSlotsBySessionCharacterId[participant.sessionCharacterId]
            : undefined,
        );
        const spellSlotLevel1Total = spellSlots["1"]?.total ?? 0;
        const spellSlotLevel1Remaining = spellSlots["1"]?.remaining ?? 0;
        return {
          sessionEntityId: participant.id,
          entityType: participant.entityType as CombatEntityType,
          sessionCharacterId: participant.sessionCharacterId,
          tokenId: participant.tokenId ?? null,
          name: participant.nameSnapshot,
          currentHp,
          maxHp,
          armorClass,
          initiative: participant.initiative,
          turnOrder: participant.turnOrder,
          isAlive: Boolean((currentHp ?? 1) > 0 && participant.isAlive),
          isHostile: participant.isHostile,
          hasActedThisRound:
            participant.isAlive &&
            participant.id !== combat.currentParticipantId &&
            participant.turnOrder < currentTurnOrder,
          conditions: this.combatConditionTags(conditionEntries),
          concentration: concentrationState
            ? {
                spellId: concentrationState.spellId,
                targetIds: concentrationState.targetIds,
                effectIds: concentrationState.effectIds,
                startedAtRound: concentrationState.startedAtRound,
                endsAtRound: concentrationState.endsAtRound ?? null,
                endsAtTurn: concentrationState.endsAtTurn ?? null,
              }
            : null,
          actionResources: {
            actionAvailable: !turnState?.actionUsed || Boolean(turnState?.additionalActionGranted),
            bonusActionAvailable: !Boolean(turnState?.bonusActionUsed),
            reactionAvailable: !Boolean(turnState?.reactionUsed),
            additionalActionAvailable: Boolean(turnState?.additionalActionGranted),
            twoWeaponAttackAvailable: Boolean(
              turnState?.attackActionWeaponIsLightMelee && !turnState?.bonusActionUsed,
            ),
            sneakAttackAvailable: !Boolean(turnState?.sneakAttackUsed),
            movementFtTotal,
            movementFtRemaining: Math.max(0, movementFtTotal - (turnState?.movementFtSpent ?? 0)),
            spellSlotLevel1Total,
            spellSlotLevel1Remaining,
            spellSlots,
          },
          monsterActions: this.listMonsterActionOptionsForParticipant(
            participant,
            this.findParticipantToken(map, participant),
            flags,
          ),
        };
      }),
    };
  }

  private hasBonusActionOption(
    participant: CombatParticipantEntity,
    character: { className: string; level: number } | null,
  ): boolean {
    if (character) {
      const className = character.className.toLowerCase();
      return (
        className.includes("fighter") ||
        className.includes("barbarian") ||
        (className.includes("rogue") && character.level >= 2)
      );
    }

    const raw = participant.conditionsJson?.toLowerCase() ?? "";
    return raw.includes("bonus action");
  }
}
