import {
  ActionOutcome,
  DiceAdvantageState,
  DiceRollResponseDto,
} from "@trpg/shared-types";
import type { PrismaClient } from "@prisma/client";
import { ActionRuleService } from "../../modules/rules/action-rule.service";
import { AoeDamageService } from "../../modules/rules/aoe-damage.service";
import { CommandParserService } from "../../modules/rules/command-parser.service";
import { DiceService } from "../../modules/rules/dice.service";
import { getExecutableItemDefinition } from "../../modules/rules/p3-item-manifest";
import { MapPositionService } from "../../modules/rules/map-position.service";
import { RuleEngineService } from "../../modules/rules/rule-engine.service";
import {
  P1_ONESHOT_BOSS_NODE_ID,
  P1_ONESHOT_SCENARIO_ID,
  P1_ONESHOT_START_NODE_ID,
  P2_VALIDATION_SCENARIO_ID,
  P2_VALIDATION_START_NODE_ID,
  P4_VALIDATION_SCENARIO_ID,
  P4_VALIDATION_START_NODE_ID,
  RULE_RUNTIME_SMOKE_SCENARIO_ID,
  RULE_RUNTIME_SMOKE_START_NODE_ID,
  seedDefaultScenario,
} from "./default-scenario";

type SmokeSessionCharacter = Parameters<ActionRuleService["resolveAction"]>[1];

const createDiceResult = (
  expression: string,
  rolls: number[],
  modifier = 0,
): DiceRollResponseDto => ({
  expression,
  rolls,
  modifier,
  total: rolls.reduce((sum, roll) => sum + roll, 0) + modifier,
  advantageState: DiceAdvantageState.NORMAL,
});

const createDeterministicSmokeRoll = (expression: string): DiceRollResponseDto => {
  const match = expression.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) {
    throw new Error(`No smoke dice result configured for ${expression}.`);
  }

  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;
  return createDiceResult(
    expression,
    Array.from({ length: count }, () => Math.max(1, Math.ceil(sides / 2))),
    modifier,
  );
};

const createActionRuleService = (): ActionRuleService => {
  const rollByExpression = new Map<string, DiceRollResponseDto>([
    ["2d8+3", createDiceResult("2d8+3", [6, 5], 3)],
    ["1d20", createDiceResult("1d20", [15])],
    ["1d20+2", createDiceResult("1d20+2", [18], 2)],
    ["1d6", createDiceResult("1d6", [4])],
    ["9d6", createDiceResult("9d6", [6, 5, 4, 4, 3, 3, 2, 2, 1])],
    ["1d20+3", createDiceResult("1d20+3", [15], 3)],
    ["1d4", createDiceResult("1d4", [3])],
    ["1d4+5", createDiceResult("1d4+5", [3], 5)],
  ]);
  const diceService = {
    roll: jest.fn((expression: string) => {
      const roll = rollByExpression.get(expression) ?? createDeterministicSmokeRoll(expression);
      return { ...roll, rolls: [...roll.rolls] };
    }),
  } as unknown as DiceService;
  const ruleEngine = new RuleEngineService();

  return new ActionRuleService(
    new CommandParserService(),
    diceService,
    ruleEngine,
    new MapPositionService(),
    undefined,
    new AoeDamageService(diceService, ruleEngine),
  );
};

const createSmokeActor = (): SmokeSessionCharacter => ({
  id: "smoke-actor",
  userId: "smoke-actor-user",
  characterId: "smoke-actor-character",
  currentHp: 30,
  tempHp: 0,
  conditionsJson: "[]",
  inventorySnapshotJson: JSON.stringify([
    {
      id: "entry-smoke-dagger",
      itemDefinitionId: "equipment.dagger",
      name: "Dagger",
      quantity: 2,
      damageDice: "1d4",
      damageType: "piercing",
      properties: ["finesse", "light", "thrown", "proficient"],
    },
  ]),
  inventoryEntries: [],
  user: {
    id: "smoke-actor-user",
    displayName: "Smoke Actor",
    profile: null,
  },
  character: {
    id: "smoke-actor-character",
    name: "Smoke Actor",
    className: "wizard",
    level: 5,
    maxHp: 30,
    abilitiesJson: JSON.stringify({ str: 10, dex: 12, con: 12, int: 16, wis: 10, cha: 10 }),
    proficiencyBonus: 3,
    featuresJson: null,
    proficientSkillsJson: JSON.stringify(["investigation"]),
    armorClass: 12,
    speed: 30,
    spellsJson: JSON.stringify({
      cantrips: ["spell.ray_of_frost"],
      spells: ["spell.cure_wounds", "spell.detect_magic", "spell.fireball"],
      preparedSpells: ["spell.cure_wounds", "spell.detect_magic", "spell.fireball"],
    }),
    inventoryJson: "[]",
    equippedWeaponId: null,
  },
});

