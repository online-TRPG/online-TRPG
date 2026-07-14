import type {
  ActionAcceptedResponseDto,
  ApplyCampaignCalendarActionDto,
  CampaignArchiveResponseDto,
  CharacterTransferResponseDto,
  CharacterVaultItemDto,
  CompleteCampaignDto,
  GameStateResponseDto,
  MainCommandResponseDto,
  RequestCharacterTransferDto,
  ResolveMainCommandCheckDto,
  RestActionDto,
  SessionDetailResponseDto,
  SessionInviteResponseDto,
  SessionInvitePreviewResponseDto,
  SessionListItemResponseDto,
  SessionListSort,
  SessionStatus,
  SessionActivityStatus,
  SessionVisibility,
  ParticipantRole,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  SubmitActionDto,
  SubmitMainCommandDto,
  TurnLogListResponseDto,
  UseInventoryItemDto,
  UseInventoryItemResponseDto,
  SessionPlayResponseDto,
  SessionApplicationResponseDto,
  SessionScheduleProximityWarningDto,
  SessionScheduleVersionAcknowledgementDto,
  ActivePlayResponseDto,
  CreateSessionPlayDto,
  UpdateSessionPlayDto,
  SessionPlayTransitionDto,
  UpdateSessionPlayAttendanceDto,
  CreateSessionApplicationDto,
  ResolveSessionApplicationDto,
} from '@trpg/shared-types';
import {
  GmMode,
  SessionPlayStatus,
  SessionAttendanceStatus,
  SessionApplicationStatus,
  SessionJoinTiming,
} from '@trpg/shared-types/frontend';
import { getRuleSetLabel } from '../presentation/ruleSetLabels';
import type {
  AvailableSessionListItem,
  SessionDetail,
  SessionSnapshot,
  StoredUser,
} from '../types/session';
import {
  decodeActionAcceptedResponse,
  decodeArray,
  decodeCampaignArchiveResponse,
  decodeCharacterTransferResponse,
  decodeCharacterVaultItemArray,
  decodeGameStateResponse,
  decodeMainCommandResponse,
  decodePaginatedResponse,
  decodeSessionDetail,
  decodeSessionListItem,
  decodeSessionParticipant,
  decodeSessionResponse,
  decodeSessionSnapshot,
  decodeTurnLogListResponse,
  decodeUseInventoryItemResponse,
  decodeUserResponse,
  isRecord,
  readRecord,
  readNumber,
  readString,
} from '@trpg/shared-types/frontend';
import { normalizeSessionDetail, normalizeSessionSnapshot } from '../types/session';
import { requestJson } from './httpClient';
import { trackProductEvent } from './productEvents';
import { DEFAULT_SCENARIO_ID } from './scenarioApi';

const DEFAULT_RULE_SET_ID = 'dnd5e';

function readNullableStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${key} must be a string or null.`);
  return value;
}

function decodeSessionPlay(value: unknown): SessionPlayResponseDto {
  const record = readRecord(value, 'session play');
  const status = readString(record, 'status');
  if (!Object.values(SessionPlayStatus).includes(status as SessionPlayStatus)) throw new Error('session play status is invalid.');
  const viewer = record.viewerAttendance;
  const viewerAttendance = viewer === null
    ? null
    : (() => {
        const attendanceRecord = readRecord(viewer, 'session play attendance');
        const attendance = readString(attendanceRecord, 'attendance');
        if (!Object.values(SessionAttendanceStatus).includes(attendance as SessionAttendanceStatus)) throw new Error('attendance is invalid.');
        return {
          attendance: attendance as SessionAttendanceStatus,
          isReady: attendanceRecord.isReady === true,
          readyAt: readNullableStringField(attendanceRecord, 'readyAt'),
          enteredLobbyAt: readNullableStringField(attendanceRecord, 'enteredLobbyAt'),
        };
      })();
  const warnings = decodeArray(record.proximityWarnings, (entry) => {
    const warning = readRecord(entry, 'proximity warning');
    return {
      comparedPlayId: readString(warning, 'comparedPlayId'),
      sessionTitle: readString(warning, 'sessionTitle'),
      scheduledStartAt: readString(warning, 'scheduledStartAt'),
      differenceMinutes: readNumber(warning, 'differenceMinutes'),
      scheduleVersion: readNumber(warning, 'scheduleVersion'),
      targetScheduleVersion: readNumber(warning, 'targetScheduleVersion'),
    };
  }, 'proximity warnings');
  return {
    id: readString(record, 'id'),
    sessionId: readString(record, 'sessionId'),
    sequence: readNumber(record, 'sequence'),
    status: status as SessionPlayStatus,
    scheduledStartAt: readNullableStringField(record, 'scheduledStartAt'),
    lobbyOpensAt: readNullableStringField(record, 'lobbyOpensAt'),
    startedAt: readNullableStringField(record, 'startedAt'),
    endedAt: readNullableStringField(record, 'endedAt'),
    timeZone: readString(record, 'timeZone'),
    scheduleVersion: readNumber(record, 'scheduleVersion'),
    stateVersion: readNumber(record, 'stateVersion'),
    summary: readNullableStringField(record, 'summary'),
    viewerAttendance,
    proximityWarnings: warnings,
  };
}

function decodeSessionApplication(value: unknown): SessionApplicationResponseDto {
  const record = readRecord(value, 'session application');
  const status = readString(record, 'status');
  if (!Object.values(SessionApplicationStatus).includes(status as SessionApplicationStatus)) throw new Error('application status is invalid.');
  const joinTimingValue = record.joinTiming;
  const joinTiming = joinTimingValue === null ? null : readString(record, 'joinTiming');
  if (joinTiming !== null && !Object.values(SessionJoinTiming).includes(joinTiming as SessionJoinTiming)) throw new Error('join timing is invalid.');
  return {
    id: readString(record, 'id'),
    sessionId: readString(record, 'sessionId'),
    applicant: decodeUserResponse(record.applicant),
    status: status as SessionApplicationStatus,
    note: readNullableStringField(record, 'note'),
    joinTiming: joinTiming as SessionJoinTiming | null,
    createdAt: readString(record, 'createdAt'),
    resolvedAt: readNullableStringField(record, 'resolvedAt'),
  };
}

export interface PaginatedList<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SessionListParams {
  query?: string;
  status?: SessionStatus;
  activityStatus?: SessionActivityStatus;
  gmMode?: GmMode;
  scenarioId?: string;
  ruleSetId?: string;
  role?: ParticipantRole;
  sort?: SessionListSort;
  page?: number;
  size?: number;
}

export interface CreateSessionInput {
  title: string;
  description?: string;
  scenarioId?: string;
  maxParticipants: number;
  gmMode: GmMode;
  visibility: SessionVisibility;
  nextSessionAt?: string;
  recruitmentStatus?: 'OPEN' | 'CLOSED';
  joinPolicy?: 'INVITE_ONLY' | 'APPROVAL_REQUIRED' | 'OPEN_JOIN';
  openLobbyNow?: boolean;
}

export interface UpdateSessionInput {
  title?: string;
  scenarioId?: string;
  description?: string;
  maxParticipants?: number;
  gmMode?: GmMode;
  visibility?: SessionVisibility;
  nextSessionAt?: string | null;
  recruitmentStatus?: 'OPEN' | 'CLOSED';
  joinPolicy?: 'INVITE_ONLY' | 'APPROVAL_REQUIRED' | 'OPEN_JOIN';
}

function decodeSessionInvitePreview(value: unknown): SessionInvitePreviewResponseDto {
  const record = readRecord(value, 'session invite preview');
  const scenario = readRecord(record.scenario, 'session invite preview.scenario');
  const gmMode = readString(record, 'gmMode', 'session invite preview.gmMode');
  if (gmMode !== GmMode.AI && gmMode !== GmMode.HUMAN) {
    throw new Error('session invite preview.gmMode is invalid.');
  }
  return {
    title: readString(record, 'title', 'session invite preview.title'),
    description: readString(record, 'description', 'session invite preview.description'),
    gmMode,
    participantCount: readNumber(record, 'participantCount', 'session invite preview.participantCount'),
    maxParticipants: readNumber(record, 'maxParticipants', 'session invite preview.maxParticipants'),
    nextSessionAt: readNullableText(record, 'nextSessionAt', 'session invite preview.nextSessionAt'),
    scenario: {
      title: readString(scenario, 'title', 'session invite preview.scenario.title'),
      description: readNullableText(scenario, 'description', 'session invite preview.scenario.description'),
      thumbnailUrl: readNullableText(scenario, 'thumbnailUrl', 'session invite preview.scenario.thumbnailUrl'),
      difficulty: readNullableText(scenario, 'difficulty', 'session invite preview.scenario.difficulty'),
      tags: Array.isArray(scenario.tags)
        ? scenario.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      startLevel: readNumber(scenario, 'startLevel', 'session invite preview.scenario.startLevel'),
      recommendedEndLevel: readNullableNumber(
        scenario,
        'recommendedEndLevel',
        'session invite preview.scenario.recommendedEndLevel',
      ),
      estimatedMinutes: readNullableNumber(
        scenario,
        'estimatedMinutes',
        'session invite preview.scenario.estimatedMinutes',
      ),
      recommendedPlayersMin: readNullableNumber(
        scenario,
        'recommendedPlayersMin',
        'session invite preview.scenario.recommendedPlayersMin',
      ),
      recommendedPlayersMax: readNullableNumber(
        scenario,
        'recommendedPlayersMax',
        'session invite preview.scenario.recommendedPlayersMax',
      ),
    },
  };
}

function readNullableText(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | null {
  if (record[key] === null) return null;
  return readString(record, key, label);
}

function readNullableNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
): number | null {
  if (record[key] === null) return null;
  return readNumber(record, key, label);
}

function buildSessionListQuery(params: SessionListParams): string {
  const query = new URLSearchParams();
  const searchText = params.query?.trim();
  if (searchText) query.set('query', searchText);
  if (params.status) query.set('status', params.status);
  if (params.activityStatus) query.set('activityStatus', params.activityStatus);
  if (params.gmMode) query.set('gmMode', params.gmMode);
  if (params.scenarioId) query.set('scenarioId', params.scenarioId);
  if (params.ruleSetId) query.set('ruleSetId', params.ruleSetId);
  if (params.role) query.set('role', params.role);
  if (params.sort) query.set('sort', params.sort);
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.size !== undefined) query.set('size', String(params.size));
  return query.toString();
}

export function listSessions(
  user?: StoredUser | null,
  accessToken?: string | null,
  params: SessionListParams = {},
): Promise<PaginatedList<AvailableSessionListItem>> {
  const query = buildSessionListQuery(params);
  return requestJson<PaginatedList<SessionListItemResponseDto>>(`/sessions${query ? `?${query}` : ''}`, {
    user,
    accessToken,
    decode: (value) => decodePaginatedResponse(value, decodeSessionListItem),
  }).then((result) => {
    trackProductEvent('session_search_performed', 'session-discover');
    return { ...result, content: result.content.map(normalizeSessionListItem) };
  });
}

export function listMySessions(
  user: StoredUser,
  accessToken?: string | null,
  params: SessionListParams = {},
): Promise<PaginatedList<AvailableSessionListItem>> {
  const query = buildSessionListQuery(params);
  return requestJson<PaginatedList<SessionListItemResponseDto>>(`/users/me/sessions${query ? `?${query}` : ''}`, {
    user,
    accessToken,
    decode: (value) => decodePaginatedResponse(value, decodeSessionListItem),
  }).then((result) => ({
    ...result,
    content: result.content.map(normalizeSessionListItem),
  }));
}

export async function createSession(
  user: StoredUser,
  input: CreateSessionInput,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const created = await requestJson<
    SessionSnapshotDto | { sessionId: string; snapshot?: SessionSnapshotDto }
  >('/sessions', {
    method: 'POST',
    user,
    accessToken,
    body: {
      title: input.title,
      description: input.description,
      scenarioId: input.scenarioId || DEFAULT_SCENARIO_ID,
      ruleSetId: DEFAULT_RULE_SET_ID,
      maxParticipants: input.maxParticipants,
      gmMode: input.gmMode,
      visibility: input.visibility,
      nextSessionAt: input.nextSessionAt,
      recruitmentStatus: input.recruitmentStatus,
      joinPolicy: input.joinPolicy,
      openLobbyNow: input.openLobbyNow,
    },
    decode: decodeSessionSnapshotOrSessionId,
  });
  trackProductEvent('session_create_completed', 'session-create');

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

export function getSessionInvitePreview(
  inviteCode: string,
): Promise<SessionInvitePreviewResponseDto> {
  return requestJson<SessionInvitePreviewResponseDto>(
    `/sessions/invites/${encodeURIComponent(inviteCode.trim().toUpperCase())}/preview`,
    { decode: decodeSessionInvitePreview },
  ).then((preview) => {
    trackProductEvent('invite_preview_opened', 'invite-preview');
    return preview;
  });
}

export function getSessionInvite(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null,
): Promise<SessionInviteResponseDto> {
  return requestJson<SessionInviteResponseDto>(`/sessions/${sessionId}/invite`, {
    user,
    accessToken,
    decode: (value) => {
      const record = readRecord(value, 'session invite');
      return {
        sessionId: readString(record, 'sessionId', 'session invite.sessionId'),
        inviteCode: readString(record, 'inviteCode', 'session invite.inviteCode'),
        shareUrl: readNullableText(record, 'shareUrl', 'session invite.shareUrl'),
      };
    },
  });
}

export function updateSession(
  user: StoredUser,
  sessionId: string,
  input: UpdateSessionInput,
  accessToken?: string | null,
): Promise<SessionResponseDto> {
  return requestJson<SessionResponseDto>(`/sessions/${sessionId}`, {
    method: 'PATCH',
    user,
    accessToken,
    body: input,
    decode: decodeSessionResponse,
  });
}

export async function joinSession(
  user: StoredUser,
  inviteCode: string,
  accessToken?: string | null,
  acknowledgedScheduleVersions: SessionScheduleVersionAcknowledgementDto[] = [],
): Promise<SessionSnapshot> {
  const joined = await requestJson<
    SessionSnapshotDto | { sessionId: string; snapshot?: SessionSnapshotDto }
  >('/sessions/join-by-invite', {
    method: 'POST',
    user,
    accessToken,
    body: { inviteCode, acknowledgedScheduleVersions },
    decode: decodeSessionSnapshotOrSessionId,
  });
  trackProductEvent('invite_join_completed', 'invite-preview');
  if (acknowledgedScheduleVersions.length) {
    trackProductEvent('session_proximity_warning_acknowledged', 'invite-preview');
  }

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
  accessToken?: string | null,
  acknowledgedScheduleVersions: SessionScheduleVersionAcknowledgementDto[] = [],
): Promise<SessionSnapshot> {
  const joined = await requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/join`, {
    method: 'POST',
    user,
    accessToken,
    body: { acknowledgedScheduleVersions },
    decode: decodeSessionSnapshot,
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
    decode: decodeSessionSnapshot,
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
    decode: decodeSessionDetail,
  }).then(normalizeSessionDetail);
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
      decode: decodeSessionParticipant,
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
    decode: decodeSessionSnapshot,
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
  }).then((result) => {
    trackProductEvent('session_member_left', 'play');
    return result;
  });
}

