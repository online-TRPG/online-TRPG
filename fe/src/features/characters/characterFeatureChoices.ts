import {
  normalizeSrdCharacterClassKey,
  resolveAvailableAbilityScoreImprovementLevels,
  resolveCrossedAbilityScoreImprovementLevels,
  resolveSubclassChoiceLevel,
} from '@trpg/srd-data/rules';
import {
  abilityDisplayLabels,
  abilityKeys,
  normalizeLevel,
  type AbilityKey,
} from './characterBuildRules';
import type { CharacterPayload } from '../../hooks/useSession';
import type { CharacterFeaturePreviewItem } from './characterFeaturePreview';

const skillKoByCode = new Map(
  [
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
  ].map((skill) => [skill.code.toLowerCase(), skill.ko] as const)
);

export type FeatureChoiceOption = {
  value: string;
  label: string;
  summary?: string;
};

export type FeatureChoiceContext = {
  ancestryKey: string;
  classKey: string;
  level: number;
  features: string[];
  proficientSkills: string[];
};

export type FeatureChoiceDefinition = {
  id: string;
  label: string;
  helper: string;
  featurePrefix: string;
  removedPrefixes: string[];
  mode: 'single' | 'multi';
  requiredSelections: number;
  applies: (context: FeatureChoiceContext) => boolean;
  getOptions: (context: FeatureChoiceContext) => FeatureChoiceOption[];
  getSelectedSummary?: (selectedValues: string[], context: FeatureChoiceContext) => string;
};

export const implementedSubclassOptions: Record<string, Array<{ value: string; label: string }>> = {
  barbarian: [{ value: 'berserker', label: 'Berserker / 광전사' }],
  bard: [{ value: 'lore', label: 'College of Lore / 지식 학파' }],
  cleric: [{ value: 'life', label: 'Life Domain / 생명 권역' }],
  druid: [{ value: 'land', label: 'Circle of the Land / 대지의 회합' }],
  fighter: [{ value: 'champion', label: 'Champion / 챔피언' }],
  monk: [{ value: 'open_hand', label: 'Way of the Open Hand / 열린 손의 길' }],
  paladin: [{ value: 'devotion', label: 'Oath of Devotion / 헌신의 맹세' }],
  ranger: [{ value: 'hunter', label: 'Hunter / 사냥꾼' }],
  rogue: [{ value: 'thief', label: 'Thief / 도둑' }],
  sorcerer: [{ value: 'draconic_bloodline', label: 'Draconic Bloodline / 용 혈통' }],
  warlock: [{ value: 'fiend', label: 'Fiend / 악마 후원자' }],
  wizard: [{ value: 'evocation', label: 'Evocation / 방출학파' }],
};

export type CharacterSubclassChoiceState = {
  classKey: string;
  options: Array<{ value: string; label: string }>;
  choiceLevel: number | null;
  isRequired: boolean;
  isSelectionRequired: boolean;
};

export type CharacterLevelUpAsiFeatChoiceState = {
  crossedAsiLevels: number[];
  asiFeatChoices: string[];
  selectedFeatIds: string[];
  abilityScoreIncreases: Record<AbilityKey, number>;
  missingChoiceCount: number;
  abilities: Record<AbilityKey, number> | null;
  choices: Array<{
    asiLevel: number;
    selectedChoiceId: string;
    selectedAsiAbility: AbilityKey | null;
    selectedFeat: (typeof featOptions)[number] | null;
  }>;
};

export type CharacterCreationAsiFeatChoiceState = {
  asiLevels: number[];
  selectedChoiceIds: string[];
  choices: Array<{
    asiLevel: number;
    selectedChoiceId: string;
    selectedAsiAbility: AbilityKey | null;
    selectedFeat: (typeof featOptions)[number] | null;
  }>;
};

