import { MapRuntimeService } from "./map-runtime.service";

describe("MapRuntimeService GM map updates", () => {
  it("rejects the host as a GM map operator in AI GM sessions", async () => {
    const prisma = {
      combat: {
        findFirst: jest.fn().mockResolvedValue({ id: "combat-1" }),
      },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn().mockResolvedValue({
        id: "session-1",
        hostUserId: "host-user",
        gmMode: "AI",
        gmUserId: null,
      }),
      ensureMembership: jest.fn().mockResolvedValue(undefined),
      getGameStateEntityOrThrow: jest.fn().mockResolvedValue({
        state: { currentNodeId: "node-1", flagsJson: "{}" },
        sessionScenario: { id: "session-scenario-1" },
      }),
      parseJson: jest.fn().mockReturnValue({}),
      getVttMapBaseline: jest.fn().mockResolvedValue({ id: "baseline-map", tokens: [] }),
      normalizeVttMap: jest.fn().mockReturnValue({ id: "requested-map", tokens: [] }),
    };
    const service = new MapRuntimeService(
      prisma as never,
      {} as never,
      sessionsService as never,
      {} as never,
    );

    await expect(
      service.updateGmVttMap("host-user", "session-1", {
        map: { id: "requested-map", tokens: [] } as never,
      }),
    ).rejects.toThrow("GM map changes require GM permission.");
  });
});
