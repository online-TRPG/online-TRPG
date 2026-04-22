import { PrismaClient, ScenarioLicense } from "@prisma/client";

export const DEFAULT_SCENARIO_ID = "scenario_goblin_cave";
export const DEFAULT_START_NODE_ID = "node_cave_entrance";

// 서버를 처음 실행했을 때 바로 세션을 만들고 흐름을 검증할 수 있도록
// 가장 작은 형태의 기본 시나리오를 코드로 함께 넣어둔다.
const defaultScenario = {
  id: DEFAULT_SCENARIO_ID,
  title: "Goblin Cave Run",
  license: ScenarioLicense.ORIGINAL,
  attribution: "Original scenario seed for development and API verification.",
  startNodeId: DEFAULT_START_NODE_ID,
};

const scenarioNodes = [
  {
    id: DEFAULT_START_NODE_ID,
    scenarioId: DEFAULT_SCENARIO_ID,
    title: "Cave Entrance",
    sceneText:
      "A damp cave entrance opens ahead. Broken crates and muddy footprints suggest recent goblin activity.",
    visibleToPlayers: true,
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
        text: "Fresh tracks lead deeper inside.",
      },
    ]),
    fallbackNodeId: "node_inner_tunnel",
  },
  {
    id: "node_inner_tunnel",
    scenarioId: DEFAULT_SCENARIO_ID,
    title: "Inner Tunnel",
    sceneText:
      "The tunnel narrows and torchlight flickers from a rough chamber further in.",
    visibleToPlayers: true,
    checkOptionsJson: JSON.stringify([]),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: null,
  },
];

export async function seedDefaultScenario(prisma: PrismaClient): Promise<void> {
  // upsert를 사용하면 같은 서버를 여러 번 재시작해도
  // 시나리오가 중복으로 쌓이지 않고, 바뀐 내용만 안전하게 반영할 수 있다.
  await prisma.scenario.upsert({
    where: { id: defaultScenario.id },
    update: {
      title: defaultScenario.title,
      license: defaultScenario.license,
      attribution: defaultScenario.attribution,
      startNodeId: defaultScenario.startNodeId,
    },
    create: defaultScenario,
  });

  for (const node of scenarioNodes) {
    // 시나리오 노드도 같은 방식으로 관리한다.
    // 그래서 시드 데이터를 수정해도 DB를 지우지 않고 바로 다시 반영할 수 있다.
    await prisma.scenarioNode.upsert({
      where: { id: node.id },
      update: {
        title: node.title,
        sceneText: node.sceneText,
        visibleToPlayers: node.visibleToPlayers,
        checkOptionsJson: node.checkOptionsJson,
        transitionsJson: node.transitionsJson,
        cluesJson: node.cluesJson,
        fallbackNodeId: node.fallbackNodeId,
      },
      create: node,
    });
  }
}
