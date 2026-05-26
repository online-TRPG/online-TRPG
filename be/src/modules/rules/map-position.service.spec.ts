import { MapPositionService, RuleMapRuntimeContext } from "./map-position.service";

const createMap = (): RuleMapRuntimeContext => ({
  gridType: "square",
  gridSize: 64,
  tokens: [
    {
      sessionCharacterId: "actor",
      x: 0,
      y: 0,
      size: 64,
      hidden: false,
      isHostile: false,
    },
    {
      sessionCharacterId: "ally",
      x: 64,
      y: 64,
      size: 64,
      hidden: false,
      isHostile: false,
    },
    {
      sessionCharacterId: "target",
      x: 128,
      y: 128,
      size: 64,
      hidden: false,
      isHostile: true,
    },
  ],
});

describe("MapPositionService", () => {
  const service = new MapPositionService();

  it("reads VTT map tokens from GameState flags", () => {
    const map = service.createRuntimeMapFromFlagsJson(
      JSON.stringify({
        vttMap: {
          gridType: "square",
          gridSize: 64,
          tokens: [
            {
              sessionCharacterId: "actor",
              x: 0,
              y: 0,
              size: 64,
              hidden: false,
              isHostile: false,
            },
          ],
          objectCells: [
            {
              id: "object-rope",
              x: 64,
              y: 0,
              width: 64,
              height: 64,
              description: "equipment.rope x5",
              hiddenItemIds: ["equipment.rope"],
            },
          ],
        },
      }),
    );

    expect(map).toEqual({
      gridType: "square",
      gridSize: 64,
      tokens: [
        {
          sessionCharacterId: "actor",
          x: 0,
          y: 0,
          size: 64,
          hidden: false,
          isHostile: false,
        },
      ],
      objectCells: [
        {
          id: "object-rope",
          x: 64,
          y: 0,
          width: 64,
          height: 64,
          description: "equipment.rope x5",
          hiddenItemIds: ["equipment.rope"],
        },
      ],
    });
  });

  it("treats diagonal neighboring squares as within 5 feet", () => {
    const map = createMap();

    expect(service.calculateDistanceFeet(map, map.tokens[1], map.tokens[2])).toBe(5);
    expect(
      service.hasActorAllyWithinFeetOfTarget({
        map,
        actorSessionCharacterId: "actor",
        targetSessionCharacterId: "target",
        feet: 5,
      }),
    ).toBe(true);
  });

  it("does not count hidden or same-side tokens as a sneak attack adjacent ally", () => {
    const hiddenAllyMap = createMap();
    hiddenAllyMap.tokens[1] = { ...hiddenAllyMap.tokens[1], hidden: true };
    const sameSideTargetMap = createMap();
    sameSideTargetMap.tokens[2] = { ...sameSideTargetMap.tokens[2], isHostile: false };

    expect(
      service.hasActorAllyWithinFeetOfTarget({
        map: hiddenAllyMap,
        actorSessionCharacterId: "actor",
        targetSessionCharacterId: "target",
        feet: 5,
      }),
    ).toBe(false);
    expect(
      service.hasActorAllyWithinFeetOfTarget({
        map: sameSideTargetMap,
        actorSessionCharacterId: "actor",
        targetSessionCharacterId: "target",
        feet: 5,
      }),
    ).toBe(false);
  });
});
