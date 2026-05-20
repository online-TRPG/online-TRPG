import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
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
import { VttMapStateDto } from "./sessions.dto";

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

  @ApiPropertyOptional({
    description:
      "사용자가 입력창에 적은 원문입니다. 슬래시 명령어처럼 처리용 본문과 로그 표시용 원문이 다를 때 사용합니다.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rawInputText?: string;

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

  @ApiPropertyOptional({ default: 15 })
  dc?: number;

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
  @IsObject()
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
  twoWeaponAttackAvailable!: boolean;

  @ApiProperty()
  sneakAttackAvailable!: boolean;

  @ApiProperty()
  movementFtTotal!: number;

  @ApiProperty()
  movementFtRemaining!: number;

  @ApiProperty()
  spellSlotLevel1Total!: number;

  @ApiProperty()
  spellSlotLevel1Remaining!: number;
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

  @ApiProperty({ type: CombatActionResourcesDto })
  actionResources!: CombatActionResourcesDto;
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

export class ApplyCombatDamageDto {
  @ApiProperty()
  @IsString()
  targetParticipantId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  amount!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  healing?: boolean;
}

export class ResolveCombatAttackDto {
  @ApiProperty()
  @IsString()
  attackerParticipantId!: string;

  @ApiProperty()
  @IsString()
  targetParticipantId!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  attackBonus?: number;

  @ApiPropertyOptional({ default: "1d6" })
  @IsOptional()
  @IsString()
  damageDice?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  damageBonus?: number;
}

export class EquippedWeaponAttackDto {
  @ApiProperty()
  @IsString()
  targetParticipantId!: string;
}

export class CombatBasicActionDto {}

export class CombatMapPointDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  x!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  y!: number;
}

export class CastCombatSpellDto {
  @ApiProperty()
  @IsString()
  spellId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  targetParticipantIds?: string[];

  @ApiPropertyOptional({ type: CombatMapPointDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CombatMapPointDto)
  point?: CombatMapPointDto | null;
}

export class MoveCombatParticipantDto {
  @ApiProperty()
  @IsString()
  participantId!: string;

  @ApiProperty({ type: CombatMapPointDto })
  @ValidateNested()
  @Type(() => CombatMapPointDto)
  to!: CombatMapPointDto;

  @ApiPropertyOptional({ type: [CombatMapPointDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CombatMapPointDto)
  path?: CombatMapPointDto[];

  @ApiPropertyOptional({ enum: ["normal", "jump"], default: "normal" })
  @IsOptional()
  @IsString()
  movementMode?: "normal" | "jump";
}

export class CombatReactionPromptDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  type!: "opportunity_attack" | "shield";

  @ApiProperty()
  reactorParticipantId!: string;

  @ApiProperty()
  reactorName!: string;

  @ApiProperty()
  moverParticipantId!: string;

  @ApiProperty()
  moverName!: string;

  @ApiProperty()
  message!: string;
}

export class CombatReactionResponseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reactionId!: string;
}

export class CombatMoveResultDto {
  @ApiProperty({ type: CombatResponseDto })
  combat!: CombatResponseDto;

  @ApiProperty({ type: Object })
  map!: VttMapStateDto;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ type: CombatReactionPromptDto, nullable: true })
  pendingReaction!: CombatReactionPromptDto | null;
}

export class AutoMonsterTurnDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  targetParticipantId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  actionId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoEndTurn?: boolean;
}

export class CombatActionResultDto {
  @ApiProperty({ type: CombatResponseDto })
  combat!: CombatResponseDto;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ nullable: true })
  attackTotal!: number | null;

  @ApiPropertyOptional({ nullable: true })
  damageTotal!: number | null;

  @ApiPropertyOptional({ nullable: true })
  turnLogId?: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  map?: VttMapStateDto | null;
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
