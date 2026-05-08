import { Injectable } from "@nestjs/common";
import {
  ChatMessageEventDto,
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
  SessionStatusUpdatedEventDto,
  VttMapStateDto,
  VttMapUpdatedEventDto,
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

  getUserRoomName(sessionId: string, userId: string): string {
    return `session:${sessionId}:user:${userId}`;
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

    this.server.to(this.getRoomName(sessionId)).emit("state.diff.applied", {
      sessionId,
      stateDiff,
    });
  }

  emitCombatUpdated(sessionId: string, combat: CombatResponseDto): void {
    if (!this.server) {
      return;
    }

    this.server.to(this.getRoomName(sessionId)).emit("combat.updated", {
      sessionId,
      combat,
    });
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

  emitVttMapUpdated(
    sessionId: string,
    params: {
      hostUserId: string;
      hostMap: VttMapStateDto;
      playerMap: VttMapStateDto;
    },
  ): void {
    if (!this.server) {
      return;
    }

    const playerPayload: VttMapUpdatedEventDto = { sessionId, map: params.playerMap };
    const hostPayload: VttMapUpdatedEventDto = { sessionId, map: params.hostMap };
    const hostRoomName = this.getUserRoomName(sessionId, params.hostUserId);

    this.server
      .to(this.getRoomName(sessionId))
      .except(hostRoomName)
      .emit("vtt.map.updated", playerPayload);
    this.server.to(hostRoomName).emit("vtt.map.updated", hostPayload);
  }
}
