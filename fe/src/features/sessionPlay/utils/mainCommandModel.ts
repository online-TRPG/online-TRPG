import type { SubmitMainCommandDto } from '@trpg/shared-types';

export type MainCommandHelperGroup =
  | 'NPC_INTERACTION'
  | 'OBJECT_AREA_TARGET'
  | 'MAP_POINT_TARGET'
  | 'ITEM_TOOL_SELECT'
  | 'COMBAT_TARGET';

export type MainCommandFieldConfig = {
  targetTypes?: SubmitMainCommandDto['targetType'][];
  requiresItem?: boolean;
  requiresSpell?: boolean;
  requiresMapPoint?: boolean;
  allowsMapPoint?: boolean;
  allowsRelatedIntent?: boolean;
};

export type MainCommandHelperOption = {
  id: MainCommandHelperGroup;
  label: string;
  description: string;
  fieldConfig: MainCommandFieldConfig;
  screenTypes: SubmitMainCommandDto['screenType'][];
};

export type MainCommandPresetModel = {
  label: string;
  categoryLabel: string;
  category: SubmitMainCommandDto['category'];
  intent: SubmitMainCommandDto['intent'];
  screenType: SubmitMainCommandDto['screenType'];
  slashCommands?: string[];
  description?: string;
  helperGroup?: MainCommandHelperGroup;
};

export type ParsedMainSlashInput<TPreset extends MainCommandPresetModel = MainCommandPresetModel> =
  | {
      type: 'empty';
      query: string;
    }
  | {
      type: 'matched';
      query: string;
      preset: TPreset;
      playerText: string;
    }
  | {
      type: 'unknown';
      query: string;
      command: string;
    };

export type MainCommandCategoryOption = {
  label: string;
  category: SubmitMainCommandDto['category'];
};

export type MainCommandCategoryStateReconciliation = {
  selectedCategory: string | null;
  openCategory: string | null;
  selectedIntent: SubmitMainCommandDto['intent'] | null;
};

export type MainCommandAutocompleteNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export type MainCommandAutocompleteEntry<
  TPreset extends MainCommandPresetModel = MainCommandPresetModel,
> =
  | {
      type: 'command';
      command: TPreset;
    }
  | {
      type: 'separator';
      id: string;
      label: string;
    };

export type MainCommandAutocompleteModel<
  TPreset extends MainCommandPresetModel = MainCommandPresetModel,
> = {
  slashToken: string;
  shouldShowAutocomplete: boolean;
  candidates: TPreset[];
  entries: MainCommandAutocompleteEntry<TPreset>[];
  commandEntries: Extract<MainCommandAutocompleteEntry<TPreset>, { type: 'command' }>[];
  indexByIntent: Map<SubmitMainCommandDto['intent'], number>;
  activeEntry: Extract<MainCommandAutocompleteEntry<TPreset>, { type: 'command' }> | null;
  activeId?: string;
};

export type MainCommandTargetLike = {
  id: string;
  name: string;
  targetType: SubmitMainCommandDto['targetType'];
};

export type MainCommandItemLike = {
  id: string;
};

export type MainCommandFieldVisibility = {
  shouldShowExplorationTargetField: boolean;
  shouldShowCommandFields: boolean;
  shouldShowTargetField: boolean;
  shouldShowItemField: boolean;
  shouldShowSpellField: boolean;
  shouldShowRelatedIntentField: boolean;
  shouldShowPointField: boolean;
};

export type MainCommandMapPointParseResult = {
  pointX: string;
  pointY: string;
  hasMapPoint: boolean;
  mapPoint: { x: number; y: number } | null;
  hasInvalidMapPointInput: boolean;
};

export type MainCommandSubmitPolicy = {
  mapPointResult: MainCommandMapPointParseResult;
  requiresTarget: boolean;
  requiresItem: boolean;
  requiresSpell: boolean;
  requiresMapPoint: boolean;
  allowsMapPoint: boolean;
  requiresTargetOrPoint: boolean;
  shouldSubmitTarget: boolean;
  shouldSubmitItem: boolean;
  shouldSubmitSpell: boolean;
  shouldSubmitRelatedIntent: boolean;
  shouldSubmitMapPoint: boolean;
  error: string | null;
};

export type ExplorationMainCommandRequestModel<
  TTarget extends MainCommandTargetLike = MainCommandTargetLike,
  TItem extends MainCommandItemLike = MainCommandItemLike,
> = {
  target: TTarget | null;
  item: TItem | null;
  pointX: string;
  pointY: string;
  shouldSubmitItem: boolean;
  shouldSubmitMapPoint: boolean;
  rawInputText: string;
};

export type MainCommandDraftInputModel = {
  message: string;
  targetId: string;
  itemId: string;
  pointX: string;
  pointY: string;
};

export const MainCommandScreenTypeValues = {
  STORY: 'STORY' as SubmitMainCommandDto['screenType'],
  EXPLORATION: 'EXPLORATION' as SubmitMainCommandDto['screenType'],
  COMBAT: 'COMBAT' as SubmitMainCommandDto['screenType'],
} as const;

const MainCommandCategoryValues = {
  TALK: 'TALK' as SubmitMainCommandDto['category'],
  SOCIAL: 'SOCIAL' as SubmitMainCommandDto['category'],
  QUESTION: 'QUESTION' as SubmitMainCommandDto['category'],
  INSPECTION: 'INSPECTION' as SubmitMainCommandDto['category'],
  RP_ACTION: 'RP_ACTION' as SubmitMainCommandDto['category'],
  SUPPORT: 'SUPPORT' as SubmitMainCommandDto['category'],
  OBSERVATION: 'OBSERVATION' as SubmitMainCommandDto['category'],
  SENSE: 'SENSE' as SubmitMainCommandDto['category'],
  MOVEMENT: 'MOVEMENT' as SubmitMainCommandDto['category'],
  INTERACTION: 'INTERACTION' as SubmitMainCommandDto['category'],
  TOOL_ITEM: 'TOOL_ITEM' as SubmitMainCommandDto['category'],
  TACTIC: 'TACTIC' as SubmitMainCommandDto['category'],
} as const;

