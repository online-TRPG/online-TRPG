import { PrismaClient, ScenarioLicense } from "@prisma/client";

export const DEFAULT_SCENARIO_ID = "scenario_goblin_cave";
export const DEFAULT_START_NODE_ID = "node_cave_entrance";
export const NODE_SCREEN_TEST_SCENARIO_ID = "scenario_node_screen_test";
export const NODE_SCREEN_TEST_START_NODE_ID = "node_screen_test_combat";

const TEAM_SCENARIO_TITLE = "ㅁㄴㅇㅇㄹ";
const NODE_SCREEN_TEST_STORY_NODE_ID = "node_screen_test_story";
const NODE_SCREEN_TEST_EXPLORATION_NODE_ID = "node_screen_test_exploration";

// 서버를 처음 실행했을 때 바로 세션을 만들고 흐름을 검증할 수 있도록
// 가장 작은 형태의 기본 시나리오를 코드로 함께 넣어둔다.
const defaultScenario = {
  id: DEFAULT_SCENARIO_ID,
  title: "Goblin Cave Run",
  description: "A short introductory cave scenario for MVP session-service verification.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "easy",
  license: ScenarioLicense.ORIGINAL,
  attribution: "Original scenario seed for development and API verification.",
  startNodeId: DEFAULT_START_NODE_ID,
};

const nodeScreenTestScenario = {
  id: NODE_SCREEN_TEST_SCENARIO_ID,
  title: "세션 노드 화면 테스트",
  description:
    "전투, 스토리, 탐색 노드 화면을 순서대로 확인하기 위한 개발용 테스트 시나리오입니다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "test",
  license: ScenarioLicense.ORIGINAL,
  attribution: "Original scenario seed for session node UI verification.",
  startNodeId: NODE_SCREEN_TEST_START_NODE_ID,
};

// 화면 레이아웃 확인이 목적이라 DB 마이그레이션 없이 시드만으로 기본 맵을 주입한다.
function createNodeScreenTestMap(
  nodeId: string,
  tokens: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    size: number;
    hidden?: boolean;
    isHostile?: boolean;
  }>,
) {
  return {
    id: `map_${nodeId}`,
    scenarioNodeId: nodeId,
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 1280,
    height: 832,
    tokens,
    fogRects: [
      { id: `fog_${nodeId}_north`, x: 128, y: 64, width: 256, height: 128 },
      { id: `fog_${nodeId}_east`, x: 832, y: 256, width: 192, height: 192 },
    ],
    startingPositions: [
      { id: `start_${nodeId}_1`, label: "1", x: 192, y: 640 },
      { id: `start_${nodeId}_2`, label: "2", x: 256, y: 640 },
      { id: `start_${nodeId}_3`, label: "3", x: 192, y: 704 },
      { id: `start_${nodeId}_4`, label: "4", x: 256, y: 704 },
    ],
    updatedAt: "2026-05-12T00:00:00.000Z",
  };
}

