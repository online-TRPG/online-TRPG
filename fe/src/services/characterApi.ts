import type {
  CharacterAvatarAssetResponseDto,
  CharacterResponseDto,
  LevelUpCharacterDto,
  SessionParticipantResponseDto,
  UpdateCharacterEquipmentDto,
  UpdatePreparedSpellsDto,
  UploadCharacterAvatarDto,
} from '@trpg/shared-types';
import {
  decodeCharacterAvatarAssetResponse,
  decodeCharacterAvatarAssetResponseArray,
  decodeCharacterResponse,
  decodeCharacterResponseArray,
  decodeSessionParticipant,
} from '@trpg/shared-types/frontend';
import type { Character, SessionSnapshot, StoredUser } from '../types/session';
import { requestJson } from './httpClient';
import { getSession } from './sessionApi';

export interface CharacterMutationPayload {
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
    decode: decodeCharacterResponse,
  }).then((character) => {
    const sessionId = payload.sessionId;
    if (!sessionId || payload.assignToSession !== true) {
      return null;
    }

    return requestJson<SessionParticipantResponseDto>(`/sessions/${sessionId}/character-selection`, {
      method: 'POST',
      user,
      accessToken,
      body: { characterId: character.id },
      decode: decodeSessionParticipant,
    }).then(() => getSession(user, sessionId, accessToken));
  });
}

export function listMyCharacters(
  user: StoredUser,
  accessToken?: string | null
): Promise<CharacterResponseDto[]> {
  return requestJson<CharacterResponseDto[]>('/users/me/characters', {
    user,
    accessToken,
    decode: decodeCharacterResponseArray,
  });
}

export function listCharacterAvatarAssets(
  user: StoredUser,
  accessToken?: string | null
): Promise<CharacterAvatarAssetResponseDto[]> {
  return requestJson<CharacterAvatarAssetResponseDto[]>('/characters/avatar-assets', {
    user,
    accessToken,
    decode: decodeCharacterAvatarAssetResponseArray,
  });
}

export function uploadCharacterAvatarAsset(
  user: StoredUser,
  payload: UploadCharacterAvatarDto,
  accessToken?: string | null
): Promise<CharacterAvatarAssetResponseDto> {
  return requestJson<CharacterAvatarAssetResponseDto>('/characters/avatar-assets', {
    method: 'POST',
    user,
    accessToken,
    body: payload,
    decode: decodeCharacterAvatarAssetResponse,
  });
}

export function deleteCharacterAvatarAsset(
  user: StoredUser,
  assetId: string,
  accessToken?: string | null
): Promise<void> {
  return requestJson<void>(`/characters/avatar-assets/${assetId}`, {
    method: 'DELETE',
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
    decode: decodeCharacterResponse,
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
    decode: decodeCharacterResponse,
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
    decode: decodeCharacterResponse,
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
    decode: decodeCharacterResponse,
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
    decode: decodeCharacterResponse,
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
    decode: decodeSessionParticipant,
  });
}
