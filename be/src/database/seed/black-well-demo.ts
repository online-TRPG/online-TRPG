import { PrismaClient, ScenarioLicense } from "@prisma/client";

export const BLACK_WELL_SCENARIO_ID = "scenario_black_well_rats";
export const BLACK_WELL_START_NODE_ID = "black_well_n01";

const SEEDED_AT = "2026-05-07T00:00:00.000Z";
const GRID_SIZE = 64;
const MAP_WIDTH = 1280;
const MAP_HEIGHT = 832;

const json = (value: unknown): string => JSON.stringify(value);

const buildMap = (
  id: string,
  scenarioNodeId: string,
  fogRects: Array<Record<string, unknown>> = [],
  tokens: Array<Record<string, unknown>> = [],
) => ({
  id,
  scenarioNodeId,
  imageUrl: null,
  gridType: "square",
  gridSize: GRID_SIZE,
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  tokens,
  fogRects,
  updatedAt: SEEDED_AT,
});

const hostileToken = (id: string, name: string, x: number, y: number) => ({
  id,
  sessionCharacterId: null,
  name,
  imageUrl: null,
  x,
  y,
  size: GRID_SIZE,
  hidden: false,
  isHostile: true,
});

const fogRect = (id: string, x: number, y: number, width: number, height: number) => ({
  id,
  x,
  y,
  width,
  height,
});

const milaProfile = {
  npcEntityId: "npc.mila_boston",
  npcName: "밀라 보스턴",
  ruleBase: "commoner",
  role: "마을 관리인 / 의뢰인",
  npcSummary:
    "그레이브룩 마을의 실무 책임자. 불안을 감추려 하지만 주민 안전과 식량 문제를 동시에 걱정한다.",
  defaultDisposition: "worried_but_practical",
  publicFacts: [
    "우물물이 검게 오염되었다.",
    "밤마다 우물 아래에서 소리가 난다.",
    "마을 사람들의 불안이 커지고 있다.",
  ],
  privateFacts: [
    "식량 자루 몇 개와 염소 한 마리가 최근 사라졌다.",
    "도난 이야기가 퍼지면 마을이 더 혼란스러워질까 봐 처음엔 숨긴다.",
  ],
  dialogueConstraints: [
    "처음에는 사실만 짧게 말한다.",
    "플레이어가 신뢰를 주면 실종 사건까지 공개한다.",
    "공포를 과장하지 말고 실무적인 어조를 유지한다.",
  ],
  optionalOpeningSeed:
    "어젯밤부터 우물물이 썩었습니다. 아래에서 무언가 움직이는 소리도 들렸어요.",
};

const perrinProfile = {
  npcEntityId: "npc.perrin",
  npcName: "페린",
  ruleBase: "commoner",
  role: "우물지기 소년 / 목격자",
  npcSummary:
    "우물 근처에서 이상한 빛을 목격한 소년. 겁이 많지만 자신이 본 것을 누군가 믿어주길 바란다.",
  defaultDisposition: "nervous_honest",
  publicFacts: [
    "밤에 우물 안에서 초록 눈이 반짝이는 것을 봤다.",
    "물통을 길으러 갔다가 무서워서 도망쳤다.",
  ],
  privateFacts: [
    "정확한 모습은 보지 못했지만 인간보다 작은 형체였다고 생각한다.",
    "혹시 자신이 혼난다고 생각해 더듬거리며 말한다.",
  ],
  dialogueConstraints: [
    "겁먹은 어린아이 말투를 유지한다.",
    "모르는 사실은 지어내지 않는다.",
    "플레이어가 안심시키면 조금 더 자세해진다.",
  ],
  optionalOpeningSeed: "진짜예요. 우물 안에서 초록 눈이 반짝였어요.",
};

const blackWellScenario = {
  id: BLACK_WELL_SCENARIO_ID,
  title: "검은 우물의 쥐떼",
  description:
    "그레이브룩 마을 우물 오염 사건을 조사하는 1레벨 데모 시나리오. 노드, 전투, VTT 맵, NPC 대화 입력 메타를 함께 검증한다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "easy",
  license: ScenarioLicense.ORIGINAL,
  attribution: "Original demo scenario seed for the TRPG platform.",
  startNodeId: BLACK_WELL_START_NODE_ID,
};

