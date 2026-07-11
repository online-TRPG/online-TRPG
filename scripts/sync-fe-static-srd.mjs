import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const generatedDir = path.join(repoRoot, 'srd-data', 'generated', 'srd');
const publicDir = path.join(repoRoot, 'fe', 'public');
const publicSrdDir = path.join(publicDir, 'srd');
const publicClassFeatureDir = path.join(publicSrdDir, 'class-features');
const publicRulebookDir = path.join(publicDir, 'rulebooks');

async function ensureDir(targetDir) {
  await mkdir(targetDir, { recursive: true });
}

async function readJsonLines(fileName) {
  const filePath = path.join(generatedDir, fileName);
  const raw = await readFile(filePath, 'utf8');

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withFileRetry(operation) {
  const retryableCodes = new Set(['EBUSY', 'EACCES', 'EPERM', 'UNKNOWN']);
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code) || attempt === 4) {
        throw error;
      }
      await sleep(75 * (attempt + 1));
    }
  }
  throw lastError;
}

async function writeJson(filePath, payload) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await withFileRetry(() => writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8'));
  try {
    await withFileRetry(() => rename(tempPath, filePath));
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

await ensureDir(publicSrdDir);
await ensureDir(publicClassFeatureDir);
await ensureDir(publicRulebookDir);

await copyFile(
  path.join(generatedDir, 'rulebook.json'),
  path.join(publicRulebookDir, 'dnd5e.json'),
);

await copyFile(
  path.join(generatedDir, 'classes.json'),
  path.join(publicSrdDir, 'classes.json'),
);
await copyFile(
  path.join(generatedDir, 'class-features.json'),
  path.join(publicSrdDir, 'class-features.json'),
);
const classFeatures = JSON.parse(
  await readFile(path.join(generatedDir, 'class-features.json'), 'utf8'),
);
const classFeaturesByKey = new Map();
for (const feature of classFeatures) {
  const classKey = typeof feature.classKey === 'string' ? feature.classKey.trim().toLowerCase() : '';
  if (!classKey) continue;
  const entries = classFeaturesByKey.get(classKey) ?? [];
  entries.push(feature);
  classFeaturesByKey.set(classKey, entries);
}
await Promise.all(
  Array.from(classFeaturesByKey.entries()).map(([classKey, entries]) =>
    writeJson(path.join(publicClassFeatureDir, `${classKey}.json`), entries),
  ),
);
await copyFile(
  path.join(generatedDir, 'fe-spell-pools.json'),
  path.join(publicSrdDir, 'fe-spell-pools.json'),
);
await copyFile(
  path.join(generatedDir, 'fe-usable-items.json'),
  path.join(publicSrdDir, 'fe-usable-items.json'),
);
await copyFile(
  path.join(generatedDir, 'item-labels.json'),
  path.join(publicSrdDir, 'item-labels.json'),
);
await copyFile(
  path.join(generatedDir, 'catalog-fingerprint.json'),
  path.join(publicSrdDir, 'catalog-fingerprint.json'),
);
await copyFile(
  path.join(generatedDir, 'spell-class-lists.json'),
  path.join(publicSrdDir, 'spell-class-lists.json'),
);
await writeJson(path.join(publicSrdDir, 'races.json'), await readJsonLines('races.jsonl'));
await writeJson(path.join(publicSrdDir, 'monsters.json'), await readJsonLines('monsters.jsonl'));
await writeJson(path.join(publicSrdDir, 'spells.json'), await readJsonLines('spells.jsonl'));
await writeJson(path.join(publicSrdDir, 'items.json'), {
  equipmentItems: await readJsonLines('equipment_items.jsonl'),
  magicItems: await readJsonLines('magic_items.jsonl'),
});

process.stdout.write('Synced generated SRD assets into fe/public.\n');
