import { SessionVttDefaultMapReaderService } from "./session-vtt-default-map-reader.service";
import { SessionVttMapNormalizationService } from "./session-vtt-map-normalization.service";

describe("SessionVttDefaultMapReaderService", () => {
  const prisma = {
    sessionScenarioNode: {
      findUnique: jest.fn(),
    },
  };
  const service = new SessionVttDefaultMapReaderService(
    prisma as never,
    new SessionVttMapNormalizationService(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null without node id or without a scenario node", async () => {
    await expect(service.getScenarioDefaultVttMapForNode("session-scenario-1", null)).resolves.toBeNull();
    expect(prisma.sessionScenarioNode.findUnique).not.toHaveBeenCalled();

    prisma.sessionScenarioNode.findUnique.mockResolvedValue(null);

    await expect(service.getScenarioDefaultVttMapForNode("session-scenario-1", "node-1")).resolves.toBeNull();
  });

  it("loads and normalizes a VTT map from node check options", async () => {
    prisma.sessionScenarioNode.findUnique.mockResolvedValue({
      checkOptionsJson: JSON.stringify({
        vttMap: {
          id: "map-1",
          scenarioNodeId: "node-1",
          gridType: "square",
          gridSize: 64,
          width: 640,
          height: 480,
          tokens: [],
          fogRects: [],
        },
      }),
    });

    const map = await service.getScenarioDefaultVttMapForNode("session-scenario-1", "node-1");

    expect(prisma.sessionScenarioNode.findUnique).toHaveBeenCalledWith({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: "session-scenario-1",
          nodeId: "node-1",
        },
      },
      select: { checkOptionsJson: true },
    });
    expect(map).toMatchObject({
      id: "map-1",
      scenarioNodeId: "node-1",
      gridSize: 64,
      width: 640,
      height: 480,
      terrainCells: [],
      objectCells: [],
    });
  });

  it("extracts checks from legacy arrays and object wrappers", () => {
    expect(service.extractChecksFromCheckOptions(JSON.stringify([{ id: "check-1" }]))).toEqual([{ id: "check-1" }]);
    expect(service.extractChecksFromCheckOptions(JSON.stringify({ checks: [{ id: "check-2" }] }))).toEqual([{ id: "check-2" }]);
    expect(service.extractChecksFromCheckOptions("{malformed")).toEqual([]);
  });

  it("hydrates partial VTT maps and returns null for invalid payloads", () => {
    expect(service.extractVttMapFromCheckOptions(JSON.stringify([]))).toBeNull();
    expect(
      service.extractVttMapFromCheckOptions(JSON.stringify({ vttMap: { id: "missing-arrays" } })),
    ).toMatchObject({
      id: "missing-arrays",
      gridSize: 64,
      width: 1280,
      height: 832,
      tokens: [],
      fogRects: [],
    });
    expect(service.extractVttMapFromCheckOptions("{malformed")).toBeNull();
  });

  it("hydrates sparse scenario monster references instead of dropping the map", () => {
    const map = service.extractVttMapFromCheckOptions(
      JSON.stringify({
        vttMap: {
          id: "map-sparse-monster",
          scenarioNodeId: "node-1",
          gridType: "square",
          gridSize: 64,
          width: 640,
          height: 480,
          tokens: [
            {
              id: "token-goblin",
              name: "Goblin",
              x: 64,
              y: 64,
              size: 64,
              isHostile: true,
              monster: {
                id: "monster.goblin",
                nameEn: "Goblin",
                nameKo: "고블린",
              },
            },
          ],
          terrainCells: [
            {
              id: "terrain-fire",
              x: 128,
              y: 128,
              terrainEffectId: "terrain.burning",
            },
          ],
          fogRects: [],
        },
      }),
    );

    expect(map?.tokens).toHaveLength(1);
    expect(map?.tokens[0]).toMatchObject({
      id: "token-goblin",
      monster: {
        id: "monster.goblin",
        basicRaw: "",
        traits: [],
        actions: [],
        legendaryActions: [],
      },
    });
    expect(map?.terrainCells).toEqual([
      expect.objectContaining({
        id: "terrain-fire",
        width: 64,
        height: 64,
      }),
    ]);
  });
});
