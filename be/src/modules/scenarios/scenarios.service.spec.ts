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
    attribution:
      'Original attribution\nP4_COLLAB_META:{"collaborators":[{"userId":"reviewer-1","role":"reviewer"}],"reviews":[{"reviewId":"review-1","requestedByUserId":"creator-1","reviewerUserId":"reviewer-1","status":"approved","comment":"Approved for release.","decidedAt":"2026-06-22T00:00:00.000Z"}]}',
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
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    scenarioNode: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    sessionParticipant: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") {
      return input(prisma);
    }
    return Promise.all(input as Promise<unknown>[]);
  });
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
        p4Policy: expect.objectContaining({
          status: "valid",
          blockerCount: 0,
          reviewGate: "enforced_by_policy_service",
        }),
      }),
    });
  });

  it("rejects public publishing until a P4 review approval is recorded", async () => {
    const { service, prisma } = createService();
    prisma.scenario.findUnique.mockResolvedValue(
      buildScenario({
        attribution: "Original attribution",
      }),
    );

    await expect(
      service.publishScenario("creator-1", "scenario_draft", {
        changelog: null,
        visibility: "public",
      }),
    ).rejects.toThrow("public/link 발행 전 reviewer 승인이 필요합니다.");
    expect(prisma.scenario.create).not.toHaveBeenCalled();
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

  it("rejects publishing when P4 policy detects private GM data exposure", async () => {
    const { service, prisma } = createService();
    prisma.scenario.findUnique.mockResolvedValue(
      buildScenario({
        nodes: buildScenario().nodes.map((node) =>
          node.id === "node_a"
            ? {
                ...node,
                nodeMetaJson: JSON.stringify({
                  publicSummary: "safe",
                  gmOnlyNotes: "Ambush timing must not be published.",
                }),
              }
            : node,
        ),
      }),
    );

    await expect(
      service.publishScenario("creator-1", "scenario_draft", {
        changelog: null,
        visibility: "public",
      }),
    ).rejects.toThrow("공개 발행 전에 GM/private 전용 데이터 노출 표시를 제거하거나 공개 제외 처리해야 합니다.");
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

  it("lets an editor collaborator update a draft but keeps viewer collaborators read-only", async () => {
    const { service, prisma } = createService();
    const collaborativeDraft = buildScenario({
      attribution:
        'Original attribution\nP4_COLLAB_META:{"collaborators":[{"userId":"editor-1","role":"editor"},{"userId":"viewer-1","role":"viewer"}],"reviews":[]}',
    });
    const editedDraft = buildScenario({
      ...collaborativeDraft,
      title: "Editor Updated Adventure",
    });
    prisma.scenario.findUnique
      .mockResolvedValueOnce(collaborativeDraft)
      .mockResolvedValueOnce(editedDraft)
      .mockResolvedValueOnce(collaborativeDraft);
    prisma.scenario.update.mockResolvedValue(editedDraft);

    await expect(
      service.updateScenario("editor-1", "scenario_draft", {
        title: "Editor Updated Adventure",
      }),
    ).resolves.toMatchObject({
      id: "scenario_draft",
      title: "Editor Updated Adventure",
    });

    expect(prisma.scenario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "scenario_draft" },
        data: expect.objectContaining({
          title: "Editor Updated Adventure",
        }),
      }),
    );

    await expect(
      service.updateScenario("viewer-1", "scenario_draft", {
        title: "Viewer Update Attempt",
      }),
    ).rejects.toThrow("시나리오 draft를 편집할 권한이 없습니다.");
  });

  it("rejects a stale collaborative save using expectedUpdatedAt", async () => {
    const { service, prisma } = createService();
    prisma.scenario.findUnique.mockResolvedValue(buildScenario());

    await expect(
      service.updateScenario("creator-1", "scenario_draft", {
        title: "Stale update",
        expectedUpdatedAt: "2026-06-21T00:00:00.000Z",
      }),
    ).rejects.toThrow("다른 편집자가 먼저 시나리오를 저장했습니다.");
    expect(prisma.scenario.update).not.toHaveBeenCalled();
  });

  it("separates review requests from reviewer decisions", async () => {
    const { service, prisma } = createService();
    const draft = buildScenario({
      attribution:
        'Original attribution\nP4_COLLAB_META:{"collaborators":[{"userId":"editor-1","role":"editor"},{"userId":"reviewer-1","role":"reviewer"}],"reviews":[]}',
    });
    prisma.scenario.findUnique.mockResolvedValue(draft);
    prisma.scenario.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...draft,
        ...data,
      }),
    );

    await expect(
      service.createScenarioReview("editor-1", "scenario_draft", {
        status: "requested",
        reviewerUserId: "reviewer-1",
        comment: "검토를 부탁합니다.",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reviews: expect.arrayContaining([
          expect.objectContaining({
            requestedByUserId: "editor-1",
            reviewerUserId: "reviewer-1",
            status: "requested",
          }),
        ]),
      }),
    );

    await expect(
      service.createScenarioReview("creator-1", "scenario_draft", {
        status: "approved",
      }),
    ).rejects.toThrow("review를 기록할 권한이 없습니다.");
  });

  it("allows collaborators to view the shared draft without exposing it to non-collaborators", async () => {
    const { service, prisma } = createService();
    const collaborativeDraft = buildScenario({
      attribution:
        'Original attribution\nP4_COLLAB_META:{"collaborators":[{"userId":"editor-1","role":"editor"},{"userId":"reviewer-1","role":"reviewer"},{"userId":"viewer-1","role":"viewer"}],"reviews":[]}',
    });

    prisma.scenario.findUnique.mockResolvedValueOnce(collaborativeDraft);
    await expect(service.getScenario("scenario_draft", "reviewer-1")).resolves.toMatchObject({
      id: "scenario_draft",
      title: "Draft Adventure",
    });

    prisma.scenario.findUnique.mockResolvedValueOnce(collaborativeDraft);
    await expect(service.getScenario("scenario_draft", "outsider-1")).rejects.toThrow(
      "Scenario scenario_draft was not found",
    );
  });

  it("includes collaborator drafts in the mine list without exposing unrelated user drafts", async () => {
    const { service, prisma } = createService();
    const ownDraft = buildScenario({ id: "own-draft", createdByUserId: "editor-1" });
    const sharedDraft = buildScenario({
      id: "shared-draft",
      createdByUserId: "creator-1",
      attribution:
        'Original attribution\nP4_COLLAB_META:{"collaborators":[{"userId":"editor-1","role":"editor"}],"reviews":[]}',
    });
    const unrelatedDraft = buildScenario({
      id: "unrelated-draft",
      createdByUserId: "creator-2",
      attribution: "Original attribution",
    });
    prisma.scenario.findMany.mockResolvedValue([ownDraft, sharedDraft, unrelatedDraft]);

    await expect(service.listMyScenarios("editor-1")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "own-draft" }),
        expect.objectContaining({ id: "shared-draft" }),
      ]),
    );
    const listed = await service.listMyScenarios("editor-1");
    expect(listed.map((scenario) => scenario.id)).not.toContain("unrelated-draft");
  });
});

