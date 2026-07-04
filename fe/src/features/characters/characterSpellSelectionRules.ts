import type {
  ClassDefinitionResponseDto,
  RuleCatalogReferenceDto,
  StartingSpellsDto,
} from '@trpg/shared-types';
import type { CharacterPayload } from '../../hooks/useSession';
import {
  getSrdClassDefinition,
  normalizeSrdCharacterClassKey,
  resolveCharacterSpellSelectionRequirements,
  resolveMaximumCastableSpellLevel,
  resolvePreparedSpellAbility,
  resolvePreparedSpellLimit as resolveSrdPreparedSpellLimit,
} from '@trpg/srd-data/rules';
import type { StaticFeSpellPools, StaticSpellCatalogEntry } from '../../services/staticSrd';
import type {
  SpellSelectionGridDetail,
  SpellSelectionGridOption,
} from '../spells/SpellSelectionGrid';
import { getSpellDisplayLabel } from '../spells/spellDisplay';

export type CharacterAbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type ImplementedSpellOption = { id: string; label: string; level?: number | null };

export function buildSpellCatalogById(spellCatalog: StaticSpellCatalogEntry[]) {
  return new Map(spellCatalog.map((spell) => [spell.id, spell] as const));
}

export function getImplementedSpellOptions(
  className: string | null | undefined,
  kind: 'cantrip' | 'slot',
  level = 1,
  ruleCatalog: RuleCatalogReferenceDto[] = [],
  spellCatalogById?: Map<string, StaticSpellCatalogEntry>,
  spellPools?: StaticFeSpellPools | null
): ImplementedSpellOption[] {
  const classKey = normalizeSrdCharacterClassKey(className ?? '');
  if (!hasSrdSpellcastingProgression(classKey)) return [];
  const maxSpellLevel = resolveMaximumCastableSpellLevel(classKey, level);
  const catalogOptions = getCatalogSpellOptions(ruleCatalog, kind, maxSpellLevel, spellCatalogById);
  if (catalogOptions.length) {
    return kind === 'cantrip' && !shouldOfferCantripOptions(classKey, level)
      ? []
      : catalogOptions;
  }
  if (kind === 'cantrip') {
    return shouldOfferCantripOptions(classKey, level)
      ? toFallbackSpellOptions(spellPools?.characterBuilder.cantrips ?? [], spellCatalogById, 0)
      : [];
  }
  const slotSpellsByLevel = spellPools?.characterBuilder.slotSpellsByLevel ?? {};
  return [
    ...toFallbackSpellOptions(slotSpellsByLevel['1'] ?? [], spellCatalogById, 1),
    ...(maxSpellLevel >= 2 ? toFallbackSpellOptions(slotSpellsByLevel['2'] ?? [], spellCatalogById, 2) : []),
    ...(maxSpellLevel >= 3 ? toFallbackSpellOptions(slotSpellsByLevel['3'] ?? [], spellCatalogById, 3) : []),
    ...(maxSpellLevel >= 4 ? toFallbackSpellOptions(slotSpellsByLevel['4'] ?? [], spellCatalogById, 4) : []),
  ];
}

export function getImplementedSpellLabel(
  spellId: string,
  ruleCatalog: RuleCatalogReferenceDto[] = [],
  spellCatalogById?: Map<string, StaticSpellCatalogEntry>
) {
  const catalogEntry = ruleCatalog.find((entry) => entry.id === spellId);
  return getSpellDisplayLabel({
    spellId,
    label: catalogEntry?.label,
    catalogEntry: spellCatalogById?.get(spellId),
  });
}

export function getPreparedSpellAbilityKey(
  className: string | null | undefined
): CharacterAbilityKey | null {
  return resolvePreparedSpellAbility(className ?? '') as CharacterAbilityKey | null;
}

