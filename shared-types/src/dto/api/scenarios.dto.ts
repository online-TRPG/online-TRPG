import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
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
