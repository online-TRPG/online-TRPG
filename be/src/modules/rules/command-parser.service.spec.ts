import { CommandParserService } from "./command-parser.service";

describe("CommandParserService", () => {
  const service = new CommandParserService();

  it("parses roll commands", () => {
    expect(service.parse("/roll 1d20+3")).toEqual({
      type: "roll",
      expression: "1d20+3",
    });
  });

  it("parses check commands with a DC", () => {
    expect(service.parse("/check perception 15")).toEqual({
      type: "check",
      checkName: "perception",
      dc: 15,
    });
  });

  it("parses saving throw commands with an optional save-end condition", () => {
    expect(service.parse("/save target-1 con 13 poisoned")).toEqual({
      type: "save",
      target: "target-1",
      ability: "con",
      dc: 13,
      condition: "poisoned",
    });
    expect(service.parse("/save target-1 dex dc=15")).toEqual({
      type: "save",
      target: "target-1",
      ability: "dex",
      dc: 15,
      condition: null,
    });
  });

  it("parses damage commands", () => {
    expect(service.parse("/damage target-1 7")).toEqual({
      type: "damage",
      target: "target-1",
      amount: 7,
    });
  });

  it("parses damage commands with a damage type", () => {
    expect(service.parse("/damage target-1 7 fire")).toEqual({
      type: "damage",
      target: "target-1",
      amount: 7,
      damageType: "fire",
    });
  });

  it("parses chill touch spell commands", () => {
    expect(service.parse("/cast chill_touch target-1 90")).toEqual({
      type: "cast_spell",
      spellId: "spell.chill_touch",
      target: "target-1",
      targetDistanceFt: 90,
      slotLevel: null,
    });
  });

  it("parses spell commands with an explicit slot level", () => {
    expect(service.parse("/cast magic_missile target-1 120 3")).toEqual({
      type: "cast_spell",
      spellId: "spell.magic_missile",
      target: "target-1",
      targetDistanceFt: 120,
      slotLevel: 3,
    });
  });

  it("parses area spell commands with save DC, targets, and slot level", () => {
    expect(service.parse("/cast_area fireball 15 target-1,target-2 4")).toEqual({
      type: "cast_area_spell",
      spellId: "spell.fireball",
      saveDc: 15,
      targetIds: ["target-1", "target-2"],
      slotLevel: 4,
    });
  });

  it("parses self-target utility spells without a target token", () => {
    expect(service.parse("/cast detect_magic")).toEqual({
      type: "cast_spell",
      spellId: "spell.detect_magic",
      target: "self",
      targetDistanceFt: 0,
      slotLevel: null,
    });
  });

  it("parses condition commands with VTT token targets", () => {
    expect(service.parse("/condition add token_node_rule_smoke_condition_goblin stunned")).toEqual({
      type: "condition",
      operation: "add",
      target: "token_node_rule_smoke_condition_goblin",
      condition: "stunned",
    });
  });

  it("parses ready action commands", () => {
    expect(service.parse("/ready enter attack monster-1 30")).toEqual({
      type: "ready",
      trigger: {
        type: "creature_enters_range",
        targetParticipantId: "monster-1",
        rangeFt: 30,
        tags: ["targeted"],
      },
      heldAction: {
        type: "attack",
        targetParticipantId: "monster-1",
      },
    });

    expect(service.parse("/ready enter move x=100 y=0 30")).toEqual({
      type: "ready",
      trigger: {
        type: "creature_enters_range",
        targetParticipantId: null,
        rangeFt: 30,
        tags: [],
      },
      heldAction: {
        type: "move",
        targetPoint: { x: 100, y: 0 },
      },
    });

    expect(service.parse("/ready turn_start attack monster-1")).toEqual({
      type: "ready",
      trigger: {
        type: "turn_start",
        targetParticipantId: "monster-1",
        rangeFt: null,
        tags: ["targeted"],
      },
      heldAction: {
        type: "attack",
        targetParticipantId: "monster-1",
      },
    });

    expect(service.parse("/ready turn-end attack monster-1")).toEqual({
      type: "ready",
      trigger: {
        type: "turn_end",
        targetParticipantId: "monster-1",
        rangeFt: null,
        tags: ["targeted"],
      },
      heldAction: {
        type: "attack",
        targetParticipantId: "monster-1",
      },
    });
  });

  it("parses class feature commands", () => {
    expect(service.parse("/feature second_wind")).toEqual({
      type: "use_class_feature",
      featureId: "class.fighter.feature.second_wind",
      option: null,
    });
  });

  it("parses class feature commands with an option", () => {
    expect(service.parse("/feature cunning_action hide")).toEqual({
      type: "use_class_feature",
      featureId: "class.rogue.feature.cunning_action",
      option: "hide",
    });
  });

  it("parses frenzy class feature commands", () => {
    expect(service.parse("/feature frenzy")).toEqual({
      type: "use_class_feature",
      featureId: "class.barbarian.subclass_feature.frenzy",
      option: null,
    });
  });

  it.each([
    ["divine_sense", "class.paladin.feature.divine_sense"],
    ["lay_on_hands", "class.paladin.feature.lay_on_hands"],
    ["primeval_awareness", "class.ranger.feature.primeval_awareness"],
    ["ki", "class.monk.feature.ki"],
    ["channel_divinity", "class.cleric.feature.channel_divinity"],
    ["bardic_inspiration", "class.bard.feature.bardic_inspiration"],
    ["font_of_magic", "class.sorcerer.feature.font_of_magic"],
    ["wild_shape", "class.druid.feature.wild_shape"],
  ])("parses the P1 class feature command %s", (command, featureId) => {
    expect(service.parse(`/feature ${command}`)).toEqual({
      type: "use_class_feature",
      featureId,
      option: null,
    });
  });

  it("parses rest commands", () => {
    expect(service.parse("/rest short")).toEqual({
      type: "rest",
      restType: "short",
    });
    expect(service.parse("/rest short 2")).toEqual({
      type: "rest",
      restType: "short",
      hitDiceToSpend: 2,
    });
    expect(service.parse("/rest long_rest")).toEqual({
      type: "rest",
      restType: "long",
    });
  });

  it("parses inventory commands", () => {
    expect(service.parse("/item add item.potion 2")).toEqual({
      type: "inventory",
      operation: "add",
      itemId: "item.potion",
      quantity: 2,
      containerEntryId: null,
    });
    expect(service.parse("/inventory lose entry-1")).toEqual({
      type: "inventory",
      operation: "remove",
      itemId: "entry-1",
      quantity: 1,
      containerEntryId: null,
    });
  });

  it("parses item drop, pickup, and throw commands with grid points", () => {
    expect(service.parse("/item drop entry-dagger 1 2 3")).toEqual({
      type: "item_interaction",
      operation: "drop",
      itemId: "entry-dagger",
      quantity: 1,
      point: { x: 2, y: 3 },
    });

    expect(service.parse("/item pickup object-rope equipment.rope 1 2 3")).toEqual({
      type: "item_interaction",
      operation: "pickup",
      objectId: "object-rope",
      itemDefinitionId: "equipment.rope",
      quantity: 1,
      point: { x: 2, y: 3 },
    });

    expect(service.parse("/item throw entry-dagger 1 4 0")).toEqual({
      type: "item_interaction",
      operation: "throw",
      itemId: "entry-dagger",
      quantity: 1,
      point: { x: 4, y: 0 },
    });
  });
});