export function usesDynamicPreparedSpellPool(
  className: string | null | undefined,
  level: number,
  ruleCatalog: RuleCatalogReferenceDto[] = [],
  spellPools?: StaticFeSpellPools | null
) {
  return resolveCharacterSpellSelectionRequirements({
    classKey: className,
    level,
    executableSpellPools: {
      slotSpells: getImplementedSpellOptions(className, 'slot', level, ruleCatalog, undefined, spellPools)
        .map((spell) => spell.id),
    },
  }).usesDynamicPreparedPool;
}

export function resolveCharacterPreparedSpellLimit(
  className: string | null | undefined,
  level: number | null | undefined,
  abilities: Partial<Record<CharacterAbilityKey, number>> | null | undefined
) {
  return resolveSrdPreparedSpellLimit({
    classKey: className,
    level,
    abilities,
  });
}

export function resolveStartingSlotSpellCount(
  klass: ClassDefinitionResponseDto | null | undefined,
  className: string | null | undefined,
  level: number,
  ruleCatalog: RuleCatalogReferenceDto[] = [],
  spellPools?: StaticFeSpellPools | null
) {
  if (!klass) return 0;
  return resolveCharacterSpellSelectionRequirements({
    classKey: className,
    level,
    executableSpellPools: {
      slotSpells: getImplementedSpellOptions(className, 'slot', level, ruleCatalog, undefined, spellPools)
        .map((spell) => spell.id),
    },
  }).knownOrSpellbookSpellCount;
}

export function attachSpellDetails(
  options: ImplementedSpellOption[],
  ruleCatalog: RuleCatalogReferenceDto[],
  spellCatalogById: Map<string, StaticSpellCatalogEntry>
): SpellSelectionGridOption[] {
  return options.map((option) => ({
    ...option,
    detail: buildSpellSelectionDetail(option, ruleCatalog, spellCatalogById),
  }));
}

export function buildSpellSelectionDetail(
  option: ImplementedSpellOption,
  ruleCatalog: RuleCatalogReferenceDto[],
  spellCatalogById: Map<string, StaticSpellCatalogEntry>
): SpellSelectionGridDetail {
  const srdSpell = spellCatalogById.get(option.id);
  const catalogEntry = ruleCatalog.find((entry) => entry.id === option.id);
  const specs = [
    formatSpellLevelLabel(srdSpell?.level ?? option.level ?? catalogEntry?.spellLevel ?? null),
    srdSpell?.schoolKo ?? null,
    srdSpell?.castingTime?.raw ? `시전 ${srdSpell.castingTime.raw}` : null,
    srdSpell?.range?.raw
      ? `거리 ${srdSpell.range.raw}`
      : typeof catalogEntry?.rangeFt === 'number'
        ? `거리 ${catalogEntry.rangeFt}ft`
        : null,
    catalogEntry?.targetingType ? formatTargetingType(catalogEntry.targetingType) : null,
    srdSpell?.duration?.raw ? `지속 ${srdSpell.duration.raw}` : null,
    srdSpell?.components?.raw ? `구성 ${srdSpell.components.raw}` : null,
    srdSpell?.concentration ? '집중' : null,
    srdSpell?.ritual ? '의식' : null,
  ].filter((spec): spec is string => Boolean(spec));

  return {
    specs,
    summary: srdSpell?.playReference ?? buildRuntimeTagSummary(catalogEntry?.runtimeTags ?? []),
    higherLevel: srdSpell?.higherLevel ?? null,
    scaling: srdSpell?.scaling ?? null,
    tags: normalizeRuntimeTagsForDisplay(catalogEntry?.runtimeTags ?? []),
  };
}

export function buildSpellDisplayOptions(
  spellIds: string[],
  ruleCatalog: RuleCatalogReferenceDto[],
  spellCatalogById: Map<string, StaticSpellCatalogEntry>
): SpellSelectionGridOption[] {
  const uniqueSpellIds = Array.from(new Set(spellIds.map((spellId) => spellId.trim()).filter(Boolean)));
  return attachSpellDetails(
    uniqueSpellIds.map((spellId) => {
      const srdSpell = spellCatalogById.get(spellId);
      const catalogEntry = ruleCatalog.find((entry) => entry.id === spellId);
      return {
        id: spellId,
        label: getImplementedSpellLabel(spellId, ruleCatalog, spellCatalogById),
        level: srdSpell?.level ?? catalogEntry?.spellLevel ?? null,
      };
    }),
    ruleCatalog,
    spellCatalogById
  );
}

