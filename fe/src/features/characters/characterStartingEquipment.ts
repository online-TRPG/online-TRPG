import type { ClassDefinitionResponseDto, ItemResponseDto } from '@trpg/shared-types';

export const startingEquipmentConcreteChoiceOptions = {
  simpleWeapon: {
    label: '단순 무기',
    options: [
      { value: 'dagger', label: '단검' },
      { value: 'dart', label: '다트' },
      { value: 'handaxe', label: '핸드액스' },
      { value: 'javelin', label: '재블린' },
      { value: 'light-crossbow', label: '라이트 크로스보우' },
      { value: 'mace', label: '메이스' },
      { value: 'quarterstaff', label: '쿼터스태프' },
      { value: 'shortbow', label: '쇼트보우' },
    ],
  },
  simpleMeleeWeapon: {
    label: '단순 근접 무기',
    options: [
      { value: 'dagger', label: '단검' },
      { value: 'handaxe', label: '핸드액스' },
      { value: 'javelin', label: '재블린' },
      { value: 'mace', label: '메이스' },
      { value: 'quarterstaff', label: '쿼터스태프' },
    ],
  },
  martialWeapon: {
    label: '군용 무기',
    options: [
      { value: 'greataxe', label: '그레이트액스' },
      { value: 'longsword', label: '롱소드' },
      { value: 'longbow', label: '롱보우' },
      { value: 'rapier', label: '레이피어' },
      { value: 'scimitar', label: '시미터' },
      { value: 'shortsword', label: '쇼트소드' },
      { value: 'warhammer', label: '워해머' },
    ],
  },
  martialMeleeWeapon: {
    label: '군용 근접 무기',
    options: [
      { value: 'greataxe', label: '그레이트액스' },
      { value: 'longsword', label: '롱소드' },
      { value: 'rapier', label: '레이피어' },
      { value: 'scimitar', label: '시미터' },
      { value: 'shortsword', label: '쇼트소드' },
      { value: 'warhammer', label: '워해머' },
    ],
  },
  instrument: {
    label: '악기',
    options: [{ value: 'lute', label: '류트' }],
  },
} as const;

export type StartingEquipmentConcreteChoice =
  (typeof startingEquipmentConcreteChoiceOptions)[keyof typeof startingEquipmentConcreteChoiceOptions];

type StartingEquipmentSelectionPayload = {
  startingEquipmentSelection?: number[];
  startingEquipmentItemSelections?: Record<string, string>;
};

type StartingEquipmentFormState = StartingEquipmentSelectionPayload;

type StartingEquipmentOption =
  ClassDefinitionResponseDto['startingEquipment']['slots'][number]['options'][number];

export type StartingEquipmentSummaryItem = {
  key: string;
  label: string;
  quantity: number;
  pending: boolean;
};

export type StartingEquipmentSlotViewModel = {
  slotIndex: number;
  slot: ClassDefinitionResponseDto['startingEquipment']['slots'][number];
  selectedOptionIndex: number;
  selectedOption: StartingEquipmentOption | undefined;
  concreteItemSelections: Array<{
    key: string;
    label: string;
    selectLabel: string;
    selectedValue: string;
    choice: StartingEquipmentConcreteChoice;
  }>;
};

export function getStartingEquipmentItemSelectionKey(slotIndex: number, itemIndex: number) {
  return `${slotIndex}:${itemIndex}`;
}

export function getStartingEquipmentConcreteChoice(
  itemKey: string
): StartingEquipmentConcreteChoice | null {
  switch (itemKey) {
    case 'simple-weapon-1':
    case 'simple-weapon-2':
      return startingEquipmentConcreteChoiceOptions.simpleWeapon;
    case 'simple-melee-weapon-1':
    case 'simple-melee-weapon-2':
      return startingEquipmentConcreteChoiceOptions.simpleMeleeWeapon;
    case 'martial-weapon-1':
    case 'martial-weapon-2':
      return startingEquipmentConcreteChoiceOptions.martialWeapon;
    case 'martial-melee-weapon-1':
      return startingEquipmentConcreteChoiceOptions.martialMeleeWeapon;
    case 'musical-instrument-1':
      return startingEquipmentConcreteChoiceOptions.instrument;
    default:
      return null;
  }
}

export function clearStartingEquipmentItemSelectionsForSlot(
  selections: Record<string, string> | undefined,
  slotIndex: number
) {
  if (!selections) return {};
  return Object.fromEntries(
    Object.entries(selections).filter(([key]) => !key.startsWith(`${slotIndex}:`))
  );
}

export function buildItemKoNameByKey(itemCatalog: ItemResponseDto[]) {
  return new Map(itemCatalog.map((item) => [item.key, item.koName] as const));
}

export function formatStartingEquipmentOption(
  option: StartingEquipmentOption,
  itemKoNameByKey: Map<string, string>
) {
  return option.items
    .map((item) => {
      const concreteChoice = getStartingEquipmentConcreteChoice(item.itemKey);
      const label = concreteChoice
        ? `${concreteChoice.label} 선택`
        : (itemKoNameByKey.get(item.itemKey) ?? item.itemKey);
      return item.quantity > 1 ? `${label} ×${item.quantity}` : label;
    })
    .join(' + ');
}

