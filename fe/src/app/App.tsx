import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavigateOptions, To } from 'react-router-dom';
import logoImage from '../assets/images/Logo.webp';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { useLogs } from '../hooks/useLogs';
import { useSession } from '../hooks/useSession';
import { getOAuthUrl, getSessionDetail, listScenarios } from '../services/api';
import { AccountPage } from '../pages/AccountPage';
import { CharacterPage } from '../pages/CharacterPage';
import { LobbyPage } from '../pages/LobbyPage';
import { LoginPage } from '../pages/LoginPage';
import { PlayPage } from '../pages/PlayPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PublicProfilePage } from '../pages/PublicProfilePage';
import { ScenarioEditorPage } from '../pages/ScenarioEditorPage';
import { ScenarioPage } from '../pages/ScenarioPage';
import { SessionCreatePage } from '../pages/SessionCreatePage';
import { SessionDetailPage } from '../pages/SessionDetailPage';
import { SessionDiscoverPage } from '../pages/SessionDiscoverPage';
import type { Scenario, User } from '../types/session';
import { buildGameroomPath, buildPublicProfilePath } from '../utils/routes';

type MainView =
  | 'main'
  | 'characters'
  | 'rulebook'
  | 'settings'
  | 'profile'
  | 'publicProfile'
  | 'account'
  | 'scenarios'
  | 'scenariosNew'
  | 'scenarioEdit'
  | 'sessionsDiscover'
  | 'sessionsNew'
  | 'sessionDetail'
  | 'gameroom';

const topNavItems: Array<{
  id: Exclude<
    MainView,
    | 'gameroom'
    | 'publicProfile'
    | 'sessionDetail'
    | 'scenariosNew'
    | 'scenarioEdit'
    | 'settings'
    | 'profile'
    | 'account'
  >;
  label: string;
}> = [
  { id: 'main', label: '메인' },
  { id: 'sessionsDiscover', label: '세션 탐색' },
  { id: 'sessionsNew', label: '세션 생성' },
  { id: 'scenarios', label: '시나리오' },
  { id: 'characters', label: '캐릭터' },
  { id: 'rulebook', label: '룰북' },
];

const pathByView: Record<MainView, string> = {
  main: '/',
  characters: '/characters',
  rulebook: '/rulebook',
  settings: '/settings',
  profile: '/profile',
  publicProfile: '/profile',
  account: '/account',
  scenarios: '/scenarios',
  scenariosNew: '/scenarios/new',
  scenarioEdit: '/scenarios',
  sessionsDiscover: '/sessions/discover',
  sessionsNew: '/sessions/new',
  sessionDetail: '/sessions',
  gameroom: '/gameroom',
};

const viewLabel: Partial<Record<MainView, string>> = {
  main: '메인',
  characters: '캐릭터',
  rulebook: '룰북',
  settings: '설정',
  profile: '프로필',
  publicProfile: '공개 프로필',
  account: '계정',
  scenarios: '시나리오',
  scenariosNew: '시나리오 생성',
  scenarioEdit: '시나리오 편집',
  sessionsDiscover: '세션 탐색',
  sessionsNew: '세션 생성',
  sessionDetail: '세션 상세',
  gameroom: '게임방',
};

const UNSAVED_SCENARIO_MESSAGE = '저장되지 않은 변경사항이 있습니다. 이 화면을 나가시겠습니까?';

