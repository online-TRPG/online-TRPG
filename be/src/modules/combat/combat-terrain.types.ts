import type { DiceRollResponseDto } from "@trpg/shared-types";

export type CombatConcentrationCheckResult = {
  diceResult: DiceRollResponseDto;
  concentrationState: unknown;
  concentrationMaintained: boolean;
  removedConditions: unknown[];
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
