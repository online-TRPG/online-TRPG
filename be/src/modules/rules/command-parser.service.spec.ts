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
    });
  });

  it("normalizes MVP spell aliases", () => {
    expect(service.parse("/cast firebolt target-1")).toMatchObject({
      type: "cast_spell",
      spellId: "spell.fire_bolt",
      target: "target-1",
      targetDistanceFt: 90,
    });
    expect(service.parse("/cast magic-missile target-1")).toMatchObject({
      spellId: "spell.magic_missile",
    });
    expect(service.parse("/cast cure-wounds target-1 5")).toMatchObject({
      spellId: "spell.cure_wounds",
      targetDistanceFt: 5,
    });
  });

  it("parses potion use commands", () => {
    expect(service.parse("/item potion target-1")).toEqual({
      type: "use_item",
      itemId: "magic_item.potion_of_healing",
      target: "target-1",
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

  it("parses rest commands", () => {
    expect(service.parse("/rest short")).toEqual({
      type: "rest",
      restType: "short",
    });
    expect(service.parse("/rest long_rest")).toEqual({
      type: "rest",
      restType: "long",
    });
  });
});
