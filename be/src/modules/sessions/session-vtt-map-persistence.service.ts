import { Injectable } from "@nestjs/common";
import { SessionSnapshotDto, VttMapStateDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";

@Injectable()
export class SessionVttMapPersistenceService {
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
    await this.prisma.gameState.update({
      where: { sessionScenarioId: params.sessionScenarioId },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify(this.buildMapFlags(params.flags, params.map)),
      },
    });
  }

  publishMapUpdated(params: {
    sessionId: string;
    hostUserId: string;
    hostMap: VttMapStateDto;
    playerMap: VttMapStateDto;
  }): void {
    this.realtimeEvents.emitVttMapUpdated(params.sessionId, {
      hostUserId: params.hostUserId,
      hostMap: params.hostMap,
      playerMap: params.playerMap,
    });
  }

  publishSnapshot(sessionId: string, snapshot: SessionSnapshotDto): void {
    this.realtimeEvents.emitSessionSnapshot(sessionId, snapshot);
  }
}
