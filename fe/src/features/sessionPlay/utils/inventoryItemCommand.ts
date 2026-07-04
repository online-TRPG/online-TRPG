import type { InventoryItemDto } from '@trpg/shared-types';

type MapPoint = {
  x: number;
  y: number;
};

export function getInventoryActionItemId(item: InventoryItemDto): string | null {
  return item.id || item.itemDefinitionId || null;
}

export function buildDropInventoryItemCommand(
  item: InventoryItemDto,
  point: MapPoint,
): string | null {
  const itemId = getInventoryActionItemId(item);
  return itemId ? `/item drop ${itemId} 1 ${point.x} ${point.y}` : null;
}

export function buildPickupMapObjectCommand(params: {
  objectId: string;
  itemDefinitionId: string;
  quantity: number;
  point: MapPoint;
}): string {
  return `/item pickup ${params.objectId} ${params.itemDefinitionId} ${params.quantity} ${params.point.x} ${params.point.y}`;
}

export function buildThrowInventoryItemCommand(
  item: InventoryItemDto,
  point: MapPoint,
): string | null {
  const itemId = getInventoryActionItemId(item);
  return itemId ? `/item throw ${itemId} 1 ${point.x} ${point.y}` : null;
}
