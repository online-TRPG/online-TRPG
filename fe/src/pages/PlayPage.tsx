/*
 * PlayPage
 * 역할: 실제 세션 플레이 화면입니다. 캐릭터 선택, 준비 상태, 채팅/로그, 현재 시나리오 노드, VTT 맵을 표시합니다.
 * 읽는 순서:
 * 1) 상단 헬퍼: 로그 스코프, 아바타/클래스 표시 이미지, 노드 라벨 추출
 * 2) PlayPageProps: 세션 스냅샷과 소켓 상태, 플레이 액션 콜백
 * 3) 컴포넌트 state/ref: 탭, 채팅 입력, 캐릭터 생성 폼, 시나리오/맵 로딩 상태, 맵 저장 큐
 * 4) useEffect: 서버 선택 캐릭터 동기화, 시나리오/맵 조회, 로그 스크롤, 입력 초기화
 * 5) handler: 캐릭터 생성, 채팅/액션 전송, VTT 맵 변경 저장
 * 6) JSX: 모집 대기 화면, 플레이 탭, VTT 맵, 사이드 패널, 캐릭터 생성 모달
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  ActionOutcome,
  ApplyCampaignCalendarActionDto,
  ApplySessionEconomyActionDto,
  AiHumanGmAssistSuggestionRequestDto,
  ClassDefinitionResponseDto,
  CombatActionResultDto,
  CombatMoveResultDto,
  CombatReactionPromptDto,
  CombatResponseDto,
  CreateHumanGmAiAssistSuggestionDto,
  HumanGmAiAssistSuggestionDto,
  ItemResponseDto,
  InventoryItemDto,
  MainCommandResponseDto,
  PlayerScenarioClueDto,
  RaceResponseDto,
  RestActionDto,
  ResolveMainCommandCheckDto,
  RuleCatalogReferenceDto,
  SubmitMainCommandDto,
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import type { BattleMapSelection } from '../features/sessionPlay/components/SessionBattleMap';
import { Icon } from '../components/Icon';
import profileBorderCharacter from '../components/Profile_Border_Character.webp';
import tavernImage from '../components/tavern.webp';
import dragonPeekImage from '../assets/images/Peak_a_Boo_Dragon.webp';
import ornamentArrowUpGold from '../assets/images/Ornament_Arrow_Up_Gold.webp';
import emptySlotImage from '../components/player_empty_slot.webp';
import existSlotImage from '../components/player_exist_slot.webp';
import pinImage from '../components/pin.png';
import corkboardNoPaperImage from '../components/corkboard_no_paper.webp';
import paperPinnedImage from '../components/paper_pinned.webp';
import bigBoxImage from '../components/bigbox.png';
import smallBoxImage from '../components/smallbox.png';
import carouselLeftImage from '../components/carousel_left.png';
import carouselRightImage from '../components/carousel_right.png';
import { CombatNodeSurface } from '../features/sessionPlay/components/CombatNodeSurface';
import { DiceRollOverlay } from '../features/sessionPlay/components/DiceRollOverlay';
import type { DiceRollOverlayData } from '../features/sessionPlay/components/DiceRollOverlay';
import {
  ExplorationNodeSurface,
  type ExplorationMainCommandRequest,
  type ExplorationNodeMoveOption,
} from '../features/sessionPlay/components/ExplorationNodeSurface';
import {
  StoryNodeSurface,
  type StoryRpUtterance,
} from '../features/sessionPlay/components/StoryNodeSurface';
import { SessionBattleMap } from '../features/sessionPlay/components/SessionBattleMap';
import { SessionCampaignCalendarPanel } from '../features/sessionPlay/components/SessionCampaignCalendarPanel';
import { SessionEconomyPanel } from '../features/sessionPlay/components/SessionEconomyPanel';
import {
  getCharacterClassLabel,
  getCharacterImage,
} from '../features/sessionPlay/utils/characterVisuals';
import { summarizeCharacterFeatures } from '../features/characters/characterFeaturePresentation';
import type { CharacterPayload } from '../hooks/useSession';
import {
  acceptHumanGmAiAssistSuggestion,
  applyCampaignCalendarAction,
  endCombat,
  endCombatTurn,
  acceptCombatReaction,
  applyHumanGmCombatCondition,
  applyHumanGmEconomyAction,
  adjustHumanGmCombatHp,
  resolveCombatActorAction,
  castCombatSpell,
  createHumanGmAiAssistSuggestion,
  createHumanGmMessage,
  createVttMapPing,
  dashCombatAction,
  declineCombatReaction,
  dodgeCombatAction,
  forceMoveCombatParticipant,
  getCombat,
  getHumanGmAiAssistSuggestions,
  generateHumanGmAiAssistSuggestion,
  getHumanGmNodeMoveOptions,
  getPlayerScenario,
  getVttMap,
  grantHumanGmInventoryItem,
  hideCombatAction,
  listItems,
  listRuleCatalog,
  moveCombatParticipant,
  moveSessionToken,
  reportHumanGmAiAssistApplicationFailure,
  resolveEquippedWeaponAttack,
  resolveOffhandWeaponAttack,
  resolveSneakAttackCombatAction,
  runVttMapInteraction,
  startCombat,
  updateCharacterEquipment,
  updateGmVttMap,
  updateHumanGmSessionNode,
  updateVttMap,
  useSecondWindCombatAction,
  useInventoryItem,
} from '../services/api';
import type {
  LogEntry,
  Character,
  Participant,
  PersistentCharacter,
  PlayerScenarioView,
  SessionSnapshot,
  StoredUser,
} from '../types/session';
import { getPlayerTokenColor, GM_TOKEN_COLOR, NPC_TOKEN_COLOR } from '../utils/sessionTokenColors';
import type { SessionTokenColor } from '../utils/sessionTokenColors';
import './CharacterPage.css';
import './PlayPage.css';

// 플레이 화면 상단 탭 이름입니다. 각 탭은 로그/채팅/정보/설정을 구분합니다.
const sessionTabs = ['Main', 'Chat', 'Info', 'Settings'] as const;
type MessageTab = Extract<(typeof sessionTabs)[number], 'Main' | 'Chat'>;
const sessionTabLabels: Record<(typeof sessionTabs)[number], string> = {
  Main: '메인',
  Chat: '채팅',
  Info: '정보',
  Settings: '설정',
};

type PendingOptimisticTokenMove = {
  tokenId: string;
  optimisticUpdatedAt: string;
  previousMap: VttMapStateDto;
};

type PendingCombatReactionPrompt = {
  reaction: CombatReactionPromptDto;
};

function shouldLogMapMovePerf() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return window.localStorage.getItem('trpg:debug:battle-map-perf') === '1';
}

function logMapMovePerf(label: string, startedAt: number, detail = '') {
  if (!shouldLogMapMovePerf() || typeof performance === 'undefined') return;
  const suffix = detail ? ` ${detail}` : '';
  console.debug(`[battle-map] ${label}: ${(performance.now() - startedAt).toFixed(2)}ms${suffix}`);
}

function getVttMapRenderSignature(map: VttMapStateDto | null) {
  if (!map) return 'null';
  const tokenSignature = map.tokens
    .map((token) =>
      [
        token.id,
        token.x,
        token.y,
        token.size,
        token.hidden === true ? 'h' : 'v',
        token.sessionCharacterId ?? '',
      ].join(',')
    )
    .join('|');
  return [
    map.id,
    map.updatedAt,
    map.width,
    map.height,
    map.gridSize,
    tokenSignature,
    map.terrainCells?.length ?? 0,
    map.wallCells?.length ?? 0,
    map.doorCells?.length ?? 0,
    map.objectCells?.length ?? 0,
    map.lightSources?.length ?? 0,
  ].join(';');
}

function applyOptimisticTokenMove(
  map: VttMapStateDto | null,
  tokenId: string,
  to: { x: number; y: number },
  optimisticUpdatedAt: string
) {
  if (!map || !map.tokens.some((candidate) => candidate.id === tokenId)) return null;
  return {
    ...map,
    tokens: map.tokens.map((candidate) =>
      candidate.id === tokenId
        ? {
            ...candidate,
            x: to.x,
            y: to.y,
          }
        : candidate
    ),
    updatedAt: optimisticUpdatedAt,
  };
}

function getCombatReactionTypeLabel(type: CombatReactionPromptDto['type']) {
  switch (type) {
    case 'opportunity_attack':
      return '기회공격';
    case 'shield':
      return 'Shield 반응';
    case 'ready_action':
      return '준비행동';
    case 'counterspell':
      return 'Counterspell 반응';
    default:
      return '반응';
  }
}
const sessionTabDescriptions: Record<
  (typeof sessionTabs)[number],
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  Main: {
    eyebrow: 'Session log',
    title: '메인 로그',
    description: '행동 선언과 진행 상황이 시간순으로 기록됩니다.',
  },
  Chat: {
    eyebrow: 'Party chat',
    title: '파티 채팅',
    description: '파티원들과 자유롭게 메시지를 주고받을 수 있습니다.',
  },
  Info: {
    eyebrow: 'Scenario guide',
    title: '시나리오 정보와 장면 가이드',
    description: '시나리오 설명과 판정 가이드, 단서를 확인합니다.',
  },
  Settings: {
    eyebrow: 'Room settings',
    title: '세션 설정',
    description: '세션 정보를 확인하고 세션에서 나갈 수 있습니다.',
  },
};

type MainCommandPreset = {
  label: string;
  categoryLabel: string;
  category: SubmitMainCommandDto['category'];
  intent: SubmitMainCommandDto['intent'];
  screenType: SubmitMainCommandDto['screenType'];
  slashCommands?: string[];
  description?: string;
  helperGroup?: MainCommandHelperGroup;
};

type MainCommandFieldConfig = {
  targetTypes?: SubmitMainCommandDto['targetType'][];
  requiresItem?: boolean;
  requiresSpell?: boolean;
  requiresMapPoint?: boolean;
  allowsMapPoint?: boolean;
  allowsRelatedIntent?: boolean;
};

type MainCommandMode = 'GM_REQUEST' | 'RP_ACTION';

type MainCommandHelperGroup =
  | 'NPC_INTERACTION'
  | 'OBJECT_AREA_TARGET'
  | 'MAP_POINT_TARGET'
  | 'ITEM_TOOL_SELECT'
  | 'COMBAT_TARGET';

type MainCommandHelperOption = {
  id: MainCommandHelperGroup;
  label: string;
  description: string;
  fieldConfig: MainCommandFieldConfig;
  screenTypes: SubmitMainCommandDto['screenType'][];
};

type ParsedMainSlashInput =
  | {
    type: 'empty';
    query: string;
  }
  | {
    type: 'matched';
    query: string;
    preset: MainCommandPreset;
    playerText: string;
  }
  | {
    type: 'unknown';
    query: string;
    command: string;
  };

type MainCommandAutocompleteEntry =
  | {
    type: 'command';
    command: MainCommandPreset;
  }
  | {
    type: 'separator';
    id: string;
    label: string;
  };

type MainCommandCategoryOption = {
  label: string;
  category: SubmitMainCommandDto['category'];
};

type PendingMainCommandCheck = {
  requestId: string;
  message: string;
  effect: Record<string, unknown>;
};

type MainLogTone =
  | 'gm-narration'
  | 'npc-dialogue'
  | 'system-result'
  | 'player-command'
  | 'player-rp';

type MainLogPresentation = {
  tone: MainLogTone | null;
  label: string | null;
  speakerKind?: 'gm' | 'npc' | null;
  speakerName?: string | null;
  displayMessage?: string | null;
};

const MainCommandScreenTypeValues = {
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
  CREATIVE_ACTION: 'CREATIVE_ACTION' as SubmitMainCommandDto['category'],
  ENVIRONMENT: 'ENVIRONMENT' as SubmitMainCommandDto['category'],
  SPECIAL_ATTACK: 'SPECIAL_ATTACK' as SubmitMainCommandDto['category'],
  TACTIC: 'TACTIC' as SubmitMainCommandDto['category'],
  REACTION_READY: 'REACTION_READY' as SubmitMainCommandDto['category'],
  ITEM_SPELL: 'ITEM_SPELL' as SubmitMainCommandDto['category'],
} as const;

const MainCommandTargetTypeValues = {
  NPC: 'NPC' as SubmitMainCommandDto['targetType'],
  OBJECT: 'OBJECT' as SubmitMainCommandDto['targetType'],
  ACTOR: 'ACTOR' as SubmitMainCommandDto['targetType'],
  AREA: 'AREA' as SubmitMainCommandDto['targetType'],
  POINT: 'POINT' as SubmitMainCommandDto['targetType'],
  SELF: 'SELF' as SubmitMainCommandDto['targetType'],
} as const;

const MainCommandIntentValues = {
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
  USE_TOOL: 'USE_TOOL' as SubmitMainCommandDto['intent'],
  USE_ITEM_EXPLORE: 'USE_ITEM_EXPLORE' as SubmitMainCommandDto['intent'],
  SPLIT_PARTY_TASK: 'SPLIT_PARTY_TASK' as SubmitMainCommandDto['intent'],
  COMBAT_MANEUVER: 'COMBAT_MANEUVER' as SubmitMainCommandDto['intent'],
  ENVIRONMENT_USE: 'ENVIRONMENT_USE' as SubmitMainCommandDto['intent'],
  IMPROVISED_ATTACK: 'IMPROVISED_ATTACK' as SubmitMainCommandDto['intent'],
  CALLED_SHOT: 'CALLED_SHOT' as SubmitMainCommandDto['intent'],
  READY_ACTION: 'READY_ACTION' as SubmitMainCommandDto['intent'],
  REACTION_REQUEST: 'REACTION_REQUEST' as SubmitMainCommandDto['intent'],
  COMBAT_TALK: 'COMBAT_TALK' as SubmitMainCommandDto['intent'],
  USE_ITEM_COMBAT: 'USE_ITEM_COMBAT' as SubmitMainCommandDto['intent'],
  USE_SPELL_CREATIVELY: 'USE_SPELL_CREATIVELY' as SubmitMainCommandDto['intent'],
  TACTIC_QUERY: 'TACTIC_QUERY' as SubmitMainCommandDto['intent'],
  ASK_RULE: 'ASK_RULE' as SubmitMainCommandDto['intent'],
} as const;

const mainCommandFieldConfigByIntent: Partial<
  Record<SubmitMainCommandDto['intent'], MainCommandFieldConfig>
> = {
  [MainCommandIntentValues.TALK_TO_NPC]: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  [MainCommandIntentValues.SOCIAL_PERSUADE]: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  [MainCommandIntentValues.SOCIAL_INTIMIDATE]: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  [MainCommandIntentValues.SOCIAL_DECEIVE]: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  [MainCommandIntentValues.READ_EMOTION]: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  [MainCommandIntentValues.INSPECT_STORY_OBJECT]: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT],
  },
  [MainCommandIntentValues.INVESTIGATE_OBJECT]: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT, MainCommandTargetTypeValues.AREA],
    allowsMapPoint: true,
  },
  [MainCommandIntentValues.LISTEN]: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT, MainCommandTargetTypeValues.AREA],
    allowsMapPoint: true,
  },
  [MainCommandIntentValues.DETECT_DANGER]: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT, MainCommandTargetTypeValues.AREA],
    allowsMapPoint: true,
  },
  [MainCommandIntentValues.SPECIAL_MOVE]: {
    requiresMapPoint: true,
  },
  [MainCommandIntentValues.INTERACT_OBJECT]: {
    targetTypes: [MainCommandTargetTypeValues.OBJECT],
    allowsMapPoint: true,
  },
  [MainCommandIntentValues.USE_ITEM_EXPLORE]: {
    requiresItem: true,
    targetTypes: [
      MainCommandTargetTypeValues.OBJECT,
      MainCommandTargetTypeValues.AREA,
      MainCommandTargetTypeValues.NPC,
    ],
    allowsMapPoint: true,
  },
  [MainCommandIntentValues.COMBAT_TALK]: {
    targetTypes: [MainCommandTargetTypeValues.NPC],
  },
  [MainCommandIntentValues.ASK_RULE]: {
    allowsRelatedIntent: true,
  },
};

const mainCommandPresetsByScreen: Record<SubmitMainCommandDto['screenType'], MainCommandPreset[]> =
{
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

const emptyMainCommandPresets: MainCommandPreset[] = [];

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
  [MainCommandIntentValues.TALK_TO_NPC]: {
    slashCommands: ['/대화'],
    description: '선택한 NPC에게 말을 걸거나 질문합니다.',
    helperGroup: 'NPC_INTERACTION',
  },
  [MainCommandIntentValues.SOCIAL_PERSUADE]: {
    slashCommands: ['/설득'],
    description: '선택한 NPC를 논리나 호소로 설득합니다.',
    helperGroup: 'NPC_INTERACTION',
  },
  [MainCommandIntentValues.SOCIAL_INTIMIDATE]: {
    slashCommands: ['/협박'],
    description: '선택한 NPC를 위협하거나 압박합니다.',
    helperGroup: 'NPC_INTERACTION',
  },
  [MainCommandIntentValues.READ_EMOTION]: {
    slashCommands: ['/눈치'],
    description: '선택한 NPC의 태도와 감정을 살핍니다.',
    helperGroup: 'NPC_INTERACTION',
  },
  [MainCommandIntentValues.COMBAT_TALK]: {
    slashCommands: ['/말걸기'],
    description: '전투 중 대상에게 말을 걸거나 항복을 권유합니다.',
    helperGroup: 'COMBAT_TARGET',
  },
  [MainCommandIntentValues.ASK_SCENE_INFO]: {
    slashCommands: ['/정보'],
    description: '현재 장면이나 선택 대상의 공개 정보를 확인합니다.',
  },
  [MainCommandIntentValues.ASK_HINT]: {
    slashCommands: ['/힌트'],
    description: '현재 장면에서 놓친 단서나 다음 선택지를 안내받습니다.',
  },
  [MainCommandIntentValues.ASK_SUMMARY]: {
    slashCommands: ['/요약'],
    description: '지금까지의 흐름과 단서를 짧게 정리합니다.',
  },
  [MainCommandIntentValues.REQUEST_SCENE_TRANSITION]: {
    slashCommands: ['/장면진행'],
    description: '다른 장소나 다음 장면으로 진행을 요청합니다.',
  },
  [MainCommandIntentValues.TACTIC_QUERY]: {
    slashCommands: ['/전술'],
    description: '현재 전투에서 가능한 전술 선택지를 묻습니다.',
  },
  [MainCommandIntentValues.ASK_RULE]: {
    slashCommands: ['/룰'],
    description: '이 행동에 어떤 판정이나 룰이 필요한지 묻습니다.',
  },
  [MainCommandIntentValues.OBSERVE_AREA]: {
    slashCommands: [],
    description: '주변을 넓게 둘러보고 눈에 띄는 것을 찾습니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  [MainCommandIntentValues.INVESTIGATE_OBJECT]: {
    slashCommands: [],
    description: '대상이나 장소를 자세히 살펴 단서, 구조, 이상한 점을 찾습니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  [MainCommandIntentValues.INSPECT_STORY_OBJECT]: {
    slashCommands: ['/살펴보기'],
    description: '장면 속 물건을 자세히 살펴봅니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  [MainCommandIntentValues.LISTEN]: {
    slashCommands: [],
    description: '주변이나 특정 대상에서 들리는 소리를 확인합니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  [MainCommandIntentValues.DETECT_DANGER]: {
    slashCommands: [],
    description: '함정, 매복, 위험 요소가 있는지 살핍니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  [MainCommandIntentValues.SPECIAL_MOVE]: {
    slashCommands: ['/특수이동'],
    description: '도약, 등반, 균형 잡기처럼 위험한 방식으로 특정 지점까지 이동합니다.',
    helperGroup: 'MAP_POINT_TARGET',
  },
  [MainCommandIntentValues.INTERACT_OBJECT]: {
    slashCommands: [],
    description: '문, 레버, 상자, 장치처럼 조작 가능한 것을 다룹니다.',
    helperGroup: 'OBJECT_AREA_TARGET',
  },
  [MainCommandIntentValues.SPLIT_PARTY_TASK]: {
    slashCommands: [],
    description: '파티원들이 각자 맡을 일을 나눕니다.',
  },
  [MainCommandIntentValues.USE_ITEM_EXPLORE]: {
    slashCommands: ['/아이템활용'],
    description: '기름병 같은 보유 아이템을 상황에 맞게 창의적으로 활용합니다.',
    helperGroup: 'ITEM_TOOL_SELECT',
  },
};

const mainCommandHelperOptions: MainCommandHelperOption[] = [
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
    screenTypes: [
      MainCommandScreenTypeValues.EXPLORATION,
      MainCommandScreenTypeValues.COMBAT,
    ],
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
  ITEM_TOOL_SELECT: [
    MainCommandIntentValues.USE_ITEM_EXPLORE,
  ],
  COMBAT_TARGET: [MainCommandIntentValues.COMBAT_TALK],
};

function getMainCommandSlashCommands(preset: MainCommandPreset): string[] {
  return preset.slashCommands ?? mainCommandSlashMetadataByIntent[preset.intent]?.slashCommands ?? [];
}

function getMainCommandDescription(preset: MainCommandPreset): string {
  return preset.description ?? mainCommandSlashMetadataByIntent[preset.intent]?.description ?? '';
}

function getMainCommandHelperGroup(preset: MainCommandPreset): MainCommandHelperGroup | undefined {
  return preset.helperGroup ?? mainCommandSlashMetadataByIntent[preset.intent]?.helperGroup;
}

function doesMainCommandNeedHelperSelection(preset: MainCommandPreset): boolean {
  return Boolean(getMainCommandHelperGroup(preset));
}

function isMainCommandAvailableForHelperGroup(
  preset: MainCommandPreset,
  helperGroup: MainCommandHelperGroup,
): boolean {
  return mainCommandIntentOptionsByHelperGroup[helperGroup].includes(preset.intent);
}

function getMainCommandHelperGroupForSelection(
  preset: MainCommandPreset,
  preferredHelperGroup?: MainCommandHelperGroup,
): MainCommandHelperGroup | null {
  // 대상 보조를 먼저 고른 경우에는 그 대상 맥락을 유지한 채 명령어만 바꿀 수 있어야 합니다.
  if (preferredHelperGroup && isMainCommandAvailableForHelperGroup(preset, preferredHelperGroup)) {
    return preferredHelperGroup;
  }
  return getMainCommandHelperGroup(preset) ?? null;
}

function parseMainSlashInput(
  rawText: string,
  presets: MainCommandPreset[],
): ParsedMainSlashInput | null {
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

function buildGeneralGmPreset(
  screenType: SubmitMainCommandDto['screenType'],
): MainCommandPreset {
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

function doesMainCommandRequireTarget(intent: SubmitMainCommandDto['intent']): boolean {
  return (
    intent === MainCommandIntentValues.TALK_TO_NPC ||
    intent === MainCommandIntentValues.SOCIAL_PERSUADE ||
    intent === MainCommandIntentValues.SOCIAL_INTIMIDATE ||
    intent === MainCommandIntentValues.SOCIAL_DECEIVE ||
    intent === MainCommandIntentValues.READ_EMOTION ||
    intent === MainCommandIntentValues.INSPECT_STORY_OBJECT ||
    intent === MainCommandIntentValues.COMBAT_TALK
  );
}

const mainCommandCategoryIconByCategory: Record<SubmitMainCommandDto['category'], string> = {
  TALK: 'message-circle',
  SOCIAL: 'users',
  QUESTION: 'help-circle',
  INSPECTION: 'search',
  RP_ACTION: 'hand',
  SUPPORT: 'spark',
  OBSERVATION: 'eye',
  SENSE: 'ear',
  MOVEMENT: 'move',
  INTERACTION: 'hand',
  TOOL_ITEM: 'tool',
  CREATIVE_ACTION: 'spark',
  ENVIRONMENT: 'map',
  SPECIAL_ATTACK: 'crosshair',
  TACTIC: 'shield',
  REACTION_READY: 'clock',
  ITEM_SPELL: 'wand',
};

function getScreenTypeFromNodeType(
  nodeType: string | undefined
): SubmitMainCommandDto['screenType'] | null {
  if (nodeType === 'story') return MainCommandScreenTypeValues.STORY;
  if (nodeType === 'exploration') return MainCommandScreenTypeValues.EXPLORATION;
  if (nodeType === 'combat') return MainCommandScreenTypeValues.COMBAT;
  return null;
}

function getCompletedCombatNodeIds(flags: Record<string, unknown> | undefined): Set<string> {
  const value = flags?.completedCombatNodeIds;
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
}
const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 360;
const MAX_SIDEBAR_WIDTH = 620;

function getInventoryItemSearchKey(item: InventoryItemDto) {
  return [item.id, item.itemDefinitionId, item.name, item.itemType, ...(item.properties ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isShieldInventoryItem(item: InventoryItemDto) {
  const key = getInventoryItemSearchKey(item);
  return item.itemType === 'shield' || key.includes('shield') || key.includes('방패');
}

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface PlayPageProps {
  user: StoredUser;
  snapshot: SessionSnapshot | null;
  characters: PersistentCharacter[];
  races: RaceResponseDto[];
  classDefinitions: ClassDefinitionResponseDto[];
  logs: LogEntry[];
  socketConnected: boolean;
  hasOlderTurnLogs: boolean;
  isLoadingTurnLogs: boolean;
  busy: boolean;
  error: string | null;
  onCreateCharacter: (payload: CharacterPayload) => Promise<boolean>;
  onSelectCharacter: (characterId: string | null) => void;
  onSetReady: (isReady: boolean) => void;
  onSetHumanGm: (gmUserId: string) => void;
  onStartSession: () => void;
  onLeaveSession: () => void;
  onBackToLobby: () => void;
  onNavigateToCharacters: () => void;
  onMainCommand: (payload: SubmitMainCommandDto) => Promise<MainCommandResponseDto | null>;
  onResolveMainCommandCheck: (
    payload: ResolveMainCommandCheckDto,
  ) => Promise<MainCommandResponseDto | null>;
  onRequestRest: (
    restType: RestActionDto['restType'],
    characterId?: string,
    hitDiceToSpend?: number,
  ) => Promise<void> | void;
  onApproveRestRequest: (actionId: string) => Promise<boolean> | boolean;
  onRejectRestRequest: (actionId: string) => Promise<boolean> | boolean;
  onCancelRestRequest: (actionId: string) => Promise<boolean> | boolean;
  onSendAction: (rawText: string) => Promise<void> | void;
  onAction: (label: string) => void;
  onLoadOlderTurnLogs: () => void;
  onCombatActionLog: (message: string, turnLogId?: string | null) => void;
  activeDiceRoll: DiceRollOverlayData | null;
  onDismissDiceRoll: () => void;
}

interface QuickCreateFormState {
  name: string;
  ancestryKey: string;
  classKey: string;
}

type QuickCreateAbilities = NonNullable<CharacterPayload['abilities']>;

const DEFAULT_QUICK_CREATE_ANCESTRY_KEY = 'human';
const DEFAULT_QUICK_CREATE_CLASS_KEY = 'wizard';
const WIZARD_STARTING_SPELLBOOK_SPELL_COUNT = 6;
const WIZARD_SPELLBOOK_SPELLS_PER_LEVEL = 2;
const HIT_DIE_AVERAGE_BY_KEY: Readonly<Record<string, number>> = {
  d6: 4,
  d8: 5,
  d10: 6,
  d12: 7,
};
const QUICK_CREATE_POINT_BUY_BY_CLASS_KEY: Readonly<
  Record<string, QuickCreateAbilities>
> = {
  barbarian: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  bard: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
  cleric: { str: 10, dex: 13, con: 14, int: 8, wis: 15, cha: 10 },
  druid: { str: 8, dex: 14, con: 13, int: 10, wis: 15, cha: 10 },
  fighter: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  monk: { str: 10, dex: 15, con: 13, int: 8, wis: 14, cha: 10 },
  paladin: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 },
  ranger: { str: 10, dex: 15, con: 13, int: 10, wis: 14, cha: 10 },
  rogue: { str: 10, dex: 15, con: 13, int: 12, wis: 14, cha: 8 },
  sorcerer: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
  warlock: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
  wizard: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
};
const QUICK_CREATE_STANDARD_ASI_LEVELS = [4, 8, 12, 16, 19] as const;
const QUICK_CREATE_CLASS_ASI_LEVELS: Readonly<Record<string, readonly number[]>> = {
  fighter: [6, 14],
  rogue: [10],
};
const QUICK_CREATE_ASI_PRIORITY_BY_CLASS_KEY: Readonly<
  Record<string, ReadonlyArray<keyof QuickCreateAbilities>>
> = {
  barbarian: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  bard: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
  cleric: ['wis', 'con', 'str', 'dex', 'cha', 'int'],
  druid: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
  fighter: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  monk: ['dex', 'wis', 'con', 'str', 'cha', 'int'],
  paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
  ranger: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  rogue: ['dex', 'con', 'int', 'wis', 'cha', 'str'],
  sorcerer: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  warlock: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  wizard: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
};
const QUICK_CREATE_CLASS_PRESET_BY_KEY = new Map<string, string>([
  ['barbarian', 'preset_warrior'],
  ['bard', 'preset_wizard'],
  ['cleric', 'preset_warrior'],
  ['druid', 'preset_archer'],
  ['fighter', 'preset_warrior'],
  ['monk', 'preset_rogue'],
  ['paladin', 'preset_warrior'],
  ['ranger', 'preset_archer'],
  ['rogue', 'preset_rogue'],
  ['sorcerer', 'preset_wizard'],
  ['warlock', 'preset_wizard'],
  ['wizard', 'preset_wizard'],
]);
const QUICK_CREATE_SUBCLASS_BY_CLASS_KEY: Readonly<
  Record<string, { choiceLevel: number; subclassName: string }>
> = {
  barbarian: { choiceLevel: 3, subclassName: 'berserker' },
  bard: { choiceLevel: 3, subclassName: 'lore' },
  cleric: { choiceLevel: 1, subclassName: 'life' },
  druid: { choiceLevel: 2, subclassName: 'land' },
  fighter: { choiceLevel: 3, subclassName: 'champion' },
  monk: { choiceLevel: 3, subclassName: 'open_hand' },
  paladin: { choiceLevel: 3, subclassName: 'devotion' },
  ranger: { choiceLevel: 3, subclassName: 'hunter' },
  rogue: { choiceLevel: 3, subclassName: 'thief' },
  sorcerer: { choiceLevel: 1, subclassName: 'draconic_bloodline' },
  warlock: { choiceLevel: 1, subclassName: 'fiend' },
  wizard: { choiceLevel: 2, subclassName: 'evocation' },
};
const QUICK_CREATE_CLASS_COMBAT_DEFAULTS: Readonly<
  Record<string, { armorClass: number; speed: number }>
> = {
  fighter: { armorClass: 18, speed: 28 },
  ranger: { armorClass: 16, speed: 32 },
  rogue: { armorClass: 14, speed: 36 },
  wizard: { armorClass: 12, speed: 30 },
};
const QUICK_CREATE_MVP_CANTRIPS = [
  'spell.chill_touch',
  'spell.fire_bolt',
  'spell.light',
  'spell.ray_of_frost',
];
const QUICK_CREATE_MVP_LEVEL1_SPELLS = [
  'spell.magic_missile',
  'spell.burning_hands',
  'spell.cure_wounds',
  'spell.shield',
  'spell.sleep',
];
const QUICK_CREATE_MVP_LEVEL5_SLOT_SPELLS_BY_CLASS: Readonly<Record<string, string[]>> = {
  sorcerer: ['spell.fireball'],
  wizard: ['spell.fireball'],
};
const QUICK_CREATE_P3_LEVEL7_SLOT_SPELLS_BY_CLASS: Readonly<Record<string, string[]>> = {
  bard: ['spell.dimension_door'],
  cleric: ['spell.death_ward'],
  druid: ['spell.blight'],
  sorcerer: ['spell.blight', 'spell.dimension_door'],
  warlock: ['spell.blight', 'spell.dimension_door'],
  wizard: ['spell.dimension_door', 'spell.ice_storm'],
};

function getQuickCreateCatalogSpellLevel(entry: RuleCatalogReferenceDto): number | null {
  if (typeof entry.spellLevel === 'number') return entry.spellLevel;
  const tag = entry.runtimeTags?.find((item) => item.startsWith('spell_level:'));
  if (!tag) return null;
  const level = Number(tag.slice('spell_level:'.length));
  return Number.isInteger(level) && level >= 0 ? level : null;
}

function getQuickCreateMaximumSlotSpellLevel(classKey: string, level: number) {
  const normalizedClassKey = classKey.trim().toLowerCase();
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  if (['bard', 'cleric', 'druid', 'sorcerer', 'wizard'].includes(normalizedClassKey)) {
    if (normalizedLevel >= 17) return 9;
    if (normalizedLevel >= 15) return 8;
    if (normalizedLevel >= 13) return 7;
    if (normalizedLevel >= 11) return 6;
    if (normalizedLevel >= 9) return 5;
    if (normalizedLevel >= 7) return 4;
    if (normalizedLevel >= 5) return 3;
    if (normalizedLevel >= 3) return 2;
    return 1;
  }
  if (normalizedClassKey === 'warlock') {
    if (normalizedLevel >= 17) return 9;
    if (normalizedLevel >= 15) return 8;
    if (normalizedLevel >= 13) return 7;
    if (normalizedLevel >= 11) return 6;
    if (normalizedLevel >= 9) return 5;
    if (normalizedLevel >= 7) return 4;
    if (normalizedLevel >= 5) return 3;
    if (normalizedLevel >= 3) return 2;
    return 1;
  }
  if (normalizedClassKey === 'paladin' || normalizedClassKey === 'ranger') {
    if (normalizedLevel >= 17) return 5;
    if (normalizedLevel >= 13) return 4;
    if (normalizedLevel >= 9) return 3;
    if (normalizedLevel >= 5) return 2;
    if (normalizedLevel >= 2) return 1;
  }
  return 0;
}

function getQuickCreateCatalogSpellIds(
  ruleCatalog: RuleCatalogReferenceDto[],
  kind: 'cantrip' | 'slot',
  maxSpellLevel: number,
) {
  if (!ruleCatalog.length) return [];
  const normalizedMaxSpellLevel = Math.max(0, Math.min(9, Math.floor(maxSpellLevel)));
  return ruleCatalog
    .filter((entry) => entry.kind === 'spell_definitions' && entry.executable)
    .map((entry) => ({ id: entry.id, level: getQuickCreateCatalogSpellLevel(entry) }))
    .filter((spell) =>
      kind === 'cantrip'
        ? spell.level === 0
        : typeof spell.level === 'number' &&
          spell.level >= 1 &&
          spell.level <= normalizedMaxSpellLevel
    )
    .sort((left, right) => {
      const leftLevel = left.level ?? 99;
      const rightLevel = right.level ?? 99;
      if (leftLevel !== rightLevel) return leftLevel - rightLevel;
      return left.id.localeCompare(right.id);
    })
    .map((spell) => spell.id);
}

function getQuickCreateFallbackSlotSpellIds(classKey: string, level: number) {
  if (getQuickCreateMaximumSlotSpellLevel(classKey, level) <= 0) {
    return [];
  }
  const level5Spells = level >= 5
    ? (QUICK_CREATE_MVP_LEVEL5_SLOT_SPELLS_BY_CLASS[classKey] ?? [])
    : [];
  const level7Spells = level >= 7
    ? (QUICK_CREATE_P3_LEVEL7_SLOT_SPELLS_BY_CLASS[classKey] ?? [])
    : [];
  return Array.from(
    new Set([
      ...level7Spells,
      ...level5Spells,
      ...QUICK_CREATE_MVP_LEVEL1_SPELLS,
    ]),
  );
}

function getQuickCreateWizardSpellbookCount(level: number) {
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  return WIZARD_STARTING_SPELLBOOK_SPELL_COUNT +
    (normalizedLevel - 1) * WIZARD_SPELLBOOK_SPELLS_PER_LEVEL;
}

function getQuickCreateAbilityModifier(score: number | null | undefined) {
  return Math.floor(((score ?? 10) - 10) / 2);
}

function getQuickCreatePreparedSpellAbilityKey(classKey: string | null | undefined) {
  const normalized = (classKey ?? '').trim().toLowerCase();
  if (normalized === 'wizard') return 'int' as const;
  if (normalized === 'cleric' || normalized === 'druid') return 'wis' as const;
  if (normalized === 'paladin') return 'cha' as const;
  return null;
}

function getQuickCreatePreparedSpellLimit(
  classKey: string | null | undefined,
  level: number,
  abilities: QuickCreateAbilities,
) {
  const abilityKey = getQuickCreatePreparedSpellAbilityKey(classKey);
  if (!abilityKey) return null;
  const normalizedClassKey = (classKey ?? '').trim().toLowerCase();
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  const levelBase = normalizedClassKey === 'paladin' ? Math.floor(normalizedLevel / 2) : normalizedLevel;
  return Math.max(1, levelBase + getQuickCreateAbilityModifier(abilities[abilityKey]));
}

function usesQuickCreateDynamicPreparedSpellPool(
  classKey: string,
  progression: NonNullable<ClassDefinitionResponseDto['spellcastingProgression']>[number] | null,
  slotSpellPool: string[],
) {
  const normalizedClassKey = classKey.trim().toLowerCase();
  return (
    ['cleric', 'druid', 'paladin'].includes(normalizedClassKey) &&
    Boolean(progression) &&
    slotSpellPool.length > 0
  );
}

// 캐릭터 생성 모달을 처음 열 때 쓰는 기본 입력값입니다.
const defaultCharacter: QuickCreateFormState = {
  name: '',
  ancestryKey: DEFAULT_QUICK_CREATE_ANCESTRY_KEY,
  classKey: DEFAULT_QUICK_CREATE_CLASS_KEY,
};

function createDefaultQuickCreateForm(
  races: RaceResponseDto[],
  classDefinitions: ClassDefinitionResponseDto[],
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

function toStoredClassName(classKey: string): string {
  const trimmed = classKey.trim();
  if (!trimmed) return 'Wizard';
  return trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function getDefaultStartingEquipmentItemSelections(
  klass: ClassDefinitionResponseDto,
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

function getDefaultQuickCreateStartingSpells(
  klass: ClassDefinitionResponseDto,
  level: number,
  abilities: QuickCreateAbilities,
  ruleCatalog: RuleCatalogReferenceDto[],
) {
  const classKey = klass.key.trim().toLowerCase();
  const progression =
    klass.spellcastingProgression?.find((entry) => entry.classLevel === level) ?? null;
  const maxSlotSpellLevel = getQuickCreateMaximumSlotSpellLevel(classKey, level);
  const catalogCantrips = getQuickCreateCatalogSpellIds(ruleCatalog, 'cantrip', 0);
  const catalogSlotSpells = getQuickCreateCatalogSpellIds(ruleCatalog, 'slot', maxSlotSpellLevel);
  const cantripPool = catalogCantrips.length ? catalogCantrips : QUICK_CREATE_MVP_CANTRIPS;
  const slotSpellPool = catalogSlotSpells.length
    ? catalogSlotSpells
    : getQuickCreateFallbackSlotSpellIds(classKey, level);
  const preparedSpellLimit = maxSlotSpellLevel > 0
    ? getQuickCreatePreparedSpellLimit(classKey, level, abilities)
    : null;
  const usesDynamicPreparedPool = usesQuickCreateDynamicPreparedSpellPool(
    classKey,
    progression,
    slotSpellPool,
  );
  const cantripCount = Math.min(
    progression?.cantripsKnown ?? klass.startingCantripCount,
    classKey === 'paladin' || classKey === 'ranger' ? 0 : cantripPool.length,
  );
  const requiredKnownSpellCount = usesDynamicPreparedPool
    ? 0
    : (progression?.spellsKnown ??
        (classKey === 'wizard'
          ? getQuickCreateWizardSpellbookCount(level)
          : klass.startingSpellCount));
  const slotSpellCount = Math.min(requiredKnownSpellCount, slotSpellPool.length);
  const preparedSpellCount = preparedSpellLimit === null
    ? 0
    : Math.min(preparedSpellLimit, slotSpellPool.length);

  if (
    cantripCount <= 0 &&
    slotSpellCount <= 0 &&
    preparedSpellCount <= 0 &&
    !usesDynamicPreparedPool
  ) {
    return undefined;
  }

  const selectedSlotSpells = usesDynamicPreparedPool
    ? []
    : slotSpellPool.slice(0, slotSpellCount);
  const preparedSpellPool = usesDynamicPreparedPool ? slotSpellPool : selectedSlotSpells;
  const selectedPreparedSpells = preparedSpellLimit !== null
    ? preparedSpellPool.slice(0, preparedSpellCount)
    : undefined;

  if (preparedSpellLimit !== null && selectedPreparedSpells?.length !== preparedSpellLimit) {
    return undefined;
  }

  return {
    cantrips: cantripPool.slice(0, cantripCount),
    spells: selectedSlotSpells,
    ...(selectedPreparedSpells ? { preparedSpells: selectedPreparedSpells } : {}),
  };
}

function getQuickCreatePointBuyBase(classKey: string): QuickCreateAbilities {
  return (
    QUICK_CREATE_POINT_BUY_BY_CLASS_KEY[classKey] ?? {
      str: 10,
      dex: 14,
      con: 13,
      int: 10,
      wis: 12,
      cha: 15,
    }
  );
}

function applyRaceBonuses(
  base: QuickCreateAbilities,
  race: RaceResponseDto | null,
): QuickCreateAbilities {
  const increases = race?.abilityIncreases;
  return {
    str: base.str + (increases?.str ?? 0),
    dex: base.dex + (increases?.dex ?? 0),
    con: base.con + (increases?.con ?? 0),
    int: base.int + (increases?.int ?? 0),
    wis: base.wis + (increases?.wis ?? 0),
    cha: base.cha + (increases?.cha ?? 0),
  };
}

function getQuickCreateAsiLevels(classKey: string, level: number): number[] {
  const normalizedClassKey = classKey.trim().toLowerCase();
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  return Array.from(
    new Set([
      ...QUICK_CREATE_STANDARD_ASI_LEVELS,
      ...(QUICK_CREATE_CLASS_ASI_LEVELS[normalizedClassKey] ?? []),
    ]),
  )
    .filter((asiLevel) => asiLevel <= normalizedLevel)
    .sort((left, right) => left - right);
}

function buildQuickCreateAsiChoices(
  classKey: string,
  level: number,
  abilities: QuickCreateAbilities,
): Array<keyof QuickCreateAbilities> {
  const priority =
    QUICK_CREATE_ASI_PRIORITY_BY_CLASS_KEY[classKey.trim().toLowerCase()] ??
    QUICK_CREATE_ASI_PRIORITY_BY_CLASS_KEY.wizard;
  const working = { ...abilities };
  const selected = new Set<keyof QuickCreateAbilities>();
  const choices: Array<keyof QuickCreateAbilities> = [];
  for (const _asiLevel of getQuickCreateAsiLevels(classKey, level)) {
    const selectedAbility =
      priority.find((ability) => !selected.has(ability) && working[ability] <= 18) ??
      priority.find((ability) => !selected.has(ability));
    if (!selectedAbility) break;
    selected.add(selectedAbility);
    working[selectedAbility] += 2;
    choices.push(selectedAbility);
  }
  return choices;
}

function applyQuickCreateAsiChoices(
  abilities: QuickCreateAbilities,
  asiChoices: Array<keyof QuickCreateAbilities>,
): QuickCreateAbilities {
  const next = { ...abilities };
  for (const ability of asiChoices) {
    next[ability] += 2;
  }
  return next;
}

function getDefaultQuickCreateFeatureSelections(params: {
  classKey: string;
  raceKey: string | null | undefined;
  level: number;
  proficientSkills: string[];
  asiChoices: Array<keyof QuickCreateAbilities>;
}): string[] {
  const classKey = params.classKey.trim().toLowerCase();
  const features: string[] = [];

  if ((params.raceKey ?? '').trim().toLowerCase() === 'dragonborn') {
    features.push('draconic_ancestry:red');
  }

  if (classKey === 'fighter') {
    features.push('fighting_style:defense');
  } else if (classKey === 'paladin' && params.level >= 2) {
    features.push('fighting_style:defense');
  } else if (classKey === 'ranger') {
    features.push('favored_enemy:beasts');
    if (params.level >= 2) {
      features.push('fighting_style:archery');
    }
  } else if (classKey === 'rogue') {
    const expertiseTargets = [
      ...params.proficientSkills.slice(0, 2),
      "thieves_tools",
    ].slice(0, 2);
    features.push(...expertiseTargets.map((target) => `expertise:${target}`));
  }

  features.push(...params.asiChoices.map((ability) => `asi:${ability}`));
  const requiredAsiOrFeatChoiceCount = getQuickCreateAsiLevels(params.classKey, params.level).length;
  if (features.filter((feature) => feature.startsWith('asi:')).length < requiredAsiOrFeatChoiceCount) {
    features.push('feat.alert');
  }

  return features;
}

function getProficiencyBonusForLevel(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

function getExpectedMaxHp(
  hitDie: string | undefined,
  level: number,
  constitution: number,
): number {
  const normalizedHitDie = hitDie?.toLowerCase() ?? 'd6';
  const hitDieMax = Number(normalizedHitDie.replace('d', '')) || 6;
  const hitDieAverage = HIT_DIE_AVERAGE_BY_KEY[normalizedHitDie] ?? Math.ceil(hitDieMax / 2);
  const constitutionModifier = Math.floor((constitution - 10) / 2);

  return hitDieMax + constitutionModifier + (level - 1) * (hitDieAverage + constitutionModifier);
}

function getQuickCreateArmorClass(classKey: string, abilities: QuickCreateAbilities): number {
  const dexterityModifier = Math.floor((abilities.dex - 10) / 2);
  switch (classKey) {
    case 'fighter':
    case 'paladin':
      return 18;
    case 'cleric':
      return 14 + Math.min(dexterityModifier, 2) + 2;
    case 'ranger':
      return 14 + Math.min(dexterityModifier, 2);
    case 'rogue':
    case 'bard':
    case 'warlock':
      return 11 + dexterityModifier;
    case 'druid':
      return 11 + dexterityModifier + 2;
    case 'barbarian':
      return 10 + dexterityModifier + Math.floor((abilities.con - 10) / 2);
    case 'monk':
      return 10 + dexterityModifier + Math.floor((abilities.wis - 10) / 2);
    case 'wizard':
    case 'sorcerer':
      return 10 + dexterityModifier;
    default:
      return Math.max(10, 10 + dexterityModifier);
  }
}

function getQuickCreateSpeed(classKey: string, race: RaceResponseDto | null): number {
  return QUICK_CREATE_CLASS_COMBAT_DEFAULTS[classKey]?.speed ?? race?.baseSpeed ?? 30;
}

// 로그 메시지 앞의 [MAIN]/[CHAT] 스코프 태그를 화면 표시용으로 제거합니다.
function stripScopePrefix(message: string) {
  return message.replace(/^\[(MAIN|CHAT)\]/, '').trim();
}

function isChatScoped(message: string) {
  return message.startsWith('[CHAT]');
}

function getMessageLogTab(log: LogEntry): MessageTab | null {
  if (log.kind !== 'action') return null;
  return isChatScoped(log.message) ? 'Chat' : 'Main';
}

function formatUnreadCount(count: number) {
  return count > 99 ? '99+' : `${count}`;
}

function getAvatarLabel(title: string, userName: string) {
  const trimmed = title.trim();
  if (!trimmed) return '?';
  if (trimmed === userName) return userName.slice(0, 1).toUpperCase();
  return trimmed.slice(0, 1).toUpperCase();
}

function buildProfileColorStyle(color: SessionTokenColor): CSSProperties {
  // 프로필 카드와 채팅 아바타가 같은 색 체계를 쓰도록 CSS 변수만 넘깁니다.
  return {
    ['--participant-frame-color' as string]: color.frame,
    ['--participant-bg-color' as string]: color.background,
    ['--participant-text-color' as string]: color.text,
    ['--chat-avatar-frame-color' as string]: color.frame,
    ['--chat-avatar-bg-color' as string]: color.background,
    ['--chat-avatar-text-color' as string]: color.text,
    ['--chat-message-frame-color' as string]: color.frame,
    ['--chat-message-bg-color' as string]: color.background,
    ['--chat-message-text-color' as string]: color.text,
  } as CSSProperties;
}

function buildStoryPartyColorStyle(color: SessionTokenColor): CSSProperties {
  // 하단 파티 카드도 메인/채팅 프로필과 같은 색 출처를 쓰도록 별도 CSS 변수에 복사합니다.
  return {
    ...buildProfileColorStyle(color),
    ['--story-party-frame-color' as string]: color.frame,
    ['--story-party-bg-color' as string]: color.background,
    ['--story-party-text-color' as string]: color.text,
  } as CSSProperties;
}

function buildMapPartyColorStyle(color: SessionTokenColor): CSSProperties {
  // 탐험 맵에 원래 있던 파티 오버레이도 캐릭터 토큰 색상 기준을 쓰도록 전용 CSS 변수에 복사합니다.
  return {
    ...buildProfileColorStyle(color),
    ['--map-party-frame-color' as string]: color.frame,
    ['--map-party-bg-color' as string]: color.background,
    ['--map-party-text-color' as string]: color.text,
  } as CSSProperties;
}

function isSessionLogTitle(title: string) {
  const normalizedTitle = title.trim().toLowerCase();
  return normalizedTitle === '세션 로그' || normalizedTitle === 'session log';
}

function getLogSenderLabel(
  title: string,
  rowClass: 'incoming' | 'outgoing' | 'notice',
  presentation?: MainLogPresentation | null
) {
  if (presentation?.speakerKind === 'npc') return presentation.speakerName?.trim() || 'NPC';
  if (
    rowClass === 'notice' ||
    presentation?.speakerKind === 'gm' ||
    presentation?.tone === 'gm-narration' ||
    presentation?.tone === 'system-result' ||
    isSessionLogTitle(title)
  ) {
    return 'GM';
  }
  return title || '알 수 없음';
}

function isSessionLogProfile(title: string, logTone?: string | null) {
  return (
    isSessionLogTitle(title) ||
    logTone === 'gm-narration' ||
    logTone === 'system-result'
  );
}

function parseNpcDialogueMessage(message: string) {
  const lines = message.trim().split(/\r?\n/);
  const firstLine = lines[0] ?? '';
  const match = firstLine.match(/^([^\s:：][^:：\n]{0,32})[:：]\s*(.+)$/);

  if (!match) return null;
  if (
    /^(TurnLog|rawInput|outcome|narration|diceResult|stateDiff|structuredAction)$/i.test(
      match[1].trim()
    )
  ) {
    return null;
  }

  return {
    speakerName: match[1].trim(),
    displayMessage: [match[2].trim(), ...lines.slice(1)].join('\n').trim(),
  };
}

function normalizeNpcSpeakerKey(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSimilarNpcSpeakerName(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeNpcSpeakerKey(left);
  const normalizedRight = normalizeNpcSpeakerKey(right);

  if (!normalizedLeft || !normalizedRight) return false;
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function isNpcDialogueMainCommandLog(log: LogEntry) {
  const mainCommand = log.metadata?.mainCommand;
  if (mainCommand?.npcDialogue) return true;
  if (!mainCommand?.targetId) return false;

  return (
    mainCommand.intent === MainCommandIntentValues.TALK_TO_NPC ||
    mainCommand.intent === MainCommandIntentValues.COMBAT_TALK
  );
}

function isCombatResultLogMessage(message: string) {
  return (
    /공격\s+(명중|빗나감)/.test(message) ||
    /\bvs\s+AC\s+\d+/i.test(message) ||
    /에게\s+\d+\s*피해/.test(message)
  );
}

function getMainLogPresentation(
  log: LogEntry,
  message: string,
  npcSpeakerName?: string | null
): MainLogPresentation {
  if (isChatScoped(log.message)) {
    return { tone: null, label: null };
  }

  if (log.id.startsWith('turn-log:') && log.id.endsWith(':raw')) {
    return { tone: 'player-command', label: 'GM 요청' };
  }

  if (log.id.startsWith('turn-log:') && log.id.endsWith(':rp-raw')) {
    return { tone: 'player-rp', label: 'RP 행동' };
  }

  if (log.id.startsWith('main-command:') && log.id.endsWith(':raw')) {
    return { tone: 'player-command', label: 'GM 요청' };
  }

  if (log.id.startsWith('main-command:') && log.id.endsWith(':rp-raw')) {
    return { tone: 'player-rp', label: 'RP 행동' };
  }

  if (log.id.startsWith('player-action:') && log.id.endsWith(':raw')) {
    return { tone: 'player-rp', label: 'RP 대사' };
  }

  if (
    log.kind === 'action' &&
    log.message.startsWith('[MAIN]') &&
    !log.id.startsWith('turn-log:')
  ) {
    if (isSessionLogTitle(log.title)) {
      return { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' };
    }

    return { tone: 'player-rp', label: 'RP 대사' };
  }

  if (log.id.startsWith('system-message:') || log.id.endsWith(':pending')) {
    return { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' };
  }

  if (log.id.startsWith('turn-log:')) {
    const compact = message.trim();
    if (isCombatResultLogMessage(compact)) {
      return { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' };
    }

    if (isNpcDialogueMainCommandLog(log)) {
      const dialogueBody = compact.replace(/^\[MAIN\]/, '').trim();
      const npcDialogue = parseNpcDialogueMessage(dialogueBody);

      return {
        tone: 'npc-dialogue',
        label: null,
        speakerKind: 'npc',
        speakerName: npcDialogue?.speakerName ?? npcSpeakerName ?? 'NPC',
        displayMessage: npcDialogue?.displayMessage ?? dialogueBody,
      };
    }

    if (compact.startsWith('[MAIN]')) {
      const looksLikeSystemMainResult =
        compact.includes('판정') ||
        compact.includes('주사위') ||
        compact.includes('실패') ||
        compact.includes('성공') ||
        isCombatResultLogMessage(compact);
      return looksLikeSystemMainResult
        ? { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' }
        : { tone: 'gm-narration', label: null, speakerKind: 'gm' };
    }
    const looksLikeSystemResult =
      compact.includes('TurnLog') ||
      compact.includes('diceResult') ||
      compact.includes('stateDiff') ||
      compact.includes('outcome:') ||
      compact.includes('RP 행동을 기록했습니다.') ||
      compact.includes('판정') ||
      compact.includes('주사위') ||
      compact.includes('실패') ||
      compact.includes('성공');

    if (looksLikeSystemResult) {
      return { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' };
    }

    return { tone: 'gm-narration', label: null, speakerKind: 'gm' };
  }

  return { tone: null, label: null };
}

function getLogDate(createdAt: string): Date {
  const date = new Date(createdAt);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getLogDateKey(createdAt: string): string {
  const date = getLogDate(createdAt);

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getLogDateLabel(createdAt: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(getLogDate(createdAt));
}

function getConnectionLabel(connected: boolean) {
  return connected ? 'Connected' : 'Offline';
}

function getNodeLabel(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.label === 'string') return candidate.label;
  if (typeof candidate.id === 'string') return candidate.id;
  if (typeof candidate.skill === 'string') return candidate.skill;
  return null;
}

function getAbilitySummary(character: PersistentCharacter) {
  return [
    { label: '근력', value: character.abilities.str },
    { label: '민첩', value: character.abilities.dex },
    { label: '건강', value: character.abilities.con },
    { label: '지능', value: character.abilities.int },
    { label: '지혜', value: character.abilities.wis },
    { label: '매력', value: character.abilities.cha },
  ];
}

function getMainCommandCheckEffect(response: MainCommandResponseDto | null | undefined) {
  const data = response?.data;
  if (!data || typeof data !== 'object') return null;
  const effect = (data as Record<string, unknown>).checkEffect;
  return effect && typeof effect === 'object' ? (effect as Record<string, unknown>) : null;
}

function isMissingCombatError(message: string) {
  return (
    message.includes('COMBAT_404') ||
    message.includes('ACTIVE_COMBAT_NOT_FOUND') ||
    message.includes('전투가 존재하지 않습니다') ||
    message.includes('(404)')
  );
}

function logCombatRequestSucceeded(sessionId: string, combat: CombatResponseDto) {
  const currentParticipant =
    combat.participants.find((participant) => participant.sessionEntityId === combat.currentEntityId) ?? null;
  console.info('[COMBAT_REQUEST_SUCCEEDED]', {
    sessionId,
    combatId: combat.combatId,
    status: combat.status,
    roundNo: combat.roundNo,
    turnNo: combat.turnNo,
    currentEntityId: combat.currentEntityId,
    currentParticipant: currentParticipant
      ? {
        id: currentParticipant.sessionEntityId,
        name: currentParticipant.name,
        type: currentParticipant.entityType,
        isHostile: currentParticipant.isHostile,
        isAlive: currentParticipant.isAlive,
      }
      : null,
    participants: combat.participants.map((participant) => ({
      id: participant.sessionEntityId,
      name: participant.name,
      type: participant.entityType,
      isHostile: participant.isHostile,
      isAlive: participant.isAlive,
      turnOrder: participant.turnOrder,
      initiative: participant.initiative,
    })),
  });
}

function isCombatResponseDto(value: unknown): value is CombatResponseDto {
  if (!value || typeof value !== 'object') return false;
  return (
    'combatId' in value &&
    'participants' in value &&
    Array.isArray((value as { participants?: unknown }).participants)
  );
}

function isCombatActionResultDto(value: unknown): value is CombatActionResultDto {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'combat' in value &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

function isCombatReactionPromptDto(value: unknown): value is CombatReactionPromptDto {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    ['opportunity_attack', 'shield', 'ready_action', 'counterspell'].includes(
      String((value as { type?: unknown }).type)
    ) &&
    typeof (value as { reactorParticipantId?: unknown }).reactorParticipantId === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

function getCombatReactionPrompts(result: {
  pendingReaction?: CombatReactionPromptDto | null;
  pendingReactions?: CombatReactionPromptDto[] | null;
}): CombatReactionPromptDto[] {
  const prompts = [
    ...(Array.isArray(result.pendingReactions) ? result.pendingReactions : []),
    result.pendingReaction,
  ].filter(isCombatReactionPromptDto);
  const seen = new Set<string>();
  return prompts.filter((prompt) => {
    if (seen.has(prompt.id)) return false;
    seen.add(prompt.id);
    return true;
  });
}

function formatCombatMoveResultMessage(result: CombatMoveResultDto): string {
  const baseMessage = result.message?.trim() || '전투 이동을 처리했습니다.';
  const movementDistanceFt =
    typeof result.movementDistanceFt === 'number' ? result.movementDistanceFt : null;
  const movementCostFt = typeof result.movementCostFt === 'number' ? result.movementCostFt : null;

  if (
    movementDistanceFt !== null &&
    movementCostFt !== null &&
    movementCostFt !== movementDistanceFt &&
    !/소모\s*\d+\s*ft/i.test(baseMessage)
  ) {
    return `${baseMessage} / 이동 소모 ${movementCostFt}ft`;
  }

  return baseMessage;
}

function formatCombatActionResultMessage(result: CombatActionResultDto): string {
  const baseMessage = result.message?.trim() || '전투 행동을 처리했습니다.';
  const details: string[] = [];

  if (
    typeof result.attackTotal === 'number' &&
    !/(명중|공격|attack)\s*(굴림|총합|total)?\s*\d+/i.test(baseMessage)
  ) {
    details.push(`명중 ${result.attackTotal}`);
  }

  if (
    typeof result.damageTotal === 'number' &&
    result.damageTotal > 0 &&
    !/(피해|damage)\s*\d+/i.test(baseMessage)
  ) {
    details.push(`피해 ${result.damageTotal}`);
  }

  return details.length ? `${baseMessage} / ${details.join(' / ')}` : baseMessage;
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function PlayPage({
  user,
  snapshot,
  characters,
  races,
  classDefinitions,
  logs,
  socketConnected,
  hasOlderTurnLogs,
  isLoadingTurnLogs,
  busy,
  error,
  onCreateCharacter,
  onSelectCharacter,
  onSetReady,
  onSetHumanGm,
  onStartSession,
  onLeaveSession,
  onBackToLobby,
  onNavigateToCharacters,
  onMainCommand,
  onResolveMainCommandCheck,
  onRequestRest,
  onApproveRestRequest,
  onRejectRestRequest,
  onCancelRestRequest,
  onSendAction,
  onAction,
  onLoadOlderTurnLogs,
  onCombatActionLog,
  activeDiceRoll,
  onDismissDiceRoll,
}: PlayPageProps) {
  // UI 상태: 현재 탭, 모달 열림, 입력창 값, 로컬 캐릭터 선택값입니다.
  const [activeTab, setActiveTab] = useState<(typeof sessionTabs)[number]>('Main');
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  // 브라우저 기본 confirm 대신, 세션 준비 오버레이와 같은 디자인의 확인창을 보여준다.
  const [isLeaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [mainMessage, setMainMessage] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [infoText, setInfoText] = useState('');
  const [mainCommandMode, setMainCommandMode] = useState<MainCommandMode>('GM_REQUEST');
  const [isCommandGuideOpen, setCommandGuideOpen] = useState(false);
  const [activeMainHelperGroup, setActiveMainHelperGroup] =
    useState<MainCommandHelperGroup | null>(null);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string | null>(null);
  const [openMainCommandCategory, setOpenMainCommandCategory] = useState<string | null>(null);
  const [selectedMainIntent, setSelectedMainIntent] = useState<
    SubmitMainCommandDto['intent'] | null
  >(null);
  const [selectedMainTargetId, setSelectedMainTargetId] = useState('');
  const [selectedMainItemId, setSelectedMainItemId] = useState('');
  const [selectedMainSpellId, setSelectedMainSpellId] = useState('');
  const [selectedMainRelatedIntent, setSelectedMainRelatedIntent] = useState('');
  const [mainPointX, setMainPointX] = useState('');
  const [mainPointY, setMainPointY] = useState('');
  const [selectedExplorationMapSelection, setSelectedExplorationMapSelection] =
    useState<BattleMapSelection | null>(null);
  const [mainCommandError, setMainCommandError] = useState<string | null>(null);
  const [pendingMainCommandDraft, setPendingMainCommandDraft] =
    useState<ExplorationMainCommandRequest | null>(null);
  const [pendingMainCommandCheck, setPendingMainCommandCheck] =
    useState<PendingMainCommandCheck | null>(null);
  const [mainCommandAutocompleteIndex, setMainCommandAutocompleteIndex] = useState(-1);
  const [hasUnreadInfo, setHasUnreadInfo] = useState(false);
  const [unreadMessageCounts, setUnreadMessageCounts] = useState<Record<MessageTab, number>>({
    Main: 0,
    Chat: 0,
  });
  const [revealedClueToast, setRevealedClueToast] = useState<PlayerScenarioClueDto | null>(null);
  const [resolvedRestRequestIds, setResolvedRestRequestIds] = useState<Set<string>>(
    () => new Set(),
  );

  function clearMainCommandSelectionFields() {
    setSelectedMainTargetId('');
    setSelectedMainItemId('');
    setSelectedMainSpellId('');
    setSelectedMainRelatedIntent('');
    setMainPointX('');
    setMainPointY('');
    setSelectedExplorationMapSelection(null);
  }

  function requestLeaveSession() {
    setLeaveConfirmOpen(true);
  }

  function cancelLeaveSession() {
    setLeaveConfirmOpen(false);
  }

  function confirmLeaveSession() {
    setLeaveConfirmOpen(false);
    onLeaveSession();
  }

  const requestCombatReactionDecision = useCallback((reaction: CombatReactionPromptDto) => {
    if (pendingCombatReactionDecisionRef.current?.id === reaction.id) {
      return pendingCombatReactionDecisionRef.current.promise;
    }
    pendingCombatReactionResolverRef.current?.(false);
    const promise = new Promise<boolean>((resolve) => {
      pendingCombatReactionResolverRef.current = resolve;
      setPendingCombatReaction({ reaction });
    });
    pendingCombatReactionDecisionRef.current = { id: reaction.id, promise };
    return promise;
  }, []);

  function resolvePendingCombatReaction(accepted: boolean) {
    const resolver = pendingCombatReactionResolverRef.current;
    pendingCombatReactionResolverRef.current = null;
    pendingCombatReactionDecisionRef.current = null;
    setPendingCombatReaction(null);
    resolver?.(accepted);
  }

  function isCombatReactionForCurrentUser(
    reaction: CombatReactionPromptDto,
    combatView: CombatResponseDto | null = combat
  ) {
    return Boolean(
      combatView?.participants.some(
        (candidate) =>
          candidate.sessionEntityId === reaction.reactorParticipantId &&
          candidate.sessionCharacterId &&
          sessionCharacters.some(
            (character) => character.id === candidate.sessionCharacterId && character.userId === user.id
          )
      )
    );
  }

  function claimCombatReactionHandling(reactionId: string) {
    if (claimedCombatReactionIdsRef.current.has(reactionId)) {
      return false;
    }
    claimedCombatReactionIdsRef.current.add(reactionId);
    return true;
  }

  const [inventoryUseFeedback, setInventoryUseFeedback] = useState<string | null>(null);
  const [isInventoryUsePending, setInventoryUsePending] = useState(false);
  const [formState, setFormState] = useState<QuickCreateFormState>(defaultCharacter);
  const [localSelectedCharacterId, setLocalSelectedCharacterId] = useState<string | null>(null);
  const [isStatusMinimized, setStatusMinimized] = useState(false);
  const [isGameStarting, setIsGameStarting] = useState(false);
  const [isStartTransitionPending, setIsStartTransitionPending] = useState(false);
  const [characterCarouselIndex, setCharacterCarouselIndex] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 현재 세션의 플레이어용 시나리오 노드와 VTT 맵 로딩 상태입니다.
  const [playerScenario, setPlayerScenario] = useState<PlayerScenarioView | null>(null);
  const [vttMap, setVttMap] = useState<VttMapStateDto | null>(null);
  const [combat, setCombat] = useState<CombatResponseDto | null>(null);
  const [combatError, setCombatError] = useState<string | null>(null);
  const [isCombatBusy, setCombatBusy] = useState(false);
  const [pendingCombatReaction, setPendingCombatReaction] =
    useState<PendingCombatReactionPrompt | null>(null);
  const [isGmNodeMovePending, setGmNodeMovePending] = useState(false);
  const [gmNodeMoveOptions, setGmNodeMoveOptions] = useState<ExplorationNodeMoveOption[]>([]);
  const [gmItemCatalog, setGmItemCatalog] = useState<ItemResponseDto[]>([]);
  const [ruleCatalog, setRuleCatalog] = useState<RuleCatalogReferenceDto[]>([]);
  const [isGmItemCatalogLoading, setGmItemCatalogLoading] = useState(false);
  const [gmItemCatalogError, setGmItemCatalogError] = useState<string | null>(null);
  const [isGmInventoryGrantPending, setGmInventoryGrantPending] = useState(false);
  const [isEconomyPending, setEconomyPending] = useState(false);
  const [economyFeedback, setEconomyFeedback] = useState<string | null>(null);
  const [isCampaignCalendarPending, setCampaignCalendarPending] = useState(false);
  const [campaignCalendarFeedback, setCampaignCalendarFeedback] = useState<string | null>(null);
  const [isGmMessagePending, setGmMessagePending] = useState(false);
  const [gmAiAssistSuggestions, setGmAiAssistSuggestions] =
    useState<HumanGmAiAssistSuggestionDto[]>([]);
  const [isGmAiAssistPending, setGmAiAssistPending] = useState(false);
  const [isCombatChecked, setCombatChecked] = useState(false);
  const [scenarioLoadError, setScenarioLoadError] = useState<string | null>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [, setIsScenarioLoaded] = useState(false);
  const [, setIsMapLoaded] = useState(false);
  // 로그 자동 스크롤과 맵 저장 큐를 관리하는 ref입니다. 렌더링 없이 최신 값을 유지합니다.
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const mainCommandAutocompleteRef = useRef<HTMLDivElement | null>(null);
  const scenarioDescriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestConfirmedMapRef = useRef<VttMapStateDto | null>(null);
  const pendingOptimisticTokenMoveRef = useRef<PendingOptimisticTokenMove | null>(null);
  const pendingCombatReactionResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const pendingCombatReactionDecisionRef = useRef<{ id: string; promise: Promise<boolean> } | null>(null);
  const claimedCombatReactionIdsRef = useRef<Set<string>>(new Set());
  const mapSaveRef = useRef<{
    isSaving: boolean;
    pending: VttMapStateDto | null;
    activeSessionId: string | null;
  }>({
    isSaving: false,
    pending: null,
    activeSessionId: null,
  });
  const autoCombatStartKeyRef = useRef<string | null>(null);
  const knownPublicClueIdsRef = useRef<Set<string>>(new Set());
  const knownPublicClueNodeIdRef = useRef<string | null>(null);
  const knownMessageLogIdsRef = useRef<Set<string>>(new Set());
  const knownMessageLogSessionIdRef = useRef<string | null>(null);

  // 서버 스냅샷에서 현재 세션/참가자/선택 캐릭터/권한 상태를 계산합니다.
  const session = snapshot?.session ?? null;
  const participants = snapshot?.participants ?? [];
  const sessionCharacters = snapshot?.characters ?? [];
  const myParticipant = participants.find((participant) => participant.userId === user.id) ?? null;
  const serverSelectedCharacterId = myParticipant?.characterId ?? null;
  const selectedCharacterId = localSelectedCharacterId;
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ?? null;
  const selectedSessionCharacter =
    sessionCharacters.find(
      (character) =>
        character.id === selectedCharacterId || character.characterId === selectedCharacterId
    ) ?? null;
  const isHumanGmSession = session?.gmMode === 'HUMAN';
  const gmUserId = isHumanGmSession ? (session?.gmUserId ?? session?.hostUserId ?? null) : null;
  const isGmUser = Boolean(gmUserId && gmUserId === user.id);
  const playerParticipants = participants.filter((participant) => participant.role !== 'GM');
  const readyLocked = Boolean(myParticipant?.isReady);
  // 준비 배지는 빈 슬롯이 아니라 실제로 세션에 들어온 참가자 수를 기준으로 표시합니다.
  const readyParticipantCount = playerParticipants.filter(
    (participant) => participant.isReady
  ).length;
  const participantCount = playerParticipants.length;
  const allPlayersReady =
    participantCount > 0 && readyParticipantCount === participantCount;
  const isHost = session?.hostUserId === user.id;
  const isRecruiting = session?.status === 'recruiting';
  const isSessionCompleted = session?.status === 'completed';
  const activeScenario =
    snapshot?.sessionScenarios.find((item) => item.status === 'ACTIVE') ??
    snapshot?.sessionScenarios[0];
  const scenarioLevelRange = useMemo(() => {
    const minLevel = Math.max(activeScenario?.scenario.startLevel ?? 1, 1);
    const maxLevel = Math.max(activeScenario?.scenario.recommendedEndLevel ?? minLevel, minLevel);
    return { minLevel, maxLevel };
  }, [activeScenario?.scenario.recommendedEndLevel, activeScenario?.scenario.startLevel]);
  const scenarioLevelLabel =
    scenarioLevelRange.minLevel === scenarioLevelRange.maxLevel
      ? `${scenarioLevelRange.minLevel}레벨`
      : `${scenarioLevelRange.minLevel}-${scenarioLevelRange.maxLevel}레벨`;
  const isCharacterLevelAllowedForScenario = useCallback(
    (character: Pick<Character, 'level'> | Pick<PersistentCharacter, 'level'> | null | undefined) =>
      Boolean(
        character &&
          character.level >= scenarioLevelRange.minLevel &&
          character.level <= scenarioLevelRange.maxLevel
      ),
    [scenarioLevelRange.maxLevel, scenarioLevelRange.minLevel]
  );
  const selectedCharacterLevelAllowed = selectedCharacter
    ? isCharacterLevelAllowedForScenario(selectedCharacter)
    : true;
  const canManageStartedSession = Boolean(
    !isRecruiting && (isHumanGmSession ? isGmUser : isHost)
  );
  const canUseCampaignCalendarPanel = Boolean(session && !isRecruiting && !isSessionCompleted);
  const economyState =
    snapshot?.state.flags?.economy &&
    typeof snapshot.state.flags.economy === "object"
      ? snapshot.state.flags.economy
      : null;
  const campaignCalendarState =
    snapshot?.state.flags?.campaignCalendar &&
    typeof snapshot.state.flags.campaignCalendar === "object"
      ? snapshot.state.flags.campaignCalendar
      : null;
  const canUseHumanGmView = Boolean(!isRecruiting && isHumanGmSession && isGmUser);
  const canShowCharacterSelection = Boolean(session && isRecruiting && !isGmUser);
  const canStartSession = Boolean(
    (isHumanGmSession ? isGmUser : isHost) &&
      isRecruiting &&
      allPlayersReady &&
      playerParticipants.length > 0 &&
      sessionCharacters.every((character) => isCharacterLevelAllowedForScenario(character))
  );

  async function handleApproveRestRequest(actionId: string) {
    const resolved = await onApproveRestRequest(actionId);
    if (!resolved) return;
    setResolvedRestRequestIds((current) => {
      const next = new Set(current);
      next.add(actionId);
      return next;
    });
  }

  async function handleRejectRestRequest(actionId: string) {
    const resolved = await onRejectRestRequest(actionId);
    if (!resolved) return;
    setResolvedRestRequestIds((current) => {
      const next = new Set(current);
      next.add(actionId);
      return next;
    });
  }

  async function handleCancelRestRequest(actionId: string) {
    const resolved = await onCancelRestRequest(actionId);
    if (!resolved) return;
    setResolvedRestRequestIds((current) => {
      const next = new Set(current);
      next.add(actionId);
      return next;
    });
  }
  const scenarioDescriptionText = infoText || activeScenario?.scenario.description || '';

  useEffect(() => {
    const textarea = scenarioDescriptionTextareaRef.current;
    if (!textarea) return;

    // 설명 영역은 내부 스크롤 대신 내용 높이만큼 자연스럽게 늘어나게 맞춥니다.
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [activeTab, scenarioDescriptionText]);

  useEffect(() => {
    if (!inventoryUseFeedback) return undefined;
    const timer = window.setTimeout(() => {
      setInventoryUseFeedback(null);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [inventoryUseFeedback]);

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
  const quickCreateLevel = activeScenario?.scenario.startLevel ?? 1;
  const quickCreateScenarioId = activeScenario?.scenario.id ?? null;
  const quickCreateBaseAbilities = getQuickCreatePointBuyBase(
    selectedQuickCreateClass?.key ?? formState.classKey,
  );
  const quickCreateAbilitiesBeforeAsi = applyRaceBonuses(
    quickCreateBaseAbilities,
    selectedQuickCreateRace,
  );
  const quickCreateAsiChoices = buildQuickCreateAsiChoices(
    selectedQuickCreateClass?.key ?? formState.classKey,
    quickCreateLevel,
    quickCreateAbilitiesBeforeAsi,
  );
  const quickCreateAbilities = applyQuickCreateAsiChoices(
    quickCreateAbilitiesBeforeAsi,
    quickCreateAsiChoices,
  );
  const quickCreateProficientSkills =
    selectedQuickCreateClass?.skillChoices.slice(
      0,
      selectedQuickCreateClass.skillChoiceCount,
    ) ?? [];
  const quickCreateFeatures = selectedQuickCreateClass
    ? getDefaultQuickCreateFeatureSelections({
        classKey: selectedQuickCreateClass.key,
        raceKey: selectedQuickCreateRace?.key,
        level: quickCreateLevel,
        proficientSkills: quickCreateProficientSkills,
        asiChoices: quickCreateAsiChoices,
      })
    : [];
  const quickCreateProficiencyBonus = getProficiencyBonusForLevel(quickCreateLevel);
  const quickCreateMaxHp = getExpectedMaxHp(
    selectedQuickCreateClass?.hitDie,
    quickCreateLevel,
    quickCreateAbilities.con,
  );
  const quickCreateArmorClass = getQuickCreateArmorClass(
    selectedQuickCreateClass?.key ?? formState.classKey,
    quickCreateAbilities,
  );
  const quickCreateSpeed = getQuickCreateSpeed(
    selectedQuickCreateClass?.key ?? formState.classKey,
    selectedQuickCreateRace,
  );
  const quickCreatePresetId =
    QUICK_CREATE_CLASS_PRESET_BY_KEY.get(selectedQuickCreateClass?.key ?? formState.classKey) ??
    null;
  const currentNode = playerScenario?.currentNode ?? null;
  useEffect(() => {
    let ignore = false;
    listRuleCatalog()
      .then((catalog) => {
        if (!ignore) setRuleCatalog(catalog);
      })
      .catch(() => {
        if (!ignore) setRuleCatalog([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.id || !canUseHumanGmView || !currentNode?.id) {
      setGmNodeMoveOptions([]);
      return;
    }

    let ignore = false;
    getHumanGmNodeMoveOptions(user, session.id)
      .then((options) => {
        if (!ignore) {
          setGmNodeMoveOptions(options);
        }
      })
      .catch(() => {
        if (!ignore) {
          setGmNodeMoveOptions([]);
        }
      });

    return () => {
      ignore = true;
    };
  }, [canUseHumanGmView, currentNode?.id, session?.id, snapshot?.state.version, user]);
  useEffect(() => {
    if (!session?.id || !canUseHumanGmView) {
      setGmAiAssistSuggestions([]);
      return;
    }

    let ignore = false;
    getHumanGmAiAssistSuggestions(user, session.id)
      .then((suggestions) => {
        if (!ignore) {
          setGmAiAssistSuggestions(suggestions);
        }
      })
      .catch(() => {
        if (!ignore) {
          setGmAiAssistSuggestions([]);
        }
      });

    return () => {
      ignore = true;
    };
  }, [canUseHumanGmView, session?.id, snapshot?.state.version, user]);
  useEffect(() => {
    if (!canUseHumanGmView || gmItemCatalog.length) {
      return;
    }

    let ignore = false;
    setGmItemCatalogLoading(true);
    setGmItemCatalogError(null);
    listItems()
      .then((items) => {
        if (!ignore) {
          setGmItemCatalog(items);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setGmItemCatalogError(
            caught instanceof Error ? caught.message : '아이템 목록을 불러오지 못했습니다.'
          );
        }
      })
      .finally(() => {
        if (!ignore) {
          setGmItemCatalogLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [canUseHumanGmView, gmItemCatalog.length]);
  const currentSceneDescriptionText =
    currentNode?.sceneText?.trim() || '현재 장면 설명이 아직 준비되지 않았습니다.';
  const recentGmAiAssistLogs = useMemo(
    () =>
      logs
        .slice(-5)
        .map((log) => [log.title, log.message].filter(Boolean).join(': ').slice(0, 220)),
    [logs]
  );
  const currentPublicClueIdSignature = useMemo(
    () => (currentNode?.publicClues ?? []).map((clue) => clue.id).sort().join('|'),
    [currentNode?.publicClues]
  );
  const completedCombatNodeIds = useMemo(
    () => getCompletedCombatNodeIds(snapshot?.state.flags),
    [snapshot?.state.flags]
  );
  const isCompletedCombatNode = Boolean(
    currentNode?.nodeType === 'combat' &&
    currentNode.id &&
    (completedCombatNodeIds.has(currentNode.id) ||
      (combat?.sessionId === session?.id && combat?.status === 'ENDED'))
  );
  const currentScreenType = isCompletedCombatNode
    ? MainCommandScreenTypeValues.EXPLORATION
    : getScreenTypeFromNodeType(currentNode?.nodeType);
  const isStoryNode = currentNode?.nodeType === 'story';
  const isExplorationNode = currentNode?.nodeType === 'exploration' || isCompletedCombatNode;
  const isCombatNode = currentNode?.nodeType === 'combat' && !isCompletedCombatNode;
  const usesNodeSpecificPartyStrip = Boolean(
    session && !isRecruiting && (isStoryNode || isExplorationNode || isCombatNode)
  );
  const isExplorationMainCommandContext =
    currentScreenType === MainCommandScreenTypeValues.EXPLORATION;
  const mainCommandPresets = useMemo(() => {
    if (!currentScreenType) return emptyMainCommandPresets;

    const presets = mainCommandPresetsByScreen[currentScreenType];
    return isExplorationMainCommandContext
      ? presets.filter(
        (preset) =>
          preset.intent !== MainCommandIntentValues.OBSERVE_AREA &&
          preset.intent !== MainCommandIntentValues.INVESTIGATE_OBJECT &&
          preset.intent !== MainCommandIntentValues.LISTEN &&
          preset.intent !== MainCommandIntentValues.DETECT_DANGER &&
          preset.intent !== MainCommandIntentValues.INTERACT_OBJECT &&
          preset.intent !== MainCommandIntentValues.SPLIT_PARTY_TASK
      )
      : presets;
  }, [currentScreenType, isExplorationMainCommandContext]);
  const selectedCharacterInventory =
    selectedSessionCharacter?.inventory ?? selectedCharacter?.inventory ?? [];
  const mainCommandCategories = useMemo<MainCommandCategoryOption[]>(() => {
    const options = new Map<string, MainCommandCategoryOption>();
    mainCommandPresets.forEach((preset) => {
      if (!options.has(preset.categoryLabel)) {
        options.set(preset.categoryLabel, {
          label: preset.categoryLabel,
          category: preset.category,
        });
      }
    });
    return Array.from(options.values());
  }, [mainCommandPresets]);
  const mainCommandCategoryLabels = useMemo(
    () => mainCommandCategories.map((category) => category.label),
    [mainCommandCategories]
  );
  const activeMainCategory = selectedMainCategory ?? mainCommandCategoryLabels[0] ?? null;
  const openMainCommandOptions = openMainCommandCategory
    ? mainCommandPresets.filter((preset) => preset.categoryLabel === openMainCommandCategory)
    : [];
  const parsedMainSlashInput = useMemo(
    () =>
      mainCommandMode === 'GM_REQUEST'
        ? parseMainSlashInput(mainMessage, mainCommandPresets)
        : null,
    [mainCommandMode, mainCommandPresets, mainMessage]
  );
  const matchedMainSlashCommand =
    parsedMainSlashInput?.type === 'matched' ? parsedMainSlashInput : null;
  const selectedMainCommand = matchedMainSlashCommand?.preset ?? null;
  const availableMainHelperOptions = useMemo(() => {
    if (!currentScreenType) return [];
    const visibleTargets = currentNode?.visibleTargets ?? [];
    return mainCommandHelperOptions.filter((option) => {
      if (!option.screenTypes.includes(currentScreenType)) return false;
      if (
        option.id === 'NPC_INTERACTION' &&
        !visibleTargets.some((target) => target.targetType === MainCommandTargetTypeValues.NPC)
      ) {
        return false;
      }
      if (
        option.id === 'OBJECT_AREA_TARGET' &&
        !visibleTargets.some(
          (target) =>
            target.targetType === MainCommandTargetTypeValues.OBJECT ||
            target.targetType === MainCommandTargetTypeValues.AREA
        )
      ) {
        return false;
      }
      if (option.id === 'ITEM_TOOL_SELECT' && selectedCharacterInventory.length === 0) {
        return false;
      }
      return true;
    });
  }, [currentNode?.visibleTargets, currentScreenType, selectedCharacterInventory]);
  const selectedMainCommandHelperGroup = selectedMainCommand
    ? getMainCommandHelperGroup(selectedMainCommand)
    : null;
  const activeMainHelperOption = isExplorationMainCommandContext
    ? (availableMainHelperOptions.find(
      (option) => option.id === selectedMainCommandHelperGroup
    ) ?? null)
    : (availableMainHelperOptions.find(
      (option) =>
        option.id === activeMainHelperGroup &&
        (!selectedMainCommand ||
          isMainCommandAvailableForHelperGroup(selectedMainCommand, option.id))
    ) ??
      availableMainHelperOptions.find(
        (option) => option.id === selectedMainCommandHelperGroup
      ) ??
      null);
  const selectedMainFieldConfig = selectedMainCommand
    ? (mainCommandFieldConfigByIntent[selectedMainCommand.intent] ??
      activeMainHelperOption?.fieldConfig ??
      null)
    : activeMainHelperOption?.fieldConfig ?? null;
  const mainSlashToken = mainMessage.trimStart().split(/\s+/)[0] ?? '';
  const shouldShowMainCommandAutocomplete =
    mainCommandMode === 'GM_REQUEST' &&
    mainSlashToken.startsWith('/') &&
    !mainMessage.trimStart().includes(' ');
  const shouldShowCommandGuide = isCommandGuideOpen && !shouldShowMainCommandAutocomplete;
  const isMainCommandButtonActive =
    isCommandGuideOpen || shouldShowMainCommandAutocomplete || Boolean(selectedMainCommand);
  const isGmRequestModeButtonActive = mainCommandMode === 'GM_REQUEST';
  const mainCommandAutocompleteCandidates = shouldShowMainCommandAutocomplete
    ? mainCommandPresets.filter((preset) => {
      if (
        activeMainHelperOption &&
        !isMainCommandAvailableForHelperGroup(preset, activeMainHelperOption.id)
      ) {
        return false;
      }
      const slashCommands = getMainCommandSlashCommands(preset);
      if (mainSlashToken === '/') return slashCommands.length > 0;
      return slashCommands.some((slashCommand) => slashCommand.startsWith(mainSlashToken));
    })
    : [];
  const mainCommandAutocompleteEntries: MainCommandAutocompleteEntry[] = activeMainHelperOption
    ? mainCommandAutocompleteCandidates.map((command) => ({ type: 'command', command }))
    : [
      ...mainCommandAutocompleteCandidates
        .filter((command) => !doesMainCommandNeedHelperSelection(command))
        .map((command) => ({ type: 'command' as const, command })),
      ...(mainCommandAutocompleteCandidates.some(doesMainCommandNeedHelperSelection)
        ? [
          {
            type: 'separator' as const,
            id: 'helper-selection-required',
            label: '아래는 대상 선택 필요',
          },
          ...mainCommandAutocompleteCandidates
            .filter(doesMainCommandNeedHelperSelection)
            .map((command) => ({ type: 'command' as const, command })),
        ]
        : []),
    ];
  const mainCommandAutocompleteCommandEntries = mainCommandAutocompleteEntries.filter(
    (entry): entry is Extract<MainCommandAutocompleteEntry, { type: 'command' }> =>
      entry.type === 'command' && getMainCommandSlashCommands(entry.command).length > 0
  );
  const mainCommandAutocompleteIndexByIntent = new Map(
    mainCommandAutocompleteCommandEntries.map((entry, index) => [entry.command.intent, index])
  );
  const activeMainCommandAutocompleteEntry =
    mainCommandAutocompleteIndex >= 0
      ? mainCommandAutocompleteCommandEntries[mainCommandAutocompleteIndex] ?? null
      : null;
  const activeMainCommandAutocompleteId = activeMainCommandAutocompleteEntry
    ? `main-command-autocomplete-${activeMainCommandAutocompleteEntry.command.intent}`
    : undefined;
  const visibleTargetOptions = (currentNode?.visibleTargets ?? []).filter((target) =>
    selectedMainFieldConfig?.targetTypes?.length
      ? selectedMainFieldConfig.targetTypes.includes(target.targetType)
      : true
  );
  // 탐험노드는 기본적으로 맵/아이템 칩을 쓰지만, NPC 대화처럼 명시 대상이 필요한 명령은 선택창을 열어준다.
  const shouldShowExplorationTargetField = Boolean(
    isExplorationMainCommandContext &&
      selectedMainFieldConfig?.targetTypes?.includes(MainCommandTargetTypeValues.NPC)
  );
  const shouldShowMainCommandFields = Boolean(
    selectedMainFieldConfig &&
      (!isExplorationMainCommandContext || shouldShowExplorationTargetField)
  );
  const shouldShowMainTargetField = Boolean(
    selectedMainFieldConfig?.targetTypes?.length &&
      (!isExplorationMainCommandContext || shouldShowExplorationTargetField)
  );
  const shouldShowMainItemField = Boolean(
    selectedMainFieldConfig?.requiresItem && !isExplorationMainCommandContext
  );
  const shouldShowMainSpellField = Boolean(
    selectedMainFieldConfig?.requiresSpell && !isExplorationMainCommandContext
  );
  const shouldShowMainRelatedIntentField = Boolean(
    selectedMainFieldConfig?.allowsRelatedIntent && !isExplorationMainCommandContext
  );
  const shouldShowMainPointField = Boolean(
    !isExplorationMainCommandContext &&
      (selectedMainFieldConfig?.requiresMapPoint || selectedMainFieldConfig?.allowsMapPoint)
  );
  const selectedMainTarget =
    visibleTargetOptions.find((target) => target.id === selectedMainTargetId) ?? null;
  const selectedMainItem =
    selectedCharacterInventory.find((item) => item.id === selectedMainItemId) ?? null;
  const selectedExplorationMapLabel = useMemo(() => {
    const selection = selectedExplorationMapSelection;
    if (!selection) return '맵 선택 없음';
    if (selection.kind === 'tile') {
      return `타일 (${selection.tile.column}, ${selection.tile.row})`;
    }
    if (selection.kind === 'token') {
      const npcTarget = selection.token.npcId
        ? currentNode?.visibleTargets.find((target) => target.id === selection.token.npcId)
        : null;
      return `${npcTarget?.name ?? selection.token.name} (${selection.tile.column}, ${selection.tile.row})`;
    }

    const fallback =
      selection.kind === 'door'
        ? '문'
        : selection.kind === 'object'
          ? '오브젝트'
          : selection.kind === 'wall'
            ? '벽'
            : '지형';
    return `${selection.cell.name?.trim() || fallback} (${selection.tile.column}, ${selection.tile.row})`;
  }, [currentNode?.visibleTargets, selectedExplorationMapSelection]);
  const selectedExplorationItemLabel = selectedMainItem
    ? `${selectedMainItem.name} x${selectedMainItem.quantity}`
    : '아이템 선택 없음';
  const relatedIntentOptions = mainCommandPresets.filter(
    (preset) =>
      preset.intent !== MainCommandIntentValues.ASK_RULE &&
      preset.intent !== MainCommandIntentValues.ASK_HINT
  );
  const snapshotVttMap = snapshot?.state.flags?.vttMap;
  const isPartyDefeated = snapshot?.state.flags?.partyDefeated === true;
  const startedSessionTabs = useMemo(
    () => ['Main', 'Chat', 'Info', 'Settings'] as const,
    []
  );

  useEffect(() => {
    setMainCommandAutocompleteIndex((current) => {
      if (!mainCommandAutocompleteCommandEntries.length) return -1;
      return current >= 0 && current < mainCommandAutocompleteCommandEntries.length ? current : 0;
    });
  }, [mainCommandAutocompleteCommandEntries.length, mainSlashToken]);

  function setVttMapIfChanged(nextMap: VttMapStateDto, source: string) {
    latestConfirmedMapRef.current = nextMap;
    setVttMap((current) => {
      if (getVttMapRenderSignature(current) === getVttMapRenderSignature(nextMap)) {
        if (shouldLogMapMovePerf()) {
          console.debug(`[battle-map] skip duplicate map from ${source}`);
        }
        return current;
      }
      return nextMap;
    });
  }

  useEffect(() => {
    const activeOption = mainCommandAutocompleteRef.current?.querySelector<HTMLElement>(
      '[data-autocomplete-active="true"]'
    );
    activeOption?.scrollIntoView({ block: 'nearest' });
  }, [mainCommandAutocompleteIndex]);
  const availableTabs = isRecruiting
    ? (['Main', 'Chat', 'Info', 'Settings'] as const)
    : startedSessionTabs;

  // 서버가 알려준 선택 캐릭터가 바뀌면 로컬 선택 상태도 맞춥니다.
  useEffect(() => {
    setLocalSelectedCharacterId(serverSelectedCharacterId);
  }, [serverSelectedCharacterId]);

  useEffect(() => {
    if (!user || !session?.id || !isCombatNode) {
      if (
        combat?.status === 'ENDED' &&
        currentNode?.nodeType === 'combat' &&
        currentNode.id &&
        !completedCombatNodeIds.has(currentNode.id)
      ) {
        return;
      }
      setCombat(null);
      setCombatError(null);
      setCombatChecked(false);
      autoCombatStartKeyRef.current = null;
      return;
    }

    let cancelled = false;
    setCombatChecked(false);
    getCombat(user, session.id)
      .then((nextCombat) => {
        if (cancelled) return;
        setCombat(nextCombat);
        setCombatError(null);
        setCombatChecked(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCombat(null);
        const message = error instanceof Error ? error.message : '전투 상태를 불러오지 못했습니다.';
        const missingCombat = isMissingCombatError(message);
        setCombatError(missingCombat ? null : message);
        setCombatChecked(true);
        if (
          missingCombat &&
          currentNode?.id &&
          !isCombatBusy &&
          (session.gmMode !== 'HUMAN' || isGmUser)
        ) {
          const autoStartKey = `${session.id}:${currentNode.id}`;
          if (autoCombatStartKeyRef.current !== autoStartKey) {
            autoCombatStartKeyRef.current = autoStartKey;
            console.info('[COMBAT_AUTO_START] active combat missing; starting combat', {
              sessionId: session.id,
              nodeId: currentNode.id,
              gmMode: session.gmMode,
            });
            void runCombatRequest(() => startCombat(user, session.id));
          }
        } else if (!missingCombat) {
          console.error('[COMBAT_LOAD_FAILED]', { sessionId: session.id, message, error });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [combat?.status, completedCombatNodeIds, currentNode?.id, currentNode?.nodeType, isCombatNode, isGmUser, session?.gmMode, session?.id, user]);

  useEffect(() => {
    if (!user || !session?.id || !currentNode?.id || !isCombatNode) return;
    if (!isCombatChecked || combat || isCombatBusy || combatError) return;
    if (session.gmMode === 'HUMAN' && !isGmUser) return;

    const autoStartKey = `${session.id}:${currentNode.id}`;
    if (autoCombatStartKeyRef.current === autoStartKey) return;
    autoCombatStartKeyRef.current = autoStartKey;
    void runCombatRequest(() => startCombat(user, session.id));
  }, [
    combat,
    combatError,
    currentNode?.id,
    isCombatBusy,
    isCombatChecked,
    isCombatNode,
    isGmUser,
    session?.gmMode,
    session?.id,
    user,
  ]);

  useEffect(() => {
    function handleCombatUpdated(event: Event) {
      const detail = (event as CustomEvent<CombatResponseDto>).detail;
      if (detail?.sessionId === session?.id) {
        setCombat(detail);
        setCombatError(null);
      }
    }

    window.addEventListener('trpg:combat-updated', handleCombatUpdated);
    return () => window.removeEventListener('trpg:combat-updated', handleCombatUpdated);
  }, [session?.id]);

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

  // 준비 상태가 풀리면 상태 패널을 다시 펼쳐 사용자가 확인할 수 있게 합니다.
  useEffect(() => {
    if (!allPlayersReady) {
      setStatusMinimized(false);
    }
  }, [allPlayersReady]);

  useEffect(() => {
    if (isRecruiting) {
      setIsGameStarting(false);
      setIsStartTransitionPending(false);
      return;
    }

    if (!isStartTransitionPending) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsGameStarting(false);
      setIsStartTransitionPending(false);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [isRecruiting, isStartTransitionPending]);

  useEffect(() => {
    if (availableTabs.some((tab) => tab === activeTab)) return;
    setActiveTab(availableTabs[0]);
  }, [activeTab, availableTabs]);

  useEffect(() => {
    if (!mainCommandCategoryLabels.length) {
      setSelectedMainCategory(null);
      setOpenMainCommandCategory(null);
      setSelectedMainIntent(null);
      return;
    }

    if (!activeMainCategory) {
      setSelectedMainCategory(mainCommandCategoryLabels[0]);
      return;
    }

    if (!mainCommandCategoryLabels.includes(activeMainCategory)) {
      setSelectedMainCategory(mainCommandCategoryLabels[0]);
    }

    if (openMainCommandCategory && !mainCommandCategoryLabels.includes(openMainCommandCategory)) {
      setOpenMainCommandCategory(null);
    }
  }, [activeMainCategory, mainCommandCategoryLabels, openMainCommandCategory]);

  useEffect(() => {
    if (!selectedMainIntent) {
      return;
    }

    if (!mainCommandPresets.some((preset) => preset.intent === selectedMainIntent)) {
      setSelectedMainIntent(null);
    }
  }, [mainCommandPresets, selectedMainIntent]);

  useEffect(() => {
    if (
      activeMainHelperGroup &&
      !availableMainHelperOptions.some((option) => option.id === activeMainHelperGroup)
    ) {
      setActiveMainHelperGroup(null);
    }
  }, [activeMainHelperGroup, availableMainHelperOptions]);

  // 세션이 없거나 바뀌면 시나리오/맵 상태를 초기화하고 플레이어용 시나리오를 다시 불러옵니다.
  useEffect(() => {
    if (!session) {
      setPlayerScenario(null);
      setVttMap(null);
      setScenarioLoadError(null);
      setMapLoadError(null);
      setIsScenarioLoaded(false);
      setIsMapLoaded(false);
      latestConfirmedMapRef.current = null;
      mapSaveRef.current = {
        isSaving: false,
        pending: null,
        activeSessionId: null,
      };
      return;
    }

    let ignore = false;
    setScenarioLoadError(null);
    setIsScenarioLoaded(false);

    getPlayerScenario(user, session.id)
      .then((scenario) => {
        if (!ignore) {
          setPlayerScenario(scenario);
          setIsScenarioLoaded(true);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setPlayerScenario(null);
          setIsScenarioLoaded(true);
          setScenarioLoadError(
            caught instanceof Error ? caught.message : '시나리오를 불러오지 못했습니다.'
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [session, snapshot?.state.currentNodeId, snapshot?.state.version, user]);

  useEffect(() => {
    if (!currentNode) {
      knownPublicClueIdsRef.current = new Set();
      knownPublicClueNodeIdRef.current = null;
      setHasUnreadInfo(false);
      setRevealedClueToast(null);
      return;
    }

    const nextIds = new Set((currentNode.publicClues ?? []).map((clue) => clue.id));
    const isSameNode = knownPublicClueNodeIdRef.current === currentNode.id;

    if (!isSameNode) {
      knownPublicClueIdsRef.current = nextIds;
      knownPublicClueNodeIdRef.current = currentNode.id;
      setHasUnreadInfo(false);
      setRevealedClueToast(null);
      return;
    }

    const hasNewClue = [...nextIds].some(
      (clueId) => !knownPublicClueIdsRef.current.has(clueId)
    );

    if (hasNewClue) {
      const revealedClue = (currentNode.publicClues ?? []).find(
        (clue) => !knownPublicClueIdsRef.current.has(clue.id)
      );
      if (revealedClue) {
        setRevealedClueToast(revealedClue);
      }
      if (activeTab !== 'Info') {
        setHasUnreadInfo(true);
      }
    }
    if (activeTab === 'Info') {
      setHasUnreadInfo(false);
    }

    knownPublicClueIdsRef.current = nextIds;
    knownPublicClueNodeIdRef.current = currentNode.id;
  }, [activeTab, currentNode?.id, currentPublicClueIdSignature]);

  useEffect(() => {
    const currentSessionId = session?.id ?? null;

    if (knownMessageLogSessionIdRef.current !== currentSessionId) {
      knownMessageLogSessionIdRef.current = currentSessionId;
      knownMessageLogIdsRef.current = new Set(logs.map((log) => log.id));
      setUnreadMessageCounts({ Main: 0, Chat: 0 });
      return;
    }

    const knownIds = knownMessageLogIdsRef.current;
    // 이전 로그 보기는 배열 뒤쪽에 붙으므로, 앞쪽에 새로 추가된 로그만 읽지 않은 대상으로 셉니다.
    const firstKnownLogIndex = logs.findIndex((log) => knownIds.has(log.id));
    const newlyPrependedLogs =
      firstKnownLogIndex === -1 ? logs : logs.slice(0, firstKnownLogIndex);
    let mainIncrement = 0;
    let chatIncrement = 0;

    newlyPrependedLogs.forEach((log) => {
      if (knownIds.has(log.id)) return;

      const targetTab = getMessageLogTab(log);
      if (!targetTab || targetTab === activeTab) return;

      if (targetTab === 'Main') {
        mainIncrement += 1;
      } else {
        chatIncrement += 1;
      }
    });

    knownMessageLogIdsRef.current = new Set(logs.map((log) => log.id));

    if (!mainIncrement && !chatIncrement) return;

    setUnreadMessageCounts((current) => ({
      Main: current.Main + mainIncrement,
      Chat: current.Chat + chatIncrement,
    }));
  }, [activeTab, logs, session?.id]);

  useEffect(() => {
    if (activeTab !== 'Main' && activeTab !== 'Chat') return;

    setUnreadMessageCounts((current) =>
      current[activeTab] === 0 ? current : { ...current, [activeTab]: 0 }
    );
  }, [activeTab]);

  useEffect(() => {
    if (!revealedClueToast) return undefined;
    const timer = window.setTimeout(() => {
      setRevealedClueToast(null);
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [revealedClueToast]);

  useEffect(() => {
    if (snapshotVttMap && typeof snapshotVttMap === 'object') {
      const nextMap = snapshotVttMap as VttMapStateDto;
      setVttMapIfChanged(nextMap, 'snapshot');
      setIsMapLoaded(true);
    }
  }, [snapshotVttMap]);

  useEffect(() => {
    if (!session || isRecruiting) {
      return;
    }

    let ignore = false;
    setMapLoadError(null);

    getVttMap(user, session.id)
      .then((map) => {
        if (!ignore) {
          setVttMapIfChanged(map, 'load');
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setMapLoadError(caught instanceof Error ? caught.message : '맵을 불러오지 못했습니다.');
        }
      });

    return () => {
      ignore = true;
    };
  }, [isRecruiting, session, user]);

  useEffect(() => {
    mapSaveRef.current.activeSessionId = session?.id ?? null;
    mapSaveRef.current.pending = null;
  }, [session?.id]);

  const joinableCharacters = useMemo(
    () =>
      characters.map((character) => {
        const isLevelAllowed = isCharacterLevelAllowedForScenario(character);
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
      }),
    [characters, isCharacterLevelAllowedForScenario, readyLocked, scenarioLevelLabel, selectedCharacterId]
  );

  const wantedCarouselCharacters = useMemo(
    () =>
      joinableCharacters.filter(
        (character) => character.isSelectable || character.id === selectedCharacterId
      ),
    [joinableCharacters, selectedCharacterId]
  );

  const wantedCarouselCharacter =
    wantedCarouselCharacters[Math.min(characterCarouselIndex, wantedCarouselCharacters.length - 1)] ??
    null;

  const selectedCharacterAbilitySummary = useMemo(
    () => (wantedCarouselCharacter ? getAbilitySummary(wantedCarouselCharacter) : []),
    [wantedCarouselCharacter]
  );

  const wantedCarouselFeatureSummary = useMemo(
    () => summarizeCharacterFeatures(wantedCarouselCharacter?.features, 5),
    [wantedCarouselCharacter?.features]
  );

  useEffect(() => {
    setCharacterCarouselIndex((current) =>
      Math.min(current, Math.max(0, wantedCarouselCharacters.length - 1))
    );
  }, [wantedCarouselCharacters.length]);

  useEffect(() => {
    if (!selectedCharacterId) return;
    const selectedIndex = wantedCarouselCharacters.findIndex(
      (character) => character.id === selectedCharacterId
    );
    if (selectedIndex < 0) return;

    setCharacterCarouselIndex(selectedIndex);
  }, [selectedCharacterId, wantedCarouselCharacters]);

  const scopedLogs = useMemo(() => {
    if (activeTab === 'Chat') {
      return logs.filter((log) => log.kind === 'action' && isChatScoped(log.message));
    }

    if (activeTab === 'Main') {
      return logs.filter((log) => log.kind === 'action' && !isChatScoped(log.message));
    }

    return [];
  }, [activeTab, logs]);

  function getMainCommandNpcSpeakerName(log: LogEntry) {
    const mainCommand = log.metadata?.mainCommand;
    const metadataSpeakerName = mainCommand?.npcDialogue?.speakerName?.trim();
    if (metadataSpeakerName) return metadataSpeakerName;

    const targetId = mainCommand?.npcDialogue?.npcId ?? mainCommand?.targetId;
    if (!targetId) return null;

    return (
      currentNode?.visibleTargets.find((target) => target.id === targetId)?.name ??
      vttMap?.tokens.find((token) => token.npcId === targetId || token.id === targetId)?.name ??
      null
    );
  }

  function getLogDisplaySenderLabel(
    log: LogEntry,
    rowClass: 'incoming' | 'outgoing' | 'notice',
    presentation?: MainLogPresentation | null
  ) {
    const baseLabel = getLogSenderLabel(log.title, rowClass, presentation);

    if (baseLabel !== log.title) {
      return baseLabel;
    }

    const participant = getLogParticipant(log.title);
    if (!participant) return baseLabel;

    const character = sessionCharacters.find((item) => item.userId === participant.userId) ?? null;

    // 로그에는 유저명이 먼저 남아 있어서, 플레이 중에는 캐릭터명과 유저명을 함께 보여줍니다.
    return character ? `${character.name} (${participant.user.displayName})` : baseLabel;
  }

  const renderedRows = useMemo(() => {
    let previousDateKey: string | null = null;

    return [...scopedLogs].reverse().map((log) => {
      const normalizedMessage = stripScopePrefix(log.message);
      const isMine = log.title === user.displayName;
      const rowClass = log.kind === 'system' ? 'notice' : isMine ? 'outgoing' : 'incoming';
      const presentation =
        activeTab === 'Main'
          ? getMainLogPresentation(log, normalizedMessage, getMainCommandNpcSpeakerName(log))
          : null;
      const dateKey = getLogDateKey(log.createdAt);
      const showDateSeparator = dateKey !== previousDateKey;
      previousDateKey = dateKey;

      return {
        ...log,
        message: presentation?.displayMessage ?? normalizedMessage,
        // 서버 응답을 기다리는 임시 로그는 멈춘 것처럼 보이지 않도록 별도 표시를 붙입니다.
        isPendingAction: log.id.endsWith(':pending'),
        showDateSeparator,
        dateLabel: getLogDateLabel(log.createdAt),
        rowClass,
        logTone: presentation?.tone ?? null,
        logToneLabel: presentation?.label ?? null,
        speakerKind: presentation?.speakerKind ?? null,
        speakerName: presentation?.speakerName ?? null,
        senderLabel: getLogDisplaySenderLabel(log, rowClass, presentation),
      };
    });
  }, [
    activeTab,
    currentNode?.visibleTargets,
    participants,
    scopedLogs,
    sessionCharacters,
    user.displayName,
    vttMap?.tokens,
  ]);
  const pendingRestApprovals = useMemo(
    () => {
      const seenActionIds = new Set<string>();
      const resolvedActionIds = new Set<string>();
      for (const log of logs) {
        const approval = log.metadata?.restApproval;
        if (approval?.actionId && approval.status !== 'gm_required') {
          resolvedActionIds.add(approval.actionId);
        }
      }
      const logApprovals = logs
        .map((log) => {
          const restApproval = log.metadata?.restApproval;
          if (
            !restApproval?.actionId ||
            restApproval.status !== 'gm_required' ||
            (restApproval.expiresAt &&
              new Date(restApproval.expiresAt).getTime() <= Date.now()) ||
            resolvedRestRequestIds.has(restApproval.actionId) ||
            resolvedActionIds.has(restApproval.actionId) ||
            seenActionIds.has(restApproval.actionId)
          ) {
            return null;
          }
          seenActionIds.add(restApproval.actionId);
          return {
            actionId: restApproval.actionId,
            restType: restApproval.restType,
            requester: log.title,
            message: stripScopePrefix(log.message),
            expiresAt: restApproval.expiresAt ?? null,
          };
        })
        .filter(
          (approval): approval is {
            actionId: string;
            restType: 'short' | 'long' | null;
            requester: string;
            message: string;
            expiresAt: string | null;
          } => approval !== null
        );

      const snapshotApprovals = (snapshot?.pendingRestApprovals ?? [])
        .map((approval) => {
          if (
            !approval.actionId ||
            resolvedRestRequestIds.has(approval.actionId) ||
            resolvedActionIds.has(approval.actionId) ||
            seenActionIds.has(approval.actionId)
          ) {
            return null;
          }
          seenActionIds.add(approval.actionId);
          const restLabel = approval.restType === 'long' ? '긴 휴식' : '짧은 휴식';
          const characterLabel = approval.characterName
            ? `${approval.characterName}의 `
            : '';
          return {
            actionId: approval.actionId,
            restType: approval.restType,
            requester: approval.requesterDisplayName,
            message: `${characterLabel}${restLabel} 요청이 GM 승인 대기 상태입니다.`,
            expiresAt: approval.expiresAt,
          };
        })
        .filter(
          (approval): approval is {
            actionId: string;
            restType: 'short' | 'long' | null;
            requester: string;
            message: string;
            expiresAt: string;
          } => approval !== null
        );

      return [...logApprovals, ...snapshotApprovals];
    },
    [resolvedRestRequestIds, logs, snapshot?.pendingRestApprovals]
  );
  const visibleRestApproval = canUseHumanGmView ? pendingRestApprovals[0] ?? null : null;
  const visibleOwnRestRequest = !canUseHumanGmView
    ? (snapshot?.pendingRestApprovals ?? []).find(
        (approval) =>
          approval.requesterUserId === user.id &&
          new Date(approval.expiresAt).getTime() > Date.now() &&
          !resolvedRestRequestIds.has(approval.actionId),
      ) ?? null
    : null;
  const latestRenderedLogId = renderedRows[renderedRows.length - 1]?.id ?? null;
  const storyRpUtterances = useMemo<StoryRpUtterance[]>(() => {
    const now = Date.now();
    const freshWindowMs = 5_000;

    return logs
      .slice()
      .reverse()
      .filter((log) => {
        if (log.kind !== 'action') return false;
        if (!log.message.startsWith('[MAIN]')) return false;
        if (
          log.id.startsWith('turn-log:') ||
          log.id.startsWith('player-action:') ||
          log.id.startsWith('main-command:') ||
          log.id.startsWith('system-message:')
        ) {
          return false;
        }

        const createdAt = new Date(log.createdAt).getTime();
        return Number.isFinite(createdAt) && now - createdAt <= freshWindowMs;
      })
      .map((log) => {
        const participant = participants.find((item) => item.user.displayName === log.title);
        const character = participant
          ? sessionCharacters.find((item) => item.userId === participant.userId)
          : null;

        if (!character) return null;

        return {
          id: log.id,
          characterId: character.id,
          message: stripScopePrefix(log.message),
          createdAt: log.createdAt,
        };
      })
      .filter((utterance): utterance is StoryRpUtterance => Boolean(utterance));
  }, [logs, participants, sessionCharacters]);

  const displayedParticipants = useMemo(() => {
    const minSlots = 4;
    const filled = [...participants];
    while (filled.length < minSlots) {
      filled.push(null as never);
    }
    return filled;
  }, [participants]);

  const playerParticipantIds = useMemo(
    () =>
      participants
        .filter((participant) => participant.role !== 'GM')
        .map((participant) => participant.userId),
    [participants]
  );

  useEffect(() => {
    if (!latestRenderedLogId) return;

    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [activeTab, latestRenderedLogId]);

  useEffect(() => {
    setSelectedMainTargetId('');
    setSelectedMainItemId('');
    setSelectedMainSpellId('');
    setSelectedMainRelatedIntent('');
    setMainPointX('');
    setMainPointY('');
    setSelectedExplorationMapSelection(null);
    setMainCommandError(null);
  }, [currentNode?.id]);

  useEffect(() => {
    setSelectedMainSpellId('');
    setSelectedMainRelatedIntent('');
    if (!isExplorationMainCommandContext) {
      setSelectedMainTargetId('');
      setSelectedMainItemId('');
      setMainPointX('');
      setMainPointY('');
      setSelectedExplorationMapSelection(null);
    }
    setMainCommandError(null);
  }, [isExplorationMainCommandContext, selectedMainIntent]);

  useEffect(() => {
    if (!pendingMainCommandDraft || selectedMainIntent !== pendingMainCommandDraft.intent) return;

    const draftPreset = mainCommandPresets.find(
      (preset) => preset.intent === pendingMainCommandDraft.intent
    );
    const slashCommand = draftPreset ? getMainCommandSlashCommands(draftPreset)[0] : null;
    setMainMessage(
      slashCommand
        ? `${slashCommand} ${pendingMainCommandDraft.playerText}`.trim()
        : pendingMainCommandDraft.playerText
    );
    setSelectedMainTargetId(pendingMainCommandDraft.targetId ?? '');
    setSelectedMainItemId(pendingMainCommandDraft.itemId ?? '');
    setMainPointX(
      pendingMainCommandDraft.mapPoint ? String(pendingMainCommandDraft.mapPoint.x) : ''
    );
    setMainPointY(
      pendingMainCommandDraft.mapPoint ? String(pendingMainCommandDraft.mapPoint.y) : ''
    );
    setMainCommandError(null);
    setPendingMainCommandDraft(null);
  }, [mainCommandPresets, pendingMainCommandDraft, selectedMainIntent]);

  useEffect(() => {
    if (
      selectedMainTargetId &&
      !visibleTargetOptions.some((target) => target.id === selectedMainTargetId)
    ) {
      setSelectedMainTargetId('');
    }
  }, [selectedMainTargetId, visibleTargetOptions]);

  function resetQuickCreateForm() {
    setFormState(createDefaultQuickCreateForm(races, classDefinitions));
  }

  function openCreateModal() {
    resetQuickCreateForm();
    setCreateModalOpen(true);
  }

  function handleOpenRecruitingCreate() {
    onNavigateToCharacters();
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    resetQuickCreateForm();
  }

  async function handleCreateCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedQuickCreateClass) {
      return;
    }

    const payload: CharacterPayload = {
      name: formState.name.trim(),
      ancestry: selectedQuickCreateRace?.koName ?? formState.ancestryKey,
      className: toStoredClassName(selectedQuickCreateClass.key),
      subclassName:
        quickCreateLevel >=
        (QUICK_CREATE_SUBCLASS_BY_CLASS_KEY[selectedQuickCreateClass.key]?.choiceLevel ??
          Number.POSITIVE_INFINITY)
          ? QUICK_CREATE_SUBCLASS_BY_CLASS_KEY[selectedQuickCreateClass.key]?.subclassName ?? null
          : null,
      avatarType: quickCreatePresetId ? 'PRESET' : 'DEFAULT',
      avatarPresetId: quickCreatePresetId,
      avatarUrl: null,
      scenarioId: quickCreateScenarioId,
      level: quickCreateLevel,
      abilities: quickCreateAbilities,
      proficiencyBonus: quickCreateProficiencyBonus,
      proficientSkills: quickCreateProficientSkills,
      features: quickCreateFeatures,
      maxHp: quickCreateMaxHp,
      armorClass: quickCreateArmorClass,
      speed: quickCreateSpeed,
      startingEquipmentSelection: new Array(
        selectedQuickCreateClass.startingEquipment.slots.length,
      ).fill(0),
      startingEquipmentItemSelections:
        getDefaultStartingEquipmentItemSelections(selectedQuickCreateClass),
      startingSpells: getDefaultQuickCreateStartingSpells(
        selectedQuickCreateClass,
        quickCreateLevel,
        quickCreateAbilities,
        ruleCatalog,
      ),
      assignToSession: true,
    };

    const succeeded = await onCreateCharacter(payload);
    if (succeeded) {
      closeCreateModal();
    }
  }

  function applyMainCommandAutocomplete(command: MainCommandPreset) {
    const slashCommand = getMainCommandSlashCommands(command)[0];
    if (!slashCommand) return;

    setMainCommandMode('GM_REQUEST');
    setMainMessage(`${slashCommand} `);
    setSelectedMainIntent(command.intent);
    setActiveMainHelperGroup(
      getMainCommandHelperGroupForSelection(command, activeMainHelperOption?.id)
    );
    setCommandGuideOpen(false);
    setMainCommandError(null);
  }

  function handleSidebarInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (
      activeTab !== 'Main' ||
      mainCommandMode !== 'GM_REQUEST' ||
      !shouldShowMainCommandAutocomplete ||
      !mainCommandAutocompleteCommandEntries.length
    ) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMainCommandAutocompleteIndex((current) => {
        const baseIndex = current >= 0 ? current : -1;
        return (baseIndex + 1) % mainCommandAutocompleteCommandEntries.length;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMainCommandAutocompleteIndex((current) => {
        const baseIndex = current >= 0 ? current : 0;
        return (
          (baseIndex - 1 + mainCommandAutocompleteCommandEntries.length) %
          mainCommandAutocompleteCommandEntries.length
        );
      });
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setMainCommandAutocompleteIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setMainCommandAutocompleteIndex(mainCommandAutocompleteCommandEntries.length - 1);
      return;
    }

    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      const selectedEntry =
        activeMainCommandAutocompleteEntry ?? mainCommandAutocompleteCommandEntries[0];
      if (selectedEntry) {
        applyMainCommandAutocomplete(selectedEntry.command);
      }
    }
  }

  async function handleMainSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = mainMessage.trim();
    if (!next) return;

    if (mainCommandMode === 'RP_ACTION') {
      setMainCommandError(null);
      setMainMessage('');
      setPendingMainCommandCheck(null);
      onAction(`MAIN:${next}`);
      return;
    }

    if (session?.gmMode === 'AI' && currentScreenType) {
      const parsedSlash = parseMainSlashInput(next, mainCommandPresets);
      const submitPreset: MainCommandPreset | null = parsedSlash?.type === 'matched'
        ? parsedSlash.preset
        : parsedSlash
          ? null
          : buildGeneralGmPreset(currentScreenType);

      if (!submitPreset) {
        setMainCommandError(
          parsedSlash?.type === 'unknown'
            ? `현재 장면에서 사용할 수 없는 명령어입니다: ${parsedSlash.command}`
            : '명령어를 선택하거나 내용을 입력해주세요.'
        );
        return;
      }

      const commandBody =
        parsedSlash?.type === 'matched' ? parsedSlash.playerText : next;
      const playerText = commandBody.trim() || submitPreset.label;
      const activeFieldConfig =
        mainCommandFieldConfigByIntent[submitPreset.intent] ??
        activeMainHelperOption?.fieldConfig ??
        null;
      const pointX = mainPointX.trim();
      const pointY = mainPointY.trim();
      const hasMapPoint = pointX !== '' && pointY !== '';
      const mapPoint =
        hasMapPoint && Number.isFinite(Number(pointX)) && Number.isFinite(Number(pointY))
          ? { x: Number(pointX), y: Number(pointY) }
          : null;
      const requiresTarget = doesMainCommandRequireTarget(submitPreset.intent);
      const requiresItem = Boolean(activeFieldConfig?.requiresItem);
      const requiresSpell = Boolean(activeFieldConfig?.requiresSpell);
      const requiresMapPoint = Boolean(activeFieldConfig?.requiresMapPoint);
      const allowsMapPoint = Boolean(activeFieldConfig?.allowsMapPoint);
      const requiresTargetOrPoint =
        submitPreset.intent === MainCommandIntentValues.INVESTIGATE_OBJECT ||
        submitPreset.intent === MainCommandIntentValues.INTERACT_OBJECT ||
        submitPreset.intent === MainCommandIntentValues.ENVIRONMENT_USE;
      const shouldSubmitTarget = Boolean(
        selectedMainTargetId &&
        (activeFieldConfig?.targetTypes?.length ||
          (isExplorationMainCommandContext && selectedMainTarget))
      );
      const shouldSubmitItem = Boolean(
        selectedMainItemId && selectedMainItem && (requiresItem || isExplorationMainCommandContext)
      );
      const shouldSubmitSpell = Boolean(selectedMainSpellId.trim() && requiresSpell);
      const shouldSubmitRelatedIntent = Boolean(
        selectedMainRelatedIntent && activeFieldConfig?.allowsRelatedIntent
      );

      if (requiresTarget && !shouldSubmitTarget && !(allowsMapPoint && mapPoint)) {
        setMainCommandError('이 명령은 현재 장면의 공개 대상을 함께 골라야 합니다.');
        return;
      }
      if (requiresItem && !shouldSubmitItem) {
        setMainCommandError('이 명령은 사용할 아이템을 함께 골라야 합니다.');
        return;
      }
      if (requiresSpell && !selectedMainSpellId.trim()) {
        setMainCommandError('이 명령은 사용할 주문 ID 또는 이름을 함께 적어야 합니다.');
        return;
      }
      if (requiresMapPoint && !mapPoint) {
        setMainCommandError('이 명령은 지도 좌표 x, y를 함께 입력해야 합니다.');
        return;
      }
      if (requiresTargetOrPoint && !shouldSubmitTarget && !mapPoint && !commandBody.trim()) {
        setMainCommandError('대상을 선택하거나, 무엇을 할지 입력해주세요.');
        return;
      }
      if ((pointX !== '' || pointY !== '') && !mapPoint) {
        setMainCommandError('지도 좌표는 숫자 x, y를 모두 입력해야 합니다.');
        return;
      }

      const actorId =
        selectedCharacterId ??
        myParticipant?.sessionCharacterId ??
        myParticipant?.characterId ??
        '';
      setMainCommandError(null);
      setMainMessage('');
      const response = await onMainCommand({
        commandId: submitPreset.intent,
        screenType: currentScreenType,
        category: submitPreset.category,
        intent: submitPreset.intent,
        actorId,
        playerText,
        // 명령어 처리는 본문만 넘기되, 로그에는 사용자가 입력한 슬래시 원문을 그대로 남긴다.
        rawInputText: next,
        ...(currentNode ? { nodeId: currentNode.id } : {}),
        ...(shouldSubmitTarget ? { targetId: selectedMainTargetId } : {}),
        ...(shouldSubmitTarget && selectedMainTarget?.targetType
          ? { targetType: selectedMainTarget.targetType }
          : {}),
        ...(shouldSubmitItem ? { itemId: selectedMainItemId } : {}),
        ...(shouldSubmitSpell ? { spellId: selectedMainSpellId.trim() } : {}),
        ...(mapPoint &&
          (requiresMapPoint ||
            allowsMapPoint ||
            requiresTargetOrPoint ||
            (requiresTarget && !shouldSubmitTarget) ||
            isExplorationMainCommandContext)
          ? { mapPoint }
          : {}),
        ...(shouldSubmitRelatedIntent
          ? { relatedIntent: selectedMainRelatedIntent as SubmitMainCommandDto['intent'] }
          : {}),
      });
      setPendingMainCommandCheck(null);
    } else {
      setMainMessage('');
      onAction(`MAIN:${next}`);
      setPendingMainCommandCheck(null);
    }
  }

  async function handleExplorationMainCommandRequest(request: ExplorationMainCommandRequest) {
    const preset = mainCommandPresetsByScreen.EXPLORATION.find(
      (item) => item.intent === request.intent
    );

    if (!preset) {
      setMainCommandError('현재 탐색 화면에서 사용할 수 없는 명령입니다.');
      return;
    }

    const shouldSendImmediately =
      preset.intent === MainCommandIntentValues.INVESTIGATE_OBJECT ||
      preset.intent === MainCommandIntentValues.OBSERVE_AREA ||
      preset.intent === MainCommandIntentValues.INTERACT_OBJECT ||
      preset.intent === MainCommandIntentValues.ENVIRONMENT_USE;

    if (!shouldSendImmediately) {
      setActiveTab('Main');
      setMainCommandMode('GM_REQUEST');
      setSelectedMainCategory(preset.categoryLabel);
      setOpenMainCommandCategory(null);
      setSelectedMainIntent(preset.intent);
      setActiveMainHelperGroup(getMainCommandHelperGroup(preset) ?? null);
      setPendingMainCommandDraft(request);
      return;
    }

    const actorId =
      selectedCharacterId ??
      myParticipant?.sessionCharacterId ??
      myParticipant?.characterId ??
      '';
    const fieldConfig = mainCommandFieldConfigByIntent[preset.intent] ?? null;
    const target = request.targetId
      ? currentNode?.visibleTargets.find((item) => {
        if (item.id !== request.targetId) return false;
        return fieldConfig?.targetTypes?.length
          ? fieldConfig.targetTypes.includes(item.targetType)
          : true;
      }) ?? null
      : null;
    const item = request.itemId
      ? selectedCharacterInventory.find((entry) => entry.id === request.itemId) ?? null
      : null;
    const requiresItem = Boolean(fieldConfig?.requiresItem);
    const requiresMapPoint = Boolean(fieldConfig?.requiresMapPoint);
    const allowsMapPoint = Boolean(fieldConfig?.allowsMapPoint);
    const requiresTargetOrPoint =
      preset.intent === MainCommandIntentValues.INVESTIGATE_OBJECT ||
      preset.intent === MainCommandIntentValues.INTERACT_OBJECT ||
      preset.intent === MainCommandIntentValues.ENVIRONMENT_USE;
    const shouldSubmitMapPoint = Boolean(
      request.mapPoint &&
      (requiresMapPoint || allowsMapPoint || requiresTargetOrPoint || !target)
    );
    const slashCommand = getMainCommandSlashCommands(preset)[0] ?? '';
    const rawInputText = slashCommand
      ? `${slashCommand} ${request.playerText}`.trim()
      : request.playerText;

    setActiveTab('Main');
    setMainCommandMode('GM_REQUEST');
    setSelectedMainCategory(preset.categoryLabel);
    setOpenMainCommandCategory(null);
    setSelectedMainIntent(preset.intent);
    setActiveMainHelperGroup(getMainCommandHelperGroup(preset) ?? null);
    setSelectedMainTargetId(target?.id ?? '');
    setSelectedMainItemId(item?.id ?? '');
    setMainPointX(request.mapPoint ? String(request.mapPoint.x) : '');
    setMainPointY(request.mapPoint ? String(request.mapPoint.y) : '');
    setMainMessage('');
    setPendingMainCommandCheck(null);
    setPendingMainCommandDraft(null);
    setMainCommandError(null);

    await onMainCommand({
      commandId: preset.intent,
      screenType: MainCommandScreenTypeValues.EXPLORATION,
      category: preset.category,
      intent: preset.intent,
      actorId,
      playerText: request.playerText,
      rawInputText,
      ...(currentNode ? { nodeId: currentNode.id } : {}),
      ...(target ? { targetId: target.id, targetType: target.targetType } : {}),
      ...(item && (requiresItem || isExplorationMainCommandContext) ? { itemId: item.id } : {}),
      ...(shouldSubmitMapPoint && request.mapPoint ? { mapPoint: request.mapPoint } : {}),
    });
  }

  const handleExplorationMapSelection = useCallback((selection: BattleMapSelection | null) => {
    setSelectedExplorationMapSelection(selection);
    setSelectedMainTargetId(
      selection?.kind === 'token' && selection.token.npcId ? selection.token.npcId : ''
    );
    setMainPointX(selection ? String(Math.round(selection.point.x)) : '');
    setMainPointY(selection ? String(Math.round(selection.point.y)) : '');
  }, []);

  const handleSelectExplorationInventoryItem = useCallback((item: InventoryItemDto | null) => {
    setSelectedMainItemId((current) => (item && current !== item.id ? item.id : ''));
  }, []);

  async function handleResolveMainCommandCheck(outcome: ActionOutcome) {
    if (!pendingMainCommandCheck) return;

    const actorId =
      selectedCharacterId ??
      myParticipant?.sessionCharacterId ??
      myParticipant?.characterId ??
      undefined;
    setMainCommandError(null);
    const response = await onResolveMainCommandCheck({
      requestId: pendingMainCommandCheck.requestId,
      outcome,
      effect: pendingMainCommandCheck.effect,
      ...(actorId ? { actorId } : {}),
    });

    if (response?.status === 'IMPOSSIBLE') {
      setMainCommandError(response.message);
      return;
    }

    setPendingMainCommandCheck(null);
  }

  async function handleUseExplorationInventoryItem(
    item: InventoryItemDto,
    targetSessionCharacterId?: string | null,
    targetParticipantId?: string | null,
    point?: { x: number; y: number } | null
  ) {
    if (busy || isInventoryUsePending || !session) return;

    setInventoryUseFeedback(null);
    setInventoryUsePending(true);
    try {
      const result = await useInventoryItem(user, session.id, {
        itemId: item.id,
        ...(targetSessionCharacterId ? { targetSessionCharacterId } : {}),
        ...(targetParticipantId ? { targetParticipantId } : {}),
        ...(point ? { point } : {}),
      });
      setInventoryUseFeedback(result.message);
    } catch (caught) {
      setInventoryUseFeedback(
        caught instanceof Error ? caught.message : '아이템 사용에 실패했습니다.'
      );
    } finally {
      setInventoryUsePending(false);
    }
  }

  async function handleEquipInventoryItem(item: InventoryItemDto) {
    if (busy || isInventoryUsePending || !selectedSessionCharacter) return;

    const equipmentDisplayState = (
      item as InventoryItemDto & { __equipmentDisplayState?: 'equipped' | 'available' }
    ).__equipmentDisplayState;
    const equipmentItemId = item.itemDefinitionId ?? item.id;
    const isShield = isShieldInventoryItem(item);
    const isEquipped =
      Boolean(selectedSessionCharacter.equippedWeaponId) &&
      (item.id === selectedSessionCharacter.equippedWeaponId ||
        item.itemDefinitionId === selectedSessionCharacter.equippedWeaponId ||
        item.name === selectedSessionCharacter.equippedWeaponId);
    const isOffhandEquipped =
      Boolean(selectedSessionCharacter.offhandWeaponId) &&
      (item.id === selectedSessionCharacter.offhandWeaponId ||
        item.itemDefinitionId === selectedSessionCharacter.offhandWeaponId ||
        item.name === selectedSessionCharacter.offhandWeaponId);
    const shouldUnequip =
      equipmentDisplayState === 'equipped' ||
      (equipmentDisplayState === undefined && (isEquipped || isOffhandEquipped));
    const nextEquippedWeaponId = isShield
      ? undefined
      : shouldUnequip
        ? isOffhandEquipped
          ? undefined
          : null
        : equipmentItemId;
    const nextOffhandWeaponId = isShield
      ? shouldUnequip
        ? null
        : equipmentItemId
      : shouldUnequip && isOffhandEquipped
        ? null
        : undefined;

    setInventoryUseFeedback(null);
    setInventoryUsePending(true);
    try {
      await updateCharacterEquipment(user, selectedSessionCharacter.characterId, {
        equippedWeaponId: nextEquippedWeaponId,
        offhandWeaponId: nextOffhandWeaponId,
      });
      setInventoryUseFeedback(
        shouldUnequip
          ? `${item.name} 착용을 해제했습니다.`
          : `${item.name}을(를) 착용했습니다.`
      );
    } catch (caught) {
      setInventoryUseFeedback(caught instanceof Error ? caught.message : '장비 변경에 실패했습니다.');
    } finally {
      setInventoryUsePending(false);
    }
  }

  async function handleGmGrantInventoryItem(
    sessionCharacterId: string,
    item: ItemResponseDto,
    quantity: number
  ) {
    if (!session || !canUseHumanGmView || isGmInventoryGrantPending) return;

    setInventoryUseFeedback(null);
    setGmInventoryGrantPending(true);
    try {
      await grantHumanGmInventoryItem(user, session.id, {
        sessionCharacterId,
        itemDefinitionId: item.id,
        quantity,
      });
      setInventoryUseFeedback(`${item.koName} x${quantity}을(를) 지급했습니다.`);
      onAction('GM 아이템 지급');
    } catch (caught) {
      setInventoryUseFeedback(
        caught instanceof Error ? caught.message : '아이템 지급에 실패했습니다.'
      );
    } finally {
      setGmInventoryGrantPending(false);
    }
  }

  async function handleEconomyAction(payload: ApplySessionEconomyActionDto) {
    if (!session || !canManageStartedSession || isEconomyPending) return;
    setEconomyPending(true);
    setEconomyFeedback(null);
    try {
      await applyHumanGmEconomyAction(user, session.id, payload);
      setEconomyFeedback(`${payload.actionType} 처리가 완료되었습니다.`);
      onAction(`경제 처리: ${payload.actionType}`);
    } catch (caught) {
      setEconomyFeedback(caught instanceof Error ? caught.message : "경제 처리에 실패했습니다.");
    } finally {
      setEconomyPending(false);
    }
  }

  async function handleCampaignCalendarAction(payload: ApplyCampaignCalendarActionDto) {
    const isPlayerCalendarAction =
      payload.actionType === "propose_schedule" || payload.actionType === "respond_schedule";
    if (
      !session ||
      isCampaignCalendarPending ||
      (!canManageStartedSession && !isPlayerCalendarAction)
    ) {
      return;
    }
    setCampaignCalendarPending(true);
    setCampaignCalendarFeedback(null);
    try {
      await applyCampaignCalendarAction(user, session.id, payload);
      setCampaignCalendarFeedback(`${payload.actionType} 처리가 완료되었습니다.`);
      onAction(`캠페인 캘린더: ${payload.actionType}`);
    } catch (caught) {
      setCampaignCalendarFeedback(
        caught instanceof Error ? caught.message : "캠페인 캘린더 처리에 실패했습니다."
      );
    } finally {
      setCampaignCalendarPending(false);
    }
  }

  async function handleEquippedWeaponAttack(targetParticipantId: string) {
    if (!session || isCombatBusy) return;
    await runCombatRequest(() =>
      resolveEquippedWeaponAttack(user, session.id, { targetParticipantId })
    );
  }

  async function handleOffhandWeaponAttack(targetParticipantId: string) {
    if (!session || isCombatBusy) return;
    await runCombatRequest(() =>
      resolveOffhandWeaponAttack(user, session.id, { targetParticipantId })
    );
  }

  async function handleSneakAttack(targetParticipantId: string) {
    if (!session || isCombatBusy) return;
    await runCombatRequest(() =>
      resolveSneakAttackCombatAction(user, session.id, { targetParticipantId })
    );
  }

  async function handleMonsterCombatAction(
    targetParticipantId?: string | null,
    actionType: 'attack' | 'dash' | 'dodge' | 'hide' = 'attack',
    actionId?: string | null
  ) {
    if (!session || isCombatBusy) return;
    await runCombatRequest(async () => {
      const result = await resolveCombatActorAction(user, session.id, {
        actionType,
        actionId: actionId ?? null,
        targetParticipantId: targetParticipantId ?? null,
        autoEndTurn: false,
      });
      if (result.map) {
        setVttMap(result.map);
        latestConfirmedMapRef.current = result.map;
      }
      return result;
    });
  }

  async function handleDashCombatAction() {
    if (!session || isCombatBusy) return;
    await runCombatRequest(() => dashCombatAction(user, session.id));
  }

  async function handleDodgeCombatAction() {
    if (!session || isCombatBusy) return;
    await runCombatRequest(() => dodgeCombatAction(user, session.id));
  }

  async function handleHideCombatAction() {
    if (!session || isCombatBusy) return;
    await runCombatRequest(() => hideCombatAction(user, session.id));
  }

  async function executeGmMessage(payload: {
    content: string;
    speakerName?: string | null;
    asNpc?: boolean;
    privateNote?: string | null;
  }) {
    if (!session || !canUseHumanGmView) {
      throw new Error('HUMAN GM 메시지를 실행할 수 없는 세션 상태입니다.');
    }

    const nextSnapshot = await createHumanGmMessage(user, session.id, {
      content: payload.content,
      speakerName: payload.speakerName?.trim() || undefined,
      asNpc: payload.asNpc,
      privateNote: payload.privateNote?.trim() || null,
    });
    const nextMap = nextSnapshot.state.flags?.vttMap as VttMapStateDto | undefined;
    if (nextMap && typeof nextMap === 'object') {
      latestConfirmedMapRef.current = nextMap;
      setVttMap(nextMap);
    }
    onAction(payload.asNpc ? 'GM NPC 대사' : 'GM 장면 묘사');
  }

  async function handleGmMessage(payload: {
    content: string;
    speakerName?: string | null;
    asNpc?: boolean;
    privateNote?: string | null;
  }) {
    if (!session || !canUseHumanGmView || isGmMessagePending) return;

    setGmMessagePending(true);
    setScenarioLoadError(null);
    try {
      await executeGmMessage(payload);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'GM 메시지 전송에 실패했습니다.';
      setScenarioLoadError(message);
      onCombatActionLog(message);
    } finally {
      setGmMessagePending(false);
    }
  }

  async function handleGmAiAssistCreate(payload: CreateHumanGmAiAssistSuggestionDto) {
    if (!session || !canUseHumanGmView || isGmAiAssistPending) return;

    setGmAiAssistPending(true);
    setScenarioLoadError(null);
    try {
      const suggestion = await createHumanGmAiAssistSuggestion(user, session.id, payload);
      setGmAiAssistSuggestions((current) => [
        suggestion,
        ...current.filter((candidate) => candidate.id !== suggestion.id),
      ]);
      onAction('GM AI 보조 제안 등록');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'AI 보조 제안 등록에 실패했습니다.';
      setScenarioLoadError(message);
      onCombatActionLog(message);
    } finally {
      setGmAiAssistPending(false);
    }
  }

  async function handleGmAiAssistGenerate(payload: AiHumanGmAssistSuggestionRequestDto) {
    if (!session || !canUseHumanGmView || isGmAiAssistPending) return;

    setGmAiAssistPending(true);
    setScenarioLoadError(null);
    try {
      const suggestion = await generateHumanGmAiAssistSuggestion(user, session.id, payload);
      setGmAiAssistSuggestions((current) => [
        suggestion,
        ...current.filter((candidate) => candidate.id !== suggestion.id),
      ]);
      onAction('GM AI 보조 제안 생성');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'AI 보조 제안 생성에 실패했습니다.';
      setScenarioLoadError(message);
      onCombatActionLog(message);
    } finally {
      setGmAiAssistPending(false);
    }
  }

  async function handleGmAiAssistAccept(suggestion: HumanGmAiAssistSuggestionDto) {
    if (!session || !canUseHumanGmView || isGmAiAssistPending) return;

    let acceptanceRecorded = false;
    setGmAiAssistPending(true);
    setScenarioLoadError(null);
    try {
      await acceptHumanGmAiAssistSuggestion(user, session.id, {
        suggestionId: suggestion.id,
        publicNarration: 'GM이 AI 보조 제안을 승인했습니다.',
      });
      acceptanceRecorded = true;
      setGmAiAssistSuggestions((current) =>
        current.map((candidate) =>
          candidate.id === suggestion.id
            ? {
                ...candidate,
                status: 'ACCEPTED',
                acceptedByUserId: user.id,
                acceptedAt: new Date().toISOString(),
              }
            : candidate
        )
      );

      if (suggestion.assistType === 'scene_text') {
        await executeGmMessage({ content: suggestion.content });
      } else if (suggestion.assistType === 'npc_dialogue') {
        await executeGmMessage({
          content: suggestion.content,
          speakerName: suggestion.targetId,
          asNpc: true,
        });
      } else if (suggestion.assistType === 'node_move') {
        const nodeId = suggestion.suggestedActionId ?? suggestion.targetId;
        if (!nodeId) {
          throw new Error('승인된 장면 이동 제안에 대상 노드가 없습니다.');
        }
        await executeGmNodeMove(nodeId);
      }
      onAction('GM AI 보조 제안 승인');
    } catch (caught) {
      const cause = caught instanceof Error ? caught.message : '알 수 없는 오류';
      const message = acceptanceRecorded
        ? `AI 보조 제안 승인은 기록됐지만 적용에 실패했습니다: ${cause}`
        : `AI 보조 제안 승인에 실패했습니다: ${cause}`;
      if (acceptanceRecorded) {
        try {
          await reportHumanGmAiAssistApplicationFailure(user, session.id, {
            suggestionId: suggestion.id,
            failedOperation: suggestion.assistType,
            failureReason: cause.slice(0, 500),
          });
        } catch (auditError) {
          console.warn('Failed to audit GM AI assist application failure.', auditError);
        }
      }
      setScenarioLoadError(message);
      onCombatActionLog(message);
    } finally {
      setGmAiAssistPending(false);
    }
  }

  async function handleReadyCombatAction(targetParticipantId: string) {
    if (!session || isCombatBusy) return;
    await onSendAction(`/ready enter attack ${targetParticipantId} 30`);
  }

  async function handleApplyCombatCondition(
    targetTokenOrParticipantId: string,
    conditionId: string,
    operation: 'add' | 'remove'
  ) {
    if (!session || isCombatBusy) return;
    if (!canUseHumanGmView) {
      await onSendAction(`/condition ${operation} ${targetTokenOrParticipantId} ${conditionId}`);
      return;
    }

    setCombatBusy(true);
    setCombatError(null);
    try {
      const nextSnapshot = await applyHumanGmCombatCondition(user, session.id, {
        targetId: targetTokenOrParticipantId,
        conditionId,
        operation,
      });
      const nextMap = nextSnapshot.state.flags?.vttMap as VttMapStateDto | undefined;
      if (nextMap && typeof nextMap === 'object') {
        latestConfirmedMapRef.current = nextMap;
        setVttMap(nextMap);
      }
      const refreshedCombat = await getCombat(user, session.id);
      setCombat(refreshedCombat);
      onCombatActionLog('GM 상태 조정 완료');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'GM 상태 조정에 실패했습니다.';
      setCombatError(message);
      onCombatActionLog(message);
    } finally {
      setCombatBusy(false);
    }
  }

  async function handleAdjustCombatHp(
    targetTokenOrParticipantId: string,
    currentHp: number
  ) {
    if (!session || !canUseHumanGmView || isCombatBusy) return;

    setCombatBusy(true);
    setCombatError(null);
    try {
      const nextSnapshot = await adjustHumanGmCombatHp(user, session.id, {
        targetId: targetTokenOrParticipantId,
        currentHp,
      });
      const nextMap = nextSnapshot.state.flags?.vttMap as VttMapStateDto | undefined;
      if (nextMap && typeof nextMap === 'object') {
        latestConfirmedMapRef.current = nextMap;
        setVttMap(nextMap);
      }
      const refreshedCombat = await getCombat(user, session.id);
      setCombat(refreshedCombat);
      onCombatActionLog('GM HP 조정 완료');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'GM HP 조정에 실패했습니다.';
      setCombatError(message);
      onCombatActionLog(message);
    } finally {
      setCombatBusy(false);
    }
  }

  async function handleDropInventoryItem(
    item: InventoryItemDto,
    point: { x: number; y: number }
  ) {
    if (!session || busy || isInventoryUsePending) return;
    const itemId = item.id || item.itemDefinitionId;
    if (!itemId) return;
    await onSendAction(`/item drop ${itemId} 1 ${point.x} ${point.y}`);
  }

  async function handlePickupMapObject(
    objectId: string,
    itemDefinitionId: string,
    quantity: number,
    point: { x: number; y: number }
  ) {
    if (!session || busy || isInventoryUsePending) return;
    await onSendAction(`/item pickup ${objectId} ${itemDefinitionId} ${quantity} ${point.x} ${point.y}`);
  }

  async function handleThrowInventoryItem(
    item: InventoryItemDto,
    point: { x: number; y: number }
  ) {
    if (!session || isCombatBusy) return;
    const itemId = item.id || item.itemDefinitionId;
    if (!itemId) return;
    await onSendAction(`/item throw ${itemId} 1 ${point.x} ${point.y}`);
  }

  async function handleCombatClassFeature(
    action:
      | 'second_wind'
      | 'action_surge'
      | 'rage'
      | 'frenzy'
      | 'cunning_dash'
      | 'cunning_disengage'
      | 'cunning_hide'
      | 'divine_sense'
      | 'lay_on_hands'
      | 'primeval_awareness'
      | 'ki_patient_defense'
      | 'ki_step_of_wind'
      | 'channel_divinity'
      | 'bardic_inspiration'
      | 'font_of_magic'
      | 'wild_shape'
      | 'dragonborn_breath',
    targetParticipantId?: string
  ) {
    if (!session || isCombatBusy) return;
    if (action === 'second_wind') {
      await runCombatRequest(() => useSecondWindCombatAction(user, session.id));
      return;
    }
    if (action === 'action_surge') {
      await onSendAction('/feature action_surge');
      return;
    }
    if (action === 'rage') {
      await onSendAction('/feature rage');
      return;
    }
    if (action === 'frenzy') {
      await onSendAction('/feature frenzy');
      return;
    }
    if (action.startsWith('cunning_')) {
      await onSendAction(`/feature cunning_action ${action.slice('cunning_'.length)}`);
      return;
    }
    if (
      action === 'divine_sense' ||
      action === 'lay_on_hands' ||
      action === 'primeval_awareness'
    ) {
      await onSendAction(`/feature ${action}`);
      return;
    }
    if (action === 'ki_patient_defense' || action === 'ki_step_of_wind') {
      await onSendAction(
        `/feature ki ${
          action === 'ki_patient_defense' ? 'patient_defense' : 'step_of_the_wind'
        }`
      );
      return;
    }
    if (action === 'channel_divinity') {
      await onSendAction('/feature channel_divinity');
      return;
    }
    if (action === 'bardic_inspiration' && targetParticipantId) {
      await onSendAction(`/feature bardic_inspiration ${targetParticipantId}`);
      return;
    }
    if (action === 'font_of_magic') {
      await onSendAction('/feature font_of_magic');
      return;
    }
    if (action === 'wild_shape') {
      await onSendAction('/feature wild_shape');
      return;
    }
    if (action === 'dragonborn_breath' && targetParticipantId) {
      await onSendAction(`/feature breath_weapon ${targetParticipantId}`);
    }
  }

  async function handleCastCombatSpell(
    spellId: string,
    payload: {
      targetParticipantIds?: string[];
      point?: { x: number; y: number } | null;
      slotLevel?: number;
    }
  ) {
    if (!session || isCombatBusy) return;
    await runCombatRequest(async () => {
      const result = await castCombatSpell(user, session.id, { spellId, ...payload });
      if (result.map) {
        setVttMap(result.map);
        latestConfirmedMapRef.current = result.map;
      }
      return result;
    });
  }

  async function handleCombatTokenMoveRequest(
    token: VttMapStateDto['tokens'][number],
    to: { x: number; y: number },
    path: Array<{ x: number; y: number }>,
    movementMode: 'normal' | 'jump' = 'normal'
  ): Promise<VttMapStateDto | null> {
    if (!session || !combat || isCombatBusy) return null;
    const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    const participant = combat.participants.find(
      (candidate) =>
        candidate.tokenId === token.id ||
        (candidate.sessionCharacterId && candidate.sessionCharacterId === token.sessionCharacterId)
    );
    if (!participant) {
      setMapLoadError('이동할 전투 참여자를 찾을 수 없습니다.');
      return null;
    }

    setCombatBusy(true);
    setCombatError(null);
    setMapLoadError(null);
    const previousMap = vttMap ?? latestConfirmedMapRef.current;
    const optimisticUpdatedAt = new Date().toISOString();
    const optimisticMap = applyOptimisticTokenMove(previousMap, token.id, to, optimisticUpdatedAt);
    if (optimisticMap) {
      pendingOptimisticTokenMoveRef.current = {
        tokenId: token.id,
        optimisticUpdatedAt,
        previousMap: previousMap as VttMapStateDto,
      };
      setVttMap(optimisticMap);
    }
    try {
      let result = await moveCombatParticipant(user, session.id, {
        participantId: participant.sessionEntityId,
        to,
        path,
        movementMode,
      });

      const pendingPrompts = getCombatReactionPrompts(result);
      if (pendingPrompts.length) {
        const promptToHandle = pendingPrompts.find(
          (prompt) =>
            isCombatReactionForCurrentUser(prompt, result.combat) &&
            claimCombatReactionHandling(prompt.id)
        );
        if (!promptToHandle) {
          if (pendingPrompts.every((prompt) => prompt.type === 'ready_action')) {
            setCombat(result.combat);
            setVttMapIfChanged(result.map, 'combat-move-ready-pending');
            pendingOptimisticTokenMoveRef.current = null;
            logMapMovePerf('combat move request', requestStartedAt, `token=${token.id}`);
            onCombatActionLog(formatCombatMoveResultMessage(result));
            return result.map;
          }
          const pendingMove = pendingOptimisticTokenMoveRef.current;
          if (pendingMove?.tokenId === token.id && pendingMove.optimisticUpdatedAt === optimisticUpdatedAt) {
            setVttMap((current) =>
              current?.updatedAt === optimisticUpdatedAt ? pendingMove.previousMap : current
            );
            pendingOptimisticTokenMoveRef.current = null;
          }
          return null;
        }
        const accepted = await requestCombatReactionDecision(promptToHandle);
        result = accepted
          ? await acceptCombatReaction(user, session.id, { reactionId: promptToHandle.id })
          : await declineCombatReaction(user, session.id, { reactionId: promptToHandle.id });
      }

      setCombat(result.combat);
      setVttMapIfChanged(result.map, 'combat-move');
      pendingOptimisticTokenMoveRef.current = null;
      logMapMovePerf('combat move request', requestStartedAt, `token=${token.id}`);
      onCombatActionLog(formatCombatMoveResultMessage(result));
      return result.map;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '전투 이동에 실패했습니다.';
      setCombatError(message);
      setMapLoadError(message);
      const pendingMove = pendingOptimisticTokenMoveRef.current;
      if (pendingMove?.tokenId === token.id && pendingMove.optimisticUpdatedAt === optimisticUpdatedAt) {
        setVttMap((current) =>
          current?.updatedAt === optimisticUpdatedAt ? pendingMove.previousMap : current
        );
        pendingOptimisticTokenMoveRef.current = null;
      }
      return null;
    } finally {
      setCombatBusy(false);
    }
  }

  async function handleForceMoveCombatParticipant(
    participantId: string,
    mode: 'push' | 'pull' | 'slide',
    origin: { x: number; y: number },
    distanceFt: number
  ) {
    if (!session || !combat || isCombatBusy) return;

    setCombatBusy(true);
    setCombatError(null);
    setMapLoadError(null);

    try {
      let result = await forceMoveCombatParticipant(user, session.id, {
        participantId,
        mode,
        origin,
        distanceFt,
      });
      setCombat(result.combat);
      setVttMapIfChanged(result.map, 'combat-force-move');
      onCombatActionLog(formatCombatMoveResultMessage(result));
      const promptToHandle = getCombatReactionPrompts(result).find(
        (prompt) =>
          isCombatReactionForCurrentUser(prompt, result.combat) &&
          claimCombatReactionHandling(prompt.id)
      );
      if (promptToHandle) {
        const accepted = await requestCombatReactionDecision(promptToHandle);
        result = accepted
          ? await acceptCombatReaction(user, session.id, { reactionId: promptToHandle.id })
          : await declineCombatReaction(user, session.id, { reactionId: promptToHandle.id });
        setCombat(result.combat);
        setVttMapIfChanged(result.map, 'combat-force-move-reaction');
        onCombatActionLog(formatCombatMoveResultMessage(result));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '강제 이동 처리에 실패했습니다.';
      setCombatError(message);
      setMapLoadError(message);
    } finally {
      setCombatBusy(false);
    }
  }

  useEffect(() => {
    function handleReactionPrompt(event: Event) {
      if (!session) return;
      const reaction = (event as CustomEvent<CombatReactionPromptDto>).detail;
      if (
        !reaction ||
        !['opportunity_attack', 'shield', 'ready_action', 'counterspell'].includes(reaction.type)
      ) return;
      if (!isCombatReactionForCurrentUser(reaction)) return;
      if (!claimCombatReactionHandling(reaction.id)) return;
      void requestCombatReactionDecision(reaction)
        .then((accepted) => {
          const request = accepted ? acceptCombatReaction : declineCombatReaction;
          return request(user, session.id, { reactionId: reaction.id });
        })
        .then((result) => {
          setCombat(result.combat);
          setVttMap(result.map);
          latestConfirmedMapRef.current = result.map;
          onCombatActionLog(formatCombatMoveResultMessage(result));
        })
        .catch((caught) => {
          const message = caught instanceof Error ? caught.message : '반응 처리에 실패했습니다.';
          setCombatError(message);
        });
    }

    window.addEventListener('trpg:combat-reaction-prompt', handleReactionPrompt);
    return () => window.removeEventListener('trpg:combat-reaction-prompt', handleReactionPrompt);
  }, [
    combat,
    onCombatActionLog,
    requestCombatReactionDecision,
    session,
    sessionCharacters,
    user,
  ]);

  useEffect(() => {
    if (!session || !combat) return;
    const reaction = getCombatReactionPrompts(combat).find(
      (candidate) =>
        isCombatReactionForCurrentUser(candidate, combat) &&
        claimCombatReactionHandling(candidate.id)
    );
    if (!reaction) return;

    void requestCombatReactionDecision(reaction)
      .then((accepted) => {
        const request = accepted ? acceptCombatReaction : declineCombatReaction;
        return request(user, session.id, { reactionId: reaction.id });
      })
      .then((result) => {
        setCombat(result.combat);
        setVttMap(result.map);
        latestConfirmedMapRef.current = result.map;
        onCombatActionLog(formatCombatMoveResultMessage(result));
      })
      .catch((caught) => {
        const message = caught instanceof Error ? caught.message : '반응 처리에 실패했습니다.';
        setCombatError(message);
      });
  }, [
    combat,
    onCombatActionLog,
    requestCombatReactionDecision,
    session,
    sessionCharacters,
    user,
  ]);

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = chatMessage.trim();
    if (!next) return;
    onAction(`CHAT:${next}`);
    setChatMessage('');
  }

  function handleCharacterSelectionConfirm() {
    if (busy || readyLocked || !wantedCarouselCharacter) return;
    if (wantedCarouselCharacter.isDisabled) return;
    if (wantedCarouselCharacter.id === selectedCharacterId) return;

    setLocalSelectedCharacterId(wantedCarouselCharacter.id);
    onSelectCharacter(wantedCarouselCharacter.id);
  }

  function handleCharacterSelectionClear() {
    if (busy || readyLocked || !selectedCharacterId) return;

    setLocalSelectedCharacterId(null);
    onSelectCharacter(null);
  }

  function handleWantedCarouselStep(direction: -1 | 1) {
    if (busy || readyLocked || selectedCharacterId || !wantedCarouselCharacters.length) return;

    const currentIndex = wantedCarouselCharacter
      ? wantedCarouselCharacters.findIndex((character) => character.id === wantedCarouselCharacter.id)
      : -1;
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (safeCurrentIndex + direction + wantedCarouselCharacters.length) %
      wantedCarouselCharacters.length;
    setCharacterCarouselIndex(nextIndex);
  }

  async function flushPendingMapSave(sessionId: string) {
    const saveState = mapSaveRef.current;
    if (saveState.isSaving) {
      return;
    }

    const mapToSave = saveState.pending;
    if (!mapToSave) {
      return;
    }

    saveState.pending = null;
    saveState.isSaving = true;

    try {
      const savedMap = canUseHumanGmView
        ? await updateGmVttMap(user, sessionId, mapToSave)
        : await updateVttMap(user, sessionId, mapToSave);
      if (mapSaveRef.current.activeSessionId === sessionId) {
        latestConfirmedMapRef.current = savedMap;
        setMapLoadError(null);
        setVttMap((current) => (current === mapToSave ? savedMap : current));
        if (combat?.sessionId === sessionId && combat.status === 'ACTIVE') {
          const refreshedCombat = await getCombat(user, sessionId);
          setCombat(refreshedCombat);
        }
      }
    } catch (caught) {
      if (mapSaveRef.current.activeSessionId === sessionId) {
        const fallbackMap = latestConfirmedMapRef.current;
        setVttMap((current) => (current === mapToSave && fallbackMap ? fallbackMap : current));
        setMapLoadError(caught instanceof Error ? caught.message : 'Map save failed.');
      }
    } finally {
      saveState.isSaving = false;
      if (saveState.pending && mapSaveRef.current.activeSessionId === sessionId) {
        void flushPendingMapSave(sessionId);
      }
    }
  }

  function handleMapChange(nextMap: VttMapStateDto) {
    if (!session) return;
    if (!canUseHumanGmView) {
      setVttMap(nextMap);
      setMapLoadError(null);
      return;
    }

    mapSaveRef.current.activeSessionId = session.id;
    mapSaveRef.current.pending = nextMap;
    setVttMap(nextMap);
    setMapLoadError(null);
    void flushPendingMapSave(session.id);
  }

  async function handleSessionTokenMoveRequest(
    token: VttMapStateDto['tokens'][number],
    to: { x: number; y: number },
    path: Array<{ x: number; y: number }>,
    movementMode: 'normal' | 'jump' = 'normal'
  ): Promise<VttMapStateDto | null> {
    if (!session) return null;
    const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    const previousMap = vttMap ?? latestConfirmedMapRef.current;
    const optimisticUpdatedAt = new Date().toISOString();
    const optimisticMap = applyOptimisticTokenMove(previousMap, token.id, to, optimisticUpdatedAt);
    if (optimisticMap) {
      pendingOptimisticTokenMoveRef.current = {
        tokenId: token.id,
        optimisticUpdatedAt,
        previousMap: previousMap as VttMapStateDto,
      };
      setVttMap(optimisticMap);
    }
    try {
      const savedMap = await moveSessionToken(user, session.id, {
        tokenId: token.id,
        sessionCharacterId: token.sessionCharacterId ?? null,
        to,
        path,
        movementMode,
        clientMapVersion: snapshot?.state.version,
      });
      setVttMapIfChanged(savedMap, 'session-move');
      pendingOptimisticTokenMoveRef.current = null;
      logMapMovePerf('session move request', requestStartedAt, `token=${token.id}`);
      setMapLoadError(null);
      return savedMap;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '토큰 이동에 실패했습니다.';
      setMapLoadError(message);
      const pendingMove = pendingOptimisticTokenMoveRef.current;
      if (pendingMove?.tokenId === token.id && pendingMove.optimisticUpdatedAt === optimisticUpdatedAt) {
        setVttMap((current) =>
          current?.updatedAt === optimisticUpdatedAt ? pendingMove.previousMap : current
        );
        pendingOptimisticTokenMoveRef.current = null;
      }
      return null;
    }
  }

  async function handleMapPingRequest(
    point: { x: number; y: number },
    label = '!'
  ): Promise<VttMapStateDto | null> {
    if (!session) return null;
    try {
      const savedMap = await createVttMapPing(user, session.id, {
        x: point.x,
        y: point.y,
        label,
        clientMapVersion: snapshot?.state.version,
      });
      latestConfirmedMapRef.current = savedMap;
      setVttMap(savedMap);
      setMapLoadError(null);
      return savedMap;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '핑을 찍지 못했습니다.';
      setMapLoadError(message);
      return null;
    }
  }

  async function handleMapInteractionRequest(
    interaction: VttMapInteractionDto
  ): Promise<VttMapInteractionResponseDto | null> {
    if (!session) return null;
    try {
      const response = await runVttMapInteraction(user, session.id, {
        ...interaction,
        actorSessionCharacterId:
          interaction.actorSessionCharacterId ??
          myParticipant?.sessionCharacterId ??
          myParticipant?.characterId ??
          null,
        clientMapVersion: snapshot?.state.version,
      });
      if (response.map) {
        latestConfirmedMapRef.current = response.map;
        setVttMap(response.map);
      }
      setMapLoadError(null);
      return response;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '맵 상호작용에 실패했습니다.';
      setMapLoadError(message);
      return null;
    }
  }

  async function executeGmNodeMove(nodeId: string) {
    if (!session || !canUseHumanGmView) {
      throw new Error('HUMAN GM 노드 이동을 실행할 수 없는 세션 상태입니다.');
    }

    const nextSnapshot = await updateHumanGmSessionNode(user, session.id, nodeId);
    const nextMap = nextSnapshot.state.flags?.vttMap as VttMapStateDto | undefined;
    if (nextMap && typeof nextMap === 'object') {
      latestConfirmedMapRef.current = nextMap;
      setVttMap(nextMap);
    } else {
      const savedMap = await getVttMap(user, session.id);
      latestConfirmedMapRef.current = savedMap;
      setVttMap(savedMap);
    }
    const nextPlayerScenario = await getPlayerScenario(user, session.id);
    setPlayerScenario(nextPlayerScenario);
    setCombat(null);
    setCombatChecked(false);
    setCombatError(null);
    setSelectedExplorationMapSelection(null);
    onAction('GM 노드 이동');
  }

  async function handleGmNodeMove(nodeId: string) {
    if (!session || !canUseHumanGmView || isGmNodeMovePending) return;
    setGmNodeMovePending(true);
    setMapLoadError(null);
    setScenarioLoadError(null);
    try {
      await executeGmNodeMove(nodeId);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '노드 이동에 실패했습니다.';
      setScenarioLoadError(message);
      onCombatActionLog(message);
    } finally {
      setGmNodeMovePending(false);
    }
  }

  async function runCombatRequest(request: () => Promise<CombatResponseDto | { combat: CombatResponseDto } | unknown>) {
    if (!session || isCombatBusy) return;

    setCombatBusy(true);
    setCombatError(null);
    try {
      const result = await request();
      let nextCombat: CombatResponseDto | null = null;
      if (result && typeof result === 'object' && 'combat' in result) {
        const maybeCombat = (result as { combat?: unknown }).combat;
        nextCombat = isCombatResponseDto(maybeCombat)
          ? maybeCombat
          : await getCombat(user, session.id);
      } else if (isCombatResponseDto(result)) {
        nextCombat = result;
      } else {
        nextCombat = await getCombat(user, session.id);
      }
      setCombat(nextCombat);
      logCombatRequestSucceeded(session.id, nextCombat);
      if (isCombatActionResultDto(result)) {
        if (result.map) {
          setVttMapIfChanged(result.map, 'combat-action');
          latestConfirmedMapRef.current = result.map;
        }
        onCombatActionLog(formatCombatActionResultMessage(result), result.turnLogId);
        const promptToHandle = getCombatReactionPrompts(result).find(
          (prompt) =>
            isCombatReactionForCurrentUser(prompt, nextCombat) &&
            claimCombatReactionHandling(prompt.id)
        );
        if (promptToHandle) {
          const accepted = await requestCombatReactionDecision(promptToHandle);
          const reactionResult = accepted
            ? await acceptCombatReaction(user, session.id, { reactionId: promptToHandle.id })
            : await declineCombatReaction(user, session.id, { reactionId: promptToHandle.id });
          setCombat(reactionResult.combat);
          setVttMapIfChanged(reactionResult.map, 'combat-action-reaction');
          latestConfirmedMapRef.current = reactionResult.map;
          onCombatActionLog(formatCombatMoveResultMessage(reactionResult));
        }
      }
      if (result && typeof result === 'object' && !isCombatActionResultDto(result)) {
        const promptToHandle = getCombatReactionPrompts(
          result as {
            pendingReaction?: CombatReactionPromptDto | null;
            pendingReactions?: CombatReactionPromptDto[] | null;
          }
        ).find(
          (prompt) =>
            isCombatReactionForCurrentUser(prompt, nextCombat) &&
            claimCombatReactionHandling(prompt.id)
        );
        if (promptToHandle) {
          const accepted = await requestCombatReactionDecision(promptToHandle);
          const reactionResult = accepted
            ? await acceptCombatReaction(user, session.id, { reactionId: promptToHandle.id })
            : await declineCombatReaction(user, session.id, { reactionId: promptToHandle.id });
          setCombat(reactionResult.combat);
          setVttMapIfChanged(reactionResult.map, 'combat-turn-reaction');
          latestConfirmedMapRef.current = reactionResult.map;
          onCombatActionLog(formatCombatMoveResultMessage(reactionResult));
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '전투 처리에 실패했습니다.';
      console.error('[COMBAT_REQUEST_FAILED]', { sessionId: session.id, message, error: caught });
      if (message.includes('COMBAT_409') || message.includes('ACTIVE_COMBAT_EXISTS')) {
        try {
          const nextCombat = await getCombat(user, session.id);
          setCombat(nextCombat);
          logCombatRequestSucceeded(session.id, nextCombat);
          setCombatError(null);
          return;
        } catch {
          // 아래 공통 오류 표시 흐름으로 넘깁니다.
        }
      }
      setCombatError(message);
    } finally {
      setCombatBusy(false);
    }
  }

  function handleEndCombatTurn(force = false) {
    if (!session) return;
    void runCombatRequest(() => endCombatTurn(user, session.id, { force }));
  }

  function handleEndCombat() {
    if (!session) return;
    void runCombatRequest(() => endCombat(user, session.id));
  }

  function getParticipantBadge(participantUserId: string): string | null {
    if (!session) return null;
    if (isHumanGmSession && participantUserId === gmUserId) return 'GM';
    if (participantUserId === session.hostUserId) return 'HOST';
    return null;
  }

  function getCharacterTokenColor(character: Character): SessionTokenColor {
    // 맵 토큰 프레임이 캐릭터 배열 순서로 색을 고르기 때문에, 프로필 계열 UI도 같은 기준을 사용합니다.
    const characterIndex = sessionCharacters.findIndex((item) => item.id === character.id);
    return getPlayerTokenColor(characterIndex);
  }

  function getParticipantLinkedCharacter(participant: Participant | null): Character | null {
    if (!participant) return null;

    return (
      (participant.sessionCharacterId
        ? sessionCharacters.find((character) => character.id === participant.sessionCharacterId)
        : null) ??
      (participant.characterId
        ? sessionCharacters.find(
          (character) => character.characterId === participant.characterId
        )
        : null) ??
      sessionCharacters.find((character) => character.userId === participant.userId) ??
      null
    );
  }

  function getParticipantProfileColor(participant: Participant | null): SessionTokenColor {
    if (!participant) return getPlayerTokenColor(-1);
    const linkedCharacter = getParticipantLinkedCharacter(participant);

    if (linkedCharacter) {
      return getCharacterTokenColor(linkedCharacter);
    }

    const playerIndex = playerParticipantIds.indexOf(participant.userId);
    return getPlayerTokenColor(playerIndex);
  }

  function getLogParticipant(title: string) {
    return participants.find((participant) => {
      if (participant.user.displayName === title) return true;

      const linkedCharacter = getParticipantLinkedCharacter(participant);
      return linkedCharacter?.name === title;
    });
  }

  function getLogProfileColor(title: string, logTone?: string | null): SessionTokenColor {
    if (logTone === 'npc-dialogue') return NPC_TOKEN_COLOR;
    if (isSessionLogProfile(title, logTone)) return GM_TOKEN_COLOR;

    const matchedParticipant = getLogParticipant(title);

    // 로그 작성자 이름만 넘어오는 경우가 있어 매칭 실패 시 첫 플레이어 색으로 안전하게 표시합니다.
    return matchedParticipant ? getParticipantProfileColor(matchedParticipant) : getPlayerTokenColor(0);
  }

  function findNpcTokenByName(speakerName?: string | null, targetId?: string | null) {
    const normalizedSpeakerName = normalizeNpcSpeakerKey(speakerName);
    if ((!normalizedSpeakerName && !targetId) || !vttMap?.tokens.length) return null;

    const npcLikeTokens = vttMap.tokens.filter((token) => !token.sessionCharacterId);
    const visibleTarget =
      currentNode?.visibleTargets.find((target) => target.id === targetId) ??
      currentNode?.visibleTargets.find((target) =>
        isSimilarNpcSpeakerName(target.name, normalizedSpeakerName)
      );

    return (
      (targetId
        ? npcLikeTokens.find((token) => (token.npcId === targetId || token.id === targetId) && token.imageUrl)
        : null) ??
      (targetId ? npcLikeTokens.find((token) => token.npcId === targetId || token.id === targetId) : null) ??
      (visibleTarget
        ? npcLikeTokens.find((token) => token.npcId === visibleTarget.id && token.imageUrl)
        : null) ??
      (visibleTarget ? npcLikeTokens.find((token) => token.npcId === visibleTarget.id) : null) ??
      npcLikeTokens.find(
        (token) => token.imageUrl && isSimilarNpcSpeakerName(token.name, normalizedSpeakerName)
      ) ??
      npcLikeTokens.find((token) => isSimilarNpcSpeakerName(token.name, normalizedSpeakerName)) ??
      null
    );
  }

  function getLogProfileImage(
    title: string,
    logTone?: string | null,
    speakerName?: string | null,
    targetId?: string | null
  ): string | null {
    if (logTone === 'npc-dialogue') {
      return findNpcTokenByName(speakerName, targetId)?.imageUrl?.trim() || null;
    }

    if (isSessionLogProfile(title, logTone)) return dragonPeekImage;

    const matchedParticipant = getLogParticipant(title);
    if (!matchedParticipant) return null;

    const linkedCharacter =
      sessionCharacters.find((character) => character.userId === matchedParticipant.userId) ??
      null;

    // 채팅 프로필은 선택한 캐릭터/직업 이미지를 우선 보여주고, 캐릭터가 없을 때만 이니셜로 돌아갑니다.
    return linkedCharacter ? getCharacterImage(linkedCharacter) : null;
  }

  const layoutStyle = {
    '--session-sidebar-width': `${sidebarWidth}px`,
    '--session-recruiting-bg': `url(${tavernImage})`,
    '--session-empty-slot-image': `url(${emptySlotImage})`,
    '--session-corkboard-image': `url(${corkboardNoPaperImage})`,
    '--session-wanted-paper-image': `url(${paperPinnedImage})`,
    '--session-stat-bigbox-image': `url(${bigBoxImage})`,
    '--session-stat-smallbox-image': `url(${smallBoxImage})`,
  } as CSSProperties;

  function handleSidebarResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();

    const maxWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.65));
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function handlePointerMove(moveEvent: PointerEvent) {
      // 우측 패널이라서 마우스가 왼쪽으로 갈수록 넓어집니다.
      const nextWidth = window.innerWidth - moveEvent.clientX;
      setSidebarWidth(Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, nextWidth)));
    }

    function handlePointerUp() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }

  return (
    <main
      className={`session-prep-layout session-prep-layout-tight${
        isRecruiting ? ' recruiting-tavern' : ''
      }${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      style={layoutStyle}
    >
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <filter id="torn-paper-edge">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <section
        className={`session-prep-stage${usesNodeSpecificPartyStrip ? ' node-surface-active' : ''}${isRecruiting ? ' recruiting-stage' : ''
          }`}
      >
        <div
          className={`session-stage-canvas${!isRecruiting ? ' started' : ''}${isRecruiting ? ' recruiting-stage-canvas' : ''
            }`}
        >
          {isRecruiting ? (
            <section className="session-room-overlay recruiting-room-overlay">
              <div className="session-room-overlay-row">
                <div className="session-room-overlay-title">

                  <strong>{session?.title ?? '활성 세션이 없습니다'}</strong>
                </div>

                <span className={socketConnected ? 'status-pill online' : 'status-pill'}>
                  {getConnectionLabel(socketConnected)}
                </span>

                <div className="invite-inline">
                  <strong>{session?.inviteCode ?? '------'}</strong>
                  <button
                    type="button"
                    className="invite-copy-button"
                    onClick={() =>
                      session?.inviteCode && navigator.clipboard.writeText(session.inviteCode)
                    }
                    aria-label="초대 코드 복사"
                  >
                    <Icon name="copy" />
                  </button>
                </div>

                <div className="session-room-overlay-actions">
                  <button type="button" className="ghost" onClick={onBackToLobby}>
                    로비로 이동
                  </button>
                  <button type="button" className="danger-button" onClick={requestLeaveSession}>
                    세션 영구 퇴장
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {session && isRecruiting && isGmUser ? (
            <section className="character-selection-board player-ready-board session-character-board recruiting-lobby-board">
              <div className="recruiting-lobby-board-layout">
                <section className="recruiting-gm-board">
                  <span>HUMAN GM</span>
                  <strong>{user.displayName}</strong>
                  <p>플레이어가 캐릭터를 선택하고 준비를 마치면 세션을 시작할 수 있습니다.</p>
                </section>
              </div>
            </section>
          ) : null}

          {canShowCharacterSelection ? (
            <section className="character-selection-board player-ready-board session-character-board recruiting-lobby-board">
              <div className="recruiting-lobby-board-layout">
                <section className="recruiting-wanted-poster">
                  <button
                    type="button"
                    className="recruiting-wanted-nav previous"
                    onClick={() => handleWantedCarouselStep(-1)}
                    disabled={busy || readyLocked || Boolean(selectedCharacterId) || wantedCarouselCharacters.length <= 1}
                    aria-label="이전 캐릭터 보기"
                  >
                    <img src={carouselLeftImage} alt="" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="recruiting-wanted-nav next"
                    onClick={() => handleWantedCarouselStep(1)}
                    disabled={busy || readyLocked || Boolean(selectedCharacterId) || wantedCarouselCharacters.length <= 1}
                    aria-label="다음 캐릭터 보기"
                  >
                    <img src={carouselRightImage} alt="" aria-hidden="true" />
                  </button>

                  <div className="recruiting-wanted-header">
                    <span>WANTED</span>
                    <strong>{wantedCarouselCharacter ? 'Character Info' : 'Select Character'}</strong>
                  </div>

                  <div className="recruiting-wanted-body">
                    <div
                      className="recruiting-wanted-portrait-frame"
                      style={{ ['--frame-image' as string]: `url(${profileBorderCharacter})` }}
                    >
                      <div className="recruiting-wanted-portrait-crop">
                        <img
                          src={
                            wantedCarouselCharacter
                              ? getCharacterImage(wantedCarouselCharacter)
                              : emptySlotImage
                          }
                          alt={wantedCarouselCharacter?.name ?? '빈 캐릭터 슬롯'}
                          className={`recruiting-wanted-portrait${wantedCarouselCharacter ? '' : ' empty'
                            }`}
                        />
                      </div>
                      <strong className="recruiting-wanted-portrait-name">
                        {wantedCarouselCharacter?.name ?? 'EMPTY'}
                      </strong>
                    </div>

                    <div className="recruiting-wanted-copy">
                      <div className="recruiting-wanted-copy-header">
                        <strong>
                          {wantedCarouselCharacter
                            ? `${wantedCarouselCharacter.ancestry} / ${getCharacterClassLabel(wantedCarouselCharacter.className)}`
                            : '캐릭터를 선택해 주세요'}
                        </strong>
                      </div>

                      <div className="recruiting-wanted-stat-grid">
                        <div>
                          <span>LV</span>
                          <strong>{wantedCarouselCharacter?.level ?? '-'}</strong>
                        </div>
                        <div>
                          <span>HP</span>
                          <strong>{wantedCarouselCharacter?.maxHp ?? '-'}</strong>
                        </div>
                        <div>
                          <span>AC</span>
                          <strong>{wantedCarouselCharacter?.armorClass ?? '-'}</strong>
                        </div>
                        <div>
                          <span>SPD</span>
                          <strong>{wantedCarouselCharacter?.speed ?? '-'}</strong>
                        </div>
                      </div>

                      {wantedCarouselCharacter?.levelRestrictionReason ? (
                        <p className="session-ready-warning">
                          {wantedCarouselCharacter.levelRestrictionReason} 현재 캐릭터는 {wantedCarouselCharacter.level}레벨입니다.
                        </p>
                      ) : activeScenario ? (
                        <p className="recruiting-wanted-empty-copy">
                          권장 레벨: {scenarioLevelLabel}
                        </p>
                      ) : null}

                      <div className="recruiting-wanted-abilities">
                        {wantedCarouselCharacter ? (
                          selectedCharacterAbilitySummary.map((ability) => (
                            <div key={ability.label}>
                              <span>{ability.label}</span>
                              <strong>{ability.value}</strong>
                            </div>
                          ))
                        ) : (
                          <p className="recruiting-wanted-empty-copy">
                            선택한 캐릭터의 능력치가 이곳에 표시됩니다.
                          </p>
                        )}
                      </div>

                      <div className="recruiting-wanted-feature-summary" aria-label="핵심 특성 요약">
                        <span>핵심 특성</span>
                        {wantedCarouselFeatureSummary.length ? (
                          <div>
                            {wantedCarouselFeatureSummary.map((feature) => (
                              <abbr
                                key={`${feature.sourceLabel}-${feature.label}`}
                                className={`recruiting-wanted-feature-chip tone-${feature.tone}`}
                                title={feature.description}
                              >
                                {feature.label}
                              </abbr>
                            ))}
                          </div>
                        ) : (
                          <p className="recruiting-wanted-empty-copy">
                            캐릭터를 선택하면 주요 특성이 표시됩니다.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="recruiting-wanted-actions">
                    <button
                      type="button"
                      className="recruiting-wanted-action"
                      onClick={handleOpenRecruitingCreate}
                      disabled={readyLocked}
                    >
                      캐릭터 생성
                    </button>
                    <button
                      type="button"
                      className="recruiting-wanted-action"
                      onClick={
                        selectedCharacterId
                          ? handleCharacterSelectionClear
                          : handleCharacterSelectionConfirm
                      }
                      disabled={
                        busy ||
                        readyLocked ||
                        (!selectedCharacterId && !wantedCarouselCharacter) ||
                        (!selectedCharacterId && Boolean(wantedCarouselCharacter?.isDisabled))
                      }
                    >
                      {selectedCharacterId ? '선택 해제' : '캐릭터 선택'}
                    </button>
                    <button
                      type="button"
                      className={`ready-toggle-button recruiting-ready-button recruiting-wanted-ready${myParticipant?.isReady ? ' active' : ''
                        }`}
                      disabled={busy || !selectedCharacter || !selectedCharacterLevelAllowed}
                      onClick={() => onSetReady(!myParticipant?.isReady)}
                    >
                      {myParticipant?.isReady ? '준비 해제' : '준비 완료'}
                    </button>
                  </div>
                  {/* 호스트가 오버레이를 닫아도 시작 확인창으로 다시 돌아올 수 있는 진입점입니다. */}
                  {(isHumanGmSession ? isGmUser : isHost) && allPlayersReady && isStatusMinimized ? (
                    <button
                      type="button"
                      className="recruiting-wanted-start-button"
                      disabled={!canStartSession || busy}
                      onClick={() => setStatusMinimized(false)}
                    >
                      세션 시작
                    </button>
                  ) : null}
                </section>
              </div>
            </section>
          ) : null}

          {session && !isRecruiting ? (
            <section className="session-game-surface">
              {scenarioLoadError ? <p className="panel-error">{scenarioLoadError}</p> : null}
              {isSessionCompleted ? (
                <div className="session-game-surface__placeholder">
                  <span className="eyebrow">GAME OVER</span>
                  <h1>게임이 종료되었습니다</h1>
                  <p>
                    {isPartyDefeated
                      ? '파티가 전멸해 세션 진행이 완료 상태로 전환되었습니다.'
                      : '세션 진행이 완료 상태로 전환되었습니다.'}
                  </p>
                </div>
              ) : isStoryNode ? (
                <StoryNodeSurface
                  node={currentNode}
                  scenarioTitle={activeScenario?.scenario.title}
                  phase={snapshot?.state.phase}
                  characters={sessionCharacters}
                  currentUserId={user.id}
                  isGmView={canUseHumanGmView}
                  rpUtterances={storyRpUtterances}
                  onRpUtteranceClick={() => setActiveTab('Main')}
                  getCharacterColorStyle={(character) =>
                    buildStoryPartyColorStyle(getCharacterTokenColor(character))
                  }
                  isBusy={busy}
                  onRequestRest={onRequestRest}
                  gmNodeMoveOptions={gmNodeMoveOptions}
                  onGmNodeMove={handleGmNodeMove}
                  onGmMessage={handleGmMessage}
                  isGmMessagePending={isGmMessagePending}
                  gmAiAssistSuggestions={gmAiAssistSuggestions}
                  onGmAiAssistCreate={handleGmAiAssistCreate}
                  onGmAiAssistGenerate={handleGmAiAssistGenerate}
                  onGmAiAssistAccept={handleGmAiAssistAccept}
                  isGmAiAssistPending={isGmAiAssistPending}
                  recentGmAiAssistLogs={recentGmAiAssistLogs}
                />
              ) : isExplorationNode ? (
                <ExplorationNodeSurface
                  node={currentNode}
                  scenarioTitle={activeScenario?.scenario.title}
                  phase={snapshot?.state.phase}
                  characters={sessionCharacters}
                  currentUserId={user.id}
                  isHost={isHost}
                  isGmView={canUseHumanGmView}
                  map={vttMap}
                  inventory={selectedCharacterInventory}
                  isBusy={busy || isInventoryUsePending || isGmNodeMovePending}
                  selectedInventoryItemId={selectedMainItemId}
                  getCharacterColorStyle={(character) =>
                    buildMapPartyColorStyle(getCharacterTokenColor(character))
                  }
                  onMapChange={handleMapChange}
                  onTokenMoveRequest={handleSessionTokenMoveRequest}
                  onPingRequest={handleMapPingRequest}
                  onMapInteractionRequest={handleMapInteractionRequest}
                  onUseInventoryItem={handleUseExplorationInventoryItem}
                  onEquipInventoryItem={handleEquipInventoryItem}
                  onDropInventoryItem={handleDropInventoryItem}
                  onPickupMapObject={handlePickupMapObject}
                  onSelectInventoryItem={handleSelectExplorationInventoryItem}
                  onMapSelectionChange={handleExplorationMapSelection}
                  onRequestMainCommand={handleExplorationMainCommandRequest}
                  onRequestRest={onRequestRest}
                  gmNodeMoveOptions={gmNodeMoveOptions}
                  onGmNodeMove={handleGmNodeMove}
                  onGmMessage={handleGmMessage}
                  isGmMessagePending={isGmMessagePending}
                  gmAiAssistSuggestions={gmAiAssistSuggestions}
                  onGmAiAssistCreate={handleGmAiAssistCreate}
                  onGmAiAssistGenerate={handleGmAiAssistGenerate}
                  onGmAiAssistAccept={handleGmAiAssistAccept}
                  isGmAiAssistPending={isGmAiAssistPending}
                  recentGmAiAssistLogs={recentGmAiAssistLogs}
                  gmItemCatalog={gmItemCatalog}
                  isGmItemCatalogLoading={isGmItemCatalogLoading}
                  gmItemCatalogError={gmItemCatalogError}
                  isGmInventoryGrantPending={isGmInventoryGrantPending}
                  onGmGrantInventoryItem={handleGmGrantInventoryItem}
                />
              ) : isCombatNode ? (
                <CombatNodeSurface
                  node={currentNode}
                  scenarioTitle={activeScenario?.scenario.title}
                  phase={snapshot?.state.phase}
                  characters={sessionCharacters}
                  classDefinitions={classDefinitions}
                  ruleCatalog={ruleCatalog}
                  currentUserId={user.id}
                  isHost={isHost}
                  isGmView={canUseHumanGmView}
                  map={vttMap}
                  combat={combat}
                  combatError={combatError}
                  isCombatBusy={isCombatBusy}
                  inventory={selectedCharacterInventory}
                  isInventoryBusy={busy || isInventoryUsePending}
                  getCharacterColorStyle={(character) =>
                    buildMapPartyColorStyle(getCharacterTokenColor(character))
                  }
                  onMapChange={handleMapChange}
                  onPingRequest={handleMapPingRequest}
                  onTokenMoveRequest={handleCombatTokenMoveRequest}
                  onUseInventoryItem={handleUseExplorationInventoryItem}
                  onEquipInventoryItem={handleEquipInventoryItem}
                  onThrowInventoryItem={handleThrowInventoryItem}
                  onPickupMapObject={handlePickupMapObject}
                  onAttackWithEquippedWeapon={handleEquippedWeaponAttack}
                  onMonsterAction={handleMonsterCombatAction}
                  onAttackWithOffhandWeapon={handleOffhandWeaponAttack}
                  onSneakAttack={handleSneakAttack}
                  onDash={handleDashCombatAction}
                  onDodge={handleDodgeCombatAction}
                  onHide={handleHideCombatAction}
                  onReadyAction={handleReadyCombatAction}
                  onApplyCondition={handleApplyCombatCondition}
                  onAdjustHp={handleAdjustCombatHp}
                  onForceMoveParticipant={handleForceMoveCombatParticipant}
                  onUseClassFeature={handleCombatClassFeature}
                  onCastSpell={handleCastCombatSpell}
                  gmNodeMoveOptions={gmNodeMoveOptions}
                  gmAiAssistSuggestions={gmAiAssistSuggestions}
                  onGmAiAssistCreate={handleGmAiAssistCreate}
                  onGmAiAssistGenerate={handleGmAiAssistGenerate}
                  onGmAiAssistAccept={handleGmAiAssistAccept}
                  isGmAiAssistPending={isGmAiAssistPending}
                  recentGmAiAssistLogs={recentGmAiAssistLogs}
                  onEndCombat={handleEndCombat}
                  onEndTurn={handleEndCombatTurn}
                />
              ) : vttMap ? (
                <SessionBattleMap
                  map={vttMap}
                  characters={sessionCharacters}
                  isHost={isHost}
                  currentUserId={user.id}
                  onMapChange={handleMapChange}
                  onTokenMoveRequest={handleSessionTokenMoveRequest}
                  onPingRequest={handleMapPingRequest}
                />
              ) : (
                <div className="session-game-surface__placeholder">
                  <h1>메인화면</h1>
                </div>
              )}
              {canManageStartedSession ? (
                  <SessionEconomyPanel
                    economy={economyState}
                    characters={sessionCharacters}
                    isBusy={isEconomyPending}
                    feedback={economyFeedback}
                    onApply={handleEconomyAction}
                  />
              ) : null}
              {canUseCampaignCalendarPanel ? (
                  <SessionCampaignCalendarPanel
                    calendar={campaignCalendarState}
                    characters={sessionCharacters}
                    canManageCampaign={canManageStartedSession}
                    isBusy={isCampaignCalendarPending}
                    feedback={campaignCalendarFeedback}
                    onApply={handleCampaignCalendarAction}
                  />
              ) : null}
              {pendingCombatReaction ? (
                <section className="session-combat-reaction-banner" aria-label="전투 반응 대기">
                  <div>
                    <span className="session-combat-reaction-eyebrow">
                      {getCombatReactionTypeLabel(pendingCombatReaction.reaction.type)}
                    </span>
                    <strong>{pendingCombatReaction.reaction.reactorName} 반응 선택</strong>
                    <p>{pendingCombatReaction.reaction.message}</p>
                  </div>
                  <div className="session-combat-reaction-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => resolvePendingCombatReaction(false)}
                    >
                      포기
                    </button>
                    <button type="button" onClick={() => resolvePendingCombatReaction(true)}>
                      사용
                    </button>
                  </div>
                </section>
              ) : null}
              {mapLoadError ? <p className="panel-error">{mapLoadError}</p> : null}
            </section>
          ) : null}
        </div>

        {allPlayersReady && isRecruiting && !isStatusMinimized ? (
          <div className="session-status-floating-layer expanded">
            <section className="session-ready-card session-main-ready-overlay">
              <button
                type="button"
                className="session-ready-close-button"
                aria-label="세션 시작 오버레이 닫기"
                onClick={() => setStatusMinimized(true)}
              >
                <Icon name="x" />
              </button>
              <div className="session-ready-card-ornament top" aria-hidden="true" />
              <span className="eyebrow ready-eyebrow">✦ Session status ✦</span>

              <div className="session-ready-title-row">
                <h2>세션 시작</h2>
                <span className="ready-badge">
                  <Icon name="check-circle" /> {readyParticipantCount}/{participantCount} READY
                </span>
              </div>

              <div className="session-ready-divider" aria-hidden="true">
                <div className="diamond" />
              </div>

              <strong className="session-ready-subtitle">
                모든 플레이어가 준비를 완료했습니다.
              </strong>
              <p className="session-ready-desc">
                {isHumanGmSession
                  ? isGmUser
                    ? '지금 게임을 시작하시겠습니까?'
                    : '인간 GM이 세션을 시작할 때까지 기다려주세요.'
                  : isHost
                  ? '지금 게임을 시작하시겠습니까?'
                  : '호스트가 세션을 시작할 때까지 기다려주세요.'}
              </p>


              {(isHumanGmSession ? isGmUser : isHost) ? (
                <div className="ready-actions">
                  <button
                    type="button"
                    className="ready-btn-cancel"
                    onClick={() => setStatusMinimized(true)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="ready-btn-start"
                    disabled={!canStartSession || busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsStartTransitionPending(true);
                      setIsGameStarting(true);
                      onStartSession();
                    }}
                  >
                    게임 시작
                  </button>
                </div>
              ) : null}

              <div className="session-ready-card-ornament bottom" aria-hidden="true" />
            </section>
          </div>
        ) : null}

        {isLeaveConfirmOpen ? (
          <div className="session-status-floating-layer expanded session-leave-confirm-layer">
            <section className="session-ready-card session-main-ready-overlay session-leave-confirm-overlay">
              <button
                type="button"
                className="session-ready-close-button"
                aria-label="세션 영구 퇴장 확인창 닫기"
                onClick={cancelLeaveSession}
              >
                <Icon name="x" />
              </button>
              <div className="session-ready-card-ornament top" aria-hidden="true" />




              <strong className="session-ready-subtitle">
                정말 퇴장하시겠습니까?
              </strong>
              <p className="session-ready-desc">
                재입장이 불가능합니다.
              </p>

              <div className="ready-actions">
                <button type="button" className="ready-btn-cancel" onClick={cancelLeaveSession}>
                  취소
                </button>
                <button
                  type="button"
                  className="ready-btn-start ready-btn-leave"
                  disabled={busy}
                  onClick={confirmLeaveSession}
                >
                  퇴장
                </button>
              </div>

              <div className="session-ready-card-ornament bottom" aria-hidden="true" />
            </section>
          </div>
        ) : null}

        {usesNodeSpecificPartyStrip ? null : (
          <section
            className={`participant-strip participant-strip-four-up${isRecruiting ? ' recruiting-party-strip' : ''
              }`}
          >
            {displayedParticipants.length
              ? displayedParticipants.slice(0, 4).map((participant, index) => {
                if (!participant) {
                  return (
                    <article
                      key={`empty-slot-${index}`}
                      className={`participant-strip-card placeholder${isRecruiting ? ' recruiting-party-slot empty' : ''
                        }`}
                    >
                      {isRecruiting ? (
                        <>
                          <img
                            src={emptySlotImage}
                            alt={`빈 파티 슬롯 ${index + 1}`}
                            className="recruiting-party-slot-paper"
                          />
                          <img
                            src={pinImage}
                            alt=""
                            aria-hidden="true"
                            className="recruiting-party-slot-pin"
                          />
                        </>
                      ) : (
                        <>
                          <div className="participant-avatar-frame placeholder" />
                          <div className="participant-card-body">
                            <strong>빈 슬롯</strong>
                            <span>참가자를 기다리는 중입니다.</span>
                          </div>
                          <div className="participant-state">대기</div>
                          <div className="participant-index">{index + 1}</div>
                        </>
                      )}
                    </article>
                  );
                }

                const linkedCharacter = getParticipantLinkedCharacter(participant);
                const badgeLabel = getParticipantBadge(participant.userId);
                const isParticipantGm = isHumanGmSession && participant.userId === gmUserId;
                const canAssignHumanGm =
                  isHumanGmSession &&
                  isRecruiting &&
                  isHost &&
                  !isParticipantGm &&
                  participant.status === 'JOINED';
                const stateLabel = isParticipantGm
                  ? 'GM'
                  : participant.isReady
                    ? 'READY'
                    : participant.connectionStatus;
                const participantImage = linkedCharacter
                  ? getCharacterImage(linkedCharacter)
                  : null;
                const profileColor = getParticipantProfileColor(participant);

                return (
                  <article
                    key={participant.id}
                    className={`participant-strip-card${isRecruiting ? ' recruiting-party-slot occupied' : ''
                      }`}
                    style={buildProfileColorStyle(profileColor)}
                  >
                    {isRecruiting ? (
                      <>
                        <img
                          src={existSlotImage}
                          alt=""
                          aria-hidden="true"
                          className="recruiting-party-slot-paper"
                        />
                        <img
                          src={pinImage}
                          alt=""
                          aria-hidden="true"
                          className="recruiting-party-slot-pin"
                        />
                        {participantImage ? (
                          <img
                            src={participantImage}
                            alt={linkedCharacter?.name ?? participant.user.displayName}
                            className="recruiting-party-slot-portrait"
                          />
                        ) : (
                          <div className="recruiting-party-slot-fallback" aria-hidden="true" />
                        )}
                        {badgeLabel ? (
                          <div className="recruiting-party-slot-badge">{badgeLabel}</div>
                        ) : null}
                        <strong className="recruiting-party-slot-name">
                          {participant.user.displayName}
                        </strong>
                        <div
                          className={`recruiting-party-slot-status${participant.isReady || isParticipantGm ? ' ready' : ''}`}
                        >
                          {isParticipantGm ? 'GM 진행자' : participant.isReady ? '준비완료' : '정비 중'}
                        </div>
                        {canAssignHumanGm ? (
                          <button
                            type="button"
                            className="recruiting-party-slot-gm-button"
                            disabled={busy}
                            onClick={() => onSetHumanGm(participant.userId)}
                          >
                            GM 지정
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {badgeLabel ? (
                          <div className="participant-special-badge">{badgeLabel}</div>
                        ) : null}
                        <div
                          className="participant-avatar-frame"
                          style={{ ['--frame-image' as string]: `url(${profileBorderCharacter})` }}
                        >
                          {participantImage ? (
                            <img
                              src={participantImage}
                              alt={linkedCharacter?.name ?? participant.user.displayName}
                              className="participant-avatar-image"
                            />
                          ) : (
                            <div className="participant-avatar tone-1">
                              {(linkedCharacter?.name ?? participant.user.displayName).slice(0, 1)}
                            </div>
                          )}
                        </div>
                        <div className="participant-card-body">
                          <strong>{participant.user.displayName}</strong>
                          <span>
                            {linkedCharacter
                              ? `${linkedCharacter.name} / ${getCharacterClassLabel(linkedCharacter.className)}`
                              : participant.userId === user.id
                                ? '\uCE90\uB9AD\uD130\uAC00 \uC120\uD0DD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4'
                                : '\uCE90\uB9AD\uD130\uB97C \uAE30\uB2E4\uB9AC\uB294 \uC911\uC785\uB2C8\uB2E4'}
                          </span>
                        </div>
                        <div className={`participant-state${participant.isReady ? ' ready' : ''}`}>
                          {stateLabel}
                        </div>
                        <div className="participant-index">{index + 1}</div>
                      </>
                    )}
                  </article>
                );
              })
              : null}
          </section>
        )}

        {error ? <p className="panel-error">{error}</p> : null}
      </section>

      <div
        className="session-sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="우측 패널 크기 조절"
        onPointerDown={handleSidebarResizePointerDown}
      />

      <aside className={`session-sidebar${isSidebarCollapsed ? ' collapsed' : ''}`}>
        <button
          type="button"
          className="session-sidebar-collapse-toggle"
          aria-label={isSidebarCollapsed ? '채팅창 열기' : '채팅창 접기'}
          title={isSidebarCollapsed ? '채팅창 열기' : '채팅창 접기'}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          <span className="session-sidebar-collapse-toggle-arrow" aria-hidden="true" />
        </button>
        <div className="session-sidebar-tabs">
          {availableTabs.map((tab) => {
            const unreadMessageCount =
              tab === 'Main' || tab === 'Chat' ? unreadMessageCounts[tab] : 0;

            return (
              <button
                key={tab}
                type="button"
                className={[
                  activeTab === tab ? 'active' : '',
                  tab === 'Info' && hasUnreadInfo ? 'has-unread-info' : '',
                  unreadMessageCount > 0 ? 'has-unread-messages' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={
                  unreadMessageCount > 0
                    ? `${sessionTabLabels[tab]} 새 메시지 ${unreadMessageCount}개`
                    : sessionTabLabels[tab]
                }
                onClick={() => setActiveTab(tab)}
              >
                {sessionTabLabels[tab]}
                {tab === 'Info' && hasUnreadInfo ? (
                  <span className="session-sidebar-tab-badge" aria-hidden="true" />
                ) : null}
                {unreadMessageCount > 0 ? (
                  <span className="session-sidebar-tab-count" aria-hidden="true">
                    {formatUnreadCount(unreadMessageCount)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="session-sidebar-panel">
          <div
            className={`session-sidebar-description${
              activeTab === 'Main' && hasOlderTurnLogs ? ' has-history-button' : ''
            }`}
          >
            {activeTab === 'Main' && hasOlderTurnLogs ? (
              <div className="session-log-history-bar">
                <button
                  type="button"
                  className="session-log-history-button"
                  disabled={isLoadingTurnLogs}
                  onClick={onLoadOlderTurnLogs}
                >
                  <img
                    src={ornamentArrowUpGold}
                    alt=""
                    aria-hidden="true"
                    className="session-log-history-button-icon"
                  />
                  <span>{isLoadingTurnLogs ? '불러오는 중...' : '이전 로그 보기'}</span>
                </button>
              </div>
            ) : (
              <p>{sessionTabDescriptions[activeTab].description}</p>
            )}
          </div>

          {visibleRestApproval ? (
            <section className="session-rest-approval-banner" aria-label="휴식 승인 대기">
              <div>
                <span className="session-rest-approval-eyebrow">GM 승인 대기</span>
                <strong>
                  {visibleRestApproval.restType === 'long' ? '긴 휴식' : '짧은 휴식'} 요청
                </strong>
                <p>{visibleRestApproval.requester}: {visibleRestApproval.message}</p>
              </div>
              <div className="session-rest-approval-actions">
                <button
                  type="button"
                  onClick={() => void handleApproveRestRequest(visibleRestApproval.actionId)}
                >
                  승인
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void handleRejectRestRequest(visibleRestApproval.actionId)}
                >
                  거절
                </button>
              </div>
            </section>
          ) : null}

          {visibleOwnRestRequest ? (
            <section className="session-rest-approval-banner" aria-label="휴식 승인 대기">
              <div>
                <span className="session-rest-approval-eyebrow">GM 승인 대기</span>
                <strong>
                  {visibleOwnRestRequest.restType === 'long' ? '긴 휴식' : '짧은 휴식'} 요청
                </strong>
                <p>GM이 결정하기 전까지 요청을 취소할 수 있습니다.</p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => void handleCancelRestRequest(visibleOwnRestRequest.actionId)}
              >
                요청 취소
              </button>
            </section>
          ) : null}

          {activeTab === 'Main' || activeTab === 'Chat' ? (
            <>
              <div className="session-log-area">
                <div className="session-log-stack">
                  {renderedRows.length ? (
                    renderedRows.map((log) => {
                      const chatColorStyle =
                        log.rowClass === 'notice'
                          ? undefined
                          : buildProfileColorStyle(getLogProfileColor(log.title, log.logTone));
                      const chatProfileImage =
                        log.rowClass === 'notice'
                          ? null
                          : getLogProfileImage(
                              log.title,
                              log.logTone,
                              log.speakerName,
                              log.metadata?.mainCommand?.targetId
                            );
                      const isDragonProfile = chatProfileImage === dragonPeekImage;
                      const chatAvatarLabel = getAvatarLabel(log.senderLabel, user.displayName);
                      const restApproval = log.metadata?.restApproval;
                      const canApproveRestRequest = Boolean(
                        isGmUser &&
                          restApproval?.actionId &&
                          restApproval.status === 'gm_required' &&
                          !resolvedRestRequestIds.has(restApproval.actionId)
                      );

                      return (
                        <Fragment key={log.id}>
                          {log.showDateSeparator ? (
                            <div className="chat-thread-date-divider">
                              <span>{log.dateLabel}</span>
                            </div>
                          ) : null}
                          <article
                            className={`chat-thread-row ${log.rowClass}${log.logTone ? ` main-log-${log.logTone}` : ''
                              }`}
                            style={chatColorStyle}
                          >
                            {log.rowClass === 'incoming' ? (
                              <div
                                className={`chat-thread-avatar${chatProfileImage ? ' has-image' : ''}${
                                  isDragonProfile ? ' dragon-profile' : ''
                                }`}
                              >
                                {chatProfileImage ? (
                                  <img
                                    src={chatProfileImage}
                                    alt={`${log.senderLabel} 프로필`}
                                    className="chat-thread-avatar-image"
                                  />
                                ) : (
                                  chatAvatarLabel
                                )}
                              </div>
                            ) : null}
                            <div className="chat-thread-stack">
                              <span className={`chat-thread-sender ${log.rowClass}`}>
                                {log.senderLabel}
                                {log.logToneLabel ? (
                                  <span className="chat-thread-tone-label">{log.logToneLabel}</span>
                                ) : null}
                              </span>
                              <div
                                className={`chat-thread-bubble${log.isPendingAction ? ' pending' : ''}`}
                              >
                                {log.isPendingAction ? (
                                  <span className="chat-thread-spinner" aria-hidden="true" />
                                ) : null}
                                <span>{log.message}</span>
                                {canApproveRestRequest && restApproval ? (
                                  <>
                                    <button
                                      type="button"
                                      className="chat-thread-inline-action"
                                      onClick={() => void handleApproveRestRequest(restApproval.actionId)}
                                    >
                                      휴식 승인
                                    </button>
                                    <button
                                      type="button"
                                      className="chat-thread-inline-action"
                                      onClick={() => void handleRejectRestRequest(restApproval.actionId)}
                                    >
                                      휴식 거절
                                    </button>
                                  </>
                                ) : null}
                              </div>
                              {log.rowClass !== 'notice' ? (
                                <span className="chat-thread-time">{log.time}</span>
                              ) : null}
                            </div>
                            {log.rowClass === 'outgoing' ? (
                              <div
                                className={`chat-thread-avatar${chatProfileImage ? ' has-image' : ''}${
                                  isDragonProfile ? ' dragon-profile' : ''
                                }`}
                              >
                                {chatProfileImage ? (
                                  <img
                                    src={chatProfileImage}
                                    alt={`${log.senderLabel} 프로필`}
                                    className="chat-thread-avatar-image"
                                  />
                                ) : (
                                  chatAvatarLabel
                                )}
                              </div>
                            ) : null}
                          </article>
                        </Fragment>
                      );
                    })
                  ) : (
                    <article className="chat-thread-row notice">
                      <div className="chat-thread-stack">
                        <div className="chat-thread-bubble">아직 기록된 메시지가 없습니다.</div>
                      </div>
                    </article>
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>

              <form
                className="session-sidebar-input"
                onSubmit={activeTab === 'Main' ? handleMainSubmit : handleChatSubmit}
              >
                {activeTab === 'Main' && session?.gmMode === 'AI' && currentScreenType ? (
                  <div className="main-command-picker">
                    {/* 선택 상태는 별도 태그 대신 버튼 자체의 색과 테두리로 보여 시선 이동을 줄입니다. */}
                    <div className="main-command-mode-row">
                      <button
                        type="button"
                        className={`main-command-mode-button main-command-primary-mode-button${isGmRequestModeButtonActive ? ' active' : ''
                          }`}
                        aria-pressed={isGmRequestModeButtonActive}
                        onClick={() => {
                          setMainCommandMode('GM_REQUEST');
                          setCommandGuideOpen(false);
                          setSelectedMainIntent(null);
                          setActiveMainHelperGroup(null);
                          clearMainCommandSelectionFields();
                        }}
                      >
                        <Icon name="message-circle" />
                        <span>GM 요청</span>
                      </button>
                      <button
                        type="button"
                        className={`main-command-mode-button main-command-primary-mode-button${mainCommandMode === 'RP_ACTION' ? ' active' : ''
                          }`}
                        aria-pressed={mainCommandMode === 'RP_ACTION'}
                        onClick={() => {
                          setMainCommandMode('RP_ACTION');
                          setCommandGuideOpen(false);
                          setSelectedMainIntent(null);
                          setActiveMainHelperGroup(null);
                          clearMainCommandSelectionFields();
                        }}
                      >
                        <Icon name="hand" />
                        <span>RP 행동</span>
                      </button>
                      <button
                        type="button"
                        className={`main-command-mode-button main-command-outline-mode-button main-command-command-mode-button${isMainCommandButtonActive ? ' active' : ''}`}
                        aria-label="명령어"
                        aria-pressed={isMainCommandButtonActive}
                        title="명령어"
                        onClick={() => {
                          setMainCommandMode('GM_REQUEST');
                          setCommandGuideOpen((current) => !current);
                        }}
                      >
                        <Icon name="help-circle" />
                        <span>명령어</span>
                      </button>
                    </div>

                    {mainCommandMode === 'GM_REQUEST' && isExplorationMainCommandContext ? (
                      <div className="main-command-selection-row" aria-label="탐색 선택 대상">
                        <div className="main-command-selection-chip">
                          <span>맵 선택</span>
                          <strong>{selectedExplorationMapLabel}</strong>
                        </div>
                        <div className="main-command-selection-chip">
                          <span>아이템 선택</span>
                          <strong>{selectedExplorationItemLabel}</strong>
                        </div>
                      </div>
                    ) : mainCommandMode === 'GM_REQUEST' && availableMainHelperOptions.length ? (
                      <div className="main-command-helper-row">
                        {availableMainHelperOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={`main-command-helper-button main-command-target-helper-button${activeMainHelperOption?.id === option.id ? ' active' : ''
                              }`}
                            aria-pressed={activeMainHelperOption?.id === option.id}
                            title={option.description}
                            onClick={() => {
                              setMainCommandMode('GM_REQUEST');
                              setActiveMainHelperGroup((current) =>
                                current === option.id ? null : option.id
                              );
                              setSelectedMainIntent(null);
                              clearMainCommandSelectionFields();
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {shouldShowCommandGuide ? (
                      <div className="main-command-guide-panel">
                        <p className="main-command-guide-notice">
                          💡 자유롭게 행동을 입력할 수 있지만,
                          <br />
                          `/명령어` 입력 시 보다 빠르고 정확한 응답이 옵니다!
                        </p>
                        {mainCommandPresets.map((command) => {
                          const slashCommand = getMainCommandSlashCommands(command)[0];
                          return slashCommand ? (
                            <button
                              key={command.intent}
                              type="button"
                              className="main-command-guide-option"
                              onClick={() => {
                                setMainCommandMode('GM_REQUEST');
                                setMainMessage(`${slashCommand} `);
                                setSelectedMainIntent(command.intent);
                                setActiveMainHelperGroup(
                                  getMainCommandHelperGroupForSelection(
                                    command,
                                    activeMainHelperOption?.id
                                  )
                                );
                                setCommandGuideOpen(false);
                              }}
                            >
                              <strong>{slashCommand}</strong>
                              <small>{getMainCommandDescription(command)}</small>
                            </button>
                          ) : null;
                        })}
                      </div>
                    ) : null}

                    {mainCommandAutocompleteEntries.length ? (
                      <div
                        ref={mainCommandAutocompleteRef}
                        className="main-command-autocomplete"
                        role="listbox"
                        aria-label="명령어 자동완성"
                      >
                        {mainCommandAutocompleteEntries.map((entry) => {
                          if (entry.type === 'separator') {
                            return (
                              <div
                                key={entry.id}
                                className="main-command-autocomplete-separator"
                              >
                                {entry.label}
                              </div>
                            );
                          }
                          const command = entry.command;
                          const slashCommand = getMainCommandSlashCommands(command)[0];
                          const autocompleteIndex =
                            mainCommandAutocompleteIndexByIntent.get(command.intent) ?? -1;
                          const isAutocompleteActive =
                            autocompleteIndex === mainCommandAutocompleteIndex;
                          return slashCommand ? (
                            <button
                              key={command.intent}
                              id={`main-command-autocomplete-${command.intent}`}
                              type="button"
                              role="option"
                              className={`main-command-autocomplete-option${isAutocompleteActive ? ' active' : ''
                                }`}
                              aria-selected={isAutocompleteActive}
                              data-autocomplete-active={isAutocompleteActive ? 'true' : undefined}
                              onMouseEnter={() => {
                                if (autocompleteIndex >= 0) {
                                  setMainCommandAutocompleteIndex(autocompleteIndex);
                                }
                              }}
                              onClick={() => {
                                applyMainCommandAutocomplete(command);
                              }}
                            >
                              <strong>{slashCommand}</strong>
                              <small>{getMainCommandDescription(command)}</small>
                            </button>
                          ) : null;
                        })}
                      </div>
                    ) : null}

                    {mainCommandMode === 'GM_REQUEST' && shouldShowMainCommandFields ? (
                      <div className="main-command-fields">
                        {shouldShowMainTargetField ? (
                          <label className="main-command-field">
                            <span>대상</span>
                            <select
                              value={selectedMainTargetId}
                              onChange={(event) => setSelectedMainTargetId(event.target.value)}
                            >
                              <option value="">선택하세요</option>
                              {visibleTargetOptions.map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        {shouldShowMainItemField ? (
                          <label className="main-command-field">
                            <span>아이템</span>
                            <select
                              value={selectedMainItemId}
                              onChange={(event) => setSelectedMainItemId(event.target.value)}
                            >
                              <option value="">선택하세요</option>
                              {selectedCharacterInventory.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        {shouldShowMainSpellField ? (
                          <label className="main-command-field">
                            <span>주문</span>
                            <input
                              value={selectedMainSpellId}
                              onChange={(event) => setSelectedMainSpellId(event.target.value)}
                              placeholder="주문 ID 또는 이름"
                            />
                          </label>
                        ) : null}

                        {shouldShowMainRelatedIntentField ? (
                          <label className="main-command-field">
                            <span>관련 명령</span>
                            <select
                              value={selectedMainRelatedIntent}
                              onChange={(event) => setSelectedMainRelatedIntent(event.target.value)}
                            >
                              <option value="">선택 안 함</option>
                              {relatedIntentOptions.map((preset) => (
                                <option key={preset.intent} value={preset.intent}>
                                  {preset.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        {shouldShowMainPointField ? (
                          <div className="main-command-field main-command-point-field">
                            <span>좌표</span>
                            <div>
                              <input
                                value={mainPointX}
                                onChange={(event) => setMainPointX(event.target.value)}
                                inputMode="numeric"
                                placeholder="x"
                              />
                              <input
                                value={mainPointY}
                                onChange={(event) => setMainPointY(event.target.value)}
                                inputMode="numeric"
                                placeholder="y"
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {mainCommandError ? (
                      <p className="main-command-error">{mainCommandError}</p>
                    ) : null}
                  </div>
                ) : null}

                <input
                  value={activeTab === 'Main' ? mainMessage : chatMessage}
                  onChange={(event) =>
                    activeTab === 'Main'
                      ? setMainMessage(event.target.value)
                      : setChatMessage(event.target.value)
                  }
                  onKeyDown={handleSidebarInputKeyDown}
                  role={activeTab === 'Main' ? 'combobox' : undefined}
                  aria-autocomplete={activeTab === 'Main' ? 'list' : undefined}
                  aria-expanded={
                    activeTab === 'Main' && shouldShowMainCommandAutocomplete
                      ? mainCommandAutocompleteCommandEntries.length > 0
                      : undefined
                  }
                  aria-activedescendant={
                    activeTab === 'Main' && shouldShowMainCommandAutocomplete
                      ? activeMainCommandAutocompleteId
                      : undefined
                  }
                  placeholder={
                    activeTab === 'Main'
                      ? mainCommandMode === 'RP_ACTION'
                        ? '캐릭터 대사나 분위기 묘사를 입력하세요...'
                        : selectedMainCommand
                          ? `${selectedMainCommand.label} 내용을 입력하세요...`
                          : '행동을 선언하거나 상황을 입력하세요...'
                      : '채팅을 입력하세요...'
                  }
                />
                <button type="submit" disabled={busy} className="chat-submit-btn">
                  <Icon name="send" />
                  <span>전송</span>
                </button>
              </form>
            </>
          ) : null}

          {activeTab === 'Info' ? (
            <div className="session-info-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">현재 시나리오</span>
                  <h2>{activeScenario?.scenario.title ?? '시나리오가 없습니다'}</h2>
                </div>
              </div>

              <article className="scenario-node-panel">
                <span className="eyebrow">현재 장면 설명</span>
                <p className="scenario-scene-description-text">{currentSceneDescriptionText}</p>
              </article>

              <article className="scenario-node-panel">
                <span className="eyebrow">밝혀진 단서</span>
                {currentNode?.publicClues.length ? (
                  <ul className="scenario-node-list">
                    {currentNode.publicClues.map((clue) => (
                      <li key={clue.id}>
                        <strong>{clue.title}</strong>
                        <span>{clue.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>현재 씬에 공개 단서가 없습니다.</p>
                )}
              </article>

              <article className="scenario-node-panel">
                <span className="eyebrow">판정 가이드</span>
                {currentNode?.checkOptions.length ? (
                  <ul className="scenario-node-list">
                    {currentNode.checkOptions.map((option, index) => {
                      const label = getNodeLabel(option) ?? `Check ${index + 1}`;
                      return (
                        <li key={`${label}-${index}`}>
                          <strong>{label}</strong>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>설정된 판정 가이드가 없습니다.</p>
                )}
              </article>

              <article className="scenario-node-panel">
                <span className="eyebrow">시나리오 설명</span>
                <textarea
                  ref={scenarioDescriptionTextareaRef}
                  value={scenarioDescriptionText}
                  onChange={(event) => setInfoText(event.target.value)}
                />
              </article>
            </div>
          ) : null}

          {activeTab === 'Settings' ? (
            <div className="session-settings-panel">

              {!isRecruiting ? (
                <>
                  <div className="session-settings-actions">
                    <button type="button" className="ghost" onClick={onBackToLobby}>
                      로비로 이동
                    </button>
                    <button type="button" className="danger-button" onClick={requestLeaveSession}>
                      세션 영구 퇴장
                    </button>
                  </div>
                  <div className="section-heading session-settings-title-heading">
                    <div>
                      <span className="eyebrow">현재 세션</span>
                      <h2>{session?.title ?? '활성 세션이 없습니다'}</h2>
                    </div>
                  </div>

                  <div className="session-settings-list">
                    <article className="session-settings-entry">
                      <span className="eyebrow">초대 코드</span>
                      <div className="session-settings-bubble session-settings-copy-bubble">
                        <strong>{session?.inviteCode ?? '------'}</strong>
                        <button
                          type="button"
                          className="session-settings-copy-button"
                          onClick={() =>
                            session?.inviteCode && navigator.clipboard.writeText(session.inviteCode)
                          }
                          disabled={!session?.inviteCode}
                        >
                          복사
                        </button>
                      </div>
                    </article>

                    <article className="session-settings-entry">
                      <span className="eyebrow">세션 상태</span>
                      <p className="session-settings-bubble">{session?.status ?? 'unknown'}</p>
                    </article>

                    <article className="session-settings-entry">
                      <span className="eyebrow">공개 범위</span>
                      <p className="session-settings-bubble">{session?.visibility ?? 'unknown'}</p>
                    </article>
                  </div>
                </>
              ) : null}
              {isRecruiting ? (
                <dl className="session-meta">
                  <div>
                    <dt>Status</dt>
                    <dd>{session?.status ?? 'unknown'}</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{snapshot?.state.phase ?? 'unknown'}</dd>
                  </div>
                  <div>
                    <dt>Visibility</dt>
                    <dd>{session?.visibility ?? 'unknown'}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>

      {isGameStarting ? (
        <div className="modal-backdrop session-start-loading" role="dialog" aria-modal="true">
          <div className="modal-card session-start-loading-card">
            <div className="session-start-spinner" aria-hidden="true" />
            <strong>게임 화면으로 이동하는 중입니다</strong>
            <p>정보를 불러오는 중입니다.</p>
          </div>
        </div>
      ) : null}

      {/* 캐릭터가 없는 플레이어가 빠르게 캐릭터를 만드는 모달입니다. */}
      {isCreateModalOpen ? (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={handleCreateCharacter}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">캐릭터 생성</span>
                <h2>새 캐릭터 생성</h2>
              </div>
              <button type="button" className="ghost" onClick={closeCreateModal}>
                Close
              </button>
            </div>

            <p style={{ margin: '0 0 12px 0', opacity: 0.82 }}>
              종족, 직업, 시작 장비, 주문, 능력치는 현재 규칙에 맞는 기본값으로 자동 완성됩니다.
            </p>

            <label>
              Name
              <input
                value={formState.name}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </label>

            <label>
              Ancestry
              <select
                value={formState.ancestryKey}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, ancestryKey: event.target.value }))
                }
                required
                disabled={!quickCreateConfigReady}
              >
                {races.map((race) => (
                  <option key={race.id} value={race.key}>
                    {race.koName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Class
              <select
                value={formState.classKey}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, classKey: event.target.value }))
                }
                required
                disabled={!quickCreateConfigReady}
              >
                {classDefinitions.map((klass) => (
                  <option key={klass.id} value={klass.key}>
                    {klass.koName}
                  </option>
                ))}
              </select>
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '10px',
                marginTop: '4px',
              }}
            >
              <div className="status-chip">LV {quickCreateLevel}</div>
              <div className="status-chip">HP {quickCreateMaxHp}</div>
              <div className="status-chip">AC {quickCreateArmorClass}</div>
              <div className="status-chip">이동 {quickCreateSpeed}ft</div>
            </div>

            {selectedQuickCreateClass ? (
              <p style={{ margin: '8px 0 0 0', opacity: 0.82 }}>
                숙련 기술은{' '}
                {selectedQuickCreateClass.skillChoiceCount > 0
                  ? `${selectedQuickCreateClass.skillChoices
                    .slice(0, selectedQuickCreateClass.skillChoiceCount)
                    .join(', ')}`
                  : '자동 선택 없음'}
                으로 적용됩니다.
              </p>
            ) : null}

            {error ? (
              <p className="panel-error" role="alert" style={{ margin: '12px 0 0 0' }}>
                {error}
              </p>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={closeCreateModal}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy || !quickCreateConfigReady}>
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {inventoryUseFeedback ? (
        <div className="session-inventory-toast" role="status" aria-live="polite">
          {inventoryUseFeedback}
        </div>
      ) : null}

      {revealedClueToast ? (
        <div className="session-clue-toast" role="status" aria-live="polite">
          <strong>새 단서 발견</strong>
          <span>{revealedClueToast.title}</span>
          {revealedClueToast.text ? <small>{revealedClueToast.text}</small> : null}
        </div>
      ) : null}

      {/* 세션 전원에게 보이는 주사위 굴림 오버레이 (turn.log.created 이벤트로 트리거). */}
      <DiceRollOverlay data={activeDiceRoll} onDismiss={onDismissDiceRoll} />
    </main>
  );
}
