import type {
  CharacterResponseDto,
  ChatMessageEventDto,
  GameStateResponseDto,
  PlayerScenarioNodeDto,
  PlayerScenarioViewDto,
  ScenarioNodeResponseDto,
  ScenarioResponseDto,
  ScenarioSummaryResponseDto,
  SessionCharacterResponseDto,
  SessionDetailResponseDto,
  SessionListItemResponseDto,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  UserResponseDto,
} from "@trpg/shared-types";
import { normalizeSessionStatus } from "@trpg/shared-types/frontend";

export type User = UserResponseDto;
export type Scenario = ScenarioSummaryResponseDto;
export type ScenarioDetail = ScenarioResponseDto;
export type ScenarioNode = ScenarioNodeResponseDto;
export type Session = SessionResponseDto;
export type SessionListItem = SessionListItemResponseDto;
export type Participant = SessionParticipantResponseDto;
export type PersistentCharacter = CharacterResponseDto;
export type Character = SessionCharacterResponseDto;
export type ChatMessage = ChatMessageEventDto;
export type GameState = GameStateResponseDto;
export type PlayerScenarioNode = PlayerScenarioNodeDto;
export type PlayerScenarioView = PlayerScenarioViewDto;
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
  sessionPublicId: string;
  title: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioThumbnailUrl?: string | null;
  ruleSetName: string;
  currentPlayers: number;
  maxPlayers: number;
  status: string;
  gmMode?: string;
  role?: string;
}

export type StoredUser = Pick<User, "id" | "publicId" | "displayName" | "createdAt" | "role">;

function normalizeUserPublicId(user: User): User {
  return {
    ...user,
    publicId: user.publicId ?? user.id,
  };
}

function normalizeSessionPublicId(session: Session): Session {
  return {
    ...session,
    publicId: session.publicId ?? session.id,
    status: normalizeSessionStatus(session.status) as Session["status"],
  };
}

export function normalizeSessionSnapshot(
  snapshot: SessionSnapshotDto & { characters?: SessionCharacterResponseDto[] },
): SessionSnapshot {
  const characters = snapshot.characters ?? snapshot.sessionCharacters ?? [];

  return {
    ...snapshot,
    session: normalizeSessionPublicId(snapshot.session),
    participants: snapshot.participants.map((participant) => ({
      ...participant,
      user: normalizeUserPublicId(participant.user),
    })),
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
    host: normalizeUserPublicId(detail.host),
    owner: normalizeUserPublicId(detail.owner),
    captain: detail.captain ? normalizeUserPublicId(detail.captain) : detail.captain,
    scenario: detail.scenario,
  };
}

export type { ApiErrorEnvelope as ApiErrorBody } from '@trpg/shared-types';

export interface LogEntry {
  id: string;
  kind: "system" | "rest" | "socket" | "action";
  title: string;
  message: string;
  time: string;
  createdAt: string;
  metadata?: {
    mainCommand?: {
      intent?: string | null;
      targetId?: string | null;
      targetType?: string | null;
      npcDialogue?: {
        npcId?: string | null;
        speakerName?: string | null;
      };
    };
    restApproval?: {
      actionId: string;
      restType?: "short" | "long" | null;
      status?: string | null;
      hitDiceToSpend?: number | null;
      expiresAt?: string | null;
    };
  };
}
