import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  ConnectionStatus,
  GamePhase,
  ParticipantRole,
  SessionStatus,
} from "../../constants/enums";
import { ScenarioSummaryResponseDto } from "./scenarios.dto";
import { UserResponseDto } from "./users.dto";
import { SessionCharacterResponseDto } from "./characters.dto";

export class CreateSessionDto {
  @ApiProperty({ example: "Goblin Cave Run" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ example: "A short beginner-friendly dungeon crawl." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scenarioId?: string;

  @ApiPropertyOptional({ default: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  maxParticipants?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  maxParticipants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}

export class JoinSessionDto {
  @ApiProperty({ example: "ABC123" })
  @IsString()
  @IsNotEmpty()
  inviteCode!: string;
}

export class SelectSessionCharacterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  characterId!: string;
}

export class UpdateSessionCaptainDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  captainUserId?: string | null;
}

export class SessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  ownerUserId!: string;

  @ApiPropertyOptional({ nullable: true })
  captainUserId!: string | null;

  @ApiProperty()
  inviteCode!: string;

  @ApiProperty({ enum: SessionStatus })
  @IsEnum(SessionStatus)
  status!: SessionStatus;

  @ApiProperty()
  maxParticipants!: number;

  @ApiProperty()
  isPublic!: boolean;

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

  @ApiPropertyOptional({ nullable: true })
  characterId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sessionCharacterId!: string | null;

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

export class ParticipantStatusResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: ConnectionStatus })
  @IsEnum(ConnectionStatus)
  connectionStatus!: ConnectionStatus;
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

  @ApiProperty({ type: [SessionCharacterResponseDto] })
  sessionCharacters!: SessionCharacterResponseDto[];

  @ApiProperty({ type: GameStateResponseDto })
  state!: GameStateResponseDto;
}

export class SessionListItemResponseDto {
  @ApiProperty({ type: SessionResponseDto })
  session!: SessionResponseDto;

  @ApiProperty({ type: ScenarioSummaryResponseDto })
  scenario!: ScenarioSummaryResponseDto;

  @ApiProperty({ type: UserResponseDto })
  owner!: UserResponseDto;

  @ApiProperty()
  participantCount!: number;

  @ApiProperty()
  availableSlots!: number;
}

export class SessionDetailResponseDto extends SessionSnapshotDto {
  @ApiProperty({ type: ScenarioSummaryResponseDto })
  scenario!: ScenarioSummaryResponseDto;

  @ApiProperty({ type: UserResponseDto })
  owner!: UserResponseDto;

  @ApiPropertyOptional({ type: UserResponseDto, nullable: true })
  captain!: UserResponseDto | null;
}

export class SessionInviteResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  inviteCode!: string;

  @ApiPropertyOptional({ nullable: true })
  shareUrl!: string | null;
}
