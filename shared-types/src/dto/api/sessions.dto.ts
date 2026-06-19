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
  MainCommandStatus,
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
  @ApiProperty({ example: "검은 우물의 쥐떼" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ example: "A short beginner-friendly dungeon crawl." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: "scenario_77758fa0-3b35-4f95-bb2d-0ffe11c989ac" })
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

export class UpdateHumanGmDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  gmUserId!: string;
}

export class GrantHumanGmInventoryItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionCharacterId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemDefinitionId!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

export class RemoveHumanGmInventoryItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionCharacterId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

export class SetHumanGmDifficultyClassDto {
  @ApiProperty({ description: "Trap, check, save, or scene target id." })
  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @ApiProperty({ minimum: 1, maximum: 40 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  dc!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Optional ability or save id such as dexterity or wisdom." })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ability?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  privateNote?: string | null;
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

  @ApiPropertyOptional({ nullable: true })
  disposition?: string | null;
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
  @IsIn(["clue", "item", "event"])
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

export class PendingRestApprovalDto {
  @ApiProperty()
  actionId!: string;

  @ApiProperty({ enum: ["short", "long"], nullable: true })
  restType!: "short" | "long" | null;

  @ApiPropertyOptional({ nullable: true })
  hitDiceToSpend!: number | null;

  @ApiProperty()
  requesterUserId!: string;

  @ApiProperty()
  requesterDisplayName!: string;

  @ApiPropertyOptional({ nullable: true })
  sessionCharacterId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  characterName!: string | null;

  @ApiProperty()
  requestedAt!: string;

  @ApiProperty()
  expiresAt!: string;
}

export class HumanGmPrivateNoteDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  turnLogId!: string;

  @ApiProperty()
  kind!: string;

  @ApiPropertyOptional({ nullable: true })
  targetId!: string | null;

  @ApiProperty()
  note!: string;

  @ApiProperty()
  gmUserId!: string;

  @ApiProperty()
  createdAt!: string;
}

export class HumanGmAiAssistSuggestionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  assistType!: string;

  @ApiProperty()
  content!: string;

  @ApiPropertyOptional({ nullable: true })
  suggestedActionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  targetId!: string | null;

  @ApiProperty({ enum: ["PENDING", "ACCEPTED"] })
  status!: "PENDING" | "ACCEPTED";

  @ApiProperty()
  createdByUserId!: string;

  @ApiPropertyOptional({ nullable: true })
  acceptedByUserId!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt!: string | null;
}

export class CreateHumanGmAiAssistSuggestionDto {
  @ApiProperty({ enum: ["scene_text", "npc_dialogue", "node_move", "combat", "rules", "other"] })
  @IsIn(["scene_text", "npc_dialogue", "node_move", "combat", "rules", "other"])
  assistType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  suggestedActionId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetId?: string | null;
}

export class AcceptHumanGmAiAssistSuggestionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  suggestionId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  publicNarration?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  privateNote?: string | null;
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

  @ApiPropertyOptional({ type: [PendingRestApprovalDto] })
  pendingRestApprovals?: PendingRestApprovalDto[];
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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  privateNote?: string | null;
}

export class ApplyHumanGmCombatConditionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  targetId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  conditionId!: string;

  @ApiPropertyOptional({ enum: ["add", "remove"], default: "add" })
  @IsOptional()
  @IsIn(["add", "remove"])
  operation?: "add" | "remove";
}

export class AdjustHumanGmCombatHpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  targetId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  currentHp!: number;
}

export class UpdateSessionNodeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nodeId!: string;
}

export class HumanGmNodeMoveOptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nodeId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nodeType!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  label?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  condition?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  isFallback?: boolean;
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

export class VttMapPingDto {
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

