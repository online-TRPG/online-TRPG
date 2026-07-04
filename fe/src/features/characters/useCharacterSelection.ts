import { useEffect, useMemo, useState } from 'react';
import type { PersistentCharacter, SessionSnapshot } from '../../types/session';
import {
  buildCharacterCardViewModels,
  buildUsedCharacterIdSet,
  findSelectedCharacter,
} from './characterSelection';

export function useCharacterSelection(params: {
  characters: PersistentCharacter[];
  snapshot: SessionSnapshot | null;
}) {
  const { characters, snapshot } = params;
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  useEffect(() => {
    if (!characters.length) {
      setSelectedCharacterId(null);
      return;
    }

    setSelectedCharacterId((current) =>
      current && characters.some((character) => character.id === current)
        ? current
        : characters[0].id
    );
  }, [characters]);

  const selectedCharacter = useMemo(
    () => findSelectedCharacter(characters, selectedCharacterId),
    [characters, selectedCharacterId]
  );
  const usedCharacterIds = useMemo(
    () => buildUsedCharacterIdSet({ characters, snapshot }),
    [characters, snapshot]
  );
  const characterCardViewModels = useMemo(
    () =>
      buildCharacterCardViewModels({
        characters,
        selectedCharacterId,
        usedCharacterIds,
      }),
    [characters, selectedCharacterId, usedCharacterIds]
  );

  return {
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    usedCharacterIds,
    characterCardViewModels,
  };
}
