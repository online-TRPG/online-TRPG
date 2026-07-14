import type { SessionSnapshotDto } from "@trpg/shared-types";
import {
  UserRole,
  decodeSessionSnapshot,
  isRecord,
  parseJsonWithDecoder,
  readString,
} from "@trpg/shared-types/frontend";
import type { AuthMode } from "../types/auth";
import { getAccessTokenExpiresAtMs } from "./authToken";
import { normalizeSessionSnapshot, type SessionSnapshot, type StoredUser } from "../types/session";

const USER_KEY = "trpg.currentUser";
const SNAPSHOT_KEY = "trpg.currentSnapshot";
const TOKEN_KEY = "trpg.accessToken";
const AUTH_MODE_KEY = "trpg.authMode";
const OAUTH_PROVIDER_KEY = "trpg.oauthProvider";
const AUTH_RETURN_TO_KEY = "trpg.authReturnTo";
const OAUTH_INTENT_KEY = "trpg.oauthIntent";
const DELETE_REAUTH_TICKET_KEY = "trpg.deleteReauthTicket";
const STORED_USER_SCHEMA_VERSION = 1;
const STORED_SNAPSHOT_SCHEMA_VERSION = 1;
const STORED_USER_ROLE = {
  USER: UserRole.USER,
  MODERATOR: UserRole.MODERATOR,
  ADMIN: UserRole.ADMIN,
};

type VersionedStoredValue<T> = {
  schemaVersion: number;
  data: T;
};

export type OAuthProvider = "kakao" | "discord";
export type OAuthIntent = "login" | "delete_reauth";
export type StoredDeleteReauthTicket = {
  provider: OAuthProvider;
  ticket: string;
  expiresAt: number;
};

export function loadStoredUser(): StoredUser | null {
  const raw = readStorageValue(USER_KEY);
  if (!raw) return null;
  try {
    return parseJsonWithDecoder(raw, decodeStoredUser, USER_KEY);
  } catch {
    removeStorageValue(USER_KEY);
    return null;
  }
}

function decodeStoredUser(value: unknown): StoredUser {
  if (isVersionedStoredValue(value, STORED_USER_SCHEMA_VERSION)) {
    return decodeStoredUserData(value.data);
  }
  return decodeStoredUserData(value);
}

function decodeStoredUserData(value: unknown): StoredUser {
  if (!isRecord(value)) {
    throw new Error("stored user must be an object.");
  }
  const role = value.role;
  return {
    id: readString(value, "id"),
    publicId: readString(value, "publicId"),
    displayName: readString(value, "displayName"),
    role:
      role === STORED_USER_ROLE.ADMIN || role === STORED_USER_ROLE.MODERATOR
        ? role
        : STORED_USER_ROLE.USER,
    createdAt: readString(value, "createdAt"),
  };
}

export function saveStoredUser(user: StoredUser): void {
  writeStorageValue(USER_KEY, JSON.stringify(toVersionedStoredValue(user, STORED_USER_SCHEMA_VERSION)));
}

export function clearStoredUser(): void {
  removeStorageValue(USER_KEY);
}

export function loadStoredToken(): string | null {
  const token = readStorageValue(TOKEN_KEY);
  if (!token) return null;
  const expiresAtMs = getAccessTokenExpiresAtMs(token);
  if (expiresAtMs === null || expiresAtMs <= Date.now()) {
    removeStorageValue(TOKEN_KEY);
    return null;
  }
  return token;
}

