import { Injectable } from "@nestjs/common";
import {
  decodeLenientScenarioNodeCheckOptionsConfig,
  ScenarioCheckOptionDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import { parseJsonOrFallback } from "../../common/utils/json-runtime";
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
    const config = parseJsonOrFallback(
      value,
      { checks: [], vttMap: null },
      decodeLenientScenarioNodeCheckOptionsConfig,
    );
    return this.mapNormalization.toVttMapOrNull(config.vttMap);
  }

  extractChecksFromCheckOptions(value: string): ScenarioCheckOptionDto[] {
    return parseJsonOrFallback(
      value,
      { checks: [], vttMap: null },
      decodeLenientScenarioNodeCheckOptionsConfig,
    ).checks;
  }
}