export function completeLongCampaign(
  user: StoredUser,
  sessionId: string,
  payload: CompleteCampaignDto,
  accessToken?: string | null
): Promise<CampaignArchiveResponseDto> {
  return requestJson<CampaignArchiveResponseDto>(`/sessions/${sessionId}/complete-campaign`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
    decode: decodeCampaignArchiveResponse,
  });
}

export function getCampaignArchive(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<CampaignArchiveResponseDto> {
  return requestJson<CampaignArchiveResponseDto>(`/sessions/${sessionId}/campaign-archive`, {
    user,
    accessToken,
    decode: decodeCampaignArchiveResponse,
  });
}

export function listCharacterVault(
  user: StoredUser,
  accessToken?: string | null
): Promise<CharacterVaultItemDto[]> {
  return requestJson<CharacterVaultItemDto[]>('/sessions/characters/vault', {
    user,
    accessToken,
    decode: decodeCharacterVaultItemArray,
  });
}

export function requestCharacterTransfer(
  user: StoredUser,
  targetSessionId: string,
  payload: RequestCharacterTransferDto,
  accessToken?: string | null
): Promise<CharacterTransferResponseDto> {
  return requestJson<CharacterTransferResponseDto>(`/sessions/${targetSessionId}/character-transfers`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
    decode: decodeCharacterTransferResponse,
  });
}

