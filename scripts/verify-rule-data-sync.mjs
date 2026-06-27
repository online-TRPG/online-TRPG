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

function parseStringArrayConst(source, constName) {
  const matched = new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const;`).exec(
    source,
  );
  if (!matched) return [];
  return Array.from(matched[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function parseFunctionWrappedIds(source, functionNames) {
  const names = functionNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(?:${names})\\(\\s*"([^"]+)"`, 'g');
  return Array.from(source.matchAll(regex), (match) => match[1]);
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

  const expectedFiles = new Map([
    ['classes.json', generatedClasses],
    [
      'class-features.json',
      buildCanonicalClassFeatureManifest(generatedClasses, {
        aliasesByClass: SRD_CLASS_FEATURE_ID_ALIASES,
      }),
    ],
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

async function verifyExecutableContentIds() {
  const [
    contentManifestSource,
    p3ItemManifestSource,
    p6SpellDefinitionsSource,
    p6MonsterDefinitionsSource,
    defaultScenarioSource,
    feExecutableItemsSource,
    spells,
    monsters,
    equipmentItems,
    magicItems,
    engineEquipmentItems,
  ] = await Promise.all([
    readText('be/src/modules/rules/content-manifest.ts'),
    readText('be/src/modules/rules/p3-item-manifest.ts'),
    readText('be/src/modules/rules/p6-spell-definitions.ts'),
    readText('be/src/modules/rules/p6-monster-definitions.ts'),
    readText('be/src/database/seed/default-scenario.ts'),
    readText('fe/src/features/sessionPlay/utils/executableItems.ts'),
    listSrdSpells(),
    listSrdMonsters(),
    listSrdEquipmentItems(),
    listSrdMagicItems(),
    listSrdEngineEquipment(),
  ]);

  const spellIds = new Set(spells.map((spell) => spell.id));
  const monsterIds = new Set(monsters.map((monster) => monster.id));
  const equipmentItemIds = new Set(equipmentItems.map((item) => item.id));
  const magicItemIds = new Set(magicItems.map((item) => item.id));
  const engineEquipmentItemIds = new Set(engineEquipmentItems.map((item) => item.id));
  const itemIds = new Set([...equipmentItemIds, ...magicItemIds, ...engineEquipmentItemIds]);

  const manifestSpellIds = new Set([
    ...parseStringArrayConst(contentManifestSource, 'P2_EXECUTABLE_SPELL_IDS'),
    ...parseStringArrayConst(p6SpellDefinitionsSource, 'P6_EXECUTABLE_SPELL_IDS'),
  ]);
  const manifestMonsterIds = new Set([
    ...parseStringArrayConst(contentManifestSource, 'P2_EXECUTABLE_MONSTER_IDS'),
    ...parseStringArrayConst(contentManifestSource, 'P3_BASELINE_MONSTER_IDS'),
    ...parseStringArrayConst(p6MonsterDefinitionsSource, 'P6_EXECUTABLE_MONSTER_IDS'),
  ]);
  const manifestItemIds = new Set(parseFunctionWrappedIds(p3ItemManifestSource, [
    'equipment',
    'consumable',
    'magicItem',
  ]));
  const feExecutableItemIds = new Set(
    Array.from(feExecutableItemsSource.matchAll(/'((?:equipment|magic_item)\.[^']+)'/g), (match) => match[1]),
  );
  const scenarioMonsterIds = new Set(
    Array.from(defaultScenarioSource.matchAll(/"((?:monster)\.[^"]+)"/g), (match) => match[1]),
  );
  const scenarioItemIds = new Set(
    Array.from(
      defaultScenarioSource.matchAll(/"((?:equipment|magic_item)\.[A-Za-z0-9_.-]+)"/g),
      (match) => match[1],
    ),
  );

  const missing = [
    ...Array.from(manifestSpellIds)
      .filter((id) => !hasCanonicalId(spellIds, 'spell', id))
      .map((id) => `spell id is not present in srd-data/generated/srd/spells.jsonl: ${id}`),
    ...Array.from(manifestMonsterIds)
      .filter((id) => !hasCanonicalId(monsterIds, 'monster', id))
      .map((id) => `monster id is not present in srd-data/generated/srd/monsters.jsonl: ${id}`),
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
  ];

  if (missing.length) {
    fail('Executable content manifest ids have drifted from SRD data.', missing);
  }

  return {
    executableSpellIds: manifestSpellIds.size,
    executableMonsterIds: manifestMonsterIds.size,
    executableItemIds: manifestItemIds.size,
    feExecutableItemIds: feExecutableItemIds.size,
    scenarioMonsterIds: scenarioMonsterIds.size,
    scenarioItemIds: scenarioItemIds.size,
    legacySpellIds: countLegacyIds(manifestSpellIds, 'spell'),
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

const aliasesByClass = SRD_CLASS_FEATURE_ID_ALIASES;
const presentationIds = parseFeaturePresentationIds(presentationSource);
const beFeatureIds = parseBeClassFeatureIds(ruleCatalogSource);
const canonicalFeatures = buildCanonicalClassFeatureManifest(classes, {
  runtimeFeatureIds: beFeatureIds,
  aliasesByClass,
});

await verifyFePublicSrdSync();
verifyCharacterBuilderFeatureMapping(classes, aliasesByClass, presentationIds, canonicalFeatures);
verifyBeRuleCatalogFeatureIds(beFeatureIds, canonicalFeatures);
const executableContentStats = await verifyExecutableContentIds();
const seedCatalogStats = await verifyBeSeedCatalogAlignment();
const aiCatalogStats = await verifyAiCatalogManifest();

process.stdout.write(
  [
    'Verified SRD data sync.',
    `canonicalClassFeatures=${canonicalFeatures.length}`,
    `beClassFeatures=${beFeatureIds.size}`,
    `fePresentationEntries=${presentationIds.size}`,
    `executableSpells=${executableContentStats.executableSpellIds}`,
    `executableMonsters=${executableContentStats.executableMonsterIds}`,
    `executableItems=${executableContentStats.executableItemIds}`,
    `feExecutableItems=${executableContentStats.feExecutableItemIds}`,
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
