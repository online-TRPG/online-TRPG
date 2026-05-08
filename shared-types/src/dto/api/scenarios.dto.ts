import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBase64,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import {
  ScenarioAssetKind,
  ScenarioLicense,
  ScenarioNodeType,
} from "../../constants/enums";

export class ScenarioNodeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ScenarioNodeType })
  nodeType!: ScenarioNodeType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  sceneText!: string;

  @ApiPropertyOptional({ nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ type: [Object] })
  checkOptions!: Record<string, unknown>[];

  @ApiProperty({ type: [Object] })
  transitions!: Record<string, unknown>[];

  @ApiProperty({ type: [Object] })
  clues!: Record<string, unknown>[];

  @ApiPropertyOptional({ type: Object, nullable: true })
  vttMap!: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  nodeMeta!: Record<string, unknown> | null;

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

export class ScenarioNodeInputDto {
  @ApiPropertyOptional({ description: "Existing or client-generated node id." })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  id?: string;

  @ApiPropertyOptional({ enum: ScenarioNodeType, default: ScenarioNodeType.STORY })
  @IsOptional()
  @IsEnum(ScenarioNodeType)
  nodeType?: ScenarioNodeType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  sceneText!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  checkOptions?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  transitions?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  clues?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  vttMap?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  nodeMeta?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  fallbackNodeId?: string | null;
}

export class UploadScenarioNodeImageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty()
  @IsString()
  @IsBase64()
  dataBase64!: string;
}

export class ScenarioNodeImageUploadResponseDto {
  @ApiProperty()
  imageUrl!: string;
}

export class ScenarioAssetResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  scenarioId!: string;

  @ApiProperty({ enum: ScenarioAssetKind })
  kind!: ScenarioAssetKind;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty()
  storageKey!: string;

  @ApiProperty()
  publicUrl!: string;

  @ApiPropertyOptional({ nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ nullable: true })
  height!: number | null;

  @ApiProperty()
  fileSizeBytes!: number;

  @ApiProperty()
  uploadedByUserId!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ScenarioAssetQueryDto {
  @ApiPropertyOptional({ enum: ScenarioAssetKind })
  @IsOptional()
  @IsEnum(ScenarioAssetKind)
  kind?: ScenarioAssetKind;
}

export class UploadScenarioAssetDto {
  @ApiProperty({ enum: ScenarioAssetKind })
  @IsEnum(ScenarioAssetKind)
  kind!: ScenarioAssetKind;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty()
  @IsString()
  @IsBase64()
  dataBase64!: string;
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

  @ApiPropertyOptional({ type: [ScenarioNodeInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScenarioNodeInputDto)
  nodes?: ScenarioNodeInputDto[];
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

  @ApiPropertyOptional({ type: [ScenarioNodeInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScenarioNodeInputDto)
  nodes?: ScenarioNodeInputDto[];
}
