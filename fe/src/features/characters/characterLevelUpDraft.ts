import type { LevelUpCharacterDto, UpdatePreparedSpellsDto } from '@trpg/shared-types';
import type { PersistentCharacter } from '../../types/session';
import type { AbilityKey } from './characterBuildRules';
import {
  buildAbilityScoreIncreasesFromAsiFeatChoices,
  createEmptyAbilityScoreIncreases,
  getFeatSelectionsFromAsiFeatChoices,
} from './characterFeatureChoices';

export type CharacterLevelUpDraft = {
  targetLevel: number;
  subclassName: string;
  cantrips: string[];
  knownSpells: string[];
  forgottenCantrips: string[];
  forgottenSpells: string[];
  preparedSpells: string[];
  abilityScoreIncreases: Record<AbilityKey, number>;
  featSelections: string[];
  asiFeatChoices: string[];
};

export function createDefaultLevelUpDraft(params?: {
  targetLevel?: number;
  subclassName?: string | null;
  preparedSpells?: string[];
}): CharacterLevelUpDraft {
  return {
    targetLevel: params?.targetLevel ?? 2,
    subclassName: params?.subclassName ?? '',
    cantrips: [],
    knownSpells: [],
    forgottenCantrips: [],
    forgottenSpells: [],
    preparedSpells: params?.preparedSpells ?? [],
    abilityScoreIncreases: createEmptyAbilityScoreIncreases(),
    featSelections: [],
    asiFeatChoices: [],
  };
}

export function resetLevelUpDraftForTargetLevel(
  draft: CharacterLevelUpDraft,
  targetLevel: number
): CharacterLevelUpDraft {
  return {
    ...draft,
    targetLevel,
    cantrips: [],
    knownSpells: [],
    forgottenCantrips: [],
    forgottenSpells: [],
    featSelections: [],
    asiFeatChoices: [],
  };
}

export function setAsiFeatChoiceInDraft(
  draft: CharacterLevelUpDraft,
  choiceIndex: number,
  choiceId: string
): CharacterLevelUpDraft {
  const asiFeatChoices = [...draft.asiFeatChoices];
  asiFeatChoices[choiceIndex] = choiceId;

  return {
    ...draft,
    asiFeatChoices,
    featSelections: getFeatSelectionsFromAsiFeatChoices(asiFeatChoices),
    abilityScoreIncreases: buildAbilityScoreIncreasesFromAsiFeatChoices(asiFeatChoices),
  };
}

export function setSubclassInLevelUpDraft(
  draft: CharacterLevelUpDraft,
  subclassName: string
): CharacterLevelUpDraft {
  return {
    ...draft,
    subclassName,
  };
}

export function togglePreparedSpellInDraft(
  draft: CharacterLevelUpDraft,
  spellId: string,
  preparedSpellLimit: number | null
): CharacterLevelUpDraft {
  const isSelected = draft.preparedSpells.includes(spellId);
  if (!isSelected && preparedSpellLimit !== null && draft.preparedSpells.length >= preparedSpellLimit) {
    return draft;
  }

  return {
    ...draft,
    preparedSpells: isSelected
      ? draft.preparedSpells.filter((id) => id !== spellId)
      : [...draft.preparedSpells, spellId],
  };
}

export function toggleKnownSpellInDraft(
  draft: CharacterLevelUpDraft,
  spellId: string,
  knownSpellLearnAllowance: number
): CharacterLevelUpDraft {
  const isSelected = draft.knownSpells.includes(spellId);
  if (!isSelected && draft.knownSpells.length >= knownSpellLearnAllowance) {
    return draft;
  }

  return {
    ...draft,
    knownSpells: isSelected
      ? draft.knownSpells.filter((id) => id !== spellId)
      : [...draft.knownSpells, spellId],
    preparedSpells: isSelected
      ? draft.preparedSpells.filter((id) => id !== spellId)
      : draft.preparedSpells,
  };
}

export function toggleCantripInDraft(
  draft: CharacterLevelUpDraft,
  spellId: string,
  cantripLearnAllowance: number
): CharacterLevelUpDraft {
  const isSelected = draft.cantrips.includes(spellId);
  if (!isSelected && draft.cantrips.length >= cantripLearnAllowance) {
    return draft;
  }

  return {
    ...draft,
    cantrips: isSelected
      ? draft.cantrips.filter((id) => id !== spellId)
      : [...draft.cantrips, spellId],
  };
}

export function toggleForgottenSpellInDraft(
  draft: CharacterLevelUpDraft,
  spellId: string,
  levelDelta: number,
  baseKnownSpellAllowance: number
): CharacterLevelUpDraft {
  const isSelected = draft.forgottenSpells.includes(spellId);
  if (!isSelected && draft.forgottenSpells.length >= levelDelta) {
    return draft;
  }

  const forgottenSpells = isSelected
    ? draft.forgottenSpells.filter((id) => id !== spellId)
    : [...draft.forgottenSpells, spellId];

  return {
    ...draft,
    forgottenSpells,
    knownSpells: draft.knownSpells.slice(0, baseKnownSpellAllowance + forgottenSpells.length),
    preparedSpells: isSelected
      ? draft.preparedSpells
      : draft.preparedSpells.filter((id) => id !== spellId),
  };
}

