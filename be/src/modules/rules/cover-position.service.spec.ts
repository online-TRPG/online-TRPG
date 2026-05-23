import { CoverPositionService } from "./cover-position.service";

describe("CoverPositionService", () => {
  const service = new CoverPositionService();

  it("returns no cover when no blocker intersects the attack line", () => {
    expect(
      service.resolveCover({
        attacker: { x: 0, y: 0 },
        target: { x: 4, y: 0 },
        blockers: [{ point: { x: 2, y: 1 }, coverLevel: "half" }],
      }),
    ).toMatchObject({
      coverLevel: "none",
      targetable: true,
      line: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 4, y: 0 },
      ],
      intersectingBlockers: [],
    });
  });

  it("resolves half cover from one intersecting blocker", () => {
    expect(
      service.resolveCover({
        attacker: { x: 0, y: 0 },
        target: { x: 4, y: 0 },
        blockers: [{ point: { x: 2, y: 0 }, coverLevel: "half" }],
      }),
    ).toMatchObject({
      coverLevel: "half",
      targetable: true,
      intersectingBlockers: [{ point: { x: 2, y: 0 }, coverLevel: "half" }],
    });
  });

  it("promotes multiple partial blockers to three-quarters cover", () => {
    expect(
      service.resolveCover({
        attacker: { x: 0, y: 0 },
        target: { x: 4, y: 0 },
        blockers: [
          { point: { x: 1, y: 0 }, coverLevel: "half" },
          { point: { x: 3, y: 0 }, coverLevel: "half" },
        ],
      }),
    ).toMatchObject({
      coverLevel: "three_quarters",
      targetable: true,
    });
  });

  it("marks full cover as not targetable", () => {
    expect(
      service.resolveCover({
        attacker: { x: 0, y: 0 },
        target: { x: 4, y: 4 },
        blockers: [{ point: { x: 2, y: 2 }, coverLevel: "full", blocksLineOfEffect: true }],
      }),
    ).toMatchObject({
      coverLevel: "full",
      targetable: false,
      line: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
      ],
    });
  });
});
