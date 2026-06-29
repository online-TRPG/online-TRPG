import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(packageRoot, 'sources');
const generatedSrdDir = path.join(packageRoot, 'generated', 'srd');
const apiBaseUrl = 'https://www.dnd5eapi.co';
const spellListUrl = `${apiBaseUrl}/api/2014/spells`;

const srdClassKeys = new Set([
  'bard',
  'cleric',
  'druid',
  'paladin',
  'ranger',
  'sorcerer',
  'warlock',
  'wizard',
]);

async function readJsonLines(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function spellIdFromApiIndex(index) {
  return `spell.${String(index).replace(/-/g, '_')}`;
}

function emptyClassList() {
  return {
    cantrips: [],
    spellsByLevel: Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [String(index + 1), []]),
    ),
  };
}

function compactClassList(classList) {
  return {
    ...(classList.cantrips.length ? { cantrips: classList.cantrips } : {}),
    spellsByLevel: Object.fromEntries(
      Object.entries(classList.spellsByLevel).filter(([, spellIds]) => spellIds.length),
    ),
  };
}

const localSpells = await readJsonLines(path.join(generatedSrdDir, 'spells.jsonl'));
const localSpellsById = new Map(localSpells.map((spell) => [spell.id, spell]));
const apiSpellList = await fetchJson(spellListUrl);
const apiSpellDetails = await Promise.all(
  (apiSpellList.results ?? []).map((spell) => fetchJson(`${apiBaseUrl}${spell.url}`)),
);
const externalUpdatedAtMax = apiSpellDetails
  .map((spell) => spell.updated_at)
  .filter(Boolean)
  .sort()
  .at(-1);

const missing = [];
const classes = Object.fromEntries(
  Array.from(srdClassKeys)
    .sort()
    .map((classKey) => [classKey, emptyClassList()]),
);

for (const apiSpell of apiSpellDetails) {
  const spellId = spellIdFromApiIndex(apiSpell.index);
  const localSpell = localSpellsById.get(spellId);
  if (!localSpell) {
    missing.push(`API spell is missing from local catalog: ${apiSpell.index} -> ${spellId}`);
    continue;
  }
  if (localSpell.level !== apiSpell.level) {
    missing.push(`API/local level mismatch for ${spellId}: api=${apiSpell.level}, local=${localSpell.level}`);
    continue;
  }

  for (const classRef of apiSpell.classes ?? []) {
    const classKey = classRef.index;
    if (!srdClassKeys.has(classKey)) continue;
    if (apiSpell.level === 0) {
      classes[classKey].cantrips.push(spellId);
    } else {
      classes[classKey].spellsByLevel[String(apiSpell.level)].push(spellId);
    }
  }
}

for (const spellId of localSpellsById.keys()) {
  const apiIndex = spellId.replace(/^spell\./, '').replace(/_/g, '-');
  if (!apiSpellDetails.some((spell) => spell.index === apiIndex)) {
    missing.push(`Local spell is missing from API catalog: ${spellId}`);
  }
}

if (missing.length) {
  throw new Error(
    `Cannot import spell class lists from dnd5eapi:\n${missing
      .slice(0, 50)
      .map((error) => `  - ${error}`)
      .join('\n')}`,
  );
}

const payload = {
  schemaVersion: 'srd-spell-class-lists-v1',
  source: {
    kind: 'external-srd-api',
    name: 'D&D 5e API 2014 SRD spells',
    url: spellListUrl,
    externalUpdatedAtMax,
    localSpellCount: localSpells.length,
    externalSpellCount: apiSpellDetails.length,
  },
  classes: Object.fromEntries(
    Object.entries(classes).map(([classKey, classList]) => {
      classList.cantrips.sort();
      for (const spellIds of Object.values(classList.spellsByLevel)) {
        spellIds.sort();
      }
      return [classKey, compactClassList(classList)];
    }),
  ),
};

await mkdir(sourceDir, { recursive: true });
await writeFile(
  path.join(sourceDir, 'spell-class-lists.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
  'utf8',
);

process.stdout.write(
  `Imported ${apiSpellDetails.length} spell records into srd-data/sources/spell-class-lists.json.\n`,
);
