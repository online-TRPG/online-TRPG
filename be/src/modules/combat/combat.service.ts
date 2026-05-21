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
  CombatBasicActionDto,
  CombatActionResultDto,
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
import { CharacterResourceService } from "../rules/character-resource.service";
import { DiceService } from "../rules/dice.service";
import { RuleEngineService } from "../rules/rule-engine.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { SrdEngineLoaderService } from "./srd-engine-loader.service";
import type { SrdEngineExecutableMonsterAction } from "./srd-engine.types";

type CombatWithParticipants = Awaited<ReturnType<CombatService["getActiveCombatEntity"]>>;
type CombatParticipantEntity = NonNullable<CombatWithParticipants>["participants"][number];
type VttMapToken = VttMapStateDto["tokens"][number];

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
  damageDice?: string;
  damageBonus?: number;
  createdAt: string;
};

type PendingCombatReaction = PendingOpportunityAttackReaction | PendingShieldReaction;

type OpportunityAttackCheckResult = {
  prompt: CombatReactionPromptDto | null;
  automaticMessages: string[];
};

const RAGE_CONDITION_TAGS = [
  "rage",
  "resistance:bludgeoning",
  "resistance:piercing",
  "resistance:slashing",
];

const DEFAULT_MONSTER_AC = 10;
const DEFAULT_MONSTER_HP = 1;
const COMBAT_CONDITION_DODGE = "combat:dodge";
const COMBAT_CONDITION_HIDDEN = "combat:hidden";
const COMBAT_CONDITION_SLEEP = "combat:sleep";
const COMBAT_CONDITION_UNCONSCIOUS = "condition:unconscious";
const COMBAT_HIDE_DC = 12;
const DEFAULT_MELEE_ATTACK_DISTANCE_FT = 5;
const COMBAT_JUMP_EXTRA_MOVEMENT_FT = 10;
const DEFAULT_LEVEL_1_SPELL_SLOTS = 2;
const SECOND_WIND_EXPENDED_TAG = "resource:second_wind_expended";
const PENDING_COMBAT_REACTION_FLAG = "pendingCombatReaction";

@Injectable()
export class CombatService {
  private readonly logger = new Logger(CombatService.name);
  private readonly serverAutoMonsterTurnSessions = new Set<string>();
  private readonly serverAutoMonsterTurnScheduledSessions = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly diceService: DiceService,
    private readonly actionRules: ActionRuleService,
    private readonly actionEconomy: ActionEconomyService,
    private readonly characterResources: CharacterResourceService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly turnLogsService: TurnLogsService,
    private readonly ruleEngine: RuleEngineService,
    private readonly srdEngine: SrdEngineLoaderService,
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

    const map = await this.sessionsService.getVttMapForUser(session.hostUserId ?? userId, session.id);
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
    this.logger.debug(
      `[COMBAT_END_REQUEST] sessionId=${session.id} userId=${userId} combatId=${combat.id} currentParticipantId=${combat.currentParticipantId ?? "null"} participantCount=${combat.participants.length}`,
    );
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

    const map = await this.sessionsService.getVttMapForUser(session.hostUserId, session.id);
    const moverToken = this.findParticipantToken(map, mover);
    if (!moverToken) {
      throw conflict("COMBAT_409", "이동할 토큰을 찾을 수 없습니다.", {
        reason: "MOVER_TOKEN_NOT_FOUND",
      });
    }

    const to = {
      x: this.clampNumber(Math.floor(dto.to.x), 0, Math.max(0, map.width - moverToken.size)),
      y: this.clampNumber(Math.floor(dto.to.y), 0, Math.max(0, map.height - moverToken.size)),
    };
    const movementMode = dto.movementMode === "jump" ? "jump" : "normal";
    const movementPath = this.normalizeCombatMovementPath(map, moverToken, dto.path, to);
    this.assertCombatMovementPathOpen(map, moverToken, movementPath, movementMode);
    const movementDistanceFt = this.calculateMovementPathDistanceFt(map, moverToken, movementPath);
    if (movementDistanceFt <= 0) {
      return {
        combat: await this.mapCombat(combat),
        map,
        message: "이동하지 않았습니다.",
        pendingReaction: null,
      };
    }
    const movementCostFt =
      movementMode === "jump" ? movementDistanceFt + COMBAT_JUMP_EXTRA_MOVEMENT_FT : movementDistanceFt;
    await this.assertMovementAvailable(combat, mover, movementCostFt);

