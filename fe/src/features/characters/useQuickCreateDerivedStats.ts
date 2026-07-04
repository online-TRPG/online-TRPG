import type {
  ClassDefinitionResponseDto,
  RaceResponseDto,
} from '@trpg/shared-types';
import {
  applyQuickCreateAsiChoices,
  applyRaceBonuses,
  buildQuickCreateAsiChoices,
  getDefaultQuickCreateFeatureSelections,
  getQuickCreatePointBuyBase,
} from './quickCharacterAbilityDefaults';
import {
  getExpectedMaxHp,
  getProficiencyBonusForLevel,
  getQuickCreateArmorClass,
  getQuickCreateSpeed,
} from './quickCharacterCombatDefaults';
import { getQuickCreateAvatarPresetId } from './quickCharacterPresetDefaults';

type UseQuickCreateDerivedStatsParams = {
  classKey: string;
  level: number;
  selectedRace: RaceResponseDto | null;
  selectedClass: ClassDefinitionResponseDto | null;
};

export function useQuickCreateDerivedStats(
  params: UseQuickCreateDerivedStatsParams,
) {
  const {
    classKey,
    level,
    selectedRace,
    selectedClass,
  } = params;

  const quickCreateBaseAbilities = getQuickCreatePointBuyBase(classKey);
  const quickCreateAbilitiesBeforeAsi = applyRaceBonuses(
    quickCreateBaseAbilities,
    selectedRace,
  );
  const quickCreateAsiChoices = buildQuickCreateAsiChoices(
    classKey,
    level,
    quickCreateAbilitiesBeforeAsi,
  );
  const quickCreateAbilities = applyQuickCreateAsiChoices(
    quickCreateAbilitiesBeforeAsi,
    quickCreateAsiChoices,
  );
  const quickCreateProficientSkills =
    selectedClass?.skillChoices.slice(0, selectedClass.skillChoiceCount) ?? [];
  const quickCreateFeatures = selectedClass
    ? getDefaultQuickCreateFeatureSelections({
        classKey: selectedClass.key,
        raceKey: selectedRace?.key,
        level,
        proficientSkills: quickCreateProficientSkills,
        asiChoices: quickCreateAsiChoices,
      })
    : [];
  const quickCreateProficiencyBonus = getProficiencyBonusForLevel(level);
  const quickCreateMaxHp = getExpectedMaxHp(
    selectedClass?.hitDie,
    level,
    quickCreateAbilities.con,
  );
  const quickCreateArmorClass = getQuickCreateArmorClass(
    classKey,
    quickCreateAbilities,
  );
  const quickCreateSpeed = getQuickCreateSpeed(classKey, selectedRace);
  const quickCreatePresetId = getQuickCreateAvatarPresetId(classKey);

  return {
    quickCreateAbilities,
    quickCreateProficientSkills,
    quickCreateFeatures,
    quickCreateProficiencyBonus,
    quickCreateMaxHp,
    quickCreateArmorClass,
    quickCreateSpeed,
    quickCreatePresetId,
  };
}
