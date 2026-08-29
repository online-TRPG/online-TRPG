import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { AiTraceKind, AiTraceStatus } from "../../constants/enums";
import { HUMAN_GM_AI_ASSIST_PROMPT_MAX_LENGTH } from "../../constants/runtime-limits";

export class AiNarrationActionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  type!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  actorCharacterId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  spellId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  featureId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  attackKind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ability?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  skill?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  approach!: string;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @ApiProperty()
  @IsBoolean()
  requiresRoll!: boolean;

  @ApiPropertyOptional({ enum: ["easy", "medium", "hard"] })
  @IsOptional()
  @IsIn(["easy", "medium", "hard"])
  suggestedDifficulty?: string;
}

export class AiNarrationCheckRequestDto {
  @ApiProperty({ enum: ["ability_check", "skill_check", "saving_throw", "attack_roll", "contest"] })
  @IsIn(["ability_check", "skill_check", "saving_throw", "attack_roll", "contest"])
  checkType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ability?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  skill?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 40 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40)
  difficultyClass?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

export class AiNarrationDiceResultDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  rollerId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  formula!: string;

  @ApiProperty()
  @IsInt()
  total!: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  naturalD20?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  success?: boolean;
}

export class AiNarrationStateDiffSummaryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  summary!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  changedFlags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  hpChanges?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  inventoryChanges?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  conditionChanges?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nodeChange?: string;
}

export class AiNarrationSceneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  summary!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tone!: string;
}

