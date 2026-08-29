import {
  GamePhase,
  GmMode,
  ParticipantRole,
  SessionCharacterStatus,
  SessionActivityStatus,
  SessionStatus,
  SessionVisibility,
} from '@trpg/shared-types/frontend';

export const sessionStatusLabels = {
  [SessionStatus.RECRUITING]: '모집 중',
  [SessionStatus.PLAYING]: '진행 중',
  [SessionStatus.PAUSED]: '대기 중',
  [SessionStatus.COMPLETED]: '완료',
  [SessionStatus.DISBANDED]: '해산',
} satisfies Record<SessionStatus, string>;

export const sessionActivityStatusLabels = {
  [SessionActivityStatus.DORMANT]: '대기 중',
  [SessionActivityStatus.LOBBY_OPEN]: '입장 가능',
  [SessionActivityStatus.PLAYING]: '진행 중',
  [SessionActivityStatus.COMPLETED]: '세션 완료',
  [SessionActivityStatus.DISBANDED]: '세션 종료',
} satisfies Record<SessionActivityStatus, string>;

export const gamePhaseLabels = {
  [GamePhase.LOBBY]: '입장 준비',
  [GamePhase.EXPLORATION]: '탐험',
  [GamePhase.COMBAT]: '전투',
  [GamePhase.DIALOGUE]: '대화',
  [GamePhase.REST]: '휴식',
} satisfies Record<GamePhase, string>;

export const sessionVisibilityLabels = {
  [SessionVisibility.PUBLIC]: '공개',
  [SessionVisibility.PRIVATE]: '비공개',
} satisfies Record<SessionVisibility, string>;

export const gmModeLabels = {
  [GmMode.AI]: 'AI GM',
  [GmMode.HUMAN]: '사람 GM',
} satisfies Record<GmMode, string>;

export const participantRoleLabels = {
  [ParticipantRole.HOST]: '세션 관리자',
  [ParticipantRole.GM]: 'GM',
  [ParticipantRole.PLAYER]: '플레이어',
  [ParticipantRole.SPECTATOR]: '관전자',
} satisfies Record<ParticipantRole, string>;

export const sessionCharacterStatusLabels = {
  [SessionCharacterStatus.ACTIVE]: '활동 중',
  [SessionCharacterStatus.RETIRED]: '은퇴',
  [SessionCharacterStatus.DEAD]: '사망',
  [SessionCharacterStatus.LEFT]: '세션에서 떠남',
} satisfies Record<SessionCharacterStatus, string>;

function readLabel<T extends string>(labels: Record<T, string>, value: string | null | undefined): string {
  return value && Object.prototype.hasOwnProperty.call(labels, value)
    ? labels[value as T]
    : '알 수 없음';
}

export const getSessionStatusLabel = (value: string | null | undefined) =>
  readLabel(sessionStatusLabels, value);
export const getSessionActivityStatusLabel = (value: string | null | undefined) =>
  readLabel(sessionActivityStatusLabels, value);
export const getGamePhaseLabel = (value: string | null | undefined) =>
  readLabel(gamePhaseLabels, value);
export const getSessionVisibilityLabel = (value: string | null | undefined) =>
  readLabel(sessionVisibilityLabels, value);
export const getGmModeLabel = (value: string | null | undefined) =>
  readLabel(gmModeLabels, value);
export const getParticipantRoleLabel = (value: string | null | undefined) =>
  readLabel(participantRoleLabels, value);
export const getSessionCharacterStatusLabel = (value: string | null | undefined) =>
  readLabel(sessionCharacterStatusLabels, value);
