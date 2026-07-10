import type {
  RuleCatalogReferenceDto,
  SessionCharacterResponseDto,
} from '@trpg/shared-types';
import { normalizeSrdCharacterClassKey, resolvePreparedSpellAbility } from '@trpg/srd-data/rules';

export type SpellFilter =
  | 'all'
  | 'cantrip'
  | 'level1'
  | 'level2'
  | 'level3'
  | 'level4'
  | 'level5'
  | 'level6'
  | 'level7'
  | 'level8'
  | 'level9';

export type CombatSpellAction = {
  label: string;
  spellId: string;
  level?: number;
};

export type CombatSpellSlotResource = {
  remaining: number;
  total: number;
};

export type CombatSpellActionCostKind = 'action' | 'bonus' | 'reaction';
export type CombatSpellLegacyTargetKind = 'token' | 'point' | 'none';

type CombatSpellTargetParticipant = {
  isAlive: boolean;
  isHostile: boolean;
};

export type P3CombatSpellMetadata = {
  id: string;
  label: string;
  level: number;
  rangeFt: number;
  targeting: 'self' | 'token' | 'point';
  targetDisposition?: 'ally' | 'enemy' | 'any';
  allowDefeated?: boolean;
};

export type CombatCatalogSpellMetadata = {
  level?: number;
  rangeFt?: number | null;
  targetingType?: string | null;
};

