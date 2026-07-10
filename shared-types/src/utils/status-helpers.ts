import {
  CombatStatus,
  GmMode,
  MainCommandStatus,
  SessionParticipantStatus,
  SessionScenarioStatus,
  SessionStatus,
} from "../constants/enums";

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {
  return values.some((candidate) => candidate === value);
}

export function normalizeSessionStatus(value: unknown): SessionStatus {
  const normalized = typeof value === "string" ? value.toLowerCase() : value;
  return typeof normalized === "string" && isOneOf(normalized, Object.values(SessionStatus))
    ? normalized
    : SessionStatus.RECRUITING;
}

export function isBlockingSessionStatus(status: SessionStatus | string | undefined): boolean {
  const normalized = normalizeSessionStatus(status);
  return normalized !== SessionStatus.COMPLETED && normalized !== SessionStatus.DISBANDED;
}

export function isRecruitingSessionStatus(status: SessionStatus | string | undefined): boolean {
  return normalizeSessionStatus(status) === SessionStatus.RECRUITING;
}

export function isCompletedSessionStatus(status: SessionStatus | string | undefined): boolean {
  return normalizeSessionStatus(status) === SessionStatus.COMPLETED;
}

export function isActiveSessionScenarioStatus(status: SessionScenarioStatus | string | undefined): boolean {
  return status === SessionScenarioStatus.ACTIVE;
}

export function isJoinedParticipantStatus(status: SessionParticipantStatus | string | undefined): boolean {
  return status === SessionParticipantStatus.JOINED;
}

export function isHumanGmMode(gmMode: GmMode | string | null | undefined): boolean {
  return gmMode === GmMode.HUMAN;
}

export function isAiGmMode(gmMode: GmMode | string | null | undefined): boolean {
  return gmMode === GmMode.AI;
}

export function isActiveCombatStatus(status: CombatStatus | string | null | undefined): boolean {
  return status === CombatStatus.ACTIVE;
}

export function isEndedCombatStatus(status: CombatStatus | string | null | undefined): boolean {
  return status === CombatStatus.ENDED;
}

export function isMainCommandCheckRequiredStatus(status: MainCommandStatus | string | null | undefined): boolean {
  return status === MainCommandStatus.CHECK_REQUIRED;
}

export function isMainCommandImpossibleStatus(status: MainCommandStatus | string | null | undefined): boolean {
  return status === MainCommandStatus.IMPOSSIBLE;
}
