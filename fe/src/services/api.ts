import {
  GmMode,
  type AuthTokenResponseDto,
  type CharacterResponseDto,
  type LoginResponseDto,
  type OAuthUrlResponseDto,
  type SessionSnapshotDto,
  type UserResponseDto,
} from "@trpg/shared-types";
import type {
  ApiErrorBody,
  AvailableSessionListItem,
  Character,
  Scenario,
  SessionSnapshot,
  StoredUser,
  User,
} from "../types/session";
import { normalizeSessionSnapshot } from "../types/session";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const configuredWsBaseUrl = import.meta.env.VITE_WS_BASE_URL as string | undefined;
const rawBaseUrl = (configuredBaseUrl || "http://localhost:3000").replace(/\/$/, "");
export const API_BASE_URL = rawBaseUrl.endsWith("/api/v1") ? rawBaseUrl : `${rawBaseUrl}/api/v1`;
export const SOCKET_BASE_URL = (configuredWsBaseUrl || API_BASE_URL.replace(/\/api\/v1$/, "")).replace(/\/$/, "");

const DEFAULT_SCENARIO_ID = "scenario_goblin_cave";
const DEFAULT_RULE_SET_ID = "dnd5e";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  user?: StoredUser | null;
  accessToken?: string | null;
  withCredentials?: boolean;
}

export interface PaginatedList<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

function formatApiError(body: ApiErrorBody | null, fallback: string): string {
  if (!body?.message) return fallback;
  return Array.isArray(body.message) ? body.message.join(", ") : body.message;
}

function unwrapApiResponse<T>(body: unknown): T {
  if (body && typeof body === "object" && "code" in body && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

function toGmMode(value: "ai" | "human" | undefined): GmMode {
  return value === "human" ? GmMode.HUMAN : GmMode.AI;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  } else if (options.user) {
    headers["x-user-id"] = options.user.id;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: options.withCredentials ? "include" : "same-origin",
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

export function register(email: string, password: string, name: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>("/users/register", {
    method: "POST",
    body: { email, password, name },
  });
}

export function login(email: string, password: string): Promise<LoginResponseDto> {
  return requestJson<LoginResponseDto>("/users/login", {
    method: "POST",
    body: { email, password },
    withCredentials: true,
  });
}

export function logout(accessToken: string): Promise<void> {
  return requestJson<void>("/users/logout", {
    method: "POST",
    accessToken,
    withCredentials: true,
  });
}

export function reissue(): Promise<AuthTokenResponseDto> {
  return requestJson<AuthTokenResponseDto>("/users/reissue", {
    method: "POST",
    withCredentials: true,
  });
}

export function getMe(accessToken: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>("/users/me", { accessToken });
}

export function deleteMe(accessToken: string, password: string): Promise<void> {
  return requestJson<void>("/users/me", {
    method: "DELETE",
    accessToken,
    body: { password },
  });
}

export function getOAuthUrl(
  provider: "kakao" | "discord",
  redirectUri: string,
): Promise<OAuthUrlResponseDto> {
  const params = new URLSearchParams({ redirectUri });
  return requestJson<OAuthUrlResponseDto>(`/users/oauth/${provider}/url?${params.toString()}`);
}

export function oauthLogin(
  provider: "kakao" | "discord",
  code: string,
  redirectUri: string,
): Promise<LoginResponseDto> {
  return requestJson<LoginResponseDto>(`/users/oauth/${provider}/login`, {
    method: "POST",
    body: { code, redirectUri },
    withCredentials: true,
  });
}

export function listScenarios(): Promise<Scenario[]> {
  return requestJson<Scenario[]>("/scenarios");
}

export function listSessions(
  user?: StoredUser | null,
  accessToken?: string | null,
): Promise<PaginatedList<AvailableSessionListItem>> {
  return requestJson<PaginatedList<AvailableSessionListItem>>("/sessions", {
    user,
    accessToken,
  });
}

export async function createSession(
  user: StoredUser,
  title: string,
  scenarioId?: string,
  accessToken?: string | null,
): Promise<SessionSnapshot> {
  const created = await requestJson<SessionSnapshotDto | { sessionId: string; snapshot?: SessionSnapshotDto }>("/sessions", {
    method: "POST",
    user,
    accessToken,
    body: {
      title,
      scenarioId: scenarioId || DEFAULT_SCENARIO_ID,
      ruleSetId: DEFAULT_RULE_SET_ID,
      maxPlayers: 4,
      gmMode: toGmMode(undefined),
    },
  });

  if ("session" in created) {
    return normalizeSessionSnapshot(created);
  }

  if ("snapshot" in created && created.snapshot) {
    return normalizeSessionSnapshot(created.snapshot);
  }

  return getSession(user, created.sessionId, accessToken);
}

export async function joinSession(
  user: StoredUser,
  inviteCode: string,
  accessToken?: string | null,
): Promise<SessionSnapshot> {
  const joined = await requestJson<SessionSnapshotDto | { sessionId: string; snapshot?: SessionSnapshotDto }>(
    "/sessions/join-by-invite",
    {
      method: "POST",
      user,
      accessToken,
      body: { inviteCode },
    },
  );

  if ("session" in joined) {
    return normalizeSessionSnapshot(joined);
  }

  if ("snapshot" in joined && joined.snapshot) {
    return normalizeSessionSnapshot(joined.snapshot);
  }

  return getSession(user, joined.sessionId, accessToken);
}

export function getSession(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null,
): Promise<SessionSnapshot> {
  return requestJson<SessionSnapshotDto>(`/sessions/${sessionId}`, {
    user,
    accessToken,
  }).then(normalizeSessionSnapshot);
}

export function getSessionState(user: StoredUser, sessionId: string) {
  return requestJson(`/sessions/${sessionId}/state`, { user });
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
  accessToken?: string | null,
): Promise<SessionSnapshot> {
  return requestJson<CharacterResponseDto | Character>("/characters", {
    method: "POST",
    user,
    accessToken,
    body: {
      name: payload.name,
      ancestry: payload.ancestry,
      className: payload.className,
      maxHp: payload.maxHp,
    },
  })
    .then((character) =>
      requestJson(`/sessions/${payload.sessionId}/character-selection`, {
        method: "POST",
        user,
        accessToken,
        body: { characterId: character.id },
      }),
    )
    .then(() => getSession(user, payload.sessionId, accessToken));
}
