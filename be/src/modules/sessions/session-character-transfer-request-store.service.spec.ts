import type { P6CharacterTransferRequestFlag } from "./campaign-archive-runtime.service";
import { SessionCharacterTransferRequestStoreService } from "./session-character-transfer-request-store.service";

describe("SessionCharacterTransferRequestStoreService", () => {
  const service = new SessionCharacterTransferRequestStoreService();
  const createRequest = (
    requestId: string,
    overrides: Partial<P6CharacterTransferRequestFlag> = {},
  ): P6CharacterTransferRequestFlag => ({
    requestId,
    targetSessionId: "target-session",
    sourceSessionId: "source-session",
    sourceSessionCharacterId: "source-character",
    requestedByUserId: "player-1",
    status: "requested",
    mode: "clone",
    targetSessionCharacterId: null,
    sourceDisposition: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    resolvedAt: null,
    note: null,
    approvedByUserId: null,
    ...overrides,
  });

  it("finds only matching pending duplicates", () => {
    const duplicate = createRequest("request-duplicate");
    const requests = [
      createRequest("request-approved", { status: "approved" }),
      createRequest("request-other-user", { requestedByUserId: "player-2" }),
      duplicate,
    ];

    expect(
      service.findPendingDuplicate(requests, {
        requestedByUserId: "player-1",
        sourceSessionCharacterId: "source-character",
      }),
    ).toBe(duplicate);
    expect(
      service.findPendingDuplicate(requests, {
        requestedByUserId: "player-1",
        sourceSessionCharacterId: "other-source-character",
      }),
    ).toBeNull();
  });

  it("appends transfer requests while preserving other flags", () => {
    const existing = createRequest("request-existing");
    const next = createRequest("request-next");

    expect(service.append({ otherFlag: true }, [existing], next)).toEqual({
      otherFlag: true,
      p6CharacterTransferRequests: [existing, next],
    });
  });

  it("replaces transfer requests at the requested index", () => {
    const first = createRequest("request-first");
    const second = createRequest("request-second");
    const approved = createRequest("request-second", {
      status: "approved",
      targetSessionCharacterId: "target-character",
      sourceDisposition: "copied",
      resolvedAt: "2026-07-02T00:01:00.000Z",
      approvedByUserId: "host-1",
    });

    expect(service.replaceAt({ otherFlag: true }, [first, second], 1, approved)).toEqual({
      otherFlag: true,
      p6CharacterTransferRequests: [first, approved],
    });
  });
});