export function buildSubclassChoiceState(params: {
  className: string | null | undefined;
  level: number | null | undefined;
  hasExistingSubclass?: boolean;
}): CharacterSubclassChoiceState {
  const classKey = normalizeSrdCharacterClassKey(params.className ?? '');
  const choiceLevel = resolveSubclassChoiceLevel(classKey);
  const isAtChoiceLevel = choiceLevel !== null && normalizeLevel(params.level ?? 1) >= choiceLevel;

  return {
    classKey,
    options: implementedSubclassOptions[classKey] ?? [],
    choiceLevel,
    isRequired: isAtChoiceLevel,
    isSelectionRequired: isAtChoiceLevel && params.hasExistingSubclass !== true,
  };
}

export function buildLevelUpAsiFeatChoiceState(params: {
  classKey: string;
  currentLevel: number | null | undefined;
  targetLevel: number | null | undefined;
  asiFeatChoices: string[];
  currentAbilities?: Record<AbilityKey, number> | null;
}): CharacterLevelUpAsiFeatChoiceState {
  const crossedAsiLevels = params.currentAbilities
    ? getCrossedAsiLevels(
        params.classKey,
        params.currentLevel ?? 1,
        params.targetLevel ?? params.currentLevel ?? 1
      )
    : [];
  const asiFeatChoices = crossedAsiLevels.map(
    (_, index) => params.asiFeatChoices[index] ?? ''
  );
  const selectedFeatIds = getFeatSelectionsFromAsiFeatChoices(asiFeatChoices);
  const abilityScoreIncreases = buildAbilityScoreIncreasesFromAsiFeatChoices(asiFeatChoices);
  const abilities = params.currentAbilities
    ? (Object.fromEntries(
        abilityKeys.map((ability) => [
          ability,
          params.currentAbilities![ability] + abilityScoreIncreases[ability],
        ])
      ) as Record<AbilityKey, number>)
    : null;

  return {
    crossedAsiLevels,
    asiFeatChoices,
    selectedFeatIds,
    abilityScoreIncreases,
    missingChoiceCount: asiFeatChoices.filter((choice) => !choice).length,
    abilities,
    choices: crossedAsiLevels.map((asiLevel, index) => {
      const selectedChoiceId = asiFeatChoices[index] ?? '';
      const selectedAsiAbility = getAbilityFromAsiChoiceId(selectedChoiceId);
      const selectedFeat = selectedChoiceId.startsWith('feat.')
        ? (featOptionById.get(selectedChoiceId) ?? null)
        : null;

      return {
        asiLevel,
        selectedChoiceId,
        selectedAsiAbility,
        selectedFeat,
      };
    }),
  };
}

const fightingStyleOptions = [
  { value: 'archery', label: 'Archery', effect: '원거리 무기 공격 명중 굴림 +2' },
  { value: 'defense', label: 'Defense', effect: '갑옷 착용 중 AC +1' },
  {
    value: 'dueling',
    label: 'Dueling',
    effect: '한 손 근접 무기 하나만 들고 싸우면 피해 +2',
  },
  {
    value: 'great_weapon_fighting',
    label: 'Great Weapon Fighting',
    effect: '양손/겸용 근접 무기 피해 주사위 1 또는 2 재굴림',
  },
  {
    value: 'protection',
    label: 'Protection',
    effect: '방패 착용 중 5ft 이내 아군 피격 시 reaction으로 공격 불리점 부여',
  },
  {
    value: 'two_weapon_fighting',
    label: 'Two-Weapon Fighting',
    effect: '쌍수 보조 공격 피해에도 능력 수정치 추가',
  },
];

const favoredEnemyOptions = [
  { value: 'aberrations', label: '변이체' },
  { value: 'beasts', label: '야수' },
  { value: 'celestials', label: '천상체' },
  { value: 'constructs', label: '구조체' },
  { value: 'dragons', label: '용' },
  { value: 'elementals', label: '정령' },
  { value: 'fey', label: '요정' },
  { value: 'fiends', label: '악마' },
  { value: 'giants', label: '거인' },
  { value: 'monstrosities', label: '괴수' },
  { value: 'oozes', label: '점액체' },
  { value: 'plants', label: '식물' },
  { value: 'undead', label: '언데드' },
  { value: 'humanoid', label: '인간형 2종' },
];