const scenarioNodes = [
  {
    id: DEFAULT_START_NODE_ID,
    scenarioId: DEFAULT_SCENARIO_ID,
    nodeType: "exploration",
    title: "Cave Entrance",
    sceneText:
      "A damp cave entrance opens ahead. Broken crates and muddy footprints suggest recent goblin activity.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify([
      {
        id: "investigate_tracks",
        type: "skill_check",
        skill: "investigation",
        dc: 10,
      },
    ]),
    transitionsJson: JSON.stringify([
      {
        condition: "default",
        nextNodeId: "node_inner_tunnel",
      },
    ]),
    cluesJson: JSON.stringify([
      {
        id: "clue_tracks",
        title: "Fresh tracks",
        text: "Fresh tracks lead deeper inside.",
        handoutText: "Fresh tracks lead deeper inside.",
        revealPolicy: { mode: "on_node_visit" },
      },
    ]),
    fallbackNodeId: "node_inner_tunnel",
    nodeMetaJson: null,
  },
  {
    id: "node_inner_tunnel",
    scenarioId: DEFAULT_SCENARIO_ID,
    nodeType: "story",
    title: "Inner Tunnel",
    sceneText:
      "The tunnel narrows and torchlight flickers from a rough chamber further in.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify([]),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([
      {
        id: "clue_secret_cache",
        title: "Hidden cache",
        text: "A loose stone hides a small goblin supply cache.",
        handoutText: "A loose stone hides a small goblin supply cache.",
        gmNotes: "Reveal only if the GM decides the players search the tunnel carefully.",
        revealPolicy: { mode: "conditional" },
      },
    ]),
    fallbackNodeId: null,
    nodeMetaJson: null,
  },
  {
    id: NODE_SCREEN_TEST_START_NODE_ID,
    scenarioId: NODE_SCREEN_TEST_SCENARIO_ID,
    nodeType: "combat",
    title: "전투 화면 테스트",
    sceneText:
      "훈련장 문이 닫히고 두 명의 철갑 경비병이 길을 막아섭니다. 전투 화면의 턴 순서, 대상 선택, 맵 배치를 확인하세요.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        {
          id: "combat_read_tactics",
          type: "skill_check",
          label: "상대 전술 파악",
          skill: "insight",
          dc: 12,
        },
        {
          id: "combat_break_cover",
          type: "skill_check",
          label: "엄폐물 밀어내기",
          skill: "athletics",
          dc: 13,
        },
      ],
      vttMap: createNodeScreenTestMap(NODE_SCREEN_TEST_START_NODE_ID, [
        {
          id: "token_guard_a",
          name: "경비병 A",
          x: 640,
          y: 320,
          size: 64,
          isHostile: true,
        },
        {
          id: "token_guard_b",
          name: "경비병 B",
          x: 768,
          y: 448,
          size: 64,
          isHostile: true,
        },
        {
          id: "token_crystal_pillar",
          name: "수정 기둥",
          x: 512,
          y: 448,
          size: 64,
        },
      ]),
    }),
    transitionsJson: JSON.stringify([
      {
        condition: "default",
        nextNodeId: "node_screen_test_story",
      },
    ]),
    cluesJson: JSON.stringify([
      {
        id: "clue_combat_exit",
        title: "닫힌 철문",
        text: "전투가 끝나면 북쪽 철문이 열리며 다음 장면으로 이어집니다.",
        handoutText: "전투가 끝나면 북쪽 철문이 열립니다.",
        revealPolicy: { mode: "on_node_visit" },
      },
    ]),
    fallbackNodeId: "node_screen_test_story",
    nodeMetaJson: JSON.stringify({
      npcs: [
        {
          id: "target_guard_a",
          name: "경비병 A",
          shortDescription: "근접 압박을 맡은 공개 전투 대상입니다.",
        },
        {
          id: "target_guard_b",
          name: "경비병 B",
          shortDescription: "후방에서 길목을 지키는 공개 전투 대상입니다.",
        },
      ],
      objects: [
        {
          id: "object_crystal_pillar",
          name: "수정 기둥",
          shortDescription: "엄폐와 상호작용 표시를 확인하기 위한 전장 오브젝트입니다.",
        },
      ],
    }),
  },
  {
    id: "node_screen_test_story",
    scenarioId: NODE_SCREEN_TEST_SCENARIO_ID,
    nodeType: "story",
    title: "스토리 화면 테스트",
    sceneText:
      "전투가 끝나자 홀 중앙의 수정이 잔잔하게 빛납니다. 안내자 하린은 문양이 새겨진 문을 가리키며 다음 길을 설명합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        {
          id: "story_read_sigil",
          type: "skill_check",
          label: "문양 해석",
          skill: "arcana",
          dc: 11,
        },
      ],
      vttMap: null,
    }),
    transitionsJson: JSON.stringify([
      {
        condition: "default",
        nextNodeId: "node_screen_test_exploration",
      },
    ]),
    cluesJson: JSON.stringify([
      {
        id: "clue_story_sigil",
        title: "푸른 문양",
        text: "푸른 문양은 탐색 구역의 안전한 시작 위치를 가리킵니다.",
        handoutText: "푸른 문양은 다음 구역의 안전한 시작 위치를 가리킵니다.",
        revealPolicy: { mode: "on_node_visit" },
      },
    ]),
    fallbackNodeId: "node_screen_test_exploration",
    nodeMetaJson: JSON.stringify({
      npcs: [
        {
          id: "npc_harin",
          name: "하린",
          shortDescription: "전투 이후 다음 구역을 안내하는 공개 NPC입니다.",
        },
      ],
      objects: [
        {
          id: "object_sigil_gate",
          name: "문양이 새겨진 문",
          shortDescription: "탐색 노드로 이어지는 장치입니다.",
        },
      ],
    }),
  },
  {
    id: "node_screen_test_exploration",
    scenarioId: NODE_SCREEN_TEST_SCENARIO_ID,
    nodeType: "exploration",
    title: "탐색 화면 테스트",
    sceneText:
      "문 너머에는 수정 갈림길이 펼쳐져 있습니다. 오래된 지도 탁자와 푸른 열쇠가 탐색 행동, 대상 선택, 맵 조작을 확인하기 좋게 놓여 있습니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        {
          id: "exploration_search_table",
          type: "skill_check",
          label: "지도 탁자 조사",
          skill: "investigation",
          dc: 10,
        },
        {
          id: "exploration_listen_corridor",
          type: "skill_check",
          label: "갈림길 소리 듣기",
          skill: "perception",
          dc: 12,
        },
      ],
      vttMap: createNodeScreenTestMap("node_screen_test_exploration", [
        {
          id: "token_old_map_table",
          name: "지도 탁자",
          x: 576,
          y: 384,
          size: 64,
        },
        {
          id: "token_blue_key",
          name: "푸른 열쇠",
          x: 704,
          y: 384,
          size: 64,
        },
        {
          id: "token_locked_gate",
          name: "잠긴 문",
          x: 896,
          y: 256,
          size: 64,
        },
      ]),
    }),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([
      {
        id: "clue_exploration_route",
        title: "갈림길 흔적",
        text: "지도 탁자 위의 표시가 잠긴 문과 연결되어 있습니다.",
        handoutText: "지도 탁자 위의 표시가 잠긴 문과 연결되어 있습니다.",
        revealPolicy: { mode: "on_node_visit" },
      },
    ]),
    fallbackNodeId: null,
    nodeMetaJson: JSON.stringify({
      areas: [
        {
          id: "area_crystal_crossroad",
          name: "수정 갈림길",
          shortDescription: "주변 관찰과 이동 테스트를 위한 공개 지역입니다.",
        },
      ],
      objects: [
        {
          id: "object_old_map_table",
          name: "낡은 지도 탁자",
          shortDescription: "상호작용과 조사 행동을 확인하기 위한 대상입니다.",
        },
      ],
      items: [
        {
          id: "item_blue_key",
          name: "푸른 열쇠",
          shortDescription: "획득형 아이템 대상 표시를 확인하기 위한 항목입니다.",
        },
      ],
    }),
  },
];

