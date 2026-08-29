import { useCallback, useEffect, useState } from 'react';
import type {
  ProductProgressAction,
  UserProductProgressResponseDto,
} from '@trpg/shared-types';
import type { StoredUser } from '../types/session';
import { getProductProgress, updateProductProgress } from '../services/authApi';
import { trackProductEvent } from '../services/productEvents';

export function useProductProgress(user: StoredUser | null, accessToken: string | null) {
  const [progress, setProgress] = useState<UserProductProgressResponseDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setProgress(null);
      return;
    }
    setLoading(true);
    getProductProgress(user, accessToken)
      .then((next) => {
        if (!cancelled) setProgress(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, user]);

  const record = useCallback(async (action: ProductProgressAction, coachmark?: string) => {
    if (!user) return null;
    const next = await updateProductProgress(user, accessToken, action, coachmark);
    setProgress(next);
    if (action === 'start_tutorial') trackProductEvent('tutorial_started', 'tutorial');
    if (action === 'complete_tutorial') trackProductEvent('tutorial_completed', 'tutorial');
    if (action === 'dismiss_tutorial') trackProductEvent('tutorial_dismissed', 'tutorial');
    if (action === 'record_first_action') trackProductEvent('first_action_submitted', 'play');
    return next;
  }, [accessToken, user]);

  return { progress, loading, record };
}
