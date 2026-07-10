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
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import {
  ScenarioAssetKind,
  ScenarioLicense,
  ScenarioNodeType,
  ScenarioSourceType,
} from "../../constants/enums";
import type { JsonValue } from "./gameplay.dto";
import type { VttMapStateDto } from "./sessions.dto";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every(isPlainRecord);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isScenarioMetaEntity(value: unknown): value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    return false;
  }
  const idOk = value.id === undefined || typeof value.id === "string";
  const nameOk = value.name === undefined || typeof value.name === "string";
  const titleOk = value.title === undefined || typeof value.title === "string";
  const shortDescriptionOk = value.shortDescription === undefined || typeof value.shortDescription === "string";
  const descriptionOk = value.description === undefined || typeof value.description === "string";
  const summaryOk = value.summary === undefined || typeof value.summary === "string";
  const dispositionOk = value.disposition === undefined || typeof value.disposition === "string";
  const imageOk = value.imageUrl === undefined || value.imageUrl === null || typeof value.imageUrl === "string";
  const visibilityOk = value.isVisible === undefined || typeof value.isVisible === "boolean";
  const hiddenOk = value.hidden === undefined || typeof value.hidden === "boolean";
  return (
    idOk &&
    nameOk &&
    titleOk &&
    shortDescriptionOk &&
    descriptionOk &&
    summaryOk &&
    dispositionOk &&
    imageOk &&
    visibilityOk &&
    hiddenOk
  );
}

function isScenarioMetaEntityArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every(isScenarioMetaEntity);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isNumberInRange(value: unknown, min: number, max: number): boolean {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isScenarioTransitionRequirement(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    isOptionalString(value.id) &&
    isOptionalString(value.type) &&
    isOptionalString(value.targetId) &&
    isOptionalString(value.flagKey) &&
    isOptionalString(value.flagValue)
  );
}

function isScenarioTransitionConditionRule(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isPlainRecord(value)) {
    return false;
  }
  const logicOk = value.logic === undefined || value.logic === "ALL" || value.logic === "ANY";
  const requirementsOk =
    value.requirements === undefined ||
    (Array.isArray(value.requirements) && value.requirements.every(isScenarioTransitionRequirement));
  return logicOk && requirementsOk;
}

function isVttRectLike(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    isOptionalString(value.id) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  );
}

function isVttFogRect(value: unknown): boolean {
  return isPlainRecord(value) && typeof value.id === "string" && isVttRectLike(value);
}

function isVttTerrainCell(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    isOptionalNullableString(value.name) &&
    isOptionalNullableString(value.description) &&
    isOptionalNullableString(value.terrainEffectId)
  );
}

function isVttDoorCell(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const stateOk =
    value.state === "open" ||
    value.state === "closed" ||
    value.state === "locked" ||
    value.state === "broken";
  const breakDcOk = value.breakCheckDc === undefined || value.breakCheckDc === null || isNumberInRange(value.breakCheckDc, 1, 40);
  return isVttTerrainCell(value) && stateOk && isOptionalNullableString(value.keyItemId) && isOptionalBoolean(value.canBreak) && breakDcOk;
}

function isVttToken(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const encounterRoleOk = value.encounterRole === undefined || value.encounterRole === "fixed" || value.encounterRole === "scalable";
  const encounterPriorityOk = value.encounterPriority === undefined || isIntegerInRange(value.encounterPriority, 0, 999);
  const monsterOk = value.monster === undefined || value.monster === null || isPlainRecord(value.monster);
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isOptionalNullableString(value.npcId) &&
    isOptionalNullableString(value.sessionCharacterId) &&
    isOptionalNullableString(value.imageUrl) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.size) &&
    isOptionalBoolean(value.hidden) &&
    isOptionalBoolean(value.isHostile) &&
    encounterRoleOk &&
    isOptionalNullableString(value.encounterGroupId) &&
    encounterPriorityOk &&
    monsterOk
  );
}

function isVttEncounterScaling(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    typeof value.enabled === "boolean" &&
    isIntegerInRange(value.basePartySize, 1, 12) &&
    (value.minMonsterCount === undefined || isIntegerInRange(value.minMonsterCount, 0, 80)) &&
    value.mode === "by_party_ratio"
  );
}

