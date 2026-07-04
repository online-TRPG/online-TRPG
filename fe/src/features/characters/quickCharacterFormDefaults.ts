import type { ClassDefinitionResponseDto, RaceResponseDto } from '@trpg/shared-types';

export interface QuickCreateFormState {
  name: string;
  ancestryKey: string;
  classKey: string;
}

export const DEFAULT_QUICK_CREATE_ANCESTRY_KEY = 'human';
export const DEFAULT_QUICK_CREATE_CLASS_KEY = 'wizard';

export const defaultQuickCreateCharacter: QuickCreateFormState = {
  name: '',
  ancestryKey: DEFAULT_QUICK_CREATE_ANCESTRY_KEY,
  classKey: DEFAULT_QUICK_CREATE_CLASS_KEY,
};

export function createDefaultQuickCreateForm(
  races: RaceResponseDto[],
  classDefinitions: ClassDefinitionResponseDto[]
): QuickCreateFormState {
  return {
    name: '',
    ancestryKey:
      races.find((race) => race.key === DEFAULT_QUICK_CREATE_ANCESTRY_KEY)?.key ??
      races[0]?.key ??
      DEFAULT_QUICK_CREATE_ANCESTRY_KEY,
    classKey:
      classDefinitions.find((klass) => klass.key === DEFAULT_QUICK_CREATE_CLASS_KEY)?.key ??
      classDefinitions[0]?.key ??
      DEFAULT_QUICK_CREATE_CLASS_KEY,
  };
}

export function toStoredClassName(classKey: string): string {
  const trimmed = classKey.trim();
  if (!trimmed) return 'Wizard';
  return trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function getDefaultStartingEquipmentItemSelections(
  klass: ClassDefinitionResponseDto
): Record<string, string> {
  const defaults: Record<string, string> = {
    'martial-weapon-1': 'longsword',
    'martial-weapon-2': 'longsword',
    'martial-melee-weapon-1': 'longsword',
    'simple-weapon-1': 'dagger',
    'simple-weapon-2': 'dagger',
    'simple-melee-weapon-1': 'dagger',
    'simple-melee-weapon-2': 'dagger',
    'musical-instrument-1': 'lute',
  };
  const selections: Record<string, string> = {};
  klass.startingEquipment.slots.forEach((slot, slotIndex) => {
    const option = slot.options[0];
    option?.items.forEach((item, itemIndex) => {
      const selectedItemKey = defaults[item.itemKey];
      if (selectedItemKey) {
        selections[`${slotIndex}:${itemIndex}`] = selectedItemKey;
      }
    });
  });
  return selections;
}
