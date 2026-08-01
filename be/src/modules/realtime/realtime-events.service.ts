import { Injectable, Logger } from "@nestjs/common";
import {
  ChatMessageEventDto,
  CombatReactionPromptDto,
  CombatResponseDto,
  DiceRollResponseDto,
  CharacterUpdatedEventDto,
  StateDiffResponseDto,
  TurnAdvanceResponseDto,
  TurnLogResponseDto,
  ParticipantUpdatedEventDto,
  SessionCharacterResponseDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  SessionSnapshotEventDto,
  SessionPlayResponseDto,
  ActivePlayResponseDto,
  SessionStatusUpdatedEventDto,
  VttMapDeltaEventDto,
  VttMapStateDto,
  VttMapUpdatedEventDto,
  buildVttMapDelta,
} from "@trpg/shared-types";
import { Server } from "socket.io";

@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private server: Server | null = null;

  bindServer(server: Server): void {
    this.server = server;
  }

  getRoomName(sessionId: string): string {
    return `session:${sessionId}`;
  }

  getUserRoomName(sessionId: string, userId: string): string {
    return `session:${sessionId}:user:${userId}`;
  }

  getVttDeltaRoomName(sessionId: string): string {
    return `session:${sessionId}:vtt-delta-v2`;
  }

  getUserVttDeltaRoomName(sessionId: string, userId: string): string {
    return `session:${sessionId}:user:${userId}:vtt-delta-v2`;
  }

  emitSessionSnapshot(sessionId: string, snapshot: SessionSnapshotDto): void {
    if (!this.server) {
      return;
    }

    const payload: SessionSnapshotEventDto = { sessionId, snapshot };
    this.logPayload("session.snapshot", sessionId, payload);
    this.server.to(this.getRoomName(sessionId)).emit("session.snapshot", payload);
  }

  emitParticipantUpdated(sessionId: string, participant: SessionParticipantResponseDto): void {
    if (!this.server) {
      return;
    }

    const payload: ParticipantUpdatedEventDto = { sessionId, participant };
    this.logPayload("participant.updated", sessionId, payload);
    this.server.to(this.getRoomName(sessionId)).emit("participant.updated", payload);
  }

  evictUserFromSession(sessionId: string, userId: string): void {
    if (!this.server) return;
    const userRoom = this.getUserRoomName(sessionId, userId);
    this.server.in(userRoom).socketsLeave([
      this.getRoomName(sessionId),
      userRoom,
      this.getVttDeltaRoomName(sessionId),
      this.getUserVttDeltaRoomName(sessionId, userId),
    ]);
  }

  hasUserConnection(sessionId: string, userId: string): boolean {
    if (!this.server) return false;
    return (this.server.sockets.adapter.rooms.get(this.getUserRoomName(sessionId, userId))?.size ?? 0) > 0;
  }

  emitSessionPlayUpdated(sessionId: string, play: SessionPlayResponseDto): void {
    this.server?.to(this.getRoomName(sessionId)).emit("session.play.updated", { sessionId, play });
  }

  emitSessionAttendanceUpdated(sessionId: string, play: SessionPlayResponseDto): void {
    this.server?.to(this.getRoomName(sessionId)).emit("session.attendance.updated", { sessionId, play });
  }

  emitActivePlayChanged(
    sessionId: string,
    userId: string,
    activePlay: ActivePlayResponseDto | null,
  ): void {
    this.server?.to(this.getUserRoomName(sessionId, userId)).emit("session.active-play.changed", {
      sessionId,
      activePlay,
    });
  }

  emitCharacterUpdated(sessionId: string, character: SessionCharacterResponseDto): void {
    if (!this.server) {
      return;
    }

    const payload: CharacterUpdatedEventDto = { sessionId, character };
    this.logPayload("character.updated", sessionId, payload);
    this.server.to(this.getRoomName(sessionId)).emit("character.updated", payload);
  }

  emitSessionStatusUpdated(sessionId: string, session: SessionResponseDto): void {
    if (!this.server) {
      return;
    }

    const payload: SessionStatusUpdatedEventDto = { sessionId, session };
    this.server
      .to(this.getRoomName(sessionId))
      .emit("session.status.updated", payload);
  }

  emitActionAccepted(
    sessionId: string,
    action: {
      playerActionId: string;
      actorUserId: string;
      rawText: string;
      clientCreatedAt: string;
    },
  ): void {
    if (!this.server) {
      return;
    }

    this.server.to(this.getRoomName(sessionId)).emit("action.accepted", {
      sessionId,
      ...action,
    });
  }

  emitTurnLogCreated(sessionId: string, turnLog: TurnLogResponseDto): void {
    if (!this.server) {
      return;
    }

    this.server.to(this.getRoomName(sessionId)).emit("turn.log.created", {
      sessionId,
      turnLog,
    });
  }

  emitDiceRolled(sessionId: string, diceResult: DiceRollResponseDto): void {
    if (!this.server) {
      return;
    }

    this.server.to(this.getRoomName(sessionId)).emit("dice.rolled", {
      sessionId,
      diceResult,
    });
  }

  emitStateDiffApplied(sessionId: string, stateDiff: StateDiffResponseDto): void {
    if (!this.server) {
      return;
    }

    const payload = {
      sessionId,
      stateDiff,
    };
    this.logPayload("state.diff.applied", sessionId, payload);
    this.server.to(this.getRoomName(sessionId)).emit("state.diff.applied", payload);
  }

  emitCombatUpdated(sessionId: string, combat: CombatResponseDto): void {
    if (!this.server) {
      return;
    }

    const payload = {
      sessionId,
      combat,
    };
    this.logPayload("combat.updated", sessionId, payload);
    this.server.to(this.getRoomName(sessionId)).emit("combat.updated", payload);
  }

  emitTurnChanged(sessionId: string, turn: TurnAdvanceResponseDto): void {
    if (!this.server) {
      return;
    }

    this.server.to(this.getRoomName(sessionId)).emit("turn.changed", {
      sessionId,
      turn,
    });
  }

  emitCombatReactionPrompt(
    sessionId: string,
    userId: string,
    reaction: CombatReactionPromptDto,
  ): void {
    if (!this.server) {
      return;
    }

    this.server.to(this.getUserRoomName(sessionId, userId)).emit("combat.reaction.prompt", {
      sessionId,
      reaction,
    });
  }

  emitSystemMessage(
    sessionId: string,
    code: string,
    message: string,
    options?: { playerActionId?: string | null },
  ): void {
    if (!this.server) {
      return;
    }

    this.server.to(this.getRoomName(sessionId)).emit("system.message", {
      sessionId,
      code,
      message,
      playerActionId: options?.playerActionId ?? null,
    });
  }

  emitChatMessage(sessionId: string, message: ChatMessageEventDto): void {
    if (!this.server) {
      return;
    }

    this.server.to(this.getRoomName(sessionId)).emit("chat.message", {
      sessionId,
      message,
    });
  }

  private logPayload(name: string, sessionId: string, payload: unknown): void {
    if (process.env.PERFORMANCE_DIAGNOSTICS !== "1") {
      return;
    }
    this.logger.debug({
      event: "realtime_payload",
      name,
      sessionId,
      jsonBytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
    });
  }

  emitVttMapUpdated(
    sessionId: string,
    params: {
      hostUserId: string;
      hostMap: VttMapStateDto;
      playerMap: VttMapStateDto;
      previousHostMap?: VttMapStateDto | null;
      previousPlayerMap?: VttMapStateDto | null;
      stateVersion?: number;
      runtimeVersion?: number;
    },
  ): void {
    if (!this.server) {
      return;
    }

    const envelope = {
      sessionId,
      scenarioNodeId:
        params.hostMap.scenarioNodeId ?? params.playerMap.scenarioNodeId ?? null,
      ...(params.stateVersion === undefined
        ? {}
        : { stateVersion: params.stateVersion }),
      ...(params.runtimeVersion === undefined
        ? {}
        : { runtimeVersion: params.runtimeVersion }),
    };
    const playerPayload: VttMapUpdatedEventDto = {
      ...envelope,
      map: params.playerMap,
    };
    const hostPayload: VttMapUpdatedEventDto = {
      ...envelope,
      map: params.hostMap,
    };
    const hostRoomName = this.getUserRoomName(sessionId, params.hostUserId);
    const deltaRoomName = this.getVttDeltaRoomName(sessionId);
    const hostDeltaRoomName = this.getUserVttDeltaRoomName(sessionId, params.hostUserId);
    const playerDelta = params.previousPlayerMap
      ? buildVttMapDelta(params.previousPlayerMap, params.playerMap)
      : null;
    const hostDelta = params.previousHostMap
      ? buildVttMapDelta(params.previousHostMap, params.hostMap)
      : null;

    if (process.env.PERFORMANCE_DIAGNOSTICS === "1") {
      this.logger.debug({
        event: "vtt_map_payload_comparison",
        sessionId,
        playerFullBytes: Buffer.byteLength(JSON.stringify(playerPayload), "utf8"),
        playerDeltaBytes: playerDelta
          ? Buffer.byteLength(JSON.stringify({ sessionId, delta: playerDelta }), "utf8")
          : null,
        hostFullBytes: Buffer.byteLength(JSON.stringify(hostPayload), "utf8"),
        hostDeltaBytes: hostDelta
          ? Buffer.byteLength(JSON.stringify({ sessionId, delta: hostDelta }), "utf8")
          : null,
        changedPlayerTokens: playerDelta?.changedTokens.length ?? null,
        changedPlayerObjects: playerDelta?.changedObjectCells.length ?? null,
        changedHostTokens: hostDelta?.changedTokens.length ?? null,
        changedHostObjects: hostDelta?.changedObjectCells.length ?? null,
      });
    }

    this.server
      .to(this.getRoomName(sessionId))
      .except(hostRoomName)
      .except(deltaRoomName)
      .emit("vtt.map.updated", playerPayload);
    this.server
      .to(hostRoomName)
      .except(hostDeltaRoomName)
      .emit("vtt.map.updated", hostPayload);

    if (playerDelta) {
      const payload: VttMapDeltaEventDto = { sessionId, delta: playerDelta };
      this.server
        .to(deltaRoomName)
        .except(hostRoomName)
        .emit("vtt.map.delta.v2", payload);
    } else {
      this.server
        .to(deltaRoomName)
        .except(hostRoomName)
        .emit("vtt.map.updated", playerPayload);
    }

    if (hostDelta) {
      const payload: VttMapDeltaEventDto = { sessionId, delta: hostDelta };
      this.server.to(hostDeltaRoomName).emit("vtt.map.delta.v2", payload);
    } else {
      this.server.to(hostDeltaRoomName).emit("vtt.map.updated", hostPayload);
    }
  }
}
