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
  CombatEntityType,
  CombatResponseDto,
  CombatStatus,
  EndTurnDto,
  GamePhase,
  StartCombatDto,
  TurnAdvanceResponseDto,
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

const RAGE_CONDITION_TAGS = [
  "rage",
  "resistance:bludgeoning",
  "resistance:piercing",
  "resistance:slashing",
];

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

    if (!candidates.length) {
      throw unprocessable("COMBAT_422", "전투를 시작할 수 없습니다.", {
        reason: "NO_COMBAT_PARTICIPANTS",
      });
    }

    const characterInitiativeRows = candidates.map((candidate) => ({
        type: "session_character" as const,
        candidate,
        initiative: dto.autoRollInitiative === false ? 10 : this.diceService.roll("1d20").total,
      }));
    const hostileInitiativeRows = (dto.hostileParticipants ?? []).map((hostile) => ({
      type: "hostile" as const,
      hostile,
      initiative:
        hostile.initiative ?? (dto.autoRollInitiative === false ? 10 : this.diceService.roll("1d20").total),
    }));
    const initiativeRows = [...characterInitiativeRows, ...hostileInitiativeRows].sort(
      (left, right) => right.initiative - left.initiative,
    );

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
          if (row.type === "hostile") {
            const maxHp = row.hostile.maxHp ?? 7;
            return tx.combatParticipant.create({
              data: {
                combatId: created.id,
                entityType:
                  row.hostile.entityType === CombatEntityType.NPC
                    ? PrismaCombatEntityType.NPC
                    : PrismaCombatEntityType.MONSTER,
                sessionCharacterId: null,
                nameSnapshot: row.hostile.name,
                currentHp: maxHp,
                maxHp,
                armorClass: row.hostile.armorClass ?? 13,
                tempHp: 0,
                conditionsJson: JSON.stringify([]),
                initiative: row.initiative,
                turnOrder: index + 1,
                isAlive: true,
                isHostile: true,
              },
            });
          }

          return tx.combatParticipant.create({
            data: {
              combatId: created.id,
              entityType: PrismaCombatEntityType.PLAYER_CHARACTER,
              sessionCharacterId: row.candidate.id,
              nameSnapshot: row.candidate.character.name,
              currentHp: row.candidate.currentHp,
              maxHp: row.candidate.character.maxHp,
              armorClass: row.candidate.character.armorClass,
              tempHp: row.candidate.tempHp,
              conditionsJson: row.candidate.conditionsJson,
              initiative: row.initiative,
              turnOrder: index + 1,
              isAlive: true,
              isHostile: false,
            },
          });
        }),
      );

      const firstParticipant = participants[0];
      await tx.combat.update({
        where: { id: created.id },
        data: { currentParticipantId: firstParticipant.id },
      });

      if (firstParticipant.sessionCharacterId) {
        // 전투 시작 직후 첫 행동 검증이 안정적으로 동작하도록 첫 턴 상태를 미리 만든다.
        await tx.combatTurnState.upsert({
          where: {
            combatId_roundNo_turnNo_sessionCharacterId: {
              combatId: created.id,
              roundNo: 1,
              turnNo: 1,
              sessionCharacterId: firstParticipant.sessionCharacterId,
            },
          },
          create: {
            combatId: created.id,
            roundNo: 1,
            turnNo: 1,
            sessionCharacterId: firstParticipant.sessionCharacterId,
          },
          update: {},
        });
      }

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

    const response = this.mapCombat(combat);
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
      });

      if (!actor || actor.id !== current.sessionCharacterId) {
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
      await tx.combatParticipant.update({
        where: { id: current.id },
        data: { turnEndedAt: new Date() },
      });

      return tx.combat.update({
        where: { id: combat.id },
        data: {
          currentParticipantId: next?.id ?? null,
          turnNo: nextTurnNo,
          roundNo: nextRoundNo,
        },
        include: { participants: { orderBy: { turnOrder: "asc" } } },
      });
    });

    if (next?.sessionCharacterId) {
      await this.actionEconomy.getOrCreateTurnState({
        combatId: updated.id,
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
    this.realtimeEvents.emitCombatUpdated(session.id, this.mapCombat(updated));
    if (expiredRageCount > 0) {
      this.realtimeEvents.emitSessionSnapshot(
        session.id,
        await this.sessionsService.buildSnapshot(session.id),
      );
    }
    return response;
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

  private mapCombat(combat: NonNullable<CombatWithParticipants>): CombatResponseDto {
    return {
      combatId: combat.id,
      sessionId: combat.sessionId,
      status: combat.status as CombatStatus,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      currentEntityId: combat.currentParticipantId,
      participants: combat.participants.map((participant) => ({
        sessionEntityId: participant.id,
        entityType: participant.entityType as CombatEntityType,
        sessionCharacterId: participant.sessionCharacterId,
        name: participant.nameSnapshot,
        currentHp: participant.currentHp,
        maxHp: participant.maxHp,
        armorClass: participant.armorClass,
        initiative: participant.initiative,
        turnOrder: participant.turnOrder,
        isAlive: participant.isAlive,
        isHostile: participant.isHostile,
      })),
    };
  }
}
