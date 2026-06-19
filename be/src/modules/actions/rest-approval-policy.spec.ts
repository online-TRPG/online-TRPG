import {
  getRestApprovalCutoff,
  getRestApprovalExpiresAt,
  isRestApprovalExpired,
  REST_APPROVAL_TTL_MS,
} from "./rest-approval-policy";

describe("rest approval policy", () => {
  const requestedAt = new Date("2026-06-18T00:00:00.000Z");

  it("expires requests exactly 24 hours after creation", () => {
    const expiresAt = getRestApprovalExpiresAt(requestedAt);

    expect(expiresAt.getTime() - requestedAt.getTime()).toBe(REST_APPROVAL_TTL_MS);
    expect(isRestApprovalExpired(requestedAt, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isRestApprovalExpired(requestedAt, expiresAt)).toBe(true);
  });

  it("builds the matching pending projection cutoff", () => {
    const now = new Date("2026-06-19T12:00:00.000Z");

    expect(getRestApprovalCutoff(now).toISOString()).toBe("2026-06-18T12:00:00.000Z");
  });
});
