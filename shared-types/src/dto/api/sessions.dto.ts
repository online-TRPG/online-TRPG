import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import {
  ConnectionStatus,
  GamePhase,
  ParticipantRole,
  SessionStatus,
} from "../../constants/enums";
import { CharacterResponseDto } from "./characters.dto";
import { UserResponseDto } from "./users.dto";

export class CreateSessionDto {
  @ApiProperty({ example: "Goblin Cave Run" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scenarioId?: string;
}

export class JoinSessionDto {
  @ApiProperty({ example: "ABC123" })
  @IsString()
  @IsNotEmpty()
  inviteCode!: string;
}

export class SessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  ownerUserId!: string;

  @ApiProperty()
  inviteCode!: string;

  @ApiProperty({ enum: SessionStatus })
  @IsEnum(SessionStatus)
  status!: SessionStatus;

  @ApiProperty()
  scenarioId!: string;

  @ApiProperty()
  currentNodeId!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class SessionParticipantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional()
  characterId?: string | null;

  @ApiProperty({ enum: ParticipantRole })
  @IsEnum(ParticipantRole)
  role!: ParticipantRole;

  @ApiProperty({ enum: ConnectionStatus })
  @IsEnum(ConnectionStatus)
  connectionStatus!: ConnectionStatus;

  @ApiProperty()
  joinedAt!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}

export class GameStateResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  currentNodeId!: string;

  @ApiProperty({ enum: GamePhase })
  @IsEnum(GamePhase)
  phase!: GamePhase;

  @ApiProperty({ type: Object })
  state!: Record<string, unknown>;

  @ApiProperty()
  updatedAt!: string;
}

export class SessionSnapshotDto {
  @ApiProperty({ type: SessionResponseDto })
  session!: SessionResponseDto;

  @ApiProperty({ type: [SessionParticipantResponseDto] })
  participants!: SessionParticipantResponseDto[];

  @ApiProperty({ type: [CharacterResponseDto] })
  characters!: CharacterResponseDto[];

  @ApiProperty({ type: GameStateResponseDto })
  state!: GameStateResponseDto;
}
