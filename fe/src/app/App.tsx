import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import logoImage from "../assets/images/Logo.png";
import { Icon } from "../components/Icon";
import { useAuth } from "../hooks/useAuth";
import { useLogs } from "../hooks/useLogs";
import { useSession } from "../hooks/useSession";
import { getOAuthUrl, listScenarios } from "../services/api";
import { AccountPage } from "../pages/AccountPage";
import { CharacterPage } from "../pages/CharacterPage";
import { LobbyPage } from "../pages/LobbyPage";
import { LoginPage } from "../pages/LoginPage";
import { PlayPage } from "../pages/PlayPage";
import { ProfilePage } from "../pages/ProfilePage";
import { SessionCreatePage } from "../pages/SessionCreatePage";
import { SessionDiscoverPage } from "../pages/SessionDiscoverPage";
import type { Scenario } from "../types/session";

type MainView =
  | "main"
  | "characters"
  | "rulebook"
  | "settings"
  | "profile"
  | "account"
  | "sessionsDiscover"
  | "sessionsNew"
  | "play";

const topNavItems: Array<{ id: Exclude<MainView, "play">; label: string }> = [
  { id: "main", label: "메인" },
  { id: "sessionsDiscover", label: "세션 탐색" },
  { id: "sessionsNew", label: "세션 생성" },
  { id: "characters", label: "캐릭터" },
  { id: "rulebook", label: "룰북" },
  { id: "settings", label: "설정" },
  { id: "profile", label: "프로필" },
  { id: "account", label: "계정" },
];

const pathByView: Record<MainView, string> = {
  main: "/",
  characters: "/characters",
  rulebook: "/rulebook",
  settings: "/settings",
  profile: "/profile",
  account: "/account",
  sessionsDiscover: "/sessions/discover",
  sessionsNew: "/sessions/new",
  play: "/play",
};

