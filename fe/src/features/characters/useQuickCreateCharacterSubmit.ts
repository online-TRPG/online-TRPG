import type { FormEvent } from 'react';
import type {
  ClassDefinitionResponseDto,
  RaceResponseDto,
  RuleCatalogReferenceDto,
} from '@trpg/shared-types';
import type { CharacterPayload } from '../../hooks/useSession';
import type { StaticFeSpellPools } from '../../services/staticSrd';
import { buildQuickCreateCharacterPayload } from './quickCharacterCreatePayload';
import type { QuickCreateFormState } from './quickCharacterFormDefaults';

type QuickCreateAbilities = NonNullable<CharacterPayload['abilities']>;

type UseQuickCreateCharacterSubmitParams = {
  formState: QuickCreateFormState;
  selectedRace: RaceResponseDto | null;
  selectedClass: ClassDefinitionResponseDto | null;
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
  onCreateCharacter: (payload: CharacterPayload) => Promise<boolean>;
  onCreated: () => void;
};

export function useQuickCreateCharacterSubmit(params: UseQuickCreateCharacterSubmitParams) {
  async function handleCreateCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!params.selectedClass) {
      return;
    }

    const payload = buildQuickCreateCharacterPayload({
      formState: params.formState,
      selectedRace: params.selectedRace,
      selectedClass: params.selectedClass,
      scenarioId: params.scenarioId,
      level: params.level,
      abilities: params.abilities,
      proficiencyBonus: params.proficiencyBonus,
      proficientSkills: params.proficientSkills,
      features: params.features,
      maxHp: params.maxHp,
      armorClass: params.armorClass,
      speed: params.speed,
      avatarPresetId: params.avatarPresetId,
      ruleCatalog: params.ruleCatalog,
      spellPools: params.spellPools,
    });

    const succeeded = await params.onCreateCharacter(payload);
    if (succeeded) {
      params.onCreated();
    }
  }

  return {
    handleCreateCharacter,
  };
}
