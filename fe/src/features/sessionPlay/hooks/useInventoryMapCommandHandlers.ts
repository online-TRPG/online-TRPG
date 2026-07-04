import type { InventoryItemDto } from '@trpg/shared-types';
import {
  buildDropInventoryItemCommand,
  buildPickupMapObjectCommand,
  buildThrowInventoryItemCommand,
} from '../utils/inventoryItemCommand';

type MapPoint = {
  x: number;
  y: number;
};

type UseInventoryMapCommandHandlersParams = {
  hasSession: boolean;
  busy: boolean;
  isInventoryUsePending: boolean;
  isCombatBusy: boolean;
  onSendAction: (rawText: string) => Promise<void> | void;
};

export function useInventoryMapCommandHandlers(
  params: UseInventoryMapCommandHandlersParams,
) {
  const {
    hasSession,
    busy,
    isInventoryUsePending,
    isCombatBusy,
    onSendAction,
  } = params;

  async function handleDropInventoryItem(
    item: InventoryItemDto,
    point: MapPoint,
  ) {
    if (!hasSession || busy || isInventoryUsePending) return;
    const command = buildDropInventoryItemCommand(item, point);
    if (command) await onSendAction(command);
  }

  async function handlePickupMapObject(
    objectId: string,
    itemDefinitionId: string,
    quantity: number,
    point: MapPoint,
  ) {
    if (!hasSession || busy || isInventoryUsePending) return;
    await onSendAction(
      buildPickupMapObjectCommand({
        objectId,
        itemDefinitionId,
        quantity,
        point,
      }),
    );
  }

  async function handleThrowInventoryItem(
    item: InventoryItemDto,
    point: MapPoint,
  ) {
    if (!hasSession || isCombatBusy) return;
    const command = buildThrowInventoryItemCommand(item, point);
    if (command) await onSendAction(command);
  }

  return {
    handleDropInventoryItem,
    handlePickupMapObject,
    handleThrowInventoryItem,
  };
}
