import { useCallback, useState } from 'react';
import type { ItemResponseDto } from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import { grantHumanGmInventoryItem } from '../../../services/humanGmApi';

type UseGmInventoryGrantParams = {
  user: StoredUser;
  sessionId: string | null;
  canUseHumanGmView: boolean;
  setInventoryUseFeedback: (message: string | null) => void;
  onAction: (label: string) => void;
};

export function useGmInventoryGrant(params: UseGmInventoryGrantParams) {
  const { user, sessionId, canUseHumanGmView, setInventoryUseFeedback, onAction } = params;
  const [isGmInventoryGrantPending, setGmInventoryGrantPending] = useState(false);

  const handleGmGrantInventoryItem = useCallback(
    async (sessionCharacterId: string, item: ItemResponseDto, quantity: number) => {
      if (!sessionId || !canUseHumanGmView || isGmInventoryGrantPending) return;

      setInventoryUseFeedback(null);
      setGmInventoryGrantPending(true);
      try {
        await grantHumanGmInventoryItem(user, sessionId, {
          sessionCharacterId,
          itemDefinitionId: item.id,
          quantity,
        });
        setInventoryUseFeedback(`${item.koName} x${quantity}을(를) 지급했습니다.`);
        onAction('GM 아이템 지급');
      } catch (caught) {
        setInventoryUseFeedback(
          caught instanceof Error ? caught.message : '아이템 지급에 실패했습니다.',
        );
      } finally {
        setGmInventoryGrantPending(false);
      }
    },
    [
      canUseHumanGmView,
      isGmInventoryGrantPending,
      onAction,
      sessionId,
      setInventoryUseFeedback,
      user,
    ],
  );

  return {
    isGmInventoryGrantPending,
    handleGmGrantInventoryItem,
  };
}
