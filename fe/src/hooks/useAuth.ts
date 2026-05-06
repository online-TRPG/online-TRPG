import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_EXPIRED_EVENT, createGuest, login, logout, oauthLogin, register } from "../services/api";
import { getAccessTokenExpiresAtMs, isAccessTokenExpired } from "../services/authToken";
import {
  clearAll,
  clearStoredToken,
  loadStoredAuthMode,
  loadStoredToken,
  loadStoredUser,
  saveStoredAuthMode,
  saveStoredToken,
  saveStoredUser,
} from "../services/storage";
import type { AuthMode } from "../types/auth";
import type { LogEntry, StoredUser } from "../types/session";

const TOKEN_EXPIRED_MESSAGE = "로그인 시간이 만료되었습니다. 다시 로그인해주세요.";

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
  const handledExpiredTokenRef = useRef(false);
  const currentAuthRef = useRef({ accessToken, authMode, user });

  useEffect(() => {
    currentAuthRef.current = { accessToken, authMode, user };
  }, [accessToken, authMode, user]);

  function persist(nextUser: StoredUser, token: string | null, mode: AuthMode) {
    handledExpiredTokenRef.current = false;
    saveStoredUser(nextUser);
    if (token) {
      saveStoredToken(token);
    } else {
      // 게스트 세션은 access token을 쓰지 않으므로 이전 회원 토큰이 남아 인증 헤더에 섞이지 않게 지운다.
      clearStoredToken();
    }
    saveStoredAuthMode(mode);
    setUser(nextUser);
    setAccessToken(token);
    setAuthMode(mode);
  }

  const expireSession = useCallback(
    (message = TOKEN_EXPIRED_MESSAGE) => {
      const currentAuth = currentAuthRef.current;
      if (!currentAuth.user && !currentAuth.accessToken) return;
      if (handledExpiredTokenRef.current) return;

      handledExpiredTokenRef.current = true;
      clearAll();
      setUser(null);
      setAccessToken(null);
      setAuthMode(null);
      setBusy(false);
      setError(message);
      appendLog("system", "세션 만료", message);
    },
    [appendLog],
  );

  useEffect(() => {
    if (!accessToken) return undefined;

    if (isAccessTokenExpired(accessToken)) {
      expireSession();
      return undefined;
    }

    const expiresAtMs = getAccessTokenExpiresAtMs(accessToken);
    if (expiresAtMs === null) return undefined;

    // JWT exp 시각에 맞춰 로컬 상태도 정리해야, 다음 API 호출을 기다리지 않고 화면이 바로 로그아웃된다.
    const timeoutId = window.setTimeout(() => expireSession(), expiresAtMs - Date.now());
    return () => window.clearTimeout(timeoutId);
  }, [accessToken, expireSession]);

  useEffect(() => {
    function handleAuthExpired(event: Event) {
      const detail = event instanceof CustomEvent ? (event.detail as { message?: string } | null) : null;
      expireSession(detail?.message || TOKEN_EXPIRED_MESSAGE);
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [expireSession]);

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
      persist(
        {
          id: nextUser.id,
          publicId: nextUser.publicId,
          displayName: nextUser.displayName,
          createdAt: nextUser.createdAt,
        },
        null,
        "guest",
      );
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
        {
          id: response.user.id,
          publicId: response.user.publicId,
          displayName: response.user.displayName,
          createdAt: response.user.createdAt,
        },
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
        {
          id: response.user.id,
          publicId: response.user.publicId,
          displayName: response.user.displayName,
          createdAt: response.user.createdAt,
        },
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
      handledExpiredTokenRef.current = false;
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
