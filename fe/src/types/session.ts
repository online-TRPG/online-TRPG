import type {
  CharacterResponseDto,
  GameStateResponseDto,
  ScenarioSummaryResponseDto,
  SessionCharacterResponseDto,
  SessionDetailResponseDto,
  SessionListItemResponseDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  UserResponseDto,
} from "@trpg/shared-types";

export type User = UserResponseDto;
export type Scenario = ScenarioSummaryResponseDto;
export type Session = SessionResponseDto;
export type SessionListItem = SessionListItemResponseDto;
export type Participant = SessionParticipantResponseDto;
export type PersistentCharacter = CharacterResponseDto;
export type Character = SessionCharacterResponseDto;
export type GameState = GameStateResponseDto;
export type SessionSnapshot = Omit<SessionSnapshotDto, "sessionCharacters"> & {
  sessionCharacters: SessionCharacterResponseDto[];
  characters: SessionCharacterResponseDto[];
};
export type SessionDetail = Omit<SessionDetailResponseDto, "sessionCharacters"> & {
  sessionCharacters: SessionCharacterResponseDto[];
  characters: SessionCharacterResponseDto[];
};

export interface AvailableSessionListItem {
  sessionId: string;
  title: string;
  scenarioTitle: string;
  ruleSetName: string;
  currentPlayers: number;
  maxPlayers: number;
  status: string;
  role?: string;
}

export type StoredUser = Pick<User, "id" | "displayName" | "createdAt">;

export function normalizeSessionSnapshot(
  snapshot: SessionSnapshotDto & { characters?: SessionCharacterResponseDto[] },
): SessionSnapshot {
  const characters = snapshot.characters ?? snapshot.sessionCharacters ?? [];

  return {
    ...snapshot,
    sessionScenarios: snapshot.sessionScenarios ?? [],
    sessionCharacters: characters,
    characters,
  };
}

export function normalizeSessionDetail(
  detail: SessionDetailResponseDto & { characters?: SessionCharacterResponseDto[] },
): SessionDetail {
  const snapshot = normalizeSessionSnapshot(detail);

  return {
    ...snapshot,
    scenario: detail.scenario,
    host: detail.host,
    owner: detail.owner,
    captain: detail.captain,
  };
}

export interface ApiErrorBody {
  code?: string;
  statusCode?: number;
  message?: string | string[];
  data?: unknown;
  timestamp?: string;
  path?: string;
}

export interface LogEntry {
  id: string;
  kind: "system" | "rest" | "socket" | "action";
  title: string;
  message: string;
  time: string;
}
