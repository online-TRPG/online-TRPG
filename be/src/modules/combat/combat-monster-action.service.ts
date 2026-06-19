import { Injectable } from "@nestjs/common";
import { CombatEntityType as PrismaCombatEntityType } from "@prisma/client";
import type { CombatMonsterActionOptionDto, VttMapStateDto } from "@trpg/shared-types";
import { unprocessable } from "../../common/exceptions/domain-error";
import { MonsterAbilityService } from "../rules/monster-ability.service";
import {
  CombatMonsterResourceService,
  MONSTER_LIMITED_USE_EXPENDED_FLAG,
  MONSTER_RECHARGE_EXPENDED_FLAG,
} from "./combat-monster-resource.service";
import { CombatMovementService } from "./combat-movement.service";
import { SrdEngineLoaderService } from "./srd-engine-loader.service";
import type { SrdEngineExecutableMonsterAction } from "./srd-engine.types";

type MonsterActionParticipant = {
  id: string;
  entityType: PrismaCombatEntityType | string;
  nameSnapshot: string;
};

@Injectable()
export class CombatMonsterActionService {
  constructor(
    private readonly monsterAbilities: MonsterAbilityService,
    private readonly srdEngine: SrdEngineLoaderService,
    private readonly combatMovement: CombatMovementService,
    private readonly combatMonsterResources: CombatMonsterResourceService,
  ) {}

  resolveMonsterActionForParticipant(
    participant: MonsterActionParticipant,
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

  listMonsterActionOptionsForParticipant(
    participant: MonsterActionParticipant,
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
        const unavailableReason = this.resolveMonsterActionUnavailableReason(
          participant,
          action,
          flags,
        );
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

  getMonsterActionRangeCheck(
    map: VttMapStateDto,
    params: {
      action: SrdEngineExecutableMonsterAction;
      sourceTokenId: string | null;
      targetTokenId: string | null;
    },
  ): {
    inRange: boolean;
    distanceFt: number | null;
    rangeFt: number;
    longRangeDisadvantage: boolean;
  } {
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

    const distanceFt = this.combatMovement.getTokenGridDistanceFt(map, sourceToken, targetToken);
    return {
      inRange: distanceFt <= longRangeFt,
      distanceFt,
      rangeFt: longRangeFt,
      longRangeDisadvantage: distanceFt > normalRangeFt && distanceFt <= longRangeFt,
    };
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

  private resolveMonsterActionUnavailableReason(
    participant: MonsterActionParticipant,
    action: SrdEngineExecutableMonsterAction,
    flags: Record<string, unknown>,
  ): string | null {
    const rechargeExpended = this.combatMonsterResources.parseMonsterRechargeExpended(
      flags[MONSTER_RECHARGE_EXPENDED_FLAG],
    );
    if (this.combatMonsterResources.isRechargeMonsterAction(action) && rechargeExpended[participant.id]?.[action.actionId]) {
      return "MONSTER_RECHARGE_ACTION_EXPENDED";
    }

    const limitedUseLimit = this.combatMonsterResources.resolveMonsterLimitedUseLimit(action);
    if (limitedUseLimit !== null) {
      const limitedUseExpended = this.combatMonsterResources.parseMonsterLimitedUseExpended(
        flags[MONSTER_LIMITED_USE_EXPENDED_FLAG],
      );
      const used = this.combatMonsterResources.extractMonsterLimitedUseUsed(
        limitedUseExpended[participant.id]?.[action.actionId],
      );
      if (used >= limitedUseLimit) {
        return "MONSTER_LIMITED_USE_ACTION_EXPENDED";
      }
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
}