const favoredHumanoidOptions = [
  { value: 'dwarves', label: '드워프' },
  { value: 'elves', label: '엘프' },
  { value: 'halflings', label: '하플링' },
  { value: 'humans', label: '인간' },
  { value: 'dragonborn', label: '드래곤본' },
  { value: 'gnomes', label: '노움' },
  { value: 'half-elves', label: '하프엘프' },
  { value: 'half-orcs', label: '하프오크' },
  { value: 'tieflings', label: '티플링' },
  { value: 'gnolls', label: '놀' },
  { value: 'goblins', label: '고블린' },
  { value: 'hobgoblins', label: '홉고블린' },
  { value: 'kobolds', label: '코볼드' },
  { value: 'lizardfolk', label: '리자드포크' },
  { value: 'orcs', label: '오크' },
];

const draconicAncestryOptions = [
  { value: 'black', label: 'Black / 산성' },
  { value: 'blue', label: 'Blue / 번개' },
  { value: 'brass', label: 'Brass / 화염' },
  { value: 'bronze', label: 'Bronze / 번개' },
  { value: 'copper', label: 'Copper / 산성' },
  { value: 'gold', label: 'Gold / 화염' },
  { value: 'green', label: 'Green / 독' },
  { value: 'red', label: 'Red / 화염' },
  { value: 'silver', label: 'Silver / 냉기' },
  { value: 'white', label: 'White / 냉기' },
];

const featureChoiceDefinitions: FeatureChoiceDefinition[] = [
  {
    id: 'choice.dragonborn.draconic_ancestry',
    label: 'Draconic Ancestry / 용 혈통',
    helper: '선택한 혈통이 브레스 피해 유형과 피해 저항을 함께 결정합니다.',
    featurePrefix: 'draconic_ancestry:',
    removedPrefixes: ['draconic_ancestry:'],
    mode: 'single',
    requiredSelections: 1,
    applies: (context) => context.ancestryKey === 'dragonborn',
    getOptions: () => draconicAncestryOptions,
  },
  {
    id: 'choice.class.fighting_style',
    label: 'Fighting Style / 전투 유파',
    helper: '직업의 전투 방식을 하나 선택해야 합니다.',
    featurePrefix: 'fighting_style:',
    removedPrefixes: ['fighting_style:'],
    mode: 'single',
    requiredSelections: 1,
    applies: (context) =>
      context.classKey === 'fighter' ||
      ((context.classKey === 'paladin' || context.classKey === 'ranger') && context.level >= 2),
    getOptions: () =>
      fightingStyleOptions.map((option) => ({
        value: option.value,
        label: option.label,
        summary: option.effect,
      })),
    getSelectedSummary: ([selected]) =>
      fightingStyleOptions.find((option) => option.value === selected)?.effect ??
      '선택한 전투 유파가 적용됩니다.',
  },
  {
    id: 'choice.ranger.favored_enemy',
    label: 'Favored Enemy / 주적',
    helper: '레인저의 주적 유형을 선택해야 합니다.',
    featurePrefix: 'favored_enemy:',
    removedPrefixes: ['favored_enemy:', 'favored_enemy_humanoid:'],
    mode: 'single',
    requiredSelections: 1,
    applies: (context) => context.classKey === 'ranger',
    getOptions: () => favoredEnemyOptions,
  },
  {
    id: 'choice.ranger.favored_enemy_humanoid',
    label: 'Favored Enemy: Humanoid / 인간형 주적',
    helper: '주적을 인간형으로 선택했다면 인간형 종족 2개를 골라야 합니다.',
    featurePrefix: 'favored_enemy_humanoid:',
    removedPrefixes: ['favored_enemy_humanoid:'],
    mode: 'multi',
    requiredSelections: 2,
    applies: (context) =>
      context.classKey === 'ranger' && getFeatureValue(context.features, 'favored_enemy:') === 'humanoid',
    getOptions: () => favoredHumanoidOptions,
  },
  {
    id: 'choice.rogue.expertise',
    label: 'Expertise / 전문화',
    helper: "숙련 기술 2개, 또는 숙련 기술 1개와 Thieves' tools를 선택합니다.",
    featurePrefix: 'expertise:',
    removedPrefixes: ['expertise:'],
    mode: 'multi',
    requiredSelections: 2,
    applies: (context) => context.classKey === 'rogue',
    getOptions: (context) => [
      ...context.proficientSkills.map((skill) => ({
        value: skill,
        label: getSkillChoiceLabel(skill),
      })),
      { value: 'thieves_tools', label: "Thieves' tools" },
    ],
  },
];

