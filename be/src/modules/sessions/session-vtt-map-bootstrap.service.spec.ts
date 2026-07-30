import { SessionCharacterStatus as PrismaSessionCharacterStatus } from "@prisma/client";
import { VttMapStateDto } from "@trpg/shared-types";
import { SessionVttMapBootstrapService } from "./session-vtt-map-bootstrap.service";

describe("SessionVttMapBootstrapService", () => {
  const prisma = {
    sessionCharacter: {
      findMany: jest.fn(),
    },
  };
  const service = new SessionVttMapBootstrapService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds a default VTT map with active session character tokens", async () => {
    prisma.sessionCharacter.findMany.mockResolvedValue([
      {
        id: "session-character-1",
        character: { name: "Ari", avatarUrl: "https://example.test/ari.png" },
      },
    ]);

    const map = await service.buildDefaultMap("session-1", "node-1");

    expect(prisma.sessionCharacter.findMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        status: PrismaSessionCharacterStatus.ACTIVE,
      },
      include: { character: true },
      orderBy: { createdAt: "asc" },
    });
    expect(map).toMatchObject({
      id: "map:session-1",
      scenarioNodeId: "node-1",
      gridSize: 64,
      width: 1280,
      height: 832,
    });
    expect(map.startingPositions).toHaveLength(4);
    expect(map.tokens[0]).toMatchObject({
      id: "token:session-character-1",
      sessionCharacterId: "session-character-1",
      startingPositionId: "start:1",
      name: "Ari",
      imageUrl: "https://example.test/ari.png",
      x: 128,
      y: 640,
      size: 64,
      isHostile: false,
    });
  });

  it("assigns only unused slots to newly joined characters", async () => {
    prisma.sessionCharacter.findMany.mockResolvedValue([
      {
        id: "session-character-1",
        character: { name: "Ari", avatarUrl: null },
      },
      {
        id: "session-character-2",
        character: { name: "Borin", avatarUrl: null },
      },
    ]);
    const map: VttMapStateDto = {
      id: "scenario-map",
      scenarioNodeId: "node-1",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 480,
      tokens: [
        {
          id: "token:session-character-1",
          sessionCharacterId: "session-character-1",
          startingPositionId: "start-2",
          name: "Ari",
          imageUrl: null,
          x: 333,
          y: 222,
          size: 64,
        },
      ],
      fogRects: [],
      startingPositions: [
        { id: "start-1", label: "P1", x: 64, y: 64 },
        { id: "start-2", label: "P2", x: 128, y: 64 },
      ],
      terrainCells: [],
      wallCells: [],
      doorCells: [],
      objectCells: [],
      updatedAt: "2026-07-02T00:00:00.000Z",
    };

    const applied = await service.applyScenarioStartingPositions("session-1", map);

    expect(applied.tokens).toEqual([
      expect.objectContaining({
        sessionCharacterId: "session-character-1",
        startingPositionId: "start-2",
        x: 333,
        y: 222,
      }),
      expect.objectContaining({
        sessionCharacterId: "session-character-2",
        startingPositionId: "start-1",
        x: 64,
        y: 64,
      }),
    ]);
  });

  it("preserves non-player tokens and reuses existing player token position", async () => {
    prisma.sessionCharacter.findMany.mockResolvedValue([
      {
        id: "session-character-1",
        character: { name: "Ari", avatarUrl: null },
      },
    ]);
    const map: VttMapStateDto = {
      id: "scenario-map",
      scenarioNodeId: "node-1",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 320,
      height: 240,
      tokens: [
        {
          id: "npc-1",
          name: "Goblin",
          imageUrl: null,
          x: 64,
          y: 64,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: null,
        },
        {
          id: "old-token",
          sessionCharacterId: "session-character-1",
          name: "",
          imageUrl: "old.png",
          x: 999,
          y: -10,
          size: 999,
          hidden: true,
          isHostile: true,
          monster: { id: "old-monster" } as never,
        },
      ],
      fogRects: [],
      startingPositions: [{ id: "start-1", label: "P1", x: 0, y: 0 }],
      terrainCells: [],
      wallCells: [],
      doorCells: [],
      objectCells: [],
      updatedAt: "2026-07-02T00:00:00.000Z",
    };

    const applied = await service.applyScenarioStartingPositions("session-1", map);

    expect(applied.tokens).toEqual([
      expect.objectContaining({
        id: "npc-1",
        isHostile: true,
      }),
      expect.objectContaining({
        id: "old-token",
        sessionCharacterId: "session-character-1",
        name: "Ari",
        imageUrl: "old.png",
        x: 256,
        y: 0,
        size: 160,
        isHostile: false,
        monster: null,
      }),
    ]);
  });
});
