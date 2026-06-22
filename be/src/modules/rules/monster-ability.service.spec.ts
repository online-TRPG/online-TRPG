import { MonsterAbilityService } from "./monster-ability.service";

describe("MonsterAbilityService", () => {
  const service = new MonsterAbilityService();

  it("projects catalog monster attacks into executable actions", () => {
    expect(service.listExecutableActions("goblin")).toEqual([
      {
        monsterId: "monster.goblin",
        actionId: "monster.goblin.ability.nimble_escape",
        label: "Nimble Escape",
        attackKind: "special",
        attackBonus: 0,
        damageDice: "",
        damageType: null,
        reachFt: null,
        rangeFt: null,
        confidence: "medium",
        catalogEntryId: "monster.goblin.ability.nimble_escape",
        costType: "bonus_action",
        specialType: "mobility",
        usage: null,
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: ["disengage", "hide"],
      },
      {
        monsterId: "monster.goblin",
        actionId: "action.scimitar",
        label: "Scimitar",
        attackKind: "melee_weapon",
        attackBonus: 4,
        damageDice: "1d6+2",
        damageType: "slashing",
        reachFt: 5,
        rangeFt: null,
        confidence: "high",
        catalogEntryId: "monster.goblin.ability.scimitar",
        costType: "action",
        specialType: null,
        usage: null,
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: [],
      },
      {
        monsterId: "monster.goblin",
        actionId: "action.shortbow",
        label: "Shortbow",
        attackKind: "ranged_weapon",
        attackBonus: 4,
        damageDice: "1d6+2",
        damageType: "piercing",
        reachFt: null,
        rangeFt: { normal: 80, long: 320 },
        confidence: "high",
        catalogEntryId: "monster.goblin.ability.shortbow",
        costType: "action",
        specialType: null,
        usage: null,
        recharge: null,
        save: null,
        conditionRiders: [],
        effectTags: [],
      },
    ]);
  });

  it("chooses preferred action ids and falls back to the monster preference order", () => {
    expect(service.chooseAction("monster.goblin", "action.shortbow")).toMatchObject({
      actionId: "action.shortbow",
      rangeFt: { normal: 80, long: 320 },
    });

    expect(service.chooseAction("monster.goblin")).toMatchObject({
      actionId: "action.scimitar",
      reachFt: 5,
    });

    expect(service.chooseAction("monster.giant_rat")).toMatchObject({
      actionId: "action.bite",
      damageDice: "1d4+2",
      damageType: "piercing",
    });
  });

  it("exposes multiattack references from catalog tags", () => {
    const actions = service.listExecutableActions("monster.brown_bear");

    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionId: "monster.brown_bear.ability.multiattack",
        attackKind: "special",
        costType: "action",
        specialType: "multiattack",
        effectTags: ["multiattack:action.bite:1", "multiattack:action.claws:1"],
      }),
      expect.objectContaining({
        actionId: "action.bite",
        attackKind: "melee_weapon",
        damageDice: "1d8+4",
      }),
      expect.objectContaining({
        actionId: "action.claws",
        attackKind: "melee_weapon",
        damageDice: "2d6+4",
      }),
    ]));
  });

  it("projects save-based condition riders for giant spider bite", () => {
    expect(service.chooseAction("monster.giant_spider", "action.bite")).toMatchObject({
      actionId: "action.bite",
      attackKind: "melee_weapon",
      attackBonus: 5,
      damageDice: "1d8+3",
      damageType: "piercing",
      save: { ability: "con", dcSource: "fixed", fixedDc: 11 },
      conditionRiders: ["condition.poisoned"],
    });
  });

  it("covers the P1 representative monster set with executable actions", () => {
    const p1MonsterIds = [
      "monster.goblin",
      "monster.orc",
      "monster.wolf",
      "monster.skeleton",
      "monster.zombie",
      "monster.giant_spider",
      "monster.brown_bear",
      "monster.dragon_whelp",
      "monster.cultist",
      "monster.ogre",
    ];

    for (const monsterId of p1MonsterIds) {
      expect(service.listExecutableActions(monsterId).length).toBeGreaterThan(0);
      expect(service.chooseAction(monsterId)).toMatchObject({ monsterId });
    }
  });

  it("covers all P2 representative monsters with executable catalog actions", () => {
    const p2MonsterIds = [
      "monster.kobold",
      "monster.bandit",
      "monster.bugbear",
      "monster.hobgoblin",
      "monster.dire_wolf",
      "monster.ghoul",
      "monster.wight",
      "monster.mimic",
      "monster.gelatinous_cube",
      "monster.swarm_of_rats",
      "monster.animated_armor",
      "monster.gargoyle",
      "monster.harpy",
      "monster.giant_scorpion",
      "monster.young_red_dragon",
    ];

    for (const monsterId of p2MonsterIds) {
      expect(service.listExecutableActions(monsterId).length).toBeGreaterThan(0);
      expect(service.chooseAction(monsterId)).toMatchObject({ monsterId });
    }

    expect(service.chooseAction("monster.dire_wolf")).toMatchObject({
      save: { ability: "str", fixedDc: 13 },
      conditionRiders: ["condition.prone"],
    });
    expect(service.chooseAction("monster.giant_scorpion")).toMatchObject({
      specialType: "multiattack",
      effectTags: expect.arrayContaining([
        "multiattack:action.claw:2",
        "multiattack:action.sting:1",
      ]),
    });
    expect(service.chooseAction("monster.young_red_dragon")).toMatchObject({
      actionId: "action.fire_breath",
      specialType: "area_attack",
      recharge: "5-6",
      damageDice: "16d6",
    });
  });

  it("projects P1 recharge, save rider, and ranged/melee thrown metadata", () => {
    expect(service.chooseAction("monster.dragon_whelp")).toMatchObject({
      actionId: "action.fire_breath",
      costType: "action",
      specialType: "area_attack",
      recharge: "5-6",
      save: { ability: "dex", dcSource: "fixed", fixedDc: 13 },
      damageDice: "4d6",
      damageType: "fire",
    });
    expect(service.listExecutableActions("monster.dragon_whelp")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "monster.dragon_whelp.ability.dark_blessing",
          costType: "none",
          specialType: "aura",
          usage: "1/day",
          effectTags: expect.arrayContaining([
            "aura:dark_blessing",
            "trigger:on_turn_start",
          ]),
        }),
      ]),
    );

    expect(service.chooseAction("monster.wolf")).toMatchObject({
      actionId: "action.bite",
      save: { ability: "str", dcSource: "fixed", fixedDc: 11 },
      conditionRiders: ["condition.prone"],
    });

    expect(service.chooseAction("monster.orc", "action.javelin")).toMatchObject({
      actionId: "action.javelin",
      attackKind: "ranged_weapon",
      rangeFt: { normal: 30, long: 120 },
    });
  });

  it("returns no executable actions for monsters without catalog attacks", () => {
    expect(service.listExecutableActions("monster.unknown")).toEqual([]);
    expect(service.chooseAction("monster.unknown")).toBeNull();
  });
});
