import { Injectable } from "@nestjs/common";
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
  AvailableActionsResponseDto,
  ApplyCombatDamageDto,
  CombatActionResultDto,
  CombatEntityType,
  CombatResponseDto,
  CombatStatus,
  EndTurnDto,
  GamePhase,
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
import { SessionsService } from "../sessions/sessions.service";

type CombatWithParticipants = Awaited<ReturnType<CombatService["getActiveCombatEntity"]>>;
type CombatParticipantEntity = NonNullable<CombatWithParticipants>["participants"][number];

const RAGE_CONDITION_TAGS = [
  "rage",
  "resistance:bludgeoning",
  "resistance:piercing",
  "resistance:slashing",
];

const DEFAULT_MONSTER_AC = 10;
const DEFAULT_MONSTER_HP = 1;

@Injectable()
export class CombatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly diceService: DiceService,
    private readonly actionRules: ActionRuleService,
    private readonly actionEconomy: ActionEconomyService,
    private readonly characterResources: CharacterResourceService,
    private readonly realtimeEvents: RealtimeEventsService,
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

    const map =
      typeof this.sessionsService.getVttMapForUser === "function"
        ? await this.sessionsService.getVttMapForUser(session.hostUserId ?? userId, session.id)
        : ({ tokens: [] } as unknown as VttMapStateDto);
    const monsterTokens = (map.tokens ?? [])
      .filter((token) => token.hidden !== true && token.isHostile === true)
      .filter((token) => !dto.participantEntityIds?.length || dto.participantEntityIds.includes(token.id));

    const playerInitiativeRows = candidates
      .map((candidate) => ({
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
    const initiativeRows = [...playerInitiativeRows, ...monsterInitiativeRows]
      .sort((left, right) => (right.initiative - left.initiative) || (right.tieBreaker - left.tieBreaker));

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
              tokenId: row.kind === "monster" ? row.token.id : null,
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

      // 전투 시작 직후 첫 행동 검증이 안정적으로 동작하도록 첫 턴 상태를 미리 만든다.
      // SRD 행동 경제는 캐릭터와 몬스터 모두 전투자원이 같으므로 전투 참여자 단위로 잡는다.
      await tx.combatTurnState.upsert({
        where: {
          combatId_roundNo_turnNo_combatParticipantId: {
            combatId: created.id,
            roundNo: 1,
            turnNo: 1,
            combatParticipantId: firstParticipant.id,
          },
        },
        create: {
          combatId: created.id,
          combatParticipantId: firstParticipant.id,
          roundNo: 1,
          turnNo: 1,
          sessionCharacterId: firstParticipant.sessionCharacterId,
        },
        update: {},
      });

      // 전투 시작은 세션 전체 UI가 바뀌는 상태 전환이므로 GameState phase와 version을 함께 올린다.
      await tx.gameState.update({
        where: { sessionScenarioId: sessionScenario.id },
        data: {
          phase: PrismaGamePhase.COMBAT,
          version: state.version + 1,
        },
      });

      return tx.combat.findUniqueOrThrow({
        where: { id: created.id },
        include: { participants: { orderBy: { turnOrder: "asc" } } },
      });
    });

    const response = await this.mapCombat(combat);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));
    return response;
  }

  async getCombat(userId: string, sessionId: string): Promise<CombatResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    return this.mapCombat(await this.getActiveCombatEntity(session.id));
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
      await this.actionEconomy.getOrCreateTurnState({
        combatId: updated.id,
        combatParticipantId: next.id,
        roundNo: updated.roundNo,
        turnNo: updated.turnNo,
        sessionCharacterId: next.sessionCharacterId,
      });
    }

    const expiredRageCount = await this.endExpiredRagesForCombat(updated);

    const response: TurnAdvanceResponseDto = {
      combatId: updated.id,
      endedEntityId: current.id,
      nextEntityId: next?.id ?? null,
      roundNo: updated.roundNo,
      turnNo: updated.turnNo,
    };

    this.realtimeEvents.emitTurnChanged(session.id, response);
    this.realtimeEvents.emitCombatUpdated(session.id, await this.mapCombat(updated));
    if (expiredRageCount > 0) {
      this.realtimeEvents.emitSessionSnapshot(
        session.id,
        await this.sessionsService.buildSnapshot(session.id),
      );
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
    const response = await this.mapCombat(updated);
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message: `${target.nameSnapshot} ${healing ? "회복" : "피해"} ${amount}`,
      attackTotal: null,
      damageTotal: amount,
    };
  }

  async resolveAttack(
    userId: string,
    sessionId: string,
    dto: ResolveCombatAttackDto,
  ): Promise<CombatActionResultDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const combat = await this.getActiveCombatEntity(session.id);
    const attacker = this.findCombatParticipantOrThrow(combat, dto.attackerParticipantId);
    const target = this.findCombatParticipantOrThrow(combat, dto.targetParticipantId);

    if (session.gmMode === PrismaGmMode.HUMAN) {
      await this.ensureActorCanAct(userId, session.id, combat, attacker);
    }

    if (!attacker.isAlive || !target.isAlive) {
      throw conflict("COMBAT_409", "행동할 수 없는 전투 참여자입니다.", {
        reason: "COMBATANT_DEFEATED",
      });
    }

    const attackBonus = Math.floor(dto.attackBonus ?? 0);
    const attackRoll = this.diceService.roll(`1d20+${attackBonus}`);
    const targetArmorClass = this.resolveParticipantArmorClass(target);
    const naturalD20 = attackRoll.rolls[0] ?? 0;
    const criticalHit = naturalD20 === 20;
    const criticalMiss = naturalD20 === 1;
    const hit = criticalHit || (!criticalMiss && attackRoll.total >= targetArmorClass);
    const damageRoll = hit
      ? this.diceService.roll(this.buildDamageExpression(dto.damageDice, dto.damageBonus, criticalHit))
      : null;

    if (damageRoll) {
      await this.applyHitPointDelta(combat, target, -damageRoll.total);
    }
    await this.spendCurrentActionIfNeeded(combat, attacker);

    const updated = await this.getActiveCombatEntity(session.id);
    const response = await this.mapCombat(updated);
    this.realtimeEvents.emitDiceRolled(session.id, attackRoll);
    if (damageRoll) {
      this.realtimeEvents.emitDiceRolled(session.id, damageRoll);
    }
    this.realtimeEvents.emitCombatUpdated(session.id, response);
    this.realtimeEvents.emitSessionSnapshot(session.id, await this.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message: hit
        ? `${attacker.nameSnapshot} 공격 명중: ${target.nameSnapshot}에게 ${damageRoll?.total ?? 0} 피해`
        : `${attacker.nameSnapshot} 공격 빗나감: ${attackRoll.total} vs AC ${targetArmorClass}`,
      attackTotal: attackRoll.total,
      damageTotal: damageRoll?.total ?? null,
    };
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
      return;
    }

    const maxHp = participant.maxHp ?? DEFAULT_MONSTER_HP;
    const currentHp = participant.currentHp ?? maxHp;
    const nextHp = this.clampNumber(currentHp + delta, 0, maxHp);
    await this.prisma.combatParticipant.update({
      where: { id: participant.id },
      data: { currentHp: nextHp, isAlive: nextHp > 0 },
    });
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
    const maxHp =
      this.parseFirstInteger(token.monster?.hitPointsRaw) ??
      this.parseFirstInteger(token.monster?.basicRaw) ??
      DEFAULT_MONSTER_HP;
    const armorClass =
      this.parseFirstInteger(token.monster?.armorClassRaw) ??
      DEFAULT_MONSTER_AC;

    return { currentHp: maxHp, maxHp, armorClass };
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
      ? (await this.prisma.sessionCharacter.findMany({
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
        })) ?? []
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
            bonusActionAvailable:
              this.hasBonusActionOption(participant, sessionCharacter?.character ?? null) &&
              !Boolean(turnState?.bonusActionUsed),
            reactionAvailable: !Boolean(turnState?.reactionUsed),
            additionalActionAvailable: Boolean(turnState?.additionalActionGranted),
            movementFtTotal,
            movementFtRemaining: movementFtTotal,
          },
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
