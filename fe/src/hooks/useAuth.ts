import { useState } from "react";
import { createGuest, login, logout, oauthLogin, register } from "../services/api";
import {
  clearAll,
  loadStoredAuthMode,
  loadStoredToken,
  loadStoredUser,
  saveStoredAuthMode,
  saveStoredToken,
  saveStoredUser,
} from "../services/storage";
import type { AuthMode } from "../types/auth";
import type { LogEntry, StoredUser } from "../types/session";

export interface UseAuthReturn {
  user: StoredUser | null;
  accessToken: string | null;
  authMode: AuthMode | null;
  busy: boolean;
  error: string | null;
  loginAsGuest: (displayName: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerMember: (email: string, password: string, name: string) => Promise<void>;
  handleOAuthCallback: (provider: "kakao" | "discord", code: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(
  appendLog: (kind: LogEntry["kind"], title: string, message: string) => void,
): UseAuthReturn {
  const [user, setUser] = useState<StoredUser | null>(() => loadStoredUser());
  const [accessToken, setAccessToken] = useState<string | null>(() => loadStoredToken());
  const [authMode, setAuthMode] = useState<AuthMode | null>(() => loadStoredAuthMode());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function persist(nextUser: StoredUser, token: string | null, mode: AuthMode) {
    saveStoredUser(nextUser);
    if (token) saveStoredToken(token);
    saveStoredAuthMode(mode);
    setUser(nextUser);
    setAccessToken(token);
    setAuthMode(mode);
  }

  async function loginAsGuest(displayName: string) {
    const name = displayName.trim();
    if (!name) {
      setError("모험가 이름을 입력해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const nextUser = await createGuest(name);
      persist({ id: nextUser.id, displayName: nextUser.displayName, createdAt: nextUser.createdAt }, null, "guest");
      appendLog("rest", "게스트 로그인", `${nextUser.displayName} 님으로 입장했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function loginWithEmail(email: string, password: string) {
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const response = await login(email, password);
      persist(
        { id: response.user.id, displayName: response.user.displayName, createdAt: response.user.createdAt },
        response.accessToken,
        "member",
      );
      appendLog("rest", "로그인", `${response.user.displayName} 님으로 입장했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function registerMember(email: string, password: string, name: string) {
    if (!email.trim() || !password || !name.trim()) {
      setError("모든 항목을 입력해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await register(email, password, name);
      await loginWithEmail(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "회원가입에 실패했습니다.");
      setBusy(false);
    }
  }

  async function handleOAuthCallback(provider: "kakao" | "discord", code: string) {
    const redirectUri = `${window.location.origin}/oauth/callback`;
    setError(null);
    setBusy(true);
    try {
      const response = await oauthLogin(provider, code, redirectUri);
      persist(
        { id: response.user.id, displayName: response.user.displayName, createdAt: response.user.createdAt },
        response.accessToken,
        "member",
      );
      appendLog("rest", "OAuth 로그인", `${response.user.displayName} 님으로 입장했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "OAuth 로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      if (accessToken) await logout(accessToken).catch(() => undefined);
    } finally {
      clearAll();
      setUser(null);
      setAccessToken(null);
      setAuthMode(null);
      setBusy(false);
      appendLog("system", "로그아웃", "로그아웃했습니다.");
    }
  }

  return {
    user,
    accessToken,
    authMode,
    busy,
    error,
    loginAsGuest,
    loginWithEmail,
    registerMember,
    handleOAuthCallback,
    signOut,
    clearError: () => setError(null),
  };
}
