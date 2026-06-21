import type {
  ActionAcceptedResponseDto,
  ApplyHumanGmCombatConditionDto,
  AdjustHumanGmCombatHpDto,
  AcceptHumanGmAiAssistSuggestionDto,
  AiHumanGmAssistSuggestionRequestDto,
  ApplyCombatDamageDto,
  AutoMonsterTurnDto,
  AuthTokenResponseDto,
  CombatActorActionDto,
  CombatBasicActionDto,
  CharacterResponseDto,
  CombatActionResultDto,
  CombatMoveResultDto,
  CastCombatSpellDto,
  CombatReactionResponseDto,
  CombatResponseDto,
  CreateHumanGmAiAssistSuggestionDto,
  CreateScenarioDto,
  CreateVttMapPingDto,
  EquippedWeaponAttackDto,
  EndTurnDto,
  ForceMoveCombatParticipantDto,
  GrantHumanGmInventoryItemDto,
  GmMode,
  HumanGmMessageDto,
  HumanGmAiAssistSuggestionDto,
  HumanGmNodeMoveOptionDto,
  HumanGmPrivateNoteDto,
  LoginResponseDto,
  MainCommandResponseDto,
  MoveCombatParticipantDto,
  MoveSessionTokenDto,
  OAuthUrlResponseDto,
  ResolveCombatAttackDto,
  ResolveMainCommandCheckDto,
  RemoveHumanGmInventoryItemDto,
  ReportHumanGmAiAssistApplicationFailureDto,
  RestActionDto,
  SetHumanGmDifficultyClassDto,
  ScenarioAssetKind,
  ScenarioAssetResponseDto,
  ClassDefinitionResponseDto,
  ItemResponseDto,
  PlayerScenarioViewDto,
  RaceResponseDto,
  ScenarioResponseDto,
  SessionDetailResponseDto,
  SessionSnapshotDto,
  SubmitMainCommandDto,
  SubmitActionDto,
  StartCombatDto,
  TurnAdvanceResponseDto,
  TurnLogListResponseDto,
  UpdateCharacterEquipmentDto,
  UpdatePreparedSpellsDto,
  LevelUpCharacterDto,
  UpdateSessionNodeDto,
  UpdateScenarioDto,
  UpdateVttMapDto,
  UseInventoryItemDto,
  UseInventoryItemResponseDto,
  UploadScenarioAssetDto,
  UploadScenarioNodeImageDto,
  UserResponseDto,
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
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
import { saveStoredToken } from './storage';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const configuredWsBaseUrl = import.meta.env.VITE_WS_BASE_URL as string | undefined;
const localDevBaseUrls = ['http://localhost:8080', 'http://127.0.0.1:8080'];
const isLocalFrontend =
  import.meta.env.DEV &&
  typeof globalThis.location !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1'].includes(globalThis.location.hostname);
const defaultBase = import.meta.env.PROD || !isLocalFrontend ? '' : localDevBaseUrls[0];
const preferredBaseUrl = configuredBaseUrl?.replace(/\/$/, '');
const rawBaseUrl = (
  preferredBaseUrl || (isLocalFrontend ? localDevBaseUrls[0] : defaultBase)
).replace(/\/$/, '');
export const API_BASE_URL = rawBaseUrl.endsWith('/api/v1') ? rawBaseUrl : `${rawBaseUrl}/api/v1`;
const fallbackApiBaseUrls = import.meta.env.PROD
  ? [API_BASE_URL]
  : Array.from(
      new Set(
        [
          API_BASE_URL,
          ...(isLocalFrontend && !preferredBaseUrl ? localDevBaseUrls.map((url) => `${url}/api/v1`) : []),
        ]
          .filter((url): url is string => Boolean(url))
          .map((url) => url.replace(/\/$/, ''))
      )
    );
export const SOCKET_BASE_URL = (
  configuredWsBaseUrl || API_BASE_URL.replace(/\/api\/v1$/, '')
).replace(/\/$/, '');

if (import.meta.env.DEV && typeof console !== 'undefined') {
  console.info('[API_BASE_URL]', {
    apiBaseUrl: API_BASE_URL,
    socketBaseUrl: SOCKET_BASE_URL,
    configuredBaseUrl: configuredBaseUrl ?? null,
  });
}
export const AUTH_EXPIRED_EVENT = 'trpg:auth-expired';
export const AUTH_TOKEN_REISSUED_EVENT = 'trpg:auth-token-reissued';

export const DEFAULT_SCENARIO_ID = 'scenario_77758fa0-3b35-4f95-bb2d-0ffe11c989ac';
const DEFAULT_RULE_SET_ID = 'dnd5e';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface CharacterMutationPayload {
  name: string;
  ancestry: string;
  className: string;
  subclassName?: string | null;
  avatarType?: 'DEFAULT' | 'PRESET' | 'UPLOAD';
  avatarPresetId?: string | null;
  avatarUrl?: string | null;
  scenarioId?: string | null;
  startingEquipmentSelection?: number[];
  startingEquipmentItemSelections?: Record<string, string>;
  startingSpells?: { cantrips: string[]; spells: string[]; preparedSpells?: string[] };
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
  features?: string[];
  maxHp?: number;
  armorClass?: number;
  speed?: number;
  inventory?: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
  equippedWeaponId?: string | null;
  offhandWeaponId?: string | null;
}

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  user?: StoredUser | null;
  accessToken?: string | null;
  withCredentials?: boolean;
  skipAuthRefresh?: boolean;
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
    scenarioId: item.scenario.id,
    scenarioTitle: item.scenario.title,
    scenarioThumbnailUrl: item.scenario.thumbnailUrl,
    ruleSetName: item.session.ruleSetId ?? 'TRPG',
    currentPlayers: item.participantCount,
    maxPlayers: item.session.maxPlayers,
    status: item.session.status,
    gmMode: item.session.gmMode,
    role: item.role,
  };
}