function isVttStartingPosition(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return typeof value.id === "string" && isOptionalNullableString(value.label) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isVttPing(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isOptionalString(value.label) &&
    typeof value.expiresAt === "string"
  );
}

function isVttLightSource(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isNumberInRange(value.rangeFt, 5, Number.POSITIVE_INFINITY) &&
    isOptionalNullableString(value.label) &&
    isOptionalNullableString(value.createdBySessionCharacterId)
  );
}

function isVttRevealCheck(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const dcOk = value.dc === undefined || isNumberInRange(value.dc, 1, 40);
  return typeof value.contentId === "string" && isOptionalBoolean(value.requiresCheck) && isOptionalNullableString(value.ability) && isOptionalNullableString(value.skill) && dcOk;
}

function isVttObjectEvent(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const trigger = value.trigger;
  const effect = value.effect;
  return (
    typeof value.id === "string" &&
    isOptionalNullableString(value.name) &&
    value.type === "REVEAL_FOG_ON_PROXIMITY" &&
    isPlainRecord(trigger) &&
    isNumberInRange(trigger.distanceFeet, 0, Number.POSITIVE_INFINITY) &&
    isOptionalBoolean(trigger.once) &&
    isPlainRecord(effect) &&
    isNumberInRange(effect.revealRadiusFeet, 5, Number.POSITIVE_INFINITY)
  );
}

function isVttObjectHazard(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (!isPlainRecord(value)) {
    return false;
  }
  const kindOk = value.kind === "TRAP" || value.kind === "AMBUSH" || value.kind === "HAZARD";
  const radiusOk = value.detectionRadiusCells === undefined || isNumberInRange(value.detectionRadiusCells, 1, 20);
  const dcOk = value.detectionDc === undefined || isNumberInRange(value.detectionDc, 1, 40);
  return (
    kindOk &&
    isOptionalBoolean(value.armed) &&
    isOptionalBoolean(value.triggerOnce) &&
    radiusOk &&
    dcOk &&
    isOptionalStringArray(value.linkedClueIds) &&
    isOptionalStringArray(value.attemptedBySessionCharacterIds) &&
    isOptionalStringArray(value.detectedBySessionCharacterIds)
  );
}

function isVttObjectCell(value: unknown): boolean {
  if (!isVttTerrainCell(value) || !isPlainRecord(value)) {
    return false;
  }
  const shapeCellsOk = value.shapeCells === undefined || (Array.isArray(value.shapeCells) && value.shapeCells.every(isVttRectLike));
  const breakDcOk = value.breakCheckDc === undefined || value.breakCheckDc === null || isNumberInRange(value.breakCheckDc, 1, 40);
  const revealChecksOk = value.revealChecks === undefined || (Array.isArray(value.revealChecks) && value.revealChecks.every(isVttRevealCheck));
  const eventsOk = value.events === undefined || (Array.isArray(value.events) && value.events.every(isVttObjectEvent));
  return (
    shapeCellsOk &&
    isOptionalBoolean(value.visibleToPlayers) &&
    isOptionalBoolean(value.canBreak) &&
    isOptionalBoolean(value.broken) &&
    breakDcOk &&
    isOptionalStringArray(value.hiddenClueIds) &&
    isOptionalStringArray(value.hiddenItemIds) &&
    isOptionalStringArray(value.hiddenEventIds) &&
    isOptionalStringArray(value.observedBySessionCharacterIds) &&
    revealChecksOk &&
    eventsOk &&
    isVttObjectHazard(value.hazard)
  );
}

function isVttArray(value: unknown, validateItem: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(validateItem);
}

@ValidatorConstraint({ name: "scenarioCheckOptions", async: false })
class ScenarioCheckOptionsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isRecordArray(value) && value.every((entry) => {
      const idOk = isOptionalString(entry.id);
      const playerLabelOk = isOptionalString(entry.playerLabel);
      const labelOk = isOptionalString(entry.label);
      const typeOk = isOptionalString(entry.type);
      const skillOk = isOptionalString(entry.skill);
      const abilityOk = isOptionalString(entry.ability);
      const reasonOk = entry.reason === undefined || typeof entry.reason === "string";
      const dcOk =
        entry.dc === undefined ||
        (typeof entry.dc === "number" && Number.isInteger(entry.dc) && entry.dc >= 1 && entry.dc <= 40);
      const nextNodeOk = entry.nextNodeId === undefined || isNullableString(entry.nextNodeId);
      return idOk && playerLabelOk && labelOk && typeOk && skillOk && abilityOk && reasonOk && dcOk && nextNodeOk;
    });
  }

  defaultMessage(): string {
    return "checkOptions must be an array of scenario check option objects";
  }
}

