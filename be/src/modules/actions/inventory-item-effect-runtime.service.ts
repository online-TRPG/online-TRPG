import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/exceptions/domain-error";
import { ConditionRuntimeService } from "../rules/condition-runtime.service";
import { DiceService } from "../rules/dice.service";
import { ExecutableItemDefinition } from "../rules/p3-item-manifest";
import {
  buildItemConditionEffectMetadata,
  buildTerrainItemEffectMessage,
  resolveTemporaryHpEffect,
} from "./inventory-item-policy";

@Injectable()
export class InventoryItemEffectRuntimeService {
  constructor(
    private readonly diceService: DiceService,
    private readonly conditionRuntime: ConditionRuntimeService,
  ) {}

  resolveExecutableItemEffect(
    item: ExecutableItemDefinition,
    sessionCharacter: {
      id: string;
      currentHp: number;
      tempHp: number;
      conditionsJson: string;
      character: { maxHp: number };
    },
  ): {
    healingAmount: number | null;
    tempHp: number | null;
    conditionsJson: string | null;
    diceResult: ReturnType<DiceService["roll"]> | null;
    message: string | null;
  } {
    const effect = item.effect;
    if (effect.type === "healing") {
      const diceResult = this.diceService.roll(effect.dice);
      return {
        healingAmount: diceResult.total,
        tempHp: null,
        conditionsJson: null,
        diceResult,
        message: null,
      };
    }
    if (effect.type === "temporary_hp") {
      const tempHpEffect = resolveTemporaryHpEffect({
        currentTempHp: sessionCharacter.tempHp,
        amount: effect.amount,
      });
      return {
        healingAmount: null,
        tempHp: tempHpEffect.tempHp,
        conditionsJson: null,
        diceResult: null,
        message: tempHpEffect.message,
      };
    }
    if (
      effect.type === "condition" ||
      effect.type === "utility" ||
      effect.type === "tool" ||
      effect.type === "spell"
    ) {
      const conditionEffect = buildItemConditionEffectMetadata(effect);
      const conditions = this.conditionRuntime.applyCondition(
        this.conditionRuntime.parseConditionsJson(
          sessionCharacter.conditionsJson,
        ),
        this.conditionRuntime.createCondition({
          conditionId: `condition.item.${item.id}`,
          sourceId: item.id,
          duration: { type: "rounds", remaining: conditionEffect.durationRounds },
          stackPolicy: "replace",
          tags: conditionEffect.tags,
        }),
      );
      return {
        healingAmount: null,
        tempHp: null,
        conditionsJson: JSON.stringify(conditions),
        diceResult: null,
        message: conditionEffect.message,
      };
    }
    if (effect.type === "terrain") {
      return {
        healingAmount: null,
        tempHp: null,
        conditionsJson: null,
        diceResult: null,
        message: buildTerrainItemEffectMessage(effect),
      };
    }
    throw badRequest("INVENTORY_400", "이 아이템은 해당 방식으로 사용할 수 없습니다.", {
      reason: "ITEM_INTERACTION_MODE_MISMATCH",
      interaction: item.interaction,
      effectType: effect.type,
    });
  }
}