function viewFromPathname(pathname: string): MainView | null {
  if (pathname === '/play') {
    return 'gameroom';
  }

  if (/^\/users\/[^/]+\/[^/]+$/.test(pathname) && pathname !== '/users/me/profile') {
    return 'publicProfile';
  }

  if (/^\/sessions\/[^/]+\/[^/]+$/.test(pathname)) {
    return 'sessionDetail';
  }

  if (/^\/gameroom\/[^/]+\/[^/]+$/.test(pathname)) {
    return 'gameroom';
  }

  if (/^\/scenarios\/[^/]+\/edit$/.test(pathname)) {
    return 'scenarioEdit';
  }

  switch (pathname) {
    case '/':
      return 'main';
    case '/characters':
      return 'characters';
    case '/rulebook':
      return 'rulebook';
    case '/settings':
      return 'settings';
    case '/profile':
    case '/users/me/profile':
      return 'profile';
    case '/account':
      return 'account';
    case '/scenarios':
      return 'scenarios';
    case '/scenarios/new':
      return 'scenariosNew';
    case '/sessions/discover':
      return 'sessionsDiscover';
    case '/sessions/new':
      return 'sessionsNew';
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
  const publicProfileMatch = /^\/users\/([^/]+)\/[^/]+$/.exec(location.pathname);
  const publicProfileId = publicProfileMatch?.[1] ?? null;
  const sessionDetailMatch = /^\/sessions\/([^/]+)\/[^/]+$/.exec(location.pathname);
  const sessionDetailId = sessionDetailMatch?.[1] ?? null;
  const gameroomMatch = /^\/gameroom\/([^/]+)\/[^/]+$/.exec(location.pathname);
  const gameroomId = gameroomMatch?.[1] ?? null;
  const publicProfileState = location.state as { profilePreview?: User | null } | null;
  const sessionDiscoverState = location.state as { initialSection?: 'public' | 'my' } | null;
  const scenarioEditMatch = /^\/scenarios\/([^/]+)\/edit$/.exec(location.pathname);
  const scenarioEditId = scenarioEditMatch?.[1] ?? null;
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [hasUnsavedScenarioChanges, setHasUnsavedScenarioChanges] = useState(false);
  const activeView =
    location.pathname === '/oauth/callback'
      ? 'main'
      : (viewFromPathname(location.pathname) ?? 'main');
  const isScenarioEditorActive = activeView === 'scenariosNew' || activeView === 'scenarioEdit';

  const guardedNavigate = useCallback(
    (to: To, options?: NavigateOptions) => {
      if (
        isScenarioEditorActive &&
        hasUnsavedScenarioChanges &&
        !window.confirm(UNSAVED_SCENARIO_MESSAGE)
      ) {
        return;
      }

      setHasUnsavedScenarioChanges(false);
      navigate(to, options);
    },
    [hasUnsavedScenarioChanges, isScenarioEditorActive, navigate]
  );

  useEffect(() => {
    if (!isScenarioEditorActive && hasUnsavedScenarioChanges) {
      setHasUnsavedScenarioChanges(false);
    }
  }, [hasUnsavedScenarioChanges, isScenarioEditorActive]);

  useEffect(() => {
    if (!auth.user) {
      setScenarios([]);
      return;
    }

    listScenarios()
      .then(setScenarios)
      .catch(() => undefined);
  }, [auth.user]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname !== '/oauth/callback') return;

    const code = url.searchParams.get('code');
    const provider = localStorage.getItem('trpg.oauthProvider') as 'kakao' | 'discord' | null;

    if (code && provider) {
      localStorage.removeItem('trpg.oauthProvider');
      navigate('/', { replace: true });
      void auth.handleOAuthCallback(provider, code);
    }
  }, [auth, navigate]);

  useEffect(() => {
    if (location.pathname === '/oauth/callback') return;
    if (viewFromPathname(location.pathname)) return;
    navigate('/', { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    setIsAccountMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current) return;
      if (accountMenuRef.current.contains(event.target as Node)) return;
      setIsAccountMenuOpen(false);
    }

    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (activeView !== 'gameroom') return;
    if (!auth.user) return;
    if (!session.snapshot) {
      navigate('/', { replace: true });
      return;
    }

    if (location.pathname === '/play') {
      navigate(buildGameroomPath(session.snapshot.session), { replace: true });
      return;
    }

    if (gameroomId && session.snapshot.session.publicId !== gameroomId) {
      navigate(buildGameroomPath(session.snapshot.session), { replace: true });
    }
  }, [activeView, auth.user, gameroomId, location.pathname, navigate, session.snapshot]);

  const busy = auth.busy || session.busy;
  const error = auth.error ?? session.error;

  async function handleOAuthLogin(provider: 'kakao' | 'discord') {
    const redirectUri = `${window.location.origin}/oauth/callback`;

    try {
      localStorage.setItem('trpg.oauthProvider', provider);
      const { authUrl } = await getOAuthUrl(provider, redirectUri);
      window.location.href = authUrl;
    } catch {
      localStorage.removeItem('trpg.oauthProvider');
    }
  }

  async function handleCreateSession(
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean }
  ) {
    const nextSnapshot = await session.createSession(title, options);
    if (nextSnapshot) {
      navigate(buildGameroomPath(nextSnapshot.session));
    }
  }

  async function handleJoinSession(inviteCode: string) {
    const nextSnapshot = await session.joinSession(inviteCode);
    if (nextSnapshot) {
      navigate(buildGameroomPath(nextSnapshot.session));
    }
  }

  async function handleJoinSessionById(sessionId: string) {
    const nextSnapshot = await session.joinSessionById(sessionId);
    if (nextSnapshot) {
      navigate(buildGameroomPath(nextSnapshot.session));
    }
    return nextSnapshot;
  }

  async function handleRequestSessionDetail(sessionId: string) {
    if (!auth.user) {
      throw new Error('로그인이 필요합니다.');
    }

    return getSessionDetail(auth.user, sessionId, auth.accessToken);
  }

  function handleLogout() {
    session.clearSnapshot();
    void auth.signOut();
    navigate('/');
  }

  function handleSessionMessage(displayName: string, input: string) {
    const [scopePart, ...restParts] = input.split(':');
    const scoped = scopePart === 'CHAT' || scopePart === 'MAIN';
    const scope = scoped ? scopePart : 'MAIN';
    const message = (scoped ? restParts.join(':') : input).trim();

    if (!message) return;

    if (scope === 'CHAT') {
      appendLog('action', displayName, `[CHAT]${message}`);
      return;
    }

    const commandMatch = message.match(/^\/(roll|hint)\b/i);
    if (commandMatch) {
      const command = commandMatch[1].toLowerCase();
      appendLog(
        'action',
        displayName,
        `[MAIN]${displayName}님이 "${command}" 액션을 실행했습니다.`
      );
      return;
    }

    appendLog('action', displayName, `[MAIN]${message}`);
  }

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
  const isPlayView = activeView === 'gameroom';
  const isAccountSurfaceActive =
    activeView === 'profile' || activeView === 'account' || activeView === 'settings';

  return (
    <div className={isPlayView ? 'app-shell app-shell-session' : 'app-shell app-shell-topnav'}>
      {!isPlayView ? (
        <header className="topbar topbar-shell">
          <div className="topbar-left">
            <div className="topbar-brand">
              <img src={logoImage} alt="모두의 TRPG" className="topbar-logo-image" />
            </div>

            <nav className="top-nav" aria-label="Main navigation">
              {topNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={activeView === item.id ? 'active' : ''}
                  onClick={() => guardedNavigate(pathByView[item.id])}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="topbar-right">
            <div className="topbar-actions" ref={accountMenuRef}>
              <button
                type="button"
                className={
                  isAccountSurfaceActive || isAccountMenuOpen
                    ? 'icon-button profile-chip active'
                    : 'icon-button profile-chip'
                }
                onClick={() => setIsAccountMenuOpen((current) => !current)}
                aria-label="계정 메뉴 열기"
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
              >
                <div className="avatar">{currentUser.displayName.slice(0, 1)}</div>
                <strong>{currentUser.displayName}</strong>
                <Icon name="chevron-down" />
              </button>

              {isAccountMenuOpen ? (
                <div className="account-menu" role="menu" aria-label="계정 메뉴">
                  <div className="account-menu-header">
                    <div className="avatar avatar-lg">{currentUser.displayName.slice(0, 1)}</div>
                    <div className="account-menu-copy">
                      <strong>{currentUser.displayName}</strong>
                      <span>{auth.authMode === 'guest' ? '게스트 세션' : '회원 계정'}</span>
                    </div>
                  </div>

                  <div className="account-menu-list">
                    <button
                      type="button"
                      className="account-menu-item"
                      onClick={() => guardedNavigate('/profile')}
                      role="menuitem"
                    >
                      <Icon name="user" />
                      <span>내 프로필</span>
                    </button>
                    <button
                      type="button"
                      className="account-menu-item"
                      onClick={() => guardedNavigate('/account')}
                      role="menuitem"
                    >
                      <Icon name="shield" />
                      <span>계정 관리</span>
                    </button>
                    <button
                      type="button"
                      className="account-menu-item"
                      onClick={() => guardedNavigate('/settings')}
                      role="menuitem"
                    >
                      <Icon name="settings" />
                      <span>설정</span>
                    </button>
                  </div>

                  <div className="account-menu-divider" />

                  <button
                    type="button"
                    className="account-menu-item danger"
                    onClick={handleLogout}
                    role="menuitem"
                  >
                    <Icon name="logout" />
                    <span>로그아웃</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      <div className={isPlayView ? 'workspace workspace-session' : 'workspace workspace-topnav'}>
        {!isPlayView && activeView === 'main' ? (
          <LobbyPage
            user={currentUser}
            snapshot={session.snapshot}
            sessionList={session.sessionList}
            mySessionList={session.mySessionList}
            logs={logs}
            busy={busy}
            error={error}
            onOpenDiscover={() =>
              guardedNavigate('/sessions/discover', {
                state: { initialSection: 'public' },
              })
            }
            onOpenMySessions={() =>
              guardedNavigate('/sessions/discover', {
                state: { initialSection: 'my' },
              })
            }
            onOpenCreate={() => guardedNavigate('/sessions/new')}
            onOpenPlay={() =>
              session.snapshot && guardedNavigate(buildGameroomPath(session.snapshot.session))
            }
            onLeaveCurrentSession={() => void session.leaveSession()}
          />
        ) : null}

        {!isPlayView && activeView === 'characters' ? (
          <CharacterPage
            user={currentUser}
            busy={busy}
            characters={session.myCharacters}
            snapshot={session.snapshot}
            error={error}
            onCreateCharacter={(payload) => session.createCharacter(payload)}
            onCloneCharacter={(characterId) => session.cloneCharacter(characterId)}
            onUpdateCharacter={(characterId, payload) => session.updateCharacter(characterId, payload)}
            onDeleteCharacter={(characterId) => session.deleteCharacter(characterId)}
          />
        ) : null}

        {!isPlayView && activeView === 'profile' ? (
          <ProfilePage
            user={currentUser}
            accessToken={auth.accessToken}
            authMode={auth.authMode}
            busy={busy}
            error={error}
            onLogout={handleLogout}
            onOpenAccount={() => guardedNavigate('/account')}
          />
        ) : null}

        {!isPlayView && activeView === 'account' ? (
          <AccountPage
            user={currentUser}
            accessToken={auth.accessToken}
            authMode={auth.authMode}
            busy={busy}
            error={error}
            onLogout={handleLogout}
            onOpenProfile={() => guardedNavigate('/profile')}
          />
        ) : null}

        {!isPlayView && activeView === 'scenarios' ? (
          <ScenarioPage
            user={currentUser}
            accessToken={auth.accessToken}
            busy={busy}
            error={error}
            onOpenCreate={() => guardedNavigate('/scenarios/new')}
            onOpenEdit={(scenarioId) => guardedNavigate(`/scenarios/${scenarioId}/edit`)}
          />
        ) : null}

        {!isPlayView && activeView === 'scenariosNew' ? (
          <ScenarioEditorPage
            user={currentUser}
            accessToken={auth.accessToken}
            onUnsavedChangesChange={setHasUnsavedScenarioChanges}
            onDone={() => {
              void listScenarios()
                .then(setScenarios)
                .catch(() => undefined);
              setHasUnsavedScenarioChanges(false);
              navigate('/scenarios');
            }}
            onCancel={() => guardedNavigate('/scenarios')}
          />
        ) : null}

        {!isPlayView && activeView === 'scenarioEdit' ? (
          <ScenarioEditorPage
            user={currentUser}
            accessToken={auth.accessToken}
            scenarioId={scenarioEditId}
            onUnsavedChangesChange={setHasUnsavedScenarioChanges}
            onDone={() => {
              void listScenarios()
                .then(setScenarios)
                .catch(() => undefined);
              setHasUnsavedScenarioChanges(false);
              navigate('/scenarios');
            }}
            onCancel={() => guardedNavigate('/scenarios')}
          />
        ) : null}

        {!isPlayView && activeView === 'sessionsDiscover' ? (
          <SessionDiscoverPage
            snapshot={session.snapshot}
            sessionList={session.sessionList}
            mySessionList={session.mySessionList}
            initialSection={sessionDiscoverState?.initialSection ?? 'public'}
            busy={busy}
            error={error}
            onClearError={session.clearError}
            onJoinSession={handleJoinSession}
            onJoinSessionById={handleJoinSessionById}
            onRequestSessionDetail={handleRequestSessionDetail}
            onOpenHostProfile={(host) =>
              guardedNavigate(buildPublicProfilePath(host), {
                state: { profilePreview: host },
              })
            }
            onOpenCreate={() => guardedNavigate('/sessions/new')}
            onOpenPlay={() =>
              session.snapshot && guardedNavigate(buildGameroomPath(session.snapshot.session))
            }
          />
        ) : null}

        {!isPlayView && activeView === 'publicProfile' && publicProfileId ? (
          <PublicProfilePage
            publicId={publicProfileId}
            previewUser={publicProfileState?.profilePreview ?? null}
            onOpenOwnProfile={() => guardedNavigate('/profile')}
          />
        ) : null}

        {!isPlayView && activeView === 'sessionDetail' && sessionDetailId ? (
          <SessionDetailPage
            user={currentUser}
            accessToken={auth.accessToken}
            sessionPublicId={sessionDetailId}
            snapshot={session.snapshot}
            busy={busy}
            onJoinSessionById={handleJoinSessionById}
            onOpenPlay={() =>
              session.snapshot && guardedNavigate(buildGameroomPath(session.snapshot.session))
            }
            onOpenHostProfile={(host) =>
              guardedNavigate(buildPublicProfilePath(host), {
                state: { profilePreview: host },
              })
            }
          />
        ) : null}

        {!isPlayView && activeView === 'sessionsNew' ? (
          <SessionCreatePage
            scenarios={scenarios}
            snapshot={session.snapshot}
            busy={busy}
            error={error}
            onCreateSession={handleCreateSession}
            onOpenDiscover={() => guardedNavigate('/sessions/discover')}
          />
        ) : null}

        {!isPlayView &&
        activeView !== 'main' &&
        activeView !== 'characters' &&
        activeView !== 'profile' &&
        activeView !== 'publicProfile' &&
        activeView !== 'account' &&
        activeView !== 'scenarios' &&
        activeView !== 'scenariosNew' &&
        activeView !== 'scenarioEdit' &&
        activeView !== 'sessionsDiscover' &&
        activeView !== 'sessionsNew' &&
        activeView !== 'sessionDetail' ? (
          <section className="placeholder-view">
            <span className="eyebrow">Coming soon</span>
            <h1>{viewLabel[activeView] ?? '준비 중'}</h1>
            <p>
              이 화면은 아직 준비 중입니다. 현재는 메인, 캐릭터, 세션 탐색, 세션 생성 흐름이 우선
              연결되어 있습니다.
            </p>
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
              navigate('/sessions/discover');
            }}
            onBackToLobby={() => navigate('/sessions/discover')}
            onAction={(input) => handleSessionMessage(currentUser.displayName, input)}
          />
        ) : null}
      </div>
    </div>
  );
}
