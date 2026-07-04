import { SessionScenarioRevisionSnapshotService } from "./session-scenario-revision-snapshot.service";

describe("SessionScenarioRevisionSnapshotService", () => {
  const service = new SessionScenarioRevisionSnapshotService();

  it("builds initial game state flags with the revision snapshot key", () => {
    const flags = service.buildInitialFlags({
      id: "scenario_draft_rev_1",
      sourceType: "CLONED",
      baseScenarioId: "scenario_draft",
      attribution:
        'Original\nP3_REVISION_META:{"revisionNumber":1,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}',
      updatedAt: new Date("2026-06-22T01:00:00.000Z"),
    });

    expect(flags).toEqual({
      p3ScenarioRevisionSnapshot: expect.objectContaining({
        scenarioId: "scenario_draft_rev_1",
        revisionNumber: 1,
        publishStatus: "public",
      }),
    });
  });

  it("builds a revision snapshot flag from P3 metadata", () => {
    const flag = service.buildFlag({
      id: "scenario_draft_rev_1",
      sourceType: "CLONED",
      baseScenarioId: "scenario_draft",
      attribution:
        'Original\nP3_REVISION_META:{"revisionNumber":1,"publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}',
      updatedAt: new Date("2026-06-22T01:00:00.000Z"),
    });

    expect(flag).toEqual(
      expect.objectContaining({
        scenarioId: "scenario_draft_rev_1",
        baseScenarioId: "scenario_draft",
        sourceType: "CLONED",
        revisionNumber: 1,
        publishStatus: "public",
        publishedAt: "2026-06-22T00:00:00.000Z",
        publishedByUserId: "creator-1",
        scenarioUpdatedAt: "2026-06-22T01:00:00.000Z",
      }),
    );
    expect(flag.snapshotCreatedAt).toEqual(expect.any(String));
  });

  it("uses draft metadata when the attribution marker is absent", () => {
    expect(service.parseMetadata("Original attribution")).toEqual({
      revisionNumber: null,
      publishedAt: null,
      publishedByUserId: null,
      status: "draft",
    });
  });

  it("uses draft metadata for malformed marker JSON or unknown status", () => {
    expect(service.parseMetadata("P3_REVISION_META:{bad json")).toEqual({
      revisionNumber: null,
      publishedAt: null,
      publishedByUserId: null,
      status: "draft",
    });
    expect(service.parseMetadata('P3_REVISION_META:{"status":"archived","revisionNumber":1}')).toMatchObject({
      revisionNumber: 1,
      status: "draft",
    });
  });
});
