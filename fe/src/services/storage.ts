import { normalizeSessionSnapshot, type SessionSnapshot, type StoredUser } from "../types/session";

const USER_KEY = "trpg.currentUser";
const SNAPSHOT_KEY = "trpg.currentSnapshot";

export function loadStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredUser;
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

export function loadStoredSnapshot(): SessionSnapshot | null {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) {
    return null;
  }

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
