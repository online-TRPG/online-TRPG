import type { InventoryItemDto } from '@trpg/shared-types';
import { getInventoryItemKey, isWeaponInventoryItem } from './inventoryItemModel';

const LEGACY_WEAPON_RULE_FALLBACKS: Array<{
  aliases: string[];
  rangeFt?: number;
  longRangeFt?: number;
  properties?: string[];
}> = [
  { aliases: ['longbow', '롱보우', '장궁'], rangeFt: 150, longRangeFt: 600, properties: ['ranged', 'two-handed'] },
  { aliases: ['shortbow', '쇼트보우', '단궁'], rangeFt: 80, longRangeFt: 320, properties: ['ranged', 'two-handed'] },
  { aliases: ['light-crossbow', 'light crossbow', '라이트 크로스보우'], rangeFt: 80, longRangeFt: 320, properties: ['ranged', 'two-handed'] },
  { aliases: ['javelin', '재블린', '투창'], rangeFt: 30, longRangeFt: 120, properties: ['thrown'] },
  { aliases: ['dagger', '단검'], rangeFt: 20, longRangeFt: 60, properties: ['finesse', 'light', 'thrown'] },
  { aliases: ['dart', '다트'], rangeFt: 20, longRangeFt: 60, properties: ['ranged', 'thrown'] },
  { aliases: ['handaxe', '핸드액스'], rangeFt: 20, longRangeFt: 60, properties: ['light', 'thrown'] },
  { aliases: ['rapier', '레이피어'], rangeFt: 5, properties: ['melee', 'finesse'] },
  { aliases: ['scimitar', '시미터'], rangeFt: 5, properties: ['melee', 'finesse', 'light'] },
  { aliases: ['shortsword', 'short sword', '쇼트소드'], rangeFt: 5, properties: ['melee', 'finesse', 'light'] },
  { aliases: ['greataxe', '그레이트액스'], rangeFt: 5, properties: ['melee', 'heavy', 'two-handed'] },
];

function getLegacyWeaponRuleFallback(item: InventoryItemDto) {
  const key = getInventoryItemKey(item).replace(/_/g, '-');
  return LEGACY_WEAPON_RULE_FALLBACKS.find((fallback) =>
    fallback.aliases.some((alias) => key.includes(alias))
  ) ?? null;
}

function getNormalizedInventoryProperties(item: InventoryItemDto) {
  return (item.properties ?? []).map((property) =>
    property.toLowerCase().replace(/[_\s]+/g, '-')
  );
}

function readRangeProperty(properties: string[], prefix: 'range:' | 'range-long:' | 'range_long:') {
  const value = properties.find((property) => property.startsWith(prefix))?.slice(prefix.length);
  const rangeFt = Number(value);
  return Number.isInteger(rangeFt) && rangeFt >= 0 ? rangeFt : null;
}

export function getWeaponRangeFt(item: InventoryItemDto) {
  const properties = getNormalizedInventoryProperties(item);
  const explicitRange = item.rangeFt ?? readRangeProperty(properties, 'range:');
  if (typeof explicitRange === 'number') return explicitRange;

  const legacyFallback = getLegacyWeaponRuleFallback(item);
  if (legacyFallback?.rangeFt) return legacyFallback.rangeFt;
  if (properties.some((property) => property.includes('ranged'))) return 80;
  return 5;
}

export function getWeaponFallbackRangeFt(item: InventoryItemDto) {
  return getWeaponRangeFt(item);
}

export function getWeaponPropertySet(item: InventoryItemDto) {
  const properties = new Set(getNormalizedInventoryProperties(item));
  const legacyFallback = getLegacyWeaponRuleFallback(item);
  legacyFallback?.properties?.forEach((property) => properties.add(property));

  if (properties.has('ranged') || properties.has('ammunition')) {
    properties.add('ranged');
  } else if (isWeaponInventoryItem(item)) {
    properties.add('melee');
  }

  return properties;
}

export function getThrowableLongRangeFt(item: InventoryItemDto) {
  const normalizedProperties = getNormalizedInventoryProperties(item);
  const explicitLongRange =
    item.longRangeFt ??
    readRangeProperty(normalizedProperties, 'range-long:') ??
    readRangeProperty(normalizedProperties, 'range_long:');
  if (typeof explicitLongRange === 'number') return explicitLongRange;

  const legacyFallback = getLegacyWeaponRuleFallback(item);
  if (legacyFallback?.longRangeFt) return legacyFallback.longRangeFt;

  const properties = getWeaponPropertySet(item);
  if (properties.has('thrown')) return 60;
  return 60;
}

export function isLightMeleeWeaponItem(item: InventoryItemDto | null) {
  if (!item || !isWeaponInventoryItem(item)) return false;
  const properties = getWeaponPropertySet(item);
  return (
    properties.has('light') &&
    (properties.has('melee') || !properties.has('ranged')) &&
    !properties.has('two-handed')
  );
}

export function isSneakAttackWeaponItem(item: InventoryItemDto | null) {
  if (!item || !isWeaponInventoryItem(item)) return false;
  const properties = getWeaponPropertySet(item);
  return properties.has('finesse') || properties.has('ranged');
}
