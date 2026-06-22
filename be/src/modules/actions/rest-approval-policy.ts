export const REST_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export function getRestApprovalExpiresAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + REST_APPROVAL_TTL_MS);
}

export function getRestApprovalCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - REST_APPROVAL_TTL_MS);
}

export function isRestApprovalExpired(
  requestedAt: Date,
  now: Date = new Date(),
): boolean {
  return getRestApprovalExpiresAt(requestedAt).getTime() <= now.getTime();
}
