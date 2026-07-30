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
  SessionActivityStatus,
  RecruitmentStatus,
  SessionJoinPolicy,
  SessionPlayStatus,
  SessionAttendanceStatus,
  SessionApplicationStatus,
  SessionJoinTiming,
  SessionListSort,
  SessionScenarioStatus,
  SessionStatus,
  SessionVisibility,
} from "../../constants/enums";
import {
  HUMAN_GM_AI_ASSIST_CONTENT_MAX_LENGTH,
  HUMAN_GM_INVENTORY_QUANTITY_MAX,
  HUMAN_GM_INVENTORY_QUANTITY_MIN,
  HUMAN_GM_MESSAGE_CONTENT_MAX_LENGTH,
  HUMAN_GM_PRIVATE_NOTE_MAX_LENGTH,
  VTT_CHECK_DC_MAX,
  VTT_CHECK_DC_MIN,
  VTT_ENCOUNTER_PRIORITY_MAX,
  VTT_ENCOUNTER_PRIORITY_MIN,
} from "../../constants/runtime-limits";
import {
  VTT_DOOR_STATE_VALUES,
  VTT_MAP_INTERACTION_KIND_VALUES,
  VttDoorState,
  VttMapInteractionKind,
} from "../../constants/vtt-map";
import { SessionCharacterResponseDto } from "./characters.dto";
import type { MainCommandCheckOptionDto, MainCommandResponseDataDto } from "./gameplay.dto";
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

  @ApiPropertyOptional({ enum: RecruitmentStatus })
  @IsOptional()
  @IsEnum(RecruitmentStatus)
  recruitmentStatus?: RecruitmentStatus;

  @ApiPropertyOptional({ enum: SessionJoinPolicy })
  @IsOptional()
  @IsEnum(SessionJoinPolicy)
  joinPolicy?: SessionJoinPolicy;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  openLobbyNow?: boolean;
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
  @IsNotEmpty()
  scenarioId?: string;

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

  @ApiPropertyOptional({ enum: RecruitmentStatus })
  @IsOptional()
  @IsEnum(RecruitmentStatus)
  recruitmentStatus?: RecruitmentStatus;

  @ApiPropertyOptional({ enum: SessionJoinPolicy })
  @IsOptional()
  @IsEnum(SessionJoinPolicy)
  joinPolicy?: SessionJoinPolicy;
}

export class SessionListQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;

  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @ApiPropertyOptional({ enum: SessionActivityStatus })
  @IsOptional()
  @IsEnum(SessionActivityStatus)
  activityStatus?: SessionActivityStatus;

  @ApiPropertyOptional({ enum: GmMode })
  @IsOptional()
  @IsEnum(GmMode)
  gmMode?: GmMode;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  scenarioId?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ruleSetId?: string;

  @ApiPropertyOptional({ enum: ParticipantRole })
  @IsOptional()
  @IsEnum(ParticipantRole)
  role?: ParticipantRole;

  @ApiPropertyOptional({ enum: SessionListSort, default: SessionListSort.RECENT })
  @IsOptional()
  @IsEnum(SessionListSort)
  sort?: SessionListSort;

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

export class SessionScheduleVersionAcknowledgementDto {
  @ApiProperty()
  @IsString()
  comparedPlayId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  playScheduleVersion!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  comparedScheduleVersion!: number;
}

export class JoinSessionDto {
  @ApiProperty({ example: "ABC123" })
  @IsString()
  @IsNotEmpty()
  inviteCode!: string;