export const MainCommandIntentValues = {
  GENERAL_GM_REQUEST: 'GENERAL_GM_REQUEST' as SubmitMainCommandDto['intent'],
  TALK_TO_NPC: 'TALK_TO_NPC' as SubmitMainCommandDto['intent'],
  SOCIAL_PERSUADE: 'SOCIAL_PERSUADE' as SubmitMainCommandDto['intent'],
  SOCIAL_INTIMIDATE: 'SOCIAL_INTIMIDATE' as SubmitMainCommandDto['intent'],
  SOCIAL_DECEIVE: 'SOCIAL_DECEIVE' as SubmitMainCommandDto['intent'],
  READ_EMOTION: 'READ_EMOTION' as SubmitMainCommandDto['intent'],
  ASK_SCENE_INFO: 'ASK_SCENE_INFO' as SubmitMainCommandDto['intent'],
  INSPECT_STORY_OBJECT: 'INSPECT_STORY_OBJECT' as SubmitMainCommandDto['intent'],
  DECLARE_RP_ACTION: 'DECLARE_RP_ACTION' as SubmitMainCommandDto['intent'],
  ASK_HINT: 'ASK_HINT' as SubmitMainCommandDto['intent'],
  ASK_SUMMARY: 'ASK_SUMMARY' as SubmitMainCommandDto['intent'],
  REQUEST_SCENE_TRANSITION: 'REQUEST_SCENE_TRANSITION' as SubmitMainCommandDto['intent'],
  OBSERVE_AREA: 'OBSERVE_AREA' as SubmitMainCommandDto['intent'],
  INVESTIGATE_OBJECT: 'INVESTIGATE_OBJECT' as SubmitMainCommandDto['intent'],
  LISTEN: 'LISTEN' as SubmitMainCommandDto['intent'],
  DETECT_DANGER: 'DETECT_DANGER' as SubmitMainCommandDto['intent'],
  SPECIAL_MOVE: 'SPECIAL_MOVE' as SubmitMainCommandDto['intent'],
  INTERACT_OBJECT: 'INTERACT_OBJECT' as SubmitMainCommandDto['intent'],
  USE_ITEM_EXPLORE: 'USE_ITEM_EXPLORE' as SubmitMainCommandDto['intent'],
  SPLIT_PARTY_TASK: 'SPLIT_PARTY_TASK' as SubmitMainCommandDto['intent'],
  COMBAT_TALK: 'COMBAT_TALK' as SubmitMainCommandDto['intent'],
  TACTIC_QUERY: 'TACTIC_QUERY' as SubmitMainCommandDto['intent'],
  ASK_RULE: 'ASK_RULE' as SubmitMainCommandDto['intent'],
  ENVIRONMENT_USE: 'ENVIRONMENT_USE' as SubmitMainCommandDto['intent'],
} as const;

const MainCommandTargetTypeValues = {
  NPC: 'NPC' as SubmitMainCommandDto['targetType'],
  OBJECT: 'OBJECT' as SubmitMainCommandDto['targetType'],
  ACTOR: 'ACTOR' as SubmitMainCommandDto['targetType'],
  AREA: 'AREA' as SubmitMainCommandDto['targetType'],
  POINT: 'POINT' as SubmitMainCommandDto['targetType'],
  SELF: 'SELF' as SubmitMainCommandDto['targetType'],
} as const;

const mainCommandTargetRequiredIntents = new Set<SubmitMainCommandDto['intent']>([
  MainCommandIntentValues.TALK_TO_NPC,
  MainCommandIntentValues.SOCIAL_PERSUADE,
  MainCommandIntentValues.SOCIAL_INTIMIDATE,
  MainCommandIntentValues.SOCIAL_DECEIVE,
  MainCommandIntentValues.READ_EMOTION,
  MainCommandIntentValues.INSPECT_STORY_OBJECT,
  MainCommandIntentValues.COMBAT_TALK,
]);

const mainCommandTargetOrPointIntents = new Set<SubmitMainCommandDto['intent']>([
  MainCommandIntentValues.INVESTIGATE_OBJECT,
  MainCommandIntentValues.INTERACT_OBJECT,
  MainCommandIntentValues.ENVIRONMENT_USE,
]);

const immediateExplorationMainCommandIntents = new Set<SubmitMainCommandDto['intent']>([
  MainCommandIntentValues.INVESTIGATE_OBJECT,
  MainCommandIntentValues.OBSERVE_AREA,
  MainCommandIntentValues.INTERACT_OBJECT,
  MainCommandIntentValues.ENVIRONMENT_USE,
]);

export const mainCommandPresetsByScreen: Record<
  SubmitMainCommandDto['screenType'],
  MainCommandPresetModel[]