export function updateStartingEquipmentSlotSelection(
  payload: StartingEquipmentSelectionPayload,
  slotIndex: number,
  optionIndex: number,
  slotCount: number
): StartingEquipmentSelectionPayload {
  const base = payload.startingEquipmentSelection ?? new Array(slotCount).fill(0);
  const nextSelection = [...base];
  nextSelection[slotIndex] = optionIndex;

  return {
    startingEquipmentSelection: nextSelection,
    startingEquipmentItemSelections: clearStartingEquipmentItemSelectionsForSlot(
      payload.startingEquipmentItemSelections,
      slotIndex
    ),
  };
}

export function updateStartingEquipmentItemSelection(
  payload: StartingEquipmentSelectionPayload,
  selectionKey: string,
  itemKey: string
): StartingEquipmentSelectionPayload {
  return {
    ...payload,
    startingEquipmentItemSelections: {
      ...(payload.startingEquipmentItemSelections ?? {}),
      [selectionKey]: itemKey,
    },
  };
}

export function applyStartingEquipmentSlotSelection<T extends StartingEquipmentFormState>(
  state: T,
  slotIndex: number,
  optionIndex: number,
  slotCount: number
): T {
  return {
    ...state,
    ...updateStartingEquipmentSlotSelection(state, slotIndex, optionIndex, slotCount),
  };
}

export function applyStartingEquipmentItemSelection<T extends StartingEquipmentFormState>(
  state: T,
  selectionKey: string,
  itemKey: string
): T {
  return {
    ...state,
    ...updateStartingEquipmentItemSelection(state, selectionKey, itemKey),
  };
}

export function getClassStartingEquipmentSlots(selectedClass: ClassDefinitionResponseDto) {
  if (selectedClass.key !== 'fighter') {
    return selectedClass.startingEquipment.slots;
  }

  return selectedClass.startingEquipment.slots.map((slot) => ({
    ...slot,
    options: slot.options.filter(
      (option) => !option.items.some((item) => item.itemKey === 'martial-weapon-2')
    ),
  }));
}

export function buildStartingEquipmentSlotViewModels(params: {
  selectedClass: ClassDefinitionResponseDto;
  startingEquipmentSelection?: number[];
  startingEquipmentItemSelections?: Record<string, string>;
}): StartingEquipmentSlotViewModel[] {
  return getClassStartingEquipmentSlots(params.selectedClass).map((slot, slotIndex) => {
    const selectedOptionIndex = params.startingEquipmentSelection?.[slotIndex] ?? 0;
    const selectedOption = slot.options[selectedOptionIndex] ?? slot.options[0];
    const concreteItemSelections =
      selectedOption?.items.flatMap((item, itemIndex) => {
        const choice = getStartingEquipmentConcreteChoice(item.itemKey);
        if (!choice) return [];
        const key = getStartingEquipmentItemSelectionKey(slotIndex, itemIndex);

        return [
          {
            key,
            label: item.quantity > 1 ? `${choice.label} ${item.quantity}개` : choice.label,
            selectLabel: `${choice.label} 선택`,
            selectedValue: params.startingEquipmentItemSelections?.[key] ?? '',
            choice,
          },
        ];
      }) ?? [];

    return {
      slotIndex,
      slot,
      selectedOptionIndex,
      selectedOption,
      concreteItemSelections,
    };
  });
}

export function hasRequiredStartingEquipmentItemSelections(
  selectedClass: ClassDefinitionResponseDto | null | undefined,
  payload: StartingEquipmentSelectionPayload
) {
  if (!selectedClass) return true;
  return getClassStartingEquipmentSlots(selectedClass).every((slot, slotIndex) => {
    const selectedOptionIndex = payload.startingEquipmentSelection?.[slotIndex] ?? 0;
    const selectedOption = slot.options[selectedOptionIndex] ?? slot.options[0];
    if (!selectedOption) return false;

    return selectedOption.items.every((item, itemIndex) => {
      const choice = getStartingEquipmentConcreteChoice(item.itemKey);
      if (!choice) return true;
      const selectionKey = getStartingEquipmentItemSelectionKey(slotIndex, itemIndex);
      return Boolean(payload.startingEquipmentItemSelections?.[selectionKey]);
    });
  });
}

export function buildStartingEquipmentSummary(params: {
  selectedClass: ClassDefinitionResponseDto | null | undefined;
  startingEquipmentSelection?: number[];
  startingEquipmentItemSelections?: Record<string, string>;
  itemKoNameByKey: Map<string, string>;
}): StartingEquipmentSummaryItem[] {
  if (!params.selectedClass) return [];

  return getClassStartingEquipmentSlots(params.selectedClass).flatMap((slot, slotIndex) => {
    const selectedOptionIndex = params.startingEquipmentSelection?.[slotIndex] ?? 0;
    const selectedOption = slot.options[selectedOptionIndex] ?? slot.options[0];
    if (!selectedOption) return [];

    return selectedOption.items.map((item, itemIndex) => {
      const concreteChoice = getStartingEquipmentConcreteChoice(item.itemKey);
      const selectionKey = getStartingEquipmentItemSelectionKey(slotIndex, itemIndex);
      const selectedConcreteKey = params.startingEquipmentItemSelections?.[selectionKey];
      const concreteLabel = concreteChoice
        ? (concreteChoice.options.find((option) => option.value === selectedConcreteKey)?.label ??
          `${concreteChoice.label} 미선택`)
        : null;
      const label = concreteLabel ?? params.itemKoNameByKey.get(item.itemKey) ?? item.itemKey;

      return {
        key: `${slotIndex}:${itemIndex}:${item.itemKey}`,
        label,
        quantity: item.quantity,
        pending: Boolean(concreteChoice && !selectedConcreteKey),
      };
    });
  });
}
