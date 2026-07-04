/*
 * PlayPage
 * 역할: 실제 세션 플레이 화면입니다. 캐릭터 선택, 준비 상태, 채팅/로그, 현재 시나리오 노드, VTT 맵을 표시합니다.
 * 읽는 순서:
 * 1) 상단 헬퍼: 로그 스코프, 아바타/클래스 표시 이미지, 노드 라벨 추출
 * 2) PlayPageProps: 세션 스냅샷과 소켓 상태, 플레이 액션 콜백
 * 3) 컴포넌트 state/ref: 탭, 채팅 입력, 캐릭터 생성 폼, 시나리오/맵 로딩 상태, 맵 저장 큐
 * 4) useEffect: 시나리오/맵 조회, 로그 스크롤, 입력 초기화
 * 5) handler: 캐릭터 생성, 채팅/액션 전송, VTT 맵 변경 저장
 * 6) JSX: 모집 대기 화면, 플레이 탭, VTT 맵, 사이드 패널, 캐릭터 생성 모달
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import type {
  ClassDefinitionResponseDto,
  CombatReactionPromptDto,
  CombatResponseDto,
  InventoryItemDto,
  MainCommandResponseDto,
  RaceResponseDto,
  RestActionDto,
  ResolveMainCommandCheckDto,
  SubmitMainCommandDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import {
  isAiGmMode,
  isEndedCombatStatus,
  isHumanGmMode,
} from '@trpg/shared-types/frontend';
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
} from '../features/sessionPlay/components/StoryNodeSurface';
import { SessionBattleMap } from '../features/sessionPlay/components/SessionBattleMap';
import { SessionCampaignCalendarPanel } from '../features/sessionPlay/components/SessionCampaignCalendarPanel';
import { SessionEconomyPanel } from '../features/sessionPlay/components/SessionEconomyPanel';
import { useActiveSessionScenarioProjection } from '../features/sessionPlay/hooks/useActiveSessionScenarioProjection';
import { useCombatActionHandlers } from '../features/sessionPlay/hooks/useCombatActionHandlers';
import { useCombatForceMoveRequest } from '../features/sessionPlay/hooks/useCombatForceMoveRequest';
import { useCombatReactionDecision } from '../features/sessionPlay/hooks/useCombatReactionDecision';
import { useCombatReactionAutoHandler } from '../features/sessionPlay/hooks/useCombatReactionAutoHandler';
import { useCombatRequestRunner } from '../features/sessionPlay/hooks/useCombatRequestRunner';
import { useCombatTokenMoveRequest } from '../features/sessionPlay/hooks/useCombatTokenMoveRequest';
import { useCurrentNodeInfoPresentation } from '../features/sessionPlay/hooks/useCurrentNodeInfoPresentation';
import { useCurrentNodeContextProjection } from '../features/sessionPlay/hooks/useCurrentNodeContextProjection';
import { useCurrentUserParticipantProjection } from '../features/sessionPlay/hooks/useCurrentUserParticipantProjection';
import { useExplorationSelectionLabels } from '../features/sessionPlay/hooks/useExplorationSelectionLabels';
import { useGmInventoryGrant } from '../features/sessionPlay/hooks/useGmInventoryGrant';
import { useGmVttMapSaveQueue } from '../features/sessionPlay/hooks/useGmVttMapSaveQueue';
import { useInventoryItemActions } from '../features/sessionPlay/hooks/useInventoryItemActions';
import { useInventoryMapCommandHandlers } from '../features/sessionPlay/hooks/useInventoryMapCommandHandlers';
import { useHumanGmAssist } from '../features/sessionPlay/hooks/useHumanGmAssist';
import { useHumanGmCombatAdminActions } from '../features/sessionPlay/hooks/useHumanGmCombatAdminActions';
import { useHumanGmSceneActions } from '../features/sessionPlay/hooks/useHumanGmSceneActions';
import { useMainCommandAutocompleteActions } from '../features/sessionPlay/hooks/useMainCommandAutocompleteActions';
import { useMainCommandAutocompleteState } from '../features/sessionPlay/hooks/useMainCommandAutocompleteState';
import {
  useMainCommandCheckResolver,
  type PendingMainCommandCheck,
} from '../features/sessionPlay/hooks/useMainCommandCheckResolver';
import { useMainCommandDraftLifecycle } from '../features/sessionPlay/hooks/useMainCommandDraftLifecycle';
import { useMainCommandPresentationModel } from '../features/sessionPlay/hooks/useMainCommandPresentationModel';
import {
  useMainCommandSelectionFields,
  useMainCommandTargetReconciliation,
} from '../features/sessionPlay/hooks/useMainCommandSelectionFields';
import {
  useMainCommandSubmitHandlers,
  type MainCommandMode,
} from '../features/sessionPlay/hooks/useMainCommandSubmitHandlers';
import { usePlayProfilePresentation } from '../features/sessionPlay/hooks/usePlayProfilePresentation';
import { usePlayNodeModeProjection } from '../features/sessionPlay/hooks/usePlayNodeModeProjection';
import {
  getEmptyParticipantSlotPresentation,
  useParticipantCardPresentation,
} from '../features/sessionPlay/hooks/useParticipantCardPresentation';
import { usePlayScenarioMapLoader } from '../features/sessionPlay/hooks/usePlayScenarioMapLoader';
import { usePlaySupportCatalogs } from '../features/sessionPlay/hooks/usePlaySupportCatalogs';
import { usePlayUnreadNotifications } from '../features/sessionPlay/hooks/usePlayUnreadNotifications';
import { useRecruitingCharacterSummary } from '../features/sessionPlay/hooks/useRecruitingCharacterSummary';
import { useRecruitingCarouselState } from '../features/sessionPlay/hooks/useRecruitingCarouselState';
import { useRecruitingParticipantPresentation } from '../features/sessionPlay/hooks/useRecruitingParticipantPresentation';
import { useRecruitingReadinessProjection } from '../features/sessionPlay/hooks/useRecruitingReadinessProjection';
import { useRecruitingWantedActionsPresentation } from '../features/sessionPlay/hooks/useRecruitingWantedActionsPresentation';
import { useRecruitingWantedCardPresentation } from '../features/sessionPlay/hooks/useRecruitingWantedCardPresentation';
import { useRestApprovalActions } from '../features/sessionPlay/hooks/useRestApprovalActions';
import { useScenarioDescriptionEditor } from '../features/sessionPlay/hooks/useScenarioDescriptionEditor';
import { useSessionVttMapRequests } from '../features/sessionPlay/hooks/useSessionVttMapRequests';
import { useSessionChatInput } from '../features/sessionPlay/hooks/useSessionChatInput';
import { useSessionSideActions } from '../features/sessionPlay/hooks/useSessionSideActions';
import { useSessionLeaveConfirmation } from '../features/sessionPlay/hooks/useSessionLeaveConfirmation';
import { useSessionCompletionPresentation } from '../features/sessionPlay/hooks/useSessionCompletionPresentation';
import { useSessionLayoutPresentation } from '../features/sessionPlay/hooks/useSessionLayoutPresentation';
import { useSessionLogAutoScroll } from '../features/sessionPlay/hooks/useSessionLogAutoScroll';
import { useSessionRenderedLogs } from '../features/sessionPlay/hooks/useSessionRenderedLogs';
import {
  emptySessionLogMessage,
  useSessionLogThreadRows,
} from '../features/sessionPlay/hooks/useSessionLogThreadRows';
import { useSessionMessageInputPresentation } from '../features/sessionPlay/hooks/useSessionMessageInputPresentation';
import { useSessionPermissionProjection } from '../features/sessionPlay/hooks/useSessionPermissionProjection';
import { useSessionSidebarLayout } from '../features/sessionPlay/hooks/useSessionSidebarLayout';
import { useSessionStartTransition } from '../features/sessionPlay/hooks/useSessionStartTransition';
import { useSessionSettingsPresentation } from '../features/sessionPlay/hooks/useSessionSettingsPresentation';
import { useSessionStateFlagsProjection } from '../features/sessionPlay/hooks/useSessionStateFlagsProjection';
import { useSessionTabPresentation } from '../features/sessionPlay/hooks/useSessionTabPresentation';
import { useSessionTabs } from '../features/sessionPlay/hooks/useSessionTabs';
import { useScenarioLevelPolicy } from '../features/sessionPlay/hooks/useScenarioLevelPolicy';
import { useSelectedPlayCharacter } from '../features/sessionPlay/hooks/useSelectedPlayCharacter';
import { useStoryRpUtterances } from '../features/sessionPlay/hooks/useStoryRpUtterances';
import { useStaticSrdPlayData } from '../features/sessionPlay/hooks/useStaticSrdPlayData';
import {
  buildCombatReactionBannerPresentation,
  formatCombatMoveResultMessage,
  isCombatReactionForUser,
  isCombatResponseDto,
  isMissingCombatError,
} from '../features/sessionPlay/utils/combatResultPresentation';
import { getUserFacingItemName } from '../features/sessionPlay/utils/displayNames';
import {
  buildMapPartyColorStyle,
  buildStoryPartyColorStyle,
  getConnectionLabel,
} from '../features/sessionPlay/utils/playPagePresentation';
import {
  getMainCommandHelperGroupForSelection,
  isMainCommandIntentAvailable,
  isMainCommandHelperGroupAvailable,
  reconcileMainCommandCategoryState,
  type MainCommandHelperGroup,
} from '../features/sessionPlay/utils/mainCommandModel';
import {
  getVttMapRenderSignature,
  shouldLogMapMovePerf,
} from '../features/sessionPlay/utils/vttMapRender';
import type { PendingOptimisticTokenMove } from '../features/sessionPlay/utils/vttMapState';
import { useQuickCreateDerivedStats } from '../features/characters/useQuickCreateDerivedStats';
import { useQuickCreateCharacterSubmit } from '../features/characters/useQuickCreateCharacterSubmit';
import { useQuickCreateFormState } from '../features/characters/useQuickCreateFormState';
import { useQuickCreateModalPresentation } from '../features/characters/useQuickCreateModalPresentation';
import { useQuickCreateModalLifecycle } from '../features/characters/useQuickCreateModalLifecycle';
import type { CharacterPayload } from '../hooks/useSession';
import {
  acceptCombatReaction,
  declineCombatReaction,
  getCombat,
  startCombat,
} from '../services/combatApi';
import type {
  LogEntry,
  Character,
  Participant,
  PersistentCharacter,
  PlayerScenarioView,
  SessionSnapshot,
  StoredUser,
} from '../types/session';
import './CharacterPage.css';
import './PlayPage.css';

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

type CombatReactionResultView = {
  combat: CombatResponseDto;
  map: VttMapStateDto;
  message?: string | null;
  movementDistanceFt?: number | null;
  movementCostFt?: number | null;
};

type QuickCreateAbilities = NonNullable<CharacterPayload['abilities']>;

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
  // UI 상태: 현재 탭, 모달 열림, 입력창 값입니다.
  const [mainMessage, setMainMessage] = useState('');
  const [mainCommandMode, setMainCommandMode] = useState<MainCommandMode>('GM_REQUEST');
  const [isCommandGuideOpen, setCommandGuideOpen] = useState(false);
  const [activeMainHelperGroup, setActiveMainHelperGroup] =
    useState<MainCommandHelperGroup | null>(null);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string | null>(null);
  const [openMainCommandCategory, setOpenMainCommandCategory] = useState<string | null>(null);
  const [selectedMainIntent, setSelectedMainIntent] = useState<
    SubmitMainCommandDto['intent'] | null
  >(null);
  const {
    selectedMainTargetId,
    setSelectedMainTargetId,
    selectedMainItemId,
    setSelectedMainItemId,
    selectedMainSpellId,
    setSelectedMainSpellId,
    selectedMainRelatedIntent,
    setSelectedMainRelatedIntent,
    mainPointX,
    setMainPointX,
    mainPointY,
    setMainPointY,
    selectedExplorationMapSelection,
    setSelectedExplorationMapSelection,
    clearMainCommandSelectionFields,
    resetMainCommandFieldsForContext,
    applyMainCommandDraftInput,
    applyExplorationMainCommandRequestModel,
    applyExplorationMapSelection,
    selectExplorationInventoryItem,
  } = useMainCommandSelectionFields();
  const [mainCommandError, setMainCommandError] = useState<string | null>(null);
  const [pendingMainCommandDraft, setPendingMainCommandDraft] =
    useState<ExplorationMainCommandRequest | null>(null);
  const [pendingMainCommandCheck, setPendingMainCommandCheck] =
    useState<PendingMainCommandCheck | null>(null);
  const [mainCommandAutocompleteIndex, setMainCommandAutocompleteIndex] = useState(-1);
  // 현재 세션의 플레이어용 시나리오 노드와 VTT 맵 로딩 상태입니다.
  const [playerScenario, setPlayerScenario] = useState<PlayerScenarioView | null>(null);
  const [vttMap, setVttMap] = useState<VttMapStateDto | null>(null);
  const [combat, setCombat] = useState<CombatResponseDto | null>(null);
  const [combatError, setCombatError] = useState<string | null>(null);
  const [isCombatBusy, setCombatBusy] = useState(false);
  const [isCombatChecked, setCombatChecked] = useState(false);
  const [scenarioLoadError, setScenarioLoadError] = useState<string | null>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  // optimistic map reconciliation ref입니다. 렌더링 없이 최신 값을 유지합니다.
  const latestConfirmedMapRef = useRef<VttMapStateDto | null>(null);
  const pendingOptimisticTokenMoveRef = useRef<PendingOptimisticTokenMove | null>(null);
  const autoCombatStartKeyRef = useRef<string | null>(null);
  const { classFeatureManifest, spellPools } = useStaticSrdPlayData();

  // 서버 스냅샷에서 현재 세션/참가자/선택 캐릭터/권한 상태를 계산합니다.
  const session = snapshot?.session ?? null;
  const participants = snapshot?.participants ?? [];
  const sessionCharacters = snapshot?.characters ?? [];

  const {
    isLeaveConfirmOpen,
    requestLeaveSession,
    cancelLeaveSession,
    confirmLeaveSession,
    leaveConfirmPresentation,
  } = useSessionLeaveConfirmation({ onLeaveSession });
  const {
    chatMessage,
    setChatMessage,
    handleChatSubmit,
  } = useSessionChatInput({ onAction });

  const {
    pendingCombatReaction,
    submitCombatReactionDecision,
    resolvePendingCombatReaction,
    claimCombatReactionHandling,
  } = useCombatReactionDecision();
  const pendingCombatReactionBanner = useMemo(
    () =>
      buildCombatReactionBannerPresentation(
        pendingCombatReaction?.reaction ?? null,
      ),
    [pendingCombatReaction],
  );

  function isCombatReactionForCurrentUser(
    reaction: CombatReactionPromptDto,
    combatView: CombatResponseDto | null = combat
  ) {
    return isCombatReactionForUser({
      reaction,
      combat: combatView,
      sessionCharacters,
      userId: user.id,
    });
  }

  const submitCombatReactionPrompt = useCallback((reaction: CombatReactionPromptDto) => {
    if (!session) {
      return Promise.reject(new Error('활성 세션이 없습니다.'));
    }

    return submitCombatReactionDecision(reaction, (accepted) => {
      const request = accepted ? acceptCombatReaction : declineCombatReaction;
      return request(user, session.id, { reactionId: reaction.id });
    });
  }, [session, submitCombatReactionDecision, user]);

  function applyCombatReactionResult(
    result: CombatReactionResultView,
    mapSource: string | null = null,
  ) {
    setCombat(result.combat);
    if (mapSource) {
      setVttMapIfChanged(result.map, mapSource);
    } else {
      setVttMap(result.map);
    }
    latestConfirmedMapRef.current = result.map;
    onCombatActionLog(formatCombatMoveResultMessage(result));
  }

  const {
    formState,
    setFormState,
    quickCreateConfigReady,
    selectedQuickCreateRace,
    selectedQuickCreateClass,
    resetQuickCreateForm,
  } = useQuickCreateFormState({ races, classDefinitions });
  const {
    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
  } = useQuickCreateModalLifecycle({ resetQuickCreateForm });
  const {
    sidebarWidth,
    isSidebarCollapsed,
    handleSidebarResizePointerDown,
    toggleSidebarCollapsed,
  } = useSessionSidebarLayout();
  const {
    economyState,
    campaignCalendarState,
    snapshotVttMap,
    isPartyDefeated,
  } = useSessionStateFlagsProjection({
    flags: snapshot?.state.flags,
  });
  const sessionCompletionPresentation = useSessionCompletionPresentation({
    isPartyDefeated,
  });
  const {
    myParticipant,
    serverSelectedCharacterId,
    participantActorSource,
    actorSessionCharacterId,
  } = useCurrentUserParticipantProjection({
    participants,
    userId: user.id,
  });
  const {
    isHumanGmSession,
    gmUserId,
    isGmUser,
    isHost,
    isRecruiting,
    isSessionCompleted,
    canControlSession,
    canUseHumanGmView,
    canManageStartedSession,
    canUseCampaignCalendarPanel,
  } = useSessionPermissionProjection({
    session,
    userId: user.id,
  });
  const {
    activeTab,
    setActiveTab,
    availableTabs,
  } = useSessionTabs({ isRecruiting });
  const {
    activeScenario,
    scenarioTitle,
    scenarioDescription,
    scenarioStartLevel,
    scenarioRecommendedEndLevel,
    quickCreateLevel,
    quickCreateScenarioId,
  } = useActiveSessionScenarioProjection({
    sessionScenarios: snapshot?.sessionScenarios,
  });
  const sessionSettingsPresentation = useSessionSettingsPresentation({
    session,
    phase: snapshot?.state.phase,
  });
  const handleCopyInviteCode = useCallback(() => {
    if (!sessionSettingsPresentation.inviteCodeToCopy) return;
    void navigator.clipboard.writeText(sessionSettingsPresentation.inviteCodeToCopy);
  }, [sessionSettingsPresentation.inviteCodeToCopy]);
  const {
    scenarioLevelLabel,
    isCharacterLevelAllowedForScenario,
  } = useScenarioLevelPolicy({
    startLevel: scenarioStartLevel,
    recommendedEndLevel: scenarioRecommendedEndLevel,
  });
  const {
    playerParticipants,
    readyLocked,
    readyParticipantCount,
    participantCount,
    allPlayersReady,
    canShowCharacterSelection,
    canStartSession,
  } = useRecruitingReadinessProjection({
    participants,
    myParticipant,
    sessionExists: Boolean(session),
    isRecruiting,
    isGmUser,
    canControlSession,
    sessionCharacters,
    isCharacterLevelAllowed: isCharacterLevelAllowedForScenario,
  });
  const {
    selectedCharacterId,
    isStatusMinimized,
    setStatusMinimized,
    joinableCharacters,
    wantedCarouselCharacters,
    wantedCarouselCharacter,
    handleWantedCarouselStep,
    handleCharacterSelectionConfirm,
    handleCharacterSelectionClear,
  } = useRecruitingCarouselState({
    characters,
    serverSelectedCharacterId,
    readyLocked,
    busy,
    allPlayersReady,
    scenarioLevelLabel,
    isCharacterLevelAllowed: isCharacterLevelAllowedForScenario,
    onSelectCharacter,
  });
  const {
    selectedCharacter,
    selectedSessionCharacter,
    selectedCharacterLevelAllowed,
    selectedCharacterInventory,
  } = useSelectedPlayCharacter({
    characters,
    sessionCharacters,
    selectedCharacterId,
    isCharacterLevelAllowed: isCharacterLevelAllowedForScenario,
  });
  const {
    inventoryUseFeedback,
    setInventoryUseFeedback,
    isInventoryUsePending,
    handleUseExplorationInventoryItem,
    handleEquipInventoryItem,
  } = useInventoryItemActions({
    user,
    sessionId: session?.id ?? null,
    busy,
    selectedSessionCharacter,
  });
  const {
    isEconomyPending,
    economyFeedback,
    handleEconomyAction,
    isCampaignCalendarPending,
    campaignCalendarFeedback,
    handleCampaignCalendarAction,
  } = useSessionSideActions({
    user,
    sessionId: session?.id ?? null,
    canManageStartedSession,
    onAction,
  });
  const {
    isGmInventoryGrantPending,
    handleGmGrantInventoryItem,
  } = useGmInventoryGrant({
    user,
    sessionId: session?.id ?? null,
    canUseHumanGmView,
    setInventoryUseFeedback,
    onAction,
  });
  const {
    resetMapSaveQueue,
    switchMapSaveSession,
    handleQueuedMapChange,
  } = useGmVttMapSaveQueue({
    user,
    canUseHumanGmView,
    combat,
    latestConfirmedMapRef,
    setMap: setVttMap,
    setCombat,
    setMapLoadError,
  });
  const {
    handleSessionTokenMoveRequest,
    handleMapPingRequest,
    handleMapInteractionRequest,
  } = useSessionVttMapRequests({
    user,
    sessionId: session?.id ?? null,
    clientMapVersion: snapshot?.state.version,
    actorSessionCharacterId,
    currentMap: vttMap,
    latestConfirmedMapRef,
    pendingOptimisticTokenMoveRef,
    setMap: setVttMap,
    setMapIfChanged: setVttMapIfChanged,
    setMapLoadError,
  });
  const {
    executeGmMessage,
    handleGmMessage,
    isGmMessagePending,
    executeGmNodeMove,
    handleGmNodeMove,
    isGmNodeMovePending,
  } = useHumanGmSceneActions({
    user,
    sessionId: session?.id ?? null,
    canUseHumanGmView,
    latestConfirmedMapRef,
    setVttMap,
    setPlayerScenario,
    setCombat,
    setCombatChecked,
    setCombatError,
    setMapLoadError,
    setScenarioLoadError,
    setSelectedExplorationMapSelection,
    onAction,
    onCombatActionLog,
  });
  const {
    gmAiAssistSuggestions,
    isGmAiAssistPending,
    handleGmAiAssistCreate,
    handleGmAiAssistGenerate,
    handleGmAiAssistAccept,
  } = useHumanGmAssist({
    user,
    sessionId: session?.id ?? null,
    canUseHumanGmView,
    stateVersion: snapshot?.state.version,
    executeGmMessage,
    executeGmNodeMove,
    setScenarioLoadError,
    onAction,
    onCombatActionLog,
  });
  const runCombatRequest = useCombatRequestRunner({
    user,
    sessionId: session?.id ?? null,
    isCombatBusy,
    setCombatBusy,
    setCombatError,
    setCombat,
    setVttMapIfChanged,
    latestConfirmedMapRef,
    onCombatActionLog,
    isCombatReactionForCurrentUser,
    claimCombatReactionHandling,
    submitCombatReactionPrompt,
    applyCombatReactionResult,
  });
  const {
    handleEquippedWeaponAttack,
    handleOffhandWeaponAttack,
    handleSneakAttack,
    handleMonsterCombatAction,
    handleDashCombatAction,
    handleDodgeCombatAction,
    handleHideCombatAction,
    handleReadyCombatAction,
    handleCombatClassFeature,
    handleCastCombatSpell,
    handleEndCombatTurn,
    handleEndCombat,
  } = useCombatActionHandlers({
    user,
    sessionId: session?.id ?? null,
    isCombatBusy,
    runCombatRequest,
    setMap: setVttMap,
    latestConfirmedMapRef,
    onSendAction,
  });
  const handleCombatTokenMoveRequest = useCombatTokenMoveRequest({
    user,
    sessionId: session?.id ?? null,
    combat,
    isCombatBusy,
    currentMap: vttMap,
    latestConfirmedMapRef,
    pendingOptimisticTokenMoveRef,
    setMap: setVttMap,
    setMapIfChanged: setVttMapIfChanged,
    setMapLoadError,
    setCombat,
    setCombatBusy,
    setCombatError,
    isCombatReactionForCurrentUser,
    claimCombatReactionHandling,
    submitCombatReactionPrompt,
    onCombatActionLog,
  });
  const handleForceMoveCombatParticipant = useCombatForceMoveRequest({
    user,
    sessionId: session?.id ?? null,
    combat,
    isCombatBusy,
    setCombat,
    setCombatBusy,
    setCombatError,
    setMapLoadError,
    setMapIfChanged: setVttMapIfChanged,
    isCombatReactionForCurrentUser,
    claimCombatReactionHandling,
    submitCombatReactionPrompt,
    applyCombatReactionResult,
    onCombatActionLog,
  });
  useCombatReactionAutoHandler({
    sessionId: session?.id ?? null,
    combat,
    isCombatReactionForCurrentUser,
    claimCombatReactionHandling,
    submitCombatReactionPrompt,
    applyCombatReactionResult,
    setCombatError,
  });
  const {
    handleApplyCombatCondition,
    handleAdjustCombatHp,
  } = useHumanGmCombatAdminActions({
    user,
    sessionId: session?.id ?? null,
    canUseHumanGmView,
    isCombatBusy,
    setCombatBusy,
    setCombatError,
    setCombat,
    setVttMap,
    latestConfirmedMapRef,
    onSendAction,
    onCombatActionLog,
  });
  const {
    isGameStarting,
    handleStartSession,
    startOverlayPresentation,
    gameStartingPresentation,
  } = useSessionStartTransition({
    isRecruiting,
    isHumanGmSession,
    isGmUser,
    isHost,
    readyParticipantCount,
    participantCount,
    onStartSession,
  });
  const {
    scenarioDescriptionText,
    scenarioDescriptionTextareaRef,
    setScenarioDescriptionText,
  } = useScenarioDescriptionEditor({
    activeTab,
    scenarioDescription,
  });

  const {
    quickCreateAbilities,
    quickCreateProficientSkills,
    quickCreateFeatures,
    quickCreateProficiencyBonus,
    quickCreateMaxHp,
    quickCreateArmorClass,
    quickCreateSpeed,
    quickCreatePresetId,
  } = useQuickCreateDerivedStats({
    classKey: selectedQuickCreateClass?.key ?? formState.classKey,
    level: quickCreateLevel,
    selectedRace: selectedQuickCreateRace,
    selectedClass: selectedQuickCreateClass,
  });
  const quickCreateModalPresentation = useQuickCreateModalPresentation({
    quickCreateConfigReady,
    busy,
    level: quickCreateLevel,
    maxHp: quickCreateMaxHp,
    armorClass: quickCreateArmorClass,
    speed: quickCreateSpeed,
    selectedClass: selectedQuickCreateClass,
  });
  const currentNode = playerScenario?.currentNode ?? null;
  const isCurrentNodePending = Boolean(
    snapshot?.state.currentNodeId && !currentNode && !scenarioLoadError
  );
  const {
    gmNodeMoveOptions,
    gmItemCatalog,
    ruleCatalog,
    isGmItemCatalogLoading,
    gmItemCatalogError,
  } = usePlaySupportCatalogs({
    user,
    sessionId: session?.id ?? null,
    canUseHumanGmView,
    currentNodeId: currentNode?.id ?? null,
    stateVersion: snapshot?.state.version,
  });
  const { handleCreateCharacter } = useQuickCreateCharacterSubmit({
    formState,
    selectedRace: selectedQuickCreateRace ?? null,
    selectedClass: selectedQuickCreateClass ?? null,
    scenarioId: quickCreateScenarioId,
    level: quickCreateLevel,
    abilities: quickCreateAbilities,
    proficiencyBonus: quickCreateProficiencyBonus,
    proficientSkills: quickCreateProficientSkills,
    features: quickCreateFeatures,
    maxHp: quickCreateMaxHp,
    armorClass: quickCreateArmorClass,
    speed: quickCreateSpeed,
    avatarPresetId: quickCreatePresetId,
    ruleCatalog,
    spellPools,
    onCreateCharacter,
    onCreated: closeCreateModal,
  });
  usePlayScenarioMapLoader({
    user,
    sessionId: session?.id ?? null,
    isRecruiting,
    currentNodeId: snapshot?.state.currentNodeId,
    stateVersion: snapshot?.state.version,
    snapshotVttMap,
    latestConfirmedMapRef,
    setPlayerScenario,
    setMap: setVttMap,
    setMapIfChanged: setVttMapIfChanged,
    setScenarioLoadError,
    setMapLoadError,
    resetMapSaveQueue,
    switchMapSaveSession,
  });
  const {
    currentSceneDescriptionText,
    recentGmAiAssistLogs,
    currentPublicClueIdSignature,
  } = useCurrentNodeContextProjection({
    currentNode,
    logs,
  });
  const {
    scenarioEyebrow,
    sceneDescriptionEyebrow,
    publicCluesEyebrow,
    publicCluesEmptyText,
    checkOptionsEyebrow,
    checkOptionsEmptyText,
    scenarioDescriptionEyebrow,
    scenarioTitleText,
    labeledCheckOptions,
  } = useCurrentNodeInfoPresentation({
    scenarioTitle,
    checkOptions: currentNode?.checkOptions ?? [],
  });
  const {
    hasUnreadInfo,
    unreadMessageCounts,
    revealedClueToast,
    revealedClueToastTitle,
  } = usePlayUnreadNotifications({
    activeTab,
    logs,
    sessionId: session?.id ?? null,
    currentNodeId: currentNode?.id ?? null,
    publicClues: currentNode?.publicClues ?? [],
    publicClueIdSignature: currentPublicClueIdSignature,
  });
  const sessionTabPresentation = useSessionTabPresentation({
    activeTab,
    availableTabs,
    hasUnreadInfo,
    unreadMessageCounts,
    hasOlderTurnLogs,
    isLoadingTurnLogs,
  });
  const {
    completedCombatNodeIds,
    currentScreenType,
    isStoryNode,
    isExplorationNode,
    isCombatNode,
    usesNodeSpecificPartyStrip,
    isExplorationMainCommandContext,
  } = usePlayNodeModeProjection({
    currentNode,
    combat,
    sessionId: session?.id,
    sessionExists: Boolean(session),
    isRecruiting,
    stateFlags: snapshot?.state.flags,
  });
  const {
    mainCommandText,
    mainCommandPresets,
    mainCommandCategoryLabels,
    activeMainCategory,
    openMainCommandOptions,
    selectedMainCommand,
    availableMainHelperOptions,
    activeMainHelperOption,
    mainSlashToken,
    shouldShowMainCommandAutocomplete,
    shouldShowCommandGuide,
    mainCommandModeButtonsPresentation,
    mainCommandAutocompleteEntryPresentations,
    mainCommandAutocompleteCommandEntries,
    activeMainCommandAutocompleteEntry,
    activeMainCommandAutocompleteId,
    availableMainHelperOptionPresentations,
    mainCommandGuideOptions,
    visibleTargetOptions,
    shouldShowMainCommandFields,
    shouldShowMainTargetField,
    shouldShowMainItemField,
    shouldShowMainSpellField,
    shouldShowMainRelatedIntentField,
    shouldShowMainPointField,
    selectedMainTarget,
    selectedMainItem,
    relatedIntentOptions,
  } = useMainCommandPresentationModel({
    currentScreenType,
    isExplorationMainCommandContext,
    mainCommandMode,
    mainMessage,
    isCommandGuideOpen,
    activeMainHelperGroup,
    selectedMainCategory,
    openMainCommandCategory,
    visibleTargets: currentNode?.visibleTargets ?? [],
    selectedCharacterInventory,
    selectedMainTargetId,
    selectedMainItemId,
    mainCommandAutocompleteIndex,
  });
  const messageInputPresentation = useSessionMessageInputPresentation({
    activeTab,
    mainCommandMode,
    selectedMainCommandLabel: selectedMainCommand?.label,
    shouldShowMainCommandAutocomplete,
    mainCommandAutocompleteCommandCount: mainCommandAutocompleteCommandEntries.length,
    activeMainCommandAutocompleteId,
  });
  const {
    mainCommandAutocompleteRef,
  } = useMainCommandAutocompleteState({
    activeIndex: mainCommandAutocompleteIndex,
    setActiveIndex: setMainCommandAutocompleteIndex,
    commandEntryCount: mainCommandAutocompleteCommandEntries.length,
    slashToken: mainSlashToken,
  });
  const {
    applyMainCommandAutocomplete,
    handleSidebarInputKeyDown,
  } = useMainCommandAutocompleteActions({
    activeTab,
    mainCommandMode,
    shouldShowMainCommandAutocomplete,
    commandEntries: mainCommandAutocompleteCommandEntries,
    activeEntry: activeMainCommandAutocompleteEntry,
    activeHelperGroup: activeMainHelperOption?.id,
    setMainCommandMode,
    setMainMessage,
    setSelectedMainIntent,
    setActiveMainHelperGroup,
    setCommandGuideOpen,
    setMainCommandError,
    setMainCommandAutocompleteIndex,
  });
  useMainCommandTargetReconciliation({
    selectedMainTargetId,
    setSelectedMainTargetId,
    visibleTargetOptions,
  });
  const {
    handleMainSubmit,
    handleExplorationMainCommandRequest,
  } = useMainCommandSubmitHandlers({
    mainMessage,
    setMainMessage,
    mainCommandMode,
    isAiGmSession: isAiGmMode(session?.gmMode),
    currentScreenType,
    currentNodeId: currentNode?.id,
    mainCommandPresets,
    activeMainHelperOption,
    selectedMainTargetId,
    selectedMainTarget,
    selectedMainItemId,
    selectedMainItem,
    selectedMainSpellId,
    selectedMainRelatedIntent,
    mainPointX,
    mainPointY,
    isExplorationMainCommandContext,
    actorSource: {
      selectedCharacterId,
      ...participantActorSource,
    },
    visibleTargets: currentNode?.visibleTargets ?? [],
    inventoryItems: selectedCharacterInventory,
    setActiveTab,
    setMainCommandMode,
    setSelectedMainCategory,
    setOpenMainCommandCategory,
    setSelectedMainIntent,
    setActiveMainHelperGroup,
    setPendingMainCommandDraft,
    setPendingMainCommandCheck,
    setMainCommandError,
    applyExplorationMainCommandRequestModel,
    onAction,
    onMainCommand,
  });
  const {
    handleResolveMainCommandCheck,
  } = useMainCommandCheckResolver({
    pendingMainCommandCheck,
    actorSource: {
      selectedCharacterId,
      ...participantActorSource,
    },
    setMainCommandError,
    setPendingMainCommandCheck,
    onResolveMainCommandCheck,
  });
  const {
    selectedExplorationMapLabel,
    selectedExplorationItemLabel,
  } = useExplorationSelectionLabels({
    selectedMapSelection: selectedExplorationMapSelection,
    visibleTargets: currentNode?.visibleTargets ?? [],
    selectedItem: selectedMainItem,
  });
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
    if (!user || !session?.id || !isCombatNode) {
      if (
        isEndedCombatStatus(combat?.status) &&
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
          (!isHumanGmMode(session.gmMode) || isGmUser)
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
    if (isHumanGmMode(session.gmMode) && !isGmUser) return;

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
    const nextState = reconcileMainCommandCategoryState({
      categoryLabels: mainCommandCategoryLabels,
      activeCategory: activeMainCategory,
      openCategory: openMainCommandCategory,
      selectedIntent: selectedMainIntent,
    });
    if (nextState.selectedCategory !== selectedMainCategory) {
      setSelectedMainCategory(nextState.selectedCategory);
    }
    if (nextState.openCategory !== openMainCommandCategory) {
      setOpenMainCommandCategory(nextState.openCategory);
    }
    if (nextState.selectedIntent !== selectedMainIntent) {
      setSelectedMainIntent(nextState.selectedIntent);
    }
  }, [
    activeMainCategory,
    mainCommandCategoryLabels,
    openMainCommandCategory,
    selectedMainCategory,
    selectedMainIntent,
  ]);

  useEffect(() => {
    if (
      selectedMainIntent &&
      !isMainCommandIntentAvailable(mainCommandPresets, selectedMainIntent)
    ) {
      setSelectedMainIntent(null);
    }
  }, [mainCommandPresets, selectedMainIntent]);

  useEffect(() => {
    if (
      activeMainHelperGroup &&
      !isMainCommandHelperGroupAvailable(availableMainHelperOptions, activeMainHelperGroup)
    ) {
      setActiveMainHelperGroup(null);
    }
  }, [activeMainHelperGroup, availableMainHelperOptions]);

  const {
    selectedCharacterAbilitySummary,
    wantedCarouselFeatureSummary,
  } = useRecruitingCharacterSummary({
    character: wantedCarouselCharacter,
    classFeatureManifest,
  });
  const wantedCardPresentation = useRecruitingWantedCardPresentation({
    character: wantedCarouselCharacter,
    emptySlotImage,
    hasActiveScenario: Boolean(activeScenario),
    scenarioLevelLabel,
  });
  const wantedActionsPresentation = useRecruitingWantedActionsPresentation({
    busy,
    readyLocked,
    selectedCharacterId,
    wantedCarouselCharacterCount: wantedCarouselCharacters.length,
    wantedCarouselCharacterDisabled: Boolean(wantedCarouselCharacter?.isDisabled),
    isReady: Boolean(myParticipant?.isReady),
    hasSelectedCharacter: Boolean(selectedCharacter),
    selectedCharacterLevelAllowed,
    canControlSession,
    allPlayersReady,
    isStatusMinimized,
    canStartSession,
  });

  const renderedRows = useSessionRenderedLogs({
    activeTab,
    logs,
    userDisplayName: user.displayName,
    participants,
    sessionCharacters,
    visibleTargets: currentNode?.visibleTargets ?? [],
    mapTokens: vttMap?.tokens ?? [],
  });
  const {
    visibleRestApprovalBanner,
    visibleOwnRestRequestBanner,
    handleApproveRestRequest,
    handleRejectRestRequest,
    handleCancelRestRequest,
    isRestRequestResolved,
  } = useRestApprovalActions({
    logs,
    snapshotApprovals: snapshot?.pendingRestApprovals,
    userId: user.id,
    canUseHumanGmView,
    onApproveRestRequest,
    onRejectRestRequest,
    onCancelRestRequest,
  });
  const { logEndRef } = useSessionLogAutoScroll({
    activeTab,
    renderedLogRows: renderedRows,
  });
  const storyRpUtterances = useStoryRpUtterances({
    logs,
    participants,
    sessionCharacters,
  });

  const {
    displayedParticipants,
    playerParticipantIds,
  } = useRecruitingParticipantPresentation({ participants });
  const {
    getParticipantBadge,
    getCharacterTokenColor,
    getParticipantLinkedCharacter,
    getParticipantProfileColor,
    getLogProfileColor,
    getLogProfileImage,
  } = usePlayProfilePresentation({
    session,
    isHumanGmSession,
    gmUserId,
    participants,
    sessionCharacters,
    playerParticipantIds,
    map: vttMap,
    visibleTargets: currentNode?.visibleTargets ?? [],
    gmProfileImage: dragonPeekImage,
  });
  const sessionLogThreadRows = useSessionLogThreadRows({
    rows: renderedRows,
    userDisplayName: user.displayName,
    isGmUser,
    gmProfileImage: dragonPeekImage,
    isRestRequestResolved,
    getLogProfileColor,
    getLogProfileImage,
  });
  const getParticipantCardPresentation = useParticipantCardPresentation({
    isHumanGmSession,
    isRecruiting,
    isHost,
    gmUserId,
    currentUserId: user.id,
    getParticipantBadge,
    getParticipantLinkedCharacter,
    getParticipantProfileColor,
  });

  useMainCommandDraftLifecycle({
    currentNodeId: currentNode?.id,
    isExplorationMainCommandContext,
    selectedMainIntent,
    pendingMainCommandDraft,
    mainCommandPresets,
    clearMainCommandSelectionFields,
    resetMainCommandFieldsForContext,
    applyMainCommandDraftInput,
    setMainMessage,
    setMainCommandError,
    setPendingMainCommandDraft,
  });

  function handleOpenRecruitingCreate() {
    onNavigateToCharacters();
  }

  const handleExplorationMapSelection = useCallback((selection: BattleMapSelection | null) => {
    applyExplorationMapSelection(selection);
  }, [applyExplorationMapSelection]);

  const handleSelectExplorationInventoryItem = useCallback((item: InventoryItemDto | null) => {
    selectExplorationInventoryItem(item);
  }, [selectExplorationInventoryItem]);

  const {
    handleDropInventoryItem,
    handlePickupMapObject,
    handleThrowInventoryItem,
  } = useInventoryMapCommandHandlers({
    hasSession: Boolean(session),
    busy,
    isInventoryUsePending,
    isCombatBusy,
    onSendAction,
  });

  function handleMapChange(nextMap: VttMapStateDto) {
    handleQueuedMapChange(session?.id ?? null, nextMap);
  }

  const {
    layoutStyle,
    layoutClassName,
    stageClassName,
    canvasClassName,
    gameSurfaceFallbackTitle,
    sidebarResizeAriaLabel,
    sidebarClassName,
    sidebarCollapseToggleLabel,
    participantStripClassName,
  } = useSessionLayoutPresentation({
    sidebarWidth,
    isSidebarCollapsed,
    isRecruiting,
    usesNodeSpecificPartyStrip,
    tavernImage,
    emptySlotImage,
    corkboardNoPaperImage,
    paperPinnedImage,
    bigBoxImage,
    smallBoxImage,
  });

  return (
    <main
      className={layoutClassName}
      style={layoutStyle}
    >
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <filter id="torn-paper-edge">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <section
        className={stageClassName}
      >
        <div
          className={canvasClassName}
        >
          {isRecruiting ? (
            <section className="session-room-overlay recruiting-room-overlay">
              <div className="session-room-overlay-row">
                <div className="session-room-overlay-title">

                  <strong>{sessionSettingsPresentation.sessionTitleText}</strong>
                </div>

                <span className={socketConnected ? 'status-pill online' : 'status-pill'}>
                  {getConnectionLabel(socketConnected)}
                </span>

                <div className="invite-inline">
                  <strong>{sessionSettingsPresentation.inviteCodeText}</strong>
                  <button
                    type="button"
                    className="invite-copy-button"
                    onClick={handleCopyInviteCode}
                    disabled={!sessionSettingsPresentation.canCopyInviteCode}
                    aria-label={sessionSettingsPresentation.inviteCopyAriaLabel}
                  >
                    <Icon name="copy" />
                  </button>
                </div>

                <div className="session-room-overlay-actions">
                  <button type="button" className="ghost" onClick={onBackToLobby}>
                    {sessionSettingsPresentation.backToLobbyLabel}
                  </button>
                  <button type="button" className="danger-button" onClick={requestLeaveSession}>
                    {sessionSettingsPresentation.leaveSessionLabel}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {session && isRecruiting && isGmUser ? (
            <section className="character-selection-board player-ready-board session-character-board recruiting-lobby-board">
              <div className="recruiting-lobby-board-layout">
                <section className="recruiting-gm-board">
                  <span>{sessionSettingsPresentation.recruitingGmRoleLabel}</span>
                  <strong>{user.displayName}</strong>
                  <p>{sessionSettingsPresentation.recruitingGmReadyDescription}</p>
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
                    disabled={wantedActionsPresentation.carouselNavigationDisabled}
                    aria-label={wantedActionsPresentation.previousCharacterAriaLabel}
                  >
                    <img src={carouselLeftImage} alt="" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="recruiting-wanted-nav next"
                    onClick={() => handleWantedCarouselStep(1)}
                    disabled={wantedActionsPresentation.carouselNavigationDisabled}
                    aria-label={wantedActionsPresentation.nextCharacterAriaLabel}
                  >
                    <img src={carouselRightImage} alt="" aria-hidden="true" />
                  </button>

                  <div className="recruiting-wanted-header">
                    <span>WANTED</span>
                    <strong>{wantedCardPresentation.headerTitle}</strong>
                  </div>

                  <div className="recruiting-wanted-body">
                    <div
                      className="recruiting-wanted-portrait-frame"
                      style={{ ['--frame-image' as string]: `url(${profileBorderCharacter})` }}
                    >
                      <div className="recruiting-wanted-portrait-crop">
                        <img
                          src={wantedCardPresentation.portraitSrc}
                          alt={wantedCardPresentation.portraitAlt}
                          className={wantedCardPresentation.portraitClassName}
                        />
                      </div>
                      <strong className="recruiting-wanted-portrait-name">
                        {wantedCardPresentation.portraitName}
                      </strong>
                    </div>

                    <div className="recruiting-wanted-copy">
                      <div className="recruiting-wanted-copy-header">
                        <strong>{wantedCardPresentation.identityLabel}</strong>
                      </div>

                      <div className="recruiting-wanted-stat-grid">
                        <div>
                          <span>{wantedCardPresentation.stats.level.label}</span>
                          <strong>{wantedCardPresentation.stats.level.value}</strong>
                        </div>
                        <div>
                          <span>{wantedCardPresentation.stats.maxHp.label}</span>
                          <strong>{wantedCardPresentation.stats.maxHp.value}</strong>
                        </div>
                        <div>
                          <span>{wantedCardPresentation.stats.armorClass.label}</span>
                          <strong>{wantedCardPresentation.stats.armorClass.value}</strong>
                        </div>
                        <div>
                          <span>{wantedCardPresentation.stats.speed.label}</span>
                          <strong>{wantedCardPresentation.stats.speed.value}</strong>
                        </div>
                      </div>

                      {wantedCardPresentation.levelRestrictionWarning ? (
                        <p className="session-ready-warning">
                          {wantedCardPresentation.levelRestrictionWarning}
                        </p>
                      ) : wantedCardPresentation.scenarioLevelHint ? (
                        <p className="recruiting-wanted-empty-copy">
                          {wantedCardPresentation.scenarioLevelHint}
                        </p>
                      ) : null}

                      <div className="recruiting-wanted-abilities">
                        {wantedCardPresentation.hasCharacter ? (
                          selectedCharacterAbilitySummary.map((ability) => (
                            <div key={ability.label}>
                              <span>{ability.label}</span>
                              <strong>{ability.value}</strong>
                            </div>
                          ))
                        ) : (
                          <p className="recruiting-wanted-empty-copy">
                            {wantedCardPresentation.abilitySummaryEmptyText}
                          </p>
                        )}
                      </div>

                      <div
                        className="recruiting-wanted-feature-summary"
                        aria-label={wantedCardPresentation.featureSummaryAriaLabel}
                      >
                        <span>{wantedCardPresentation.featureSummaryLabel}</span>
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
                            {wantedCardPresentation.featureSummaryEmptyText}
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
                      disabled={wantedActionsPresentation.createCharacterDisabled}
                    >
                      {wantedActionsPresentation.createCharacterLabel}
                    </button>
                    <button
                      type="button"
                      className="recruiting-wanted-action"
                      onClick={
                        selectedCharacterId
                          ? handleCharacterSelectionClear
                          : handleCharacterSelectionConfirm
                      }
                      disabled={wantedActionsPresentation.characterSelectionDisabled}
                    >
                      {wantedActionsPresentation.characterSelectionLabel}
                    </button>
                    <button
                      type="button"
                      className={wantedActionsPresentation.readyButtonClassName}
                      disabled={wantedActionsPresentation.readyButtonDisabled}
                      onClick={() => onSetReady(wantedActionsPresentation.nextReadyValue)}
                    >
                      {wantedActionsPresentation.readyButtonLabel}
                    </button>
                  </div>
                  {/* 호스트가 오버레이를 닫아도 시작 확인창으로 다시 돌아올 수 있는 진입점입니다. */}
                  {wantedActionsPresentation.shouldShowStartButton ? (
                    <button
                      type="button"
                      className="recruiting-wanted-start-button"
                      disabled={wantedActionsPresentation.startButtonDisabled}
                      onClick={() => setStatusMinimized(false)}
                    >
                      {wantedActionsPresentation.startButtonLabel}
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
                  <span className="eyebrow">{sessionCompletionPresentation.eyebrow}</span>
                  <h1>{sessionCompletionPresentation.title}</h1>
                  <p>{sessionCompletionPresentation.description}</p>
                </div>
              ) : isCurrentNodePending ? (
                <div className="session-game-surface__placeholder">
                  <h1>장면을 불러오는 중입니다</h1>
                </div>
              ) : isStoryNode ? (
                <StoryNodeSurface
                  node={currentNode}
                  scenarioTitle={scenarioTitle}
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
                  scenarioTitle={scenarioTitle}
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
                  scenarioTitle={scenarioTitle}
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
                  <h1>{gameSurfaceFallbackTitle}</h1>
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
              {pendingCombatReactionBanner ? (
                <section
                  className="session-combat-reaction-banner"
                  aria-label={pendingCombatReactionBanner.ariaLabel}
                >
                  <div>
                    <span className="session-combat-reaction-eyebrow">
                      {pendingCombatReactionBanner.eyebrow}
                    </span>
                    <strong>{pendingCombatReactionBanner.title}</strong>
                    <p>{pendingCombatReactionBanner.message}</p>
                  </div>
                  <div className="session-combat-reaction-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => resolvePendingCombatReaction(false)}
                    >
                      {pendingCombatReactionBanner.declineLabel}
                    </button>
                    <button type="button" onClick={() => resolvePendingCombatReaction(true)}>
                      {pendingCombatReactionBanner.acceptLabel}
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
                aria-label={startOverlayPresentation.closeAriaLabel}
                onClick={() => setStatusMinimized(true)}
              >
                <Icon name="x" />
              </button>
              <div className="session-ready-card-ornament top" aria-hidden="true" />
              <span className="eyebrow ready-eyebrow">{startOverlayPresentation.eyebrow}</span>

              <div className="session-ready-title-row">
                <h2>{startOverlayPresentation.title}</h2>
                <span className="ready-badge">
                  <Icon name="check-circle" /> {startOverlayPresentation.readyBadgeText}
                </span>
              </div>

              <div className="session-ready-divider" aria-hidden="true">
                <div className="diamond" />
              </div>

              <strong className="session-ready-subtitle">
                {startOverlayPresentation.subtitle}
              </strong>
              <p className="session-ready-desc">{startOverlayPresentation.description}</p>


              {canControlSession ? (
                <div className="ready-actions">
                  <button
                    type="button"
                    className="ready-btn-cancel"
                    onClick={() => setStatusMinimized(true)}
                  >
                    {startOverlayPresentation.cancelLabel}
                  </button>
                  <button
                    type="button"
                    className="ready-btn-start"
                    disabled={!canStartSession || busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleStartSession();
                    }}
                  >
                    {startOverlayPresentation.startLabel}
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
                aria-label={leaveConfirmPresentation.closeAriaLabel}
                onClick={cancelLeaveSession}
              >
                <Icon name="x" />
              </button>
              <div className="session-ready-card-ornament top" aria-hidden="true" />
              <strong className="session-ready-subtitle">
                {leaveConfirmPresentation.title}
              </strong>
              <p className="session-ready-desc">{leaveConfirmPresentation.description}</p>

              <div className="ready-actions">
                <button type="button" className="ready-btn-cancel" onClick={cancelLeaveSession}>
                  {leaveConfirmPresentation.cancelLabel}
                </button>
                <button
                  type="button"
                  className="ready-btn-start ready-btn-leave"
                  disabled={busy}
                  onClick={confirmLeaveSession}
                >
                  {leaveConfirmPresentation.confirmLabel}
                </button>
              </div>

              <div className="session-ready-card-ornament bottom" aria-hidden="true" />
            </section>
          </div>
        ) : null}

        {usesNodeSpecificPartyStrip ? null : (
          <section className={participantStripClassName}>
            {displayedParticipants.length
              ? displayedParticipants.slice(0, 4).map((participant, index) => {
                if (!participant) {
                  const emptySlot = getEmptyParticipantSlotPresentation(index, isRecruiting);

                  return (
                    <article
                      key={`empty-slot-${index}`}
                      className={emptySlot.className}
                    >
                      {isRecruiting ? (
                        <>
                          <img
                            src={emptySlotImage}
                            alt={emptySlot.emptySlotAlt}
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
                            <strong>{emptySlot.title}</strong>
                            <span>{emptySlot.description}</span>
                          </div>
                          <div className="participant-state">{emptySlot.stateLabel}</div>
                          <div className="participant-index">{emptySlot.indexLabel}</div>
                        </>
                      )}
                    </article>
                  );
                }

                const participantCard = getParticipantCardPresentation(participant);

                return (
                  <article
                    key={participant.id}
                    className={participantCard.cardClassName}
                    style={participantCard.profileStyle}
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
                        {participantCard.participantImage ? (
                          <img
                            src={participantCard.participantImage}
                            alt={participantCard.participantName}
                            className="recruiting-party-slot-portrait"
                          />
                        ) : (
                          <div className="recruiting-party-slot-fallback" aria-hidden="true" />
                        )}
                        {participantCard.badgeLabel ? (
                          <div className="recruiting-party-slot-badge">{participantCard.badgeLabel}</div>
                        ) : null}
                        <strong className="recruiting-party-slot-name">
                          {participant.user.displayName}
                        </strong>
                        <div className={participantCard.recruitingStatusClassName}>
                          {participantCard.recruitingStatusLabel}
                        </div>
                        {participantCard.canAssignHumanGm ? (
                          <button
                            type="button"
                            className="recruiting-party-slot-gm-button"
                            disabled={busy}
                            onClick={() => onSetHumanGm(participant.userId)}
                          >
                            {participantCard.assignHumanGmLabel}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {participantCard.badgeLabel ? (
                          <div className="participant-special-badge">{participantCard.badgeLabel}</div>
                        ) : null}
                        <div
                          className="participant-avatar-frame"
                          style={{ ['--frame-image' as string]: `url(${profileBorderCharacter})` }}
                        >
                          {participantCard.participantImage ? (
                            <img
                              src={participantCard.participantImage}
                              alt={participantCard.participantName}
                              className="participant-avatar-image"
                            />
                          ) : (
                            <div className="participant-avatar tone-1">
                              {participantCard.fallbackInitial}
                            </div>
                          )}
                        </div>
                        <div className="participant-card-body">
                          <strong>{participant.user.displayName}</strong>
                          <span>{participantCard.participantDescription}</span>
                        </div>
                        <div className={participantCard.participantStateClassName}>
                          {participantCard.stateLabel}
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
        aria-label={sidebarResizeAriaLabel}
        onPointerDown={handleSidebarResizePointerDown}
      />

      <aside className={sidebarClassName}>
        <button
          type="button"
          className="session-sidebar-collapse-toggle"
          aria-label={sidebarCollapseToggleLabel}
          title={sidebarCollapseToggleLabel}
          onClick={toggleSidebarCollapsed}
        >
          <span className="session-sidebar-collapse-toggle-arrow" aria-hidden="true" />
        </button>
        <div className="session-sidebar-tabs">
          {sessionTabPresentation.tabItems.map((item) => (
            <button
              key={item.tab}
              type="button"
              className={item.className}
              aria-label={item.ariaLabel}
              onClick={() => setActiveTab(item.tab)}
            >
              {item.label}
              {item.shouldShowInfoBadge ? (
                <span className="session-sidebar-tab-badge" aria-hidden="true" />
              ) : null}
              {item.unreadCountText ? (
                <span className="session-sidebar-tab-count" aria-hidden="true">
                  {item.unreadCountText}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="session-sidebar-panel">
          <div className={sessionTabPresentation.sidebarDescriptionClassName}>
            {activeTab === 'Main' && hasOlderTurnLogs ? (
              <div className="session-log-history-bar">
                <button
                  type="button"
                  className="session-log-history-button"
                  disabled={sessionTabPresentation.historyButtonDisabled}
                  onClick={onLoadOlderTurnLogs}
                >
                  <img
                    src={ornamentArrowUpGold}
                    alt=""
                    aria-hidden="true"
                    className="session-log-history-button-icon"
                  />
                  <span>{sessionTabPresentation.historyButtonLabel}</span>
                </button>
              </div>
            ) : (
              <p>{sessionTabPresentation.activeTabDescription}</p>
            )}
          </div>

          {visibleRestApprovalBanner ? (
            <section
              className="session-rest-approval-banner"
              aria-label={visibleRestApprovalBanner.ariaLabel}
            >
              <div>
                <span className="session-rest-approval-eyebrow">
                  {visibleRestApprovalBanner.eyebrow}
                </span>
                <strong>{visibleRestApprovalBanner.title}</strong>
                <p>{visibleRestApprovalBanner.message}</p>
              </div>
              <div className="session-rest-approval-actions">
                <button
                  type="button"
                  onClick={() => void handleApproveRestRequest(visibleRestApprovalBanner.actionId)}
                >
                  {visibleRestApprovalBanner.approveLabel}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void handleRejectRestRequest(visibleRestApprovalBanner.actionId)}
                >
                  {visibleRestApprovalBanner.rejectLabel}
                </button>
              </div>
            </section>
          ) : null}

          {visibleOwnRestRequestBanner ? (
            <section
              className="session-rest-approval-banner"
              aria-label={visibleOwnRestRequestBanner.ariaLabel}
            >
              <div>
                <span className="session-rest-approval-eyebrow">
                  {visibleOwnRestRequestBanner.eyebrow}
                </span>
                <strong>{visibleOwnRestRequestBanner.title}</strong>
                <p>{visibleOwnRestRequestBanner.message}</p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => void handleCancelRestRequest(visibleOwnRestRequestBanner.actionId)}
              >
                {visibleOwnRestRequestBanner.cancelLabel}
              </button>
            </section>
          ) : null}

          {activeTab === 'Main' || activeTab === 'Chat' ? (
            <>
              <div className="session-log-area">
                <div className="session-log-stack">
                  {sessionLogThreadRows.length ? (
                    sessionLogThreadRows.map((log) => {
                      return (
                        <Fragment key={log.id}>
                          {log.showDateSeparator ? (
                            <div className="chat-thread-date-divider">
                              <span>{log.dateLabel}</span>
                            </div>
                          ) : null}
                          <article
                            className={log.rowClassName}
                            style={log.chatColorStyle}
                          >
                            {log.rowClass === 'incoming' ? (
                              <div className={log.chatAvatarClassName}>
                                {log.chatProfileImage ? (
                                  <img
                                    src={log.chatProfileImage}
                                    alt={log.chatAvatarAlt}
                                    className="chat-thread-avatar-image"
                                  />
                                ) : (
                                  log.chatAvatarLabel
                                )}
                              </div>
                            ) : null}
                            <div className="chat-thread-stack">
                              <span className={log.senderClassName}>
                                {log.senderLabel}
                                {log.logToneLabel ? (
                                  <span className="chat-thread-tone-label">{log.logToneLabel}</span>
                                ) : null}
                              </span>
                              <div className={log.bubbleClassName}>
                                {log.isPendingAction ? (
                                  <span className="chat-thread-spinner" aria-hidden="true" />
                                ) : null}
                                <span>{log.message}</span>
                                {log.canApproveRestRequest && log.restApprovalActionId ? (
                                  <>
                                    <button
                                      type="button"
                                      className="chat-thread-inline-action"
                                      onClick={() =>
                                        log.restApprovalActionId
                                          ? void handleApproveRestRequest(log.restApprovalActionId)
                                          : undefined
                                      }
                                    >
                                      {log.approveRestLabel}
                                    </button>
                                    <button
                                      type="button"
                                      className="chat-thread-inline-action"
                                      onClick={() =>
                                        log.restApprovalActionId
                                          ? void handleRejectRestRequest(log.restApprovalActionId)
                                          : undefined
                                      }
                                    >
                                      {log.rejectRestLabel}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                              {log.rowClass !== 'notice' ? (
                                <span className="chat-thread-time">{log.time}</span>
                              ) : null}
                            </div>
                            {log.rowClass === 'outgoing' ? (
                              <div className={log.chatAvatarClassName}>
                                {log.chatProfileImage ? (
                                  <img
                                    src={log.chatProfileImage}
                                    alt={log.chatAvatarAlt}
                                    className="chat-thread-avatar-image"
                                  />
                                ) : (
                                  log.chatAvatarLabel
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
                        <div className="chat-thread-bubble">{emptySessionLogMessage}</div>
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
                {activeTab === 'Main' && isAiGmMode(session?.gmMode) && currentScreenType ? (
                  <div className="main-command-picker">
                    {/* 선택 상태는 별도 태그 대신 버튼 자체의 색과 테두리로 보여 시선 이동을 줄입니다. */}
                    <div className="main-command-mode-row">
                      <button
                        type="button"
                        className={mainCommandModeButtonsPresentation.gmRequest.className}
                        aria-pressed={mainCommandModeButtonsPresentation.gmRequest.ariaPressed}
                        onClick={() => {
                          setMainCommandMode('GM_REQUEST');
                          setCommandGuideOpen(false);
                          setSelectedMainIntent(null);
                          setActiveMainHelperGroup(null);
                          clearMainCommandSelectionFields();
                        }}
                      >
                        <Icon name="message-circle" />
                        <span>{mainCommandText.gmRequestModeLabel}</span>
                      </button>
                      <button
                        type="button"
                        className={mainCommandModeButtonsPresentation.rpAction.className}
                        aria-pressed={mainCommandModeButtonsPresentation.rpAction.ariaPressed}
                        onClick={() => {
                          setMainCommandMode('RP_ACTION');
                          setCommandGuideOpen(false);
                          setSelectedMainIntent(null);
                          setActiveMainHelperGroup(null);
                          clearMainCommandSelectionFields();
                        }}
                      >
                        <Icon name="hand" />
                        <span>{mainCommandText.rpActionModeLabel}</span>
                      </button>
                      <button
                        type="button"
                        className={mainCommandModeButtonsPresentation.commandGuide.className}
                        aria-label={mainCommandText.commandGuideLabel}
                        aria-pressed={mainCommandModeButtonsPresentation.commandGuide.ariaPressed}
                        title={mainCommandText.commandGuideLabel}
                        onClick={() => {
                          setMainCommandMode('GM_REQUEST');
                          setCommandGuideOpen((current) => !current);
                        }}
                      >
                        <Icon name="help-circle" />
                        <span>{mainCommandText.commandGuideLabel}</span>
                      </button>
                    </div>

                    {mainCommandMode === 'GM_REQUEST' && isExplorationMainCommandContext ? (
                      <div
                        className="main-command-selection-row"
                        aria-label={mainCommandText.explorationSelectionAriaLabel}
                      >
                        <div className="main-command-selection-chip">
                          <span>{mainCommandText.mapSelectionLabel}</span>
                          <strong>{selectedExplorationMapLabel}</strong>
                        </div>
                        <div className="main-command-selection-chip">
                          <span>{mainCommandText.itemSelectionLabel}</span>
                          <strong>{selectedExplorationItemLabel}</strong>
                        </div>
                      </div>
                    ) : mainCommandMode === 'GM_REQUEST' && availableMainHelperOptionPresentations.length ? (
                      <div className="main-command-helper-row">
                        {availableMainHelperOptionPresentations.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={option.className}
                            aria-pressed={option.ariaPressed}
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
                          {mainCommandText.commandGuideNoticeFirstLine}
                          <br />
                          {mainCommandText.commandGuideNoticeSecondLine}
                        </p>
                        {mainCommandGuideOptions.map(({ command, slashCommand, description }) => (
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
                            <small>{description}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {mainCommandAutocompleteEntryPresentations.length ? (
                      <div
                        ref={mainCommandAutocompleteRef as Ref<HTMLDivElement>}
                        className="main-command-autocomplete"
                        role="listbox"
                        aria-label={mainCommandText.autocompleteAriaLabel}
                      >
                        {mainCommandAutocompleteEntryPresentations.map((entry) => {
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

                          return (
                            <button
                              key={entry.command.intent}
                              id={entry.id}
                              type="button"
                              role="option"
                              className={entry.className}
                              aria-selected={entry.ariaSelected}
                              data-autocomplete-active={entry.dataAutocompleteActive}
                              onMouseEnter={() => {
                                if (entry.autocompleteIndex >= 0) {
                                  setMainCommandAutocompleteIndex(entry.autocompleteIndex);
                                }
                              }}
                              onClick={() => {
                                applyMainCommandAutocomplete(entry.command);
                              }}
                            >
                              <strong>{entry.slashCommand}</strong>
                              <small>{entry.description}</small>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {mainCommandMode === 'GM_REQUEST' && shouldShowMainCommandFields ? (
                      <div className="main-command-fields">
                        {shouldShowMainTargetField ? (
                          <label className="main-command-field">
                            <span>{mainCommandText.targetFieldLabel}</span>
                            <select
                              value={selectedMainTargetId}
                              onChange={(event) => setSelectedMainTargetId(event.target.value)}
                            >
                              <option value="">{mainCommandText.selectPlaceholder}</option>
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
                            <span>{mainCommandText.itemFieldLabel}</span>
                            <select
                              value={selectedMainItemId}
                              onChange={(event) => setSelectedMainItemId(event.target.value)}
                            >
                              <option value="">{mainCommandText.selectPlaceholder}</option>
                              {selectedCharacterInventory.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {getUserFacingItemName(item)}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        {shouldShowMainSpellField ? (
                          <label className="main-command-field">
                            <span>{mainCommandText.spellFieldLabel}</span>
                            <input
                              value={selectedMainSpellId}
                              onChange={(event) => setSelectedMainSpellId(event.target.value)}
                              placeholder={mainCommandText.spellPlaceholder}
                            />
                          </label>
                        ) : null}

                        {shouldShowMainRelatedIntentField ? (
                          <label className="main-command-field">
                            <span>{mainCommandText.relatedIntentFieldLabel}</span>
                            <select
                              value={selectedMainRelatedIntent}
                              onChange={(event) => setSelectedMainRelatedIntent(event.target.value)}
                            >
                              <option value="">
                                {mainCommandText.relatedIntentPlaceholder}
                              </option>
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
                            <span>{mainCommandText.pointFieldLabel}</span>
                            <div>
                              <input
                                value={mainPointX}
                                onChange={(event) => setMainPointX(event.target.value)}
                                inputMode="numeric"
                                placeholder={mainCommandText.pointXPlaceholder}
                              />
                              <input
                                value={mainPointY}
                                onChange={(event) => setMainPointY(event.target.value)}
                                inputMode="numeric"
                                placeholder={mainCommandText.pointYPlaceholder}
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
                  role={messageInputPresentation.inputRole}
                  aria-autocomplete={messageInputPresentation.ariaAutocomplete}
                  aria-expanded={messageInputPresentation.ariaExpanded}
                  aria-activedescendant={messageInputPresentation.ariaActivedescendant}
                  placeholder={messageInputPresentation.inputPlaceholder}
                />
                <button type="submit" disabled={busy} className="chat-submit-btn">
                  <Icon name="send" />
                  <span>{messageInputPresentation.submitLabel}</span>
                </button>
              </form>
            </>
          ) : null}

          {activeTab === 'Info' ? (
            <div className="session-info-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{scenarioEyebrow}</span>
                  <h2>{scenarioTitleText}</h2>
                </div>
              </div>

              <article className="scenario-node-panel">
                <span className="eyebrow">{sceneDescriptionEyebrow}</span>
                <p className="scenario-scene-description-text">{currentSceneDescriptionText}</p>
              </article>

              <article className="scenario-node-panel">
                <span className="eyebrow">{publicCluesEyebrow}</span>
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
                  <p>{publicCluesEmptyText}</p>
                )}
              </article>

              <article className="scenario-node-panel">
                <span className="eyebrow">{checkOptionsEyebrow}</span>
                {labeledCheckOptions.length ? (
                  <ul className="scenario-node-list">
                    {labeledCheckOptions.map(({ label }, index) => (
                      <li key={`${label}-${index}`}>
                        <strong>{label}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{checkOptionsEmptyText}</p>
                )}
              </article>

              <article className="scenario-node-panel">
                <span className="eyebrow">{scenarioDescriptionEyebrow}</span>
                <textarea
                  ref={scenarioDescriptionTextareaRef}
                  value={scenarioDescriptionText}
                  onChange={(event) => setScenarioDescriptionText(event.target.value)}
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
                      {sessionSettingsPresentation.backToLobbyLabel}
                    </button>
                    <button type="button" className="danger-button" onClick={requestLeaveSession}>
                      {sessionSettingsPresentation.leaveSessionLabel}
                    </button>
                  </div>
                  <div className="section-heading session-settings-title-heading">
                    <div>
                      <span className="eyebrow">
                        {sessionSettingsPresentation.currentSessionEyebrow}
                      </span>
                      <h2>{sessionSettingsPresentation.sessionTitleText}</h2>
                    </div>
                  </div>

                  <div className="session-settings-list">
                    <article className="session-settings-entry">
                      <span className="eyebrow">
                        {sessionSettingsPresentation.inviteCodeEyebrow}
                      </span>
                      <div className="session-settings-bubble session-settings-copy-bubble">
                        <strong>{sessionSettingsPresentation.inviteCodeText}</strong>
                        <button
                          type="button"
                          className="session-settings-copy-button"
                          onClick={handleCopyInviteCode}
                          disabled={!sessionSettingsPresentation.canCopyInviteCode}
                        >
                          {sessionSettingsPresentation.inviteCodeCopyLabel}
                        </button>
                      </div>
                    </article>

                    <article className="session-settings-entry">
                      <span className="eyebrow">
                        {sessionSettingsPresentation.sessionStatusEyebrow}
                      </span>
                      <p className="session-settings-bubble">
                        {sessionSettingsPresentation.statusText}
                      </p>
                    </article>

                    <article className="session-settings-entry">
                      <span className="eyebrow">
                        {sessionSettingsPresentation.visibilityEyebrow}
                      </span>
                      <p className="session-settings-bubble">
                        {sessionSettingsPresentation.visibilityText}
                      </p>
                    </article>
                  </div>
                </>
              ) : null}
              {isRecruiting ? (
                <dl className="session-meta">
                  <div>
                    <dt>{sessionSettingsPresentation.recruitingStatusLabel}</dt>
                    <dd>{sessionSettingsPresentation.statusText}</dd>
                  </div>
                  <div>
                    <dt>{sessionSettingsPresentation.recruitingPhaseLabel}</dt>
                    <dd>{sessionSettingsPresentation.phaseText}</dd>
                  </div>
                  <div>
                    <dt>{sessionSettingsPresentation.recruitingVisibilityLabel}</dt>
                    <dd>{sessionSettingsPresentation.visibilityText}</dd>
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
            <strong>{gameStartingPresentation.title}</strong>
            <p>{gameStartingPresentation.description}</p>
          </div>
        </div>
      ) : null}

      {/* 캐릭터가 없는 플레이어가 빠르게 캐릭터를 만드는 모달입니다. */}
      {isCreateModalOpen ? (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={handleCreateCharacter}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{quickCreateModalPresentation.eyebrow}</span>
                <h2>{quickCreateModalPresentation.title}</h2>
              </div>
              <button type="button" className="ghost" onClick={closeCreateModal}>
                {quickCreateModalPresentation.closeLabel}
              </button>
            </div>

            <p style={{ margin: '0 0 12px 0', opacity: 0.82 }}>
              {quickCreateModalPresentation.description}
            </p>

            <label>
              {quickCreateModalPresentation.nameLabel}
              <input
                value={formState.name}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </label>

            <label>
              {quickCreateModalPresentation.ancestryLabel}
              <select
                value={formState.ancestryKey}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, ancestryKey: event.target.value }))
                }
                required
                disabled={quickCreateModalPresentation.selectDisabled}
              >
                {races.map((race) => (
                  <option key={race.id} value={race.key}>
                    {race.koName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {quickCreateModalPresentation.classLabel}
              <select
                value={formState.classKey}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, classKey: event.target.value }))
                }
                required
                disabled={quickCreateModalPresentation.selectDisabled}
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
              {quickCreateModalPresentation.statusChips.map((chip) => (
                <div key={chip} className="status-chip">
                  {chip}
                </div>
              ))}
            </div>

            {quickCreateModalPresentation.proficientSkillDescription ? (
              <p style={{ margin: '8px 0 0 0', opacity: 0.82 }}>
                {quickCreateModalPresentation.proficientSkillDescription}
              </p>
            ) : null}

            {error ? (
              <p className="panel-error" role="alert" style={{ margin: '12px 0 0 0' }}>
                {error}
              </p>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={closeCreateModal}>
                {quickCreateModalPresentation.cancelLabel}
              </button>
              <button
                type="submit"
                className="primary"
                disabled={quickCreateModalPresentation.submitDisabled}
              >
                {quickCreateModalPresentation.submitLabel}
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
          <strong>{revealedClueToastTitle}</strong>
          <span>{revealedClueToast.title}</span>
          {revealedClueToast.text ? <small>{revealedClueToast.text}</small> : null}
        </div>
      ) : null}

      {/* 세션 전원에게 보이는 주사위 굴림 오버레이 (turn.log.created 이벤트로 트리거). */}
      <DiceRollOverlay data={activeDiceRoll} onDismiss={onDismissDiceRoll} />
    </main>
  );
}
