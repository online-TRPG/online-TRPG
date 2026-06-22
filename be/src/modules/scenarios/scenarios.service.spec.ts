import {
  ScenarioLicense as PrismaScenarioLicense,
  ScenarioSourceType as PrismaScenarioSourceType,
} from "@prisma/client";
import { ScenariosService } from "./scenarios.service";

const date = new Date("2026-06-22T00:00:00.000Z");

function buildScenario(overrides: Record<string, unknown> = {}) {
  return {
    id: "scenario_draft",
    title: "Draft Adventure",
    description: "Draft description",
    createdByUserId: "creator-1",
    sourceType: PrismaScenarioSourceType.USER,
    baseScenarioId: null,
    thumbnailUrl: null,
    ruleSetId: "dnd5e",
    difficulty: "normal",
    startLevel: 8,
    recommendedEndLevel: 8,
    license: PrismaScenarioLicense.ORIGINAL,
    attribution: "Original attribution",
    startNodeId: "node_a",
    npcsJson: "[]",
    createdAt: date,
    updatedAt: date,
    nodes: [
      {
        id: "node_a",
        scenarioId: "scenario_draft",
        nodeType: "story",
        title: "Node A",
        sceneText: "Start",
        imageUrl: null,
        checkOptionsJson: JSON.stringify({ checks: [], vttMap: null }),
        transitionsJson: JSON.stringify([{ condition: "default", nextNodeId: "node_b" }]),
        cluesJson: "[]",
        nodeMetaJson: null,
        fallbackNodeId: "node_b",
        createdAt: date,
        updatedAt: date,
      },
      {
        id: "node_b",
        scenarioId: "scenario_draft",
        nodeType: "combat",
        title: "Node B",
        sceneText: "Fight",
        imageUrl: null,
        checkOptionsJson: JSON.stringify({
          checks: [],
          vttMap: {
            id: "map_node_b",
            scenarioNodeId: "node_b",
            tokens: [],
          },
        }),
        transitionsJson: "[]",
        cluesJson: "[]",
        nodeMetaJson: null,
        fallbackNodeId: null,
        createdAt: date,
        updatedAt: date,
      },
    ],
    ...overrides,
  };
}

function createService() {
  const prisma = {
    scenario: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    service: new ScenariosService(prisma as never),
    prisma,
  };
}