export function toggleForgottenCantripInDraft(
  draft: CharacterLevelUpDraft,
  spellId: string,
  levelDelta: number,
  baseCantripAllowance: number
): CharacterLevelUpDraft {
  const isSelected = draft.forgottenCantrips.includes(spellId);
  if (!isSelected && draft.forgottenCantrips.length >= levelDelta) {
    return draft;
  }

  const forgottenCantrips = isSelected
    ? draft.forgottenCantrips.filter((id) => id !== spellId)
    : [...draft.forgottenCantrips, spellId];

  return {
    ...draft,
    forgottenCantrips,
    cantrips: draft.cantrips.slice(0, baseCantripAllowance + forgottenCantrips.length),
  };
}

export function setKnownSpellsInDraft(
  draft: CharacterLevelUpDraft,
  nextSpellIds: string[],
  knownSpellLearnAllowance: number
): CharacterLevelUpDraft {
  const knownSpells = nextSpellIds.slice(0, knownSpellLearnAllowance);
  const knownSpellSet = new Set(knownSpells);
  const removedLearnedSpells = new Set(
    draft.knownSpells.filter((spellId) => !knownSpellSet.has(spellId))
  );

  return {
    ...draft,
    knownSpells,
    preparedSpells: draft.preparedSpells.filter((spellId) => !removedLearnedSpells.has(spellId)),
  };
}

export function setCantripsInDraft(
  draft: CharacterLevelUpDraft,
  nextCantripIds: string[],
  cantripLearnAllowance: number
): CharacterLevelUpDraft {
  return {
    ...draft,
    cantrips: nextCantripIds.slice(0, cantripLearnAllowance),
  };
}

export function setForgottenSpellsInDraft(
  draft: CharacterLevelUpDraft,
  nextSpellIds: string[],
  levelDelta: number,
  baseKnownSpellAllowance: number
): CharacterLevelUpDraft {
  const forgottenSpells = nextSpellIds.slice(0, levelDelta);
  const previousForgotten = new Set(draft.forgottenSpells);
  const newlyForgotten = new Set(
    forgottenSpells.filter((spellId) => !previousForgotten.has(spellId))
  );

  return {
    ...draft,
    forgottenSpells,
    knownSpells: draft.knownSpells.slice(0, baseKnownSpellAllowance + forgottenSpells.length),
    preparedSpells: draft.preparedSpells.filter((spellId) => !newlyForgotten.has(spellId)),
  };
}

export function setForgottenCantripsInDraft(
  draft: CharacterLevelUpDraft,
  nextCantripIds: string[],
  levelDelta: number,
  baseCantripAllowance: number
): CharacterLevelUpDraft {
  const forgottenCantrips = nextCantripIds.slice(0, levelDelta);

  return {
    ...draft,
    forgottenCantrips,
    cantrips: draft.cantrips.slice(0, baseCantripAllowance + forgottenCantrips.length),
  };
}

export function setPreparedSpellsInDraft(
  draft: CharacterLevelUpDraft,
  nextSpellIds: string[],
  preparedSpellLimit: number | null
): CharacterLevelUpDraft {
  return {
    ...draft,
    preparedSpells: nextSpellIds.slice(0, preparedSpellLimit ?? nextSpellIds.length),
  };
}

export function buildLevelUpCharacterPayload(params: {
  currentLevel: number;
  draft: CharacterLevelUpDraft;
  applyToActiveSessions: boolean;
  abilityScoreIncreases: Record<AbilityKey, number>;
  featSelections: string[];
  preparedSpellLimit: number | null;
}): LevelUpCharacterDto {
  const targetLevel = Math.min(20, Math.max(params.currentLevel + 1, params.draft.targetLevel));

  return {
    targetLevel,
    hpMode: 'average',
    applyToActiveSessions: params.applyToActiveSessions,
    ...(params.draft.subclassName ? { subclassName: params.draft.subclassName } : {}),
    ...(Object.values(params.abilityScoreIncreases).some((value) => value > 0)
      ? { abilityScoreIncreases: params.abilityScoreIncreases }
      : {}),
    ...(params.featSelections.length ? { featSelections: params.featSelections } : {}),
    ...(params.draft.knownSpells.length ? { knownSpells: params.draft.knownSpells } : {}),
    ...(params.draft.cantrips.length ? { cantrips: params.draft.cantrips } : {}),
    ...(params.draft.forgottenSpells.length
      ? { forgottenSpells: params.draft.forgottenSpells }
      : {}),
    ...(params.draft.forgottenCantrips.length
      ? { forgottenCantrips: params.draft.forgottenCantrips }
      : {}),
    ...(params.preparedSpellLimit !== null
      ? { preparedSpells: params.draft.preparedSpells.filter((spell) => spell.length > 0) }
      : {}),
  };
}

export function buildLevelUpCharacterPayloadFromViewState(params: {
  character: PersistentCharacter;
  draft: CharacterLevelUpDraft;
  usedCharacterIds: Set<string>;
  abilityScoreIncreases: Record<AbilityKey, number>;
  featSelections: string[];
  preparedSpellLimit: number | null;
}): LevelUpCharacterDto {
  return buildLevelUpCharacterPayload({
    currentLevel: params.character.level,
    draft: params.draft,
    applyToActiveSessions: params.usedCharacterIds.has(params.character.id),
    abilityScoreIncreases: params.abilityScoreIncreases,
    featSelections: params.featSelections,
    preparedSpellLimit: params.preparedSpellLimit,
  });
}

export function buildPreparedSpellsUpdatePayload(
  draft: CharacterLevelUpDraft
): UpdatePreparedSpellsDto {
  return {
    preparedSpells: draft.preparedSpells.filter((spell) => spell.length > 0),
  };
}