> = {
  STORY: [
    {
      label: 'NPC에게 말하기',
      categoryLabel: '대화',
      category: MainCommandCategoryValues.TALK,
      intent: MainCommandIntentValues.TALK_TO_NPC,
      screenType: MainCommandScreenTypeValues.STORY,
    },
    {
      label: '설득하기',
      categoryLabel: '사회 행동',
      category: MainCommandCategoryValues.SOCIAL,
      intent: MainCommandIntentValues.SOCIAL_PERSUADE,
      screenType: MainCommandScreenTypeValues.STORY,
    },
    {
      label: '협박하기',
      categoryLabel: '사회 행동',
      category: MainCommandCategoryValues.SOCIAL,
      intent: MainCommandIntentValues.SOCIAL_INTIMIDATE,
      screenType: MainCommandScreenTypeValues.STORY,
    },
    {
      label: '태도 살피기',
      categoryLabel: '사회 행동',
      category: MainCommandCategoryValues.SOCIAL,
      intent: MainCommandIntentValues.READ_EMOTION,
      screenType: MainCommandScreenTypeValues.STORY,
    },
    {
      label: '정보',
      categoryLabel: '질문',
      category: MainCommandCategoryValues.QUESTION,
      intent: MainCommandIntentValues.ASK_SCENE_INFO,
      screenType: MainCommandScreenTypeValues.STORY,
    },
    {
      label: 'RP 행동',
      categoryLabel: 'RP 행동',
      category: MainCommandCategoryValues.RP_ACTION,
      intent: MainCommandIntentValues.DECLARE_RP_ACTION,
      screenType: MainCommandScreenTypeValues.STORY,
    },
    {
      label: '힌트 요청',
      categoryLabel: '진행 보조',
      category: MainCommandCategoryValues.SUPPORT,
      intent: MainCommandIntentValues.ASK_HINT,
      screenType: MainCommandScreenTypeValues.STORY,
    },
    {
      label: '요약',
      categoryLabel: '진행 보조',
      category: MainCommandCategoryValues.SUPPORT,
      intent: MainCommandIntentValues.ASK_SUMMARY,
      screenType: MainCommandScreenTypeValues.STORY,
    },
    {
      label: '장면 진행 요청',
      categoryLabel: '진행 보조',
      category: MainCommandCategoryValues.SUPPORT,
      intent: MainCommandIntentValues.REQUEST_SCENE_TRANSITION,
      screenType: MainCommandScreenTypeValues.STORY,
    },
  ],
  EXPLORATION: [
    {
      label: '주변 살피기',
      categoryLabel: '관찰',
      category: MainCommandCategoryValues.OBSERVATION,
      intent: MainCommandIntentValues.OBSERVE_AREA,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '조사하기',
      categoryLabel: '조사',
      category: MainCommandCategoryValues.INSPECTION,
      intent: MainCommandIntentValues.INVESTIGATE_OBJECT,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '듣기',
      categoryLabel: '감각',
      category: MainCommandCategoryValues.SENSE,
      intent: MainCommandIntentValues.LISTEN,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '위험 감지',
      categoryLabel: '감각',
      category: MainCommandCategoryValues.SENSE,
      intent: MainCommandIntentValues.DETECT_DANGER,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '위험한 이동',
      categoryLabel: '위험 이동',
      category: MainCommandCategoryValues.MOVEMENT,
      intent: MainCommandIntentValues.SPECIAL_MOVE,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '조작하기',
      categoryLabel: '상호작용',
      category: MainCommandCategoryValues.INTERACTION,
      intent: MainCommandIntentValues.INTERACT_OBJECT,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '아이템 창의 사용',
      categoryLabel: '도구/아이템',
      category: MainCommandCategoryValues.TOOL_ITEM,
      intent: MainCommandIntentValues.USE_ITEM_EXPLORE,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: 'NPC에게 말하기',
      categoryLabel: '대화',
      category: MainCommandCategoryValues.TALK,
      intent: MainCommandIntentValues.TALK_TO_NPC,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '파티 분담',
      categoryLabel: '진행 보조',
      category: MainCommandCategoryValues.SUPPORT,
      intent: MainCommandIntentValues.SPLIT_PARTY_TASK,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '힌트 요청',
      categoryLabel: '진행 보조',
      category: MainCommandCategoryValues.SUPPORT,
      intent: MainCommandIntentValues.ASK_HINT,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '요약',
      categoryLabel: '진행 보조',
      category: MainCommandCategoryValues.SUPPORT,
      intent: MainCommandIntentValues.ASK_SUMMARY,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
    {
      label: '장면 진행 요청',
      categoryLabel: '진행 보조',
      category: MainCommandCategoryValues.SUPPORT,
      intent: MainCommandIntentValues.REQUEST_SCENE_TRANSITION,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
    },
  ],
  COMBAT: [
    {
      label: '전투 중 대화',
      categoryLabel: '대화',
      category: MainCommandCategoryValues.TALK,
      intent: MainCommandIntentValues.COMBAT_TALK,
      screenType: MainCommandScreenTypeValues.COMBAT,
    },
    {
      label: '전술 질문',
      categoryLabel: '전술',
      category: MainCommandCategoryValues.TACTIC,
      intent: MainCommandIntentValues.TACTIC_QUERY,
      screenType: MainCommandScreenTypeValues.COMBAT,
    },
    {
      label: '룰 질문',
      categoryLabel: '질문',
      category: MainCommandCategoryValues.QUESTION,
      intent: MainCommandIntentValues.ASK_RULE,
      screenType: MainCommandScreenTypeValues.COMBAT,
    },
    {
      label: '힌트 요청',
      categoryLabel: '진행 보조',
      category: MainCommandCategoryValues.SUPPORT,
      intent: MainCommandIntentValues.ASK_HINT,
      screenType: MainCommandScreenTypeValues.COMBAT,
    },
    {
      label: '요약',
      categoryLabel: '진행 보조',
      category: MainCommandCategoryValues.SUPPORT,
      intent: MainCommandIntentValues.ASK_SUMMARY,
      screenType: MainCommandScreenTypeValues.COMBAT,
    },
  ],
};

const emptyMainCommandPresets: MainCommandPresetModel[] = [];
const hiddenExplorationMainCommandIntents = new Set<SubmitMainCommandDto['intent']>([
  MainCommandIntentValues.OBSERVE_AREA,
  MainCommandIntentValues.INVESTIGATE_OBJECT,
  MainCommandIntentValues.LISTEN,
  MainCommandIntentValues.DETECT_DANGER,
  MainCommandIntentValues.INTERACT_OBJECT,
  MainCommandIntentValues.SPLIT_PARTY_TASK,
]);

export const mainCommandFieldConfigByIntent: Partial<
  Record<SubmitMainCommandDto['intent'], MainCommandFieldConfig>
> = {
  TALK_TO_NPC: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  SOCIAL_PERSUADE: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  SOCIAL_INTIMIDATE: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  SOCIAL_DECEIVE: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  READ_EMOTION: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  INSPECT_STORY_OBJECT: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT],
  },
  INVESTIGATE_OBJECT: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT, MainCommandTargetTypeValues.AREA],
    allowsMapPoint: true,
  },
  LISTEN: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT, MainCommandTargetTypeValues.AREA],
    allowsMapPoint: true,
  },
  DETECT_DANGER: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT, MainCommandTargetTypeValues.AREA],
    allowsMapPoint: true,
  },
  SPECIAL_MOVE: {
    requiresMapPoint: true,
  },
  INTERACT_OBJECT: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT],
    allowsMapPoint: true,
  },
  USE_ITEM_EXPLORE: {
    requiresItem: true,
    targetTypes: [
      MainCommandTargetTypeValues.OBJECT,
      MainCommandTargetTypeValues.AREA,
      MainCommandTargetTypeValues.NPC,
    ],
    allowsMapPoint: true,
  },
  COMBAT_TALK: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  ASK_RULE: {
    allowsRelatedIntent: true,
  },
};