@ValidatorConstraint({ name: "scenarioTransitions", async: false })
class ScenarioTransitionsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isRecordArray(value) && value.every((entry) => {
      const idOk = isOptionalString(entry.id);
      const nextNodeOk = isOptionalNullableString(entry.nextNodeId);
      const labelOk = isOptionalString(entry.label);
      const conditionOk = isOptionalString(entry.condition);
      const noteOk = isOptionalString(entry.note);
      const conditionRuleOk = isScenarioTransitionConditionRule(entry.conditionRule);
      return idOk && nextNodeOk && labelOk && conditionOk && noteOk && conditionRuleOk;
    });
  }

  defaultMessage(): string {
    return "transitions must be an array of scenario transition objects";
  }
}

@ValidatorConstraint({ name: "scenarioClues", async: false })
class ScenarioCluesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isRecordArray(value) && value.every((entry) => {
      const revealPolicyOk =
        entry.revealPolicy === undefined ||
        typeof entry.revealPolicy === "string" ||
        isPlainRecord(entry.revealPolicy);
      return (
        isOptionalString(entry.id) &&
        isOptionalString(entry.title) &&
        isOptionalString(entry.text) &&
        isOptionalString(entry.summary) &&
        isOptionalString(entry.revelation) &&
        isOptionalString(entry.source) &&
        isOptionalString(entry.discoverySource) &&
        isOptionalString(entry.pointsToNodeId) &&
        isOptionalString(entry.importance) &&
        isOptionalString(entry.revealMode) &&
        isOptionalString(entry.revealPolicyMode) &&
        revealPolicyOk &&
        isOptionalString(entry.handoutText) &&
        isOptionalString(entry.playerText) &&
        isOptionalString(entry.gmNotes)
      );
    });
  }

  defaultMessage(): string {
    return "clues must be an array of scenario clue objects";
  }
}

@ValidatorConstraint({ name: "scenarioNpcs", async: false })
class ScenarioNpcsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isRecordArray(value) && value.every((entry) => {
      const dispositionOk = entry.disposition === undefined || ["friendly", "neutral", "hostile"].includes(String(entry.disposition));
      return isScenarioMetaEntity(entry) && dispositionOk;
    });
  }

  defaultMessage(): string {
    return "npcs must be an array of scenario npc objects";
  }
}

@ValidatorConstraint({ name: "scenarioVttMap", async: false })
class ScenarioVttMapConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    if (!isPlainRecord(value)) {
      return false;
    }
    const stringOrNullKeys = ["id", "scenarioNodeId", "imageUrl", "updatedAt"];
    const stringOrNullOk = stringOrNullKeys.every((key) => value[key] === undefined || value[key] === null || typeof value[key] === "string");
    const imageOk = value.imageUrl === undefined || value.imageUrl === null || typeof value.imageUrl === "string";
    const gridTypeOk = value.gridType === undefined || value.gridType === "square" || value.gridType === "hex";
    const gridOk = value.gridSize === undefined || (typeof value.gridSize === "number" && Number.isFinite(value.gridSize) && value.gridSize >= 16 && value.gridSize <= 160);
    const widthOk = value.width === undefined || (typeof value.width === "number" && Number.isFinite(value.width) && value.width >= 320 && value.width <= 4000);
    const heightOk = value.height === undefined || (typeof value.height === "number" && Number.isFinite(value.height) && value.height >= 240 && value.height <= 4000);
    const tokensOk = value.tokens === undefined || isVttArray(value.tokens, isVttToken);
    const fogRectsOk = value.fogRects === undefined || isVttArray(value.fogRects, isVttFogRect);
    const startingPositionsOk = value.startingPositions === undefined || isVttArray(value.startingPositions, isVttStartingPosition);
    const pingsOk = value.pings === undefined || isVttArray(value.pings, isVttPing);
    const lightSourcesOk = value.lightSources === undefined || isVttArray(value.lightSources, isVttLightSource);
    const terrainCellsOk = value.terrainCells === undefined || isVttArray(value.terrainCells, isVttTerrainCell);
    const wallCellsOk = value.wallCells === undefined || isVttArray(value.wallCells, isVttTerrainCell);
    const doorCellsOk = value.doorCells === undefined || isVttArray(value.doorCells, isVttDoorCell);
    const objectCellsOk = value.objectCells === undefined || isVttArray(value.objectCells, isVttObjectCell);
    const encounterScalingOk = isVttEncounterScaling(value.encounterScaling);
    return (
      stringOrNullOk &&
      imageOk &&
      gridTypeOk &&
      gridOk &&
      widthOk &&
      heightOk &&
      tokensOk &&
      fogRectsOk &&
      startingPositionsOk &&
      pingsOk &&
      lightSourcesOk &&
      terrainCellsOk &&
      wallCellsOk &&
      doorCellsOk &&
      objectCellsOk &&
      encounterScalingOk
    );
  }

  defaultMessage(): string {
    return "vttMap must be a scenario VTT map object";
  }
}

