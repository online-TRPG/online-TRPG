import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const generatedDir = path.join(repoRoot, 'srd-data', 'generated', 'srd');
const publicDir = path.join(repoRoot, 'fe', 'public');
const publicSrdDir = path.join(publicDir, 'srd');
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

async function writeJson(filePath, payload) {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

await ensureDir(publicSrdDir);
await ensureDir(publicRulebookDir);

await copyFile(
  path.join(generatedDir, 'rulebook.json'),
  path.join(publicRulebookDir, 'dnd5e.json'),
);

await writeJson(path.join(publicSrdDir, 'classes.json'), await readJsonLines('classes.jsonl'));
await writeJson(path.join(publicSrdDir, 'races.json'), await readJsonLines('races.jsonl'));
await writeJson(path.join(publicSrdDir, 'monsters.json'), await readJsonLines('monsters.jsonl'));
await writeJson(path.join(publicSrdDir, 'spells.json'), await readJsonLines('spells.jsonl'));
await writeJson(path.join(publicSrdDir, 'items.json'), {
  equipmentItems: await readJsonLines('equipment_items.jsonl'),
  magicItems: await readJsonLines('magic_items.jsonl'),
});

process.stdout.write('Synced generated SRD assets into fe/public.\n');