export function getSelectedStartingSlotSpellIds(
  startingSpells: { spells?: string[] } | null | undefined
) {
  return Array.from(
    new Set((startingSpells?.spells ?? []).map((spell) => spell.trim()).filter(Boolean))
  );
}

export function getSelectedStartingCantripIds(
  startingSpells: { cantrips?: string[] } | null | undefined
) {
  return (startingSpells?.cantrips ?? []).map((spell) => spell.trim()).filter(Boolean);
}

export function getSelectedStartingPreparedSpellIds(
  startingSpells: { preparedSpells?: string[] } | null | undefined
) {
  return (startingSpells?.preparedSpells ?? []).map((spell) => spell.trim()).filter(Boolean);
}

export function buildStartingSpellReviewCounts(params: {
  startingSpells: StartingSpellsDto | undefined;
  usePreparedSpells: boolean;
}) {
  return {
    cantripCount: getSelectedStartingCantripIds(params.startingSpells).length,
    secondarySpellCount: params.usePreparedSpells
      ? getSelectedStartingPreparedSpellIds(params.startingSpells).length
      : getSelectedStartingSlotSpellIds(params.startingSpells).length,
  };
}

export function buildStartingSpellSectionState(params: {
  cantripCount: number;
  slotSpellCount: number;
  preparedSpellLimit: number | null;
  preparedSpellOptionCount: number;
  classKey: string;
}) {
  const preparedSpellCount =
    params.preparedSpellLimit !== null && params.preparedSpellOptionCount > 0
      ? params.preparedSpellLimit
      : 0;
  const hasStartingSpells =
    params.cantripCount > 0 || params.slotSpellCount > 0 || preparedSpellCount > 0;
  const heading = hasStartingSpells
    ? [
        params.cantripCount > 0 ? `캔트립 ${params.cantripCount}개` : null,
        params.slotSpellCount > 0
          ? `${params.classKey === 'wizard' ? '주문책 주문' : '습득 주문'} ${params.slotSpellCount}개`
          : null,
        preparedSpellCount > 0 ? `준비 주문 ${preparedSpellCount}개` : null,
      ]
        .filter(Boolean)
        .join(' + ')
    : '선택할 시작 주문 없음';

  return {
    cantripCount: params.cantripCount,
    slotSpellCount: params.slotSpellCount,
    preparedSpellCount,
    hasStartingSpells,
    heading,
  };
}

export function updateStartingCantrips(
  startingSpells: StartingSpellsDto | undefined,
  cantrips: string[],
  slotSpellCount: number
): StartingSpellsDto {
  const base: StartingSpellsDto = startingSpells ?? {
    cantrips: [],
    spells: new Array(slotSpellCount).fill(''),
  };
  return { ...base, cantrips };
}

export function updateStartingSlotSpells(
  startingSpells: StartingSpellsDto | undefined,
  spells: string[],
  cantripCount: number,
  preparedSpellLimit: number | null
): StartingSpellsDto {
  const base: StartingSpellsDto = startingSpells ?? {
    cantrips: new Array(cantripCount).fill(''),
    spells: [],
  };
  const preparedSpells = (base.preparedSpells ?? []).filter((spellId) =>
    spells.includes(spellId)
  );

  return {
    ...base,
    spells,
    ...(preparedSpellLimit !== null ? { preparedSpells } : {}),
  };
}

