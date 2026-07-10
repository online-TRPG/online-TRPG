import type { SrdMonsterReferenceDto } from '@trpg/shared-types';
import {
  decodeArray,
  isRecord,
  isStringArray,
  readArray,
  readNumber,
  readRecord,
  readString,
} from '@trpg/shared-types/frontend';

export interface ClassOption {
  value: string;
  label: string;
  id: string;
  hitDie: number;
  hitDieRaw: string;
  primaryAbilitiesRaw: string;
  savingThrowsRaw: string;
  armorProficienciesRaw: string;
  weaponProficienciesRaw: string;
  toolProficienciesRaw: string;
  skillChoicesRaw: string;
  startingEquipment: string[];
  spellcastingAbility: string | null;
  spellcastingSummary: string[];
  subclassRaw: string | null;
  levelFeatureSummary: Array<{
    level: number;
    features: string;
  }>;
  featureReferences: ClassFeatureReference[];
  summary: string;
}

export type ClassOptionValue = ClassOption['value'];

export interface ClassFeatureReference {
  id: string;
  nameKo: string;
  category: 'class' | 'subclass' | string;
  availableAtLevels: number[];
  summaryKo: string;
  sourceHeading?: string | null;
}

export interface CanonicalClassFeatureEntry {
  id: string;
  classKey: string;
  level: number;
  nameKo: string;
  category: 'class' | 'subclass' | 'asi' | 'choice' | string;
  summaryKo: string;
  source: 'srd' | 'runtime' | 'derived' | string;
  aliases: string[];
  availableAtLevels: number[];
}

export interface RaceOption {
  value: string;
  label: string;
}

export interface RaceTraitSummary {
  name: string;
  summary: string;
  aliases?: string[];
}

export interface RaceSubraceTraitSummary {
  key: string;
  label: string;
  aliases: string[];
  traits: RaceTraitSummary[];
}

export interface RaceAbilityBonus {
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'any';
  amount: number;
  note?: string;
}

export interface RaceData extends RaceOption {
  id: string;
  ancestryAliases: string[];
  size: string;
  speed: number;
  speedRaw: string;
  abilityScoreIncreaseRaw: string;
  abilityBonuses: RaceAbilityBonus[];
  languages: string[];
  traitSummaries: RaceTraitSummary[];
  subraceTraitSummaries: RaceSubraceTraitSummary[];
}

interface RawClassEntry {
  id: string;
  nameKo: string;
  nameEn: string;
  hitDieRaw: string;
  primaryAbilitiesRaw: string;
  savingThrowsRaw: string;
  armorProficienciesRaw: string;
  weaponProficienciesRaw: string;
  toolProficienciesRaw: string;
  skillChoicesRaw: string;
  startingEquipment: string[];
  spellcasting?: {
    ability?: string | null;
    formulaList?: string[];
    noteList?: string[];
  };
  srdSubclassRaw?: string | null;
  levelFeatures?: Array<{
    level: string;
    features: string;
  }>;
  featureReferences?: Array<{
    id: string;
    nameKo: string;
    category: 'class' | 'subclass' | string;
    availableAtLevels?: Array<string | number>;
    summaryKo?: string | null;
    sourceHeading?: string | null;
  }>;
  summaryKo?: string;
}

interface RawRaceTraitEntry {
  nameKo: string;
  summaryKo: string;
}

interface RawRaceSubraceEntry {
  id: string;
  nameKo: string;
  abilityScoreIncreaseRaw: string;
}

interface RawRaceEntry {
  id: string;
  nameKo: string;
  nameEn: string;
  sizeRaw: string;
  speedRaw: string;
  abilityScoreIncreaseRaw: string;
  languagesRaw: string;
  subraces?: RawRaceSubraceEntry[];
  traits?: RawRaceTraitEntry[];
}

export interface StaticSpellCatalogEntry {
  id: string;
  nameEn: string;
  nameKo?: string | null;
  level: number;
  schoolKo: string;
  ritual: boolean;
  castingTime?: {
    raw?: string | null;
  } | null;
  range?: {
    raw?: string | null;
  } | null;
  components?: {
    raw?: string | null;
  } | null;
  duration?: {
    raw?: string | null;
  } | null;
  concentration?: boolean | null;
  playReference: string;
  higherLevel?: string | null;
  scaling?: string | null;
}

export interface StaticItemCatalog {
  equipmentItems: StaticItemCatalogEntry[];
  magicItems: StaticItemCatalogEntry[];
}

export interface StaticItemCatalogEntry {
  id: string;
  nameKo: string;
  nameEn?: string | null;
  kind?: string | null;
  costRaw?: string | null;
  weightRaw?: string | null;
  equipmentCategory?: string | null;
  armorCategory?: string | null;
  weaponCategory?: string | null;
  damageRaw?: string | null;
  damageType?: string | null;
  rangeRaw?: string | null;
  propertiesRaw?: string | null;
  rarity?: string | null;
  requiresAttunement?: boolean | null;
  aliasesKo?: string[];
  sourceClassIds?: string[];
  sourceTable?: string | null;
}

