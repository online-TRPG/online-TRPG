import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const generatedSrdDir = path.join(packageRoot, 'generated', 'srd');
const generatedEngineDir = path.join(packageRoot, 'generated', 'srd-engine');

const cache = new Map();
const supportedClassNames = new Map([
  ['Barbarian', 'barbarian'],
  ['Bard', 'bard'],
  ['Cleric', 'cleric'],
  ['Druid', 'druid'],
  ['Fighter', 'fighter'],
  ['Monk', 'monk'],
  ['Paladin', 'paladin'],
  ['Ranger', 'ranger'],
  ['Rogue', 'rogue'],
  ['Sorcerer', 'sorcerer'],
  ['Warlock', 'warlock'],
  ['Wizard', 'wizard'],
]);
const ignoredFeatureLabels = new Set(['능력치 향상', 'ability score improvement', 'asi']);
export const SRD_LEGACY_ID_ALIASES = Object.freeze({
  monster: Object.freeze({
    // P1-era custom encounter id. The canonical SRD creature is the red dragon wyrmling.
    'monster.dragon_whelp': 'monster.red_dragon_wyrmling',
  }),
  spell: Object.freeze({}),
  item: Object.freeze({
    // Early scenario shorthand. The canonical SRD equipment entry is hempen rope, 50 feet.
    'equipment.rope': 'equipment.rope__hempen__50_feet',
  }),
  race: Object.freeze({}),
});
export const SRD_CLASS_FEATURE_ID_ALIASES = Object.freeze({
  barbarian: Object.freeze({
    격노: 'class.barbarian.feature.rage',
    비무장_방어: 'class.barbarian.feature.unarmored_defense',
    무모한_공격: 'class.barbarian.feature.reckless_attack',
    위험_감각: 'class.barbarian.feature.danger_sense',
    원초적_길: 'class.barbarian.feature.primal_path',
    추가_공격: 'class.barbarian.feature.extra_attack',
    빠른_이동: 'class.barbarian.feature.fast_movement',
    야성적_본능: 'class.barbarian.feature.feral_instinct',
    잔혹한_치명타_1주사위: 'class.barbarian.feature.brutal_critical',
    끈질긴_격노: 'class.barbarian.feature.relentless_rage',
    지속되는_격노: 'class.barbarian.feature.persistent_rage',
    굴하지_않는_힘: 'class.barbarian.feature.indomitable_might',
    원초적_투사: 'class.barbarian.feature.primal_champion',
  }),
  bard: Object.freeze({
    주문시전: 'class.bard.feature.spellcasting',
    바드의_고양감: 'class.bard.feature.bardic_inspiration',
    만물박사: 'class.bard.feature.jack_of_all_trades',
    휴식의_노래: 'class.bard.feature.song_of_rest',
    바드_대학: 'class.bard.feature.bard_college',
    전문화: 'class.bard.feature.expertise',
    고양감의_원천: 'class.bard.feature.font_of_inspiration',
    반대매혹: 'class.bard.feature.countercharm',
    바드_대학_기능: 'class.bard.feature.bard_college_feature',
    마법의_비밀: 'class.bard.feature.magical_secrets',
    뛰어난_고양감: 'class.bard.feature.superior_inspiration',
  }),
  cleric: Object.freeze({
    주문시전: 'class.cleric.feature.spellcasting',
    신성_권역: 'class.cleric.feature.divine_domain',
    신성한_영역: 'class.cleric.feature.divine_domain',
    신성_변환: 'class.cleric.feature.channel_divinity',
    신성_권역_기능: 'class.cleric.feature.divine_domain_feature',
    언데드_파괴: 'class.cleric.feature.destroy_undead',
    신성한_개입: 'class.cleric.feature.divine_intervention',
    신성한_개입_향상: 'class.cleric.feature.divine_intervention_improvement',
  }),
  druid: Object.freeze({
    드루이드어: 'class.druid.feature.druidic',
    주문시전: 'class.druid.feature.spellcasting',
    야생_변신: 'class.druid.feature.wild_shape',
    야생_변신_향상: 'class.druid.feature.wild_shape',
    드루이드_서클: 'class.druid.feature.druid_circle',
    영원한_육체: 'class.druid.feature.timeless_body',
    야수_주문: 'class.druid.feature.beast_spells',
    대드루이드: 'class.druid.feature.archdruid',
  }),
  fighter: Object.freeze({
    전투_방식: 'class.fighter.feature.fighting_style',
    재기의_바람: 'class.fighter.feature.second_wind',
    재기의_숨결: 'class.fighter.feature.second_wind',
    행동_연쇄: 'class.fighter.feature.action_surge',
    무술_원형: 'class.fighter.feature.martial_archetype',
    무예_아키타입: 'class.fighter.feature.martial_archetype',
    추가_공격: 'class.fighter.feature.extra_attack',
    불굴: 'class.fighter.feature.indomitable',
  }),
  monk: Object.freeze({
    비무장_방어: 'class.monk.feature.unarmored_defense',
    무술: 'class.monk.feature.martial_arts',
    기: 'class.monk.feature.ki',
    비무장_이동: 'class.monk.feature.unarmored_movement',
    수도_전통: 'class.monk.feature.monastic_tradition',
    수도원_전통: 'class.monk.feature.monastic_tradition',
    투사체_쳐내기: 'class.monk.feature.deflect_missiles',
    투사체_튕겨내기: 'class.monk.feature.deflect_missiles',
    느린_낙하: 'class.monk.feature.slow_fall',
    추가_공격: 'class.monk.feature.extra_attack',
    충격의_일격: 'class.monk.feature.stunning_strike',
    기_강화_일격: 'class.monk.feature.ki_empowered_strikes',
    수도_전통_기능: 'class.monk.feature.monastic_tradition_feature',
    회피: 'class.monk.feature.evasion',
    고요한_정신: 'class.monk.feature.stillness_of_mind',
    순수한_육체: 'class.monk.feature.purity_of_body',
    다이아몬드_영혼: 'class.monk.feature.diamond_soul',
    빈_몸: 'class.monk.feature.empty_body',
    완전한_자아: 'class.monk.feature.perfect_self',
  }),
  paladin: Object.freeze({
    신성한_감각: 'class.paladin.feature.divine_sense',
    안수치료: 'class.paladin.feature.lay_on_hands',
    전투_방식: 'class.paladin.feature.fighting_style',
    주문시전: 'class.paladin.feature.spellcasting',
    신성한_강타: 'class.paladin.feature.divine_smite',
    신성한_건강: 'class.paladin.feature.divine_health',
    신성한_맹세: 'class.paladin.feature.sacred_oath',
    추가_공격: 'class.paladin.feature.extra_attack',
    보호의_오라: 'class.paladin.feature.aura_of_protection',
    용기의_오라: 'class.paladin.feature.aura_of_courage',
    향상된_신성한_강타: 'class.paladin.feature.improved_divine_smite',
    정화의_손길: 'class.paladin.feature.cleansing_touch',
  }),
  ranger: Object.freeze({
    숙적: 'class.ranger.feature.favored_enemy',
    숙적_향상: 'class.ranger.feature.favored_enemy',
    자연_탐험가: 'class.ranger.feature.natural_explorer',
    자연_탐험가_향상: 'class.ranger.feature.natural_explorer',
    전투_방식: 'class.ranger.feature.fighting_style',
    주문시전: 'class.ranger.feature.spellcasting',
    레인저_원형: 'class.ranger.feature.ranger_archetype',
    레인저_아키타입: 'class.ranger.feature.ranger_archetype',
    원시적_감각: 'class.ranger.feature.primeval_awareness',
    원초적_감지: 'class.ranger.feature.primeval_awareness',
    추가_공격: 'class.ranger.feature.extra_attack',
    대지의_발걸음: 'class.ranger.feature.lands_stride',
    눈앞의_은신: 'class.ranger.feature.hide_in_plain_sight',
    사라지기: 'class.ranger.feature.vanish',
    야성_감각: 'class.ranger.feature.feral_senses',
    숙적_처단자: 'class.ranger.feature.foe_slayer',
  }),
  rogue: Object.freeze({
    전문화: 'class.rogue.feature.expertise',
    암습: 'class.rogue.feature.sneak_attack',
    도둑의_은어: 'class.rogue.feature.thieves_cant',
    교활한_행동: 'class.rogue.feature.cunning_action',
    로그_원형: 'class.rogue.feature.roguish_archetype',
    로그_아키타입: 'class.rogue.feature.roguish_archetype',
    불가사의한_회피: 'class.rogue.feature.uncanny_dodge',
    회피: 'class.rogue.feature.evasion',
    믿음직한_재능: 'class.rogue.feature.reliable_talent',
    맹시_감각: 'class.rogue.feature.blindsense',
    미끄러운_정신: 'class.rogue.feature.slippery_mind',
    포착_불가: 'class.rogue.feature.elusive',
    행운의_일격: 'class.rogue.feature.stroke_of_luck',
  }),
  sorcerer: Object.freeze({
    주문시전: 'class.sorcerer.feature.spellcasting',
    소서러_기원: 'class.sorcerer.feature.sorcerous_origin',
    마력의_샘: 'class.sorcerer.feature.font_of_magic',
    메타매직: 'class.sorcerer.feature.metamagic',
    메타매직_추가: 'class.sorcerer.feature.metamagic_improvement',
    소서러적_회복: 'class.sorcerer.feature.sorcerous_restoration',
  }),
  warlock: Object.freeze({
    다른_세계의_후원자: 'class.warlock.feature.otherworldly_patron',
    계약_마법: 'class.warlock.feature.pact_magic',
    섬뜩한_영창: 'class.warlock.feature.eldritch_invocations',
    계약의_은혜: 'class.warlock.feature.pact_boon',
    신비의_비밀_6레벨: 'class.warlock.feature.mystic_arcanum_6',
    신비의_비밀_7레벨: 'class.warlock.feature.mystic_arcanum_7',
    신비의_비밀_8레벨: 'class.warlock.feature.mystic_arcanum_8',
    신비의_비밀_9레벨: 'class.warlock.feature.mystic_arcanum_9',
    섬뜩한_주인: 'class.warlock.feature.eldritch_master',
  }),
  wizard: Object.freeze({
    주문시전: 'class.wizard.feature.spellcasting',
    비전_회복: 'class.wizard.feature.arcane_recovery',
    비전_전통: 'class.wizard.feature.arcane_tradition',
    주문_숙련: 'class.wizard.feature.spell_mastery',
    대표_주문: 'class.wizard.feature.signature_spells',
  }),
});

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function readJsonLines(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function hashFile(filePath) {
  const payload = await readFile(filePath);
  return createHash('sha256').update(payload).digest('hex');
}

function cached(key, loader) {
  if (!cache.has(key)) {
    cache.set(key, loader());
  }
  return cache.get(key);
}

export function normalizeSrdClassKey(className) {
  const raw = String(className ?? '').trim();
  return supportedClassNames.get(raw) ?? raw.toLowerCase().replace(/^class\./, '');
}

export function normalizeSrdFeatureLookupLabel(label) {
  return String(label)
    .trim()
    .replace(/\s+d\d+$/i, '')
    .replace(/\s+\d+회$/i, '')
    .replace(/\s+\d+\/휴식$/i, '')
    .replace(/\s+CR\s*[\d/]+$/i, '')
    .replace(/\s+/g, ' ');
}

export function normalizeSrdFeatureAliasKey(label) {
  return normalizeSrdFeatureLookupLabel(label).replace(/\s+/g, '_');
}

export function splitSrdClassFeatureSummary(summary) {
  return String(summary)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function findSrdClassFeatureReference(classOption, label, level) {
  const normalizedLabel = normalizeSrdFeatureLookupLabel(label);
  const references = classOption?.featureReferences ?? [];
  const levelMatches = references.filter((reference) => {
    const levels = reference.availableAtLevels ?? [];
    return levels.length === 0 || levels.map(String).includes(String(level));
  });
  const candidates = levelMatches.length ? levelMatches : references;

  return (
    candidates.find((reference) => normalizeSrdFeatureLookupLabel(reference.nameKo) === normalizedLabel) ??
    candidates.find((reference) =>
      normalizedLabel.startsWith(normalizeSrdFeatureLookupLabel(reference.nameKo)),
    ) ??
    candidates.find((reference) =>
      normalizeSrdFeatureLookupLabel(reference.nameKo).startsWith(normalizedLabel),
    ) ??
    null
  );
}

export function isIgnoredSrdClassFeatureLabel(label) {
  return ignoredFeatureLabels.has(normalizeSrdFeatureLookupLabel(label).toLowerCase());
}

export function resolveCanonicalSrdId(kind, id) {
  const normalizedKind = String(kind ?? '').trim();
  const normalizedId = String(id ?? '').trim();
  return SRD_LEGACY_ID_ALIASES[normalizedKind]?.[normalizedId] ?? normalizedId;
}

function normalizeAliasLookup(aliasesByClass, classKey, aliasKey) {
  if (!aliasesByClass) return null;
  if (aliasesByClass instanceof Map) {
    const aliases = aliasesByClass.get(classKey);
    return aliases instanceof Map ? aliases.get(aliasKey) ?? null : aliases?.[aliasKey] ?? null;
  }
  return aliasesByClass[classKey]?.[aliasKey] ?? null;
}

export function buildCanonicalClassFeatureManifest(
  classes,
  { runtimeFeatureIds = [], aliasesByClass = null, displayOverridesById = null } = {},
) {
  const runtimeIds = new Set(runtimeFeatureIds);
  const byId = new Map();

  function getDisplayOverride(id) {
    if (!displayOverridesById) return null;
    if (displayOverridesById instanceof Map) {
      return displayOverridesById.get(id) ?? null;
    }
    return displayOverridesById[id] ?? null;
  }

  function listDisplayOverrides() {
    if (!displayOverridesById) return [];
    if (displayOverridesById instanceof Map) {
      return Array.from(displayOverridesById.entries());
    }
    return Object.entries(displayOverridesById);
  }

  function applyDisplayOverride(feature) {
    const displayOverride = getDisplayOverride(feature.id);
    if (!displayOverride) return feature;

    return {
      ...feature,
      nameKo: displayOverride.nameKo || feature.nameKo,
      summaryKo: displayOverride.summaryKo || feature.summaryKo,
    };
  }

  function parseRuntimeFeatureId(id) {
    const classFeature = /^class\.([^.]+)\.feature\.(.+)$/.exec(id);
    if (classFeature) {
      const [, classKey, featureKey] = classFeature;
      return {
        classKey,
        featureKey,
        category: featureKey.startsWith('ability_score_improvement') ? 'asi' : 'class',
      };
    }

    const legacySubclassFeature = /^class\.([^.]+)\.subclass_feature\.(.+)$/.exec(id);
    if (legacySubclassFeature) {
      const [, classKey, featureKey] = legacySubclassFeature;
      return { classKey, featureKey, category: 'subclass' };
    }

    const subclassFeature = /^subclass\.([^.]+)\.[^.]+\.feature\.(.+)$/.exec(id);
    if (subclassFeature) {
      const [, classKey, featureKey] = subclassFeature;
      return { classKey, featureKey, category: 'subclass' };
    }

    return null;
  }

  function upsert(feature) {
    const normalizedFeature = applyDisplayOverride(feature);
    const existing = byId.get(feature.id);
    if (existing) {
      existing.aliases = Array.from(new Set([...existing.aliases, ...(normalizedFeature.aliases ?? [])]));
      existing.availableAtLevels = Array.from(
        new Set([...(existing.availableAtLevels ?? []), ...(normalizedFeature.availableAtLevels ?? [])]),
      ).sort((left, right) => left - right);
      if (!existing.nameKo && normalizedFeature.nameKo) existing.nameKo = normalizedFeature.nameKo;
      if (!existing.summaryKo && normalizedFeature.summaryKo) existing.summaryKo = normalizedFeature.summaryKo;
      if (existing.source !== 'runtime' && normalizedFeature.source === 'runtime') existing.source = 'runtime';
      return existing;
    }

    byId.set(normalizedFeature.id, {
      ...normalizedFeature,
      aliases: normalizedFeature.aliases ?? [],
      availableAtLevels: normalizedFeature.availableAtLevels ?? [normalizedFeature.level],
    });
    return normalizedFeature;
  }

  for (const classOption of classes ?? []) {
    const classKey = normalizeSrdClassKey(classOption.nameEn ?? classOption.id);
    if (!classKey) continue;

    for (const reference of classOption.featureReferences ?? []) {
      const levels = (reference.availableAtLevels ?? [])
        .map((level) => Number.parseInt(String(level), 10))
        .filter((level) => Number.isFinite(level));
      const level = levels[0] ?? 0;
      upsert({
        id: reference.id,
        classKey,
        level,
        nameKo: reference.nameKo,
        category: reference.category ?? 'class',
        summaryKo: reference.summaryKo ?? '',
        source: runtimeIds.has(reference.id) ? 'runtime' : 'srd',
        aliases: [normalizeSrdFeatureAliasKey(reference.nameKo)],
        availableAtLevels: levels,
      });
    }

    for (const levelFeature of classOption.levelFeatures ?? []) {
      const level = Number.parseInt(String(levelFeature.level), 10);
      if (!Number.isFinite(level)) continue;

      for (const label of splitSrdClassFeatureSummary(levelFeature.features)) {
        if (isIgnoredSrdClassFeatureLabel(label)) continue;

        const aliasKey = normalizeSrdFeatureAliasKey(label);
        const aliasId = normalizeAliasLookup(aliasesByClass, classKey, aliasKey);
        const reference = findSrdClassFeatureReference(classOption, label, level);
        if (reference) {
          if (aliasId && aliasId !== reference.id) {
            const referenceLevels = (reference.availableAtLevels ?? [])
              .map((referenceLevel) => Number.parseInt(String(referenceLevel), 10))
              .filter((referenceLevel) => Number.isFinite(referenceLevel));
            upsert({
              id: aliasId,
              classKey,
              level,
              nameKo: reference.nameKo ?? normalizeSrdFeatureLookupLabel(label),
              category: reference.category ?? (aliasId.includes('.subclass') ? 'subclass' : 'class'),
              summaryKo: reference.summaryKo ?? '',
              source: runtimeIds.has(aliasId) ? 'runtime' : 'derived',
              aliases: [aliasKey, reference.id],
              availableAtLevels: referenceLevels.length ? referenceLevels : [level],
            });
          }
          continue;
        }

        if (!aliasId) continue;

        upsert({
          id: aliasId,
          classKey,
          level,
          nameKo: normalizeSrdFeatureLookupLabel(label),
          category: aliasId.includes('.subclass') ? 'subclass' : 'class',
          summaryKo: '',
          source: runtimeIds.has(aliasId) ? 'runtime' : 'derived',
          aliases: [aliasKey],
          availableAtLevels: [level],
        });
      }
    }
  }

  for (const id of runtimeIds) {
    const parsed = parseRuntimeFeatureId(id);
    if (!parsed) continue;
    const { classKey, featureKey, category } = parsed;
    const isAsi = category === 'asi';
    upsert({
      id,
      classKey,
      level: isAsi ? Number(featureKey.split('_').at(-1)) || 4 : 0,
      nameKo: isAsi ? '능력치 향상' : featureKey,
      category,
      summaryKo: isAsi ? '능력치 하나를 2점 올리거나 Feat를 선택하는 성장 특성입니다.' : '',
      source: 'runtime',
      aliases: [featureKey],
      availableAtLevels: [],
    });
  }

  for (const [id, displayOverride] of listDisplayOverrides()) {
    if (byId.has(id)) continue;
    const parsed = parseRuntimeFeatureId(id);
    if (!parsed) continue;
    const { classKey, featureKey, category } = parsed;
    upsert({
      id,
      classKey,
      level: 0,
      nameKo: displayOverride.nameKo || featureKey,
      category,
      summaryKo: displayOverride.summaryKo ?? '',
      source: runtimeIds.has(id) ? 'runtime' : 'derived',
      aliases: [featureKey, normalizeSrdFeatureAliasKey(displayOverride.nameKo || featureKey)],
      availableAtLevels: [],
    });
  }

  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}

export async function listCanonicalClassFeatures(options = {}) {
  return buildCanonicalClassFeatureManifest(await listSrdClasses(), options);
}

export function getGeneratedSrdDir() {
  return generatedSrdDir;
}

export function getGeneratedSrdEngineDir() {
  return generatedEngineDir;
}

export function listSrdClasses() {
  return cached('srd/classes', () => readJsonLines(path.join(generatedSrdDir, 'classes.jsonl')));
}

export function listSrdRaces() {
  return cached('srd/races', () => readJsonLines(path.join(generatedSrdDir, 'races.jsonl')));
}

export function listSrdSpells() {
  return cached('srd/spells', () => readJsonLines(path.join(generatedSrdDir, 'spells.jsonl')));
}

export function listSrdMonsters() {
  return cached('srd/monsters', () => readJsonLines(path.join(generatedSrdDir, 'monsters.jsonl')));
}

export function listSrdEquipmentItems() {
  return cached('srd/equipment_items', () =>
    readJsonLines(path.join(generatedSrdDir, 'equipment_items.jsonl')),
  );
}

export function listSrdMagicItems() {
  return cached('srd/magic_items', () => readJsonLines(path.join(generatedSrdDir, 'magic_items.jsonl')));
}

export function getSrdSourceManifest() {
  return cached('srd/source_manifest', () => readJson(path.join(generatedSrdDir, 'source_manifest.json')));
}

export function getSrdSpellClassLists() {
  return cached('srd/spell-class-lists', () =>
    readJson(path.join(generatedSrdDir, 'spell-class-lists.json')),
  );
}

export function listSrdEngineClasses() {
  return cached('srd-engine/classes', () =>
    readJsonLines(path.join(generatedEngineDir, 'classes.jsonl')),
  );
}

export function listSrdEngineSpells() {
  return cached('srd-engine/spells', () => readJsonLines(path.join(generatedEngineDir, 'spells.jsonl')));
}

export function listSrdEngineEquipment() {
  return cached('srd-engine/equipment', () =>
    readJsonLines(path.join(generatedEngineDir, 'equipment.jsonl')),
  );
}

export function listSrdEngineMonsters() {
  return cached('srd-engine/monsters', () =>
    readJsonLines(path.join(generatedEngineDir, 'monsters.jsonl')),
  );
}

export function getSrdEngineManifest() {
  return cached('srd-engine/manifest', () =>
    readJson(path.join(generatedEngineDir, 'manifest.json')),
  );
}

export const SRD_CATALOG_FINGERPRINT_FILES = [
  { scope: 'srd', path: 'classes.json' },
  { scope: 'srd', path: 'classes.jsonl' },
  { scope: 'srd', path: 'races.jsonl' },
  { scope: 'srd', path: 'spells.jsonl' },
  { scope: 'srd', path: 'monsters.jsonl' },
  { scope: 'srd', path: 'equipment_items.jsonl' },
  { scope: 'srd', path: 'magic_items.jsonl' },
  { scope: 'srd', path: 'class-features.json' },
  { scope: 'srd', path: 'spell-class-lists.json' },
  { scope: 'srd', path: 'fe-spell-pools.json' },
  { scope: 'srd', path: 'fe-usable-items.json' },
  { scope: 'srd', path: 'item-labels.json' },
  { scope: 'srd', path: 'source_manifest.json' },
  { scope: 'srd-engine', path: 'classes.jsonl' },
  { scope: 'srd-engine', path: 'spells.jsonl' },
  { scope: 'srd-engine', path: 'equipment.jsonl' },
  { scope: 'srd-engine', path: 'monsters.jsonl' },
  { scope: 'srd-engine', path: 'spellcasting_rules.json' },
  { scope: 'srd-engine', path: 'manifest.json' },
];

export function getSrdCatalogFingerprint() {
  return cached('srd/catalog-fingerprint', async () => {
    const files = [];

    for (const { scope, path: fileName } of SRD_CATALOG_FINGERPRINT_FILES) {
      const baseDir = scope === 'srd' ? generatedSrdDir : generatedEngineDir;
      files.push({
        scope,
        path: fileName,
        sha256: await hashFile(path.join(baseDir, fileName)),
      });
    }

    const payload = JSON.stringify(files);
    return {
      schemaVersion: 'srd-catalog-fingerprint-v1',
      sha256: createHash('sha256').update(payload).digest('hex'),
      files,
    };
  });
}
