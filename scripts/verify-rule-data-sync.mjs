import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCanonicalClassFeatureManifest,
  findSrdClassFeatureReference,
  getSrdCatalogFingerprint,
  isIgnoredSrdClassFeatureLabel,
  listSrdClasses,
  listSrdEngineClasses,
  listSrdEngineEquipment,
  listSrdEngineMonsters,
  listSrdEngineSpells,
  listSrdEquipmentItems,
  listSrdMagicItems,
  listSrdMonsters,
  listSrdRaces,
  listSrdSpells,
  normalizeSrdClassKey,
  normalizeSrdFeatureAliasKey,
  normalizeSrdFeatureLookupLabel,
  resolveCanonicalSrdId,
  SRD_CLASS_FEATURE_ID_ALIASES,
  SRD_CATALOG_FINGERPRINT_FILES,
  splitSrdClassFeatureSummary,
} from '@trpg/srd-data';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const generatedSrdDir = path.join(repoRoot, 'srd-data', 'generated', 'srd');
const generatedEngineDir = path.join(repoRoot, 'srd-data', 'generated', 'srd-engine');
const fePublicSrdDir = path.join(repoRoot, 'fe', 'public', 'srd');

function fail(message, details = []) {
  const detailText = details.length
    ? `\n${details.map((detail) => `  - ${detail}`).join('\n')}`
    : '';
  throw new Error(`${message}${detailText}`);
}

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readJsonLines(relativePath) {
  const raw = await readText(relativePath);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildItemLabelMap(equipmentItems, magicItems) {
  return Object.fromEntries(
    [...equipmentItems, ...magicItems]
      .filter((item) => typeof item?.id === 'string')
      .map((item) => [
        item.id,
        String(item.nameKo ?? item.nameEn ?? item.id),
      ])
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId)),
  );
}

