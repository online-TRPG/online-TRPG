import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCanonicalClassFeatureManifest,
  getSrdCatalogFingerprint,
  normalizeSrdClassKey,
  SRD_CLASS_FEATURE_ID_ALIASES,
} from '../index.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '..');
const generatedSrdDir = path.join(packageRoot, 'generated', 'srd');

async function readJsonLines(fileName) {
  const raw = await readFile(path.join(generatedSrdDir, fileName), 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function writeJson(fileName, payload) {
  await writeFile(
    path.join(generatedSrdDir, fileName),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
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

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectSpellClassListIds(classSpellList) {
  return [
    ...(classSpellList.cantrips ?? []),
    ...Object.values(classSpellList.spellsByLevel ?? {}).flat(),
  ];
}

function validateSpellClassListsSource(spellClassLists, { classes, spells }) {
  if (!isPlainObject(spellClassLists)) {
    throw new Error('srd-data/sources/spell-class-lists.json must be a JSON object.');
  }
  if (spellClassLists.schemaVersion !== 'srd-spell-class-lists-v1') {
    throw new Error('spell-class-lists.json schemaVersion must be srd-spell-class-lists-v1.');
  }
  if (!isPlainObject(spellClassLists.classes)) {
    throw new Error('spell-class-lists.json classes must be an object keyed by class key.');
  }

  const srdClassKeys = new Set(
    classes.map((klass) => normalizeSrdClassKey(klass.nameEn ?? klass.id)).filter(Boolean),
  );
  const spellLevelsById = new Map(spells.map((spell) => [spell.id, spell.level]));
  const errors = [];

  for (const [classKey, classSpellList] of Object.entries(spellClassLists.classes)) {
    if (!isPlainObject(classSpellList)) {
      errors.push(`${classKey} entry must be an object`);
      continue;
    }
    if (!srdClassKeys.has(classKey)) {
      errors.push(`${classKey} is not present in generated SRD classes`);
    }

    const cantrips = classSpellList.cantrips ?? [];
    const spellsByLevel = classSpellList.spellsByLevel ?? {};
    if (!Array.isArray(cantrips)) {
      errors.push(`${classKey}.cantrips must be an array`);
      continue;
    }
    if (!isPlainObject(spellsByLevel)) {
      errors.push(`${classKey}.spellsByLevel must be an object`);
      continue;
    }

    const seenIds = new Set();
    for (const spellId of collectSpellClassListIds(classSpellList)) {
      if (!spellLevelsById.has(spellId)) {
        errors.push(`${classKey} contains unknown spell id: ${spellId}`);
      }
      if (seenIds.has(spellId)) {
        errors.push(`${classKey} contains duplicate spell id: ${spellId}`);
      }
      seenIds.add(spellId);
    }

    for (const spellId of cantrips) {
      if (spellLevelsById.get(spellId) !== 0) {
        errors.push(`${classKey}.cantrips contains non-cantrip spell: ${spellId}`);
      }
    }

    for (const [rawLevel, spellIds] of Object.entries(spellsByLevel)) {
      if (!Array.isArray(spellIds)) {
        errors.push(`${classKey}.spellsByLevel.${rawLevel} must be an array`);
        continue;
      }
      const level = Number(rawLevel);
      if (!Number.isInteger(level) || level < 1 || level > 9) {
        errors.push(`${classKey} has invalid spell level bucket: ${rawLevel}`);
        continue;
      }
      for (const spellId of spellIds) {
        if (spellLevelsById.get(spellId) !== level) {
          errors.push(`${classKey}.spellsByLevel.${rawLevel} contains mismatched spell: ${spellId}`);
        }
      }
    }
  }

  if (errors.length) {
    throw new Error(
      `srd-data/sources/spell-class-lists.json is invalid:\n${errors
        .slice(0, 20)
        .map((error) => `  - ${error}`)
        .join('\n')}`,
    );
  }
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

const classes = await readJsonLines('classes.jsonl');
const spells = await readJsonLines('spells.jsonl');
const equipmentItems = await readJsonLines('equipment_items.jsonl');
const magicItems = await readJsonLines('magic_items.jsonl');
const ruleCatalogSource = await readText('be/src/modules/rules/rule-catalog.service.ts');
const classFeatureDisplayOverrides = await readJson('srd-data/overrides/class-feature-summaries.json');
const subclassFeatureRows = parseBeSubclassFeatureRows(ruleCatalogSource);
const generatedSubclassFeatureDisplayOverrides = buildSubclassFeatureDisplayOverrides(
  classes,
  subclassFeatureRows,
);
const feSpellPools = await readJson('srd-data/overrides/fe-spell-pools.json');
const feUsableItems = await readJson('srd-data/overrides/fe-usable-items.json');
const spellClassLists = await readJson('srd-data/sources/spell-class-lists.json');
const runtimeFeatureIds = new Set([
  ...parseBeClassFeatureIds(ruleCatalogSource),
  ...subclassFeatureRows.flatMap((row) => [row.id, row.legacyId]),
]);
await writeJson(
  'class-features.json',
  buildCanonicalClassFeatureManifest(classes, {
    runtimeFeatureIds,
    aliasesByClass: SRD_CLASS_FEATURE_ID_ALIASES,
    displayOverridesById: {
      ...generatedSubclassFeatureDisplayOverrides,
      ...classFeatureDisplayOverrides,
    },
  }),
);
await writeJson('classes.json', classes);
await writeJson('fe-spell-pools.json', feSpellPools);
await writeJson('fe-usable-items.json', feUsableItems);
await writeJson('item-labels.json', buildItemLabelMap(equipmentItems, magicItems));
validateSpellClassListsSource(spellClassLists, { classes, spells });
await writeJson('spell-class-lists.json', spellClassLists);
await writeJson('catalog-fingerprint.json', await getSrdCatalogFingerprint());

process.stdout.write('Generated canonical SRD artifacts.\n');
