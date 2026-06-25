export const DEFAULT_PROVIDED_SCENARIO_ID =
  "scenario_77758fa0-3b35-4f95-bb2d-0ffe11c989ac";

export const PROVIDED_SCENARIO_IDS = [
  DEFAULT_PROVIDED_SCENARIO_ID,
  "scenario_goblin_cave",
  "scenario_node_screen_test",
  "scenario_rule_runtime_smoke",
  "scenario_p1_ember_ruins",
  "scenario_p2_storm_vault",
  "scenario_p3_skybreaker_archive",
  "scenario_p4_storm_crown_campaign",
  "scenario_p5_astral_seal_campaign",
  "scenario_p6_eternal_storm_citadel",
];

export function isDefaultProvidedScenarioId(scenarioId: string | null | undefined): boolean {
  return scenarioId === DEFAULT_PROVIDED_SCENARIO_ID;
}

export function isProvidedScenarioId(scenarioId: string | null | undefined): boolean {
  return Boolean(scenarioId && PROVIDED_SCENARIO_IDS.includes(scenarioId));
}
