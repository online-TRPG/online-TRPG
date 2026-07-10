import type { RaceResponseDto } from '@trpg/shared-types';
import type { RaceAbilityBonus, RaceData } from '../../services/staticSrd';
import type { CharacterPayload } from '../../hooks/useSession';
import {
  abilityDisplayLabels,
  abilityKeys,
  clampAbilitiesToPointBuyRange,
  type AbilityKey,
} from './characterBuildRules';
import { replaceFeatureTags } from './characterFeatureChoices';

export type CharacterCreateRaceChoiceState = {
  baseRaceOptions: RaceResponseDto[];
  selectedBaseRace: RaceResponseDto | null;
  subraceOptions: RaceResponseDto[];
  selectedSubraceKey: string;
  isSubraceRequired: boolean;
};

export function getCharacterAncestryLabel(
  ancestry: string,
  ancestryLabelMap: Map<string, string>
) {
  const normalized = ancestry.trim();
  return ancestryLabelMap.get(normalized) ?? (normalized || '미정');
}

export function buildAncestryOptions(raceCatalog: RaceData[]) {
  return raceCatalog.map(({ value, label }) => ({ value, label }));
}

export function buildAncestryLabelMap(
  ancestryOptions: Array<{ value: string; label: string }>,
  races: RaceResponseDto[]
) {
  const map = new Map(ancestryOptions.map((option) => [option.value, option.label] as const));
  for (const race of races) {
    map.set(race.key, race.koName);
  }
  return map;
}

export function normalizeRaceLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
}

export function getCreateRaceFeatureAncestryKey(ancestry: string) {
  return ancestry.trim().toLowerCase().replace(/_/g, '-');
}

export function createZeroRaceAbilityIncreases(): RaceResponseDto['abilityIncreases'] {
  return {
    str: 0,
    dex: 0,
    con: 0,
    int: 0,
    wis: 0,
    cha: 0,
  };
}

export function findRaceByAncestryValue(
  races: RaceResponseDto[],
  ancestry: string | null | undefined
) {
  const normalized = (ancestry ?? '').trim().toLowerCase();
  if (!normalized) return null;
  return (
    races.find((race) => race.key === normalized) ??
    races.find((race) => race.koName === ancestry) ??
    null
  );
}

export function buildCreateRaceChoiceState(
  races: RaceResponseDto[],
  selectedRace: RaceResponseDto | null | undefined
): CharacterCreateRaceChoiceState {
  const baseRaceOptions = races.filter((race) => !race.parentRaceId);
  const selectedBaseRace =
    selectedRace && !selectedRace.parentRaceId
      ? selectedRace
      : (baseRaceOptions.find((race) => race.id === selectedRace?.parentRaceId) ?? null);
  const subraceOptions = selectedBaseRace
    ? races.filter((race) => race.parentRaceId === selectedBaseRace.id)
    : [];
  const selectedSubraceKey =
    selectedRace && selectedRace.parentRaceId === selectedBaseRace?.id ? selectedRace.key : '';

  return {
    baseRaceOptions,
    selectedBaseRace,
    subraceOptions,
    selectedSubraceKey,
    isSubraceRequired: subraceOptions.length > 0,
  };
}

export function applyRaceToCharacterFormState(
  current: CharacterPayload,
  races: RaceResponseDto[],
  nextAncestry: string
): CharacterPayload {
  const currentRace = findRaceByAncestryValue(races, current.ancestry);
  const nextRace = findRaceByAncestryValue(races, nextAncestry);
  const currentFinals = current.abilities ?? {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };
  const currentBonus = currentRace?.abilityIncreases ?? createZeroRaceAbilityIncreases();
  const nextBonus = nextRace?.abilityIncreases ?? createZeroRaceAbilityIncreases();
  const nextAbilities = {
    str: currentFinals.str - currentBonus.str + nextBonus.str,
    dex: currentFinals.dex - currentBonus.dex + nextBonus.dex,
    con: currentFinals.con - currentBonus.con + nextBonus.con,
    int: currentFinals.int - currentBonus.int + nextBonus.int,
    wis: currentFinals.wis - currentBonus.wis + nextBonus.wis,
    cha: currentFinals.cha - currentBonus.cha + nextBonus.cha,
  };

  return {
    ...current,
    ancestry: nextAncestry,
    features:
      nextAncestry.toLowerCase() === 'dragonborn'
        ? current.features
        : replaceFeatureTags(current.features, ['draconic_ancestry:'], []),
    abilities: clampAbilitiesToPointBuyRange(nextAbilities, nextBonus),
  };
}

export function getRaceByValue(raceCatalog: RaceData[], value: string): RaceData | null {
  const normalizedValue = normalizeRaceLookupValue(value);
  if (!normalizedValue) return null;
  return (
    raceCatalog.find((option) =>
      [
        option.value,
        option.label,
        option.id,
        option.id.includes('.') ? option.id.slice(option.id.lastIndexOf('.') + 1) : option.id,
        ...option.ancestryAliases,
      ].some((candidate) => normalizeRaceLookupValue(candidate) === normalizedValue)
    ) ?? null
  );
}