@ValidatorConstraint({ name: "scenarioNodeMeta", async: false })
class ScenarioNodeMetaConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    if (!isPlainRecord(value)) {
      return false;
    }
    const entityKeys = ["npcs", "objects", "items", "areas"];
    const entitiesOk = entityKeys.every((key) => value[key] === undefined || isScenarioMetaEntityArray(value[key]));
    const endingFlagOk = value.isEndingNode === undefined || typeof value.isEndingNode === "boolean";
    const endBehaviorOk = value.endBehavior === undefined || typeof value.endBehavior === "string";
    const gmNotesOk = value.gmNotes === undefined || typeof value.gmNotes === "string";
    const ruleRefsOk = value.ruleRefs === undefined || (
      isPlainRecord(value.ruleRefs) &&
      (value.ruleRefs.spellIds === undefined || isStringArray(value.ruleRefs.spellIds)) &&
      (value.ruleRefs.conditionIds === undefined || isStringArray(value.ruleRefs.conditionIds)) &&
      (value.ruleRefs.terrainEffectIds === undefined || isStringArray(value.ruleRefs.terrainEffectIds))
    );
    return entitiesOk && endingFlagOk && endBehaviorOk && gmNotesOk && ruleRefsOk;
  }

  defaultMessage(): string {
    return "nodeMeta must be a scenario node metadata object";
  }
}

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
  checkOptions!: ScenarioCheckOptionDto[];

  @ApiProperty({ type: [Object] })
  transitions!: ScenarioTransitionDto[];

  @ApiProperty({ type: [Object] })
  clues!: ScenarioClueDto[];

  @ApiPropertyOptional({ type: Object, nullable: true })
  vttMap!: VttMapStateDto | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  nodeMeta!: ScenarioNodeMetaDto | null;

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

export type ScenarioValidationReportIssueDto = {
  code: string;
  message: string;
  nodeId?: string | null;
};

export type ScenarioRevisionDiffDto = {
  addedNodeIds: string[];
  removedNodeIds: string[];
  changedNodeIds: string[];
  changedSections: Record<string, string[]>;
};

