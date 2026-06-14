export const DEFAULT_PROVIDED_SCENARIO_ID =
  "scenario_77758fa0-3b35-4f95-bb2d-0ffe11c989ac";

export const PROVIDED_SCENARIO_IDS = [
  DEFAULT_PROVIDED_SCENARIO_ID,
  "scenario_goblin_cave",
  "scenario_node_screen_test",
  "scenario_rule_runtime_smoke",
];

export function isDefaultProvidedScenarioId(scenarioId: string | null | undefined): boolean {
  return scenarioId === DEFAULT_PROVIDED_SCENARIO_ID;
}

export function isProvidedScenarioId(scenarioId: string | null | undefined): boolean {
  return Boolean(scenarioId && PROVIDED_SCENARIO_IDS.includes(scenarioId));
}