const scenarios = [defaultScenario, nodeScreenTestScenario];

type SourceScenarioNode = {
  id: string;
  nodeType: string;
  title: string;
  sceneText: string;
  imageUrl: string | null;
  checkOptionsJson: string;
  cluesJson: string;
  nodeMetaJson: string | null;
};

type NodeScreenTestType = "combat" | "story" | "exploration";

const nodeScreenTestSequence: Array<{
  id: string;
  nodeType: NodeScreenTestType;
  fallbackNodeId: string | null;
}> = [
  {
    id: NODE_SCREEN_TEST_START_NODE_ID,
    nodeType: "combat",
    fallbackNodeId: NODE_SCREEN_TEST_STORY_NODE_ID,
  },
  {
    id: NODE_SCREEN_TEST_STORY_NODE_ID,
    nodeType: "story",
    fallbackNodeId: NODE_SCREEN_TEST_EXPLORATION_NODE_ID,
  },
  {
    id: NODE_SCREEN_TEST_EXPLORATION_NODE_ID,
    nodeType: "exploration",
    fallbackNodeId: null,
  },
];

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasHostileToken(node: SourceScenarioNode): boolean {
  const parsed = parseJson<unknown>(node.checkOptionsJson, null);
  if (!isRecord(parsed) || !isRecord(parsed.vttMap) || !Array.isArray(parsed.vttMap.tokens)) {
    return false;
  }

  return parsed.vttMap.tokens.some((token) => isRecord(token) && token.isHostile === true);
}

