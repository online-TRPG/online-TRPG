import { io, Socket } from "socket.io-client";
import { WS_BASE_URL } from "./api";
import type { Character, Participant, SessionSnapshot, StoredUser } from "../types/session";
import { normalizeSessionSnapshot } from "../types/session";

export interface RealtimeHandlers {
  onSnapshot(snapshot: SessionSnapshot): void;
  onParticipantUpdated(participant: Participant): void;
  onCharacterUpdated(character: Character): void;
  onStatusChange(connected: boolean): void;
  onLog(title: string, message: string): void;
}

export function connectSessionSocket(
  user: StoredUser,
  sessionId: string,
  handlers: RealtimeHandlers,
): Socket {
  const socket = io(`${WS_BASE_URL}/ws`, {
    transports: ["websocket"],
    extraHeaders: {
      "x-user-id": user.id,
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

  return socket;
}
