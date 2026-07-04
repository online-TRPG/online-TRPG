import type { PersistentCharacter, SessionSnapshot } from '../../types/session';
import { getCharacterImage } from './characterAvatarPresentation';
import { getCharacterClassLabel } from './characterCreateDefaults';

export function findSelectedCharacter(
  characters: PersistentCharacter[],
  selectedCharacterId: string | null | undefined
) {
  return characters.find((character) => character.id === selectedCharacterId) ?? null;
}

export type CharacterCardViewModel = {
  id: string;
  name: string;
  classLabel: string;
  image: string;
  isSelected: boolean;
  isInUse: boolean;
};

export function buildCharacterCardViewModels(params: {
  characters: PersistentCharacter[];
  selectedCharacterId: string | null | undefined;
  usedCharacterIds: Set<string>;
}): CharacterCardViewModel[] {
  return params.characters.map((character) => ({
    id: character.id,
    name: character.name,
    classLabel: getCharacterClassLabel(character.className),
    image: getCharacterImage(character),
    isSelected: character.id === params.selectedCharacterId,
    isInUse: params.usedCharacterIds.has(character.id),
  }));
}

export function buildUsedCharacterIdSet(params: {
  characters: PersistentCharacter[];
  snapshot: SessionSnapshot | null | undefined;
}) {
  const ids = new Set<string>();

  params.snapshot?.participants.forEach((participant) => {
    if (participant.characterId) ids.add(participant.characterId);
  });

  params.characters.forEach((character) => {
    if (character.activeSessionId) ids.add(character.id);
  });

  return ids;
}
