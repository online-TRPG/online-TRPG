import { Injectable } from "@nestjs/common";
import { VttMapStateDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { SessionVttMapNormalizationService } from "./session-vtt-map-normalization.service";

@Injectable()
export class SessionVttDefaultMapReaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapNormalization: SessionVttMapNormalizationService,
  ) {}

  async getScenarioDefaultVttMapForNode(sessionScenarioId: string, nodeId: string | null | undefined): Promise<VttMapStateDto | null> {
    if (!nodeId) {
      return null;
    }

    const node = await this.prisma.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId,
          nodeId,
        },
      },
      select: { checkOptionsJson: true },
    });
    if (!node) {
      return null;
    }

    return this.extractVttMapFromCheckOptions(node.checkOptionsJson);
  }

  extractVttMapFromCheckOptions(value: string): VttMapStateDto | null {
    const parsed = this.parseJson<unknown>(value, []);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return null;
    }

    return this.mapNormalization.toVttMapOrNull((parsed as Record<string, unknown>).vttMap);
  }

  extractChecksFromCheckOptions(value: string): Record<string, unknown>[] {
    const parsed = this.parseJson<unknown>(value, []);
    if (Array.isArray(parsed)) {
      return parsed as Record<string, unknown>[];
    }
    if (parsed && typeof parsed === "object") {
      const checks = (parsed as Record<string, unknown>).checks;
      return Array.isArray(checks) ? (checks as Record<string, unknown>[]) : [];
    }
    return [];
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