const classFeatureIdsByClassKey: Record<string, string[]> = {
  barbarian: ['class.barbarian.feature.rage', 'class.barbarian.feature.unarmored_defense'],
  bard: ['class.bard.feature.spellcasting', 'class.bard.feature.bardic_inspiration'],
  cleric: ['class.cleric.feature.spellcasting', 'class.cleric.feature.divine_domain'],
  druid: ['class.druid.feature.druidic', 'class.druid.feature.spellcasting'],
  fighter: ['class.fighter.feature.second_wind', 'class.fighter.feature.fighting_style'],
  monk: ['class.monk.feature.unarmored_defense', 'class.monk.feature.martial_arts'],
  paladin: ['class.paladin.feature.divine_sense', 'class.paladin.feature.lay_on_hands'],
  ranger: ['class.ranger.feature.favored_enemy', 'class.ranger.feature.natural_explorer'],
  rogue: [
    'class.rogue.feature.expertise',
    'class.rogue.feature.sneak_attack',
    'class.rogue.feature.thieves_cant',
  ],
  sorcerer: ['class.sorcerer.feature.spellcasting', 'class.sorcerer.feature.sorcerous_origin'],
  warlock: ['class.warlock.feature.otherworldly_patron', 'class.warlock.feature.pact_magic'],
  wizard: ['class.wizard.feature.spellcasting', 'class.wizard.feature.arcane_recovery'],
};

const managedClassFeatureIds = new Set(Object.values(classFeatureIdsByClassKey).flat());
const classChoiceFeaturePrefixes = [
  'fighting_style:',
  'favored_enemy:',
  'favored_enemy_humanoid:',
  'expertise:',
];

export const featOptions = [
  {
    id: 'feat.alert',
    label: 'Alert / 경계',
    summary: '기습에 대비하고 전투 시작 반응성이 뛰어난 캐릭터를 표현하는 Feat입니다.',
    tags: ['선제권', '방어', '전투 시작'],
  },
] as const;

export const featOptionById: Map<string, (typeof featOptions)[number]> = new Map(
  featOptions.map((feat) => [feat.id, feat] as const)
);

const ASI_CHOICE_PREFIX = 'asi:';

function getSkillChoiceLabel(skill: string) {
  const trimmed = skill.trim();
  return skillKoByCode.get(trimmed.toLowerCase()) ?? trimmed;
}

