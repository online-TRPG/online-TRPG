import type {
  AcceptHumanGmAiAssistSuggestionDto,
  AdjustHumanGmCombatHpDto,
  AiHumanGmAssistSuggestionRequestDto,
  ApplyHumanGmCombatConditionDto,
  ApplySessionEconomyActionDto,
  CreateHumanGmAiAssistSuggestionDto,
  GrantHumanGmInventoryItemDto,
  HumanGmAiAssistSuggestionDto,
  HumanGmMessageDto,
  HumanGmNodeMoveOptionDto,
  HumanGmPrivateNoteDto,
  RemoveHumanGmInventoryItemDto,
  ReportHumanGmAiAssistApplicationFailureDto,
  SessionSnapshotDto,
  SetHumanGmDifficultyClassDto,
  UpdateSessionNodeDto,
} from '@trpg/shared-types';
import type {
  SessionSnapshot,
  StoredUser,
} from '../types/session';
import { normalizeSessionSnapshot } from '../types/session';
import { requestJson } from './httpClient';

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

export async function applyHumanGmEconomyAction(
  user: StoredUser,
  sessionId: string,
  payload: ApplySessionEconomyActionDto,
  accessToken?: string | null
): Promise<SessionSnapshot> {
  const snapshot = await requestJson<SessionSnapshotDto>(
    `/sessions/${sessionId}/gm/economy`,
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