  @ApiPropertyOptional({ type: () => [SessionScheduleVersionAcknowledgementDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SessionScheduleVersionAcknowledgementDto)
  acknowledgedScheduleVersions?: SessionScheduleVersionAcknowledgementDto[];
}

export class JoinSessionByIdDto {
  @ApiPropertyOptional({ type: () => [SessionScheduleVersionAcknowledgementDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SessionScheduleVersionAcknowledgementDto)
  acknowledgedScheduleVersions?: SessionScheduleVersionAcknowledgementDto[];
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

export class GrantHumanGmInventoryItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionCharacterId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemDefinitionId!: string;

  @ApiPropertyOptional({ default: HUMAN_GM_INVENTORY_QUANTITY_MIN, minimum: HUMAN_GM_INVENTORY_QUANTITY_MIN, maximum: HUMAN_GM_INVENTORY_QUANTITY_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(HUMAN_GM_INVENTORY_QUANTITY_MIN)
  @Max(HUMAN_GM_INVENTORY_QUANTITY_MAX)
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

  @ApiPropertyOptional({ default: HUMAN_GM_INVENTORY_QUANTITY_MIN, minimum: HUMAN_GM_INVENTORY_QUANTITY_MIN, maximum: HUMAN_GM_INVENTORY_QUANTITY_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(HUMAN_GM_INVENTORY_QUANTITY_MIN)
  @Max(HUMAN_GM_INVENTORY_QUANTITY_MAX)
  quantity?: number;
}

export class SetHumanGmDifficultyClassDto {
  @ApiProperty({ description: "Trap, check, save, or scene target id." })
  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @ApiProperty({ minimum: VTT_CHECK_DC_MIN, maximum: VTT_CHECK_DC_MAX })
  @Type(() => Number)
  @IsInt()
  @Min(VTT_CHECK_DC_MIN)
  @Max(VTT_CHECK_DC_MAX)
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

export class EconomyCurrencyWalletDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ep?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pp?: number;
}

export class EconomyInventoryItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemDefinitionId!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  identified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  damaged?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  attunedBySessionCharacterId?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chargesRemaining?: number | null;
}

export class ApplySessionEconomyActionDto {
  @ApiProperty({
    enum: [
      "purchase",
      "sell",
      "grant_reward",
      "distribute",
      "start_crafting",
      "progress_crafting",
      "identify",
      "repair",
      "attune",
      "recover_charges",
    ],
  })
  @IsIn([
    "purchase",
    "sell",
    "grant_reward",
    "distribute",
    "start_crafting",
    "progress_crafting",
    "identify",
    "repair",
    "attune",
    "recover_charges",
  ])
  actionType!:
    | "purchase"
    | "sell"
    | "grant_reward"
    | "distribute"
    | "start_crafting"
    | "progress_crafting"
    | "identify"
    | "repair"
    | "attune"
    | "recover_charges";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  sessionCharacterId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  shopId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  itemDefinitionId?: string | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceGp?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stockQuantity?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costGp?: number;

  @ApiPropertyOptional({ type: EconomyCurrencyWalletDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EconomyCurrencyWalletDto)
  currency?: EconomyCurrencyWalletDto;

  @ApiPropertyOptional({ type: [EconomyInventoryItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EconomyInventoryItemDto)
  items?: EconomyInventoryItemDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  splitCurrency?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  rewardId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  craftingId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  recipeId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  outputItemDefinitionId?: string | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  outputQuantity?: number;

  @ApiPropertyOptional({ type: [EconomyInventoryItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EconomyInventoryItemDto)
  requiredMaterials?: EconomyInventoryItemDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredToolProficiencies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knownToolProficiencies?: string[];

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  laborHours?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  chargesRecovered?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maximumCharges?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresAttunement?: boolean;
}

export class ApplyCampaignCalendarActionDto {
  @ApiProperty({
    enum: [
      "propose_schedule",
      "respond_schedule",
      "confirm_schedule",
      "advance_game_time",
      "start_downtime",
      "pause_downtime",
      "resume_downtime",
      "complete_downtime",
    ],
  })
  @IsIn([
    "propose_schedule",
    "respond_schedule",
    "confirm_schedule",
    "advance_game_time",
    "start_downtime",
    "pause_downtime",
    "resume_downtime",
    "complete_downtime",
  ])
  actionType!:
    | "propose_schedule"
    | "respond_schedule"
    | "confirm_schedule"
    | "advance_game_time"
    | "start_downtime"
    | "pause_downtime"
    | "resume_downtime"
    | "complete_downtime";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  scheduleId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  responseId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  downtimeTaskId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionCharacterId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({ enum: ["available", "unavailable", "tentative"] })
  @IsOptional()
  @IsIn(["available", "unavailable", "tentative"])
  availability?: "available" | "unavailable" | "tentative";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  timeZone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  inGameDate?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  elapsedDays?: number;

  @ApiPropertyOptional({ enum: ["crafting", "training", "research", "recovery", "identify", "repair", "shop_restock"] })
  @IsOptional()
  @IsIn(["crafting", "training", "research", "recovery", "identify", "repair", "shop_restock"])
  downtimeType?: "crafting" | "training" | "research" | "recovery" | "identify" | "repair" | "shop_restock";

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costGp?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  workDaysRequired?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  workDaysDelta?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  requiredTools?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  availableTools?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
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

  @ApiProperty({ enum: SessionActivityStatus })
  activityStatus!: SessionActivityStatus;

  @ApiProperty({ enum: RecruitmentStatus })
  recruitmentStatus!: RecruitmentStatus;

  @ApiProperty({ enum: SessionJoinPolicy })
  joinPolicy!: SessionJoinPolicy;

  @ApiPropertyOptional({ nullable: true })
  currentPlayId!: string | null;

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

export class HumanGmRevealOptionDto {
  @ApiProperty()
  contentId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  preview!: string | null;
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
  contentKind?: "clue" | "item" | "event";

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
  contentKind!: "clue" | "item" | "event";

  @ApiProperty()
  scope!: "party" | "user" | "character";

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
  @MaxLength(HUMAN_GM_AI_ASSIST_CONTENT_MAX_LENGTH)
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

export class ReportHumanGmAiAssistApplicationFailureDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  suggestionId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  failureReason!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  failedOperation?: string | null;
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

export class CompleteCampaignDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  epilogue!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  finalNodeId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  finalRewardIds?: string[];

  @ApiPropertyOptional({ enum: ["private", "party", "public_summary"], default: "party" })
  @IsOptional()
  @IsIn(["private", "party", "public_summary"])
  shareScope?: "private" | "party" | "public_summary";

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowCharacterTransfer?: boolean;
}

export class CampaignArchiveCharacterDto {
  @ApiProperty()
  sessionCharacterId!: string;

  @ApiProperty()
  characterId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  className!: string;

  @ApiPropertyOptional({ nullable: true })
  subclassName!: string | null;

  @ApiProperty()
  level!: number;

  @ApiProperty()
  status!: string;
}

export class CampaignArchiveAnalyticsDto {
  @ApiProperty()
  turnLogCount!: number;

  @ApiProperty()
  combatCount!: number;

  @ApiProperty()
  completedDowntimeTaskCount!: number;

  @ApiProperty()
  nodeVisitCount!: number;

  @ApiProperty()
  sessionCharacterCount!: number;
}

export class CampaignArchivePublicRevisionLineageDto {
  @ApiPropertyOptional({ nullable: true })
  sourceScenarioId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceRevisionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  forkedFromScenarioId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  forkedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  forkedByUserId!: string | null;
}

export class CampaignArchiveSnapshotDto {
  @ApiProperty()
  stateVersion!: number;

  @ApiPropertyOptional({ nullable: true })
  currentNodeId!: string | null;

  @ApiProperty({ type: Object })
  downtime!: {
    activeTaskCount: number;
    pausedTaskCount: number;
    completedTaskCount: number;
    taskIds: string[];
  };

  @ApiProperty({ type: Object })
  economy!: {
    hasEconomyState: boolean;
    partyStashItemCount: number;
    walletCount: number;
    shopCount: number;
    craftingProgressCount: number;
    downtimeCompletionCount: number;
  };

  @ApiProperty({ type: Object })
  inventory!: {
    totalItemCount: number;
    characterInventoryCounts: Record<string, number>;
  };

  @ApiProperty({ type: Object })
  combat!: {
    combatCount: number;
    turnLogCount: number;
    nodeVisitCount: number;
  };

  @ApiPropertyOptional({ type: CampaignArchivePublicRevisionLineageDto, nullable: true })
  publicRevisionLineage!: CampaignArchivePublicRevisionLineageDto | null;
}

export class CampaignArchiveResponseDto {
  @ApiProperty()
  archiveId!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  sessionTitle!: string;

  @ApiProperty()
  scenarioId!: string;

  @ApiPropertyOptional({ nullable: true })
  scenarioTitle!: string | null;

  @ApiProperty()
  completedAt!: string;

  @ApiProperty()
  completedByUserId!: string;

  @ApiProperty()
  epilogue!: string;

  @ApiProperty({ enum: ["private", "party", "public_summary"] })
  shareScope!: "private" | "party" | "public_summary";

  @ApiProperty()
  allowCharacterTransfer!: boolean;

  @ApiPropertyOptional({ nullable: true })
  finalNodeId!: string | null;

  @ApiProperty({ type: [String] })
  finalRewardIds!: string[];

  @ApiProperty({ type: [CampaignArchiveCharacterDto] })
  characters!: CampaignArchiveCharacterDto[];

  @ApiProperty({ type: CampaignArchiveAnalyticsDto })
  analytics!: CampaignArchiveAnalyticsDto;

  @ApiProperty({ type: CampaignArchiveSnapshotDto })
  snapshot!: CampaignArchiveSnapshotDto;
}

export class CharacterVaultItemDto {
  @ApiProperty()
  sourceSessionCharacterId!: string;

  @ApiProperty()
  sourceSessionId!: string;

  @ApiProperty()
  sourceSessionTitle!: string;

  @ApiProperty()
  archiveId!: string;

  @ApiProperty()
  archivedAt!: string;

  @ApiProperty()
  characterId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  className!: string;

  @ApiPropertyOptional({ nullable: true })
  subclassName!: string | null;

  @ApiProperty()
  level!: number;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  transferable!: boolean;
}

export class RequestCharacterTransferDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sourceSessionId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sourceSessionCharacterId!: string;

  @ApiPropertyOptional({ enum: ["clone", "transfer"], default: "clone" })
  @IsOptional()
  @IsIn(["clone", "transfer"])
  mode?: "clone" | "transfer";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CharacterTransferResponseDto {
  @ApiProperty()
  requestId!: string;

  @ApiProperty()
  targetSessionId!: string;

  @ApiProperty()
  sourceSessionId!: string;

  @ApiProperty()
  sourceSessionCharacterId!: string;

  @ApiProperty()
  requestedByUserId!: string;

  @ApiProperty({ enum: ["requested", "approved", "rejected"] })
  status!: "requested" | "approved" | "rejected";

  @ApiProperty({ enum: ["clone", "transfer"] })
  mode!: "clone" | "transfer";

  @ApiPropertyOptional({ nullable: true })
  targetSessionCharacterId!: string | null;

  @ApiPropertyOptional({ enum: ["copied", "retired_after_transfer"], nullable: true })
  sourceDisposition!: "copied" | "retired_after_transfer" | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ nullable: true })
  resolvedAt!: string | null;
}

export class CreateSessionPlayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;

  @ApiPropertyOptional({ default: "Asia/Seoul", maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timeZone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  openLobbyNow?: boolean;
}

export class UpdateSessionPlayDto {
  @ApiProperty()
  @IsDateString()
  scheduledStartAt!: string;

  @ApiPropertyOptional({ default: "Asia/Seoul", maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timeZone?: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedScheduleVersion!: number;
}

export class SessionPlayTransitionDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedStateVersion!: number;
}

export class UpdateSessionPlayAttendanceDto {
  @ApiProperty({ enum: SessionAttendanceStatus })
  @IsEnum(SessionAttendanceStatus)
  attendance!: SessionAttendanceStatus;

  @ApiPropertyOptional({ type: () => [SessionScheduleVersionAcknowledgementDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SessionScheduleVersionAcknowledgementDto)
  acknowledgedScheduleVersions?: SessionScheduleVersionAcknowledgementDto[];
}

export class AcquireActivePlayDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  confirmSwitch?: boolean;
}

export class CreateSessionApplicationDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({ type: () => [SessionScheduleVersionAcknowledgementDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SessionScheduleVersionAcknowledgementDto)
  acknowledgedScheduleVersions?: SessionScheduleVersionAcknowledgementDto[];
}

export class ResolveSessionApplicationDto {
  @ApiProperty({ enum: [SessionApplicationStatus.APPROVED, SessionApplicationStatus.REJECTED] })
  @IsIn([SessionApplicationStatus.APPROVED, SessionApplicationStatus.REJECTED])
  status!: SessionApplicationStatus.APPROVED | SessionApplicationStatus.REJECTED;

  @ApiPropertyOptional({ enum: SessionJoinTiming })
  @IsOptional()
  @IsEnum(SessionJoinTiming)
  joinTiming?: SessionJoinTiming;
}

export class SessionScheduleProximityWarningDto {
  @ApiProperty()
  comparedPlayId!: string;

  @ApiProperty()
  sessionTitle!: string;

  @ApiProperty()
  scheduledStartAt!: string;

  @ApiProperty()
  differenceMinutes!: number;

  @ApiProperty()
  scheduleVersion!: number;

  @ApiProperty()
  targetScheduleVersion!: number;
}

export class SessionPlayAttendanceResponseDto {
  @ApiProperty({ enum: SessionAttendanceStatus })
  attendance!: SessionAttendanceStatus;

  @ApiProperty()
  isReady!: boolean;

  @ApiPropertyOptional({ nullable: true })
  readyAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  enteredLobbyAt!: string | null;
}

export class SessionPlayResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty({ enum: SessionPlayStatus })
  status!: SessionPlayStatus;

  @ApiPropertyOptional({ nullable: true })
  scheduledStartAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lobbyOpensAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  endedAt!: string | null;

  @ApiProperty()
  timeZone!: string;

  @ApiProperty()
  scheduleVersion!: number;

  @ApiProperty()
  stateVersion!: number;

  @ApiPropertyOptional({ nullable: true })
  summary!: string | null;

  @ApiPropertyOptional({ type: SessionPlayAttendanceResponseDto, nullable: true })
  viewerAttendance!: SessionPlayAttendanceResponseDto | null;

  @ApiPropertyOptional({ type: [SessionScheduleProximityWarningDto] })
  proximityWarnings!: SessionScheduleProximityWarningDto[];
}

export class SessionApplicationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: UserResponseDto })
  applicant!: UserResponseDto;

  @ApiProperty({ enum: SessionApplicationStatus })
  status!: SessionApplicationStatus;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ enum: SessionJoinTiming, nullable: true })
  joinTiming!: SessionJoinTiming | null;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ nullable: true })
  resolvedAt!: string | null;
}

export class ActivePlayResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  playId!: string;

  @ApiProperty()
  acquiredAt!: string;

  @ApiProperty()
  heartbeatAt!: string;
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

  @ApiPropertyOptional({ nullable: true })
  currentSceneTitle!: string | null;

  @ApiProperty()
  lastActivityAt!: string;
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

export class SessionInviteScenarioPreviewDto {
  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  difficulty!: string | null;

  @ApiPropertyOptional({ type: [String] })
  tags!: string[];

  @ApiProperty({ minimum: 1, maximum: 20 })
  startLevel!: number;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 20 })
  recommendedEndLevel!: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  estimatedMinutes!: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 8 })
  recommendedPlayersMin!: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 8 })
  recommendedPlayersMax!: number | null;
}

export class SessionInvitePreviewResponseDto {
  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: GmMode })
  @IsEnum(GmMode)
  gmMode!: GmMode;

  @ApiProperty()
  participantCount!: number;

  @ApiProperty()
  maxParticipants!: number;

  @ApiPropertyOptional({ nullable: true })
  nextSessionAt!: string | null;

  @ApiProperty({ type: SessionInviteScenarioPreviewDto })
  scenario!: SessionInviteScenarioPreviewDto;
}

