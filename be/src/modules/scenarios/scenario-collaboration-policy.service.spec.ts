import {
  ScenarioCollaborationPolicyService,
  ScenarioPolicyDraft,
  ScenarioPolicyNode,
} from "./scenario-collaboration-policy.service";

describe("ScenarioCollaborationPolicyService P4 collaboration/review/publish policy", () => {
  let service: ScenarioCollaborationPolicyService;

  const baseNodes: ScenarioPolicyNode[] = [
    {
      id: "node-start",
      nodeType: "story",
      title: "Start",
      sceneText: "Welcome.",
      transitions: [{ nextNodeId: "node-shop" }],
      nodeMeta: { publicSummary: "safe" },
    },
    {
      id: "node-shop",
      nodeType: "exploration",
      title: "Shop",
      sceneText: "A merchant waits.",
      transitions: [],
      fallbackNodeId: null,
      checkOptions: { rewardTableId: "reward-1" },
    },
  ];

  const createDraft = (overrides: Partial<ScenarioPolicyDraft> = {}): ScenarioPolicyDraft => ({
    scenarioId: "scenario-p4-collab",
    ownerUserId: "owner-user",
    license: "ORIGINAL",
    attribution: null,
    collaborators: [
      { userId: "editor-user", role: "editor" },
      { userId: "reviewer-user", role: "reviewer" },
      { userId: "viewer-user", role: "viewer" },
    ],
    reviews: [
      {
        reviewId: "review-1",
        requestedByUserId: "owner-user",
        reviewerUserId: "reviewer-user",
        status: "approved",
        decidedAt: "2026-06-23T00:00:00.000Z",
      },
    ],
    nodes: baseNodes,
    ...overrides,
  });

  beforeEach(() => {
    service = new ScenarioCollaborationPolicyService();
  });

  it("separates owner, editor, reviewer, and viewer permissions", () => {
    const draft = createDraft();

    expect(service.resolvePermission({ draft, userId: "owner-user", action: "manage_collaborators" })).toEqual({
      allowed: true,
      role: "owner",
    });
    expect(service.resolvePermission({ draft, userId: "editor-user", action: "edit" })).toEqual({
      allowed: true,
      role: "editor",
    });
    expect(service.resolvePermission({ draft, userId: "reviewer-user", action: "review" })).toEqual({
      allowed: true,
      role: "reviewer",
    });
    expect(service.resolvePermission({ draft, userId: "owner-user", action: "request_review" })).toEqual({
      allowed: true,
      role: "owner",
    });
    expect(service.resolvePermission({ draft, userId: "owner-user", action: "review" })).toEqual({
      allowed: false,
      role: "owner",
      reason: "insufficient_role",
    });
    expect(service.resolvePermission({ draft, userId: "viewer-user", action: "edit" })).toEqual({
      allowed: false,
      role: "viewer",
      reason: "insufficient_role",
    });
    expect(service.resolvePermission({ draft, userId: "stranger", action: "view" })).toEqual({
      allowed: false,
      role: null,
      reason: "not_collaborator",
    });
  });

  it("allows owner public publish only after approval and includes revision diff", () => {
    const result = service.evaluatePublishPolicy({
      draft: createDraft({
        nodes: [
          baseNodes[0],
          { ...baseNodes[1], title: "Storm Shop", checkOptions: { rewardTableId: "reward-2" } },
          {
            id: "node-combat",
            nodeType: "combat",
            title: "Sky Fight",
            sceneText: "Enemies arrive.",
            transitions: [],
          },
        ],
      }),
      actorUserId: "owner-user",
      visibility: "public",
      previousRevisionNodes: baseNodes,
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: true,
        role: "owner",
        visibility: "public",
        validationReport: {
          status: "valid",
          issueCount: 0,
          blockerCount: 0,
          warningCount: 0,
        },
        diff: {
          addedNodeIds: ["node-combat"],
          removedNodeIds: [],
          changedNodeIds: ["node-shop"],
          changedSections: {
            "node-shop": ["title", "checkOptions"],
          },
        },
      }),
    );
  });

  it("blocks public/link publish without approval or after rejection", () => {
    expect(
      service.evaluatePublishPolicy({
        draft: createDraft({ reviews: [] }),
        actorUserId: "owner-user",
        visibility: "public",
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "REVIEW_APPROVAL_REQUIRED", severity: "blocker" }),
        ]),
      }),
    );

    expect(
      service.evaluatePublishPolicy({
        draft: createDraft({
          reviews: [
            {
              reviewId: "review-2",
              requestedByUserId: "owner-user",
              reviewerUserId: "reviewer-user",
              status: "changes_requested",
            },
          ],
        }),
        actorUserId: "owner-user",
        visibility: "link",
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "REVIEW_REJECTED", severity: "blocker" }),
        ]),
      }),
    );
  });

  it("blocks publish when actor is not owner even if the draft was approved", () => {
    const result = service.evaluatePublishPolicy({
      draft: createDraft(),
      actorUserId: "editor-user",
      visibility: "public",
    });

    expect(result.allowed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "FORBIDDEN_ROLE",
          severity: "blocker",
        }),
      ]),
    );
  });

  it("blocks private GM data and broken node references before publication", () => {
    const result = service.evaluatePublishPolicy({
      draft: createDraft({
        nodes: [
          {
            ...baseNodes[0],
            transitions: [{ nextNodeId: "missing-node" }],
            nodeMeta: {
              gmOnlyNotes: "Ambush from the ceiling.",
              visible: true,
            },
            checkOptions: {
              reveal: { scope: "gm", text: "Secret treasure." },
            },
          },
        ],
      }),
      actorUserId: "owner-user",
      visibility: "public",
    });

    expect(result.allowed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PRIVATE_DATA_EXPOSED", nodeId: "node-start", path: "nodeMeta.gmOnlyNotes" }),
        expect.objectContaining({ code: "PRIVATE_DATA_EXPOSED", nodeId: "node-start", path: "checkOptions.reveal.scope" }),
        expect.objectContaining({ code: "BROKEN_NODE_REFERENCE", nodeId: "node-start", path: "transitions.nextNodeId" }),
      ]),
    );
  });

  it("requires attribution for external license policy", () => {
    const result = service.evaluatePublishPolicy({
      draft: createDraft({
        license: "CC_BY",
        attribution: "",
      }),
      actorUserId: "owner-user",
      visibility: "public",
    });

    expect(result.allowed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ATTRIBUTION_REQUIRED", severity: "blocker" }),
      ]),
    );
  });

  it("allows private owner export without review but still validates private data leakage", () => {
    const result = service.evaluatePublishPolicy({
      draft: createDraft({
        reviews: [],
      }),
      actorUserId: "owner-user",
      visibility: "private",
    });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: true,
        validationReport: {
          status: "valid",
          issueCount: 0,
          blockerCount: 0,
          warningCount: 0,
        },
      }),
    );
  });
});
