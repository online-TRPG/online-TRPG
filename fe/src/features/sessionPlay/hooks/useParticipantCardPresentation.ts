import { useCallback } from 'react';
import { isJoinedParticipantStatus } from '@trpg/shared-types/frontend';
import type { Character, Participant } from '../../../types/session';
import type { SessionTokenColor } from '../../../utils/sessionTokenColors';
import {
  getCharacterClassLabel,
  getCharacterImage,
} from '../utils/characterVisuals';
import { buildProfileColorStyle } from '../utils/playPagePresentation';

type UseParticipantCardPresentationParams = {
  isHumanGmSession: boolean;
  isRecruiting: boolean;
  isHost: boolean;
  gmUserId: string | null;
  currentUserId: string;
  getParticipantBadge: (userId: string) => string | null;
  getParticipantLinkedCharacter: (participant: Participant) => Character | null;
  getParticipantProfileColor: (participant: Participant | null) => SessionTokenColor;
};

export function getEmptyParticipantSlotPresentation(index: number, isRecruiting: boolean) {
  return {
    className: `participant-strip-card placeholder${
      isRecruiting ? ' recruiting-party-slot empty' : ''
    }`,
    emptySlotAlt: `빈 파티 슬롯 ${index + 1}`,
    title: '빈 슬롯',
    description: '참가자를 기다리는 중입니다.',
    stateLabel: '대기',
    indexLabel: `${index + 1}`,
  };
}

export function useParticipantCardPresentation({
  isHumanGmSession,
  isRecruiting,
  isHost,
  gmUserId,
  currentUserId,
  getParticipantBadge,
  getParticipantLinkedCharacter,
  getParticipantProfileColor,
}: UseParticipantCardPresentationParams) {
  return useCallback(
    (participant: Participant) => {
      const linkedCharacter = getParticipantLinkedCharacter(participant);
      const badgeLabel = getParticipantBadge(participant.userId);
      const isParticipantGm =
        isHumanGmSession && participant.userId === gmUserId;
      const canAssignHumanGm =
        isHumanGmSession &&
        isRecruiting &&
        isHost &&
        !isParticipantGm &&
        isJoinedParticipantStatus(participant.status);
      const stateLabel = isParticipantGm
        ? 'GM'
        : participant.isReady
          ? 'READY'
          : participant.connectionStatus;
      const recruitingStatusLabel = isParticipantGm
        ? 'GM 진행자'
        : participant.isReady
          ? '준비완료'
          : '정비 중';
      const participantName = linkedCharacter?.name ?? participant.user.displayName;
      const participantImage = linkedCharacter
        ? getCharacterImage(linkedCharacter)
        : null;
      const participantDescription = linkedCharacter
        ? `${linkedCharacter.name} / ${getCharacterClassLabel(linkedCharacter.className)}`
        : participant.userId === currentUserId
          ? '캐릭터가 선택되지 않았습니다'
          : '캐릭터를 기다리는 중입니다';

      return {
        cardClassName: `participant-strip-card${
          isRecruiting ? ' recruiting-party-slot occupied' : ''
        }`,
        badgeLabel,
        canAssignHumanGm,
        assignHumanGmLabel: 'GM 지정',
        stateLabel,
        participantStateClassName: `participant-state${participant.isReady ? ' ready' : ''}`,
        recruitingStatusLabel,
        recruitingStatusClassName: `recruiting-party-slot-status${
          participant.isReady || isParticipantGm ? ' ready' : ''
        }`,
        participantName,
        participantImage,
        participantDescription,
        fallbackInitial: participantName.slice(0, 1),
        profileStyle: buildProfileColorStyle(getParticipantProfileColor(participant)),
      };
    },
    [
      currentUserId,
      getParticipantBadge,
      getParticipantLinkedCharacter,
      getParticipantProfileColor,
      gmUserId,
      isHost,
      isHumanGmSession,
      isRecruiting,
    ],
  );
}
