import { Injectable } from "@nestjs/common";
import type { DiceRollResponseDto, VttMapStateDto } from "@trpg/shared-types";
import { notFound } from "../../common/exceptions/domain-error";
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
    source: "spell.bless" | "spell.bane";
    value: number;
    roll: DiceRollResponseDto;
  }>;
  createdAt: string;
  continuation?: PendingMonsterMultiattackContinuation | null;
};

export type PendingCombatReaction = PendingOpportunityAttackReaction | PendingShieldReaction;

@Injectable()
export class CombatReactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  async hasPendingCombatReaction(sessionId: string): Promise<boolean> {
    const { state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    return Boolean(flags[PENDING_COMBAT_REACTION_FLAG]);
  }

  async storePendingCombatReaction(
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

  async consumePendingCombatReaction(
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

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
