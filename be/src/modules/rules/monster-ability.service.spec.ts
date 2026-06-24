import { MonsterAbilityService } from "./monster-ability.service";
import { P4_EXECUTABLE_MONSTER_IDS } from "./p4-monster-definitions";
import { P5_EXECUTABLE_MONSTER_IDS } from "./p5-monster-definitions";

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

  it("covers the P3 monster roster and exposes representative complex actions", () => {
    const p3MonsterIds = [
      "monster.black_bear",
      "monster.lion",
      "monster.tiger",
      "monster.troll",
      "monster.hill_giant",
      "monster.giant_eagle",
      "monster.giant_owl",
      "monster.manticore",
      "monster.griffon",
      "monster.merrow",
      "monster.acolyte",
      "monster.mage",
      "monster.priest",
      "monster.cult_fanatic",
      "monster.mummy",
      "monster.specter",
      "monster.ghost",
      "monster.stone_golem",
      "monster.water_elemental",
      "monster.swarm_of_insects",
      "monster.quasit",
      "monster.basilisk",
      "monster.wyvern",
      "monster.young_blue_dragon",
    ];

    for (const monsterId of p3MonsterIds) {
      expect(service.listExecutableActions(monsterId).length).toBeGreaterThan(0);
      expect(service.chooseAction(monsterId)).toMatchObject({ monsterId });
    }

    expect(service.chooseAction("monster.mage")).toMatchObject({
      actionId: "action.fireball",
      specialType: "area_attack",
      usage: "3/day",
    });
    expect(service.chooseAction("monster.stone_golem")).toMatchObject({
      actionId: "action.slow",
      specialType: "area_control",
      recharge: "5-6",
      conditionRiders: ["condition.slowed"],
    });
    expect(service.chooseAction("monster.young_blue_dragon")).toMatchObject({
      actionId: "action.lightning_breath",
      specialType: "area_attack",
      recharge: "5-6",
      damageDice: "10d10",
    });
  });

  it("covers the P4 monster roster with executable common action projections", () => {
    expect(P4_EXECUTABLE_MONSTER_IDS).toHaveLength(50);

    for (const monsterId of P4_EXECUTABLE_MONSTER_IDS) {
      const actions = service.listExecutableActions(monsterId);
      expect(actions.length).toBeGreaterThan(0);
      expect(service.chooseAction(monsterId)).toMatchObject({ monsterId });
      expect(actions.every((action) => action.catalogEntryId.startsWith(`${monsterId}.ability.`))).toBe(true);
    }
  });

  it("projects P4 recharge, condition lifecycle, boss, and spellcaster metadata", () => {
    expect(service.chooseAction("monster.young_black_dragon")).toMatchObject({
      actionId: "monster.young_black_dragon.ability.acid_breath",
      specialType: "area_attack",
      recharge: "5-6",
      save: { ability: "dex", dcSource: "fixed", fixedDc: 14 },
      damageDice: "11d8",
      damageType: "acid",
      effectTags: expect.arrayContaining(["area_size:30"]),
    });

    expect(service.chooseAction("monster.medusa")).toMatchObject({
      actionId: "monster.medusa.ability.petrifying_gaze",
      specialType: null,
      save: { ability: "con", dcSource: "fixed", fixedDc: 14 },
      conditionRiders: ["condition.petrified"],
    });

    expect(service.chooseAction("monster.roper")).toMatchObject({
      actionId: "monster.roper.ability.tendril",
      save: { ability: "str", dcSource: "fixed", fixedDc: 15 },
      conditionRiders: ["condition.grappled", "condition.restrained"],
    });

    expect(service.chooseAction("monster.hydra")).toMatchObject({
      actionId: "monster.hydra.ability.multiple_heads",
      costType: "none",
      specialType: "multiattack",
      effectTags: expect.arrayContaining(["multiattack:heads"]),
    });

    expect(service.chooseAction("monster.archmage")).toMatchObject({
      actionId: "monster.archmage.ability.spell_burst",
      attackKind: "special",
      damageDice: "8d6",
      damageType: "fire_lightning_force",
    });
  });

  it("covers the P5 monster roster with executable common action projections", () => {
    expect(P5_EXECUTABLE_MONSTER_IDS).toHaveLength(80);

    for (const monsterId of P5_EXECUTABLE_MONSTER_IDS) {
      const actions = service.listExecutableActions(monsterId);
      expect(actions.length).toBeGreaterThan(0);
      expect(service.chooseAction(monsterId)).toMatchObject({ monsterId });
      expect(actions.every((action) => action.catalogEntryId.startsWith(`${monsterId}.ability.`))).toBe(true);
    }
  });

  it("projects P5 legendary, phase, spellcaster, and campaign-scale metadata", () => {
    expect(service.chooseAction("monster.ancient_red_dragon")).toMatchObject({
      actionId: "monster.ancient_red_dragon.ability.fire_breath",
      specialType: "area_attack",
      recharge: "5-6",
      save: { ability: "dex", dcSource: "fixed", fixedDc: 24 },
      damageDice: "26d6",
      damageType: "fire",
      effectTags: expect.arrayContaining(["area_size:90"]),
    });

    expect(service.chooseAction("monster.kraken")).toMatchObject({
      actionId: "monster.kraken.ability.lightning_storm",
      specialType: "area_attack",
      conditionRiders: ["condition.grappled"],
      recharge: "5-6",
    });

    expect(service.chooseAction("monster.beholder")).toMatchObject({
      actionId: "monster.beholder.ability.eye_rays",
      attackKind: "special",
      conditionRiders: expect.arrayContaining(["condition.petrified", "condition.paralyzed"]),
    });

    expect(service.chooseAction("monster.night_hag")).toMatchObject({
      actionId: "monster.night_hag.ability.nightmare_haunting",
      damageDice: "1d10",
      damageType: "psychic",
      effectTags: expect.arrayContaining(["campaign_downtime_threat"]),
    });

    expect(service.chooseAction("monster.tarrasque")).toMatchObject({
      actionId: "monster.tarrasque.ability.frightful_presence",
      specialType: "area_control",
      conditionRiders: ["condition.frightened"],
      effectTags: expect.arrayContaining(["area_size:120"]),
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
