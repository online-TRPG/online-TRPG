import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
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
  GmMode,
  ParticipantRole,
  SessionCharacterStatus,
  SessionParticipantStatus,
  SessionScenarioStatus,
  SessionStatus,
  SessionVisibility,
} from "../../constants/enums";
import { SessionCharacterResponseDto } from "./characters.dto";
import { ScenarioSummaryResponseDto } from "./scenarios.dto";
import { UserResponseDto } from "./users.dto";

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

  @ApiPropertyOptional({ example: "scenario_goblin_cave" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  scenarioId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ruleSetId?: string;

  @ApiProperty({ default: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  maxParticipants!: number;

  @ApiPropertyOptional({ default: 4, deprecated: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  maxPlayers?: number;

  @ApiProperty({ enum: GmMode, default: GmMode.AI })
  @IsEnum(GmMode)
  gmMode!: GmMode;

  @ApiPropertyOptional({ enum: SessionVisibility, default: SessionVisibility.PUBLIC })
  @IsOptional()
  @IsEnum(SessionVisibility)
  visibility?: SessionVisibility;

  @ApiPropertyOptional({ default: false, deprecated: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrivate?: boolean;

  @ApiPropertyOptional({ default: true, deprecated: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  nextSessionAt?: string;
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
  @Max(8)
  maxParticipants?: number;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  maxPlayers?: number;

  @ApiPropertyOptional({ enum: SessionVisibility })
  @IsOptional()
  @IsEnum(SessionVisibility)
  visibility?: SessionVisibility;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrivate?: boolean;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  nextSessionAt?: string | null;
}

export class SessionListQueryDto {
  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scenarioId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ruleSetId?: string;

  @ApiPropertyOptional({ enum: ParticipantRole })
  @IsOptional()
  @IsEnum(ParticipantRole)
  role?: ParticipantRole;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

export class JoinSessionDto {
  @ApiProperty({ example: "ABC123" })
  @IsString()
  @IsNotEmpty()
  inviteCode!: string;
}

export class SelectSessionCharacterDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  characterId!: string | null;
}

export class UpdateParticipantReadyDto {
  @ApiProperty()
  @Type(() => Boolean)
  @IsBoolean()
  isReady!: boolean;
}

export class SessionScenarioResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  scenarioId!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty({ enum: SessionScenarioStatus })
  @IsEnum(SessionScenarioStatus)
  status!: SessionScenarioStatus;

  @ApiPropertyOptional({ nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  endedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: ScenarioSummaryResponseDto })
  scenario!: ScenarioSummaryResponseDto;
}

export class SessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  publicId!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  hostUserId!: string;

  @ApiProperty({ deprecated: true })
  ownerUserId!: string;

  @ApiPropertyOptional({ nullable: true, deprecated: true })
  captainUserId!: string | null;

  @ApiProperty({ enum: GmMode })
  @IsEnum(GmMode)
  gmMode!: GmMode;

  @ApiPropertyOptional({ nullable: true, deprecated: true })
  gmUserId!: string | null;

  @ApiProperty()
  inviteCode!: string;

  @ApiProperty({ enum: SessionStatus })
  @IsEnum(SessionStatus)
  status!: SessionStatus;

  @ApiProperty({ enum: SessionVisibility })
  @IsEnum(SessionVisibility)
  visibility!: SessionVisibility;

  @ApiProperty()
  maxParticipants!: number;

  @ApiProperty({ deprecated: true })
  maxPlayers!: number;

  @ApiProperty({ deprecated: true })
  isPublic!: boolean;

  @ApiProperty({ deprecated: true })
  isPrivate!: boolean;

  @ApiPropertyOptional({ nullable: true })
  ruleSetId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  nextSessionAt!: string | null;

  @ApiPropertyOptional({ nullable: true, deprecated: true })
  scenarioId!: string | null;

  @ApiPropertyOptional({ nullable: true, deprecated: true })
  currentNodeId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  activeSessionScenarioId!: string | null;

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

  @ApiProperty({ enum: SessionParticipantStatus })
  @IsEnum(SessionParticipantStatus)
  status!: SessionParticipantStatus;

  @ApiProperty({ enum: ConnectionStatus })
  @IsEnum(ConnectionStatus)
  connectionStatus!: ConnectionStatus;

  @ApiProperty()
  @Type(() => Boolean)
  @IsBoolean()
  isReady!: boolean;

  @ApiPropertyOptional({ nullable: true })
  readyAt!: string | null;

  @ApiProperty()
  joinedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  leftAt!: string | null;

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
  sessionScenarioId!: string;

  @ApiPropertyOptional({ nullable: true, deprecated: true })
  sessionId!: string | null;

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional({ nullable: true })
  currentNodeId!: string | null;

  @ApiProperty({ enum: GamePhase })
  @IsEnum(GamePhase)
  phase!: GamePhase;

  @ApiProperty({ type: Object })
  flags!: Record<string, unknown>;

  @ApiProperty({ type: [Object] })
  discoveredClues!: Record<string, unknown>[];

  @ApiProperty({ type: Object, deprecated: true })
  state!: Record<string, unknown>;

  @ApiProperty()
  updatedAt!: string;
}

export class SessionSnapshotDto {
  @ApiProperty({ type: SessionResponseDto })
  session!: SessionResponseDto;

  @ApiProperty({ type: [SessionScenarioResponseDto] })
  sessionScenarios!: SessionScenarioResponseDto[];

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
  host!: UserResponseDto;

  @ApiProperty({ type: UserResponseDto, deprecated: true })
  owner!: UserResponseDto;

  @ApiProperty()
  participantCount!: number;

  @ApiProperty()
  availableSlots!: number;

  @ApiPropertyOptional({ enum: ParticipantRole })
  role?: ParticipantRole;
}

export class SessionDetailResponseDto extends SessionSnapshotDto {
  @ApiProperty({ type: ScenarioSummaryResponseDto })
  scenario!: ScenarioSummaryResponseDto;

  @ApiProperty({ type: UserResponseDto })
  host!: UserResponseDto;

  @ApiProperty({ type: UserResponseDto, deprecated: true })
  owner!: UserResponseDto;

  @ApiPropertyOptional({ type: UserResponseDto, nullable: true, deprecated: true })
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

export class HumanGmMessageDto {
  @ApiProperty({ example: "The innkeeper leans forward and lowers their voice." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({ example: "Innkeeper" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  speakerName?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  asNpc?: boolean;
}

export class UpdateSessionNodeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nodeId!: string;
}
