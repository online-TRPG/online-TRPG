export type SrdJsonRecord = Record<string, unknown>;

export interface SrdClassFeatureReference {
  id: string;
  nameKo: string;
  category: 'class' | 'subclass' | string;
  availableAtLevels?: Array<string | number>;
  summaryKo?: string | null;
  sourceHeading?: string | null;
}

export interface SrdClassOption extends SrdJsonRecord {
  id: string;
  nameKo: string;
  nameEn: string;
  levelFeatures?: Array<{
    level: string;
    features: string;
  }>;
  featureReferences?: SrdClassFeatureReference[];
}

export interface SrdRaceOption extends SrdJsonRecord {
  id: string;
  nameKo: string;
  nameEn: string;
}

export interface SrdSpellOption extends SrdJsonRecord {
  id: string;
  nameKo?: string;
  nameEn?: string;
  level?: number;
}

export interface SrdMonsterOption extends SrdJsonRecord {
  id: string;
  nameKo?: string;
  nameEn?: string;
}

export interface SrdItemOption extends SrdJsonRecord {
  id: string;
  nameKo?: string;
  nameEn?: string;
}

export interface CanonicalClassFeature {
  id: string;
  classKey: string;
  level: number;
  nameKo: string;
  category: 'class' | 'subclass' | 'asi' | 'choice' | string;
  summaryKo: string;
  source: 'srd' | 'runtime' | 'derived';
  aliases: string[];
  availableAtLevels: number[];
}

export interface SrdCatalogFingerprint {
  schemaVersion: 'srd-catalog-fingerprint-v1';
  sha256: string;
  files: Array<{
    scope: 'srd' | 'srd-engine';
    path: string;
    sha256: string;
  }>;
}

export type CanonicalClassFeatureAliasMap =
  | Map<string, Map<string, string> | Record<string, string>>
  | Record<string, Record<string, string>>;

export interface BuildCanonicalClassFeatureManifestOptions {
  runtimeFeatureIds?: Iterable<string>;
  aliasesByClass?: CanonicalClassFeatureAliasMap | null;
}

export const SRD_LEGACY_ID_ALIASES: Readonly<{
  monster: Readonly<Record<string, string>>;
  spell: Readonly<Record<string, string>>;
  item: Readonly<Record<string, string>>;
  race: Readonly<Record<string, string>>;
}>;
export const SRD_CLASS_FEATURE_ID_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>>;

export function getGeneratedSrdDir(): string;
export function getGeneratedSrdEngineDir(): string;

export function normalizeSrdClassKey(className: string): string;
export function normalizeSrdFeatureLookupLabel(label: string): string;
export function normalizeSrdFeatureAliasKey(label: string): string;
export function splitSrdClassFeatureSummary(summary: string): string[];
export function isIgnoredSrdClassFeatureLabel(label: string): boolean;
export function resolveCanonicalSrdId(kind: 'monster' | 'spell' | 'item' | 'race' | string, id: string): string;
export function findSrdClassFeatureReference(
  classOption: SrdClassOption,
  label: string,
  level: number,
): SrdClassFeatureReference | null;
export function buildCanonicalClassFeatureManifest(
  classes: SrdClassOption[],
  options?: BuildCanonicalClassFeatureManifestOptions,
): CanonicalClassFeature[];
export function listCanonicalClassFeatures(
  options?: BuildCanonicalClassFeatureManifestOptions,
): Promise<CanonicalClassFeature[]>;

export function listSrdClasses(): Promise<SrdClassOption[]>;
export function listSrdRaces(): Promise<SrdRaceOption[]>;
export function listSrdSpells(): Promise<SrdSpellOption[]>;
export function listSrdMonsters(): Promise<SrdMonsterOption[]>;
export function listSrdEquipmentItems(): Promise<SrdItemOption[]>;
export function listSrdMagicItems(): Promise<SrdItemOption[]>;
export function getSrdSourceManifest(): Promise<SrdJsonRecord>;

export function listSrdEngineClasses(): Promise<SrdJsonRecord[]>;
export function listSrdEngineSpells(): Promise<SrdJsonRecord[]>;
export function listSrdEngineEquipment(): Promise<SrdJsonRecord[]>;
export function listSrdEngineMonsters(): Promise<SrdJsonRecord[]>;
export function getSrdEngineManifest(): Promise<SrdJsonRecord>;
export function getSrdCatalogFingerprint(): Promise<SrdCatalogFingerprint>;