export function saveStoredToken(token: string): void {
  const expiresAtMs = getAccessTokenExpiresAtMs(token);
  if (expiresAtMs === null || expiresAtMs <= Date.now()) {
    removeStorageValue(TOKEN_KEY);
    return;
  }
  writeStorageValue(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  removeStorageValue(TOKEN_KEY);
}

export function loadStoredAuthMode(): AuthMode | null {
  const raw = readStorageValue(AUTH_MODE_KEY);
  if (raw === "guest" || raw === "member") return raw;
  return null;
}

export function saveStoredAuthMode(mode: AuthMode): void {
  writeStorageValue(AUTH_MODE_KEY, mode);
}

export function clearStoredAuthMode(): void {
  removeStorageValue(AUTH_MODE_KEY);
}

export function loadStoredOAuthProvider(): OAuthProvider | null {
  const raw = readStorageValue(OAUTH_PROVIDER_KEY);
  if (raw === "kakao" || raw === "discord") {
    return raw;
  }
  if (raw !== null) {
    removeStorageValue(OAUTH_PROVIDER_KEY);
  }
  return null;
}

export function saveStoredOAuthProvider(provider: OAuthProvider): void {
  writeStorageValue(OAUTH_PROVIDER_KEY, provider);
}

export function clearStoredOAuthProvider(): void {
  removeStorageValue(OAUTH_PROVIDER_KEY);
}

export function loadStoredOAuthIntent(): OAuthIntent {
  return readStorageValue(OAUTH_INTENT_KEY) === "delete_reauth" ? "delete_reauth" : "login";
}

export function saveStoredOAuthIntent(intent: OAuthIntent): void {
  writeStorageValue(OAUTH_INTENT_KEY, intent);
}

export function clearStoredOAuthIntent(): void {
  removeStorageValue(OAUTH_INTENT_KEY);
}

export function loadStoredAuthReturnTo(): string | null {
  const value = readStorageValue(AUTH_RETURN_TO_KEY);
  if (value === '/account' || value?.startsWith('/join/')) return value;
  if (value !== null) removeStorageValue(AUTH_RETURN_TO_KEY);
  return null;
}

export function saveStoredAuthReturnTo(path: string): void {
  if (path === '/account' || path.startsWith('/join/')) writeStorageValue(AUTH_RETURN_TO_KEY, path);
}

export function clearStoredAuthReturnTo(): void {
  removeStorageValue(AUTH_RETURN_TO_KEY);
}

export function saveStoredDeleteReauthTicket(value: StoredDeleteReauthTicket): void {
  writeSessionStorageValue(DELETE_REAUTH_TICKET_KEY, JSON.stringify(value));
}

export function loadStoredDeleteReauthTicket(): StoredDeleteReauthTicket | null {
  const raw = readSessionStorageValue(DELETE_REAUTH_TICKET_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      (value.provider !== 'kakao' && value.provider !== 'discord') ||
      typeof value.ticket !== 'string' ||
      typeof value.expiresAt !== 'number' ||
      value.expiresAt <= Date.now()
    ) {
      clearStoredDeleteReauthTicket();
      return null;
    }
    return {
      provider: value.provider,
      ticket: value.ticket,
      expiresAt: value.expiresAt,
    };
  } catch {
    clearStoredDeleteReauthTicket();
    return null;
  }
}

export function clearStoredDeleteReauthTicket(): void {
  removeSessionStorageValue(DELETE_REAUTH_TICKET_KEY);
}

export function loadStoredSnapshot(): SessionSnapshot | null {
  const raw = readStorageValue(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return normalizeSessionSnapshot(parseJsonWithDecoder(raw, decodeStoredSnapshot, SNAPSHOT_KEY));
  } catch {
    removeStorageValue(SNAPSHOT_KEY);
    return null;
  }
}

export function saveStoredSnapshot(snapshot: SessionSnapshot): void {
  writeStorageValue(
    SNAPSHOT_KEY,
    JSON.stringify(toVersionedStoredValue(snapshot, STORED_SNAPSHOT_SCHEMA_VERSION)),
  );
}

export function clearStoredSnapshot(): void {
  removeStorageValue(SNAPSHOT_KEY);
}

export function clearAll(): void {
  clearStoredUser();
  clearStoredToken();
  clearStoredAuthMode();
  clearStoredOAuthProvider();
  clearStoredOAuthIntent();
  clearStoredAuthReturnTo();
  clearStoredDeleteReauthTicket();
  clearStoredSnapshot();
}

function decodeStoredSnapshot(value: unknown): SessionSnapshotDto {
  if (isVersionedStoredValue(value, STORED_SNAPSHOT_SCHEMA_VERSION)) {
    return decodeSessionSnapshot(value.data);
  }
  return decodeSessionSnapshot(value);
}

function toVersionedStoredValue<T>(data: T, schemaVersion: number): VersionedStoredValue<T> {
  return { schemaVersion, data };
}

function isVersionedStoredValue(value: unknown, expectedVersion: number): value is VersionedStoredValue<unknown> {
  return (
    isRecord(value) &&
    value.schemaVersion === expectedVersion &&
    Object.prototype.hasOwnProperty.call(value, "data")
  );
}

function readStorageValue(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // The current in-memory session remains usable when browser storage is unavailable or full.
  }
}

function removeStorageValue(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Storage cleanup is best-effort when browser privacy settings deny access.
  }
}

function readSessionStorageValue(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeSessionStorageValue(key: string, value: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, value);
  } catch {
    // 짧은 수명의 재인증 결과는 저장소를 사용할 수 없으면 다시 인증받는다.
  }
}

function removeSessionStorageValue(key: string): void {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // 정리는 best-effort로 처리한다.
  }
}
