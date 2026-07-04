import { useCallback, useEffect, useState } from 'react';
import type { RaceResponseDto, RuleCatalogReferenceDto } from '@trpg/shared-types';
import { getPreferredScenario } from '../../data/sessionVisuals';
import type { CharacterPayload } from '../../hooks/useSession';
import type { PersistentCharacter, Scenario } from '../../types/session';
import type { ClassDefinitionResponseDto } from '@trpg/shared-types';
import type { StaticFeSpellPools } from '../../services/staticSrd';
import {
  applyPointBuyAbilityAdjustment,
  syncDerivedLevelStats,
  type AbilityKey,
  type DerivedLevelStats,
} from './characterBuildRules';
import {
  setCharacterCreateAsiFeatChoice,
  setCharacterCreateSingleFeatureChoice,
  toggleCharacterCreateMultiFeatureChoice,
  type FeatureChoiceDefinition,
} from './characterFeatureChoices';
import {
  characterCreateSteps,
  createDefaultCharacter,
  createDefaultCharacterFormState,
  createEditCharacterDraft,
  applyClassSelectionToCharacterFormState,
  applyDefaultScenarioToCharacterFormState,
  applyScenarioSelectionToCharacterFormState,
  prepareCharacterCreateSubmitFromViewState,
  setCharacterCreateName,
  setCharacterCreateSubclass,
  setCharacterCreateAbilityScore,
  validateCharacterCreateStepTransition,
} from './characterCreateDefaults';
import { applyRaceToCharacterFormState } from './characterRacePresentation';
import {
  addProficientSkillToCharacter,
  removeProficientSkillFromCharacter,
} from './characterSkillSelection';
import {
  setCharacterCreateStartingCantrips,
  setCharacterCreateStartingPreparedSpells,
  setCharacterCreateStartingSlotSpells,
} from './characterSpellSelectionRules';
import {
  applyStartingEquipmentItemSelection,
  applyStartingEquipmentSlotSelection,
} from './characterStartingEquipment';

export interface InventoryDraftItem {
  id: string;
  name: string;
  quantity: number;
}

type CharacterCreateSubmitViewState = Omit<
  Parameters<typeof prepareCharacterCreateSubmitFromViewState>[0],
  'formState' | 'inventoryDraft' | 'isEditing'
>;