function viewFromPathname(pathname: string): MainView | null {
  switch (pathname) {
    case "/":
      return "main";
    case "/characters":
      return "characters";
    case "/rulebook":
      return "rulebook";
    case "/settings":
      return "settings";
    case "/profile":
    case "/users/me/profile":
      return "profile";
    case "/account":
      return "account";
    case "/sessions/discover":
      return "sessionsDiscover";
    case "/sessions/new":
      return "sessionsNew";
    case "/play":
      return "play";
    default:
      return null;
  }
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logs, appendLog } = useLogs();
  const auth = useAuth(appendLog);
  const session = useSession(auth.user, auth.accessToken, appendLog);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const activeView =
    location.pathname === "/oauth/callback" ? "main" : (viewFromPathname(location.pathname) ?? "main");

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

    if (code && provider) {
      localStorage.removeItem("trpg.oauthProvider");
      navigate("/", { replace: true });
      void auth.handleOAuthCallback(provider, code);
    }
  }, [auth, navigate]);

  useEffect(() => {
    if (location.pathname === "/oauth/callback") return;
    if (viewFromPathname(location.pathname)) return;
    navigate("/", { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname !== "/play") return;
    if (!auth.user) return;
    if (session.snapshot) return;
    navigate("/", { replace: true });
  }, [auth.user, location.pathname, navigate, session.snapshot]);

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

  async function handleCreateSession(
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean },
  ) {
    const success = await session.createSession(title, options);
    if (success) {
      navigate("/play");
    }
  }

  async function handleJoinSession(inviteCode: string) {
    const success = await session.joinSession(inviteCode);
    if (success) {
      navigate("/play");
    }
  }

  async function handleJoinSessionById(sessionId: string) {
    const success = await session.joinSessionById(sessionId);
    if (success) {
      navigate("/play");
    }
  }

  function handleLogout() {
    session.clearSnapshot();
    void auth.signOut();
    navigate("/");
  }

  function handleSessionMessage(displayName: string, input: string) {
    const [scopePart, ...restParts] = input.split(":");
    const scoped = scopePart === "CHAT" || scopePart === "MAIN";
    const scope = scoped ? scopePart : "MAIN";
    const message = (scoped ? restParts.join(":") : input).trim();

    if (!message) return;

    if (scope === "CHAT") {
      appendLog("action", displayName, `[CHAT]${message}`);
      return;
    }

    const commandMatch = message.match(/^\/(roll|hint)\b/i);
    if (commandMatch) {
      const command = commandMatch[1].toLowerCase();
      appendLog("action", displayName, `[MAIN]${displayName}님이 "${command}" 액션을 실행했습니다.`);
      return;
    }

    appendLog("action", displayName, `[MAIN]${message}`);
  }

  const statusText = useMemo(() => {
    if (!session.snapshot) return "Realtime standby";
    return `${session.snapshot.participants.length}명 참여, ${session.snapshot.characters.length}개 캐릭터`;
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
  const isPlayView = activeView === "play";

  return (
    <div className={isPlayView ? "app-shell app-shell-session" : "app-shell app-shell-topnav"}>
      {!isPlayView ? (
        <header className="topbar topbar-shell">
          <div className="topbar-left">
            <div className="topbar-brand">
              <img src={logoImage} alt="모두의 TRPG" className="topbar-logo-image" />
              <div>
                <strong>TRPG</strong>
                <span>session dashboard</span>
              </div>
            </div>

            <nav className="top-nav" aria-label="Main navigation">
              {topNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={activeView === item.id ? "active" : ""}
                  onClick={() => navigate(pathByView[item.id])}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="topbar-right">
            <span className={session.socketConnected ? "status-pill online" : "status-pill"}>{statusText}</span>
            <div className="topbar-actions">
              <button
                type="button"
                className={activeView === "profile" ? "icon-button active" : "icon-button"}
                onClick={() => navigate("/profile")}
                aria-label="프로필 열기"
              >
                <div className="avatar">{currentUser.displayName.slice(0, 1)}</div>
              </button>
              <button type="button" className="icon-button" onClick={handleLogout} aria-label="로그아웃">
                <Icon name="logout" />
              </button>
            </div>
          </div>
        </header>
      ) : null}

      <div className={isPlayView ? "workspace workspace-session" : "workspace workspace-topnav"}>
        {!isPlayView && activeView === "main" ? (
          <LobbyPage
            user={currentUser}
            snapshot={session.snapshot}
            sessionList={session.sessionList}
            mySessionList={session.mySessionList}
            logs={logs}
            busy={busy}
            error={error}
            onOpenDiscover={() => navigate("/sessions/discover")}
            onOpenCreate={() => navigate("/sessions/new")}
            onOpenPlay={() => navigate("/play")}
            onLeaveCurrentSession={() => void session.leaveSession()}
          />
        ) : null}

        {!isPlayView && activeView === "characters" ? (
          <CharacterPage
            user={currentUser}
            busy={busy}
            characters={session.myCharacters}
            snapshot={session.snapshot}
            error={error}
            onCreateCharacter={(payload) => void session.createCharacter(payload)}
          />
        ) : null}

        {!isPlayView && activeView === "profile" ? (
          <ProfilePage
            user={currentUser}
            accessToken={auth.accessToken}
            authMode={auth.authMode}
            busy={busy}
            error={error}
            onLogout={handleLogout}
            onOpenAccount={() => navigate("/account")}
          />
        ) : null}

        {!isPlayView && activeView === "account" ? (
          <AccountPage
            user={currentUser}
            accessToken={auth.accessToken}
            authMode={auth.authMode}
            busy={busy}
            error={error}
            onLogout={handleLogout}
            onOpenProfile={() => navigate("/users/me/profile")}
          />
        ) : null}

        {!isPlayView && activeView === "sessionsDiscover" ? (
          <SessionDiscoverPage
            snapshot={session.snapshot}
            sessionList={session.sessionList}
            mySessionList={session.mySessionList}
            busy={busy}
            error={error}
            onJoinSession={handleJoinSession}
            onJoinSessionById={handleJoinSessionById}
            onOpenCreate={() => navigate("/sessions/new")}
            onOpenPlay={() => navigate("/play")}
          />
        ) : null}

        {!isPlayView && activeView === "sessionsNew" ? (
          <SessionCreatePage
            scenarios={scenarios}
            snapshot={session.snapshot}
            busy={busy}
            error={error}
            onCreateSession={handleCreateSession}
            onOpenDiscover={() => navigate("/sessions/discover")}
          />
        ) : null}

        {!isPlayView &&
        activeView !== "main" &&
        activeView !== "characters" &&
        activeView !== "profile" &&
        activeView !== "account" &&
        activeView !== "sessionsDiscover" &&
        activeView !== "sessionsNew" ? (
          <section className="placeholder-view">
            <span className="eyebrow">Coming soon</span>
            <h1>{topNavItems.find((item) => item.id === activeView)?.label}</h1>
            <p>이 화면은 아직 준비 중입니다. 현재는 메인, 캐릭터, 세션 탐색, 세션 생성 흐름이 우선 연결되어 있습니다.</p>
          </section>
        ) : null}

        {isPlayView ? (
          <PlayPage
            user={currentUser}
            snapshot={session.snapshot}
            characters={session.myCharacters}
            logs={logs}
            socketConnected={session.socketConnected}
            busy={busy}
            error={error}
            onCreateCharacter={(payload) => void session.createCharacter(payload)}
            onSelectCharacter={(characterId) => void session.selectCharacter(characterId)}
            onSetReady={(isReady) => void session.setReadyState(isReady)}
            onStartSession={() => void session.startSession()}
            onLeaveSession={() => {
              void session.leaveSession();
              navigate("/");
            }}
            onBackToLobby={() => navigate("/")}
            onAction={(input) => handleSessionMessage(currentUser.displayName, input)}
          />
        ) : null}
      </div>
    </div>
  );
}