export const mainCommandHelperOptions: MainCommandHelperOption[] = [
  {
    id: 'NPC_INTERACTION',
    label: 'NPC 상호작용',
    description: 'NPC를 대상으로 대화나 사회 행동을 준비합니다.',
    fieldConfig: { targetTypes: [MainCommandTargetTypeValues.NPC] },
    screenTypes: [MainCommandScreenTypeValues.EXPLORATION],
  },
  {
    id: 'OBJECT_AREA_TARGET',
    label: '대상/장소 선택',
    description: '물건, 장치, 문, 장소를 대상으로 탐험 행동을 준비합니다.',
    fieldConfig: {
      targetTypes: [MainCommandTargetTypeValues.OBJECT, MainCommandTargetTypeValues.AREA],
    },
    screenTypes: [MainCommandScreenTypeValues.EXPLORATION, MainCommandScreenTypeValues.COMBAT],
  },
  {
    id: 'MAP_POINT_TARGET',
    label: '좌표 선택',
    description: '지도 좌표나 맵의 특정 지점을 지정합니다.',
    fieldConfig: { requiresMapPoint: true },
    screenTypes: [MainCommandScreenTypeValues.EXPLORATION],
  },
  {
    id: 'ITEM_TOOL_SELECT',
    label: '아이템 선택',
    description: '보유 아이템을 먼저 고르고 사용 방식은 입력합니다.',
    fieldConfig: { requiresItem: true },
    screenTypes: [MainCommandScreenTypeValues.EXPLORATION],
  },
  {
    id: 'COMBAT_TARGET',
    label: '전투 대화 대상',
    description: '전투 중 대화할 NPC를 먼저 고릅니다.',
    fieldConfig: {
      targetTypes: [MainCommandTargetTypeValues.NPC],
    },
    screenTypes: [MainCommandScreenTypeValues.COMBAT],
  },
];

export function doesMainCommandRequireTarget(intent: SubmitMainCommandDto['intent']): boolean {
  return mainCommandTargetRequiredIntents.has(intent);
}

export function getMainCommandPresetsForScreen(
  screenType: SubmitMainCommandDto['screenType'] | null,
  isExplorationContext: boolean
): MainCommandPresetModel[] {
  if (!screenType) return emptyMainCommandPresets;
  const presets = mainCommandPresetsByScreen[screenType];
  return isExplorationContext
    ? presets.filter((preset) => !hiddenExplorationMainCommandIntents.has(preset.intent))
    : presets;
}

export function getExplorationMainCommandPresetByIntent(
  intent: SubmitMainCommandDto['intent']
): MainCommandPresetModel | null {
  return mainCommandPresetsByScreen.EXPLORATION.find((preset) => preset.intent === intent) ?? null;
}

const mainCommandSlashMetadataByIntent: Partial<
  Record<
    SubmitMainCommandDto['intent'],
    {
      slashCommands: string[];
      description: string;
      helperGroup?: MainCommandHelperGroup;
    }
  >
> = {
  TALK_TO_NPC: {
    slashCommands: ['/대화'],
    description: '선택한 NPC에게 말을 걸거나 질문합니다.',
    helperGroup: 'NPC_INTERACTION',
  },
  SOCIAL_PERSUADE: {
    slashCommands: ['/설득'],
    description: '선택한 NPC를 논리나 호소로 설득합니다.',
    helperGroup: 'NPC_INTERACTION',
  },
  SOCIAL_INTIMIDATE: {
    slashCommands: ['/협박'],
    description: '선택한 NPC를 위협하거나 압박합니다.',
    helperGroup: 'NPC_INTERACTION',
  },
  READ_EMOTION: {
    slashCommands: ['/눈치'],
    description: '선택한 NPC의 태도와 감정을 살핍니다.',
    helperGroup: 'NPC_INTERACTION',
  },
  COMBAT_TALK: {
    slashCommands: ['/말걸기'],
    description: '전투 중 대상에게 말을 걸거나 항복을 권유합니다.',
    helperGroup: 'COMBAT_TARGET',
  },
  ASK_SCENE_INFO: {
    slashCommands: ['/정보'],
    description: '현재 장면이나 선택 대상의 공개 정보를 확인합니다.',
  },
  ASK_HINT: {
    slashCommands: ['/힌트'],
    description: '현재 장면에서 놓친 단서나 다음 선택지를 안내받습니다.',
  },
  ASK_SUMMARY: {
    slashCommands: ['/요약'],
    description: '지금까지의 흐름과 단서를 짧게 정리합니다.',
  },
  REQUEST_SCENE_TRANSITION: {
    slashCommands: ['/장면진행'],
    description: '다른 장소나 다음 장면으로 진행을 요청합니다.',
  },
  TACTIC_QUERY: {
    slashCommands: ['/전술'],
    description: '현재 전투에서 가능한 전술 선택지를 묻습니다.',
  },
  ASK_RULE: {
    slashCommands: ['/룰'],
    description: '이 행동에 어떤 판정이나 룰이 필요한지 묻습니다.',
  },
  OBSERVE_AREA: {
    slashCommands: [],
    description: '주변을 넓게 둘러보고 눈에 띄는 것을 찾습니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  INVESTIGATE_OBJECT: {
    slashCommands: [],
    description: '대상이나 장소를 자세히 살펴 단서, 구조, 이상한 점을 찾습니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  INSPECT_STORY_OBJECT: {
    slashCommands: ['/살펴보기'],
    description: '장면 속 물건을 자세히 살펴봅니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  LISTEN: {
    slashCommands: [],
    description: '주변이나 특정 대상에서 들리는 소리를 확인합니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  DETECT_DANGER: {
    slashCommands: [],
    description: '함정, 매복, 위험 요소가 있는지 살핍니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  SPECIAL_MOVE: {
    slashCommands: ['/특수이동'],
    description: '도약, 등반, 균형 잡기처럼 위험한 방식으로 특정 지점까지 이동합니다.',
    helperGroup: 'MAP_POINT_TARGET',
  },
  INTERACT_OBJECT: {
    slashCommands: [],
    description: '문, 레버, 상자, 장치처럼 조작 가능한 것을 다룹니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  SPLIT_PARTY_TASK: {
    slashCommands: [],
    description: '파티원들이 각자 맡을 일을 나눕니다.',
  },
  USE_ITEM_EXPLORE: {
    slashCommands: ['/아이템활용'],
    description: '기름병 같은 보유 아이템을 상황에 맞게 창의적으로 활용합니다.',
    helperGroup: 'ITEM_TOOL_SELECT',
  },
};

