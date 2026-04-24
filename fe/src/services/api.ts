import type {
  Character,
  Participant,
  PersistentCharacter,
  Scenario,
  SessionListItem,
  SessionSnapshot,
  StoredUser,
  User,
  ApiErrorBody,
} from "../types/session";
import type { CharacterResponseDto, SessionSnapshotDto } from "@trpg/shared-types";
import { normalizeSessionSnapshot } from "../types/session";

type SessionGmMode = "ai" | "human";
type SessionStatus = "lobby" | "playing" | "paused" | "completed";

interface SessionListQuery {
  search?: string;
  scenarioId?: string;
  status?: SessionStatus;
  gmMode?: SessionGmMode;
  isPublic?: boolean;
  openSlotsAtLeast?: number;
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const configuredWsBaseUrl = import.meta.env.VITE_WS_BASE_URL as string | undefined;

export const API_BASE_URL = (configuredBaseUrl || "http://localhost:3000/api/v1").replace(
  /\/$/,
  "",
);
export const WS_BASE_URL = (
  configuredWsBaseUrl || API_BASE_URL.replace(/\/api\/v\d+$/, "")
).replace(/\/$/, "");

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  user?: StoredUser | null;
}

interface CreateSessionPayload {
  title: string;
  scenarioId?: string;
  gmMode?: SessionGmMode;
  maxParticipants?: number;
  description?: string;
  isPublic?: boolean;
}

interface CreateCharacterPayload {
  name: string;
  ancestry: string;
  className: string;
  level?: number;
  maxHp?: number;
  armorClass?: number;
  speed?: number;
}

function formatApiError(body: ApiErrorBody | null, fallback: string): string {
  if (!body?.message) {
    return fallback;
  }

  return Array.isArray(body.message) ? body.message.join(", ") : body.message;
}

function buildQuery(query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }

    params.set(key, String(value));
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
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

    throw new Error(formatApiError(body, `Request failed. (${response.status})`));
  }

  if (response.status === 204) {
    return undefined as T;
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

export function listSessions(query: SessionListQuery = {}): Promise<SessionListItem[]> {
  return requestJson<SessionListItem[]>(
    `/sessions${buildQuery({
      search: query.search,
      scenarioId: query.scenarioId,
      status: query.status,
      gmMode: query.gmMode,
      isPublic: query.isPublic,
      openSlotsAtLeast: query.openSlotsAtLeast,
    })}`,
  );
}

export function listMySessions(user: StoredUser): Promise<SessionListItem[]> {
  return requestJson<SessionListItem[]>("/users/me/sessions", { user });
}

export function listMyCharacters(user: StoredUser): Promise<CharacterResponseDto[]> {
  return requestJson<CharacterResponseDto[]>("/users/me/characters", { user });
}

export function createSession(
  user: StoredUser,
  payload: CreateSessionPayload,
): Promise<SessionSnapshot> {
  return requestJson<SessionSnapshotDto>("/sessions", {
    method: "POST",
    user,
    body: payload,
  }).then(normalizeSessionSnapshot);
}

export function joinSessionByInvite(
  user: StoredUser,
  inviteCode: string,
): Promise<SessionSnapshot> {
  return requestJson<SessionSnapshotDto>("/sessions/join-by-invite", {
    method: "POST",
    user,
    body: { inviteCode },
  }).then(normalizeSessionSnapshot);
}

export function joinSessionById(user: StoredUser, sessionId: string): Promise<SessionSnapshot> {
  return requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/join`, {
    method: "POST",
    user,
  }).then(normalizeSessionSnapshot);
}

export function resumeSession(user: StoredUser, sessionId: string): Promise<SessionSnapshot> {
  return requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/resume`, {
    method: "POST",
    user,
  }).then(normalizeSessionSnapshot);
}

export function leaveSession(user: StoredUser, sessionId: string): Promise<void> {
  return requestJson<void>(`/sessions/${sessionId}/leave`, {
    method: "DELETE",
    user,
  });
}

export function createPersistentCharacter(
  user: StoredUser,
  payload: CreateCharacterPayload,
): Promise<PersistentCharacter> {
  return requestJson<PersistentCharacter>("/characters", {
    method: "POST",
    user,
    body: payload,
  });
}

export function selectCharacterForSession(
  user: StoredUser,
  sessionId: string,
  characterId: string,
): Promise<Participant> {
  return requestJson<Participant>(`/sessions/${sessionId}/character-selection`, {
    method: "POST",
    user,
    body: { characterId },
  });
}

export function getSessionState(user: StoredUser, sessionId: string) {
  return requestJson(`/sessions/${sessionId}/state`, {
    user,
  });
}

export function listSessionCharacters(user: StoredUser, sessionId: string): Promise<Character[]> {
  return requestJson<Character[]>(`/sessions/${sessionId}/characters`, {
    user,
  });
}
