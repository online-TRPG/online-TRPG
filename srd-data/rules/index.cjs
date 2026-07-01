const classes = require("../generated/srd/classes.json");

// Keep behavior in sync with index.browser.mjs; verify:rule-data-sync compares entrypoint results.
const WIZARD_STARTING_SPELLBOOK_SPELL_COUNT = 6;
const WIZARD_SPELLBOOK_SPELLS_PER_LEVEL = 2;
const ABILITY_BY_ENGLISH_NAME = {
  strength: "str",
  "근력": "str",
  dexterity: "dex",
  "민첩": "dex",
  constitution: "con",
  "건강": "con",
  intelligence: "int",
  "지능": "int",
  wisdom: "wis",
  "지혜": "wis",
  charisma: "cha",
  "매력": "cha",
};
const PREPARED_SPELL_FORMULA_MARKERS = ["준비 주문 수", "prepared spell"];
const HALF_LEVEL_FORMULA_MARKERS = ["절반", "half"];
const STANDARD_ASI_LEVELS = [4, 8, 12, 16, 19];
const CLASS_ASI_LEVELS = {
  fighter: [6, 14],
  rogue: [10],
};

function normalizeSrdCharacterClassKey(className) {
  return String(className ?? "")
    .trim()
    .toLowerCase()
    .replace(/^class\./, "")
    .replace(/[\s-]+/g, "_");
}

