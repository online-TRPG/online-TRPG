import { PrismaClient, ScenarioLicense } from "@prisma/client";

export const DEFAULT_SCENARIO_ID = "scenario_goblin_cave";
export const DEFAULT_START_NODE_ID = "node_cave_entrance";

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
        condition: "investigate_tracks_success",
        nextNodeId: "node_inner_tunnel",
      },
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
    nodeMetaJson: null,
    fallbackNodeId: "node_inner_tunnel",
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
    transitionsJson: JSON.stringify([
      {
        condition: "default",
        nextNodeId: "node_goblin_guard",
      },
    ]),
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
    nodeMetaJson: null,
    fallbackNodeId: "node_goblin_guard",
  },
  {
    id: "node_goblin_guard",
    scenarioId: DEFAULT_SCENARIO_ID,
    nodeType: "combat",
    title: "Goblin Guard",
    sceneText:
      "A goblin guard scrambles out from behind broken crates and raises a scimitar to block the passage.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [],
      combat: {
        encounterId: "encounter_goblin_guard",
        hostiles: [
          {
            id: "goblin-guard-1",
            name: "Goblin Guard",
            armorClass: 13,
            maxHp: 10,
            currentHp: 10,
            initiative: 12,
          },
        ],
        supportedPlayerActions: [
          "weapon_attack",
          "spell.fire_bolt",
          "spell.chill_touch",
          "spell.magic_missile",
          "spell.cure_wounds",
          "magic_item.potion_of_healing",
          "class.fighter.feature.second_wind",
          "class.rogue.feature.sneak_attack",
        ],
      },
    }),
    transitionsJson: JSON.stringify([
      {
        condition: "all_hostiles_defeated",
        nextNodeId: "node_goblin_cache",
      },
      {
        condition: "default",
        nextNodeId: "node_goblin_cache",
      },
    ]),
    cluesJson: JSON.stringify([
      {
        id: "clue_goblin_cache",
        title: "Goblin supplies",
        text: "The goblin keeps glancing toward a cloth-covered supply pile deeper in the tunnel.",
        handoutText: "The goblin keeps glancing toward a cloth-covered supply pile deeper in the tunnel.",
        revealPolicy: { mode: "on_node_visit" },
      },
    ]),
    nodeMetaJson: null,
    fallbackNodeId: "node_goblin_cache",
  },
  {
    id: "node_goblin_cache",
    scenarioId: DEFAULT_SCENARIO_ID,
    nodeType: "conclusion",
    title: "Goblin Cache",
    sceneText:
      "With the guard defeated, the party finds a small cache of supplies and a safe path back out of the cave.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify([]),
    transitionsJson: JSON.stringify([
      {
        condition: "session_complete",
        nextNodeId: null,
      },
    ]),
    cluesJson: JSON.stringify([
      {
        id: "clue_cache_supplies",
        title: "Recovered supplies",
        text: "The cache holds stolen rations, rope, and a pouch of trade coins.",
        handoutText: "The cache holds stolen rations, rope, and a pouch of trade coins.",
        revealPolicy: { mode: "on_node_visit" },
      },
    ]),
    nodeMetaJson: null,
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
      description: defaultScenario.description,
      thumbnailUrl: defaultScenario.thumbnailUrl,
      ruleSetId: defaultScenario.ruleSetId,
      difficulty: defaultScenario.difficulty,
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
}