export interface StaticFeSpellPools {
  characterBuilder: {
    cantrips: string[];
    slotSpellsByLevel: Record<string, string[]>;
  };
  quickCreate: {
    cantrips: string[];
    level1SlotSpells: string[];
    level5SlotSpellsByClass: Record<string, string[]>;
    level7SlotSpellsByClass: Record<string, string[]>;
  };
}

const RAW_ASSET_CACHE = new Map<string, Promise<unknown>>();
const SUPPORTED_CLASS_ORDER = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard',
] as const;
const CLASS_LABEL_MAP = new Map<string, string>([
  ['Barbarian', '바바리안'],
  ['Bard', '바드'],
  ['Cleric', '클레릭'],
  ['Druid', '드루이드'],
  ['Wizard', '위자드'],
  ['Monk', '몽크'],
  ['Paladin', '팔라딘'],
  ['Ranger', '레인저'],
  ['Rogue', '로그'],
  ['Sorcerer', '소서러'],
  ['Warlock', '워락'],
  ['Fighter', '파이터'],
]);
const LEGACY_CLASS_LABEL_MAP = new Map<string, string>([
  ['Archer', '레인저'],
  ['Warrior', '파이터'],
]);
const ABILITY_LABEL_TEXT_MAP = new Map<string, string>([
  ['Strength', '근력'],
  ['Dexterity', '민첩'],
  ['Constitution', '건강'],
  ['Intelligence', '지능'],
  ['Wisdom', '지혜'],
  ['Charisma', '매력'],
]);
const SRD_TERM_MAP = new Map<string, string>([
  ['School of Abjuration', '방호학파'],
  ['School of Conjuration', '소환학파'],
  ['School of Divination', '예지학파'],
  ['School of Enchantment', '매혹학파'],
  ['School of Evocation', '방출학파'],
  ['School of Illusion', '환영학파'],
  ['School of Necromancy', '사령학파'],
  ['School of Transmutation', '변환학파'],
  ['Evocation', '방출술'],
  ['Abjuration', '방호술'],
  ['Conjuration', '소환술'],
  ['Divination', '예지술'],
  ['Enchantment', '매혹술'],
  ['Illusion', '환영술'],
  ['Necromancy', '사령술'],
  ['Transmutation', '변환술'],
  ['Arcane Tradition', '비전 전통'],
  ...Array.from(ABILITY_LABEL_TEXT_MAP.entries()),
  ...Array.from(CLASS_LABEL_MAP.entries()),
  ...Array.from(LEGACY_CLASS_LABEL_MAP.entries()),
]);
const ABILITY_NAME_MAP = new Map<string, Exclude<RaceAbilityBonus['ability'], 'any'>>([
  ['strength', 'str'],
  ['dexterity', 'dex'],
  ['constitution', 'con'],
  ['intelligence', 'int'],
  ['wisdom', 'wis'],
  ['charisma', 'cha'],
]);
function getStaticAssetUrl(relativePath: string) {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBaseUrl}${relativePath}`;
}

async function fetchStaticAsset<T>(relativePath: string, decode: (value: unknown) => T): Promise<T> {
  let rawRequest = RAW_ASSET_CACHE.get(relativePath);
  if (!rawRequest) {
    rawRequest = fetch(getStaticAssetUrl(relativePath)).then(async (response) => {
      if (!response.ok) {
        throw new Error(`정적 SRD 파일을 불러오지 못했습니다. (${response.status})`);
      }
      const body: unknown = await response.json();
      return body;
    });
    RAW_ASSET_CACHE.set(relativePath, rawRequest);
  }

  const rawValue = await rawRequest;
  try {
    return decode(rawValue);
  } catch {
    throw new Error(`정적 SRD 파일 형식이 올바르지 않습니다. (${relativePath})`);
  }
}

export function normalizeClassValue(value: string): ClassOptionValue {
  if (value === 'Archer') return 'Ranger';
  if (value === 'Warrior') return 'Fighter';
  return value;
}

export function getClassLabel(value: string) {
  return CLASS_LABEL_MAP.get(value) ?? LEGACY_CLASS_LABEL_MAP.get(value) ?? value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function localizeSrdTermText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  return Array.from(SRD_TERM_MAP.entries())
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((current, [from, to]) => current.replace(new RegExp(escapeRegExp(from), 'g'), to), trimmed);
}

export function localizeAbilityText(value: string) {
  return localizeSrdTermText(value);
}

function extractHitDieValue(raw: string) {
  const matched = /d(\d+)/i.exec(raw.trim());
  return matched ? Number(matched[1]) : 0;
}

function buildClassSummary(entry: RawClassEntry) {
  const primaryAbilityText = localizeAbilityText(entry.primaryAbilitiesRaw);
  const spellcastingAbilityText = entry.spellcasting?.ability
    ? localizeAbilityText(entry.spellcasting.ability)
    : null;
  const subclassText = entry.srdSubclassRaw ? localizeSrdTermText(entry.srdSubclassRaw) : null;
  const parts = [
    `${entry.nameKo}는 ${primaryAbilityText} 중심 클래스입니다.`,
    spellcastingAbilityText
      ? `${spellcastingAbilityText}을 주문시전 능력치로 사용합니다.`
      : '주문시전 능력이 없는 클래스입니다.',
    subclassText ? `SRD 대표 서브클래스는 ${subclassText}입니다.` : null,
  ];

  return compactStrings(parts).join(' ');
}

function normalizeSrdSummary(name: string, summary: string) {
  const trimmed = summary.trim();
  if (name === '숨결 무기' && trimmed.endsWith('짧은 휴식 또는 긴 휴식을 마칠 때…')) {
    return `${trimmed.slice(0, -1)}까지 다시 사용할 수 없다.`;
  }
  return trimmed;
}

function normalizeClassOptions(entries: RawClassEntry[]): ClassOption[] {
  const indexed = new Map(entries.map((entry) => [entry.nameEn, entry]));

  return SUPPORTED_CLASS_ORDER.flatMap((className) => {
    const entry = indexed.get(className);
    return entry ? [entry] : [];
  })
    .map((entry) => ({
      value: normalizeClassValue(entry.nameEn),
      label: entry.nameKo,
      id: entry.id,
      hitDie: extractHitDieValue(entry.hitDieRaw),
      hitDieRaw: entry.hitDieRaw,
      primaryAbilitiesRaw: entry.primaryAbilitiesRaw,
      savingThrowsRaw: entry.savingThrowsRaw,
      armorProficienciesRaw: entry.armorProficienciesRaw,
      weaponProficienciesRaw: entry.weaponProficienciesRaw,
      toolProficienciesRaw: entry.toolProficienciesRaw,
      skillChoicesRaw: entry.skillChoicesRaw,
      startingEquipment: entry.startingEquipment ?? [],
      spellcastingAbility: entry.spellcasting?.ability ?? null,
      spellcastingSummary: [
        ...(entry.spellcasting?.formulaList ?? []),
        ...(entry.spellcasting?.noteList ?? []),
      ],
      subclassRaw: entry.srdSubclassRaw ?? null,
      levelFeatureSummary: (entry.levelFeatures ?? []).map((feature) => ({
        level: parseClassFeatureLevel(feature.level),
        features: feature.features,
      })),
      featureReferences: (entry.featureReferences ?? []).map((feature) => ({
        id: feature.id,
        nameKo: feature.nameKo,
        category: feature.category,
        availableAtLevels: (feature.availableAtLevels ?? [])
          .map((level) => Number.parseInt(String(level), 10))
          .filter((level) => Number.isInteger(level) && level >= 1 && level <= 20),
        summaryKo: normalizeSrdSummary(feature.nameKo, feature.summaryKo ?? ''),
        sourceHeading: feature.sourceHeading ?? null,
      })),
      summary: buildClassSummary(entry),
    }));
}

function parseClassFeatureLevel(value: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return 0;
  }
  const level = Number.parseInt(normalized, 10);
  return Number.isInteger(level) && level >= 1 && level <= 20 ? level : 0;
}

function parseSpeedValue(speedRaw: string) {
  const matched = /(\d+)/.exec(speedRaw);
  return matched ? Number(matched[1]) : 0;
}

function splitLanguages(raw: string) {
  return raw
    .split(',')
    .map((language) => language.trim())
    .flatMap((language) => compactStrings([language]));
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.flatMap((value) => typeof value === 'string' && value.length > 0 ? [value] : []);
}

function parseAbilityBonuses(raw: string, note?: string): RaceAbilityBonus[] {
  const normalizedRaw = raw.trim();
  if (!normalizedRaw) {
    return [];
  }

  const allMatch = /^All ability scores \+(\d+)$/i.exec(normalizedRaw);
  if (allMatch) {
    const amount = Number(allMatch[1]);
    return (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ability) => ({
      ability,
      amount,
    }));
  }

  return normalizedRaw
    .split(',')
    .map((part) => part.trim())
    .flatMap<RaceAbilityBonus>((part) => {
      const anyMatch = /^two other ability scores \+(\d+)$/i.exec(part);
      if (anyMatch) {
        return [
          {
            ability: 'any' as const,
            amount: Number(anyMatch[1]),
            note: '서로 다른 두 능력치 선택',
          },
        ];
      }

      const matched = /^([A-Za-z]+)\s*\+(\d+)$/i.exec(part);
      if (!matched) {
        return [];
      }

      const ability = ABILITY_NAME_MAP.get(matched[1].toLowerCase());
      if (!ability) {
        return [];
      }

      return [
        {
          ability,
          amount: Number(matched[2]),
          ...(note ? { note } : {}),
        },
      ];
    });
}

function findRaceTrait(traits: RawRaceTraitEntry[], name: string) {
  return traits.find((trait) => trait.nameKo === name)?.summaryKo ?? null;
}

function extractBaseTraits(traits: RawRaceTraitEntry[]) {
  const baseTraits: RawRaceTraitEntry[] = [];
  const seenNames = new Set<string>();

  for (const trait of traits) {
    const normalizedSummary = normalizeSrdSummary(trait.nameKo, trait.summaryKo);
    const markerIndex = normalizedSummary.indexOf('## ');
    const summary =
      markerIndex >= 0 ? normalizedSummary.slice(0, markerIndex).trim() : normalizedSummary.trim();
    if (!summary) {
      break;
    }

    if (seenNames.has(trait.nameKo)) {
      break;
    }

    baseTraits.push({ ...trait, summaryKo: summary });
    seenNames.add(trait.nameKo);

    if (markerIndex >= 0) {
      break;
    }
  }

  return baseTraits;
}

function normalizeSubraceKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^subrace\./, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');
}

function extractSubraceTraits(traits: RawRaceTraitEntry[]) {
  const seenNames = new Set<string>();

  for (let index = 0; index < traits.length; index += 1) {
    const trait = traits[index];
    const normalizedSummary = normalizeSrdSummary(trait.nameKo, trait.summaryKo);
    if (!normalizedSummary.trim()) {
      return traits.slice(index + 1);
    }

    if (seenNames.has(trait.nameKo)) {
      return traits.slice(index);
    }

    seenNames.add(trait.nameKo);

    if (normalizedSummary.includes('## ')) {
      return traits.slice(index + 1);
    }
  }

  return [];
}

function buildRaceTraitSummaries(entry: RawRaceEntry): RaceTraitSummary[] {
  const traits = extractBaseTraits(entry.traits ?? []);
  const summaries: RaceTraitSummary[] = [];
  const pushedNames = new Set<string>();

  const pushSummary = (name: string, summary: string | null) => {
    if (!summary || pushedNames.has(name)) {
      return;
    }
    summaries.push({ name, summary });
    pushedNames.add(name);
  };

  pushSummary('능력치 증가', findRaceTrait(traits, '능력치 증가') ?? entry.abilityScoreIncreaseRaw);
  pushSummary('이동속도', findRaceTrait(traits, '이동속도') ?? `기본 보행 이동속도는 ${entry.speedRaw}입니다.`);

  traits
    .filter(
      (trait) =>
        !['능력치 증가', '나이', '성향', '크기', '이동속도', '언어'].includes(trait.nameKo),
    )
    .slice(0, 2)
    .forEach((trait) => pushSummary(trait.nameKo, trait.summaryKo));

  if (summaries.length < 4) {
    if (entry.subraces?.length) {
      pushSummary('SRD 하위 종족', entry.subraces.map((subrace) => subrace.nameKo).join(', '));
    }
  }

  if (summaries.length < 4) {
    pushSummary('언어', findRaceTrait(traits, '언어') ?? entry.languagesRaw);
  }

  return summaries.slice(0, 4);
}

function buildSubraceTraitSummaries(entry: RawRaceEntry): RaceSubraceTraitSummary[] {
  const subraces = entry.subraces ?? [];
  if (!subraces.length) return [];

  const subraceTraits = extractSubraceTraits(entry.traits ?? []);
  if (!subraceTraits.length) return [];

  return subraces.map((subrace) => {
    const key = normalizeSubraceKey(subrace.id);
    const aliases = [
      key,
      subrace.id,
      subrace.id.includes('.') ? subrace.id.slice(subrace.id.lastIndexOf('.') + 1) : subrace.id,
      subrace.nameKo,
      'subrace_traits',
      'subrace traits',
    ];
    const traits = subraceTraits
      .map((trait) => ({
        name: trait.nameKo,
        summary: normalizeSrdSummary(trait.nameKo, trait.summaryKo),
      }))
      .filter((trait) => trait.summary.length > 0);

    return {
      key,
      label: `${subrace.nameKo} 특성`,
      aliases,
      traits: [
        {
          name: `${subrace.nameKo} 특성`,
          aliases,
          summary: traits.map((trait) => `${trait.name}: ${trait.summary}`).join(' · '),
        },
        ...traits,
      ],
    };
  });
}

function normalizeRaceData(entries: RawRaceEntry[]): RaceData[] {
  return entries.map((entry) => {
    const ancestryAliases = [
      entry.id,
      entry.id.includes('.') ? entry.id.slice(entry.id.lastIndexOf('.') + 1) : entry.id,
      entry.nameEn,
      entry.nameKo,
      ...(entry.subraces ?? []).flatMap((subrace) => [
        subrace.id,
        subrace.id.includes('.') ? subrace.id.slice(subrace.id.lastIndexOf('.') + 1) : subrace.id,
        subrace.nameKo,
      ]),
    ];

    return {
      id: entry.id,
      value: entry.nameEn,
      label: entry.nameKo,
      ancestryAliases,
      size: entry.sizeRaw,
      speed: parseSpeedValue(entry.speedRaw),
      speedRaw: entry.speedRaw,
      abilityScoreIncreaseRaw: entry.abilityScoreIncreaseRaw,
      abilityBonuses: parseAbilityBonuses(entry.abilityScoreIncreaseRaw),
      languages: splitLanguages(entry.languagesRaw),
      traitSummaries: buildRaceTraitSummaries(entry),
      subraceTraitSummaries: buildSubraceTraitSummaries(entry),
    };
  });
}

export async function loadClassOptions(): Promise<ClassOption[]> {
  const payload = await fetchStaticAsset<RawClassEntry[]>('srd/classes.json', decodeRawClassEntries);
  return normalizeClassOptions(payload);
}

export async function loadClassFeatureManifest(): Promise<CanonicalClassFeatureEntry[]> {
  return fetchStaticAsset<CanonicalClassFeatureEntry[]>('srd/class-features.json', decodeClassFeatureEntries);
}

export async function loadRaceData(): Promise<RaceData[]> {
  const payload = await fetchStaticAsset<RawRaceEntry[]>('srd/races.json', decodeRawRaceEntries);
  return normalizeRaceData(payload);
}

export async function loadMonsterCatalog(): Promise<SrdMonsterReferenceDto[]> {
  return fetchStaticAsset<SrdMonsterReferenceDto[]>('srd/monsters.json', decodeMonsterEntries);
}

export async function loadSpellCatalog(): Promise<StaticSpellCatalogEntry[]> {
  return fetchStaticAsset<StaticSpellCatalogEntry[]>('srd/spells.json', decodeSpellEntries);
}

export async function loadFeSpellPools(): Promise<StaticFeSpellPools> {
  return fetchStaticAsset<StaticFeSpellPools>('srd/fe-spell-pools.json', decodeFeSpellPools);
}

export async function loadItemCatalog(): Promise<StaticItemCatalog> {
  return fetchStaticAsset<StaticItemCatalog>('srd/items.json', decodeItemCatalog);
}

function decodeRawClassEntries(value: unknown): RawClassEntry[] {
  return decodeArray(value, decodeRawClassEntry, 'classes');
}

function readOptionalNullableString(record: Record<string, unknown>, key: string, label: string): string | null | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === 'string') {
    return value;
  }
  throw new Error(`${label} must be a string or null.`);
}

function readOptionalStringArray(record: Record<string, unknown>, key: string, label: string): string[] | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isStringArray(value)) {
    throw new Error(`${label} must be a string array.`);
  }
  return value;
}

function readStringArrayRecord(value: unknown, label: string): Record<string, string[]> {
  const record = readRecord(value, label);
  const result: Record<string, string[]> = {};
  for (const [key, entryValue] of Object.entries(record)) {
    if (!isStringArray(entryValue)) {
      throw new Error(`${label}.${key} must be a string array.`);
    }
    result[key] = entryValue;
  }
  return result;
}

function readOptionalBooleanOrNull(value: unknown, label: string): boolean | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  throw new Error(`${label} must be a boolean or null.`);
}

function readOptionalRawObject(value: unknown, label: string): { raw?: string | null } | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const record = readRecord(value, label);
  const raw = readOptionalNullableString(record, 'raw', `${label}.raw`);
  return raw === undefined ? {} : { raw };
}

function decodeMonsterSource(value: unknown): SrdMonsterReferenceDto['source'] {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const record = readRecord(value, 'monster.source');
  const file = readOptionalNullableString(record, 'file', 'monster.source.file');
  const page = readOptionalNullableString(record, 'page', 'monster.source.page');
  const heading = readOptionalNullableString(record, 'heading', 'monster.source.heading');
  return {
    ...(file !== undefined ? { file: file ?? undefined } : {}),
    ...(page !== undefined ? { page: page ?? undefined } : {}),
    ...(heading !== undefined ? { heading: heading ?? undefined } : {}),
  };
}

function decodeRawClassSpellcasting(value: unknown): NonNullable<RawClassEntry['spellcasting']> {
  const record = readRecord(value, 'class.spellcasting');
  const ability = readOptionalNullableString(record, 'ability', 'class.spellcasting.ability');
  const formulaList = readOptionalStringArray(record, 'formulaList', 'class.spellcasting.formulaList');
  const noteList = readOptionalStringArray(record, 'noteList', 'class.spellcasting.noteList');
  return {
    ...(ability !== undefined ? { ability } : {}),
    ...(formulaList ? { formulaList } : {}),
    ...(noteList ? { noteList } : {}),
  };
}

function decodeRawClassLevelFeatures(value: unknown): NonNullable<RawClassEntry['levelFeatures']> {
  return decodeArray(value, (entry) => {
    const record = readRecord(entry, 'class.levelFeature');
    return {
      level: readString(record, 'level', 'class.levelFeature.level'),
      features: readString(record, 'features', 'class.levelFeature.features'),
    };
  }, 'class.levelFeatures');
}

function decodeRawClassFeatureReferences(value: unknown): NonNullable<RawClassEntry['featureReferences']> {
  return decodeArray(value, (entry) => {
    const record = readRecord(entry, 'class.featureReference');
    const availableAtLevels = record.availableAtLevels;
    if (
      availableAtLevels !== undefined &&
      (!Array.isArray(availableAtLevels) ||
        !availableAtLevels.every((level) => {
          const parsedLevel = Number.parseInt(String(level), 10);
          return Number.isInteger(parsedLevel) && parsedLevel >= 1 && parsedLevel <= 20;
        }))
    ) {
      throw new Error('class.featureReference.availableAtLevels must contain class levels from 1 to 20.');
    }
    return {
      id: readString(record, 'id', 'class.featureReference.id'),
      nameKo: readString(record, 'nameKo', 'class.featureReference.nameKo'),
      category: readString(record, 'category', 'class.featureReference.category'),
      ...(availableAtLevels ? { availableAtLevels } : {}),
      summaryKo: readOptionalNullableString(record, 'summaryKo', 'class.featureReference.summaryKo'),
      sourceHeading: readOptionalNullableString(record, 'sourceHeading', 'class.featureReference.sourceHeading'),
    };
  }, 'class.featureReferences');
}

function decodeRawClassEntry(value: unknown): RawClassEntry {
  const record = readRecord(value, 'class');
  if (!isStringArray(record.startingEquipment)) {
    throw new Error('class.startingEquipment must be a string array.');
  }
  const spellcasting = record.spellcasting === undefined || record.spellcasting === null
    ? undefined
    : decodeRawClassSpellcasting(record.spellcasting);
  const levelFeatures = record.levelFeatures === undefined || record.levelFeatures === null
    ? undefined
    : decodeRawClassLevelFeatures(record.levelFeatures);
  const featureReferences = record.featureReferences === undefined || record.featureReferences === null
    ? undefined
    : decodeRawClassFeatureReferences(record.featureReferences);
  const srdSubclassRaw = readOptionalNullableString(record, 'srdSubclassRaw', 'class.srdSubclassRaw');
  const summaryKo = readOptionalNullableString(record, 'summaryKo', 'class.summaryKo');

  return {
    id: readString(record, 'id', 'class.id'),
    nameKo: readString(record, 'nameKo', 'class.nameKo'),
    nameEn: readString(record, 'nameEn', 'class.nameEn'),
    hitDieRaw: readString(record, 'hitDieRaw', 'class.hitDieRaw'),
    primaryAbilitiesRaw: readString(record, 'primaryAbilitiesRaw', 'class.primaryAbilitiesRaw'),
    savingThrowsRaw: readString(record, 'savingThrowsRaw', 'class.savingThrowsRaw'),
    armorProficienciesRaw: readString(record, 'armorProficienciesRaw', 'class.armorProficienciesRaw'),
    weaponProficienciesRaw: readString(record, 'weaponProficienciesRaw', 'class.weaponProficienciesRaw'),
    toolProficienciesRaw: readString(record, 'toolProficienciesRaw', 'class.toolProficienciesRaw'),
    skillChoicesRaw: readString(record, 'skillChoicesRaw', 'class.skillChoicesRaw'),
    startingEquipment: record.startingEquipment,
    ...(spellcasting ? { spellcasting } : {}),
    ...(srdSubclassRaw !== undefined ? { srdSubclassRaw } : {}),
    ...(levelFeatures ? { levelFeatures } : {}),
    ...(featureReferences ? { featureReferences } : {}),
    ...(summaryKo !== undefined ? { summaryKo: summaryKo ?? undefined } : {}),
  };
}

function decodeClassFeatureEntries(value: unknown): CanonicalClassFeatureEntry[] {
  return decodeArray(value, (entry) => {
    const record = readRecord(entry, 'classFeature');
    const aliases = readOptionalStringArray(record, 'aliases', 'classFeature.aliases') ?? [];
    const availableAtLevels = record.availableAtLevels;
    if (
      !Array.isArray(availableAtLevels) ||
      !availableAtLevels.every((level) => Number.isInteger(level) && level >= 1 && level <= 20)
    ) {
      throw new Error('classFeature.availableAtLevels must contain class levels from 1 to 20.');
    }
    const level = readNumber(record, 'level', 'classFeature.level');
    if (!Number.isInteger(level) || level < 1 || level > 20) {
      throw new Error('classFeature.level must be an integer from 1 to 20.');
    }
    return {
      id: readString(record, 'id', 'classFeature.id'),
      classKey: readString(record, 'classKey', 'classFeature.classKey'),
      level,
      nameKo: readString(record, 'nameKo', 'classFeature.nameKo'),
      category: readString(record, 'category', 'classFeature.category'),
      summaryKo: readString(record, 'summaryKo', 'classFeature.summaryKo'),
      source: readString(record, 'source', 'classFeature.source'),
      aliases,
      availableAtLevels,
    };
  }, 'classFeatures');
}

function decodeRawRaceEntries(value: unknown): RawRaceEntry[] {
  return decodeArray(value, (entry) => {
    const record = readRecord(entry, 'race');
    const traits = record.traits === undefined || record.traits === null
      ? undefined
      : readArray(record, 'traits', decodeRawRaceTraitEntry, 'race.traits');
    const subraces = record.subraces === undefined || record.subraces === null
      ? undefined
      : readArray(record, 'subraces', decodeRawRaceSubraceEntry, 'race.subraces');
    return {
      id: readString(record, 'id', 'race.id'),
      nameKo: readString(record, 'nameKo', 'race.nameKo'),
      nameEn: readString(record, 'nameEn', 'race.nameEn'),
      sizeRaw: readString(record, 'sizeRaw', 'race.sizeRaw'),
      speedRaw: readString(record, 'speedRaw', 'race.speedRaw'),
      abilityScoreIncreaseRaw: readString(record, 'abilityScoreIncreaseRaw', 'race.abilityScoreIncreaseRaw'),
      languagesRaw: readString(record, 'languagesRaw', 'race.languagesRaw'),
      ...(subraces ? { subraces } : {}),
      ...(traits ? { traits } : {}),
    };
  }, 'races');
}

function decodeRawRaceTraitEntry(value: unknown): RawRaceTraitEntry {
  const record = readRecord(value, 'raceTrait');
  return {
    nameKo: readString(record, 'nameKo', 'raceTrait.nameKo'),
    summaryKo: readString(record, 'summaryKo', 'raceTrait.summaryKo'),
  };
}

function decodeRawRaceSubraceEntry(value: unknown): RawRaceSubraceEntry {
  const record = readRecord(value, 'raceSubrace');
  return {
    id: readString(record, 'id', 'raceSubrace.id'),
    nameKo: readString(record, 'nameKo', 'raceSubrace.nameKo'),
    abilityScoreIncreaseRaw: readString(record, 'abilityScoreIncreaseRaw', 'raceSubrace.abilityScoreIncreaseRaw'),
  };
}

function decodeMonsterEntries(value: unknown): SrdMonsterReferenceDto[] {
  return decodeArray(value, (entry) => {
    const record = readRecord(entry, 'monster');
    const source = decodeMonsterSource(record.source);
    return {
      id: readString(record, 'id', 'monster.id'),
      nameEn: readString(record, 'nameEn', 'monster.nameEn'),
      nameKo: readOptionalNullableString(record, 'nameKo', 'monster.nameKo'),
      basicRaw: readString(record, 'basicRaw', 'monster.basicRaw'),
      armorClassRaw: readOptionalNullableString(record, 'armorClassRaw', 'monster.armorClassRaw'),
      hitPointsRaw: readOptionalNullableString(record, 'hitPointsRaw', 'monster.hitPointsRaw'),
      speedRaw: readOptionalNullableString(record, 'speedRaw', 'monster.speedRaw'),
      challengeRaw: readOptionalNullableString(record, 'challengeRaw', 'monster.challengeRaw'),
      sensesRaw: readOptionalNullableString(record, 'sensesRaw', 'monster.sensesRaw'),
      languagesRaw: readOptionalNullableString(record, 'languagesRaw', 'monster.languagesRaw'),
      traits: readOptionalStringArray(record, 'traits', 'monster.traits') ?? [],
      actions: readOptionalStringArray(record, 'actions', 'monster.actions') ?? [],
      legendaryActions: readOptionalStringArray(record, 'legendaryActions', 'monster.legendaryActions') ?? [],
      playReference: readOptionalNullableString(record, 'playReference', 'monster.playReference'),
      ...(source !== undefined ? { source } : {}),
    };
  }, 'monsters');
}

function decodeSpellEntries(value: unknown): StaticSpellCatalogEntry[] {
  return decodeArray(value, (entry) => {
    const record = readRecord(entry, 'spell');
    const ritual = record.ritual;
    if (typeof ritual !== 'boolean') {
      throw new Error('spell.ritual must be a boolean.');
    }
    return {
      id: readString(record, 'id', 'spell.id'),
      nameEn: readString(record, 'nameEn', 'spell.nameEn'),
      nameKo: readOptionalNullableString(record, 'nameKo', 'spell.nameKo'),
      level: readNumber(record, 'level', 'spell.level'),
      schoolKo: readString(record, 'schoolKo', 'spell.schoolKo'),
      ritual,
      castingTime: readOptionalRawObject(record.castingTime, 'spell.castingTime'),
      range: readOptionalRawObject(record.range, 'spell.range'),
      components: readOptionalRawObject(record.components, 'spell.components'),
      duration: readOptionalRawObject(record.duration, 'spell.duration'),
      concentration: readOptionalBooleanOrNull(record.concentration, 'spell.concentration'),
      playReference: readString(record, 'playReference', 'spell.playReference'),
      higherLevel: readOptionalNullableString(record, 'higherLevel', 'spell.higherLevel'),
      scaling: readOptionalNullableString(record, 'scaling', 'spell.scaling'),
    };
  }, 'spells');
}

function decodeFeSpellPools(value: unknown): StaticFeSpellPools {
  const record = readRecord(value, 'feSpellPools');
  const characterBuilder = readRecord(record.characterBuilder, 'feSpellPools.characterBuilder');
  const quickCreate = readRecord(record.quickCreate, 'feSpellPools.quickCreate');
  if (!isStringArray(characterBuilder.cantrips)) {
    throw new Error('feSpellPools.characterBuilder.cantrips must be a string array.');
  }
  if (!isRecord(characterBuilder.slotSpellsByLevel)) {
    throw new Error('feSpellPools.characterBuilder.slotSpellsByLevel must be an object.');
  }
  if (!isStringArray(quickCreate.cantrips) || !isStringArray(quickCreate.level1SlotSpells)) {
    throw new Error('feSpellPools.quickCreate spell lists must be string arrays.');
  }
  return {
    characterBuilder: {
      cantrips: characterBuilder.cantrips,
      slotSpellsByLevel: readStringArrayRecord(characterBuilder.slotSpellsByLevel, 'feSpellPools.characterBuilder.slotSpellsByLevel'),
    },
    quickCreate: {
      cantrips: quickCreate.cantrips,
      level1SlotSpells: quickCreate.level1SlotSpells,
      level5SlotSpellsByClass: readStringArrayRecord(quickCreate.level5SlotSpellsByClass, 'feSpellPools.quickCreate.level5SlotSpellsByClass'),
      level7SlotSpellsByClass: readStringArrayRecord(quickCreate.level7SlotSpellsByClass, 'feSpellPools.quickCreate.level7SlotSpellsByClass'),
    },
  };
}

function decodeItemCatalog(value: unknown): StaticItemCatalog {
  const record = readRecord(value, 'itemCatalog');
  if (!Array.isArray(record.equipmentItems) || !Array.isArray(record.magicItems)) {
    throw new Error('itemCatalog item groups must be arrays.');
  }
  return {
    equipmentItems: decodeArray(record.equipmentItems, decodeItemCatalogEntry, 'itemCatalog.equipmentItems'),
    magicItems: decodeArray(record.magicItems, decodeItemCatalogEntry, 'itemCatalog.magicItems'),
  };
}

function decodeItemCatalogEntry(value: unknown): StaticItemCatalogEntry {
  const record = readRecord(value, 'itemCatalog.item');
  const optionalString = (key: string) => readOptionalNullableString(record, key, `itemCatalog.item.${key}`);
  const nameEn = optionalString('nameEn');
  const kind = optionalString('kind');
  const costRaw = optionalString('costRaw');
  const weightRaw = optionalString('weightRaw');
  const equipmentCategory = optionalString('equipmentCategory');
  const armorCategory = optionalString('armorCategory');
  const weaponCategory = optionalString('weaponCategory');
  const damageRaw = optionalString('damageRaw');
  const damageType = optionalString('damageType');
  const rangeRaw = optionalString('rangeRaw');
  const propertiesRaw = optionalString('propertiesRaw');
  const rarity = optionalString('rarity');
  const aliasesKo = readOptionalStringArray(record, 'aliasesKo', 'itemCatalog.item.aliasesKo');
  const sourceClassIds = readOptionalStringArray(record, 'sourceClassIds', 'itemCatalog.item.sourceClassIds');
  const requiresAttunement = readOptionalBooleanOrNull(record.requiresAttunement, 'itemCatalog.item.requiresAttunement');
  const sourceTable = optionalString('sourceTable');

  return {
    id: readString(record, 'id', 'itemCatalog.item.id'),
    nameKo: readString(record, 'nameKo', 'itemCatalog.item.nameKo'),
    ...(nameEn !== undefined ? { nameEn } : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(costRaw !== undefined ? { costRaw } : {}),
    ...(weightRaw !== undefined ? { weightRaw } : {}),
    ...(equipmentCategory !== undefined ? { equipmentCategory } : {}),
    ...(armorCategory !== undefined ? { armorCategory } : {}),
    ...(weaponCategory !== undefined ? { weaponCategory } : {}),
    ...(damageRaw !== undefined ? { damageRaw } : {}),
    ...(damageType !== undefined ? { damageType } : {}),
    ...(rangeRaw !== undefined ? { rangeRaw } : {}),
    ...(propertiesRaw !== undefined ? { propertiesRaw } : {}),
    ...(rarity !== undefined ? { rarity } : {}),
    ...(requiresAttunement !== undefined ? { requiresAttunement } : {}),
    ...(aliasesKo ? { aliasesKo } : {}),
    ...(sourceClassIds ? { sourceClassIds } : {}),
    ...(sourceTable !== undefined ? { sourceTable } : {}),
  };
}
