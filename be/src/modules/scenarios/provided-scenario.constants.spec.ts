import {
  DEFAULT_PROVIDED_SCENARIO_ID,
  PROVIDED_SCENARIO_IDS,
  isDefaultProvidedScenarioId,
  isProvidedScenarioId,
} from "./provided-scenario.constants";

describe("provided scenario constants", () => {
  it("uses the seeded system scenario as default and exposes provided scenarios", () => {
    expect(isDefaultProvidedScenarioId(DEFAULT_PROVIDED_SCENARIO_ID)).toBe(true);
    expect(PROVIDED_SCENARIO_IDS).toEqual([
      DEFAULT_PROVIDED_SCENARIO_ID,
      "scenario_node_screen_test",
      "scenario_rule_runtime_smoke",
      "scenario_p1_ember_ruins",
      "scenario_p2_storm_vault",
      "scenario_p3_skybreaker_archive",
      "scenario_p4_storm_crown_campaign",
      "scenario_p5_astral_seal_campaign",
      "scenario_p6_eternal_storm_citadel",
    ]);
    expect(isProvidedScenarioId("scenario_p1_ember_ruins")).toBe(true);
    expect(isProvidedScenarioId("scenario_p2_storm_vault")).toBe(true);
    expect(isProvidedScenarioId("scenario_p3_skybreaker_archive")).toBe(true);
    expect(isProvidedScenarioId("scenario_p4_storm_crown_campaign")).toBe(true);
    expect(isProvidedScenarioId("scenario_p5_astral_seal_campaign")).toBe(true);
    expect(isProvidedScenarioId("scenario_p6_eternal_storm_citadel")).toBe(true);
    expect(isProvidedScenarioId("scenario_rule_runtime_smoke")).toBe(true);
    expect(isProvidedScenarioId("scenario_user_private")).toBe(false);
  });
});
