import type {
  Character,
  Scenario,
  SessionSnapshot,
  StoredUser,
  User,
  ApiErrorBody,
} from "../types/session";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const API_BASE_URL = (configuredBaseUrl || "http://localhost:3000").replace(/\/$/, "");

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
  return requestJson<SessionSnapshot>("/sessions", {
    method: "POST",
    user,
    body: {
      title,
      ...(scenarioId ? { scenarioId } : {}),
    },
  });
}

export function joinSession(user: StoredUser, inviteCode: string): Promise<SessionSnapshot> {
  return requestJson<SessionSnapshot>("/sessions/join", {
    method: "POST",
    user,
    body: { inviteCode },
  });
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
  return requestJson<Character>("/characters", {
    method: "POST",
    user,
    body: payload,
  });
}
