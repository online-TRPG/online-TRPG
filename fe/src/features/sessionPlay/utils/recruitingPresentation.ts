import type { Participant, PersistentCharacter } from '../../../types/session';

export type JoinableRecruitingCharacter = PersistentCharacter & {
  isSelected: boolean;
  isLevelAllowed: boolean;
  levelRestrictionReason: string | null;
  isDisabled: boolean;
};

export function buildJoinableRecruitingCharacters(params: {
  characters: PersistentCharacter[];
  selectedCharacterId: string | null;
  readyLocked: boolean;
  scenarioLevelLabel: string;
  isCharacterLevelAllowed: (character: PersistentCharacter) => boolean;
}): JoinableRecruitingCharacter[] {
  const {
    characters,
    selectedCharacterId,
    readyLocked,
    scenarioLevelLabel,
    isCharacterLevelAllowed,
  } = params;

  return characters.map((character) => {
    const isLevelAllowed = isCharacterLevelAllowed(character);
    return {
      ...character,
      isSelected: character.id === selectedCharacterId,
      isLevelAllowed,
      levelRestrictionReason: isLevelAllowed
        ? null
        : `이 시나리오는 ${scenarioLevelLabel} 캐릭터만 참여할 수 있습니다.`,
      isDisabled:
        !character.isSelectable ||
        !isLevelAllowed ||
        (readyLocked && character.id !== selectedCharacterId),
    };
  });
}

export function getWantedCarouselCharacters(
  characters: JoinableRecruitingCharacter[],
  selectedCharacterId: string | null
): JoinableRecruitingCharacter[] {
  return characters.filter(
    (character) => character.isSelectable || character.id === selectedCharacterId
  );
}

export function getWantedCarouselCharacter(
  characters: JoinableRecruitingCharacter[],
  carouselIndex: number
): JoinableRecruitingCharacter | null {
  return characters[Math.min(carouselIndex, characters.length - 1)] ?? null;
}

export function getNextWantedCarouselIndex(params: {
  characters: JoinableRecruitingCharacter[];
  currentCharacter: JoinableRecruitingCharacter | null;
  direction: -1 | 1;
}): number {
  const { characters, currentCharacter, direction } = params;
  const currentIndex = currentCharacter
    ? characters.findIndex((character) => character.id === currentCharacter.id)
    : -1;
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;

  return (safeCurrentIndex + direction + characters.length) % characters.length;
}

export function getDisplayedParticipantSlots(
  participants: Participant[],
  minSlots = 4
): Array<Participant | null> {
  const filled: Array<Participant | null> = [...participants];
  while (filled.length < minSlots) {
    filled.push(null);
  }
  return filled;
}

export function getPlayerParticipantIds(participants: Participant[]): string[] {
  return participants
    .filter((participant) => participant.role !== 'GM')
    .map((participant) => participant.userId);
}
