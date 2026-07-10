import {
  parseJsonRecordOrFallback,
  parseJsonRecordOrThrow,
} from "./json-runtime";

describe("json runtime", () => {
  it("uses the default only when strict JSON is absent", () => {
    expect(parseJsonRecordOrThrow(null, { empty: true }, "gameState.flagsJson")).toEqual({
      empty: true,
    });
  });

  it("rejects malformed syntax and non-record strict JSON", () => {
    expect(() => parseJsonRecordOrThrow("{bad", {}, "gameState.flagsJson")).toThrow(
      "gameState.flagsJson is not valid JSON.",
    );
    expect(() => parseJsonRecordOrThrow("[]", {}, "gameState.flagsJson")).toThrow(
      "gameState.flagsJson",
    );
  });

  it("keeps explicit mapper fallback behavior", () => {
    expect(parseJsonRecordOrFallback("{bad", { recovered: true })).toEqual({
      recovered: true,
    });
    expect(parseJsonRecordOrFallback("[]", { recovered: true })).toEqual({
      recovered: true,
    });
  });
});
