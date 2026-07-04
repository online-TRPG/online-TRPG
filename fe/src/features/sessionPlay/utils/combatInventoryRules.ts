import type { InventoryItemDto } from '@trpg/shared-types';
import { getInventoryItemKey, isWeaponInventoryItem } from './inventoryItemModel';

export function getWeaponFallbackRangeFt(item: InventoryItemDto) {
  const key = getInventoryItemKey(item).replace(/_/g, '-');
  if (key.includes('longbow')) return 150;
  if (key.includes('shortbow') || key.includes('light-crossbow')) return 80;
  if (key.includes('javelin')) return 30;
  if (key.includes('dagger') || key.includes('dart') || key.includes('handaxe')) return 20;
  if (key.includes('롱보우')) return 150;
  if (key.includes('쇼트보우') || key.includes('라이트 크로스보우')) return 80;
  if (key.includes('재블린')) return 30;
  if (key.includes('단검') || key.includes('다트') || key.includes('핸드액스')) return 20;
  if ((item.properties ?? []).some((property) => property.toLowerCase().includes('ranged'))) {
    return 80;
  }
  return 5;
}

export function getWeaponPropertySet(item: InventoryItemDto) {
  const key = getInventoryItemKey(item).replace(/_/g, '-');
  const properties = new Set(
    (item.properties ?? []).map((property) => property.toLowerCase().replace(/[_\s]+/g, '-'))
  );

  if (
    key.includes('longbow') ||
    key.includes('shortbow') ||
    key.includes('crossbow') ||
    key.includes('dart')
  ) {
    properties.add('ranged');
  } else if (isWeaponInventoryItem(item)) {
    properties.add('melee');
  }

  if (
    key.includes('dagger') ||
    key.includes('rapier') ||
    key.includes('handaxe') ||
    key.includes('scimitar') ||
    key.includes('shortsword') ||
    key.includes('단검') ||
    key.includes('레이피어') ||
    key.includes('핸드액스') ||
    key.includes('시미터') ||
    key.includes('쇼트소드')
  ) {
    properties.add('light');
    properties.add('melee');
  }

  if (
    key.includes('dagger') ||
    key.includes('rapier') ||
    key.includes('scimitar') ||
    key.includes('shortsword') ||
    key.includes('단검') ||
    key.includes('레이피어') ||
    key.includes('시미터') ||
    key.includes('쇼트소드')
  ) {
    properties.add('finesse');
  }

  if (
    key.includes('greataxe') ||
    key.includes('longbow') ||
    key.includes('shortbow') ||
    key.includes('crossbow') ||
    key.includes('그레이트액스') ||
    key.includes('롱보우') ||
    key.includes('쇼트보우') ||
    key.includes('크로스보우')
  ) {
    properties.add('two-handed');
  }

  return properties;
}

export function getThrowableLongRangeFt(item: InventoryItemDto) {
  const key = getInventoryItemKey(item).replace(/_/g, '-');
  const properties = getWeaponPropertySet(item);
  if (key.includes('javelin') || key.includes('재블린')) return 120;
  if (
    properties.has('thrown') ||
    key.includes('dagger') ||
    key.includes('dart') ||
    key.includes('handaxe') ||
    key.includes('단검') ||
    key.includes('다트') ||
    key.includes('핸드액스')
  ) {
    return 60;
  }
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
