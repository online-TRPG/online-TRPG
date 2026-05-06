import type {
  AuthTokenResponseDto,
  CharacterResponseDto,
  CreateScenarioDto,
  GmMode,
  LoginResponseDto,
  OAuthUrlResponseDto,
  PlayerScenarioViewDto,
  ScenarioResponseDto,
  SessionDetailResponseDto,
  SessionSnapshotDto,
  UpdateScenarioDto,
  UpdateVttMapDto,
  UploadScenarioNodeImageDto,
  UserResponseDto,
  VttMapStateDto,
  SessionListItemResponseDto,
  SessionParticipantResponseDto,
} from '@trpg/shared-types';
import type {
  ApiErrorBody,
  AvailableSessionListItem,
  Character,
  PlayerScenarioView,
  Scenario,
  ScenarioDetail,
  SessionDetail,
  SessionSnapshot,
  StoredUser,
  User,
} from '../types/session';
import { normalizeSessionDetail, normalizeSessionSnapshot } from '../types/session';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const configuredWsBaseUrl = import.meta.env.VITE_WS_BASE_URL as string | undefined;
const defaultBase = import.meta.env.PROD ? '' : 'http://localhost:8080';
const localDevBaseUrls = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const isLocalFrontend =
  import.meta.env.DEV &&
  typeof globalThis.location !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1'].includes(globalThis.location.hostname);
const preferredBaseUrl = configuredBaseUrl?.replace(/\/$/, '');
const rawBaseUrl = (preferredBaseUrl || (isLocalFrontend ? localDevBaseUrls[0] : defaultBase)).replace(/\/$/, '');
export const API_BASE_URL = rawBaseUrl.endsWith('/api/v1') ? rawBaseUrl : `${rawBaseUrl}/api/v1`;
const fallbackApiBaseUrls =
  import.meta.env.PROD
    ? [API_BASE_URL]
    : Array.from(
        new Set(
          [
            API_BASE_URL,
            ...(preferredBaseUrl
              ? []
              : localDevBaseUrls.map((url) => `${url}/api/v1`)),
          ]
            .filter((url): url is string => Boolean(url))
            .map((url) => url.replace(/\/$/, '')),
        ),
      );
export const SOCKET_BASE_URL = (
  configuredWsBaseUrl || API_BASE_URL.replace(/\/api\/v1$/, '')
).replace(/\/$/, '');
export const AUTH_EXPIRED_EVENT = 'trpg:auth-expired';

const DEFAULT_SCENARIO_ID = 'scenario_goblin_cave';
const DEFAULT_RULE_SET_ID = 'dnd5e';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface CharacterMutationPayload {
  name: string;
  ancestry: string;
  className: string;
  avatarType?: 'DEFAULT' | 'PRESET' | 'UPLOAD';
  avatarPresetId?: string | null;
  avatarUrl?: string | null;
  level?: number;
  abilities?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  proficiencyBonus?: number;
  proficientSkills?: string[];
  maxHp?: number;
  armorClass?: number;
  speed?: number;
  inventory?: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
}

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  user?: StoredUser | null;
  accessToken?: string | null;
  withCredentials?: boolean;
}

export interface PaginatedList<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

function normalizeSessionListItem(item: SessionListItemResponseDto): AvailableSessionListItem {
  return {
    sessionId: item.session.id,
    sessionPublicId: item.session.publicId,
    title: item.session.title,
    scenarioTitle: item.scenario.title,
    ruleSetName: item.session.ruleSetId ?? 'TRPG',
    currentPlayers: item.participantCount,
    maxPlayers: item.session.maxPlayers,
    status: item.session.status,
    gmMode: item.session.gmMode,
    role: item.role,
  };
}

function formatApiError(body: ApiErrorBody | null, fallback: string): string {
  if (!body?.message) return fallback;
  return Array.isArray(body.message) ? body.message.join(', ') : body.message;
}

async function readApiErrorBody(response: Response): Promise<ApiErrorBody | null> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as ApiErrorBody;
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text ? { message: text } as ApiErrorBody : null;
  } catch {
    return null;
  }
}

async function peekApiErrorBody(response: Response): Promise<ApiErrorBody | null> {
  return readApiErrorBody(response.clone());
}

function isMissingRouteResponse(response: Response, body: ApiErrorBody | null): boolean {
  const message = formatApiError(body, '');
  return response.status === 404 && /Cannot\s+(GET|POST|PATCH|DELETE)\s+/i.test(message);
}

