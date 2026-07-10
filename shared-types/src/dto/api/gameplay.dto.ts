import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  Max,
  IsNotEmpty,
  Min,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
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
import { MAIN_COMMAND_CHECK_EFFECT_TYPES, VTT_CHECK_EFFECT_ACTIONS } from "../../constants/main-command-check-effects";
import { SessionCharacterResponseDto } from "./characters.dto";
import { VttMapStateDto } from "./sessions.dto";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasStringField(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string" && value[key].trim().length > 0;
}

function hasOptionalNullableStringField(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || value[key] === null || typeof value[key] === "string";
}

function hasOptionalStringField(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === "string";
}

const mainCommandIntentValues: readonly MainCommandIntent[] = [
  MainCommandIntent.GENERAL_GM_REQUEST,
  MainCommandIntent.TALK_TO_NPC,
  MainCommandIntent.SOCIAL_PERSUADE,
  MainCommandIntent.SOCIAL_INTIMIDATE,
  MainCommandIntent.SOCIAL_DECEIVE,
  MainCommandIntent.READ_EMOTION,
  MainCommandIntent.ASK_SCENE_INFO,
  MainCommandIntent.INSPECT_STORY_OBJECT,
  MainCommandIntent.DECLARE_RP_ACTION,
  MainCommandIntent.ASK_HINT,
  MainCommandIntent.ASK_SUMMARY,
  MainCommandIntent.REQUEST_SCENE_TRANSITION,
  MainCommandIntent.OBSERVE_AREA,
  MainCommandIntent.INVESTIGATE_OBJECT,
  MainCommandIntent.LISTEN,
  MainCommandIntent.DETECT_DANGER,
  MainCommandIntent.SPECIAL_MOVE,
  MainCommandIntent.INTERACT_OBJECT,
  MainCommandIntent.USE_TOOL,
  MainCommandIntent.USE_ITEM_EXPLORE,
  MainCommandIntent.SPLIT_PARTY_TASK,
  MainCommandIntent.COMBAT_MANEUVER,
  MainCommandIntent.ENVIRONMENT_USE,
  MainCommandIntent.IMPROVISED_ATTACK,
  MainCommandIntent.CALLED_SHOT,
  MainCommandIntent.READY_ACTION,
  MainCommandIntent.REACTION_REQUEST,
  MainCommandIntent.COMBAT_TALK,
  MainCommandIntent.USE_ITEM_COMBAT,
  MainCommandIntent.USE_SPELL_CREATIVELY,
  MainCommandIntent.TACTIC_QUERY,
  MainCommandIntent.ASK_RULE,
];

const mainCommandScreenTypeValues: readonly MainCommandScreenType[] = [
  MainCommandScreenType.STORY,
  MainCommandScreenType.EXPLORATION,
  MainCommandScreenType.COMBAT,
];

function isMainCommandIntent(value: unknown): value is MainCommandIntent {
  return mainCommandIntentValues.some((entry) => entry === value);
}

function isMainCommandScreenType(value: unknown): value is MainCommandScreenType {
  return mainCommandScreenTypeValues.some((entry) => entry === value);
}

