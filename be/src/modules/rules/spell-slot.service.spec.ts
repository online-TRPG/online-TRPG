import { SpellSlotService } from "./spell-slot.service";

describe("SpellSlotService", () => {
  const service = new SpellSlotService();

  it("resolves full caster slot maximums by class and level", () => {
    expect(service.resolveMaximumForCharacter({ className: "wizard", level: 1 }, 1)).toBe(2);
    expect(service.resolveMaximumForCharacter({ className: "cleric", level: 3 }, 2)).toBe(2);
    expect(service.resolveMaximumForCharacter({ className: "sorcerer", level: 5 }, 3)).toBe(2);
    expect(service.resolveMaximumForCharacter({ className: "wizard", level: 12 }, 6)).toBe(1);
  });

  it("resolves half caster and pact magic slot maximums", () => {
    expect(service.resolveMaximumForCharacter({ className: "paladin", level: 1 }, 1)).toBe(0);
    expect(service.resolveMaximumForCharacter({ className: "paladin", level: 2 }, 1)).toBe(2);
    expect(service.resolveMaximumForCharacter({ className: "ranger", level: 12 }, 3)).toBe(3);
    expect(service.resolveMaximumForCharacter({ className: "warlock", level: 3 }, 1)).toBe(0);
    expect(service.resolveMaximumForCharacter({ className: "warlock", level: 3 }, 2)).toBe(2);
    expect(service.resolveMaximumForCharacter({ className: "warlock", level: 11 }, 5)).toBe(3);
  });
});
