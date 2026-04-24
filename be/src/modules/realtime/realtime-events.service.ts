import { Injectable } from "@nestjs/common";
import {
  CharacterUpdatedEventDto,
  ParticipantUpdatedEventDto,
  SessionCharacterResponseDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  SessionSnapshotEventDto,
  SessionStatusUpdatedEventDto,
} from "@trpg/shared-types";
import { Server } from "socket.io";

@Injectable()
export class RealtimeEventsService {
  private server: Server | null = null;

  bindServer(server: Server): void {
    this.server = server;
  }

  getRoomName(sessionId: string): string {
    return `session:${sessionId}`;
  }

  emitSessionSnapshot(sessionId: string, snapshot: SessionSnapshotDto): void {
    if (!this.server) {
      return;
    }

    const payload: SessionSnapshotEventDto = { sessionId, snapshot };
    this.server.to(this.getRoomName(sessionId)).emit("session.snapshot", payload);
  }

  emitParticipantUpdated(sessionId: string, participant: SessionParticipantResponseDto): void {
    if (!this.server) {
      return;
    }

    const payload: ParticipantUpdatedEventDto = { sessionId, participant };
    this.server.to(this.getRoomName(sessionId)).emit("participant.updated", payload);
  }

  emitCharacterUpdated(sessionId: string, character: SessionCharacterResponseDto): void {
    if (!this.server) {
      return;
    }

    const payload: CharacterUpdatedEventDto = { sessionId, character };
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
}