function isMapPoint(value: unknown): value is { x: number; y: number } {
  return (
    isPlainRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isOptionalMapPoint(value: unknown): boolean {
  return value === undefined || value === null || isMapPoint(value);
}

function isD20Roll(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20;
}

function isMainCommandCheckOption(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (!isPlainRecord(value)) {
    return false;
  }
  const dcOk = value.dc === undefined || (typeof value.dc === "number" && Number.isInteger(value.dc) && value.dc >= 1 && value.dc <= 40);
  return (
    hasOptionalStringField(value, "ability") &&
    hasOptionalStringField(value, "skill") &&
    dcOk &&
    hasStringField(value, "reason")
  );
}

function isMainCommandActionCandidate(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    hasStringField(value, "actorId") &&
    hasOptionalNullableStringField(value, "targetId") &&
    hasStringField(value, "actionSummary") &&
    hasOptionalNullableStringField(value, "declaredMethod")
  );
}

@ValidatorConstraint({ name: "mainCommandCheckEffect", async: false })
class MainCommandCheckEffectConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!isPlainRecord(value)) {
      return false;
    }

    switch (value.type) {
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.MAIN_COMMAND_CHECK:
        return (
          hasStringField(value, "requestId") &&
          hasStringField(value, "nodeId") &&
          hasStringField(value, "sessionCharacterId") &&
          isMainCommandIntent(value.intent) &&
          isMainCommandScreenType(value.screenType) &&
          typeof value.playerText === "string" &&
          typeof value.actionSummary === "string" &&
          hasOptionalNullableStringField(value, "targetId") &&
          hasOptionalNullableStringField(value, "targetName") &&
          hasOptionalNullableStringField(value, "targetSummary") &&
          hasOptionalNullableStringField(value, "targetDisposition") &&
          hasOptionalNullableStringField(value, "itemId") &&
          hasOptionalNullableStringField(value, "itemName") &&
          isOptionalMapPoint(value.mapPoint) &&
          isMainCommandCheckOption(value.checkOption) &&
          Array.isArray(value.visibleEntityNames) &&
          value.visibleEntityNames.every((entry) => typeof entry === "string") &&
          Array.isArray(value.publicClues) &&
          value.publicClues.every((entry) => typeof entry === "string") &&
          typeof value.sceneText === "string" &&
          isMainCommandActionCandidate(value.actionCandidate)
        );
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_DOOR:
        return (
          hasStringField(value, "doorId") &&
          (value.effect === VTT_CHECK_EFFECT_ACTIONS.OPEN || value.effect === VTT_CHECK_EFFECT_ACTIONS.BROKEN) &&
          hasStringField(value, "nodeId") &&
          isMapPoint(value.mapPoint)
        );
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_HAZARD:
        return (
          hasStringField(value, "hazardId") &&
          value.effect === VTT_CHECK_EFFECT_ACTIONS.DISARM &&
          hasStringField(value, "nodeId") &&
          isMapPoint(value.mapPoint)
        );
      case MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_OBJECT:
        return (
          hasStringField(value, "objectId") &&
          value.effect === VTT_CHECK_EFFECT_ACTIONS.BROKEN &&
          hasStringField(value, "nodeId") &&
          isMapPoint(value.mapPoint)
        );
      default:
        return false;
    }
  }

  defaultMessage(): string {
    return "effect must be a valid main-command check effect";
  }
}

@ValidatorConstraint({ name: "mainCommandDiceResult", async: false })
class MainCommandDiceResultConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }
    if (!isPlainRecord(value)) {
      return false;
    }
    const expressionOk = value.expression === undefined || typeof value.expression === "string";
    const rollsOk = Array.isArray(value.rolls) && value.rolls.length > 0 && value.rolls.every(isD20Roll);
    const modifierOk = value.modifier === undefined || (typeof value.modifier === "number" && Number.isFinite(value.modifier));
    const totalOk = typeof value.total === "number" && Number.isFinite(value.total);
    const advantageOk =
      value.advantageState === undefined ||
      value.advantageState === DiceAdvantageState.NORMAL ||
      value.advantageState === DiceAdvantageState.ADVANTAGE ||
      value.advantageState === DiceAdvantageState.DISADVANTAGE;
    const naturalRollOk = value.naturalRoll === undefined || isD20Roll(value.naturalRoll);
    const dcOk = value.dc === undefined || (typeof value.dc === "number" && Number.isInteger(value.dc) && value.dc >= 1 && value.dc <= 40);
    const outcomeOk =
      value.outcome === undefined ||
      value.outcome === ActionOutcome.SUCCESS ||
      value.outcome === ActionOutcome.FAILURE ||
      value.outcome === ActionOutcome.IMPOSSIBLE ||
      value.outcome === ActionOutcome.NO_ROLL;
    return expressionOk && rollsOk && modifierOk && totalOk && advantageOk && naturalRollOk && dcOk && outcomeOk;
  }

  defaultMessage(): string {
    return "diceResult must be a valid dice result object";
  }
}

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

  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description: "Structured HUMAN GM rest approval status when the accepted action is waiting for or came from rest approval.",
  })
  restApproval?: {
    actionId: string;
    restType: "short" | "long" | null;
    status: "gm_required" | "approved" | "rejected" | "cancelled" | "expired";
    hitDiceToSpend?: number | null;
    expiresAt?: string | null;
  } | null;
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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  targetParticipantId?: string | null;

  @ApiPropertyOptional({ type: () => CombatMapPointDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CombatMapPointDto)
  point?: CombatMapPointDto | null;
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

export class RestActionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  characterId!: string;

  @ApiProperty({ enum: ["short", "long"] })
  @IsString()
  @IsIn(["short", "long"])
  restType!: "short" | "long";

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hitDiceToSpend?: number;
}

export class RestTargetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  characterId!: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hitDiceToSpend?: number;
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

export class VttMapCheckEffectPointDto {
  @ApiProperty()
  x!: number;

