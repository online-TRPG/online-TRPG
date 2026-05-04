import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { AiTraceKind, AiTraceStatus } from "../../constants/enums";

export class AiNarrationRequestDto {
  @ApiProperty({ example: "I cautiously push the heavy stone door." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  rawInput!: string;

  @ApiProperty({ example: "Player attempts to push the stone door." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  actionSummary!: string;

  @ApiPropertyOptional({ example: "STR check 15 vs DC 12 (success)" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  diceSummary?: string;

  @ApiPropertyOptional({ example: "mysterious", default: "mysterious" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sceneTone?: string;
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
  recentLogs?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  publicClues?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nodeId?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  logs!: string[];

  @ApiPropertyOptional({ default: false })
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
  recentContext?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  selectedActionId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  dialogueIntent!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
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
}

export class AiTraceListResponseDto {
  @ApiProperty({ type: [AiTraceResponseDto] })
  items!: AiTraceResponseDto[];

  @ApiProperty()
  size!: number;
}
