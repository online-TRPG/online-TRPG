import { useEffect, useState } from 'react';
import type { PersistentCharacter } from '../../types/session';
import {
  createDefaultLevelUpDraft,
  resetLevelUpDraftForTargetLevel,
  setAsiFeatChoiceInDraft,
  setCantripsInDraft,
  setForgottenCantripsInDraft,
  setForgottenSpellsInDraft,
  setKnownSpellsInDraft,
  setPreparedSpellsInDraft,
  setSubclassInLevelUpDraft,
} from './characterLevelUpDraft';

export function useCharacterLevelUpDraft(params: {
  selectedCharacter: PersistentCharacter | null;
}) {
  const [draft, setDraft] = useState(() => createDefaultLevelUpDraft());

  useEffect(() => {
    if (!params.selectedCharacter) {
      setDraft(createDefaultLevelUpDraft());
      return;
    }

    const preparedSpells = (params.selectedCharacter.spells?.preparedSpells ?? []).filter(
      (spellId) => spellId.trim().length > 0
    );

    setDraft(
      createDefaultLevelUpDraft({
        targetLevel: Math.min(20, Math.max(2, params.selectedCharacter.level + 1)),
        subclassName: params.selectedCharacter.subclassName ?? '',
        preparedSpells,
      })
    );
  }, [params.selectedCharacter]);

  return {
    draft,
    resetForTargetLevel(targetLevel: number) {
      setDraft((current) => resetLevelUpDraftForTargetLevel(current, targetLevel));
    },
    setAsiFeatChoice(choiceIndex: number, choiceId: string) {
      setDraft((current) => setAsiFeatChoiceInDraft(current, choiceIndex, choiceId));
    },
    setSubclass(subclassName: string) {
      setDraft((current) => setSubclassInLevelUpDraft(current, subclassName));
    },
    bindSpellSelectionActions(selectionLimits: {
      knownSpellLearnAllowance: number;
      cantripLearnAllowance: number;
      levelDelta: number;
      baseKnownSpellAllowance: number;
      baseCantripAllowance: number;
      canReplaceKnownSpells: boolean;
      preparedSpellLimit: number | null;
    }) {
      return {
        setKnownSpells(nextSpellIds: string[]) {
          setDraft((current) =>
            setKnownSpellsInDraft(
              current,
              nextSpellIds,
              selectionLimits.knownSpellLearnAllowance
            )
          );
        },
        setCantrips(nextCantripIds: string[]) {
          setDraft((current) =>
            setCantripsInDraft(
              current,
              nextCantripIds,
              selectionLimits.cantripLearnAllowance
            )
          );
        },
        setForgottenSpells(nextSpellIds: string[]) {
          if (!selectionLimits.canReplaceKnownSpells) return;
          setDraft((current) =>
            setForgottenSpellsInDraft(
              current,
              nextSpellIds,
              selectionLimits.levelDelta,
              selectionLimits.baseKnownSpellAllowance
            )
          );
        },
        setForgottenCantrips(nextCantripIds: string[]) {
          setDraft((current) =>
            setForgottenCantripsInDraft(
              current,
              nextCantripIds,
              selectionLimits.levelDelta,
              selectionLimits.baseCantripAllowance
            )
          );
        },
        setPreparedSpells(nextSpellIds: string[]) {
          setDraft((current) =>
            setPreparedSpellsInDraft(
              current,
              nextSpellIds,
              selectionLimits.preparedSpellLimit
            )
          );
        },
      };
    },
  };
}
