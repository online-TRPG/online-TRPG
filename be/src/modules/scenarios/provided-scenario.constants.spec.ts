import {
  DEFAULT_PROVIDED_SCENARIO_ID,
  PROVIDED_SCENARIO_IDS,
  isDefaultProvidedScenarioId,
  isProvidedScenarioId,
} from "./provided-scenario.constants";

describe("provided scenario constants", () => {
  it("keeps the legacy default id and exposes seeded smoke scenarios as provided", () => {
    expect(isDefaultProvidedScenarioId(DEFAULT_PROVIDED_SCENARIO_ID)).toBe(true);
    expect(PROVIDED_SCENARIO_IDS).toEqual([
      DEFAULT_PROVIDED_SCENARIO_ID,
      "scenario_goblin_cave",
      "scenario_node_screen_test",
      "scenario_rule_runtime_smoke",
    ]);
    expect(isProvidedScenarioId("scenario_rule_runtime_smoke")).toBe(true);
    expect(isProvidedScenarioId("scenario_user_private")).toBe(false);
  });
});
