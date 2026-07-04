import type { ClassDefinitionResponseDto, RaceResponseDto, RuleCatalogReferenceDto } from '@trpg/shared-types';
import type { CharacterPayload } from '../../hooks/useSession';
import type { StaticFeSpellPools } from '../../services/staticSrd';
import { getDefaultQuickCreateStartingSpells } from './characterSpellSelectionRules';
import {
  getDefaultStartingEquipmentItemSelections,
  toStoredClassName,
  type QuickCreateFormState,
} from './quickCharacterFormDefaults';
import { getQuickCreateSubclassName } from './quickCharacterPresetDefaults';

type QuickCreateAbilities = NonNullable<CharacterPayload['abilities']>;

type BuildQuickCreateCharacterPayloadParams = {
  formState: QuickCreateFormState;
  selectedRace: RaceResponseDto | null;
  selectedClass: ClassDefinitionResponseDto;
  scenarioId: string | null;
  level: number;
  abilities: QuickCreateAbilities;
  proficiencyBonus: number;
  proficientSkills: string[];
  features: string[];
  maxHp: number;
  armorClass: number;
  speed: number;
  avatarPresetId: string | null;
  ruleCatalog: RuleCatalogReferenceDto[];
  spellPools: StaticFeSpellPools | null;
};

export function buildQuickCreateCharacterPayload(
  params: BuildQuickCreateCharacterPayloadParams,
): CharacterPayload {
  return {
    name: params.formState.name.trim(),
    ancestry: params.selectedRace?.koName ?? params.formState.ancestryKey,
    className: toStoredClassName(params.selectedClass.key),
    subclassName: getQuickCreateSubclassName(params.selectedClass.key, params.level),
    avatarType: params.avatarPresetId ? 'PRESET' : 'DEFAULT',
    avatarPresetId: params.avatarPresetId,
    avatarUrl: null,
    scenarioId: params.scenarioId,
    level: params.level,
    abilities: params.abilities,
    proficiencyBonus: params.proficiencyBonus,
    proficientSkills: params.proficientSkills,
    features: params.features,
    maxHp: params.maxHp,
    armorClass: params.armorClass,
    speed: params.speed,
    startingEquipmentSelection: new Array(params.selectedClass.startingEquipment.slots.length).fill(0),
    startingEquipmentItemSelections: getDefaultStartingEquipmentItemSelections(params.selectedClass),
    startingSpells: getDefaultQuickCreateStartingSpells(
      params.selectedClass,
      params.level,
      params.abilities,
      params.ruleCatalog,
      params.spellPools,
    ),
    assignToSession: true,
  };
}