export const p3CombatSpellMetadata: P3CombatSpellMetadata[] = [
  { id: 'spell.blade_ward', label: 'Blade Ward', level: 0, rangeFt: 0, targeting: 'self' },
  { id: 'spell.dancing_lights', label: 'Dancing Lights', level: 0, rangeFt: 120, targeting: 'point' },
  { id: 'spell.eldritch_blast', label: 'Eldritch Blast', level: 0, rangeFt: 120, targeting: 'token', targetDisposition: 'enemy' },
  { id: 'spell.friends', label: 'Friends', level: 0, rangeFt: 0, targeting: 'self' },
  { id: 'spell.mending', label: 'Mending', level: 0, rangeFt: 5, targeting: 'token', targetDisposition: 'any' },
  { id: 'spell.message', label: 'Message', level: 0, rangeFt: 120, targeting: 'token', targetDisposition: 'any' },
  { id: 'spell.poison_spray', label: 'Poison Spray', level: 0, rangeFt: 10, targeting: 'token', targetDisposition: 'enemy' },
  { id: 'spell.produce_flame', label: 'Produce Flame', level: 0, rangeFt: 30, targeting: 'token', targetDisposition: 'enemy' },
  { id: 'spell.resistance', label: 'Resistance', level: 0, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.spare_the_dying', label: 'Spare the Dying', level: 0, rangeFt: 5, targeting: 'token', targetDisposition: 'ally', allowDefeated: true },
  { id: 'spell.alarm', label: 'Alarm', level: 1, rangeFt: 30, targeting: 'point' },
  { id: 'spell.animal_friendship', label: 'Animal Friendship', level: 1, rangeFt: 30, targeting: 'token', targetDisposition: 'any' },
  { id: 'spell.armor_of_agathys', label: 'Armor of Agathys', level: 1, rangeFt: 0, targeting: 'self' },
  { id: 'spell.color_spray', label: 'Color Spray', level: 1, rangeFt: 15, targeting: 'point' },
  { id: 'spell.comprehend_languages', label: 'Comprehend Languages', level: 1, rangeFt: 0, targeting: 'self' },
  { id: 'spell.create_or_destroy_water', label: 'Create or Destroy Water', level: 1, rangeFt: 30, targeting: 'point' },
  { id: 'spell.expeditious_retreat', label: 'Expeditious Retreat', level: 1, rangeFt: 0, targeting: 'self' },
  { id: 'spell.false_life', label: 'False Life', level: 1, rangeFt: 0, targeting: 'self' },
  { id: 'spell.find_familiar', label: 'Find Familiar', level: 1, rangeFt: 5, targeting: 'point' },
  { id: 'spell.goodberry', label: 'Goodberry', level: 1, rangeFt: 0, targeting: 'self' },
  { id: 'spell.jump', label: 'Jump', level: 1, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.mage_armor', label: 'Mage Armor', level: 1, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.alter_self', label: 'Alter Self', level: 2, rangeFt: 0, targeting: 'self' },
  { id: 'spell.blur', label: 'Blur', level: 2, rangeFt: 0, targeting: 'self' },
  { id: 'spell.darkvision', label: 'Darkvision', level: 2, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.enhance_ability', label: 'Enhance Ability', level: 2, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.enlarge_reduce', label: 'Enlarge/Reduce', level: 2, rangeFt: 30, targeting: 'token', targetDisposition: 'any' },
  { id: 'spell.flaming_sphere', label: 'Flaming Sphere', level: 2, rangeFt: 60, targeting: 'point' },
  { id: 'spell.gust_of_wind', label: 'Gust of Wind', level: 2, rangeFt: 60, targeting: 'point' },
  { id: 'spell.heat_metal', label: 'Heat Metal', level: 2, rangeFt: 60, targeting: 'token', targetDisposition: 'enemy' },
  { id: 'spell.levitate', label: 'Levitate', level: 2, rangeFt: 60, targeting: 'token', targetDisposition: 'any' },
  { id: 'spell.locate_object', label: 'Locate Object', level: 2, rangeFt: 0, targeting: 'self' },
  { id: 'spell.mirror_image', label: 'Mirror Image', level: 2, rangeFt: 0, targeting: 'self' },
  { id: 'spell.spider_climb', label: 'Spider Climb', level: 2, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.call_lightning', label: 'Call Lightning', level: 3, rangeFt: 120, targeting: 'point' },
  { id: 'spell.fear', label: 'Fear', level: 3, rangeFt: 30, targeting: 'point' },
  { id: 'spell.gaseous_form', label: 'Gaseous Form', level: 3, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.plant_growth', label: 'Plant Growth', level: 3, rangeFt: 150, targeting: 'point' },
  { id: 'spell.protection_from_energy', label: 'Protection from Energy', level: 3, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.sleet_storm', label: 'Sleet Storm', level: 3, rangeFt: 150, targeting: 'point' },
  { id: 'spell.slow', label: 'Slow', level: 3, rangeFt: 120, targeting: 'point' },
  { id: 'spell.water_walk', label: 'Water Walk', level: 3, rangeFt: 30, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.blight', label: 'Blight', level: 4, rangeFt: 30, targeting: 'token', targetDisposition: 'enemy' },
  { id: 'spell.death_ward', label: 'Death Ward', level: 4, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.dimension_door', label: 'Dimension Door', level: 4, rangeFt: 500, targeting: 'point' },
  { id: 'spell.freedom_of_movement', label: 'Freedom of Movement', level: 4, rangeFt: 5, targeting: 'token', targetDisposition: 'ally' },
  { id: 'spell.ice_storm', label: 'Ice Storm', level: 4, rangeFt: 300, targeting: 'point' },
  { id: 'spell.locate_creature', label: 'Locate Creature', level: 4, rangeFt: 0, targeting: 'self' },
  { id: 'spell.phantasmal_killer', label: 'Phantasmal Killer', level: 4, rangeFt: 120, targeting: 'token', targetDisposition: 'enemy' },
  { id: 'spell.wall_of_fire', label: 'Wall of Fire', level: 4, rangeFt: 120, targeting: 'point' },
];

export const p3CombatSpellMetadataById = new Map(
  p3CombatSpellMetadata.map((spell) => [spell.id, spell] as const)
);

const mvpSpellLabels = [
  'Acid Splash',
  'Guidance',
  'Mage Hand',
  'Minor Illusion',
  'Shocking Grasp',
  'Chill Touch',
  'Fire Bolt',
  'Ray of Frost',
  'Sacred Flame',
  'Light',
  'Detect Magic',
  'Bless',
  'Bane',
  'Magic Missile',
  'Burning Hands',
  'Thunderwave',
  'Entangle',
  'Cure Wounds',
  'Guiding Bolt',
  'Inflict Wounds',
  'Healing Word',
  'Command',
  'Shield',
  'Sleep',
  'Hold Person',
  'Web',
  'Misty Step',
  'Scorching Ray',
  'Fireball',
  'Dispel Magic',
  'Charm Person',
  'Faerie Fire',
  'Feather Fall',
  'Fog Cloud',
  'Grease',
  'Heroism',
  "Hunter's Mark",
  'Longstrider',
  'Aid',
  'Blindness/Deafness',
  'Darkness',
  'Invisibility',
  'Lesser Restoration',
  'Moonbeam',
  'Spiritual Weapon',
  'Counterspell',
  'Fly',
  'Haste',
  'Lightning Bolt',
  'Revivify',
  ...p3CombatSpellMetadata.map((spell) => spell.label),
];

const mvpSpellIdsByLabel: Record<string, string> = {
  'Acid Splash': 'spell.acid_splash',
  Guidance: 'spell.guidance',
  'Mage Hand': 'spell.mage_hand',
  'Minor Illusion': 'spell.minor_illusion',
  'Shocking Grasp': 'spell.shocking_grasp',
  'Chill Touch': 'spell.chill_touch',
  'Fire Bolt': 'spell.fire_bolt',
  'Ray of Frost': 'spell.ray_of_frost',
  'Sacred Flame': 'spell.sacred_flame',
  Light: 'spell.light',
  'Detect Magic': 'spell.detect_magic',
  Bless: 'spell.bless',
  Bane: 'spell.bane',
  'Magic Missile': 'spell.magic_missile',
  'Burning Hands': 'spell.burning_hands',
  Thunderwave: 'spell.thunderwave',
  Entangle: 'spell.entangle',
  'Cure Wounds': 'spell.cure_wounds',
  'Guiding Bolt': 'spell.guiding_bolt',
  'Inflict Wounds': 'spell.inflict_wounds',
  'Healing Word': 'spell.healing_word',
  Command: 'spell.command',
  Shield: 'spell.shield',
  Sleep: 'spell.sleep',
  'Hold Person': 'spell.hold_person',
  Web: 'spell.web',
  'Misty Step': 'spell.misty_step',
  'Scorching Ray': 'spell.scorching_ray',
  Fireball: 'spell.fireball',
  'Dispel Magic': 'spell.dispel_magic',
  'Charm Person': 'spell.charm_person',
  'Faerie Fire': 'spell.faerie_fire',
  'Feather Fall': 'spell.feather_fall',
  'Fog Cloud': 'spell.fog_cloud',
  Grease: 'spell.grease',
  Heroism: 'spell.heroism',
  "Hunter's Mark": 'spell.hunters_mark',
  Longstrider: 'spell.longstrider',
  Aid: 'spell.aid',
  'Blindness/Deafness': 'spell.blindness_deafness',
  Darkness: 'spell.darkness',
  Invisibility: 'spell.invisibility',
  'Lesser Restoration': 'spell.lesser_restoration',
  Moonbeam: 'spell.moonbeam',
  'Spiritual Weapon': 'spell.spiritual_weapon',
  Counterspell: 'spell.counterspell',
  Fly: 'spell.fly',
  Haste: 'spell.haste',
  'Lightning Bolt': 'spell.lightning_bolt',
  Revivify: 'spell.revivify',
  ...Object.fromEntries(p3CombatSpellMetadata.map((spell) => [spell.label, spell.id])),
};

const legacyTokenTargetSpellIds = new Set([
  'spell.chill_touch',
  'spell.acid_splash',
  'spell.shocking_grasp',
  'spell.fire_bolt',
  'spell.ray_of_frost',
  'spell.sacred_flame',
  'spell.magic_missile',
  'spell.cure_wounds',
  'spell.guiding_bolt',
  'spell.inflict_wounds',
  'spell.healing_word',
  'spell.command',
  'spell.hold_person',
  'spell.scorching_ray',
  'spell.dispel_magic',
  'spell.bless',
  'spell.bane',
  'spell.guidance',
  'spell.feather_fall',
  'spell.heroism',
  'spell.longstrider',
  'spell.aid',
  'spell.invisibility',
  'spell.lesser_restoration',
  'spell.fly',
  'spell.haste',
  'spell.charm_person',
  'spell.hunters_mark',
  'spell.blindness_deafness',
  'spell.spiritual_weapon',
  'spell.revivify',
]);

const legacyAllyTargetSpellIds = new Set([
  'spell.cure_wounds',
  'spell.healing_word',
  'spell.bless',
  'spell.guidance',
  'spell.feather_fall',
  'spell.heroism',
  'spell.longstrider',
  'spell.aid',
  'spell.invisibility',
  'spell.lesser_restoration',
  'spell.fly',
  'spell.haste',
  'spell.revivify',
]);

const legacyAnyTokenTargetSpellIds = new Set(['spell.dispel_magic']);

const legacyPointTargetSpellIds = new Set([
  'spell.sleep',
  'spell.fireball',
  'spell.burning_hands',
  'spell.thunderwave',
  'spell.entangle',
  'spell.web',
  'spell.misty_step',
  'spell.faerie_fire',
  'spell.fog_cloud',
  'spell.grease',
  'spell.darkness',
  'spell.moonbeam',
  'spell.minor_illusion',
  'spell.mage_hand',
  'spell.lightning_bolt',
  'spell.light',
]);

const immediateSelfSpellIds = new Set(['spell.detect_magic']);

export const mvpSpellRangeFtById: Record<string, number> = {
  'spell.acid_splash': 60,
  'spell.guidance': 5,
  'spell.mage_hand': 30,
  'spell.minor_illusion': 30,
  'spell.shocking_grasp': 5,
  'spell.chill_touch': 120,
  'spell.fire_bolt': 120,
  'spell.ray_of_frost': 60,
  'spell.sacred_flame': 60,
  'spell.light': 5,
  'spell.detect_magic': 0,
  'spell.bless': 30,
  'spell.bane': 30,
  'spell.magic_missile': 120,
  'spell.burning_hands': 15,
  'spell.thunderwave': 15,
  'spell.entangle': 90,
  'spell.cure_wounds': 5,
  'spell.guiding_bolt': 120,
  'spell.inflict_wounds': 5,
  'spell.healing_word': 60,
  'spell.command': 60,
  'spell.sleep': 90,
  'spell.hold_person': 60,
  'spell.web': 60,
  'spell.misty_step': 30,
  'spell.scorching_ray': 120,
  'spell.fireball': 150,
  'spell.dispel_magic': 120,
  'spell.charm_person': 30,
  'spell.faerie_fire': 60,
  'spell.feather_fall': 60,
  'spell.fog_cloud': 120,
  'spell.grease': 60,
  'spell.heroism': 5,
  'spell.hunters_mark': 90,
  'spell.longstrider': 5,
  'spell.aid': 30,
  'spell.blindness_deafness': 30,
  'spell.darkness': 60,
  'spell.invisibility': 5,
  'spell.lesser_restoration': 5,
  'spell.moonbeam': 120,
  'spell.spiritual_weapon': 60,
  'spell.counterspell': 60,
  'spell.fly': 5,
  'spell.haste': 30,
  'spell.lightning_bolt': 100,
  'spell.revivify': 5,
  ...Object.fromEntries(p3CombatSpellMetadata.map((spell) => [spell.id, spell.rangeFt])),
};

export const mvpSpellLevelById: Record<string, number> = {
  'spell.acid_splash': 0,
  'spell.guidance': 0,
  'spell.mage_hand': 0,
  'spell.minor_illusion': 0,
  'spell.shocking_grasp': 0,
  'spell.chill_touch': 0,
  'spell.fire_bolt': 0,
  'spell.ray_of_frost': 0,
  'spell.sacred_flame': 0,
  'spell.light': 0,
  'spell.detect_magic': 1,
  'spell.bless': 1,
  'spell.bane': 1,
  'spell.magic_missile': 1,
  'spell.burning_hands': 1,
  'spell.thunderwave': 1,
  'spell.entangle': 1,
  'spell.cure_wounds': 1,
  'spell.guiding_bolt': 1,
  'spell.inflict_wounds': 1,
  'spell.healing_word': 1,
  'spell.command': 1,
  'spell.shield': 1,
  'spell.sleep': 1,
  'spell.hold_person': 2,
  'spell.web': 2,
  'spell.misty_step': 2,
  'spell.scorching_ray': 2,
  'spell.fireball': 3,
  'spell.dispel_magic': 3,
  'spell.charm_person': 1,
  'spell.faerie_fire': 1,
  'spell.feather_fall': 1,
  'spell.fog_cloud': 1,
  'spell.grease': 1,
  'spell.heroism': 1,
  'spell.hunters_mark': 1,
  'spell.longstrider': 1,
  'spell.aid': 2,
  'spell.blindness_deafness': 2,
  'spell.darkness': 2,
  'spell.invisibility': 2,
  'spell.lesser_restoration': 2,
  'spell.moonbeam': 2,
  'spell.spiritual_weapon': 2,
  'spell.counterspell': 3,
  'spell.fly': 3,
  'spell.haste': 3,
  'spell.lightning_bolt': 3,
  'spell.revivify': 3,
  ...Object.fromEntries(p3CombatSpellMetadata.map((spell) => [spell.id, spell.level])),
};

export function normalizeSpellId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return normalized.startsWith('spell.') ? normalized : `spell.${normalized}`;
}

function getRuleCatalogSpellLevel(entry: RuleCatalogReferenceDto): number | undefined {
  if (isSpellLevel(entry.spellLevel)) return entry.spellLevel;
  const tag = entry.runtimeTags?.find((item) => item.startsWith('spell_level:'));
  if (!tag) return undefined;
  const level = Number(tag.slice('spell_level:'.length));
  return isSpellLevel(level) ? level : undefined;
}

function formatRuleCatalogSpellLabel(entry: RuleCatalogReferenceDto) {
  if (entry.label) return entry.label;
  const raw = entry.id.includes('.') ? entry.id.slice(entry.id.lastIndexOf('.') + 1) : entry.id;
  return raw
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || entry.id;
}

function hasMvpSpell(
  character: SessionCharacterResponseDto | null,
  spellId: string,
  spellLevelById: Record<string, number> = mvpSpellLevelById
) {
  if (!character) return false;
  const cantrips = (character.spells?.cantrips ?? []).map(normalizeSpellId);
  if (cantrips.includes(spellId)) return true;

  const learnedSpells = (character.spells?.spells ?? []).map(normalizeSpellId);
  if (!learnedSpells.includes(spellId)) return false;

  const spellLevel = spellLevelById[spellId];
  const preparedSpells = character.spells?.preparedSpells;
  if (
    spellLevel &&
    resolvePreparedSpellAbility(normalizeSrdCharacterClassKey(character.className)) !== null &&
    preparedSpells
  ) {
    return preparedSpells.map(normalizeSpellId).includes(spellId);
  }

  return true;
}

export function getCombatCatalogSpellMetadataById(
  ruleCatalog: RuleCatalogReferenceDto[] = []
): Map<string, CombatCatalogSpellMetadata> {
  const metadataById = new Map<string, CombatCatalogSpellMetadata>();
  for (const entry of ruleCatalog) {
    if (entry.kind !== 'spell_definitions' || !entry.executable) continue;
    metadataById.set(entry.id, {
      level: getRuleCatalogSpellLevel(entry),
      rangeFt: entry.rangeFt,
      targetingType: entry.targetingType,
    });
  }
  return metadataById;
}

export function getKnownMvpSpellActions(
  character: SessionCharacterResponseDto | null,
  ruleCatalog: RuleCatalogReferenceDto[] = []
): CombatSpellAction[] {
  const catalogSpellEntries = ruleCatalog.filter(
    (entry) => entry.kind === 'spell_definitions' && entry.executable
  );
  const catalogSpellById = new Map(catalogSpellEntries.map((entry) => [entry.id, entry] as const));
  const spellLevelById: Record<string, number> = { ...mvpSpellLevelById };
  for (const entry of catalogSpellEntries) {
    const level = getRuleCatalogSpellLevel(entry);
    if (level !== undefined) spellLevelById[entry.id] = level;
  }
  const actions: CombatSpellAction[] = [];
  const seenSpellIds = new Set<string>();

  for (const label of mvpSpellLabels) {
    const spellId = mvpSpellIdsByLabel[label];
    if (spellId && hasMvpSpell(character, spellId, spellLevelById)) {
      actions.push({ label, spellId, level: spellLevelById[spellId] });
      seenSpellIds.add(spellId);
    }
  }

  const knownSpellIds = [
    ...(character?.spells?.cantrips ?? []),
    ...(character?.spells?.spells ?? []),
  ].map(normalizeSpellId);
  for (const spellId of knownSpellIds) {
    if (seenSpellIds.has(spellId)) continue;
    const entry = catalogSpellById.get(spellId);
    if (!entry) continue;
    if (!hasMvpSpell(character, spellId, spellLevelById)) continue;
    actions.push({
      label: formatRuleCatalogSpellLabel(entry),
      spellId,
      level: spellLevelById[spellId],
    });
    seenSpellIds.add(spellId);
  }

  return actions.sort((left, right) => {
    const leftLevel = left.level ?? 99;
    const rightLevel = right.level ?? 99;
    if (leftLevel !== rightLevel) return leftLevel - rightLevel;
    return left.label.localeCompare(right.label);
  });
}

export function getVisibleSpellActions(
  actions: CombatSpellAction[],
  spellFilter: SpellFilter
) {
  return actions.filter((action) => {
    const spellLevel = action.level;
    if (spellFilter === 'cantrip') return spellLevel === 0;
    if (spellFilter.startsWith('level')) {
      return spellLevel === parseSpellFilterLevel(spellFilter);
    }
    return true;
  });
}

export function getVisibleSpellSlotEntries(
  spellSlotResources: Record<string, CombatSpellSlotResource>
) {
  return Object.entries(spellSlotResources)
    .filter(([level, resource]) => {
      const numericLevel = Number(level);
      return isSlotLevel(numericLevel) && isPositiveFiniteNumber(resource.total);
    })
    .sort(([left], [right]) => Number(left) - Number(right));
}

export function getSpellSlotTotal(
  spellSlotResources: Record<string, CombatSpellSlotResource>,
  spellLevel: number,
  level1FallbackTotal = 0
) {
  if (spellLevel === 1) return spellSlotResources['1']?.total ?? level1FallbackTotal;
  return spellSlotResources[String(spellLevel)]?.total ?? 0;
}

export function getSpellSlotRemaining(
  spellSlotResources: Record<string, CombatSpellSlotResource>,
  spellLevel: number,
  level1FallbackRemaining = 0,
  level1FallbackTotal = 0
) {
  const total = getSpellSlotTotal(spellSlotResources, spellLevel, level1FallbackTotal);
  const remaining =
    spellLevel === 1
      ? (spellSlotResources['1']?.remaining ?? level1FallbackRemaining)
      : (spellSlotResources[String(spellLevel)]?.remaining ?? 0);
  return Math.min(total, Math.max(0, remaining));
}

export function getAvailableSlotLevelsForSpell(
  spellLevel: number | undefined,
  spellSlotResources: Record<string, CombatSpellSlotResource>
) {
  if (!isSlotLevel(spellLevel)) return [];
  return Object.entries(spellSlotResources)
    .map(([level, resource]) => ({
      level: Number(level),
      remaining: resource.remaining,
      total: resource.total,
    }))
    .filter(
      (entry) =>
        isSlotLevel(entry.level) &&
        entry.level >= spellLevel &&
        isPositiveFiniteNumber(entry.total) &&
        isPositiveFiniteNumber(entry.remaining)
    )
    .sort((left, right) => left.level - right.level)
    .map((entry) => entry.level);
}

export function getSelectedSlotLevelForSpell(
  spellId: string,
  spellLevel: number | undefined,
  spellSlotResources: Record<string, CombatSpellSlotResource>,
  selectedSlotLevelBySpellId: Record<string, number>
) {
  if (!isSlotLevel(spellLevel)) return undefined;
  const availableLevels = getAvailableSlotLevelsForSpell(spellLevel, spellSlotResources);
  if (!availableLevels.length) return spellLevel;
  const selected = selectedSlotLevelBySpellId[spellId];
  return availableLevels.includes(selected) ? selected : availableLevels[0];
}

function isSpellLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9;
}

function isSlotLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function parseSpellFilterLevel(value: string): number | null {
  const level = Number(value.slice('level'.length));
  return isSlotLevel(level) ? level : null;
}

export function isImmediateSelfCombatSpell(
  spellId: string,
  p3Spell: P3CombatSpellMetadata | undefined,
  catalogSpell: CombatCatalogSpellMetadata | undefined
) {
  return Boolean(
    immediateSelfSpellIds.has(spellId) ||
      p3Spell?.targeting === 'self' ||
      catalogSpell?.targetingType === 'self' ||
      catalogSpell?.targetingType === 'none'
  );
}

export function getLegacyCombatSpellTargetKind(spellId: string): CombatSpellLegacyTargetKind {
  if (legacyTokenTargetSpellIds.has(spellId)) return 'token';
  if (legacyPointTargetSpellIds.has(spellId)) return 'point';
  return 'none';
}

export function canLegacyCombatSpellTargetParticipant(
  spellId: string,
  participant: CombatSpellTargetParticipant | null | undefined
) {
  if (!participant) return false;
  if (spellId !== 'spell.revivify' && !participant.isAlive) return false;
  if (legacyAnyTokenTargetSpellIds.has(spellId)) return true;
  const isAllyTargetSpell = legacyAllyTargetSpellIds.has(spellId);
  return isAllyTargetSpell ? !participant.isHostile : participant.isHostile;
}

export function getCombatSpellActionCostKind(spellId: string): CombatSpellActionCostKind {
  if (
    spellId === 'spell.healing_word' ||
    spellId === 'spell.misty_step' ||
    spellId === 'spell.hunters_mark' ||
    spellId === 'spell.spiritual_weapon'
  ) {
    return 'bonus';
  }
  if (
    spellId === 'spell.shield' ||
    spellId === 'spell.feather_fall' ||
    spellId === 'spell.counterspell'
  ) {
    return 'reaction';
  }
  return 'action';
}

export function isCombatSpellActionDisabled({
  costKind,
  canUsePlayerCharacterActions,
  canUseAction,
  canUseBonusAction,
  isCombatBusy,
  isSlottedSpell,
  spellSlotRemaining,
}: {
  costKind: CombatSpellActionCostKind;
  canUsePlayerCharacterActions: boolean;
  canUseAction: boolean;
  canUseBonusAction: boolean;
  isCombatBusy: boolean;
  isSlottedSpell: boolean;
  spellSlotRemaining: number;
}) {
  return Boolean(
    !canUsePlayerCharacterActions ||
      (costKind === 'bonus' ? !canUseBonusAction : !canUseAction) ||
      isCombatBusy ||
      costKind === 'reaction' ||
      (isSlottedSpell && spellSlotRemaining <= 0)
  );
}