export class AiNarrationRequestDto {
  @ApiPropertyOptional({
    deprecated: true,
    description: "v1 입력 호환 전용. 구조화 Narrator 내부 요청이나 provider prompt로 전달하지 않음",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rawInput?: string;

  @ApiProperty({ type: AiNarrationActionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AiNarrationActionDto)
  action!: AiNarrationActionDto;

  @ApiPropertyOptional({ type: AiNarrationCheckRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiNarrationCheckRequestDto)
  checkRequest?: AiNarrationCheckRequestDto;

  @ApiPropertyOptional({ type: AiNarrationDiceResultDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiNarrationDiceResultDto)
  diceResult?: AiNarrationDiceResultDto;

  @ApiPropertyOptional({ type: AiNarrationStateDiffSummaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiNarrationStateDiffSummaryDto)
  stateDiffSummary?: AiNarrationStateDiffSummaryDto;

  @ApiProperty({ type: AiNarrationSceneDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AiNarrationSceneDto)
  scene!: AiNarrationSceneDto;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  actionSummary?: string;

  @ApiPropertyOptional({
    example: "STR check 15 vs DC 12 (success)",
    deprecated: true,
    description: "Legacy compatibility field; structured diceResult is authoritative.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  diceSummary?: string;

  @ApiPropertyOptional({
    example: "mysterious",
    default: "mysterious",
    deprecated: true,
    description: "Legacy compatibility field; scene.tone is authoritative.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sceneTone?: string;

  @ApiPropertyOptional({ minimum: 80, maximum: 1200, default: 500 })
  @IsOptional()
  @IsInt()
  @Min(80)
  @Max(1200)
  maxLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  turnId?: string;
}

export class AiNarrationParsedDto {
  @ApiProperty({ example: "The door groans as it slowly grinds open..." })
  narration!: string;

  @ApiProperty({ example: "The stone door is now open." })
  visibleSummary!: string;
}

export class AiNarrationResponseDto {
  @ApiProperty({ type: AiNarrationParsedDto })
  parsed!: AiNarrationParsedDto;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  latencyMs!: number;

  @ApiProperty()
  traceId!: string;

  @ApiPropertyOptional({ description: "응답이 template fallback인지 여부" })
  fallback?: boolean;

  @ApiPropertyOptional({ nullable: true, description: "fallback인 경우 사유" })
  fallbackReason?: string | null;
}

export type AiHintLevel = "LIGHT" | "NORMAL" | "STRONG";

export class AiHintRequestDto {
  @ApiPropertyOptional({ enum: ["LIGHT", "NORMAL", "STRONG"], default: "NORMAL" })
  @IsOptional()
  @IsIn(["LIGHT", "NORMAL", "STRONG"])
  hintLevel?: AiHintLevel;

  @ApiPropertyOptional({ example: "함정을 어떻게 우회할 수 있을까?" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  question?: string;

  @ApiProperty({ example: "낡은 석문 앞. 손잡이와 틈새가 보인다." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1200)
  sceneSummary!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  recentLogs?: string[];

  @ApiPropertyOptional({
    type: [String],
    deprecated: true,
    description: "Ignored for trust safety. The backend selects confirmed public clues.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  publicClues?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  triedApproaches?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  turnId?: string;
}

export class AiHintParsedDto {
  @ApiProperty()
  hintLevel!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  sourceScope!: string;

  @ApiProperty()
  spoilerLevel!: string;

  @ApiProperty({ type: [String] })
  suggestions!: string[];

  @ApiPropertyOptional({ type: [String] })
  safetyNotes?: string[];
}

export class AiHintResponseDto {
  @ApiProperty({ type: AiHintParsedDto })
  parsed!: AiHintParsedDto;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  latencyMs!: number;

  @ApiProperty()
  traceId!: string;

  @ApiPropertyOptional()
  fallback?: boolean;

  @ApiPropertyOptional({ nullable: true })
  fallbackReason?: string | null;
}

export class AiHumanGmAssistSuggestionRequestDto {
  @ApiProperty({ enum: ["scene_text", "npc_dialogue", "node_move", "combat", "rules", "other"] })
  @IsIn(["scene_text", "npc_dialogue", "node_move", "combat", "rules", "other"])
  assistType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(HUMAN_GM_AI_ASSIST_PROMPT_MAX_LENGTH)
  prompt!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1200)
  sceneSummary!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  recentLogs?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  suggestedActionId?: string | null;
}

export type AiSummaryType = "player_visible" | "ai_context";
export type AiSummaryRange = "RECENT" | "FULL" | "SINCE_NODE";

export class AiSummaryRequestDto {
  @ApiPropertyOptional({ enum: ["player_visible", "ai_context"], default: "player_visible" })
  @IsOptional()
  @IsIn(["player_visible", "ai_context"])
  summaryType?: AiSummaryType;

  @ApiPropertyOptional({ enum: ["RECENT", "FULL", "SINCE_NODE"], default: "RECENT" })
  @IsOptional()
  @IsIn(["RECENT", "FULL", "SINCE_NODE"])
  rangeType?: AiSummaryRange;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  lastLogCount?: number;

  @ApiPropertyOptional({
    deprecated: true,
    description: "Unsupported until turn logs carry server-verified node metadata.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nodeId?: string;

  @ApiPropertyOptional({
    type: [String],
    deprecated: true,
    description: "Deprecated compatibility field. The backend selects confirmed public logs.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  logs?: string[];

  @ApiPropertyOptional({
    default: false,
    deprecated: true,
    description: "true is rejected until turn logs carry server-verified visibility metadata.",
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeHiddenContext?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  turnId?: string;
}

export class AiSummaryParsedDto {
  @ApiProperty()
  summaryType!: string;

  @ApiProperty()
  coveredTurnRange!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ type: [String] })
  keyFacts!: string[];

  @ApiPropertyOptional({ type: [String] })
  safetyNotes?: string[];
}

export class AiSummaryResponseDto {
  @ApiProperty({ type: AiSummaryParsedDto })
  parsed!: AiSummaryParsedDto;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  latencyMs!: number;

  @ApiProperty()
  traceId!: string;

  @ApiPropertyOptional()
  fallback?: boolean;

  @ApiPropertyOptional({ nullable: true })
  fallbackReason?: string | null;
}

export class AiNpcDialogueRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  npcEntityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  npcName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  npcSummary!: string;

  @ApiPropertyOptional({ default: "neutral" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  disposition?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1200)
  sceneSummary!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  recentContext?: string[];

  @ApiPropertyOptional({
    deprecated: true,
    description: "Deprecated compatibility field; not forwarded to the AI service.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  selectedActionId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  dialogueIntent!: string;

  @ApiPropertyOptional({
    type: [String],
    deprecated: true,
    description: "Deprecated compatibility field; not forwarded to the AI service.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  audienceIds?: string[];

  @ApiPropertyOptional({ minimum: 20, maximum: 500, default: 160 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(500)
  maxLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  turnId?: string;
}

export class AiNpcDialogueParsedDto {
  @ApiProperty()
  dialogue!: string;

  @ApiProperty()
  tone!: string;

  @ApiPropertyOptional({ type: [String] })
  safetyNotes?: string[];
}

export class AiNpcDialogueResponseDto {
  @ApiProperty({ type: AiNpcDialogueParsedDto })
  parsed!: AiNpcDialogueParsedDto;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  latencyMs!: number;

  @ApiProperty()
  traceId!: string;

  @ApiPropertyOptional()
  fallback?: boolean;

  @ApiPropertyOptional({ nullable: true })
  fallbackReason?: string | null;
}

export class AiTraceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: AiTraceKind })
  kind!: AiTraceKind;

  @ApiProperty({ enum: AiTraceStatus })
  status!: AiTraceStatus;

  @ApiProperty()
  latencyMs!: number;

  @ApiPropertyOptional({ nullable: true })
  provider!: string | null;

  @ApiPropertyOptional({ nullable: true })
  model!: string | null;

  @ApiPropertyOptional({ nullable: true })
  failureType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class AiTraceListQueryDto {
  @ApiPropertyOptional({ enum: AiTraceKind })
  @IsOptional()
  @IsEnum(AiTraceKind)
  kind?: AiTraceKind;

  @ApiPropertyOptional({ enum: AiTraceStatus })
  @IsOptional()
  @IsEnum(AiTraceStatus)
  status?: AiTraceStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;

  @ApiPropertyOptional({ description: "이전 응답의 nextCursor 값" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;
}

export class AiTraceListResponseDto {
  @ApiProperty({ type: [AiTraceResponseDto] })
  items!: AiTraceResponseDto[];

  @ApiProperty()
  size!: number;

  @ApiPropertyOptional({ nullable: true })
  nextCursor!: string | null;
}

export class AiRoleUsageMetricsDto {
  @ApiProperty({ enum: AiTraceKind })
  kind!: AiTraceKind;

  @ApiPropertyOptional({ nullable: true, description: "역할별 system prompt 계약 버전" })
  promptVersion!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "해당 표본에 사용된 provider model" })
  model!: string | null;

  @ApiProperty()
  traceCount!: number;

  @ApiProperty({ description: "하위 호환용 total token 표본 수 alias" })
  tokenSampleCount!: number;

  @ApiProperty({ description: "prompt token percentile 계산에 포함된 trace 수" })
  promptTokenSampleCount!: number;

  @ApiProperty({ description: "output token percentile 계산에 포함된 trace 수" })
  outputTokenSampleCount!: number;

  @ApiProperty({ description: "total token percentile 계산에 포함된 trace 수" })
  totalTokenSampleCount!: number;

  @ApiProperty({ description: "schema 재시도율 계산에 포함된 trace 수" })
  schemaSampleCount!: number;

  @ApiPropertyOptional({ nullable: true })
  promptTokenP50!: number | null;

  @ApiPropertyOptional({ nullable: true })
  promptTokenP95!: number | null;

  @ApiPropertyOptional({ nullable: true })
  outputTokenP50!: number | null;

  @ApiPropertyOptional({ nullable: true })
  outputTokenP95!: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalTokenP50!: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalTokenP95!: number | null;

  @ApiPropertyOptional({ nullable: true })
  providerLatencyP50Ms!: number | null;

  @ApiPropertyOptional({ nullable: true })
  providerLatencyP95Ms!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "schema 계측 trace 중 검증 실패로 한 번 이상 재시도한 비율. 표본이 없으면 null",
  })
  schemaRetryRate!: number | null;
}

export class AiTraceQualityMetricsResponseDto {
  @ApiProperty()
  totalTraces!: number;

  @ApiProperty()
  averageLatencyMs!: number;

  @ApiProperty()
  interpreterTimeoutRate!: number;

  @ApiProperty()
  narratorTimeoutRate!: number;

  @ApiProperty()
  fallbackRate!: number;

  @ApiProperty()
  interpreterTimeoutTargetMet!: boolean;

  @ApiProperty()
  narratorTimeoutTargetMet!: boolean;

  @ApiProperty()
  fallbackTargetMet!: boolean;

  @ApiProperty({ type: [AiRoleUsageMetricsDto] })
  roleUsage!: AiRoleUsageMetricsDto[];

  @ApiProperty({
    type: [String],
    description: "정답 라벨이 있는 별도 평가 데이터셋으로 확인해야 하는 품질 항목",
  })
  offlineEvaluationRequired!: string[];
}
