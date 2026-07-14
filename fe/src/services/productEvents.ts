import type { ProductEventName } from '@trpg/shared-types';
import type { StoredUser } from '../types/session';
import { requestJson } from './httpClient';

type ProductEventContext = { user: StoredUser; accessToken: string | null } | null;
let context: ProductEventContext = null;

export function configureProductEventContext(next: ProductEventContext): void {
  context = next;
}

export function trackProductEvent(
  eventName: ProductEventName,
  screen: string,
  success = true,
  reasonCode?: string | null,
): void {
  if (!context) return;
  const active = context;
  void requestJson<void>('/users/me/product-events', {
    method: 'POST',
    user: active.user,
    accessToken: active.accessToken,
    body: {
      eventName,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      screen,
      success,
      reasonCode: reasonCode ?? null,
    },
  }).catch(() => {
    // 계측 실패는 사용자의 플레이 흐름을 막지 않는다.
  });
}