export class HumanGmMessageDto {
  @ApiProperty({ example: "The innkeeper leans forward and lowers their voice." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(HUMAN_GM_MESSAGE_CONTENT_MAX_LENGTH)
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
  @MaxLength(HUMAN_GM_PRIVATE_NOTE_MAX_LENGTH)
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

export class SessionNodeTransitionResponseDto {
  @ApiProperty({ type: SessionSnapshotDto })
  snapshot!: SessionSnapshotDto;

  @ApiProperty({ type: PlayerScenarioViewDto })
  playerScenario!: PlayerScenarioViewDto;
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
  @Min(VTT_ENCOUNTER_PRIORITY_MIN)
  @Max(VTT_ENCOUNTER_PRIORITY_MAX)
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
  @ApiProperty({ enum: VTT_DOOR_STATE_VALUES })
  @IsIn(VTT_DOOR_STATE_VALUES)
  state!: VttDoorState;

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
  @Min(VTT_CHECK_DC_MIN)
  @Max(VTT_CHECK_DC_MAX)
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
  @Min(VTT_CHECK_DC_MIN)
  @Max(VTT_CHECK_DC_MAX)
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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  canBreak?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  broken?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(VTT_CHECK_DC_MIN)
  @Max(VTT_CHECK_DC_MAX)
  breakCheckDc?: number | null;

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

type VttMapDeltaPatchKey = Exclude<
  keyof VttMapStateDto,
  "id" | "tokens" | "objectCells" | "updatedAt"
>;

export type VttMapDeltaPatchDto = {
  [K in VttMapDeltaPatchKey]?: Exclude<VttMapStateDto[K], undefined> | null;
};

export class VttMapDeltaDto {
  @ApiProperty()
  mapId!: string;

  @ApiProperty()
  baseUpdatedAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: Object })
  patch!: VttMapDeltaPatchDto;

  @ApiProperty({ type: [VttMapTokenDto] })
  changedTokens!: VttMapTokenDto[];

  @ApiProperty({ type: [String] })
  removedTokenIds!: string[];

  @ApiPropertyOptional({ type: [String] })
  tokenOrder?: string[];

  @ApiProperty({ type: [VttObjectCellDto] })
  changedObjectCells!: VttObjectCellDto[];

  @ApiProperty({ type: [String] })
  removedObjectCellIds!: string[];

  @ApiPropertyOptional({ type: [String] })
  objectCellOrder?: string[];

  @ApiProperty()
  objectCellsDefined!: boolean;
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
  @ApiProperty({ enum: VTT_MAP_INTERACTION_KIND_VALUES })
  @IsIn(VTT_MAP_INTERACTION_KIND_VALUES)
  kind!: VttMapInteractionKind;

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
  checkOptions?: MainCommandCheckOptionDto[];

  @ApiPropertyOptional({ type: Object, nullable: true })
  data?: MainCommandResponseDataDto | null;
}
