import type {
  Character,
  Participant,
  PersistentCharacter,
  Scenario,
  SessionSnapshot,
  StoredUser,
  User,
  ApiErrorBody,
} from "../types/session";
import type { SessionSnapshotDto } from "@trpg/shared-types";
import { normalizeSessionSnapshot } from "../types/session";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const configuredWsBaseUrl = import.meta.env.VITE_WS_BASE_URL as string | undefined;

export const API_BASE_URL = (configuredBaseUrl || "http://localhost:3000/api/v1").replace(
  /\/$/,
  "",
);
export const WS_BASE_URL = (
  configuredWsBaseUrl || API_BASE_URL.replace(/\/api\/v\d+$/, "")
).replace(/\/$/, "");

type HttpMethod = "GET" | "POST" | "PATCH";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  user?: StoredUser | null;
}

function formatApiError(body: ApiErrorBody | null, fallback: string): string {
  if (!body?.message) {
    return fallback;
  }

  return Array.isArray(body.message) ? body.message.join(", ") : body.message;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.user ? { "x-user-id": options.user.id } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = null;
    }

    throw new Error(formatApiError(body, `요청에 실패했습니다. (${response.status})`));
  }

  return (await response.json()) as T;
}

export function createGuest(displayName: string): Promise<User> {
  return requestJson<User>("/users/guest", {
    method: "POST",
    body: { displayName },
  });
}

export function listScenarios(): Promise<Scenario[]> {
  return requestJson<Scenario[]>("/scenarios");
}

export function createSession(
  user: StoredUser,
  title: string,
  scenarioId?: string,
): Promise<SessionSnapshot> {
  return requestJson<SessionSnapshotDto>("/sessions", {
    method: "POST",
    user,
    body: {
      title,
      ...(scenarioId ? { scenarioId } : {}),
    },
  }).then(normalizeSessionSnapshot);
}

export function joinSession(user: StoredUser, inviteCode: string): Promise<SessionSnapshot> {
  return requestJson<SessionSnapshotDto>("/sessions/join", {
    method: "POST",
    user,
    body: { inviteCode },
  }).then(normalizeSessionSnapshot);
}

export function getSessionState(user: StoredUser, sessionId: string) {
  return requestJson(`/sessions/${sessionId}/state`, {
    user,
  });
}

export function createCharacter(
  user: StoredUser,
  payload: {
    sessionId: string;
    name: string;
    ancestry: string;
    className: string;
    maxHp?: number;
  },
): Promise<Character> {
  const { sessionId, ...characterPayload } = payload;

  return requestJson<PersistentCharacter>("/characters", {
    method: "POST",
    user,
    body: characterPayload,
  }).then(async (persistentCharacter) => {
    const participant = await requestJson<Participant>(`/sessions/${sessionId}/character-selection`, {
      method: "POST",
      user,
      body: { characterId: persistentCharacter.id },
    });
    const sessionCharacters = await requestJson<Character[]>(`/sessions/${sessionId}/characters`, {
      user,
    });
    const selectedCharacter = sessionCharacters.find(
      (character) =>
        character.id === participant.sessionCharacterId ||
        character.characterId === persistentCharacter.id,
    );

    if (!selectedCharacter) {
      throw new Error("세션에 선택된 캐릭터를 찾을 수 없습니다.");
    }

    return selectedCharacter;
  });
}
