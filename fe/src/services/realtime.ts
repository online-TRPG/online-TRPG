import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "./api";
import type { Character, Participant, SessionSnapshot, StoredUser } from "../types/session";

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
  const socket = io(`${API_BASE_URL}/ws`, {
    transports: ["websocket"],
    extraHeaders: {
      "x-user-id": user.id,
    },
  });

  socket.on("connect", () => {
    handlers.onStatusChange(true);
    handlers.onLog("실시간 연결", "세션 방에 입장했습니다.");
    socket.emit("session.join", { sessionId });
  });

  socket.on("disconnect", () => {
    handlers.onStatusChange(false);
    handlers.onLog("실시간 연결 종료", "WebSocket 연결이 끊겼습니다.");
  });

  socket.on("connect_error", (error) => {
    handlers.onStatusChange(false);
    handlers.onLog("실시간 연결 실패", error.message);
  });

  socket.on("session.snapshot", (payload: { snapshot: SessionSnapshot }) => {
    handlers.onSnapshot(payload.snapshot);
    handlers.onLog("스냅샷 수신", "현재 세션 상태를 불러왔습니다.");
  });

  socket.on("participant.updated", (payload: { participant: Participant }) => {
    handlers.onParticipantUpdated(payload.participant);
    handlers.onLog("참가자 변경", `${payload.participant.user.displayName} 님의 참가 정보가 갱신되었습니다.`);
  });

  socket.on("character.updated", (payload: { character: Character }) => {
    handlers.onCharacterUpdated(payload.character);
    handlers.onLog("캐릭터 변경", `${payload.character.name} 캐릭터 정보가 갱신되었습니다.`);
  });

  return socket;
}
