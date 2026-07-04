import { useEffect, useState } from 'react';
import type {
  ClassDefinitionResponseDto,
  RaceResponseDto,
} from '@trpg/shared-types';
import {
  createDefaultQuickCreateForm,
  defaultQuickCreateCharacter,
  DEFAULT_QUICK_CREATE_ANCESTRY_KEY,
  DEFAULT_QUICK_CREATE_CLASS_KEY,
  type QuickCreateFormState,
} from './quickCharacterFormDefaults';

type UseQuickCreateFormStateParams = {
  races: RaceResponseDto[];
  classDefinitions: ClassDefinitionResponseDto[];
};

export function useQuickCreateFormState(params: UseQuickCreateFormStateParams) {
  const { races, classDefinitions } = params;
  const [formState, setFormState] = useState<QuickCreateFormState>(defaultQuickCreateCharacter);
  const quickCreateConfigReady = races.length > 0 && classDefinitions.length > 0;
  const selectedQuickCreateRace =
    races.find((race) => race.key === formState.ancestryKey) ??
    races.find((race) => race.key === DEFAULT_QUICK_CREATE_ANCESTRY_KEY) ??
    races[0] ??
    null;
  const selectedQuickCreateClass =
    classDefinitions.find((klass) => klass.key === formState.classKey) ??
    classDefinitions.find((klass) => klass.key === DEFAULT_QUICK_CREATE_CLASS_KEY) ??
    classDefinitions[0] ??
    null;

  useEffect(() => {
    if (!quickCreateConfigReady) {
      return;
    }

    setFormState((current) => {
      const nextAncestryKey = races.some((race) => race.key === current.ancestryKey)
        ? current.ancestryKey
        : (selectedQuickCreateRace?.key ?? DEFAULT_QUICK_CREATE_ANCESTRY_KEY);
      const nextClassKey = classDefinitions.some((klass) => klass.key === current.classKey)
        ? current.classKey
        : (selectedQuickCreateClass?.key ?? DEFAULT_QUICK_CREATE_CLASS_KEY);

      if (nextAncestryKey === current.ancestryKey && nextClassKey === current.classKey) {
        return current;
      }

      return {
        ...current,
        ancestryKey: nextAncestryKey,
        classKey: nextClassKey,
      };
    });
  }, [
    classDefinitions,
    quickCreateConfigReady,
    races,
    selectedQuickCreateClass?.key,
    selectedQuickCreateRace?.key,
  ]);

  function resetQuickCreateForm() {
    setFormState(createDefaultQuickCreateForm(races, classDefinitions));
  }

  return {
    formState,
    setFormState,
    quickCreateConfigReady,
    selectedQuickCreateRace,
    selectedQuickCreateClass,
    resetQuickCreateForm,
  };
}