export function approveCharacterTransfer(
  user: StoredUser,
  targetSessionId: string,
  requestId: string,
  accessToken?: string | null
): Promise<CharacterTransferResponseDto> {
  return requestJson<CharacterTransferResponseDto>(
    `/sessions/${targetSessionId}/character-transfers/${encodeURIComponent(requestId)}/approve`,
    {
      method: 'POST',
      user,
      accessToken,
      decode: decodeCharacterTransferResponse,
    }
  );
}

export function rejectCharacterTransfer(
  user: StoredUser,
  targetSessionId: string,
  requestId: string,
  accessToken?: string | null
): Promise<CharacterTransferResponseDto> {
  return requestJson<CharacterTransferResponseDto>(
    `/sessions/${targetSessionId}/character-transfers/${encodeURIComponent(requestId)}/reject`,
    {
      method: 'POST',
      user,
      accessToken,
      decode: decodeCharacterTransferResponse,
    }
  );
}

export function getSessionState(user: StoredUser, sessionId: string): Promise<GameStateResponseDto> {
  return requestJson<GameStateResponseDto>(`/sessions/${sessionId}/state`, {
    user,
    decode: decodeGameStateResponse,
  });
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
    decode: decodeActionAcceptedResponse,
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
    decode: decodeActionAcceptedResponse,
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
      decode: decodeActionAcceptedResponse,
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
      decode: decodeActionAcceptedResponse,
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
      decode: decodeActionAcceptedResponse,
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
    decode: decodeMainCommandResponse,
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
      decode: decodeMainCommandResponse,
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
    decode: decodeUseInventoryItemResponse,
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
      decode: decodeTurnLogListResponse,
    }
  );
}

