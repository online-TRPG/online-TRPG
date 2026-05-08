import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_TOKEN_REISSUED_EVENT,
  createGuest,
  deleteMe as apiDeleteMe,
  login,
  logout,
  oauthLogin,
  register,
  reissue,
} from "../services/api";
import { getAccessTokenExpiresAtMs } from "../services/authToken";
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
const TOKEN_REFRESH_LEEWAY_MS = 60 * 1000;

export type AuthNotice = {
  kind: "success" | "warning";
  message: string;
};

export interface UseAuthReturn {
  user: StoredUser | null;
  accessToken: string | null;
  authMode: AuthMode | null;
  busy: boolean;
  error: string | null;
  notice: AuthNotice | null;
  loginAsGuest: (displayName: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerMember: (email: string, password: string, name: string) => Promise<void>;
  handleOAuthCallback: (provider: "kakao" | "discord", code: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
  clearFeedback: () => void;
}

export function useAuth(
  appendLog: (kind: LogEntry["kind"], title: string, message: string) => void,
): UseAuthReturn {
  const [user, setUser] = useState<StoredUser | null>(() => loadStoredUser());
  const [accessToken, setAccessToken] = useState<string | null>(() => loadStoredToken());
  const [authMode, setAuthMode] = useState<AuthMode | null>(() => loadStoredAuthMode());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
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
      setError(null);
      setNotice({ kind: "warning", message });
      appendLog("system", "세션 만료", message);
    },
    [appendLog],
  );

  const refreshAccessToken = useCallback(async () => {
    try {
      const response = await reissue();
      handledExpiredTokenRef.current = false;
      saveStoredToken(response.accessToken);
      setAccessToken(response.accessToken);
      setAuthMode("member");
      setError(null);
    } catch {
      expireSession(TOKEN_EXPIRED_MESSAGE);
    }
  }, [expireSession]);

  useEffect(() => {
    if (!accessToken || authMode !== "member") return undefined;

    const expiresAtMs = getAccessTokenExpiresAtMs(accessToken);
    if (expiresAtMs === null) return undefined;

    // 만료 직전에 refresh token으로 access token을 재발급해 사용자가 작업 중 끊기지 않게 한다.
    const refreshDelayMs = Math.max(expiresAtMs - Date.now() - TOKEN_REFRESH_LEEWAY_MS, 0);
    const timeoutId = window.setTimeout(() => void refreshAccessToken(), refreshDelayMs);
    return () => window.clearTimeout(timeoutId);
  }, [accessToken, authMode, refreshAccessToken]);

  useEffect(() => {
    function handleAuthExpired(event: Event) {
      const detail = event instanceof CustomEvent ? (event.detail as { message?: string } | null) : null;
      expireSession(detail?.message || TOKEN_EXPIRED_MESSAGE);
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [expireSession]);

  useEffect(() => {
    function handleTokenReissued(event: Event) {
      const detail = event instanceof CustomEvent ? (event.detail as { accessToken?: string } | null) : null;
      if (!detail?.accessToken || currentAuthRef.current.authMode !== "member") return;

      handledExpiredTokenRef.current = false;
      saveStoredToken(detail.accessToken);
      setAccessToken(detail.accessToken);
      setError(null);
    }

    window.addEventListener(AUTH_TOKEN_REISSUED_EVENT, handleTokenReissued);
    return () => window.removeEventListener(AUTH_TOKEN_REISSUED_EVENT, handleTokenReissued);
  }, []);

  async function loginAsGuest(displayName: string) {
    const name = displayName.trim();
    if (!name) {
      setError("모험가 이름을 입력해주세요.");
      setNotice(null);
      return;
    }
    setError(null);
    setNotice(null);
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
    if (!email.trim()) {
      setError("이메일을 입력해주세요.");
      setNotice(null);
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      setNotice(null);
      return;
    }
    setError(null);
    setNotice(null);
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
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      setNotice(null);
      return;
    }
    if (!email.trim()) {
      setError("이메일을 입력해주세요.");
      setNotice(null);
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      setNotice(null);
      return;
    }
    setError(null);
    setNotice(null);
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
    setNotice(null);
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

  async function deleteAccount(password: string): Promise<boolean> {
    const currentAuth = currentAuthRef.current;
    if (!currentAuth.accessToken || currentAuth.authMode !== "member") {
      setError("회원 계정만 탈퇴할 수 있습니다.");
      setNotice(null);
      return false;
    }

    if (!password) {
      setError("비밀번호를 입력해주세요.");
      setNotice(null);
      return false;
    }

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiDeleteMe(currentAuth.accessToken, password);

      // 서버 탈퇴가 끝난 뒤에는 로컬 인증 정보도 즉시 지워 재요청에서 삭제된 계정 토큰을 쓰지 않게 한다.
      handledExpiredTokenRef.current = false;
      clearAll();
      setUser(null);
      setAccessToken(null);
      setAuthMode(null);
      setNotice({ kind: "success", message: "회원 탈퇴가 완료되었습니다." });
      appendLog("system", "회원 탈퇴", "회원 탈퇴가 완료되었습니다.");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "회원 탈퇴에 실패했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    let logoutWarning: string | null = null;
    try {
      if (accessToken) {
        await logout(accessToken).catch(() => {
          // 서버 응답이 없어도 로컬 인증 정보는 지워서 현재 기기에서는 즉시 로그아웃되게 한다.
          logoutWarning = "이 기기에서는 로그아웃했습니다. 서버 세션 정리는 확인하지 못했습니다.";
        });
      }
    } finally {
      handledExpiredTokenRef.current = false;
      clearAll();
      setUser(null);
      setAccessToken(null);
      setAuthMode(null);
      setError(null);
      setNotice({
        kind: logoutWarning ? "warning" : "success",
        message: logoutWarning ?? "로그아웃했습니다.",
      });
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
    notice,
    loginAsGuest,
    loginWithEmail,
    registerMember,
    handleOAuthCallback,
    deleteAccount,
    signOut,
    clearError: () => setError(null),
    clearFeedback: () => {
      setError(null);
      setNotice(null);
    },
  };
}