export function updateStartingPreparedSpells(
  startingSpells: StartingSpellsDto | undefined,
  preparedSpells: string[],
  cantripCount: number,
  slotSpellCount: number
): StartingSpellsDto {
  const base: StartingSpellsDto = startingSpells ?? {
    cantrips: new Array(cantripCount).fill(''),
    spells: new Array(slotSpellCount).fill(''),
  };
  return { ...base, preparedSpells };
}

export function setCharacterCreateStartingCantrips(
  current: CharacterPayload,
  cantrips: string[],
  slotSpellCount: number
): CharacterPayload {
  return {
    ...current,
    startingSpells: updateStartingCantrips(current.startingSpells, cantrips, slotSpellCount),
  };
}

export function setCharacterCreateStartingSlotSpells(
  current: CharacterPayload,
  spells: string[],
  cantripCount: number,
  preparedSpellLimit: number | null
): CharacterPayload {
  return {
    ...current,
    startingSpells: updateStartingSlotSpells(
      current.startingSpells,
      spells,
      cantripCount,
      preparedSpellLimit
    ),
  };
}

export function setCharacterCreateStartingPreparedSpells(
  current: CharacterPayload,
  preparedSpells: string[],
  cantripCount: number,
  slotSpellCount: number
): CharacterPayload {
  return {
    ...current,
    startingSpells: updateStartingPreparedSpells(
      current.startingSpells,
      preparedSpells,
      cantripCount,
      slotSpellCount
    ),
  };
}

export function buildStartingPreparedSpellOptions(params: {
  isDynamicPreparedCaster: boolean;
  detailedSlotSpellOptions: SpellSelectionGridOption[];
  selectedSlotSpellIds: string[];
  slotSpellOptions: ImplementedSpellOption[];
  ruleCatalog: RuleCatalogReferenceDto[];
  spellCatalogById: Map<string, StaticSpellCatalogEntry>;
}): SpellSelectionGridOption[] {
  if (params.isDynamicPreparedCaster) {
    return params.detailedSlotSpellOptions;
  }

  return params.selectedSlotSpellIds.map((spellId) => {
    const slotSpellOption = params.slotSpellOptions.find((spell) => spell.id === spellId);
    const fallbackOption = {
      id: spellId,
      label: getImplementedSpellLabel(spellId, params.ruleCatalog, params.spellCatalogById),
      level: null,
    };

    return {
      id: spellId,
      label: getImplementedSpellLabel(spellId, params.ruleCatalog, params.spellCatalogById),
      level: slotSpellOption?.level,
      detail: buildSpellSelectionDetail(
        slotSpellOption ?? fallbackOption,
        params.ruleCatalog,
        params.spellCatalogById
      ),
    };
  });
}

export function resolveStartingPreparedSpellLimit(params: {
  className: string | null | undefined;
  level: number | null | undefined;
  abilities: Partial<Record<CharacterAbilityKey, number>> | null | undefined;
  preparedSpellOptionCount: number;
}) {
  const rawLimit = resolveCharacterPreparedSpellLimit(
    params.className,
    params.level,
    params.abilities
  );
  return rawLimit === null ? null : Math.min(rawLimit, params.preparedSpellOptionCount);
}

export type CharacterSpellDisplayModel = {
  cantripIds: string[];
  knownSpellIds: string[];
  preparedSpellIds: string[];
  cantripOptions: SpellSelectionGridOption[];
  knownSpellOptions: SpellSelectionGridOption[];
  preparedSpellOptions: SpellSelectionGridOption[];
  summaryGroups: CharacterSpellSummaryGroup[];
  hasAnySpells: boolean;
};

export type CharacterSpellSummaryGroup = {
  key: 'cantrips' | 'known' | 'prepared';
  title: string;
  count: number;
  options: SpellSelectionGridOption[];
  isPrepared?: boolean;
};

export type CharacterLevelUpSpellSelectionModel = {
  learnableSlotSpells: ImplementedSpellOption[];
  learnableSlotSpellOptions: SpellSelectionGridOption[];
  forgottenSlotSpellOptions: SpellSelectionGridOption[];
  learnableCantrips: ImplementedSpellOption[];
  learnableCantripOptions: SpellSelectionGridOption[];
  forgottenCantripOptions: SpellSelectionGridOption[];
  preparedCandidateSlotSpellIds: string[];
  preparedSpellOptions: SpellSelectionGridOption[];
};