function getRaceLookupValueFromFeature(feature: string) {
  const normalized = feature.trim();
  const dotRaceMatch = /^race\.([^.]+)\.trait\./i.exec(normalized);
  if (dotRaceMatch?.[1]) return dotRaceMatch[1];

  const legacyRaceMatch = /^race\s+(.+?)\s+trait\s+/i.exec(normalized);
  if (legacyRaceMatch?.[1]) return legacyRaceMatch[1];

  return null;
}

export function getRaceByCharacterFeature(
  raceCatalog: RaceData[],
  features: string[] | undefined
) {
  for (const feature of features ?? []) {
    const raceLookupValue = getRaceLookupValueFromFeature(feature);
    if (!raceLookupValue) continue;

    const race = getRaceByValue(raceCatalog, raceLookupValue);
    if (race) return race;
  }

  return null;
}

function buildRaceAbilityBonusesFromIncreases(
  abilityIncreases: RaceResponseDto['abilityIncreases']
): RaceAbilityBonus[] {
  return abilityKeys
    .map((ability) => ({ ability, amount: abilityIncreases[ability] }))
    .filter(({ amount }) => amount !== 0);
}

export function buildSelectedRaceInfo(
  selectedRace: RaceResponseDto | null,
  staticRaceInfo: RaceData | null
): RaceData | null {
  if (!selectedRace) return staticRaceInfo;
  return {
    id: selectedRace.id,
    value: selectedRace.key,
    label: selectedRace.koName,
    ancestryAliases: [
      selectedRace.key,
      selectedRace.koName,
      staticRaceInfo?.id,
      staticRaceInfo?.value,
      staticRaceInfo?.label,
      ...(staticRaceInfo?.ancestryAliases ?? []),
    ].flatMap((alias) => alias ? [alias] : []),
    size: selectedRace.size,
    speed: selectedRace.baseSpeed,
    speedRaw: `${selectedRace.baseSpeed} ft.`,
    abilityScoreIncreaseRaw: buildRaceAbilityBonusesFromIncreases(selectedRace.abilityIncreases)
      .map(formatAbilityBonus)
      .join(', '),
    abilityBonuses: buildRaceAbilityBonusesFromIncreases(selectedRace.abilityIncreases),
    languages: selectedRace.languages,
    traitSummaries: staticRaceInfo?.traitSummaries ?? [],
    subraceTraitSummaries: staticRaceInfo?.subraceTraitSummaries ?? [],
  };
}

export function buildSelectedCreateRaceInfo(params: {
  raceCatalog: RaceData[];
  ancestry: string;
  selectedRace: RaceResponseDto | null;
  selectedBaseRace: RaceResponseDto | null;
}) {
  const staticRaceInfo =
    getRaceByValue(params.raceCatalog, params.ancestry) ??
    (params.selectedRace?.parentRaceId && params.selectedBaseRace
      ? getRaceByValue(params.raceCatalog, params.selectedBaseRace.key)
      : null);

  return buildSelectedRaceInfo(params.selectedRace, staticRaceInfo);
}

export function buildSelectedCharacterRaceInfo(params: {
  raceCatalog: RaceData[];
  ancestry?: string | null;
  features?: string[];
}) {
  if (!params.ancestry && !params.features?.length) return null;

  return (
    getRaceByValue(params.raceCatalog, params.ancestry ?? '') ??
    getRaceByCharacterFeature(params.raceCatalog, params.features)
  );
}

export function getRaceTraitSummariesForCharacter(
  raceInfo: RaceData | null,
  character: { ancestry?: string | null; features?: string[] } | null
) {
  if (!raceInfo) return [];

  const lookupValues = [
    character?.ancestry,
    ...(character?.features ?? []).map(getRaceLookupValueFromFeature),
  ]
    .flatMap((value) => value ? [value] : [])
    .map(normalizeRaceLookupValue);

  const matchingSubraceSummaries = raceInfo.subraceTraitSummaries
    .filter((subrace) =>
      subrace.aliases.some((alias) => lookupValues.includes(normalizeRaceLookupValue(alias)))
    )
    .flatMap((subrace) => subrace.traits);

  return [...raceInfo.traitSummaries, ...matchingSubraceSummaries];
}

export function formatAbilityBonus(abilityBonus: RaceAbilityBonus) {
  if (abilityBonus.ability === 'any') {
    return `자유 능력치 +${abilityBonus.amount}${abilityBonus.note ? ` (${abilityBonus.note})` : ''}`;
  }

  const abilityLabel = abilityDisplayLabels[abilityBonus.ability];
  return `${abilityLabel} +${abilityBonus.amount}${abilityBonus.note ? ` (${abilityBonus.note})` : ''}`;
}