describe("ScenariosService P3 revision publishing", () => {
  it("publishes a draft as an immutable revision copy with rewritten node references", async () => {
    const { service, prisma } = createService();
    const draft = buildScenario();
    prisma.scenario.findUnique.mockResolvedValue(draft);
    prisma.scenario.count.mockResolvedValue(0);
    prisma.scenario.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        createdAt: date,
        updatedAt: date,
        nodes: data.nodes.create.map((node: Record<string, unknown>) => ({
          ...node,
          scenarioId: data.id,
          createdAt: date,
          updatedAt: date,
        })),
      }),
    );

    const result = await service.publishScenario("creator-1", "scenario_draft", {
      changelog: "Initial release",
      visibility: "public",
    });

    expect(prisma.scenario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: PrismaScenarioSourceType.CLONED,
          baseScenarioId: "scenario_draft",
          startNodeId: expect.stringMatching(/^scenario_draft_rev_1_.*_node_a$/),
          attribution: expect.stringContaining("P3_REVISION_META:"),
        }),
      }),
    );
    const createArg = prisma.scenario.create.mock.calls[0][0].data;
    expect(createArg.nodes.create[0]).toEqual(
      expect.objectContaining({
        id: `${createArg.id}_node_a`,
        fallbackNodeId: `${createArg.id}_node_b`,
      }),
    );
    expect(JSON.parse(createArg.nodes.create[0].transitionsJson)).toEqual([
      { condition: "default", nextNodeId: `${createArg.id}_node_b` },
    ]);
    expect(JSON.parse(createArg.nodes.create[1].checkOptionsJson).vttMap).toEqual({
      id: "map_node_b",
      scenarioNodeId: `${createArg.id}_node_b`,
      tokens: [],
    });
    expect(result).toMatchObject({
      baseScenarioId: "scenario_draft",
      revisionNumber: 1,
      changelog: "Initial release",
      publishStatus: "public",
      attribution: "Original attribution",
      validationReport: expect.objectContaining({
        status: "valid",
        issueCount: 0,
        nodeCounts: { story: 1, exploration: 0, combat: 1, other: 0 },
      }),
    });
  });

  it("rejects publishing when a fallback node points outside the draft", async () => {
    const { service, prisma } = createService();
    prisma.scenario.findUnique.mockResolvedValue(
      buildScenario({
        nodes: buildScenario().nodes.map((node) =>
          node.id === "node_b" ? { ...node, fallbackNodeId: "missing_node" } : node,
        ),
      }),
    );

    await expect(
      service.publishScenario("creator-1", "scenario_draft", {
        changelog: null,
        visibility: "public",
      }),
    ).rejects.toThrow("발행할 수 없는 fallback 노드가 있습니다: missing_node");
    expect(prisma.scenario.create).not.toHaveBeenCalled();
  });

  it("lists provided scenarios and public revisions, but excludes private/link/unpublished revisions from public discovery", async () => {
    const { service, prisma } = createService();
    const publicRevision = buildScenario({
      id: "public-revision",
      sourceType: PrismaScenarioSourceType.CLONED,
      baseScenarioId: "scenario_draft",
      attribution:
        'P3_REVISION_META:{"revisionNumber":1,"changelog":null,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}',
    });
    const linkRevision = buildScenario({
      id: "link-revision",
      sourceType: PrismaScenarioSourceType.CLONED,
      baseScenarioId: "scenario_draft",
      attribution:
        'P3_REVISION_META:{"revisionNumber":2,"changelog":null,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"link"}',
    });
    const unpublishedRevision = buildScenario({
      id: "unpublished-revision",
      sourceType: PrismaScenarioSourceType.CLONED,
      baseScenarioId: "scenario_draft",
      attribution:
        'P3_REVISION_META:{"revisionNumber":3,"changelog":null,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"unpublished"}',
    });
    const provided = buildScenario({
      id: "scenario_p3_skybreaker_archive",
      sourceType: PrismaScenarioSourceType.SYSTEM,
      attribution: "Provided",
    });
    prisma.scenario.findMany.mockResolvedValue([
      publicRevision,
      linkRevision,
      unpublishedRevision,
      provided,
    ]);

    await expect(service.listScenarios()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "public-revision", publishStatus: "public" }),
        expect.objectContaining({ id: "scenario_p3_skybreaker_archive" }),
      ]),
    );
    const listed = await service.listScenarios();
    expect(listed.map((scenario) => scenario.id)).not.toContain("link-revision");
    expect(listed.map((scenario) => scenario.id)).not.toContain("unpublished-revision");
  });

  it("allows link revisions by id, hides private revisions from other users, and keeps owner access", async () => {
    const { service, prisma } = createService();
    const linkRevision = buildScenario({
      id: "link-revision",
      createdByUserId: "creator-1",
      sourceType: PrismaScenarioSourceType.CLONED,
      baseScenarioId: "scenario_draft",
      attribution:
        'P3_REVISION_META:{"revisionNumber":2,"changelog":null,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"link"}',
    });
    const privateRevision = buildScenario({
      id: "private-revision",
      createdByUserId: "creator-1",
      sourceType: PrismaScenarioSourceType.CLONED,
      baseScenarioId: "scenario_draft",
      attribution:
        'P3_REVISION_META:{"revisionNumber":3,"changelog":null,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"private"}',
    });

    prisma.scenario.findUnique.mockResolvedValueOnce(linkRevision);
    await expect(service.getScenario("link-revision", "other-user")).resolves.toMatchObject({
      id: "link-revision",
      publishStatus: "link",
    });

    prisma.scenario.findUnique.mockResolvedValueOnce(privateRevision);
    await expect(service.getScenario("private-revision", "other-user")).rejects.toThrow(
      "Scenario private-revision was not found",
    );

    prisma.scenario.findUnique.mockResolvedValueOnce(privateRevision);
    await expect(service.getScenario("private-revision", "creator-1")).resolves.toMatchObject({
      id: "private-revision",
      publishStatus: "private",
    });
  });

  it("unpublishes a revision without deleting the revision record", async () => {
    const { service, prisma } = createService();
    const revision = buildScenario({
      id: "revision-1",
      createdByUserId: "creator-1",
      sourceType: PrismaScenarioSourceType.CLONED,
      baseScenarioId: "scenario_draft",
      attribution:
        'Original attribution\nP3_REVISION_META:{"revisionNumber":1,"changelog":"Initial","publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}',
    });
    prisma.scenario.findUnique.mockResolvedValue(revision);
    prisma.scenario.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...revision,
        attribution: data.attribution,
      }),
    );

    const result = await service.unpublishScenarioRevision("creator-1", "revision-1");

    expect(prisma.scenario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "revision-1" },
        data: {
          attribution: expect.stringContaining('"status":"unpublished"'),
        },
      }),
    );
    expect(result).toMatchObject({
      id: "revision-1",
      publishStatus: "unpublished",
      revisionNumber: 1,
      changelog: "Initial",
      attribution: "Original attribution",
    });
  });
});
