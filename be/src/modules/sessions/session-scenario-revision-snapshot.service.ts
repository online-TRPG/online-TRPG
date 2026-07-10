import { Injectable } from "@nestjs/common";
import { parseJsonOrFallback } from "../../common/utils/json-runtime";

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
      return parseJsonOrFallback(raw.slice(markerIndex + marker.length).trim(), this.createDraftMetadata(), (value) =>
        this.decodeScenarioRevisionMetadata(value),
      );
    } catch {
      return this.createDraftMetadata();
    }
  }

  private decodeScenarioRevisionMetadata(value: unknown): ScenarioRevisionMetadata {
    if (!this.isRecord(value)) {
      throw new Error("scenario revision metadata must be an object.");
    }
    const status = value.status;
    return {
      revisionNumber:
        typeof value.revisionNumber === "number" && Number.isInteger(value.revisionNumber)
          ? value.revisionNumber
          : null,
      publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
      publishedByUserId:
        typeof value.publishedByUserId === "string" ? value.publishedByUserId : null,
      status:
        status === "public" || status === "link" || status === "private" || status === "unpublished"
          ? status
          : "draft",
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
