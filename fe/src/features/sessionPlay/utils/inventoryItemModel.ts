import type { InventoryItemDto, ItemResponseDto } from '@trpg/shared-types';
import type { GameIconName } from '../../../components/GameIcon';
import { isDirectlyUsableP3Item } from './executableItems';

export function getInventoryItemSearchKey(item: InventoryItemDto): string {
  return compactStrings([item.id, item.itemDefinitionId, item.name, item.itemType, ...(item.properties ?? [])])
    .join(' ')
    .toLowerCase();
}

export function isShieldInventoryItem(item: InventoryItemDto): boolean {
  const key = getInventoryItemSearchKey(item);
  return item.itemType === 'shield' || key.includes('shield') || key.includes('방패');
}

export function getCatalogItemSearchKey(item: ItemResponseDto) {
  return compactStrings([item.id, item.key, item.koName, item.category])
    .join(' ')
    .toLowerCase();
}

export function getExplorationInventoryItemKey(item: InventoryItemDto) {
  return compactStrings([item.itemType, item.itemDefinitionId, item.name, ...(item.properties ?? [])])
    .join(' ')
    .toLowerCase();
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.flatMap((value) => typeof value === 'string' && value.length > 0 ? [value] : []);
}

export const getInventoryItemKey = getExplorationInventoryItemKey;

export function isQuickUsableInventoryItem(item: InventoryItemDto) {
  const key = getExplorationInventoryItemKey(item);
  const isPack = item.itemType === 'pack' || key.includes('꾸러미');
  return (
    item.quantity > 0 &&
    (isDirectlyUsableP3Item(item.itemDefinitionId) ||
      key.includes('consumable') ||
      key.includes('potion') ||
      key.includes('포션') ||
      key.includes('healing') ||
      isPack)
  );
}

export function isWeaponInventoryItem(item: InventoryItemDto) {
  const key = getExplorationInventoryItemKey(item);
  return item.itemType === 'weapon' || Boolean(item.damageDice) || key.includes('weapon');
}

export function isArmorInventoryItem(item: InventoryItemDto) {
  if (isShieldInventoryItem(item)) return false;
  const key = getExplorationInventoryItemKey(item);
  return item.itemType === 'armor' || key.includes('armor') || key.includes('갑옷');
}

export function isEquippedInventoryItem(
  item: InventoryItemDto,
  equippedId: string | null | undefined
) {
  return Boolean(
    equippedId &&
      (item.id === equippedId || item.itemDefinitionId === equippedId || item.name === equippedId)
  );
}

export function getInventoryItemIconName(item: InventoryItemDto): GameIconName {
  const key = getExplorationInventoryItemKey(item).replace(/_/g, '-');

  // 기타 아이템 기본값은 가방보다 중립적인 보급 상자로 두어, 꾸러미 전용 아이콘과 역할이 섞이지 않게 합니다.
  if (key.includes('shield') || key.includes('방패')) return 'game-icons:shield';
  if (item.itemType === 'armor' || key.includes('armor') || key.includes('갑옷')) return 'game-icons:armor-vest';
  if (key.includes('bow') || key.includes('crossbow') || key.includes('활') || key.includes('석궁')) return 'game-icons:bow-arrow';
  if (key.includes('dagger') || key.includes('knife') || key.includes('단검')) return 'game-icons:plain-dagger';
  if (key.includes('axe') || key.includes('액스') || key.includes('도끼')) return 'game-icons:battle-axe';
  if (isWeaponInventoryItem(item)) return 'game-icons:rune-sword';
  if (key.includes('potion') || key.includes('healing') || key.includes('포션')) return 'game-icons:health-potion';
  if (item.itemType === 'pack' || key.includes('꾸러미')) return 'game-icons:swap-bag';
  if (key.includes('scroll') || key.includes('spell') || key.includes('두루마리')) return 'game-icons:scroll-unfurled';
  if (key.includes('book') || key.includes('책')) return 'game-icons:spell-book';
  if (key.includes('key') || key.includes('열쇠')) return 'game-icons:key';
  if (key.includes('tool') || key.includes('kit') || key.includes('도구')) return 'game-icons:toolbox';
  if (key.includes('coin') || key.includes('gold') || key.includes('코인') || key.includes('금화')) return 'game-icons:coins';
  return 'game-icons:wooden-crate';
}
