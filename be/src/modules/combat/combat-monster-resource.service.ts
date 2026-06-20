import { Injectable } from "@nestjs/common";
import { CombatEntityType as PrismaCombatEntityType } from "@prisma/client";
import type { CombatMonsterLifecycleEffectDto, DiceRollResponseDto } from "@trpg/shared-types";
import { conflict } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { DiceService } from "../rules/dice.service";
import { SessionsService } from "../sessions/sessions.service";
import type { SrdEngineExecutableMonsterAction } from "./srd-engine.types";

export const MONSTER_RECHARGE_EXPENDED_FLAG = "monsterRechargeExpended";
export const MONSTER_LIMITED_USE_EXPENDED_FLAG = "monsterLimitedUseExpended";

type MonsterResourceActor = {
  id: string;
  entityType: PrismaCombatEntityType;
  isAlive: boolean;
  nameSnapshot?: string;
  tokenId?: string | null;
};

type MonsterResourceCombat = {
  roundNo: number;
  turnNo: number;
};

@Injectable()
export class CombatMonsterResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly diceService: DiceService,
  ) {}

  async resolveMonsterRechargeActionsForTurnStart(
    sessionId: string,
    actor: MonsterResourceActor,
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

  resolveMonsterLifecycleEffectsForTurnHook(params: {
    actor: MonsterResourceActor | null;
    hook: CombatMonsterLifecycleEffectDto["hook"];
    actions: SrdEngineExecutableMonsterAction[];
  }): CombatMonsterLifecycleEffectDto[] {
    if (!params.actor || params.actor.entityType !== PrismaCombatEntityType.MONSTER || !params.actor.isAlive) {
      return [];
    }
    const actor = params.actor;

    return params.actions.flatMap((action) => {
      const matchingTags = this.resolveMonsterLifecycleTags(action, params.hook);
      if (matchingTags.length === 0) {
        return [];
      }
      return [{
        actorParticipantId: actor.id,
        actorName: actor.nameSnapshot ?? "Monster",
        actionId: action.actionId,
        label: action.label,
        hook: params.hook,
        effectTags: matchingTags,
      }];
    });
  }

  async assertMonsterRechargeActionAvailable(
    sessionId: string,
    actor: MonsterResourceActor,
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

  async recordMonsterRechargeActionExpended(
    sessionId: string,
    combat: MonsterResourceCombat,
    actor: MonsterResourceActor,
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

  async assertMonsterLimitedUseActionAvailable(
    sessionId: string,
    actor: MonsterResourceActor,
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

  async recordMonsterLimitedUseActionExpended(
    sessionId: string,
    combat: MonsterResourceCombat,
    actor: MonsterResourceActor,
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

  async clearCombatBoundMonsterLimitedUses(sessionId: string): Promise<void> {
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

  parseMonsterRechargeExpended(value: unknown): Record<string, Record<string, unknown>> {
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

  parseMonsterLimitedUseExpended(value: unknown): Record<string, Record<string, unknown>> {
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

  isRechargeMonsterAction(action: SrdEngineExecutableMonsterAction): boolean {
    return typeof action.recharge === "string" && action.recharge.trim().length > 0;
  }

  private resolveMonsterLifecycleTags(
    action: SrdEngineExecutableMonsterAction,
    hook: CombatMonsterLifecycleEffectDto["hook"],
  ): string[] {
    const effectTags = (action.effectTags ?? []).filter((tag) => typeof tag === "string" && tag.trim().length > 0);
    const hookAliases: Record<CombatMonsterLifecycleEffectDto["hook"], string[]> = {
      aura: ["aura", "trigger:aura", "hook:aura"],
      turn_start: ["turn_start", "turn-start", "on_turn_start", "trigger:on_turn_start", "hook:turn_start"],
      turn_end: ["turn_end", "turn-end", "on_turn_end", "trigger:on_turn_end", "hook:turn_end"],
    };
    return effectTags.filter((tag) =>
      hookAliases[hook].some((alias) => tag === alias || tag.startsWith(`${alias}:`)),
    );
  }

  resolveMonsterLimitedUseLimit(action: SrdEngineExecutableMonsterAction): number | null {
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

  extractMonsterLimitedUseUsed(entry: unknown): number {
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

  private isCombatBoundMonsterLimitedUse(entry: unknown): boolean {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    const usage = (entry as { usage?: unknown }).usage;
    return typeof usage === "string" && /^\d+\s*\/\s*combat$/i.test(usage.trim());
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
