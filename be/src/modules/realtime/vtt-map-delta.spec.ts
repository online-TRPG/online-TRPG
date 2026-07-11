import {
  applyVttMapDelta,
  buildVttMapDelta,
  type VttMapStateDto,
} from "@trpg/shared-types";

function createMap(updatedAt: string): VttMapStateDto {
  return {
    id: "map-1",
    scenarioNodeId: "node-1",
    imageUrl: null,
    gridType: "square",
    gridSize: 40,
    width: 800,
    height: 600,
    tokens: [
      { id: "token-1", name: "Hero", x: 0, y: 0, size: 40 },
      { id: "token-2", name: "Scout", x: 40, y: 0, size: 40 },
    ],
    fogRects: [],
    objectCells: [
      { id: "object-1", x: 80, y: 80, width: 40, height: 40 },
    ],
    updatedAt,
  };
}

describe("VTT map delta", () => {
  it("round-trips changed and removed entities", () => {
    const previous = createMap("2026-07-10T00:00:00.000Z");
    const next = {
      ...previous,
      tokens: [
        { ...previous.tokens[0], x: 120 },
        { id: "token-3", name: "Mage", x: 80, y: 0, size: 40 },
      ],
      objectCells: [
        { ...previous.objectCells![0], visibleToPlayers: false },
      ],
      pings: [{ id: "ping-1", x: 100, y: 100, label: "!", expiresAt: "2026-07-10T00:00:03.000Z" }],
      updatedAt: "2026-07-10T00:00:01.000Z",
    } satisfies VttMapStateDto;

    const delta = buildVttMapDelta(previous, next);

    expect(delta).not.toBeNull();
    expect(delta?.changedTokens.map((token) => token.id)).toEqual(["token-1", "token-3"]);
    expect(delta?.removedTokenIds).toEqual(["token-2"]);
    expect(applyVttMapDelta(previous, delta!)).toEqual({
      status: "applied",
      map: next,
    });
  });

  it("rejects a delta when the local map version is stale", () => {
    const previous = createMap("2026-07-10T00:00:00.000Z");
    const next = {
      ...previous,
      updatedAt: "2026-07-10T00:00:01.000Z",
    };
    const stale = {
      ...previous,
      updatedAt: "2026-07-09T23:59:59.000Z",
    };

    expect(applyVttMapDelta(stale, buildVttMapDelta(previous, next)!)).toEqual({
      status: "version_mismatch",
    });
  });

  it("accepts an HTTP-applied map when its socket delta is an echo", () => {
    const previous = createMap("2026-07-10T00:00:00.000Z");
    const next = {
      ...previous,
      tokens: [{ ...previous.tokens[0], x: 40 }, previous.tokens[1]],
      updatedAt: "2026-07-10T00:00:01.000Z",
    };

    expect(applyVttMapDelta(next, buildVttMapDelta(previous, next)!)).toEqual({
      status: "applied",
      map: next,
    });
  });

  it("preserves removal of the optional objectCells field", () => {
    const previous = createMap("2026-07-10T00:00:00.000Z");
    const { objectCells: _removedObjectCells, ...withoutObjectCells } = previous;
    const next = {
      ...withoutObjectCells,
      updatedAt: "2026-07-10T00:00:01.000Z",
    };

    expect(applyVttMapDelta(previous, buildVttMapDelta(previous, next)!)).toEqual({
      status: "applied",
      map: next,
    });
  });
});