    const nextMap: VttMapStateDto = {
      ...map,
      tokens: map.tokens.map((token) =>
        token.id === moverToken.id ? { ...token, x: to.x, y: to.y } : token,
      ),
      updatedAt: new Date().toISOString(),
    };
    const opportunityAttack = await this.createOpportunityAttackPromptIfNeeded({
      sessionId: session.id,
      combat,
      mover,
      moverToken,
      nextMoverToken: { ...moverToken, x: to.x, y: to.y },
      movementPath,
      map,
      nextMap,
      movementDistanceFt,
      movementCostFt,
      moverUserId: userId,
    });

    if (opportunityAttack.prompt) {
      return {
        combat: await this.mapCombat(combat),
        map,
        message: opportunityAttack.prompt.message,
        pendingReaction: opportunityAttack.prompt,
      };
    }

    const latestCombat = await this.getActiveCombatEntity(session.id);
    const latestMover = this.findCombatParticipantOrThrow(latestCombat, mover.id);
    if (!latestMover.isAlive) {
      const response = await this.completeCombatIfResolved(session.id, latestCombat);
      this.realtimeEvents.emitCombatUpdated(session.id, response);
      const currentMap = await this.sessionsService.getVttMapForUser(session.hostUserId, session.id);
      return {
        combat: response,
        map: currentMap,
        message:
          opportunityAttack.automaticMessages[opportunityAttack.automaticMessages.length - 1] ??
          `${mover.nameSnapshot}은(는) 기회공격으로 쓰러져 이동하지 못했습니다.`,
        pendingReaction: null,
      };
    }