export async function applyCampaignCalendarAction(
  user: StoredUser,
  sessionId: string,
  payload: ApplyCampaignCalendarActionDto,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(
    `/sessions/${sessionId}/campaign-calendar`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
      decode: decodeSessionSnapshot,
    }
  );

  return normalizeSessionSnapshot(snapshot);
}

function decodeSessionSnapshotOrSessionId(
  value: unknown,
): SessionSnapshotDto | { sessionId: string; snapshot?: SessionSnapshotDto } {
  if (isRecord(value) && isRecord(value.session)) {
    return decodeSessionSnapshot(value);
  }

  const record = readRecord(value, 'session creation result');
  const sessionId = readString(record, 'sessionId', 'session creation result.sessionId');
  if (record.snapshot === undefined || record.snapshot === null) {
    return { sessionId };
  }
  return {
    sessionId,
    snapshot: decodeSessionSnapshot(record.snapshot),
  };
}

export function listSessionPlays(user: StoredUser, sessionId: string, accessToken?: string | null) {
  return requestJson<SessionPlayResponseDto[]>(`/sessions/${sessionId}/plays`, {
    user,
    accessToken,
    decode: (value) => decodeArray(value, decodeSessionPlay, 'session plays'),
  });
}

export function createSessionPlay(user: StoredUser, sessionId: string, dto: CreateSessionPlayDto, accessToken?: string | null) {
  return requestJson<SessionPlayResponseDto>(`/sessions/${sessionId}/plays`, {
    method: 'POST', user, accessToken, body: dto, decode: decodeSessionPlay,
  }).then((play) => {
    if (dto.scheduledStartAt) trackProductEvent('session_play_scheduled', 'session-home');
    return play;
  });
}

export function updateSessionPlay(user: StoredUser, sessionId: string, playId: string, dto: UpdateSessionPlayDto, accessToken?: string | null) {
  return requestJson<SessionPlayResponseDto>(`/sessions/${sessionId}/plays/${playId}`, {
    method: 'PATCH', user, accessToken, body: dto, decode: decodeSessionPlay,
  });
}

export function transitionSessionPlay(
  user: StoredUser,
  sessionId: string,
  playId: string,
  action: 'cancel' | 'open-lobby' | 'finish',
  dto: SessionPlayTransitionDto,
  accessToken?: string | null,
) {
  return requestJson<SessionPlayResponseDto>(`/sessions/${sessionId}/plays/${playId}/${action}`, {
    method: 'POST', user, accessToken, body: dto, decode: decodeSessionPlay,
  }).then((play) => {
    if (action === 'finish' && play.startedAt) trackProductEvent('session_play_finished', 'play');
    return play;
  });
}

