import { InventoryItemMapRuntimeService } from "./inventory-item-map-runtime.service";

describe("InventoryItemMapRuntimeService", () => {
  const map = {
    gridSize: 70,
    width: 700,
    height: 700,
    tokens: [
      { id: "actor-token", sessionCharacterId: "actor-character", x: 70, y: 70, size: 70 },
      { id: "target-token", sessionCharacterId: "target-character", x: 210, y: 70, size: 70 },
    ],
    terrainCells: [{ id: "existing-terrain" }],
  };
  const sessionsService = {
    getAuthoritativeVttMap: jest.fn(() => map),
  };
  const mapRuntimeService = {
    saveSystemVttMap: jest.fn(),
  };
  const service = new InventoryItemMapRuntimeService(
    sessionsService as never,
    mapRuntimeService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deploys token-centered terrain for an inventory item", async () => {
    await service.deployTerrainEffect({
      userId: "user-1",
      sessionId: "session-1",
      sessionCharacterId: "actor-character",
      itemEntryId: "entry-1",
      itemName: "Caltrops",
      terrainEffectId: "terrain.difficult",
      sizeFt: 20,
    });

    expect(mapRuntimeService.saveSystemVttMap).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        terrainCells: [
          { id: "existing-terrain" },
          expect.objectContaining({
            id: expect.stringContaining("item-terrain:entry-1:"),
            name: "Caltrops",
            terrainEffectId: "terrain.difficult",
          }),
        ],
      }),
    );
  });

  it("rejects terrain deployment when the actor token is missing", async () => {
    await expect(
      service.deployTerrainEffect({
        userId: "user-1",
        sessionId: "session-1",
        sessionCharacterId: "missing-character",
        itemEntryId: "entry-1",
        itemName: "Caltrops",
        terrainEffectId: "terrain.difficult",
        sizeFt: 20,
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "ITEM_USER_TOKEN_NOT_FOUND",
        }),
      },
    });
  });

  it("rejects item targets when a map token is missing", async () => {
    await expect(
      service.assertTargetInRange({
        userId: "user-1",
        sessionId: "session-1",
        actorSessionCharacterId: "actor-character",
        targetSessionCharacterId: "missing-character",
        rangeFt: 10,
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "ITEM_TARGET_TOKEN_NOT_FOUND",
        }),
      },
    });
  });

  it("allows item targets inside range", async () => {
    await expect(
      service.assertTargetInRange({
        userId: "user-1",
        sessionId: "session-1",
        actorSessionCharacterId: "actor-character",
        targetSessionCharacterId: "target-character",
        rangeFt: 10,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects item targets outside range", async () => {
    await expect(
      service.assertTargetInRange({
        userId: "user-1",
        sessionId: "session-1",
        actorSessionCharacterId: "actor-character",
        targetSessionCharacterId: "target-character",
        rangeFt: 5,
      }),
    ).rejects.toMatchObject({
      response: {
        data: expect.objectContaining({
          reason: "ITEM_TARGET_OUT_OF_RANGE",
          distanceFt: 10,
          rangeFt: 5,
        }),
      },
    });
  });
});
