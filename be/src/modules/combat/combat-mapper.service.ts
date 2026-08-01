import { Injectable } from "@nestjs/common";
import {
  CombatEntityType,
  CombatStatus,
  isRecord,
} from "@trpg/shared-types";
import type {
  CombatMonsterActionOptionDto,
  CombatResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import {
  parseJsonOrFallback,
  parseJsonRecordOrFallback,
  parseJsonStringArrayOrFallback,
} from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { ConcentrationRuntimeService } from "../rules/concentration-runtime.service";
import { ConditionRuntimeService, type ConditionStateEntry } from "../rules/condition-runtime.service";
import { SessionsService } from "../sessions/sessions.service";
import { CombatConditionService } from "./combat-condition.service";
import { CombatSpellService } from "./combat-spell.service";
import { ReadyActionService } from "../rules/ready-action.service";
import { SpellSlotService } from "../rules/spell-slot.service";

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
  tempHp: number | null;
  conditionsJson: string | null;
  character: {
    className: string;
    level: number;
    maxHp: number;
    armorClass: number;
    speed: number;
    featuresJson: string | null;
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
    private readonly readyActions: ReadyActionService,
    private readonly spellSlots: SpellSlotService,
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
    const sessionCharacterIds = combat.participants.flatMap((participant) =>
      participant.sessionCharacterId ? [participant.sessionCharacterId] : [],
    );
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
                featuresJson: true,
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
    const flags = parseJsonRecordOrFallback(state.flagsJson, {});
    const spellSlotsBySessionCharacterId = this.spellSlots.readSpellSlotsFromFlags(flags);
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
    const map = await this.sessionsService.getAuthoritativeVttMap(combat.sessionId);
    const pendingReactions = this.mapTriggeredReadyActionPrompts(
      flags,
      combat.participants,
      sessionCharacterById,
    );

    return {
      combatId: combat.id,
      sessionId: combat.sessionId,
      status: this.mapCombatStatus(combat.status),
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
        const conditionsJson =
          sessionCharacter?.conditionsJson ?? participant.conditionsJson ?? "[]";
        const conditionEntries = this.parseConditionEntries(conditionsJson);
        const conditionTags =
          this.combatConditions.combatConditionTags(conditionEntries);
        const maxHpBonus = conditionTags
          .flatMap((tag) => this.matchFirstGroup(tag, /^max_hp_bonus:(\d+)$/))
          .map(Number)
          .filter((value) => Number.isFinite(value) && value > 0)
          .reduce((maximum, value) => Math.max(maximum, value), 0);
        const armorClassBonus = conditionTags
          .flatMap((tag) => this.matchFirstGroup(tag, /^armor_class:\+(\d+)$/))
          .map(Number)
          .filter((value) => Number.isFinite(value) && value > 0)
          .reduce((total, value) => total + value, 0);
        const baseMaxHp = sessionCharacter?.character.maxHp ?? participant.maxHp ?? null;
        const baseArmorClass =
          sessionCharacter?.character.armorClass ?? participant.armorClass ?? null;
        const maxHp = baseMaxHp === null ? null : baseMaxHp + maxHpBonus;
        const armorClass =
          baseArmorClass === null ? null : baseArmorClass + armorClassBonus;
        const conditionInstances = this.conditionRuntime.parseConditionsJsonOrFallback(
          JSON.stringify(conditionEntries),
        );
        const concentrationState =
          this.concentrationRuntime.readActiveConcentration(conditionInstances);
        const featureIds = this.parseStringArray(
          sessionCharacter?.character.featuresJson,
        );
        const hasFastMovement = featureIds.includes(
          "class.barbarian.feature.fast_movement",
        );
        const hasUnarmoredMovement = featureIds.includes(
          "class.monk.feature.unarmored_movement",
        );
        const movementFtTotal = this.applyMovementSpeedModifiers(
          (sessionCharacter?.character.speed ?? participant.speedFt ?? 30) +
            (hasFastMovement || hasUnarmoredMovement ? 10 : 0),
          conditionsJson,
        );
        const turnState = turnStateByParticipantId.get(participant.id) ?? null;
        const hasExtraAttack = featureIds.some((featureId) =>
          featureId.endsWith(".feature.extra_attack"),
        );
        const attackMarkerPrefix = `attack_action:attack:${combat.roundNo}:${combat.turnNo}:`;
        const actionMarkerPrefix = `attack_action:started:${combat.roundNo}:${combat.turnNo}:`;
        const attackCount = conditionTags.filter((tag) =>
          tag.startsWith(attackMarkerPrefix),
        ).length;
        const attackActionCount = conditionTags.filter((tag) =>
          tag.startsWith(actionMarkerPrefix),
        ).length;
        const extraAttackAvailable =
          hasExtraAttack &&
          attackActionCount > 0 &&
          attackCount < attackActionCount * 2;
        const hasteActionAvailable =
          conditionTags.includes("grant:haste_action") &&
          !conditionTags.includes(
            `haste_action:used:${combat.roundNo}:${combat.turnNo}`,
          );
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
          entityType: this.mapCombatEntityType(participant.entityType),
          sessionCharacterId: participant.sessionCharacterId,
          tokenId: participant.tokenId ?? null,
          name: participant.nameSnapshot,
          currentHp,
          tempHp: sessionCharacter?.tempHp ?? null,
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
          conditions: conditionTags.filter(
            (tag) =>
              !tag.startsWith("attack_action:") &&
              !tag.startsWith("haste_action:used:"),
          ),
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
            actionAvailable:
              !turnState?.actionUsed ||
              Boolean(turnState?.additionalActionGranted),
            bonusActionAvailable: !Boolean(turnState?.bonusActionUsed),
            reactionAvailable: !Boolean(turnState?.reactionUsed),
            additionalActionAvailable: Boolean(turnState?.additionalActionGranted),
            extraAttackAvailable,
            hasteActionAvailable,
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

  private applyMovementSpeedModifiers(baseSpeedFt: number, conditionsJson: string): number {
    const conditions = this.parseConditions(conditionsJson);
    const speedOverride = conditions
      .flatMap((tag) => this.matchFirstGroup(tag, /^movement_speed_override:(\d+)$/))
      .map(Number)
      .find((value) => Number.isFinite(value) && value > 0);
    const speedBonus = conditions
      .flatMap((tag) => this.matchFirstGroup(tag, /^movement_speed_bonus:(\d+)$/))
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0)
      .reduce((total, value) => total + value, 0);
    const speedMultiplier = conditions.includes("movement_speed_multiplier:2")
      ? 2
      : 1;
    const effectiveBaseSpeedFt = (speedOverride ?? baseSpeedFt) + speedBonus;
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
    return Math.max(0, effectiveBaseSpeedFt * speedMultiplier - penaltyFt);
  }

  private parseConditions(value: string): string[] {
    return this.combatConditions.combatConditionTags(this.parseConditionEntries(value));
  }

  private parseConditionEntries(value: string): ConditionStateEntry[] {
    return parseJsonOrFallback<ConditionStateEntry[]>(value, [], (parsed) => this.decodeConditionEntries(parsed));
  }

  private decodeConditionEntries(value: unknown): ConditionStateEntry[] {
    if (!Array.isArray(value)) {
      throw new Error("conditions must be an array.");
    }
    return value.flatMap((entry): ConditionStateEntry[] => {
      if (typeof entry === "string") {
        return [entry];
      }
      const [condition] = this.conditionRuntime.parseConditionsJsonOrFallback(JSON.stringify([entry]));
      return condition ? [condition] : [];
    });
  }

  private parseStringArray(value: string | null | undefined): string[] {
    return parseJsonStringArrayOrFallback(value, []);
  }

  private matchFirstGroup(value: string, pattern: RegExp): string[] {
    const match = pattern.exec(value)?.[1];
    return match ? [match] : [];
  }

  private mapTriggeredReadyActionPrompts(
    flags: unknown,
    participants: CombatParticipantForMapping[],
    sessionCharacterById: Map<string, SessionCharacterForMapping>,
  ): CombatResponseDto["pendingReactions"] {
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));
    return this.readyActions.readTriggeredReadyActionsFromFlags(flags).flatMap((candidate): NonNullable<CombatResponseDto["pendingReactions"]> => {
      const reactorParticipantId = candidate.pending.actorParticipantId;
      const moverParticipantId =
        (typeof candidate.triggerEvent.targetParticipantId === "string" ? candidate.triggerEvent.targetParticipantId : null) ??
        (typeof candidate.triggerEvent.sourceParticipantId === "string" ? candidate.triggerEvent.sourceParticipantId : null) ??
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
          id: candidate.id,
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

  private mapCombatStatus(value: string): CombatStatus {
    switch (value) {
      case CombatStatus.ACTIVE:
        return CombatStatus.ACTIVE;
      case CombatStatus.ENDED:
        return CombatStatus.ENDED;
      default:
        return CombatStatus.ACTIVE;
    }
  }

  private mapCombatEntityType(value: string): CombatEntityType {
    switch (value) {
      case CombatEntityType.PLAYER_CHARACTER:
        return CombatEntityType.PLAYER_CHARACTER;
      case CombatEntityType.NPC:
        return CombatEntityType.NPC;
      case CombatEntityType.MONSTER:
        return CombatEntityType.MONSTER;
      default:
        return CombatEntityType.MONSTER;
    }
  }
}