export function startSessionPlay(user: StoredUser, sessionId: string, playId: string, dto: SessionPlayTransitionDto, accessToken?: string | null) {
  return requestJson<SessionSnapshotDto>(`/sessions/${sessionId}/plays/${playId}/start`, {
    method: 'POST', user, accessToken, body: dto, decode: decodeSessionSnapshot,
  }).then(normalizeSessionSnapshot);
}

export function updateSessionPlayAttendance(user: StoredUser, sessionId: string, playId: string, dto: UpdateSessionPlayAttendanceDto, accessToken?: string | null) {
  return requestJson<SessionPlayResponseDto>(`/sessions/${sessionId}/plays/${playId}/attendance/me`, {
    method: 'PATCH', user, accessToken, body: dto, decode: decodeSessionPlay,
  });
}

export function enterActivePlay(user: StoredUser, sessionId: string, playId: string, confirmSwitch: boolean, accessToken?: string | null) {
  return requestJson<ActivePlayResponseDto>(`/sessions/${sessionId}/plays/${playId}/enter`, {
    method: 'POST', user, accessToken, body: { confirmSwitch },
    decode: (value) => {
      const record = readRecord(value, 'active play');
      return {
        sessionId: readString(record, 'sessionId'),
        playId: readString(record, 'playId'),
        acquiredAt: readString(record, 'acquiredAt'),
        heartbeatAt: readString(record, 'heartbeatAt'),
      };
    },
  }).then((active) => {
    trackProductEvent(confirmSwitch ? 'session_live_play_switched' : 'session_lobby_entered', 'play-entry');
    return active;
  });
}

export function leaveActivePlay(user: StoredUser, accessToken?: string | null): Promise<void> {
  return requestJson<void>('/sessions/active-play/me', { method: 'DELETE', user, accessToken });
}

export function heartbeatActivePlay(user: StoredUser, playId: string, accessToken?: string | null) {
  return requestJson<ActivePlayResponseDto>(`/sessions/active-play/${playId}/heartbeat`, {
    method: 'POST', user, accessToken,
    decode: (value) => {
      const record = readRecord(value, 'active play');
      return { sessionId: readString(record, 'sessionId'), playId: readString(record, 'playId'), acquiredAt: readString(record, 'acquiredAt'), heartbeatAt: readString(record, 'heartbeatAt') };
    },
  });
}

export function createSessionApplication(user: StoredUser, sessionId: string, dto: CreateSessionApplicationDto, accessToken?: string | null) {
  return requestJson<SessionApplicationResponseDto>(`/sessions/${sessionId}/applications`, {
    method: 'POST', user, accessToken, body: dto, decode: decodeSessionApplication,
  }).then((application) => {
    trackProductEvent('session_application_submitted', 'session-detail');
    if (dto.acknowledgedScheduleVersions?.length) {
      trackProductEvent('session_proximity_warning_acknowledged', 'session-detail');
    }
    return application;
  });
}

export function getSessionApplicationProximityWarnings(user: StoredUser, sessionId: string, accessToken?: string | null) {
  return requestJson<SessionScheduleProximityWarningDto[]>(`/sessions/${sessionId}/application-proximity-warnings`, {
    user,
    accessToken,
    decode: (value) => decodeArray(value, (entry) => {
      const warning = readRecord(entry, 'proximity warning');
      return {
        comparedPlayId: readString(warning, 'comparedPlayId'),
        sessionTitle: readString(warning, 'sessionTitle'),
        scheduledStartAt: readString(warning, 'scheduledStartAt'),
        differenceMinutes: readNumber(warning, 'differenceMinutes'),
        scheduleVersion: readNumber(warning, 'scheduleVersion'),
        targetScheduleVersion: readNumber(warning, 'targetScheduleVersion'),
      };
    }, 'proximity warnings'),
  }).then((warnings) => {
    if (warnings.length) trackProductEvent('session_proximity_warning_shown', 'session-detail');
    return warnings;
  });
}