export function useCharacterCreateDraft(params: {
  scenarios: Scenario[];
  races: RaceResponseDto[];
  classDefinitions: ClassDefinitionResponseDto[];
  ruleCatalog: RuleCatalogReferenceDto[];
  spellPools: StaticFeSpellPools | null;
}) {
  const { scenarios, races, classDefinitions, ruleCatalog, spellPools } = params;
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState('');
  const [inventoryDraft, setInventoryDraft] = useState<InventoryDraftItem[]>([]);
  const [formState, setFormState] = useState<CharacterPayload>(() => createDefaultCharacter());
  const [formValidationError, setFormValidationError] = useState<string | null>(null);
  const [createStepIndex, setCreateStepIndex] = useState(0);
  const [isStatsReferenceOpen, setStatsReferenceOpen] = useState(false);

  function resetCreateForm() {
    const defaultScenario = getPreferredScenario(scenarios);

    setEditingCharacterId(null);
    setCreateStepIndex(0);
    setStatsReferenceOpen(false);
    setFormState(
      createDefaultCharacterFormState({
        classDefinitions,
        defaultScenario,
        ruleCatalog,
        spellPools,
      })
    );
    setInventoryDraft([]);
    setSkillInput('');
    setFormValidationError(null);
  }

  function openCreateModal() {
    resetCreateForm();
    setCreateModalOpen(true);
  }

  function openEditModal(character: PersistentCharacter | null) {
    if (!character) return false;
    const editDraft = createEditCharacterDraft(character);

    setEditingCharacterId(character.id);
    setCreateStepIndex(0);
    setFormState(editDraft.formState);
    setInventoryDraft(editDraft.inventoryDraft);
    setSkillInput('');
    setStatsReferenceOpen(false);
    setFormValidationError(null);
    setCreateModalOpen(true);
    return true;
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    resetCreateForm();
  }

  function goToPreviousCreateStep() {
    setFormValidationError(null);
    setCreateStepIndex((current) => Math.max(0, current - 1));
  }

  function goToNextCreateStep(
    validationParams: Parameters<typeof validateCharacterCreateStepTransition>[0]
  ) {
    const validation = validateCharacterCreateStepTransition(validationParams);

    if (!validation.ok) {
      setFormValidationError(validation.error);
      return;
    }

    setFormValidationError(null);
    setCreateStepIndex((current) => Math.min(characterCreateSteps.length - 1, current + 1));
  }

  async function submitDraft(
    submitParams: CharacterCreateSubmitViewState & {
      onCreateCharacter: (payload: CharacterPayload) => Promise<boolean>;
      onUpdateCharacter: (characterId: string, payload: CharacterPayload) => Promise<boolean>;
    }
  ) {
    const isEditing = Boolean(editingCharacterId);
    const preparedSubmit = prepareCharacterCreateSubmitFromViewState({
      ...submitParams,
      formState,
      inventoryDraft,
      isEditing,
    });

    if (!preparedSubmit.ok) {
      setFormValidationError(preparedSubmit.error);
      return { succeeded: false, shouldReturnToSession: false };
    }

    setFormValidationError(null);

    // 검증 실패 시 모달을 유지해서 사용자가 입력한 폼 상태를 보존한다.
    const succeeded = editingCharacterId
      ? await submitParams.onUpdateCharacter(editingCharacterId, preparedSubmit.payload)
      : await submitParams.onCreateCharacter(preparedSubmit.payload);

    if (succeeded) {
      closeCreateModal();
    }

    return {
      succeeded,
      shouldReturnToSession: succeeded && !isEditing && submitParams.shouldReturnToSession,
    };
  }

  const syncDerivedStats = useCallback((derivedLevelStats: DerivedLevelStats | null | undefined) => {
    if (!derivedLevelStats) return;
    setFormState((current) => syncDerivedLevelStats(current, derivedLevelStats));
  }, []);

  function adjustAbilityBase(params: {
    abilityIncreases?: Record<AbilityKey, number> | null;
    ability: AbilityKey;
    delta: 1 | -1;
  }) {
    setFormState((current) =>
      applyPointBuyAbilityAdjustment(current, {
        abilityIncreases: params.abilityIncreases,
        ability: params.ability,
        delta: params.delta,
      }),
    );
  }

  function updateAbilityScore(ability: AbilityKey, value: number) {
    setFormState((current) => setCharacterCreateAbilityScore(current, ability, value));
  }

  function addSkill(skill: string, limit: number | null) {
    if (!skill.trim()) return;
    setFormState((current) => addProficientSkillToCharacter(current, skill, limit));
    setSkillInput('');
  }

  function removeSkill(skill: string) {
    setFormState((current) => removeProficientSkillFromCharacter(current, skill));
  }

  const applyDefaultScenario = useCallback((defaultScenario: Scenario) => {
    setFormState((current) => applyDefaultScenarioToCharacterFormState(current, defaultScenario));
  }, []);

  useEffect(() => {
    if (!isCreateModalOpen || editingCharacterId || formState.scenarioId || !scenarios.length) {
      return;
    }

    const defaultScenario = getPreferredScenario(scenarios);
    if (!defaultScenario) return;

    // 시나리오 목록이 모달보다 늦게 로드되어도 생성 폼은 기본 제공 시나리오로 맞춥니다.
    applyDefaultScenario(defaultScenario);
  }, [applyDefaultScenario, editingCharacterId, formState.scenarioId, isCreateModalOpen, scenarios]);

  function setName(name: string) {
    setFormState((current) => setCharacterCreateName(current, name));
  }

  function selectScenario(scenarioId: string | null) {
    setFormState((current) =>
      applyScenarioSelectionToCharacterFormState({
        current,
        scenarioId,
        scenarios,
        classDefinitions,
        ruleCatalog,
        spellPools,
      })
    );
  }

  function selectAncestry(ancestry: string) {
    setFormState((current) => applyRaceToCharacterFormState(current, races, ancestry));
  }

  function selectClass(paramsForSelection: {
    className: string;
    raceAbilityIncreases?: Record<AbilityKey, number> | null;
  }) {
    setFormState((current) =>
      applyClassSelectionToCharacterFormState({
        current,
        className: paramsForSelection.className,
        classDefinitions,
        raceAbilityIncreases: paramsForSelection.raceAbilityIncreases,
        ruleCatalog,
        spellPools,
      })
    );
  }

  function setSubclass(subclassName: string) {
    setFormState((current) => setCharacterCreateSubclass(current, subclassName));
  }

  function setAsiFeatChoice(index: number, choiceId: string) {
    setFormState((current) => setCharacterCreateAsiFeatChoice(current, index, choiceId));
  }

  function setSingleFeatureChoice(definition: FeatureChoiceDefinition, value: string) {
    setFormState((current) =>
      setCharacterCreateSingleFeatureChoice(current, definition, value)
    );
  }

  function toggleMultiFeatureChoice(definition: FeatureChoiceDefinition, value: string) {
    setFormState((current) =>
      toggleCharacterCreateMultiFeatureChoice(current, definition, value)
    );
  }

  function selectStartingEquipmentSlot(paramsForSelection: {
    slotIndex: number;
    optionIndex: number;
    slotCount: number;
  }) {
    setFormState((current) =>
      applyStartingEquipmentSlotSelection(
        current,
        paramsForSelection.slotIndex,
        paramsForSelection.optionIndex,
        paramsForSelection.slotCount
      )
    );
  }

  function selectStartingEquipmentItem(selectionKey: string, itemKey: string) {
    setFormState((current) =>
      applyStartingEquipmentItemSelection(current, selectionKey, itemKey)
    );
  }

  function setStartingCantrips(cantrips: string[], slotSpellCount: number) {
    setFormValidationError(null);
    setFormState((current) =>
      setCharacterCreateStartingCantrips(current, cantrips, slotSpellCount)
    );
  }

  function setStartingSlotSpells(
    spells: string[],
    cantripCount: number,
    preparedSpellLimit: number | null
  ) {
    setFormValidationError(null);
    setFormState((current) =>
      setCharacterCreateStartingSlotSpells(current, spells, cantripCount, preparedSpellLimit)
    );
  }

  function setStartingPreparedSpells(
    preparedSpells: string[],
    cantripCount: number,
    slotSpellCount: number
  ) {
    setFormValidationError(null);
    setFormState((current) =>
      setCharacterCreateStartingPreparedSpells(
        current,
        preparedSpells,
        cantripCount,
        slotSpellCount
      )
    );
  }

  return {
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
    openCreateModal,
    openEditModal,
    closeCreateModal,
    goToPreviousCreateStep,
    goToNextCreateStep,
    submitDraft,
    syncDerivedStats,
    adjustAbilityBase,
    updateAbilityScore,
    addSkill,
    removeSkill,
    setName,
    selectScenario,
    selectAncestry,
    selectClass,
    setSubclass,
    setAsiFeatChoice,
    setSingleFeatureChoice,
    toggleMultiFeatureChoice,
    selectStartingEquipmentSlot,
    selectStartingEquipmentItem,
    setStartingCantrips,
    setStartingSlotSpells,
    setStartingPreparedSpells,
  };
}
