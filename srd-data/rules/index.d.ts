export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface SrdSpellcastingProgressionEntry {
  classLevel: number;
  cantripsKnown: number | null;
  spellsKnown: number | null;
  pactMagicSlots?: number | null;
  pactMagicSlotLevel?: number | null;
  spellSlotsByLevel?: Record<string, number>;
}

export interface SrdCharacterClassDefinition {
  id: string;
  nameKo?: string;
  nameEn?: string;
  startingCantripCount?: number;
  startingSpellCount?: number;
  spellcasting?: {
    ability?: string | null;
    formulaList?: string[];
    noteList?: string[];
  };
  spellcastingProgression?: SrdSpellcastingProgressionEntry[];
  featureReferences?: Array<{
    category?: string | null;
    availableAtLevels?: Array<string | number>;
  }>;
}

export interface CharacterRuleDataOptions {
  classes?: SrdCharacterClassDefinition[];
}

export interface PreparedSpellLimitInput extends CharacterRuleDataOptions {
  classKey?: string | null;
  className?: string | null;
  level?: number | null;
  abilities?: Partial<Record<AbilityKey, number>> | null;
}

export interface ExecutableSpellPools {
  cantrips?: string[];
  slotSpells?: string[];
  slotSpellsByLevel?: Record<string, string[]>;
  characterBuilder?: {
    cantrips?: string[];
    slotSpellsByLevel?: Record<string, string[]>;
  };
  quickCreate?: {
    cantrips?: string[];
    level1SlotSpells?: string[];
    level5SlotSpellsByClass?: Record<string, string[]>;
    level7SlotSpellsByClass?: Record<string, string[]>;
  };
}

export interface CharacterSpellSelectionRequirementInput extends PreparedSpellLimitInput {
  executableSpellPools?: ExecutableSpellPools | null;
}

export interface CharacterSpellSelectionRequirements {
  classKey: string;
  level: number;
  cantripCount: number;
  knownOrSpellbookSpellCount: number;
  preparedSpellCount: number | null;
  usesDynamicPreparedPool: boolean;
  spellcastingAbility: AbilityKey | null;
  maximumCastableSpellLevel: number;
}

export interface KnownSpellDeltaInput extends CharacterRuleDataOptions {
  classKey?: string | null;
  className?: string | null;
  currentLevel?: number | null;
  targetLevel?: number | null;
}

export interface KnownSpellDeltaResult {
  classKey: string;
  currentLevel: number;
  targetLevel: number;
  cantripDelta: number;
  knownSpellDelta: number;
  targetHasKnownSpellProgression: boolean;
  canReplaceKnownSpells: boolean;
  targetHasCantripProgression: boolean;
}

export function normalizeSrdCharacterClassKey(className: string | null | undefined): string;
export function normalizeSrdCharacterLevel(level: number | null | undefined): number;
export function getSrdClassDefinition(
  className: string | null | undefined,
  options?: CharacterRuleDataOptions,
): SrdCharacterClassDefinition | null;
export function getSrdClassSpellcastingProgression(
  className: string | null | undefined,
  level: number | null | undefined,
  options?: CharacterRuleDataOptions,
): SrdSpellcastingProgressionEntry | null;
export function getCantripsKnownLimit(
  className: string | null | undefined,
  level: number | null | undefined,
  options?: CharacterRuleDataOptions,
): number | null;
export function getKnownSpellsLimit(
  className: string | null | undefined,
  level: number | null | undefined,
  options?: CharacterRuleDataOptions,
): number | null;
export function resolveSubclassChoiceLevel(
  className: string | null | undefined,
  options?: CharacterRuleDataOptions,
): number | null;
export function resolveSpellcastingAbility(
  className: string | null | undefined,
  options?: CharacterRuleDataOptions,
): AbilityKey | null;
export function resolvePreparedSpellAbility(
  className: string | null | undefined,
  options?: CharacterRuleDataOptions,
): AbilityKey | null;
export function resolveAbilityModifier(score: number | null | undefined): number;
export function resolveAbilityScoreImprovementLevels(
  className: string | null | undefined,
): number[];
export function resolveAvailableAbilityScoreImprovementLevels(
  className: string | null | undefined,
  level: number | null | undefined,
): number[];
export function resolveCrossedAbilityScoreImprovementLevels(
  className: string | null | undefined,
  currentLevel: number | null | undefined,
  targetLevel: number | null | undefined,
): number[];
export function resolvePreparedSpellLimit(input: PreparedSpellLimitInput): number | null;
export function resolveWizardSpellbookSpellCount(level: number | null | undefined): number;
export function resolveMaximumCastableSpellLevel(
  className: string | null | undefined,
  level: number | null | undefined,
  options?: CharacterRuleDataOptions,
): number;
export function resolveSpellSlotLimit(
  className: string | null | undefined,
  level: number | null | undefined,
  slotLevel: number | null | undefined,
  options?: CharacterRuleDataOptions,
): number;
export function usesDynamicPreparedSpellPool(input: CharacterSpellSelectionRequirementInput): boolean;
export function resolveCharacterSpellSelectionRequirements(
  input: CharacterSpellSelectionRequirementInput,
): CharacterSpellSelectionRequirements;
export function resolveKnownSpellDelta(input: KnownSpellDeltaInput): KnownSpellDeltaResult;