describe("ScenariosService P5 public discovery ecosystem", () => {
  function buildPublicRevision(overrides: Record<string, unknown> = {}) {
    return buildScenario({
      id: "public-revision",
      createdByUserId: "creator-1",
      sourceType: PrismaScenarioSourceType.CLONED,
      baseScenarioId: "scenario_draft",
      attribution:
        'Original attribution\nP3_REVISION_META:{"revisionNumber":1,"changelog":"Initial","publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}',
      ...overrides,
    });
  }

  it("filters public discovery by level, tag, rating and hides moderated revisions", async () => {
    const { service, prisma } = createService();
    const recommended = buildPublicRevision({
      id: "recommended-revision",
      startLevel: 13,
      recommendedEndLevel: 16,
      attribution:
        'P3_REVISION_META:{"revisionNumber":1,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}\nP5_PUBLIC_META:{"tags":["high-level","travel"],"estimatedMinutes":300,"gmMode":"BOTH","contentWarnings":["storm"],"ratings":[{"userId":"player-1","rating":5,"review":"Great","updatedAt":"2026-06-23T00:00:00.000Z"},{"userId":"player-2","rating":4,"review":null,"updatedAt":"2026-06-23T00:00:00.000Z"}],"forkCount":2,"moderationStatus":"visible","reports":[],"lineage":{"sourceScenarioId":"scenario_draft","sourceRevisionId":"recommended-revision","forkedFromScenarioId":null,"forkedAt":null,"forkedByUserId":null}}',
    });
    const hidden = buildPublicRevision({
      id: "hidden-revision",
      startLevel: 13,
      recommendedEndLevel: 16,
      attribution:
        'P3_REVISION_META:{"revisionNumber":1,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}\nP5_PUBLIC_META:{"tags":["high-level"],"estimatedMinutes":240,"gmMode":"AI","contentWarnings":[],"ratings":[{"userId":"player-1","rating":5,"review":null,"updatedAt":"2026-06-23T00:00:00.000Z"}],"forkCount":0,"moderationStatus":"hidden","reports":[],"lineage":{"sourceScenarioId":null,"sourceRevisionId":null,"forkedFromScenarioId":null,"forkedAt":null,"forkedByUserId":null}}',
    });
    prisma.scenario.findMany.mockResolvedValue([hidden, recommended]);

    const listed = await service.listScenarios({
      minLevel: 12,
      maxLevel: 16,
      tag: "high-level",
      minRating: 4,
      sort: "recommended",
    });

    expect(listed).toEqual([
      expect.objectContaining({
        id: "recommended-revision",
        tags: expect.arrayContaining(["high-level"]),
        averageRating: 4.5,
        ratingCount: 2,
        reviewCount: 1,
        forkCount: 2,
        estimatedMinutes: 300,
        moderationStatus: "visible",
        recommendationReason: expect.stringContaining("평점 4.5"),
      }),
    ]);
  });

  it("allows only completed players to create or update one rating per revision", async () => {
    const { service, prisma } = createService();
    const revision = buildPublicRevision();
    prisma.scenario.findUnique.mockResolvedValue(revision);
    prisma.sessionParticipant.count.mockResolvedValueOnce(0);

    await expect(
      service.rateScenario("player-1", "public-revision", { rating: 5, review: "Loved it." }),
    ).rejects.toThrow("플레이를 완료한 사용자만 평점과 리뷰를 남길 수 있습니다.");

    prisma.sessionParticipant.count.mockResolvedValueOnce(1);
    prisma.scenario.update.mockResolvedValue(revision);
    await expect(
      service.rateScenario("player-1", "public-revision", { rating: 5, review: "Loved it." }),
    ).resolves.toMatchObject({
      scenarioId: "public-revision",
      averageRating: 5,
      ratingCount: 1,
      reviewCount: 1,
    });
    expect(prisma.scenario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          attribution: expect.stringContaining("P5_PUBLIC_META:"),
        },
      }),
    );
  });

  it("forks a public revision into an independent draft and increments source fork count", async () => {
    const { service, prisma } = createService();
    const revision = buildPublicRevision();
    prisma.scenario.findUnique.mockResolvedValue(revision);
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
    prisma.scenario.update.mockResolvedValue(revision);

    const fork = await service.forkScenario("player-1", "public-revision", {
      title: "My Storm Vault",
    });

    expect(prisma.scenario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "My Storm Vault",
          sourceType: PrismaScenarioSourceType.USER,
          baseScenarioId: "public-revision",
          attribution: expect.stringContaining('"forkedFromScenarioId":"public-revision"'),
        }),
      }),
    );
    expect(fork).toEqual(expect.objectContaining({ title: "My Storm Vault", sourceType: "USER" }));
    expect(prisma.scenario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "public-revision" },
        data: { attribution: expect.stringContaining('"forkCount":1') },
      }),
    );
  });

  it("turns repeated reports into hidden moderation state so the revision leaves discovery", async () => {
    const { service, prisma } = createService();
    const revision = buildPublicRevision({
      attribution:
        'P3_REVISION_META:{"revisionNumber":1,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}\nP5_PUBLIC_META:{"tags":[],"estimatedMinutes":null,"gmMode":null,"contentWarnings":[],"ratings":[],"forkCount":0,"moderationStatus":"reported","reports":[{"reportId":"r1","reportedByUserId":"player-1","reason":"other","comment":null,"createdAt":"2026-06-23T00:00:00.000Z"},{"reportId":"r2","reportedByUserId":"player-2","reason":"license","comment":null,"createdAt":"2026-06-23T00:00:00.000Z"}],"lineage":{"sourceScenarioId":null,"sourceRevisionId":null,"forkedFromScenarioId":null,"forkedAt":null,"forkedByUserId":null}}',
    });
    prisma.scenario.findUnique.mockResolvedValue(revision);
    prisma.scenario.update.mockResolvedValue(revision);

    await expect(
      service.reportScenario("player-3", "public-revision", { reason: "unsafe_content" }),
    ).resolves.toMatchObject({ scenarioId: "public-revision", status: "received" });
    expect(prisma.scenario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { attribution: expect.stringContaining('"moderationStatus":"hidden"') },
      }),
    );
  });

  it("lets the published revision owner submit a moderation appeal without exposing hidden revisions in discovery", async () => {
    const { service, prisma } = createService();
    const revision = buildPublicRevision({
      createdByUserId: "creator-1",
      attribution:
        'P3_REVISION_META:{"revisionNumber":1,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}\nP5_PUBLIC_META:{"tags":["high-level"],"estimatedMinutes":240,"gmMode":"AI","contentWarnings":[],"ratings":[],"forkCount":0,"moderationStatus":"hidden","reports":[{"reportId":"r1","reportedByUserId":"player-1","reason":"other","comment":null,"createdAt":"2026-06-23T00:00:00.000Z"},{"reportId":"r2","reportedByUserId":"player-2","reason":"license","comment":null,"createdAt":"2026-06-23T00:00:00.000Z"},{"reportId":"r3","reportedByUserId":"player-3","reason":"unsafe_content","comment":null,"createdAt":"2026-06-23T00:00:00.000Z"}],"appeals":[],"lineage":{"sourceScenarioId":null,"sourceRevisionId":null,"forkedFromScenarioId":null,"forkedAt":null,"forkedByUserId":null}}',
    });
    prisma.scenario.findUnique.mockResolvedValue(revision);
    prisma.scenario.update.mockResolvedValue(revision);

    await expect(
      service.appealScenarioModeration("creator-1", "public-revision", {
        message: "신고 사유를 수정했습니다. 재검토 부탁드립니다.",
      }),
    ).resolves.toMatchObject({ scenarioId: "public-revision", status: "submitted" });
    expect(prisma.scenario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          attribution: expect.stringContaining('"appeals":[{"appealId":"scenario-appeal:'),
        },
      }),
    );

    await expect(
      service.appealScenarioModeration("player-1", "public-revision", {
        message: "대신 요청합니다.",
      }),
    ).rejects.toThrow("시나리오 owner만 moderation 이의 제기를 남길 수 있습니다.");
  });

  it("treats provided P5 scenarios as public ecosystem targets for rating and fork validation", async () => {
    const { service, prisma } = createService();
    const providedP5 = buildScenario({
      id: "scenario_p5_astral_seal_campaign",
      createdByUserId: null,
      sourceType: PrismaScenarioSourceType.SYSTEM,
      baseScenarioId: null,
      startLevel: 16,
      recommendedEndLevel: 16,
      attribution:
        'P5_PUBLIC_META:{"tags":["p5","level-16"],"estimatedMinutes":300,"gmMode":"BOTH","contentWarnings":[],"ratings":[],"forkCount":0,"moderationStatus":"visible","reports":[],"lineage":{"sourceScenarioId":null,"sourceRevisionId":null,"forkedFromScenarioId":null,"forkedAt":null,"forkedByUserId":null}}',
    });
    prisma.scenario.findUnique.mockResolvedValue(providedP5);
    prisma.sessionParticipant.count.mockResolvedValueOnce(1);
    prisma.scenario.update.mockResolvedValue(providedP5);

    await expect(
      service.rateScenario("player-1", "scenario_p5_astral_seal_campaign", {
        rating: 5,
        review: "P5 검증 캠페인 완료",
      }),
    ).resolves.toMatchObject({
      scenarioId: "scenario_p5_astral_seal_campaign",
      averageRating: 5,
      ratingCount: 1,
    });

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

    await expect(
      service.forkScenario("player-1", "scenario_p5_astral_seal_campaign", {
        title: "내 성좌 봉인 원정",
      }),
    ).resolves.toMatchObject({
      title: "내 성좌 봉인 원정",
      sourceType: "USER",
      baseScenarioId: "scenario_p5_astral_seal_campaign",
    });
  });

  it("excludes hidden provided scenarios from public discovery", async () => {
    const { service, prisma } = createService();
    prisma.scenario.findMany.mockResolvedValue([
      buildScenario({
        id: "scenario_p5_astral_seal_campaign",
        sourceType: PrismaScenarioSourceType.SYSTEM,
        attribution:
          'P5_PUBLIC_META:{"tags":["p5"],"estimatedMinutes":300,"gmMode":"BOTH","contentWarnings":[],"ratings":[],"forkCount":0,"moderationStatus":"hidden","reports":[],"lineage":{"sourceScenarioId":null,"sourceRevisionId":null,"forkedFromScenarioId":null,"forkedAt":null,"forkedByUserId":null}}',
      }),
    ]);

    await expect(service.listScenarios({ tag: "p5" })).resolves.toEqual([]);
  });
});
