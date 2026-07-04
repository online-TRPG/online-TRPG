import type {
  ActionAcceptedResponseDto,
  ApplyCampaignCalendarActionDto,
  CampaignArchiveResponseDto,
  CharacterTransferResponseDto,
  CharacterVaultItemDto,
  CompleteCampaignDto,
  GmMode,
  MainCommandResponseDto,
  RequestCharacterTransferDto,
  ResolveMainCommandCheckDto,
  RestActionDto,
  SessionDetailResponseDto,
  SessionListItemResponseDto,
  SessionParticipantResponseDto,
  SessionSnapshotDto,
  SubmitActionDto,
  SubmitMainCommandDto,
  TurnLogListResponseDto,
  UseInventoryItemDto,
  UseInventoryItemResponseDto,
} from '@trpg/shared-types';
import type {
  AvailableSessionListItem,
  SessionDetail,
  SessionSnapshot,
  StoredUser,
} from '../types/session';
import { normalizeSessionDetail, normalizeSessionSnapshot } from '../types/session';
import { requestJson } from './httpClient';
import { DEFAULT_SCENARIO_ID } from './scenarioApi';

const DEFAULT_RULE_SET_ID = 'dnd5e';

interface PaginatedList<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
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
  });
}

export function listCharacterVault(
  user: StoredUser,
  accessToken?: string | null
): Promise<CharacterVaultItemDto[]> {
  return requestJson<CharacterVaultItemDto[]>('/sessions/characters/vault', {
    user,
    accessToken,
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
    }
  );
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
    }
  );

  return normalizeSessionSnapshot(snapshot);
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

function toGmMode(value: 'ai' | 'human' | undefined): GmMode {
  return (value === 'human' ? 'HUMAN' : 'AI') as GmMode;
}
