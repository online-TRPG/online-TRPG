import type { SrdMonsterReferenceDto } from '@trpg/shared-types';

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
  summary: string;
}

export type ClassOptionValue = ClassOption['value'];

export interface RaceOption {
  value: string;
  label: string;
}

export interface RaceTraitSummary {
  name: string;
  summary: string;
}

export interface RaceAbilityBonus {
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'any';
  amount: number;
  note?: string;
}

export interface RaceData extends RaceOption {
  id: string;
  size: string;
  speed: number;
  speedRaw: string;
  abilityScoreIncreaseRaw: string;
  abilityBonuses: RaceAbilityBonus[];
  languages: string[];
  traitSummaries: RaceTraitSummary[];
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
  playReference: string;
  higherLevel?: string | null;
  scaling?: string | null;
}

export interface StaticItemCatalog {
  equipmentItems: Array<Record<string, unknown>>;
  magicItems: Array<Record<string, unknown>>;
}

const RAW_ASSET_CACHE = new Map<string, Promise<unknown>>();
const SUPPORTED_CLASS_ORDER = ['Wizard', 'Ranger', 'Rogue', 'Fighter'] as const;
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

async function fetchStaticAsset<T>(relativePath: string): Promise<T> {
  const cached = RAW_ASSET_CACHE.get(relativePath);
  if (cached) {
    return cached as Promise<T>;
  }

  const request = fetch(getStaticAssetUrl(relativePath)).then(async (response) => {
    if (!response.ok) {
      throw new Error(`정적 SRD 파일을 불러오지 못했습니다. (${response.status})`);
    }

    return (await response.json()) as T;
  });

  RAW_ASSET_CACHE.set(relativePath, request);
  return request;
}

export function normalizeClassValue(value: string): ClassOptionValue {
  if (value === 'Archer') return 'Ranger';
  if (value === 'Warrior') return 'Fighter';
  return value;
}

export function getClassLabel(value: string) {
  return CLASS_LABEL_MAP.get(value as ClassOptionValue) ?? LEGACY_CLASS_LABEL_MAP.get(value) ?? value;
}

function extractHitDieValue(raw: string) {
  const matched = /d(\d+)/i.exec(raw.trim());
  return matched ? Number(matched[1]) : 0;
}

function buildClassSummary(entry: RawClassEntry) {
  const parts = [
    `${entry.nameKo}는 ${entry.primaryAbilitiesRaw} 중심 클래스입니다.`,
    entry.spellcasting?.ability
      ? `${entry.spellcasting.ability}을 주문시전 능력치로 사용합니다.`
      : '주문시전 능력이 없는 클래스입니다.',
    entry.srdSubclassRaw ? `SRD 대표 서브클래스는 ${entry.srdSubclassRaw}입니다.` : null,
  ];

  return parts.filter(Boolean).join(' ');
}

function normalizeClassOptions(entries: RawClassEntry[]): ClassOption[] {
  const indexed = new Map(entries.map((entry) => [entry.nameEn, entry]));

  return SUPPORTED_CLASS_ORDER.map((className) => indexed.get(className))
    .filter((entry): entry is RawClassEntry => Boolean(entry))
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
        level: Number.parseInt(feature.level, 10) || 0,
        features: feature.features,
      })),
      summary: buildClassSummary(entry),
    }));
}

function parseSpeedValue(speedRaw: string) {
  const matched = /(\d+)/.exec(speedRaw);
  return matched ? Number(matched[1]) : 0;
}

function splitLanguages(raw: string) {
  return raw
    .split(',')
    .map((language) => language.trim())
    .filter(Boolean);
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
    const markerIndex = trait.summaryKo.indexOf('## ');
    const summary =
      markerIndex >= 0 ? trait.summaryKo.slice(0, markerIndex).trim() : trait.summaryKo.trim();
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

function normalizeRaceData(entries: RawRaceEntry[]): RaceData[] {
  return entries.map((entry) => {
    return {
      id: entry.id,
      value: entry.nameEn,
      label: entry.nameKo,
      size: entry.sizeRaw,
      speed: parseSpeedValue(entry.speedRaw),
      speedRaw: entry.speedRaw,
      abilityScoreIncreaseRaw: entry.abilityScoreIncreaseRaw,
      abilityBonuses: parseAbilityBonuses(entry.abilityScoreIncreaseRaw),
      languages: splitLanguages(entry.languagesRaw),
      traitSummaries: buildRaceTraitSummaries(entry),
    };
  });
}

export async function loadClassOptions(): Promise<ClassOption[]> {
  const payload = await fetchStaticAsset<RawClassEntry[]>('srd/classes.json');
  return normalizeClassOptions(payload);
}

export async function loadRaceData(): Promise<RaceData[]> {
  const payload = await fetchStaticAsset<RawRaceEntry[]>('srd/races.json');
  return normalizeRaceData(payload);
}

export async function loadMonsterCatalog(): Promise<SrdMonsterReferenceDto[]> {
  return fetchStaticAsset<SrdMonsterReferenceDto[]>('srd/monsters.json');
}

export async function loadSpellCatalog(): Promise<StaticSpellCatalogEntry[]> {
  return fetchStaticAsset<StaticSpellCatalogEntry[]>('srd/spells.json');
}

export async function loadItemCatalog(): Promise<StaticItemCatalog> {
  return fetchStaticAsset<StaticItemCatalog>('srd/items.json');
}
