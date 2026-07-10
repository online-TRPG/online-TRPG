import type {
  AppealScenarioModerationDto,
  ApplyScenarioModerationActionDto,
  CreateScenarioDto,
  CreateScenarioReviewDto,
  ForkScenarioDto,
  PlayerScenarioViewDto,
  PublishScenarioDto,
  ReportScenarioDto,
  ScenarioAssetKind,
  ScenarioAssetResponseDto,
  ScenarioCollaborationStateResponseDto,
  ScenarioModerationActionResponseDto,
  ScenarioModerationAppealResponseDto,
  ScenarioModerationQueueItemDto,
  ScenarioModerationReportResponseDto,
  ScenarioQueryDto,
  ScenarioResponseDto,
  UpdateScenarioDto,
  UploadScenarioAssetDto,
  UploadScenarioNodeImageDto,
  UpsertScenarioCollaboratorDto,
} from '@trpg/shared-types';
import {
  decodePlayerScenarioView,
  decodeScenarioAssetResponse,
  decodeScenarioAssetResponseArray,
  decodeScenarioCollaborationState,
  decodeScenarioModerationActionResponse,
  decodeScenarioModerationAppealResponse,
  decodeScenarioModerationQueueItemArray,
  decodeScenarioModerationReportResponse,
  decodeScenarioNodeImageUploadResponse,
  decodeScenarioResponse,
  decodeScenarioSummaryArray,
} from '@trpg/shared-types/frontend';
import type { PlayerScenarioView, Scenario, ScenarioDetail, StoredUser } from '../types/session';
import { requestJson } from './httpClient';

export const DEFAULT_SCENARIO_ID = 'scenario_goblin_cave';

export function listScenarios(
  query?: ScenarioQueryDto,
  user?: StoredUser | null,
  accessToken?: string | null,
): Promise<Scenario[]> {
  const params = new URLSearchParams();
  if (query?.search?.trim()) params.set('search', query.search.trim());
  if (query?.minLevel !== undefined) params.set('minLevel', String(query.minLevel));
  if (query?.maxLevel !== undefined) params.set('maxLevel', String(query.maxLevel));
  if (query?.tag?.trim()) params.set('tag', query.tag.trim());
  if (query?.sort) params.set('sort', query.sort);
  if (query?.gmMode) params.set('gmMode', query.gmMode);
  if (query?.limit !== undefined) params.set('limit', String(query.limit));
  if (query?.offset !== undefined) params.set('offset', String(query.offset));
  const search = params.toString();
  return requestJson<Scenario[]>(`/scenarios${search ? `?${search}` : ''}`, {
    user,
    accessToken,
    decode: decodeScenarioSummaryArray,
  });
}

export async function listAvailableScenarios(
  user: StoredUser,
  accessToken?: string | null
): Promise<Scenario[]> {
  const [allScenarios, myScenarios] = await Promise.all([
    listScenarios(undefined, user, accessToken),
    listMyScenarios(user, accessToken),
  ]);
  const publicPlayableScenarios = allScenarios.filter(
    (scenario) =>
      isProvidedScenarioForSelection(scenario) ||
      isPublicScenarioRevisionForSelection(scenario),
  );
  const seenScenarioIds = new Set<string>();

  return [...publicPlayableScenarios, ...myScenarios].filter((scenario) => {
    if (seenScenarioIds.has(scenario.id)) return false;
    seenScenarioIds.add(scenario.id);
    return true;
  });
}

export function getScenario(
  scenarioId: string,
  user?: StoredUser | null,
  accessToken?: string | null
): Promise<ScenarioDetail> {
  return requestJson<ScenarioResponseDto>(`/scenarios/${scenarioId}`, {
    user,
    accessToken,
    decode: decodeScenarioResponse,
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
    decode: decodePlayerScenarioView,
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
    decode: decodeScenarioSummaryArray,
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
    decode: decodeScenarioResponse,
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
    decode: decodeScenarioResponse,
  });
}

export function publishScenario(
  user: StoredUser,
  scenarioId: string,
  payload: PublishScenarioDto = {},
  accessToken?: string | null
): Promise<ScenarioDetail> {
  return requestJson<ScenarioResponseDto>(`/scenarios/${scenarioId}/publish`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
    decode: decodeScenarioResponse,
  });
}

export function unpublishScenarioRevision(
  user: StoredUser,
  scenarioId: string,
  accessToken?: string | null
): Promise<ScenarioDetail> {
  return requestJson<ScenarioResponseDto>(`/scenarios/${scenarioId}/unpublish`, {
    method: 'POST',
    user,
    accessToken,
    decode: decodeScenarioResponse,
  });
}

