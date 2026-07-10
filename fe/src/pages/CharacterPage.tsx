/*
 * CharacterPage
 * 역할: 플레이어 캐릭터 목록, 상세 정보, 생성/수정/삭제 모달을 관리하는 페이지입니다.
 * 읽는 순서:
 * 1) 상단 상수/헬퍼: D&D풍 캐릭터 기본값, 능력치 계산, 직업/종족/초상화 매핑
 * 2) CharacterPageProps: 부모가 넘기는 캐릭터 데이터와 생성/수정/삭제 콜백
 * 3) 컴포넌트 state: 선택 캐릭터, 모달 열림 여부, 생성/수정 폼 값
 * 4) handler 함수: 모달 열기/닫기, 폼 제출, 능력치/스킬/인벤토리 수정
 * 5) JSX: 좌측 메뉴, 캐릭터 카드 그리드, 선택 캐릭터 상세, 생성/삭제 모달
 */
import { FormEvent, useEffect, useMemo } from 'react';
import parchmentScrollImage from '../assets/images/parchment_scroll.webp';
import boxBulletinNarrowFrame from '../components/Box_Bulletin_Narrow_Frame.webp';
import boxBulletinNarrowPlanks from '../components/Box_Bulletin_Narrow_Planks.webp';
import profileBorderCharacter from '../components/Profile_Border_Character.webp';
import profileBorderStats from '../components/Profile_Border_Stats.webp';
import sidePanelImage from '../components/Side_Panel.webp';
import { splitScenariosBySource } from '../data/sessionVisuals';
import type { CharacterPayload } from '../hooks/useSession';
import type { PersistentCharacter, Scenario, SessionSnapshot, StoredUser } from '../types/session';
import type {
  ClassDefinitionResponseDto,
  LevelUpCharacterDto,
  RaceResponseDto,
  UpdatePreparedSpellsDto,
} from '@trpg/shared-types';
import {
  normalizeSrdCharacterClassKey,
  resolveKnownSpellDelta,
} from '@trpg/srd-data/rules';
import { InventoryItemInfo } from '../features/sessionPlay/components/InventoryItemInfo';
import { getUserFacingItemName } from '../features/sessionPlay/utils/displayNames';
import { getCharacterImage } from '../features/characters/characterAvatarPresentation';
import {
  POINT_BUY_TOTAL,
  abilityDisplayLabels,
  abilityKeys,
  buildPointBuyState,
  buildCreateStatSummaryCards,
  deriveLevelStats,
  formatStat,
  getPointBuyAdjustment,
  getRecommendedAbilities,
  normalizeLevel,
  type AbilityKey,
} from '../features/characters/characterBuildRules';
import {
  allSkillsKo,
  buildCharacterCreateReviewViewModel,
  buildCharacterCreateStepViewState,
  buildCreateStatReferenceViewModel,
  characterCreateSteps,
  getClassOptionByValue,
  getCharacterClassLabel,
  getCreateStatSelectionLabel,
  getSkillLabel,
} from '../features/characters/characterCreateDefaults';
import {
  buildCharacterLevelUpPreviewRows,
  buildLevelUpFeaturePreviewItems,
} from '../features/characters/characterLevelUpPreview';
import {
  buildCreationAsiFeatChoiceState,
  buildLevelUpAsiFeatChoiceState,
  buildSubclassChoiceState,
  createEmptyAbilityScoreIncreases,
  featOptions,
  getActiveFeatureChoiceDefinitions,
  getAsiChoiceId,
  getFeatureChoiceContext,
  isAsiFeatChoiceSelectedElsewhere,
  isLevelUpAsiAbilityChoiceCapped,
  buildFeatureChoiceViewModels,
} from '../features/characters/characterFeatureChoices';
import {
  buildCreateFeaturePreviewItems,
  countFeaturePreviewStatuses,
  featureSourceLabels,
  featureStatusLabels,
  groupFeaturePreviewItemsByLevel,
} from '../features/characters/characterFeaturePreview';
import { summarizeCharacterFeatures } from '../features/characters/characterFeaturePresentation';
import { buildCharacterDetailViewModel } from '../features/characters/characterDetailPresentation';
import {
  buildSpellCatalogById,
  buildCharacterCreateSpellSelectionModel,
  buildCharacterLevelUpSpellSelectionModel,
  buildCharacterSpellDisplayModel,
  getPreparedSpellAbilityKey,
  resolveCharacterPreparedSpellLimit,
} from '../features/characters/characterSpellSelectionRules';
import { useCharacterCatalogs } from '../features/characters/useCharacterCatalogs';
import { useCharacterCreateDraft } from '../features/characters/useCharacterCreateDraft';
import { useCharacterCreateModalLifecycle } from '../features/characters/useCharacterCreateModalLifecycle';
import { useCharacterCreateToast } from '../features/characters/useCharacterCreateToast';
import { useCharacterDeleteFlow } from '../features/characters/useCharacterDeleteFlow';
import { useCharacterLevelUpDraft } from '../features/characters/useCharacterLevelUpDraft';
import { useCharacterLevelUpFlow } from '../features/characters/useCharacterLevelUpFlow';
import { useCharacterSelection } from '../features/characters/useCharacterSelection';
import {
  buildItemKoNameByKey,
  buildStartingEquipmentSlotViewModels,
  buildStartingEquipmentSummary,
  formatStartingEquipmentOption,
} from '../features/characters/characterStartingEquipment';
import {
  buildAncestryLabelMap,
  buildAncestryOptions,
  buildCreateRaceChoiceState,
  buildSelectedCharacterRaceInfo,
  buildSelectedCreateRaceInfo,
  findRaceByAncestryValue,
  getCreateRaceFeatureAncestryKey,
  getRaceTraitSummariesForCharacter,
} from '../features/characters/characterRacePresentation';
import { useCharacterAvatarPicker } from '../features/characters/useCharacterAvatarPicker';
import { SpellSelectionGrid } from '../features/spells/SpellSelectionGrid';
import { getSpellPresentation } from '../features/spells/spellPresentation';
import './CharacterPage.css';

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface CharacterPageProps {
  user: StoredUser;
  characters: PersistentCharacter[];
  scenarios: Scenario[];
  races: RaceResponseDto[];
  classDefinitions: ClassDefinitionResponseDto[];
  snapshot: SessionSnapshot | null;
  busy: boolean;
  error: string | null;
  onCreateCharacter: (payload: CharacterPayload) => Promise<boolean>;
  onCloneCharacter: (characterId: string) => void | Promise<void>;
  onUpdateCharacter: (characterId: string, payload: CharacterPayload) => Promise<boolean>;
  onLevelUpCharacter: (characterId: string, payload: LevelUpCharacterDto) => Promise<boolean>;
  onUpdatePreparedSpells: (
    characterId: string,
    payload: UpdatePreparedSpellsDto
  ) => Promise<boolean>;
  onDeleteCharacter: (characterId: string) => void | Promise<void>;
  autoOpenCreate?: boolean;
  sessionReturnTitle?: string | null;
  onReturnToSession?: () => void;
}

