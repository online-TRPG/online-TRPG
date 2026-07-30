import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavigateOptions, To } from 'react-router-dom';
import logoImage from '../assets/images/Logo.webp';
import { Icon } from '../components/Icon';
import { ProductTutorialGuide } from '../components/ProductTutorialGuide';
import { useAuth } from '../hooks/useAuth';
import { useLogs } from '../hooks/useLogs';
import { useProductProgress } from '../hooks/useProductProgress';
import { useSession } from '../hooks/useSession';
import type { ClassDefinitionResponseDto, RaceResponseDto } from '@trpg/shared-types';
import { decodeUserResponse, isRecord, SessionActivityStatus, SessionJoinPolicy } from '@trpg/shared-types/frontend';
import { getOAuthUrl, reauthenticateOAuth } from '../services/authApi';
import type { DeleteAccountCredential } from '../services/authApi';
import { listClassDefinitions, listRaces } from '../services/catalogApi';
import { listAvailableScenarios } from '../services/scenarioApi';
import { getSessionDetail } from '../services/sessionApi';
import type { CreateSessionInput } from '../services/sessionApi';
import {
  clearStoredAuthReturnTo,
  clearStoredOAuthProvider,
  clearStoredOAuthIntent,
  loadStoredAuthReturnTo,
  loadStoredOAuthProvider,
  loadStoredOAuthIntent,
  saveStoredDeleteReauthTicket,
  saveStoredAuthReturnTo,
  saveStoredOAuthProvider,
  saveStoredOAuthIntent,
} from '../services/storage';
import { AccountPage } from '../pages/AccountPage';
import { CharacterPage } from '../pages/CharacterPage';
import { LobbyPage } from '../pages/LobbyPage';
import { LoginPage } from '../pages/LoginPage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { configureProductEventContext } from '../services/productEvents';
import { PlayPage } from '../pages/PlayPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PublicProfilePage } from '../pages/PublicProfilePage';
import { RulebookPage } from '../pages/RulebookPage';
import { ScenarioEditorPage } from '../pages/ScenarioEditorPage';
import { ScenarioPage } from '../pages/ScenarioPage';
import { SessionCreatePage } from '../pages/SessionCreatePage';
import { SessionDetailPage } from '../pages/SessionDetailPage';
import { SessionDiscoverPage } from '../pages/SessionDiscoverPage';
import { SessionInvitePreviewPage } from '../pages/SessionInvitePreviewPage';
import type { Scenario, User } from '../types/session';
import { buildGameroomPath, buildPublicProfilePath, buildSessionPath } from '../utils/routes';

type MainView =
  | 'main'
  | 'characters'
  | 'rulebook'
  | 'profile'
  | 'publicProfile'
  | 'account'
  | 'scenarios'
  | 'scenariosNew'
  | 'scenarioEdit'
  | 'sessionsDiscover'
  | 'sessionsNew'
  | 'sessionDetail'
  | 'sessionInvite'
  | 'gameroom';

const topNavItems: Array<{
  id: Exclude<
    MainView,
    | 'gameroom'
    | 'publicProfile'
    | 'sessionDetail'
    | 'sessionInvite'
    | 'scenariosNew'
    | 'scenarioEdit'
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
  profile: '/profile',
  publicProfile: '/profile',
  account: '/account',
  scenarios: '/scenarios',
  scenariosNew: '/scenarios/new',
  scenarioEdit: '/scenarios',
  sessionsDiscover: '/sessions/discover',
  sessionsNew: '/sessions/new',
  sessionDetail: '/sessions',
  sessionInvite: '/join',
  gameroom: '/gameroom',
};

const UNSAVED_SCENARIO_MESSAGE =
  '저장하지 않은 변경 사항이 있습니다. 화면을 이동하면 작업 내용이 사라질 수 있습니다.';

type CharacterPageState = {
  characterCreateReturn?: {
    path: string;
    sessionTitle: string;
    autoOpenCreate?: boolean;
  };
};