  @ApiPropertyOptional({ default: "!" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  label?: string;

  @ApiProperty()
  @IsString()
  expiresAt!: string;
}

export class VttLightSourceDto {
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

  @ApiProperty({ default: 40 })
  @IsNumber()
  @Min(5)
  rangeFt!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  label?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  createdBySessionCharacterId?: string | null;
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

  @ApiPropertyOptional({ enum: ["fixed", "scalable"] })
  @IsOptional()
  @IsIn(["fixed", "scalable"])
  encounterRole?: "fixed" | "scalable";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  encounterGroupId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  encounterPriority?: number;

  @ApiPropertyOptional({ type: SrdMonsterReferenceDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => SrdMonsterReferenceDto)
  monster?: SrdMonsterReferenceDto | null;
}

export class VttEncounterScalingDto {
  @ApiProperty({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ default: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  basePartySize!: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(80)
  minMonsterCount?: number;

  @ApiProperty({ default: "by_party_ratio" })
  @IsIn(["by_party_ratio"])
  mode!: "by_party_ratio";
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

export class VttObjectShapeCellDto {
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

export class VttTerrainCellDto {
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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  terrainEffectId?: string | null;
}

export class VttWallCellDto extends VttTerrainCellDto {}

export class VttDoorCellDto extends VttTerrainCellDto {
  @ApiProperty({ enum: ["open", "closed", "locked", "broken"] })
  @IsIn(["open", "closed", "locked", "broken"])
  state!: "open" | "closed" | "locked" | "broken";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  keyItemId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  canBreak?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  breakCheckDc?: number | null;
}

export class VttObjectProximityTriggerDto {
  @ApiProperty({ default: 15 })
  @IsNumber()
  @Min(0)
  distanceFeet!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  once?: boolean;
}

export class VttObjectRevealFogEffectDto {
  @ApiProperty({ default: 30 })
  @IsNumber()
  @Min(5)
  revealRadiusFeet!: number;
}

export class VttObjectEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string | null;

  @ApiProperty({ enum: ["REVEAL_FOG_ON_PROXIMITY"] })
  @IsIn(["REVEAL_FOG_ON_PROXIMITY"])
  type!: "REVEAL_FOG_ON_PROXIMITY";

  @ApiProperty({ type: VttObjectProximityTriggerDto })
  @ValidateNested()
  @Type(() => VttObjectProximityTriggerDto)
  trigger!: VttObjectProximityTriggerDto;

  @ApiProperty({ type: VttObjectRevealFogEffectDto })
  @ValidateNested()
  @Type(() => VttObjectRevealFogEffectDto)
  effect!: VttObjectRevealFogEffectDto;
}

export class VttObjectRevealCheckDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  contentId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresCheck?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  ability?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  skill?: string | null;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(40)
  dc?: number;
}

export class VttObjectHazardDto {
  @ApiProperty({ enum: ["TRAP", "AMBUSH", "HAZARD"], default: "TRAP" })
  @IsIn(["TRAP", "AMBUSH", "HAZARD"])
  kind!: "TRAP" | "AMBUSH" | "HAZARD";

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  armed?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  triggerOnce?: boolean;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  detectionRadiusCells?: number;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(40)
  detectionDc?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedClueIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attemptedBySessionCharacterIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detectedBySessionCharacterIds?: string[];
}

export class VttObjectCellDto extends VttTerrainCellDto {
  @ApiPropertyOptional({ type: [VttObjectShapeCellDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => VttObjectShapeCellDto)
  shapeCells?: VttObjectShapeCellDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  visibleToPlayers?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenClueIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenItemIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenEventIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  observedBySessionCharacterIds?: string[];

  @ApiPropertyOptional({ type: [VttObjectRevealCheckDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => VttObjectRevealCheckDto)
  revealChecks?: VttObjectRevealCheckDto[];

  @ApiPropertyOptional({ type: [VttObjectEventDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VttObjectEventDto)
  events?: VttObjectEventDto[];

  @ApiPropertyOptional({ type: VttObjectHazardDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => VttObjectHazardDto)
  hazard?: VttObjectHazardDto | null;
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

  @ApiPropertyOptional({ type: VttEncounterScalingDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => VttEncounterScalingDto)
  encounterScaling?: VttEncounterScalingDto | null;

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

  @ApiPropertyOptional({ type: [VttMapPingDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => VttMapPingDto)
  pings?: VttMapPingDto[];

  @ApiPropertyOptional({ type: [VttLightSourceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => VttLightSourceDto)
  lightSources?: VttLightSourceDto[];

  @ApiPropertyOptional({ type: [VttTerrainCellDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => VttTerrainCellDto)
  terrainCells?: VttTerrainCellDto[];

  @ApiPropertyOptional({ type: [VttWallCellDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => VttWallCellDto)
  wallCells?: VttWallCellDto[];

  @ApiPropertyOptional({ type: [VttDoorCellDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VttDoorCellDto)
  doorCells?: VttDoorCellDto[];

  @ApiPropertyOptional({ type: [VttObjectCellDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => VttObjectCellDto)
  objectCells?: VttObjectCellDto[];

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

export class VttMapPointDto {
  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;
}

export class MoveSessionTokenDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  tokenId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  sessionCharacterId?: string | null;

  @ApiProperty({ type: VttMapPointDto })
  @ValidateNested()
  @Type(() => VttMapPointDto)
  to!: VttMapPointDto;

  @ApiPropertyOptional({ type: [VttMapPointDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => VttMapPointDto)
  path?: VttMapPointDto[];

  @ApiPropertyOptional({ enum: ["normal", "jump"], default: "normal" })
  @IsOptional()
  @IsString()
  movementMode?: "normal" | "jump";

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  clientMapVersion?: number;
}

export class CreateVttMapPingDto {
  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;

  @ApiPropertyOptional({ default: "!" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  clientMapVersion?: number;
}

export class VttMapInteractionDto {
  @ApiProperty({ enum: ["open_door", "close_door", "break_door", "investigate_object", "disarm_hazard", "detect_hazard", "trigger_object"] })
  @IsIn(["open_door", "close_door", "break_door", "investigate_object", "disarm_hazard", "detect_hazard", "trigger_object"])
  kind!:
    | "open_door"
    | "close_door"
    | "break_door"
    | "investigate_object"
    | "disarm_hazard"
    | "detect_hazard"
    | "trigger_object";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  targetId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  actorSessionCharacterId?: string | null;

  @ApiPropertyOptional({ type: VttMapPointDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => VttMapPointDto)
  mapPoint?: VttMapPointDto | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  itemId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  clientMapVersion?: number;
}

export class VttMapInteractionResponseDto {
  @ApiProperty({ enum: MainCommandStatus })
  status!: MainCommandStatus;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ type: VttMapStateDto, nullable: true })
  map?: VttMapStateDto | null;

  @ApiPropertyOptional({ type: [Object] })
  checkOptions?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: Object, nullable: true })
  data?: Record<string, unknown> | null;
}
