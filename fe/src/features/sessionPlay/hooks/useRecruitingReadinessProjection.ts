import type { Character, Participant } from '../../../types/session';

type UseRecruitingReadinessProjectionParams = {
  participants: Participant[];
  myParticipant: Participant | null;
  sessionExists: boolean;
  isRecruiting: boolean;
  isGmUser: boolean;
  canControlSession: boolean;
  sessionCharacters: Character[];
  isCharacterLevelAllowed: (character: Character) => boolean;
};

export function useRecruitingReadinessProjection(
  params: UseRecruitingReadinessProjectionParams,
) {
  const {
    participants,
    myParticipant,
    sessionExists,
    isRecruiting,
    isGmUser,
    canControlSession,
    sessionCharacters,
    isCharacterLevelAllowed,
  } = params;

  const playerParticipants = participants.filter((participant) => participant.role !== 'GM');
  const readyLocked = Boolean(myParticipant?.isReady);
  const readyParticipantCount = playerParticipants.filter(
    (participant) => participant.isReady,
  ).length;
  const participantCount = playerParticipants.length;
  const allPlayersReady =
    participantCount > 0 && readyParticipantCount === participantCount;
  const canShowCharacterSelection = Boolean(sessionExists && isRecruiting && !isGmUser);
  const canStartSession = Boolean(
    canControlSession &&
      isRecruiting &&
      allPlayersReady &&
      playerParticipants.length > 0 &&
      sessionCharacters.every((character) => isCharacterLevelAllowed(character)),
  );

  return {
    playerParticipants,
    readyLocked,
    readyParticipantCount,
    participantCount,
    allPlayersReady,
    canShowCharacterSelection,
    canStartSession,
  };
}
