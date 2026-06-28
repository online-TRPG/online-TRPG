import type { AuthMode } from "../types/auth";
import { normalizeSessionSnapshot, type SessionSnapshot, type StoredUser } from "../types/session";

const USER_KEY = "trpg.currentUser";
const SNAPSHOT_KEY = "trpg.currentSnapshot";
const TOKEN_KEY = "trpg.accessToken";
const AUTH_MODE_KEY = "trpg.authMode";

export function loadStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredUser>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.publicId !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      localStorage.removeItem(USER_KEY);
      return null;
    }
    return {
      id: parsed.id,
      publicId: parsed.publicId,
      displayName: parsed.displayName,
      role: parsed.role === "ADMIN" || parsed.role === "MODERATOR" ? parsed.role : "USER",
      createdAt: parsed.createdAt,
    };
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function saveStoredUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  localStorage.removeItem(USER_KEY);
}

export function loadStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function loadStoredAuthMode(): AuthMode | null {
  const raw = localStorage.getItem(AUTH_MODE_KEY);
  if (raw === "guest" || raw === "member") return raw;
  return null;
}

export function saveStoredAuthMode(mode: AuthMode): void {
  localStorage.setItem(AUTH_MODE_KEY, mode);
}

export function clearStoredAuthMode(): void {
  localStorage.removeItem(AUTH_MODE_KEY);
}

export function loadStoredSnapshot(): SessionSnapshot | null {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return normalizeSessionSnapshot(JSON.parse(raw) as SessionSnapshot);
  } catch {
    localStorage.removeItem(SNAPSHOT_KEY);
    return null;
  }
}

export function saveStoredSnapshot(snapshot: SessionSnapshot): void {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function clearStoredSnapshot(): void {
  localStorage.removeItem(SNAPSHOT_KEY);
}

export function clearAll(): void {
  clearStoredUser();
  clearStoredToken();
  clearStoredAuthMode();
  clearStoredSnapshot();
}
