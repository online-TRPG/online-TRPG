import { useMemo } from 'react';
import type { Participant } from '../../../types/session';

type UseCurrentUserParticipantProjectionParams = {
  participants: Participant[];
  userId: string;
};

export function useCurrentUserParticipantProjection({
  participants,
  userId,
}: UseCurrentUserParticipantProjectionParams) {
  const myParticipant = useMemo(
    () => participants.find((participant) => participant.userId === userId) ?? null,
    [participants, userId],
  );
  const serverSelectedCharacterId = myParticipant?.characterId ?? null;
  const participantActorSource = {
    participantSessionCharacterId: myParticipant?.sessionCharacterId,
    participantCharacterId: myParticipant?.characterId,
  };
  const actorSessionCharacterId =
    myParticipant?.sessionCharacterId ?? myParticipant?.characterId ?? null;

  return {
    myParticipant,
    serverSelectedCharacterId,
    participantActorSource,
    actorSessionCharacterId,
  };
}