export type CharacterCreateSpellSelectionModel = {
  cantripOptions: ImplementedSpellOption[];
  cantripGridOptions: SpellSelectionGridOption[];
  cantripCount: number;
  selectedCantripIds: string[];
  slotSpellOptions: ImplementedSpellOption[];
  slotSpellGridOptions: SpellSelectionGridOption[];
  slotSpellCount: number;
  selectedSlotSpellIds: string[];
  selectedPreparedSpellIds: string[];
  isDynamicPreparedCaster: boolean;
  preparedSpellOptions: SpellSelectionGridOption[];
  preparedSpellLimit: number | null;
  reviewCounts: ReturnType<typeof buildStartingSpellReviewCounts>;
  sectionState: ReturnType<typeof buildStartingSpellSectionState>;
};

export function buildCharacterCreateSpellSelectionModel(params: {
  selectedClass: ClassDefinitionResponseDto | null;
  className: string | null | undefined;
  classKey: string;
  level: number | null | undefined;
  abilities: Partial<Record<CharacterAbilityKey, number>> | null | undefined;
  startingSpells: StartingSpellsDto | undefined;
  ruleCatalog: RuleCatalogReferenceDto[];
  spellCatalogById: Map<string, StaticSpellCatalogEntry>;
  spellPools: StaticFeSpellPools | null;
}): CharacterCreateSpellSelectionModel {
  const level = params.level ?? 1;
  const cantripOptions = getImplementedSpellOptions(
    params.className,
    'cantrip',
    level,
    params.ruleCatalog,
    params.spellCatalogById,
    params.spellPools
  );
  const cantripGridOptions = attachSpellDetails(
    cantripOptions,
    params.ruleCatalog,
    params.spellCatalogById
  );
  const cantripCount = resolveStartingCantripCount(
    params.selectedClass,
    params.className,
    level,
    params.ruleCatalog
  );
  const slotSpellOptions = getImplementedSpellOptions(
    params.className,
    'slot',
    level,
    params.ruleCatalog,
    params.spellCatalogById,
    params.spellPools
  );
  const slotSpellGridOptions = attachSpellDetails(
    slotSpellOptions,
    params.ruleCatalog,
    params.spellCatalogById
  );
  const slotSpellCount = resolveStartingSlotSpellCount(
    params.selectedClass,
    params.className,
    level,
    params.ruleCatalog,
    params.spellPools
  );
  const selectedSlotSpellIds = getSelectedStartingSlotSpellIds(params.startingSpells);
  const isDynamicPreparedCaster = usesDynamicPreparedSpellPool(
    params.className,
    level,
    params.ruleCatalog,
    params.spellPools
  );
  const reviewCounts = buildStartingSpellReviewCounts({
    startingSpells: params.startingSpells,
    usePreparedSpells: isDynamicPreparedCaster,
  });
  const preparedSpellOptions = buildStartingPreparedSpellOptions({
    isDynamicPreparedCaster,
    detailedSlotSpellOptions: slotSpellGridOptions,
    selectedSlotSpellIds,
    slotSpellOptions,
    ruleCatalog: params.ruleCatalog,
    spellCatalogById: params.spellCatalogById,
  });
  const preparedSpellLimit = resolveStartingPreparedSpellLimit({
    className: params.className,
    level: params.level,
    abilities: params.abilities,
    preparedSpellOptionCount: preparedSpellOptions.length,
  });
  const sectionState = buildStartingSpellSectionState({
    cantripCount,
    slotSpellCount,
    preparedSpellLimit,
    preparedSpellOptionCount: preparedSpellOptions.length,
    classKey: params.classKey,
  });

  return {
    cantripOptions,
    cantripGridOptions,
    cantripCount,
    selectedCantripIds: getSelectedStartingCantripIds(params.startingSpells),
    slotSpellOptions,
    slotSpellGridOptions,
    slotSpellCount,
    selectedSlotSpellIds,
    selectedPreparedSpellIds: getSelectedStartingPreparedSpellIds(params.startingSpells),
    isDynamicPreparedCaster,
    preparedSpellOptions,
    preparedSpellLimit,
    reviewCounts,
    sectionState,
  };
}