const mainCommandIntentOptionsByHelperGroup: Record<
  MainCommandHelperGroup,
  SubmitMainCommandDto['intent'][]
> = {
  NPC_INTERACTION: [
    MainCommandIntentValues.TALK_TO_NPC,
    MainCommandIntentValues.SOCIAL_PERSUADE,
    MainCommandIntentValues.SOCIAL_INTIMIDATE,
    MainCommandIntentValues.READ_EMOTION,
  ],
  OBJECT_AREA_TARGET: [
    MainCommandIntentValues.OBSERVE_AREA,
    MainCommandIntentValues.INVESTIGATE_OBJECT,
    MainCommandIntentValues.INSPECT_STORY_OBJECT,
    MainCommandIntentValues.LISTEN,
    MainCommandIntentValues.DETECT_DANGER,
    MainCommandIntentValues.INTERACT_OBJECT,
  ],
  MAP_POINT_TARGET: [
    MainCommandIntentValues.SPECIAL_MOVE,
    MainCommandIntentValues.INVESTIGATE_OBJECT,
    MainCommandIntentValues.INTERACT_OBJECT,
    MainCommandIntentValues.DETECT_DANGER,
    MainCommandIntentValues.LISTEN,
  ],
  ITEM_TOOL_SELECT: [MainCommandIntentValues.USE_ITEM_EXPLORE],
  COMBAT_TARGET: [MainCommandIntentValues.COMBAT_TALK],
};

export function getMainCommandSlashCommands(preset: MainCommandPresetModel): string[] {
  return preset.slashCommands ?? mainCommandSlashMetadataByIntent[preset.intent]?.slashCommands ?? [];
}

export function getMainCommandDescription(preset: MainCommandPresetModel): string {
  return preset.description ?? mainCommandSlashMetadataByIntent[preset.intent]?.description ?? '';
}

export function getMainCommandHelperGroup(
  preset: MainCommandPresetModel
): MainCommandHelperGroup | undefined {
  return preset.helperGroup ?? mainCommandSlashMetadataByIntent[preset.intent]?.helperGroup;
}

export function doesMainCommandNeedHelperSelection(preset: MainCommandPresetModel): boolean {
  return Boolean(getMainCommandHelperGroup(preset));
}

export function isMainCommandAvailableForHelperGroup(
  preset: MainCommandPresetModel,
  helperGroup: MainCommandHelperGroup
): boolean {
  return mainCommandIntentOptionsByHelperGroup[helperGroup].includes(preset.intent);
}

export function getMainCommandHelperGroupForSelection(
  preset: MainCommandPresetModel,
  preferredHelperGroup?: MainCommandHelperGroup
): MainCommandHelperGroup | null {
  if (preferredHelperGroup && isMainCommandAvailableForHelperGroup(preset, preferredHelperGroup)) {
    return preferredHelperGroup;
  }
  return getMainCommandHelperGroup(preset) ?? null;
}

export function getAvailableMainCommandHelperOptions(params: {
  screenType: SubmitMainCommandDto['screenType'] | null;
  visibleTargets: Array<{ targetType: SubmitMainCommandDto['targetType'] }>;
  inventoryItemCount: number;
}): MainCommandHelperOption[] {
  const screenType = params.screenType;
  if (!screenType) return [];
  return mainCommandHelperOptions.filter((option) => {
    if (!option.screenTypes.includes(screenType)) {
      return false;
    }
    if (
      option.id === 'NPC_INTERACTION' &&
      !params.visibleTargets.some((target) => target.targetType === MainCommandTargetTypeValues.NPC)
    ) {
      return false;
    }
    if (
      option.id === 'OBJECT_AREA_TARGET' &&
      !params.visibleTargets.some(
        (target) =>
          target.targetType === MainCommandTargetTypeValues.OBJECT ||
          target.targetType === MainCommandTargetTypeValues.AREA
      )
    ) {
      return false;
    }
    if (option.id === 'ITEM_TOOL_SELECT' && params.inventoryItemCount === 0) {
      return false;
    }
    return true;
  });
}

export function selectActiveMainCommandHelperOption(params: {
  isExplorationContext: boolean;
  availableOptions: MainCommandHelperOption[];
  selectedCommand: MainCommandPresetModel | null;
  activeHelperGroup: MainCommandHelperGroup | null;
}): MainCommandHelperOption | null {
  const selectedCommandHelperGroup = params.selectedCommand
    ? getMainCommandHelperGroup(params.selectedCommand)
    : null;
  if (params.isExplorationContext) {
    return (
      params.availableOptions.find((option) => option.id === selectedCommandHelperGroup) ?? null
    );
  }
  return (
    params.availableOptions.find(
      (option) =>
        option.id === params.activeHelperGroup &&
        (!params.selectedCommand ||
          isMainCommandAvailableForHelperGroup(params.selectedCommand, option.id))
    ) ??
    params.availableOptions.find((option) => option.id === selectedCommandHelperGroup) ??
    null
  );
}

export function getMainCommandFieldConfigForSelection(
  selectedCommand: MainCommandPresetModel | null,
  activeHelperOption: MainCommandHelperOption | null
): MainCommandFieldConfig | null {
  return selectedCommand
    ? (mainCommandFieldConfigByIntent[selectedCommand.intent] ??
        activeHelperOption?.fieldConfig ??
        null)
    : activeHelperOption?.fieldConfig ?? null;
}

