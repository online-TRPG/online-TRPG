import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { DiceService } from "../rules/dice.service";
import { resolveFallbackHealingAmount } from "./inventory-item-policy";

export type InventoryItemEffectResolution = {
  healingAmount: number | null;
  tempHp: number | null;
  conditionsJson: string | null;
  diceResult: ReturnType<DiceService["roll"]> | null;
  message: string | null;
};

@Injectable()
export class InventoryItemEffectApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  async applyCharacterEffect(params: {
    targetSessionCharacter: {
      id: string;
      currentHp: number;
      character: { maxHp: number };
    };
    itemDefinition: {
      id: string;
      name: string;
      itemType: string;
      propertiesJson: string | null;
      useEffect: string | null;
    };
    effectResolution: InventoryItemEffectResolution | null;
  }): Promise<{ healedHp: number | null }> {
    const healingAmount =
      params.effectResolution?.healingAmount ??
      resolveFallbackHealingAmount(params.itemDefinition);
    const healedHp = healingAmount
      ? Math.max(
          0,
          Math.min(
            params.targetSessionCharacter.character.maxHp,
            params.targetSessionCharacter.currentHp + healingAmount,
          ) - params.targetSessionCharacter.currentHp,
        )
      : null;

    if (
      healingAmount ||
      (params.effectResolution?.tempHp !== null &&
        params.effectResolution?.tempHp !== undefined) ||
      params.effectResolution?.conditionsJson
    ) {
      await this.prisma.sessionCharacter.update({
        where: { id: params.targetSessionCharacter.id },
        data: {
          ...(healingAmount
            ? { currentHp: { increment: healedHp ?? 0 } }
            : {}),
          ...(params.effectResolution?.tempHp !== null &&
          params.effectResolution?.tempHp !== undefined
            ? { tempHp: params.effectResolution.tempHp }
            : {}),
          ...(params.effectResolution?.conditionsJson
            ? { conditionsJson: params.effectResolution.conditionsJson }
            : {}),
        },
      });
    }

    return { healedHp };
  }
}
