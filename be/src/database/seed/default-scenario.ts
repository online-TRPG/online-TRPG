import { PrismaClient, ScenarioLicense } from "@prisma/client";

export const DEFAULT_SCENARIO_ID = "scenario_goblin_cave";
export const DEFAULT_START_NODE_ID = "node_cave_entrance";
export const NODE_SCREEN_TEST_SCENARIO_ID = "scenario_node_screen_test";
export const NODE_SCREEN_TEST_START_NODE_ID = "node_screen_test_combat";
export const RULE_RUNTIME_SMOKE_SCENARIO_ID = "scenario_rule_runtime_smoke";
export const RULE_RUNTIME_SMOKE_START_NODE_ID = "node_rule_smoke_rest";
export const P1_ONESHOT_SCENARIO_ID = "scenario_p1_ember_ruins";
export const P1_ONESHOT_START_NODE_ID = "node_p1_ember_hook";
export const P2_VALIDATION_SCENARIO_ID = "scenario_p2_storm_vault";
export const P2_VALIDATION_START_NODE_ID = "node_p2_storm_hook";
export const P3_VALIDATION_SCENARIO_ID = "scenario_p3_skybreaker_archive";
export const P3_VALIDATION_START_NODE_ID = "node_p3_archive_hook";
export const P4_VALIDATION_SCENARIO_ID = "scenario_p4_storm_crown_campaign";
export const P4_VALIDATION_START_NODE_ID = "node_p4_crown_hook";
export const P5_VALIDATION_SCENARIO_ID = "scenario_p5_astral_seal_campaign";
export const P5_VALIDATION_START_NODE_ID = "node_p5_astral_briefing";
export const P6_VALIDATION_SCENARIO_ID = "scenario_p6_eternal_storm_citadel";
export const P6_VALIDATION_START_NODE_ID = "node_p6_citadel_council";

const TEAM_SCENARIO_TITLE = "ㅁㄴㅇㅇㄹ";
const NODE_SCREEN_TEST_STORY_NODE_ID = "node_screen_test_story";
const NODE_SCREEN_TEST_EXPLORATION_NODE_ID = "node_screen_test_exploration";
const RULE_RUNTIME_TRAP_NODE_ID = "node_rule_smoke_trap_save";
const RULE_RUNTIME_COVER_NODE_ID = "node_rule_smoke_cover_combat";
const RULE_RUNTIME_AOE_NODE_ID = "node_rule_smoke_aoe";
const RULE_RUNTIME_CONDITION_NODE_ID = "node_rule_smoke_condition";
const RULE_RUNTIME_HUMAN_GM_NODE_ID = "node_rule_smoke_human_gm";
export const P1_ONESHOT_MARKET_NODE_ID = "node_p1_ember_market";
export const P1_ONESHOT_AMBUSH_NODE_ID = "node_p1_ember_ambush";
export const P1_ONESHOT_REST_NODE_ID = "node_p1_ember_rest";
export const P1_ONESHOT_BOSS_NODE_ID = "node_p1_ember_boss";
export const P1_ONESHOT_END_NODE_ID = "node_p1_ember_end";
const P2_APPROACH_NODE_ID = "node_p2_storm_approach";
const P2_GALLERY_NODE_ID = "node_p2_storm_gallery";
const P2_VAULT_NODE_ID = "node_p2_storm_vault";
const P2_END_NODE_ID = "node_p2_storm_end";
const P3_ARCHIVE_NODE_ID = "node_p3_archive_stacks";
const P3_AVIARY_NODE_ID = "node_p3_archive_aviary";
const P3_FOUNDRY_NODE_ID = "node_p3_archive_foundry";
const P3_BOSS_NODE_ID = "node_p3_archive_blue_eye";
const P3_END_NODE_ID = "node_p3_archive_end";
const P4_SHOP_NODE_ID = "node_p4_crown_market";
const P4_EXPLORATION_NODE_ID = "node_p4_crown_observatory";
const P4_COMBAT_NODE_ID = "node_p4_crown_siege";
const P4_DOWNTIME_NODE_ID = "node_p4_crown_downtime";
const P4_BOSS_NODE_ID = "node_p4_crown_lich_gate";
const P4_END_NODE_ID = "node_p4_crown_end";
const P5_SCHEDULE_NODE_ID = "node_p5_astral_schedule";
const P5_TRAVEL_NODE_ID = "node_p5_astral_travel";
const P5_SECOND_TRAVEL_NODE_ID = "node_p5_astral_dimensional_crossing";
const P5_RESEARCH_NODE_ID = "node_p5_astral_research";
const P5_DOWNTIME_NODE_ID = "node_p5_astral_downtime";
const P5_RIFT_NODE_ID = "node_p5_astral_rift";
const P5_COMBAT_NODE_ID = "node_p5_astral_battlefield";
const P5_BOSS_ONE_NODE_ID = "node_p5_astral_dragon_phase";
const P5_BOSS_TWO_NODE_ID = "node_p5_astral_tarrasque_phase";
const P5_PUBLIC_NODE_ID = "node_p5_astral_public_ecosystem";
const P5_END_NODE_ID = "node_p5_astral_end";
const P6_LEVEL_NODE_ID = "node_p6_level_20_ascension";
const P6_TRAVEL_ONE_NODE_ID = "node_p6_planar_convergence";
const P6_TRAVEL_TWO_NODE_ID = "node_p6_astral_projection_gate";
const P6_EXPLORATION_ONE_NODE_ID = "node_p6_wish_archive";
const P6_EXPLORATION_TWO_NODE_ID = "node_p6_shapechange_labyrinth";
const P6_DOWNTIME_ONE_NODE_ID = "node_p6_epic_downtime";
const P6_DOWNTIME_TWO_NODE_ID = "node_p6_public_moderation_trial";
const P6_COMBAT_ONE_NODE_ID = "node_p6_dragon_parliament";
const P6_COMBAT_TWO_NODE_ID = "node_p6_naga_mummy_gauntlet";
const P6_BOSS_ONE_NODE_ID = "node_p6_boss_gold_dragon_lair";
const P6_BOSS_TWO_NODE_ID = "node_p6_boss_silver_storm_swarm";
const P6_ARCHIVE_ONE_NODE_ID = "node_p6_campaign_epilogue";
const P6_ARCHIVE_TWO_NODE_ID = "node_p6_character_vault_transfer";
const P6_END_NODE_ID = "node_p6_final_legacy";

// 서버를 처음 실행했을 때 바로 세션을 만들고 흐름을 검증할 수 있도록
// 가장 작은 형태의 기본 시나리오를 코드로 함께 넣어둔다.
const defaultScenario = {
  id: DEFAULT_SCENARIO_ID,
  title: "검은 우물의 쥐떼",
  description: "검은 우물 아래 쥐떼 소굴을 조사하는 기본 제공 시나리오입니다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "easy",
  license: ScenarioLicense.ORIGINAL,
  attribution: "모두의 TRPG 기본 제공 시나리오.",
  startNodeId: DEFAULT_START_NODE_ID,
  startLevel: 1,
  recommendedEndLevel: null,
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
  startLevel: 1,
  recommendedEndLevel: null,
};

const ruleRuntimeSmokeScenario = {
  id: RULE_RUNTIME_SMOKE_SCENARIO_ID,
  title: "SRD 5e 룰 런타임 스모크 테스트",
  description:
    "휴식, 내성, 엄폐, 광역기, 상태이상, 사람 GM 개입 흐름을 한 번씩 검증하기 위한 개발용 시나리오입니다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "test",
  license: ScenarioLicense.ORIGINAL,
  attribution: "Original scenario seed for SRD 5e executable rule smoke testing.",
  startNodeId: RULE_RUNTIME_SMOKE_START_NODE_ID,
  startLevel: 1,
  recommendedEndLevel: null,
};

const p1OneshotScenario = {
  id: P1_ONESHOT_SCENARIO_ID,
  title: "잿불 폐허의 종소리",
  description:
    "3레벨 캐릭터로 30~45분 안에 완료하는 P1 사용자용 오리지널 짧은 모험입니다. 탐색, 함정, 휴식, 대표 몬스터 전투, 보스전을 자연스럽게 검증합니다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "normal",
  license: ScenarioLicense.ORIGINAL,
  attribution: "Original P1 playable scenario seed for Online TRPG.",
  startNodeId: P1_ONESHOT_START_NODE_ID,
  startLevel: 3,
  recommendedEndLevel: 3,
};

const p2ValidationScenario = {
  id: P2_VALIDATION_SCENARIO_ID,
  title: "폭풍 금고의 마지막 비행",
  description:
    "5레벨 캐릭터로 45~60분 동안 종족 특성, Extra Attack, 3레벨 주문, 지형·오브젝트, 비행과 지속 지역 효과를 검증하는 P2 오리지널 단편입니다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "hard",
  license: ScenarioLicense.ORIGINAL,
  attribution: "Original P2 validation scenario seed for Online TRPG.",
  startNodeId: P2_VALIDATION_START_NODE_ID,
  startLevel: 5,
  recommendedEndLevel: 5,
};

const p3ValidationScenario = {
  id: P3_VALIDATION_SCENARIO_ID,
  title: "하늘파괴자의 기록고",
  description:
    "8레벨 캐릭터로 90~120분 동안 P3 직업 기능, 4레벨 주문, P3 몬스터, 실행 가능 아이템, 발행 revision snapshot을 검증하는 오리지널 중편입니다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "deadly",
  license: ScenarioLicense.ORIGINAL,
  attribution: "Original P3 validation scenario seed for Online TRPG.",
  startNodeId: P3_VALIDATION_START_NODE_ID,
  startLevel: 8,
  recommendedEndLevel: 8,
};

const p4ValidationScenario = {
  id: P4_VALIDATION_SCENARIO_ID,
  title: "폭풍왕관의 계승자",
  description:
    "12레벨 캐릭터로 180~240분 동안 P4 9~12레벨 성장, 5~6레벨 주문, 몬스터 100종 확장, 상점·보상·제작·감정·수리·조율·충전 회복, 협업 review/publish 정책과 revision snapshot 격리를 검증하는 오리지널 캠페인 챕터입니다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "deadly",
  license: ScenarioLicense.ORIGINAL,
  attribution: "Original P4 validation campaign seed for Online TRPG.",
  startNodeId: P4_VALIDATION_START_NODE_ID,
  startLevel: 12,
  recommendedEndLevel: 12,
};

const p5ValidationScenario = {
  id: P5_VALIDATION_SCENARIO_ID,
  title: "성좌 봉인의 마지막 원정",
  description:
    "16레벨 캐릭터로 240~360분 동안 P5 13~16레벨 성장, 7~8레벨 주문, 고레벨 몬스터 180종 확장, 캠페인 일정·장기 downtime, 공개 시나리오 탐색·평점·리뷰·fork·신고 흐름을 함께 검증하는 오리지널 캠페인 챕터입니다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "legendary",
  license: ScenarioLicense.ORIGINAL,
  attribution:
    '모두의 TRPG P5 검증 캠페인.\nP5_PUBLIC_META:{"tags":["p5","level-16","campaign","downtime","public-ecosystem"],"estimatedMinutes":300,"gmMode":"BOTH","contentWarnings":["high-level combat","cosmic horror"],"ratings":[],"forkCount":0,"moderationStatus":"visible","reports":[],"lineage":{"sourceScenarioId":null,"sourceRevisionId":null,"forkedFromScenarioId":null,"forkedAt":null,"forkedByUserId":null}}',
  startNodeId: P5_VALIDATION_START_NODE_ID,
  startLevel: 16,
  recommendedEndLevel: 16,
};

