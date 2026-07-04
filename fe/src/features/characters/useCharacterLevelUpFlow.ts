import { useState } from 'react';
import type { LevelUpCharacterDto, UpdatePreparedSpellsDto } from '@trpg/shared-types';
import type { PersistentCharacter } from '../../types/session';
import type { AbilityKey } from './characterBuildRules';
import {
  buildLevelUpCharacterPayloadFromViewState,
  buildPreparedSpellsUpdatePayload,
  type CharacterLevelUpDraft,
} from './characterLevelUpDraft';

export function useCharacterLevelUpFlow(params: {
  selectedCharacter: PersistentCharacter | null;
  usedCharacterIds: Set<string>;
  draft: CharacterLevelUpDraft;
  abilityScoreIncreases: Record<AbilityKey, number>;
  featSelections: string[];
  preparedSpellLimit: number | null;
  onLevelUpCharacter: (characterId: string, payload: LevelUpCharacterDto) => Promise<boolean>;
  onUpdatePreparedSpells: (
    characterId: string,
    payload: UpdatePreparedSpellsDto
  ) => Promise<boolean>;
}) {
  const {
    selectedCharacter,
    usedCharacterIds,
    draft,
    abilityScoreIncreases,
    featSelections,
    preparedSpellLimit,
    onLevelUpCharacter,
    onUpdatePreparedSpells,
  } = params;
  const [isLevelUpModalOpen, setLevelUpModalOpen] = useState(false);

  async function submitLevelUpSelectedCharacter() {
    if (!selectedCharacter || selectedCharacter.level >= 20) return;
    const leveledUp = await onLevelUpCharacter(
      selectedCharacter.id,
      buildLevelUpCharacterPayloadFromViewState({
        character: selectedCharacter,
        draft,
        usedCharacterIds,
        abilityScoreIncreases,
        featSelections,
        preparedSpellLimit,
      })
    );
    if (leveledUp) {
      setLevelUpModalOpen(false);
    }
  }

  async function savePreparedSpells() {
    if (!selectedCharacter) return;
    await onUpdatePreparedSpells(
      selectedCharacter.id,
      buildPreparedSpellsUpdatePayload(draft)
    );
  }

  return {
    isLevelUpModalOpen,
    openLevelUpModal: () => setLevelUpModalOpen(true),
    closeLevelUpModal: () => setLevelUpModalOpen(false),
    submitLevelUpSelectedCharacter,
    savePreparedSpells,
  };
}
