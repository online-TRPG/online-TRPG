import { useMemo } from 'react';
import type { Character, PersistentCharacter } from '../../../types/session';

type UseSelectedPlayCharacterParams = {
  characters: PersistentCharacter[];
  sessionCharacters: Character[];
  selectedCharacterId: string | null;
  isCharacterLevelAllowed: (character: PersistentCharacter) => boolean;
};

export function useSelectedPlayCharacter(params: UseSelectedPlayCharacterParams) {
  const {
    characters,
    sessionCharacters,
    selectedCharacterId,
    isCharacterLevelAllowed,
  } = params;

  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ?? null;

  const selectedSessionCharacter =
    sessionCharacters.find(
      (character) =>
        character.id === selectedCharacterId || character.characterId === selectedCharacterId,
    ) ?? null;

  const selectedCharacterLevelAllowed = selectedCharacter
    ? isCharacterLevelAllowed(selectedCharacter)
    : true;

  const selectedCharacterInventory = useMemo(
    () => selectedSessionCharacter?.inventory ?? selectedCharacter?.inventory ?? [],
    [selectedCharacter?.inventory, selectedSessionCharacter?.inventory],
  );

  return {
    selectedCharacter,
    selectedSessionCharacter,
    selectedCharacterLevelAllowed,
    selectedCharacterInventory,
  };
}
