import { DiceAdvantageState } from "@trpg/shared-types";
import { DiceService } from "./dice.service";

describe("DiceService", () => {
  const service = new DiceService(null as never, null as never);

  it("rolls supported dice expressions", () => {
    const result = service.roll("1d20+3");

    expect(result.expression).toBe("1d20+3");
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(result.rolls[0]).toBeLessThanOrEqual(20);
    expect(result.total).toBe(result.rolls[0] + 3);
  });

  it("uses two d20 rolls for advantage", () => {
    const result = service.roll("1d20", DiceAdvantageState.ADVANTAGE);

    expect(result.rolls).toHaveLength(2);
    expect(result.total).toBe(Math.max(...result.rolls));
    expect(result.advantageState).toBe(DiceAdvantageState.ADVANTAGE);
  });

  it("rejects unsupported dice", () => {
    expect(() => service.roll("1d3")).toThrow("지원하지 않는 주사위입니다.");
  });
});
