import type {
  ApiErrorBody,
  Character,
  Participant,
  PersistentCharacter,
  Scenario,
  SessionListItem,
  SessionSnapshot,
  StoredUser,
  User,
} from "../types/session";
import { GmMode } from "@trpg/shared-types";
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

const rawBaseUrl = (configuredBaseUrl || "http://localhost:3000").replace(/\/$/, "");
export const API_BASE_URL = rawBaseUrl.endsWith("/api/v1") ? rawBaseUrl : `${rawBaseUrl}/api/v1`;
export const SOCKET_BASE_URL = (configuredWsBaseUrl || API_BASE_URL.replace(/\/api\/v1$/, "")).replace(
  /\/$/,
  "",
);
export const WS_BASE_URL = SOCKET_BASE_URL;

const DEFAULT_SCENARIO_ID = "scenario_goblin_cave";
const DEFAULT_RULE_SET_ID = "dnd5e";

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

type PageResponse<T> = {
  content: T[];
  page?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
};

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

function unwrapApiResponse<T>(body: unknown): T {
  if (
    body &&
    typeof body === "object" &&
    "code" in body &&
    "message" in body &&
    "data" in body
  ) {
    return (body as { data: T }).data;
  }

  return body as T;
}

function extractPageContent<T>(body: PageResponse<T> | T[]): T[] {
  return Array.isArray(body) ? body : body.content;
}

function toGmMode(value: SessionGmMode | undefined): GmMode {
  return value === "human" ? GmMode.HUMAN : GmMode.AI;
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

  const body = (await response.json()) as unknown;
  return unwrapApiResponse<T>(body);
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
  return requestJson<PageResponse<SessionListItem> | SessionListItem[]>(
    `/sessions${buildQuery({
      search: query.search,
      scenarioId: query.scenarioId,
      status: query.status,
      gmMode: query.gmMode,
      isPublic: query.isPublic,
      openSlotsAtLeast: query.openSlotsAtLeast,
    })}`,
  ).then(extractPageContent);
}

export function listMySessions(user: StoredUser): Promise<SessionListItem[]> {
  return requestJson<PageResponse<SessionListItem> | SessionListItem[]>("/users/me/sessions", {
    user,
  }).then(extractPageContent);
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
    body: {
      title: payload.title,
      description: payload.description,
      scenarioId: payload.scenarioId ?? DEFAULT_SCENARIO_ID,
      ruleSetId: DEFAULT_RULE_SET_ID,
      maxPlayers: payload.maxParticipants ?? 4,
      gmMode: toGmMode(payload.gmMode),
      isPrivate: payload.isPublic === undefined ? undefined : !payload.isPublic,
    },
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
