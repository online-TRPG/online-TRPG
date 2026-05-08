import { io, Socket } from "socket.io-client";
import { SOCKET_BASE_URL } from "./api";
import type {
  ActionAcceptedEventDto,
  DiceRollResponseDto,
  StateDiffResponseDto,
  TurnLogResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import type { Character, ChatMessage, Participant, SessionSnapshot, StoredUser } from "../types/session";
import { normalizeSessionSnapshot } from "../types/session";

export interface RealtimeHandlers {
  onSnapshot(snapshot: SessionSnapshot): void;
  onParticipantUpdated(participant: Participant): void;
  onCharacterUpdated(character: Character): void;
  onChatMessage(message: ChatMessage): void;
  onActionAccepted(action: ActionAcceptedEventDto): void;
  onTurnLogCreated(turnLog: TurnLogResponseDto): void;
  onDiceRolled(diceResult: DiceRollResponseDto): void;
  onStateDiffApplied(stateDiff: StateDiffResponseDto): void;
  onVttMapUpdated(map: VttMapStateDto): void;
  onStatusChange(connected: boolean): void;
  onLog(title: string, message: string): void;
}

export function connectSessionSocket(
  user: StoredUser,
  sessionId: string,
  handlers: RealtimeHandlers,
): Socket {
  const socket = io(`${SOCKET_BASE_URL}/ws`, {
    // 로컬/프록시 환경에서 WebSocket 업그레이드가 바로 실패해도 세션 이벤트가 끊기지 않도록
    // Socket.IO 기본 흐름처럼 polling으로 먼저 연결한 뒤 websocket으로 업그레이드한다.
    transports: ["polling", "websocket"],
    extraHeaders: {
      "x-user-id": user.id,
    },
    auth: {
      userId: user.id,
    },
  });

  socket.on("connect", () => {
    handlers.onStatusChange(true);
    handlers.onLog("Realtime connected", "Joined the live session channel.");
    socket.emit("session.join", { sessionId });
  });

  socket.on("disconnect", () => {
    handlers.onStatusChange(false);
    handlers.onLog("Realtime disconnected", "The websocket connection was closed.");
  });

  socket.on("connect_error", (error) => {
    handlers.onStatusChange(false);
    handlers.onLog("Realtime error", error.message);
  });

  socket.on("session.snapshot", (payload: { snapshot: SessionSnapshot }) => {
    handlers.onSnapshot(normalizeSessionSnapshot(payload.snapshot));
    handlers.onLog("Session synced", "Loaded the latest room snapshot.");
  });

  socket.on("participant.updated", (payload: { participant: Participant }) => {
    handlers.onParticipantUpdated(payload.participant);
    handlers.onLog(
      "Participant updated",
      `${payload.participant.user.displayName} participant state changed.`,
    );
  });

  socket.on("character.updated", (payload: { character: Character }) => {
    handlers.onCharacterUpdated(payload.character);
    handlers.onLog("Character updated", `${payload.character.name} stats were refreshed.`);
  });

  socket.on("chat.message", (payload: { message: ChatMessage }) => {
    handlers.onChatMessage(payload.message);
  });

  socket.on("action.accepted", (payload: ActionAcceptedEventDto) => {
    handlers.onActionAccepted(payload);
  });

  socket.on("turn.log.created", (payload: { turnLog: TurnLogResponseDto }) => {
    handlers.onTurnLogCreated(payload.turnLog);
  });

  socket.on("dice.rolled", (payload: { diceResult: DiceRollResponseDto }) => {
    handlers.onDiceRolled(payload.diceResult);
  });

  socket.on("state.diff.applied", (payload: { stateDiff: StateDiffResponseDto }) => {
    handlers.onStateDiffApplied(payload.stateDiff);
  });

  socket.on("vtt.map.updated", (payload: { map: VttMapStateDto }) => {
    handlers.onVttMapUpdated(payload.map);
    handlers.onLog("Map updated", "The tabletop map changed.");
  });

  return socket;
}

export function sendRealtimeChatMessage(socket: Socket, sessionId: string, content: string): void {
  socket.emit("chat.send", { sessionId, content });
}
