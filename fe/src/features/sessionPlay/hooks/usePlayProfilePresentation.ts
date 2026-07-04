import { useCallback } from 'react';
import type { VttMapStateDto } from '@trpg/shared-types';
import type { Character, Participant, Session } from '../../../types/session';
import type { SessionTokenColor } from '../../../utils/sessionTokenColors';
import {
  getCharacterTokenColor as getCharacterTokenColorModel,
  getLogProfileColor as getLogProfileColorModel,
  getLogProfileImage as getLogProfileImageModel,
  getParticipantBadge as getParticipantBadgeModel,
  getParticipantLinkedCharacter as getParticipantLinkedCharacterModel,
  getParticipantProfileColor as getParticipantProfileColorModel,
} from '../utils/playPageProfilePresentation';

type VisibleTargetLike = {
  id: string;
  name?: string | null;
};

type UsePlayProfilePresentationParams = {
  session: Session | null;
  isHumanGmSession: boolean;
  gmUserId: string | null;
  participants: Participant[];
  sessionCharacters: Character[];
  playerParticipantIds: string[];
  map: VttMapStateDto | null;
  visibleTargets: VisibleTargetLike[];
  gmProfileImage: string;
};

export function usePlayProfilePresentation(params: UsePlayProfilePresentationParams) {
  const {
    session,
    isHumanGmSession,
    gmUserId,
    participants,
    sessionCharacters,
    playerParticipantIds,
    map,
    visibleTargets,
    gmProfileImage,
  } = params;

  const getParticipantBadge = useCallback(
    (participantUserId: string): string | null =>
      getParticipantBadgeModel({
        participantUserId,
        session,
        isHumanGmSession,
        gmUserId,
      }),
    [gmUserId, isHumanGmSession, session],
  );

  const getCharacterTokenColor = useCallback(
    (character: Character): SessionTokenColor =>
      getCharacterTokenColorModel(character, sessionCharacters),
    [sessionCharacters],
  );

  const getParticipantLinkedCharacter = useCallback(
    (participant: Participant | null): Character | null =>
      getParticipantLinkedCharacterModel(participant, sessionCharacters),
    [sessionCharacters],
  );

  const getParticipantProfileColor = useCallback(
    (participant: Participant | null): SessionTokenColor =>
      getParticipantProfileColorModel({
        participant,
        sessionCharacters,
        playerParticipantIds,
      }),
    [playerParticipantIds, sessionCharacters],
  );

  const getLogProfileColor = useCallback(
    (title: string, logTone?: string | null): SessionTokenColor =>
      getLogProfileColorModel({
        title,
        logTone,
        participants,
        sessionCharacters,
        playerParticipantIds,
      }),
    [participants, playerParticipantIds, sessionCharacters],
  );

  const getLogProfileImage = useCallback(
    (
      title: string,
      logTone?: string | null,
      speakerName?: string | null,
      targetId?: string | null,
    ): string | null =>
      getLogProfileImageModel({
        title,
        logTone,
        speakerName,
        targetId,
        participants,
        sessionCharacters,
        map,
        visibleTargets,
        gmProfileImage,
      }),
    [gmProfileImage, map, participants, sessionCharacters, visibleTargets],
  );

  return {
    getParticipantBadge,
    getCharacterTokenColor,
    getParticipantLinkedCharacter,
    getParticipantProfileColor,
    getLogProfileColor,
    getLogProfileImage,
  };
}
