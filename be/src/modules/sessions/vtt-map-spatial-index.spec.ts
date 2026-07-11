import { VttMapSpatialIndex } from "./vtt-map-spatial-index";

describe("VttMapSpatialIndex", () => {
  it("returns only unique entries from intersecting chunks", () => {
    const large = { id: "large", x: 20, y: 20, width: 80, height: 80 };
    const distant = { id: "distant", x: 400, y: 400, width: 40, height: 40 };
    const index = new VttMapSpatialIndex(40, [large, distant]);

    expect(index.query({ x: 0, y: 0, width: 120, height: 40 })).toEqual([large]);
    expect(index.query({ x: 360, y: 360, width: 120, height: 120 })).toEqual([distant]);
  });

  it("falls back to a bounded exact scan for a very large sparse query", () => {
    const inside = { id: "inside", x: 0, y: 0, width: 40, height: 40 };
    const outside = { id: "outside", x: 10000, y: 10000, width: 40, height: 40 };
    const index = new VttMapSpatialIndex(40, [inside, outside]);

    expect(index.query({ x: -5000, y: -5000, width: 10000, height: 10000 })).toEqual([
      inside,
    ]);
    expect(index.getQueryStats()).toEqual({
      chunkQueryCount: 0,
      scanFallbackQueryCount: 1,
      largeEntryCount: 0,
    });
  });

  it("indexes a map-sized object without enumerating every covered chunk", () => {
    const mapSized = { id: "map-sized", x: -100000, y: -100000, width: 200000, height: 200000 };
    const local = { id: "local", x: 400, y: 400, width: 40, height: 40 };
    const index = new VttMapSpatialIndex(40, [mapSized, local]);

    expect(index.query({ x: 380, y: 380, width: 80, height: 80 })).toEqual([
      mapSized,
      local,
    ]);
    expect(index.getQueryStats()).toEqual({
      chunkQueryCount: 1,
      scanFallbackQueryCount: 0,
      largeEntryCount: 1,
    });
  });

  it("never omits a geometrically overlapping entry", () => {
    const entries = Array.from({ length: 400 }, (_, index) => ({
      id: `entry-${index}`,
      x: (index % 20) * 40 - 80,
      y: Math.floor(index / 20) * 40 - 80,
      width: index % 7 === 0 ? 80 : 40,
      height: index % 11 === 0 ? 80 : 40,
    }));
    const query = { x: 115, y: 155, width: 190, height: 150 };
    const expectedIds = new Set(
      entries
        .filter(
          (entry) =>
            entry.x < query.x + query.width &&
            entry.x + entry.width > query.x &&
            entry.y < query.y + query.height &&
            entry.y + entry.height > query.y,
        )
        .map((entry) => entry.id),
    );
    const actualIds = new Set(
      new VttMapSpatialIndex(40, entries).query(query).map((entry) => entry.id),
    );

    expect([...expectedIds].every((id) => actualIds.has(id))).toBe(true);
  });
});
