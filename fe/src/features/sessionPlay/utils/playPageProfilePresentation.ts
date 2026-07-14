import type { VttMapStateDto } from '@trpg/shared-types';
import type { Character, Participant } from '../../../types/session';
import {
  GM_TOKEN_COLOR,
  NPC_TOKEN_COLOR,
  getPlayerTokenColor,
  type SessionTokenColor,
} from '../../../utils/sessionTokenColors';
import { getCharacterImage } from './characterVisuals';
import {
  isSessionLogProfile,
  isSimilarNpcSpeakerName,
  normalizeNpcSpeakerKey,
} from './sessionLogPresentation';

type VisibleTargetLike = {
  id: string;
  name?: string | null;
};

export function getParticipantBadge(params: {
  participantUserId: string;
  session: { hostUserId: string } | null;
  isHumanGmSession: boolean;
  gmUserId: string | null;
}): string | null {
  if (!params.session) return null;
  if (params.isHumanGmSession && params.participantUserId === params.gmUserId) return 'GM';
  if (params.participantUserId === params.session.hostUserId) return '세션 관리자';
  return null;
}

export function getCharacterTokenColor(
  character: Character,
  sessionCharacters: Character[],
): SessionTokenColor {
  const characterIndex = sessionCharacters.findIndex((item) => item.id === character.id);
  return getPlayerTokenColor(characterIndex);
}

export function getParticipantLinkedCharacter(
  participant: Participant | null,
  sessionCharacters: Character[],
): Character | null {
  if (!participant) return null;

  return (
    (participant.sessionCharacterId
      ? sessionCharacters.find((character) => character.id === participant.sessionCharacterId)
      : null) ??
    (participant.characterId
      ? sessionCharacters.find((character) => character.characterId === participant.characterId)
      : null) ??
    sessionCharacters.find((character) => character.userId === participant.userId) ??
    null
  );
}

export function getParticipantProfileColor(params: {
  participant: Participant | null;
  sessionCharacters: Character[];
  playerParticipantIds: string[];
}): SessionTokenColor {
  if (!params.participant) return getPlayerTokenColor(-1);
  const linkedCharacter = getParticipantLinkedCharacter(params.participant, params.sessionCharacters);

  if (linkedCharacter) {
    return getCharacterTokenColor(linkedCharacter, params.sessionCharacters);
  }

  const playerIndex = params.playerParticipantIds.indexOf(params.participant.userId);
  return getPlayerTokenColor(playerIndex);
}

export function getLogParticipant(
  title: string,
  participants: Participant[],
  sessionCharacters: Character[],
): Participant | undefined {
  return participants.find((participant) => {
    if (participant.user.displayName === title) return true;

    const linkedCharacter = getParticipantLinkedCharacter(participant, sessionCharacters);
    return linkedCharacter?.name === title;
  });
}

export function getLogProfileColor(params: {
  title: string;
  logTone?: string | null;
  participants: Participant[];
  sessionCharacters: Character[];
  playerParticipantIds: string[];
}): SessionTokenColor {
  if (params.logTone === 'npc-dialogue') return NPC_TOKEN_COLOR;
  if (isSessionLogProfile(params.title, params.logTone)) return GM_TOKEN_COLOR;

  const matchedParticipant = getLogParticipant(params.title, params.participants, params.sessionCharacters);

  return matchedParticipant
    ? getParticipantProfileColor({
        participant: matchedParticipant,
        sessionCharacters: params.sessionCharacters,
        playerParticipantIds: params.playerParticipantIds,
      })
    : getPlayerTokenColor(0);
}

export function findNpcTokenByName(params: {
  speakerName?: string | null;
  targetId?: string | null;
  map: VttMapStateDto | null;
  visibleTargets: VisibleTargetLike[];
}): VttMapStateDto['tokens'][number] | null {
  const normalizedSpeakerName = normalizeNpcSpeakerKey(params.speakerName);
  if ((!normalizedSpeakerName && !params.targetId) || !params.map?.tokens.length) return null;

  const npcLikeTokens = params.map.tokens.filter((token) => !token.sessionCharacterId);
  const visibleTarget =
    params.visibleTargets.find((target) => target.id === params.targetId) ??
    params.visibleTargets.find((target) => isSimilarNpcSpeakerName(target.name, normalizedSpeakerName));

  return (
    (params.targetId
      ? npcLikeTokens.find((token) => (token.npcId === params.targetId || token.id === params.targetId) && token.imageUrl)
      : null) ??
    (params.targetId ? npcLikeTokens.find((token) => token.npcId === params.targetId || token.id === params.targetId) : null) ??
    (visibleTarget ? npcLikeTokens.find((token) => token.npcId === visibleTarget.id && token.imageUrl) : null) ??
    (visibleTarget ? npcLikeTokens.find((token) => token.npcId === visibleTarget.id) : null) ??
    npcLikeTokens.find((token) => token.imageUrl && isSimilarNpcSpeakerName(token.name, normalizedSpeakerName)) ??
    npcLikeTokens.find((token) => isSimilarNpcSpeakerName(token.name, normalizedSpeakerName)) ??
    null
  );
}

export function getLogProfileImage(params: {
  title: string;
  logTone?: string | null;
  speakerName?: string | null;
  targetId?: string | null;
  participants: Participant[];
  sessionCharacters: Character[];
  map: VttMapStateDto | null;
  visibleTargets: VisibleTargetLike[];
  gmProfileImage: string;
}): string | null {
  if (params.logTone === 'npc-dialogue') {
    return findNpcTokenByName({
      speakerName: params.speakerName,
      targetId: params.targetId,
      map: params.map,
      visibleTargets: params.visibleTargets,
    })?.imageUrl?.trim() || null;
  }

  if (isSessionLogProfile(params.title, params.logTone)) return params.gmProfileImage;

  const matchedParticipant = getLogParticipant(params.title, params.participants, params.sessionCharacters);
  if (!matchedParticipant) return null;

  const linkedCharacter =
    params.sessionCharacters.find((character) => character.userId === matchedParticipant.userId) ?? null;

  return linkedCharacter ? getCharacterImage(linkedCharacter) : null;
}