  @ApiProperty()
  y!: number;
}

export class VttDoorCheckEffectDto {
  @ApiProperty({ enum: [MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_DOOR] })
  type!: typeof MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_DOOR;

  @ApiProperty()
  doorId!: string;

  @ApiProperty({ enum: [VTT_CHECK_EFFECT_ACTIONS.OPEN, VTT_CHECK_EFFECT_ACTIONS.BROKEN] })
  effect!: typeof VTT_CHECK_EFFECT_ACTIONS.OPEN | typeof VTT_CHECK_EFFECT_ACTIONS.BROKEN;

  @ApiProperty()
  nodeId!: string;

  @ApiProperty({ type: VttMapCheckEffectPointDto })
  mapPoint!: VttMapCheckEffectPointDto;
}

export class VttHazardCheckEffectDto {
  @ApiProperty({ enum: [MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_HAZARD] })
  type!: typeof MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_HAZARD;

  @ApiProperty()
  hazardId!: string;

  @ApiProperty({ enum: [VTT_CHECK_EFFECT_ACTIONS.DISARM] })
  effect!: typeof VTT_CHECK_EFFECT_ACTIONS.DISARM;

  @ApiProperty()
  nodeId!: string;

  @ApiProperty({ type: VttMapCheckEffectPointDto })
  mapPoint!: VttMapCheckEffectPointDto;
}

export class VttObjectCheckEffectDto {
  @ApiProperty({ enum: [MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_OBJECT] })
  type!: typeof MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_OBJECT;

  @ApiProperty()
  objectId!: string;

  @ApiProperty({ enum: [VTT_CHECK_EFFECT_ACTIONS.BROKEN] })
  effect!: typeof VTT_CHECK_EFFECT_ACTIONS.BROKEN;

  @ApiProperty()
  nodeId!: string;

  @ApiProperty({ type: VttMapCheckEffectPointDto })
  mapPoint!: VttMapCheckEffectPointDto;
}

export class MainCommandNarrativeCheckEffectDto {
  @ApiProperty({ enum: [MAIN_COMMAND_CHECK_EFFECT_TYPES.MAIN_COMMAND_CHECK] })
  type!: typeof MAIN_COMMAND_CHECK_EFFECT_TYPES.MAIN_COMMAND_CHECK;

  @ApiProperty()
  requestId!: string;

  @ApiProperty()
  nodeId!: string;

  @ApiProperty()
  sessionCharacterId!: string;

  @ApiProperty({ enum: MainCommandIntent })
  intent!: MainCommandIntent;

  @ApiProperty({ enum: MainCommandScreenType })
  screenType!: MainCommandScreenType;

  @ApiProperty()
  playerText!: string;

  @ApiProperty()
  actionSummary!: string;

  @ApiPropertyOptional({ nullable: true })
  targetId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  targetName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  targetSummary!: string | null;

  @ApiPropertyOptional({ nullable: true })
  targetDisposition!: string | null;

  @ApiPropertyOptional({ nullable: true })
  itemId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  itemName!: string | null;

  @ApiPropertyOptional({ type: VttMapCheckEffectPointDto, nullable: true })
  mapPoint!: VttMapCheckEffectPointDto | null;

  @ApiPropertyOptional({ type: MainCommandCheckOptionDto, nullable: true })
  checkOption!: MainCommandCheckOptionDto | null;

  @ApiProperty({ type: [String] })
  visibleEntityNames!: string[];

  @ApiProperty({ type: [String] })
  publicClues!: string[];

  @ApiProperty()
  sceneText!: string;

  @ApiPropertyOptional({ type: MainCommandActionCandidateDto, nullable: true })
  actionCandidate!: MainCommandActionCandidateDto | null;
}

export type MainCommandCheckEffectDto =
  | MainCommandNarrativeCheckEffectDto
  | VttDoorCheckEffectDto
  | VttHazardCheckEffectDto
  | VttObjectCheckEffectDto;

export class MainCommandResponseDataDto {
  [key: string]: unknown;

  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description: "Deferred effect to apply when a CHECK_REQUIRED response is resolved.",
  })
  checkEffect?: MainCommandCheckEffectDto | null;

  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description: "Effect that was resolved after a pending main-command check.",
  })
  effect?: MainCommandCheckEffectDto | null;
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
  statePatch?: JsonObject | null;

  @ApiPropertyOptional({ type: MainCommandResponseDataDto, nullable: true })
  data?: MainCommandResponseDataDto | null;
}

