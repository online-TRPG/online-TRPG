import { ItemInteractionService } from "./item-interaction.service";

describe("ItemInteractionService", () => {
  const service = new ItemInteractionService();

  const dagger = {
    entryId: "entry-dagger",
    itemDefinitionId: "equipment.dagger",
    name: "Dagger",
    quantity: 2,
    damageDice: "1d4",
    damageType: "piercing",
    properties: ["finesse", "light", "thrown"],
  };

  it("resolves dropping an inventory quantity into a map object", () => {
    expect(
      service.resolveDrop({
        item: dagger,
        quantity: 1,
        actorPoint: { x: 1, y: 1 },
        dropPoint: { x: 2, y: 1 },
      }),
    ).toMatchObject({
      type: "drop",
      accepted: true,
      entryId: "entry-dagger",
      removeQuantity: 1,
      createObject: {
        itemDefinitionId: "equipment.dagger",
        name: "Dagger",
        quantity: 1,
        point: { x: 2, y: 1 },
      },
      distanceFt: 5,
    });
  });

  it("rejects dropping more than the actor owns", () => {
    expect(
      service.resolveDrop({
        item: dagger,
        quantity: 3,
        actorPoint: { x: 1, y: 1 },
        dropPoint: { x: 1, y: 1 },
      }),
    ).toEqual({ accepted: false, rejectedReason: "insufficient_quantity" });
  });

  it("resolves picking up a nearby map object", () => {
    expect(
      service.resolvePickup({
        objectId: "object-1",
        itemDefinitionId: "equipment.rope",
        quantity: 1,
        actorPoint: { x: 3, y: 3 },
        objectPoint: { x: 4, y: 3 },
        containerCapacityRemaining: 1,
      }),
    ).toMatchObject({
      type: "pickup",
      accepted: true,
      objectId: "object-1",
      itemDefinitionId: "equipment.rope",
      quantity: 1,
      removeObject: true,
      distanceFt: 5,
    });
  });

  it("rejects pickup when container capacity is too small", () => {
    expect(
      service.resolvePickup({
        objectId: "object-1",
        itemDefinitionId: "equipment.rope",
        quantity: 2,
        actorPoint: { x: 3, y: 3 },
        objectPoint: { x: 3, y: 3 },
        containerCapacityRemaining: 1,
      }),
    ).toMatchObject({
      accepted: false,
      rejectedReason: "container_capacity_exceeded",
    });
  });

  it("resolves thrown weapon attacks with finesse ability choice", () => {
    expect(
      service.resolveThrow({
        item: dagger,
        quantity: 1,
        actorPoint: { x: 0, y: 0 },
        targetPoint: { x: 4, y: 0 },
        strengthModifier: 1,
        dexterityModifier: 3,
        proficiencyBonus: 2,
        proficient: true,
      }),
    ).toMatchObject({
      type: "throw",
      accepted: true,
      attack: {
        kind: "thrown_weapon",
        ability: "dex",
        attackBonus: 5,
        normalRangeFt: 20,
        longRangeFt: 60,
        inNormalRange: true,
        inLongRange: true,
        damageDice: "1d4",
        damageType: "piercing",
      },
      missObject: {
        itemDefinitionId: "equipment.dagger",
        quantity: 1,
        point: { x: 4, y: 0 },
      },
      distanceFt: 20,
    });
  });

  it("resolves improvised thrown items without proficiency by default", () => {
    expect(
      service.resolveThrow({
        item: {
          entryId: "entry-mug",
          itemDefinitionId: "item.mug",
          name: "Mug",
          quantity: 1,
          properties: [],
        },
        quantity: 1,
        actorPoint: { x: 0, y: 0 },
        targetPoint: { x: 10, y: 0 },
        strengthModifier: 2,
        dexterityModifier: 5,
        proficiencyBonus: 3,
      }),
    ).toMatchObject({
      type: "throw",
      accepted: true,
      attack: {
        kind: "improvised_thrown",
        ability: "str",
        attackBonus: 2,
        normalRangeFt: 20,
        longRangeFt: 60,
        inNormalRange: false,
        inLongRange: true,
        damageDice: "1d4",
        damageType: "bludgeoning",
      },
      distanceFt: 50,
    });
  });
});