const blackWellNodes = [
  {
    id: BLACK_WELL_START_NODE_ID,
    scenarioId: BLACK_WELL_SCENARIO_ID,
    nodeType: "story",
    title: "N01. 마을 광장의 의뢰",
    sceneText:
      "작은 마을 그레이브룩의 광장. 중앙 우물은 굵은 밧줄로 막혀 있고, 주민들은 물통을 든 채 불안한 표정으로 웅성거린다. 우물 안에서는 비릿하고 썩은 냄새가 올라온다. 마을 관리인 밀라가 일행에게 다가와 도움을 청한다.",
    imageUrl: null,
    checkOptionsJson: json({
      checks: [
        {
          id: "check.n01_persuasion",
          type: "skill_check",
          ability: "charisma",
          skill: "persuasion",
          dc: 10,
          summary: "밀라를 안심시키며 선지급 보상을 요청한다.",
          onSuccess: ["reward.n01_advance_potion", "flag.n01_mila_trust"],
        },
        {
          id: "check.n01_insight",
          type: "skill_check",
          ability: "wisdom",
          skill: "insight",
          dc: 10,
          summary: "밀라가 숨기는 사정을 눈치챈다.",
          onSuccess: ["flag.n01_missing_supplies_known"],
        },
        {
          id: "check.n01_investigate_well_edge",
          type: "skill_check",
          ability: "intelligence",
          skill: "investigation",
          dc: 12,
          summary: "우물 가장자리의 흔적을 조사한다.",
          onSuccess: ["clue.n01_small_tracks"],
        },
      ],
      vttMap: null,
    }),
    transitionsJson: json([
      {
        id: "t_n01_to_n02",
        label: "우물 주변 조사 시작",
        condition: "default",
        nextNodeId: "black_well_n02",
      },
    ]),
    cluesJson: json([
      {
        id: "clue.n01_small_tracks",
        title: "우물 가장자리의 작은 발자국",
        text: "우물 가장자리에 작은 인간형 발자국이 남아 있다.",
        handoutText: "우물 가장자리에서 작은 인간형 발자국을 발견했다.",
        revealPolicy: { mode: "conditional" },
      },
    ]),
    nodeMetaJson: json({
      assetRefs: [
        { id: "asset.story.village_square", kind: "story_image", ref: "village_square.png" },
        { id: "asset.npc.mila", kind: "story_image", ref: "mayor_mila.png" },
        { id: "asset.story.black_well", kind: "story_image", ref: "well_black_water.png" },
      ],
      npcProfiles: [milaProfile, perrinProfile],
      sceneNpcBindings: [
        {
          npcEntityId: "npc.mila_boston",
          role: "quest_giver",
          dialogueIntent: "quest_briefing",
          optionalOpeningSeed: milaProfile.optionalOpeningSeed,
        },
        {
          npcEntityId: "npc.perrin",
          role: "witness",
          dialogueIntent: "witness_report",
          optionalOpeningSeed: perrinProfile.optionalOpeningSeed,
        },
      ],
      rewards: [
        {
          id: "reward.n01_advance_potion",
          type: "item",
          itemId: "magic_item.potion_of_healing",
          quantity: 1,
          condition: "check.n01_persuasion success",
        },
      ],
      outcomes: [
        { id: "flag.n01_mila_trust", type: "flag", value: true },
        { id: "flag.n01_missing_supplies_known", type: "flag", value: true },
      ],
    }),
    fallbackNodeId: "black_well_n02",
  },
  {
    id: "black_well_n02",
    scenarioId: BLACK_WELL_SCENARIO_ID,
    nodeType: "exploration",
    title: "N02. 검은 우물 조사",
    sceneText:
      "우물 주변 흙은 축축하고 검게 물들어 있다. 나무 덮개에는 안쪽에서 긁은 듯한 자국이 있고, 밧줄은 최근 누군가 사용한 것처럼 젖어 있다.",
    imageUrl: null,
    checkOptionsJson: json({
      checks: [
        {
          id: "check.n02_secure_rope",
          type: "skill_check",
          ability: "strength",
          skill: "athletics",
          dc: 10,
          summary: "밧줄을 안전하게 고정한다.",
          onSuccess: ["flag.n02_rope_secured"],
        },
        {
          id: "check.n02_rope_notice",
          type: "skill_check",
          ability: "wisdom",
          skill: "perception",
          dc: 10,
          summary: "밧줄의 진흙 손자국을 발견한다.",
          onSuccess: ["clue.n02_rope_marks"],
        },
        {
          id: "check.n02_water_nature",
          type: "skill_check",
          ability: "intelligence",
          skill: "nature",
          dc: 10,
          summary: "검은 물의 오염 원인을 파악한다.",
          onSuccess: ["clue.n02_black_water"],
        },
        {
          id: "check.n02_water_contact",
          type: "saving_throw",
          ability: "constitution",
          dc: 10,
          summary: "검은 물이 상처나 입에 닿았을 때 견딘다.",
          onFailure: ["damage:1:poison"],
        },
        {
          id: "check.n02_track_goblins",
          type: "skill_check",
          ability: "wisdom",
          skill: "survival",
          dc: 12,
          summary: "작은 인간형 발자국을 추적한다.",
          onSuccess: ["flag.n02_goblin_tracks_found", "clue.n02_small_tracks"],
        },
      ],
      vttMap: buildMap("map_n02_well_square", "black_well_n02"),
    }),
    transitionsJson: json([
      {
        id: "t_n02_to_n03",
        label: "우물 아래로 내려간다",
        condition: "default",
        nextNodeId: "black_well_n03",
      },
    ]),
    cluesJson: json([
      {
        id: "clue.n02_rope_marks",
        title: "젖은 밧줄의 흔적",
        text: "밧줄에 작은 진흙 손자국이 묻어 있다.",
        handoutText: "밧줄에 작은 진흙 손자국이 남아 있다.",
        revealPolicy: { mode: "conditional" },
      },
      {
        id: "clue.n02_black_water",
        title: "오염된 우물물",
        text: "검은 물은 독살이라기보다 부패한 음식물과 하수 오염에 가깝다.",
        handoutText: "우물물은 독보다 부패와 하수 오염에 가깝다.",
        revealPolicy: { mode: "conditional" },
      },
      {
        id: "clue.n02_small_tracks",
        title: "작은 발자국",
        text: "우물 주변에 작은 인간형 발자국이 남아 있다.",
        handoutText: "작은 인간형 발자국이 우물 가장자리와 창고 방향을 오간다.",
        revealPolicy: { mode: "conditional" },
      },
    ]),
    nodeMetaJson: json({
      assetRefs: [{ id: "asset.map.well_square", kind: "map", ref: "well_square_map.png" }],
      playerStartPositions: [
        { x: 448, y: 576 },
        { x: 512, y: 640 },
        { x: 576, y: 576 },
        { x: 640, y: 640 },
      ],
      interactionPoints: [
        {
          id: "point.rope",
          label: "우물 밧줄",
          x: 640,
          y: 256,
          checks: ["check.n02_secure_rope", "check.n02_rope_notice"],
        },
        {
          id: "point.black_water",
          label: "검은 물",
          x: 640,
          y: 320,
          checks: ["check.n02_water_nature", "check.n02_water_contact"],
        },
        {
          id: "point.footprints",
          label: "작은 발자국",
          x: 896,
          y: 416,
          checks: ["check.n02_track_goblins"],
        },
      ],
      outcomes: [
        { id: "flag.n02_rope_secured", type: "flag", value: true },
        { id: "flag.n02_goblin_tracks_found", type: "flag", value: true },
      ],
      descentRisk: {
        saveId: "check.n02_descent_dex_save",
        ability: "dexterity",
        dc: 10,
        trigger: "하강 전에 밧줄을 안정화하지 못했을 때",
        onFailure: "1d6 bludgeoning damage",
      },
    }),
    fallbackNodeId: "black_well_n03",
  },
  {
    id: "black_well_n03",
    scenarioId: BLACK_WELL_SCENARIO_ID,
    nodeType: "exploration",
    title: "N03. 지하 수로 입구",
    sceneText:
      "우물 아래에는 오래된 벽돌 통로가 이어져 있다. 바닥에는 더러운 물이 발목 높이까지 차 있고, 어둠 너머에서 찍찍거리는 소리가 메아리친다.",
    imageUrl: null,
    checkOptionsJson: json({
      checks: [
        {
          id: "check.n03_slippery_floor",
          type: "saving_throw",
          ability: "dexterity",
          dc: 10,
          summary: "달리거나 급하게 방향을 틀 때 미끄러지지 않는다.",
          onFailure: ["condition:prone"],
        },
        {
          id: "check.n03_rusted_gate_force",
          type: "skill_check",
          ability: "strength",
          skill: "athletics",
          dc: 12,
          summary: "낡은 철창을 들어 올린다.",
        },
        {
          id: "check.n03_rusted_gate_tools",
          type: "ability_check",
          ability: "dexterity",
          tool: "thieves_tools",
          dc: 12,
          summary: "도구로 철창 자물쇠를 연다.",
        },
        {
          id: "check.n03_food_sacks",
          type: "skill_check",
          ability: "intelligence",
          skill: "investigation",
          dc: 10,
          summary: "버려진 식량 자루의 출처를 확인한다.",
          onSuccess: ["clue.n03_supply_marks"],
        },
      ],
      vttMap: buildMap(
        "map_n03_sewer",
        "black_well_n03",
        [
          fogRect("fog_west_corridor", 0, 0, 448, 832),
          fogRect("fog_east_corridor", 832, 0, 448, 832),
          fogRect("fog_north_room", 384, 0, 512, 256),
        ],
      ),
    }),
    transitionsJson: json([
      {
        id: "t_n03_to_n04",
        label: "수로 깊숙한 곳으로 전진",
        condition: "default",
        nextNodeId: "black_well_n04",
      },
    ]),
    cluesJson: json([
      {
        id: "clue.n03_supply_marks",
        title: "창고 표식이 남은 식량 자루",
        text: "버려진 자루에 그레이브룩 창고 인장이 남아 있다.",
        handoutText: "자루에서 마을 창고 표식을 발견했다.",
        revealPolicy: { mode: "conditional" },
      },
    ]),
    nodeMetaJson: json({
      assetRefs: [{ id: "asset.map.sewer", kind: "map", ref: "sewer_map.png" }],
      playerStartPositions: [
        { x: 160, y: 640 },
        { x: 224, y: 704 },
        { x: 288, y: 640 },
        { x: 352, y: 704 },
      ],
      interactionPoints: [
        {
          id: "point.slippery_floor",
          label: "미끄러운 바닥",
          x: 320,
          y: 576,
          checks: ["check.n03_slippery_floor"],
        },
        {
          id: "point.rusted_gate",
          label: "낡은 철창",
          x: 640,
          y: 256,
          checks: ["check.n03_rusted_gate_force", "check.n03_rusted_gate_tools"],
        },
        {
          id: "point.food_sacks",
          label: "버려진 식량 자루",
          x: 928,
          y: 448,
          checks: ["check.n03_food_sacks"],
        },
      ],
      fogRevealGuidance: [
        "파티가 서쪽 통로로 이동하면 fog_west_corridor 제거",
        "파티가 동쪽 통로로 이동하면 fog_east_corridor 제거",
        "철창을 넘거나 우회로를 확인하면 fog_north_room 제거",
      ],
      outcomes: [
        {
          id: "flag.n03_gate_quiet_entry",
          type: "flag",
          value: true,
          condition: "check.n03_rusted_gate_force or check.n03_rusted_gate_tools success",
        },
      ],
    }),
    fallbackNodeId: "black_well_n04",
  },
  {
    id: "black_well_n04",
    scenarioId: BLACK_WELL_SCENARIO_ID,
    nodeType: "combat",
    title: "N04. 쥐떼 소굴",
    sceneText:
      "썩은 식량 자루가 쌓인 방 안으로 들어서자, 거대한 쥐들이 찍찍거리며 달려든다. 얕은 물과 좁은 통로 탓에 움직임이 답답하고, 젖은 자루들은 몸을 숨길 만한 엄폐물이 된다.",
    imageUrl: null,
    checkOptionsJson: json({
      checks: [
        {
          id: "check.n04_quiet_approach",
          type: "skill_check",
          ability: "dexterity",
          skill: "stealth",
          dc: 10,
          summary: "소굴에 조용히 접근해 기습 기회를 노린다.",
          onSuccess: ["flag.n04_party_surprised_rats"],
        },
        {
          id: "check.n04_aftermath_marks",
          type: "skill_check",
          ability: "intelligence",
          skill: "investigation",
          dc: 10,
          summary: "전투 후 고블린이 남긴 표식을 찾는다.",
          onSuccess: ["clue.n04_goblin_marks"],
        },
        {
          id: "check.n04_aftermath_tracks",
          type: "skill_check",
          ability: "wisdom",
          skill: "survival",
          dc: 10,
          summary: "더 깊은 곳으로 향한 작은 발자국을 확인한다.",
          onSuccess: ["clue.n04_deeper_tracks"],
        },
      ],
      combat: {
        encounterId: "encounter_black_well_rats",
        hostiles: [
          { id: "giant-rat-1", name: "Giant Rat", armorClass: 12, maxHp: 7, currentHp: 7, initiative: 13 },
          { id: "giant-rat-2", name: "Giant Rat", armorClass: 12, maxHp: 7, currentHp: 7, initiative: 11 },
          { id: "giant-rat-3", name: "Giant Rat", armorClass: 12, maxHp: 7, currentHp: 7, initiative: 10 },
          { id: "giant-rat-4", name: "Giant Rat", armorClass: 12, maxHp: 7, currentHp: 7, initiative: 9 },
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
      vttMap: buildMap("map_n04_rat_lair", "black_well_n04", [], [
        hostileToken("token:rat-1", "Giant Rat", 704, 320),
        hostileToken("token:rat-2", "Giant Rat", 832, 320),
        hostileToken("token:rat-3", "Giant Rat", 768, 448),
        hostileToken("token:rat-4", "Giant Rat", 896, 448),
      ]),
    }),
    transitionsJson: json([
      {
        id: "t_n04_to_n05",
        label: "쥐떼를 처리하고 안쪽으로 이동",
        condition: "all_hostiles_defeated",
        nextNodeId: "black_well_n05",
      },
      {
        id: "t_n04_to_n05_default",
        label: "다음 방으로 이동",
        condition: "default",
        nextNodeId: "black_well_n05",
      },
    ]),
    cluesJson: json([
      {
        id: "clue.n04_goblin_marks",
        title: "고블린의 조잡한 표식",
        text: "벽면에 마을 우물과 해골을 엉성하게 그린 고블린 낙서가 있다.",
        handoutText: "벽에 고블린이 남긴 조잡한 표식을 발견했다.",
        revealPolicy: { mode: "conditional" },
      },
      {
        id: "clue.n04_deeper_tracks",
        title: "더 깊은 곳으로 이어지는 흔적",
        text: "작은 인간형 발자국이 더 안쪽 저장실을 향한다.",
        handoutText: "작은 발자국이 수로 더 깊은 곳으로 이어진다.",
        revealPolicy: { mode: "conditional" },
      },
    ]),
    nodeMetaJson: json({
      assetRefs: [
        { id: "asset.map.rat_lair", kind: "map", ref: "rat_lair_battlemap.png" },
        { id: "asset.token.giant_rat", kind: "token", ref: "giant_rat_token.png" },
      ],
      playerStartPositions: [
        { x: 192, y: 576 },
        { x: 256, y: 640 },
        { x: 320, y: 576 },
        { x: 384, y: 640 },
      ],
      interactionPoints: [
        { id: "terrain.bag_cover_1", label: "썩은 자루 더미", x: 640, y: 256, cover: "half" },
        { id: "terrain.bag_cover_2", label: "썩은 자루 더미", x: 896, y: 256, cover: "half" },
        { id: "terrain.narrow_choke", label: "좁은 통로", x: 544, y: 448, note: "한 칸 폭 이동 병목" },
      ],
      rewards: [
        { id: "reward.n04_loose_coins", type: "currency", currency: "cp", amount: 9 },
        { id: "reward.n04_dagger", type: "item", itemName: "작은 단검 1개" },
      ],
      combatSetup: {
        scaling: [
          { partySize: 3, hostiles: 4 },
          { partySize: 4, hostiles: 5 },
          { mode: "beginner", hostiles: 3 },
        ],
        tacticalNotes: [
          "얕은 물은 이동 가능, 별도 패널티 없음",
          "자루 더미는 필요하면 반엄폐 AC +2로 처리",
        ],
      },
      outcomes: [{ id: "flag.n04_party_surprised_rats", type: "flag", value: true }],
    }),
    fallbackNodeId: "black_well_n05",
  },
  {
    id: "black_well_n05",
    scenarioId: BLACK_WELL_SCENARIO_ID,
    nodeType: "story",
    title: "N05. 고블린 임시 야영지",
    sceneText:
      "통로 끝에서 희미한 불빛이 보인다. 낡은 저장실 안에는 훔친 식량, 부서진 나무상자, 조잡한 침낭이 널려 있고, 벽에는 마을 우물과 해골 표시가 그려져 있다.",
    imageUrl: null,
    checkOptionsJson: json({
      checks: [
        {
          id: "check.n05_stealth_setup",
          type: "skill_check",
          ability: "dexterity",
          skill: "stealth",
          dc: 12,
          summary: "고블린의 최종 방에 들키지 않고 접근한다.",
          onSuccess: ["flag.n05_advantage_position"],
        },
        {
          id: "check.n05_count_goblins",
          type: "skill_check",
          ability: "intelligence",
          skill: "investigation",
          dc: 10,
          summary: "고블린 수를 대략 파악한다.",
          onSuccess: ["clue.n05_goblin_count"],
        },
        {
          id: "check.n05_pollution_cause",
          type: "skill_check",
          ability: "intelligence",
          skill: "investigation",
          dc: 12,
          summary: "우물 오염의 직접 원인을 파악한다.",
          onSuccess: ["clue.n05_pollution_cause"],
        },
        {
          id: "check.n05_intimidate_terms",
          type: "skill_check",
          ability: "charisma",
          skill: "intimidation",
          dc: 12,
          summary: "최종 전투에서 고블린을 위축시킬 명분을 만든다.",
          onSuccess: ["flag.n05_surrender_pressure"],
        },
        {
          id: "check.n05_persuasion_terms",
          type: "skill_check",
          ability: "charisma",
          skill: "persuasion",
          dc: 12,
          summary: "퇴로와 식량을 조건으로 협상 여지를 만든다.",
          onSuccess: ["flag.n05_negotiation_open"],
        },
      ],
      vttMap: null,
    }),
    transitionsJson: json([
      {
        id: "t_n05_to_n06",
        label: "마지막 방으로 진입",
        condition: "default",
        nextNodeId: "black_well_n06",
      },
    ]),
    cluesJson: json([
      {
        id: "clue.n05_goblin_count",
        title: "대략적인 고블린 수",
        text: "침낭과 식기 수로 보아 고블린은 3~4마리 정도다.",
        handoutText: "야영 흔적으로 보아 고블린은 3~4마리 정도다.",
        revealPolicy: { mode: "conditional" },
      },
      {
        id: "clue.n05_pollution_cause",
        title: "오염의 직접 원인",
        text: "고블린들이 독을 푼 것이 아니라 음식물 찌꺼기와 오물을 우물 아래에 버려 물이 썩은 것이다.",
        handoutText: "우물 오염은 독살이 아니라 음식물과 오물 때문이다.",
        revealPolicy: { mode: "conditional" },
      },
    ]),
    nodeMetaJson: json({
      assetRefs: [{ id: "asset.story.goblin_camp", kind: "story_image", ref: "goblin_camp.png" }],
      rewards: [],
      outcomes: [
        { id: "flag.n05_advantage_position", type: "flag", value: true },
        { id: "flag.n05_surrender_pressure", type: "flag", value: true },
        { id: "flag.n05_negotiation_open", type: "flag", value: true },
      ],
      sceneGuidance: {
        summary: "고블린은 침공군이 아니라 굶주린 약탈자 무리로 묘사한다.",
        consequences: [
          "은신 성공 시 N06 시작 위치 우위 부여",
          "협상 조건 준비 성공 시 N06에서 항복/도주 설득 근거 제공",
        ],
      },
    }),
    fallbackNodeId: "black_well_n06",
  },
  {
    id: "black_well_n06",
    scenarioId: BLACK_WELL_SCENARIO_ID,
    nodeType: "combat",
    title: "N06. 우물 아래 전투",
    sceneText:
      "마지막 방은 넓은 지하 저수조다. 중앙의 검은 물웅덩이 옆에서 고블린들이 식량 자루를 뒤지고 있다. 한 고블린이 녹슨 단검을 치켜들며 외친다. \"여긴 우리 굴이다!\"",
    imageUrl: null,
    checkOptionsJson: json({
      checks: [
        {
          id: "check.n06_intimidation_surrender",
          type: "skill_check",
          ability: "charisma",
          skill: "intimidation",
          dc: 12,
          summary: "고블린 1마리가 쓰러진 뒤 남은 무리를 굴복시킨다.",
          onSuccess: ["flag.n06_goblins_surrender"],
        },
        {
          id: "check.n06_persuasion_truce",
          type: "skill_check",
          ability: "charisma",
          skill: "persuasion",
          dc: 13,
          summary: "식량과 퇴로를 조건으로 전투를 멈추게 한다.",
          onSuccess: ["flag.n06_goblins_truce"],
        },
      ],
      combat: {
        encounterId: "encounter_black_well_goblins",
        hostiles: [
          { id: "goblin-1", name: "Goblin", armorClass: 15, maxHp: 7, currentHp: 7, initiative: 14 },
          { id: "goblin-2", name: "Goblin", armorClass: 15, maxHp: 7, currentHp: 7, initiative: 12 },
          { id: "goblin-3", name: "Goblin", armorClass: 15, maxHp: 7, currentHp: 7, initiative: 11 },
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
      vttMap: buildMap("map_n06_well_chamber", "black_well_n06", [], [
        hostileToken("token:goblin-1", "Goblin", 768, 320),
        hostileToken("token:goblin-2", "Goblin", 896, 320),
        hostileToken("token:goblin-3", "Goblin", 832, 448),
      ]),
    }),
    transitionsJson: json([
      {
        id: "t_n06_victory_to_n07",
        label: "고블린을 물리치고 귀환",
        condition: "all_hostiles_defeated",
        nextNodeId: "black_well_n07",
      },
      {
        id: "t_n06_surrender_to_n07",
        label: "고블린 항복 후 귀환",
        condition: "flag.n06_goblins_surrender",
        nextNodeId: "black_well_n07",
      },
      {
        id: "t_n06_escape_to_n07",
        label: "고블린 도주 후 귀환",
        condition: "flag.n06_goblins_truce",
        nextNodeId: "black_well_n07",
      },
      {
        id: "t_n06_default_to_n07",
        label: "전투 종료 후 귀환",
        condition: "default",
        nextNodeId: "black_well_n07",
      },
    ]),
    cluesJson: json([
      {
        id: "clue.n06_black_pool",
        title: "검은 물웅덩이",
        text: "오염이 가장 심한 곳은 저수조 중앙의 검은 물웅덩이다.",
        handoutText: "검은 물웅덩이가 우물 오염의 중심지처럼 보인다.",
        revealPolicy: { mode: "on_node_visit" },
      },
    ]),
    nodeMetaJson: json({
      assetRefs: [
        { id: "asset.map.well_chamber", kind: "map", ref: "well_chamber_battlemap.png" },
        { id: "asset.token.goblin", kind: "token", ref: "goblin_token.png" },
      ],
      playerStartPositions: [
        { x: 160, y: 640 },
        { x: 224, y: 704 },
        { x: 288, y: 640 },
        { x: 352, y: 704 },
      ],
      interactionPoints: [
        { id: "terrain.box_cover_left", label: "상자 더미", x: 704, y: 256, cover: "half" },
        { id: "terrain.box_cover_right", label: "상자 더미", x: 960, y: 256, cover: "half" },
        {
          id: "terrain.black_pool",
          label: "검은 물웅덩이",
          x: 768,
          y: 512,
          terrain: "difficult",
          note: "MVP에서는 이동 속도 절반만 적용",
        },
        { id: "terrain.pillar_1", label: "낡은 기둥", x: 576, y: 320, cover: "half" },
        { id: "terrain.pillar_2", label: "낡은 기둥", x: 1024, y: 320, cover: "half" },
      ],
      rewards: [
        { id: "reward.n06_recovered_supplies", type: "story_reward", summary: "훔친 식량 회수" },
        { id: "reward.n06_coin_pouch", type: "currency", currency: "gp", amount: 5 },
        {
          id: "reward.n06_potion",
          type: "item",
          itemId: "magic_item.potion_of_healing",
          quantity: 1,
        },
      ],
      combatSetup: {
        scaling: [
          { partySize: 3, hostiles: 3 },
          { partySize: 4, hostiles: 4 },
          { mode: "beginner", hostiles: 3, oneStartsAtHalfHp: true },
        ],
        behaviorNotes: [
          "상자 뒤에서 원거리 공격 우선",
          "절반 이상 쓰러지면 항복 또는 도주 가능",
        ],
      },
      outcomes: [
        { id: "flag.n06_goblins_surrender", type: "flag", value: true },
        { id: "flag.n06_goblins_truce", type: "flag", value: true },
      ],
    }),
    fallbackNodeId: "black_well_n07",
  },
  {
    id: "black_well_n07",
    scenarioId: BLACK_WELL_SCENARIO_ID,
    nodeType: "story",
    title: "N07. 귀환과 보상",
    sceneText:
      "우물 아래의 오염원이 제거되자 검은 물은 천천히 맑아지기 시작한다. 마을 사람들은 되찾은 식량 자루를 보고 안도의 한숨을 내쉰다. 관리인 밀라는 일행에게 보상을 건네며 감사를 전한다.",
    imageUrl: null,
    checkOptionsJson: json({
      checks: [],
      vttMap: null,
    }),
    transitionsJson: json([
      {
        id: "t_n07_end",
        label: "세션 종료",
        condition: "session_complete",
        nextNodeId: null,
      },
    ]),
    cluesJson: json([
      {
        id: "clue.n07_clean_well",
        title: "맑아지는 우물",
        text: "시간이 지나며 우물물의 검은 빛이 걷히기 시작한다.",
        handoutText: "우물물이 서서히 맑아지기 시작했다.",
        revealPolicy: { mode: "on_node_visit" },
      },
    ]),
    nodeMetaJson: json({
      assetRefs: [
        { id: "asset.story.village_square", kind: "story_image", ref: "village_square.png" },
        { id: "asset.npc.mila", kind: "story_image", ref: "mayor_mila.png" },
      ],
      npcProfiles: [milaProfile],
      sceneNpcBindings: [
        {
          npcEntityId: "npc.mila_boston",
          role: "reward_giver",
          dialogueIntent: "gratitude_and_reward",
          optionalOpeningSeed: "작은 마을이지만, 오늘 여러분이 없었다면 큰일이 났을 겁니다.",
        },
      ],
      rewards: [
        { id: "reward.n07_party_gold", type: "currency", currency: "gp", amount: 25 },
        {
          id: "reward.n07_party_potion",
          type: "item",
          itemId: "magic_item.potion_of_healing",
          quantity: 1,
        },
      ],
      endings: [
        {
          id: "ending.combat_victory",
          title: "고블린 퇴치",
          condition: "all_hostiles_defeated",
          summary: "고블린 무리를 몰아내고 마을의 안전을 확보했다.",
        },
        {
          id: "ending.negotiated_departure",
          title: "협상 해결",
          condition: "flag.n06_goblins_truce",
          summary: "고블린은 퇴로를 받아 떠나고, 마을은 피를 덜 흘린 채 문제를 수습했다.",
        },
        {
          id: "ending.surrendered_goblins",
          title: "항복 수용",
          condition: "flag.n06_goblins_surrender",
          summary: "항복한 고블린을 놓아주며 후속 정보원을 얻을 여지를 남겼다.",
        },
      ],
      outcomes: [
        {
          id: "flag.n07_goblin_informant_hook",
          type: "flag",
          value: true,
          condition: "flag.n06_goblins_truce or flag.n06_goblins_surrender",
        },
      ],
    }),
    fallbackNodeId: null,
  },
];

export async function seedBlackWellDemoScenario(prisma: PrismaClient): Promise<void> {
  await prisma.scenario.upsert({
    where: { id: blackWellScenario.id },
    update: {
      title: blackWellScenario.title,
      description: blackWellScenario.description,
      thumbnailUrl: blackWellScenario.thumbnailUrl,
      ruleSetId: blackWellScenario.ruleSetId,
      difficulty: blackWellScenario.difficulty,
      license: blackWellScenario.license,
      attribution: blackWellScenario.attribution,
      startNodeId: blackWellScenario.startNodeId,
    },
    create: blackWellScenario,
  });

  for (const node of blackWellNodes) {
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
