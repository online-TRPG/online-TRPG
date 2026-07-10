import {
  getClassLabel,
  localizeAbilityText,
  localizeSrdTermText,
  normalizeClassValue,
  type ClassOption,
  type RaceData,
  type StaticFeSpellPools,
} from '../../services/staticSrd';
import type { CharacterPayload } from '../../hooks/useSession';
import type { PersistentCharacter, Scenario } from '../../types/session';
import type { ClassDefinitionResponseDto, RuleCatalogReferenceDto } from '@trpg/shared-types';
import { normalizeSrdCharacterClassKey, resolveSubclassChoiceLevel } from '@trpg/srd-data/rules';
import {
  applyLevelDeltaAbilities,
  applyLevelDeltaStats,
  clampAbilitiesToPointBuyRange,
  getRecommendedStats,
  normalizeLevel,
  setAbilityScore,
  type AbilityKey,
} from './characterBuildRules';
import { getPresetIdForClassName } from './characterAvatarPresentation';
import {
  buildClassFeaturesForSubmit,
  hasRequiredClassFeatureChoices,
  hasRequiredRaceFeatureChoices,
  normalizeAsiFeatChoicesForClassLevel,
  replaceSelectedAsiFeatChoiceIds,
} from './characterFeatureChoices';
import {
  featureSourceLabels,
  featureStatusLabels,
  type CharacterFeaturePreviewItem,
} from './characterFeaturePreview';
import {
  resolveCharacterPreparedSpellLimit,
  resolveStartingCantripCount,
  resolveStartingSlotSpellCount,
} from './characterSpellSelectionRules';
import { hasRequiredStartingEquipmentItemSelections } from './characterStartingEquipment';
import { formatAbilityBonus } from './characterRacePresentation';

export type CharacterCreateStepKey =
  | 'profile'
  | 'stats'
  | 'skills'
  | 'features'
  | 'equipment'
  | 'spells'
  | 'review';

export type CharacterCreateSubmitPayload = CharacterPayload & {
  assignToSession: boolean;
};

export type CharacterCreateSubmitPreparation =
  | { ok: true; payload: CharacterCreateSubmitPayload }
  | { ok: false; error: string };

export type CharacterCreateStepValidation =
  | { ok: true }
  | { ok: false; error: string };

export type CharacterEditDraft = {
  formState: CharacterPayload;
  inventoryDraft: NonNullable<CharacterPayload['inventory']>;
};

export type CharacterCreateReviewRow = {
  label: string;
  value: string;
};

export type CharacterCreateReviewFeatureItem = CharacterFeaturePreviewItem & {
  sourceLabel: string;
  statusLabel: string;
};

export type CharacterCreateReviewViewModel = {
  title: string;
  summaryRows: CharacterCreateReviewRow[];
  featureItems: CharacterCreateReviewFeatureItem[];
  hasRequiredFeatureItems: boolean;
  featureCompletionMessage: string;
  featureCompletionTone: 'warning' | 'complete';
};

export type CharacterCreateStatReferenceSection = {
  title: string;
  lines: string[];
};

export type CharacterCreateStatReferenceViewModel = {
  race: CharacterCreateStatReferenceSection;
  klass: CharacterCreateStatReferenceSection;
};

export const characterCreateSteps: ReadonlyArray<{
  key: CharacterCreateStepKey;
  label: string;
  helper: string;
}> = [
  { key: 'profile', label: '기본 정보', helper: '이름, 시나리오, 초상화를 정합니다.' },
  { key: 'stats', label: '코어 스탯', helper: '레벨과 능력치를 배분합니다.' },
  { key: 'skills', label: '기술', helper: '숙련 기술과 도구 숙련을 고릅니다.' },
  { key: 'features', label: '특성', helper: '자동 획득과 선택 필요 특성을 확인합니다.' },
  { key: 'equipment', label: '장비', helper: '시작 장비와 인벤토리를 확인합니다.' },
  { key: 'spells', label: '주문', helper: '캔트립과 시작 주문을 고릅니다.' },
  { key: 'review', label: '확인', helper: '완성된 캐릭터 구성을 검토합니다.' },
] as const;

