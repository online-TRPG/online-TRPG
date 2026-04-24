import type {
  CharacterResponseDto,
  GameStateResponseDto,
  ScenarioSummaryResponseDto,
  SessionCharacterResponseDto,
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

export type StoredUser = Pick<User, "id" | "displayName" | "createdAt">;

export function normalizeSessionSnapshot(
  snapshot: SessionSnapshotDto & { characters?: SessionCharacterResponseDto[] },
): SessionSnapshot {
  const characters = snapshot.characters ?? snapshot.sessionCharacters ?? [];

  return {
    ...snapshot,
    sessionCharacters: characters,
    characters,
  };
}

export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
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