export function getSessionInviteProximityWarnings(user: StoredUser, inviteCode: string, accessToken?: string | null) {
  return requestJson<SessionScheduleProximityWarningDto[]>(
    `/sessions/invites/${encodeURIComponent(inviteCode.trim().toUpperCase())}/proximity-warnings`,
    {
      user,
      accessToken,
      decode: (value) => decodeArray(value, (entry) => {
        const warning = readRecord(entry, 'proximity warning');
        return {
          comparedPlayId: readString(warning, 'comparedPlayId'),
          sessionTitle: readString(warning, 'sessionTitle'),
          scheduledStartAt: readString(warning, 'scheduledStartAt'),
          differenceMinutes: readNumber(warning, 'differenceMinutes'),
          scheduleVersion: readNumber(warning, 'scheduleVersion'),
          targetScheduleVersion: readNumber(warning, 'targetScheduleVersion'),
        };
      }, 'proximity warnings'),
    },
  ).then((warnings) => {
    if (warnings.length) trackProductEvent('session_proximity_warning_shown', 'invite-preview');
    return warnings;
  });
}

export function listSessionApplications(user: StoredUser, sessionId: string, accessToken?: string | null) {
  return requestJson<SessionApplicationResponseDto[]>(`/sessions/${sessionId}/applications`, {
    user, accessToken, decode: (value) => decodeArray(value, decodeSessionApplication, 'session applications'),
  });
}

export function resolveSessionApplication(user: StoredUser, sessionId: string, applicationId: string, dto: ResolveSessionApplicationDto, accessToken?: string | null) {
  return requestJson<SessionApplicationResponseDto>(`/sessions/${sessionId}/applications/${applicationId}`, {
    method: 'PATCH', user, accessToken, body: dto, decode: decodeSessionApplication,
  });
}

export function listRemovedParticipants(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null,
): Promise<SessionParticipantResponseDto[]> {
  return requestJson<SessionParticipantResponseDto[]>(`/sessions/${sessionId}/participants/removed`, {
    user,
    accessToken,
    decode: (value) => decodeArray(value, decodeSessionParticipant, 'removed participants'),
  });
}

export function removeSessionParticipant(
  user: StoredUser,
  sessionId: string,
  participantPublicId: string,
  accessToken?: string | null,
): Promise<SessionParticipantResponseDto> {
  return requestJson<SessionParticipantResponseDto>(
    `/sessions/${sessionId}/participants/${encodeURIComponent(participantPublicId)}`,
    { method: 'DELETE', user, accessToken, decode: decodeSessionParticipant },
  ).then((participant) => {
    trackProductEvent('session_member_removed', 'session-settings');
    return participant;
  });
}

export function restoreSessionParticipant(
  user: StoredUser,
  sessionId: string,
  participantPublicId: string,
  accessToken?: string | null,
): Promise<SessionParticipantResponseDto> {
  return requestJson<SessionParticipantResponseDto>(
    `/sessions/${sessionId}/participants/${encodeURIComponent(participantPublicId)}/restore`,
    { method: 'POST', user, accessToken, decode: decodeSessionParticipant },
  );
}
function normalizeSessionListItem(item: SessionListItemResponseDto): AvailableSessionListItem {
  return {
    sessionId: item.session.id,
    sessionPublicId: item.session.publicId,
    title: item.session.title,
    scenarioId: item.scenario.id,
    scenarioTitle: item.scenario.title,
    scenarioThumbnailUrl: item.scenario.thumbnailUrl,
    scenarioDescription: item.scenario.description,
    scenarioDifficulty: item.scenario.difficulty,
    scenarioTags: item.scenario.tags ?? [],
    scenarioEstimatedMinutes: item.scenario.estimatedMinutes,
    scenarioRecommendedPlayersMin: item.scenario.recommendedPlayersMin,
    scenarioRecommendedPlayersMax: item.scenario.recommendedPlayersMax,
    scenarioStartLevel: item.scenario.startLevel,
    scenarioRecommendedEndLevel: item.scenario.recommendedEndLevel,
    ruleSetName: getRuleSetLabel(item.session.ruleSetId),
    currentPlayers: item.participantCount,
    maxPlayers: item.session.maxPlayers,
    status: item.session.status,
    activityStatus: item.session.activityStatus,
    recruitmentStatus: item.session.recruitmentStatus,
    joinPolicy: item.session.joinPolicy,
    currentPlayId: item.session.currentPlayId,
    gmMode: item.session.gmMode,
    role: item.role,
    currentSceneTitle: item.currentSceneTitle,
    lastActivityAt: item.lastActivityAt,
    nextSessionAt: item.session.nextSessionAt,
  };
}
