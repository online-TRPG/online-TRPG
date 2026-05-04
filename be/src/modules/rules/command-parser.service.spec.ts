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

  it("parses class feature commands", () => {
    expect(service.parse("/feature second_wind")).toEqual({
      type: "use_class_feature",
      featureId: "class.fighter.feature.second_wind",
      option: null,
    });
  });
});