export function buildCharacterCreateStepViewState(createStepIndex: number) {
  const currentCreateStep = characterCreateSteps[createStepIndex] ?? characterCreateSteps[0];
  const isProfileStep = currentCreateStep.key === 'profile';
  const isStatsStep = currentCreateStep.key === 'stats';
  const isSkillsStep = currentCreateStep.key === 'skills';
  const isFeaturesStep = currentCreateStep.key === 'features';
  const isEquipmentStep = currentCreateStep.key === 'equipment';
  const isSpellsStep = currentCreateStep.key === 'spells';
  const isReviewStep = currentCreateStep.key === 'review';

  return {
    currentCreateStep,
    isProfileStep,
    isStatsStep,
    isSkillsStep,
    isFeaturesStep,
    isEquipmentStep,
    isSpellsStep,
    isReviewStep,
    hasCreateFormRightColumn: isProfileStep || isStatsStep || isEquipmentStep || isSpellsStep,
    isFinalCreateStep: createStepIndex === characterCreateSteps.length - 1,
  };
}

const dnd5eSkills: ReadonlyArray<{ code: string; ko: string }> = [
  { code: 'Acrobatics', ko: '곡예' },
  { code: 'AnimalHandling', ko: '동물 조련' },
  { code: 'Arcana', ko: '비전학' },
  { code: 'Athletics', ko: '운동' },
  { code: 'Deception', ko: '기만' },
  { code: 'History', ko: '역사' },
  { code: 'Insight', ko: '통찰' },
  { code: 'Intimidation', ko: '위협' },
  { code: 'Investigation', ko: '조사' },
  { code: 'Medicine', ko: '의학' },
  { code: 'Nature', ko: '자연' },
  { code: 'Perception', ko: '감지' },
  { code: 'Performance', ko: '공연' },
  { code: 'Persuasion', ko: '설득' },
  { code: 'Religion', ko: '종교' },
  { code: 'SleightOfHand', ko: '손재주' },
  { code: 'Stealth', ko: '은신' },
  { code: 'Survival', ko: '생존' },
];

const skillKoByCode = new Map(
  dnd5eSkills.map((skill) => [skill.code.toLowerCase(), skill.ko] as const)
);
const skillKoSet = new Set(dnd5eSkills.map((skill) => skill.ko));
const zeroAbilityIncreases: Record<AbilityKey, number> = {
  str: 0,
  dex: 0,
  con: 0,
  int: 0,
  wis: 0,
  cha: 0,
};
const baseEightAbilities: Record<AbilityKey, number> = {
  str: 8,
  dex: 8,
  con: 8,
  int: 8,
  wis: 8,
  cha: 8,
};

export const allSkillsKo: readonly string[] = dnd5eSkills.map((entry) => entry.ko);

export function normalizeSkillToKo(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (skillKoSet.has(trimmed)) return trimmed;
  return skillKoByCode.get(trimmed.toLowerCase()) ?? null;
}

export function createDefaultCharacter(): CharacterPayload {
  const defaultClassName = 'Wizard';
  const recommendedStats = getRecommendedStats(defaultClassName, 1);

  return {
    name: '',
    ancestry: '',
    className: defaultClassName,
    subclassName: null,
    avatarType: 'PRESET',
    avatarPresetId: 'preset_wizard',
    avatarUrl: null,
    scenarioId: null,
    level: 1,
    abilities: { ...baseEightAbilities },
    proficiencyBonus: recommendedStats.proficiencyBonus,
    proficientSkills: [],
    features: [],
    startingEquipmentItemSelections: {},
    maxHp: recommendedStats.maxHp,
    armorClass: recommendedStats.armorClass,
    speed: recommendedStats.speed,
    inventory: [],
    equippedWeaponId: null,
    offhandWeaponId: null,
  };
}

