export const DEFAULT_PROVIDED_SCENARIO_ID =
  "scenario_77758fa0-3b35-4f95-bb2d-0ffe11c989ac";

export function isDefaultProvidedScenarioId(scenarioId: string | null | undefined): boolean {
  return scenarioId === DEFAULT_PROVIDED_SCENARIO_ID;
}
