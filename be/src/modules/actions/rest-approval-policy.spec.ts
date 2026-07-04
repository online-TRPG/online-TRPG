import {
  buildRestApprovalResponseMetadata,
  buildRestApprovalStructuredAction,
  buildRestActionRawText,
  buildRestRequestStructuredAction,
  getRestApprovalHitDice,
  getRestApprovalCutoff,
  getRestApprovalExpiresAt,
  isRestApprovalExpired,
  resolveRestHitDiceFromRawText,
  resolveRestTypeFromRawText,
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

  it("builds and parses rest action raw text", () => {
    expect(buildRestActionRawText({ restType: "short", hitDiceToSpend: 2 })).toBe(
      "/rest short 2",
    );
    expect(buildRestActionRawText({ restType: "short" })).toBe("/rest short");
    expect(buildRestActionRawText({ restType: "long", hitDiceToSpend: 2 })).toBe(
      "/rest long",
    );

    expect(resolveRestTypeFromRawText("/rest short 2")).toBe("short");
    expect(resolveRestTypeFromRawText("/rest long")).toBe("long");
    expect(resolveRestTypeFromRawText("/rest unknown")).toBeNull();
    expect(resolveRestHitDiceFromRawText("/rest short 2")).toBe(2);
    expect(resolveRestHitDiceFromRawText("/rest short 0")).toBeNull();
    expect(resolveRestHitDiceFromRawText("/rest long")).toBeNull();
  });

  it("keeps hit dice only for short-rest approval metadata", () => {
    expect(getRestApprovalHitDice({ restType: "short", hitDiceToSpend: 3 })).toBe(3);
    expect(getRestApprovalHitDice({ restType: "short" })).toBeNull();
    expect(getRestApprovalHitDice({ restType: "long", hitDiceToSpend: 3 })).toBeNull();
  });

  it("builds response metadata from explicit values or raw text", () => {
    expect(
      buildRestApprovalResponseMetadata({
        actionId: "action-1",
        restType: "short",
        status: "gm_required",
        hitDiceToSpend: 2,
        clientCreatedAt: requestedAt,
      }),
    ).toEqual({
      actionId: "action-1",
      restType: "short",
      status: "gm_required",
      hitDiceToSpend: 2,
      expiresAt: getRestApprovalExpiresAt(requestedAt).toISOString(),
    });

    expect(
      buildRestApprovalResponseMetadata({
        actionId: "action-2",
        rawText: "/rest long",
        status: "approved",
        clientCreatedAt: requestedAt,
      }),
    ).toEqual({
      actionId: "action-2",
      restType: "long",
      status: "approved",
      hitDiceToSpend: null,
      expiresAt: getRestApprovalExpiresAt(requestedAt).toISOString(),
    });
  });

  it("builds rest request structured action metadata", () => {
    expect(
      buildRestRequestStructuredAction({
        restType: "short",
        hitDiceToSpend: 2,
        clientCreatedAt: requestedAt,
      }),
    ).toEqual({
      type: "rest",
      restType: "short",
      approvalStatus: "gm_required",
      approvalExpiresAt: getRestApprovalExpiresAt(requestedAt).toISOString(),
      hitDiceToSpend: 2,
    });

    expect(
      buildRestRequestStructuredAction({
        restType: "long",
        hitDiceToSpend: 2,
        clientCreatedAt: requestedAt,
      }),
    ).toEqual({
      type: "rest",
      restType: "long",
      approvalStatus: "gm_required",
      approvalExpiresAt: getRestApprovalExpiresAt(requestedAt).toISOString(),
    });
  });

  it("builds rest approval structured action metadata", () => {
    expect(
      buildRestApprovalStructuredAction({
        requestActionId: "action-1",
        rawText: "/rest short 2",
        status: "rejected",
      }),
    ).toEqual({
      type: "rest_approval",
      requestActionId: "action-1",
      restType: "short",
      approvalStatus: "rejected",
      hitDiceToSpend: 2,
    });

    expect(
      buildRestApprovalStructuredAction({
        requestActionId: "action-2",
        rawText: "/rest long",
        status: "expired",
        clientCreatedAt: requestedAt,
      }),
    ).toEqual({
      type: "rest_approval",
      requestActionId: "action-2",
      restType: "long",
      approvalStatus: "expired",
      approvalExpiresAt: getRestApprovalExpiresAt(requestedAt).toISOString(),
    });
  });
});
