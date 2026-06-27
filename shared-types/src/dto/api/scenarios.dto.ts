import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBase64,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsIn,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  ScenarioAssetKind,
  ScenarioLicense,
  ScenarioNodeType,
  ScenarioSourceType,
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

export class ScenarioViewerCapabilitiesDto {
  @ApiProperty()
  canUnpublish!: boolean;

  @ApiProperty()
  canFork!: boolean;

  @ApiProperty()
  canReport!: boolean;

  @ApiProperty()
  canAppealModeration!: boolean;
}

export class ScenarioSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  createdByUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  createdByDisplayName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  ruleSetId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  difficulty!: string | null;

  @ApiProperty({ minimum: 1, maximum: 20 })
  startLevel!: number;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 20 })
  recommendedEndLevel!: number | null;

  @ApiProperty({ enum: ScenarioLicense })
  @IsEnum(ScenarioLicense)
  license!: ScenarioLicense;

  @ApiProperty({ enum: ScenarioSourceType })
  @IsEnum(ScenarioSourceType)
  sourceType!: ScenarioSourceType;

  @ApiPropertyOptional({ nullable: true })
  attribution!: string | null;

  @ApiPropertyOptional({ nullable: true })
  startNodeId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  baseScenarioId?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  revisionNumber?: number | null;

  @ApiPropertyOptional({ nullable: true })
  changelog?: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  validationReport?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  publishedAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  publishedByUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  publishedByDisplayName?: string | null;

  @ApiPropertyOptional({ enum: ["draft", "public", "link", "private", "unpublished"] })
  publishStatus?: "draft" | "public" | "link" | "private" | "unpublished";

  @ApiPropertyOptional({ type: [String] })
  tags?: string[];

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  estimatedMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true })
  gmMode?: "AI" | "HUMAN" | "BOTH" | null;

  @ApiPropertyOptional({ type: [String] })
  contentWarnings?: string[];

  @ApiPropertyOptional({ minimum: 0 })
  forkCount?: number;

  @ApiPropertyOptional({ default: false })
  forkAllowed?: boolean;

  @ApiPropertyOptional({ nullable: true })
  recommendationReason?: string | null;

  @ApiPropertyOptional({ enum: ["visible", "reported", "hidden", "removed"] })
  moderationStatus?: "visible" | "reported" | "hidden" | "removed";

  @ApiPropertyOptional({ enum: ["queued", "reviewing", "actioned", "rejected", "restored", "escalated", "removed"] })
  moderationProcessingStatus?: "queued" | "reviewing" | "actioned" | "rejected" | "restored" | "escalated" | "removed";

  @ApiPropertyOptional({ enum: ["none", "creator_notified", "creator_action_required"] })
  creatorNoticeStatus?: "none" | "creator_notified" | "creator_action_required";

  @ApiPropertyOptional({ type: ScenarioViewerCapabilitiesDto })
  viewerCapabilities?: ScenarioViewerCapabilitiesDto;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ScenarioResponseDto extends ScenarioSummaryResponseDto {
  @ApiPropertyOptional({ type: [Object] })
  npcs?: Record<string, unknown>[];

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

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  minLevel?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tag?: string;

  @ApiPropertyOptional({ enum: ["recommended", "latest", "level"] })
  @IsOptional()
  @IsIn(["recommended", "latest", "level"])
  sort?: "recommended" | "latest" | "level";

  @ApiPropertyOptional({ enum: ["AI", "HUMAN", "BOTH"] })
  @IsOptional()
  @IsIn(["AI", "HUMAN", "BOTH"])
  gmMode?: "AI" | "HUMAN" | "BOTH";

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
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

  @ApiProperty({ minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  startLevel!: number;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  recommendedEndLevel?: number | null;

  @ApiPropertyOptional({ enum: ScenarioLicense, default: ScenarioLicense.ORIGINAL })
  @IsOptional()
  @IsEnum(ScenarioLicense)
  license?: ScenarioLicense;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attribution?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  startNodeId?: string | null;

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

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  npcs?: Record<string, unknown>[];
}

export class UpdateScenarioDto {
  @ApiPropertyOptional({
    description: "마지막으로 읽은 draft의 updatedAt. 다른 편집자가 먼저 저장했으면 409를 반환합니다.",
  })
  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;

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

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  startLevel?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  recommendedEndLevel?: number | null;

  @ApiPropertyOptional({ enum: ScenarioLicense })
  @IsOptional()
  @IsEnum(ScenarioLicense)
  license?: ScenarioLicense;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attribution?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  startNodeId?: string | null;

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

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  npcs?: Record<string, unknown>[];
}

export class PublishScenarioDto {
  @ApiPropertyOptional({
    nullable: true,
    description: "Revision change summary shown to the creator. Stored in the published copy attribution metadata for the MVP.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changelog?: string | null;

  @ApiPropertyOptional({
    enum: ["public", "link", "private"],
    default: "public",
    description: "Publication visibility for the revision. public appears in the scenario list, link is accessible by id, private is owner-only.",
  })
  @IsOptional()
  @IsIn(["public", "link", "private"])
  visibility?: "public" | "link" | "private";

  @ApiPropertyOptional({
    default: false,
    description:
      "Creator self-declaration that they own or have permission to publish this scenario. Required for public/link publication.",
  })
  @IsOptional()
  @IsBoolean()
  rightsConfirmed?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: "Short rights/license/source explanation entered at publication time.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rightsBasis?: string | null;

  @ApiPropertyOptional({
    default: false,
    description: "Whether other users may fork this published revision.",
  })
  @IsOptional()
  @IsBoolean()
  forkAllowed?: boolean;
}

export class UpsertScenarioCollaboratorDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: ["editor", "reviewer", "viewer"] })
  @IsIn(["editor", "reviewer", "viewer"])
  role!: "editor" | "reviewer" | "viewer";
}

export class ScenarioCollaboratorResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: ["owner", "editor", "reviewer", "viewer"] })
  role!: "owner" | "editor" | "reviewer" | "viewer";
}

