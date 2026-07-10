import { Injectable } from "@nestjs/common";
import type {
  CastCombatSpellDto,
  DiceRollResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import { notFound } from "../../common/exceptions/domain-error";
import {
  parseJsonRecordOrFallback,
  parseJsonRecordOrThrow,
} from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import type { CoverModifierProduced } from "../rules/rule-engine.types";
import { SessionsService } from "../sessions/sessions.service";
import type { SrdEngineExecutableMonsterAction } from "./srd-engine.types";

const PENDING_COMBAT_REACTION_FLAG = "pendingCombatReaction";

export type PendingOpportunityAttackReaction = {
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

export type PendingOpportunityAttackContinuation = {
  type: "auto_monster_attack";
  userId: string;
  targetParticipantId: string;
  targetTokenId: string | null;
  autoEndTurn: boolean;
  action: SrdEngineExecutableMonsterAction;
};

export type PendingMonsterMultiattackContinuation = {
  type: "monster_multiattack";
  userId: string;
  actorParticipantId: string;
  targetParticipantId: string;
  targetTokenId: string | null;
  autoEndTurn: boolean;
  parentAction: SrdEngineExecutableMonsterAction;
  remainingActions: SrdEngineExecutableMonsterAction[];
};

export type PendingScorchingRayContinuation = {
  type: "scorching_ray";
  userId: string;
  actorParticipantId: string;
  remainingTargetParticipantIds: string[];
  attackBonus: number;
  damageDice: string;
};

export type PendingShieldContinuation =
  | PendingMonsterMultiattackContinuation
  | PendingScorchingRayContinuation;

export type PendingShieldReaction = {
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
  spellId?: string | null;
  conditionRollModifiers?: Array<{
    source: "spell.bless" | "spell.bane" | "bardic_inspiration";
    value: number;
    roll: DiceRollResponseDto;
  }>;
  createdAt: string;
  continuation?: PendingShieldContinuation | null;
};

export type PendingCounterspellReaction = {
  id: string;
  type: "counterspell";
  sessionId: string;
  combatId: string;
  roundNo: number;
  turnNo: number;
  reactorParticipantId: string;
  reactorUserId: string;
  casterParticipantId: string;
  casterUserId: string;
  spellId: string;
  spellLevel: number;
  actionCost: "action" | "bonus_action" | "reaction";
  castDto: CastCombatSpellDto;
  createdAt: string;
};

export type PendingCombatReaction =
  | PendingOpportunityAttackReaction
  | PendingShieldReaction
  | PendingCounterspellReaction;

@Injectable()
export class CombatReactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  async hasPendingCombatReaction(sessionId: string): Promise<boolean> {
    const { state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseFlagsForRead(state.flagsJson);
    return Boolean(this.readPendingCombatReaction(flags));
  }

  async storePendingCombatReaction(
    sessionId: string,
    pending: PendingCombatReaction,
  ): Promise<void> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseFlagsForMutation(state.flagsJson);
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

  async consumePendingCombatReaction(
    sessionId: string,
    reactionId: string,
  ): Promise<PendingCombatReaction> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseFlagsForMutation(state.flagsJson);
    const pending = this.readPendingCombatReaction(flags);
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

  private parseFlagsForRead(value: string | null | undefined): Record<string, unknown> {
    return parseJsonRecordOrFallback(value, {});
  }

  private parseFlagsForMutation(value: string | null | undefined): Record<string, unknown> {
    return parseJsonRecordOrThrow(value, {}, "gameState.flagsJson");
  }

  private readPendingCombatReaction(flags: Record<string, unknown>): PendingCombatReaction | null {
    const pendingCandidate = flags[PENDING_COMBAT_REACTION_FLAG];
    return this.isPendingCombatReaction(pendingCandidate) ? pendingCandidate : null;
  }

  private isPendingCombatReaction(value: unknown): value is PendingCombatReaction {
    if (!this.isRecord(value) || !this.hasPendingReactionBase(value)) {
      return false;
    }
    switch (value.type) {
      case "opportunity_attack":
        return (
          this.hasString(value.reactorParticipantId) &&
          this.hasString(value.reactorUserId) &&
          this.hasString(value.moverParticipantId) &&
          this.hasFiniteNumber(value.movementDistanceFt) &&
          (value.movementCostFt === undefined || this.hasFiniteNumber(value.movementCostFt)) &&
          this.isRecord(value.map)
        );
      case "shield":
        return (
          this.hasString(value.reactorParticipantId) &&
          this.hasString(value.reactorUserId) &&
          this.hasString(value.attackerParticipantId) &&
          this.hasString(value.targetParticipantId) &&
          this.hasFiniteNumber(value.attackTotal) &&
          this.hasFiniteNumber(value.targetArmorClass)
        );
      case "counterspell":
        return (
          this.hasString(value.reactorParticipantId) &&
          this.hasString(value.reactorUserId) &&
          this.hasString(value.casterParticipantId) &&
          this.hasString(value.casterUserId) &&
          this.hasString(value.spellId) &&
          this.hasFiniteNumber(value.spellLevel) &&
          (value.actionCost === "action" || value.actionCost === "bonus_action" || value.actionCost === "reaction") &&
          this.isRecord(value.castDto)
        );
      default:
        return false;
    }
  }

  private hasPendingReactionBase(value: Record<string, unknown>): value is Record<string, unknown> & {
    id: string;
    type: "opportunity_attack" | "shield" | "counterspell";
    sessionId: string;
    combatId: string;
    roundNo: number;
    turnNo: number;
    createdAt: string;
  } {
    return (
      this.hasString(value.id) &&
      (value.type === "opportunity_attack" || value.type === "shield" || value.type === "counterspell") &&
      this.hasString(value.sessionId) &&
      this.hasString(value.combatId) &&
      this.hasFiniteNumber(value.roundNo) &&
      this.hasFiniteNumber(value.turnNo) &&
      this.hasString(value.createdAt)
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private hasString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
  }

  private hasFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }
}
