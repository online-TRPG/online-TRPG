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

  @ApiProperty({ enum: ScenarioLicense })
  @IsEnum(ScenarioLicense)
  license!: ScenarioLicense;

  @ApiProperty()
  attribution!: string;

  @ApiProperty()
  startNodeId!: string;
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
