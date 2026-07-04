import { Injectable } from "@nestjs/common";
import { VttMapStateDto } from "@trpg/shared-types";
import { RealtimeEventsService } from "../realtime/realtime-events.service";

@Injectable()
export class SessionVttMovementFramePublisherService {
  constructor(private readonly realtimeEvents: RealtimeEventsService) {}

  async publish(params: {
    sessionId: string;
    hostUserId: string;
    map: VttMapStateDto;
    sourceTokenId: string;
    path: Array<{ x: number; y: number }>;
    redactVttMapForPlayer: (map: VttMapStateDto) => VttMapStateDto;
    delayMs?: number;
  }): Promise<void> {
    if (!params.path.length) {
      return;
    }

    let frameMap = params.map;
    for (const step of params.path) {
      frameMap = {
        ...frameMap,
        tokens: frameMap.tokens.map((token) =>
          token.id === params.sourceTokenId
            ? {
                ...token,
                x: step.x,
                y: step.y,
              }
            : token,
        ),
        updatedAt: new Date().toISOString(),
      };

      this.realtimeEvents.emitVttMapUpdated(params.sessionId, {
        hostUserId: params.hostUserId,
        hostMap: frameMap,
        playerMap: params.redactVttMapForPlayer(frameMap),
      });
      await this.sleep(params.delayMs ?? 180);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
