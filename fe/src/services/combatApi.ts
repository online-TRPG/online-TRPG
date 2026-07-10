import type {
  ApplyCombatDamageDto,
  AutoMonsterTurnDto,
  CastCombatSpellDto,
  CombatActionResultDto,
  CombatActorActionDto,
  CombatBasicActionDto,
  CombatMoveResultDto,
  CombatReactionResponseDto,
  CombatResponseDto,
  EndTurnDto,
  EquippedWeaponAttackDto,
  ForceMoveCombatParticipantDto,
  MoveCombatParticipantDto,
  ResolveCombatAttackDto,
  StartCombatDto,
  TurnAdvanceResponseDto,
} from '@trpg/shared-types';
import type { StoredUser } from '../types/session';
import {
  decodeCombatActionResult,
  decodeCombatMoveResult,
  decodeCombatResponse,
  decodeTurnAdvanceResponse,
} from '@trpg/shared-types/frontend';
import { requestJson } from './httpClient';

export function getCombat(
  user: StoredUser,
  sessionId: string,
  accessToken?: string | null
): Promise<CombatResponseDto> {
  return requestJson<CombatResponseDto>(`/sessions/${sessionId}/combat`, {
    user,
    accessToken,
    decode: decodeCombatResponse,
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
    decode: decodeCombatResponse,
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
    decode: decodeCombatResponse,
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
    decode: decodeTurnAdvanceResponse,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatActionResult,
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
    decode: decodeCombatMoveResult,
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
    decode: decodeCombatMoveResult,
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
    decode: decodeCombatMoveResult,
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
    decode: decodeCombatMoveResult,
  });
}