export function doesMainCommandRequireTargetOrPoint(
  intent: SubmitMainCommandDto['intent']
): boolean {
  return mainCommandTargetOrPointIntents.has(intent);
}

export function getVisibleMainCommandTargetOptions<TTarget extends MainCommandTargetLike>(
  targets: TTarget[],
  fieldConfig: MainCommandFieldConfig | null
): TTarget[] {
  return targets.filter((target) =>
    fieldConfig?.targetTypes?.length ? fieldConfig.targetTypes.includes(target.targetType) : true
  );
}

export function getMainCommandFieldVisibility(
  fieldConfig: MainCommandFieldConfig | null,
  isExplorationContext: boolean
): MainCommandFieldVisibility {
  const shouldShowExplorationTargetField = Boolean(
    isExplorationContext && fieldConfig?.targetTypes?.includes(MainCommandTargetTypeValues.NPC)
  );
  return {
    shouldShowExplorationTargetField,
    shouldShowCommandFields: Boolean(
      fieldConfig && (!isExplorationContext || shouldShowExplorationTargetField)
    ),
    shouldShowTargetField: Boolean(
      fieldConfig?.targetTypes?.length &&
        (!isExplorationContext || shouldShowExplorationTargetField)
    ),
    shouldShowItemField: Boolean(fieldConfig?.requiresItem && !isExplorationContext),
    shouldShowSpellField: Boolean(fieldConfig?.requiresSpell && !isExplorationContext),
    shouldShowRelatedIntentField: Boolean(
      fieldConfig?.allowsRelatedIntent && !isExplorationContext
    ),
    shouldShowPointField: Boolean(
      !isExplorationContext && (fieldConfig?.requiresMapPoint || fieldConfig?.allowsMapPoint)
    ),
  };
}

export function getMainCommandRelatedIntentOptions<TPreset extends MainCommandPresetModel>(
  presets: TPreset[]
): TPreset[] {
  return presets.filter(
    (preset) =>
      preset.intent !== MainCommandIntentValues.ASK_RULE &&
      preset.intent !== MainCommandIntentValues.ASK_HINT
  );
}

export function shouldSubmitMainCommandTarget(params: {
  selectedTargetId: string;
  fieldConfig: MainCommandFieldConfig | null;
  isExplorationContext: boolean;
  selectedTarget: MainCommandTargetLike | null;
}): boolean {
  return Boolean(
    params.selectedTargetId &&
      (params.fieldConfig?.targetTypes?.length ||
        (params.isExplorationContext && params.selectedTarget))
  );
}

export function shouldSubmitMainCommandMapPoint(params: {
  mapPoint: { x: number; y: number } | null;
  fieldConfig: MainCommandFieldConfig | null;
  intent: SubmitMainCommandDto['intent'];
  target: MainCommandTargetLike | null;
  isExplorationContext?: boolean;
  isRequiredTargetMissing?: boolean;
}): boolean {
  return Boolean(
    params.mapPoint &&
      (params.fieldConfig?.requiresMapPoint ||
        params.fieldConfig?.allowsMapPoint ||
        doesMainCommandRequireTargetOrPoint(params.intent) ||
        params.isRequiredTargetMissing ||
        params.isExplorationContext ||
        !params.target)
  );
}

export function isImmediateExplorationMainCommandIntent(
  intent: SubmitMainCommandDto['intent']
): boolean {
  return immediateExplorationMainCommandIntents.has(intent);
}

export function resolveMainCommandTarget<TTarget extends MainCommandTargetLike>(
  targets: TTarget[],
  targetId: string | undefined,
  fieldConfig: MainCommandFieldConfig | null
): TTarget | null {
  if (!targetId) return null;
  return (
    targets.find((target) => {
      if (target.id !== targetId) return false;
      return fieldConfig?.targetTypes?.length
        ? fieldConfig.targetTypes.includes(target.targetType)
        : true;
    }) ?? null
  );
}

export function buildExplorationMainCommandRequestModel<
  TTarget extends MainCommandTargetLike,
  TItem extends MainCommandItemLike,
>(params: {
  preset: MainCommandPresetModel;
  fieldConfig: MainCommandFieldConfig | null;
  targetId?: string;
  itemId?: string;
  mapPoint?: { x: number; y: number } | null;
  playerText: string;
  visibleTargets: TTarget[];
  inventoryItems: TItem[];
  isExplorationContext: boolean;
}): ExplorationMainCommandRequestModel<TTarget, TItem> {
  const target = resolveMainCommandTarget(
    params.visibleTargets,
    params.targetId,
    params.fieldConfig
  );
  const item = params.itemId
    ? params.inventoryItems.find((entry) => entry.id === params.itemId) ?? null
    : null;
  const requiresItem = Boolean(params.fieldConfig?.requiresItem);
  const shouldSubmitMapPoint = shouldSubmitMainCommandMapPoint({
    mapPoint: params.mapPoint ?? null,
    fieldConfig: params.fieldConfig,
    intent: params.preset.intent,
    target,
  });
  const slashCommand = getMainCommandSlashCommands(params.preset)[0] ?? '';
  const rawInputText = slashCommand
    ? `${slashCommand} ${params.playerText}`.trim()
    : params.playerText;
  const pointX = params.mapPoint ? String(params.mapPoint.x) : '';
  const pointY = params.mapPoint ? String(params.mapPoint.y) : '';

  return {
    target,
    item,
    pointX,
    pointY,
    shouldSubmitItem: Boolean(item && (requiresItem || params.isExplorationContext)),
    shouldSubmitMapPoint,
    rawInputText,
  };
}

export function buildMainCommandDraftInputModel(params: {
  preset: MainCommandPresetModel | null;
  playerText: string;
  targetId?: string;
  itemId?: string;
  mapPoint?: { x: number; y: number } | null;
}): MainCommandDraftInputModel {
  const slashCommand = params.preset ? getMainCommandSlashCommands(params.preset)[0] : null;
  return {
    message: slashCommand ? `${slashCommand} ${params.playerText}`.trim() : params.playerText,
    targetId: params.targetId ?? '',
    itemId: params.itemId ?? '',
    pointX: params.mapPoint ? String(params.mapPoint.x) : '',
    pointY: params.mapPoint ? String(params.mapPoint.y) : '',
  };
}

