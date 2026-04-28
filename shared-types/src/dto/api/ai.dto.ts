import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { AiTraceKind, AiTraceStatus } from "../../constants/enums";

export class AiNarrationRequestDto {
  @ApiProperty({ example: "I cautiously push the heavy stone door." })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  rawInput!: string;

  @ApiProperty({ example: "Player attempts to push the stone door." })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
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
