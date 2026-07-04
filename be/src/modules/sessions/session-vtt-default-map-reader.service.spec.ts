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

  it("returns null for invalid VTT map payloads", () => {
    expect(service.extractVttMapFromCheckOptions(JSON.stringify([]))).toBeNull();
    expect(service.extractVttMapFromCheckOptions(JSON.stringify({ vttMap: { id: "missing-arrays" } }))).toBeNull();
    expect(service.extractVttMapFromCheckOptions("{malformed")).toBeNull();
  });
});
