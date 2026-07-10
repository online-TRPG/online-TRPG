import { UserRole, type SessionSnapshotDto } from "@trpg/shared-types";
import {
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