function selectSourceNode(
  nodes: SourceScenarioNode[],
  preferredType: NodeScreenTestType,
  usedNodeIds: Set<string>,
): SourceScenarioNode {
  const preferred = nodes.find((node) => node.nodeType === preferredType && !usedNodeIds.has(node.id));
  const unused = nodes.find((node) => !usedNodeIds.has(node.id));

  return preferred ?? unused ?? nodes[0];
}

function selectSourceNodesForNodeScreenTest(nodes: SourceScenarioNode[]): Record<NodeScreenTestType, SourceScenarioNode> {
  const usedNodeIds = new Set<string>();
  const combat =
    nodes.find((node) => node.nodeType === "combat") ??
    nodes.find((node) => hasHostileToken(node)) ??
    nodes[0];
  usedNodeIds.add(combat.id);

  const story = selectSourceNode(nodes, "story", usedNodeIds);
  usedNodeIds.add(story.id);

  const exploration = selectSourceNode(nodes, "exploration", usedNodeIds);

  return { combat, story, exploration };
}

function getNodeTypeLabel(nodeType: NodeScreenTestType): string {
  if (nodeType === "combat") return "전투";
  if (nodeType === "exploration") return "탐색";
  return "스토리";
}

function getClonedNodeTitle(sourceNode: SourceScenarioNode, nodeType: NodeScreenTestType): string {
  if (sourceNode.nodeType === nodeType) {
    return sourceNode.title;
  }

  return `${sourceNode.title} (${getNodeTypeLabel(nodeType)} 테스트)`;
}

function getTransitionJson(nextNodeId: string | null): string {
  if (!nextNodeId) {
    return JSON.stringify([]);
  }

  return JSON.stringify([{ condition: "default", nextNodeId }]);
}

function rebaseCheckOptionsForClonedNode(
  sourceCheckOptionsJson: string,
  nextNodeId: string,
  nodeType: NodeScreenTestType,
): string {
  const parsed = parseJson<unknown>(sourceCheckOptionsJson, []);

  if (Array.isArray(parsed)) {
    return JSON.stringify({
      checks: parsed,
      vttMap: nodeType === "story" ? null : createNodeScreenTestMap(nextNodeId, []),
    });
  }

  if (!isRecord(parsed)) {
    return JSON.stringify({
      checks: [],
      vttMap: nodeType === "story" ? null : createNodeScreenTestMap(nextNodeId, []),
    });
  }

  const existingVttMap = isRecord(parsed.vttMap) ? parsed.vttMap : null;

  return JSON.stringify({
    ...parsed,
    vttMap: existingVttMap
      ? {
          ...existingVttMap,
          id: `map:${nextNodeId}`,
          scenarioNodeId: nextNodeId,
          updatedAt: new Date().toISOString(),
        }
      : nodeType === "story"
        ? null
        : createNodeScreenTestMap(nextNodeId, []),
  });
}

