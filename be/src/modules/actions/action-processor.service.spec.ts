import { VttMapStateDto } from "@trpg/shared-types";
import { ActionProcessorService } from "./action-processor.service";

const createBaseMap = (): VttMapStateDto => ({
  id: "map-1",
  scenarioNodeId: "node-1",
  gridType: "square",
  gridSize: 50,
  width: 500,
  height: 500,
  tokens: [],
  fogRects: [],
  updatedAt: "2026-05-25T00:00:00.000Z",
  objectCells: [
    {
      id: "object-rope",
      x: 50,
      y: 0,
      width: 50,
      height: 50,
      name: "Rope",
      description: "equipment.rope x5",
      visibleToPlayers: true,
      hiddenItemIds: ["equipment.rope"],
    },
  ],
});

describe("ActionProcessorService map object runtime effects", () => {
  const createService = (map = createBaseMap()) => {
    const sessionsService = {
      getGameStateEntityOrThrow: jest.fn().mockResolvedValue({
        sessionScenario: { id: "session-scenario-1" },
        state: { currentNodeId: "node-1", flagsJson: null },
      }),
      getVttMapBaseline: jest.fn().mockResolvedValue(map),
    };
    const mapRuntime = {
      saveSystemVttMap: jest.fn().mockImplementation(async (_sessionId, nextMap) => nextMap),
    };

    const service = new ActionProcessorService(
      {} as never,
      sessionsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      mapRuntime as never,
    );

    return { service: service as unknown as Record<string, (...args: unknown[]) => Promise<void>>, mapRuntime };
  };

  it("creates dropped or thrown item map objects from runtime effects", async () => {
    const { service, mapRuntime } = createService();

    await service.createMapObjectFromRuntimeEffect("session-1", {
      type: "CREATE_MAP_OBJECT",
      objectId: "object:thrown:entry-dagger:4:0",
      itemDefinitionId: "equipment.dagger",
      name: "Dagger",
      quantity: 1,
      point: { x: 4, y: 0 },
    });

    expect(mapRuntime.saveSystemVttMap).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        objectCells: expect.arrayContaining([
          expect.objectContaining({
            id: "object:thrown:entry-dagger:4:0",
            x: 200,
            y: 0,
            width: 50,
            height: 50,
            description: "equipment.dagger x1",
            hiddenItemIds: ["equipment.dagger"],
          }),
        ]),
      }),
    );
  });

  it("updates map object quantity without deleting the cell", async () => {
    const { service, mapRuntime } = createService();

    await service.updateMapObjectQuantityFromRuntimeEffect("session-1", {
      type: "UPDATE_MAP_OBJECT_QUANTITY",
      objectId: "object-rope",
      itemDefinitionId: "equipment.rope",
      quantity: 3,
    });

    expect(mapRuntime.saveSystemVttMap).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        objectCells: [
          expect.objectContaining({
            id: "object-rope",
            description: "equipment.rope x3",
          }),
        ],
      }),
    );
  });

  it("removes picked up map objects from the saved VTT map", async () => {
    const { service, mapRuntime } = createService();

    await service.removeMapObjectFromRuntimeEffect("session-1", "object-rope");

    expect(mapRuntime.saveSystemVttMap).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ objectCells: [] }),
    );
  });
});