const p6ValidationScenario = {
  id: P6_VALIDATION_SCENARIO_ID,
  title: "영원폭풍 성채의 마지막 유산",
  description:
    "17~20레벨 캐릭터로 360~540분 동안 P6 최종 범위인 20레벨 성장, 9레벨 주문, SRD 주문 319개/몬스터 317종 manifest, 운영자 moderation, 캠페인 완결·후일담·캐릭터 보관소·새 캠페인 이관을 끝까지 검증하는 오리지널 최종 캠페인 챕터입니다.",
  thumbnailUrl: null,
  ruleSetId: "dnd5e",
  difficulty: "mythic",
  license: ScenarioLicense.ORIGINAL,
  attribution:
    '모두의 TRPG P6 최종 검증 캠페인.\nP5_PUBLIC_META:{"tags":["p6","level-20","final-campaign","archive","moderation","character-vault"],"estimatedMinutes":450,"gmMode":"BOTH","contentWarnings":["mythic combat","planar catastrophe"],"ratings":[],"forkCount":0,"moderationStatus":"visible","reports":[],"appeals":[],"moderationActions":[],"lineage":{"sourceScenarioId":null,"sourceRevisionId":null,"forkedFromScenarioId":null,"forkedAt":null,"forkedByUserId":null}}',
  startNodeId: P6_VALIDATION_START_NODE_ID,
  startLevel: 17,
  recommendedEndLevel: 20,
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

function createRuleRuntimeSmokeMap(nodeId: string) {
  return {
    id: `map_${nodeId}`,
    scenarioNodeId: nodeId,
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 768,
    height: 512,
    fogRects: [],
    tokens: [
      {
        id: `token_${nodeId}_actor`,
        sessionCharacterId: "smoke-actor",
        name: "Smoke Actor",
        x: 128,
        y: 256,
        size: 64,
        hidden: false,
        isHostile: false,
      },
      {
        id: `token_${nodeId}_goblin`,
        sessionCharacterId: `token_${nodeId}_goblin`,
        name: "Smoke Goblin",
        x: 448,
        y: 192,
        size: 64,
        hidden: false,
        isHostile: true,
        monster: {
          id: "monster.goblin",
          nameEn: "Goblin",
          nameKo: "고블린",
        },
      },
      {
        id: `token_${nodeId}_rat`,
        sessionCharacterId: `token_${nodeId}_rat`,
        name: "Smoke Giant Rat",
        x: 576,
        y: 256,
        size: 64,
        hidden: false,
        isHostile: true,
        monster: {
          id: "monster.giant_rat",
          nameEn: "Giant Rat",
          nameKo: "거대 쥐",
        },
      },
      {
        id: `token_${nodeId}_spider`,
        sessionCharacterId: `token_${nodeId}_spider`,
        name: "Smoke Giant Spider",
        x: 576,
        y: 128,
        size: 64,
        hidden: false,
        isHostile: true,
        monster: {
          id: "monster.giant_spider",
          nameEn: "Giant Spider",
          nameKo: "거대 거미",
        },
      },
    ],
    objectCells: [
      {
        id: `object_${nodeId}_cover_crate`,
        name: "Half Cover Crate",
        description: "A waist-high crate that grants half cover against ranged attacks.",
        x: 320,
        y: 192,
        width: 64,
        height: 64,
        visibleToPlayers: true,
      },
      {
        id: `object_${nodeId}_rope`,
        name: "Smoke Rope",
        description: "equipment.rope__hempen__50_feet x1",
        x: 192,
        y: 256,
        width: 64,
        height: 64,
        visibleToPlayers: true,
        hiddenItemIds: ["equipment.rope__hempen__50_feet"],
      },
    ],
    terrainCells: [
      { id: `terrain_${nodeId}_burning`, x: 384, y: 256, terrainEffectId: "terrain.burning" },
      { id: `terrain_${nodeId}_poison`, x: 448, y: 256, terrainEffectId: "terrain.poison_cloud" },
    ],
    startingPositions: [
      { id: `start_${nodeId}_1`, label: "1", x: 128, y: 256 },
      { id: `start_${nodeId}_2`, label: "2", x: 192, y: 256 },
      { id: `start_${nodeId}_3`, label: "3", x: 128, y: 320 },
      { id: `start_${nodeId}_4`, label: "4", x: 192, y: 320 },
    ],
    updatedAt: "2026-05-24T00:00:00.000Z",
  };
}

function createP1OneshotMap(
  nodeId: string,
  phase: "market" | "ambush" | "rest" | "boss",
) {
  const base = {
    id: `map_${nodeId}`,
    scenarioNodeId: nodeId,
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 960,
    height: 640,
    fogRects: [],
    startingPositions: [
      { id: `start_${nodeId}_1`, label: "1", x: 128, y: 448 },
      { id: `start_${nodeId}_2`, label: "2", x: 192, y: 448 },
      { id: `start_${nodeId}_3`, label: "3", x: 128, y: 512 },
      { id: `start_${nodeId}_4`, label: "4", x: 192, y: 512 },
    ],
    updatedAt: "2026-06-21T00:00:00.000Z",
  };

  if (phase === "market") {
    return {
      ...base,
      tokens: [],
      objectCells: [
        {
          id: `object_${nodeId}_bell_cart`,
          name: "금 간 종을 실은 수레",
          description: "조사하면 잿불 폐허에서 들려오는 종소리와 같은 진동을 느낄 수 있습니다.",
          x: 384,
          y: 256,
          width: 128,
          height: 64,
          visibleToPlayers: true,
          revealChecks: [{ id: "check_bell_cart_arcana", skill: "arcana", dc: 13 }],
          hiddenClueIds: ["clue_p1_bell_resonance"],
        },
      ],
      terrainCells: [
        { id: `terrain_${nodeId}_crowd`, x: 256, y: 192, width: 192, height: 128, terrainEffectId: "terrain.difficult" },
      ],
    };
  }

  if (phase === "ambush") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_orc`,
          name: "Ember Brand Orc",
          x: 640,
          y: 320,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.orc", nameEn: "Orc", nameKo: "오크" },
        },
        {
          id: `token_${nodeId}_skeleton`,
          name: "Ash Skeleton",
          x: 704,
          y: 192,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.skeleton", nameEn: "Skeleton", nameKo: "스켈레톤" },
        },
        {
          id: `token_${nodeId}_wolf`,
          name: "Cinder Wolf",
          x: 576,
          y: 384,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.wolf", nameEn: "Wolf", nameKo: "늑대" },
        },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_supply_cache`,
          name: "버려진 보급 상자",
          description: "열면 rope를 회수할 수 있습니다.",
          x: 320,
          y: 320,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenItemIds: ["equipment.rope__hempen__50_feet"],
        },
      ],
      terrainCells: [
        { id: `terrain_${nodeId}_rubble`, x: 448, y: 256, width: 128, height: 128, terrainEffectId: "terrain.difficult" },
      ],
    };
  }

  if (phase === "rest") {
    return {
      ...base,
      tokens: [],
      objectCells: [
        {
          id: `object_${nodeId}_safe_brazier`,
          name: "꺼져가는 화로",
          description: "짧은 휴식을 취하고 주문과 직업 자원을 재정비하기 좋은 장소입니다.",
          x: 448,
          y: 256,
          width: 64,
          height: 64,
          visibleToPlayers: true,
        },
      ],
      terrainCells: [],
    };
  }

  return {
    ...base,
    tokens: [
      {
        id: `token_${nodeId}_dragon`,
        name: "Ember Whelp",
        x: 672,
        y: 256,
        size: 64,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.red_dragon_wyrmling", nameEn: "Red Dragon Wyrmling", nameKo: "적색 드래곤 새끼" },
      },
      {
        id: `token_${nodeId}_cultist`,
        name: "Bell Cultist",
        x: 608,
        y: 384,
        size: 64,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.cultist", nameEn: "Cultist", nameKo: "광신도" },
      },
      {
        id: `token_${nodeId}_spider`,
        name: "Bell Web Spider",
        x: 768,
        y: 384,
        size: 64,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.giant_spider", nameEn: "Giant Spider", nameKo: "거대 거미" },
      },
    ],
    objectCells: [
      {
        id: `object_${nodeId}_ember_bell`,
        name: "잿불 종",
        description: "종을 멈추면 폐허의 불꽃 숨결이 잦아듭니다.",
        x: 672,
        y: 128,
        width: 128,
        height: 64,
        visibleToPlayers: true,
        revealChecks: [{ id: "check_ember_bell_religion", skill: "religion", dc: 14 }],
        hiddenClueIds: ["clue_p1_bell_weakness"],
      },
    ],
    terrainCells: [
      { id: `terrain_${nodeId}_burning_1`, x: 448, y: 192, width: 64, height: 128, terrainEffectId: "terrain.burning" },
      { id: `terrain_${nodeId}_web_1`, x: 576, y: 320, width: 128, height: 128, terrainEffectId: "terrain.difficult" },
    ],
  };
}

function createP2ValidationMap(nodeId: string, phase: "approach" | "gallery" | "vault") {
  const base = {
    id: `map_${nodeId}`,
    scenarioNodeId: nodeId,
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 1024,
    height: 704,
    fogRects: [],
    startingPositions: [
      { id: `start_${nodeId}_1`, label: "1", x: 128, y: 512 },
      { id: `start_${nodeId}_2`, label: "2", x: 192, y: 512 },
      { id: `start_${nodeId}_3`, label: "3", x: 128, y: 576 },
      { id: `start_${nodeId}_4`, label: "4", x: 192, y: 576 },
    ],
    updatedAt: "2026-06-22T00:00:00.000Z",
  };

  if (phase === "approach") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_harpy`,
          name: "Storm Harpy",
          x: 704,
          y: 192,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.harpy", nameEn: "Harpy", nameKo: "하피" },
        },
        {
          id: `token_${nodeId}_gargoyle`,
          name: "Vault Gargoyle",
          x: 640,
          y: 384,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.gargoyle", nameEn: "Gargoyle", nameKo: "가고일" },
        },
      ],
      terrainCells: [
        { id: `terrain_${nodeId}_elevation`, x: 576, y: 128, width: 256, height: 128, terrainEffectId: "terrain.elevation" },
        { id: `terrain_${nodeId}_slippery`, x: 384, y: 320, width: 192, height: 128, terrainEffectId: "terrain.slippery" },
      ],
      doorCells: [
        {
          id: `door_${nodeId}_gate`,
          name: "폭풍 금고 철문",
          x: 832,
          y: 256,
          width: 64,
          height: 128,
          state: "locked",
          keyItemId: "equipment.crowbar",
          canBreak: true,
          breakCheckDc: 15,
        },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_winch`,
          name: "녹슨 승강기 윈치",
          description: "파괴하면 고지대로 이어지는 쇠사슬 통로가 낮아집니다.",
          x: 448,
          y: 192,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          canBreak: true,
          broken: false,
          breakCheckDc: 14,
        },
      ],
    };
  }

  if (phase === "gallery") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_mimic`,
          name: "Reliquary Mimic",
          x: 576,
          y: 320,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.mimic", nameEn: "Mimic", nameKo: "미믹" },
        },
        {
          id: `token_${nodeId}_cube`,
          name: "Storm Gelatinous Cube",
          x: 704,
          y: 320,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.gelatinous_cube", nameEn: "Gelatinous Cube", nameKo: "젤라틴 큐브" },
        },
      ],
      terrainCells: [
        { id: `terrain_${nodeId}_poison`, x: 448, y: 192, width: 192, height: 128, terrainEffectId: "terrain.poison_cloud" },
        { id: `terrain_${nodeId}_obscured`, x: 704, y: 192, width: 128, height: 192, terrainEffectId: "terrain.obscurement" },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_locker`,
          name: "번개 문양 보관함",
          description: "조사하면 금고 열쇠와 회복 물자를 찾을 수 있습니다.",
          x: 320,
          y: 256,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenItemIds: ["equipment.crowbar"],
          hiddenClueIds: ["clue_p2_vault_key"],
          revealChecks: [{ contentId: "clue_p2_vault_key", skill: "investigation", dc: 14 }],
        },
      ],
    };
  }

  return {
    ...base,
    tokens: [
      {
        id: `token_${nodeId}_dragon`,
        name: "Young Red Dragon",
        x: 704,
        y: 192,
        size: 128,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.young_red_dragon", nameEn: "Young Red Dragon", nameKo: "어린 레드 드래곤" },
      },
      {
        id: `token_${nodeId}_scorpion`,
        name: "Vault Giant Scorpion",
        x: 640,
        y: 448,
        size: 128,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.giant_scorpion", nameEn: "Giant Scorpion", nameKo: "거대 전갈" },
      },
    ],
    terrainCells: [
      { id: `terrain_${nodeId}_burning`, x: 448, y: 192, width: 128, height: 256, terrainEffectId: "terrain.burning" },
      { id: `terrain_${nodeId}_elevation`, x: 640, y: 128, width: 256, height: 128, terrainEffectId: "terrain.elevation" },
      { id: `terrain_${nodeId}_difficult`, x: 576, y: 384, width: 192, height: 128, terrainEffectId: "terrain.difficult" },
    ],
    objectCells: [
      {
        id: `object_${nodeId}_orb`,
        name: "폭풍 제어 구체",
        description: "집어 들거나 던져 비행 장치의 흐름을 바꿀 수 있는 핵심 물체입니다.",
        x: 384,
        y: 320,
        width: 64,
        height: 64,
        visibleToPlayers: true,
        hiddenItemIds: ["equipment.rope__hempen__50_feet"],
      },
      {
        id: `object_${nodeId}_pillar`,
        name: "금이 간 지지 기둥",
        description: "부수면 전장의 엄폐와 이동 경로가 달라집니다.",
        x: 576,
        y: 256,
        width: 64,
        height: 128,
        visibleToPlayers: true,
        canBreak: true,
        broken: false,
        breakCheckDc: 16,
      },
    ],
  };
}

function createP3ValidationMap(
  nodeId: string,
  phase: "archive" | "aviary" | "foundry" | "boss",
) {
  const base = {
    id: `map_${nodeId}`,
    scenarioNodeId: nodeId,
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 1152,
    height: 768,
    fogRects: [],
    startingPositions: [
      { id: `start_${nodeId}_1`, label: "1", x: 128, y: 576 },
      { id: `start_${nodeId}_2`, label: "2", x: 192, y: 576 },
      { id: `start_${nodeId}_3`, label: "3", x: 128, y: 640 },
      { id: `start_${nodeId}_4`, label: "4", x: 192, y: 640 },
    ],
    updatedAt: "2026-06-22T00:00:00.000Z",
  };

  if (phase === "archive") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_mage`,
          name: "Archive Mage",
          x: 704,
          y: 256,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.mage", nameEn: "Mage", nameKo: "마법사" },
        },
        {
          id: `token_${nodeId}_priest`,
          name: "Bound Priest",
          x: 768,
          y: 384,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.priest", nameEn: "Priest", nameKo: "사제" },
        },
      ],
      terrainCells: [
        { id: `terrain_${nodeId}_obscured`, x: 512, y: 192, width: 192, height: 192, terrainEffectId: "terrain.obscurement" },
        { id: `terrain_${nodeId}_difficult`, x: 384, y: 320, width: 256, height: 128, terrainEffectId: "terrain.difficult" },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_index`,
          name: "하늘파괴자 색인대",
          description: "조사하면 boss revision 격리 검증 지시와 4레벨 주문 단서를 찾을 수 있습니다.",
          x: 320,
          y: 256,
          width: 128,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: ["clue_p3_revision_index"],
          hiddenItemIds: ["magic_item.wand_of_web", "equipment.potion_of_healing"],
          revealChecks: [{ contentId: "clue_p3_revision_index", skill: "investigation", dc: 15 }],
        },
      ],
    };
  }

  if (phase === "aviary") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_wyvern`,
          name: "Skybreaker Wyvern",
          x: 704,
          y: 192,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.wyvern", nameEn: "Wyvern", nameKo: "와이번" },
        },
        {
          id: `token_${nodeId}_manticore`,
          name: "Needle Manticore",
          x: 832,
          y: 448,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.manticore", nameEn: "Manticore", nameKo: "맨티코어" },
        },
        {
          id: `token_${nodeId}_eagle`,
          name: "Giant Eagle Sentinel",
          x: 576,
          y: 384,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.giant_eagle", nameEn: "Giant Eagle", nameKo: "거대 독수리" },
        },
      ],
      terrainCells: [
        { id: `terrain_${nodeId}_elevation`, x: 640, y: 128, width: 256, height: 256, terrainEffectId: "terrain.elevation" },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_ballista`,
          name: "부서진 발리스타",
          description: "수리하거나 부수면 비행 몬스터의 고도 우위를 줄일 수 있습니다.",
          x: 384,
          y: 192,
          width: 128,
          height: 64,
          visibleToPlayers: true,
          canBreak: true,
          broken: false,
          breakCheckDc: 16,
          hiddenItemIds: ["equipment.화살", "magic_item.potion_of_flying"],
        },
      ],
    };
  }

  if (phase === "foundry") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_troll`,
          name: "Runic Troll",
          x: 704,
          y: 384,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.troll", nameEn: "Troll", nameKo: "트롤" },
        },
        {
          id: `token_${nodeId}_basilisk`,
          name: "Glass Basilisk",
          x: 832,
          y: 256,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.basilisk", nameEn: "Basilisk", nameKo: "바실리스크" },
        },
        {
          id: `token_${nodeId}_elemental`,
          name: "Water Elemental Coolant",
          x: 576,
          y: 256,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.water_elemental", nameEn: "Water Elemental", nameKo: "물 정령" },
        },
      ],
      terrainCells: [
        { id: `terrain_${nodeId}_burning`, x: 448, y: 192, width: 192, height: 256, terrainEffectId: "terrain.burning" },
        { id: `terrain_${nodeId}_wall`, x: 704, y: 192, width: 64, height: 320, terrainEffectId: "terrain.wall_of_fire" },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_forge_core`,
          name: "용광로 심장",
          description: "장치를 정지시키면 Wall of Fire와 burning terrain을 줄일 수 있습니다.",
          x: 384,
          y: 384,
          width: 128,
          height: 128,
          visibleToPlayers: true,
          canBreak: true,
          broken: false,
          breakCheckDc: 17,
          hiddenItemIds: ["magic_item.wand_of_fireballs", "magic_item.rope_of_climbing"],
        },
      ],
    };
  }

  return {
    ...base,
    tokens: [
      {
        id: `token_${nodeId}_dragon`,
        name: "Young Blue Dragon, the Skybreaker Eye",
        x: 704,
        y: 192,
        size: 128,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.young_blue_dragon", nameEn: "Young Blue Dragon", nameKo: "어린 블루 드래곤" },
      },
      {
        id: `token_${nodeId}_golem`,
        name: "Archive Stone Golem",
        x: 576,
        y: 384,
        size: 128,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.stone_golem", nameEn: "Stone Golem", nameKo: "스톤 골렘" },
      },
    ],
    terrainCells: [
      { id: `terrain_${nodeId}_elevation`, x: 640, y: 128, width: 256, height: 128, terrainEffectId: "terrain.elevation" },
      { id: `terrain_${nodeId}_flame`, x: 448, y: 384, width: 192, height: 128, terrainEffectId: "terrain.flaming_sphere" },
      { id: `terrain_${nodeId}_difficult`, x: 704, y: 384, width: 192, height: 192, terrainEffectId: "terrain.difficult" },
    ],
    objectCells: [
      {
        id: `object_${nodeId}_revision_crystal`,
        name: "Revision Crystal",
        description: "revision 1 세션에서 보이는 문구입니다. draft/revision 2에서 바꿔도 기존 세션이 바뀌지 않아야 합니다.",
        x: 320,
        y: 320,
        width: 128,
        height: 128,
        visibleToPlayers: true,
        hiddenItemIds: ["magic_item.necklace_of_fireballs", "magic_item.cloak_of_protection"],
      },
    ],
  };
}

