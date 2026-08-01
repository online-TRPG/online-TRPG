import { Injectable, Logger } from "@nestjs/common";
import { SessionSnapshotDto, VttMapStateDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionNodeRuntimeMapService } from "./session-node-runtime-map.service";
import {
  AuthoritativeVttMap,
  PublicVttMap,
} from "./vtt-map-authority";

@Injectable()
export class SessionVttMapPersistenceService {
  private readonly logger = new Logger(SessionVttMapPersistenceService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly runtimeMaps: SessionNodeRuntimeMapService,
  ) {}

  buildMapFlags(flags: Record<string, unknown>, map: AuthoritativeVttMap): Record<string, unknown> {
    return {
      ...flags,
      vttMap: map,
    };
  }

  async saveMap(params: {
    sessionScenarioId: string;
    flags: Record<string, unknown>;
    map: AuthoritativeVttMap;
    expectedStateVersion?: number;
  }): Promise<void> {
    const startedAt = performance.now();
    const persisted = await this.prisma.$transaction(async (tx) => {
      return this.runtimeMaps.saveCurrentMap(tx, {
        sessionScenarioId: params.sessionScenarioId,
        map: params.map,
        fallbackFlags: params.flags,
        expectedStateVersion: params.expectedStateVersion,
      });
    });
    const flagsJson = JSON.stringify(
      this.buildMapFlags(params.flags, persisted.map),
    );
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
    playerMap: PublicVttMap;
    previousHostMap?: VttMapStateDto | null;
    previousPlayerMap?: PublicVttMap | null;
    stateVersion?: number;
    runtimeVersion?: number;
  }): void {
    this.realtimeEvents.emitVttMapUpdated(params.sessionId, {
      hostUserId: params.hostUserId,
      hostMap: params.hostMap,
      playerMap: params.playerMap,
      ...(params.previousHostMap ? { previousHostMap: params.previousHostMap } : {}),
      ...(params.previousPlayerMap ? { previousPlayerMap: params.previousPlayerMap } : {}),
      ...(params.stateVersion === undefined
        ? {}
        : { stateVersion: params.stateVersion }),
      ...(params.runtimeVersion === undefined
        ? {}
        : { runtimeVersion: params.runtimeVersion }),
    });
  }

  publishSnapshot(sessionId: string, snapshot: SessionSnapshotDto): void {
    this.realtimeEvents.emitSessionSnapshot(sessionId, snapshot);
  }
}