function readPublicProfileState(value: unknown): { profilePreview?: User | null } | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.profilePreview === undefined || value.profilePreview === null) {
    return { profilePreview: null };
  }
  try {
    return { profilePreview: decodeUserResponse(value.profilePreview) };
  } catch {
    return null;
  }
}

function readSessionDiscoverState(value: unknown): { initialSection?: 'public' | 'my' } | null {
  if (!isRecord(value)) {
    return null;
  }
  return value.initialSection === 'public' || value.initialSection === 'my'
    ? { initialSection: value.initialSection }
    : null;
}

function readSessionCreateState(value: unknown): { initialScenarioId?: string | null } | null {
  if (!isRecord(value)) {
    return null;
  }
  return value.initialScenarioId === null || typeof value.initialScenarioId === 'string'
    ? { initialScenarioId: value.initialScenarioId }
    : null;
}

function readCharacterPageState(value: unknown): CharacterPageState | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.characterCreateReturn === undefined) {
    return {};
  }
  if (!isRecord(value.characterCreateReturn)) {
    return null;
  }
  const returnState = value.characterCreateReturn;
  if (typeof returnState.path !== 'string' || typeof returnState.sessionTitle !== 'string') {
    return null;
  }
  return {
    characterCreateReturn: {
      path: returnState.path,
      sessionTitle: returnState.sessionTitle,
      autoOpenCreate: returnState.autoOpenCreate === true,
    },
  };
}

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

  if (/^\/join\/[^/]+$/.test(pathname)) {
    return 'sessionInvite';
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
  const { logs, appendLog, appendOlderLogs, removeLog, clearSessionLogs } = useLogs();
  const auth = useAuth(appendLog);
  const session = useSession(
    auth.user,
    auth.accessToken,
    appendLog,
    appendOlderLogs,
    removeLog,
    clearSessionLogs
  );
  const productProgress = useProductProgress(auth.user, auth.accessToken);
  const recordingFirstActionRef = useRef(false);
  const activePlayEntryAttemptRef = useRef<string | null>(null);
  const publicProfileMatch = /^\/users\/([^/]+)\/[^/]+$/.exec(location.pathname);
  const publicProfileId = publicProfileMatch?.[1] ?? null;
  const sessionDetailMatch = /^\/sessions\/([^/]+)\/[^/]+$/.exec(location.pathname);
  const sessionDetailId = sessionDetailMatch?.[1] ?? null;
  const gameroomMatch = /^\/gameroom\/([^/]+)\/[^/]+$/.exec(location.pathname);
  const gameroomId = gameroomMatch?.[1] ?? null;
  const inviteMatch = /^\/join\/([^/]+)$/.exec(location.pathname);
  const inviteCode = inviteMatch?.[1] ?? null;
  const previousPathnameRef = useRef<string | null>(null);
  const publicProfileState = readPublicProfileState(location.state);
  const sessionDiscoverState = readSessionDiscoverState(location.state);
  const sessionCreateState = readSessionCreateState(location.state);
  const characterPageState = readCharacterPageState(location.state);
  const scenarioEditMatch = /^\/scenarios\/([^/]+)\/edit$/.exec(location.pathname);
  const scenarioEditId = scenarioEditMatch?.[1] ?? null;
  const scenarioEditAutoStartPublish = new URLSearchParams(location.search).get('publish') === '1';
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    configureProductEventContext(auth.user ? { user: auth.user, accessToken: auth.accessToken } : null);
    return () => configureProductEventContext(null);
  }, [auth.accessToken, auth.user]);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [races, setRaces] = useState<RaceResponseDto[]>([]);
  const [classDefinitions, setClassDefinitions] = useState<ClassDefinitionResponseDto[]>([]);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [hasUnsavedScenarioChanges, setHasUnsavedScenarioChanges] = useState(false);
  const [pendingGameroomPublicId, setPendingGameroomPublicId] = useState<string | null>(null);
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

  const reloadScenarios = useCallback(() => {
    if (!auth.user) {
      setScenarios([]);
      return Promise.resolve();
    }

    return listAvailableScenarios(auth.user, auth.accessToken)
      .then(setScenarios)
      .catch(() => undefined);
  }, [auth.accessToken, auth.user]);

  useEffect(() => {
    if (!isScenarioEditorActive && hasUnsavedScenarioChanges) {
      setHasUnsavedScenarioChanges(false);
    }
  }, [hasUnsavedScenarioChanges, isScenarioEditorActive]);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = location.pathname;

    if (previousPathname === null || previousPathname === location.pathname) {
      return;
    }

    auth.clearError();
    session.clearError();
  }, [location.pathname]);

  useEffect(() => {
    void reloadScenarios();
  }, [location.pathname, reloadScenarios]);

  useEffect(() => {
    if (!auth.user) {
      setRaces([]);
      setClassDefinitions([]);
      return;
    }
    listRaces()
      .then(setRaces)
      .catch(() => undefined);
    listClassDefinitions()
      .then(setClassDefinitions)
      .catch(() => undefined);
  }, [auth.user]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname !== '/oauth/callback') return;

    const code = url.searchParams.get('code');
    const provider = loadStoredOAuthProvider();
    const intent = loadStoredOAuthIntent();

    if (code && provider) {
      clearStoredOAuthProvider();
      clearStoredOAuthIntent();
      const returnTo = loadStoredAuthReturnTo() ?? '/';
      clearStoredAuthReturnTo();
      if (intent === 'delete_reauth' && auth.user) {
        const redirectUri = `${window.location.origin}/oauth/callback`;
        void reauthenticateOAuth(auth.user, auth.accessToken, provider, code, redirectUri)
          .then((result) => {
            saveStoredDeleteReauthTicket({
              provider,
              ticket: result.ticket,
              expiresAt: Date.now() + result.expiresIn * 1000,
            });
          })
          .catch(() => undefined)
          .finally(() => navigate('/account', { replace: true }));
      } else {
        navigate(returnTo, { replace: true });
        void auth.handleOAuthCallback(provider, code);
      }
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
      if (event.target instanceof Node && accountMenuRef.current.contains(event.target)) return;
      setIsAccountMenuOpen(false);
    }

    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (activeView !== 'gameroom') {
      activePlayEntryAttemptRef.current = null;
      return;
    }
    if (!auth.user) return;
    if (!session.snapshot) {
      if (gameroomId && pendingGameroomPublicId === gameroomId) {
        return;
      }
      navigate('/sessions/discover', { replace: true });
      return;
    }

    const snapshotSession = session.snapshot.session;
    if (
      !snapshotSession.currentPlayId ||
      ![SessionActivityStatus.LOBBY_OPEN, SessionActivityStatus.PLAYING].includes(snapshotSession.activityStatus)
    ) {
      navigate(buildSessionPath(snapshotSession), { replace: true });
      return;
    }

    if (
      session.activePlay?.sessionId !== snapshotSession.id ||
      session.activePlay.playId !== snapshotSession.currentPlayId
    ) {
      const attemptKey = `${snapshotSession.id}:${snapshotSession.currentPlayId}`;
      if (activePlayEntryAttemptRef.current !== attemptKey) {
        activePlayEntryAttemptRef.current = attemptKey;
        void session.enterPlay(snapshotSession.id, snapshotSession.currentPlayId).then((entered) => {
          if (!entered) navigate(buildSessionPath(snapshotSession), { replace: true });
        });
      }
      return;
    }
    activePlayEntryAttemptRef.current = null;

    if (pendingGameroomPublicId && session.snapshot.session.publicId === pendingGameroomPublicId) {
      setPendingGameroomPublicId(null);
    }

    if (location.pathname === '/play') {
      navigate(buildGameroomPath(session.snapshot.session), { replace: true });
      return;
    }

    if (gameroomId && session.snapshot.session.publicId !== gameroomId) {
      navigate(buildGameroomPath(session.snapshot.session), { replace: true });
    }
  }, [
    activeView,
    auth.user,
    gameroomId,
    location.pathname,
    navigate,
    pendingGameroomPublicId,
    session.activePlay,
    session.snapshot,
  ]);

  const busy = auth.busy || session.busy;
  const error = auth.error ?? session.error;

  async function handleOAuthLogin(provider: 'kakao' | 'discord') {
    const redirectUri = `${window.location.origin}/oauth/callback`;

    try {
      saveStoredOAuthProvider(provider);
      saveStoredOAuthIntent('login');
      saveStoredAuthReturnTo(location.pathname);
      const { authUrl } = await getOAuthUrl(provider, redirectUri);
      window.location.href = authUrl;
    } catch {
      clearStoredOAuthProvider();
      clearStoredOAuthIntent();
      clearStoredAuthReturnTo();
    }
  }

  async function handleCreateSession(input: CreateSessionInput) {
    const nextSnapshot = await session.createSession(input);
    if (nextSnapshot) {
      if (
        nextSnapshot.session.activityStatus === SessionActivityStatus.LOBBY_OPEN &&
        nextSnapshot.session.currentPlayId &&
        await session.enterPlay(nextSnapshot.session.id, nextSnapshot.session.currentPlayId)
      ) {
        setPendingGameroomPublicId(nextSnapshot.session.publicId);
        navigate(buildGameroomPath(nextSnapshot.session));
      } else {
        navigate(buildSessionPath(nextSnapshot.session));
      }
    }
  }

  async function handleJoinSession(inviteCode: string) {
    const nextSnapshot = await session.joinSession(inviteCode);
    if (nextSnapshot) {
      if (
        nextSnapshot.session.currentPlayId &&
        [SessionActivityStatus.LOBBY_OPEN, SessionActivityStatus.PLAYING].includes(nextSnapshot.session.activityStatus) &&
        await session.enterPlay(nextSnapshot.session.id, nextSnapshot.session.currentPlayId)
      ) {
        setPendingGameroomPublicId(nextSnapshot.session.publicId);
        navigate(buildGameroomPath(nextSnapshot.session));
      } else {
        navigate(buildSessionPath(nextSnapshot.session));
      }
    }
    return nextSnapshot;
  }

  async function handleOAuthDeleteReauth(provider: 'kakao' | 'discord') {
    const redirectUri = `${window.location.origin}/oauth/callback`;
    try {
      saveStoredOAuthProvider(provider);
      saveStoredOAuthIntent('delete_reauth');
      saveStoredAuthReturnTo('/account');
      const { authUrl } = await getOAuthUrl(provider, redirectUri);
      window.location.href = authUrl;
    } catch {
      clearStoredOAuthProvider();
      clearStoredOAuthIntent();
      clearStoredAuthReturnTo();
    }
  }

  async function recordTutorialFirstAction() {
    if (
      recordingFirstActionRef.current ||
      !productProgress.progress?.tutorialStartedAt ||
      productProgress.progress.completedAt ||
      productProgress.progress.dismissedAt
    ) {
      return;
    }
    recordingFirstActionRef.current = true;
    try {
      if (!productProgress.progress.firstActionAt) {
        await productProgress.record('record_first_action');
      }
      await productProgress.record('complete_tutorial');
    } finally {
      recordingFirstActionRef.current = false;
    }
  }

  async function handleJoinSessionById(sessionId: string) {
    const knownMember = session.mySessionList.some((item) =>
      item.sessionId === sessionId || item.sessionPublicId === sessionId,
    ) || Boolean(
      session.snapshot &&
      (session.snapshot.session.id === sessionId || session.snapshot.session.publicId === sessionId),
    );
    if (!knownMember && auth.user) {
      try {
        const detail = await getSessionDetail(auth.user, sessionId, auth.accessToken);
        if (detail.session.joinPolicy === SessionJoinPolicy.APPROVAL_REQUIRED) {
          navigate(buildSessionPath(detail.session));
          return null;
        }
      } catch {
        // 상세 조회와 참가 API가 같은 세션 권한 규칙을 적용하므로 참가 요청에서 정확한 오류를 표시합니다.
      }
    }
    const nextSnapshot = await session.joinSessionById(sessionId);
    if (nextSnapshot) {
      if (
        nextSnapshot.session.currentPlayId &&
        [SessionActivityStatus.LOBBY_OPEN, SessionActivityStatus.PLAYING].includes(nextSnapshot.session.activityStatus) &&
        await session.enterPlay(nextSnapshot.session.id, nextSnapshot.session.currentPlayId)
      ) {
        setPendingGameroomPublicId(nextSnapshot.session.publicId);
        navigate(buildGameroomPath(nextSnapshot.session));
      } else {
        navigate(buildSessionPath(nextSnapshot.session));
      }
    }
    return nextSnapshot;
  }

  async function handleRequestSessionDetail(sessionId: string) {
    if (!auth.user) {
      throw new Error('로그인 정보가 없어서 세션 상세를 불러올 수 없습니다.');
    }

    return getSessionDetail(auth.user, sessionId, auth.accessToken);
  }

  async function exitSessionToDiscover() {
    const left = await session.leaveSession();
    if (left) {
      navigate('/sessions/discover');
    }
  }

  async function exitPlayToHome() {
    await session.exitPlayView();
    navigate('/');
  }

  async function handleLogout() {
    await session.exitPlayView();
    void auth.signOut();
    navigate('/');
  }

  async function handleDeleteAccount(credential: DeleteAccountCredential) {
    const deleted = await auth.deleteAccount(credential);
    if (deleted) {
      session.clearSnapshot();
      navigate('/');
    }
    return deleted;
  }

  function handleSessionMessage(input: string) {
    const [scopePart, ...restParts] = input.split(':');
    const scoped = scopePart === 'CHAT' || scopePart === 'MAIN';
    const scope = scoped ? scopePart : 'MAIN';
    const message = (scoped ? restParts.join(':') : input).trim();

    if (!message) return;

    if (scope === 'CHAT') {
      void session.sendChatMessage(message);
      return;
    }

    void session.sendChatMessage(message, 'MAIN');
  }

  if (!auth.user) {
    return (
      <LoginPage
        busy={busy}
        error={error}
        notice={auth.notice}
        onGuestLogin={(name) => void auth.loginAsGuest(name)}
        onEmailLogin={(email, pw) => void auth.loginWithEmail(email, pw)}
        onRegister={(email, pw, name) => void auth.registerMember(email, pw, name)}
        onOAuthLogin={(provider) => void handleOAuthLogin(provider)}
        onClearFeedback={auth.clearFeedback}
      />
    );
  }

  const currentUser = auth.user;
  const isPlayView = activeView === 'gameroom';
  const isAccountSurfaceActive = activeView === 'profile' || activeView === 'account';

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
                      <span>{auth.authMode === 'guest' ? '게스트 세션' : '일반 계정'}</span>
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
                      <span>{'내 프로필'}</span>
                    </button>
                    <button
                      type="button"
                      className="account-menu-item"
                      onClick={() => guardedNavigate('/account')}
                      role="menuitem"
                    >
                      <Icon name="shield" />
                      <span>{'계정 관리'}</span>
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
                    <span>{'로그아웃'}</span>
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
            sessionListTotal={session.sessionListTotal}
            mySessionListTotal={session.mySessionListTotal}
            mySessionList={session.mySessionList}
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
            onContinueSession={(sessionId) => void handleJoinSessionById(sessionId)}
          />
        ) : null}

        {!isPlayView && activeView === 'characters' ? (
          <CharacterPage
            user={currentUser}
            busy={busy}
            characters={session.myCharacters}
            scenarios={scenarios}
            races={races}
            classDefinitions={classDefinitions}
            snapshot={session.snapshot}
            error={error}
            onCreateCharacter={(payload) => session.createCharacter(payload)}
            onCloneCharacter={(characterId) => session.cloneCharacter(characterId)}
            onUpdateCharacter={(characterId, payload) => session.updateCharacter(characterId, payload)}
            onLevelUpCharacter={(characterId, payload) =>
              session.levelUpCharacter(characterId, payload)
            }
            onUpdatePreparedSpells={(characterId, payload) =>
              session.updatePreparedSpells(characterId, payload)
            }
            onDeleteCharacter={(characterId) => session.deleteCharacter(characterId)}
            autoOpenCreate={characterPageState?.characterCreateReturn?.autoOpenCreate === true}
            sessionReturnTitle={characterPageState?.characterCreateReturn?.sessionTitle ?? null}
            onReturnToSession={
              characterPageState?.characterCreateReturn?.path
                ? () => {
                    const returnPath = characterPageState.characterCreateReturn?.path;
                    if (returnPath) {
                      guardedNavigate(returnPath);
                    }
                  }
                : undefined
            }
          />
        ) : null}

        {!isPlayView && activeView === 'rulebook' ? <RulebookPage /> : null}

        {!isPlayView && activeView === 'profile' ? (
          <ProfilePage
            user={currentUser}
            accessToken={auth.accessToken}
            authMode={auth.authMode}
            busy={busy}
            error={error}
            onLogout={handleLogout}
            onOpenAccount={() => guardedNavigate('/account')}
            onUpdateNickname={auth.updateDisplayName}
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
            onConvertGuestAccount={auth.convertGuestAccount}
            onDeleteAccount={handleDeleteAccount}
            onBeginOAuthDeleteReauth={(provider) => void handleOAuthDeleteReauth(provider)}
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
            onOpenPublish={(scenarioId) => guardedNavigate(`/scenarios/${scenarioId}/edit?publish=1`)}
          />
        ) : null}

        {!isPlayView && activeView === 'scenariosNew' ? (
          <ScenarioEditorPage
            user={currentUser}
            accessToken={auth.accessToken}
            onUnsavedChangesChange={setHasUnsavedScenarioChanges}
            onDone={() => {
              void reloadScenarios();
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
            autoStartPublish={scenarioEditAutoStartPublish}
            onUnsavedChangesChange={setHasUnsavedScenarioChanges}
            onDone={() => {
              void reloadScenarios();
              setHasUnsavedScenarioChanges(false);
              navigate('/scenarios');
            }}
            onCancel={() => guardedNavigate('/scenarios')}
          />
        ) : null}

        {!isPlayView && activeView === 'sessionsDiscover' ? (
          <SessionDiscoverPage
            user={currentUser}
            accessToken={auth.accessToken}
            snapshot={session.snapshot}
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
            scenarios={scenarios}
            knownMember={session.mySessionList.some((item) => item.sessionPublicId === sessionDetailId || item.sessionId === sessionDetailId)}
            busy={busy}
            onJoinSessionById={handleJoinSessionById}
            onOpenHostProfile={(host) =>
              guardedNavigate(buildPublicProfilePath(host), {
                state: { profilePreview: host },
              })
            }
          />
        ) : null}

        {!isPlayView && activeView === 'sessionInvite' && inviteCode ? (
          <SessionInvitePreviewPage
            inviteCode={inviteCode}
            busy={busy}
            joinError={error}
            onJoin={handleJoinSession}
            onCancel={() => guardedNavigate('/sessions/discover')}
          />
        ) : null}

        {!isPlayView && activeView === 'sessionsNew' ? (
          <SessionCreatePage
            scenarios={scenarios}
            initialScenarioId={sessionCreateState?.initialScenarioId ?? null}
            busy={busy}
            error={error}
            onCreateSession={handleCreateSession}
          />
        ) : null}

        {isPlayView ? (
          <PlayPage
            user={currentUser}
            accessToken={auth.accessToken}
            snapshot={session.snapshot}
            onApplySnapshot={session.applySnapshot}
            scenarios={scenarios}
            characters={session.myCharacters}
            races={races}
            classDefinitions={classDefinitions}
            logs={logs}
            socketConnected={session.socketConnected}
            hasOlderTurnLogs={session.hasOlderTurnLogs}
            isLoadingTurnLogs={session.isLoadingTurnLogs}
            busy={busy}
            error={error}
            onCreateCharacter={(payload) => session.createCharacter(payload)}
            onSelectCharacter={(characterId) => void session.selectCharacter(characterId)}
            onSetReady={(isReady) => void session.setReadyState(isReady)}
            onStartSession={() => void session.startSession()}
            onFinishCurrentPlay={() => {
              void session.finishCurrentPlay().then((next) => {
                if (next) navigate(buildSessionPath(next.session));
              });
            }}
            onUpdateSession={session.updateSession}
            onLeaveSession={() => {
              void exitSessionToDiscover();
            }}
            onBackToLobby={exitPlayToHome}
            removedParticipants={session.removedParticipants}
            onRemoveParticipant={session.removeParticipant}
            onRestoreParticipant={session.restoreParticipant}
            onNavigateToCharacters={() => {
              if (!session.snapshot) {
                navigate('/characters');
                return;
              }

              navigate('/characters', {
                state: {
                  characterCreateReturn: {
                    path: buildGameroomPath(session.snapshot.session),
                    sessionTitle: session.snapshot.session.title,
                    autoOpenCreate: true,
                  },
                } satisfies CharacterPageState,
              });
            }}
            onMainCommand={async (payload) => {
              const result = await session.sendMainCommand(payload);
              if (result) await recordTutorialFirstAction();
              return result;
            }}
            onResolveMainCommandCheck={(payload) => session.resolveMainCommandCheck(payload)}
            onRequestRest={(restType, characterId, hitDiceToSpend) =>
              void session.requestRest(restType, characterId, hitDiceToSpend)
            }
            onApproveRestRequest={(actionId) => session.approveRestRequest(actionId)}
            onRejectRestRequest={(actionId) => session.rejectRestRequest(actionId)}
            onCancelRestRequest={(actionId) => session.cancelRestRequest(actionId)}
            onSendAction={async (rawText) => {
              await session.sendAction(rawText);
              await recordTutorialFirstAction();
            }}
            onAction={handleSessionMessage}
            onLoadOlderTurnLogs={() => void session.loadOlderTurnLogs()}
            onCombatActionLog={(message, turnLogId) =>
              appendLog(
                'action',
                '세션 로그',
                `[MAIN]${message}`,
                turnLogId ? `turn-log:${turnLogId}` : undefined,
              )
            }
            activeDiceRoll={session.activeDiceRoll}
            onDismissDiceRoll={session.dismissDiceRoll}
          />
        ) : null}
      </div>
      <ProductTutorialGuide
        activeView={activeView}
        authMode={auth.authMode}
        progress={productProgress.progress}
        loading={productProgress.loading}
        busy={busy}
        onStart={() => {
          void productProgress.record('start_tutorial')
            .then(() => guardedNavigate('/characters'))
            .catch(() => undefined);
        }}
        onDismiss={() => {
          void productProgress.record('dismiss_tutorial').catch(() => undefined);
        }}
        onOpenCharacters={() => guardedNavigate('/characters')}
        onOpenSessionCreate={() => guardedNavigate('/sessions/new')}
        onDismissCoachmark={(coachmark) => {
          void productProgress.record('dismiss_coachmark', coachmark).catch(() => undefined);
        }}
      />
      <ConfirmDialog
        open={Boolean(session.confirmation)}
        title={session.confirmation?.title ?? '확인'}
        confirmLabel={session.confirmation?.confirmLabel ?? '확인'}
        danger={session.confirmation?.danger}
        onClose={() => session.resolveConfirmation(false)}
        onConfirm={() => session.resolveConfirmation(true)}
      >
        <p style={{ whiteSpace: 'pre-line' }}>{session.confirmation?.message}</p>
      </ConfirmDialog>
    </div>
  );
}