function createP4ValidationMap(
  nodeId: string,
  phase: "market" | "observatory" | "siege" | "downtime" | "boss",
) {
  const base = {
    id: `map_${nodeId}`,
    scenarioNodeId: nodeId,
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 1280,
    height: 832,
    fogRects: [],
    startingPositions: [
      { id: `start_${nodeId}_1`, label: "1", x: 128, y: 640 },
      { id: `start_${nodeId}_2`, label: "2", x: 192, y: 640 },
      { id: `start_${nodeId}_3`, label: "3", x: 256, y: 640 },
      { id: `start_${nodeId}_4`, label: "4", x: 320, y: 640 },
    ],
    updatedAt: "2026-06-23T00:00:00.000Z",
  };

  if (phase === "market") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_archmage_vendor`,
          name: "Storm Crown Archmage Broker",
          x: 768,
          y: 256,
          size: 64,
          hidden: false,
          isHostile: false,
          monster: { id: "monster.archmage", nameEn: "Archmage", nameKo: "대마법사" },
        },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_shop_counter`,
          name: "폭풍왕관 상점 진열대",
          description: "P4 경제 MVP 검증용 상점입니다. healing potion 구매, necklace 판매, protection ring 감정·조율, wand charge 회복을 확인합니다.",
          x: 512,
          y: 320,
          width: 192,
          height: 64,
          visibleToPlayers: true,
          hiddenItemIds: ["equipment.potion_of_healing", "magic_item.cloak_of_protection", "magic_item.ring_of_protection"],
        },
        {
          id: `object_${nodeId}_party_stash`,
          name: "파티 공동 보관함",
          description: "party stash 분배와 재접속 후 복원을 확인합니다.",
          x: 384,
          y: 448,
          width: 128,
          height: 64,
          visibleToPlayers: true,
          hiddenItemIds: ["magic_item.necklace_of_fireballs", "equipment.방패"],
        },
      ],
    };
  }

  if (phase === "observatory") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_medusa`,
          name: "Mirror Medusa",
          x: 832,
          y: 256,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.medusa", nameEn: "Medusa", nameKo: "메두사" },
        },
        {
          id: `token_${nodeId}_phase_spider`,
          name: "Phase Spider Surveyor",
          x: 704,
          y: 384,
          size: 64,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.phase_spider", nameEn: "Phase Spider", nameKo: "위상 거미" },
        },
        {
          id: `token_${nodeId}_roper`,
          name: "Telescope Roper",
          x: 896,
          y: 448,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.roper", nameEn: "Roper", nameKo: "로퍼" },
        },
      ],
      terrainCells: [
        { id: `terrain_${nodeId}_elevation`, x: 640, y: 128, width: 256, height: 256, terrainEffectId: "terrain.elevation" },
        { id: `terrain_${nodeId}_obscurement`, x: 448, y: 256, width: 192, height: 192, terrainEffectId: "terrain.obscurement" },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_telescope`,
          name: "차원 망원경",
          description: "True Seeing, Scrying, Teleportation Circle, Find the Path 같은 P4 탐색 주문을 검증합니다.",
          x: 384,
          y: 192,
          width: 128,
          height: 128,
          visibleToPlayers: true,
          hiddenClueIds: ["clue_p4_observatory_sigil"],
          revealChecks: [{ contentId: "clue_p4_observatory_sigil", skill: "arcana", dc: 16 }],
        },
      ],
    };
  }

  if (phase === "siege") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_fire_giant`,
          name: "Fire Giant Siege Captain",
          x: 832,
          y: 192,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.fire_giant", nameEn: "Fire Giant", nameKo: "파이어 자이언트" },
        },
        {
          id: `token_${nodeId}_chimera`,
          name: "Crown Chimera",
          x: 640,
          y: 256,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.chimera", nameEn: "Chimera", nameKo: "키메라" },
        },
        {
          id: `token_${nodeId}_air_elemental`,
          name: "Storm Air Elemental",
          x: 896,
          y: 448,
          size: 128,
          hidden: false,
          isHostile: true,
          monster: { id: "monster.air_elemental", nameEn: "Air Elemental", nameKo: "공기 정령" },
        },
      ],
      terrainCells: [
        { id: `terrain_${nodeId}_burning`, x: 512, y: 256, width: 192, height: 192, terrainEffectId: "terrain.burning" },
        { id: `terrain_${nodeId}_wall`, x: 704, y: 128, width: 64, height: 384, terrainEffectId: "terrain.wall_of_fire" },
        { id: `terrain_${nodeId}_difficult`, x: 384, y: 384, width: 256, height: 128, terrainEffectId: "terrain.difficult" },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_broken_gate`,
          name: "무너진 왕관문",
          description: "Wall of Force, Wall of Stone, Disintegrate, Telekinesis로 공성 지형을 조작합니다.",
          x: 448,
          y: 192,
          width: 128,
          height: 192,
          visibleToPlayers: true,
          canBreak: true,
          broken: false,
          breakCheckDc: 19,
        },
      ],
    };
  }

  if (phase === "downtime") {
    return {
      ...base,
      tokens: [
        {
          id: `token_${nodeId}_knight`,
          name: "Crown Knight Quartermaster",
          x: 768,
          y: 320,
          size: 64,
          hidden: false,
          isHostile: false,
          monster: { id: "monster.knight", nameEn: "Knight", nameKo: "기사" },
        },
      ],
      objectCells: [
        {
          id: `object_${nodeId}_workbench`,
          name: "폭풍 열쇠 제작대",
          description: "재료 소모, tool proficiency, 8시간 제작 진행, 수리와 감정 결과를 확인합니다.",
          x: 448,
          y: 320,
          width: 192,
          height: 128,
          visibleToPlayers: true,
          hiddenItemIds: ["magic_item.immovable_rod", "equipment.crowbar"],
        },
      ],
    };
  }

  return {
    ...base,
    tokens: [
      {
        id: `token_${nodeId}_lich`,
        name: "Lich Regent of the Storm Crown",
        x: 768,
        y: 192,
        size: 64,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.lich", nameEn: "Lich", nameKo: "리치" },
      },
      {
        id: `token_${nodeId}_young_black_dragon`,
        name: "Black Dragon Heir",
        x: 896,
        y: 320,
        size: 128,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.young_black_dragon", nameEn: "Young Black Dragon", nameKo: "어린 블랙 드래곤" },
      },
      {
        id: `token_${nodeId}_purple_worm`,
        name: "Crown Vault Purple Worm",
        x: 576,
        y: 384,
        size: 192,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.purple_worm", nameEn: "Purple Worm", nameKo: "퍼플 웜" },
      },
      {
        id: `token_${nodeId}_vampire`,
        name: "Vampire Diplomat",
        x: 960,
        y: 512,
        size: 64,
        hidden: false,
        isHostile: true,
        monster: { id: "monster.vampire", nameEn: "Vampire", nameKo: "뱀파이어" },
      },
    ],
    terrainCells: [
      { id: `terrain_${nodeId}_poison`, x: 448, y: 256, width: 256, height: 192, terrainEffectId: "terrain.poison_cloud" },
      { id: `terrain_${nodeId}_ice`, x: 768, y: 384, width: 256, height: 128, terrainEffectId: "terrain.slippery" },
      { id: `terrain_${nodeId}_elevation`, x: 704, y: 128, width: 256, height: 128, terrainEffectId: "terrain.elevation" },
    ],
    objectCells: [
      {
        id: `object_${nodeId}_revision_crown`,
        name: "Revision 1 폭풍왕관",
        description: "revision 2 발행 후에도 revision 1 세션에서는 이 문구와 보상 테이블이 바뀌지 않아야 합니다.",
        x: 320,
        y: 320,
        width: 128,
        height: 128,
        visibleToPlayers: true,
        hiddenItemIds: ["magic_item.wand_of_fireballs", "magic_item.ring_of_protection"],
      },
    ],
  };
}

function createP5ValidationMap(
  nodeId: string,
  phase: "travel" | "dimensional_crossing" | "research" | "downtime" | "rift" | "battlefield" | "dragon" | "tarrasque",
) {
  const monsterByPhase: Record<typeof phase, Array<{ id: string; nameEn: string; nameKo: string; x: number; y: number; size: number }>> = {
    travel: [
      { id: "monster.roc", nameEn: "Roc", nameKo: "로크", x: 768, y: 192, size: 192 },
      { id: "monster.storm_giant", nameEn: "Storm Giant", nameKo: "스톰 자이언트", x: 960, y: 384, size: 128 },
    ],
    dimensional_crossing: [
      { id: "monster.air_elemental", nameEn: "Air Elemental", nameKo: "공기 정령", x: 704, y: 192, size: 128 },
      { id: "monster.invisible_stalker", nameEn: "Invisible Stalker", nameKo: "인비저블 스토커", x: 960, y: 384, size: 64 },
    ],
    research: [
      { id: "monster.gynosphinx", nameEn: "Gynosphinx", nameKo: "진스핑크스", x: 768, y: 256, size: 128 },
      { id: "monster.couatl", nameEn: "Couatl", nameKo: "코아틀", x: 960, y: 384, size: 64 },
    ],
    downtime: [
      { id: "monster.deva", nameEn: "Deva", nameKo: "데바", x: 832, y: 320, size: 64 },
      { id: "monster.shield_guardian", nameEn: "Shield Guardian", nameKo: "실드 가디언", x: 960, y: 448, size: 128 },
    ],
    rift: [
      { id: "monster.aboleth", nameEn: "Aboleth", nameKo: "아볼레스", x: 704, y: 256, size: 192 },
      { id: "monster.rakshasa", nameEn: "Rakshasa", nameKo: "락샤사", x: 960, y: 320, size: 64 },
    ],
    battlefield: [
      { id: "monster.balor", nameEn: "Balor", nameKo: "발러", x: 768, y: 192, size: 128 },
      { id: "monster.pit_fiend", nameEn: "Pit Fiend", nameKo: "핏 핀드", x: 960, y: 320, size: 128 },
      { id: "monster.solar", nameEn: "Solar", nameKo: "솔라", x: 640, y: 448, size: 64 },
    ],
    dragon: [
      { id: "monster.ancient_red_dragon", nameEn: "Ancient Red Dragon", nameKo: "고대 레드 드래곤", x: 768, y: 192, size: 192 },
      { id: "monster.kraken", nameEn: "Kraken", nameKo: "크라켄", x: 512, y: 384, size: 192 },
      { id: "monster.medusa", nameEn: "Medusa", nameKo: "메두사", x: 960, y: 448, size: 64 },
    ],
    tarrasque: [
      { id: "monster.tarrasque", nameEn: "Tarrasque", nameKo: "타라스크", x: 768, y: 256, size: 256 },
      { id: "monster.lich", nameEn: "Lich", nameKo: "리치", x: 512, y: 192, size: 64 },
      { id: "monster.night_hag", nameEn: "Night Hag", nameKo: "나이트 해그", x: 1024, y: 448, size: 64 },
    ],
  };

  return {
    id: `map_${nodeId}`,
    scenarioNodeId: nodeId,
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 1280,
    height: 832,
    fogRects: [],
    startingPositions: [
      { id: `start_${nodeId}_1`, label: "1", x: 128, y: 640 },
      { id: `start_${nodeId}_2`, label: "2", x: 192, y: 640 },
      { id: `start_${nodeId}_3`, label: "3", x: 256, y: 640 },
      { id: `start_${nodeId}_4`, label: "4", x: 320, y: 640 },
    ],
    tokens: monsterByPhase[phase].map((monster) => ({
      id: `token_${nodeId}_${monster.id.replace(/\./g, "_")}`,
      name: monster.nameEn,
      x: monster.x,
      y: monster.y,
      size: monster.size,
      hidden: false,
      isHostile: phase === "research" || phase === "downtime" ? false : true,
      monster: { id: monster.id, nameEn: monster.nameEn, nameKo: monster.nameKo },
    })),
    terrainCells: [
      { id: `terrain_${nodeId}_gravity`, x: 512, y: 256, width: 256, height: 192, terrainEffectId: "terrain.elevation" },
      { id: `terrain_${nodeId}_cloud`, x: 768, y: 384, width: 256, height: 192, terrainEffectId: "terrain.obscurement" },
      { id: `terrain_${nodeId}_fire`, x: 384, y: 384, width: 192, height: 128, terrainEffectId: "terrain.wall_of_fire" },
    ],
    objectCells: [
      {
        id: `object_${nodeId}_astral_anchor`,
        name: "성좌 봉인 앵커",
        description: "P5 주문, 장기 downtime, 공개 revision/fork snapshot 격리를 검증하는 핵심 오브젝트입니다.",
        x: 384,
        y: 256,
        width: 128,
        height: 128,
        visibleToPlayers: true,
        canBreak: phase === "dragon" || phase === "tarrasque",
        broken: false,
        breakCheckDc: 22,
        hiddenClueIds: [`clue_${nodeId}_p5_validation`],
      },
    ],
    updatedAt: "2026-06-24T00:00:00.000Z",
  };
}