export function parseMainCommandMapPointInput(
  rawPointX: string,
  rawPointY: string
): MainCommandMapPointParseResult {
  const pointX = rawPointX.trim();
  const pointY = rawPointY.trim();
  const hasAnyMapPointInput = pointX !== '' || pointY !== '';
  const hasMapPoint = pointX !== '' && pointY !== '';
  const mapPoint =
    hasMapPoint && Number.isFinite(Number(pointX)) && Number.isFinite(Number(pointY))
      ? { x: Number(pointX), y: Number(pointY) }
      : null;

  return {
    pointX,
    pointY,
    hasMapPoint,
    mapPoint,
    hasInvalidMapPointInput: hasAnyMapPointInput && !mapPoint,
  };
}

export function buildMainCommandSubmitPolicy(params: {
  intent: SubmitMainCommandDto['intent'];
  fieldConfig: MainCommandFieldConfig | null;
  selectedTargetId: string;
  selectedTarget: MainCommandTargetLike | null;
  selectedItemId: string;
  selectedItem: unknown | null;
  selectedSpellId: string;
  selectedRelatedIntent: SubmitMainCommandDto['intent'] | '';
  rawPointX: string;
  rawPointY: string;
  commandBody: string;
  isExplorationContext: boolean;
}): MainCommandSubmitPolicy {
  const mapPointResult = parseMainCommandMapPointInput(params.rawPointX, params.rawPointY);
  const requiresTarget = doesMainCommandRequireTarget(params.intent);
  const requiresItem = Boolean(params.fieldConfig?.requiresItem);
  const requiresSpell = Boolean(params.fieldConfig?.requiresSpell);
  const requiresMapPoint = Boolean(params.fieldConfig?.requiresMapPoint);
  const allowsMapPoint = Boolean(params.fieldConfig?.allowsMapPoint);
  const requiresTargetOrPoint = doesMainCommandRequireTargetOrPoint(params.intent);
  const shouldSubmitTarget = shouldSubmitMainCommandTarget({
    selectedTargetId: params.selectedTargetId,
    fieldConfig: params.fieldConfig,
    isExplorationContext: params.isExplorationContext,
    selectedTarget: params.selectedTarget,
  });
  const shouldSubmitItem = Boolean(
    params.selectedItemId &&
      params.selectedItem &&
      (requiresItem || params.isExplorationContext)
  );
  const shouldSubmitSpell = Boolean(params.selectedSpellId.trim() && requiresSpell);
  const shouldSubmitRelatedIntent = Boolean(
    params.selectedRelatedIntent && params.fieldConfig?.allowsRelatedIntent
  );
  const shouldSubmitMapPoint = shouldSubmitMainCommandMapPoint({
    mapPoint: mapPointResult.mapPoint,
    fieldConfig: params.fieldConfig,
    intent: params.intent,
    target: params.selectedTarget,
    isExplorationContext: params.isExplorationContext,
    isRequiredTargetMissing: requiresTarget && !shouldSubmitTarget,
  });

  let error: string | null = null;
  if (requiresTarget && !shouldSubmitTarget && !(allowsMapPoint && mapPointResult.mapPoint)) {
    error = '이 명령은 현재 장면의 공개 대상을 함께 골라야 합니다.';
  } else if (requiresItem && !shouldSubmitItem) {
    error = '이 명령은 사용할 아이템을 함께 골라야 합니다.';
  } else if (requiresSpell && !params.selectedSpellId.trim()) {
    error = '이 명령은 사용할 주문 이름을 함께 적어야 합니다.';
  } else if (requiresMapPoint && !mapPointResult.mapPoint) {
    error = '이 명령은 지도 좌표 x, y를 함께 입력해야 합니다.';
  } else if (
    requiresTargetOrPoint &&
    !shouldSubmitTarget &&
    !mapPointResult.mapPoint &&
    !params.commandBody.trim()
  ) {
    error = '대상을 선택하거나, 무엇을 할지 입력해주세요.';
  } else if (mapPointResult.hasInvalidMapPointInput) {
    error = '지도 좌표는 숫자 x, y를 모두 입력해야 합니다.';
  }

  return {
    mapPointResult,
    requiresTarget,
    requiresItem,
    requiresSpell,
    requiresMapPoint,
    allowsMapPoint,
    requiresTargetOrPoint,
    shouldSubmitTarget,
    shouldSubmitItem,
    shouldSubmitSpell,
    shouldSubmitRelatedIntent,
    shouldSubmitMapPoint,
    error,
  };
}

export function buildMainCommandCategoryOptions(
  presets: MainCommandPresetModel[]
): MainCommandCategoryOption[] {
  const options = new Map<string, MainCommandCategoryOption>();
  presets.forEach((preset) => {
    if (!options.has(preset.categoryLabel)) {
      options.set(preset.categoryLabel, {
        label: preset.categoryLabel,
        category: preset.category,
      });
    }
  });
  return Array.from(options.values());
}

export function getMainCommandCategoryLabels(categories: MainCommandCategoryOption[]): string[] {
  return categories.map((category) => category.label);
}

export function getActiveMainCommandCategory(
  selectedCategory: string | null,
  categoryLabels: string[]
): string | null {
  return selectedCategory ?? categoryLabels[0] ?? null;
}

export function getOpenMainCommandOptions<TPreset extends MainCommandPresetModel>(
  presets: TPreset[],
  openCategory: string | null
): TPreset[] {
  return openCategory ? presets.filter((preset) => preset.categoryLabel === openCategory) : [];
}

export function reconcileMainCommandCategoryState(params: {
  categoryLabels: string[];
  activeCategory: string | null;
  openCategory: string | null;
  selectedIntent: SubmitMainCommandDto['intent'] | null;
}): MainCommandCategoryStateReconciliation {
  if (!params.categoryLabels.length) {
    return {
      selectedCategory: null,
      openCategory: null,
      selectedIntent: null,
    };
  }

  const selectedCategory =
    params.activeCategory && params.categoryLabels.includes(params.activeCategory)
      ? params.activeCategory
      : params.categoryLabels[0];
  const openCategory =
    params.openCategory && params.categoryLabels.includes(params.openCategory)
      ? params.openCategory
      : null;

  return {
    selectedCategory,
    openCategory,
    selectedIntent: params.selectedIntent,
  };
}