export class ResolveMainCommandCheckDto {
  @ApiProperty({ enum: ActionOutcome })
  @IsEnum(ActionOutcome)
  outcome!: ActionOutcome;

  @ApiProperty({ type: Object })
  @IsObject()
  @Validate(MainCommandCheckEffectConstraint)
  effect!: MainCommandCheckEffectDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({
    type: Object,
    description:
      "클라이언트 판정 오버레이에서 굴린 d20 결과입니다. 서버는 이를 감사 로그/메인 로그 요약에만 사용합니다.",
  })
  @IsOptional()
  @IsObject()
  @Validate(MainCommandDiceResultConstraint)
  diceResult?: TurnLogDiceResultDto;
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

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export type TurnLogDiceResultDto = {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  advantageState?: DiceAdvantageState;
  naturalRoll?: number;
  dc?: number;
  outcome?: ActionOutcome;
  ability?: string;
  skill?: string;
  damageType?: string;
} & { [key: string]: JsonValue | undefined };

export type TurnLogStructuredActionDto = {
  type?: string;
} & { [key: string]: JsonValue | undefined };
export type TurnLogStateDiffDto = StateDiffResponseDto | JsonObject;

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

  @ApiPropertyOptional({ enum: ActionQueueStatus, nullable: true })
  actionQueueStatus!: ActionQueueStatus | null;

  @ApiPropertyOptional({ nullable: true })
  rawInput!: string | null;

  @ApiProperty({ type: Object, nullable: true })
  structuredAction!: TurnLogStructuredActionDto | null;

  @ApiProperty({ type: Object, nullable: true })
  diceResult!: TurnLogDiceResultDto | null;

  @ApiProperty({ type: Object, nullable: true })
  stateDiff!: TurnLogStateDiffDto | null;

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

export class CombatSpellSlotResourceDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  remaining!: number;
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
  extraAttackAvailable!: boolean;

  @ApiPropertyOptional()
  hasteActionAvailable?: boolean;

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

  @ApiPropertyOptional({ type: Object })
  spellSlots?: Record<string, CombatSpellSlotResourceDto>;
}

export class CombatMonsterActionSaveDto {
  @ApiProperty()
  ability!: string;

  @ApiPropertyOptional({ nullable: true })
  dcSource!: string | null;

  @ApiPropertyOptional({ nullable: true })
  fixedDc?: number | null;
}

export class CombatMonsterActionOptionDto {
  @ApiProperty()
  actionId!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  attackKind!: string;

  @ApiProperty()
  attackBonus!: number;

  @ApiProperty()
  damageDice!: string;

  @ApiPropertyOptional({ nullable: true })
  damageType!: string | null;

  @ApiProperty()
  rangeFt!: number;

  @ApiPropertyOptional({ nullable: true })
  longRangeFt?: number | null;

  @ApiPropertyOptional({ enum: ["high", "medium", "low", "none"], nullable: true })
  confidence?: string | null;

  @ApiPropertyOptional({ nullable: true })
  costType?: string | null;

  @ApiPropertyOptional({ enum: ["none", "self", "single_target", "area"], nullable: true })
  targetKind?: "none" | "self" | "single_target" | "area" | null;

  @ApiPropertyOptional({ enum: ["attack", "save", "special"], nullable: true })
  resolutionKind?: "attack" | "save" | "special" | null;

  @ApiPropertyOptional({ nullable: true })
  specialType?: string | null;

  @ApiPropertyOptional({ nullable: true })
  usage?: string | null;

  @ApiPropertyOptional({ nullable: true })
  recharge?: string | null;

  @ApiPropertyOptional({ type: CombatMonsterActionSaveDto, nullable: true })
  save?: CombatMonsterActionSaveDto | null;

  @ApiPropertyOptional({ type: [String] })
  conditionRiders?: string[];

  @ApiPropertyOptional({ type: [String] })
  effectTags?: string[];

  @ApiPropertyOptional({ type: [Object] })
  childActions?: Array<{ actionId: string; count: number }>;

  @ApiPropertyOptional()
  available?: boolean;

  @ApiPropertyOptional({ nullable: true })
  unavailableReason?: string | null;
}

export class CombatConcentrationStateDto {
  @ApiProperty()
  spellId!: string;

  @ApiProperty({ type: [String] })
  targetIds!: string[];

  @ApiProperty({ type: [String] })
  effectIds!: string[];

  @ApiProperty()
  startedAtRound!: number;

  @ApiPropertyOptional({ nullable: true })
  endsAtRound!: number | null;

  @ApiPropertyOptional({ nullable: true })
  endsAtTurn!: number | null;
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

