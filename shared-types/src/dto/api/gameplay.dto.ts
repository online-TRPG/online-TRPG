import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import {
  ActionInputType,
  ActionOutcome,
  ActionQueueStatus,
  ActionScope,
  CombatEntityType,
  CombatStatus,
  DiceAdvantageState,
  MainCommandCategory,
  MainCommandIntent,
  MainCommandScreenType,
  MainCommandStatus,
  MainCommandTargetType,
} from "../../constants/enums";
import { SessionCharacterResponseDto } from "./characters.dto";

export class SubmitActionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  characterId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  rawText!: string;

  @ApiProperty()
  @IsDateString()
  clientCreatedAt!: string;

  @ApiPropertyOptional({ enum: ActionScope })
  @IsOptional()
  @IsEnum(ActionScope)
  actionScope?: ActionScope;

  @ApiPropertyOptional({ enum: ActionInputType })
  @IsOptional()
  @IsEnum(ActionInputType)
  inputType?: ActionInputType;
}

export class ActionAcceptedResponseDto {
  @ApiProperty()
  playerActionId!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ enum: ActionQueueStatus })
  queueStatus!: ActionQueueStatus;

  @ApiProperty()
  baseStateVersion!: number;
}

export class UseInventoryItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  targetSessionCharacterId?: string | null;
}

export class UseInventoryItemResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  itemId!: string;

  @ApiProperty()
  itemName!: string;

  @ApiProperty()
  consumedQuantity!: number;

  @ApiPropertyOptional({ nullable: true })
  healedHp!: number | null;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: SessionCharacterResponseDto })
  character!: SessionCharacterResponseDto;
}

export class MainCommandPointDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  x!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  y!: number;
}

export class SubmitMainCommandDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  commandId!: string;

  @ApiProperty({ enum: MainCommandScreenType })
  @IsEnum(MainCommandScreenType)
  screenType!: MainCommandScreenType;

  @ApiProperty({ enum: MainCommandCategory })
  @IsEnum(MainCommandCategory)
  category!: MainCommandCategory;

  @ApiProperty({ enum: MainCommandIntent })
  @IsEnum(MainCommandIntent)
  intent!: MainCommandIntent;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  actorId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  playerText!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetId?: string;

  @ApiPropertyOptional({ enum: MainCommandTargetType })
  @IsOptional()
  @IsEnum(MainCommandTargetType)
  targetType?: MainCommandTargetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  itemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  spellId?: string;

  @ApiPropertyOptional({ type: MainCommandPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MainCommandPointDto)
  mapPoint?: MainCommandPointDto;

  @ApiPropertyOptional({ enum: MainCommandIntent })
  @IsOptional()
  @IsEnum(MainCommandIntent)
  relatedIntent?: MainCommandIntent;
}

export class MainCommandCheckOptionDto {
  @ApiPropertyOptional()
  ability?: string;

  @ApiPropertyOptional()
  skill?: string;

  @ApiProperty()
  reason!: string;
}

export class MainCommandActionCandidateDto {
  @ApiProperty()
  actorId!: string;

  @ApiPropertyOptional({ nullable: true })
  targetId?: string | null;

  @ApiProperty()
  actionSummary!: string;

  @ApiPropertyOptional({ nullable: true })
  declaredMethod?: string | null;
}

export class MainCommandResponseDto {
  @ApiProperty()
  requestId!: string;

  @ApiProperty({ enum: MainCommandStatus })
  status!: MainCommandStatus;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ type: [MainCommandCheckOptionDto] })
  checkOptions?: MainCommandCheckOptionDto[];

  @ApiPropertyOptional({ type: MainCommandActionCandidateDto })
  actionCandidate?: MainCommandActionCandidateDto;

  @ApiPropertyOptional({ type: Object, nullable: true })
  statePatch?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  data?: Record<string, unknown> | null;
}

export class ResolveMainCommandCheckDto {
  @ApiProperty({ enum: ActionOutcome })
  @IsEnum(ActionOutcome)
  outcome!: ActionOutcome;