const createSmokeConcentrationConditions = (targetId: string): unknown[] => [
  {
    conditionId: "condition.concentration",
    sourceId: "spell.hold_person",
    duration: { type: "concentration", maxRounds: 10 },
    saveEnds: null,
    stackPolicy: "replace",
    appliedAtRound: 0,
    tags: [
      "concentration",
      "concentration:spell:spell.hold_person",
      `concentration:target:${targetId}`,
      `concentration:effect:effect-${targetId}`,
    ],
  },
  {
    conditionId: `effect-${targetId}`,
    sourceId: "spell.hold_person",
    duration: { type: "concentration_linked" },
    saveEnds: null,
    stackPolicy: "replace",
    appliedAtRound: 0,
    tags: [`concentration:effect:effect-${targetId}`],
  },
];

const createSmokeTarget = (token: { id: string; name?: string; isHostile?: boolean }): SmokeSessionCharacter => ({
  id: token.id,
  tokenId: token.id,
  userId: `${token.id}-user`,
  characterId: `${token.id}-character`,
  currentHp: 20,
  tempHp: 0,
  conditionsJson: token.id === "token_node_rule_smoke_aoe_goblin"
    ? JSON.stringify(createSmokeConcentrationConditions(token.id))
    : token.isHostile ? JSON.stringify(["hostile"]) : "[]",
  inventorySnapshotJson: null,
  inventoryEntries: [],
  user: null,
  character: {
    id: `${token.id}-character`,
    name: token.name ?? token.id,
    className: "monster",
    level: 1,
    maxHp: 20,
    abilitiesJson: JSON.stringify({ str: 10, dex: 12, con: 10, int: 8, wis: 10, cha: 8 }),
    proficiencyBonus: 2,
    featuresJson: null,
    proficientSkillsJson: "[]",
    armorClass: 10,
    speed: 30,
    spellsJson: null,
    inventoryJson: "[]",
    equippedWeaponId: null,
  },
});

