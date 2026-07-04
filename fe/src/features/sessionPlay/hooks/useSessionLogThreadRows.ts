import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { SessionTokenColor } from '../../../utils/sessionTokenColors';
import { buildProfileColorStyle, getAvatarLabel } from '../utils/playPagePresentation';
import type { MainLogTone, RenderedSessionLogRow } from '../utils/sessionLogPresentation';

type RestApprovalLike = NonNullable<RenderedSessionLogRow['metadata']>['restApproval'];

type UseSessionLogThreadRowsParams = {
  rows: RenderedSessionLogRow[];
  userDisplayName: string;
  isGmUser: boolean;
  gmProfileImage: string;
  isRestRequestResolved: (actionId: string) => boolean;
  getLogProfileColor: (title: string, tone: MainLogTone | null) => SessionTokenColor;
  getLogProfileImage: (
    title: string,
    tone: MainLogTone | null,
    speakerName?: string | null,
    targetId?: string | null,
  ) => string | null;
};

export type SessionLogThreadRow = RenderedSessionLogRow & {
  rowClassName: string;
  chatColorStyle?: CSSProperties;
  chatProfileImage: string | null;
  chatAvatarClassName: string;
  chatAvatarAlt: string;
  chatAvatarLabel: string;
  senderClassName: string;
  bubbleClassName: string;
  restApprovalActionId: string | null;
  canApproveRestRequest: boolean;
  approveRestLabel: string;
  rejectRestLabel: string;
};

export const emptySessionLogMessage = '아직 기록된 메시지가 없습니다.';

export function useSessionLogThreadRows({
  rows,
  userDisplayName,
  isGmUser,
  gmProfileImage,
  isRestRequestResolved,
  getLogProfileColor,
  getLogProfileImage,
}: UseSessionLogThreadRowsParams): SessionLogThreadRow[] {
  return useMemo(
    () =>
      rows.map((row) => {
        const chatColorStyle =
          row.rowClass === 'notice'
            ? undefined
            : buildProfileColorStyle(getLogProfileColor(row.title, row.logTone));
        const chatProfileImage =
          row.rowClass === 'notice'
            ? null
            : getLogProfileImage(
                row.title,
                row.logTone,
                row.speakerName,
                row.metadata?.mainCommand?.targetId,
              );
        const restApproval = row.metadata?.restApproval;
        const canApproveRestRequest = Boolean(
          isGmUser &&
            restApproval?.actionId &&
            restApproval.status === 'gm_required' &&
            !isRestRequestResolved(restApproval.actionId),
        );

        return {
          ...row,
          rowClassName: `chat-thread-row ${row.rowClass}${
            row.logTone ? ` main-log-${row.logTone}` : ''
          }`,
          chatColorStyle,
          chatProfileImage,
          chatAvatarClassName: `chat-thread-avatar${chatProfileImage ? ' has-image' : ''}${
            chatProfileImage === gmProfileImage ? ' dragon-profile' : ''
          }`,
          chatAvatarAlt: `${row.senderLabel} 프로필`,
          chatAvatarLabel: getAvatarLabel(row.senderLabel, userDisplayName),
          senderClassName: `chat-thread-sender ${row.rowClass}`,
          bubbleClassName: `chat-thread-bubble${row.isPendingAction ? ' pending' : ''}`,
          restApprovalActionId: restApproval?.actionId ?? null,
          canApproveRestRequest,
          approveRestLabel: '휴식 승인',
          rejectRestLabel: '휴식 거절',
        };
      }),
    [
      getLogProfileColor,
      getLogProfileImage,
      gmProfileImage,
      isGmUser,
      isRestRequestResolved,
      rows,
      userDisplayName,
    ],
  );
}
