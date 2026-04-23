import type {
  CharacterResponseDto,
  GameStateResponseDto,
  ScenarioSummaryResponseDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  UserResponseDto,
} from "@trpg/shared-types";

export type User = UserResponseDto;
export type Scenario = ScenarioSummaryResponseDto;
export type Session = SessionResponseDto;
export type Participant = SessionParticipantResponseDto;
export type Character = CharacterResponseDto;
export type GameState = GameStateResponseDto;
export type SessionSnapshot = SessionSnapshotDto;

export type StoredUser = Pick<User, "id" | "displayName" | "createdAt">;

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
