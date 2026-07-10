import type { VttMapStateDto } from '@trpg/shared-types';
import type { BattleMapSelection } from '../components/SessionBattleMap';

export function getSelectionGridPoint(
  selection: BattleMapSelection | null,
  map: VttMapStateDto | null
) {
  if (!selection || !map) return null;
  return {
    x: Math.floor(Math.min(Math.max(selection.point.x, 0), Math.max(0, map.width - 1)) / map.gridSize),
    y: Math.floor(Math.min(Math.max(selection.point.y, 0), Math.max(0, map.height - 1)) / map.gridSize),
  };
}

export function isSameMapSelection(
  left: BattleMapSelection | null,
  right: BattleMapSelection | null
): boolean {
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === 'token' && right.kind === 'token') {
    return left.token.id === right.token.id;
  }
  if (left.kind === 'tile' && right.kind === 'tile') {
    return left.tile.column === right.tile.column && left.tile.row === right.tile.row;
  }
  if (left.kind !== 'token' && left.kind !== 'tile' && right.kind !== 'token' && right.kind !== 'tile') {
    return left.cell.id === right.cell.id;
  }
  return false;
}

export function getMapObjectItemPayload(
  selection: BattleMapSelection | null,
  map: VttMapStateDto | null
) {
  if (!selection || selection.kind !== 'object') return null;
  const objectCell = selection.cell;
  const itemDefinitionId = objectCell.hiddenItemIds?.[0]?.trim();
  if (!itemDefinitionId) return null;
  const gridPoint = getSelectionGridPoint(selection, map);
  if (!gridPoint) return null;
  const escapedItemDefinitionId = itemDefinitionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = objectCell.description?.match(
    new RegExp(`(?:^|\\s)${escapedItemDefinitionId}\\s+x(\\d+)(?:\\s|$)`)
  );
  const quantity = Number(match?.[1]);
  return {
    objectId: objectCell.id,
    itemDefinitionId,
    quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
    point: gridPoint,
  };
}
