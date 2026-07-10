import type { DiceRollResponseDto } from "@trpg/shared-types";
import type { ConditionStateEntry } from "../rules/condition-runtime.service";

export type CombatConcentrationCheckResult = {
  diceResult: DiceRollResponseDto;
  modifierRolls?: DiceRollResponseDto[];
  concentrationState: unknown;
  concentrationMaintained: boolean;
  removedConditions: ConditionStateEntry[];
};

export type CombatTerrainEffectApplication = {
  damageRoll: DiceRollResponseDto | null;
  damageRolls: Array<{
    sourceEffectId: string;
    damageType: string;
    roll: DiceRollResponseDto;
  }>;
  damageTotal: number;
  saveRolls: DiceRollResponseDto[];
  appliedConditionTags: string[];
  removedConditionTags: string[];
  concentrationCheck: CombatConcentrationCheckResult | null;
};