function parseFeaturePresentationIds(source) {
  const ids = new Set();
  const idRegex = /^\s{2}'([^']+)':\s*\{/gm;
  let match;
  while ((match = idRegex.exec(source)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

function parseBeClassFeatureIds(ruleCatalogSource) {
  const ids = new Set();
  const classFeatureRegex = /classFeature\("([^"]+)",\s*(\d+),\s*"([^"]+)"/g;
  let match;
  while ((match = classFeatureRegex.exec(ruleCatalogSource)) !== null) {
    const [, classKey, , featureKey] = match;
    ids.add(`class.${classKey}.feature.${featureKey}`);
  }

  for (const classKey of [
    'barbarian',
    'bard',
    'cleric',
    'druid',
    'fighter',
    'monk',
    'paladin',
    'ranger',
    'rogue',
    'sorcerer',
    'warlock',
    'wizard',
  ]) {
    ids.add(`class.${classKey}.feature.ability_score_improvement`);
    ids.add(`class.${classKey}.feature.ability_score_improvement_8`);
    ids.add(`class.${classKey}.feature.ability_score_improvement_12`);
    ids.add(`class.${classKey}.feature.ability_score_improvement_14`);
    ids.add(`class.${classKey}.feature.ability_score_improvement_16`);
    ids.add(`class.${classKey}.feature.ability_score_improvement_19`);
  }

  return ids;
}

function parseBeSubclassFeatureRows(ruleCatalogSource) {
  const rows = [];
  const subclassFeatureRegex =
    /subclassFeature\("([^"]+)",\s*"([^"]+)",\s*(\d+),\s*"([^"]+)"/g;
  let match;
  while ((match = subclassFeatureRegex.exec(ruleCatalogSource)) !== null) {
    const [, classKey, subclassKey, rawLevel, featureKey] = match;
    rows.push({
      id: `subclass.${classKey}.${subclassKey}.feature.${featureKey}`,
      legacyId: `class.${classKey}.subclass_feature.${featureKey}`,
      classKey,
      level: Number.parseInt(rawLevel, 10),
      featureKey,
    });
  }

  return rows;
}

const subclassFeatureReferenceAliases = {
  cleric: {
    divine_strike_2d8: '신성한_일격',
    domain_spells_level_9: '권역_주문',
  },
  druid: {
    circle_spells_level_5: '서클_주문',
    circle_spells_level_7: '서클_주문',
    circle_spells_level_9: '서클_주문',
  },
  paladin: {
    oath_spells_level_9: '맹세_주문',
  },
  warlock: {
    dark_ones_blessing: '어둠의_축복',
  },
};

function buildSubclassFeatureDisplayOverrides(classes, subclassFeatureRows) {
  const overrides = {};
  const referencesByClassLevel = new Map();
  const referencesByClassAlias = new Map();
  const rowsByClassLevel = new Map();

  for (const classOption of classes) {
    const classKey = normalizeSrdClassKey(classOption.nameEn ?? classOption.id);
    if (!classKey) continue;

    for (const reference of classOption.featureReferences ?? []) {
      if (reference.category !== 'subclass') continue;
      const levels = (reference.availableAtLevels ?? [])
        .map((level) => Number.parseInt(String(level), 10))
        .filter((level) => Number.isFinite(level));
      for (const level of levels) {
        const key = `${classKey}:${level}`;
        referencesByClassLevel.set(key, [...(referencesByClassLevel.get(key) ?? []), reference]);
      }
      referencesByClassAlias.set(
        `${classKey}:${String(reference.nameKo ?? '').replace(/\s+/g, '_')}`,
        reference,
      );
    }
  }

  for (const row of subclassFeatureRows) {
    const key = `${row.classKey}:${row.level}`;
    rowsByClassLevel.set(key, [...(rowsByClassLevel.get(key) ?? []), row]);
  }

  for (const [key, rows] of rowsByClassLevel.entries()) {
    const references = referencesByClassLevel.get(key) ?? [];

    rows.forEach((row, index) => {
      const referenceAlias = subclassFeatureReferenceAliases[row.classKey]?.[row.featureKey] ?? null;
      const aliasReference = referenceAlias
        ? referencesByClassAlias.get(`${row.classKey}:${referenceAlias}`) ?? null
        : null;
      const reference = aliasReference ?? references[index] ?? (rows.length === 1 ? references[0] : null);
      if (!reference) return;
      const override = {
        nameKo: reference.nameKo,
        summaryKo: reference.summaryKo ?? '',
      };
      overrides[row.id] = override;
      overrides[row.legacyId] = override;
    });
  }

  return overrides;
}

function parseBeRaceTraitKeys(ruleCatalogSource) {
  return new Set(
    Array.from(ruleCatalogSource.matchAll(/raceTrait\(\s*"([^"]+)",\s*"([^"]+)"/g), (match) => match[1]),
  );
}

function parseBeRaceParentKeys(ruleCatalogSource) {
  const matched = /const RACE_PARENT_KEYS:[\s\S]*?= \{([\s\S]*?)\};/.exec(ruleCatalogSource);
  if (!matched) return new Map();

  return new Map(
    Array.from(matched[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g), (match) => [match[1], match[2]]),
  );
}

function parseBeRaceTraitTags(ruleCatalogSource) {
  const traits = new Map();
  const regex = /raceTrait\(\s*"([^"]+)",\s*"([^"]+)",\s*\[([\s\S]*?)\]/g;
  let match;
  while ((match = regex.exec(ruleCatalogSource)) !== null) {
    const [, raceKey, traitKey, tagSource] = match;
    traits.set(`${raceKey}:${traitKey}`, {
      raceKey,
      traitKey,
      tags: Array.from(tagSource.matchAll(/"([^"]+)"/g), (tagMatch) => tagMatch[1]),
    });
  }
  return traits;
}

function parseStringArrayConst(source, constName) {
  const matched = new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const;`).exec(
    source,
  );
  if (!matched) return [];
  return Array.from(matched[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function parseSpellcastingProgressionClassKeys(source) {
  const matched = /export const SPELLCASTING_PROGRESSION[\s\S]*?= \{([\s\S]*?)\n\};/.exec(source);
  if (!matched) return new Set();
  return new Set(Array.from(matched[1].matchAll(/^\s{2}([a-z_]+):/gm), (match) => match[1]));
}

function parseImplementedSpellClassKeys(source) {
  const matched = /const implementedSpellClasses = new Set\(\[([\s\S]*?)\]\);/.exec(source);
  if (!matched) return new Set();
  return new Set(Array.from(matched[1].matchAll(/'([^']+)'/g), (match) => match[1]));
}

function parseFunctionWrappedIds(source, functionNames) {
  const names = functionNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(?:${names})\\(\\s*"([^"]+)"`, 'g');
  return Array.from(source.matchAll(regex), (match) => match[1]);
}

function parseSpellRuntimeDefinitions(source, sourceName) {
  const definitions = [];

  for (const match of source.matchAll(/spell\(\s*"(spell\.[^"]+)"\s*,\s*\{[\s\S]*?level:\s*(\d+)/g)) {
    definitions.push({ id: match[1], level: Number(match[2]), sourceName });
  }

  for (const match of source.matchAll(/p[345]Spell\(\s*"([^"]+)"\s*,\s*\{[\s\S]*?level:\s*(\d+)/g)) {
    definitions.push({ id: `spell.${match[1]}`, level: Number(match[2]), sourceName });
  }

  const p6SeedsMatch = /const P6_SPELL_SEEDS:[\s\S]*?= \[([\s\S]*?)\];/.exec(source);
  if (p6SeedsMatch) {
    for (const match of p6SeedsMatch[1].matchAll(/\["([^"]+)",\s*(\d+),\s*(?:true|false),\s*(?:true|false)\]/g)) {
      definitions.push({ id: `spell.${match[1]}`, level: Number(match[2]), sourceName });
    }
  }

  return definitions;
}

function parseMonsterDefinitionIds(source) {
  return Array.from(source.matchAll(/"((?:monster)\.[A-Za-z0-9_.-]+)"/g), (match) => match[1])
    .filter((id) => !id.includes('.ability.'));
}

function parseMonsterAbilityLinks(source) {
  const links = [];
  for (const match of source.matchAll(/monsterAbility\(\s*"([^"]+)"\s*,\s*\{[\s\S]*?monsterId:\s*"([^"]+)"/g)) {
    links.push({ abilityId: match[1], monsterId: match[2] });
  }
  for (const match of source.matchAll(/monsterId:\s*"([^"]+)"/g)) {
    links.push({ abilityId: null, monsterId: match[1] });
  }
  return links;
}

function parseSeedKeys(source, constName) {
  const matched = new RegExp(`const ${constName}:[\\s\\S]*?= \\[([\\s\\S]*?)\\];`).exec(source);
  if (!matched) return [];
  return Array.from(matched[1].matchAll(/key:\s*"([^"]+)"/g), (match) => match[1]);
}

function raceKeyFromSrdId(id) {
  return String(id ?? '')
    .replace(/^(race|subrace)\./, '')
    .replace(/_/g, '-');
}

function parseSpeedFeet(speedRaw) {
  const matched = String(speedRaw ?? '').match(/(\d+)/);
  return matched ? Number(matched[1]) : null;
}

function normalizeRaceSize(sizeRaw) {
  return String(sizeRaw ?? '').trim().toLowerCase();
}

function normalizeRaceLanguage(languageRaw) {
  return String(languageRaw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function parseRaceLanguages(languagesRaw) {
  return String(languagesRaw ?? '')
    .split(',')
    .map((language) => normalizeRaceLanguage(language))
    .filter(Boolean);
}

const abilityNameToKey = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

function parseRaceAbilityBonuses(raw) {
  const bonuses = [];
  for (const part of String(raw ?? '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const allMatch = /^All ability scores \+(\d+)$/i.exec(trimmed);
    if (allMatch) {
      for (const ability of Object.values(abilityNameToKey)) {
        bonuses.push({ ability, amount: Number(allMatch[1]) });
      }
      continue;
    }

    const choiceMatch = /^two other ability scores \+(\d+)$/i.exec(trimmed);
    if (choiceMatch) {
      bonuses.push({ ability: 'choice_two', amount: Number(choiceMatch[1]) });
      continue;
    }

    const matched = /^([A-Za-z]+)\s*\+(\d+)$/i.exec(trimmed);
    const ability = matched ? abilityNameToKey[matched[1].toLowerCase()] : null;
    if (ability) {
      bonuses.push({ ability, amount: Number(matched[2]) });
    }
  }
  return bonuses;
}

function raceTraitExpectedTagsFromSrd(races) {
  const expectedByRaceKey = new Map();
  for (const race of races) {
    const raceKey = raceKeyFromSrdId(race.id);
    const tags = [
      ...parseRaceAbilityBonuses(race.abilityScoreIncreaseRaw).map(
        ({ ability, amount }) => `fixed:ability:${ability}:+${amount}`,
      ),
      `fixed:size:${normalizeRaceSize(race.sizeRaw)}`,
      `fixed:speed:${parseSpeedFeet(race.speedRaw)}`,
      ...parseRaceLanguages(race.languagesRaw).map((language) =>
        language.startsWith('one_extra_language') ? 'language:choice:one' : `language:${language}`,
      ),
    ];
    expectedByRaceKey.set(raceKey, tags);

    for (const subrace of race.subraces ?? []) {
      const subraceKey = raceKeyFromSrdId(subrace.id);
      expectedByRaceKey.set(
        subraceKey,
        parseRaceAbilityBonuses(subrace.abilityScoreIncreaseRaw).map(
          ({ ability, amount }) => `fixed:ability:${ability}:+${amount}`,
        ),
      );
    }
  }
  return expectedByRaceKey;
}

function getMaximumSlotSpellLevelForClassLevel(classKey, level) {
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  if (['bard', 'cleric', 'druid', 'sorcerer', 'wizard'].includes(classKey)) {
    if (normalizedLevel >= 17) return 9;
    if (normalizedLevel >= 15) return 8;
    if (normalizedLevel >= 13) return 7;
    if (normalizedLevel >= 11) return 6;
    if (normalizedLevel >= 9) return 5;
    if (normalizedLevel >= 7) return 4;
    if (normalizedLevel >= 5) return 3;
    if (normalizedLevel >= 3) return 2;
    return 1;
  }
  if (classKey === 'warlock') {
    if (normalizedLevel >= 17) return 9;
    if (normalizedLevel >= 15) return 8;
    if (normalizedLevel >= 13) return 7;
    if (normalizedLevel >= 11) return 6;
    if (normalizedLevel >= 9) return 5;
    if (normalizedLevel >= 7) return 4;
    if (normalizedLevel >= 5) return 3;
    if (normalizedLevel >= 3) return 2;
    return 1;
  }
  if (classKey === 'paladin' || classKey === 'ranger') {
    if (normalizedLevel >= 17) return 5;
    if (normalizedLevel >= 13) return 4;
    if (normalizedLevel >= 9) return 3;
    if (normalizedLevel >= 5) return 2;
    if (normalizedLevel >= 2) return 1;
  }
  return 0;
}

const seedItemSrdIdAliases = {
  arrow: 'equipment.arrows_20',
  'arcane-focus': 'equipment.orb',
  bolt: 'equipment.crossbow_bolts_20',
  'burglar-pack': 'equipment.burglars_pack',
  'chain-mail': 'equipment.chain_mail',
  'component-pouch': 'equipment.component_pouch',
  dagger: 'equipment.dagger',
  dart: 'equipment.dart',
  'diplomat-pack': 'equipment.diplomats_pack',
  'druid-focus': 'equipment.sprig_of_mistletoe',
  'dungeoneer-pack': 'equipment.dungeoneers_pack',
  'entertainer-pack': 'equipment.entertainers_pack',
  'explorer-pack': 'equipment.explorers_pack',
  greataxe: 'equipment.greataxe',
  handaxe: 'equipment.handaxe',
  'holy-symbol': 'equipment.emblem',
  javelin: 'equipment.javelin',
  'leather-armor': 'equipment.leather',
  'light-crossbow': 'equipment.crossbow_light',
  longsword: 'equipment.longsword',
  longbow: 'equipment.longbow',
  lute: 'equipment.lute',
  mace: 'equipment.mace',
  'priest-pack': 'equipment.priests_pack',
  quarterstaff: 'equipment.quarterstaff',
  rapier: 'equipment.rapier',
  'scale-mail': 'equipment.scale_mail',
  scimitar: 'equipment.scimitar',
  'scholar-pack': 'equipment.scholars_pack',
  shield: 'equipment.shield',
  shortbow: 'equipment.shortbow',
  shortsword: 'equipment.shortsword',
  spellbook: 'equipment.spellbook',
  'thieves-tools': 'equipment.thieves_tools',
  warhammer: 'equipment.warhammer',
};

const seedItemPlaceholders = new Set([
  'simple-weapon-1',
  'simple-weapon-2',
  'simple-melee-weapon-1',
  'simple-melee-weapon-2',
  'martial-weapon-1',
  'martial-weapon-2',
  'martial-melee-weapon-1',
  'musical-instrument-1',
]);

function hasCanonicalId(idSet, kind, id) {
  const canonicalId = resolveCanonicalSrdId(kind, id);
  return idSet.has(canonicalId);
}

function countLegacyIds(ids, kind) {
  return Array.from(ids).filter((id) => resolveCanonicalSrdId(kind, id) !== id).length;
}

function findFeatureByLabel(canonicalFeatures, classKey, label, level) {
  const normalizedLabel = normalizeSrdFeatureLookupLabel(label);
  const candidates = canonicalFeatures.filter(
    (feature) =>
      feature.classKey === classKey &&
      feature.level === level &&
      (normalizeSrdFeatureLookupLabel(feature.nameKo) === normalizedLabel ||
        normalizedLabel.startsWith(normalizeSrdFeatureLookupLabel(feature.nameKo)) ||
        normalizeSrdFeatureLookupLabel(feature.nameKo).startsWith(normalizedLabel)),
  );
  return candidates[0] ?? null;
}

async function verifyFePublicSrdSync() {
  const generatedClasses = await readJsonLines('srd-data/generated/srd/classes.jsonl');
  const generatedRaces = await readJsonLines('srd-data/generated/srd/races.jsonl');
  const generatedMonsters = await readJsonLines('srd-data/generated/srd/monsters.jsonl');
  const generatedSpells = await readJsonLines('srd-data/generated/srd/spells.jsonl');
  const generatedEquipmentItems = await readJsonLines('srd-data/generated/srd/equipment_items.jsonl');
  const generatedMagicItems = await readJsonLines('srd-data/generated/srd/magic_items.jsonl');
  const generatedClassFeatures = await readJson('srd-data/generated/srd/class-features.json');
  const generatedFeSpellPools = await readJson('srd-data/generated/srd/fe-spell-pools.json');
  const generatedFeUsableItems = await readJson('srd-data/generated/srd/fe-usable-items.json');
  const generatedItemLabels = await readJson('srd-data/generated/srd/item-labels.json');
  const generatedCatalogFingerprint = await readJson('srd-data/generated/srd/catalog-fingerprint.json');
  const generatedSpellClassLists = await readJson('srd-data/generated/srd/spell-class-lists.json');
  const expectedCatalogFingerprint = await getSrdCatalogFingerprint();
  const classFeatureDisplayOverrides = await readJson('srd-data/overrides/class-feature-summaries.json');
  const feSpellPoolOverrides = await readJson('srd-data/overrides/fe-spell-pools.json');
  const feUsableItemOverrides = await readJson('srd-data/overrides/fe-usable-items.json');
  const ruleCatalogSource = await readText('be/src/modules/rules/rule-catalog.service.ts');
  const subclassFeatureRows = parseBeSubclassFeatureRows(ruleCatalogSource);
  const runtimeFeatureIds = new Set([
    ...parseBeClassFeatureIds(ruleCatalogSource),
    ...subclassFeatureRows.flatMap((row) => [row.id, row.legacyId]),
  ]);
  const expectedClassFeatures = buildCanonicalClassFeatureManifest(generatedClasses, {
    runtimeFeatureIds,
    aliasesByClass: SRD_CLASS_FEATURE_ID_ALIASES,
    displayOverridesById: {
      ...buildSubclassFeatureDisplayOverrides(generatedClasses, subclassFeatureRows),
      ...classFeatureDisplayOverrides,
    },
  });

  if (stableJson(generatedClassFeatures) !== stableJson(expectedClassFeatures)) {
    fail('Generated canonical class feature manifest is stale.', [
      'srd-data/generated/srd/class-features.json is not synced. Run npm run build -w @trpg/srd-data.',
    ]);
  }
  if (stableJson(generatedFeSpellPools) !== stableJson(feSpellPoolOverrides)) {
    fail('Generated FE spell pool artifact is stale.', [
      'srd-data/generated/srd/fe-spell-pools.json is not synced. Run npm run build -w @trpg/srd-data.',
    ]);
  }
  if (stableJson(generatedFeUsableItems) !== stableJson(feUsableItemOverrides)) {
    fail('Generated FE usable item artifact is stale.', [
      'srd-data/generated/srd/fe-usable-items.json is not synced. Run npm run build -w @trpg/srd-data.',
    ]);
  }
  if (stableJson(generatedItemLabels) !== stableJson(buildItemLabelMap(generatedEquipmentItems, generatedMagicItems))) {
    fail('Generated item label artifact is stale.', [
      'srd-data/generated/srd/item-labels.json is not synced. Run npm run build -w @trpg/srd-data.',
    ]);
  }
  if (stableJson(generatedCatalogFingerprint) !== stableJson(expectedCatalogFingerprint)) {
    fail('Generated SRD catalog fingerprint artifact is stale.', [
      'srd-data/generated/srd/catalog-fingerprint.json is not synced. Run npm run build -w @trpg/srd-data.',
    ]);
  }

  const expectedFiles = new Map([
    ['classes.json', generatedClasses],
    [
      'class-features.json',
      generatedClassFeatures,
    ],
    ['fe-spell-pools.json', generatedFeSpellPools],
    ['fe-usable-items.json', generatedFeUsableItems],
    ['item-labels.json', generatedItemLabels],
    ['catalog-fingerprint.json', generatedCatalogFingerprint],
    ['spell-class-lists.json', generatedSpellClassLists],
    ['races.json', generatedRaces],
    ['monsters.json', generatedMonsters],
    ['spells.json', generatedSpells],
    [
      'items.json',
      {
        equipmentItems: generatedEquipmentItems,
        magicItems: generatedMagicItems,
      },
    ],
  ]);

  const mismatches = [];
  for (const [fileName, expectedPayload] of expectedFiles) {
    const actualRaw = await readFile(path.join(fePublicSrdDir, fileName), 'utf8');
    const expectedRaw = stableJson(expectedPayload);
    if (actualRaw !== expectedRaw) {
      mismatches.push(
        `${fileName} is not synced with srd-data/generated/srd. Run npm run sync:fe:srd.`,
      );
    }
  }

  if (mismatches.length) {
    fail('FE static SRD assets are out of sync.', mismatches);
  }
}

function verifyCharacterBuilderFeatureMapping(classes, aliasesByClass, presentationIds, canonicalFeatures) {
  const missing = [];

  for (const classOption of classes) {
    const classKey = normalizeSrdClassKey(classOption.nameEn);
    if (!classKey) continue;

    for (const levelFeature of classOption.levelFeatures ?? []) {
      const level = Number.parseInt(String(levelFeature.level), 10);
      if (!Number.isFinite(level)) continue;

      for (const label of splitSrdClassFeatureSummary(levelFeature.features)) {
        if (isIgnoredSrdClassFeatureLabel(label)) continue;

        const reference = findSrdClassFeatureReference(classOption, label, level);
        const aliasKey = normalizeSrdFeatureAliasKey(label);
        const mappedId = reference?.id ?? aliasesByClass[classKey]?.[aliasKey] ?? null;
        const canonical = mappedId
          ? canonicalFeatures.find((feature) => feature.id === mappedId)
          : findFeatureByLabel(canonicalFeatures, classKey, label, level);

        if (!canonical) {
          missing.push(`${classKey} level ${level}: "${label}" has no canonical feature id mapping.`);
          continue;
        }

        if (!canonical.summaryKo && !presentationIds.has(canonical.id)) {
          missing.push(
            `${classKey} level ${level}: "${label}" maps to ${canonical.id}, but canonical summary and FE presentation override are both missing.`,
          );
        }
      }
    }
  }

  if (missing.length) {
    fail('Character builder class feature mapping has drifted from SRD data.', missing);
  }
}

function verifyBeRuleCatalogFeatureIds(beFeatureIds, canonicalFeatures) {
  const canonicalIds = new Set(canonicalFeatures.map((feature) => feature.id));
  const missing = Array.from(beFeatureIds)
    .filter((id) => !canonicalIds.has(id))
    .sort();

  if (missing.length) {
    fail('BE RuleCatalog class feature ids are missing from the canonical feature manifest.', missing);
  }
}

function verifyCanonicalClassFeatureSummaryCoverage(canonicalFeatures) {
  const missing = canonicalFeatures
    .filter((feature) => !feature.summaryKo)
    .map((feature) => `canonical class feature is missing summaryKo: ${feature.id}`);

  if (missing.length) {
    fail('Canonical class feature manifest has empty display summaries.', missing);
  }

  return {
    canonicalClassFeatureSummaries: canonicalFeatures.length - missing.length,
    missingCanonicalClassFeatureSummaries: missing.length,
  };
}

function verifyBeRuleCatalogRaceKeys(ruleCatalogSource, races) {
  const srdRaceKeys = new Set(
    races.flatMap((race) => [
      raceKeyFromSrdId(race.id),
      ...((race.subraces ?? []).map((subrace) => raceKeyFromSrdId(subrace.id))),
    ]),
  );
  const beRaceTraitKeys = parseBeRaceTraitKeys(ruleCatalogSource);
  const beRaceParentKeys = parseBeRaceParentKeys(ruleCatalogSource);
  const missing = [
    ...Array.from(beRaceTraitKeys)
      .filter((raceKey) => !srdRaceKeys.has(raceKey))
      .map((raceKey) => `BE RuleCatalog race trait key is not present in generated SRD races/subraces: ${raceKey}`),
    ...Array.from(beRaceParentKeys)
      .filter(([raceKey, parentKey]) => !srdRaceKeys.has(raceKey) || !srdRaceKeys.has(parentKey))
      .flatMap(([raceKey, parentKey]) => [
        ...(!srdRaceKeys.has(raceKey)
          ? [`BE RuleCatalog race parent child key is not present in generated SRD races/subraces: ${raceKey}`]
          : []),
        ...(!srdRaceKeys.has(parentKey)
          ? [`BE RuleCatalog race parent key is not present in generated SRD races/subraces: ${parentKey}`]
          : []),
      ]),
  ];

  if (missing.length) {
    fail('BE RuleCatalog race keys have drifted from generated SRD race data.', missing);
  }

  return {
    beRaceTraitKeys: beRaceTraitKeys.size,
    beRaceParentLinks: beRaceParentKeys.size,
  };
}

function verifyBeRuleCatalogRaceTraitTags(ruleCatalogSource, races) {
  const expectedTagsByRaceKey = raceTraitExpectedTagsFromSrd(races);
  const beRaceTraitTags = parseBeRaceTraitTags(ruleCatalogSource);
  const missing = [];

  for (const [raceKey, expectedTags] of expectedTagsByRaceKey) {
    const traitKey = beRaceTraitTags.has(`${raceKey}:subrace_traits`)
      ? `${raceKey}:subrace_traits`
      : beRaceTraitTags.has(`${raceKey}:base_traits`)
        ? `${raceKey}:base_traits`
        : `${raceKey}:ability_score_increase`;
    const trait = beRaceTraitTags.get(traitKey);
    if (!trait) {
      missing.push(`BE RuleCatalog is missing generated SRD race runtime tags for ${raceKey}`);
      continue;
    }

    const actualTags = new Set(trait.tags);
    for (const expectedTag of expectedTags) {
      if (!actualTags.has(expectedTag)) {
        missing.push(
          `BE RuleCatalog ${trait.raceKey}.${trait.traitKey} is missing SRD-derived tag: ${expectedTag}`,
        );
      }
    }
  }

  if (missing.length) {
    fail('BE RuleCatalog race trait tags have drifted from generated SRD race data.', missing);
  }

  return {
    srdRaceRuntimeTagSets: expectedTagsByRaceKey.size,
  };
}

function verifyNoRedundantFeaturePresentationOverrides(presentationIds, canonicalFeatures) {
  const canonicalSummaryIds = new Set(
    canonicalFeatures
      .filter((feature) => feature.id.startsWith('class.') && feature.summaryKo)
      .map((feature) => feature.id),
  );
  const redundant = Array.from(presentationIds)
    .filter((id) => canonicalSummaryIds.has(id))
    .sort();

  if (redundant.length) {
    fail('FE class feature presentation overrides duplicate canonical SRD summaries.', [
      ...redundant,
      'Remove these entries from characterFeaturePresentation.ts or keep only FE-only presentation metadata outside the description fallback map.',
    ]);
  }
}

function collectSpellClassListIds(classSpellList) {
  return [
    ...(classSpellList.cantrips ?? []),
    ...Object.values(classSpellList.spellsByLevel ?? {}).flat(),
  ];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function verifySpellClassListArtifact(spellClassLists, context) {
  const { spellsById, srdClassKeys, progressionClassKeys, feSpellPools } = context;
  const classesByKey = spellClassLists.classes ?? {};
  const missing = [];

  if (spellClassLists.schemaVersion !== 'srd-spell-class-lists-v1') {
    missing.push('spell-class-lists.json schemaVersion must be srd-spell-class-lists-v1');
  }
  if (!classesByKey || typeof classesByKey !== 'object' || Array.isArray(classesByKey)) {
    missing.push('spell-class-lists.json classes must be an object keyed by class key');
  }

  for (const [classKey, classSpellList] of Object.entries(classesByKey)) {
    if (!isPlainObject(classSpellList)) {
      missing.push(`spell-class-lists.json ${classKey} entry must be an object`);
      continue;
    }
    if (!srdClassKeys.has(classKey)) {
      missing.push(`spell-class-lists.json class key is not present in generated SRD classes: ${classKey}`);
    }
    if (!progressionClassKeys.has(classKey)) {
      missing.push(`spell-class-lists.json class key is not present in shared spellcasting progression: ${classKey}`);
    }

    const cantrips = classSpellList.cantrips ?? [];
    const spellsByLevel = classSpellList.spellsByLevel ?? {};
    if (!Array.isArray(cantrips)) {
      missing.push(`spell-class-lists.json ${classKey}.cantrips must be an array`);
      continue;
    }
    if (!isPlainObject(spellsByLevel)) {
      missing.push(`spell-class-lists.json ${classKey}.spellsByLevel must be an object`);
      continue;
    }
    const duplicateIds = new Set();
    const seenIds = new Set();
    for (const spellId of collectSpellClassListIds(classSpellList)) {
      if (seenIds.has(spellId)) duplicateIds.add(spellId);
      seenIds.add(spellId);
    }
    for (const spellId of duplicateIds) {
      missing.push(`spell-class-lists.json ${classKey} contains duplicate spell id: ${spellId}`);
    }

    for (const spellId of cantrips) {
      if (spellsById.get(spellId)?.level !== 0) {
        missing.push(`spell-class-lists.json ${classKey} cantrip list contains non-cantrip spell: ${spellId}`);
      }
    }

    for (const [rawLevel, spellIds] of Object.entries(spellsByLevel)) {
      if (!Array.isArray(spellIds)) {
        missing.push(`spell-class-lists.json ${classKey}.spellsByLevel.${rawLevel} must be an array`);
        continue;
      }
      const level = Number(rawLevel);
      if (!Number.isInteger(level) || level < 1 || level > 9) {
        missing.push(`spell-class-lists.json ${classKey} has invalid spell level bucket: ${rawLevel}`);
        continue;
      }
      for (const spellId of spellIds) {
        if (spellsById.get(spellId)?.level !== level) {
          missing.push(`spell-class-lists.json ${classKey} level ${level} list contains mismatched spell: ${spellId}`);
        }
      }
    }
  }

  for (const [classKey, spellIds] of Object.entries(feSpellPools.quickCreate?.level5SlotSpellsByClass ?? {})) {
    const classSpellIds = new Set(collectSpellClassListIds(classesByKey[classKey] ?? {}));
    for (const spellId of spellIds) {
      if (!classSpellIds.has(spellId)) {
        missing.push(`FE quick-create level 5 ${classKey} spell is missing from spell-class-lists.json: ${spellId}`);
      }
    }
  }

  for (const [classKey, spellIds] of Object.entries(feSpellPools.quickCreate?.level7SlotSpellsByClass ?? {})) {
    const classSpellIds = new Set(collectSpellClassListIds(classesByKey[classKey] ?? {}));
    for (const spellId of spellIds) {
      if (!classSpellIds.has(spellId)) {
        missing.push(`FE quick-create level 7 ${classKey} spell is missing from spell-class-lists.json: ${spellId}`);
      }
    }
  }

  if (missing.length) {
    fail('Generated spell class list artifact has drifted from SRD spell/class data.', missing);
  }

  return {
    spellClassListsArtifact: 'present',
    spellClassListClasses: Object.keys(classesByKey).length,
    spellClassListSpellRefs: Object.values(classesByKey).flatMap(collectSpellClassListIds).length,
  };
}

async function verifySpellProgressionAndPools(classes, spells) {
  const [
    spellcastingProgressionSource,
    characterPageSource,
    feSpellPools,
    engineClasses,
    spellClassLists,
    spellClassListsSource,
  ] = await Promise.all([
    readText('shared-types/src/constants/spellcasting-progression.ts'),
    readText('fe/src/pages/CharacterPage.tsx'),
    readJson('srd-data/generated/srd/fe-spell-pools.json'),
    listSrdEngineClasses(),
    readJson('srd-data/generated/srd/spell-class-lists.json'),
    readJson('srd-data/sources/spell-class-lists.json'),
  ]);
  const progressionClassKeys = parseSpellcastingProgressionClassKeys(spellcastingProgressionSource);
  const implementedSpellClassKeys = parseImplementedSpellClassKeys(characterPageSource);
  const srdClassKeys = new Set(classes.map((klass) => normalizeSrdClassKey(klass.nameEn)).filter(Boolean));
  const spellsById = new Map(spells.map((spell) => [spell.id, spell]));
  const characterBuilderCantripIds = new Set(feSpellPools.characterBuilder?.cantrips ?? []);
  const characterBuilderLevel1Ids = new Set(feSpellPools.characterBuilder?.slotSpellsByLevel?.['1'] ?? []);
  const quickCreateCantripIds = new Set(feSpellPools.quickCreate?.cantrips ?? []);
  const quickCreateLevel1Ids = new Set(feSpellPools.quickCreate?.level1SlotSpells ?? []);
  const quickCreateClassKeys = new Set([
    ...Object.keys(feSpellPools.quickCreate?.level5SlotSpellsByClass ?? {}),
    ...Object.keys(feSpellPools.quickCreate?.level7SlotSpellsByClass ?? {}),
  ]);
  const missing = [
    ...Array.from(progressionClassKeys)
      .filter((classKey) => !srdClassKeys.has(classKey))
      .map((classKey) => `spellcasting progression class key is not present in generated SRD classes: ${classKey}`),
    ...Array.from(implementedSpellClassKeys)
      .filter((classKey) => !progressionClassKeys.has(classKey))
      .map((classKey) => `FE implemented spell class key is not present in shared spellcasting progression: ${classKey}`),
    ...Array.from(progressionClassKeys)
      .filter((classKey) => !implementedSpellClassKeys.has(classKey))
      .map((classKey) => `shared spellcasting progression class key is missing from FE implemented spell classes: ${classKey}`),
    ...Array.from(quickCreateClassKeys)
      .filter((classKey) => !progressionClassKeys.has(classKey))
      .map((classKey) => `FE quick-create spell pool class key is not present in shared spellcasting progression: ${classKey}`),
    ...(feSpellPools.characterBuilder?.cantrips ?? [])
      .filter((spellId) => spellsById.get(spellId)?.level !== 0)
      .map((spellId) => `FE character builder cantrip pool contains a non-cantrip spell: ${spellId}`),
    ...(feSpellPools.quickCreate?.cantrips ?? [])
      .filter((spellId) => spellsById.get(spellId)?.level !== 0)
      .map((spellId) => `FE quick-create cantrip pool contains a non-cantrip spell: ${spellId}`),
    ...(feSpellPools.quickCreate?.level1SlotSpells ?? [])
      .filter((spellId) => spellsById.get(spellId)?.level !== 1)
      .map((spellId) => `FE quick-create level 1 slot spell pool contains a non-level-1 spell: ${spellId}`),
  ];

  for (const engineClass of engineClasses) {
    const classKey = engineClass.classKey;
    const mvpSpellList = engineClass.mvpSpellList;
    if (!mvpSpellList) continue;

    if (classKey && !srdClassKeys.has(classKey)) {
      missing.push(`srd-engine MVP spell list class key is not present in generated SRD classes: ${classKey}`);
    }

    const mvpCantrips = mvpSpellList.cantrips ?? [];
    const mvpLevel1Spells = mvpSpellList.level1 ?? [];
    const mvpAll = mvpSpellList.all ?? [];
    const expectedAll = new Set([...mvpCantrips, ...mvpLevel1Spells]);
    const actualAll = new Set(mvpAll);

    for (const spellId of mvpCantrips) {
      if (spellsById.get(spellId)?.level !== 0) {
        missing.push(`srd-engine ${classKey} MVP cantrip list contains a non-cantrip spell: ${spellId}`);
      }
      if (!characterBuilderCantripIds.has(spellId) || !quickCreateCantripIds.has(spellId)) {
        missing.push(`srd-engine ${classKey} MVP cantrip is missing from FE fallback cantrip pools: ${spellId}`);
      }
    }

    for (const spellId of mvpLevel1Spells) {
      if (spellsById.get(spellId)?.level !== 1) {
        missing.push(`srd-engine ${classKey} MVP level 1 list contains a non-level-1 spell: ${spellId}`);
      }
      if (!characterBuilderLevel1Ids.has(spellId) || !quickCreateLevel1Ids.has(spellId)) {
        missing.push(`srd-engine ${classKey} MVP level 1 spell is missing from FE fallback level 1 pools: ${spellId}`);
      }
    }

    for (const spellId of expectedAll) {
      if (!actualAll.has(spellId)) {
        missing.push(`srd-engine ${classKey} MVP all list is missing spell from cantrips/level1: ${spellId}`);
      }
    }
    for (const spellId of actualAll) {
      if (!expectedAll.has(spellId)) {
        missing.push(`srd-engine ${classKey} MVP all list contains a spell outside cantrips/level1: ${spellId}`);
      }
    }
  }

  for (const [rawLevel, spellIds] of Object.entries(feSpellPools.characterBuilder?.slotSpellsByLevel ?? {})) {
    const level = Number(rawLevel);
    if (!Number.isInteger(level) || level < 1 || level > 9) {
      missing.push(`FE character builder slot spell pool has an invalid spell level bucket: ${rawLevel}`);
      continue;
    }
    for (const spellId of spellIds) {
      if (spellsById.get(spellId)?.level !== level) {
        missing.push(`FE character builder level ${level} spell pool contains a mismatched spell: ${spellId}`);
      }
    }
  }

  for (const [classKey, spellIds] of Object.entries(feSpellPools.quickCreate?.level5SlotSpellsByClass ?? {})) {
    const maxSpellLevel = getMaximumSlotSpellLevelForClassLevel(classKey, 5);
    for (const spellId of spellIds) {
      const spellLevel = spellsById.get(spellId)?.level;
      if (typeof spellLevel !== 'number' || spellLevel < 1 || spellLevel > maxSpellLevel) {
        missing.push(`FE quick-create level 5 ${classKey} spell pool contains an unavailable spell: ${spellId}`);
      }
    }
  }

  for (const [classKey, spellIds] of Object.entries(feSpellPools.quickCreate?.level7SlotSpellsByClass ?? {})) {
    const maxSpellLevel = getMaximumSlotSpellLevelForClassLevel(classKey, 7);
    for (const spellId of spellIds) {
      const spellLevel = spellsById.get(spellId)?.level;
      if (typeof spellLevel !== 'number' || spellLevel < 1 || spellLevel > maxSpellLevel) {
        missing.push(`FE quick-create level 7 ${classKey} spell pool contains an unavailable spell: ${spellId}`);
      }
    }
  }

  if (missing.length) {
    fail('FE spell pools or shared spellcasting progression have drifted from generated SRD spell/class data.', missing);
  }

  const engineClassMvpSpellListCount = engineClasses.filter((engineClass) => engineClass.mvpSpellList).length;
  const spellClassListBearingSpells = spells.filter((spell) => {
    return Array.isArray(spell.classLists) || Array.isArray(spell.classList) || Array.isArray(spell.classes);
  }).length;
  const spellClassListArtifactStats = verifySpellClassListArtifact(spellClassLists, {
    spellsById,
    srdClassKeys,
    progressionClassKeys,
    feSpellPools,
  });
  if (JSON.stringify(spellClassListsSource) !== JSON.stringify(spellClassLists)) {
    missing.push('srd-data/generated/srd/spell-class-lists.json is not synced with its source');
  }

  if (missing.length) {
    fail('FE spell pools or shared spellcasting progression have drifted from generated SRD spell/class data.', missing);
  }

  return {
    spellcastingProgressionClasses: progressionClassKeys.size,
    characterBuilderSpellClasses: implementedSpellClassKeys.size,
    quickCreateSpellPoolClasses: quickCreateClassKeys.size,
    engineClassMvpSpellLists: engineClassMvpSpellListCount,
    spellClassListCoverage: {
      engineClasses: engineClasses.length,
      engineClassMvpSpellLists: engineClassMvpSpellListCount,
      generatedSpellClassListFields: spellClassListBearingSpells,
      ...spellClassListArtifactStats,
    },
  };
}

async function verifyExecutableContentIds() {
  const [
    contentManifestSource,
    ruleCatalogSource,
    p3ItemManifestSource,
    p3SpellDefinitionsSource,
    p4SpellDefinitionsSource,
    p5SpellDefinitionsSource,
    p3MonsterDefinitionsSource,
    p4MonsterDefinitionsSource,
    p5MonsterDefinitionsSource,
    p6SpellDefinitionsSource,
    p6MonsterDefinitionsSource,
    defaultScenarioSource,
    feUsableItemIds,
    feSpellPools,
    spellClassLists,
    allowedNonSrdSpellRuntimeIds,
    allowedNonSrdMonsterRuntimeIds,
    spells,
    monsters,
    equipmentItems,
    magicItems,
    engineEquipmentItems,
  ] = await Promise.all([
    readText('be/src/modules/rules/content-manifest.ts'),
    readText('be/src/modules/rules/rule-catalog.service.ts'),
    readText('be/src/modules/rules/p3-item-manifest.ts'),
    readText('be/src/modules/rules/p3-spell-definitions.ts'),
    readText('be/src/modules/rules/p4-spell-definitions.ts'),
    readText('be/src/modules/rules/p5-spell-definitions.ts'),
    readText('be/src/modules/rules/p3-monster-definitions.ts'),
    readText('be/src/modules/rules/p4-monster-definitions.ts'),
    readText('be/src/modules/rules/p5-monster-definitions.ts'),
    readText('be/src/modules/rules/p6-spell-definitions.ts'),
    readText('be/src/modules/rules/p6-monster-definitions.ts'),
    readText('be/src/database/seed/default-scenario.ts'),
    readJson('srd-data/generated/srd/fe-usable-items.json'),
    readJson('srd-data/generated/srd/fe-spell-pools.json'),
    readJson('srd-data/generated/srd/spell-class-lists.json'),
    readJson('srd-data/overrides/non-srd-spell-runtime-ids.json'),
    readJson('srd-data/overrides/non-srd-monster-runtime-ids.json'),
    listSrdSpells(),
    listSrdMonsters(),
    listSrdEquipmentItems(),
    listSrdMagicItems(),
    listSrdEngineEquipment(),
  ]);

  const spellIds = new Set(spells.map((spell) => spell.id));
  const spellLevelsById = new Map(spells.map((spell) => [spell.id, spell.level]));
  const classListedSpellIds = new Set(
    Object.values(spellClassLists.classes ?? {}).flatMap(collectSpellClassListIds),
  );
  const allowedNonSrdSpellIds = new Set(allowedNonSrdSpellRuntimeIds);
  const monsterIds = new Set(monsters.map((monster) => monster.id));
  const allowedNonSrdMonsterIds = new Set(allowedNonSrdMonsterRuntimeIds);
  const equipmentItemIds = new Set(equipmentItems.map((item) => item.id));
  const magicItemIds = new Set(magicItems.map((item) => item.id));
  const engineEquipmentItemIds = new Set(engineEquipmentItems.map((item) => item.id));
  const itemIds = new Set([...equipmentItemIds, ...magicItemIds, ...engineEquipmentItemIds]);

  const manifestSpellIds = new Set([
    ...parseStringArrayConst(contentManifestSource, 'P2_EXECUTABLE_SPELL_IDS'),
    ...parseStringArrayConst(p6SpellDefinitionsSource, 'P6_EXECUTABLE_SPELL_IDS'),
  ]);
  const spellRuntimeDefinitions = [
    ...parseSpellRuntimeDefinitions(ruleCatalogSource, 'rule-catalog.service.ts'),
    ...parseSpellRuntimeDefinitions(p3SpellDefinitionsSource, 'p3-spell-definitions.ts'),
    ...parseSpellRuntimeDefinitions(p4SpellDefinitionsSource, 'p4-spell-definitions.ts'),
    ...parseSpellRuntimeDefinitions(p5SpellDefinitionsSource, 'p5-spell-definitions.ts'),
    ...parseSpellRuntimeDefinitions(p6SpellDefinitionsSource, 'p6-spell-definitions.ts'),
  ];
  const spellRuntimeIds = new Set([
    ...manifestSpellIds,
    ...spellRuntimeDefinitions.map((definition) => definition.id),
  ]);
  const manifestMonsterIds = new Set([
    ...parseStringArrayConst(contentManifestSource, 'P2_EXECUTABLE_MONSTER_IDS'),
    ...parseStringArrayConst(contentManifestSource, 'P3_BASELINE_MONSTER_IDS'),
    ...parseStringArrayConst(p3MonsterDefinitionsSource, 'P3_EXECUTABLE_MONSTER_IDS'),
    ...parseStringArrayConst(p4MonsterDefinitionsSource, 'P4_EXECUTABLE_MONSTER_IDS'),
    ...parseStringArrayConst(p5MonsterDefinitionsSource, 'P5_EXECUTABLE_MONSTER_IDS'),
    ...parseStringArrayConst(p6MonsterDefinitionsSource, 'P6_EXECUTABLE_MONSTER_IDS'),
  ]);
  const monsterAbilityLinks = [
    ...parseMonsterAbilityLinks(ruleCatalogSource),
    ...parseMonsterAbilityLinks(p3MonsterDefinitionsSource),
    ...parseMonsterAbilityLinks(p4MonsterDefinitionsSource),
    ...parseMonsterAbilityLinks(p5MonsterDefinitionsSource),
    ...parseMonsterAbilityLinks(p6MonsterDefinitionsSource),
  ];
  const monsterDefinitionIds = new Set([
    ...manifestMonsterIds,
    ...monsterAbilityLinks.map((link) => link.monsterId),
    ...parseMonsterDefinitionIds(p3MonsterDefinitionsSource),
    ...parseMonsterDefinitionIds(p4MonsterDefinitionsSource),
    ...parseMonsterDefinitionIds(p5MonsterDefinitionsSource),
    ...parseMonsterDefinitionIds(p6MonsterDefinitionsSource),
  ]);
  const manifestItemIds = new Set(parseFunctionWrappedIds(p3ItemManifestSource, [
    'equipment',
    'consumable',
    'magicItem',
  ]));
  const feExecutableItemIds = new Set(feUsableItemIds);
  const scenarioMonsterIds = new Set(
    Array.from(defaultScenarioSource.matchAll(/"((?:monster)\.[^"]+)"/g), (match) => match[1]),
  );
  const scenarioItemIds = new Set(
    Array.from(
      defaultScenarioSource.matchAll(/"((?:equipment|magic_item)\.[A-Za-z0-9_.-]+)"/g),
      (match) => match[1],
    ),
  );
  const characterBuilderFallbackSpellIds = new Set([
    ...(feSpellPools.characterBuilder?.cantrips ?? []),
    ...Object.values(feSpellPools.characterBuilder?.slotSpellsByLevel ?? {}).flat(),
  ]);
  const quickCreateFallbackSpellIds = new Set(
    [
      ...(feSpellPools.quickCreate?.cantrips ?? []),
      ...(feSpellPools.quickCreate?.level1SlotSpells ?? []),
      ...Object.values(feSpellPools.quickCreate?.level5SlotSpellsByClass ?? {}).flat(),
      ...Object.values(feSpellPools.quickCreate?.level7SlotSpellsByClass ?? {}).flat(),
    ],
  );

  const missing = [
    ...Array.from(spellRuntimeIds)
      .filter((id) => !hasCanonicalId(spellIds, 'spell', id) && !allowedNonSrdSpellIds.has(id))
      .map((id) => `BE spell runtime id is not present in generated SRD spells or the explicit non-SRD allowlist: ${id}`),
    ...Array.from(allowedNonSrdSpellIds)
      .filter((id) => !spellRuntimeIds.has(id))
      .map((id) => `non-SRD spell runtime allowlist id is no longer used by BE spell runtime definitions: ${id}`),
    ...spellRuntimeDefinitions
      .filter((definition) => {
        const canonicalId = resolveCanonicalSrdId('spell', definition.id);
        return spellLevelsById.has(canonicalId) && spellLevelsById.get(canonicalId) !== definition.level;
      })
      .map((definition) => {
        const canonicalId = resolveCanonicalSrdId('spell', definition.id);
        return `${definition.sourceName}: ${definition.id} runtime level ${definition.level} does not match generated SRD spell level ${spellLevelsById.get(canonicalId)}`;
      }),
    ...Array.from(spellRuntimeIds)
      .filter((id) => {
        const canonicalId = resolveCanonicalSrdId('spell', id);
        return spellIds.has(canonicalId) && !classListedSpellIds.has(canonicalId);
      })
      .map((id) => `BE spell runtime id is present in SRD spells but absent from canonical class spell lists: ${id}`),
    ...Array.from(monsterDefinitionIds)
      .filter((id) => !hasCanonicalId(monsterIds, 'monster', id) && !allowedNonSrdMonsterIds.has(id))
      .map((id) => `BE monster runtime id is not present in generated SRD monsters or the explicit non-SRD allowlist: ${id}`),
    ...Array.from(allowedNonSrdMonsterIds)
      .filter((id) => !monsterDefinitionIds.has(id))
      .map((id) => `non-SRD monster runtime allowlist id is no longer used by BE monster runtime definitions: ${id}`),
    ...monsterAbilityLinks
      .filter((link) => link.abilityId?.startsWith('monster.') && !link.abilityId.startsWith(`${link.monsterId}.ability.`))
      .map((link) => `monster ability id does not match its monsterId: ${link.abilityId} -> ${link.monsterId}`),
    ...Array.from(manifestItemIds)
      .filter((id) => !hasCanonicalId(itemIds, id.startsWith('magic_item.') ? 'item' : 'item', id))
      .map((id) => `item id is not present in generated SRD item catalogs: ${id}`),
    ...Array.from(feExecutableItemIds)
      .filter((id) => !hasCanonicalId(itemIds, 'item', id))
      .map((id) => `FE executable item id is not present in generated SRD item catalogs: ${id}`),
    ...Array.from(scenarioMonsterIds)
      .filter((id) => !hasCanonicalId(monsterIds, 'monster', id))
      .map((id) => `scenario monster id is not present in generated SRD monster catalog: ${id}`),
    ...Array.from(scenarioItemIds)
      .filter((id) => !hasCanonicalId(itemIds, 'item', id))
      .map((id) => `scenario item id is not present in generated SRD item catalogs: ${id}`),
    ...Array.from(characterBuilderFallbackSpellIds)
      .filter((id) => !hasCanonicalId(spellIds, 'spell', id))
      .map((id) => `FE character builder fallback spell id is not present in generated SRD spell catalog: ${id}`),
    ...Array.from(quickCreateFallbackSpellIds)
      .filter((id) => !hasCanonicalId(spellIds, 'spell', id))
      .map((id) => `FE quick-create fallback spell id is not present in generated SRD spell catalog: ${id}`),
  ];

  if (missing.length) {
    fail('Executable content manifest ids have drifted from SRD data.', missing);
  }

  return {
    executableSpellIds: spellRuntimeIds.size,
    executableSrdSpellClassListCoveredIds: Array.from(spellRuntimeIds).filter((id) => {
      const canonicalId = resolveCanonicalSrdId('spell', id);
      return spellIds.has(canonicalId) && classListedSpellIds.has(canonicalId);
    }).length,
    nonSrdSpellRuntimeIds: Array.from(spellRuntimeIds).filter(
      (id) => !hasCanonicalId(spellIds, 'spell', id) && allowedNonSrdSpellIds.has(id),
    ).length,
    executableMonsterIds: manifestMonsterIds.size,
    monsterRuntimeIds: monsterDefinitionIds.size,
    nonSrdMonsterRuntimeIds: Array.from(monsterDefinitionIds).filter(
      (id) => !hasCanonicalId(monsterIds, 'monster', id) && allowedNonSrdMonsterIds.has(id),
    ).length,
    executableItemIds: manifestItemIds.size,
    feExecutableItemIds: feExecutableItemIds.size,
    characterBuilderFallbackSpellIds: characterBuilderFallbackSpellIds.size,
    quickCreateFallbackSpellIds: quickCreateFallbackSpellIds.size,
    scenarioMonsterIds: scenarioMonsterIds.size,
    scenarioItemIds: scenarioItemIds.size,
    legacySpellIds: countLegacyIds(spellRuntimeIds, 'spell'),
    legacyMonsterIds:
      countLegacyIds(manifestMonsterIds, 'monster') + countLegacyIds(scenarioMonsterIds, 'monster'),
    legacyItemIds:
      countLegacyIds(manifestItemIds, 'item') +
      countLegacyIds(feExecutableItemIds, 'item') +
      countLegacyIds(scenarioItemIds, 'item'),
  };
}

async function verifyBeSeedCatalogAlignment() {
  const [classSeedSource, raceSeedSource, itemSeedSource, classes, races, engineEquipment] =
    await Promise.all([
      readText('be/src/database/seed/classes.ts'),
      readText('be/src/database/seed/races.ts'),
      readText('be/src/database/seed/items.ts'),
      listSrdClasses(),
      listSrdRaces(),
      listSrdEngineEquipment(),
    ]);

  const classKeys = new Set(classes.map((klass) => normalizeSrdClassKey(klass.nameEn)));
  const srdRaceKeys = new Set(
    races.flatMap((race) => [
      raceKeyFromSrdId(race.id),
      ...((race.subraces ?? []).map((subrace) => raceKeyFromSrdId(subrace.id))),
    ]),
  );
  const engineEquipmentIds = new Set(engineEquipment.map((item) => item.id));
  const missing = [
    ...parseSeedKeys(classSeedSource, 'classSeeds')
      .filter((key) => !classKeys.has(key))
      .map((key) => `class seed key is not present in SRD classes: ${key}`),
    ...parseSeedKeys(raceSeedSource, 'raceSeeds')
      .filter((key) => !srdRaceKeys.has(key))
      .map((key) => `race seed key is not present in SRD races/subraces: ${key}`),
    ...parseSeedKeys(itemSeedSource, 'itemSeeds')
      .filter((key) => !seedItemPlaceholders.has(key) && !seedItemSrdIdAliases[key])
      .map((key) => `item seed key has no SRD equipment alias or placeholder marker: ${key}`),
    ...Object.entries(seedItemSrdIdAliases)
      .filter(([, id]) => !engineEquipmentIds.has(id))
      .map(([key, id]) => `item seed key ${key} maps to missing srd-engine equipment id: ${id}`),
  ];

  if (missing.length) {
    fail('BE seed catalogs have drifted from SRD data.', missing);
  }

  return {
    seedClassIds: parseSeedKeys(classSeedSource, 'classSeeds').length,
    seedRaceIds: parseSeedKeys(raceSeedSource, 'raceSeeds').length,
    seedItemAliases: Object.keys(seedItemSrdIdAliases).length,
  };
}

async function verifyAiCatalogManifest() {
  const [
    aiQualityEvalSource,
    sourceManifest,
    engineManifest,
    catalogFingerprint,
    srdClasses,
    srdRaces,
    srdSpells,
    srdMonsters,
    srdMagicItems,
    engineClasses,
    engineSpells,
    engineEquipment,
    engineMonsters,
  ] = await Promise.all([
    readText('ai/scripts/evaluate_p0_ai_quality.py'),
    readJson('srd-data/generated/srd/source_manifest.json'),
    readJson('srd-data/generated/srd-engine/manifest.json'),
    getSrdCatalogFingerprint(),
    listSrdClasses(),
    listSrdRaces(),
    listSrdSpells(),
    listSrdMonsters(),
    listSrdMagicItems(),
    listSrdEngineClasses(),
    listSrdEngineSpells(),
    listSrdEngineEquipment(),
    listSrdEngineMonsters(),
  ]);
  const requiredSrdFiles = ['classes.jsonl', 'races.jsonl', 'spells.jsonl', 'monsters.jsonl'];
  const requiredEngineFiles = ['classes.jsonl', 'spells.jsonl', 'equipment.jsonl', 'monsters.jsonl'];

  const missing = [];
  for (const fileName of requiredSrdFiles) {
    try {
      await readFile(path.join(generatedSrdDir, fileName), 'utf8');
    } catch {
      missing.push(`srd-data/generated/srd/${fileName}`);
    }
  }
  for (const fileName of requiredEngineFiles) {
    try {
      await readFile(path.join(generatedEngineDir, fileName), 'utf8');
    } catch {
      missing.push(`srd-data/generated/srd-engine/${fileName}`);
    }
  }

  if (!sourceManifest || typeof sourceManifest !== 'object') {
    missing.push('srd-data/generated/srd/source_manifest.json is not an object');
  }
  if (!engineManifest || typeof engineManifest !== 'object') {
    missing.push('srd-data/generated/srd-engine/manifest.json is not an object');
  }
  if (
    !catalogFingerprint ||
    catalogFingerprint.schemaVersion !== 'srd-catalog-fingerprint-v1' ||
    !/^[a-f0-9]{64}$/.test(catalogFingerprint.sha256)
  ) {
    missing.push('srd catalog fingerprint is invalid');
  }
  const fingerprintPaths = new Set(
    (catalogFingerprint?.files ?? []).map((entry) => `${entry.scope}/${entry.path}`),
  );
  for (const { scope, path: fileName } of SRD_CATALOG_FINGERPRINT_FILES) {
    const filePath = `${scope}/${fileName}`;
    if (!fingerprintPaths.has(filePath)) {
      missing.push(`srd catalog fingerprint is missing required file: ${filePath}`);
    }
  }
  if (
    !aiQualityEvalSource.includes('catalog-fingerprint.json') ||
    !aiQualityEvalSource.includes('srdCatalogFingerprint=')
  ) {
    missing.push('AI quality evaluation script does not load and print the generated SRD catalog fingerprint artifact');
  }

  if (missing.length) {
    fail('AI/SRD catalog manifest is incomplete.', missing);
  }

  const countMismatches = [];
  const expectedSrdCounts = {
    classes: srdClasses.length,
    races: srdRaces.length,
    spells: srdSpells.length,
    monsters: srdMonsters.length,
    magic_items: srdMagicItems.length,
  };
  for (const [domain, actualCount] of Object.entries(expectedSrdCounts)) {
    const expectedCount = sourceManifest.expectedCounts?.[domain];
    if (typeof expectedCount === 'number' && expectedCount !== actualCount) {
      countMismatches.push(
        `source_manifest expectedCounts.${domain}=${expectedCount}, actual=${actualCount}`,
      );
    }
  }

  const engineActualCounts = {
    'classes.jsonl': engineClasses.length,
    'spells.jsonl': engineSpells.length,
    'equipment.jsonl': engineEquipment.length,
    'monsters.jsonl': engineMonsters.length,
  };
  for (const entry of engineManifest.files ?? []) {
    if (!entry || typeof entry.path !== 'string') continue;
    const actualCount = engineActualCounts[entry.path];
    if (typeof actualCount === 'number' && entry.count !== actualCount) {
      countMismatches.push(
        `srd-engine manifest ${entry.path} count=${entry.count}, actual=${actualCount}`,
      );
    }
  }

  if (countMismatches.length) {
    fail('AI/SRD catalog manifest counts have drifted from generated files.', countMismatches);
  }

  return {
    catalogFingerprint: catalogFingerprint.sha256,
  };
}

const classes = await listSrdClasses();
const presentationSource = await readText('fe/src/features/characters/characterFeaturePresentation.ts');
const ruleCatalogSource = await readText('be/src/modules/rules/rule-catalog.service.ts');
const classFeatureDisplayOverrides = await readJson('srd-data/overrides/class-feature-summaries.json');

const aliasesByClass = SRD_CLASS_FEATURE_ID_ALIASES;
const presentationIds = parseFeaturePresentationIds(presentationSource);
const subclassFeatureRows = parseBeSubclassFeatureRows(ruleCatalogSource);
const beFeatureIds = new Set([
  ...parseBeClassFeatureIds(ruleCatalogSource),
  ...subclassFeatureRows.flatMap((row) => [row.id, row.legacyId]),
]);
const canonicalFeatures = buildCanonicalClassFeatureManifest(classes, {
  runtimeFeatureIds: beFeatureIds,
  aliasesByClass,
  displayOverridesById: {
    ...buildSubclassFeatureDisplayOverrides(classes, subclassFeatureRows),
    ...classFeatureDisplayOverrides,
  },
});

await verifyFePublicSrdSync();
verifyCharacterBuilderFeatureMapping(classes, aliasesByClass, presentationIds, canonicalFeatures);
verifyBeRuleCatalogFeatureIds(beFeatureIds, canonicalFeatures);
const classFeatureSummaryStats = verifyCanonicalClassFeatureSummaryCoverage(canonicalFeatures);
const beRaceCatalogStats = verifyBeRuleCatalogRaceKeys(ruleCatalogSource, await listSrdRaces());
const beRaceRuntimeTagStats = verifyBeRuleCatalogRaceTraitTags(ruleCatalogSource, await listSrdRaces());
verifyNoRedundantFeaturePresentationOverrides(presentationIds, canonicalFeatures);
const spellProgressionStats = await verifySpellProgressionAndPools(classes, await listSrdSpells());
const executableContentStats = await verifyExecutableContentIds();
const seedCatalogStats = await verifyBeSeedCatalogAlignment();
const aiCatalogStats = await verifyAiCatalogManifest();

process.stdout.write(
  [
    'Verified SRD data sync.',
    `canonicalClassFeatures=${canonicalFeatures.length}`,
    `canonicalClassFeatureSummaries=${classFeatureSummaryStats.canonicalClassFeatureSummaries}`,
    `missingCanonicalClassFeatureSummaries=${classFeatureSummaryStats.missingCanonicalClassFeatureSummaries}`,
    `beClassFeatures=${beFeatureIds.size}`,
    `fePresentationEntries=${presentationIds.size}`,
    `beRaceTraitKeys=${beRaceCatalogStats.beRaceTraitKeys}`,
    `beRaceParentLinks=${beRaceCatalogStats.beRaceParentLinks}`,
    `srdRaceRuntimeTagSets=${beRaceRuntimeTagStats.srdRaceRuntimeTagSets}`,
    `spellcastingProgressionClasses=${spellProgressionStats.spellcastingProgressionClasses}`,
    `characterBuilderSpellClasses=${spellProgressionStats.characterBuilderSpellClasses}`,
    `quickCreateSpellPoolClasses=${spellProgressionStats.quickCreateSpellPoolClasses}`,
    `engineClassMvpSpellLists=${spellProgressionStats.engineClassMvpSpellLists}`,
    `spellClassListCoverage.engineClasses=${spellProgressionStats.spellClassListCoverage.engineClasses}`,
    `spellClassListCoverage.generatedSpellClassListFields=${spellProgressionStats.spellClassListCoverage.generatedSpellClassListFields}`,
    `spellClassListCoverage.artifact=${spellProgressionStats.spellClassListCoverage.spellClassListsArtifact}`,
    `spellClassListCoverage.artifactClasses=${spellProgressionStats.spellClassListCoverage.spellClassListClasses}`,
    `spellClassListCoverage.artifactSpellRefs=${spellProgressionStats.spellClassListCoverage.spellClassListSpellRefs}`,
    `executableSpells=${executableContentStats.executableSpellIds}`,
    `executableSrdSpellClassListCoveredIds=${executableContentStats.executableSrdSpellClassListCoveredIds}`,
    `nonSrdSpellRuntimeIds=${executableContentStats.nonSrdSpellRuntimeIds}`,
    `executableMonsters=${executableContentStats.executableMonsterIds}`,
    `monsterRuntimeIds=${executableContentStats.monsterRuntimeIds}`,
    `nonSrdMonsterRuntimeIds=${executableContentStats.nonSrdMonsterRuntimeIds}`,
    `executableItems=${executableContentStats.executableItemIds}`,
    `feExecutableItems=${executableContentStats.feExecutableItemIds}`,
    `characterBuilderFallbackSpells=${executableContentStats.characterBuilderFallbackSpellIds}`,
    `quickCreateFallbackSpells=${executableContentStats.quickCreateFallbackSpellIds}`,
    `scenarioMonsters=${executableContentStats.scenarioMonsterIds}`,
    `scenarioItems=${executableContentStats.scenarioItemIds}`,
    `seedRaces=${seedCatalogStats.seedRaceIds}`,
    `seedItems=${seedCatalogStats.seedItemAliases}`,
    `legacyContentAliases=${
      executableContentStats.legacySpellIds +
      executableContentStats.legacyMonsterIds +
      executableContentStats.legacyItemIds
    }`,
    `catalogFingerprint=${aiCatalogStats.catalogFingerprint.slice(0, 12)}`,
  ].join(' ') + '\n',
);
