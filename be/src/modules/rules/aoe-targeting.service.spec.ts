import { AoeTargetingService } from "./aoe-targeting.service";

describe("AoeTargetingService", () => {
  const service = new AoeTargetingService();

  it("resolves sphere cells and visible token ids", () => {
    expect(
      service.resolveTargets({
        shape: "sphere",
        origin: { column: 2, row: 2 },
        sizeFt: 5,
        grid: { columns: 5, rows: 5 },
        tokens: [
          { id: "center", column: 2, row: 2 },
          { id: "edge", column: 3, row: 2 },
          { id: "hidden", column: 2, row: 3, hidden: true },
          { id: "outside", column: 4, row: 4 },
        ],
      }),
    ).toEqual({
      shape: "sphere",
      origin: { column: 2, row: 2 },
      sizeFt: 5,
      cells: [
        { column: 2, row: 1 },
        { column: 1, row: 2 },
        { column: 2, row: 2 },
        { column: 3, row: 2 },
        { column: 2, row: 3 },
      ],
      tokenIds: ["center", "edge"],
    });
  });

  it("resolves a cone in the requested direction", () => {
    const result = service.resolveTargets({
      shape: "cone",
      origin: { column: 1, row: 2 },
      sizeFt: 10,
      direction: "east",
      grid: { columns: 5, rows: 5 },
    });

    expect(result.cells).toEqual([
      { column: 2, row: 1 },
      { column: 1, row: 2 },
      { column: 2, row: 2 },
      { column: 3, row: 2 },
      { column: 2, row: 3 },
    ]);
  });

  it("resolves a diagonal line and clamps it to the grid", () => {
    const result = service.resolveTargets({
      shape: "line",
      origin: { column: 3, row: 3 },
      sizeFt: 15,
      direction: "south_east",
      grid: { columns: 5, rows: 5 },
    });

    expect(result.cells).toEqual([
      { column: 3, row: 3 },
      { column: 4, row: 4 },
    ]);
  });

  it("resolves a cube from its origin corner", () => {
    const result = service.resolveTargets({
      shape: "cube",
      origin: { column: 1, row: 1 },
      sizeFt: 10,
      grid: { columns: 4, rows: 4 },
    });

    expect(result.cells).toEqual([
      { column: 1, row: 1 },
      { column: 2, row: 1 },
      { column: 1, row: 2 },
      { column: 2, row: 2 },
    ]);
  });
});
