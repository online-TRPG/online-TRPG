import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  ConnectionStatus,
  GamePhase,
  GmMode,
  MainCommandTargetType,
  ParticipantRole,
  ScenarioNodeType,
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

  @ApiPropertyOptional({ enum: GmMode })
  @IsOptional()
  @IsEnum(GmMode)
  gmMode?: GmMode;

  @ApiPropertyOptional({ nullable: true, description: "AI GM 모드의 진행 반장(captain). null이면 해제." })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  captainUserId?: string | null;

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

  @ApiProperty({ type: Object, deprecated: true })
  state!: Record<string, unknown>;

  @ApiProperty()
  updatedAt!: string;
}

export class PlayerScenarioClueDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  text!: string;

  @ApiPropertyOptional({ nullable: true })
  importance!: string | null;
}

export class PlayerCheckOptionDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional()
  type?: string;

  @ApiPropertyOptional()
  skill?: string;
}

export class PlayerVisibleTargetDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: MainCommandTargetType })
  targetType!: MainCommandTargetType;

  @ApiProperty()
  summary!: string;
}

export class PlayerScenarioNodeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ScenarioNodeType })
  nodeType!: ScenarioNodeType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  sceneText!: string;

  @ApiPropertyOptional({ nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ type: [PlayerCheckOptionDto] })
  checkOptions!: PlayerCheckOptionDto[];

  @ApiProperty({ type: [PlayerScenarioClueDto] })
  publicClues!: PlayerScenarioClueDto[];

  @ApiProperty({ type: [PlayerVisibleTargetDto] })
  visibleTargets!: PlayerVisibleTargetDto[];
}

export class PlayerScenarioViewDto {
  @ApiProperty()
  sessionScenarioId!: string;

  @ApiProperty()
  scenarioId!: string;

  @ApiPropertyOptional({ nullable: true })
  currentNodeId!: string | null;

  @ApiPropertyOptional({ type: PlayerScenarioNodeDto, nullable: true })
  currentNode!: PlayerScenarioNodeDto | null;

  @ApiProperty({ type: [PlayerScenarioNodeDto] })
  visitedNodes!: PlayerScenarioNodeDto[];

  @ApiProperty({ type: [PlayerScenarioClueDto] })
  revealedClues!: PlayerScenarioClueDto[];
}

export class RevealSessionContentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contentId!: string;

  @ApiPropertyOptional({ default: "clue" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contentKind?: string;

  @ApiPropertyOptional({ enum: ["party", "user", "character"], default: "party" })
  @IsOptional()
  @IsIn(["party", "user", "character"])
  scope?: "party" | "user" | "character";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string | null;
}

export class SessionRevealResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionScenarioId!: string;

  @ApiProperty()
  contentId!: string;

  @ApiProperty()
  contentKind!: string;

  @ApiProperty()
  scope!: string;

  @ApiPropertyOptional({ nullable: true })
  recipientId!: string | null;

  @ApiProperty()
  revealedAt!: string;

  @ApiProperty()
  revealedBy!: string;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;
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

export class SrdMonsterReferenceSourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  file?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  heading?: string;
}

export class SrdMonsterReferenceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nameEn!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameKo?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  basicRaw!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  armorClassRaw?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  hitPointsRaw?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  speedRaw?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  challengeRaw?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  sensesRaw?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  languagesRaw?: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  traits!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  actions!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  legendaryActions!: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  playReference?: string | null;

  @ApiPropertyOptional({ type: SrdMonsterReferenceSourceDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => SrdMonsterReferenceSourceDto)
  source?: SrdMonsterReferenceSourceDto | null;
}

export class VttMapStartingPositionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string | null;

  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;
}

export class VttMapTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  npcId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  sessionCharacterId?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;

  @ApiProperty()
  @IsNumber()
  size!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hidden?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isHostile?: boolean;

  @ApiPropertyOptional({ type: SrdMonsterReferenceDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => SrdMonsterReferenceDto)
  monster?: SrdMonsterReferenceDto | null;
}

export class VttFogRectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;

  @ApiProperty()
  @IsNumber()
  width!: number;

  @ApiProperty()
  @IsNumber()
  height!: number;
}

export class VttMapStateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  scenarioNodeId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiProperty({ default: "square" })
  @IsIn(["square", "hex"])
  gridType!: "square" | "hex";

  @ApiProperty()
  @IsNumber()
  @Min(16)
  @Max(160)
  gridSize!: number;

  @ApiProperty()
  @IsNumber()
  @Min(320)
  @Max(4000)
  width!: number;

  @ApiProperty()
  @IsNumber()
  @Min(240)
  @Max(4000)
  height!: number;

  @ApiProperty({ type: [VttMapTokenDto] })
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => VttMapTokenDto)
  tokens!: VttMapTokenDto[];

  @ApiProperty({ type: [VttFogRectDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VttFogRectDto)
  fogRects!: VttFogRectDto[];

  @ApiPropertyOptional({ type: [VttMapStartingPositionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => VttMapStartingPositionDto)
  startingPositions?: VttMapStartingPositionDto[];

  @ApiProperty()
  @IsString()
  updatedAt!: string;
}

export class UpdateVttMapDto {
  @ApiProperty({ type: VttMapStateDto })
  @ValidateNested()
  @Type(() => VttMapStateDto)
  map!: VttMapStateDto;
}