async function seedNodeScreenTestScenarioFromSource(prisma: PrismaClient): Promise<void> {
  // 팀장 작업 시나리오는 계속 바뀔 수 있으므로 seed 파일에 내용을 복붙하지 않고,
  // 실행 시점 DB에서 복제해 테스트 시나리오만 최신 상태로 덮어쓴다.
  const scenariosWithNodes = await prisma.scenario.findMany({
    where: { id: { not: NODE_SCREEN_TEST_SCENARIO_ID } },
    include: { nodes: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const sourceScenario = scenariosWithNodes.find((scenario) => scenario.title === TEAM_SCENARIO_TITLE);

  if (!sourceScenario || sourceScenario.nodes.length === 0) {
    return;
  }

  const sourceNodes = selectSourceNodesForNodeScreenTest(sourceScenario.nodes);
  const description =
    sourceScenario.description ??
    "팀장 작업 시나리오를 복제해 전투, 스토리, 탐색 화면을 순서대로 확인하는 테스트 시나리오입니다.";

  await prisma.scenario.upsert({
    where: { id: NODE_SCREEN_TEST_SCENARIO_ID },
    update: {
      title: `세션 노드 화면 테스트 - ${sourceScenario.title} 복제`,
      description,
      baseScenarioId: sourceScenario.id,
      thumbnailUrl: sourceScenario.thumbnailUrl,
      ruleSetId: sourceScenario.ruleSetId,
      difficulty: sourceScenario.difficulty,
      startLevel: sourceScenario.startLevel,
      recommendedEndLevel: sourceScenario.recommendedEndLevel,
      license: sourceScenario.license,
      attribution: sourceScenario.attribution,
      startNodeId: NODE_SCREEN_TEST_START_NODE_ID,
    },
    create: {
      id: NODE_SCREEN_TEST_SCENARIO_ID,
      title: `세션 노드 화면 테스트 - ${sourceScenario.title} 복제`,
      description,
      baseScenarioId: sourceScenario.id,
      thumbnailUrl: sourceScenario.thumbnailUrl,
      ruleSetId: sourceScenario.ruleSetId,
      difficulty: sourceScenario.difficulty,
      startLevel: sourceScenario.startLevel,
      recommendedEndLevel: sourceScenario.recommendedEndLevel,
      license: sourceScenario.license,
      attribution: sourceScenario.attribution,
      startNodeId: NODE_SCREEN_TEST_START_NODE_ID,
    },
  });

  for (const targetNode of nodeScreenTestSequence) {
    const sourceNode = sourceNodes[targetNode.nodeType];
    const clonedNode = {
      id: targetNode.id,
      scenarioId: NODE_SCREEN_TEST_SCENARIO_ID,
      nodeType: targetNode.nodeType,
      title: getClonedNodeTitle(sourceNode, targetNode.nodeType),
      sceneText: sourceNode.sceneText,
      imageUrl: sourceNode.imageUrl,
      checkOptionsJson: rebaseCheckOptionsForClonedNode(
        sourceNode.checkOptionsJson,
        targetNode.id,
        targetNode.nodeType,
      ),
      transitionsJson: getTransitionJson(targetNode.fallbackNodeId),
      cluesJson: sourceNode.cluesJson,
      nodeMetaJson: sourceNode.nodeMetaJson,
      fallbackNodeId: targetNode.fallbackNodeId,
    };

    await prisma.scenarioNode.upsert({
      where: { id: targetNode.id },
      update: {
        title: clonedNode.title,
        nodeType: clonedNode.nodeType,
        sceneText: clonedNode.sceneText,
        imageUrl: clonedNode.imageUrl,
        checkOptionsJson: clonedNode.checkOptionsJson,
        transitionsJson: clonedNode.transitionsJson,
        cluesJson: clonedNode.cluesJson,
        nodeMetaJson: clonedNode.nodeMetaJson,
        fallbackNodeId: clonedNode.fallbackNodeId,
      },
      create: clonedNode,
    });
  }
}

export async function seedDefaultScenario(prisma: PrismaClient): Promise<void> {
  // upsert를 사용하면 같은 서버를 여러 번 재시작해도
  // 시나리오가 중복으로 쌓이지 않고, 바뀐 내용만 안전하게 반영할 수 있다.
  for (const scenario of scenarios) {
    await prisma.scenario.upsert({
      where: { id: scenario.id },
      update: {
        title: scenario.title,
        description: scenario.description,
        thumbnailUrl: scenario.thumbnailUrl,
        ruleSetId: scenario.ruleSetId,
        difficulty: scenario.difficulty,
        license: scenario.license,
        attribution: scenario.attribution,
        startNodeId: scenario.startNodeId,
      },
      create: scenario,
    });
  }

  for (const node of scenarioNodes) {
    // 시나리오 노드도 같은 방식으로 관리한다.
    // 그래서 시드 데이터를 수정해도 DB를 지우지 않고 바로 다시 반영할 수 있다.
    await prisma.scenarioNode.upsert({
      where: { id: node.id },
      update: {
        title: node.title,
        nodeType: node.nodeType,
        sceneText: node.sceneText,
        imageUrl: node.imageUrl,
        checkOptionsJson: node.checkOptionsJson,
        transitionsJson: node.transitionsJson,
        cluesJson: node.cluesJson,
        nodeMetaJson: node.nodeMetaJson,
        fallbackNodeId: node.fallbackNodeId,
      },
      create: node,
    });
  }

  await seedNodeScreenTestScenarioFromSource(prisma);
}