export function buildCharacterSpellDisplayModel(params: {
  cantripIds: string[];
  knownSpellIds: string[];
  preparedSpellIds: string[];
  isWizard?: boolean;
  ruleCatalog: RuleCatalogReferenceDto[];
  spellCatalogById: Map<string, StaticSpellCatalogEntry>;
}): CharacterSpellDisplayModel {
  const cantripIds = params.cantripIds.filter((spellId) => spellId.trim().length > 0);
  const knownSpellIds = params.knownSpellIds.filter((spellId) => spellId.trim().length > 0);
  const preparedSpellIds = params.preparedSpellIds.filter(
    (spellId) => spellId.trim().length > 0
  );
  const cantripOptions = buildSpellDisplayOptions(
    cantripIds,
    params.ruleCatalog,
    params.spellCatalogById
  );
  const knownSpellOptions = buildSpellDisplayOptions(
    knownSpellIds,
    params.ruleCatalog,
    params.spellCatalogById
  );
  const preparedSpellOptions = buildSpellDisplayOptions(
    preparedSpellIds,
    params.ruleCatalog,
    params.spellCatalogById
  );
  const knownSpellTitle = params.isWizard ? '주문책 / 저장 주문' : '알고 있는 주문';
  const summaryGroups = ([
    {
      key: 'cantrips',
      title: '캔트립',
      count: cantripIds.length,
      options: cantripOptions,
    },
    {
      key: 'known',
      title: knownSpellTitle,
      count: knownSpellIds.length,
      options: knownSpellOptions,
    },
    {
      key: 'prepared',
      title: '준비 주문',
      count: preparedSpellIds.length,
      options: preparedSpellOptions,
      isPrepared: true,
    },
  ] satisfies CharacterSpellSummaryGroup[]).filter((group) => group.count > 0);

  return {
    cantripIds,
    knownSpellIds,
    preparedSpellIds,
    cantripOptions,
    knownSpellOptions,
    preparedSpellOptions,
    summaryGroups,
    hasAnySpells:
      cantripIds.length > 0 || knownSpellIds.length > 0 || preparedSpellIds.length > 0,
  };
}

export function buildCharacterLevelUpSpellSelectionModel(params: {
  className: string | null | undefined;
  targetLevel: number;
  knownSlotSpellIds: string[];
  currentCantripIds: string[];
  draftKnownSpellIds: string[];
  canSelectKnownSpellGrowth: boolean;
  canSelectCantripGrowth: boolean;
  isPreparedCaster: boolean;
  ruleCatalog: RuleCatalogReferenceDto[];
  spellCatalogById: Map<string, StaticSpellCatalogEntry>;
  spellPools: StaticFeSpellPools | null;
}): CharacterLevelUpSpellSelectionModel {
  const learnableSlotSpells = params.canSelectKnownSpellGrowth
    ? getImplementedSpellOptions(
        params.className,
        'slot',
        params.targetLevel,
        params.ruleCatalog,
        params.spellCatalogById,
        params.spellPools
      ).filter((spell) => !params.knownSlotSpellIds.includes(spell.id))
    : [];
  const learnableCantrips = params.canSelectCantripGrowth
    ? getImplementedSpellOptions(
        params.className,
        'cantrip',
        params.targetLevel,
        params.ruleCatalog,
        params.spellCatalogById,
        params.spellPools
      ).filter((spell) => !params.currentCantripIds.includes(spell.id))
    : [];
  const preparedCandidateSlotSpellIds = params.isPreparedCaster
    ? Array.from(new Set([...params.knownSlotSpellIds, ...params.draftKnownSpellIds]))
    : [];

  return {
    learnableSlotSpells,
    learnableSlotSpellOptions: attachSpellDetails(
      learnableSlotSpells,
      params.ruleCatalog,
      params.spellCatalogById
    ),
    forgottenSlotSpellOptions: buildSpellDisplayOptions(
      params.knownSlotSpellIds,
      params.ruleCatalog,
      params.spellCatalogById
    ),
    learnableCantrips,
    learnableCantripOptions: attachSpellDetails(
      learnableCantrips,
      params.ruleCatalog,
      params.spellCatalogById
    ),
    forgottenCantripOptions: buildSpellDisplayOptions(
      params.currentCantripIds,
      params.ruleCatalog,
      params.spellCatalogById
    ),
    preparedCandidateSlotSpellIds,
    preparedSpellOptions: buildSpellDisplayOptions(
      preparedCandidateSlotSpellIds,
      params.ruleCatalog,
      params.spellCatalogById
    ),
  };
}

