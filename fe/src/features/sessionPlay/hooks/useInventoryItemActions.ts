import { useCallback, useEffect, useState } from 'react';
import type { InventoryItemDto } from '@trpg/shared-types';
import type { Character, StoredUser } from '../../../types/session';
import { updateCharacterEquipment } from '../../../services/characterApi';
import { useInventoryItem } from '../../../services/sessionApi';
import { getUserFacingItemName } from '../utils/displayNames';
import { isShieldInventoryItem } from '../utils/inventoryItemModel';

type UseInventoryItemActionsParams = {
  user: StoredUser;
  sessionId: string | null;
  busy: boolean;
  selectedSessionCharacter: Character | null;
};

export function useInventoryItemActions(params: UseInventoryItemActionsParams) {
  const { user, sessionId, busy, selectedSessionCharacter } = params;
  const [inventoryUseFeedback, setInventoryUseFeedback] = useState<string | null>(null);
  const [isInventoryUsePending, setInventoryUsePending] = useState(false);

  useEffect(() => {
    if (!inventoryUseFeedback) return undefined;

    const timer = window.setTimeout(() => {
      setInventoryUseFeedback(null);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [inventoryUseFeedback]);

  const handleUseExplorationInventoryItem = useCallback(
    async (
      item: InventoryItemDto,
      targetSessionCharacterId?: string | null,
      targetParticipantId?: string | null,
      point?: { x: number; y: number } | null,
    ) => {
      if (busy || isInventoryUsePending || !sessionId) return;

      setInventoryUseFeedback(null);
      setInventoryUsePending(true);
      try {
        const result = await useInventoryItem(user, sessionId, {
          itemId: item.id,
          ...(targetSessionCharacterId ? { targetSessionCharacterId } : {}),
          ...(targetParticipantId ? { targetParticipantId } : {}),
          ...(point ? { point } : {}),
        });
        setInventoryUseFeedback(result.message);
      } catch (caught) {
        setInventoryUseFeedback(
          caught instanceof Error ? caught.message : '아이템 사용에 실패했습니다.',
        );
      } finally {
        setInventoryUsePending(false);
      }
    },
    [busy, isInventoryUsePending, sessionId, user],
  );

  const handleEquipInventoryItem = useCallback(
    async (item: InventoryItemDto) => {
      if (busy || isInventoryUsePending || !selectedSessionCharacter) return;

      const equipmentDisplayState = (
        item as InventoryItemDto & { __equipmentDisplayState?: 'equipped' | 'available' }
      ).__equipmentDisplayState;
      const equipmentItemId = item.itemDefinitionId ?? item.id;
      const isShield = isShieldInventoryItem(item);
      const isEquipped =
        Boolean(selectedSessionCharacter.equippedWeaponId) &&
        (item.id === selectedSessionCharacter.equippedWeaponId ||
          item.itemDefinitionId === selectedSessionCharacter.equippedWeaponId ||
          item.name === selectedSessionCharacter.equippedWeaponId);
      const isOffhandEquipped =
        Boolean(selectedSessionCharacter.offhandWeaponId) &&
        (item.id === selectedSessionCharacter.offhandWeaponId ||
          item.itemDefinitionId === selectedSessionCharacter.offhandWeaponId ||
          item.name === selectedSessionCharacter.offhandWeaponId);
      const shouldUnequip =
        equipmentDisplayState === 'equipped' ||
        (equipmentDisplayState === undefined && (isEquipped || isOffhandEquipped));
      const nextEquippedWeaponId = isShield
        ? undefined
        : shouldUnequip
          ? isOffhandEquipped
            ? undefined
            : null
          : equipmentItemId;
      const nextOffhandWeaponId = isShield
        ? shouldUnequip
          ? null
          : equipmentItemId
        : shouldUnequip && isOffhandEquipped
          ? null
          : undefined;

      setInventoryUseFeedback(null);
      setInventoryUsePending(true);
      try {
        await updateCharacterEquipment(user, selectedSessionCharacter.characterId, {
          equippedWeaponId: nextEquippedWeaponId,
          offhandWeaponId: nextOffhandWeaponId,
        });
        const itemDisplayName = getUserFacingItemName(item);
        setInventoryUseFeedback(
          shouldUnequip
            ? `${itemDisplayName} 착용을 해제했습니다.`
            : `${itemDisplayName}을(를) 착용했습니다.`,
        );
      } catch (caught) {
        setInventoryUseFeedback(caught instanceof Error ? caught.message : '장비 변경에 실패했습니다.');
      } finally {
        setInventoryUsePending(false);
      }
    },
    [busy, isInventoryUsePending, selectedSessionCharacter, user],
  );

  return {
    inventoryUseFeedback,
    setInventoryUseFeedback,
    isInventoryUsePending,
    handleUseExplorationInventoryItem,
    handleEquipInventoryItem,
  };
}