function buildStartingSpells(params: {
  klass: ClassDefinitionResponseDto | null | undefined;
  className: string | null | undefined;
  level: number;
  abilities: Partial<Record<AbilityKey, number>>;
  ruleCatalog: RuleCatalogReferenceDto[];
  spellPools?: StaticFeSpellPools | null;
}) {
  const startingSlotSpellCount = resolveStartingSlotSpellCount(
    params.klass,
    params.className,
    params.level,
    params.ruleCatalog,
    params.spellPools ?? null
  );
  const startingCantripCount = resolveStartingCantripCount(
    params.klass,
    params.className,
    params.level,
    params.ruleCatalog
  );
  if (!params.klass || (startingCantripCount <= 0 && startingSlotSpellCount <= 0)) {
    return undefined;
  }

  return {
    cantrips: new Array(startingCantripCount).fill(''),
    spells: new Array(startingSlotSpellCount).fill(''),
    ...(resolveCharacterPreparedSpellLimit(params.className, params.level, params.abilities) !==
    null
      ? { preparedSpells: [] }
      : {}),
  };
}

export function createDefaultCharacterFormState(params: {
  classDefinitions: ClassDefinitionResponseDto[];
  defaultScenario: Scenario | null | undefined;
  ruleCatalog: RuleCatalogReferenceDto[];
  spellPools: StaticFeSpellPools | null;
}): CharacterPayload {
  const defaults = createDefaultCharacter();
  const defaultClassKey = normalizeSrdCharacterClassKey(defaults.className ?? '');
  const defaultClass = params.classDefinitions.find((klass) => klass.key === defaultClassKey);
  const level = params.defaultScenario
    ? normalizeLevel(params.defaultScenario.startLevel)
    : defaults.level;
  const startingEquipmentSelection = defaultClass
    ? new Array(defaultClass.startingEquipment.slots.length).fill(0)
    : undefined;
  const startingSpells = buildStartingSpells({
    klass: defaultClass,
    className: defaultClass?.key,
    level: level ?? 1,
    abilities: defaults.abilities ?? {},
    ruleCatalog: params.ruleCatalog,
    spellPools: params.spellPools,
  });

  return {
    ...defaults,
    scenarioId: params.defaultScenario?.id ?? null,
    level,
    startingEquipmentSelection,
    startingEquipmentItemSelections: {},
    startingSpells,
  };
}

export function applyDefaultScenarioToCharacterFormState(
  current: CharacterPayload,
  defaultScenario: Scenario
): CharacterPayload {
  return {
    ...current,
    scenarioId: defaultScenario.id,
    level: normalizeLevel(defaultScenario.startLevel),
  };
}

export function setCharacterCreateName(
  current: CharacterPayload,
  name: string
): CharacterPayload {
  return {
    ...current,
    name,
  };
}

export function setCharacterCreateSubclass(
  current: CharacterPayload,
  subclassName: string
): CharacterPayload {
  return {
    ...current,
    subclassName: subclassName || null,
  };
}

export function setCharacterCreateAbilityScore(
  current: CharacterPayload,
  ability: AbilityKey,
  value: number
): CharacterPayload {
  return {
    ...current,
    abilities: setAbilityScore(current.abilities, ability, value),
  };
}

export function applyScenarioSelectionToCharacterFormState(params: {
  current: CharacterPayload;
  scenarioId: string | null;
  scenarios: Scenario[];
  classDefinitions: ClassDefinitionResponseDto[];
  ruleCatalog: RuleCatalogReferenceDto[];
  spellPools: StaticFeSpellPools | null;
}): CharacterPayload {
  const scenario = params.scenarios.find((entry) => entry.id === params.scenarioId);

  return applyScenarioToCharacterFormState({
    current: params.current,
    scenarioId: params.scenarioId,
    scenario,
    classDefinitions: params.classDefinitions,
    ruleCatalog: params.ruleCatalog,
    spellPools: params.spellPools,
  });
}

