import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { useAuth } from "../hooks/useAuth";
import { useLogs } from "../hooks/useLogs";
import { useSession } from "../hooks/useSession";
import { getOAuthUrl, listScenarios } from "../services/api";
import { LoginPage } from "../pages/LoginPage";
import { LobbyPage } from "../pages/LobbyPage";
import { PlayPage } from "../pages/PlayPage";
import type { Scenario } from "../types/session";

export function App() {
  const { logs, appendLog } = useLogs();
  const auth = useAuth(appendLog);
  const session = useSession(auth.user, auth.accessToken, appendLog);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeView, setActiveView] = useState<"lobby" | "play">("lobby");

  useEffect(() => {
    listScenarios()
      .then(setScenarios)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname !== "/oauth/callback") return;

    const code = url.searchParams.get("code");
    const provider = localStorage.getItem("trpg.oauthProvider") as "kakao" | "discord" | null;

    window.history.replaceState({}, "", "/");

    if (code && provider) {
      localStorage.removeItem("trpg.oauthProvider");
      void auth.handleOAuthCallback(provider, code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = auth.busy || session.busy;
  const error = auth.error ?? session.error;

  async function handleOAuthLogin(provider: "kakao" | "discord") {
    const redirectUri = `${window.location.origin}/oauth/callback`;
    try {
      localStorage.setItem("trpg.oauthProvider", provider);
      const { authUrl } = await getOAuthUrl(provider, redirectUri);
      window.location.href = authUrl;
    } catch {
      localStorage.removeItem("trpg.oauthProvider");
    }
  }

  function handleLogout() {
    session.clearSnapshot();
    void auth.signOut();
    setActiveView("lobby");
  }

  const statusText = useMemo(() => {
    if (!session.snapshot) return "세션 없음";
    return `${session.snapshot.participants.length}명 참가 · ${session.snapshot.characters.length}개 캐릭터`;
  }, [session.snapshot]);

  if (!auth.user) {
    return (
      <LoginPage
        busy={busy}
        error={error}
        onGuestLogin={(name) => void auth.loginAsGuest(name)}
        onEmailLogin={(email, pw) => void auth.loginWithEmail(email, pw)}
        onRegister={(email, pw, name) => void auth.registerMember(email, pw, name)}
        onOAuthLogin={(provider) => void handleOAuthLogin(provider)}
      />
    );
  }

  const currentUser = auth.user;

  return (
    <div className="app-shell">
      <Sidebar
        user={currentUser}
        authMode={auth.authMode}
        activeView={activeView}
        onViewChange={setActiveView}
        onLogout={handleLogout}
      />
      <div className="workspace">
        <header className="topbar">
          <div>
            <strong>{session.snapshot?.session.title ?? "로비"}</strong>
            <span>{statusText}</span>
          </div>
          <div className="topbar-right">
            <span className={session.socketConnected ? "status online" : "status"}>
              {session.socketConnected ? "실시간 연결" : "실시간 대기"}
            </span>
            <div className="avatar">{auth.user.displayName.slice(0, 1)}</div>
          </div>
        </header>

        {activeView === "lobby" ? (
          <LobbyPage
            user={auth.user}
            scenarios={scenarios}
            snapshot={session.snapshot}
            sessionList={session.sessionList}
            logs={logs}
            busy={busy}
            error={error}
            onCreateSession={(title, scenarioId) => void session.createSession(title, scenarioId)}
            onJoinSession={(code) => void session.joinSession(code)}
            onCreateCharacter={(payload) => void session.createCharacter(payload)}
            onOpenPlay={() => setActiveView("play")}
          />
        ) : (
          <PlayPage
            user={auth.user}
            snapshot={session.snapshot}
            logs={logs}
            socketConnected={session.socketConnected}
            onAction={(label) =>
              appendLog(
                "action",
                label,
                `${currentUser.displayName} 님이 "${label}" 행동을 선언했습니다.`,
              )
            }
          />
        )}
      </div>
    </div>
  );
}