    const savedMap = await this.commitCombatMove(
      session.id,
      latestCombat,
      latestMover,
      nextMap,
      movementCostFt,
    );
    const response = await this.mapCombat(await this.getActiveCombatEntity(session.id));
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    return {
      combat: response,
      map: savedMap,
      message: opportunityAttack.automaticMessages.length
        ? opportunityAttack.automaticMessages.join(" / ")
        : movementMode === "jump"
          ? `${mover.nameSnapshot} 도약: ${movementDistanceFt}ft + 추가 ${COMBAT_JUMP_EXTRA_MOVEMENT_FT}ft`
          : `${mover.nameSnapshot} 이동: ${movementDistanceFt}ft`,
      pendingReaction: null,
    };
  }

  async acceptReaction(
    userId: string,
    sessionId: string,
    dto: CombatReactionResponseDto,
  ): Promise<CombatMoveResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
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
      savedMap = await this.sessionsService.getVttMapForUser(session.hostUserId, session.id);
      message = `${message} 이동 중단`;
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
    const response = await this.mapCombat(await this.getActiveCombatEntity(session.id));
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    return {
      combat: response,
      map: savedMap,
      message: "기회공격을 하지 않고 이동을 완료했습니다.",
      pendingReaction: null,
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
    const currentIndex = aliveParticipants.findIndex((participant) => participant.id === current.id);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % aliveParticipants.length : 0;
    const next = aliveParticipants[nextIndex] ?? null;
    const wrappedRound = aliveParticipants.length > 0 && nextIndex === 0;
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

    const response: TurnAdvanceResponseDto = {
      combatId: updated.id,
      endedEntityId: current.id,
      nextEntityId: next?.id ?? null,
      roundNo: updated.roundNo,
      turnNo: updated.turnNo,
    };

    this.realtimeEvents.emitTurnChanged(sessionId, response);
    this.realtimeEvents.emitCombatUpdated(sessionId, await this.mapCombat(updated));
    if (expiredRageCount > 0) {
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
    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.completeCombatIfResolved(session.id, updated);
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
    this.assertMvpSpellKnown(await this.getSessionCharacterForSpell(caster.sessionCharacterId), spellId);

    const map = await this.sessionsService.getVttMapForUser(session.hostUserId, session.id);
    const casterToken = this.findParticipantToken(map, caster);
    if (!casterToken) {
      throw conflict("COMBAT_409", "시전자 토큰을 찾을 수 없습니다.", { reason: "CASTER_TOKEN_NOT_FOUND" });
    }

    if (spellId === "spell.fire_bolt") {
      const target = this.findCombatParticipantOrThrow(combat, dto.targetParticipantIds?.[0] ?? "");
      this.assertSpellTargetInRange(map, casterToken, target, 120);
      const spellAttackBonus = await this.resolveSpellAttackBonus(caster.sessionCharacterId);
      return this.resolveAttack(
        userId,
        session.id,
        {
          attackerParticipantId: caster.id,
          targetParticipantId: target.id,
          attackBonus: spellAttackBonus,
          damageDice: this.resolveCantripDamageDice("1d10", await this.resolveCharacterLevel(caster.sessionCharacterId)),
          damageBonus: 0,
        },
        { messagePrefix: "Fire Bolt" },
      );
    }

    await this.spendCurrentActionIfNeeded(combat, caster);
    let message = "";
    let attackTotal: number | null = null;
    let damageTotal: number | null = null;
    let responseMap: VttMapStateDto | null = null;
    const diceResults: DiceRollResponseDto[] = [];

    if (spellId === "spell.magic_missile") {
      await this.spendSpellSlot(session.id, caster.sessionCharacterId, 1);
      const targets = (dto.targetParticipantIds?.length ? dto.targetParticipantIds : [dto.targetParticipantIds?.[0]])
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .slice(0, 3)
        .map((id) => this.findCombatParticipantOrThrow(combat, id));
      if (!targets.length) {
        throw conflict("COMBAT_409", "Magic Missile 대상이 필요합니다.", { reason: "SPELL_TARGET_REQUIRED" });
      }
      targets.forEach((target) => this.assertSpellTargetInRange(map, casterToken, target, 120));
      const applied: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const target = targets[Math.min(index, targets.length - 1)];
        const roll = this.diceService.roll("1d4+1");
        diceResults.push(roll);
        await this.applyHitPointDelta(combat, target, -roll.total);
        applied.push(`${target.nameSnapshot} ${roll.total}`);
        damageTotal = (damageTotal ?? 0) + roll.total;
      }
      message = `Magic Missile: ${applied.join(", ")} 역장 피해`;
    } else if (spellId === "spell.sleep") {
      await this.spendSpellSlot(session.id, caster.sessionCharacterId, 1);
      const point = dto.point ?? this.requireTargetPoint(map, casterToken);
      this.assertPointInRange(map, casterToken, point, 90);
      const poolRoll = this.diceService.roll("5d8");
      diceResults.push(poolRoll);
      let remaining = poolRoll.total;
      const targets = combat.participants
        .filter((participant) => participant.isAlive && participant.id !== caster.id && (participant.currentHp ?? 0) > 0)
        .filter((participant) => {
          const token = this.findParticipantToken(map, participant);
          return token ? this.getGridPointDistanceFt(map, point, token) <= 20 : false;
        })
        .sort((left, right) => (left.currentHp ?? 0) - (right.currentHp ?? 0));
      const slept: string[] = [];
      for (const target of targets) {
        const hp = target.currentHp ?? 0;
        if (hp <= 0 || hp > remaining) continue;
        remaining -= hp;
        await this.addCombatCondition(target, COMBAT_CONDITION_SLEEP);
        await this.addCombatCondition(target, COMBAT_CONDITION_UNCONSCIOUS);
        slept.push(target.nameSnapshot);
      }
      damageTotal = poolRoll.total;
      message = slept.length
        ? `Sleep: ${poolRoll.total} HP 분량으로 ${slept.join(", ")} 수면`
        : `Sleep: ${poolRoll.total} HP 분량, 잠든 대상 없음`;
    } else if (spellId === "spell.light") {
      const point = dto.point ?? this.requireTargetPoint(map, casterToken);
      this.assertPointInRange(map, casterToken, point, 120);
      this.assertLightPointAllowed(map, point);
      const lightSource = {
        id: `light:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        x: this.clampNumber(Math.floor(point.x), 0, Math.max(0, map.width - map.gridSize)),
        y: this.clampNumber(Math.floor(point.y), 0, Math.max(0, map.height - map.gridSize)),
        rangeFt: 40,
        label: "Light",
        createdBySessionCharacterId: caster.sessionCharacterId,
      };
      responseMap = await this.sessionsService.saveSystemVttMap(session.id, {
        ...map,
        lightSources: [...(map.lightSources ?? []), lightSource].slice(-40),
        updatedAt: new Date().toISOString(),
      });
      message = "Light: 선택한 타일 기준 40ft 파티 시야를 제공합니다.";
    } else {
      throw conflict("COMBAT_409", "지원하지 않는 주문입니다.", { reason: "UNSUPPORTED_SPELL", spellId });
    }

    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.completeCombatIfResolved(session.id, updated);
    const turnLogDiceResult = spellId === "spell.sleep" && diceResults[0] ? { ...diceResults[0] } : null;
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: caster.sessionCharacterId,
      rawInput: null,
      structuredAction: { type: "spell_cast", spellId, targetParticipantIds: dto.targetParticipantIds ?? [], point: dto.point ?? null },
      diceResult: turnLogDiceResult,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    if (spellId === "spell.sleep") {
      diceResults.forEach((roll) => this.realtimeEvents.emitDiceRolled(session.id, roll));
    }
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
      actionCost?: "action" | "bonus_action" | "reaction";
      attackAction?: { weaponId?: string | null; weaponIsLightMelee: boolean };
      reactionUserId?: string;
      sneakAttack?: {
        rogueLevel: number;
        weaponProperties: string[];
        attackKind: "melee_weapon_attack" | "ranged_weapon_attack";
      };
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

    if (!attacker.isAlive || !target.isAlive) {
      throw conflict("COMBAT_409", "행동할 수 없는 전투 참여자입니다.", {
        reason: "COMBATANT_DEFEATED",
      });
    }

    const attackerConditions = this.parseConditions(attacker.conditionsJson ?? "[]");
    const targetConditions = this.parseConditions(target.conditionsJson ?? "[]");
    const vttMap = await this.sessionsService.getVttMapForUser(session.hostUserId ?? userId, session.id);
    const attackAdvantageState = this.resolveAttackAdvantageState({
      attackerConditions,
      targetConditions,
      allyWithin5FtOfTarget: this.hasAllyWithinFeetOfTarget(
        vttMap,
        combat,
        attacker,
        target,
        DEFAULT_MELEE_ATTACK_DISTANCE_FT,
      ),
    });
    const attackBonus = Math.floor(dto.attackBonus ?? 0);
    const attackRoll = this.diceService.roll(`1d20+${attackBonus}`, attackAdvantageState);
    const targetArmorClass = this.resolveParticipantArmorClass(target);
    const naturalD20 = this.selectNaturalD20(attackRoll.rolls, attackAdvantageState);
    const criticalHit = naturalD20 === 20;
    const criticalMiss = naturalD20 === 1;
    const hit = criticalHit || (!criticalMiss && attackRoll.total >= targetArmorClass);
    if (hit && !criticalHit && !options.reactionUserId && await this.canPromptShieldReaction(session.id, combat, target)) {
      await this.spendCurrentActionIfNeeded(combat, attacker);
      const pending = await this.storePendingShieldReaction({
        sessionId: session.id,
        combat,
        attacker,
        target,
        attackTotal: attackRoll.total,
        targetArmorClass,
        damageDice: dto.damageDice,
        damageBonus: dto.damageBonus,
      });
      this.realtimeEvents.emitCombatReactionPrompt(session.id, pending.reactorUserId, {
        id: pending.id,
        type: "shield",
        reactorParticipantId: target.id,
        reactorName: target.nameSnapshot,
        moverParticipantId: attacker.id,
        moverName: attacker.nameSnapshot,
        message: `${target.nameSnapshot}이(가) 공격에 맞았습니다. Shield를 사용해 AC +5를 적용할까요?`,
      });
      return {
        combat: await this.mapCombat(combat),
        message: "Shield 반응을 기다리는 중입니다.",
        attackTotal: attackRoll.total,
        damageTotal: null,
        turnLogId: null,
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

    if (damageTotal !== null && damageTotal > 0) {
      await this.applyHitPointDelta(combat, target, -damageTotal);
    }
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
        targetArmorClass,
        attackTotal: attackRoll.total,
        hit,
        criticalHit,
        criticalMiss,
        advantageState: attackAdvantageState,
        damageTotal,
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
    const map = await this.sessionsService.getVttMapForUser(session.hostUserId ?? userId, session.id);
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

    const map = await this.sessionsService.getVttMapForUser(session.hostUserId ?? userId, session.id);
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
    const map = await this.sessionsService.getVttMapForUser(session.hostUserId ?? userId, session.id);
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
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const actor = this.getCurrentPlayerParticipantOrThrow(combat);
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

  async dodge(
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
    await this.spendCurrentActionIfNeeded(combat, actor);
    await this.addCombatCondition(actor, COMBAT_CONDITION_DODGE);

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

  async hide(
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
    await this.spendCurrentActionIfNeeded(combat, actor);
    const stealthModifier = await this.resolveStealthModifier(actor);
    const expression = stealthModifier >= 0 ? `1d20+${stealthModifier}` : `1d20${stealthModifier}`;
    const diceResult = this.diceService.roll(expression);
    const success = diceResult.total >= COMBAT_HIDE_DC;
    if (success) {
      await this.addCombatCondition(actor, COMBAT_CONDITION_HIDDEN);
    }

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
    if (!attacker || attacker.entityType !== PrismaCombatEntityType.MONSTER || !attacker.isHostile) {
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

    const map = await this.sessionsService.getVttMapForUser(session.hostUserId ?? userId, session.id);
    const token = (map.tokens ?? []).find((candidate) => candidate.id === attacker.tokenId);
    const monsterId = token?.monster?.id ?? this.inferMvpMonsterId(attacker.nameSnapshot);
    const action =
      this.srdEngine.chooseMvpMonsterAction(monsterId, dto.actionId) ??
      this.buildFallbackMonsterAction(monsterId, attacker.nameSnapshot);
    this.logAutoMonsterTurn("monster action selected", {
      sessionId: session.id,
      combatId: combat.id,
      attackerId: attacker.id,
      attackerName: attacker.nameSnapshot,
      tokenId: attacker.tokenId,
      tokenFound: Boolean(token),
      tokenMonsterId: token?.monster?.id ?? null,
      inferredMonsterId: monsterId,
      actionId: action?.actionId ?? null,
      actionLabel: action?.label ?? null,
    });
    if (!action) {
      throw unprocessable("COMBAT_422", "자동 실행 가능한 몬스터 행동이 없습니다.", {
        reason: "EXECUTABLE_MONSTER_ACTION_NOT_FOUND",
        monsterId,
      });
    }

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
    const movementResult =
      attacker.tokenId && targetToken
        ? await this.sessionsService.moveVttTokenTowardToken({
            sessionId: session.id,
            sourceTokenId: attacker.tokenId,
            targetTokenId: targetToken.id,
            maxDistanceFt: attacker.speedFt ?? 30,
            stopWithinFt: action.reachFt ?? 5,
          })
        : null;
    this.logAutoMonsterTurn("monster movement resolved", {
      sessionId: session.id,
      combatId: combat.id,
      attackerId: attacker.id,
      sourceTokenId: attacker.tokenId,
      targetTokenId: targetToken?.id ?? null,
      targetTokenFound: Boolean(targetToken),
      moved: movementResult?.moved ?? false,
      distanceMovedFt: movementResult?.distanceMovedFt ?? 0,
    });

    const mapAfterMovement = movementResult?.map ?? map;
    const rangeCheck = this.getMonsterActionRangeCheck(mapAfterMovement, {
      action,
      sourceTokenId: attacker.tokenId,
      targetTokenId: targetToken?.id ?? null,
    });
    if (!rangeCheck.inRange) {
      this.logAutoMonsterTurn("monster attack skipped: target out of range", {
        sessionId: session.id,
        combatId: combat.id,
        attackerId: attacker.id,
        sourceTokenId: attacker.tokenId,
        targetTokenId: targetToken?.id ?? null,
        actionId: action.actionId,
        actionLabel: action.label,
        distanceFt: rangeCheck.distanceFt,
        rangeFt: rangeCheck.rangeFt,
      });

      if (dto.autoEndTurn !== false) {
        const latestCombat = await this.getActiveCombatEntity(session.id);
        if (latestCombat.currentParticipantId === attacker.id) {
          await this.advanceCurrentTurn(session.id, latestCombat);
        }
      }
      return {
        combat: await this.mapCombat(await this.getActiveCombatEntity(session.id)),
        message: "",
        attackTotal: null,
        damageTotal: null,
      };
    }

    this.logAutoMonsterTurn("monster attack resolving", {
      sessionId: session.id,
      combatId: combat.id,
      attackerId: attacker.id,
      targetId: target.id,
      attackBonus: action.attackBonus,
      damageDice: action.damageDice,
    });
    const result = await this.resolveAttack(userId, session.id, {
      attackerParticipantId: attacker.id,
      targetParticipantId: target.id,
      attackBonus: action.attackBonus,
      damageDice: action.damageDice,
      damageBonus: 0,
    });
    this.logAutoMonsterTurn("monster attack resolved", {
      sessionId: session.id,
      combatId: result.combat.combatId,
      attackerId: attacker.id,
      targetId: target.id,
      attackTotal: result.attackTotal,
      damageTotal: result.damageTotal,
      combatStatus: result.combat.status,
    });

    const movementMessage =
      movementResult?.moved === true ? ` ${movementResult.distanceMovedFt}ft 이동 후` : "";
    const actionMessage = `${attacker.nameSnapshot}${movementMessage} ${action.label}`;
    if (dto.autoEndTurn === false || result.combat.status !== CombatStatus.ACTIVE) {
      return {
        ...result,
        message: `${actionMessage}: ${result.message}`,
      };
    }

    const updated = await this.getActiveCombatEntity(session.id);
    if (updated.currentParticipantId === attacker.id) {
      this.logAutoMonsterTurn("monster auto ending turn", {
        sessionId: session.id,
        combatId: updated.id,
        attackerId: attacker.id,
      });
      await this.advanceCurrentTurn(session.id, updated);
    }

    return {
      ...result,
      combat: await this.mapCombat(await this.getCombatEntityById(result.combat.combatId)),
      message: `${actionMessage}: ${result.message} / 턴 종료`,
    };
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
        current.isAlive,
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
    return null;
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
  ): { inRange: boolean; distanceFt: number | null; rangeFt: number } {
    const rangeFt = this.getMonsterActionRangeFt(params.action);
    if (!params.sourceTokenId || !params.targetTokenId) {
      return { inRange: false, distanceFt: null, rangeFt };
    }

    const sourceToken = map.tokens.find((token) => token.id === params.sourceTokenId);
    const targetToken = map.tokens.find((token) => token.id === params.targetTokenId);
    if (!sourceToken || !targetToken) {
      return { inRange: false, distanceFt: null, rangeFt };
    }

    const distanceFt = this.getTokenGridDistanceFt(map, sourceToken, targetToken);
    return { inRange: distanceFt <= rangeFt, distanceFt, rangeFt };
  }

  private getMonsterActionRangeFt(action: SrdEngineExecutableMonsterAction): number {
    if (typeof action.reachFt === "number" && action.reachFt > 0) {
      return action.reachFt;
    }
    if (typeof action.rangeFt?.normal === "number" && action.rangeFt.normal > 0) {
      return action.rangeFt.normal;
    }
    return 5;
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
          !current ||
          current.entityType !== PrismaCombatEntityType.MONSTER ||
          !current.isHostile ||
          !current.isAlive
        ) {
          this.logAutoMonsterTurn("run stopped: current participant is not actionable monster", {
            sessionId: session.id,
            step,
            currentParticipantId: combat.currentParticipantId,
          });
          return;
        }

        try {
          await this.executeAutoMonsterTurn(session.hostUserId, session, {});
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

  private isCombatTokenPlacementBlocked(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
    x: number,
    y: number,
    options: { ignoreTokens?: boolean } = {},
  ): boolean {
    const blockers = [
      ...(map.terrainCells ?? []),
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
    moverPath: Array<{ x: number; y: number }>,
  ): boolean {
    for (let index = 1; index < moverPath.length; index += 1) {
      const previousMoverToken = { ...threatenerToken, ...moverPath[index - 1] };
      const nextMoverToken = { ...threatenerToken, ...moverPath[index] };
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
    return this.sessionsService.saveSystemVttMap(sessionId, map);
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
      if (!this.doesMovementLeaveThreatenedArea(params.map, token, params.movementPath)) {
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
        reactionUserId: session.hostUserId,
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
    const allowed = new Set(["spell.fire_bolt", "spell.light", "spell.magic_missile", "spell.shield", "spell.sleep"]);
    if (!allowed.has(spellId)) {
      throw conflict("COMBAT_409", "MVP 범위 밖의 주문입니다.", { reason: "SPELL_NOT_MVP", spellId });
    }
    const classKey = sessionCharacter.character.className.trim().toLowerCase();
    const spells = this.parseJson<{ cantrips?: string[]; spells?: string[] } | null>(
      sessionCharacter.character.spellsJson,
      null,
    );
    const learned = [...(spells?.cantrips ?? []), ...(spells?.spells ?? [])].map((value) => this.normalizeSpellId(value));
    if (learned.includes(spellId)) return;
    if (classKey.includes("wizard")) return;
    throw conflict("COMBAT_409", "해당 캐릭터가 익힌 주문이 아닙니다.", { reason: "SPELL_NOT_KNOWN", spellId });
  }

  private async resolveSpellAttackBonus(sessionCharacterId: string): Promise<number> {
    const sessionCharacter = await this.getSessionCharacterForSpell(sessionCharacterId);
    const abilities = this.parseJson<Record<string, number>>(sessionCharacter.character.abilitiesJson, {});
    return sessionCharacter.character.proficiencyBonus + this.getAbilityModifier(abilities.int);
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
    const characterSlots = spellSlots[sessionCharacterId] ?? { [key]: DEFAULT_LEVEL_1_SPELL_SLOTS };
    const remaining = Math.max(0, Math.floor(characterSlots[key] ?? DEFAULT_LEVEL_1_SPELL_SLOTS));
    if (remaining <= 0) {
      throw conflict("COMBAT_409", "사용 가능한 1레벨 주문 슬롯이 없습니다.", { reason: "NO_SPELL_SLOT" });
    }
    spellSlots[sessionCharacterId] = { ...characterSlots, [key]: remaining - 1 };
    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: { flagsJson: JSON.stringify({ ...flags, spellSlotsBySessionCharacterId: spellSlots }) },
    });
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
    return Math.max(
      0,
      Math.floor(spellSlots[sessionCharacterId]?.[String(slotLevel)] ?? DEFAULT_LEVEL_1_SPELL_SLOTS),
    );
  }

  private async storePendingShieldReaction(params: {
    sessionId: string;
    combat: NonNullable<CombatWithParticipants>;
    attacker: CombatParticipantEntity;
    target: CombatParticipantEntity;
    attackTotal: number;
    targetArmorClass: number;
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
    const updated = await this.getActiveCombatEntity(sessionId);
    const response = await this.completeCombatIfResolved(sessionId, updated);
    const message = hit
      ? `${accepted ? "Shield 후에도 " : ""}${attacker.nameSnapshot} 공격 명중: ${target.nameSnapshot}에게 ${damageRoll?.total ?? 0} 피해`
      : `${accepted ? "Shield: " : ""}${attacker.nameSnapshot} 공격 빗나감: ${pending.attackTotal} vs AC ${effectiveAc}`;
    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId,
      sessionScenarioId: sessionScenario.id,
      actorUserId: session.hostUserId,
      sessionCharacterId: attacker.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: { type: "attack", shieldAccepted: accepted, attackerParticipantId: attacker.id, targetParticipantId: target.id },
      diceResult: damageRoll ? { ...damageRoll } : null,
      outcome: hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: message,
    });
    this.realtimeEvents.emitTurnLogCreated(sessionId, turnLog);
    this.realtimeEvents.emitCombatUpdated(sessionId, response);
    this.realtimeEvents.emitSessionSnapshot(sessionId, await this.sessionsService.buildSnapshot(sessionId));
    const map = await this.sessionsService.getVttMapForUser(session.hostUserId, sessionId);
    return { combat: response, map, message, pendingReaction: null };
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
    return participant.tokenId
      ? map.tokens.find((token) => token.id === participant.tokenId && token.hidden !== true) ?? null
      : map.tokens.find(
          (token) =>
            token.sessionCharacterId === participant.sessionCharacterId && token.hidden !== true,
        ) ?? null;
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
    const resolved = this.isCombatResolved(combat);
    this.logger.debug(
      `[COMBAT_RESOLUTION_CHECK] sessionId=${sessionId} combatId=${combat.id} resolved=${resolved} aliveHostiles=${combat.participants.filter((participant) => participant.isHostile && participant.isAlive).length} alivePlayers=${combat.participants.filter((participant) => !participant.isHostile && participant.isAlive).length}`,
    );
    if (!resolved) {
      return this.mapCombat(combat);
    }

    return this.completeCombat(sessionId, combat.id);
  }

  private async completeCombat(sessionId: string, combatId: string): Promise<CombatResponseDto> {
    const combat = await this.getCombatEntityById(combatId);
    this.logger.debug(
      `[COMBAT_COMPLETE_ENTER] sessionId=${sessionId} combatId=${combatId} status=${combat.status} currentParticipantId=${combat.currentParticipantId ?? "null"} aliveHostiles=${combat.participants.filter((participant) => participant.isHostile && participant.isAlive).length} alivePlayers=${combat.participants.filter((participant) => !participant.isHostile && participant.isAlive).length}`,
    );
    if (this.isPartyDefeated(combat)) {
      this.logger.debug(
        `[COMBAT_COMPLETE_PARTY_DEFEATED] sessionId=${sessionId} combatId=${combatId}`,
      );
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

    if (participant?.role !== PrismaParticipantRole.HOST) {
      throw forbidden("GM_403", "GM 권한이 필요합니다.", {
        reason: "GM_OR_HOST_REQUIRED",
      });
    }
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
    if (nextHp <= 0 && participant.tokenId) {
      await this.sessionsService.hideVttToken(combat.sessionId, participant.tokenId);
    }
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
    const current = await this.readCombatConditions(participant);
    if (!current.includes(condition)) {
      current.push(condition);
    }
    await this.writeCombatConditions(participant, current);
  }

  private async removeCombatCondition(
    participant: CombatParticipantEntity,
    condition: string,
  ): Promise<void> {
    const current = await this.readCombatConditions(participant);
    const next = current.filter((entry) => entry !== condition);
    if (next.length === current.length) {
      return;
    }
    await this.writeCombatConditions(participant, next);
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

  private resolveAttackAdvantageState(params: {
    attackerConditions: string[];
    targetConditions: string[];
    allyWithin5FtOfTarget: boolean;
  }): DiceAdvantageState {
    const hasAdvantage =
      params.attackerConditions.includes(COMBAT_CONDITION_HIDDEN) ||
      params.allyWithin5FtOfTarget;
    const hasDisadvantage = params.targetConditions.includes(COMBAT_CONDITION_DODGE);
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
      return participant.speedFt ?? 30;
    }
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: participant.sessionCharacterId },
      select: { character: { select: { speed: true } } },
    });
    return sessionCharacter?.character.speed ?? participant.speedFt ?? 30;
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
      return Array.isArray(parsed)
        ? parsed.filter((condition): condition is string => typeof condition === "string")
        : [];
    } catch {
      return [];
    }
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
        const movementFtTotal = sessionCharacter?.character.speed ?? participant.speedFt ?? 30;
        const turnState = turnStateByParticipantId.get(participant.id) ?? null;
        const spellSlotLevel1Total = this.resolveLevel1SpellSlotTotal(sessionCharacter?.character ?? null);
        const rawLevel1SpellSlots = participant.sessionCharacterId
          ? spellSlotsBySessionCharacterId[participant.sessionCharacterId]?.["1"]
          : undefined;
        const spellSlotLevel1Remaining =
          spellSlotLevel1Total > 0
            ? Math.min(
                spellSlotLevel1Total,
                Math.max(
                  0,
                  Math.floor(rawLevel1SpellSlots ?? spellSlotLevel1Total),
                ),
              )
            : 0;
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
          conditions: this.parseConditions(
            sessionCharacter?.conditionsJson ?? participant.conditionsJson ?? "[]",
          ),
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
          },
        };
      }),
    };
  }

  private resolveLevel1SpellSlotTotal(character: { className: string; level: number } | null): number {
    if (!character || character.level < 1) return 0;
    const className = character.className.trim().toLowerCase();
    if (className.includes("wizard")) return DEFAULT_LEVEL_1_SPELL_SLOTS;
    return 0;
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