export function resolveStartingCantripCount(
  klass: ClassDefinitionResponseDto | null | undefined,
  className: string | null | undefined,
  level: number,
  ruleCatalog: RuleCatalogReferenceDto[] = []
) {
  if (!klass) return 0;
  return resolveCharacterSpellSelectionRequirements({
    classKey: className,
    level,
    executableSpellPools: {
      cantrips: getImplementedSpellOptions(className, 'cantrip', level, ruleCatalog).map((spell) => spell.id),
    },
  }).cantripCount;
}

export function getDefaultQuickCreateStartingSpells(
  klass: ClassDefinitionResponseDto,
  level: number,
  abilities: Partial<Record<CharacterAbilityKey, number>>,
  ruleCatalog: RuleCatalogReferenceDto[],
  spellPools: StaticFeSpellPools | null
) {
  const classKey = normalizeSrdCharacterClassKey(klass.key);
  const maxSlotSpellLevel = resolveMaximumCastableSpellLevel(classKey, level);
  const catalogCantrips = getQuickCreateCatalogSpellIds(ruleCatalog, 'cantrip', 0);
  const catalogSlotSpells = getQuickCreateCatalogSpellIds(ruleCatalog, 'slot', maxSlotSpellLevel);
  const cantripPool = catalogCantrips.length
    ? catalogCantrips
    : (spellPools?.quickCreate.cantrips ?? []);
  const slotSpellPool = catalogSlotSpells.length
    ? catalogSlotSpells
    : getQuickCreateFallbackSlotSpellIds(classKey, level, spellPools);
  const requirements = resolveCharacterSpellSelectionRequirements({
    classKey,
    level,
    abilities,
    executableSpellPools: {
      cantrips: cantripPool,
      slotSpells: slotSpellPool,
    },
  });
  const preparedSpellLimit = maxSlotSpellLevel > 0
    ? requirements.preparedSpellCount
    : null;
  const usesDynamicPreparedPool = requirements.usesDynamicPreparedPool;
  const cantripCount = requirements.cantripCount;
  const slotSpellCount = requirements.knownOrSpellbookSpellCount;
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

function toFallbackSpellOptions(
  spellIds: string[],
  spellCatalogById: Map<string, StaticSpellCatalogEntry> | undefined,
  fallbackLevel: number
): ImplementedSpellOption[] {
  return spellIds.map((spellId) => {
    const catalogEntry = spellCatalogById?.get(spellId);
    return {
      id: spellId,
      label: getSpellDisplayLabel({
        spellId,
        catalogEntry,
      }),
      level: catalogEntry?.level ?? fallbackLevel,
    };
  });
}

function hasSrdSpellcastingProgression(classKey: string) {
  return Boolean(getSrdClassDefinition(classKey)?.spellcastingProgression?.length);
}

function shouldOfferCantripOptions(classKey: string, level: number) {
  return resolveCharacterSpellSelectionRequirements({
    classKey,
    level,
  }).cantripCount > 0;
}

function getCatalogSpellOptions(
  ruleCatalog: RuleCatalogReferenceDto[],
  kind: 'cantrip' | 'slot',
  maxSpellLevel: number,
  spellCatalogById?: Map<string, StaticSpellCatalogEntry>
): ImplementedSpellOption[] {
  if (!ruleCatalog.length) return [];
  const normalizedMaxSpellLevel =
    kind === 'slot' ? Math.max(0, Math.min(9, Math.floor(maxSpellLevel))) : 0;
  return ruleCatalog
    .filter((entry) => entry.kind === 'spell_definitions' && entry.executable)
    .map((entry) => ({
      id: entry.id,
      label: getSpellDisplayLabel({
        spellId: entry.id,
        label: entry.label,
        catalogEntry: spellCatalogById?.get(entry.id),
      }),
      level: getCatalogSpellLevel(entry),
    }))
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
      return left.label.localeCompare(right.label);
    });
}

