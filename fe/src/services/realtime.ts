import { io, Socket } from "socket.io-client";
import { VTT_MAP_DELTA_V2_CAPABILITY } from "@trpg/shared-types/browser-runtime";
import { SOCKET_BASE_URL } from "./httpClient";
import {
  type ActionAcceptedEventDto,
  type CombatReactionPromptDto,
  type CombatResponseDto,
  type DiceRollResponseDto,
  type SessionSnapshotDto,
  type StateDiffResponseDto,
  type SystemMessageEventDto,
  type TurnLogResponseDto,
  type VttMapDeltaDto,
  type VttMapStateDto,
} from "@trpg/shared-types";
import {
  decodeActionAcceptedEvent,
  decodeCharacterUpdatedEvent,
  decodeChatMessageEventPayload,
  decodeCombatReactionPromptEvent,
  decodeCombatUpdatedEvent,
  decodeDiceRolledEvent,
  decodeParticipantUpdatedEvent,
  decodeSessionSnapshotEvent,
  decodeStateDiffAppliedEvent,
  decodeSystemMessageEvent,
  decodeTurnLogCreatedEvent,
  decodeVttMapUpdatedEvent,
} from "@trpg/shared-types/frontend";
import type { Character, ChatMessage, Participant, SessionSnapshot, StoredUser } from "../types/session";
import { normalizeSessionSnapshot } from "../types/session";

export interface RealtimeHandlers {
  onSnapshot(snapshot: SessionSnapshot): void;
  onParticipantUpdated(participant: Participant): void;
  onCharacterUpdated(character: Character): void;
  onChatMessage(message: ChatMessage): void;
  onActionAccepted(action: ActionAcceptedEventDto): void;
  onTurnLogCreated(turnLog: TurnLogResponseDto): void;
  onSystemMessage(message: SystemMessageEventDto): void;
  onDiceRolled(diceResult: DiceRollResponseDto): void;
  onStateDiffApplied(stateDiff: StateDiffResponseDto): boolean;
  onVttMapUpdated(map: VttMapStateDto): void;
  onVttMapDelta(delta: VttMapDeltaDto): boolean;
  onCombatUpdated(combat: CombatResponseDto): void;
  onStatusChange(connected: boolean): void;
  onLog(title: string, message: string): void;
}

export function connectSessionSocket(
  user: StoredUser,
  sessionId: string,
  handlers: RealtimeHandlers,
): Socket {
  let mapResyncRequested = false;
  let stateResyncRequested = false;
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
    socket.emit("session.join", {
      sessionId,
      capabilities: [VTT_MAP_DELTA_V2_CAPABILITY],
    });
  });

  socket.on("disconnect", () => {
    handlers.onStatusChange(false);
    handlers.onLog("Realtime disconnected", "The websocket connection was closed.");
  });

  socket.on("connect_error", (error) => {
    handlers.onStatusChange(false);
    handlers.onLog("Realtime error", error.message);
  });

  safeSocketOn(socket, "session.snapshot", decodeSessionSnapshotPayload, (payload) => {
    mapResyncRequested = false;
    stateResyncRequested = false;
    handlers.onSnapshot(normalizeSessionSnapshot(payload.snapshot));
    handlers.onLog("Session synced", "Loaded the latest room snapshot.");
  }, handlers);

  safeSocketOn(socket, "participant.updated", decodeParticipantUpdatedPayload, (payload) => {
    handlers.onParticipantUpdated(payload.participant);
    handlers.onLog(
      "Participant updated",
      `${payload.participant.user.displayName} participant state changed.`,
    );
  }, handlers);

  safeSocketOn(socket, "character.updated", decodeCharacterUpdatedPayload, (payload) => {
    handlers.onCharacterUpdated(payload.character);
    handlers.onLog("Character updated", `${payload.character.name} stats were refreshed.`);
  }, handlers);

  safeSocketOn(socket, "chat.message", decodeChatMessagePayload, (payload) => {
    handlers.onChatMessage(payload.message);
  }, handlers);

  safeSocketOn(socket, "action.accepted", decodeActionAcceptedPayload, (payload) => {
    handlers.onActionAccepted(payload);
  }, handlers);

  safeSocketOn(socket, "turn.log.created", decodeTurnLogCreatedPayload, (payload) => {
    handlers.onTurnLogCreated(payload.turnLog);
  }, handlers);

  safeSocketOn(socket, "system.message", decodeSystemMessagePayload, (payload) => {
    handlers.onSystemMessage(payload);
  }, handlers);

  safeSocketOn(socket, "dice.rolled", decodeDiceRolledPayload, (payload) => {
    handlers.onDiceRolled(payload.diceResult);
  }, handlers);

  safeSocketOn(socket, "state.diff.applied", decodeStateDiffPayload, (payload) => {
    if (handlers.onStateDiffApplied(payload.stateDiff)) {
      stateResyncRequested = false;
      window.dispatchEvent(
        new CustomEvent("trpg:state-diff-applied", { detail: payload.stateDiff }),
      );
      return;
    }
    if (!stateResyncRequested) {
      stateResyncRequested = true;
      socket.emit("session.resync", { sessionId });
      handlers.onLog("State resync requested", "The local session state version was stale.");
    }
  }, handlers);

  safeSocketOn(socket, "vtt.map.updated", decodeVttMapUpdatedPayload, (payload) => {
    mapResyncRequested = false;
    handlers.onVttMapUpdated(payload.map);
    handlers.onLog("Map updated", "The tabletop map changed.");
  }, handlers);

  socket.on("vtt.map.delta.v2", (payload: { delta: VttMapDeltaDto }) => {
    if (handlers.onVttMapDelta(payload.delta)) {
      mapResyncRequested = false;
      handlers.onLog("Map updated", "The tabletop map delta was applied.");
      return;
    }
    if (!mapResyncRequested) {
      mapResyncRequested = true;
      socket.emit("session.resync", { sessionId });
      handlers.onLog("Map resync requested", "The local map version was stale.");
    }
  });

  safeSocketOn(socket, "combat.updated", decodeCombatUpdatedPayload, (payload) => {
    handlers.onCombatUpdated(payload.combat);
    window.dispatchEvent(new CustomEvent("trpg:combat-updated", { detail: payload.combat }));
    handlers.onLog("Combat updated", "The combat tracker changed.");
  }, handlers);

  safeSocketOn(socket, "combat.reaction.prompt", decodeCombatReactionPromptPayload, (payload) => {
    window.dispatchEvent(new CustomEvent("trpg:combat-reaction-prompt", { detail: payload.reaction }));
    handlers.onLog("Reaction prompt", payload.reaction.message);
  }, handlers);

  return socket;
}