export type ScenarioValidationReportDto = {
  status: "valid" | "invalid";
  checkedAt: string;
  issueCount: number;
  issues: ScenarioValidationReportIssueDto[];
  nodeCounts: {
    story: number;
    exploration: number;
    combat: number;
    other: number;
  };
  p4Policy: {
    status: "valid" | "invalid";
    issueCount: number;
    blockerCount: number;
    warningCount: number;
    reviewGate: "optional_collaboration_review";
  };
  revisionDiff: ScenarioRevisionDiffDto | null;
};

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
  validationReport?: ScenarioValidationReportDto | null;

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
  npcs?: ScenarioNpcDto[];

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
  @Validate(ScenarioCheckOptionsConstraint)
  checkOptions?: ScenarioCheckOptionDto[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Validate(ScenarioTransitionsConstraint)
  transitions?: ScenarioTransitionDto[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Validate(ScenarioCluesConstraint)
  clues?: ScenarioClueDto[];

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  @Validate(ScenarioVttMapConstraint)
  vttMap?: VttMapStateDto | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  @Validate(ScenarioNodeMetaConstraint)
  nodeMeta?: ScenarioNodeMetaDto | null;

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
  @Validate(ScenarioNpcsConstraint)
  npcs?: ScenarioNpcDto[];
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
  @Validate(ScenarioNpcsConstraint)
  npcs?: ScenarioNpcDto[];
}

export type ScenarioNpcDto = {
  id?: string;
  name?: string;
  title?: string;
  shortDescription?: string;
  summary?: string;
  description?: string;
  disposition?: "friendly" | "neutral" | "hostile";
  isVisible?: boolean;
  imageUrl?: string | null;
};

export type ScenarioNodeMetaEntityDto = {
  id?: string;
  name?: string;
  title?: string;
  shortDescription?: string;
  description?: string;
  summary?: string;
  disposition?: string;
  imageUrl?: string;
  isVisible?: boolean;
  hidden?: boolean;
};

export type ScenarioNodeMetaRuleRefsDto = {
  spellIds?: string[];
  conditionIds?: string[];
  terrainEffectIds?: string[];
};

export type ScenarioNodeMetaDto = {
  npcs?: ScenarioNodeMetaEntityDto[];
  objects?: ScenarioNodeMetaEntityDto[];
  items?: ScenarioNodeMetaEntityDto[];
  areas?: ScenarioNodeMetaEntityDto[];
  isEndingNode?: boolean;
  endBehavior?: string;
  gmNotes?: string;
  ruleRefs?: ScenarioNodeMetaRuleRefsDto;
} & Record<string, JsonValue | ScenarioNodeMetaEntityDto[] | ScenarioNodeMetaRuleRefsDto | undefined>;

export type ScenarioCheckOptionDto = {
  id?: string;
  playerLabel?: string;
  label?: string;
  type?: string;
  skill?: string;
  ability?: string;
  dc?: number;
  reason?: string;
  nextNodeId?: string | null;
};

export type ScenarioTransitionRequirementDto = {
  id?: string;
  type?: string;
  targetId?: string;
  flagKey?: string;
  flagValue?: string;
};

export type ScenarioTransitionConditionRuleDto = {
  logic?: string;
  requirements?: ScenarioTransitionRequirementDto[];
};

export type ScenarioTransitionDto = {
  id?: string;
  label?: string;
  condition?: string;
  nextNodeId?: string | null;
  note?: string;
  conditionRule?: ScenarioTransitionConditionRuleDto;
};

export type ScenarioClueDto = {
  id?: string;
  title?: string;
  text?: string;
  summary?: string;
  revelation?: string;
  source?: string;
  discoverySource?: string;
  pointsToNodeId?: string;
  importance?: string;
  revealMode?: string;
  revealPolicyMode?: string;
  revealPolicy?: string | Record<string, unknown>;
  handoutText?: string;
  playerText?: string;
  gmNotes?: string;
};

export type ScenarioNodeCheckOptionsConfigDto = {
  checks: ScenarioCheckOptionDto[];
  vttMap: VttMapStateDto | null;
};

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

export type ScenarioModerationQueueReportDto = {
  reportId: string;
  reportedByUserId: string;
  reason: "copyright" | "private_data" | "license" | "unsafe_content" | "other";
  comment: string | null;
  createdAt: string;
};

export type ScenarioModerationQueueAppealDto = {
  appealId: string;
  appealedByUserId: string;
  message: string;
  createdAt: string;
  status: "submitted" | "under_review" | "accepted" | "rejected";
};

export type ScenarioModerationQueueActionDto = {
  actionId: string;
  operatorUserId: string;
  action: ApplyScenarioModerationActionDto["action"];
  reason: string;
  targetUserId: string | null;
  createdAt: string;
  previousStatus: "visible" | "reported" | "hidden" | "removed";
  nextStatus: "visible" | "reported" | "hidden" | "removed";
  processingStatus?: "queued" | "reviewing" | "actioned" | "rejected" | "restored" | "escalated" | "removed";
  creatorNoticeStatus?: "none" | "creator_notified" | "creator_action_required";
  auditRecordType?: "scenario_moderation_action";
};

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
  reports!: ScenarioModerationQueueReportDto[];

  @ApiProperty({ type: [Object] })
  appeals!: ScenarioModerationQueueAppealDto[];

  @ApiProperty({ type: [Object] })
  actions!: ScenarioModerationQueueActionDto[];
}