function unwrapApiResponse<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

function notifyAuthExpired(message: string): void {
  if (typeof window === 'undefined') return;

  // API 서비스에서 401을 감지해 훅에 알려주면, 화면마다 같은 로그아웃 처리를 반복하지 않아도 된다.
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { message } }));
}

function toGmMode(value: 'ai' | 'human' | undefined): GmMode {
  return (value === 'human' ? 'HUMAN' : 'AI') as GmMode;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  } else if (options.user) {
    headers['x-user-id'] = options.user.id;
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: options.withCredentials ? 'include' : 'same-origin',
  };

  let response: Response | null = null;
  let lastNetworkError: unknown = null;
  let lastNotFoundBody: ApiErrorBody | null = null;

  for (const baseUrl of fallbackApiBaseUrls) {
    try {
      response = await fetch(`${baseUrl}${path}`, init);
    } catch (error) {
      lastNetworkError = error;
      continue;
    }

    if (response.status !== 404 || fallbackApiBaseUrls.length === 1) {
      break;
    }

    lastNotFoundBody = await peekApiErrorBody(response);

    if (!isMissingRouteResponse(response, lastNotFoundBody)) {
      break;
    }
  }

  if (!response) {
    throw new Error(lastNetworkError instanceof Error ? lastNetworkError.message : 'API 서버에 연결하지 못했습니다.');
  }

  if (!response.ok) {
    const body = (await readApiErrorBody(response)) ?? lastNotFoundBody;
    const message = formatApiError(body, `요청에 실패했습니다. (${response.status})`);
    if (response.status === 401 && options.accessToken) {
      notifyAuthExpired(message);
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json()) as unknown;
  return unwrapApiResponse<T>(body);
}

export function createGuest(displayName: string): Promise<User> {
  return requestJson<User>('/users/guest', {
    method: 'POST',
    body: { displayName },
  });
}

export function register(email: string, password: string, name: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>('/users/register', {
    method: 'POST',
    body: { email, password, name },
  });
}

export function login(email: string, password: string): Promise<LoginResponseDto> {
  return requestJson<LoginResponseDto>('/users/login', {
    method: 'POST',
    body: { email, password },
    withCredentials: true,
  });
}

export function logout(accessToken: string): Promise<void> {
  return requestJson<void>('/users/logout', {
    method: 'POST',
    accessToken,
    withCredentials: true,
  });
}

export function reissue(): Promise<AuthTokenResponseDto> {
  return requestJson<AuthTokenResponseDto>('/users/reissue', {
    method: 'POST',
    withCredentials: true,
  });
}

export function getMe(accessToken: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>('/users/me', { accessToken });
}

export function getPublicProfile(publicId: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>(`/users/public/${publicId}`);
}

export function deleteMe(accessToken: string, password: string): Promise<void> {
  return requestJson<void>('/users/me', {
    method: 'DELETE',
    accessToken,
    body: { password },
  });
}

export function getOAuthUrl(
  provider: 'kakao' | 'discord',
  redirectUri: string
): Promise<OAuthUrlResponseDto> {
  const params = new URLSearchParams({ redirectUri });
  return requestJson<OAuthUrlResponseDto>(`/users/oauth/${provider}/url?${params.toString()}`);
}

export function oauthLogin(
  provider: 'kakao' | 'discord',
  code: string,
  redirectUri: string
): Promise<LoginResponseDto> {
  return requestJson<LoginResponseDto>(`/users/oauth/${provider}/login`, {
    method: 'POST',
    body: { code, redirectUri },
    withCredentials: true,
  });
}

export function listScenarios(): Promise<Scenario[]> {
  return requestJson<Scenario[]>('/scenarios');
}

export function getScenario(scenarioId: string): Promise<ScenarioDetail> {
  return requestJson<ScenarioResponseDto>(`/scenarios/${scenarioId}`);
}

