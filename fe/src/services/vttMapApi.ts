import type {
  CreateVttMapPingDto,
  MoveSessionTokenDto,
  UpdateVttMapDto,
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import type { StoredUser } from '../types/session';
import {
  decodeVttMapInteractionResponse,
  decodeVttMapState,
} from '@trpg/shared-types/frontend';
import { requestJson } from './httpClient';

export function getVttMap(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<VttMapStateDto> {
  return requestJson<VttMapStateDto>(`/sessions/${sessionId}/map`, {
    user,
    accessToken,
    decode: decodeVttMapState,
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
    decode: decodeVttMapState,
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
    decode: decodeVttMapState,
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
    decode: decodeVttMapState,
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
    decode: decodeVttMapState,
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
    decode: decodeVttMapInteractionResponse,
  });
}