export class CreateScenarioReviewDto {
  @ApiProperty({ enum: ["requested", "approved", "rejected", "changes_requested"] })
  @IsIn(["requested", "approved", "rejected", "changes_requested"])
  status!: "requested" | "approved" | "rejected" | "changes_requested";

  @ApiPropertyOptional({
    nullable: true,
    description: "review 요청 시 지정할 reviewer 사용자 ID. 생략하면 첫 reviewer collaborator를 사용합니다.",
  })
  @IsOptional()
  @IsString()
  reviewerUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string | null;
}

export class ScenarioReviewResponseDto {
  @ApiProperty()
  reviewId!: string;

  @ApiProperty()
  requestedByUserId!: string;

  @ApiProperty()
  reviewerUserId!: string;

  @ApiProperty({ enum: ["none", "requested", "approved", "rejected", "changes_requested"] })
  status!: "none" | "requested" | "approved" | "rejected" | "changes_requested";

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiPropertyOptional({ nullable: true })
  decidedAt!: string | null;
}

export class ScenarioCollaborationStateResponseDto {
  @ApiProperty({ type: [ScenarioCollaboratorResponseDto] })
  collaborators!: ScenarioCollaboratorResponseDto[];

  @ApiProperty({ type: [ScenarioReviewResponseDto] })
  reviews!: ScenarioReviewResponseDto[];
}

export class ReportScenarioDto {
  @ApiProperty({ enum: ["copyright", "private_data", "license", "unsafe_content", "other"] })
  @IsIn(["copyright", "private_data", "license", "unsafe_content", "other"])
  reason!: "copyright" | "private_data" | "license" | "unsafe_content" | "other";

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string | null;
}

export class AppealScenarioModerationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;
}

export class ForkScenarioDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string | null;
}

export class ScenarioModerationReportResponseDto {
  @ApiProperty()
  reportId!: string;

  @ApiProperty()
  scenarioId!: string;

  @ApiProperty()
  status!: "received";
}

export class ScenarioModerationAppealResponseDto {
  @ApiProperty()
  appealId!: string;

  @ApiProperty()
  scenarioId!: string;

  @ApiProperty()
  status!: "submitted";
}

export class ApplyScenarioModerationActionDto {
  @ApiProperty({
    enum: ["hidden", "restored", "warning", "creator_note_required", "escalated", "removed"],
  })
  @IsIn(["hidden", "restored", "warning", "creator_note_required", "escalated", "removed"])
  action!:
    | "hidden"
    | "restored"
    | "warning"
    | "creator_note_required"
    | "escalated"
    | "removed";

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetUserId?: string | null;
}

export class ScenarioModerationActionResponseDto {
  @ApiProperty()
  actionId!: string;

  @ApiProperty()
  scenarioId!: string;

  @ApiProperty({
    enum: ["hidden", "restored", "warning", "creator_note_required", "escalated", "removed"],
  })
  action!:
    | "hidden"
    | "restored"
    | "warning"
    | "creator_note_required"
    | "escalated"
    | "removed";

  @ApiProperty({ enum: ["visible", "reported", "hidden", "removed"] })
  moderationStatus!: "visible" | "reported" | "hidden" | "removed";

  @ApiProperty({ enum: ["queued", "reviewing", "actioned", "rejected", "restored", "escalated", "removed"] })
  processingStatus!: "queued" | "reviewing" | "actioned" | "rejected" | "restored" | "escalated" | "removed";

  @ApiProperty({ enum: ["none", "creator_notified", "creator_action_required"] })
  creatorNoticeStatus!: "none" | "creator_notified" | "creator_action_required";
}

export class ScenarioModerationQueueItemDto {
  @ApiProperty()
  scenarioId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  createdByUserId!: string | null;

  @ApiProperty({ enum: ["visible", "reported", "hidden", "removed"] })
  moderationStatus!: "visible" | "reported" | "hidden" | "removed";

  @ApiProperty({ enum: ["queued", "reviewing", "actioned", "rejected", "restored", "escalated", "removed"] })
  processingStatus!: "queued" | "reviewing" | "actioned" | "rejected" | "restored" | "escalated" | "removed";

  @ApiProperty({ enum: ["none", "creator_notified", "creator_action_required"] })
  creatorNoticeStatus!: "none" | "creator_notified" | "creator_action_required";

  @ApiProperty({ minimum: 0 })
  reportCount!: number;

  @ApiProperty({ minimum: 0 })
  appealCount!: number;

  @ApiProperty({ minimum: 0 })
  actionCount!: number;

  @ApiProperty({ type: [Object] })
  reports!: Record<string, unknown>[];

  @ApiProperty({ type: [Object] })
  appeals!: Record<string, unknown>[];

  @ApiProperty({ type: [Object] })
  actions!: Record<string, unknown>[];
}
