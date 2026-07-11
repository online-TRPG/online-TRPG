import { Injectable, Logger } from "@nestjs/common";
import { SessionSnapshotDto, VttMapStateDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";

@Injectable()
export class SessionVttMapPersistenceService {
  private readonly logger = new Logger(SessionVttMapPersistenceService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  buildMapFlags(flags: Record<string, unknown>, map: VttMapStateDto): Record<string, unknown> {
    return {
      ...flags,
      vttMap: map,
    };
  }

  async saveMap(params: {
    sessionScenarioId: string;
    flags: Record<string, unknown>;
    map: VttMapStateDto;
  }): Promise<void> {
    const startedAt = performance.now();
    const flagsJson = JSON.stringify(this.buildMapFlags(params.flags, params.map));
    await this.prisma.gameState.update({
      where: { sessionScenarioId: params.sessionScenarioId },
      data: {
        version: { increment: 1 },
        flagsJson,
      },
    });
    if (process.env.PERFORMANCE_DIAGNOSTICS === "1") {
      this.logger.debug({
        event: "vtt_map_persisted",
        sessionScenarioId: params.sessionScenarioId,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
        flagsJsonBytes: Buffer.byteLength(flagsJson, "utf8"),
        tokenCount: params.map.tokens.length,
        objectCellCount: params.map.objectCells?.length ?? 0,
        fogRectCount: params.map.fogRects?.length ?? 0,
      });
    }
  }

  publishMapUpdated(params: {
    sessionId: string;
    hostUserId: string;
    hostMap: VttMapStateDto;
    playerMap: VttMapStateDto;
    previousHostMap?: VttMapStateDto | null;
    previousPlayerMap?: VttMapStateDto | null;
  }): void {
    this.realtimeEvents.emitVttMapUpdated(params.sessionId, {
      hostUserId: params.hostUserId,
      hostMap: params.hostMap,
      playerMap: params.playerMap,
      ...(params.previousHostMap ? { previousHostMap: params.previousHostMap } : {}),
      ...(params.previousPlayerMap ? { previousPlayerMap: params.previousPlayerMap } : {}),
    });
  }

  publishSnapshot(sessionId: string, snapshot: SessionSnapshotDto): void {
    this.realtimeEvents.emitSessionSnapshot(sessionId, snapshot);
  }
}
