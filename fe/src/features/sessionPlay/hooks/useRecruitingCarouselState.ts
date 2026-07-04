import { useEffect, useMemo, useState } from 'react';
import type { PersistentCharacter } from '../../../types/session';
import {
  buildJoinableRecruitingCharacters,
  getNextWantedCarouselIndex,
  getWantedCarouselCharacter,
  getWantedCarouselCharacters,
} from '../utils/recruitingPresentation';

type UseRecruitingCarouselStateParams = {
  characters: PersistentCharacter[];
  serverSelectedCharacterId: string | null;
  readyLocked: boolean;
  busy: boolean;
  allPlayersReady: boolean;
  scenarioLevelLabel: string;
  isCharacterLevelAllowed: (character: PersistentCharacter) => boolean;
  onSelectCharacter: (characterId: string | null) => void;
};

export function useRecruitingCarouselState(params: UseRecruitingCarouselStateParams) {
  const {
    characters,
    serverSelectedCharacterId,
    readyLocked,
    busy,
    allPlayersReady,
    scenarioLevelLabel,
    isCharacterLevelAllowed,
    onSelectCharacter,
  } = params;
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isStatusMinimized, setStatusMinimized] = useState(false);
  const [characterCarouselIndex, setCharacterCarouselIndex] = useState(0);

  const joinableCharacters = useMemo(
    () =>
      buildJoinableRecruitingCharacters({
        characters,
        selectedCharacterId,
        readyLocked,
        scenarioLevelLabel,
        isCharacterLevelAllowed,
      }),
    [characters, isCharacterLevelAllowed, readyLocked, scenarioLevelLabel, selectedCharacterId],
  );

  const wantedCarouselCharacters = useMemo(
    () => getWantedCarouselCharacters(joinableCharacters, selectedCharacterId),
    [joinableCharacters, selectedCharacterId],
  );

  const wantedCarouselCharacter = getWantedCarouselCharacter(
    wantedCarouselCharacters,
    characterCarouselIndex,
  );

  useEffect(() => {
    if (!allPlayersReady) {
      setStatusMinimized(false);
    }
  }, [allPlayersReady]);

  useEffect(() => {
    setSelectedCharacterId(serverSelectedCharacterId);
  }, [serverSelectedCharacterId]);

  useEffect(() => {
    setCharacterCarouselIndex((current) =>
      Math.min(current, Math.max(0, wantedCarouselCharacters.length - 1)),
    );
  }, [wantedCarouselCharacters.length]);

  useEffect(() => {
    if (!selectedCharacterId) return;
    const selectedIndex = wantedCarouselCharacters.findIndex(
      (character) => character.id === selectedCharacterId,
    );
    if (selectedIndex < 0) return;

    setCharacterCarouselIndex(selectedIndex);
  }, [selectedCharacterId, wantedCarouselCharacters]);

  function handleWantedCarouselStep(direction: -1 | 1) {
    if (busy || readyLocked || selectedCharacterId || !wantedCarouselCharacters.length) return;

    setCharacterCarouselIndex(
      getNextWantedCarouselIndex({
        characters: wantedCarouselCharacters,
        currentCharacter: wantedCarouselCharacter,
        direction,
      }),
    );
  }

  function handleCharacterSelectionConfirm() {
    if (busy || readyLocked || !wantedCarouselCharacter) return;
    if (wantedCarouselCharacter.isDisabled) return;
    if (wantedCarouselCharacter.id === selectedCharacterId) return;

    setSelectedCharacterId(wantedCarouselCharacter.id);
    onSelectCharacter(wantedCarouselCharacter.id);
  }

  function handleCharacterSelectionClear() {
    if (busy || readyLocked || !selectedCharacterId) return;

    setSelectedCharacterId(null);
    onSelectCharacter(null);
  }

  return {
    selectedCharacterId,
    isStatusMinimized,
    setStatusMinimized,
    joinableCharacters,
    wantedCarouselCharacters,
    wantedCarouselCharacter,
    handleWantedCarouselStep,
    handleCharacterSelectionConfirm,
    handleCharacterSelectionClear,
  };
}