function formatApiError(body: ApiErrorBody | null, fallback: string): string {
  const fieldErrorReasons = readFieldErrorReasons(body?.data);
  if (fieldErrorReasons.length > 0) return fieldErrorReasons.join('\n');
  if (!body?.message) return fallback;
  return Array.isArray(body.message) ? body.message.join(', ') : body.message;
}

function readFieldErrorReasons(data: unknown): string[] {
  if (!data || typeof data !== 'object' || !('fieldErrors' in data)) return [];

  const fieldErrors = (data as { fieldErrors?: unknown }).fieldErrors;
  if (!Array.isArray(fieldErrors)) return [];

  return fieldErrors
    .map((item) => {
      if (!item || typeof item !== 'object' || !('reason' in item)) return null;
      const reason = (item as { reason?: unknown }).reason;
      return typeof reason === 'string' ? reason : null;
    })
    .filter((reason): reason is string => Boolean(reason));
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
    return text ? ({ message: text } as ApiErrorBody) : null;
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

function notifyAuthTokenReissued(accessToken: string): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(AUTH_TOKEN_REISSUED_EVENT, { detail: { accessToken } }));
}

function toGmMode(value: 'ai' | 'human' | undefined): GmMode {
  return (value === 'human' ? 'HUMAN' : 'AI') as GmMode;
}

let pendingReissue: Promise<AuthTokenResponseDto> | null = null;

async function requestAccessTokenReissue(): Promise<AuthTokenResponseDto> {
  if (!pendingReissue) {
    pendingReissue = fetchAccessTokenReissue().finally(() => {
      pendingReissue = null;
    });
  }

  return pendingReissue;
}