export function applyScenarioToCharacterFormState(params: {
  current: CharacterPayload;
  scenarioId: string | null;
  scenario: Scenario | null | undefined;
  classDefinitions: ClassDefinitionResponseDto[];
  ruleCatalog: RuleCatalogReferenceDto[];
  spellPools: StaticFeSpellPools | null;
}): CharacterPayload {
  const nextLevel = normalizeLevel(params.scenario?.startLevel ?? 1);
  const currentLevel = normalizeLevel(params.current.level ?? 1);
  const nextStats = applyLevelDeltaStats(
    params.current,
    nextLevel - currentLevel,
    nextLevel
  );
  const levelAdjustedAbilities = applyLevelDeltaAbilities(
    params.current,
    nextLevel - currentLevel
  );
  const currentClassKey = normalizeSrdCharacterClassKey(params.current.className ?? '');
  const subclassChoiceLevel = resolveSubclassChoiceLevel(currentClassKey);
  const currentClass = params.classDefinitions.find((klass) => klass.key === currentClassKey);
  const startingSpells = buildStartingSpells({
    klass: currentClass,
    className: params.current.className,
    level: nextLevel,
    abilities: levelAdjustedAbilities,
    ruleCatalog: params.ruleCatalog,
    spellPools: params.spellPools,
  });
  const nextAsiFeatChoices = normalizeAsiFeatChoicesForClassLevel(
    params.current.className,
    nextLevel,
    params.current.features
  );

  return {
    ...params.current,
    scenarioId: params.scenarioId,
    level: nextLevel,
    subclassName:
      subclassChoiceLevel !== null && nextLevel >= subclassChoiceLevel
        ? params.current.subclassName
        : null,
    maxHp: nextStats.maxHp,
    armorClass: nextStats.armorClass,
    proficiencyBonus: nextStats.proficiencyBonus,
    abilities: levelAdjustedAbilities,
    features: replaceSelectedAsiFeatChoiceIds(params.current.features, nextAsiFeatChoices),
    startingSpells,
  };
}

export function applyClassSelectionToCharacterFormState(params: {
  current: CharacterPayload;
  className: string;
  classDefinitions: ClassDefinitionResponseDto[];
  raceAbilityIncreases?: Record<AbilityKey, number> | null;
  ruleCatalog: RuleCatalogReferenceDto[];
  spellPools: StaticFeSpellPools | null;
}): CharacterPayload {
  return applyClassToCharacterFormState({
    current: params.current,
    className: params.className,
    classDefinitions: params.classDefinitions,
    raceAbilityIncreases: params.raceAbilityIncreases,
    ruleCatalog: params.ruleCatalog,
    spellPools: params.spellPools,
  });
}

export function applyClassToCharacterFormState(params: {
  current: CharacterPayload;
  className: string;
  classDefinitions: ClassDefinitionResponseDto[];
  raceAbilityIncreases?: Record<AbilityKey, number> | null;
  ruleCatalog: RuleCatalogReferenceDto[];
  spellPools: StaticFeSpellPools | null;
}): CharacterPayload {
  const recommendedStats = getRecommendedStats(params.className, params.current.level ?? 1);
  const nextClassKey = normalizeSrdCharacterClassKey(params.className);
  const nextClass = params.classDefinitions.find((klass) => klass.key === nextClassKey);
  const startingEquipmentSelection = nextClass
    ? new Array(nextClass.startingEquipment.slots.length).fill(0)
    : undefined;
  const nextAbilities = clampAbilitiesToPointBuyRange(
    params.current.abilities ?? { ...baseEightAbilities },
    params.raceAbilityIncreases ?? zeroAbilityIncreases
  );
  const startingSpells = buildStartingSpells({
    klass: nextClass,
    className: params.className,
    level: params.current.level ?? 1,
    abilities: nextAbilities,
    ruleCatalog: params.ruleCatalog,
    spellPools: params.spellPools,
  });

  return {
    ...params.current,
    className: params.className,
    subclassName: null,
    avatarType: 'PRESET',
    avatarPresetId: getPresetIdForClassName(params.className),
    avatarUrl: null,
    maxHp: recommendedStats.maxHp,
    armorClass: recommendedStats.armorClass,
    speed: recommendedStats.speed,
    proficiencyBonus: recommendedStats.proficiencyBonus,
    abilities: nextAbilities,
    startingEquipmentSelection,
    startingEquipmentItemSelections: {},
    startingSpells,
    proficientSkills: [],
    features: [],
  };
}