export function createEmptyAbilityScoreIncreases(): Record<AbilityKey, number> {
  return { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
}

export function getCrossedAsiLevels(
  classKey: string,
  currentLevel: number,
  targetLevel: number
): number[] {
  return resolveCrossedAbilityScoreImprovementLevels(classKey, currentLevel, targetLevel);
}

export function getCreationAsiLevels(classKey: string, level: number): number[] {
  return resolveAvailableAbilityScoreImprovementLevels(classKey, normalizeLevel(level));
}

export function buildCreationAsiFeatChoiceState(params: {
  className: string;
  level: number | undefined;
  features: string[] | undefined;
}): CharacterCreationAsiFeatChoiceState {
  const asiLevels = getCreationAsiLevels(params.className, params.level ?? 1);
  const selectedChoiceIds = getSelectedAsiFeatChoiceIds(params.features);

  return {
    asiLevels,
    selectedChoiceIds,
    choices: asiLevels.map((asiLevel, index) => {
      const selectedChoiceId = selectedChoiceIds[index] ?? '';
      const selectedAsiAbility = getAbilityFromAsiChoiceId(selectedChoiceId);
      const selectedFeat = selectedChoiceId.startsWith('feat.')
        ? (featOptionById.get(selectedChoiceId) ?? null)
        : null;

      return {
        asiLevel,
        selectedChoiceId,
        selectedAsiAbility,
        selectedFeat,
      };
    }),
  };
}

export function getAsiChoiceId(ability: AbilityKey) {
  return `${ASI_CHOICE_PREFIX}${ability}`;
}

export function getAbilityFromAsiChoiceId(choiceId: string): AbilityKey | null {
  if (!choiceId.startsWith(ASI_CHOICE_PREFIX)) return null;
  const ability = choiceId.slice(ASI_CHOICE_PREFIX.length);
  return abilityKeys.includes(ability as AbilityKey)
    ? (ability as AbilityKey)
    : null;
}

export function buildAbilityScoreIncreasesFromAsiFeatChoices(choices: string[]) {
  return choices.reduce((acc, choice) => {
    const ability = getAbilityFromAsiChoiceId(choice);
    if (ability) {
      acc[ability] += 2;
    }
    return acc;
  }, createEmptyAbilityScoreIncreases());
}

export function getFeatSelectionsFromAsiFeatChoices(choices: string[]) {
  return choices.filter((choice) => choice.startsWith('feat.'));
}

export function getSelectedAsiFeatChoiceIds(features: string[] | undefined): string[] {
  return (features ?? []).filter(
    (feature) => feature.startsWith('feat.') || feature.startsWith(ASI_CHOICE_PREFIX)
  );
}

export function replaceSelectedAsiFeatChoiceIds(
  features: string[] | undefined,
  choiceIds: string[]
) {
  return Array.from(
    new Set([
      ...(features ?? []).filter(
        (feature) => !feature.startsWith('feat.') && !feature.startsWith(ASI_CHOICE_PREFIX)
      ),
      ...choiceIds,
    ])
  );
}

export function updateSelectedAsiFeatChoiceId(
  features: string[] | undefined,
  choiceIndex: number,
  choiceId: string
) {
  const nextChoiceIds = getSelectedAsiFeatChoiceIds(features);
  nextChoiceIds[choiceIndex] = choiceId;
  return replaceSelectedAsiFeatChoiceIds(features, nextChoiceIds.filter(Boolean));
}

export function isAsiFeatChoiceSelectedElsewhere(
  selectedChoiceIds: string[],
  selectedChoiceId: string,
  candidateChoiceId: string
) {
  return selectedChoiceIds.includes(candidateChoiceId) && selectedChoiceId !== candidateChoiceId;
}

export function isLevelUpAsiAbilityChoiceCapped(params: {
  currentAbilityScore: number;
  abilityScoreIncrease: number;
  selectedAsiAbility: AbilityKey | null;
  candidateAbility: AbilityKey;
}) {
  return (
    params.currentAbilityScore + params.abilityScoreIncrease >= 20 &&
    params.selectedAsiAbility !== params.candidateAbility
  );
}

export function normalizeAsiFeatChoicesForClassLevel(
  className: string,
  level: number | undefined,
  features: string[] | undefined
) {
  const allowedChoiceCount = getCreationAsiLevels(className, level ?? 1).length;
  return getSelectedAsiFeatChoiceIds(features).slice(0, allowedChoiceCount);
}

export function buildChoiceFeaturePreviewItems(params: {
  ancestryKey: string;
  classKey: string;
  level: number;
  features: string[];
  proficientSkills: string[];
  subclassRequired: boolean;
  subclassName?: string | null;
}): CharacterFeaturePreviewItem[] {
  const context: FeatureChoiceContext = {
    ancestryKey: params.ancestryKey,
    classKey: params.classKey,
    level: params.level,
    features: params.features,
    proficientSkills: params.proficientSkills,
  };
  const items: CharacterFeaturePreviewItem[] = getActiveFeatureChoiceDefinitions(context).map(
    (definition) => ({
      id: definition.id,
      label: definition.label,
      source: 'choice',
      summary: getFeatureChoiceSummary(definition, context),
      status: isFeatureChoiceComplete(definition, context) ? 'selected' : 'required',
    })
  );

  if (params.subclassRequired) {
    items.push({
      id: `choice.${params.classKey}.subclass`,
      label: 'Subclass / 서브클래스',
      source: 'subclass',
      summary: params.subclassName
        ? `선택한 서브클래스: ${params.subclassName}`
        : '현재 시작 레벨에서는 서브클래스를 선택해야 합니다.',
      status: params.subclassName ? 'selected' : 'required',
    });
  }

  return items;
}

export function getFeatureValue(features: string[] | undefined, prefix: string) {
  return (features ?? []).find((feature) => feature.startsWith(prefix))?.slice(prefix.length) ?? '';
}

export function getFeatureValues(features: string[] | undefined, prefix: string) {
  return (features ?? [])
    .filter((feature) => feature.startsWith(prefix))
    .map((feature) => feature.slice(prefix.length));
}

export function getFeatureChoiceContext(params: {
  ancestry: string;
  className: string;
  level?: number;
  features?: string[];
  proficientSkills?: string[];
}): FeatureChoiceContext {
  return {
    ancestryKey: params.ancestry.trim().toLowerCase().replace(/_/g, '-'),
    classKey: normalizeSrdCharacterClassKey(params.className),
    level: normalizeLevel(params.level ?? 1),
    features: params.features ?? [],
    proficientSkills: params.proficientSkills ?? [],
  };
}

export function getActiveFeatureChoiceDefinitions(context: FeatureChoiceContext) {
  return featureChoiceDefinitions.filter((definition) => definition.applies(context));
}

export function buildFeatureChoiceViewModels(
  definitions: FeatureChoiceDefinition[],
  context: FeatureChoiceContext
) {
  return definitions.map((definition) => {
    const options = definition.getOptions(context);
    const selectedValues = getFeatureChoiceSelectedValues(definition, context.features);
    const isComplete = isFeatureChoiceComplete(definition, context);

    return {
      definition,
      options,
      selectedValues,
      isComplete,
      statusLabel: isComplete
        ? '선택 완료'
        : `선택 필요 ${selectedValues.length}/${definition.requiredSelections}`,
      summary: getFeatureChoiceSummary(definition, context),
    };
  });
}

export function getFeatureChoiceSelectedValues(
  definition: FeatureChoiceDefinition,
  features: string[] | undefined
) {
  return definition.mode === 'single'
    ? [getFeatureValue(features, definition.featurePrefix)].filter(Boolean)
    : getFeatureValues(features, definition.featurePrefix);
}

export function isFeatureChoiceComplete(
  definition: FeatureChoiceDefinition,
  context: FeatureChoiceContext
) {
  const selectedValues = getFeatureChoiceSelectedValues(definition, context.features);
  if (definition.mode === 'single') {
    return selectedValues.length >= definition.requiredSelections;
  }
  return (
    selectedValues.length === definition.requiredSelections &&
    new Set(selectedValues).size === definition.requiredSelections
  );
}

export function getFeatureChoiceSummary(
  definition: FeatureChoiceDefinition,
  context: FeatureChoiceContext
) {
  const selectedValues = getFeatureChoiceSelectedValues(definition, context.features);
  if (!selectedValues.length) return definition.helper;
  if (definition.getSelectedSummary) {
    return definition.getSelectedSummary(selectedValues, context);
  }
  const options = definition.getOptions(context);
  return `선택됨: ${selectedValues
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .join(', ')}`;
}

export function setSingleFeatureChoiceValue(
  features: string[] | undefined,
  definition: FeatureChoiceDefinition,
  nextValue: string
) {
  return replaceFeatureTags(
    features,
    definition.removedPrefixes,
    nextValue ? [`${definition.featurePrefix}${nextValue}`] : []
  );
}

export function toggleMultiFeatureChoiceValue(
  features: string[] | undefined,
  definition: FeatureChoiceDefinition,
  optionValue: string
) {
  const currentSelections = getFeatureChoiceSelectedValues(definition, features);
  const nextSelections = currentSelections.includes(optionValue)
    ? currentSelections.filter((entry) => entry !== optionValue)
    : [...currentSelections, optionValue].slice(0, definition.requiredSelections);

  return replaceFeatureTags(
    features,
    definition.removedPrefixes,
    nextSelections.map((entry) => `${definition.featurePrefix}${entry}`)
  );
}

export function setCharacterCreateAsiFeatChoice(
  current: CharacterPayload,
  index: number,
  choiceId: string
): CharacterPayload {
  return {
    ...current,
    features: updateSelectedAsiFeatChoiceId(current.features, index, choiceId),
  };
}

export function setCharacterCreateSingleFeatureChoice(
  current: CharacterPayload,
  definition: FeatureChoiceDefinition,
  value: string
): CharacterPayload {
  return {
    ...current,
    features: setSingleFeatureChoiceValue(current.features, definition, value),
  };
}

export function toggleCharacterCreateMultiFeatureChoice(
  current: CharacterPayload,
  definition: FeatureChoiceDefinition,
  value: string
): CharacterPayload {
  return {
    ...current,
    features: toggleMultiFeatureChoiceValue(current.features, definition, value),
  };
}

export function replaceFeatureTags(
  features: string[] | undefined,
  removedPrefixes: string[],
  addedFeatures: string[]
) {
  const next = (features ?? []).filter(
    (feature) => !removedPrefixes.some((prefix) => feature.startsWith(prefix))
  );
  return Array.from(new Set([...next, ...addedFeatures.filter(Boolean)]));
}

export function buildClassFeaturesForSubmit(className: string, features: string[] | undefined) {
  const classKey = normalizeSrdCharacterClassKey(className);
  const baseFeatures = classFeatureIdsByClassKey[classKey] ?? [];
  const unmanagedFeatures = (features ?? []).filter(
    (feature) =>
      !managedClassFeatureIds.has(feature) &&
      !classChoiceFeaturePrefixes.some((prefix) => feature.startsWith(prefix))
  );
  const choiceFeatures = (features ?? []).filter((feature) =>
    classChoiceFeaturePrefixes.some((prefix) => feature.startsWith(prefix))
  );
  return Array.from(new Set([...unmanagedFeatures, ...baseFeatures, ...choiceFeatures]));
}

export function hasRequiredClassFeatureChoices(
  className: string,
  level: number | undefined,
  features: string[] | undefined
) {
  const context = getFeatureChoiceContext({
    ancestry: '',
    className,
    level,
    features,
    proficientSkills: [],
  });
  return getActiveFeatureChoiceDefinitions(context)
    .filter(
      (definition) =>
        definition.id.startsWith(`choice.${context.classKey}.`) ||
        definition.id === 'choice.class.fighting_style'
    )
    .every((definition) => isFeatureChoiceComplete(definition, context));
}

export function hasRequiredRaceFeatureChoices(
  ancestry: string,
  level: number | undefined,
  features: string[] | undefined
) {
  const context = getFeatureChoiceContext({
    ancestry,
    className: '',
    level,
    features,
    proficientSkills: [],
  });
  return getActiveFeatureChoiceDefinitions(context)
    .filter((definition) => definition.id.startsWith(`choice.${context.ancestryKey}.`))
    .every((definition) => isFeatureChoiceComplete(definition, context));
}
