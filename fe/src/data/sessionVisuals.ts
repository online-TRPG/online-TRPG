import type { Scenario } from "../types/session";
import goblinThumbnail from "../assets/images/Thumbnail_Goblin_Cave.webp";

export const DEFAULT_PROVIDED_SCENARIO_TITLE = "검은 우물의 쥐떼";
export const DEFAULT_PROVIDED_SCENARIO_ID = "scenario_77758fa0-3b35-4f95-bb2d-0ffe11c989ac";

export interface SessionVisualPreset {
  key: string;
  title: string;
  image: string;
  theme: string;
  difficulty: string;
  gmLabel: string;
  description: string;
  matchers: string[];
}

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
}

const GENERAL_GM_LABEL = "\uC77C\uBC18 GM";
const AI_GM_LABEL = "AI GM";

export const sessionVisualPresets: SessionVisualPreset[] = [
  {
    key: "black-well-rats",
    title: DEFAULT_PROVIDED_SCENARIO_TITLE,
    image: goblinThumbnail,
    theme: "Dungeon",
    difficulty: "easy",
    gmLabel: "AI GM",
    description: "검은 우물 아래 쥐떼 소굴을 조사하는 기본 제공 모험입니다.",
    matchers: [DEFAULT_PROVIDED_SCENARIO_TITLE, "black well rats", "rat swarm", "rats"],
  },
];

function normalizeGmLabel(label: string): string {
  return label === AI_GM_LABEL ? AI_GM_LABEL : GENERAL_GM_LABEL;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, " ")
    .trim();
}

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
  const normalizedDefaultTitle = normalizeText(DEFAULT_PROVIDED_SCENARIO_TITLE);
  return (
    scenarios.find((scenario) => scenario.id === DEFAULT_PROVIDED_SCENARIO_ID) ??
    scenarios.find(
      (scenario) =>
        isDefaultProvidedScenario(scenario) && normalizeText(scenario.title) === normalizedDefaultTitle
    ) ??
    scenarios.find(isDefaultProvidedScenario) ??
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

export function findSessionVisualByTitle(title?: string | null): SessionVisualPreset | null {
  if (!title) return null;

  const normalized = normalizeText(title);
  if (!normalized) return null;

  const exactMatch =
    sessionVisualPresets.find((preset) =>
      preset.matchers.some((matcher) => normalizeText(matcher) === normalized)
    ) ?? null;
  if (exactMatch) return exactMatch;

  return (
    sessionVisualPresets.find((preset) =>
      preset.matchers.some((matcher) => {
        const normalizedMatcher = normalizeText(matcher);
        return normalized.includes(normalizedMatcher) || normalizedMatcher.includes(normalized);
      }),
    ) ?? null
  );
}

export function buildSessionScenarioOptions(scenarios: Scenario[]): SessionScenarioOption[] {
  return prioritizePreferredScenario(scenarios).map((scenario, index) => {
    const fallbackPreset =
      findSessionVisualByTitle(scenario.title) ?? sessionVisualPresets[index % sessionVisualPresets.length];
    return {
      key: `scenario:${scenario.id}`,
      group: isProvidedScenario(scenario) ? "provided" as const : "custom" as const,
      title: scenario.title,
      image: scenario.thumbnailUrl ?? fallbackPreset.image,
      theme: fallbackPreset.theme,
      difficulty: scenario.difficulty ?? fallbackPreset.difficulty,
      gmLabel: normalizeGmLabel(fallbackPreset.gmLabel),
      description: scenario.description ?? fallbackPreset.description,
      scenarioId: scenario.id,
    };
  });
}