function readClampedInteger(
  value: string,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function readOptionIndex(value: string, optionCount: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= optionCount) {
    return fallback;
  }
  return parsed;
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function CharacterPage({
  user,
  characters,
  scenarios,
  races,
  classDefinitions,
  snapshot,
  busy,
  error,
  onCreateCharacter,
  onCloneCharacter,
  onUpdateCharacter,
  onLevelUpCharacter,
  onUpdatePreparedSpells,
  onDeleteCharacter,
  autoOpenCreate = false,
  sessionReturnTitle = null,
  onReturnToSession,
}: CharacterPageProps) {
  // 모달/선택/폼 상태입니다. 생성과 수정 모달이 같은 formState를 공유합니다.
  const {
    catalogError,
    classCatalog,
    classFeatureManifest,
    itemCatalog,
    raceCatalog,
    ruleCatalog,
    spellCatalog,
    spellPools,
  } = useCharacterCatalogs();
  const {
    isCreateModalOpen,
    editingCharacterId,
    skillInput,
    setSkillInput,
    formState,
    setFormState,
    formValidationError,
    createStepIndex,
    isStatsReferenceOpen,
    setStatsReferenceOpen,
    openCreateModal: openCreateDraftModal,
    openEditModal: openEditDraftModal,
    closeCreateModal: closeCreateDraftModal,
    goToPreviousCreateStep,
    goToNextCreateStep: goToNextCreateDraftStep,
    submitDraft: submitCreateDraft,
    syncDerivedStats,
    adjustAbilityBase: adjustCreateAbilityBase,
    updateAbilityScore,
    addSkill: addCreateSkill,
    removeSkill: removeCreateSkill,
    setName: setCreateName,
    selectScenario,
    selectAncestry,
    selectClass,
    setSubclass: setCreateSubclass,
    setAsiFeatChoice,
    setSingleFeatureChoice,
    toggleMultiFeatureChoice,
    selectStartingEquipmentSlot,
    selectStartingEquipmentItem,
    setStartingCantrips,
    setStartingSlotSpells,
    setStartingPreparedSpells,
  } = useCharacterCreateDraft({
    scenarios,
    races,
    classDefinitions,
    ruleCatalog,
    spellPools,
  });
  const {
    selectedCharacter,
    usedCharacterIds,
    characterCardViewModels,
    setSelectedCharacterId,
  } = useCharacterSelection({ characters, snapshot });
  const {
    isDeleteModalOpen,
    deleteWarning,
    dismissDeleteWarning,
    closeDeleteModal,
    requestDeleteSelectedCharacter,
    confirmDeleteSelectedCharacter,
  } = useCharacterDeleteFlow({
    selectedCharacter,
    usedCharacterIds,
    onDeleteCharacter,
  });
  const levelUpDraftState = useCharacterLevelUpDraft({
    selectedCharacter,
  });
  const levelUpDraft = levelUpDraftState.draft;
  const { createToast, clearCreateToast, showCreateToast } = useCharacterCreateToast({
    isCreateModalOpen,
    formValidationError,
    externalError: error,
  });

  const {
    avatarPickerViewModel,
    avatarAssetError,
    avatarUploadBusy,
    uploadAvatarAsset,
    applyUploadedAvatar,
    deleteUploadedAvatar,
    selectAvatarPreset,
  } = useCharacterAvatarPicker({
    user,
    formState,
    setFormState,
    onNotify: showCreateToast,
  });

  const itemKoNameByKey = useMemo(() => buildItemKoNameByKey(itemCatalog), [itemCatalog]);

  // className → ClassDefinition(시드) 룩업. 매칭되면 시작 장비 강제.
  const selectedClass = useMemo<ClassDefinitionResponseDto | null>(() => {
    const classKey = normalizeSrdCharacterClassKey(formState.className ?? '');
    if (!classKey) return null;
    return classDefinitions.find((c) => c.key === classKey) ?? null;
  }, [formState.className, classDefinitions]);
  const startingEquipmentSlotViewModels = useMemo(
    () =>
      selectedClass
        ? buildStartingEquipmentSlotViewModels({
            selectedClass,
            startingEquipmentSelection: formState.startingEquipmentSelection,
            startingEquipmentItemSelections: formState.startingEquipmentItemSelections,
          })
        : [],
    [
      formState.startingEquipmentItemSelections,
      formState.startingEquipmentSelection,
      selectedClass,
    ]
  );
  const resolvedStartingEquipmentSummary = useMemo(() => {
    return buildStartingEquipmentSummary({
      selectedClass,
      startingEquipmentSelection: formState.startingEquipmentSelection,
      startingEquipmentItemSelections: formState.startingEquipmentItemSelections,
      itemKoNameByKey,
    });
  }, [
    formState.startingEquipmentItemSelections,
    formState.startingEquipmentSelection,
    itemKoNameByKey,
    selectedClass,
  ]);
  const selectedCreateSubclassState = buildSubclassChoiceState({
    className: formState.className,
    level: formState.level,
    hasExistingSubclass: Boolean(formState.subclassName),
  });
  const selectedCreateClassKey = selectedCreateSubclassState.classKey;
  const selectedCreateSubclassOptions = selectedCreateSubclassState.options;
  const selectedCreateSubclassChoiceLevel = selectedCreateSubclassState.choiceLevel;
  const isCreateSubclassRequired = selectedCreateSubclassState.isRequired;
  const spellCatalogById = useMemo(() => buildSpellCatalogById(spellCatalog), [spellCatalog]);
  const createSpellSelection = useMemo(
    () =>
      buildCharacterCreateSpellSelectionModel({
        selectedClass,
        className: formState.className,
        classKey: selectedCreateClassKey,
        level: formState.level,
        abilities: formState.abilities,
        startingSpells: formState.startingSpells,
        ruleCatalog,
        spellCatalogById,
        spellPools,
      }),
    [
      formState.abilities,
      formState.className,
      formState.level,
      formState.startingSpells,
      ruleCatalog,
      selectedClass,
      selectedCreateClassKey,
      spellCatalogById,
      spellPools,
    ]
  );
  const detailedCantripOptions = createSpellSelection.cantripGridOptions;
  const selectedStartingCantripCount = createSpellSelection.cantripCount;
  const slotSpellOptions = createSpellSelection.slotSpellOptions;
  const detailedSlotSpellOptions = createSpellSelection.slotSpellGridOptions;
  const selectedStartingSlotSpellCount = createSpellSelection.slotSpellCount;
  const selectedStartingSlotSpells = createSpellSelection.selectedSlotSpellIds;
  const selectedStartingPreparedSpells = createSpellSelection.selectedPreparedSpellIds;
  const isStartingDynamicPreparedCaster = createSpellSelection.isDynamicPreparedCaster;
  const startingSpellReviewCounts = createSpellSelection.reviewCounts;
  const startingPreparedSpellOptions = createSpellSelection.preparedSpellOptions;
  const startingPreparedSpellLimit = createSpellSelection.preparedSpellLimit;
  const startingSpellSectionState = createSpellSelection.sectionState;

  // ancestry → race(시드)룩업. ancestry 가 race.key 또는 race.koName 와 매칭되면 보정 적용.
  const selectedRace = useMemo<RaceResponseDto | null>(() => {
    return findRaceByAncestryValue(races, formState.ancestry);
  }, [formState.ancestry, races]);
  const selectedCreateRaceChoiceState = useMemo(
    () => buildCreateRaceChoiceState(races, selectedRace),
    [races, selectedRace]
  );
  const baseRaceOptions = selectedCreateRaceChoiceState.baseRaceOptions;
  const selectedCreateBaseRace = selectedCreateRaceChoiceState.selectedBaseRace;
  const selectedCreateSubraceOptions = selectedCreateRaceChoiceState.subraceOptions;
  const selectedCreateSubraceKey = selectedCreateRaceChoiceState.selectedSubraceKey;
  const isCreateSubraceRequired = selectedCreateRaceChoiceState.isSubraceRequired;

  // Point Buy 계산 결과(base/cost/총비용/남은 포인트). selectedRace 없으면 검증 비활성화.
  const pointBuyState = useMemo(() => {
    return buildPointBuyState(formState.abilities, selectedRace?.abilityIncreases);
  }, [
    formState.abilities,
    selectedRace?.abilityIncreases,
  ]);

  // 레벨별 자동 계산: 시드된 클래스일 때 proficiencyBonus/maxHp 강제. BE와 동일 공식.
  const derivedLevelStats = useMemo(() => {
    if (!selectedClass) return null;
    return deriveLevelStats({
      hitDie: selectedClass.hitDie,
      classKey: selectedClass.key,
      raceKey: selectedRace?.key,
      subclassName: formState.subclassName,
      level: formState.level,
      conScore: formState.abilities?.con,
    });
  }, [
    selectedClass,
    selectedRace?.key,
    formState.level,
    formState.abilities?.con,
    formState.subclassName,
  ]);
  const createStatSummaryCards = useMemo(
    () =>
      buildCreateStatSummaryCards({
        maxHp: formState.maxHp,
        armorClass: formState.armorClass,
        speed: formState.speed,
        proficiencyBonus: formState.proficiencyBonus,
        level: formState.level,
        conScore: formState.abilities?.con,
        hitDie: selectedClass?.hitDie,
        derivedLevelStats,
      }),
    [
      derivedLevelStats,
      formState.abilities?.con,
      formState.armorClass,
      formState.level,
      formState.maxHp,
      formState.proficiencyBonus,
      formState.speed,
      selectedClass?.hitDie,
    ]
  );

  // derivedLevelStats 가 바뀌면 formState 의 prof/maxHp 동기화 (사용자가 못 바꾸는 값).
  useEffect(() => {
    syncDerivedStats(derivedLevelStats);
  }, [derivedLevelStats, syncDerivedStats]);

  // 선택된 캐릭터와 선택 폼에서 쓰는 종족/직업 정보를 메모이즈합니다.
  const selectedCharacterSubclassState = buildSubclassChoiceState({
    className: selectedCharacter?.className,
    level: levelUpDraft.targetLevel,
    hasExistingSubclass: Boolean(selectedCharacter?.subclassName),
  });
  const selectedCharacterClassKey = selectedCharacterSubclassState.classKey;
  const selectedCharacterClassInfo = useMemo(
    () =>
      selectedCharacter
        ? getClassOptionByValue(classCatalog, selectedCharacter.className)
        : undefined,
    [classCatalog, selectedCharacter]
  );
  const selectedSubclassOptions = selectedCharacter ? selectedCharacterSubclassState.options : [];
  const selectedSubclassChoiceLevel = selectedCharacterSubclassState.choiceLevel;
  const isSelectedCharacterPreparedCaster =
    getPreparedSpellAbilityKey(selectedCharacter?.className) !== null;
  const isSelectedCharacterWizard = selectedCharacterClassKey === 'wizard';
  const selectedCurrentCantrips = selectedCharacter?.spells?.cantrips ?? [];
  const selectedKnownSpellDelta = selectedCharacter
    ? resolveKnownSpellDelta({
        classKey: selectedCharacter.className,
        currentLevel: selectedCharacter.level,
        targetLevel: levelUpDraft.targetLevel,
      })
    : null;
  const levelUpLevelDelta = selectedCharacter
    ? Math.max(0, levelUpDraft.targetLevel - selectedCharacter.level)
    : 0;
  const cantripLearnAllowance =
    (selectedKnownSpellDelta?.cantripDelta ?? 0) + levelUpDraft.forgottenCantrips.length;
  const canReplaceSelectedKnownSpells =
    selectedKnownSpellDelta?.canReplaceKnownSpells === true;
  const knownSpellLearnAllowance =
    (selectedKnownSpellDelta?.knownSpellDelta ?? 0) +
    (canReplaceSelectedKnownSpells ? levelUpDraft.forgottenSpells.length : 0);
  const canSelectKnownSpellGrowth =
    selectedKnownSpellDelta?.targetHasKnownSpellProgression === true;
  const isLevelUpSubclassRequired = Boolean(
    selectedCharacter && selectedCharacterSubclassState.isSelectionRequired
  );
  const selectedKnownSlotSpells = useMemo(
    () => selectedCharacter?.spells?.spells ?? [],
    [selectedCharacter]
  );
  const selectedLevelUpSpellSelection = useMemo(
    () =>
      buildCharacterLevelUpSpellSelectionModel({
        className: selectedCharacter?.className,
        targetLevel: levelUpDraft.targetLevel,
        knownSlotSpellIds: selectedKnownSlotSpells,
        currentCantripIds: selectedCurrentCantrips,
        draftKnownSpellIds: levelUpDraft.knownSpells,
        canSelectKnownSpellGrowth,
        canSelectCantripGrowth: selectedKnownSpellDelta?.targetHasCantripProgression === true,
        isPreparedCaster: isSelectedCharacterPreparedCaster,
        ruleCatalog,
        spellCatalogById,
        spellPools,
      }),
    [
      canSelectKnownSpellGrowth,
      isSelectedCharacterPreparedCaster,
      levelUpDraft.knownSpells,
      levelUpDraft.targetLevel,
      ruleCatalog,
      selectedCharacter?.className,
      selectedCurrentCantrips,
      selectedKnownSlotSpells,
      selectedKnownSpellDelta?.targetHasCantripProgression,
      spellCatalogById,
      spellPools,
    ]
  );
  const selectedLevelUpLearnableSlotSpells =
    selectedLevelUpSpellSelection.learnableSlotSpells;
  const selectedLevelUpLearnableSlotSpellOptions =
    selectedLevelUpSpellSelection.learnableSlotSpellOptions;
  const selectedLevelUpForgottenSlotSpellOptions =
    selectedLevelUpSpellSelection.forgottenSlotSpellOptions;
  const selectedLevelUpLearnableCantrips = selectedLevelUpSpellSelection.learnableCantrips;
  const selectedLevelUpLearnableCantripOptions =
    selectedLevelUpSpellSelection.learnableCantripOptions;
  const selectedLevelUpForgottenCantripOptions =
    selectedLevelUpSpellSelection.forgottenCantripOptions;
  const selectedPreparedCandidateSlotSpells =
    selectedLevelUpSpellSelection.preparedCandidateSlotSpellIds;
  const selectedLevelUpPreparedSpellOptions =
    selectedLevelUpSpellSelection.preparedSpellOptions;
  const selectedSpellDisplay = useMemo(
    () =>
      buildCharacterSpellDisplayModel({
        cantripIds: selectedCurrentCantrips,
        knownSpellIds: selectedKnownSlotSpells,
        preparedSpellIds: selectedCharacter?.spells?.preparedSpells ?? [],
        isWizard: isSelectedCharacterWizard,
        ruleCatalog,
        spellCatalogById,
      }),
    [
      isSelectedCharacterWizard,
      ruleCatalog,
      selectedCharacter?.spells?.preparedSpells,
      selectedCurrentCantrips,
      selectedKnownSlotSpells,
      spellCatalogById,
    ]
  );
  const selectedPreparedSpells = selectedSpellDisplay.preparedSpellIds;
  const selectedDisplaySpellGroups = selectedSpellDisplay.summaryGroups;
  const selectedHasAnySpells = selectedSpellDisplay.hasAnySpells;
  const selectedCharacterRaceInfo = useMemo(
    () =>
      selectedCharacter
        ? buildSelectedCharacterRaceInfo({
            raceCatalog,
            ancestry: selectedCharacter.ancestry,
            features: selectedCharacter.features,
          })
        : null,
    [raceCatalog, selectedCharacter]
  );
  const selectedCharacterRaceTraitSummaries = useMemo(
    () => getRaceTraitSummariesForCharacter(selectedCharacterRaceInfo, selectedCharacter ?? null),
    [selectedCharacter, selectedCharacterRaceInfo]
  );
  const selectedCharacterFeatureSummary = useMemo(
    () =>
      summarizeCharacterFeatures(
        selectedCharacter?.features,
        8,
        classFeatureManifest,
        selectedCharacterRaceTraitSummaries
      ),
    [classFeatureManifest, selectedCharacter?.features, selectedCharacterRaceTraitSummaries]
  );
  const levelUpAsiFeatChoiceState = buildLevelUpAsiFeatChoiceState({
    classKey: selectedCharacterClassKey,
    currentLevel: selectedCharacter?.level,
    targetLevel: levelUpDraft.targetLevel,
    asiFeatChoices: levelUpDraft.asiFeatChoices,
    currentAbilities: selectedCharacter?.abilities,
  });
  const crossedAsiLevels = levelUpAsiFeatChoiceState.crossedAsiLevels;
  const normalizedLevelUpAsiFeatChoices = levelUpAsiFeatChoiceState.asiFeatChoices;
  const selectedLevelUpFeatIds = levelUpAsiFeatChoiceState.selectedFeatIds;
  const derivedLevelUpAbilityScoreIncreases = levelUpAsiFeatChoiceState.abilityScoreIncreases;
  const missingAsiFeatChoiceCount = levelUpAsiFeatChoiceState.missingChoiceCount;
  const levelUpAbilities = levelUpAsiFeatChoiceState.abilities;
  const selectedLevelUpPreparedSpellLimit = selectedCharacter
    ? resolveCharacterPreparedSpellLimit(
        selectedCharacter.className,
        levelUpDraft.targetLevel,
        levelUpAbilities
      )
    : null;
  const {
    isLevelUpModalOpen,
    openLevelUpModal,
    closeLevelUpModal,
    submitLevelUpSelectedCharacter,
    savePreparedSpells,
  } = useCharacterLevelUpFlow({
    selectedCharacter,
    usedCharacterIds,
    draft: levelUpDraft,
    abilityScoreIncreases: derivedLevelUpAbilityScoreIncreases,
    featSelections: selectedLevelUpFeatIds,
    preparedSpellLimit: selectedLevelUpPreparedSpellLimit,
    onLevelUpCharacter,
    onUpdatePreparedSpells,
  });
  const isLevelUpPreparedSpellLimitExceeded =
    selectedLevelUpPreparedSpellLimit !== null &&
    levelUpDraft.preparedSpells.length > selectedLevelUpPreparedSpellLimit;
  const isLevelUpSpellReplacementIncomplete =
    levelUpDraft.knownSpells.length < levelUpDraft.forgottenSpells.length ||
    levelUpDraft.cantrips.length < levelUpDraft.forgottenCantrips.length;
  const levelUpDraftSpellActions = levelUpDraftState.bindSpellSelectionActions({
    knownSpellLearnAllowance,
    cantripLearnAllowance,
    levelDelta: levelUpLevelDelta,
    baseKnownSpellAllowance: selectedKnownSpellDelta?.knownSpellDelta ?? 0,
    baseCantripAllowance: selectedKnownSpellDelta?.cantripDelta ?? 0,
    canReplaceKnownSpells: canReplaceSelectedKnownSpells,
    preparedSpellLimit: selectedLevelUpPreparedSpellLimit,
  });
  const levelUpFeaturePreviewItems = useMemo(
    () =>
      buildLevelUpFeaturePreviewItems({
        character: selectedCharacter,
        classInfo: selectedCharacterClassInfo,
        classKey: selectedCharacterClassKey,
        targetLevel: levelUpDraft.targetLevel,
        subclassChoiceLevel: selectedSubclassChoiceLevel,
        isSubclassRequired: isLevelUpSubclassRequired,
        selectedSubclassName: levelUpDraft.subclassName,
        crossedAsiLevels,
        asiFeatChoices: normalizedLevelUpAsiFeatChoices,
        classFeatureManifest,
      }),
    [
      crossedAsiLevels,
      classFeatureManifest,
      isLevelUpSubclassRequired,
      levelUpDraft.subclassName,
      levelUpDraft.targetLevel,
      normalizedLevelUpAsiFeatChoices,
      selectedCharacter,
      selectedCharacterClassInfo,
      selectedCharacterClassKey,
      selectedSubclassChoiceLevel,
    ]
  );
  const levelUpFeatureTimelineGroups = useMemo(
    () => groupFeaturePreviewItemsByLevel(levelUpFeaturePreviewItems),
    [levelUpFeaturePreviewItems]
  );
  const levelUpPreviewRows = useMemo(
    () =>
      buildCharacterLevelUpPreviewRows({
        character: selectedCharacter,
        knownSlotSpellCount: selectedKnownSlotSpells.length,
        currentCantripCount: selectedCurrentCantrips.length,
        preparedSpellCount: levelUpDraft.preparedSpells.length,
        preparedSpellLimit: selectedLevelUpPreparedSpellLimit,
        getItemName: getUserFacingItemName,
      }),
    [
      levelUpDraft.preparedSpells.length,
      selectedCharacter,
      selectedCurrentCantrips.length,
      selectedKnownSlotSpells.length,
      selectedLevelUpPreparedSpellLimit,
    ]
  );

  const ancestryOptions = useMemo(() => buildAncestryOptions(raceCatalog), [raceCatalog]);
  const ancestryLabelMap = useMemo(
    () => buildAncestryLabelMap(ancestryOptions, races),
    [ancestryOptions, races]
  );
  const selectedCharacterDetail = useMemo(
    () =>
      selectedCharacter
        ? buildCharacterDetailViewModel({ character: selectedCharacter, ancestryLabelMap })
        : null,
    [ancestryLabelMap, selectedCharacter]
  );
  const selectedRaceInfo = useMemo(
    () =>
      buildSelectedCreateRaceInfo({
        raceCatalog,
        ancestry: formState.ancestry,
        selectedRace,
        selectedBaseRace: selectedCreateBaseRace,
      }),
    [formState.ancestry, raceCatalog, selectedCreateBaseRace, selectedRace]
  );
  const selectedClassInfo = useMemo(
    () => getClassOptionByValue(classCatalog, formState.className),
    [classCatalog, formState.className]
  );
  const {
    currentCreateStep,
    isProfileStep,
    isStatsStep,
    isSkillsStep,
    isFeaturesStep,
    isEquipmentStep,
    isSpellsStep,
    isReviewStep,
    hasCreateFormRightColumn,
    isFinalCreateStep,
  } = buildCharacterCreateStepViewState(createStepIndex);
  const currentStatSelectionLabel = getCreateStatSelectionLabel(
    selectedRaceInfo,
    selectedClassInfo
  );
  const createStatReferenceViewModel = useMemo(
    () => buildCreateStatReferenceViewModel(selectedRaceInfo, selectedClassInfo),
    [selectedClassInfo, selectedRaceInfo]
  );
  const selectedCreateAncestryKey = getCreateRaceFeatureAncestryKey(formState.ancestry);
  const creationAsiFeatChoiceState = buildCreationAsiFeatChoiceState({
    className: formState.className,
    level: formState.level,
    features: formState.features,
  });
  const featurePreviewItems = useMemo(
    () =>
      buildCreateFeaturePreviewItems({
        ancestryKey: selectedCreateAncestryKey,
        className: formState.className,
        level: formState.level,
        features: formState.features,
        proficientSkills: formState.proficientSkills,
        subclassRequired: isCreateSubclassRequired,
        subclassName: formState.subclassName,
        raceInfo: selectedRaceInfo,
        classInfo: selectedClassInfo,
        classFeatureManifest,
      }),
    [
      formState.className,
      formState.features,
      formState.level,
      formState.proficientSkills,
      formState.subclassName,
      classFeatureManifest,
      isCreateSubclassRequired,
      selectedClassInfo,
      selectedCreateAncestryKey,
      selectedRaceInfo,
    ]
  );
  const requiredFeaturePreviewItems = featurePreviewItems.filter(
    (feature) => feature.status === 'required'
  );
  const featureTimelineGroups = useMemo(
    () => groupFeaturePreviewItemsByLevel(featurePreviewItems),
    [featurePreviewItems]
  );
  const featureTimelineStats = useMemo(
    () => countFeaturePreviewStatuses(featurePreviewItems),
    [featurePreviewItems]
  );
  const createReviewViewModel = useMemo(
    () =>
      buildCharacterCreateReviewViewModel({
        formState,
        raceInfo: selectedRaceInfo,
        classInfo: selectedClassInfo,
        featurePreviewItems,
        requiredFeaturePreviewItemCount: requiredFeaturePreviewItems.length,
        startingEquipmentItemCount: resolvedStartingEquipmentSummary.length,
        startingSpellReviewCounts,
        isStartingDynamicPreparedCaster,
      }),
    [
      featurePreviewItems,
      formState,
      isStartingDynamicPreparedCaster,
      requiredFeaturePreviewItems.length,
      resolvedStartingEquipmentSummary.length,
      selectedClassInfo,
      selectedRaceInfo,
      startingSpellReviewCounts,
    ]
  );
  const featureChoiceContext = useMemo(
    () =>
      getFeatureChoiceContext({
        ancestry: formState.ancestry,
        className: formState.className,
        level: formState.level,
        features: formState.features,
        proficientSkills: formState.proficientSkills,
      }),
    [
      formState.ancestry,
      formState.className,
      formState.features,
      formState.level,
      formState.proficientSkills,
    ]
  );
  const activeFeatureChoiceDefinitions = useMemo(
    () => getActiveFeatureChoiceDefinitions(featureChoiceContext),
    [featureChoiceContext]
  );
  const featureChoiceViewModels = useMemo(
    () => buildFeatureChoiceViewModels(activeFeatureChoiceDefinitions, featureChoiceContext),
    [activeFeatureChoiceDefinitions, featureChoiceContext]
  );

  const scenarioGroups = useMemo(() => splitScenariosBySource(scenarios), [scenarios]);

  // 새 캐릭터 생성 모달을 여는 함수입니다.
  function openCreateModal() {
    openCreateDraftModal();
    clearCreateToast();
  }

  // 선택한 캐릭터 정보를 formState에 복사해 수정 모달을 여는 함수입니다.
  function openEditModal() {
    if (openEditDraftModal(selectedCharacter)) {
      clearCreateToast();
    }
  }

  function closeCreateModal() {
    closeCreateDraftModal();
    clearCreateToast();
  }

  function dismissCreateModal() {
    const shouldReturnToSession = !editingCharacterId && Boolean(onReturnToSession);
    closeCreateModal();
    if (shouldReturnToSession) {
      onReturnToSession?.();
    }
  }

  useCharacterCreateModalLifecycle({
    isCreateModalOpen,
    autoOpenCreate,
    openCreateModal,
  });

  function goToNextCreateStep() {
    goToNextCreateDraftStep({
      stepKey: currentCreateStep.key,
      formState,
      isSubclassRequired: isCreateSubclassRequired,
      isSubraceRequired: isCreateSubraceRequired,
      selectedSubraceKey: selectedCreateSubraceKey,
      pointBuyState,
      classDefinitionsLoaded: classDefinitions.length > 0,
    });
  }

  async function submitCreateCharacter() {
    const submitResult = await submitCreateDraft({
      classDefinitionsLoaded: classDefinitions.length > 0,
      isSubclassRequired: isCreateSubclassRequired,
      isSubraceRequired: isCreateSubraceRequired,
      selectedSubraceKey: selectedCreateSubraceKey,
      selectedClass,
      selectedStartingCantripCount,
      selectedStartingSlotSpellCount,
      startingPreparedSpellLimit,
      startingPreparedSpellOptions,
      isStartingDynamicPreparedCaster,
      slotSpellOptions,
      shouldReturnToSession: Boolean(onReturnToSession),
      onCreateCharacter,
      onUpdateCharacter,
    });

    if (submitResult.succeeded) {
      clearCreateToast();
    }

    if (submitResult.shouldReturnToSession) {
      onReturnToSession?.();
    }
  }

  async function handleCloneSelectedCharacter() {
    if (!selectedCharacter) return;
    await onCloneCharacter(selectedCharacter.id);
  }

  return (
    <main className="character-page fantasy-character-page">
      {/* 좌측 사이드바: 캐릭터 생성 버튼과 안내 영역입니다. */}
      <section className="fantasy-character-layout">
        <aside className="fantasy-character-sidebar">
          {onReturnToSession ? (
            <button
              type="button"
              className="fantasy-character-sidebutton"
              style={{ backgroundImage: `url(${sidePanelImage})` }}
              onClick={onReturnToSession}
            >
              {sessionReturnTitle ? `${sessionReturnTitle} 세션으로` : '세션으로'} 돌아가기
            </button>
          ) : null}
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={openCreateModal}
          >
            새 캐릭터 생성
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={() => void handleCloneSelectedCharacter()}
            disabled={!selectedCharacter || busy}
          >
            캐릭터 복제
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={openEditModal}
            disabled={!selectedCharacter || busy}
          >
            캐릭터 수정
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={requestDeleteSelectedCharacter}
            disabled={!selectedCharacter || busy}
          >
            캐릭터 삭제
          </button>
        </aside>

        {/* 캐릭터 카드 목록과 선택 캐릭터 상세 정보를 보여주는 메인 보드입니다. */}
        <section className="fantasy-character-board">
          <div
            className="fantasy-character-board-planks"
            style={{ backgroundImage: `url(${boxBulletinNarrowPlanks})` }}
            aria-hidden="true"
          />
          <div className="fantasy-character-board-scroll fantasy-scroll-hidden">
            {/* 보유 캐릭터 카드 목록입니다. 카드 선택 시 상세 패널이 바뀝니다. */}
            <div className="fantasy-character-grid">
              {characterCardViewModels.map((character) => (
                <button
                  type="button"
                  key={character.id}
                  className={`fantasy-character-card${character.isSelected ? ' selected' : ''}`}
                  onClick={() => setSelectedCharacterId(character.id)}
                >
                  <div
                    className="fantasy-character-card-frame"
                    style={{ ['--frame-image' as string]: `url(${profileBorderCharacter})` }}
                  >
                    <img
                      src={character.image}
                      alt={character.name}
                      className="fantasy-character-card-art"
                    />
                    {character.isInUse ? (
                      <div className="fantasy-character-card-overlay">사용 중...</div>
                    ) : null}
                    <div className="fantasy-character-card-nameplate">{character.name}</div>
                    <div className="fantasy-character-card-class">{character.classLabel}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div
            className="fantasy-character-board-frame"
            style={{ backgroundImage: `url(${boxBulletinNarrowFrame})` }}
            aria-hidden="true"
          />
        </section>

        <section className="fantasy-character-detail">
          {selectedCharacter && selectedCharacterDetail ? (
            <>
              <article
                className="fantasy-character-stats-frame"
                style={{ ['--frame-image' as string]: `url(${profileBorderStats})` }}
              >
                <div className="fantasy-character-stats-scroll fantasy-scroll-hidden">
                  <div className="fantasy-character-stats-content">
                    <h2>{selectedCharacterDetail.name}</h2>

                    <dl className="fantasy-character-summary-list">
                      {selectedCharacterDetail.summaryRows.map((row) => (
                        <div key={row.label}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>

                    <section className="fantasy-character-stats-section">
                      <h3>보유 특성</h3>
                      {selectedCharacterFeatureSummary.length ? (
                        <div className="fantasy-character-feature-summary">
                          {selectedCharacterFeatureSummary.map((feature) => (
                            <article
                              key={`${feature.sourceLabel}-${feature.label}`}
                              className={`fantasy-character-feature-chip tone-${feature.tone}`}
                              title={feature.description}
                            >
                              <span>{feature.sourceLabel}</span>
                              <strong>{feature.label}</strong>
                              <p>{feature.description}</p>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="character-empty-note">등록된 특성이 없습니다.</p>
                      )}
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>주문</h3>
                      {selectedHasAnySpells ? (
                        <div className="fantasy-character-spell-summary">
                          {selectedDisplaySpellGroups.map((group) => (
                            <article
                              key={group.key}
                              className={`fantasy-character-spell-group${
                                group.isPrepared ? ' prepared' : ''
                              }`}
                            >
                              <div className="fantasy-character-spell-group-heading">
                                <strong>{group.title}</strong>
                                <span>{group.count}개</span>
                              </div>
                              <SpellSelectionGrid
                                title={group.title}
                                options={group.options}
                                selectedIds={[]}
                                readOnly
                                showHeader={false}
                                showToolbar={false}
                              />
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="character-empty-note">
                          이 캐릭터는 현재 배우거나 준비한 주문이 없습니다.
                        </p>
                      )}
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>성장</h3>
                      <p>현재 시트와 레벨업 예정치를 분리해 보기 위해 성장 과정은 별도 창에서 진행합니다.</p>
                      <button
                        type="button"
                        className="primary character-level-up-open"
                        onClick={openLevelUpModal}
                        disabled={busy || !selectedCharacterDetail.canLevelUp}
                      >
                        {selectedCharacterDetail.levelUpButtonLabel}
                      </button>
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>능력치</h3>
                      <div className="fantasy-character-abilities-grid">
                        {selectedCharacterDetail.abilityRows.map((ability) => (
                          <div key={ability.ability}>
                            <strong>{ability.label}</strong>
                            <span className="fantasy-character-ability-value">
                              {ability.value} ({ability.modifier})
                            </span>
                            <span
                              className="fantasy-character-ability-help"
                              tabIndex={0}
                              role="note"
                              aria-label={ability.tooltip}
                            >
                              ?
                              <span className="fantasy-character-ability-tooltip" role="tooltip">
                                {ability.tooltip}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>기술 숙련</h3>
                      {selectedCharacterDetail.skillLabels.length ? (
                        <ul className="fantasy-character-text-list">
                          {selectedCharacterDetail.skillLabels.map((skill) => (
                            <li key={skill}>{skill}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>선택된 기술이 없습니다.</p>
                      )}
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>인벤토리</h3>
                      {selectedCharacter.inventory.length ? (
                        <ul className="fantasy-character-text-list">
                          {selectedCharacter.inventory.map((item) => (
                            <li key={item.id}>
                              <InventoryItemInfo item={item} /> x{item.quantity}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>비어 있음</p>
                      )}
                    </section>
                  </div>
                </div>
              </article>
            </>
          ) : (
            <article className="character-focus-card character-focus-card-empty">
              {/* 선택된 캐릭터의 스탯, 능력치, 스킬, 인벤토리 상세 패널입니다. */}
              <h2>캐릭터를 생성해 보세요</h2>
            </article>
          )}
        </section>
      </section>

      {catalogError ? <p className="panel-error">{catalogError}</p> : null}
      {error && !isCreateModalOpen ? <p className="panel-error">{error}</p> : null}
      {deleteWarning ? (
        <button type="button" className="page-error-toast" onClick={dismissDeleteWarning}>
          {deleteWarning}
        </button>
      ) : null}

      {/* 캐릭터 생성/수정 모달입니다. editingCharacterId가 있으면 수정 모드로 동작합니다. */}
      {isCreateModalOpen ? (
        <div
          className="modal-backdrop character-create-backdrop"
          role="presentation"
          onClick={dismissCreateModal}
        >
          <div
            className="character-create-visual-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="modal-card modal-card-wide character-create-modal"
              role="dialog"
              aria-modal="true"
            >
            {createToast ? (
              <div
                key={createToast.id}
                className="character-create-toast"
                role="status"
                aria-live="assertive"
              >
                {createToast.message}
              </div>
            ) : null}
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  {editingCharacterId ? '캐릭터 수정' : '캐릭터 생성'}
                </span>
                <h2>{editingCharacterId ? '캐릭터 수정' : '새 캐릭터'}</h2>
              </div>
              <button type="button" className="modal-close" onClick={dismissCreateModal}>
                닫기
              </button>
            </div>

            <form
              className={`modal-form character-create-form character-create-form--${currentCreateStep.key}`}
              onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}
            >
              <div className="character-create-stepper" aria-label="캐릭터 생성 단계">
                {characterCreateSteps.map((step, index) => {
                  const isActive = index === createStepIndex;
                  const isCompleted = index < createStepIndex;

                  return (
                    <div
                      key={step.key}
                      className={`character-create-step${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}
                    >
                      <span className="character-create-step-index">{index + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        <span>{step.helper}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                className={`character-create-form-body${
                  isSkillsStep || isFeaturesStep || isEquipmentStep || isSpellsStep || isReviewStep
                    ? ' character-create-form-body--scrollable'
                    : ''
                }${
                  isSkillsStep || isFeaturesStep || isSpellsStep || isReviewStep
                    ? ' character-create-form-body--single-column'
                    : ''
                }`}
              >
                <div className="character-create-form-left">
                  {isProfileStep ? (
                    <section className="character-form-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">기본 정보</span>
                          <h2>프로필</h2>
                        </div>
                      </div>

                      <div className="field-row">
                        <div>
                          <label htmlFor="character-name-create">이름</label>
                          <input
                            id="character-name-create"
                            value={formState.name}
                            onChange={(event) => setCreateName(event.target.value)}
                            maxLength={50}
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="character-scenario-create">시나리오</label>
                          <select
                            id="character-scenario-create"
                            value={formState.scenarioId ?? ''}
                            onChange={(event) => selectScenario(event.target.value || null)}
                            required
                          >
                            <option value="" disabled>
                              {scenarios.length === 0
                                ? '사용 가능한 시나리오가 없습니다'
                                : '시나리오를 선택하세요'}
                            </option>
                            {scenarioGroups.provided.length ? (
                              <optgroup label="기본 제공 시나리오">
                                {scenarioGroups.provided.map((scenario) => (
                                  <option key={scenario.id} value={scenario.id}>
                                    {scenario.title} (시작 {scenario.startLevel}레벨)
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            {scenarioGroups.custom.length ? (
                              <optgroup label="내가 만든 시나리오">
                                {scenarioGroups.custom.map((scenario) => (
                                  <option key={scenario.id} value={scenario.id}>
                                    {scenario.title} (시작 {scenario.startLevel}레벨)
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="character-level-create">레벨 (시나리오 고정)</label>
                          <input
                            id="character-level-create"
                            type="number"
                            value={formState.level ?? 1}
                            readOnly
                            disabled
                          />
                        </div>
                      </div>

                      <div className="field-row">
                        <div>
                          <label htmlFor="character-ancestry-create">종족</label>
                          <select
                            id="character-ancestry-create"
                            value={selectedCreateBaseRace?.key ?? ''}
                            onChange={(event) => {
                              selectAncestry(event.target.value);
                            }}
                            required
                          >
                            <option value="" disabled>
                              {races.length === 0 ? '종족 로딩 중…' : '종족을 선택하세요'}
                            </option>
                            {baseRaceOptions.map((race) => (
                              <option key={race.id} value={race.key}>
                                {race.koName}
                              </option>
                            ))}
                          </select>
                        </div>
                        {isCreateSubraceRequired ? (
                          <div>
                            <label htmlFor="character-subrace-create">하위종족</label>
                            <select
                              id="character-subrace-create"
                              value={selectedCreateSubraceKey}
                              onChange={(event) => selectAncestry(event.target.value)}
                              required
                            >
                              <option value="">
                                {selectedCreateSubraceOptions.length === 0
                                  ? '하위종족 없음'
                                  : '하위종족을 선택하세요'}
                              </option>
                              {selectedCreateSubraceOptions.map((race) => (
                                <option key={race.id} value={race.key}>
                                  {race.koName}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <div>
                          <label htmlFor="character-class-create">직업</label>
                          <select
                            id="character-class-create"
                            value={formState.className}
                            onChange={(event) =>
                              selectClass({
                                className: event.target.value,
                                raceAbilityIncreases: selectedRace?.abilityIncreases,
                              })
                            }
                            required
                          >
                            {classCatalog.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {selectedCreateSubclassOptions.length &&
                      selectedCreateSubclassChoiceLevel !== null &&
                      (formState.level ?? 1) >= selectedCreateSubclassChoiceLevel ? (
                        <div className="field-row">
                          <div>
                            <label htmlFor="character-subclass-create">서브클래스</label>
                            <select
                              id="character-subclass-create"
                              value={formState.subclassName ?? ''}
                              onChange={(event) => setCreateSubclass(event.target.value)}
                              required={isCreateSubclassRequired}
                            >
                              <option value="">
                                {isCreateSubclassRequired ? '필수 선택' : '서브클래스 선택'}
                              </option>
                              {selectedCreateSubclassOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {isStatsStep ? (
                    <section className="character-form-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">전투 수치</span>
                          <h2>코어 스탯</h2>
                        </div>
                        <div className="character-create-stats-trigger-row">
                          <span className="character-create-inline-trigger">
                            <span className="character-create-inline-trigger-text">
                              {currentStatSelectionLabel}
                            </span>
                          </span>
                          <div className="character-create-stats-help-anchor">
                            <button
                              type="button"
                              className="character-create-help-trigger"
                              aria-label="종족 및 직업 정보 보기"
                              aria-expanded={isStatsReferenceOpen}
                              onClick={() => setStatsReferenceOpen((current) => !current)}
                            >
                              ?
                            </button>
                            {isStatsReferenceOpen ? (
                              <div
                                className="character-create-stats-popover"
                                role="dialog"
                                aria-label="종족 및 직업 정보"
                              >
                                <div className="character-create-stats-popover-head">
                                  <strong>{currentStatSelectionLabel}</strong>
                                  <button
                                    type="button"
                                    className="character-create-stats-popover-close"
                                    onClick={() => setStatsReferenceOpen(false)}
                                  >
                                    닫기
                                  </button>
                                </div>
                                <div className="character-create-stats-popover-body">
                                  <section className="fantasy-insight-section">
                                    <strong className="fantasy-insight-title">
                                      {createStatReferenceViewModel.race.title}
                                    </strong>
                                    {createStatReferenceViewModel.race.lines.map((line) => (
                                      <p key={line}>{line}</p>
                                    ))}
                                  </section>
                                  <section className="fantasy-insight-section">
                                    <strong className="fantasy-insight-title">
                                      {createStatReferenceViewModel.klass.title}
                                    </strong>
                                    {createStatReferenceViewModel.klass.lines.map((line) => (
                                      <p key={line}>{line}</p>
                                    ))}
                                  </section>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {isSkillsStep ? (
                    <section className="character-form-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">기술</span>
                          <h2>숙련 기술</h2>
                        </div>
                      </div>

                      {(() => {
                        const selectedSkills = formState.proficientSkills ?? [];
                        const requiredCount = selectedClass?.skillChoiceCount ?? null;
                        const choices = selectedClass?.skillChoices ?? allSkillsKo;
                        const limitReached =
                          requiredCount !== null && selectedSkills.length >= requiredCount;
                        return (
                          <>
                            {selectedClass && requiredCount ? (
                              <p
                                style={{
                                  margin: '0 0 12px 0',
                                  fontSize: '0.9rem',
                                  opacity: 0.85,
                                }}
                              >
                                <strong>{selectedClass.koName}</strong> 클래스는 아래{' '}
                                {choices.length}개 중 <strong>{requiredCount}개</strong>를 선택해야
                                합니다 (현재 <strong>{selectedSkills.length}</strong>개 선택).
                              </p>
                            ) : null}

                            <div className="character-chip-row" style={{ marginTop: '14px' }}>
                              {choices.map((skill) => {
                                const already = selectedSkills.includes(skill);
                                const disabled = already || limitReached;
                                return (
                                  <button
                                    key={skill}
                                    type="button"
                                    className="character-skill-chip"
                                    onClick={() =>
                                      addCreateSkill(skill, selectedClass?.skillChoiceCount ?? null)
                                    }
                                    disabled={disabled}
                                    style={
                                      disabled
                                        ? { opacity: 0.45, cursor: 'not-allowed' }
                                        : undefined
                                    }
                                    title={
                                      already
                                        ? '이미 선택됨'
                                        : limitReached
                                          ? `${requiredCount}개까지만 선택 가능`
                                          : undefined
                                    }
                                  >
                                    {skill}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}

                      <div className="character-chip-row" style={{ marginTop: '12px' }}>
                        {(formState.proficientSkills ?? []).length ? (
                          (formState.proficientSkills ?? []).map((skill) => (
                            <span
                              key={skill}
                              className="character-selected-chip"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}
                            >
                              {getSkillLabel(skill)}
                              <button
                                type="button"
                                onClick={() => removeCreateSkill(skill)}
                                aria-label={`${getSkillLabel(skill)} 제거`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '1.22rem',
                                  height: '1.22rem',
                                  padding: 0,
                                  lineHeight: 1,
                                  fontSize: '0.95rem',
                                  flexShrink: 0,
                                  transform: 'translateY(-1px)',
                                }}
                              >
                                x
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="status-chip muted">선택된 기술이 없습니다</span>
                        )}
                      </div>
                    </section>
                  ) : null}

                  {isFeaturesStep ? (
                    <section className="character-form-section character-feature-timeline-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">성장 타임라인</span>
                          <h2>1레벨부터 시작 레벨까지의 획득/선택 특성</h2>
                        </div>
                        {requiredFeaturePreviewItems.length ? (
                          <span className="status-chip warning">
                            선택 필요 {requiredFeaturePreviewItems.length}
                          </span>
                        ) : featurePreviewItems.length ? (
                          <span className="status-chip">선택 완료</span>
                        ) : null}
                      </div>
                      {featureTimelineGroups.length ? (
                        <>
                          <div className="character-feature-timeline-summary">
                            <span>총 {featureTimelineStats.total}개</span>
                            <span>자동 {featureTimelineStats.automatic}개</span>
                            <span>완료 {featureTimelineStats.selected}개</span>
                            {featureTimelineStats.required > 0 ? (
                              <strong>선택 필요 {featureTimelineStats.required}개</strong>
                            ) : (
                              <strong className="complete">필수 선택 완료</strong>
                            )}
                          </div>
                          <div className="character-feature-timeline">
                            {featureTimelineGroups.map((group) => {
                              const groupStats = countFeaturePreviewStatuses(group.items);
                              return (
                                <article
                                  key={group.level}
                                  className={`character-feature-timeline-row${
                                    groupStats.required > 0 ? ' has-required' : ''
                                  }`}
                                >
                                  <div className="character-feature-timeline-head">
                                    <div className="character-feature-timeline-level">
                                      {group.level}레벨
                                    </div>
                                    <div className="character-feature-timeline-counts">
                                      {groupStats.required > 0 ? (
                                        <span className="status-required">
                                          선택 필요 {groupStats.required}
                                        </span>
                                      ) : null}
                                      {groupStats.selected > 0 ? (
                                        <span className="status-selected">
                                          완료 {groupStats.selected}
                                        </span>
                                      ) : null}
                                      {groupStats.automatic > 0 ? (
                                        <span>자동 {groupStats.automatic}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <ul>
                                    {group.items.map((item) => (
                                      <li key={item.id} className={`status-${item.status}`}>
                                        <div className="character-feature-timeline-item-head">
                                          <strong>{item.label}</strong>
                                          <div className="character-feature-timeline-badges">
                                            <span className={`status-${item.status}`}>
                                              {featureStatusLabels[item.status]}
                                            </span>
                                            <span className={`source-${item.source}`}>
                                              {featureSourceLabels[item.source]}
                                            </span>
                                          </div>
                                        </div>
                                        <p>{item.summary}</p>
                                      </li>
                                    ))}
                                  </ul>
                                </article>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <p className="character-empty-note">
                          종족과 직업을 선택하면 획득 특성이 여기에 표시됩니다.
                        </p>
                      )}
                    </section>
                  ) : null}

                  {isFeaturesStep && creationAsiFeatChoiceState.asiLevels.length ? (
                    <section className="character-form-section character-feat-selection-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">ASI / Feat</span>
                          <h2>능력치 상승 또는 Feat 선택</h2>
                        </div>
                      </div>
                      <p className="character-create-equipment-summary-help">
                        각 ASI 지점마다 능력치 상승 선택 또는 Feat 하나를 선택합니다.
                        생성 단계의 ASI 선택은 Feat처럼 특성 선택으로 기록되며, 코어 스탯의
                        Point Buy 27포인트 계산에는 영향을 주지 않습니다.
                      </p>
                      <div className="character-feat-choice-list">
                        {creationAsiFeatChoiceState.choices.map(
                          ({ asiLevel, selectedChoiceId, selectedAsiAbility, selectedFeat }, index) => {
                            return (
                              <div key={asiLevel} className="character-feat-choice-card">
                                <label htmlFor={`character-feat-${asiLevel}`}>
                                  {asiLevel}레벨 선택
                                </label>
                                <select
                                  id={`character-feat-${asiLevel}`}
                                  value={selectedChoiceId}
                                  onChange={(event) => {
                                    const nextChoiceId = event.target.value;
                                    setAsiFeatChoice(index, nextChoiceId);
                                  }}
                                >
                                  <option value="">선택 필요</option>
                                  {abilityKeys.map(
                                    (ability) => {
                                      const choiceId = getAsiChoiceId(ability);
                                      const isAlreadySelectedElsewhere =
                                        isAsiFeatChoiceSelectedElsewhere(
                                          creationAsiFeatChoiceState.selectedChoiceIds,
                                          selectedChoiceId,
                                          choiceId
                                        );
                                      return (
                                      <option
                                        key={ability}
                                        value={choiceId}
                                        disabled={isAlreadySelectedElsewhere}
                                      >
                                        ASI: {abilityDisplayLabels[ability]} +2
                                      </option>
                                      );
                                    }
                                  )}
                                  {featOptions.map((feat) => (
                                    <option
                                      key={feat.id}
                                      value={feat.id}
                                      disabled={isAsiFeatChoiceSelectedElsewhere(
                                        creationAsiFeatChoiceState.selectedChoiceIds,
                                        selectedChoiceId,
                                        feat.id
                                      )}
                                    >
                                      {feat.label}
                                    </option>
                                  ))}
                                </select>
                                <p>
                                  {selectedFeat
                                    ? selectedFeat.summary
                                    : selectedAsiAbility
                                      ? `${abilityDisplayLabels[selectedAsiAbility]} ASI 선택을 특성으로 기록합니다.`
                                      : '능력치 하나를 +2 하거나 Feat 하나를 선택하세요.'}
                                </p>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </section>
                  ) : null}

                  {isFeaturesStep && featureChoiceViewModels.length ? (
                    <section className="character-form-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">종족/직업 기능</span>
                          <h2>선택형 특성</h2>
                        </div>
                      </div>

                      {featureChoiceViewModels.map(({
                        definition,
                        options,
                        selectedValues,
                        isComplete,
                        statusLabel,
                        summary,
                      }) => {
                        return (
                          <div key={definition.id} className="character-feature-choice-block">
                            <div className="character-feature-choice-heading">
                              <label htmlFor={`character-feature-choice-${definition.id}`}>
                                {definition.label}
                              </label>
                              <span className={isComplete ? 'status-chip' : 'status-chip warning'}>
                                {statusLabel}
                              </span>
                            </div>
                            <p className="field-help">{summary}</p>

                            {definition.mode === 'single' ? (
                              <select
                                id={`character-feature-choice-${definition.id}`}
                                value={selectedValues[0] ?? ''}
                                required
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setSingleFeatureChoice(definition, nextValue);
                                }}
                              >
                                <option value="" disabled>
                                  선택하세요
                                </option>
                                {options.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.summary
                                      ? `${option.label} - ${option.summary}`
                                      : option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="character-chip-row">
                                {options.map((option) => {
                                  const selected = selectedValues.includes(option.value);
                                  const disabled =
                                    !selected &&
                                    selectedValues.length >= definition.requiredSelections;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      className="character-skill-chip"
                                      aria-pressed={selected}
                                      disabled={disabled}
                                      onClick={() =>
                                        toggleMultiFeatureChoice(definition, option.value)
                                      }
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  ) : null}

                  {isEquipmentStep && selectedClass ? (
                    <section className="character-form-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">시작 장비</span>
                          <h2>슬롯 선택 (룰북 강제)</h2>
                        </div>
                      </div>
                      {startingEquipmentSlotViewModels.map(({
                        slot,
                        slotIndex,
                        selectedOptionIndex,
                        concreteItemSelections,
                      }) => {
                        const fixedOption = slot.options.length === 1 ? slot.options[0] : null;
                        return (
                          <div key={slotIndex} style={{ marginBottom: 12 }}>
                            <label htmlFor={`starting-equipment-${slotIndex}`}>
                              슬롯 {slotIndex + 1}
                            </label>
                            {fixedOption ? (
                              <div style={{ padding: '6px 10px', opacity: 0.85 }}>
                                {formatStartingEquipmentOption(
                                  fixedOption,
                                  itemKoNameByKey
                                )}{' '}
                                (고정)
                              </div>
                            ) : (
                              <select
                                id={`starting-equipment-${slotIndex}`}
                                value={selectedOptionIndex}
                                onChange={(event) => {
                                  const optionIndex = readOptionIndex(
                                    event.target.value,
                                    slot.options.length,
                                    selectedOptionIndex
                                  );
                                  selectStartingEquipmentSlot({
                                    slotIndex,
                                    optionIndex,
                                    slotCount: startingEquipmentSlotViewModels.length,
                                  });
                                }}
                              >
                                {slot.options.map((option, optIdx) => (
                                  <option key={optIdx} value={optIdx}>
                                    {formatStartingEquipmentOption(option, itemKoNameByKey)}
                                  </option>
                                ))}
                              </select>
                            )}
                            {concreteItemSelections.map((itemSelection) => {
                              return (
                                <div key={itemSelection.key} style={{ marginTop: 8 }}>
                                  <label htmlFor={`starting-equipment-item-${itemSelection.key}`}>
                                    {itemSelection.label}
                                  </label>
                                  <select
                                    id={`starting-equipment-item-${itemSelection.key}`}
                                    value={itemSelection.selectedValue}
                                    required
                                    onChange={(event) =>
                                      selectStartingEquipmentItem(
                                        itemSelection.key,
                                        event.target.value
                                      )
                                    }
                                  >
                                    <option value="" disabled>
                                      {itemSelection.selectLabel}
                                    </option>
                                    {itemSelection.choice.options.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </section>
                  ) : null}

                  {isReviewStep ? (
                    <section className="character-form-section character-create-review-summary">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">최종 확인</span>
                          <h2>{createReviewViewModel.title}</h2>
                        </div>
                      </div>
                      <dl className="fantasy-character-summary-list">
                        {createReviewViewModel.summaryRows.map((row) => (
                          <div key={row.label}>
                            <dt>{row.label}</dt>
                            <dd>{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                      {createReviewViewModel.featureItems.length ? (
                        <div className="character-review-feature-list">
                          <strong>특성 확인</strong>
                          <ul>
                            {createReviewViewModel.featureItems.map((feature) => (
                              <li key={feature.id} className={`status-${feature.status}`}>
                                <span>{feature.sourceLabel}</span>
                                <div>
                                  <strong>{feature.label}</strong>
                                  <p>
                                    {feature.statusLabel} · {feature.summary}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <p className={`character-review-${createReviewViewModel.featureCompletionTone}`}>
                        {createReviewViewModel.featureCompletionMessage}
                      </p>
                    </section>
                  ) : null}
                </div>
                {hasCreateFormRightColumn ? (
                <div className="character-create-form-right">
                  {isEquipmentStep ? (
                    <section className="character-form-section character-create-equipment-summary">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">장비 요약</span>
                          <h2>생성 시 지급될 장비</h2>
                        </div>
                      </div>
                      {resolvedStartingEquipmentSummary.length ? (
                        <ul className="character-create-equipment-summary-list">
                          {resolvedStartingEquipmentSummary.map((item) => (
                            <li
                              key={item.key}
                              className={item.pending ? 'pending' : undefined}
                            >
                              <span>{item.label}</span>
                              {item.quantity > 1 ? <strong>×{item.quantity}</strong> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="character-empty-note">
                          직업을 선택하면 시작 장비 목록이 여기에 표시됩니다.
                        </p>
                      )}
                      <p className="character-create-equipment-summary-help">
                        왼쪽에서 선택지를 바꾸면 이 목록이 즉시 갱신됩니다. “미선택” 항목은
                        생성 전에 구체 장비를 골라야 합니다.
                      </p>
                    </section>
                  ) : null}
                  {isProfileStep ? (
                    <section className="character-form-section">
                      <div className="character-avatar-picker">
                        <label>초상화</label>
                        <div className="character-avatar-current-preview">
                          <img
                            src={avatarPickerViewModel.previewImage}
                            alt="선택된 캐릭터 초상화"
                          />
                          <div>
                            <strong>{avatarPickerViewModel.previewTitle}</strong>
                            <span>{avatarPickerViewModel.previewDescription}</span>
                          </div>
                        </div>
                        <div
                          className="character-avatar-grid"
                          role="radiogroup"
                          aria-label="캐릭터 초상화 선택"
                        >
                          {avatarPickerViewModel.presetOptions.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              className={`character-avatar-option${
                                preset.isSelected ? ' selected' : ''
                              }`}
                              onClick={() => selectAvatarPreset(preset.id)}
                              aria-pressed={preset.isSelected}
                            >
                              <img
                                src={preset.image}
                                alt={preset.label}
                                className="character-avatar-option-image"
                              />
                              <span>{preset.label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="character-avatar-upload-row">
                          <label
                            className={`character-avatar-upload-button${
                              avatarUploadBusy ? ' disabled' : ''
                            }`}
                          >
                            <span>{avatarUploadBusy ? '업로드 중...' : '이미지 업로드'}</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              disabled={avatarUploadBusy}
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                event.currentTarget.value = '';
                                void uploadAvatarAsset(file);
                              }}
                            />
                          </label>
                          <p>
                            PNG/JPEG/WebP 이미지를 R2에 업로드해 초상화로 사용할 수 있습니다.
                            공개 URL로 표시되므로 민감한 사진은 피해주세요.
                          </p>
                        </div>
                        {avatarAssetError ? (
                          <p className="character-avatar-library-error">{avatarAssetError}</p>
                        ) : null}
                        <div className="character-avatar-library">
                          <div className="character-avatar-library-heading">
                            <strong>내 업로드 초상화</strong>
                            <span>{avatarPickerViewModel.uploadedAssets.length}개</span>
                          </div>
                          {avatarPickerViewModel.uploadedAssets.length ? (
                            <div className="character-avatar-library-grid">
                              {avatarPickerViewModel.uploadedAssets.map((asset) => (
                                <article
                                  key={asset.id}
                                  className={`character-avatar-asset-card${
                                    asset.isSelected ? ' selected' : ''
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="character-avatar-asset-preview"
                                    onClick={() => applyUploadedAvatar(asset.asset)}
                                    aria-pressed={asset.isSelected}
                                  >
                                    <img src={asset.publicUrl} alt={asset.fileName} />
                                  </button>
                                  <div className="character-avatar-asset-meta">
                                    <span>{asset.fileName}</span>
                                    <small>{asset.sizeLabel}</small>
                                  </div>
                                  <div className="character-avatar-asset-actions">
                                    <button
                                      type="button"
                                      className="ghost small"
                                      onClick={() => applyUploadedAvatar(asset.asset)}
                                      disabled={asset.isDeleting}
                                    >
                                      사용
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost small danger"
                                      onClick={() => void deleteUploadedAvatar(asset.asset)}
                                      disabled={asset.isDeleting}
                                    >
                                      {asset.isDeleting ? '삭제 중' : '삭제'}
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <p className="character-empty-note">
                              아직 업로드한 초상화가 없습니다. 이미지를 업로드하면 여기에서 다시
                              선택할 수 있습니다.
                            </p>
                          )}
                        </div>
                      </div>
                    </section>
                  ) : null}
                  {isStatsStep ? (
                    <section className="character-form-section character-create-stats-strip-section">
                      <div className="character-create-stat-summary">
                        {createStatSummaryCards.map((card) => (
                          <article key={card.key} className="character-create-stat-card">
                            <span className="character-create-stat-card-label">{card.label}</span>
                            <strong className="character-create-stat-card-value">
                              {card.value}
                            </strong>
                            <span className="character-create-stat-card-help">{card.help}</span>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {isSpellsStep && selectedClass ? (
                    <section className="character-form-section character-create-loadout-spells">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">시작 주문</span>
                          <h2>{startingSpellSectionState.heading}</h2>
                        </div>
                      </div>
                      {!startingSpellSectionState.hasStartingSpells ? (
                        <p className="character-empty-note">
                          현재 선택한 직업과 레벨에서는 캐릭터 생성 시 고를 시작 주문이
                          없습니다. 장비 탭까지 확인했다면 바로 생성할 수 있습니다.
                        </p>
                      ) : null}
                      {startingSpellSectionState.cantripCount > 0 && (
                        <SpellSelectionGrid
                          title="캔트립"
                          helper="항상 사용할 수 있는 소마법을 고릅니다."
                          options={detailedCantripOptions}
                          selectedIds={createSpellSelection.selectedCantripIds}
                          maxSelected={startingSpellSectionState.cantripCount}
                          onChange={(cantrips) => {
                            setStartingCantrips(cantrips, selectedStartingSlotSpellCount);
                          }}
                        />
                      )}
                      {startingSpellSectionState.slotSpellCount > 0 && (
                        <SpellSelectionGrid
                          title={
                            selectedCreateClassKey === 'wizard' ? '주문책 주문' : '습득 주문'
                          }
                          helper={
                            selectedCreateClassKey === 'wizard'
                              ? '주문책에 기록되어 이후 준비할 수 있는 주문을 고릅니다.'
                              : '이 캐릭터가 알고 있는 슬롯 주문을 고릅니다.'
                          }
                          options={detailedSlotSpellOptions}
                          selectedIds={selectedStartingSlotSpells}
                          maxSelected={startingSpellSectionState.slotSpellCount}
                          onChange={(spells) => {
                            setStartingSlotSpells(
                              spells,
                              selectedStartingCantripCount,
                              startingPreparedSpellLimit
                            );
                          }}
                        />
                      )}
                      {startingPreparedSpellLimit !== null &&
                        startingPreparedSpellOptions.length > 0 && (
                          <SpellSelectionGrid
                            title="준비 주문"
                            helper={
                              isStartingDynamicPreparedCaster
                                ? '현재 시전 가능한 직업 주문 목록에서 오늘 준비할 주문을 고릅니다.'
                                : '주문책에 있는 주문 중 오늘 바로 사용할 주문을 고릅니다.'
                            }
                            options={startingPreparedSpellOptions}
                            selectedIds={selectedStartingPreparedSpells}
                            maxSelected={startingPreparedSpellLimit}
                            onChange={(preparedSpells) => {
                              setStartingPreparedSpells(
                                preparedSpells,
                                selectedStartingCantripCount,
                                selectedStartingSlotSpellCount
                              );
                            }}
                          />
                        )}
                    </section>
                  ) : null}
                </div>
                ) : null}
                {isStatsStep ? (
                  <section className="character-form-section character-create-point-buy-section">
                    <div className="section-heading compact">
                      <div>
                        <span className="eyebrow">능력치</span>
                        <h2>능력치 (Point Buy 27)</h2>
                      </div>
                      {pointBuyState.enforced ? (
                        <div className="character-create-point-buy-summary">
                          남은 포인트:{' '}
                          <strong style={{ color: pointBuyState.isValid ? 'inherit' : '#d04040' }}>
                            {pointBuyState.remaining}
                          </strong>{' '}
                          / {POINT_BUY_TOTAL}
                          {!pointBuyState.isValid && (
                            <span style={{ marginLeft: 8, color: '#d04040' }}>
                              ({pointBuyState.totalCost > POINT_BUY_TOTAL ? '초과' : '미달'})
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="character-create-point-buy-summary muted">
                          종족을 먼저 선택해 주세요!
                        </div>
                      )}
                    </div>

                    <div className="character-create-point-buy-grid">
                      {abilityKeys.map((ability) => {
                        const base = pointBuyState.bases[ability];
                        const bonus = selectedRace?.abilityIncreases[ability] ?? 0;
                        const finalScore = formState.abilities?.[ability] ?? 10;
                        const { canDec, canInc, nextStepCost, refundStepCost } =
                          getPointBuyAdjustment(pointBuyState, ability);
                        return (
                          <div key={ability} className="character-create-point-buy-card">
                            <label htmlFor={`character-${ability}`}>
                              {abilityDisplayLabels[ability]}
                              {bonus > 0 && (
                                <span style={{ marginLeft: 6, color: '#3a7' }}>
                                  (+{bonus} 종족)
                                </span>
                              )}
                            </label>
                            {pointBuyState.enforced ? (
                              <div className="character-create-point-buy-control">
                                <button
                                  type="button"
                                  onClick={() =>
                                    adjustCreateAbilityBase({
                                      abilityIncreases: selectedRace?.abilityIncreases,
                                      ability,
                                      delta: -1,
                                    })
                                  }
                                  disabled={!canDec}
                                  aria-label={`${abilityDisplayLabels[ability]} 감소`}
                                  title={
                                    refundStepCost !== null
                                      ? `${refundStepCost}포인트 환급`
                                      : undefined
                                  }
                                >
                                  −
                                </button>
                                <div className="character-create-point-buy-value">
                                  <div className="character-create-point-buy-main">
                                    base {base} + 종족 {bonus} = {finalScore}
                                  </div>
                                  <div className="character-create-point-buy-cost">
                                    {canInc && nextStepCost !== null
                                      ? `비용 ${nextStepCost}p`
                                      : canDec && refundStepCost !== null
                                        ? `비용 ${refundStepCost}p`
                                        : '비용 0p'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    adjustCreateAbilityBase({
                                      abilityIncreases: selectedRace?.abilityIncreases,
                                      ability,
                                      delta: 1,
                                    })
                                  }
                                  disabled={!canInc}
                                  aria-label={`${abilityDisplayLabels[ability]} 증가`}
                                  title={
                                    nextStepCost !== null ? `${nextStepCost}포인트 소비` : undefined
                                  }
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <input
                                id={`character-${ability}`}
                                type="number"
                                min={1}
                                step={1}
                                value={finalScore}
                                onChange={(event) =>
                                  updateAbilityScore(
                                    ability,
                                    readClampedInteger(event.target.value, finalScore, 1)
                                  )
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </div>
              <div className="character-create-step-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={goToPreviousCreateStep}
                  disabled={createStepIndex === 0}
                >
                  이전 장
                </button>
                <div className="character-create-step-actions-center">
                  <strong>
                    {createStepIndex + 1} / {characterCreateSteps.length}
                  </strong>
                  <span>{currentCreateStep.label}</span>
                </div>
                {isFinalCreateStep ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || classDefinitions.length === 0}
                    onClick={() => {
                      void submitCreateCharacter();
                    }}
                  >
                    {editingCharacterId ? '저장' : '생성'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={goToNextCreateStep}
                    disabled={busy}
                  >
                    다음 장
                  </button>
                )}
              </div>
            </form>
            </div>
          </div>
        </div>
      ) : null}

      {isLevelUpModalOpen && selectedCharacter ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeLevelUpModal}
        >
          <div
            className="modal-card modal-card-wide character-level-up-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="character-level-up-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">성장 관리</span>
                <h2 id="character-level-up-title">{selectedCharacter.name} 레벨업</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="레벨업 창 닫기"
                onClick={closeLevelUpModal}
              >
                ×
              </button>
            </div>

            <div className="character-level-up-current-summary">
              <dl className="fantasy-character-summary-list">
                <div>
                  <dt>현재 레벨</dt>
                  <dd>{selectedCharacter.level}</dd>
                </div>
                <div>
                  <dt>직업</dt>
                  <dd>{getCharacterClassLabel(selectedCharacter.className)}</dd>
                </div>
                <div>
                  <dt>현재 HP</dt>
                  <dd>{formatStat(selectedCharacter.maxHp)}</dd>
                </div>
                <div>
                  <dt>숙련도</dt>
                  <dd>{formatStat(selectedCharacter.proficiencyBonus)}</dd>
                </div>
              </dl>
            </div>

            <div className="character-level-up-modal-scroll">
              <section className="fantasy-character-stats-section">
                <h3>레벨업 설정</h3>
                <div className="character-growth-panel">
                  <label htmlFor="character-level-up-target">목표 레벨</label>
                  <div className="character-growth-row">
                    <input
                      id="character-level-up-target"
                      type="number"
                      min={selectedCharacter.level + 1}
                      max={20}
                      value={levelUpDraft.targetLevel}
                      disabled={busy || selectedCharacter.level >= 20}
                      onChange={(event) =>
                        levelUpDraftState.resetForTargetLevel(
                          readClampedInteger(
                            event.target.value,
                            levelUpDraft.targetLevel,
                            selectedCharacter.level + 1,
                            20
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void submitLevelUpSelectedCharacter()}
                      disabled={
                        busy ||
                        selectedCharacter.level >= 20 ||
                        missingAsiFeatChoiceCount > 0 ||
                        (isLevelUpSubclassRequired && !levelUpDraft.subclassName) ||
                        isLevelUpPreparedSpellLimitExceeded ||
                        isLevelUpSpellReplacementIncomplete
                      }
                    >
                      레벨업 확정
                    </button>
                  </div>
                  {levelUpPreviewRows.length ? (
                    <dl className="fantasy-character-summary-list">
                      {levelUpPreviewRows.map((row) => (
                        <div key={row.label}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {levelUpFeatureTimelineGroups.length ? (
                    <div className="character-asi-panel">
                      <div className="character-asi-heading">
                        <strong>이번 성장 특성</strong>
                        <span>{levelUpFeaturePreviewItems.length}개 항목</span>
                      </div>
                      <div className="character-feature-timeline compact">
                        {levelUpFeatureTimelineGroups.map((group) => (
                          <article key={group.level} className="character-feature-timeline-row">
                            <div className="character-feature-timeline-level">{group.level}레벨</div>
                            <ul>
                              {group.items.map((item) => (
                                <li key={item.id}>
                                  <span className={`status-dot status-${item.status}`} />
                                  <div>
                                    <strong>{item.label}</strong>
                                    <p>
                                      {featureSourceLabels[item.source]} ·{' '}
                                      {featureStatusLabels[item.status]} · {item.summary}
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {crossedAsiLevels.length ? (
                    <div className="character-asi-panel">
                      <div className="character-asi-heading">
                        <strong>ASI / Feat 선택</strong>
                        <span>
                          미선택 {missingAsiFeatChoiceCount} / {crossedAsiLevels.length}
                        </span>
                      </div>
                      <div className="character-feat-choice-list">
                        {levelUpAsiFeatChoiceState.choices.map(
                          ({ asiLevel, selectedChoiceId, selectedAsiAbility, selectedFeat }, index) => {
                          return (
                            <div key={asiLevel} className="character-feat-choice-card">
                              <label htmlFor={`character-level-up-feat-${asiLevel}`}>
                                {asiLevel}레벨
                              </label>
                              <select
                                id={`character-level-up-feat-${asiLevel}`}
                                value={selectedChoiceId}
                                disabled={busy}
                                onChange={(event) => {
                                  const nextChoiceId = event.target.value;
                                  levelUpDraftState.setAsiFeatChoice(index, nextChoiceId);
                                }}
                              >
                                <option value="">선택 필요</option>
                                {abilityKeys.map(
                                  (ability) => (
                                    <option
                                      key={ability}
                                      value={getAsiChoiceId(ability)}
                                      disabled={isLevelUpAsiAbilityChoiceCapped({
                                        currentAbilityScore: selectedCharacter.abilities[ability],
                                        abilityScoreIncrease:
                                          derivedLevelUpAbilityScoreIncreases[ability],
                                        selectedAsiAbility,
                                        candidateAbility: ability,
                                      })}
                                    >
                                      ASI: {abilityDisplayLabels[ability]} +2
                                    </option>
                                  )
                                )}
                                {featOptions.map((feat) => (
                                  <option
                                    key={feat.id}
                                    value={feat.id}
                                    disabled={isAsiFeatChoiceSelectedElsewhere(
                                      selectedLevelUpFeatIds,
                                      selectedChoiceId,
                                      feat.id
                                    )}
                                  >
                                    {feat.label}
                                  </option>
                                ))}
                              </select>
                              <p>
                                {selectedFeat
                                  ? selectedFeat.summary
                                  : selectedAsiAbility
                                    ? `${abilityDisplayLabels[selectedAsiAbility]} 능력치가 2 상승합니다.`
                                    : '능력치 하나를 +2 하거나 Feat 하나를 선택하세요.'}
                              </p>
                            </div>
                          );
                          }
                        )}
                      </div>
                    </div>
                  ) : null}
                  {selectedSubclassOptions.length ? (
                    <div>
                      <label htmlFor="character-level-up-subclass">서브클래스</label>
                      <select
                        id="character-level-up-subclass"
                        value={levelUpDraft.subclassName}
                        disabled={busy || Boolean(selectedCharacter.subclassName)}
                        onChange={(event) =>
                          levelUpDraftState.setSubclass(event.target.value)
                        }
                      >
                        <option value="">
                          {isLevelUpSubclassRequired ? '필수 선택' : '필요 시 선택'}
                        </option>
                        {selectedSubclassOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {canReplaceSelectedKnownSpells &&
                  selectedKnownSlotSpells.length &&
                  levelUpLevelDelta ? (
                    <SpellSelectionGrid
                      title="교체할 주문"
                      helper="이번 레벨업에서 잊고 다른 주문으로 바꿀 기존 주문을 고릅니다."
                      options={selectedLevelUpForgottenSlotSpellOptions}
                      selectedIds={levelUpDraft.forgottenSpells}
                      maxSelected={levelUpLevelDelta}
                      disabled={busy}
                      onChange={levelUpDraftSpellActions.setForgottenSpells}
                    />
                  ) : null}
                  {selectedLevelUpLearnableSlotSpellOptions.length && knownSpellLearnAllowance > 0 ? (
                    <SpellSelectionGrid
                      title="새 주문 습득"
                      helper="이번 레벨업으로 새로 배우거나 주문책에 추가할 주문을 고릅니다."
                      options={selectedLevelUpLearnableSlotSpellOptions}
                      selectedIds={levelUpDraft.knownSpells}
                      maxSelected={knownSpellLearnAllowance}
                      disabled={busy}
                      onChange={levelUpDraftSpellActions.setKnownSpells}
                    />
                  ) : null}
                  {selectedCurrentCantrips.length && levelUpLevelDelta ? (
                    <SpellSelectionGrid
                      title="교체할 캔트립"
                      helper="이번 레벨업에서 잊고 다른 캔트립으로 바꿀 기존 캔트립을 고릅니다."
                      options={selectedLevelUpForgottenCantripOptions}
                      selectedIds={levelUpDraft.forgottenCantrips}
                      maxSelected={levelUpLevelDelta}
                      disabled={busy}
                      onChange={levelUpDraftSpellActions.setForgottenCantrips}
                    />
                  ) : null}
                  {selectedLevelUpLearnableCantripOptions.length && cantripLearnAllowance > 0 ? (
                    <SpellSelectionGrid
                      title="새 캔트립"
                      helper="이번 레벨업으로 새로 배울 캔트립을 고릅니다."
                      options={selectedLevelUpLearnableCantripOptions}
                      selectedIds={levelUpDraft.cantrips}
                      maxSelected={cantripLearnAllowance}
                      disabled={busy}
                      onChange={levelUpDraftSpellActions.setCantrips}
                    />
                  ) : null}
                </div>
              </section>

              {selectedLevelUpPreparedSpellLimit !== null && selectedPreparedCandidateSlotSpells.length ? (
                <section className="fantasy-character-stats-section">
                  <h3>
                    준비 주문
                    {selectedLevelUpPreparedSpellLimit !== null
                      ? ` ${levelUpDraft.preparedSpells.length}/${selectedLevelUpPreparedSpellLimit}`
                      : ''}
                  </h3>
                  <SpellSelectionGrid
                    title="준비 주문"
                    helper="오늘 준비해 바로 사용할 주문을 고릅니다."
                    options={selectedLevelUpPreparedSpellOptions}
                    selectedIds={levelUpDraft.preparedSpells}
                    maxSelected={selectedLevelUpPreparedSpellLimit ?? undefined}
                    disabled={busy}
                    showHeader={false}
                    onChange={levelUpDraftSpellActions.setPreparedSpells}
                  />
                  <button
                    type="button"
                    onClick={() => void savePreparedSpells()}
                    disabled={busy || levelUpDraft.knownSpells.length > 0}
                  >
                    준비 주문 저장
                  </button>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 삭제 확인 모달입니다. 실수 삭제를 막기 위해 별도 확인을 받습니다. */}
      {isDeleteModalOpen && selectedCharacter ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeDeleteModal}
        >
          <div
            className="modal-card character-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="character-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="character-delete-preview">
              <div
                className="character-delete-preview-frame"
                style={{ ['--frame-image' as string]: `url(${profileBorderCharacter})` }}
              >
                <img
                  src={getCharacterImage(selectedCharacter)}
                  alt={selectedCharacter.name}
                  className="character-delete-preview-art"
                />
                <div className="character-delete-preview-name">{selectedCharacter.name}</div>
                <div className="character-delete-preview-class">
                  {getCharacterClassLabel(selectedCharacter.className)}
                </div>
              </div>
            </div>

            <p className="character-delete-copy">
              <strong>{selectedCharacter.name}</strong>
              {' 을(를) 정말 삭제할까요?'}
            </p>
            <p className="character-delete-subcopy">{'삭제 후에는 되돌릴 수 없습니다.'}</p>

            <div className="character-delete-actions">
              <button
                type="button"
                className="danger-button character-delete-confirm"
                onClick={() => void confirmDeleteSelectedCharacter()}
                disabled={busy}
              >
                삭제
              </button>
              <button
                type="button"
                className="ghost character-delete-cancel"
                onClick={closeDeleteModal}
                disabled={busy}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