export function createEditCharacterFormState(character: PersistentCharacter): CharacterPayload {
  return {
    name: character.name,
    ancestry: character.ancestry,
    className: character.className,
    subclassName: character.subclassName ?? null,
    avatarType: character.avatarType,
    avatarPresetId: character.avatarPresetId ?? getPresetIdForClassName(character.className),
    avatarUrl: character.avatarUrl ?? null,
    scenarioId: character.scenarioId ?? null,
    level: character.level,
    abilities: { ...character.abilities },
    proficiencyBonus: character.proficiencyBonus,
    proficientSkills: [...character.proficientSkills],
    features: [...character.features],
    maxHp: character.maxHp,
    armorClass: character.armorClass,
    speed: character.speed,
    inventory: character.inventory.map((item) => ({ ...item })),
    equippedWeaponId: character.equippedWeaponId ?? null,
    offhandWeaponId: character.offhandWeaponId ?? null,
    startingEquipmentItemSelections: {},
  };
}

export function createEditCharacterDraft(character: PersistentCharacter): CharacterEditDraft {
  return {
    formState: createEditCharacterFormState(character),
    inventoryDraft: character.inventory.map((item) => ({ ...item })),
  };
}

export function validateCharacterCreateStepTransition(params: {
  stepKey: CharacterCreateStepKey;
  formState: CharacterPayload;
  isSubclassRequired: boolean;
  isSubraceRequired: boolean;
  selectedSubraceKey: string | null | undefined;
  pointBuyState: { enforced: boolean; isValid: boolean };
  classDefinitionsLoaded: boolean;
}): CharacterCreateStepValidation {
  if (params.stepKey === 'profile') {
    if (
      !params.formState.name.trim() ||
      !params.formState.scenarioId ||
      !params.formState.ancestry ||
      !params.formState.className
    ) {
      return {
        ok: false,
        error: '이름, 시나리오, 종족, 직업을 먼저 입력해야 다음 장으로 넘어갈 수 있습니다.',
      };
    }

    if (params.isSubraceRequired && !params.selectedSubraceKey) {
      return {
        ok: false,
        error: '선택한 종족의 하위종족을 선택해야 다음 장으로 넘어갈 수 있습니다.',
      };
    }

    if (params.isSubclassRequired && !params.formState.subclassName) {
      return { ok: false, error: '현재 시작 레벨에서는 서브클래스를 선택해야 합니다.' };
    }
  }

  if (
    params.stepKey === 'stats' &&
    params.pointBuyState.enforced &&
    !params.pointBuyState.isValid
  ) {
    return {
      ok: false,
      error: '능력치 Point Buy 27 포인트를 정확히 맞춰야 다음 장으로 넘어갈 수 있습니다.',
    };
  }

  if (
    params.stepKey === 'features' &&
    params.classDefinitionsLoaded &&
    (!hasRequiredClassFeatureChoices(
      params.formState.className,
      params.formState.level,
      params.formState.features
    ) ||
      !hasRequiredRaceFeatureChoices(
        params.formState.ancestry,
        params.formState.level,
        params.formState.features
      ))
  ) {
    return {
      ok: false,
      error: '선택한 종족과 직업의 기능 선택을 완료해야 다음 장으로 넘어갈 수 있습니다.',
    };
  }

  return { ok: true };
}