export function getPlayerScenario(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<PlayerScenarioView> {
  return requestJson<PlayerScenarioViewDto>(`/sessions/${sessionId}/player-scenario`, {
    user,
    accessToken,
  });
}

export function listMyScenarios(
  user: StoredUser,
  accessToken?: string | null,
  search?: string
): Promise<Scenario[]> {
  const params = new URLSearchParams();
  const trimmedSearch = search?.trim();

  if (trimmedSearch) {
    params.set('search', trimmedSearch);
  }

  const query = params.toString();
  return requestJson<Scenario[]>(`/scenarios/mine${query ? `?${query}` : ''}`, {
    user,
    accessToken,
  });
}

export function createScenario(
  user: StoredUser,
  payload: CreateScenarioDto,
  accessToken?: string | null
): Promise<ScenarioDetail> {
  return requestJson<ScenarioResponseDto>('/scenarios', {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function updateScenario(
  user: StoredUser,
  scenarioId: string,
  payload: UpdateScenarioDto,
  accessToken?: string | null
): Promise<ScenarioDetail> {
  return requestJson<ScenarioResponseDto>(`/scenarios/${scenarioId}`, {
    method: 'PATCH',
    user,
    accessToken,
    body: payload,
  });
}

export function deleteScenario(
  user: StoredUser,
  scenarioId: string,
  accessToken?: string | null
): Promise<void> {
  return requestJson<void>(`/scenarios/${scenarioId}`, {
    method: 'DELETE',
    user,
    accessToken,
  });
}

export function uploadScenarioNodeImage(
  user: StoredUser,
  scenarioId: string,
  nodeId: string,
  payload: UploadScenarioNodeImageDto,
  accessToken?: string | null
): Promise<{ imageUrl: string }> {
  return requestJson<{ imageUrl: string }>(`/scenarios/${scenarioId}/nodes/${nodeId}/image`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function listSessions(
  user?: StoredUser | null,
  accessToken?: string | null
): Promise<PaginatedList<AvailableSessionListItem>> {
  return requestJson<PaginatedList<SessionListItemResponseDto>>('/sessions', {
    user,
    accessToken,
  }).then((result) => ({
    ...result,
    content: result.content.map(normalizeSessionListItem),
  }));
}

export function listMySessions(
  user: StoredUser,
  accessToken?: string | null
): Promise<PaginatedList<AvailableSessionListItem>> {
  return requestJson<PaginatedList<SessionListItemResponseDto>>('/users/me/sessions', {
    user,
    accessToken,
  }).then((result) => ({
    ...result,
    content: result.content.map(normalizeSessionListItem),
  }));
}

export async function createSession(
  user: StoredUser,
  title: string,
  options?: {
    scenarioId?: string;
    maxParticipants?: number;
    useAiGm?: boolean;
  },
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const created = await requestJson<
    SessionSnapshotDto | { sessionId: string; snapshot?: SessionSnapshotDto }
  >('/sessions', {
    method: 'POST',
    user,
    accessToken,
    body: {
      title,
      scenarioId: options?.scenarioId || DEFAULT_SCENARIO_ID,
      ruleSetId: DEFAULT_RULE_SET_ID,
      maxParticipants: options?.maxParticipants ?? 4,
      gmMode: toGmMode(options?.useAiGm === false ? 'human' : 'ai'),
      visibility: 'PUBLIC',
    },
  });

  if ('session' in created) {
    return normalizeSessionSnapshot(created);
  }

  if ('snapshot' in created && created.snapshot) {
    return normalizeSessionSnapshot(created.snapshot);
  }

  return getSession(user, created.sessionId, accessToken);
}

export async function joinSession(
  user: StoredUser,
  inviteCode: string,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const joined = await requestJson<
    SessionSnapshotDto | { sessionId: string; snapshot?: SessionSnapshotDto }
  >('/sessions/join-by-invite', {
    method: 'POST',
    user,
    accessToken,
    body: { inviteCode },
  });

  if ('session' in joined) {
    return normalizeSessionSnapshot(joined);
  }

  if ('snapshot' in joined && joined.snapshot) {
    return normalizeSessionSnapshot(joined.snapshot);
  }

  return getSession(user, joined.sessionId, accessToken);
}

export async function joinSessionById(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const joined = await requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/join`, {
    method: 'POST',
    user,
    accessToken,
  });

  return normalizeSessionSnapshot(joined);
}

export function getSession(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  return requestJson<SessionSnapshotDto>(`/sessions/${sessionId}`, {
    user,
    accessToken,
  }).then(normalizeSessionSnapshot);
}

export function getSessionDetail(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<SessionDetail> {
  return requestJson<SessionDetailResponseDto>(`/sessions/${sessionId}`, {
    user,
    accessToken,
  }).then(normalizeSessionDetail);
}

export function getSessionState(user: StoredUser, sessionId: string) {
  return requestJson(`/sessions/${sessionId}/state`, { user });
}

export function getVttMap(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<VttMapStateDto> {
  return requestJson<VttMapStateDto>(`/sessions/${sessionId}/map`, {
    user,
    accessToken,
  });
}

export function updateVttMap(
  user: StoredUser,
  sessionId: string,
  map: VttMapStateDto,
  accessToken?: string | null
): Promise<VttMapStateDto> {
  const payload: UpdateVttMapDto = { map };
  return requestJson<VttMapStateDto>(`/sessions/${sessionId}/map`, {
    method: 'PATCH',
    user,
    accessToken,
    body: payload,
  });
}

export function createCharacter(
  user: StoredUser,
  payload: CharacterMutationPayload & {
    sessionId?: string;
    assignToSession?: boolean;
  },
  accessToken?: string | null
): Promise<SessionSnapshot | null> {
  return requestJson<CharacterResponseDto | Character>('/characters', {
    method: 'POST',
    user,
    accessToken,
    body: {
      name: payload.name,
      ancestry: payload.ancestry,
      className: payload.className,
      avatarType: payload.avatarType,
      avatarPresetId: payload.avatarPresetId,
      avatarUrl: payload.avatarUrl,
      level: payload.level,
      abilities: payload.abilities,
      proficiencyBonus: payload.proficiencyBonus,
      proficientSkills: payload.proficientSkills,
      maxHp: payload.maxHp,
      armorClass: payload.armorClass,
      speed: payload.speed,
      inventory: payload.inventory,
    },
  }).then((character) => {
    if (!payload.sessionId || payload.assignToSession !== true) {
      return null;
    }

    return requestJson(`/sessions/${payload.sessionId}/character-selection`, {
      method: 'POST',
      user,
      accessToken,
      body: { characterId: character.id },
    }).then(() => getSession(user, payload.sessionId!, accessToken));
  });
}

export function listMyCharacters(
  user: StoredUser,
  accessToken?: string | null
): Promise<CharacterResponseDto[]> {
  return requestJson<CharacterResponseDto[]>('/users/me/characters', {
    user,
    accessToken,
  });
}

export function cloneCharacter(
  user: StoredUser,
  characterId: string,
  accessToken?: string | null
): Promise<CharacterResponseDto> {
  return requestJson<CharacterResponseDto>(`/characters/${characterId}/clone`, {
    method: 'POST',
    user,
    accessToken,
  });
}

export function updateCharacter(
  user: StoredUser,
  characterId: string,
  payload: CharacterMutationPayload,
  accessToken?: string | null
): Promise<CharacterResponseDto> {
  return requestJson<CharacterResponseDto>(`/characters/${characterId}`, {
    method: 'PATCH',
    user,
    accessToken,
    body: {
      name: payload.name,
      ancestry: payload.ancestry,
      className: payload.className,
      avatarType: payload.avatarType,
      avatarPresetId: payload.avatarPresetId,
      avatarUrl: payload.avatarUrl,
      level: payload.level,
      abilities: payload.abilities,
      proficiencyBonus: payload.proficiencyBonus,
      proficientSkills: payload.proficientSkills,
      maxHp: payload.maxHp,
      armorClass: payload.armorClass,
      speed: payload.speed,
      inventory: payload.inventory,
    },
  });
}

export function deleteCharacter(
  user: StoredUser,
  characterId: string,
  accessToken?: string | null
): Promise<void> {
  return requestJson<void>(`/characters/${characterId}`, {
    method: 'DELETE',
    user,
    accessToken,
  });
}

export async function selectSessionCharacter(
  user: StoredUser,
  sessionId: string,
  characterId: string | null,
  accessToken?: string | null
): Promise<SessionParticipantResponseDto> {
  return requestJson<SessionParticipantResponseDto>(`/sessions/${sessionId}/character-selection`, {
    method: 'POST',
    user,
    accessToken,
    body: { characterId },
  });
}

export async function updateReadyState(
  user: StoredUser,
  sessionId: string,
  isReady: boolean,
  accessToken?: string | null
): Promise<SessionParticipantResponseDto> {
  return requestJson<SessionParticipantResponseDto>(
    `/sessions/${sessionId}/participants/me/ready`,
    {
      method: 'PATCH',
      user,
      accessToken,
      body: { isReady },
    }
  );
}

export async function startSession(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const started = await requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/start`, {
    method: 'POST',
    user,
    accessToken,
  });

  return normalizeSessionSnapshot(started);
}

export function leaveSession(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<void> {
  return requestJson<void>(`/sessions/${sessionId}/leave`, {
    method: 'DELETE',
    user,
    accessToken,
  });
}