function normalizeSrdCharacterLevel(level) {
  const parsed = Number(level ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function resolveClassDataSource(sourceClasses) {
  return Array.isArray(sourceClasses) ? sourceClasses : classes;
}

function getSrdClassDefinition(className, options = {}) {
  const classKey = normalizeSrdCharacterClassKey(className);
  return (
    resolveClassDataSource(options.classes).find((entry) => {
      const idKey = normalizeSrdCharacterClassKey(entry?.id);
      const nameKey = normalizeSrdCharacterClassKey(entry?.nameEn);
      return idKey === classKey || nameKey === classKey;
    }) ?? null
  );
}

function getSrdClassSpellcastingProgression(className, level, options = {}) {
  const classDefinition = getSrdClassDefinition(className, options);
  const normalizedLevel = normalizeSrdCharacterLevel(level);
  return (
    classDefinition?.spellcastingProgression?.find(
      (entry) => Number(entry.classLevel) === normalizedLevel,
    ) ?? null
  );
}

function getCantripsKnownLimit(className, level, options = {}) {
  return getSrdClassSpellcastingProgression(className, level, options)?.cantripsKnown ?? null;
}

function getKnownSpellsLimit(className, level, options = {}) {
  return getSrdClassSpellcastingProgression(className, level, options)?.spellsKnown ?? null;
}

function resolveSubclassChoiceLevel(className, options = {}) {
  const classDefinition = getSrdClassDefinition(className, options);
  const levels = (classDefinition?.featureReferences ?? [])
    .filter((reference) => reference?.category === "subclass")
    .flatMap((reference) => reference.availableAtLevels ?? [])
    .map((level) => Number(level))
    .filter((level) => Number.isInteger(level) && level >= 1 && level <= 20);
  return levels.length ? Math.min(...levels) : null;
}

function resolveSpellcastingAbility(className, options = {}) {
  const classDefinition = getSrdClassDefinition(className, options);
  const rawAbility = String(classDefinition?.spellcasting?.ability ?? "")
    .trim()
    .toLowerCase();
  return ABILITY_BY_ENGLISH_NAME[rawAbility] ?? null;
}

function resolvePreparedSpellFormula(className, options = {}) {
  const classDefinition = getSrdClassDefinition(className, options);
  return (
    classDefinition?.spellcasting?.formulaList?.find((formula) =>
      PREPARED_SPELL_FORMULA_MARKERS.some((marker) =>
        String(formula).toLowerCase().includes(marker),
      ),
    ) ?? null
  );
}

function resolvePreparedSpellAbility(className, options = {}) {
  const classKey = normalizeSrdCharacterClassKey(className);
  if (!resolvePreparedSpellFormula(classKey, options)) return null;
  return resolveSpellcastingAbility(classKey, options);
}

function resolveAbilityModifier(score) {
  return Math.floor(((score ?? 10) - 10) / 2);
}

function resolvePreparedSpellLimit(input) {
  const classKey = normalizeSrdCharacterClassKey(input?.classKey ?? input?.className);
  const abilityKey = resolvePreparedSpellAbility(classKey, input);
  if (!abilityKey) return null;
  const level = normalizeSrdCharacterLevel(input?.level);
  const progression = getSrdClassSpellcastingProgression(classKey, level, input);
  if (!progression || resolveMaximumCastableSpellLevel(classKey, level, input) < 1) return null;
  const abilityModifier = resolveAbilityModifier(input?.abilities?.[abilityKey]);
  const preparedSpellFormula = String(resolvePreparedSpellFormula(classKey, input) ?? "").toLowerCase();
  const levelBase = HALF_LEVEL_FORMULA_MARKERS.some((marker) => preparedSpellFormula.includes(marker))
    ? Math.floor(level / 2)
    : level;
  return Math.max(1, levelBase + abilityModifier);
}

function resolveWizardSpellbookSpellCount(level) {
  const normalizedLevel = normalizeSrdCharacterLevel(level);
  return WIZARD_STARTING_SPELLBOOK_SPELL_COUNT +
    (normalizedLevel - 1) * WIZARD_SPELLBOOK_SPELLS_PER_LEVEL;
}

function resolveMaximumCastableSpellLevel(className, level, options = {}) {
  const progression = getSrdClassSpellcastingProgression(className, level, options);
  if (!progression) return 0;
  if (typeof progression.pactMagicSlotLevel === "number" && progression.pactMagicSlotLevel > 0) {
    return Math.max(0, Math.min(9, Math.floor(progression.pactMagicSlotLevel)));
  }
  const spellSlotsByLevel = progression.spellSlotsByLevel ?? {};
  return Object.entries(spellSlotsByLevel).reduce((maximum, [rawLevel, count]) => {
    const slotLevel = Number(rawLevel);
    return Number.isInteger(slotLevel) && slotLevel > maximum && Number(count) > 0
      ? slotLevel
      : maximum;
  }, 0);
}

function resolveSpellSlotLimit(className, level, slotLevel, options = {}) {
  const normalizedSlotLevel = Number(slotLevel);
  if (!Number.isInteger(normalizedSlotLevel) || normalizedSlotLevel < 1) return 0;
  const progression = getSrdClassSpellcastingProgression(className, level, options);
  if (!progression) return 0;
  if (
    typeof progression.pactMagicSlotLevel === "number" &&
    progression.pactMagicSlotLevel === normalizedSlotLevel
  ) {
    return progression.pactMagicSlots ?? 0;
  }
  return progression.spellSlotsByLevel?.[String(normalizedSlotLevel)] ?? 0;
}

function resolveAbilityScoreImprovementLevels(className) {
  const classKey = normalizeSrdCharacterClassKey(className);
  return Array.from(new Set([...STANDARD_ASI_LEVELS, ...(CLASS_ASI_LEVELS[classKey] ?? [])]))
    .sort((left, right) => left - right);
}

function resolveAvailableAbilityScoreImprovementLevels(className, level) {
  const normalizedLevel = normalizeSrdCharacterLevel(level);
  return resolveAbilityScoreImprovementLevels(className)
    .filter((asiLevel) => asiLevel <= normalizedLevel);
}

function resolveCrossedAbilityScoreImprovementLevels(className, currentLevel, targetLevel) {
  const normalizedCurrentLevel = normalizeSrdCharacterLevel(currentLevel);
  const normalizedTargetLevel = normalizeSrdCharacterLevel(targetLevel);
  return resolveAbilityScoreImprovementLevels(className)
    .filter((asiLevel) => asiLevel > normalizedCurrentLevel && asiLevel <= normalizedTargetLevel);
}

function countExecutableCantrips(executableSpellPools) {
  if (Array.isArray(executableSpellPools?.cantrips)) {
    return executableSpellPools.cantrips.length;
  }
  return null;
}

function countExecutableSlotSpells(classKey, level, executableSpellPools, maximumSpellLevel) {
  if (!executableSpellPools) return null;
  if (Array.isArray(executableSpellPools.slotSpells)) {
    return executableSpellPools.slotSpells.length;
  }
  if (executableSpellPools.slotSpellsByLevel && typeof executableSpellPools.slotSpellsByLevel === "object") {
    return Object.entries(executableSpellPools.slotSpellsByLevel)
      .filter(([rawLevel]) => Number(rawLevel) >= 1 && Number(rawLevel) <= maximumSpellLevel)
      .reduce((count, [, spellIds]) => count + (Array.isArray(spellIds) ? spellIds.length : 0), 0);
  }
  const characterBuilder = executableSpellPools.characterBuilder;
  if (characterBuilder?.slotSpellsByLevel) {
    return countExecutableSlotSpells(classKey, level, characterBuilder, maximumSpellLevel);
  }
  const quickCreate = executableSpellPools.quickCreate;
  if (quickCreate) {
    const normalizedLevel = normalizeSrdCharacterLevel(level);
    const byClass =
      normalizedLevel >= 7
        ? quickCreate.level7SlotSpellsByClass
        : normalizedLevel >= 5
          ? quickCreate.level5SlotSpellsByClass
          : null;
    if (byClass?.[classKey]) return byClass[classKey].length;
    if (Array.isArray(quickCreate.level1SlotSpells)) return quickCreate.level1SlotSpells.length;
  }
  return null;
}

function clampToAvailable(requiredCount, availableCount) {
  return availableCount === null ? requiredCount : Math.min(requiredCount, availableCount);
}

function usesDynamicPreparedSpellPool(input) {
  const classKey = normalizeSrdCharacterClassKey(input?.classKey ?? input?.className);
  if (!resolvePreparedSpellAbility(classKey, input) || classKey === "wizard") return false;
  const progression = getSrdClassSpellcastingProgression(classKey, input?.level, input);
  if (!progression) return false;
  const maximumSpellLevel = resolveMaximumCastableSpellLevel(classKey, input?.level, input);
  const executableSlotSpellCount = countExecutableSlotSpells(
    classKey,
    input?.level,
    input?.executableSpellPools,
    maximumSpellLevel,
  );
  return executableSlotSpellCount === null ? true : executableSlotSpellCount > 0;
}

function resolveCharacterSpellSelectionRequirements(input) {
  const classKey = normalizeSrdCharacterClassKey(input?.classKey ?? input?.className);
  const level = normalizeSrdCharacterLevel(input?.level);
  const classDefinition = getSrdClassDefinition(classKey, input);
  const progression = getSrdClassSpellcastingProgression(classKey, level, input);
  const maximumCastableSpellLevel = resolveMaximumCastableSpellLevel(classKey, level, input);
  const executableCantripCount = countExecutableCantrips(input?.executableSpellPools);
  const executableSlotSpellCount = countExecutableSlotSpells(
    classKey,
    level,
    input?.executableSpellPools,
    maximumCastableSpellLevel,
  );
  const cantripLimit =
    progression?.cantripsKnown ?? Number(classDefinition?.startingCantripCount ?? 0);
  const dynamicPreparedPool = usesDynamicPreparedSpellPool(input);
  let knownOrSpellbookSpellCount = 0;

  if (!dynamicPreparedPool) {
    if (typeof progression?.spellsKnown === "number") {
      knownOrSpellbookSpellCount = progression.spellsKnown;
    } else if (classKey === "wizard" && progression) {
      knownOrSpellbookSpellCount = resolveWizardSpellbookSpellCount(level);
    } else {
      knownOrSpellbookSpellCount = Number(classDefinition?.startingSpellCount ?? 0);
    }
  }
  const effectiveKnownOrSpellbookSpellCount = clampToAvailable(
    knownOrSpellbookSpellCount,
    executableSlotSpellCount,
  );
  const rawPreparedSpellCount = resolvePreparedSpellLimit(input);
  const preparedSpellPoolCount = dynamicPreparedPool
    ? executableSlotSpellCount
    : effectiveKnownOrSpellbookSpellCount;

  return {
    classKey,
    level,
    cantripCount: clampToAvailable(Number(cantripLimit ?? 0), executableCantripCount),
    knownOrSpellbookSpellCount: effectiveKnownOrSpellbookSpellCount,
    preparedSpellCount: rawPreparedSpellCount === null
      ? null
      : clampToAvailable(rawPreparedSpellCount, preparedSpellPoolCount),
    usesDynamicPreparedPool: dynamicPreparedPool,
    spellcastingAbility: resolveSpellcastingAbility(classKey, input),
    maximumCastableSpellLevel,
  };
}

function resolveKnownSpellDelta(input) {
  const classKey = normalizeSrdCharacterClassKey(input?.classKey ?? input?.className);
  const currentLevel = normalizeSrdCharacterLevel(input?.currentLevel);
  const targetLevel = normalizeSrdCharacterLevel(input?.targetLevel);
  const currentProgression = getSrdClassSpellcastingProgression(classKey, currentLevel, input);
  const targetProgression = getSrdClassSpellcastingProgression(classKey, targetLevel, input);
  const currentCantripLimit = currentProgression?.cantripsKnown ?? 0;
  const targetCantripLimit = targetProgression?.cantripsKnown ?? 0;
  const currentKnownSpellLimit = currentProgression?.spellsKnown ?? 0;
  const targetKnownSpellLimit = targetProgression?.spellsKnown ?? 0;
  const isWizard = classKey === "wizard";
  const wizardDelta = isWizard ? Math.max(0, targetLevel - currentLevel) * WIZARD_SPELLBOOK_SPELLS_PER_LEVEL : 0;
  const targetHasKnownSpellProgression = isWizard || typeof targetProgression?.spellsKnown === "number";

  return {
    classKey,
    currentLevel,
    targetLevel,
    cantripDelta: Math.max(0, targetCantripLimit - currentCantripLimit),
    knownSpellDelta: isWizard
      ? wizardDelta
      : Math.max(0, targetKnownSpellLimit - currentKnownSpellLimit),
    targetHasKnownSpellProgression,
    canReplaceKnownSpells: !isWizard && typeof targetProgression?.spellsKnown === "number",
    targetHasCantripProgression: typeof targetProgression?.cantripsKnown === "number",
  };
}

module.exports = {
  getCantripsKnownLimit,
  getKnownSpellsLimit,
  getSrdClassDefinition,
  getSrdClassSpellcastingProgression,
  normalizeSrdCharacterClassKey,
  normalizeSrdCharacterLevel,
  resolveAbilityModifier,
  resolveAbilityScoreImprovementLevels,
  resolveAvailableAbilityScoreImprovementLevels,
  resolveCharacterSpellSelectionRequirements,
  resolveCrossedAbilityScoreImprovementLevels,
  resolveKnownSpellDelta,
  resolveMaximumCastableSpellLevel,
  resolvePreparedSpellAbility,
  resolvePreparedSpellLimit,
  resolveSpellcastingAbility,
  resolveSpellSlotLimit,
  resolveSubclassChoiceLevel,
  resolveWizardSpellbookSpellCount,
  usesDynamicPreparedSpellPool,
};