function createP6ValidationMap(
  nodeId: string,
  phase:
    | "planar_convergence"
    | "astral_projection"
    | "wish_archive"
    | "shapechange_labyrinth"
    | "epic_downtime"
    | "moderation_trial"
    | "dragon_parliament"
    | "naga_mummy_gauntlet"
    | "gold_dragon_lair"
    | "silver_storm_swarm",
) {
  const monsterByPhase: Record<typeof phase, Array<{ id: string; nameEn: string; nameKo: string; x: number; y: number; size: number }>> = {
    planar_convergence: [
      { id: "monster.adult_brass_dragon", nameEn: "Adult Brass Dragon", nameKo: "성체 브라스 드래곤", x: 768, y: 192, size: 192 },
      { id: "monster.adult_bronze_dragon", nameEn: "Adult Bronze Dragon", nameKo: "성체 브론즈 드래곤", x: 960, y: 384, size: 192 },
      { id: "monster.behir", nameEn: "Behir", nameKo: "비히어", x: 512, y: 384, size: 192 },
    ],
    astral_projection: [
      { id: "monster.adult_copper_dragon", nameEn: "Adult Copper Dragon", nameKo: "성체 코퍼 드래곤", x: 704, y: 192, size: 192 },
      { id: "monster.adult_gold_dragon", nameEn: "Adult Gold Dragon", nameKo: "성체 골드 드래곤", x: 960, y: 320, size: 192 },
      { id: "monster.adult_silver_dragon", nameEn: "Adult Silver Dragon", nameKo: "성체 실버 드래곤", x: 512, y: 448, size: 192 },
    ],
    wish_archive: [
      { id: "monster.guardian_naga", nameEn: "Guardian Naga", nameKo: "가디언 나가", x: 704, y: 256, size: 128 },
      { id: "monster.spirit_naga", nameEn: "Spirit Naga", nameKo: "스피릿 나가", x: 960, y: 384, size: 128 },
      { id: "monster.oni", nameEn: "Oni", nameKo: "오니", x: 512, y: 384, size: 64 },
    ],
    shapechange_labyrinth: [
      { id: "monster.gorgon", nameEn: "Gorgon", nameKo: "고르곤", x: 704, y: 256, size: 128 },
      { id: "monster.shambling_mound", nameEn: "Shambling Mound", nameKo: "섐블링 마운드", x: 960, y: 384, size: 128 },
      { id: "monster.winter_wolf", nameEn: "Winter Wolf", nameKo: "윈터 울프", x: 512, y: 448, size: 128 },
    ],
    epic_downtime: [
      { id: "monster.awakened_tree", nameEn: "Awakened Tree", nameKo: "각성한 나무", x: 704, y: 256, size: 192 },
      { id: "monster.druid", nameEn: "Druid", nameKo: "드루이드", x: 960, y: 384, size: 64 },
      { id: "monster.dryad", nameEn: "Dryad", nameKo: "드라이어드", x: 512, y: 448, size: 64 },
    ],
    moderation_trial: [
      { id: "monster.doppelganger", nameEn: "Doppelganger", nameKo: "도플갱어", x: 704, y: 256, size: 64 },
      { id: "monster.succubus_incubus", nameEn: "Succubus/Incubus", nameKo: "서큐버스/인큐버스", x: 960, y: 384, size: 64 },
      { id: "monster.noble", nameEn: "Noble", nameKo: "귀족", x: 512, y: 448, size: 64 },
    ],
    dragon_parliament: [
      { id: "monster.ancient_brass_dragon", nameEn: "Ancient Brass Dragon", nameKo: "고대 브라스 드래곤", x: 704, y: 192, size: 256 },
      { id: "monster.ancient_bronze_dragon", nameEn: "Ancient Bronze Dragon", nameKo: "고대 브론즈 드래곤", x: 960, y: 320, size: 256 },
      { id: "monster.ancient_copper_dragon", nameEn: "Ancient Copper Dragon", nameKo: "고대 코퍼 드래곤", x: 448, y: 384, size: 256 },
    ],
    naga_mummy_gauntlet: [
      { id: "monster.mummy_lord", nameEn: "Mummy Lord", nameKo: "미라 군주", x: 704, y: 192, size: 128 },
      { id: "monster.glabrezu", nameEn: "Glabrezu", nameKo: "글라브레주", x: 960, y: 320, size: 128 },
      { id: "monster.chuul", nameEn: "Chuul", nameKo: "추울", x: 512, y: 448, size: 128 },
    ],
    gold_dragon_lair: [
      { id: "monster.ancient_gold_dragon", nameEn: "Ancient Gold Dragon", nameKo: "고대 골드 드래곤", x: 768, y: 192, size: 256 },
      { id: "monster.young_gold_dragon", nameEn: "Young Gold Dragon", nameKo: "어린 골드 드래곤", x: 512, y: 448, size: 192 },
      { id: "monster.gold_dragon_wyrmling", nameEn: "Gold Dragon Wyrmling", nameKo: "골드 드래곤 웜링", x: 1024, y: 448, size: 64 },
    ],
    silver_storm_swarm: [
      { id: "monster.ancient_silver_dragon", nameEn: "Ancient Silver Dragon", nameKo: "고대 실버 드래곤", x: 768, y: 192, size: 256 },
      { id: "monster.swarm_of_poisonous_snakes", nameEn: "Swarm of Poisonous Snakes", nameKo: "독사 떼", x: 512, y: 448, size: 128 },
      { id: "monster.swarm_of_quippers", nameEn: "Swarm of Quippers", nameKo: "퀴퍼 떼", x: 1024, y: 448, size: 128 },
    ],
  };

  return {
    id: `map_${nodeId}`,
    scenarioNodeId: nodeId,
    imageUrl: null,
    gridType: "square",
    gridSize: 64,
    width: 1408,
    height: 896,
    fogRects: [],
    startingPositions: [
      { id: `start_${nodeId}_1`, label: "1", x: 128, y: 704 },
      { id: `start_${nodeId}_2`, label: "2", x: 192, y: 704 },
      { id: `start_${nodeId}_3`, label: "3", x: 256, y: 704 },
      { id: `start_${nodeId}_4`, label: "4", x: 320, y: 704 },
    ],
    tokens: monsterByPhase[phase].map((monster) => ({
      id: `token_${nodeId}_${monster.id.replace(/\./g, "_")}`,
      name: monster.nameEn,
      x: monster.x,
      y: monster.y,
      size: monster.size,
      hidden: false,
      isHostile: phase === "wish_archive" || phase === "epic_downtime" || phase === "moderation_trial" ? false : true,
      monster: { id: monster.id, nameEn: monster.nameEn, nameKo: monster.nameKo },
    })),
    terrainCells: [
      { id: `terrain_${nodeId}_prismatic_wall`, x: 448, y: 256, width: 320, height: 128, terrainEffectId: "terrain.wall_of_fire" },
      { id: `terrain_${nodeId}_astral_elevation`, x: 832, y: 256, width: 256, height: 192, terrainEffectId: "terrain.elevation" },
      { id: `terrain_${nodeId}_venom_cloud`, x: 640, y: 448, width: 256, height: 192, terrainEffectId: "terrain.poison_cloud" },
    ],
    objectCells: [
      {
        id: `object_${nodeId}_p6_archive_core`,
        name: "P6 최종 검증 코어",
        description: "20레벨 성장, 9레벨 주문, 최종 manifest, moderation, archive, character vault 이관을 한 번에 추적하는 오브젝트입니다.",
        x: 384,
        y: 256,
        width: 128,
        height: 128,
        visibleToPlayers: true,
        canBreak: phase === "gold_dragon_lair" || phase === "silver_storm_swarm",
        broken: false,
        breakCheckDc: 24,
        hiddenClueIds: [`clue_${nodeId}_p6_validation`],
      },
    ],
    updatedAt: "2026-06-25T00:00:00.000Z",
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
        revealPolicy: { mode: "AUTO_REVEAL" },
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
        revealPolicy: { mode: "PLAYER_ACTION" },
      },
    ]),
    fallbackNodeId: null,
    nodeMetaJson: null,
  },
  {
    id: RULE_RUNTIME_SMOKE_START_NODE_ID,
    scenarioId: RULE_RUNTIME_SMOKE_SCENARIO_ID,
    nodeType: "story",
    title: "휴식 런타임 확인",
    sceneText:
      "원정대는 폐허 입구에서 짧은 휴식을 취할 수 있습니다. short/long rest 자원 회복과 until_rest 상태 제거를 확인하세요.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [],
      vttMap: createRuleRuntimeSmokeMap(RULE_RUNTIME_SMOKE_START_NODE_ID),
    }),
    transitionsJson: JSON.stringify([
      { condition: "default", nextNodeId: RULE_RUNTIME_TRAP_NODE_ID },
    ]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: RULE_RUNTIME_TRAP_NODE_ID,
    nodeMetaJson: JSON.stringify({
      smokeTest: {
        gmModes: ["AI", "HUMAN"],
        suggestedCommands: ["/rest short", "/rest long", "/cast cure_wounds token_node_rule_smoke_rest_actor 5 2"],
        verifies: ["rest-resolution", "condition-until-rest-expiry", "spell-healing"],
      },
    }),
  },
  {
    id: RULE_RUNTIME_TRAP_NODE_ID,
    scenarioId: RULE_RUNTIME_SMOKE_SCENARIO_ID,
    nodeType: "exploration",
    title: "함정과 내성 확인",
    sceneText:
      "금 간 바닥판 아래에서 독침 장치가 튀어나옵니다. Dex/Con 내성, 피해 반감, 상태 적용을 확인하세요.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        {
          id: "rule_smoke_detect_trap",
          type: "skill_check",
          label: "함정 구조 파악",
          skill: "investigation",
          dc: 13,
        },
      ],
      vttMap: createRuleRuntimeSmokeMap(RULE_RUNTIME_TRAP_NODE_ID),
    }),
    transitionsJson: JSON.stringify([
      { condition: "default", nextNodeId: RULE_RUNTIME_COVER_NODE_ID },
    ]),
    cluesJson: JSON.stringify([
      {
        id: "clue_rule_smoke_trap",
        title: "독침 장치",
        text: "독침 장치는 Con 내성 실패 시 poisoned 상태를 부여합니다.",
        handoutText: "독침 장치: Con save, poison damage, poisoned condition.",
        revealPolicy: { mode: "AUTO_REVEAL" },
      },
    ]),
    fallbackNodeId: RULE_RUNTIME_COVER_NODE_ID,
    nodeMetaJson: JSON.stringify({
      smokeTest: {
        gmModes: ["AI", "HUMAN"],
        verifies: ["saving-throw", "condition-runtime", "terrain-poison-cloud"],
        suggestedCommands: [
          "/check investigation 13",
          "/condition add token_node_rule_smoke_trap_save_goblin poisoned",
        ],
      },
    }),
  },
  {
    id: RULE_RUNTIME_COVER_NODE_ID,
    scenarioId: RULE_RUNTIME_SMOKE_SCENARIO_ID,
    nodeType: "combat",
    title: "엄폐 전투 확인",
    sceneText:
      "고블린이 상자 뒤에 몸을 낮춥니다. 원거리 공격 엄폐, 자동 몬스터 행동, 지형 효과를 확인하세요.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        {
          id: "rule_smoke_break_cover",
          type: "skill_check",
          label: "상자 밀어내기",
          skill: "athletics",
          dc: 12,
        },
      ],
      vttMap: createRuleRuntimeSmokeMap(RULE_RUNTIME_COVER_NODE_ID),
    }),
    transitionsJson: JSON.stringify([
      { condition: "default", nextNodeId: RULE_RUNTIME_AOE_NODE_ID },
    ]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: RULE_RUNTIME_AOE_NODE_ID,
    nodeMetaJson: JSON.stringify({
      smokeTest: {
        gmModes: ["AI", "HUMAN"],
        verifies: ["cover-position", "monster-ability", "terrain-effect"],
        suggestedCommands: ["/attack token_node_rule_smoke_cover_combat_goblin"],
      },
    }),
  },
  {
    id: RULE_RUNTIME_AOE_NODE_ID,
    scenarioId: RULE_RUNTIME_SMOKE_SCENARIO_ID,
    nodeType: "combat",
    title: "광역 주문 확인",
    sceneText:
      "적들이 좁은 통로에 몰려 있습니다. Fireball의 대상별 Dex save, 피해 반감, 업캐스팅을 확인하세요.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [],
      vttMap: createRuleRuntimeSmokeMap(RULE_RUNTIME_AOE_NODE_ID),
    }),
    transitionsJson: JSON.stringify([
      { condition: "default", nextNodeId: RULE_RUNTIME_CONDITION_NODE_ID },
    ]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: RULE_RUNTIME_CONDITION_NODE_ID,
    nodeMetaJson: JSON.stringify({
      smokeTest: {
        gmModes: ["AI", "HUMAN"],
        verifies: ["aoe-targeting", "aoe-damage", "spell-scaling"],
        suggestedCommands: [
          "/cast_area fireball 15 token_node_rule_smoke_aoe_goblin,token_node_rule_smoke_aoe_rat 4",
        ],
        apiActions: [
          {
            kind: "cast_burning_hands",
            method: "POST",
            endpoint: "/sessions/:sessionId/combat/spells/cast",
            payload: {
              spellId: "spell.burning_hands",
              slotLevel: 1,
              point: { x: 256, y: 192 },
            },
            expects: ["area:cone", "saving_throw:dex", "half_damage_on_success"],
          },
          {
            kind: "cast_thunderwave",
            method: "POST",
            endpoint: "/sessions/:sessionId/combat/spells/cast",
            payload: {
              spellId: "spell.thunderwave",
              slotLevel: 1,
              point: { x: 256, y: 192 },
            },
            expects: ["area:cube", "saving_throw:con", "forced_movement:push:10"],
          },
          {
            kind: "cast_entangle",
            method: "POST",
            endpoint: "/sessions/:sessionId/combat/spells/cast",
            payload: {
              spellId: "spell.entangle",
              slotLevel: 1,
              point: { x: 256, y: 192 },
            },
            expects: [
              "terrain:terrain.difficult",
              "condition.restrained",
              "concentration-linked-cleanup",
            ],
          },
        ],
      },
    }),
  },
  {
    id: RULE_RUNTIME_CONDITION_NODE_ID,
    scenarioId: RULE_RUNTIME_SMOKE_SCENARIO_ID,
    nodeType: "combat",
    title: "상태와 집중 확인",
    sceneText:
      "마법진이 흔들리며 집중이 끊길 위험이 생깁니다. condition duration, save ends, concentration damage check를 확인하세요.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        {
          id: "rule_smoke_hold_focus",
          type: "skill_check",
          label: "정신 집중 유지",
          skill: "constitution",
          dc: 10,
        },
      ],
      vttMap: createRuleRuntimeSmokeMap(RULE_RUNTIME_CONDITION_NODE_ID),
    }),
    transitionsJson: JSON.stringify([
      { condition: "default", nextNodeId: RULE_RUNTIME_HUMAN_GM_NODE_ID },
    ]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: RULE_RUNTIME_HUMAN_GM_NODE_ID,
    nodeMetaJson: JSON.stringify({
      smokeTest: {
        gmModes: ["AI", "HUMAN"],
        verifies: [
          "condition-lifecycle",
          "concentration-runtime",
          "forced-movement",
          "ready-action-trigger",
          "spell-condition-rider",
          "monster-save-condition-rider",
        ],
        suggestedCommands: [
          "/condition add token_node_rule_smoke_condition_goblin stunned",
          "/cast ray_of_frost token_node_rule_smoke_condition_goblin 60",
          "/cast detect_magic",
          "/item pickup object_node_rule_smoke_condition_rope equipment.rope__hempen__50_feet 1 3 4",
          "/item drop entry-smoke-dagger 1 3 4",
          "/item throw entry-smoke-dagger 1 4 4",
        ],
        apiActions: [
          {
            kind: "cast_bless",
            method: "POST",
            endpoint: "/sessions/:sessionId/combat/spells/cast",
            payload: {
              spellId: "spell.bless",
              slotLevel: 1,
              targetParticipantIds: ["combat:node_rule_smoke_condition:actor"],
            },
            expects: ["attack_roll:+1d4", "saving_throw:+1d4", "concentration"],
          },
          {
            kind: "cast_bane",
            method: "POST",
            endpoint: "/sessions/:sessionId/combat/spells/cast",
            payload: {
              spellId: "spell.bane",
              slotLevel: 1,
              targetParticipantIds: ["combat:node_rule_smoke_condition:goblin"],
            },
            expects: ["saving_throw:cha", "attack_roll:-1d4", "saving_throw:-1d4"],
          },
          {
            kind: "cast_detect_magic",
            method: "POST",
            endpoint: "/sessions/:sessionId/combat/spells/cast",
            payload: {
              spellId: "spell.detect_magic",
              slotLevel: 1,
            },
            expects: ["detect:magic:30", "concentration", "private-content-not-revealed"],
          },
          {
            kind: "force_move",
            method: "POST",
            endpoint: "/sessions/:sessionId/combat/force-move",
            payload: {
              participantId: "combat:node_rule_smoke_condition:goblin",
              mode: "push",
              origin: { x: 128, y: 256 },
              distanceFt: 10,
            },
            expects: ["forced_movement", "terrain_effect", "ready_action_prompt"],
          },
          {
            kind: "monster_actor_action",
            method: "POST",
            endpoint: "/sessions/:sessionId/combat/actor-action",
            payload: {
              actionType: "attack",
              actionId: "action.bite",
              targetParticipantId: "combat:node_rule_smoke_condition:actor",
              autoEndTurn: false,
            },
            actorParticipantId: "combat:node_rule_smoke_condition:spider",
            expects: ["saving_throw:con:dc11", "condition.poisoned", "combat_snapshot_refresh"],
          },
        ],
      },
    }),
  },
  {
    id: RULE_RUNTIME_HUMAN_GM_NODE_ID,
    scenarioId: RULE_RUNTIME_SMOKE_SCENARIO_ID,
    nodeType: "story",
    title: "사람 GM 개입 확인",
    sceneText:
      "마지막 방에서는 사람이 GM override로 장면 설명, handout 공개, HP/상태 조정을 기록합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [],
      vttMap: createRuleRuntimeSmokeMap(RULE_RUNTIME_HUMAN_GM_NODE_ID),
    }),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([
      {
        id: "clue_rule_smoke_gm_override",
        title: "GM 개입 기록",
        text: "이 handout은 사람 GM 공개와 TurnLog/StateDiff 기록을 확인하기 위한 항목입니다.",
        handoutText: "HUMAN GM override smoke handout.",
        revealPolicy: { mode: "PLAYER_ACTION" },
      },
    ]),
    fallbackNodeId: null,
    nodeMetaJson: JSON.stringify({
      smokeTest: {
        gmModes: ["AI", "HUMAN"],
        verifies: ["human-gm-override", "turn-log", "state-diff", "ai-assist-accept"],
        manualActions: [
          {
            kind: "scene_text",
            publicNarration: "GM override smoke: the final chamber description is recorded.",
          },
          {
            kind: "reveal_handout",
            targetId: "clue_rule_smoke_gm_override",
            publicNarration: "GM override smoke: reveal the HUMAN GM handout.",
            statePatch: {
              contentId: "clue_rule_smoke_gm_override",
              contentKind: "clue",
              scope: "party",
              recipientId: null,
            },
          },
          {
            kind: "adjust_hp",
            targetId: "token_node_rule_smoke_human_gm_goblin",
            publicNarration: "GM override smoke: adjust a visible target HP total.",
            statePatch: {
              targetType: "combatParticipant",
              currentHp: 3,
            },
          },
          {
            kind: "ai_assist_accept",
            publicNarration: "GM override smoke: accept an AI assist suggestion as the HUMAN GM.",
            metadata: {
              assistType: "scene_text",
              suggestionId: "rule-smoke-ai-assist",
            },
          },
        ],
      },
    }),
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
        revealPolicy: { mode: "AUTO_REVEAL" },
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
        revealPolicy: { mode: "AUTO_REVEAL" },
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
        revealPolicy: { mode: "AUTO_REVEAL" },
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
  {
    id: P1_ONESHOT_START_NODE_ID,
    scenarioId: P1_ONESHOT_SCENARIO_ID,
    nodeType: "story",
    title: "종소리가 사라진 마을",
    sceneText:
      "해 질 녘, 시장 광장에 금 간 청동 종이 실려 옵니다. 종은 아무도 치지 않았는데 낮게 울리고, 근처 아이들은 잿빛 꿈을 꾸었다고 말합니다. 의뢰인은 종소리의 근원인 잿불 폐허를 조사해 달라고 부탁합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p1_hook_history", type: "skill_check", label: "폐허 전승 떠올리기", skill: "history", dc: 12 },
        { id: "p1_hook_arcana", type: "skill_check", label: "종의 마력 진동 읽기", skill: "arcana", dc: 13 },
      ],
      vttMap: null,
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P1_ONESHOT_MARKET_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p1_hook",
        title: "잿불 폐허",
        text: "폐허 아래에는 오래된 소환 종이 있고, 불꽃 숨결을 가진 작은 용이 그 소리에 이끌린다는 전승이 있습니다.",
        handoutText: "잿불 폐허: 소환 종, 작은 용, 불꽃 숨결.",
        revealPolicy: { mode: "AUTO_REVEAL" },
      },
    ]),
    fallbackNodeId: P1_ONESHOT_MARKET_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p1Scenario: {
        expectedDurationMinutes: [30, 45],
        recommendedLevel: 3,
        usefulClasses: ["cleric", "fighter", "rogue", "wizard", "ranger", "bard"],
        usefulSpells: ["spell.detect_magic", "spell.bless", "spell.healing_word", "spell.web", "spell.misty_step"],
      },
    }),
  },
  {
    id: P1_ONESHOT_MARKET_NODE_ID,
    scenarioId: P1_ONESHOT_SCENARIO_ID,
    nodeType: "exploration",
    title: "금 간 종의 단서",
    sceneText:
      "광장에는 불안한 주민들과 종을 실은 수레가 남아 있습니다. 종 표면에는 용 발톱 모양의 그을음과 거미줄 같은 은빛 실금이 엉켜 있습니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p1_market_investigation", type: "skill_check", label: "종 표면 조사", skill: "investigation", dc: 12 },
        { id: "p1_market_persuasion", type: "skill_check", label: "목격자 안심시키기", skill: "persuasion", dc: 11 },
        { id: "p1_market_survival", type: "skill_check", label: "폐허로 이어지는 흔적 찾기", skill: "survival", dc: 12 },
      ],
      vttMap: createP1OneshotMap(P1_ONESHOT_MARKET_NODE_ID, "market"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P1_ONESHOT_AMBUSH_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p1_bell_resonance",
        title: "종의 공명",
        text: "Detect Magic 또는 Arcana 판정으로 종이 폐허 안쪽의 더 큰 종과 공명한다는 사실을 알 수 있습니다.",
        handoutText: "작은 종은 폐허의 본체와 공명합니다. 본체를 멈추면 울림도 멎습니다.",
        revealPolicy: { mode: "PLAYER_ACTION" },
      },
    ]),
    fallbackNodeId: P1_ONESHOT_AMBUSH_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p1Scenario: {
        verifies: ["exploration-checks", "object-reveal", "spell.detect_magic"],
        gmAdvice: "실패해도 폐허 위치는 알려주고, 성공하면 보스방 종 약점을 미리 암시하세요.",
      },
    }),
  },
  {
    id: P1_ONESHOT_AMBUSH_NODE_ID,
    scenarioId: P1_ONESHOT_SCENARIO_ID,
    nodeType: "combat",
    title: "무너진 회랑의 매복",
    sceneText:
      "폐허 입구 회랑에서 잿불 표식을 한 오크가 길을 막고, 무너진 벽 뒤의 스켈레톤이 활을 겨눕니다. 검게 그을린 늑대가 낮게 으르렁거리며 달려듭니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p1_ambush_perception", type: "skill_check", label: "매복 눈치채기", skill: "perception", dc: 13 },
        { id: "p1_ambush_athletics", type: "skill_check", label: "잔해를 넘어 유리한 위치 잡기", skill: "athletics", dc: 12 },
      ],
      vttMap: createP1OneshotMap(P1_ONESHOT_AMBUSH_NODE_ID, "ambush"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P1_ONESHOT_REST_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p1_orc_brand",
        title: "잿불 표식",
        text: "오크의 목걸이는 광신도가 만든 부적입니다. 보스방의 종과 같은 문양이 새겨져 있습니다.",
        handoutText: "잿불 표식: 광신도와 종의 연결고리.",
        revealPolicy: { mode: "AUTO_REVEAL" },
      },
    ]),
    fallbackNodeId: P1_ONESHOT_REST_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p1Scenario: {
        monsters: ["monster.orc", "monster.skeleton", "monster.wolf"],
        usefulSpells: ["spell.bless", "spell.command", "spell.guiding_bolt", "spell.healing_word"],
        verifies: ["monster-actions", "save-rider-prone", "cover-and-difficult-terrain"],
      },
    }),
  },
  {
    id: P1_ONESHOT_REST_NODE_ID,
    scenarioId: P1_ONESHOT_SCENARIO_ID,
    nodeType: "exploration",
    title: "꺼져가는 화로",
    sceneText:
      "회랑 너머 작은 제단방에는 꺼져가는 화로가 있습니다. 이곳은 잠시 숨을 고르기에 안전해 보입니다. 재 속에는 아직 따뜻한 청동 조각이 남아 있습니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p1_rest_medicine", type: "skill_check", label: "부상자 돌보기", skill: "medicine", dc: 11 },
        { id: "p1_rest_religion", type: "skill_check", label: "제단의 의미 해석", skill: "religion", dc: 13 },
      ],
      vttMap: createP1OneshotMap(P1_ONESHOT_REST_NODE_ID, "rest"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P1_ONESHOT_BOSS_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p1_short_rest",
        title: "짧은 휴식 기회",
        text: "파티는 여기서 short rest를 취할 수 있습니다. Fighter, Warlock, Monk, Wizard 자원 회복을 확인하기 좋습니다.",
        handoutText: "안전한 제단방: 짧은 휴식 가능.",
        revealPolicy: { mode: "AUTO_REVEAL" },
      },
    ]),
    fallbackNodeId: P1_ONESHOT_BOSS_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p1Scenario: {
        suggestedPlayerActions: ["짧은 휴식", "치유 주문 사용", "준비 주문 재확인"],
        verifies: ["short-rest", "class-resource-recovery", "inventory-pickup"],
      },
    }),
  },
  {
    id: P1_ONESHOT_BOSS_NODE_ID,
    scenarioId: P1_ONESHOT_SCENARIO_ID,
    nodeType: "combat",
    title: "잿불 종의 방",
    sceneText:
      "거대한 금 간 종 아래에서 작은 드래곤이 불씨를 토해냅니다. 광신도가 종을 울리며 주문을 외우고, 거대 거미가 은빛 줄을 늘어뜨려 퇴로를 막습니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p1_boss_religion", type: "skill_check", label: "종 의식 방해", skill: "religion", dc: 14 },
        { id: "p1_boss_acrobatics", type: "skill_check", label: "거미줄 사이로 이동", skill: "acrobatics", dc: 13 },
        { id: "p1_boss_arcana", type: "skill_check", label: "숨결 재충전 징후 읽기", skill: "arcana", dc: 14 },
      ],
      vttMap: createP1OneshotMap(P1_ONESHOT_BOSS_NODE_ID, "boss"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P1_ONESHOT_END_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p1_bell_weakness",
        title: "종의 약점",
        text: "종을 침묵시키면 적색 드래곤 새끼의 불꽃 숨결 재충전이 불안정해집니다. HUMAN GM은 이 단서를 이용해 난이도를 낮출 수 있습니다.",
        handoutText: "종 약점: 의식 방해 성공 시 보스전 압박 완화.",
        gmNotes: "HUMAN GM이라면 성공 판정 후 적색 드래곤 새끼의 fire_breath 사용을 한 라운드 미루거나 cultist를 후퇴시켜도 됩니다.",
        revealPolicy: { mode: "PLAYER_ACTION" },
      },
    ]),
    fallbackNodeId: P1_ONESHOT_END_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p1Scenario: {
        monsters: ["monster.red_dragon_wyrmling", "monster.cultist", "monster.giant_spider"],
        usefulSpells: ["spell.web", "spell.hold_person", "spell.scorching_ray", "spell.dispel_magic", "spell.misty_step"],
        verifies: ["recharge", "web-restrained", "spell-control", "human-gm-override", "ai-gm-fallback"],
      },
    }),
  },
  {
    id: P1_ONESHOT_END_NODE_ID,
    scenarioId: P1_ONESHOT_SCENARIO_ID,
    nodeType: "story",
    title: "종이 멎은 뒤",
    sceneText:
      "잿불 종이 갈라지며 마지막 울림을 토합니다. 폐허의 열기는 식고, 마을로 돌아가는 길 위로 새벽빛이 번집니다. 의뢰인은 파티에게 감사하며 작은 청동 종 조각을 보상으로 건넵니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p1_reward",
        title: "청동 종 조각",
        text: "보상: 청동 종 조각과 마을의 감사. 다음 모험에서 마법 감지나 협상 단서로 사용할 수 있습니다.",
        handoutText: "보상: 청동 종 조각.",
        revealPolicy: { mode: "AUTO_REVEAL" },
      },
    ]),
    fallbackNodeId: null,
    nodeMetaJson: JSON.stringify({
      p1Scenario: {
        ending: true,
        verifies: ["scenario-completion", "reward-handout"],
      },
    }),
  },
  {
    id: P2_VALIDATION_START_NODE_ID,
    scenarioId: P2_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "폭풍이 멎지 않는 항구",
    sceneText:
      "항구 위 폐금고에서 붉은 용의 그림자가 날아오르고 있습니다. 파티는 5레벨 능력을 정비한 뒤 절벽 승강장, 유물 회랑, 금고 심장부를 차례로 돌파해야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p2_hook_arcana", type: "skill_check", label: "폭풍 장치 분석", skill: "arcana", dc: 14 },
        { id: "p2_hook_history", type: "skill_check", label: "폐금고 구조 기억", skill: "history", dc: 13 },
      ],
      vttMap: null,
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P2_APPROACH_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p2_briefing",
        title: "금고 공략",
        text: "비행과 고저차, 지속 지역 효과, 오브젝트 파괴가 모두 유용합니다. 3레벨 주문과 Extra Attack을 적극적으로 사용하세요.",
        handoutText: "5레벨 능력과 3레벨 주문을 준비하십시오.",
        revealPolicy: { mode: "AUTO_REVEAL" },
      },
    ]),
    fallbackNodeId: P2_APPROACH_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "AI/HUMAN GM 공통 검증 시작점입니다. 종족 저항과 5레벨 자원을 확인한 뒤 이동하세요.",
      ruleRefs: {
        spellIds: ["spell.fly", "spell.haste", "spell.counterspell"],
        conditionIds: ["condition.charmed"],
        terrainEffectIds: ["terrain.elevation"],
      },
    }),
  },
  {
    id: P2_APPROACH_NODE_ID,
    scenarioId: P2_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "절벽 승강장의 노래",
    sceneText:
      "미끄러운 승강장 위에서 하피가 정신을 홀리고, 가고일이 높은 난간을 지킵니다. 윈치를 부수거나 철문을 열어 고지대로 진입할 수 있습니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p2_approach_athletics", type: "skill_check", label: "윈치 강제 작동", skill: "athletics", dc: 14 },
        { id: "p2_approach_perception", type: "skill_check", label: "하피 노래의 근원 파악", skill: "perception", dc: 14 },
      ],
      vttMap: createP2ValidationMap(P2_APPROACH_NODE_ID, "approach"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P2_GALLERY_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P2_GALLERY_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "Fly 또는 원거리 공격, charm 저항, 고도 엄폐, slippery terrain, 문/오브젝트 파괴를 확인합니다.",
      ruleRefs: {
        spellIds: ["spell.fly", "spell.lightning_bolt"],
        conditionIds: ["condition.charmed"],
        terrainEffectIds: ["terrain.elevation", "terrain.slippery"],
      },
    }),
  },
  {
    id: P2_GALLERY_NODE_ID,
    scenarioId: P2_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "삼켜지는 유물 회랑",
    sceneText:
      "독 안개와 짙은 시야 방해 사이에 보관함이 놓여 있습니다. 상자로 위장한 미믹과 회랑을 가득 메운 젤라틴 큐브를 상대하면서 보관함을 조사해야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p2_gallery_investigation", type: "skill_check", label: "보관함 조사", skill: "investigation", dc: 14 },
        { id: "p2_gallery_survival", type: "skill_check", label: "독 안개 안전 경로", skill: "survival", dc: 14 },
      ],
      vttMap: createP2ValidationMap(P2_GALLERY_NODE_ID, "gallery"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P2_VAULT_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p2_vault_key",
        title: "폭풍 금고 열쇠",
        text: "보관함 안쪽 문양은 심장부 제어 구체를 용의 숨결 반대편으로 옮기라고 지시합니다.",
        handoutText: "제어 구체를 용의 숨결 반대편으로 옮기십시오.",
        revealPolicy: { mode: "PLAYER_ACTION" },
      },
    ]),
    fallbackNodeId: P2_VAULT_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "컨테이너 조사, 숨은 아이템 이동, poison cloud, obscurement, grapple/restrain과 지속 피해를 확인합니다.",
      ruleRefs: {
        spellIds: ["spell.lesser_restoration", "spell.moonbeam", "spell.invisibility"],
        conditionIds: ["condition.grappled", "condition.restrained"],
        terrainEffectIds: ["terrain.poison_cloud", "terrain.obscurement"],
      },
    }),
  },
  {
    id: P2_VAULT_NODE_ID,
    scenarioId: P2_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "금고 심장부의 붉은 날개",
    sceneText:
      "어린 레드 드래곤이 높은 단상에서 불꽃 숨결을 준비하고, 거대 전갈이 아래 통로를 봉쇄합니다. 제어 구체를 옮기거나 던지고, 기둥을 부수며 지속 지역 주문으로 전장을 나누십시오.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p2_vault_arcana", type: "skill_check", label: "제어 구체 활성화", skill: "arcana", dc: 15 },
        { id: "p2_vault_athletics", type: "skill_check", label: "지지 기둥 붕괴", skill: "athletics", dc: 16 },
      ],
      vttMap: createP2ValidationMap(P2_VAULT_NODE_ID, "vault"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P2_END_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P2_END_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "Young Red Dragon 비행/재충전 AoE, Giant Scorpion multiattack/grapple/poison, Extra Attack, 3레벨 주문을 확인합니다.",
      ruleRefs: {
        spellIds: ["spell.haste", "spell.lightning_bolt", "spell.moonbeam", "spell.fly", "spell.revivify"],
        conditionIds: ["condition.grappled", "condition.poisoned"],
        terrainEffectIds: ["terrain.burning", "terrain.elevation", "terrain.difficult"],
      },
    }),
  },
  {
    id: P2_END_NODE_ID,
    scenarioId: P2_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "폭풍 너머의 새벽",
    sceneText:
      "제어 구체가 안정되며 금고 위 폭풍이 갈라집니다. 항구에는 새벽빛이 돌아오고 파티는 5레벨 원정의 전리품과 함께 귀환합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: null,
    nodeMetaJson: JSON.stringify({
      isEndingNode: true,
      endBehavior: "SESSION_COMPLETE",
      gmNotes: "완주, 재접속 상태 복원, 공개/비공개 정보 분리를 마지막으로 확인합니다.",
    }),
  },
  {
    id: P3_VALIDATION_START_NODE_ID,
    scenarioId: P3_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "번개가 기록을 삼키는 밤",
    sceneText:
      "하늘파괴자의 기록고가 구름 위로 떠오르며 도시 위에 푸른 번개를 끌어모읍니다. 파티는 8레벨 능력, 4레벨 주문, 조율 아이템을 정비하고 기록고의 draft와 발행 revision이 분리되는지 검증해야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p3_hook_arcana", type: "skill_check", label: "번개 결계 해석", skill: "arcana", dc: 16 },
        { id: "p3_hook_history", type: "skill_check", label: "하늘파괴자 기록 조사", skill: "history", dc: 15 },
      ],
      vttMap: null,
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P3_ARCHIVE_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p3_briefing",
        title: "P3 검증 지시",
        text: "4레벨 주문, P3 마법 아이템, 비행/벽/지속 지역, 8레벨 직업 기능을 모두 사용해 보십시오.",
        handoutText: "권장 레벨 8. 주문 10개 이상, P3 몬스터 8종 이상, 아이템 6종 이상을 의도적으로 검증하십시오.",
        revealPolicy: { mode: "AUTO_REVEAL" },
      },
    ]),
    fallbackNodeId: P3_ARCHIVE_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "AI/HUMAN GM 양쪽에서 시작 자원, 8레벨 ASI, 4레벨 슬롯, 아이템 조율 상태를 확인합니다.",
      ruleRefs: {
        spellIds: ["spell.dimension_door", "spell.death_ward", "spell.freedom_of_movement", "spell.locate_creature"],
        itemIds: ["magic_item.cloak_of_protection", "magic_item.ring_of_protection", "magic_item.potion_of_flying"],
      },
    }),
  },
  {
    id: P3_ARCHIVE_NODE_ID,
    scenarioId: P3_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "살아 있는 색인 서가",
    sceneText:
      "끝없는 서가가 스스로 이동하며 길을 바꿉니다. 마법사와 사제가 색인대 뒤에 숨어 주문을 준비하고, 파티는 숨겨진 wand와 회복 물자를 찾아야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p3_archive_investigation", type: "skill_check", label: "색인대 조사", skill: "investigation", dc: 15 },
        { id: "p3_archive_arcana", type: "skill_check", label: "움직이는 서가 정지", skill: "arcana", dc: 16 },
      ],
      vttMap: createP3ValidationMap(P3_ARCHIVE_NODE_ID, "archive"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P3_AVIARY_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p3_revision_index",
        title: "Revision Index",
        text: "발행 revision 1의 색인에는 '푸른 눈은 북쪽 단상에 있다'고 적혀 있습니다. revision 2에서 문구를 바꿔 snapshot 격리를 검증하십시오.",
        handoutText: "revision 1 세션의 색인 문구가 draft 수정 후에도 유지되어야 합니다.",
        revealPolicy: { mode: "PLAYER_ACTION" },
      },
    ]),
    fallbackNodeId: P3_AVIARY_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "Mage/Priest 주문사용, Web wand, 조사/아이템 획득, obscurement/difficult terrain을 확인합니다.",
      ruleRefs: {
        spellIds: ["spell.web", "spell.blight", "spell.slow", "spell.protection_from_energy"],
        monsterIds: ["monster.mage", "monster.priest"],
        itemIds: ["magic_item.wand_of_web", "equipment.potion_of_healing"],
      },
    }),
  },
  {
    id: P3_AVIARY_NODE_ID,
    scenarioId: P3_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "구름 새장의 사냥꾼들",
    sceneText:
      "와이번, 맨티코어, 거대 독수리가 열린 하늘 우리에서 급강하합니다. 비행, 원거리, 고도, Dimension Door, Ice Storm, Potion of Flying을 실전에서 확인하십시오.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p3_aviary_athletics", type: "skill_check", label: "발리스타 고정", skill: "athletics", dc: 16 },
        { id: "p3_aviary_perception", type: "skill_check", label: "급강하 경로 예측", skill: "perception", dc: 15 },
      ],
      vttMap: createP3ValidationMap(P3_AVIARY_NODE_ID, "aviary"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P3_FOUNDRY_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P3_FOUNDRY_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "P3 비행 몬스터 3종, 비행 이동, 고도 지형, 4레벨/광역 주문, 소모품 사용을 확인합니다.",
      ruleRefs: {
        spellIds: ["spell.dimension_door", "spell.ice_storm", "spell.call_lightning", "spell.gaseous_form"],
        monsterIds: ["monster.wyvern", "monster.manticore", "monster.giant_eagle"],
        itemIds: ["magic_item.potion_of_flying", "equipment.화살"],
      },
    }),
  },
  {
    id: P3_FOUNDRY_NODE_ID,
    scenarioId: P3_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "유리와 용광로의 심장",
    sceneText:
      "기록고의 동력실은 불타는 벽과 냉각수 정령, 룬 트롤, 유리 바실리스크가 뒤엉킨 위험 구역입니다. 용광로 심장을 부수거나 장치를 끄고 마법 아이템을 회수하십시오.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p3_foundry_arcana", type: "skill_check", label: "용광로 심장 정지", skill: "arcana", dc: 17 },
        { id: "p3_foundry_athletics", type: "skill_check", label: "냉각 밸브 강제 개방", skill: "athletics", dc: 16 },
      ],
      vttMap: createP3ValidationMap(P3_FOUNDRY_NODE_ID, "foundry"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P3_BOSS_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p3_forge_core",
        title: "번개 심장 약점",
        text: "푸른 눈의 보스는 Wall of Fire를 끊고 Freedom of Movement를 유지하면 접근이 쉬워집니다.",
        handoutText: "지속 지역과 이동 제한을 해제해 최종 단상에 접근하십시오.",
        revealPolicy: { mode: "PLAYER_ACTION" },
      },
    ]),
    fallbackNodeId: P3_BOSS_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "Troll 재생, Basilisk petrify, Water Elemental control, Wall of Fire, Wand of Fireballs, Rope of Climbing을 확인합니다.",
      ruleRefs: {
        spellIds: ["spell.wall_of_fire", "spell.freedom_of_movement", "spell.flaming_sphere", "spell.heat_metal"],
        monsterIds: ["monster.troll", "monster.basilisk", "monster.water_elemental"],
        itemIds: ["magic_item.wand_of_fireballs", "magic_item.rope_of_climbing"],
      },
    }),
  },
  {
    id: P3_BOSS_NODE_ID,
    scenarioId: P3_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "푸른 눈의 최종 revision",
    sceneText:
      "어린 블루 드래곤이 기록고의 최종 revision crystal 위에서 번개 숨결을 모읍니다. 스톤 골렘이 단상을 지키고, 파티는 Necklace of Fireballs와 4레벨 주문으로 전장을 나눠야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p3_boss_arcana", type: "skill_check", label: "Revision Crystal 안정화", skill: "arcana", dc: 18 },
        { id: "p3_boss_religion", type: "skill_check", label: "죽음 방호 의식 유지", skill: "religion", dc: 16 },
      ],
      vttMap: createP3ValidationMap(P3_BOSS_NODE_ID, "boss"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P3_END_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P3_END_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "Young Blue Dragon 보스 행동, Stone Golem 둔화, 8레벨 class feature, Death Ward, Fireball item, snapshot 문구 격리를 확인합니다.",
      ruleRefs: {
        spellIds: ["spell.death_ward", "spell.phantasmal_killer", "spell.blight", "spell.dimension_door", "spell.ice_storm"],
        monsterIds: ["monster.young_blue_dragon", "monster.stone_golem"],
        itemIds: ["magic_item.necklace_of_fireballs", "magic_item.cloak_of_protection"],
      },
    }),
  },
  {
    id: P3_END_NODE_ID,
    scenarioId: P3_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "고정된 발행본의 새벽",
    sceneText:
      "Revision Crystal이 안정되며 기록고는 도시 위에서 멈춥니다. draft를 수정하고 revision 2를 발행한 뒤에도 이 세션의 revision 1 문구와 노드 snapshot이 바뀌지 않는지 확인하십시오.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: null,
    nodeMetaJson: JSON.stringify({
      isEndingNode: true,
      endBehavior: "SESSION_COMPLETE",
      gmNotes: "AI GM/HUMAN GM 완주, 재접속 복원, revision 2 발행 후 revision 1 세션 불변성을 최종 확인합니다.",
      p3Scenario: {
        validatesRevisionSnapshot: true,
        expectedDurationMinutes: [90, 120],
      },
    }),
  },
  {
    id: P4_VALIDATION_START_NODE_ID,
    scenarioId: P4_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "폭풍왕관 계승 의뢰",
    sceneText:
      "12레벨 원정대는 하늘파괴자 기록고에서 발견한 왕관 조각을 들고 폭풍왕관의 계승식을 막기 위해 소집됩니다. GM은 시작 전에 8레벨 캐릭터를 12레벨로 성장시키거나 12레벨 캐릭터를 생성해 P4 성장 스냅샷을 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p4_hook_history", type: "skill_check", label: "왕관 계승사 확인", skill: "history", dc: 16 },
        { id: "p4_hook_arcana", type: "skill_check", label: "폭풍왕관 마법 분석", skill: "arcana", dc: 17 },
      ],
      vttMap: null,
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P4_SHOP_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p4_campaign_brief",
        title: "P4 검증 지시",
        text: "12레벨 성장, 5~6레벨 주문, P4 몬스터 12종 이상, 경제 기능 5종 이상, 협업 review/publish/revision 격리를 순서대로 확인하십시오.",
        handoutText: "권장 레벨 12. AI GM과 HUMAN GM 모두 주요 경로 완주가 필요합니다.",
      },
    ]),
    fallbackNodeId: P4_SHOP_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "P4 검증 캠페인 시작. 8→12 레벨업 preview, ASI, 5~6레벨 슬롯, 자원 회복을 먼저 확인합니다.",
      p4Scenario: {
        expectedDurationMinutes: [180, 240],
        gmModes: ["AI", "HUMAN"],
        verifies: ["level-12-progression", "asi-12", "slot-level-5-6", "resource-snapshot"],
        requiredUserChecks: ["test:p4-regression", "test:e2e", "build"],
      },
    }),
  },
  {
    id: P4_SHOP_NODE_ID,
    scenarioId: P4_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "왕관시장과 공동 보관함",
    sceneText:
      "왕관시장에는 대마법사 중개인과 파티 공동 보관함이 있습니다. 치유 물약 구매, 보석 판매, 미확인 반지 감정·조율, 마법봉 충전 회복, 찌그러진 방패 수리를 수행해 경제 감사 로그를 남깁니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p4_shop_persuasion", type: "skill_check", label: "상점 가격 협상", skill: "persuasion", dc: 16 },
        { id: "p4_shop_insight", type: "skill_check", label: "저주받은 물건 식별", skill: "insight", dc: 15 },
      ],
      vttMap: createP4ValidationMap(P4_SHOP_NODE_ID, "market"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P4_EXPLORATION_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p4_market_economy",
        title: "경제 검증 장부",
        text: "상점 구매·판매, party stash 분배, 감정, 조율, charge 회복, 수리, 보상 지급이 stateDiff와 TurnLog에 남아야 합니다.",
      },
    ]),
    fallbackNodeId: P4_EXPLORATION_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "경제 MVP 검증 노드. EconomyRuntimeService의 purchase/sell/identify/attune/recover charges/repair/reward/distribute 흐름을 UI 또는 API로 확인합니다.",
      p4Scenario: {
        gmModes: ["AI", "HUMAN"],
        verifies: ["shop_purchase", "shop_sale", "party_stash", "identify_item", "attune_item", "recover_item_charges", "repair_item"],
        economyActions: [
          { kind: "purchase", shopId: "shop-storm-crown", itemDefinitionId: "equipment.potion_of_healing", quantity: 2 },
          { kind: "sell", shopId: "shop-storm-crown", itemDefinitionId: "magic_item.necklace_of_fireballs", quantity: 1 },
          { kind: "identify", itemDefinitionId: "magic_item.ring_of_protection", costGp: 25 },
          { kind: "attune", itemDefinitionId: "magic_item.ring_of_protection" },
          { kind: "recover_charges", itemDefinitionId: "magic_item.wand_of_web", chargesRecovered: 4, maximumCharges: 7 },
          { kind: "repair", itemDefinitionId: "equipment.방패", costGp: 5 },
        ],
      },
    }),
  },
  {
    id: P4_EXPLORATION_NODE_ID,
    scenarioId: P4_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "차원 관측소",
    sceneText:
      "차원 관측소의 거울돔은 True Seeing, Scrying, Teleportation Circle, Find the Path 같은 P4 탐색 주문을 요구합니다. 메두사의 석화 시선과 위상 거미의 차원 이동도 함께 검증합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p4_observatory_arcana", type: "skill_check", label: "차원 좌표 해독", skill: "arcana", dc: 18 },
        { id: "p4_observatory_perception", type: "skill_check", label: "거울 시선 피하기", skill: "perception", dc: 16 },
      ],
      vttMap: createP4ValidationMap(P4_EXPLORATION_NODE_ID, "observatory"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P4_COMBAT_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p4_observatory_sigil",
        title: "계승식 전송진",
        text: "Teleportation Circle과 Word of Recall 검증에 사용할 sigil sequence입니다.",
      },
    ]),
    fallbackNodeId: P4_COMBAT_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "P4 탐색/정보 주문, 차원 이동, petrified lifecycle을 확인합니다.",
      p4Scenario: {
        gmModes: ["AI", "HUMAN"],
        verifies: ["p4_spells_exploration", "petrified_lifecycle", "teleport_map_transition"],
        usefulSpells: ["spell.true_seeing", "spell.scrying", "spell.teleportation_circle", "spell.find_the_path", "spell.greater_restoration"],
        monsterIds: ["monster.medusa", "monster.phase_spider", "monster.roper"],
      },
    }),
  },
  {
    id: P4_COMBAT_NODE_ID,
    scenarioId: P4_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "폭풍문 공성전",
    sceneText:
      "파이어 자이언트, 키메라, 공기 정령이 폭풍문을 지키고 있습니다. Cone of Cold, Chain Lightning, Wall of Force, Wall of Stone, Disintegrate, Heal 등을 전투 중 사용합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p4_siege_athletics", type: "skill_check", label: "무너진 왕관문 밀어내기", skill: "athletics", dc: 18 },
        { id: "p4_siege_arcana", type: "skill_check", label: "벽 주문 구조 분석", skill: "arcana", dc: 17 },
      ],
      vttMap: createP4ValidationMap(P4_COMBAT_NODE_ID, "siege"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P4_DOWNTIME_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P4_DOWNTIME_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "P4 전투 주문 10개 이상과 P4 몬스터 특수행동/recharge/terrain interaction을 확인합니다.",
      p4Scenario: {
        gmModes: ["AI", "HUMAN"],
        verifies: ["p4_spells_combat", "p4_monster_recharge", "terrain_lifecycle", "human_gm_monster_actions"],
        usefulSpells: [
          "spell.cone_of_cold",
          "spell.chain_lightning",
          "spell.wall_of_force",
          "spell.wall_of_stone",
          "spell.disintegrate",
          "spell.heal",
          "spell.sunbeam",
          "spell.cloudkill",
          "spell.mass_cure_wounds",
          "spell.hold_monster",
        ],
        monsterIds: ["monster.fire_giant", "monster.chimera", "monster.air_elemental"],
      },
    }),
  },
  {
    id: P4_DOWNTIME_NODE_ID,
    scenarioId: P4_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "폭풍 열쇠 제작과 재정비",
    sceneText:
      "전투 후 원정대는 제작대에서 폭풍 열쇠를 만듭니다. 보석과 수리 재료를 소모하고, 도구 숙련과 8시간 작업 진행을 기록하며, 완성된 열쇠를 party stash에서 분배합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p4_craft_tinker", type: "skill_check", label: "폭풍 열쇠 제작", skill: "arcana", dc: 17 },
        { id: "p4_craft_repair", type: "skill_check", label: "방패 수리", skill: "athletics", dc: 14 },
      ],
      vttMap: createP4ValidationMap(P4_DOWNTIME_NODE_ID, "downtime"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P4_BOSS_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p4_crafting_log",
        title: "제작 감사 로그",
        text: "재료, 비용, 도구 숙련, 작업 시간이 모두 기록되어야 하며 완료 결과가 party stash에 추가되어야 합니다.",
      },
    ]),
    fallbackNodeId: P4_BOSS_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "경제 MVP의 crafting 시작/진행/완료와 reward 지급 후 분배를 검증합니다.",
      p4Scenario: {
        gmModes: ["AI", "HUMAN"],
        verifies: ["crafting_started", "crafting_progressed", "reward_granted", "stash_distributed"],
        craftingRecipe: {
          recipeId: "recipe-storm-crown-key",
          outputItemDefinitionId: "magic_item.immovable_rod",
          requiredMaterials: ["magic_item.necklace_of_fireballs", "equipment.crowbar"],
          requiredToolProficiencies: ["tool:tinker"],
          laborHours: 8,
          costGp: 10,
        },
      },
    }),
  },
  {
    id: P4_BOSS_NODE_ID,
    scenarioId: P4_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "리치의 계승문",
    sceneText:
      "폭풍왕관의 계승문에서 리치, 블랙 드래곤, 퍼플 웜, 뱀파이어가 마지막 의식을 진행합니다. 6레벨 주문과 복합 몬스터 행동, charm/paralyze/swallow/poison cloud lifecycle을 검증합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({
      checks: [
        { id: "p4_boss_religion", type: "skill_check", label: "리치 의식 역전", skill: "religion", dc: 18 },
        { id: "p4_boss_arcana", type: "skill_check", label: "왕관문 차단", skill: "arcana", dc: 19 },
      ],
      vttMap: createP4ValidationMap(P4_BOSS_NODE_ID, "boss"),
    }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P4_END_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P4_END_NODE_ID,
    nodeMetaJson: JSON.stringify({
      gmNotes: "P4 보스급 복합 행동, 상태 lifecycle, 6레벨 주문, HUMAN GM override를 확인합니다.",
      p4Scenario: {
        gmModes: ["AI", "HUMAN"],
        verifies: ["boss_complex_actions", "condition_lifecycle", "spell_level_6", "manual_override"],
        usefulSpells: ["spell.globe_of_invulnerability", "spell.flesh_to_stone", "spell.harm", "spell.heal", "spell.word_of_recall", "spell.mass_suggestion"],
        monsterIds: ["monster.lich", "monster.young_black_dragon", "monster.purple_worm", "monster.vampire"],
      },
    }),
  },
  {
    id: P4_END_NODE_ID,
    scenarioId: P4_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "계승식 이후의 두 번째 발행",
    sceneText:
      "폭풍왕관은 봉인되었습니다. GM은 revision 1 세션 snapshot을 보존한 뒤 draft를 수정해 revision 2를 발행하고, 기존 세션의 왕관 문구·보상·맵 상태가 바뀌지 않는지 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: null,
    nodeMetaJson: JSON.stringify({
      isEndingNode: true,
      endBehavior: "SESSION_COMPLETE",
      gmNotes: "AI GM/HUMAN GM 완주, 경제/아이템 복원, 협업 review 승인, revision 2 발행 후 revision 1 세션 불변성을 최종 확인합니다.",
      p4Scenario: {
        gmModes: ["AI", "HUMAN"],
        validatesRevisionSnapshot: true,
        validatesCollaborationPolicy: true,
        expectedDurationMinutes: [180, 240],
      },
    }),
  },
  {
    id: P5_VALIDATION_START_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "성좌 봉인 작전 회의",
    sceneText:
      "성좌 봉인의 균열이 세 차원에 동시에 열립니다. 파티는 12레벨 캐릭터를 16레벨까지 성장시키고, 7~8레벨 주문 슬롯과 대표 서브클래스 기능을 확인한 뒤 원정 일정을 확정해야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_SCHEDULE_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p5_level_16_checklist",
        title: "P5 16레벨 검증 목록",
        handoutText: "14/16레벨 ASI, 7~8레벨 슬롯, class resource, P5 주문 15개 이상, P5 몬스터 16종 이상을 확인합니다.",
      },
    ]),
    fallbackNodeId: P5_SCHEDULE_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p5Scenario: {
        gmModes: ["AI", "HUMAN"],
        startLevel: 16,
        expectedDurationMinutes: [240, 360],
        validatesLevelUp: true,
        spellIds: [
          "spell.teleport",
          "spell.plane_shift",
          "spell.resurrection",
          "spell.regenerate",
          "spell.forcecage",
          "spell.reverse_gravity",
          "spell.fire_storm",
          "spell.divine_word",
          "spell.etherealness",
          "spell.prismatic_spray",
          "spell.antimagic_field",
          "spell.dominate_monster",
          "spell.earthquake",
          "spell.holy_aura",
          "spell.sunburst",
        ],
      },
    }),
  },
  {
    id: P5_SCHEDULE_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "세션 일정과 성좌력 분리",
    sceneText:
      "원정대는 현실 세션 후보 시간을 제안하고 참석 여부를 표시합니다. GM은 현실 일정 확정과 게임 내 성좌력 3일 경과를 분리해 기록합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_TRAVEL_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p5_schedule_flow",
        title: "캘린더 검증",
        handoutText: "propose_schedule → respond_schedule → confirm_schedule → advance_game_time 순서로 서버 권위 로그를 확인합니다.",
      },
    ]),
    fallbackNodeId: P5_TRAVEL_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p5Calendar: {
        scheduleCandidateCount: 2,
        timeZone: "Asia/Seoul",
        inGameDate: "1492-07-16",
        elapsedDays: 3,
      },
    }),
  },
  {
    id: P5_TRAVEL_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "travel",
    title: "별바람 항로",
    sceneText:
      "로크와 스톰 자이언트가 별바람 항로를 가로막습니다. Teleport, Plane Shift, Etherealness, Control Weather류 이동·환경 주문과 비행 전투를 검증합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP5ValidationMap(P5_TRAVEL_NODE_ID, "travel") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_SECOND_TRAVEL_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p5_astral_route", title: "성좌 항로", text: "첫 번째 봉인은 북동쪽 유성문 뒤에 있습니다." }]),
    fallbackNodeId: P5_SECOND_TRAVEL_NODE_ID,
    nodeMetaJson: JSON.stringify({ p5Scenario: { nodeCategory: "travel", monsterIds: ["monster.roc", "monster.storm_giant"] } }),
  },
  {
    id: P5_SECOND_TRAVEL_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "travel",
    title: "차원 교차로의 편차",
    sceneText:
      "원정대는 Plane Shift와 Teleport의 도착 편차를 비교하며 성좌 교차로를 통과합니다. 실패·편차·재시도 결과가 캠페인 위치와 timeline event에 남는지 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [{ id: "p5_travel_survival", type: "skill_check", skill: "survival", dc: 18 }], vttMap: createP5ValidationMap(P5_SECOND_TRAVEL_NODE_ID, "dimensional_crossing") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_RESEARCH_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p5_dimensional_crossing", title: "차원 교차 좌표", text: "Teleport 편차가 생기면 성좌력 하루가 추가로 경과합니다." }]),
    fallbackNodeId: P5_RESEARCH_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p5Scenario: {
        nodeCategory: "travel",
        validatesCampaignLocation: true,
        spellIds: ["spell.teleport", "spell.plane_shift", "spell.etherealness", "spell.control_weather"],
        monsterIds: ["monster.air_elemental", "monster.invisible_stalker"],
      },
    }),
  },
  {
    id: P5_RESEARCH_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "스핑크스의 별문서고",
    sceneText:
      "진스핑크스와 코아틀은 전투보다 연구와 예지를 요구합니다. Project Image, Telepathy, Mind Blank, Glibness로 정보·사회·예지 주문 흐름을 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [{ id: "p5_research_arcana", type: "skill_check", skill: "arcana", dc: 19 }], vttMap: createP5ValidationMap(P5_RESEARCH_NODE_ID, "research") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_DOWNTIME_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p5_fork_lineage", title: "Fork 계보 지시", text: "이 문서를 revision 1에 보존한 뒤 fork draft에서만 문구를 바꿉니다." }]),
    fallbackNodeId: P5_DOWNTIME_NODE_ID,
    nodeMetaJson: JSON.stringify({ p5Scenario: { nodeCategory: "exploration", validatesPublicForkLineage: true, monsterIds: ["monster.gynosphinx", "monster.couatl"] } }),
  },
  {
    id: P5_DOWNTIME_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "downtime",
    title: "성좌 봉인 공방",
    sceneText:
      "세션 사이에 제작, 훈련, 연구, 회복, 감정, 수리, 상점 재입고 downtime을 시작·중단·재개·완료합니다. 비용과 도구 조건, 인벤토리와 경제 상태가 감사 로그에 남아야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP5ValidationMap(P5_DOWNTIME_NODE_ID, "downtime") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_RIFT_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p5_downtime_tasks", title: "Downtime 5종", text: "crafting/training/research/recovery/repair 이상을 완료합니다." }]),
    fallbackNodeId: P5_RIFT_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p5Downtime: {
        taskTypes: ["crafting", "training", "research", "recovery", "identify", "repair", "shop_restock"],
        requiredTools: ["smith_tools", "arcana_lab"],
        validatesPauseResume: true,
      },
    }),
  },
  {
    id: P5_RIFT_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "심연 균열 조사",
    sceneText:
      "아볼레스와 락샤사의 정신 지배 흔적을 조사합니다. Dominate Monster, Feeblemind, Antimagic Field, Maze 같은 고레벨 상태와 차단 흐름을 검증합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [{ id: "p5_rift_insight", type: "skill_check", skill: "insight", dc: 20 }], vttMap: createP5ValidationMap(P5_RIFT_NODE_ID, "rift") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_COMBAT_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p5_mind_gate", title: "정신 관문", text: "두 번째 봉인은 antimagic 영역 안에서만 안정화됩니다." }]),
    fallbackNodeId: P5_COMBAT_NODE_ID,
    nodeMetaJson: JSON.stringify({ p5Scenario: { nodeCategory: "exploration", monsterIds: ["monster.aboleth", "monster.rakshasa"] } }),
  },
  {
    id: P5_COMBAT_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "천상과 심연의 전장",
    sceneText:
      "발러, 핏 핀드, 솔라가 동시에 충돌합니다. Fire Storm, Divine Word, Holy Aura, Sunburst, Incendiary Cloud, Tsunami 같은 광역·보호 주문을 TurnLog/StateDiff로 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP5ValidationMap(P5_COMBAT_NODE_ID, "battlefield") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_BOSS_ONE_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P5_BOSS_ONE_NODE_ID,
    nodeMetaJson: JSON.stringify({ p5Scenario: { nodeCategory: "combat", monsterIds: ["monster.balor", "monster.pit_fiend", "monster.solar"] } }),
  },
  {
    id: P5_BOSS_ONE_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "1단계 보스: 고대 용과 크라켄의 성좌",
    sceneText:
      "고대 레드 드래곤, 크라켄, 메두사가 첫 번째 보스 페이즈를 구성합니다. Legendary-like 자원, recharge, lair terrain, Forcecage와 Reverse Gravity를 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP5ValidationMap(P5_BOSS_ONE_NODE_ID, "dragon") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_BOSS_TWO_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P5_BOSS_TWO_NODE_ID,
    nodeMetaJson: JSON.stringify({ p5Scenario: { nodeCategory: "combat", bossPhase: 1, monsterIds: ["monster.ancient_red_dragon", "monster.kraken", "monster.medusa"] } }),
  },
  {
    id: P5_BOSS_TWO_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "2단계 보스: 타라스크 봉인",
    sceneText:
      "타라스크, 리치, 나이트 해그가 마지막 봉인을 찢습니다. 다단계 보스 전환, 부활·재생·석화·공포·추방 상태 lifecycle과 기존 세션 snapshot 보존을 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP5ValidationMap(P5_BOSS_TWO_NODE_ID, "tarrasque") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_PUBLIC_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P5_PUBLIC_NODE_ID,
    nodeMetaJson: JSON.stringify({ p5Scenario: { nodeCategory: "combat", bossPhase: 2, monsterIds: ["monster.tarrasque", "monster.lich", "monster.night_hag"] } }),
  },
  {
    id: P5_PUBLIC_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "downtime",
    title: "공개 revision 생태계 검증",
    sceneText:
      "캠페인을 공개 revision으로 발행하고 레벨·태그·평점·최신순 검색을 확인합니다. 완료한 사용자만 평점/리뷰를 남기고, fork draft를 만든 뒤 신고 누적으로 검색 제외되는지 검증합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P5_END_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p5_public_flow", title: "공개 흐름", text: "publish → discovery → rate/review → fork → report → hidden 순서로 확인합니다." }]),
    fallbackNodeId: P5_END_NODE_ID,
    nodeMetaJson: JSON.stringify({ p5PublicEcosystem: { validatesSearch: true, validatesRating: true, validatesFork: true, validatesModeration: true } }),
  },
  {
    id: P5_END_NODE_ID,
    scenarioId: P5_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "성좌 봉인의 후일담",
    sceneText:
      "성좌 봉인이 안정됩니다. AI GM과 HUMAN GM으로 주요 경로를 각각 완주하고, 일정·downtime·경제·inventory·revision 1/2·fork draft snapshot이 서로 격리되었는지 최종 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: null,
    nodeMetaJson: JSON.stringify({
      isEndingNode: true,
      endBehavior: "SESSION_COMPLETE",
      p5Scenario: {
        validatesAiGm: true,
        validatesHumanGm: true,
        validatesSnapshotIsolation: true,
      },
    }),
  },
  {
    id: P6_VALIDATION_START_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "영원폭풍 성채 작전 회의",
    sceneText:
      "영원폭풍 성채가 모든 차원 위에 떠오릅니다. 파티는 17레벨에서 20레벨까지 성장하며 19레벨 ASI, 20레벨 capstone, 9레벨 주문 슬롯과 Mystic Arcanum 9를 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_LEVEL_NODE_ID }]),
    cluesJson: JSON.stringify([
      {
        id: "clue_p6_final_checklist",
        title: "P6 최종 검증 목록",
        handoutText: "20레벨 성장, 9레벨 주문 8개 이상, P6 주문 20개 이상, P6 몬스터 24종 이상, 운영자 moderation, archive/vault/transfer를 모두 확인합니다.",
      },
    ]),
    fallbackNodeId: P6_LEVEL_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        gmModes: ["AI", "HUMAN"],
        startLevel: 17,
        endLevel: 20,
        expectedDurationMinutes: [360, 540],
        validatesLevelUp: true,
        validatesCapstones: true,
        validatesNinthLevelSlots: true,
      },
    }),
  },
  {
    id: P6_LEVEL_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "20레벨 승천과 마지막 준비",
    sceneText:
      "각 직업의 20레벨 기능과 대표 서브클래스 고레벨 기능을 확인합니다. Wizard Signature Spells, Druid Archdruid, Fighter Extra Attack(3), Rogue Stroke of Luck처럼 실제 resolver 또는 snapshot에 남는 기능을 점검합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_TRAVEL_ONE_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p6_level_20", title: "20레벨 기능", text: "19레벨 ASI와 20레벨 capstone이 character snapshot과 session reconnect 상태에 남아야 합니다." }]),
    fallbackNodeId: P6_TRAVEL_ONE_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        nodeCategory: "story",
        validatesLevelUp: true,
        classFeatureIds: [
          "class.barbarian.feature.primal_champion",
          "class.bard.feature.superior_inspiration",
          "class.druid.feature.archdruid",
          "class.fighter.feature.extra_attack_3",
          "class.rogue.feature.stroke_of_luck",
          "class.wizard.feature.signature_spells",
        ],
      },
    }),
  },
  {
    id: P6_TRAVEL_ONE_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "travel",
    title: "차원 수렴 항로",
    sceneText:
      "Gate, Wind Walk, Transport via Plants, Telepathic Bond로 파티를 여러 차원에 분산·재집결시킵니다. 실패·편차·위치 상태가 campaign timeline에 남아야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [{ id: "p6_planar_navigation", type: "skill_check", skill: "arcana", dc: 21 }], vttMap: createP6ValidationMap(P6_TRAVEL_ONE_NODE_ID, "planar_convergence") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_TRAVEL_TWO_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p6_planar_route", title: "차원 수렴 좌표", text: "Gate 실패는 성채 위치를 한 단계 불안정하게 만듭니다." }]),
    fallbackNodeId: P6_TRAVEL_TWO_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        nodeCategory: "travel",
        spellIds: ["spell.gate", "spell.wind_walk", "spell.transport_via_plants", "spell.telepathic_bond"],
        monsterIds: ["monster.adult_brass_dragon", "monster.adult_bronze_dragon", "monster.behir"],
      },
    }),
  },
  {
    id: P6_TRAVEL_TWO_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "travel",
    title: "Astral Projection 관문",
    sceneText:
      "Astral Projection과 Plane Shift 계열 이동을 비교하고, Foresight로 위험을 예견합니다. 성체 금속룡 의회가 파티의 통행권을 시험합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [{ id: "p6_astral_survival", type: "skill_check", skill: "survival", dc: 21 }], vttMap: createP6ValidationMap(P6_TRAVEL_TWO_NODE_ID, "astral_projection") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_EXPLORATION_ONE_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p6_astral_projection", title: "은끈의 진동", text: "Astral Projection 해제 시 원본 육체 snapshot이 손상되지 않아야 합니다." }]),
    fallbackNodeId: P6_EXPLORATION_ONE_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        nodeCategory: "travel",
        spellIds: ["spell.astral_projection", "spell.foresight", "spell.magnificent_mansion", "spell.private_sanctum"],
        monsterIds: ["monster.adult_copper_dragon", "monster.adult_gold_dragon", "monster.adult_silver_dragon"],
      },
    }),
  },
  {
    id: P6_EXPLORATION_ONE_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "Wish 기록고",
    sceneText:
      "Wish, Legend Lore, Contact Other Plane, Commune with Nature가 같은 진실을 서로 다른 비용과 위험으로 드러냅니다. Wish는 안전한 MVP 선택지와 GM 승인 override로 분리되어야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [{ id: "p6_wish_arcana", type: "skill_check", skill: "arcana", dc: 22 }], vttMap: createP6ValidationMap(P6_EXPLORATION_ONE_NODE_ID, "wish_archive") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_EXPLORATION_TWO_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p6_wish_limit", title: "Wish 안전 장치", text: "광범위 소원은 GM override audit 없이 자동 확정되지 않습니다." }]),
    fallbackNodeId: P6_EXPLORATION_TWO_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        nodeCategory: "exploration",
        validatesWishApproval: true,
        spellIds: ["spell.wish", "spell.legend_lore", "spell.contact_other_plane", "spell.commune_with_nature"],
        monsterIds: ["monster.guardian_naga", "monster.spirit_naga", "monster.oni"],
      },
    }),
  },
  {
    id: P6_EXPLORATION_TWO_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "exploration",
    title: "Shapechange 미궁",
    sceneText:
      "Shapechange, True Polymorph, Animal Shapes, Reincarnate가 token owner와 stat replacement, 집중 종료 lifecycle을 바꿉니다. 변신 종료 후 원본 캐릭터 snapshot이 유지되는지 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [{ id: "p6_shapechange_nature", type: "skill_check", skill: "nature", dc: 21 }], vttMap: createP6ValidationMap(P6_EXPLORATION_TWO_NODE_ID, "shapechange_labyrinth") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_DOWNTIME_ONE_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p6_shapechange", title: "원본 형상", text: "집중이 깨지면 Shapechange token override가 제거되어야 합니다." }]),
    fallbackNodeId: P6_DOWNTIME_ONE_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        nodeCategory: "exploration",
        spellIds: ["spell.shapechange", "spell.true_polymorph", "spell.animal_shapes", "spell.reincarnate"],
        monsterIds: ["monster.gorgon", "monster.shambling_mound", "monster.winter_wolf"],
      },
    }),
  },
  {
    id: P6_DOWNTIME_ONE_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "downtime",
    title: "에픽 downtime과 부활 비용",
    sceneText:
      "True Resurrection, Mass Heal, Hallow, Forbiddance, Guards and Wards로 성채를 안정화합니다. 비용·재료·장기 효과가 economy와 campaign archive에 남는지 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP6ValidationMap(P6_DOWNTIME_ONE_NODE_ID, "epic_downtime") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_DOWNTIME_TWO_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p6_true_resurrection_cost", title: "진정한 부활의 비용", text: "True Resurrection 비용과 사망/부활 이력이 archive analytics에 남아야 합니다." }]),
    fallbackNodeId: P6_DOWNTIME_TWO_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Downtime: {
        taskTypes: ["resurrection", "warding", "research", "crafting", "public_summary"],
        validatesArchiveAnalytics: true,
      },
      p6Scenario: {
        nodeCategory: "downtime",
        spellIds: ["spell.true_resurrection", "spell.mass_heal", "spell.hallow", "spell.forbiddance", "spell.guards_and_wards"],
        monsterIds: ["monster.awakened_tree", "monster.druid", "monster.dryad"],
      },
    }),
  },
  {
    id: P6_DOWNTIME_TWO_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "downtime",
    title: "공개 콘텐츠 운영자 재판",
    sceneText:
      "공개 revision을 신고하고 운영자 큐에서 hidden, warning, review_removed, restored를 처리합니다. Creator는 이의 제기를 제출하고 복구 여부를 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP6ValidationMap(P6_DOWNTIME_TWO_NODE_ID, "moderation_trial") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_COMBAT_ONE_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p6_moderation_flow", title: "운영자 moderation 흐름", text: "report → queue → action → appeal → restored/rejected → review_removed를 검증합니다." }]),
    fallbackNodeId: P6_COMBAT_ONE_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Moderation: {
        validatesQueue: true,
        validatesActions: ["hidden", "restored", "warning", "creator_note_required", "rating_removed", "review_removed"],
        validatesAppeals: ["submitted", "accepted", "rejected"],
      },
      p6Scenario: {
        nodeCategory: "downtime",
        monsterIds: ["monster.doppelganger", "monster.succubus_incubus", "monster.noble"],
      },
    }),
  },
  {
    id: P6_COMBAT_ONE_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "고대 금속룡 의회",
    sceneText:
      "고대 금속룡 셋이 각기 다른 breath_or_bite area save를 사용합니다. Meteor Swarm, Prismatic Wall, Storm of Vengeance로 대규모 광역 피해와 부분 성공을 검증합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP6ValidationMap(P6_COMBAT_ONE_NODE_ID, "dragon_parliament") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_COMBAT_TWO_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P6_COMBAT_TWO_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        nodeCategory: "combat",
        bossPhase: 3,
        legendaryOrLair: true,
        spellIds: ["spell.meteor_swarm", "spell.prismatic_wall", "spell.storm_of_vengeance"],
        monsterIds: ["monster.ancient_brass_dragon", "monster.ancient_bronze_dragon", "monster.ancient_copper_dragon"],
      },
    }),
  },
  {
    id: P6_COMBAT_TWO_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "나가와 미라 군주의 관문",
    sceneText:
      "Mummy Lord, Glabrezu, Chuul이 lair-like 압박과 grappling, fear, curse를 겹칩니다. Power Word Kill, Imprisonment, Weird의 면역·실패·부분 성공 기록을 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP6ValidationMap(P6_COMBAT_TWO_NODE_ID, "naga_mummy_gauntlet") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_BOSS_ONE_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P6_BOSS_ONE_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        nodeCategory: "combat",
        spellIds: ["spell.power_word_kill", "spell.imprisonment", "spell.weird"],
        monsterIds: ["monster.mummy_lord", "monster.glabrezu", "monster.chuul"],
      },
    }),
  },
  {
    id: P6_BOSS_ONE_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "1단계 보스: 고대 골드 드래곤의 성채 심장",
    sceneText:
      "고대 골드 드래곤이 lair phase를 열고, 하위 골드 드래곤들이 recharge breath를 이어갑니다. Time Stop, Gate, Foresight로 선제 준비와 차원 증원을 검증합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP6ValidationMap(P6_BOSS_ONE_NODE_ID, "gold_dragon_lair") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_BOSS_TWO_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P6_BOSS_TWO_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        nodeCategory: "combat",
        bossPhase: 1,
        legendaryOrLair: true,
        spellIds: ["spell.time_stop", "spell.gate", "spell.foresight"],
        monsterIds: ["monster.ancient_gold_dragon", "monster.young_gold_dragon", "monster.gold_dragon_wyrmling"],
      },
    }),
  },
  {
    id: P6_BOSS_TWO_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "combat",
    title: "2단계 보스: 고대 실버 드래곤과 독사의 폭풍",
    sceneText:
      "고대 실버 드래곤이 은빛 폭풍을 열고 독사 떼와 퀴퍼 떼가 영역 피해를 누적합니다. Swarm area save, half damage, concentration 종료를 검증합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: createP6ValidationMap(P6_BOSS_TWO_NODE_ID, "silver_storm_swarm") }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_ARCHIVE_ONE_NODE_ID }]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: P6_ARCHIVE_ONE_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Scenario: {
        nodeCategory: "combat",
        bossPhase: 2,
        legendaryOrLair: true,
        monsterIds: ["monster.ancient_silver_dragon", "monster.swarm_of_poisonous_snakes", "monster.swarm_of_quippers"],
      },
    }),
  },
  {
    id: P6_ARCHIVE_ONE_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "archive",
    title: "후일담과 campaign archive",
    sceneText:
      "GM은 complete-campaign API로 후일담, 최종 보상, 공개 요약 범위, 캐릭터 이관 허용 여부를 기록합니다. 완료 후 archive snapshot은 불변이어야 합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_ARCHIVE_TWO_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p6_archive_snapshot", title: "Archive snapshot", text: "일정, downtime, 경제, inventory, 전투, 공개 revision lineage가 archive에 요약됩니다." }]),
    fallbackNodeId: P6_ARCHIVE_TWO_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Archive: {
        validatesCompleteCampaignApi: true,
        validatesEpilogue: true,
        validatesImmutableArchive: true,
        validatesAnalytics: true,
      },
    }),
  },
  {
    id: P6_ARCHIVE_TWO_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "archive",
    title: "캐릭터 보관소와 새 캠페인 이관",
    sceneText:
      "플레이어는 보관소에서 20레벨 캐릭터를 확인하고, 새 캠페인으로 clone 이관을 요청합니다. GM 승인 뒤 새 SessionCharacter가 독립 snapshot으로 생성되는지 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: P6_END_NODE_ID }]),
    cluesJson: JSON.stringify([{ id: "clue_p6_character_transfer", title: "캐릭터 이관", text: "원본 archive는 변경되지 않고, 대상 세션에 clone 캐릭터만 생성되어야 합니다." }]),
    fallbackNodeId: P6_END_NODE_ID,
    nodeMetaJson: JSON.stringify({
      p6Archive: {
        validatesCharacterVault: true,
        validatesTransferRequest: true,
        validatesTransferApproval: true,
        validatesIndependentSnapshot: true,
      },
    }),
  },
  {
    id: P6_END_NODE_ID,
    scenarioId: P6_VALIDATION_SCENARIO_ID,
    nodeType: "story",
    title: "영원폭풍 이후의 세계",
    sceneText:
      "영원폭풍은 꺼지고 성채는 다음 캠페인의 전설이 됩니다. AI GM과 HUMAN GM으로 주요 경로를 각각 완주하고, 공개 탐색부터 moderation, archive, vault, transfer까지 이어지는 최종 사용자 흐름을 확인합니다.",
    imageUrl: null,
    checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
    transitionsJson: JSON.stringify([]),
    cluesJson: JSON.stringify([]),
    fallbackNodeId: null,
    nodeMetaJson: JSON.stringify({
      isEndingNode: true,
      endBehavior: "SESSION_COMPLETE",
      p6Scenario: {
        validatesAiGm: true,
        validatesHumanGm: true,
        validatesFinalManifest: true,
        validatesPublicDiscoveryToRating: true,
      },
    }),
  },
];

const scenarios = [
  defaultScenario,
  nodeScreenTestScenario,
  ruleRuntimeSmokeScenario,
  p1OneshotScenario,
  p2ValidationScenario,
  p3ValidationScenario,
  p4ValidationScenario,
  p5ValidationScenario,
  p6ValidationScenario,
];

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
        startLevel: scenario.startLevel,
        recommendedEndLevel: scenario.recommendedEndLevel,
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