export function prepareCharacterCreateSubmit(params: {
  formState: CharacterPayload;
  classDefinitionsLoaded: boolean;
  isSubclassRequired: boolean;
  isSubraceRequired: boolean;
  selectedSubraceKey: string | null | undefined;
  hasRequiredStartingEquipmentItemSelections: boolean;
  selectedClass: ClassDefinitionResponseDto | null | undefined;
  selectedStartingCantripCount: number;
  selectedStartingSlotSpellCount: number;
  startingPreparedSpellLimit: number | null;
  startingPreparedSpellOptionCount: number;
  isStartingDynamicPreparedCaster: boolean;
  slotSpellIds: string[];
  inventoryDraft: NonNullable<CharacterPayload['inventory']>;
  assignToSession: boolean;
}): CharacterCreateSubmitPreparation {
  if (!params.classDefinitionsLoaded) {
    return { ok: false, error: '클래스 정의를 불러오는 중입니다. 잠시만 기다려 주세요.' };
  }

  if (
    !hasRequiredClassFeatureChoices(
      params.formState.className,
      params.formState.level,
      params.formState.features
    ) ||
    !hasRequiredRaceFeatureChoices(
      params.formState.ancestry,
      params.formState.level,
      params.formState.features
    )
  ) {
    return {
      ok: false,
      error: '선택한 종족과 직업의 기능 선택을 완료해야 캐릭터를 생성할 수 있습니다.',
    };
  }

  if (params.isSubclassRequired && !params.formState.subclassName) {
    return { ok: false, error: '현재 시작 레벨에서는 서브클래스를 선택해야 합니다.' };
  }

  if (params.isSubraceRequired && !params.selectedSubraceKey) {
    return {
      ok: false,
      error: '선택한 종족의 하위종족을 선택해야 캐릭터를 생성할 수 있습니다.',
    };
  }

  if (!params.hasRequiredStartingEquipmentItemSelections) {
    return {
      ok: false,
      error: '시작 장비의 자유 선택 항목에서 실제 아이템을 선택해야 캐릭터를 생성할 수 있습니다.',
    };
  }

  const shouldValidateStartingSpells = Boolean(
    params.selectedClass &&
    (params.selectedStartingCantripCount > 0 ||
      params.selectedStartingSlotSpellCount > 0 ||
      (params.startingPreparedSpellLimit !== null &&
        params.startingPreparedSpellOptionCount > 0))
  );

  if (shouldValidateStartingSpells) {
    const cantrips = params.formState.startingSpells?.cantrips ?? [];
    const spells = params.formState.startingSpells?.spells ?? [];
    const filledCantripCount = cantrips
      .slice(0, params.selectedStartingCantripCount)
      .filter((value) => value.trim().length > 0).length;
    const filledSpellCount = spells
      .slice(0, params.selectedStartingSlotSpellCount)
      .filter((value) => value.trim().length > 0).length;

    if (
      filledCantripCount < params.selectedStartingCantripCount ||
      filledSpellCount < params.selectedStartingSlotSpellCount
    ) {
      return {
        ok: false,
        error:
          `${params.selectedClass?.koName ?? '선택한'} 클래스는 시작 주문을 모두 선택해야 캐릭터를 생성할 수 있습니다. ` +
          `(캔트립 ${params.selectedStartingCantripCount}개, 슬롯 주문 ${params.selectedStartingSlotSpellCount}개)`,
      };
    }

    const selectedCantrips = cantrips
      .slice(0, params.selectedStartingCantripCount)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const selectedSpells = spells
      .slice(0, params.selectedStartingSlotSpellCount)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (
      new Set(selectedCantrips).size !== selectedCantrips.length ||
      new Set(selectedSpells).size !== selectedSpells.length
    ) {
      return { ok: false, error: '시작 주문은 같은 주문을 중복해서 선택할 수 없습니다.' };
    }

    const preparedSpells = Array.from(
      new Set(
        (params.formState.startingSpells?.preparedSpells ?? [])
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    );
    const preparedSpellPool = params.isStartingDynamicPreparedCaster
      ? params.slotSpellIds
      : selectedSpells;
    const unknownPreparedSpell = preparedSpells.find(
      (spellId) => !preparedSpellPool.includes(spellId)
    );

    if (unknownPreparedSpell) {
      return {
        ok: false,
        error: params.isStartingDynamicPreparedCaster
          ? '준비 주문은 현재 시전 가능한 직업 주문 목록 중에서만 고를 수 있습니다.'
          : '준비 주문은 선택한 슬롯 주문 중에서만 고를 수 있습니다.',
      };
    }

    if (
      params.startingPreparedSpellLimit !== null &&
      preparedSpells.length !== params.startingPreparedSpellLimit
    ) {
      return {
        ok: false,
        error: `준비 주문은 ${params.startingPreparedSpellLimit}개를 선택해야 합니다.`,
      };
    }
  }

  return {
    ok: true,
    payload: {
      ...params.formState,
      proficientSkills: params.formState.proficientSkills?.filter((skill) => skill.length > 0) ?? [],
      features: buildClassFeaturesForSubmit(
        params.formState.className,
        params.formState.features
      ),
      inventory: params.inventoryDraft.filter((item) => item.name.trim()),
      assignToSession: params.assignToSession,
    },
  };
}

export function prepareCharacterCreateSubmitFromViewState(params: {
  formState: CharacterPayload;
  classDefinitionsLoaded: boolean;
  isSubclassRequired: boolean;
  isSubraceRequired: boolean;
  selectedSubraceKey: string | null | undefined;
  selectedClass: ClassDefinitionResponseDto | null | undefined;
  selectedStartingCantripCount: number;
  selectedStartingSlotSpellCount: number;
  startingPreparedSpellLimit: number | null;
  startingPreparedSpellOptions: ReadonlyArray<unknown>;
  isStartingDynamicPreparedCaster: boolean;
  slotSpellOptions: ReadonlyArray<{ id: string }>;
  inventoryDraft: NonNullable<CharacterPayload['inventory']>;
  isEditing: boolean;
  shouldReturnToSession: boolean;
}): CharacterCreateSubmitPreparation {
  return prepareCharacterCreateSubmit({
    formState: params.formState,
    classDefinitionsLoaded: params.classDefinitionsLoaded,
    isSubclassRequired: params.isSubclassRequired,
    isSubraceRequired: params.isSubraceRequired,
    selectedSubraceKey: params.selectedSubraceKey,
    hasRequiredStartingEquipmentItemSelections: hasRequiredStartingEquipmentItemSelections(
      params.selectedClass,
      params.formState
    ),
    selectedClass: params.selectedClass,
    selectedStartingCantripCount: params.selectedStartingCantripCount,
    selectedStartingSlotSpellCount: params.selectedStartingSlotSpellCount,
    startingPreparedSpellLimit: params.startingPreparedSpellLimit,
    startingPreparedSpellOptionCount: params.startingPreparedSpellOptions.length,
    isStartingDynamicPreparedCaster: params.isStartingDynamicPreparedCaster,
    slotSpellIds: params.slotSpellOptions.map((spell) => spell.id),
    inventoryDraft: params.inventoryDraft,
    assignToSession: !params.isEditing && params.shouldReturnToSession,
  });
}

export function getCharacterClassLabel(className: string) {
  const normalized = className.trim();
  return getClassLabel(normalized || '모험가');
}

export function getClassOptionByValue(
  classCatalog: ClassOption[],
  value: string | null | undefined
): ClassOption | null {
  const normalized = normalizeClassValue(value ?? '');
  return classCatalog.find((option) => option.value === normalized) ?? null;
}

export function getCreateStatSelectionLabel(
  raceInfo: RaceData | null | undefined,
  classInfo: ClassOption | null | undefined
) {
  return `${raceInfo?.label ?? '종족 미선택'} (${classInfo?.label ?? '직업 미선택'})`;
}

export function buildCreateStatReferenceViewModel(
  raceInfo: RaceData | null | undefined,
  classInfo: ClassOption | null | undefined
): CharacterCreateStatReferenceViewModel {
  return {
    race: {
      title: raceInfo?.label ?? '종족 정보',
      lines: [
        `능력치 보너스: ${
          (raceInfo?.abilityBonuses ?? []).map((bonus) => formatAbilityBonus(bonus)).join(', ') ||
          '정보 없음'
        }`,
        `이동속도: ${raceInfo ? `${raceInfo.speed} ft.` : '정보 없음'}`,
        `크기: ${raceInfo?.size ?? '정보 없음'}`,
      ],
    },
    klass: {
      title: classInfo?.label ?? '직업 정보',
      lines: [
        classInfo?.summary ?? '직업 설명이 없습니다.',
        `주 능력치: ${
          classInfo ? localizeAbilityText(classInfo.primaryAbilitiesRaw) : '정보 없음'
        }`,
        `히트 다이스: ${classInfo?.hitDieRaw ?? '정보 없음'}`,
        `주문시전 능력치: ${
          classInfo?.spellcastingAbility
            ? localizeSrdTermText(classInfo.spellcastingAbility)
            : '없음'
        }`,
      ],
    },
  };
}

export function buildCharacterCreateReviewViewModel(params: {
  formState: CharacterPayload;
  raceInfo: RaceData | null | undefined;
  classInfo: ClassOption | null | undefined;
  featurePreviewItems: CharacterFeaturePreviewItem[];
  requiredFeaturePreviewItemCount: number;
  startingEquipmentItemCount: number;
  startingSpellReviewCounts: { cantripCount: number; secondarySpellCount: number };
  isStartingDynamicPreparedCaster: boolean;
}): CharacterCreateReviewViewModel {
  const featureCountText = [
    `자동/선택 특성 ${params.featurePreviewItems.length}개`,
    params.requiredFeaturePreviewItemCount
      ? `선택 필요 ${params.requiredFeaturePreviewItemCount}개`
      : null,
  ]
    .flatMap((value) => value ? [value] : [])
    .join(', ');
  const hasRequiredFeatureItems = params.requiredFeaturePreviewItemCount > 0;

  return {
    title: params.formState.name || '이름 미입력',
    summaryRows: [
      {
        label: '종족',
        value: params.raceInfo?.label ?? '미선택',
      },
      {
        label: '직업',
        value: params.classInfo?.label ?? (params.formState.className || '미선택'),
      },
      {
        label: '서브클래스',
        value: params.formState.subclassName || '없음/미선택',
      },
      {
        label: '레벨',
        value: String(params.formState.level ?? 1),
      },
      {
        label: 'HP / AC',
        value: `${params.formState.maxHp ?? '-'} / ${params.formState.armorClass ?? '-'}`,
      },
      {
        label: '숙련 기술',
        value:
          (params.formState.proficientSkills ?? []).map(getSkillLabel).join(', ') || '미선택',
      },
      {
        label: '특성',
        value: featureCountText,
      },
      {
        label: '장비',
        value: `${params.startingEquipmentItemCount}개 항목`,
      },
      {
        label: '주문',
        value: `캔트립 ${params.startingSpellReviewCounts.cantripCount}개 / ${
          params.isStartingDynamicPreparedCaster ? '준비 주문' : '슬롯 주문'
        } ${params.startingSpellReviewCounts.secondarySpellCount}개`,
      },
    ],
    featureItems: params.featurePreviewItems.map((feature) => ({
      ...feature,
      sourceLabel: featureSourceLabels[feature.source],
      statusLabel: featureStatusLabels[feature.status],
    })),
    hasRequiredFeatureItems,
    featureCompletionMessage: hasRequiredFeatureItems
      ? '아직 선택하지 않은 특성이 있습니다. 특성 탭으로 돌아가 필수 선택을 완료하세요.'
      : '필수 선택은 완료되었습니다. 생성 시 장비와 주문 검증을 한 번 더 확인합니다.',
    featureCompletionTone: hasRequiredFeatureItems ? 'warning' : 'complete',
  };
}

export function getSkillLabel(skill: string) {
  const trimmed = skill.trim();
  return normalizeSkillToKo(trimmed) ?? trimmed;
}