describe("default scenario seed", () => {
  const seedDefaultScenarioIntoMock = async () => {
    const scenarioUpserts: unknown[] = [];
    const scenarioNodeUpserts: Array<{ create?: Record<string, unknown>; update?: Record<string, unknown> }> = [];
    const prisma = {
      scenario: {
        upsert: jest.fn(async (args: unknown) => {
          scenarioUpserts.push(args);
        }),
        findMany: jest.fn(async () => []),
      },
      scenarioNode: {
        upsert: jest.fn(async (args: { create?: Record<string, unknown>; update?: Record<string, unknown> }) => {
          scenarioNodeUpserts.push(args);
        }),
      },
    } as unknown as PrismaClient;

    await seedDefaultScenario(prisma);

    return { scenarioUpserts, scenarioNodeUpserts };
  };

  it("keeps rule runtime smoke target commands aligned with VTT token ids", async () => {
    const { scenarioUpserts, scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    expect(scenarioUpserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: { id: RULE_RUNTIME_SMOKE_SCENARIO_ID },
        }),
      ]),
    );

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const commands = smokeNodes.flatMap((node) => {
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        smokeTest?: { suggestedCommands?: string[] };
      };
      return meta.smokeTest?.suggestedCommands ?? [];
    });
    const tokenIds = new Set(
      smokeNodes.flatMap((node) => {
        const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
          vttMap?: { tokens?: Array<{ id: string }> };
        };
        return options.vttMap?.tokens?.map((token) => token.id) ?? [];
      }),
    );

    const commandTargetIds = commands.flatMap((command) => {
      const match = command.match(/^\/attack\s+(\S+)/);
      if (match) {
        return [match[1]];
      }
      const areaMatch = command.match(/^\/cast_area\s+\S+\s+\d+\s+(\S+)/);
      if (areaMatch) {
        return areaMatch[1].split(",").map((targetId) => targetId.trim()).filter(Boolean);
      }
      const conditionMatch = command.match(/^\/condition\s+(?:add|remove)\s+(\S+)\s+\S+/);
      if (conditionMatch) {
        return [conditionMatch[1]];
      }
      const castMatch = command.match(/^\/cast\s+\S+\s+(\S+)/);
      return castMatch ? [castMatch[1]] : [];
    });

    expect(commandTargetIds.length).toBeGreaterThan(0);
    expect(commandTargetIds.every((targetId) => tokenIds.has(targetId))).toBe(true);
  });

  it("seeds the P1 user-facing oneshot with level 3 flow, maps, and representative monsters", async () => {
    const { scenarioUpserts, scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    expect(scenarioUpserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: { id: P1_ONESHOT_SCENARIO_ID },
          update: expect.objectContaining({
            startLevel: 3,
            recommendedEndLevel: 3,
            startNodeId: P1_ONESHOT_START_NODE_ID,
          }),
        }),
      ]),
    );

    const p1Nodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === P1_ONESHOT_SCENARIO_ID);

    expect(p1Nodes.map((node) => node.id)).toEqual([
      P1_ONESHOT_START_NODE_ID,
      "node_p1_ember_market",
      "node_p1_ember_ambush",
      "node_p1_ember_rest",
      P1_ONESHOT_BOSS_NODE_ID,
      "node_p1_ember_end",
    ]);

    const combatMonsterIds = new Set(
      p1Nodes.flatMap((node) => {
        const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
          vttMap?: { tokens?: Array<{ monster?: { id?: string } }> };
        };
        return options.vttMap?.tokens?.map((token) => token.monster?.id).filter(Boolean) ?? [];
      }),
    );

    expect(combatMonsterIds).toEqual(
      new Set([
        "monster.orc",
        "monster.skeleton",
        "monster.wolf",
        "monster.dragon_whelp",
        "monster.cultist",
        "monster.giant_spider",
      ]),
    );

    const restNode = p1Nodes.find((node) => node.id === "node_p1_ember_rest");
    const bossNode = p1Nodes.find((node) => node.id === P1_ONESHOT_BOSS_NODE_ID);
    const restMeta = JSON.parse(String(restNode?.nodeMetaJson ?? "{}")) as {
      p1Scenario?: { verifies?: string[] };
    };
    const bossMeta = JSON.parse(String(bossNode?.nodeMetaJson ?? "{}")) as {
      p1Scenario?: { usefulSpells?: string[]; verifies?: string[] };
    };

    expect(restMeta.p1Scenario?.verifies).toEqual(expect.arrayContaining(["short-rest"]));
    expect(bossMeta.p1Scenario?.usefulSpells).toEqual(
      expect.arrayContaining(["spell.web", "spell.hold_person", "spell.dispel_magic"]),
    );
    expect(bossMeta.p1Scenario?.verifies).toEqual(expect.arrayContaining(["recharge", "human-gm-override"]));
  });

  it("uses a single suggestedCommands smoke metadata field for executable smoke commands", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);

    expect(smokeNodes.length).toBeGreaterThan(0);
    for (const node of smokeNodes) {
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        smokeTest?: { commands?: string[]; suggestedCommands?: string[] };
      };
      if (!meta.smokeTest) {
        continue;
      }
      expect(meta.smokeTest.commands).toBeUndefined();
      if (node.fallbackNodeId) {
        expect(meta.smokeTest.suggestedCommands?.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the rule runtime smoke scenario completable from start to HUMAN GM terminal node", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const nodesById = new Map(smokeNodes.map((node) => [String(node.id), node]));
    const visited: string[] = [];
    let currentNodeId: string | null = RULE_RUNTIME_SMOKE_START_NODE_ID;

    while (currentNodeId) {
      const node = nodesById.get(currentNodeId);
      expect(node).toBeDefined();
      expect(visited).not.toContain(currentNodeId);
      visited.push(currentNodeId);
      currentNodeId = typeof node?.fallbackNodeId === "string" ? node.fallbackNodeId : null;
    }

    expect(visited).toEqual([
      RULE_RUNTIME_SMOKE_START_NODE_ID,
      "node_rule_smoke_trap_save",
      "node_rule_smoke_cover_combat",
      "node_rule_smoke_aoe",
      "node_rule_smoke_condition",
      "node_rule_smoke_human_gm",
    ]);
    expect(nodesById.get(visited[visited.length - 1])?.fallbackNodeId).toBeNull();
  });

  it("marks every rule runtime smoke node for both AI GM and HUMAN GM execution", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();
    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);

    expect(smokeNodes.length).toBeGreaterThan(0);
    for (const node of smokeNodes) {
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        smokeTest?: { gmModes?: string[] };
      };
      expect(meta.smokeTest?.gmModes).toEqual(["AI", "HUMAN"]);
    }
  });

  it("keeps all rule runtime smoke suggested commands parseable by the command parser", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();
    const parser = new CommandParserService();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const commands = smokeNodes.flatMap((node) => {
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        smokeTest?: { suggestedCommands?: string[] };
      };
      return meta.smokeTest?.suggestedCommands ?? [];
    });

    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(parser.parse(command)).not.toMatchObject({ type: "unknown" });
    }
  });

  it("covers executable inventory drop, pickup, and throw commands in rule runtime smoke metadata", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const commands = smokeNodes.flatMap((node) => {
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        smokeTest?: { suggestedCommands?: string[] };
      };
      return meta.smokeTest?.suggestedCommands ?? [];
    });
    const objectIds = new Set(
      smokeNodes.flatMap((node) => {
        const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
          vttMap?: { objectCells?: Array<{ id: string; hiddenItemIds?: string[] }> } | null;
        };
        return options.vttMap?.objectCells?.map((objectCell) => objectCell.id) ?? [];
      }),
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        "/item pickup object_node_rule_smoke_condition_rope equipment.rope 1 3 4",
        "/item drop entry-smoke-dagger 1 3 4",
        "/item throw entry-smoke-dagger 1 4 4",
      ]),
    );
    expect(objectIds.has("object_node_rule_smoke_condition_rope")).toBe(true);
  });

  it("documents executable combat API smoke actions for forced movement and ready triggers", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const conditionNode = smokeNodes.find((node) => node.id === "node_rule_smoke_condition");
    const meta = JSON.parse(String(conditionNode?.nodeMetaJson ?? "{}")) as {
      smokeTest?: {
        verifies?: string[];
        apiActions?: Array<{
          kind: string;
          endpoint: string;
          method: string;
          payload: Record<string, unknown>;
          expects?: string[];
        }>;
      };
    };
    const apiActions = meta.smokeTest?.apiActions ?? [];

    expect(meta.smokeTest?.verifies).toEqual(
      expect.arrayContaining([
        "forced-movement",
        "ready-action-trigger",
        "monster-save-condition-rider",
      ]),
    );
    expect(apiActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "force_move",
          method: "POST",
          endpoint: "/sessions/:sessionId/combat/force-move",
          payload: expect.objectContaining({
            participantId: "combat:node_rule_smoke_condition:goblin",
            mode: "push",
            origin: { x: 128, y: 256 },
            distanceFt: 10,
          }),
          expects: expect.arrayContaining(["forced_movement", "terrain_effect", "ready_action_prompt"]),
        }),
        expect.objectContaining({
          kind: "monster_actor_action",
          method: "POST",
          endpoint: "/sessions/:sessionId/combat/actor-action",
          actorParticipantId: "combat:node_rule_smoke_condition:spider",
          payload: expect.objectContaining({
            actionType: "attack",
            actionId: "action.bite",
            targetParticipantId: "combat:node_rule_smoke_condition:actor",
            autoEndTurn: false,
          }),
          expects: expect.arrayContaining([
            "saving_throw:con:dc11",
            "condition.poisoned",
            "combat_snapshot_refresh",
          ]),
        }),
      ]),
    );
  });

  it("executes Ray of Frost smoke metadata with its movement condition rider", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();
    const conditionNode = scenarioNodeUpserts
      .map((args) => args.create)
      .find((node) => node?.id === "node_rule_smoke_condition");
    const meta = JSON.parse(String(conditionNode?.nodeMetaJson ?? "{}")) as {
      smokeTest?: { suggestedCommands?: string[] };
    };
    const command = meta.smokeTest?.suggestedCommands?.find((entry) =>
      entry.startsWith("/cast ray_of_frost "),
    );
    const options = JSON.parse(String(conditionNode?.checkOptionsJson ?? "{}")) as {
      vttMap?: { tokens?: Array<{ id: string; name?: string; isHostile?: boolean }> } | null;
    };
    const actor = createSmokeActor();
    const targets = options.vttMap?.tokens?.map(createSmokeTarget) ?? [];
    const result = createActionRuleService().resolveAction(
      String(command),
      actor,
      [actor, ...targets],
      { map: new MapPositionService().createRuntimeMap(options.vttMap) },
    );

    expect(result.outcome).not.toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.structuredAction).toMatchObject({
      spellId: "spell.ray_of_frost",
      damageType: "cold",
    });
    expect(result.stateChanges).toEqual([
      expect.objectContaining({
        sessionCharacterId: "token_node_rule_smoke_condition_goblin",
        conditions: expect.arrayContaining([
          expect.objectContaining({
            conditionId: "condition.spell.ray_of_frost",
            tags: ["movement_speed_penalty:10"],
          }),
        ]),
      }),
    ]);
  });

  it("covers concentration runtime with an executable AoE smoke command", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const aoeNode = smokeNodes.find((node) => node.id === "node_rule_smoke_aoe");
    const meta = JSON.parse(String(aoeNode?.nodeMetaJson ?? "{}")) as {
      smokeTest?: { suggestedCommands?: string[] };
    };
    const command = meta.smokeTest?.suggestedCommands?.find((entry) =>
      entry.startsWith("/cast_area fireball "),
    );
    const options = JSON.parse(String(aoeNode?.checkOptionsJson ?? "{}")) as {
      vttMap?: { tokens?: Array<{ id: string; name?: string; isHostile?: boolean }> } | null;
    };
    const targets = options.vttMap?.tokens?.map(createSmokeTarget) ?? [];

    expect(command).toBeDefined();
    const result = createActionRuleService().resolveAction(
      String(command),
      createSmokeActor(),
      [createSmokeActor(), ...targets],
      { map: new MapPositionService().createRuntimeMap(options.vttMap) },
    );
    const structuredAction = result.structuredAction as {
      aoe?: {
        concentrationChecks?: Array<{
          targetId: string;
          concentrationMaintained: boolean;
        }>;
      };
    };

    expect(result.outcome).not.toBe(ActionOutcome.IMPOSSIBLE);
    expect(structuredAction.aoe?.concentrationChecks).toEqual([
      expect.objectContaining({
        targetId: "token_node_rule_smoke_aoe_goblin",
        concentrationMaintained: expect.any(Boolean),
      }),
    ]);
  });

  it("requires the P0 representative spell API paths in the smoke fixture", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();
    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> =>
        node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID
      );
    const actionKinds = smokeNodes.flatMap((node) => {
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        smokeTest?: { apiActions?: Array<{ kind?: string }> };
      };
      return meta.smokeTest?.apiActions?.map((action) => action.kind) ?? [];
    });

    expect(actionKinds).toEqual(expect.arrayContaining([
      "cast_burning_hands",
      "cast_thunderwave",
      "cast_entangle",
      "cast_bless",
      "cast_bane",
      "cast_detect_magic",
    ]));
  });

  it("keeps rule runtime smoke suggested commands executable by the action resolver", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const commandContexts = smokeNodes.flatMap((node) => {
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        smokeTest?: { suggestedCommands?: string[] };
      };
      const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
        vttMap?: { tokens?: Array<{ id: string; name?: string; isHostile?: boolean }> } | null;
      };
      return (meta.smokeTest?.suggestedCommands ?? []).map((command) => ({
        command,
        tokens: options.vttMap?.tokens ?? [],
        map: options.vttMap ?? null,
      }));
    });

    expect(commandContexts.length).toBeGreaterThan(0);
    const mapPositions = new MapPositionService();
    for (const { command, tokens, map } of commandContexts) {
      const actor = createSmokeActor();
      const targets = tokens.map(createSmokeTarget);
      const result = createActionRuleService().resolveAction(command, actor, [actor, ...targets], {
        map: mapPositions.createRuntimeMap(map),
      });

      expect(result.outcome).not.toBe(ActionOutcome.IMPOSSIBLE);
      expect(result.structuredAction).not.toMatchObject({
        rejectedReason: expect.any(String),
      });
    }
  });

  it("seeds terrain effects on rule runtime smoke maps through the VTT terrainCells field", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const nodesWithTerrainVerification = smokeNodes.filter((node) => {
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        smokeTest?: { verifies?: string[] };
      };
      return meta.smokeTest?.verifies?.some((entry) => entry.includes("terrain")) === true;
    });

    expect(nodesWithTerrainVerification.length).toBeGreaterThan(0);
    for (const node of nodesWithTerrainVerification) {
      const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
        vttMap?: {
          terrain?: unknown[];
          terrainCells?: Array<{ terrainEffectId?: string }>;
        };
      };
      expect(options.vttMap?.terrain).toBeUndefined();
      expect(options.vttMap?.terrainCells?.map((cell) => cell.terrainEffectId)).toEqual(
        expect.arrayContaining(["terrain.burning", "terrain.poison_cloud"]),
      );
    }
  });

  it("seeds cover smoke maps with objectCells that CombatService can use as cover blockers", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const coverNodes = smokeNodes.filter((node) => {
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        smokeTest?: { verifies?: string[] };
      };
      return meta.smokeTest?.verifies?.includes("cover-position") === true;
    });

    expect(coverNodes.length).toBeGreaterThan(0);
    for (const node of coverNodes) {
      const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
        vttMap?: {
          tokens?: Array<{ coverLevel?: string }>;
          objectCells?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
        };
      };
      expect(options.vttMap?.tokens?.some((token) => token.coverLevel)).toBe(false);
      expect(options.vttMap?.objectCells).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringContaining("cover"),
            x: expect.any(Number),
            y: expect.any(Number),
            width: expect.any(Number),
            height: expect.any(Number),
          }),
        ]),
      );
    }
  });

  it("keeps rule runtime smoke maps compatible with the VTT map state shape", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const mapNodes = smokeNodes.filter((node) => {
      const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
        vttMap?: unknown;
      };
      return Boolean(options.vttMap);
    });

    expect(mapNodes.length).toBeGreaterThan(0);
    for (const node of mapNodes) {
      const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
        vttMap?: {
          id?: string;
          gridType?: string;
          gridSize?: number;
          width?: number;
          height?: number;
          tokens?: unknown[];
          fogRects?: unknown[];
          updatedAt?: string;
        };
      };
      expect(options.vttMap).toMatchObject({
        id: expect.any(String),
        gridType: "square",
        gridSize: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
        updatedAt: expect.any(String),
      });
      expect(Array.isArray(options.vttMap?.tokens)).toBe(true);
      expect(Array.isArray(options.vttMap?.fogRects)).toBe(true);
    }
  });

  it("provides executable HUMAN GM override smoke actions for the terminal node", async () => {
    const { scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    const smokeNodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === RULE_RUNTIME_SMOKE_SCENARIO_ID);
    const humanGmNode = smokeNodes.find((node) => node.id === "node_rule_smoke_human_gm");

    expect(humanGmNode).toBeDefined();

    const clues = JSON.parse(String(humanGmNode?.cluesJson ?? "[]")) as Array<{ id: string }>;
    const clueIds = new Set(clues.map((clue) => clue.id));
    const options = JSON.parse(String(humanGmNode?.checkOptionsJson ?? "{}")) as {
      vttMap?: { tokens?: Array<{ id: string }> };
    };
    const tokenIds = new Set(options.vttMap?.tokens?.map((token) => token.id) ?? []);
    const meta = JSON.parse(String(humanGmNode?.nodeMetaJson ?? "{}")) as {
      smokeTest?: {
        manualActions?: Array<{
          kind: string;
          targetId?: string;
          statePatch?: Record<string, unknown>;
        }>;
      };
    };
    const manualActions = meta.smokeTest?.manualActions ?? [];

    expect(manualActions.map((action) => action.kind)).toEqual([
      "scene_text",
      "reveal_handout",
      "adjust_hp",
      "ai_assist_accept",
    ]);
    expect(manualActions.find((action) => action.kind === "reveal_handout")?.targetId).toBe(
      "clue_rule_smoke_gm_override",
    );
    expect(clueIds.has("clue_rule_smoke_gm_override")).toBe(true);
    expect(manualActions.find((action) => action.kind === "reveal_handout")?.statePatch).toMatchObject({
      contentId: "clue_rule_smoke_gm_override",
      contentKind: "clue",
      scope: "party",
    });
    expect(manualActions.find((action) => action.kind === "adjust_hp")?.statePatch).toMatchObject({
      targetType: "combatParticipant",
      currentHp: expect.any(Number),
    });
    expect(tokenIds.has(String(manualActions.find((action) => action.kind === "adjust_hp")?.targetId))).toBe(
      true,
    );
  });

  it("seeds the P2 level 5 validation scenario with catalog references, terrain, objects, and five monster kinds", async () => {
    const { scenarioUpserts, scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    expect(scenarioUpserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: { id: P2_VALIDATION_SCENARIO_ID },
          create: expect.objectContaining({
            startNodeId: P2_VALIDATION_START_NODE_ID,
            startLevel: 5,
            recommendedEndLevel: 5,
          }),
        }),
      ]),
    );

    const p2Nodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === P2_VALIDATION_SCENARIO_ID);
    const terrainIds = new Set<string>();
    const monsterIds = new Set<string>();
    const objectActions = new Set<string>();

    for (const node of p2Nodes) {
      const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
        vttMap?: {
          tokens?: Array<{ monster?: { id?: string } | null }>;
          terrainCells?: Array<{ terrainEffectId?: string }>;
          doorCells?: Array<{ canBreak?: boolean }>;
          objectCells?: Array<{ canBreak?: boolean; hiddenItemIds?: string[] }>;
        } | null;
      };
      options.vttMap?.tokens?.forEach((token) => {
        if (token.monster?.id) monsterIds.add(token.monster.id);
      });
      options.vttMap?.terrainCells?.forEach((cell) => {
        if (cell.terrainEffectId) terrainIds.add(cell.terrainEffectId);
      });
      if (options.vttMap?.doorCells?.length) objectActions.add("door");
      if (options.vttMap?.objectCells?.some((cell) => cell.canBreak)) objectActions.add("break");
      if (options.vttMap?.objectCells?.some((cell) => cell.hiddenItemIds?.length)) objectActions.add("investigate");
    }

    expect(monsterIds.size).toBeGreaterThanOrEqual(5);
    expect(terrainIds.size).toBeGreaterThanOrEqual(3);
    expect(objectActions).toEqual(new Set(["door", "break", "investigate"]));
  });

  it("seeds the P4 level 12 validation campaign with spells, monsters, economy, and revision checks", async () => {
    const { scenarioUpserts, scenarioNodeUpserts } = await seedDefaultScenarioIntoMock();

    expect(scenarioUpserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: { id: P4_VALIDATION_SCENARIO_ID },
          create: expect.objectContaining({
            startNodeId: P4_VALIDATION_START_NODE_ID,
            startLevel: 12,
            recommendedEndLevel: 12,
          }),
        }),
      ]),
    );

    const p4Nodes = scenarioNodeUpserts
      .map((args) => args.create)
      .filter((node): node is Record<string, unknown> => node?.scenarioId === P4_VALIDATION_SCENARIO_ID);
    expect(p4Nodes.map((node) => node.id)).toEqual([
      P4_VALIDATION_START_NODE_ID,
      "node_p4_crown_market",
      "node_p4_crown_observatory",
      "node_p4_crown_siege",
      "node_p4_crown_downtime",
      "node_p4_crown_lich_gate",
      "node_p4_crown_end",
    ]);

    const monsterIds = new Set<string>();
    const spellIds = new Set<string>();
    const economyChecks = new Set<string>();
    const verifies = new Set<string>();
    const nodeTypeCounts = new Map<string, number>();
    const aiHumanReadyNodeIds = new Set<string>();
    const itemDefinitionIds = new Set<string>();

    for (const node of p4Nodes) {
      const nodeType = String(node.nodeType ?? "unknown");
      nodeTypeCounts.set(nodeType, (nodeTypeCounts.get(nodeType) ?? 0) + 1);
      const options = JSON.parse(String(node.checkOptionsJson ?? "{}")) as {
        vttMap?: {
          tokens?: Array<{ monster?: { id?: string } | null }>;
          objectCells?: Array<{ hiddenItemIds?: string[]; canBreak?: boolean }>;
        } | null;
      };
      const meta = JSON.parse(String(node.nodeMetaJson ?? "{}")) as {
        p4Scenario?: {
          gmModes?: string[];
          verifies?: string[];
          usefulSpells?: string[];
          monsterIds?: string[];
          economyActions?: Array<{ kind?: string; itemDefinitionId?: string }>;
          craftingRecipe?: {
            recipeId?: string;
            outputItemDefinitionId?: string;
            requiredMaterials?: string[];
          };
          validatesRevisionSnapshot?: boolean;
          validatesCollaborationPolicy?: boolean;
        };
      };
      options.vttMap?.tokens?.forEach((token) => {
        if (token.monster?.id) monsterIds.add(token.monster.id);
      });
      options.vttMap?.objectCells?.forEach((cell) => {
        cell.hiddenItemIds?.forEach((itemId) => itemDefinitionIds.add(itemId));
      });
      meta.p4Scenario?.monsterIds?.forEach((monsterId) => monsterIds.add(monsterId));
      meta.p4Scenario?.usefulSpells?.forEach((spellId) => spellIds.add(spellId));
      meta.p4Scenario?.economyActions?.forEach((action) => {
        if (action.kind) economyChecks.add(action.kind);
        if (action.itemDefinitionId) itemDefinitionIds.add(action.itemDefinitionId);
      });
      if (meta.p4Scenario?.craftingRecipe?.recipeId) {
        economyChecks.add("crafting");
        if (meta.p4Scenario.craftingRecipe.outputItemDefinitionId) {
          itemDefinitionIds.add(meta.p4Scenario.craftingRecipe.outputItemDefinitionId);
        }
        meta.p4Scenario.craftingRecipe.requiredMaterials?.forEach((itemId) => itemDefinitionIds.add(itemId));
      }
      meta.p4Scenario?.verifies?.forEach((entry) => verifies.add(entry));
      if (meta.p4Scenario?.validatesRevisionSnapshot) verifies.add("revision_snapshot");
      if (meta.p4Scenario?.validatesCollaborationPolicy) verifies.add("collaboration_policy");
      if (JSON.stringify(meta.p4Scenario?.gmModes) === JSON.stringify(["AI", "HUMAN"])) {
        aiHumanReadyNodeIds.add(String(node.id));
      }
    }

    expect(nodeTypeCounts.get("story")).toBeGreaterThanOrEqual(2);
    expect(nodeTypeCounts.get("exploration")).toBeGreaterThanOrEqual(3);
    expect(nodeTypeCounts.get("combat")).toBeGreaterThanOrEqual(2);
    expect(aiHumanReadyNodeIds).toEqual(new Set(p4Nodes.map((node) => String(node.id))));
    expect(monsterIds.size).toBeGreaterThanOrEqual(12);
    expect([...monsterIds]).toEqual(
      expect.arrayContaining([
        "monster.archmage",
        "monster.medusa",
        "monster.roper",
        "monster.fire_giant",
        "monster.chimera",
        "monster.air_elemental",
        "monster.lich",
        "monster.young_black_dragon",
        "monster.purple_worm",
        "monster.vampire",
      ]),
    );
    expect(spellIds.size).toBeGreaterThanOrEqual(10);
    expect([...spellIds]).toEqual(
      expect.arrayContaining([
        "spell.cone_of_cold",
        "spell.chain_lightning",
        "spell.disintegrate",
        "spell.heal",
        "spell.wall_of_force",
      ]),
    );
    expect([...economyChecks]).toEqual(
      expect.arrayContaining(["purchase", "sell", "identify", "attune", "recover_charges", "repair", "crafting"]),
    );
    expect([...itemDefinitionIds]).toEqual(
      expect.arrayContaining([
        "equipment.potion_of_healing",
        "magic_item.necklace_of_fireballs",
        "magic_item.ring_of_protection",
        "magic_item.wand_of_web",
        "equipment.방패",
        "magic_item.immovable_rod",
        "equipment.crowbar",
      ]),
    );
    for (const itemDefinitionId of itemDefinitionIds) {
      expect(getExecutableItemDefinition(itemDefinitionId)).toBeTruthy();
    }
    expect([...verifies]).toEqual(
      expect.arrayContaining([
        "level-12-progression",
        "p4_spells_combat",
        "p4_monster_recharge",
        "attune_item",
        "recover_item_charges",
        "crafting_started",
        "revision_snapshot",
        "collaboration_policy",
      ]),
    );
  });
});
