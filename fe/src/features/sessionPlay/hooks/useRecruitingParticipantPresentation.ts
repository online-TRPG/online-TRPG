import { useMemo } from 'react';
import type { Participant } from '../../../types/session';
import {
  getDisplayedParticipantSlots,
  getPlayerParticipantIds,
} from '../utils/recruitingPresentation';

type UseRecruitingParticipantPresentationParams = {
  participants: Participant[];
};

export function useRecruitingParticipantPresentation(
  params: UseRecruitingParticipantPresentationParams,
) {
  const { participants } = params;

  const displayedParticipants = useMemo(
    () => getDisplayedParticipantSlots(participants),
    [participants],
  );

  const playerParticipantIds = useMemo(
    () => getPlayerParticipantIds(participants),
    [participants],
  );

  return {
    displayedParticipants,
    playerParticipantIds,
  };
}
