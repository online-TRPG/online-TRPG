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
import { MapPositionService } from "../../modules/rules/map-position.service";
import { RuleEngineService } from "../../modules/rules/rule-engine.service";
import { RULE_RUNTIME_SMOKE_SCENARIO_ID, seedDefaultScenario } from "./default-scenario";

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

const createActionRuleService = (): ActionRuleService => {
  const queuedRolls = [
    createDiceResult("1d20", [15]),
    createDiceResult("1d20+2", [18], 2),
    createDiceResult("1d6", [4]),
    createDiceResult("9d6", [6, 5, 4, 4, 3, 3, 2, 2, 1]),
    createDiceResult("1d20", [6]),
    createDiceResult("1d20", [18]),
  ];
  const diceService = {
    roll: jest.fn(() => {
      const roll = queuedRolls.shift();
      if (!roll) {
        throw new Error("No smoke dice result remained.");
      }
      return roll;
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
  inventorySnapshotJson: null,
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
    spellsJson: null,
    inventoryJson: "[]",
    equippedWeaponId: null,
  },
});

const createSmokeTarget = (token: { id: string; name?: string; isHostile?: boolean }): SmokeSessionCharacter => ({
  id: token.id,
  tokenId: token.id,
  userId: `${token.id}-user`,
  characterId: `${token.id}-character`,
  currentHp: 20,
  tempHp: 0,
  conditionsJson: token.isHostile ? JSON.stringify(["hostile"]) : "[]",
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
      return conditionMatch ? [conditionMatch[1]] : [];
    });

    expect(commandTargetIds.length).toBeGreaterThan(0);
    expect(commandTargetIds.every((targetId) => tokenIds.has(targetId))).toBe(true);
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
      }));
    });

    expect(commandContexts.length).toBeGreaterThan(0);
    for (const { command, tokens } of commandContexts) {
      const actor = createSmokeActor();
      const targets = tokens.map(createSmokeTarget);
      const result = createActionRuleService().resolveAction(command, actor, [actor, ...targets]);

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
});