export function sendRealtimeChatMessage(
  socket: Socket,
  sessionId: string,
  content: string,
  scope: "CHAT" | "MAIN" = "CHAT",
): void {
  socket.emit("chat.send", { sessionId, content, scope });
}

function safeSocketOn<T>(
  socket: Socket,
  eventName: string,
  decode: (payload: unknown) => T,
  handler: (payload: T) => void,
  handlers: Pick<RealtimeHandlers, "onLog">,
): void {
  socket.on(eventName, (payload: unknown) => {
    try {
      handler(decode(payload));
    } catch {
      handlers.onLog("Realtime payload ignored", `${eventName} payload shape was invalid.`);
    }
  });
}

function decodeSessionSnapshotPayload(value: unknown): { snapshot: SessionSnapshotDto } {
  return decodeSessionSnapshotEvent(value);
}

function decodeParticipantUpdatedPayload(value: unknown): { participant: Participant } {
  return decodeParticipantUpdatedEvent(value);
}

function decodeCharacterUpdatedPayload(value: unknown): { character: Character } {
  return decodeCharacterUpdatedEvent(value);
}

function decodeChatMessagePayload(value: unknown): { message: ChatMessage } {
  return decodeChatMessageEventPayload(value);
}

function decodeActionAcceptedPayload(value: unknown): ActionAcceptedEventDto {
  return decodeActionAcceptedEvent(value);
}

function decodeTurnLogCreatedPayload(value: unknown): { turnLog: TurnLogResponseDto } {
  return decodeTurnLogCreatedEvent(value);
}

function decodeSystemMessagePayload(value: unknown): SystemMessageEventDto {
  return decodeSystemMessageEvent(value);
}

function decodeDiceRolledPayload(value: unknown): { diceResult: DiceRollResponseDto } {
  return decodeDiceRolledEvent(value);
}

function decodeStateDiffPayload(value: unknown): { stateDiff: StateDiffResponseDto } {
  return decodeStateDiffAppliedEvent(value);
}

function decodeVttMapUpdatedPayload(value: unknown): { map: VttMapStateDto } {
  return decodeVttMapUpdatedEvent(value);
}

function decodeCombatUpdatedPayload(value: unknown): { combat: CombatResponseDto } {
  return decodeCombatUpdatedEvent(value);
}

function decodeCombatReactionPromptPayload(value: unknown): { reaction: CombatReactionPromptDto } {
  return decodeCombatReactionPromptEvent(value);
}