export function getScenarioCollaborationState(
  user: StoredUser,
  scenarioId: string,
  accessToken?: string | null
): Promise<ScenarioCollaborationStateResponseDto> {
  return requestJson<ScenarioCollaborationStateResponseDto>(`/scenarios/${scenarioId}/collaboration`, {
    user,
    accessToken,
    decode: decodeScenarioCollaborationState,
  });
}

export function upsertScenarioCollaborator(
  user: StoredUser,
  scenarioId: string,
  payload: UpsertScenarioCollaboratorDto,
  accessToken?: string | null
): Promise<ScenarioCollaborationStateResponseDto> {
  return requestJson<ScenarioCollaborationStateResponseDto>(`/scenarios/${scenarioId}/collaborators`, {
    method: 'PUT',
    user,
    accessToken,
    body: payload,
    decode: decodeScenarioCollaborationState,
  });
}

export function removeScenarioCollaborator(
  user: StoredUser,
  scenarioId: string,
  collaboratorUserId: string,
  accessToken?: string | null
): Promise<ScenarioCollaborationStateResponseDto> {
  return requestJson<ScenarioCollaborationStateResponseDto>(
    `/scenarios/${scenarioId}/collaborators/${encodeURIComponent(collaboratorUserId)}`,
    {
      method: 'DELETE',
      user,
      accessToken,
      decode: decodeScenarioCollaborationState,
    }
  );
}

export function createScenarioReview(
  user: StoredUser,
  scenarioId: string,
  payload: CreateScenarioReviewDto,
  accessToken?: string | null
): Promise<ScenarioCollaborationStateResponseDto> {
  return requestJson<ScenarioCollaborationStateResponseDto>(`/scenarios/${scenarioId}/reviews`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
    decode: decodeScenarioCollaborationState,
  });
}

export function reportScenario(
  user: StoredUser,
  scenarioId: string,
  payload: ReportScenarioDto,
  accessToken?: string | null
): Promise<ScenarioModerationReportResponseDto> {
  return requestJson<ScenarioModerationReportResponseDto>(`/scenarios/${scenarioId}/report`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
    decode: decodeScenarioModerationReportResponse,
  });
}

export function appealScenarioModeration(
  user: StoredUser,
  scenarioId: string,
  payload: AppealScenarioModerationDto,
  accessToken?: string | null
): Promise<ScenarioModerationAppealResponseDto> {
  return requestJson<ScenarioModerationAppealResponseDto>(
    `/scenarios/${scenarioId}/moderation-appeals`,
    {
      method: 'POST',
      user,
      accessToken,
      body: payload,
      decode: decodeScenarioModerationAppealResponse,
    }
  );
}

export function listScenarioModerationQueue(
  user: StoredUser,
  accessToken?: string | null
): Promise<ScenarioModerationQueueItemDto[]> {
  return requestJson<ScenarioModerationQueueItemDto[]>('/scenarios/moderation/queue', {
    user,
    accessToken,
    decode: decodeScenarioModerationQueueItemArray,
  });
}

export function applyScenarioModerationAction(
  user: StoredUser,
  scenarioId: string,
  payload: ApplyScenarioModerationActionDto,
  accessToken?: string | null
): Promise<ScenarioModerationActionResponseDto> {
  return requestJson<ScenarioModerationActionResponseDto>(`/scenarios/${scenarioId}/moderation/actions`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
    decode: decodeScenarioModerationActionResponse,
  });
}

export function forkScenario(
  user: StoredUser,
  scenarioId: string,
  payload: ForkScenarioDto = {},
  accessToken?: string | null
): Promise<ScenarioDetail> {
  return requestJson<ScenarioResponseDto>(`/scenarios/${scenarioId}/fork`, {
    method: 'POST',
    user,
    accessToken,
    body: payload,
    decode: decodeScenarioResponse,
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
    decode: decodeScenarioNodeImageUploadResponse,
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
    decode: decodeScenarioAssetResponseArray,
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
    decode: decodeScenarioAssetResponse,
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

function isProvidedScenarioForSelection(scenario: Scenario): boolean {
  return scenario.sourceType === 'SYSTEM' || scenario.id === DEFAULT_SCENARIO_ID;
}

function isPublicScenarioRevisionForSelection(scenario: Scenario): boolean {
  return (
    scenario.sourceType === 'CLONED' &&
    (scenario.publishStatus === 'public' || scenario.publishStatus === 'link')
  );
}
