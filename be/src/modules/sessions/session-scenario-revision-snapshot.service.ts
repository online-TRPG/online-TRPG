import { Injectable } from "@nestjs/common";

type ScenarioRevisionSnapshotSource = {
  id: string;
  sourceType: string;
  baseScenarioId: string | null;
  attribution: string | null;
  updatedAt: Date;
};

type ScenarioRevisionMetadata = {
  revisionNumber: number | null;
  publishedAt: string | null;
  publishedByUserId: string | null;
  status: "draft" | "public" | "link" | "private" | "unpublished";
};

@Injectable()
export class SessionScenarioRevisionSnapshotService {
  buildInitialFlags(scenario: ScenarioRevisionSnapshotSource): Record<string, unknown> {
    return {
      p3ScenarioRevisionSnapshot: this.buildFlag(scenario),
    };
  }

  buildFlag(scenario: ScenarioRevisionSnapshotSource): Record<string, unknown> {
    const metadata = this.parseMetadata(scenario.attribution);
    return {
      scenarioId: scenario.id,
      baseScenarioId: scenario.baseScenarioId,
      sourceType: scenario.sourceType,
      revisionNumber: metadata.revisionNumber,
      publishStatus: metadata.status,
      publishedAt: metadata.publishedAt,
      publishedByUserId: metadata.publishedByUserId,
      scenarioUpdatedAt: scenario.updatedAt.toISOString(),
      snapshotCreatedAt: new Date().toISOString(),
    };
  }

  parseMetadata(attribution: string | null | undefined): ScenarioRevisionMetadata {
    const raw = attribution ?? "";
    const marker = "P3_REVISION_META:";
    const markerIndex = raw.indexOf(marker);
    if (markerIndex < 0) {
      return this.createDraftMetadata();
    }

    try {
      const metadata = JSON.parse(raw.slice(markerIndex + marker.length).trim()) as Record<string, unknown>;
      const status = metadata.status;
      return {
        revisionNumber:
          typeof metadata.revisionNumber === "number" && Number.isInteger(metadata.revisionNumber)
            ? metadata.revisionNumber
            : null,
        publishedAt: typeof metadata.publishedAt === "string" ? metadata.publishedAt : null,
        publishedByUserId:
          typeof metadata.publishedByUserId === "string" ? metadata.publishedByUserId : null,
        status:
          status === "public" || status === "link" || status === "private" || status === "unpublished"
            ? status
            : "draft",
      };
    } catch {
      return this.createDraftMetadata();
    }
  }

  private createDraftMetadata(): ScenarioRevisionMetadata {
    return {
      revisionNumber: null,
      publishedAt: null,
      publishedByUserId: null,
      status: "draft",
    };
  }
}