  @ApiProperty({ type: Object })
  effect!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class DiceRollRequestDto {
  @ApiProperty({ example: "1d20+3" })
  @IsString()
  @IsNotEmpty()
  expression!: string;

  @ApiPropertyOptional({ enum: DiceAdvantageState, default: DiceAdvantageState.NORMAL })
  @IsOptional()
  @IsEnum(DiceAdvantageState)
  advantageState?: DiceAdvantageState;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  turnLogId?: string;
}

export class DiceRollResponseDto {
  @ApiProperty()
  expression!: string;

  @ApiProperty({ type: [Number] })
  rolls!: number[];

  @ApiProperty()
  modifier!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ enum: DiceAdvantageState })
  advantageState!: DiceAdvantageState;
}

export class TurnLogResponseDto {
  @ApiProperty()
  turnLogId!: string;

  @ApiProperty()
  turnNumber!: number;

  @ApiPropertyOptional({ nullable: true })
  playerActionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  actorUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sessionCharacterId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  actionClientCreatedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  actionCreatedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  rawInput!: string | null;

  @ApiProperty({ type: Object, nullable: true })
  structuredAction!: Record<string, unknown> | null;

  @ApiProperty({ type: Object, nullable: true })
  diceResult!: Record<string, unknown> | null;

  @ApiProperty({ type: Object, nullable: true })
  stateDiff!: Record<string, unknown> | null;

  @ApiProperty({ enum: ActionOutcome })
  outcome!: ActionOutcome;

  @ApiPropertyOptional({ nullable: true })
  narration!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class TurnLogListResponseDto {
  @ApiProperty({ type: [TurnLogResponseDto] })
  turnLogs!: TurnLogResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor!: string | null;
}

export class StartCombatDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  participantEntityIds?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoRollInitiative?: boolean;
}

export class CombatParticipantResponseDto {
  @ApiProperty()
  sessionEntityId!: string;

  @ApiProperty({ enum: CombatEntityType })
  entityType!: CombatEntityType;

  @ApiPropertyOptional({ nullable: true })
  sessionCharacterId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  tokenId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  currentHp!: number | null;

  @ApiPropertyOptional({ nullable: true })
  maxHp!: number | null;

  @ApiPropertyOptional({ nullable: true })
  armorClass!: number | null;

  @ApiProperty()
  initiative!: number;

  @ApiProperty()
  turnOrder!: number;

  @ApiProperty()
  isAlive!: boolean;

  @ApiProperty()
  isHostile!: boolean;

  @ApiProperty()
  hasActedThisRound!: boolean;

  @ApiProperty({ type: [String] })
  conditions!: string[];

  @ApiProperty({ type: () => CombatActionResourcesDto })
  actionResources!: CombatActionResourcesDto;
}

export class CombatActionResourcesDto {
  @ApiProperty()
  actionAvailable!: boolean;

  @ApiProperty()
  bonusActionAvailable!: boolean;

  @ApiProperty()
  reactionAvailable!: boolean;

  @ApiProperty()
  additionalActionAvailable!: boolean;

  @ApiProperty()
  movementFtTotal!: number;

  @ApiProperty()
  movementFtRemaining!: number;
}

export class CombatResponseDto {
  @ApiProperty()
  combatId!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ enum: CombatStatus })
  status!: CombatStatus;

  @ApiProperty()
  roundNo!: number;

  @ApiProperty()
  turnNo!: number;

  @ApiProperty()
  roundTurnNo!: number;

  @ApiPropertyOptional({ nullable: true })
  currentEntityId!: string | null;

  @ApiProperty({ type: [CombatParticipantResponseDto] })
  participants!: CombatParticipantResponseDto[];
}

export class AvailableActionDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;
}

export class AvailableActionsResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  characterId!: string;

  @ApiProperty()
  isCurrentTurn!: boolean;

  @ApiProperty({ type: [AvailableActionDto] })
  actions!: AvailableActionDto[];
}

export class EndTurnDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  force?: boolean;
}

export class TurnAdvanceResponseDto {
  @ApiProperty()
  combatId!: string;

  @ApiPropertyOptional({ nullable: true })
  endedEntityId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  nextEntityId!: string | null;

  @ApiProperty()
  roundNo!: number;

  @ApiProperty()
  turnNo!: number;
}

export class StateDiffResponseDto {
  @ApiProperty()
  baseVersion!: number;

  @ApiProperty()
  nextVersion!: number;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ type: Object })
  diff!: Record<string, unknown>;
}