async function fetchAccessTokenReissue(): Promise<AuthTokenResponseDto> {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };
  let response: Response | null = null;
  let lastNetworkError: unknown = null;
  let lastNotFoundBody: ApiErrorBody | null = null;

  for (const baseUrl of fallbackApiBaseUrls) {
    try {
      response = await fetch(`${baseUrl}/users/reissue`, init);
    } catch (error) {
      lastNetworkError = error;
      break;
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
    throw new Error(
      lastNetworkError instanceof Error
        ? lastNetworkError.message
        : 'API 서버에 연결하지 못했습니다.'
    );
  }

  if (!response.ok) {
    const body = (await readApiErrorBody(response)) ?? lastNotFoundBody;
    throw new Error(formatApiError(body, '로그인 시간이 만료되었습니다. 다시 로그인해주세요.'));
  }

  const body = (await response.json()) as unknown;
  return unwrapApiResponse<AuthTokenResponseDto>(body);
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
      break;
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
    throw new Error(
      lastNetworkError instanceof Error
        ? lastNetworkError.message
        : 'API 서버에 연결하지 못했습니다.'
    );
  }

  if (!response.ok) {
    const body = (await readApiErrorBody(response)) ?? lastNotFoundBody;
    const message = formatApiError(body, `요청에 실패했습니다. (${response.status})`);
    if (response.status === 401 && options.accessToken && !options.skipAuthRefresh) {
      try {
        const nextToken = await requestAccessTokenReissue();
        saveStoredToken(nextToken.accessToken);
        notifyAuthTokenReissued(nextToken.accessToken);
        return requestJson<T>(path, {
          ...options,
          accessToken: nextToken.accessToken,
          skipAuthRefresh: true,
        });
      } catch {
        notifyAuthExpired('로그인 시간이 만료되었습니다. 다시 로그인해주세요.');
      }
    } else if (response.status === 401 && options.accessToken) {
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

export function updateMe(accessToken: string, displayName: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>('/users/me', {
    method: 'PATCH',
    accessToken,
    body: { displayName },
  });
}

export function getPublicProfile(publicId: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>(`/users/public/${publicId}`);
}

export function deleteMe(accessToken: string, password: string): Promise<void> {
  return requestJson<void>('/users/me', {
    method: 'DELETE',
    accessToken,
    withCredentials: true,
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

function isProvidedScenarioForSelection(scenario: Scenario): boolean {
  return scenario.sourceType === 'SYSTEM' || scenario.id === DEFAULT_SCENARIO_ID;
}

export async function listAvailableScenarios(
  user: StoredUser,
  accessToken?: string | null
): Promise<Scenario[]> {
  const [allScenarios, myScenarios] = await Promise.all([
    listScenarios(),
    listMyScenarios(user, accessToken),
  ]);
  const providedScenarios = allScenarios.filter(isProvidedScenarioForSelection);
  const seenScenarioIds = new Set<string>();

  return [...providedScenarios, ...myScenarios].filter((scenario) => {
    if (seenScenarioIds.has(scenario.id)) return false;
    seenScenarioIds.add(scenario.id);
    return true;
  });
}

export function listRaces(): Promise<RaceResponseDto[]> {
  return requestJson<RaceResponseDto[]>('/races');
}

export function listClassDefinitions(): Promise<ClassDefinitionResponseDto[]> {
  return requestJson<ClassDefinitionResponseDto[]>('/classes');
}

export function listItems(): Promise<ItemResponseDto[]> {
  return requestJson<ItemResponseDto[]>('/items');
}

export function getScenario(
  scenarioId: string,
  user?: StoredUser | null,
  accessToken?: string | null
): Promise<ScenarioDetail> {
  return requestJson<ScenarioResponseDto>(`/scenarios/${scenarioId}`, {
    user,
    accessToken,
  });
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

export function listScenarioAssets(
  user: StoredUser,
  scenarioId: string,
  options?: {
    kind?: ScenarioAssetKind;
  },
  accessToken?: string | null
): Promise<ScenarioAssetResponseDto[]> {
  const search = options?.kind ? `?kind=${encodeURIComponent(options.kind)}` : '';
  return requestJson<ScenarioAssetResponseDto[]>(`/scenarios/${scenarioId}/assets${search}`, {
    user,
    accessToken,
  });
}

export function uploadScenarioAsset(
  user: StoredUser,
  scenarioId: string,
  payload: UploadScenarioAssetDto,
  accessToken?: string | null
): Promise<ScenarioAssetResponseDto> {
  return requestJson<ScenarioAssetResponseDto>(`/scenarios/${scenarioId}/assets`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function deleteScenarioAsset(
  user: StoredUser,
  scenarioId: string,
  assetId: string,
  accessToken?: string | null
): Promise<void> {
  return requestJson<void>(`/scenarios/${scenarioId}/assets/${assetId}`, {
    method: 'DELETE',
    user,
    accessToken,
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

  let fallbackSnapshot: SessionSnapshot | null = null;

  if ('session' in created) {
    fallbackSnapshot = normalizeSessionSnapshot(created);
  } else if ('snapshot' in created && created.snapshot) {
    fallbackSnapshot = normalizeSessionSnapshot(created.snapshot);
  } else {
    return getSession(user, created.sessionId, accessToken);
  }

  try {
    return await getSession(
      user,
      fallbackSnapshot.session.publicId || fallbackSnapshot.session.id,
      accessToken,
    );
  } catch {
    return fallbackSnapshot;
  }
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

  let fallbackSnapshot: SessionSnapshot | null = null;

  if ('session' in joined) {
    fallbackSnapshot = normalizeSessionSnapshot(joined);
  } else if ('snapshot' in joined && joined.snapshot) {
    fallbackSnapshot = normalizeSessionSnapshot(joined.snapshot);
  } else {
    return getSession(user, joined.sessionId, accessToken);
  }

  try {
    return await getSession(
      user,
      fallbackSnapshot.session.publicId || fallbackSnapshot.session.id,
      accessToken,
    );
  } catch {
    return fallbackSnapshot;
  }
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

  const fallbackSnapshot = normalizeSessionSnapshot(joined);

  try {
    return await getSession(
      user,
      fallbackSnapshot.session.publicId || fallbackSnapshot.session.id,
      accessToken,
    );
  } catch {
    return fallbackSnapshot;
  }
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

export function submitAction(
  user: StoredUser,
  sessionId: string,
  payload: SubmitActionDto,
  accessToken?: string | null
): Promise<ActionAcceptedResponseDto> {
  return requestJson<ActionAcceptedResponseDto>(`/sessions/${sessionId}/actions`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function submitRestAction(
  user: StoredUser,
  sessionId: string,
  payload: RestActionDto,
  accessToken?: string | null
): Promise<ActionAcceptedResponseDto> {
  return requestJson<ActionAcceptedResponseDto>(`/sessions/${sessionId}/actions/rest/${payload.restType}`, {
    method: 'POST',
    user,
    accessToken,
    body: {
      characterId: payload.characterId,
      ...(payload.hitDiceToSpend === undefined ? {} : { hitDiceToSpend: payload.hitDiceToSpend }),
    },
  });
}

export function approveRestAction(
  user: StoredUser,
  sessionId: string,
  actionId: string,
  accessToken?: string | null
): Promise<ActionAcceptedResponseDto> {
  return requestJson<ActionAcceptedResponseDto>(
    `/sessions/${sessionId}/actions/rest/requests/${actionId}/approve`,
    {
      method: 'POST',
      user,
      accessToken,
    }
  );
}

export function rejectRestAction(
  user: StoredUser,
  sessionId: string,
  actionId: string,
  accessToken?: string | null
): Promise<ActionAcceptedResponseDto> {
  return requestJson<ActionAcceptedResponseDto>(
    `/sessions/${sessionId}/actions/rest/requests/${actionId}/reject`,
    {
      method: 'POST',
      user,
      accessToken,
    }
  );
}

export function cancelRestAction(
  user: StoredUser,
  sessionId: string,
  actionId: string,
  accessToken?: string | null
): Promise<ActionAcceptedResponseDto> {
  return requestJson<ActionAcceptedResponseDto>(
    `/sessions/${sessionId}/actions/rest/requests/${actionId}/cancel`,
    {
      method: 'POST',
      user,
      accessToken,
    }
  );
}

export function submitMainCommand(
  user: StoredUser,
  sessionId: string,
  payload: SubmitMainCommandDto,
  accessToken?: string | null
): Promise<MainCommandResponseDto> {
  return requestJson<MainCommandResponseDto>(`/sessions/${sessionId}/actions/main-command`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function resolveMainCommandCheck(
  user: StoredUser,
  sessionId: string,
  payload: ResolveMainCommandCheckDto,
  accessToken?: string | null
): Promise<MainCommandResponseDto> {
  return requestJson<MainCommandResponseDto>(
    `/sessions/${sessionId}/actions/main-command/check-result`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
    }
  );
}

export function useInventoryItem(
  user: StoredUser,
  sessionId: string,
  payload: UseInventoryItemDto,
  accessToken?: string | null
): Promise<UseInventoryItemResponseDto> {
  return requestJson<UseInventoryItemResponseDto>(`/sessions/${sessionId}/actions/inventory/use`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function listTurnLogs(
  user: StoredUser,
  sessionId: string,
  options?: {
    cursor?: string | null;
    size?: number;
    includeStateDiff?: boolean;
    includeDiceResult?: boolean;
  },
  accessToken?: string | null
): Promise<TurnLogListResponseDto> {
  const params = new URLSearchParams();

  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.size) params.set('size', String(options.size));
  if (options?.includeStateDiff) params.set('includeStateDiff', 'true');
  if (options?.includeDiceResult) params.set('includeDiceResult', 'true');

  const query = params.toString();
  return requestJson<TurnLogListResponseDto>(
    `/sessions/${sessionId}/turn-logs${query ? `?${query}` : ''}`,
    {
      user,
      accessToken,
    }
  );
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

export function updateGmVttMap(
  user: StoredUser,
  sessionId: string,
  map: VttMapStateDto,
  accessToken?: string | null
): Promise<VttMapStateDto> {
  const payload: UpdateVttMapDto = { map };
  return requestJson<VttMapStateDto>(`/sessions/${sessionId}/gm/map`, {
    method: 'PUT',
    user,
    accessToken,
    body: payload,
  });
}

export function moveSessionToken(
  user: StoredUser,
  sessionId: string,
  payload: MoveSessionTokenDto,
  accessToken?: string | null
): Promise<VttMapStateDto> {
  return requestJson<VttMapStateDto>(`/sessions/${sessionId}/map/tokens/move`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function createVttMapPing(
  user: StoredUser,
  sessionId: string,
  payload: CreateVttMapPingDto,
  accessToken?: string | null
): Promise<VttMapStateDto> {
  return requestJson<VttMapStateDto>(`/sessions/${sessionId}/map/pings`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function runVttMapInteraction(
  user: StoredUser,
  sessionId: string,
  payload: VttMapInteractionDto,
  accessToken?: string | null
): Promise<VttMapInteractionResponseDto> {
  return requestJson<VttMapInteractionResponseDto>(`/sessions/${sessionId}/map/interactions`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function getCombat(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<CombatResponseDto> {
  return requestJson<CombatResponseDto>(`/sessions/${sessionId}/combat`, {
    user,
    accessToken,
  });
}

export function startCombat(
  user: StoredUser,
  sessionId: string,
  payload: StartCombatDto = {},
  accessToken?: string | null
): Promise<CombatResponseDto> {
  return requestJson<CombatResponseDto>(`/sessions/${sessionId}/combat/start`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function endCombat(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<CombatResponseDto> {
  return requestJson<CombatResponseDto>(`/sessions/${sessionId}/combat/end`, {
    method: 'POST',
    user,
    accessToken,
  });
}

export function endCombatTurn(
  user: StoredUser,
  sessionId: string,
  payload: EndTurnDto = {},
  accessToken?: string | null
): Promise<TurnAdvanceResponseDto> {
  return requestJson<TurnAdvanceResponseDto>(`/sessions/${sessionId}/combat/turn/end`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function applyCombatDamage(
  user: StoredUser,
  sessionId: string,
  payload: ApplyCombatDamageDto,
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/damage`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function resolveCombatAttack(
  user: StoredUser,
  sessionId: string,
  payload: ResolveCombatAttackDto,
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/attack`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function resolveEquippedWeaponAttack(
  user: StoredUser,
  sessionId: string,
  payload: EquippedWeaponAttackDto,
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/attack/equipped`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function resolveOffhandWeaponAttack(
  user: StoredUser,
  sessionId: string,
  payload: EquippedWeaponAttackDto,
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/attack/offhand`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function useSecondWindCombatAction(
  user: StoredUser,
  sessionId: string,
  payload: CombatBasicActionDto = {},
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/features/second-wind`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function resolveSneakAttackCombatAction(
  user: StoredUser,
  sessionId: string,
  payload: EquippedWeaponAttackDto,
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/features/sneak-attack`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function dashCombatAction(
  user: StoredUser,
  sessionId: string,
  payload: CombatBasicActionDto = {},
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/dash`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function dodgeCombatAction(
  user: StoredUser,
  sessionId: string,
  payload: CombatBasicActionDto = {},
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/dodge`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function hideCombatAction(
  user: StoredUser,
  sessionId: string,
  payload: CombatBasicActionDto = {},
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/hide`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function resolveCombatActorAction(
  user: StoredUser,
  sessionId: string,
  payload: CombatActorActionDto = {},
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/actor/action`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function autoMonsterTurn(
  user: StoredUser,
  sessionId: string,
  payload: AutoMonsterTurnDto = {},
  accessToken?: string | null
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/monster/act`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function castCombatSpell(
  user: StoredUser,
  sessionId: string,
  payload: CastCombatSpellDto
): Promise<CombatActionResultDto> {
  return requestJson<CombatActionResultDto>(`/sessions/${sessionId}/combat/spells/cast`, {
    method: 'POST',
    user,
    body: payload,
  });
}

export function moveCombatParticipant(
  user: StoredUser,
  sessionId: string,
  payload: MoveCombatParticipantDto,
  accessToken?: string | null
): Promise<CombatMoveResultDto> {
  return requestJson<CombatMoveResultDto>(`/sessions/${sessionId}/combat/move`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function forceMoveCombatParticipant(
  user: StoredUser,
  sessionId: string,
  payload: ForceMoveCombatParticipantDto,
  accessToken?: string | null
): Promise<CombatMoveResultDto> {
  return requestJson<CombatMoveResultDto>(`/sessions/${sessionId}/combat/force-move`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function acceptCombatReaction(
  user: StoredUser,
  sessionId: string,
  payload: CombatReactionResponseDto,
  accessToken?: string | null
): Promise<CombatMoveResultDto> {
  const reactionQuery = new URLSearchParams({ reactionId: payload.reactionId }).toString();
  return requestJson<CombatMoveResultDto>(`/sessions/${sessionId}/combat/reactions/accept?${reactionQuery}`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function declineCombatReaction(
  user: StoredUser,
  sessionId: string,
  payload: CombatReactionResponseDto,
  accessToken?: string | null
): Promise<CombatMoveResultDto> {
  const reactionQuery = new URLSearchParams({ reactionId: payload.reactionId }).toString();
  return requestJson<CombatMoveResultDto>(`/sessions/${sessionId}/combat/reactions/decline?${reactionQuery}`, {
    method: 'POST',
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
      subclassName: payload.subclassName,
      avatarType: payload.avatarType,
      avatarPresetId: payload.avatarPresetId,
      avatarUrl: payload.avatarUrl,
      scenarioId: payload.scenarioId,
      startingEquipmentSelection: payload.startingEquipmentSelection,
      startingEquipmentItemSelections: payload.startingEquipmentItemSelections,
      startingSpells: payload.startingSpells,
      level: payload.level,
      abilities: payload.abilities,
      proficiencyBonus: payload.proficiencyBonus,
      proficientSkills: payload.proficientSkills,
      features: payload.features,
      maxHp: payload.maxHp,
      armorClass: payload.armorClass,
      speed: payload.speed,
      inventory: payload.inventory,
      equippedWeaponId: payload.equippedWeaponId,
      offhandWeaponId: payload.offhandWeaponId,
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
      subclassName: payload.subclassName,
      avatarType: payload.avatarType,
      avatarPresetId: payload.avatarPresetId,
      avatarUrl: payload.avatarUrl,
      level: payload.level,
      abilities: payload.abilities,
      proficiencyBonus: payload.proficiencyBonus,
      proficientSkills: payload.proficientSkills,
      features: payload.features,
      maxHp: payload.maxHp,
      armorClass: payload.armorClass,
      speed: payload.speed,
      inventory: payload.inventory,
      equippedWeaponId: payload.equippedWeaponId,
      offhandWeaponId: payload.offhandWeaponId,
    },
  });
}

export function levelUpCharacter(
  user: StoredUser,
  characterId: string,
  payload: LevelUpCharacterDto,
  accessToken?: string | null
): Promise<CharacterResponseDto> {
  return requestJson<CharacterResponseDto>(`/characters/${characterId}/level-up`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function updateCharacterEquipment(
  user: StoredUser,
  characterId: string,
  payload: UpdateCharacterEquipmentDto,
  accessToken?: string | null
): Promise<CharacterResponseDto> {
  return requestJson<CharacterResponseDto>(`/characters/${characterId}/equipment`, {
    method: 'PATCH',
    user,
    accessToken,
    body: payload,
  });
}

export function updatePreparedSpells(
  user: StoredUser,
  characterId: string,
  payload: UpdatePreparedSpellsDto,
  accessToken?: string | null
): Promise<CharacterResponseDto> {
  return requestJson<CharacterResponseDto>(`/characters/${characterId}/prepared-spells`, {
    method: 'PATCH',
    user,
    accessToken,
    body: payload,
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

export async function updateHumanGm(
  user: StoredUser,
  sessionId: string,
  gmUserId: string,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/gm`, {
    method: 'PATCH',
    user,
    accessToken,
    body: { gmUserId },
  });

  return normalizeSessionSnapshot(snapshot);
}

export async function updateHumanGmSessionNode(
  user: StoredUser,
  sessionId: string,
  nodeId: string,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const payload: UpdateSessionNodeDto = { nodeId };
  const snapshot = await requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/gm/node`, {
    method: 'PATCH',
    user,
    accessToken,
    body: payload,
  });

  return normalizeSessionSnapshot(snapshot);
}

export async function createHumanGmMessage(
  user: StoredUser,
  sessionId: string,
  payload: HumanGmMessageDto,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/gm/messages`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });

  return normalizeSessionSnapshot(snapshot);
}

export function getHumanGmNodeMoveOptions(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<HumanGmNodeMoveOptionDto[]> {
  return requestJson<HumanGmNodeMoveOptionDto[]>(`/sessions/${sessionId}/gm/node-options`, {
    method: 'GET',
    user,
    accessToken,
  });
}

export async function grantHumanGmInventoryItem(
  user: StoredUser,
  sessionId: string,
  payload: GrantHumanGmInventoryItemDto,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(
    `/sessions/${sessionId}/gm/inventory/grant`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
    }
  );

  return normalizeSessionSnapshot(snapshot);
}

export async function applyHumanGmCombatCondition(
  user: StoredUser,
  sessionId: string,
  payload: ApplyHumanGmCombatConditionDto,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(
    `/sessions/${sessionId}/gm/combat/conditions`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
    }
  );

  return normalizeSessionSnapshot(snapshot);
}

export async function removeHumanGmInventoryItem(
  user: StoredUser,
  sessionId: string,
  payload: RemoveHumanGmInventoryItemDto,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(
    `/sessions/${sessionId}/gm/inventory/remove`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
    }
  );

  return normalizeSessionSnapshot(snapshot);
}

export async function setHumanGmDifficultyClass(
  user: StoredUser,
  sessionId: string,
  payload: SetHumanGmDifficultyClassDto,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(
    `/sessions/${sessionId}/gm/dc`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
    }
  );

  return normalizeSessionSnapshot(snapshot);
}

export function getHumanGmPrivateNotes(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<HumanGmPrivateNoteDto[]> {
  return requestJson<HumanGmPrivateNoteDto[]>(`/sessions/${sessionId}/gm/private-notes`, {
    method: 'GET',
    user,
    accessToken,
  });
}

export function createHumanGmAiAssistSuggestion(
  user: StoredUser,
  sessionId: string,
  payload: CreateHumanGmAiAssistSuggestionDto,
  accessToken?: string | null
): Promise<HumanGmAiAssistSuggestionDto> {
  return requestJson<HumanGmAiAssistSuggestionDto>(`/sessions/${sessionId}/gm/ai-assist/suggestions`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
}

export function generateHumanGmAiAssistSuggestion(
  user: StoredUser,
  sessionId: string,
  payload: AiHumanGmAssistSuggestionRequestDto,
  accessToken?: string | null
): Promise<HumanGmAiAssistSuggestionDto> {
  return requestJson<HumanGmAiAssistSuggestionDto>(
    `/sessions/${sessionId}/ai/gm-assist-suggestion`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
    }
  );
}

export function getHumanGmAiAssistSuggestions(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<HumanGmAiAssistSuggestionDto[]> {
  return requestJson<HumanGmAiAssistSuggestionDto[]>(`/sessions/${sessionId}/gm/ai-assist/suggestions`, {
    method: 'GET',
    user,
    accessToken,
  });
}

export async function acceptHumanGmAiAssistSuggestion(
  user: StoredUser,
  sessionId: string,
  payload: AcceptHumanGmAiAssistSuggestionDto,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(
    `/sessions/${sessionId}/gm/ai-assist/accept`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
    }
  );

  return normalizeSessionSnapshot(snapshot);
}

export async function reportHumanGmAiAssistApplicationFailure(
  user: StoredUser,
  sessionId: string,
  payload: ReportHumanGmAiAssistApplicationFailureDto,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(
    `/sessions/${sessionId}/gm/ai-assist/apply-failure`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
    }
  );

  return normalizeSessionSnapshot(snapshot);
}

export async function adjustHumanGmCombatHp(
  user: StoredUser,
  sessionId: string,
  payload: AdjustHumanGmCombatHpDto,
  accessToken?: string | null
): Promise<SessionSnapshotDto> {
  return requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/gm/combat/hp`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
  });
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
