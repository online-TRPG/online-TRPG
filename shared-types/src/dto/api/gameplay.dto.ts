import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  ActionInputType,
  ActionOutcome,
  ActionQueueStatus,
  ActionScope,
  CombatEntityType,
  CombatStatus,
  DiceAdvantageState,
} from "../../constants/enums";

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