function getQuickCreateCatalogSpellIds(
  ruleCatalog: RuleCatalogReferenceDto[],
  kind: 'cantrip' | 'slot',
  maxSpellLevel: number
) {
  if (!ruleCatalog.length) return [];
  const normalizedMaxSpellLevel = Math.max(0, Math.min(9, Math.floor(maxSpellLevel)));
  return ruleCatalog
    .filter((entry) => entry.kind === 'spell_definitions' && entry.executable)
    .map((entry) => ({ id: entry.id, level: getCatalogSpellLevel(entry) }))
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

function getQuickCreateFallbackSlotSpellIds(
  classKey: string,
  level: number,
  spellPools: StaticFeSpellPools | null
) {
  if (resolveMaximumCastableSpellLevel(classKey, level) <= 0) {
    return [];
  }
  const quickCreatePools = spellPools?.quickCreate;
  const level5Spells = level >= 5
    ? (quickCreatePools?.level5SlotSpellsByClass[classKey] ?? [])
    : [];
  const level7Spells = level >= 7
    ? (quickCreatePools?.level7SlotSpellsByClass[classKey] ?? [])
    : [];
  return Array.from(
    new Set([
      ...level7Spells,
      ...level5Spells,
      ...(quickCreatePools?.level1SlotSpells ?? []),
    ])
  );
}

function getCatalogSpellLevel(entry: RuleCatalogReferenceDto): number | null {
  if (typeof entry.spellLevel === 'number') return entry.spellLevel;
  const tag = entry.runtimeTags?.find((item) => item.startsWith('spell_level:'));
  if (!tag) return null;
  const level = Number(tag.slice('spell_level:'.length));
  return Number.isInteger(level) ? level : null;
}

function formatSpellLevelLabel(level: number | null | undefined) {
  if (level === 0) return '캔트립';
  if (typeof level === 'number') return `${level}레벨`;
  return null;
}

function formatTargetingType(targetingType: string) {
  const labels: Record<string, string> = {
    self: '대상 자신',
    creature: '대상 크리처',
    area: '범위 효과',
    point: '지점 지정',
    none: '대상 없음',
  };
  return labels[targetingType] ?? `대상 ${targetingType}`;
}

function normalizeRuntimeTagsForDisplay(tags: string[]) {
  return tags
    .filter((tag) => !tag.startsWith('spell_level:'))
    .map((tag) => tag.replace(/_/g, ' '))
    .slice(0, 8);
}

function buildRuntimeTagSummary(tags: string[]) {
  const usefulTags = normalizeRuntimeTagsForDisplay(tags).slice(0, 5);
  if (!usefulTags.length) {
    return '상세 설명이 준비되지 않은 주문입니다. 카드의 레벨, 거리, 태그를 기준으로 선택하세요.';
  }
  return `주요 효과: ${usefulTags.join(', ')}`;
}