export function isMainCommandIntentAvailable(
  presets: MainCommandPresetModel[],
  intent: SubmitMainCommandDto['intent'] | null
): boolean {
  return Boolean(intent && presets.some((preset) => preset.intent === intent));
}

export function isMainCommandHelperGroupAvailable(
  availableOptions: MainCommandHelperOption[],
  helperGroup: MainCommandHelperGroup | null
): boolean {
  return Boolean(helperGroup && availableOptions.some((option) => option.id === helperGroup));
}

export function reconcileMainCommandAutocompleteIndex(
  currentIndex: number,
  commandEntryCount: number
): number {
  if (!commandEntryCount) return -1;
  return currentIndex >= 0 && currentIndex < commandEntryCount ? currentIndex : 0;
}

export function getNextMainCommandAutocompleteIndex(
  currentIndex: number,
  commandEntryCount: number,
  key: MainCommandAutocompleteNavigationKey
): number {
  if (!commandEntryCount) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return commandEntryCount - 1;
  if (key === 'ArrowDown') {
    const baseIndex = currentIndex >= 0 ? currentIndex : -1;
    return (baseIndex + 1) % commandEntryCount;
  }

  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  return (baseIndex - 1 + commandEntryCount) % commandEntryCount;
}

export function getMainSlashToken(rawText: string): string {
  return rawText.trimStart().split(/\s+/)[0] ?? '';
}

export function shouldShowMainCommandAutocompleteForInput(
  rawText: string,
  isGmRequestMode: boolean
): boolean {
  const trimmed = rawText.trimStart();
  return isGmRequestMode && getMainSlashToken(rawText).startsWith('/') && !trimmed.includes(' ');
}

export function buildMainCommandAutocompleteModel<TPreset extends MainCommandPresetModel>(params: {
  rawText: string;
  presets: TPreset[];
  isGmRequestMode: boolean;
  activeHelperGroup?: MainCommandHelperGroup;
  activeIndex: number;
}): MainCommandAutocompleteModel<TPreset> {
  const slashToken = getMainSlashToken(params.rawText);
  const shouldShowAutocomplete = shouldShowMainCommandAutocompleteForInput(
    params.rawText,
    params.isGmRequestMode
  );
  const candidates = shouldShowAutocomplete
    ? params.presets.filter((preset) => {
        if (
          params.activeHelperGroup &&
          !isMainCommandAvailableForHelperGroup(preset, params.activeHelperGroup)
        ) {
          return false;
        }
        const slashCommands = getMainCommandSlashCommands(preset);
        if (slashToken === '/') return slashCommands.length > 0;
        return slashCommands.some((slashCommand) => slashCommand.startsWith(slashToken));
      })
    : [];
  const entries: MainCommandAutocompleteEntry<TPreset>[] = params.activeHelperGroup
    ? candidates.map((command) => ({ type: 'command', command }))
    : [
        ...candidates
          .filter((command) => !doesMainCommandNeedHelperSelection(command))
          .map((command) => ({ type: 'command' as const, command })),
        ...(candidates.some(doesMainCommandNeedHelperSelection)
          ? [
              {
                type: 'separator' as const,
                id: 'helper-selection-required',
                label: '아래는 대상 선택 필요',
              },
              ...candidates
                .filter(doesMainCommandNeedHelperSelection)
                .map((command) => ({ type: 'command' as const, command })),
            ]
          : []),
      ];
  const commandEntries = entries.filter(
    (entry): entry is Extract<MainCommandAutocompleteEntry<TPreset>, { type: 'command' }> =>
      entry.type === 'command' && getMainCommandSlashCommands(entry.command).length > 0
  );
  const indexByIntent = new Map(
    commandEntries.map((entry, index) => [entry.command.intent, index])
  );
  const activeEntry =
    params.activeIndex >= 0 ? commandEntries[params.activeIndex] ?? null : null;
  const activeId = activeEntry
    ? `main-command-autocomplete-${activeEntry.command.intent}`
    : undefined;

  return {
    slashToken,
    shouldShowAutocomplete,
    candidates,
    entries,
    commandEntries,
    indexByIntent,
    activeEntry,
    activeId,
  };
}

export function parseMainSlashInput<TPreset extends MainCommandPresetModel>(
  rawText: string,
  presets: TPreset[]
): ParsedMainSlashInput<TPreset> | null {
  const trimmed = rawText.trimStart();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const [commandToken = '', ...bodyParts] = trimmed.split(/\s+/);
  if (commandToken === '/') {
    return { type: 'empty', query: '/' };
  }

  const normalizedCommand = commandToken.trim();
  const matchedPreset = presets.find((preset) =>
    getMainCommandSlashCommands(preset).some((slashCommand) => slashCommand === normalizedCommand)
  );

  if (!matchedPreset) {
    return { type: 'unknown', query: normalizedCommand, command: normalizedCommand };
  }

  return {
    type: 'matched',
    query: normalizedCommand,
    preset: matchedPreset,
    playerText: bodyParts.join(' ').trim(),
  };
}

export function buildGeneralGmPreset(
  screenType: SubmitMainCommandDto['screenType']
): MainCommandPresetModel {
  return {
    label: 'GM 요청',
    categoryLabel: 'GM 요청',
    category: MainCommandCategoryValues.SUPPORT,
    intent: MainCommandIntentValues.GENERAL_GM_REQUEST,
    screenType,
    slashCommands: [],
    description: '자유롭게 행동을 선언하거나 상황을 질문합니다.',
  };
}

export function getMainCommandScreenTypeFromNodeType(
  nodeType: string | undefined
): SubmitMainCommandDto['screenType'] | null {
  if (nodeType === 'story') return MainCommandScreenTypeValues.STORY;
  if (nodeType === 'exploration') return MainCommandScreenTypeValues.EXPLORATION;
  if (nodeType === 'combat') return MainCommandScreenTypeValues.COMBAT;
  return null;
}
