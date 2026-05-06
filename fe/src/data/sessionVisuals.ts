import type { Scenario } from "../types/session";
import forestThumbnail from "../assets/images/Thumbnail_Forest_Investigate.png";
import frostThumbnail from "../assets/images/Thumbnail_Frost_Dragon.png";
import goblinThumbnail from "../assets/images/Thumbnail_Goblin_Cave.png";
import mazeThumbnail from "../assets/images/Thumbnail_Maze_Treasure.png";

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

function normalizeGmLabel(label: string): string {
  return label === AI_GM_LABEL ? AI_GM_LABEL : GENERAL_GM_LABEL;
}

export const sessionVisualPresets: SessionVisualPreset[] = [
  {
    key: "goblin-cave",
    title: "Goblin Cave",
    image: goblinThumbnail,
    theme: "Dungeon",
    difficulty: "Normal",
    gmLabel: "일반 GM",
    description: "마을 사람들의 의뢰를 받아 고블린 동굴 깊숙한 곳을 돌파하는 모험입니다.",
    matchers: ["goblin cave", "goblin cave run", "goblin"],
  },
  {
    key: "frost-dragon",
    title: "Frost Dragon",
    image: frostThumbnail,
    theme: "Frozen",
    difficulty: "Hard",
    gmLabel: "AI GM",
    description: "빙하 동굴에서 깨어난 서리룡의 흔적을 추적하며 생존과 전투를 병행합니다.",
    matchers: ["frost dragon", "dragon", "ice dragon"],
  },
  {
    key: "forest-investigate",
    title: "Forest Investigate",
    image: forestThumbnail,
    theme: "Forest",
    difficulty: "Normal",
    gmLabel: "일반 GM",
    description: "숲속에서 벌어지는 실종 사건을 조사하며 숨겨진 위협의 정체를 밝혀냅니다.",
    matchers: ["forest investigate", "forest", "investigate"],
  },
  {
    key: "maze-treasure",
    title: "Maze Treasure",
    image: mazeThumbnail,
    theme: "Treasure",
    difficulty: "Hard",
    gmLabel: "AI GM",
    description: "복잡한 미궁을 돌파하며 함정과 수수께끼를 넘어 숨겨진 보물을 찾아갑니다.",
    matchers: ["maze treasure", "maze", "treasure"],
  },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findSessionVisualByTitle(title?: string | null): SessionVisualPreset | null {
  if (!title) return null;

  const normalized = normalizeText(title);
  if (!normalized) return null;

  const exactMatch =
    sessionVisualPresets.find((preset) => preset.matchers.some((matcher) => normalizeText(matcher) === normalized)) ?? null;
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
  const matchedScenarioIds = new Set<string>();

  const presetOptions = sessionVisualPresets.map((preset) => {
    const matchedScenario = scenarios.find((scenario) => {
      const normalizedTitle = normalizeText(scenario.title);
      return preset.matchers.some((matcher) => {
        const normalizedMatcher = normalizeText(matcher);
        return normalizedTitle.includes(normalizedMatcher) || normalizedMatcher.includes(normalizedTitle);
      });
    });

    if (matchedScenario) {
      matchedScenarioIds.add(matchedScenario.id);
    }

    return {
      key: matchedScenario ? `scenario:${matchedScenario.id}` : `preset:${preset.key}`,
      title: preset.title,
      image: preset.image,
      theme: preset.theme,
      difficulty: matchedScenario?.difficulty ?? preset.difficulty,
      gmLabel: normalizeGmLabel(preset.gmLabel),
      description: matchedScenario?.description ?? preset.description,
      scenarioId: matchedScenario?.id,
    };
  });

  const extraScenarioOptions = scenarios
    .filter((scenario) => !matchedScenarioIds.has(scenario.id))
    .map((scenario, index) => {
      const fallbackPreset = findSessionVisualByTitle(scenario.title) ?? sessionVisualPresets[index % sessionVisualPresets.length];
      return {
        key: `scenario:${scenario.id}`,
        title: scenario.title,
        image: fallbackPreset.image,
        theme: fallbackPreset.theme,
        difficulty: scenario.difficulty ?? fallbackPreset.difficulty,
        gmLabel: normalizeGmLabel(fallbackPreset.gmLabel),
        description: scenario.description ?? fallbackPreset.description,
        scenarioId: scenario.id,
      };
    });

  return [...presetOptions, ...extraScenarioOptions];
}
