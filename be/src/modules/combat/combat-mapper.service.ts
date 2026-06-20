import { Injectable } from "@nestjs/common";
import type {
  CombatEntityType,
  CombatMonsterActionOptionDto,
  CombatResponseDto,
  CombatStatus,
  VttMapStateDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { ConcentrationRuntimeService } from "../rules/concentration-runtime.service";
import { ConditionRuntimeService } from "../rules/condition-runtime.service";
import { SessionsService } from "../sessions/sessions.service";
import { CombatConditionService } from "./combat-condition.service";
import { CombatSpellService } from "./combat-spell.service";
import { TRIGGERED_READY_ACTIONS_FLAG } from "../rules/ready-action.service";
import type { TriggeredReadyAction } from "../rules/ready-action.service";

type CombatForMapping = {
  id: string;
  sessionId: string;
  status: string;
  roundNo: number;
  turnNo: number;
  currentParticipantId: string | null;
  participants: CombatParticipantForMapping[];
};

type CombatParticipantForMapping = {
  id: string;
  entityType: string;
  sessionCharacterId: string | null;
  tokenId: string | null;
  nameSnapshot: string;
  currentHp: number | null;
  maxHp: number | null;
  armorClass: number | null;
  initiative: number;
  turnOrder: number;
  isAlive: boolean;
  isHostile: boolean;
  conditionsJson: string | null;
  speedFt: number | null;
};

type SessionCharacterForMapping = {
  id: string;
  currentHp: number | null;
  conditionsJson: string | null;
  character: {
    className: string;
    level: number;
    maxHp: number;
    armorClass: number;
    speed: number;
  };
};

@Injectable()
export class CombatMapperService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly conditionRuntime: ConditionRuntimeService,
    private readonly concentrationRuntime: ConcentrationRuntimeService,
    private readonly combatConditions: CombatConditionService,
    private readonly combatSpells: CombatSpellService,
  ) {}

  async mapCombat(
    combat: CombatForMapping,
    options: {
      gmRuntimeUserId: string;
      findParticipantToken: (
        map: VttMapStateDto,
        participant: CombatParticipantForMapping,
      ) => VttMapStateDto["tokens"][number] | null;
      listMonsterActionOptionsForParticipant: (
        participant: CombatParticipantForMapping,
        token: VttMapStateDto["tokens"][number] | null,
        flags: Record<string, unknown>,
      ) => CombatMonsterActionOptionDto[];
    },
  ): Promise<CombatResponseDto> {
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
    const sessionCharacterById = new Map(
      (sessionCharacters as SessionCharacterForMapping[]).map((row) => [row.id, row]),
    );
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
    const map = await this.sessionsService.getVttMapForUser(options.gmRuntimeUserId, combat.sessionId);
    const pendingReactions = this.mapTriggeredReadyActionPrompts(
      flags[TRIGGERED_READY_ACTIONS_FLAG],
      combat.participants,
      sessionCharacterById,
    );

    return {
      combatId: combat.id,
      sessionId: combat.sessionId,
      status: combat.status as CombatStatus,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      roundTurnNo,
      currentEntityId: combat.currentParticipantId,
      pendingReactions,
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
        const spellSlots = this.combatSpells.resolveCombatSpellSlotResources(
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
          conditions: this.combatConditions.combatConditionTags(conditionEntries),
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
          monsterActions: options.listMonsterActionOptionsForParticipant(
            participant,
            options.findParticipantToken(map, participant),
            flags,
          ),
        };
      }),
    };
  }

  private applyMovementSpeedPenalties(baseSpeedFt: number, conditionsJson: string): number {
    const conditions = this.parseConditions(conditionsJson);
    if (
      conditions.includes("condition:restrained") ||
      conditions.includes("speed:zero")
    ) {
      return 0;
    }
    const penaltyFt = conditions
      .filter((tag) => tag.startsWith("movement_speed_penalty:"))
      .map((tag) => Number(tag.slice("movement_speed_penalty:".length)))
      .filter((value) => Number.isFinite(value) && value > 0)
      .reduce((total, value) => total + value, 0);
    return Math.max(0, baseSpeedFt - penaltyFt);
  }

  private parseConditions(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? this.combatConditions.combatConditionTags(parsed) : [];
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

  private mapTriggeredReadyActionPrompts(
    value: unknown,
    participants: CombatParticipantForMapping[],
    sessionCharacterById: Map<string, SessionCharacterForMapping>,
  ): CombatResponseDto["pendingReactions"] {
    if (!Array.isArray(value)) {
      return [];
    }
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));
    return value.flatMap((candidate): NonNullable<CombatResponseDto["pendingReactions"]> => {
      if (!candidate || typeof candidate !== "object") {
        return [];
      }
      const triggered = candidate as Partial<TriggeredReadyAction>;
      if (
        triggered.type !== "triggered_ready_action" ||
        triggered.status !== "pending_response" ||
        typeof triggered.id !== "string" ||
        !triggered.pending ||
        !triggered.triggerEvent
      ) {
        return [];
      }
      const reactorParticipantId = triggered.pending.actorParticipantId;
      const moverParticipantId =
        triggered.triggerEvent.targetParticipantId ??
        triggered.triggerEvent.sourceParticipantId ??
        null;
      if (!moverParticipantId) {
        return [];
      }
      const reactor = participantById.get(reactorParticipantId);
      const mover = participantById.get(moverParticipantId);
      const reactorConditionsJson =
        (reactor?.sessionCharacterId
          ? sessionCharacterById.get(reactor.sessionCharacterId)?.conditionsJson
          : null) ??
        reactor?.conditionsJson ??
        "[]";
      if (
        !reactor ||
        !reactor.isAlive ||
        this.combatConditions.isCombatParticipantIncapacitated({
          ...reactor,
          conditionsJson: reactorConditionsJson,
        })
      ) {
        return [];
      }
      return [
        {
          id: triggered.id,
          type: "ready_action",
          reactorParticipantId,
          reactorName: reactor?.nameSnapshot || "준비행동 사용자",
          moverParticipantId,
          moverName: mover?.nameSnapshot || "대상",
          message: `${reactor?.nameSnapshot || "준비행동 사용자"}의 준비행동 조건이 충족되었습니다. 실행할까요?`,
        },
      ];
    });
  }
}
