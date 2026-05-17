import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedDir = path.join(packageRoot, 'generated', 'srd');
const engineDir = path.join(packageRoot, 'generated', 'srd-engine');

const requiredFiles = [
  'backend_engine_p0_contracts.json',
  'classes.jsonl',
  'conditions.jsonl',
  'equipment.jsonl',
  'equipment_items.jsonl',
  'interpreter_backend_handoff_cases.json',
  'magic_items.jsonl',
  'monsters.jsonl',
  'narrator_input_fixtures.json',
  'races.jsonl',
  'rule_fragments.jsonl',
  'rulebook.json',
  'rules_cards.jsonl',
  'rules_hooks.json',
  'source_manifest.json',
  'spells.jsonl',
  'srd_qa_report.json',
];

await Promise.all(requiredFiles.map((fileName) => access(path.join(generatedDir, fileName))));
await Promise.all(
  ['equipment.jsonl', 'manifest.json', 'monsters.jsonl', 'SCHEMA.md', 'spells.jsonl'].map((fileName) =>
    access(path.join(engineDir, fileName)),
  ),
);

process.stdout.write('Verified generated SRD assets.\n');
