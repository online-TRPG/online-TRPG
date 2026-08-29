import type { Scenario } from "../types/session";
import scenarioPlaceholder from "../assets/images/Scenario_Placeholder.svg";

export { scenarioPlaceholder };

export const DEFAULT_PROVIDED_SCENARIO_ID = "scenario_goblin_cave";

export interface SessionScenarioOption {
  key: string;
  group: "provided" | "custom";
  title: string;
  image: string;
  theme: string;
  difficulty: string;
  gmLabel: string;
  description: string;
  scenarioId?: string;
  startLevel: number;
  recommendedEndLevel?: number | null;
  estimatedMinutes?: number | null;
  recommendedPlayersMin?: number | null;
  recommendedPlayersMax?: number | null;
}

const GENERAL_GM_LABEL = "\uC77C\uBC18 GM";
const AI_GM_LABEL = "AI GM";


export function isDefaultProvidedScenario(
  scenario: Pick<Scenario, "id" | "title"> & { sourceType?: string | null }
): boolean {
  return scenario.id === DEFAULT_PROVIDED_SCENARIO_ID;
}

function isProvidedScenario(
  scenario: Pick<Scenario, "id" | "title"> & { sourceType?: string | null }
): boolean {
  return scenario.sourceType === "SYSTEM" || isDefaultProvidedScenario(scenario);
}

export function splitScenariosBySource<T extends Pick<Scenario, "id" | "title"> & { sourceType?: string | null }>(
  scenarios: T[]
): { provided: T[]; custom: T[] } {
  return prioritizePreferredScenario(scenarios).reduce<{ provided: T[]; custom: T[] }>(
    (groups, scenario) => {
      if (isProvidedScenario(scenario)) {
        groups.provided.push(scenario);
      } else {
        groups.custom.push(scenario);
      }
      return groups;
    },
    { provided: [], custom: [] },
  );
}

export function getPreferredScenario<T extends Pick<Scenario, "id" | "title"> & { sourceType?: string | null }>(
  scenarios: T[]
): T | null {
  return (
    scenarios.find((scenario) => scenario.id === DEFAULT_PROVIDED_SCENARIO_ID) ??
    scenarios[0] ??
    null
  );
}

function prioritizePreferredScenario<T extends Pick<Scenario, "id" | "title"> & { sourceType?: string | null }>(
  scenarios: T[]
): T[] {
  const preferredScenario = getPreferredScenario(scenarios);
  if (!preferredScenario) return scenarios;

  return [
    preferredScenario,
    ...scenarios.filter((scenario) => scenario !== preferredScenario),
  ];
}

export function buildSessionScenarioOptions(scenarios: Scenario[]): SessionScenarioOption[] {
  return prioritizePreferredScenario(scenarios).map((scenario) => {
    return {
      key: `scenario:${scenario.id}`,
      group: isProvidedScenario(scenario) ? "provided" as const : "custom" as const,
      title: scenario.title,
      image: scenario.thumbnailUrl ?? scenarioPlaceholder,
      theme: scenario.tags?.[0] ?? "테마 미정",
      difficulty: scenario.difficulty ?? "난이도 미정",
      gmLabel:
        scenario.gmMode === "AI"
          ? AI_GM_LABEL
          : scenario.gmMode === "HUMAN"
            ? GENERAL_GM_LABEL
            : "AI GM·사람 GM",
      description: scenario.description ?? "시나리오 설명이 없습니다.",
      scenarioId: scenario.id,
      startLevel: scenario.startLevel,
      recommendedEndLevel: scenario.recommendedEndLevel,
      estimatedMinutes: scenario.estimatedMinutes,
      recommendedPlayersMin: scenario.recommendedPlayersMin,
      recommendedPlayersMax: scenario.recommendedPlayersMax,
    };
  });
}
