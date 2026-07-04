import type { ActionAcceptedResponseDto } from "@trpg/shared-types";

export const REST_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

type RestApprovalResponseMetadata = NonNullable<ActionAcceptedResponseDto["restApproval"]>;
type RestApprovalLogStatus = "gm_required" | "rejected" | "cancelled" | "expired";

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

export function buildRestActionRawText(params: {
  restType: "short" | "long";
  hitDiceToSpend?: number | null;
}): string {
  return params.restType === "short" && params.hitDiceToSpend
    ? `/rest short ${params.hitDiceToSpend}`
    : `/rest ${params.restType}`;
}

export function resolveRestTypeFromRawText(rawText: string): "short" | "long" | null {
  const normalized = rawText.trim().toLowerCase();
  if (normalized.startsWith("/rest short")) {
    return "short";
  }
  if (normalized.startsWith("/rest long")) {
    return "long";
  }
  return null;
}

export function resolveRestHitDiceFromRawText(rawText: string): number | null {
  const match = rawText.trim().toLowerCase().match(/^\/rest\s+short\s+(\d+)/);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function getRestApprovalHitDice(params: {
  restType: "short" | "long" | null;
  hitDiceToSpend?: number | null;
}): number | null {
  return params.restType === "short" ? params.hitDiceToSpend ?? null : null;
}

export function buildRestApprovalResponseMetadata(params: {
  actionId: string;
  rawText?: string;
  restType?: "short" | "long" | null;
  status: RestApprovalResponseMetadata["status"];
  hitDiceToSpend?: number | null;
  clientCreatedAt: Date;
}): RestApprovalResponseMetadata {
  const restType =
    params.restType ?? (params.rawText ? resolveRestTypeFromRawText(params.rawText) : null);
  const hitDiceToSpend =
    params.hitDiceToSpend ??
    (params.rawText ? resolveRestHitDiceFromRawText(params.rawText) : null);

  return {
    actionId: params.actionId,
    restType,
    status: params.status,
    hitDiceToSpend: getRestApprovalHitDice({ restType, hitDiceToSpend }),
    expiresAt: getRestApprovalExpiresAt(params.clientCreatedAt).toISOString(),
  };
}

export function buildRestRequestStructuredAction(params: {
  restType: "short" | "long";
  hitDiceToSpend?: number | null;
  clientCreatedAt: Date;
}) {
  const hitDiceToSpend = getRestApprovalHitDice({
    restType: params.restType,
    hitDiceToSpend: params.hitDiceToSpend,
  });

  return {
    type: "rest" as const,
    restType: params.restType,
    approvalStatus: "gm_required" as const,
    approvalExpiresAt: getRestApprovalExpiresAt(params.clientCreatedAt).toISOString(),
    ...(hitDiceToSpend ? { hitDiceToSpend } : {}),
  };
}

export function buildRestApprovalStructuredAction(params: {
  requestActionId: string;
  rawText?: string;
  restType?: "short" | "long" | null;
  status: Exclude<RestApprovalLogStatus, "gm_required">;
  hitDiceToSpend?: number | null;
  clientCreatedAt?: Date;
}) {
  const restType =
    params.restType ?? (params.rawText ? resolveRestTypeFromRawText(params.rawText) : null);
  const hitDiceToSpend =
    params.hitDiceToSpend ??
    (params.rawText ? resolveRestHitDiceFromRawText(params.rawText) : null);
  const approvalHitDice = getRestApprovalHitDice({ restType, hitDiceToSpend });

  return {
    type: "rest_approval" as const,
    requestActionId: params.requestActionId,
    restType,
    approvalStatus: params.status,
    ...(params.status === "expired" && params.clientCreatedAt
      ? { approvalExpiresAt: getRestApprovalExpiresAt(params.clientCreatedAt).toISOString() }
      : {}),
    ...(approvalHitDice ? { hitDiceToSpend: approvalHitDice } : {}),
  };
}