  @ApiPropertyOptional({ type: CombatConcentrationStateDto, nullable: true })
  concentration!: CombatConcentrationStateDto | null;

  @ApiProperty({ type: CombatActionResourcesDto })
  actionResources!: CombatActionResourcesDto;

  @ApiProperty({ type: [CombatMonsterActionOptionDto] })
  monsterActions!: CombatMonsterActionOptionDto[];
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

  @ApiPropertyOptional({ type: () => [CombatReactionPromptDto] })
  pendingReactions?: CombatReactionPromptDto[];
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

export class CombatTerrainDamagePacketDto {
  @ApiProperty()
  sourceEffectId!: string;

  @ApiProperty()
  damageType!: string;

  @ApiProperty()
  expression!: string;

  @ApiProperty()
  total!: number;
}

export class CombatTerrainEffectResultDto {
  @ApiProperty({ enum: ["on_enter", "on_turn_start", "on_turn_end", "on_exit"] })
  trigger!: "on_enter" | "on_turn_start" | "on_turn_end" | "on_exit";

  @ApiProperty()
  damageTotal!: number;

  @ApiProperty({ type: [CombatTerrainDamagePacketDto] })
  damagePackets!: CombatTerrainDamagePacketDto[];

  @ApiProperty({ type: [String] })
  appliedConditionTags!: string[];

  @ApiProperty({ type: [String] })
  removedConditionTags!: string[];

  @ApiPropertyOptional({ nullable: true })
  concentrationMaintained!: boolean | null;
}

export class CombatMonsterLifecycleEffectDto {
  @ApiProperty()
  actorParticipantId!: string;

  @ApiProperty()
  actorName!: string;

  @ApiProperty()
  actionId!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: ["aura", "turn_start", "turn_end"] })
  hook!: "aura" | "turn_start" | "turn_end";

  @ApiProperty({ type: [String] })
  effectTags!: string[];
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

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({ type: CombatTerrainEffectResultDto, nullable: true })
  terrainEffects?: CombatTerrainEffectResultDto | null;

  @ApiPropertyOptional({ type: CombatTerrainEffectResultDto, nullable: true })
  turnEndTerrainEffects?: CombatTerrainEffectResultDto | null;

  @ApiPropertyOptional({ type: [CombatMonsterLifecycleEffectDto] })
  monsterLifecycleEffects?: CombatMonsterLifecycleEffectDto[];

  @ApiPropertyOptional({ type: () => [CombatReactionPromptDto] })
  pendingReactions?: CombatReactionPromptDto[];
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

  @ApiPropertyOptional({ minimum: 0, maximum: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  slotLevel?: number;

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

export class ForceMoveCombatParticipantDto {
  @ApiProperty()
  @IsString()
  participantId!: string;

  @ApiProperty()
  @IsString()
  @IsIn(["push", "pull", "slide"])
  mode!: "push" | "pull" | "slide";

  @ApiProperty({ type: CombatMapPointDto })
  @ValidateNested()
  @Type(() => CombatMapPointDto)
  origin!: CombatMapPointDto;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  distanceFt!: number;
}

export class CombatReactionPromptDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  type!: "opportunity_attack" | "shield" | "ready_action" | "counterspell";

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

  @ApiPropertyOptional({ type: [CombatReactionPromptDto] })
  pendingReactions?: CombatReactionPromptDto[];

  @ApiPropertyOptional()
  movementDistanceFt?: number;

  @ApiPropertyOptional()
  movementCostFt?: number;

  @ApiPropertyOptional({ type: CombatTerrainEffectResultDto, nullable: true })
  terrainEffects?: CombatTerrainEffectResultDto | null;
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

export class CombatActorActionDto {
  @ApiPropertyOptional({ enum: ["attack", "dash", "dodge", "hide"], default: "attack" })
  @IsOptional()
  @IsIn(["attack", "dash", "dodge", "hide"])
  actionType?: "attack" | "dash" | "dodge" | "hide";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  actionId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  targetParticipantId?: string | null;

  @ApiPropertyOptional({ default: false })
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

  @ApiPropertyOptional({ type: CombatReactionPromptDto, nullable: true })
  pendingReaction?: CombatReactionPromptDto | null;

  @ApiPropertyOptional({ type: [CombatReactionPromptDto] })
  pendingReactions?: CombatReactionPromptDto[];
}

export class StateDiffResponseDto {
  @ApiProperty()
  baseVersion!: number;

  @ApiProperty()
  nextVersion!: number;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ type: Object })
  diff!: JsonObject;
}
