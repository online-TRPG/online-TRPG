import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ScenarioLicense } from "../../constants/enums";

export class ScenarioNodeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  sceneText!: string;

  @ApiProperty()
  visibleToPlayers!: boolean;

  @ApiProperty({ type: [Object] })
  checkOptions!: Record<string, unknown>[];

  @ApiProperty({ type: [Object] })
  transitions!: Record<string, unknown>[];

  @ApiProperty({ type: [Object] })
  clues!: Record<string, unknown>[];

  @ApiPropertyOptional()
  fallbackNodeId?: string | null;
}

export class ScenarioSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  ruleSetId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  difficulty!: string | null;

  @ApiProperty({ enum: ScenarioLicense })
  @IsEnum(ScenarioLicense)
  license!: ScenarioLicense;

  @ApiPropertyOptional({ nullable: true })
  attribution!: string | null;

  @ApiPropertyOptional({ nullable: true })
  startNodeId!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ScenarioResponseDto extends ScenarioSummaryResponseDto {
  @ApiProperty({ type: [ScenarioNodeResponseDto] })
  nodes!: ScenarioNodeResponseDto[];
}

export class GetScenarioParamsDto {
  @ApiProperty()
  @IsString()
  id!: string;
}

export class ScenarioQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateScenarioDto {
  @ApiProperty({ example: "나의 첫 던전" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "dnd5e" })
  @IsOptional()
  @IsString()
  ruleSetId?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "easy" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  difficulty?: string | null;

  @ApiPropertyOptional({ enum: ScenarioLicense, default: ScenarioLicense.ORIGINAL })
  @IsOptional()
  @IsEnum(ScenarioLicense)
  license?: ScenarioLicense;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attribution?: string | null;

  @ApiPropertyOptional({ example: "시작 장면" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  startNodeTitle?: string;

  @ApiPropertyOptional({ example: "모험가들은 어두운 입구 앞에 서 있다." })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  startSceneText?: string;
}

export class UpdateScenarioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  ruleSetId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  difficulty?: string | null;

  @ApiPropertyOptional({ enum: ScenarioLicense })
  @IsOptional()
  @IsEnum(ScenarioLicense)
  license?: ScenarioLicense;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attribution?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  startNodeTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  startSceneText?: string;
}
