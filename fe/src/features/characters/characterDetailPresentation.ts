import type { PersistentCharacter } from '../../types/session';
import {
  abilityDisplayLabels,
  abilityKeys,
  formatModifier,
  formatStat,
  getAbilityModifierTooltip,
} from './characterBuildRules';
import { getCharacterClassLabel, getSkillLabel } from './characterCreateDefaults';
import { getCharacterAncestryLabel } from './characterRacePresentation';

export type CharacterDetailSummaryRow = {
  label: string;
  value: string;
};

export type CharacterDetailAbilityRow = {
  ability: (typeof abilityKeys)[number];
  label: string;
  value: string;
  modifier: string;
  tooltip: string;
};

export type CharacterDetailViewModel = {
  name: string;
  summaryRows: CharacterDetailSummaryRow[];
  abilityRows: CharacterDetailAbilityRow[];
  skillLabels: string[];
  canLevelUp: boolean;
  levelUpButtonLabel: string;
};

export function buildCharacterDetailViewModel(params: {
  character: PersistentCharacter;
  ancestryLabelMap: Map<string, string>;
}): CharacterDetailViewModel {
  const { character } = params;
  const abilityRows = abilityKeys.map((ability) => {
    const score = character.abilities[ability];
    return {
      ability,
      label: abilityDisplayLabels[ability],
      value: formatStat(score),
      modifier: formatModifier(score),
      tooltip: getAbilityModifierTooltip(ability, score),
    };
  });

  return {
    name: character.name,
    summaryRows: [
      {
        label: '종족',
        value: getCharacterAncestryLabel(character.ancestry, params.ancestryLabelMap),
      },
      {
        label: '직업',
        value: getCharacterClassLabel(character.className),
      },
      {
        label: '레벨',
        value: String(character.level),
      },
      {
        label: 'HP',
        value: `${formatStat(character.maxHp)}/${formatStat(character.maxHp)}`,
      },
      {
        label: '방어도',
        value: formatStat(character.armorClass),
      },
      {
        label: '속도',
        value: formatStat(character.speed),
      },
      {
        label: '숙련도',
        value: formatStat(character.proficiencyBonus),
      },
    ],
    abilityRows,
    skillLabels: character.proficientSkills.map(getSkillLabel),
    canLevelUp: character.level < 20,
    levelUpButtonLabel: character.level >= 20 ? '최대 레벨' : '레벨업 열기',
  };
}
