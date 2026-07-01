import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSrdCatalogFingerprint,
  normalizeSrdClassKey,
  SRD_CATALOG_FINGERPRINT_FILES,
} from '../index.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedDir = path.join(packageRoot, 'generated', 'srd');
const engineDir = path.join(packageRoot, 'generated', 'srd-engine');

const requiredFiles = [
  'backend_engine_p0_contracts.json',
  'catalog-fingerprint.json',
  'class-features.json',
  'classes.json',
  'fe-spell-pools.json',
  'fe-usable-items.json',
  'item-labels.json',
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
  'spell-class-lists.json',
  'spells.jsonl',
  'srd_qa_report.json',
];

await Promise.all(requiredFiles.map((fileName) => access(path.join(generatedDir, fileName))));
const requiredEngineFiles = [
  'classes.jsonl',
  'equipment.jsonl',
  'manifest.json',
  'monsters.jsonl',
  'SCHEMA.md',
  'spellcasting_rules.json',
  'spells.jsonl',
];
await Promise.all(requiredEngineFiles.map((fileName) => access(path.join(engineDir, fileName))));

async function readJsonLines(filePath) {
  return (await readFile(filePath, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
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

const mvpSpellIds = [
  'spell.fire_bolt',
  'spell.sacred_flame',
  'spell.magic_missile',
  'spell.cure_wounds',
  'spell.healing_word',
  'spell.shield',
  'spell.bless',
  'spell.guidance',
  'spell.light',
  'spell.sleep',
  'spell.vicious_mockery',
];

const srdSpells = await readJsonLines(path.join(generatedDir, 'spells.jsonl'));
const srdClasses = await readJsonLines(path.join(generatedDir, 'classes.jsonl'));
const srdClassesJson = await readJson(path.join(generatedDir, 'classes.json'));
const spells = await readJsonLines(path.join(engineDir, 'spells.jsonl'));
const spellsById = new Map(spells.map((spell) => [spell.id, spell]));
const classes = await readJsonLines(path.join(engineDir, 'classes.jsonl'));
const classesById = new Map(classes.map((klass) => [klass.id, klass]));
const equipment = await readJsonLines(path.join(engineDir, 'equipment.jsonl'));
const equipmentById = new Map(equipment.map((item) => [item.id, item]));
const classFeatures = JSON.parse(
  await readFile(path.join(generatedDir, 'class-features.json'), 'utf8'),
);
const catalogFingerprint = JSON.parse(
  await readFile(path.join(generatedDir, 'catalog-fingerprint.json'), 'utf8'),
);
const spellClassLists = await readJson(path.join(generatedDir, 'spell-class-lists.json'));
const spellClassListsSource = await readJson(path.join(packageRoot, 'sources', 'spell-class-lists.json'));

if (JSON.stringify(srdClassesJson) !== JSON.stringify(srdClasses)) {
  throw new Error('Generated classes.json is not synced with classes.jsonl.');
}

if (!Array.isArray(classFeatures) || classFeatures.length === 0) {
  throw new Error('Generated class feature manifest is empty.');
}

const classFeaturesMissingSummary = classFeatures.filter((feature) => !feature.summaryKo);
if (classFeaturesMissingSummary.length) {
  throw new Error(
    `Generated class feature manifest contains entries without summaryKo: ${classFeaturesMissingSummary
      .slice(0, 10)
      .map((feature) => feature.id)
      .join(', ')}`,
  );
}

const expectedCatalogFingerprint = await getSrdCatalogFingerprint();
if (JSON.stringify(catalogFingerprint) !== JSON.stringify(expectedCatalogFingerprint)) {
  throw new Error('Generated catalog-fingerprint.json is stale.');
}
const catalogFingerprintPaths = new Set(
  (catalogFingerprint.files ?? []).map((entry) => `${entry.scope}/${entry.path}`),
);
const missingCatalogFingerprintPaths = SRD_CATALOG_FINGERPRINT_FILES.map(
  ({ scope, path: fileName }) => `${scope}/${fileName}`,
).filter(
  (filePath) => !catalogFingerprintPaths.has(filePath),
);
if (missingCatalogFingerprintPaths.length) {
  throw new Error(
    `Generated catalog-fingerprint.json is missing required files: ${missingCatalogFingerprintPaths.join(', ')}`,
  );
}

if (JSON.stringify(spellClassListsSource) !== JSON.stringify(spellClassLists)) {
  throw new Error('Generated spell-class-lists.json is not synced with its source.');
}

const srdSpellLevelsById = new Map(srdSpells.map((spell) => [spell.id, spell.level]));
const srdClassKeys = new Set(
  srdClasses.map((klass) => normalizeSrdClassKey(klass.nameEn ?? klass.id)).filter(Boolean),
);
const classesByKey = spellClassLists.classes ?? {};
const spellClassListErrors = [];

if (spellClassLists.schemaVersion !== 'srd-spell-class-lists-v1') {
  spellClassListErrors.push('spell-class-lists.json schemaVersion must be srd-spell-class-lists-v1');
}
if (!classesByKey || typeof classesByKey !== 'object' || Array.isArray(classesByKey)) {
  spellClassListErrors.push('spell-class-lists.json classes must be an object keyed by class key');
}

for (const [classKey, classSpellList] of Object.entries(classesByKey)) {
  if (!isPlainObject(classSpellList)) {
    spellClassListErrors.push(`spell-class-lists.json ${classKey} entry must be an object`);
    continue;
  }
  if (!srdClassKeys.has(classKey)) {
    spellClassListErrors.push(`spell-class-lists.json class key is not present in generated SRD classes: ${classKey}`);
  }

  const cantrips = classSpellList.cantrips ?? [];
  const spellsByLevel = classSpellList.spellsByLevel ?? {};
  if (!Array.isArray(cantrips)) {
    spellClassListErrors.push(`spell-class-lists.json ${classKey}.cantrips must be an array`);
    continue;
  }
  if (!isPlainObject(spellsByLevel)) {
    spellClassListErrors.push(`spell-class-lists.json ${classKey}.spellsByLevel must be an object`);
    continue;
  }

  const seenIds = new Set();
  for (const spellId of collectSpellClassListIds(classSpellList)) {
    if (seenIds.has(spellId)) {
      spellClassListErrors.push(`spell-class-lists.json ${classKey} contains duplicate spell id: ${spellId}`);
    }
    seenIds.add(spellId);
  }

  for (const spellId of cantrips) {
    if (srdSpellLevelsById.get(spellId) !== 0) {
      spellClassListErrors.push(`spell-class-lists.json ${classKey} cantrip list contains non-cantrip spell: ${spellId}`);
    }
  }

  for (const [rawLevel, spellIds] of Object.entries(spellsByLevel)) {
    if (!Array.isArray(spellIds)) {
      spellClassListErrors.push(`spell-class-lists.json ${classKey}.spellsByLevel.${rawLevel} must be an array`);
      continue;
    }
    const level = Number(rawLevel);
    if (!Number.isInteger(level) || level < 1 || level > 9) {
      spellClassListErrors.push(`spell-class-lists.json ${classKey} has invalid spell level bucket: ${rawLevel}`);
      continue;
    }
    for (const spellId of spellIds) {
      if (srdSpellLevelsById.get(spellId) !== level) {
        spellClassListErrors.push(`spell-class-lists.json ${classKey} level ${level} list contains mismatched spell: ${spellId}`);
      }
    }
  }
}

if (spellClassListErrors.length) {
  throw new Error(
    `Generated spell-class-lists.json is invalid:\n${spellClassListErrors
      .slice(0, 20)
      .map((error) => `  - ${error}`)
      .join('\n')}`,
  );
}

for (const spellId of mvpSpellIds) {
  const spell = spellsById.get(spellId);
  if (!spell) {
    throw new Error(`Missing MVP spell record: ${spellId}`);
  }
  if (!spell.casting?.actionKind || !spell.casting?.resourceCost || !spell.targeting || !spell.resolution) {
    throw new Error(`MVP spell is missing executable spell fields: ${spellId}`);
  }
}

const wizard = classesById.get('class.wizard');
if (!wizard) {
  throw new Error('Missing MVP class rule record: class.wizard');
}

const wizardLevel1 = wizard.levelRules?.find((rule) => rule.level === 1);
if (!wizardLevel1) {
  throw new Error('Wizard class rule is missing level 1 spellcasting data.');
}

const wizardSpellcasting = wizardLevel1.spellcasting;
if (!wizardSpellcasting) {
  throw new Error('Wizard level 1 rule is missing spellcasting data.');
}

const expectedWizardMvpSpellIds = [
  'spell.fire_bolt',
  'spell.light',
  'spell.magic_missile',
  'spell.shield',
  'spell.sleep',
];
const wizardMvpSpellIds = wizard.mvpSpellList?.all ?? [];
for (const spellId of expectedWizardMvpSpellIds) {
  if (!wizardMvpSpellIds.includes(spellId)) {
    throw new Error(`Wizard MVP spell list is missing: ${spellId}`);
  }
  if (!spellsById.has(spellId)) {
    throw new Error(`Wizard MVP spell list references missing spell: ${spellId}`);
  }
}

if (
  wizardLevel1.proficiencyBonus !== 2 ||
  wizardSpellcasting.ability !== 'intelligence' ||
  wizardSpellcasting.cantripsKnown !== 3 ||
  wizardSpellcasting.spellbook?.startingSpellCount !== 6 ||
  wizardSpellcasting.preparedSpells?.minimum !== 1 ||
  wizardSpellcasting.spellSlots?.['1']?.max !== 2 ||
  wizardSpellcasting.arcaneRecovery?.level1RecoveredSlotLevelSum !== 1
) {
  throw new Error('Wizard level 1 spellcasting rule values do not match the SRD MVP contract.');
}

const fighter = classesById.get('class.fighter');
if (!fighter) {
  throw new Error('Missing MVP class rule record: class.fighter');
}

const fighterLevel1 = fighter.levelRules?.find((rule) => rule.level === 1);
if (!fighterLevel1) {
  throw new Error('Fighter class rule is missing level 1 data.');
}

const secondWind = fighterLevel1.classFeatures?.find(
  (feature) => feature.id === 'feature.fighter.second_wind',
);
const fightingStyle = fighterLevel1.classFeatures?.find(
  (feature) => feature.id === 'feature.fighter.fighting_style',
);

if (
  fighter.hitDie !== 'd10' ||
  fighterLevel1.proficiencyBonus !== 2 ||
  fighterLevel1.hitPoints?.level1Formula !== '10 + constitutionModifier' ||
  fighterLevel1.spellcasting !== null ||
  fighterLevel1.proficiencies?.skillChoices?.choose !== 2 ||
  fighterLevel1.features?.includes('action_surge') ||
  fighterLevel1.excludedFeaturesBeforeLevel?.action_surge !== 2 ||
  fighterLevel1.excludedFeaturesBeforeLevel?.martial_archetype !== 3 ||
  fighterLevel1.excludedFeaturesBeforeLevel?.extra_attack !== 5
) {
  throw new Error('Fighter level 1 base rule values do not match the SRD MVP contract.');
}

if (
  !fightingStyle ||
  fightingStyle.selection?.choose !== 1 ||
  fightingStyle.selection?.noDuplicate !== true ||
  fightingStyle.selection?.options?.length !== 6
) {
  throw new Error('Fighter Fighting Style rule is missing one-of-six selection data.');
}

if (
  !secondWind ||
  secondWind.activation?.actionCost !== 'bonus_action' ||
  secondWind.healing?.dice !== '1d10' ||
  secondWind.healing?.bonus !== 'fighterLevel' ||
  secondWind.uses?.max !== 1 ||
  !secondWind.uses?.recharge?.includes('short_rest') ||
  !secondWind.uses?.recharge?.includes('long_rest')
) {
  throw new Error('Fighter Second Wind rule values do not match the SRD MVP contract.');
}

const fighterEquipmentIds = (fighter.equipmentChoiceGroups ?? [])
  .flatMap((group) => group.options ?? [])
  .flatMap((option) => option.items ?? [])
  .map((item) => item.itemId)
  .filter(Boolean);
for (const itemId of fighterEquipmentIds) {
  if (!equipmentById.has(itemId)) {
    throw new Error(`Fighter starting equipment references missing item: ${itemId}`);
  }
}

const ranger = classesById.get('class.ranger');
if (!ranger) {
  throw new Error('Missing MVP class rule record: class.ranger');
}

const rangerLevel1 = ranger.levelRules?.find((rule) => rule.level === 1);
if (!rangerLevel1) {
  throw new Error('Ranger class rule is missing level 1 data.');
}

const favoredEnemy = rangerLevel1.classFeatures?.find(
  (feature) => feature.id === 'feature.ranger.favored_enemy',
);

if (
  ranger.hitDie !== 'd10' ||
  rangerLevel1.proficiencyBonus !== 2 ||
  rangerLevel1.hitPoints?.level1Formula !== '10 + constitutionModifier' ||
  rangerLevel1.spellcasting !== null ||
  Object.keys(rangerLevel1.spellSlots ?? {}).length !== 0 ||
  rangerLevel1.proficiencies?.skillChoices?.choose !== 3 ||
  rangerLevel1.excludedFeaturesBeforeLevel?.spellcasting !== 2 ||
  rangerLevel1.excludedFeaturesBeforeLevel?.fighting_style !== 2 ||
  rangerLevel1.excludedFeaturesBeforeLevel?.ranger_archetype !== 3 ||
  rangerLevel1.excludedFeaturesBeforeLevel?.extra_attack !== 5
) {
  throw new Error('Ranger level 1 base rule values do not match the SRD MVP contract.');
}

if (
  !favoredEnemy ||
  favoredEnemy.selection?.choose !== 1 ||
  favoredEnemy.selection?.options?.length !== 14 ||
  favoredEnemy.effects?.length !== 3 ||
  !favoredEnemy.doesNotAffect?.includes('attack_roll') ||
  !favoredEnemy.doesNotAffect?.includes('damage_roll') ||
  !favoredEnemy.doesNotAffect?.includes('armor_class')
) {
  throw new Error('Ranger Favored Enemy rule values do not match the SRD MVP contract.');
}

const rangerEquipmentIds = [
  ...(ranger.equipmentChoiceGroups ?? [])
    .flatMap((group) => group.options ?? [])
    .flatMap((option) => option.items ?? []),
  ...(ranger.fixedEquipment ?? []),
]
  .map((item) => item.itemId)
  .filter(Boolean);
for (const itemId of rangerEquipmentIds) {
  if (!equipmentById.has(itemId)) {
    throw new Error(`Ranger equipment references missing item: ${itemId}`);
  }
}

const rogue = classesById.get('class.rogue');
if (!rogue) {
  throw new Error('Missing MVP class rule record: class.rogue');
}

const rogueLevel1 = rogue.levelRules?.find((rule) => rule.level === 1);
if (!rogueLevel1) {
  throw new Error('Rogue class rule is missing level 1 data.');
}

const expertise = rogueLevel1.classFeatures?.find(
  (feature) => feature.id === 'feature.rogue.expertise',
);
const sneakAttack = rogueLevel1.classFeatures?.find(
  (feature) => feature.id === 'feature.rogue.sneak_attack',
);
const thievesCant = rogueLevel1.classFeatures?.find(
  (feature) => feature.id === 'feature.rogue.thieves_cant',
);

if (
  rogue.hitDie !== 'd8' ||
  rogueLevel1.proficiencyBonus !== 2 ||
  rogueLevel1.hitPoints?.level1Formula !== '8 + constitutionModifier' ||
  rogueLevel1.spellcasting !== null ||
  Object.keys(rogueLevel1.spellSlots ?? {}).length !== 0 ||
  rogueLevel1.proficiencies?.skillChoices?.choose !== 4 ||
  !rogueLevel1.proficiencies?.tools?.includes('thieves_tools') ||
  rogueLevel1.excludedFeaturesBeforeLevel?.cunning_action !== 2 ||
  rogueLevel1.excludedFeaturesBeforeLevel?.roguish_archetype !== 3
) {
  throw new Error('Rogue level 1 base rule values do not match the SRD MVP contract.');
}

if (
  !expertise ||
  expertise.choice?.choose !== 2 ||
  expertise.effect?.type !== 'double_proficiency_bonus'
) {
  throw new Error('Rogue Expertise rule values do not match the SRD MVP contract.');
}

if (
  !sneakAttack ||
  sneakAttack.damage?.dice !== '1d6' ||
  sneakAttack.limit?.count !== 1 ||
  sneakAttack.limit?.per !== 'turn' ||
  !sneakAttack.requires?.includes('weapon_is_finesse_or_ranged') ||
  sneakAttack.validIfAny?.length !== 2
) {
  throw new Error('Rogue Sneak Attack rule values do not match the SRD MVP contract.');
}

if (
  !thievesCant ||
  thievesCant.type !== 'language_like_feature' ||
  thievesCant.combatEffect !== false ||
  !thievesCant.effects?.includes('message_takes_four_times_longer')
) {
  throw new Error("Rogue Thieves' Cant rule values do not match the SRD MVP contract.");
}

const rogueEquipmentIds = [
  ...(rogue.equipmentChoiceGroups ?? [])
    .flatMap((group) => group.options ?? [])
    .flatMap((option) => option.items ?? []),
  ...(rogue.fixedEquipment ?? []),
]
  .map((item) => item.itemId)
  .filter(Boolean);
for (const itemId of rogueEquipmentIds) {
  if (!equipmentById.has(itemId)) {
    throw new Error(`Rogue equipment references missing item: ${itemId}`);
  }
}

process.stdout.write('Verified generated SRD assets.\n');
