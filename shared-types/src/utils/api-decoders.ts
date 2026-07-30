import type {
  CharacterAvatarAssetResponseDto,
  CharacterResponseDto,
} from "../dto/api/characters.dto";
import {
  ActionOutcome,
  ActionQueueStatus,
  AuthProvider,
  CombatEntityType,
  CombatStatus,
  ConnectionStatus,
  GmMode,
  MainCommandTargetType,
  MainCommandStatus,
  ParticipantRole,
  ScenarioAssetKind,
  ScenarioLicense,
  ScenarioNodeType,
  ScenarioSourceType,
  SessionParticipantStatus,
  SessionCharacterStatus,
  SessionStatus,
  SessionActivityStatus,
  RecruitmentStatus,
  SessionJoinPolicy,
  SessionVisibility,
  UserRole,
  CharacterAvatarType,
  GamePhase,
  SessionScenarioStatus,
  DiceAdvantageState,
} from "../constants/enums";
import type {
  ClassDefinitionResponseDto,
  ItemResponseDto,
} from "../dto/api/classes.dto";
import type {
  CombatActionResultDto,
  CombatMoveResultDto,
  CombatParticipantResponseDto,
  CombatReactionPromptDto,
  CombatResponseDto,
  ActionAcceptedResponseDto,
  DiceRollResponseDto,
  JsonValue,
  MainCommandResponseDto,
  StateDiffResponseDto,
  TurnLogListResponseDto,
  TurnLogResponseDto,
  TurnAdvanceResponseDto,
  UseInventoryItemResponseDto,
} from "../dto/api/gameplay.dto";
import type { RaceResponseDto } from "../dto/api/races.dto";
import type { RuleCatalogReferenceDto } from "../dto/api/rulebook.dto";
import type {
  ScenarioAssetResponseDto,
  ScenarioCheckOptionDto,
  ScenarioClueDto,
  ScenarioCollaborationStateResponseDto,
  ScenarioModerationActionResponseDto,
  ScenarioModerationAppealResponseDto,
  ScenarioModerationQueueItemDto,
  ScenarioModerationReportResponseDto,
  ScenarioNodeImageUploadResponseDto,
  ScenarioNodeCheckOptionsConfigDto,
  ScenarioNodeMetaDto,
  ScenarioNodeMetaEntityDto,
  ScenarioNodeMetaRuleRefsDto,
  ScenarioNodeResponseDto,
  ScenarioNpcDto,
  ScenarioResponseDto,
  ScenarioReviewResponseDto,
  ScenarioSummaryResponseDto,
  ScenarioTransitionConditionRuleDto,
  ScenarioTransitionDto,
  ScenarioTransitionRequirementDto,
  ScenarioViewerCapabilitiesDto,
} from "../dto/api/scenarios.dto";
import type {
  HumanGmAiAssistSuggestionDto,
  HumanGmNodeMoveOptionDto,
  HumanGmRevealOptionDto,
  HumanGmPrivateNoteDto,
  CampaignArchivePublicRevisionLineageDto,
  CampaignArchiveResponseDto,
  CharacterTransferResponseDto,
  CharacterVaultItemDto,
  PlayerScenarioClueDto,
  PlayerScenarioNodeDto,
  PlayerScenarioViewDto,
  PlayerVisibleTargetDto,
  SessionDetailResponseDto,
  SessionListItemResponseDto,
  SessionParticipantResponseDto,
  SessionRevealResponseDto,
  SessionNodeTransitionResponseDto,
  SessionSnapshotDto,
  VttMapInteractionResponseDto,
  VttMapStateDto,
} from "../dto/api/sessions.dto";
import type { UserResponseDto } from "../dto/api/users.dto";
import type {
  AuthTokenResponseDto,
  LoginResponseDto,
  OAuthUrlResponseDto,
} from "../dto/api/users.dto";
import type {
  ActionAcceptedEventDto,
  ChatMessageEventDto,
  CharacterUpdatedEventDto,
  CombatReactionPromptEventDto,
  CombatUpdatedEventDto,
  DiceRolledEventDto,
  ParticipantUpdatedEventDto,
  SessionSnapshotEventDto,
  StateDiffAppliedEventDto,
  TurnLogCreatedEventDto,
  VttMapUpdatedEventDto,
  SystemMessageEventDto,
} from "../dto/ws/session-events.dto";
import { isMainCommandCheckEffect } from "./main-command-response";
import {
  decodeArray,
  isBoolean,
  isRecord,
  isNumber,
  isString,
  readArray,
  readBoolean,
  readNumber,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readRecord,
  readString,
} from "./runtime-guards";

function readNullableString(record: Record<string, unknown>, key: string, label = key): string | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isString(value)) {
    throw new Error(`${label} must be a string or null.`);
  }
  return value;
}

function decodeLenientArray<T>(
  value: unknown,
  decode: (entry: unknown) => T,
  label: string,
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.flatMap((entry) => {
    try {
      return [decode(entry)];
    } catch {
      return [];
    }
  });
}

function readInteger(record: Record<string, unknown>, key: string, label = key): number {
  const value = readNumber(record, key, label);
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }
  return value;
}

function readNonNegativeInteger(record: Record<string, unknown>, key: string, label = key): number {
  const value = readInteger(record, key, label);
  if (value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function readPositiveInteger(record: Record<string, unknown>, key: string, label = key): number {
  const value = readInteger(record, key, label);
  if (value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function readIntegerInRange(record: Record<string, unknown>, key: string, min: number, max: number, label = key): number {
  const value = readInteger(record, key, label);
  if (value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function readNullableInteger(record: Record<string, unknown>, key: string, label = key): number | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  return readInteger(record, key, label);
}

function readNullableNonNegativeInteger(record: Record<string, unknown>, key: string, label = key): number | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  return readNonNegativeInteger(record, key, label);
}

function readNullablePositiveInteger(record: Record<string, unknown>, key: string, label = key): number | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  return readPositiveInteger(record, key, label);
}

function readOptionalPositiveInteger(record: Record<string, unknown>, key: string, label = key): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  return readPositiveInteger(record, key, label);
}

function readOptionalNonNegativeInteger(record: Record<string, unknown>, key: string, label = key): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  return readNonNegativeInteger(record, key, label);
}

function readOptionalIntegerInRange(
  record: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  label = key,
): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  return readIntegerInRange(record, key, min, max, label);
}

function readNullableIntegerInRange(
  record: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  label = key,
): number | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  return readIntegerInRange(record, key, min, max, label);
}

function readNullableBoolean(record: Record<string, unknown>, key: string, label = key): boolean | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isBoolean(value)) {
    throw new Error(`${label} must be a boolean or null.`);
  }
  return value;
}

function readStringArray(record: Record<string, unknown>, key: string, label = key): string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every(isString)) {
    throw new Error(`${label} must be a string array.`);
  }
  return value;
}

function decodeNumberRecord(value: unknown, label: string): Record<string, number> {
  const record = readRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      if (typeof entry !== "number" || !Number.isFinite(entry)) {
        throw new Error(`${label}.${key} must be a number.`);
      }
      return [key, entry];
    }),
  );
}

function decodeNonNegativeIntegerRecord(value: unknown, label: string): Record<string, number> {
  const record = readRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0) {
        throw new Error(`${label}.${key} must be a non-negative integer.`);
      }
      return [key, entry];
    }),
  );
}

function readOptionalStringArray(record: Record<string, unknown>, key: string, label = key): string[] | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  return readStringArray(record, key, label);
}

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {
  return values.some((candidate) => candidate === value);
}

function readStringEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: readonly T[],
  label = key,
): T {
  const value = readString(record, key, label);
  if (!isOneOf(value, values)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function readOptionalStringEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: readonly T[],
  label = key,
): T | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isString(value) || !isOneOf(value, values)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function readNullableStringEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: readonly T[],
  label = key,
): T | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isString(value) || !isOneOf(value, values)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

export type PaginatedResponse<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export function decodeAuthTokenResponse(value: unknown): AuthTokenResponseDto {
  const record = readRecord(value, "authToken");
  const tokenType = readString(record, "tokenType", "authToken.tokenType");
  if (tokenType !== "Bearer") {
    throw new Error("authToken.tokenType must be Bearer.");
  }
  return {
    accessToken: readString(record, "accessToken", "authToken.accessToken"),
    tokenType,
    expiresIn: readPositiveInteger(record, "expiresIn", "authToken.expiresIn"),
  };
}

export function decodeUserResponse(value: unknown): UserResponseDto {
  const record = readRecord(value, "user");
  return {
    id: readString(record, "id", "user.id"),
    publicId: readString(record, "publicId", "user.publicId"),
    userId: readString(record, "userId", "user.userId"),
    email: readNullableString(record, "email", "user.email"),
    name: readString(record, "name", "user.name"),
    nickname: readString(record, "nickname", "user.nickname"),
    authProvider: readStringEnum(record, "authProvider", authProviderValues, "user.authProvider"),
    role: readStringEnum(record, "role", userRoleValues, "user.role"),
    displayName: readString(record, "displayName", "user.displayName"),
    createdAt: readString(record, "createdAt", "user.createdAt"),
  };
}

export function decodeLoginResponse(value: unknown): LoginResponseDto {
  const record = readRecord(value, "login");
  return {
    ...decodeAuthTokenResponse(record),
    user: decodeUserResponse(record.user),
  };
}

export function decodeOAuthUrlResponse(value: unknown): OAuthUrlResponseDto {
  const record = readRecord(value, "oauthUrl");
  const provider = readString(record, "provider", "oauthUrl.provider");
  if (provider !== "KAKAO" && provider !== "DISCORD") {
    throw new Error("oauthUrl.provider must be KAKAO or DISCORD.");
  }
  return {
    provider,
    authUrl: readString(record, "authUrl", "oauthUrl.authUrl"),
  };
}

export function decodeItemResponse(value: unknown): ItemResponseDto {
  const record = readRecord(value, "item");
  return {
    id: readString(record, "id", "item.id"),
    key: readString(record, "key", "item.key"),
    koName: readString(record, "koName", "item.koName"),
    category: readString(record, "category", "item.category"),
  };
}

export function decodeItemResponseArray(value: unknown): ItemResponseDto[] {
  return decodeArray(value, decodeItemResponse, "items");
}

function decodeSpellcastingProgressionEntry(value: unknown): NonNullable<ClassDefinitionResponseDto["spellcastingProgression"]>[number] {
  const record = readRecord(value, "classDefinition.spellcastingProgression[]");
  return {
    classLevel: readIntegerInRange(record, "classLevel", 1, 20, "classDefinition.spellcastingProgression.classLevel"),
    cantripsKnown: readNullableNonNegativeInteger(record, "cantripsKnown", "classDefinition.spellcastingProgression.cantripsKnown"),
    spellsKnown: readNullableNonNegativeInteger(record, "spellsKnown", "classDefinition.spellcastingProgression.spellsKnown"),
  };
}

function decodeStartingEquipment(value: unknown): ClassDefinitionResponseDto["startingEquipment"] {
  const record = readRecord(value, "classDefinition.startingEquipment");
  return {
    slots: readArray(record, "slots", (slotValue) => {
      const slot = readRecord(slotValue, "classDefinition.startingEquipment.slots[]");
      return {
        options: readArray(slot, "options", (optionValue) => {
          const option = readRecord(optionValue, "classDefinition.startingEquipment.slots[].options[]");
          return {
            items: readArray(option, "items", (itemValue) => {
              const item = readRecord(itemValue, "classDefinition.startingEquipment.slots[].options[].items[]");
              return {
                itemKey: readString(item, "itemKey", "classDefinition.startingEquipment.itemKey"),
                quantity: readPositiveInteger(item, "quantity", "classDefinition.startingEquipment.quantity"),
              };
            }, "classDefinition.startingEquipment.slots[].options[].items"),
          };
        }, "classDefinition.startingEquipment.slots[].options"),
      };
    }, "classDefinition.startingEquipment.slots"),
  };
}

export function decodeClassDefinitionResponse(value: unknown): ClassDefinitionResponseDto {
  const record = readRecord(value, "classDefinition");
  const spellcastingProgression = record.spellcastingProgression === undefined || record.spellcastingProgression === null
    ? undefined
    : decodeArray(record.spellcastingProgression, decodeSpellcastingProgressionEntry, "classDefinition.spellcastingProgression");
  return {
    id: readString(record, "id", "classDefinition.id"),
    key: readString(record, "key", "classDefinition.key"),
    koName: readString(record, "koName", "classDefinition.koName"),
    hitDie: readString(record, "hitDie", "classDefinition.hitDie"),
    startingEquipment: decodeStartingEquipment(record.startingEquipment),
    startingCantripCount: readNonNegativeInteger(record, "startingCantripCount", "classDefinition.startingCantripCount"),
    startingSpellCount: readNonNegativeInteger(record, "startingSpellCount", "classDefinition.startingSpellCount"),
    skillChoices: readStringArray(record, "skillChoices", "classDefinition.skillChoices"),
    skillChoiceCount: readNonNegativeInteger(record, "skillChoiceCount", "classDefinition.skillChoiceCount"),
    ...(spellcastingProgression ? { spellcastingProgression } : {}),
  };
}

export function decodeClassDefinitionResponseArray(value: unknown): ClassDefinitionResponseDto[] {
  return decodeArray(value, decodeClassDefinitionResponse, "classDefinitions");
}

export function decodeRaceResponse(value: unknown): RaceResponseDto {
  const record = readRecord(value, "race");
  const abilityIncreases = readRecord(record.abilityIncreases, "race.abilityIncreases");
  return {
    id: readString(record, "id", "race.id"),
    key: readString(record, "key", "race.key"),
    koName: readString(record, "koName", "race.koName"),
    size: readString(record, "size", "race.size"),
    baseSpeed: readPositiveInteger(record, "baseSpeed", "race.baseSpeed"),
    abilityIncreases: {
      str: readIntegerInRange(abilityIncreases, "str", 0, 4, "race.abilityIncreases.str"),
      dex: readIntegerInRange(abilityIncreases, "dex", 0, 4, "race.abilityIncreases.dex"),
      con: readIntegerInRange(abilityIncreases, "con", 0, 4, "race.abilityIncreases.con"),
      int: readIntegerInRange(abilityIncreases, "int", 0, 4, "race.abilityIncreases.int"),
      wis: readIntegerInRange(abilityIncreases, "wis", 0, 4, "race.abilityIncreases.wis"),
      cha: readIntegerInRange(abilityIncreases, "cha", 0, 4, "race.abilityIncreases.cha"),
    },
    languages: readStringArray(record, "languages", "race.languages"),
    parentRaceId: readNullableString(record, "parentRaceId", "race.parentRaceId"),
  };
}

export function decodeRaceResponseArray(value: unknown): RaceResponseDto[] {
  return decodeArray(value, decodeRaceResponse, "races");
}

export function decodeRuleCatalogReference(value: unknown): RuleCatalogReferenceDto {
  const record = readRecord(value, "ruleCatalogReference");
  const kind = readString(record, "kind", "ruleCatalogReference.kind");
  if (
    kind !== "race_traits" &&
    kind !== "class_features" &&
    kind !== "subclass_features" &&
    kind !== "spell_definitions" &&
    kind !== "condition_definitions" &&
    kind !== "monster_abilities" &&
    kind !== "terrain_effects"
  ) {
    throw new Error("ruleCatalogReference.kind is invalid.");
  }
  const runtimeTags = readOptionalStringArray(record, "runtimeTags", "ruleCatalogReference.runtimeTags");
  const spellLevel = readOptionalIntegerInRange(record, "spellLevel", 0, 9, "ruleCatalogReference.spellLevel");
  const targetingType = readNullableString(record, "targetingType", "ruleCatalogReference.targetingType");
  const rangeFt = readOptionalNonNegativeInteger(record, "rangeFt", "ruleCatalogReference.rangeFt");
  return {
    id: readString(record, "id", "ruleCatalogReference.id"),
    kind,
    executable: readBoolean(record, "executable", "ruleCatalogReference.executable"),
    label: readNullableString(record, "label", "ruleCatalogReference.label"),
    ...(runtimeTags ? { runtimeTags } : {}),
    ...(spellLevel !== undefined ? { spellLevel } : {}),
    targetingType,
    ...(rangeFt !== undefined ? { rangeFt } : {}),
  };
}

export function decodeRuleCatalogReferenceArray(value: unknown): RuleCatalogReferenceDto[] {
  return decodeArray(value, decodeRuleCatalogReference, "ruleCatalogReferences");
}

const authProviderValues: readonly AuthProvider[] = [AuthProvider.LOCAL, AuthProvider.KAKAO, AuthProvider.DISCORD, AuthProvider.GUEST];
const userRoleValues: readonly UserRole[] = [UserRole.USER, UserRole.MODERATOR, UserRole.ADMIN];
const sessionStatusValues: readonly SessionStatus[] = [SessionStatus.RECRUITING, SessionStatus.PLAYING, SessionStatus.PAUSED, SessionStatus.COMPLETED, SessionStatus.DISBANDED];
const sessionActivityStatusValues = Object.values(SessionActivityStatus);
const recruitmentStatusValues = Object.values(RecruitmentStatus);
const sessionJoinPolicyValues = Object.values(SessionJoinPolicy);
const sessionVisibilityValues: readonly SessionVisibility[] = [SessionVisibility.PUBLIC, SessionVisibility.PRIVATE];
const sessionScenarioStatusValues: readonly SessionScenarioStatus[] = [SessionScenarioStatus.PLANNED, SessionScenarioStatus.ACTIVE, SessionScenarioStatus.COMPLETED, SessionScenarioStatus.ABANDONED];
const gmModeValues: readonly GmMode[] = [GmMode.AI, GmMode.HUMAN];
const participantRoleValues: readonly ParticipantRole[] = [ParticipantRole.HOST, ParticipantRole.GM, ParticipantRole.PLAYER, ParticipantRole.SPECTATOR];
const sessionParticipantStatusValues: readonly SessionParticipantStatus[] = [SessionParticipantStatus.JOINED, SessionParticipantStatus.LEFT, SessionParticipantStatus.KICKED];
const sessionCharacterStatusValues: readonly SessionCharacterStatus[] = [SessionCharacterStatus.ACTIVE, SessionCharacterStatus.RETIRED, SessionCharacterStatus.DEAD, SessionCharacterStatus.LEFT];
const connectionStatusValues: readonly ConnectionStatus[] = [ConnectionStatus.ONLINE, ConnectionStatus.OFFLINE];
const scenarioLicenseValues: readonly ScenarioLicense[] = [ScenarioLicense.ORIGINAL, ScenarioLicense.CC_BY_4_0, ScenarioLicense.OTHER_FREE];
const scenarioSourceTypeValues: readonly ScenarioSourceType[] = [ScenarioSourceType.SYSTEM, ScenarioSourceType.USER, ScenarioSourceType.CLONED];
const scenarioNodeTypeValues: readonly ScenarioNodeType[] = [ScenarioNodeType.STORY, ScenarioNodeType.EXPLORATION, ScenarioNodeType.COMBAT];
const scenarioAssetKindValues: readonly ScenarioAssetKind[] = [ScenarioAssetKind.MAP, ScenarioAssetKind.SCENE, ScenarioAssetKind.TOKEN];
const mainCommandTargetTypeValues: readonly MainCommandTargetType[] = [MainCommandTargetType.NPC, MainCommandTargetType.OBJECT, MainCommandTargetType.ACTOR, MainCommandTargetType.AREA, MainCommandTargetType.POINT, MainCommandTargetType.SELF];
const actionQueueStatusValues: readonly ActionQueueStatus[] = [ActionQueueStatus.PENDING, ActionQueueStatus.PROCESSING, ActionQueueStatus.COMPLETED, ActionQueueStatus.FAILED, ActionQueueStatus.REJECTED];
const actionOutcomeValues: readonly ActionOutcome[] = [ActionOutcome.SUCCESS, ActionOutcome.FAILURE, ActionOutcome.IMPOSSIBLE, ActionOutcome.NO_ROLL];
const mainCommandStatusValues: readonly MainCommandStatus[] = [
  MainCommandStatus.MESSAGE,
  MainCommandStatus.CHECK_REQUIRED,
  MainCommandStatus.GM_APPROVAL_REQUIRED,
  MainCommandStatus.ACTION_READY,
  MainCommandStatus.IMPOSSIBLE,
  MainCommandStatus.RESOLVED,
];
const combatStatusValues: readonly CombatStatus[] = [CombatStatus.ACTIVE, CombatStatus.ENDED];
const combatEntityTypeValues: readonly CombatEntityType[] = [CombatEntityType.PLAYER_CHARACTER, CombatEntityType.NPC, CombatEntityType.MONSTER];
const gamePhaseValues: readonly GamePhase[] = [GamePhase.LOBBY, GamePhase.EXPLORATION, GamePhase.COMBAT, GamePhase.DIALOGUE, GamePhase.REST];
const publishStatusValues: readonly NonNullable<ScenarioSummaryResponseDto["publishStatus"]>[] = ["draft", "public", "link", "private", "unpublished"];
const moderationStatusValues: readonly NonNullable<ScenarioSummaryResponseDto["moderationStatus"]>[] = ["visible", "reported", "hidden", "removed"];
const moderationProcessingStatusValues: readonly NonNullable<ScenarioSummaryResponseDto["moderationProcessingStatus"]>[] = ["queued", "reviewing", "actioned", "rejected", "restored", "escalated", "removed"];
const creatorNoticeStatusValues: readonly NonNullable<ScenarioSummaryResponseDto["creatorNoticeStatus"]>[] = ["none", "creator_notified", "creator_action_required"];
const collaboratorRoleValues: readonly ScenarioCollaborationStateResponseDto["collaborators"][number]["role"][] = ["owner", "editor", "reviewer", "viewer"];
const reviewStatusValues: readonly ScenarioReviewResponseDto["status"][] = ["none", "requested", "approved", "rejected", "changes_requested"];
const moderationActionValues: readonly ScenarioModerationActionResponseDto["action"][] = ["hidden", "restored", "warning", "creator_note_required", "escalated", "removed"];
const moderationReportReasonValues: readonly ScenarioModerationQueueItemDto["reports"][number]["reason"][] = ["copyright", "private_data", "license", "unsafe_content", "other"];
const moderationAppealStatusValues: readonly ScenarioModerationQueueItemDto["appeals"][number]["status"][] = ["submitted", "under_review", "accepted", "rejected"];
const scenarioGmModeValues: readonly NonNullable<ScenarioSummaryResponseDto["gmMode"]>[] = ["AI", "HUMAN", "BOTH"];
const campaignArchiveShareScopeValues: readonly CampaignArchiveResponseDto["shareScope"][] = ["private", "party", "public_summary"];
const characterTransferStatusValues: readonly CharacterTransferResponseDto["status"][] = ["requested", "approved", "rejected"];
const characterTransferModeValues: readonly CharacterTransferResponseDto["mode"][] = ["clone", "transfer"];
const characterTransferSourceDispositionValues: readonly NonNullable<CharacterTransferResponseDto["sourceDisposition"]>[] = ["copied", "retired_after_transfer"];

function decodeScenarioViewerCapabilities(value: unknown): ScenarioViewerCapabilitiesDto {
  const record = readRecord(value, "scenario.viewerCapabilities");
  return {
    canUnpublish: readBoolean(record, "canUnpublish", "scenario.viewerCapabilities.canUnpublish"),
    canFork: readBoolean(record, "canFork", "scenario.viewerCapabilities.canFork"),
    canReport: readBoolean(record, "canReport", "scenario.viewerCapabilities.canReport"),
    canAppealModeration: readBoolean(record, "canAppealModeration", "scenario.viewerCapabilities.canAppealModeration"),
  };
}

function decodeScenarioValidationIssue(value: unknown): NonNullable<ScenarioSummaryResponseDto["validationReport"]>["issues"][number] {
  const record = readRecord(value, "scenario.validationReport.issues[]");
  const nodeId = readNullableString(record, "nodeId", "scenario.validationReport.issues.nodeId");
  return {
    code: readString(record, "code", "scenario.validationReport.issues.code"),
    message: readString(record, "message", "scenario.validationReport.issues.message"),
    ...(record.nodeId !== undefined ? { nodeId } : {}),
  };
}

function decodeStringArrayRecord(value: unknown, label: string): Record<string, string[]> {
  const record = readRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      if (!Array.isArray(entry) || !entry.every(isString)) {
        throw new Error(`${label}.${key} must be a string array.`);
      }
      return [key, entry];
    }),
  );
}

function decodeScenarioRevisionDiff(value: unknown): NonNullable<ScenarioSummaryResponseDto["validationReport"]>["revisionDiff"] {
  if (value === null || value === undefined) {
    return null;
  }
  const record = readRecord(value, "scenario.validationReport.revisionDiff");
  return {
    addedNodeIds: readStringArray(record, "addedNodeIds", "scenario.validationReport.revisionDiff.addedNodeIds"),
    removedNodeIds: readStringArray(record, "removedNodeIds", "scenario.validationReport.revisionDiff.removedNodeIds"),
    changedNodeIds: readStringArray(record, "changedNodeIds", "scenario.validationReport.revisionDiff.changedNodeIds"),
    changedSections: decodeStringArrayRecord(record.changedSections, "scenario.validationReport.revisionDiff.changedSections"),
  };
}

export function decodeScenarioValidationReport(value: unknown): NonNullable<ScenarioSummaryResponseDto["validationReport"]> {
  const record = readRecord(value, "scenario.validationReport");
  const p4Policy = readRecord(record.p4Policy, "scenario.validationReport.p4Policy");
  const reviewGate = readString(p4Policy, "reviewGate", "scenario.validationReport.p4Policy.reviewGate");
  if (reviewGate !== "optional_collaboration_review") {
    throw new Error("scenario.validationReport.p4Policy.reviewGate is invalid.");
  }
  const nodeCounts = readRecord(record.nodeCounts, "scenario.validationReport.nodeCounts");
  return {
    status: readStringEnum(record, "status", ["valid", "invalid"], "scenario.validationReport.status"),
    checkedAt: readString(record, "checkedAt", "scenario.validationReport.checkedAt"),
    issueCount: readNonNegativeInteger(record, "issueCount", "scenario.validationReport.issueCount"),
    issues: readArray(record, "issues", decodeScenarioValidationIssue, "scenario.validationReport.issues"),
    nodeCounts: {
      story: readNonNegativeInteger(nodeCounts, "story", "scenario.validationReport.nodeCounts.story"),
      exploration: readNonNegativeInteger(nodeCounts, "exploration", "scenario.validationReport.nodeCounts.exploration"),
      combat: readNonNegativeInteger(nodeCounts, "combat", "scenario.validationReport.nodeCounts.combat"),
      other: readNonNegativeInteger(nodeCounts, "other", "scenario.validationReport.nodeCounts.other"),
    },
    p4Policy: {
      status: readStringEnum(p4Policy, "status", ["valid", "invalid"], "scenario.validationReport.p4Policy.status"),
      issueCount: readNonNegativeInteger(p4Policy, "issueCount", "scenario.validationReport.p4Policy.issueCount"),
      blockerCount: readNonNegativeInteger(p4Policy, "blockerCount", "scenario.validationReport.p4Policy.blockerCount"),
      warningCount: readNonNegativeInteger(p4Policy, "warningCount", "scenario.validationReport.p4Policy.warningCount"),
      reviewGate,
    },
    revisionDiff: decodeScenarioRevisionDiff(record.revisionDiff),
  };
}

export function decodeScenarioSummary(value: unknown): ScenarioSummaryResponseDto {
  const record = readRecord(value, "scenario");
  const baseScenarioId = readNullableString(record, "baseScenarioId", "scenario.baseScenarioId");
  const revisionNumber = readNullableNonNegativeInteger(record, "revisionNumber", "scenario.revisionNumber");
  const changelog = readNullableString(record, "changelog", "scenario.changelog");
  const validationReport = record.validationReport === undefined || record.validationReport === null
    ? null
    : decodeScenarioValidationReport(record.validationReport);
  const publishedAt = readNullableString(record, "publishedAt", "scenario.publishedAt");
  const publishedByUserId = readNullableString(record, "publishedByUserId", "scenario.publishedByUserId");
  const publishedByDisplayName = readNullableString(record, "publishedByDisplayName", "scenario.publishedByDisplayName");
  const publishStatus = readOptionalStringEnum(record, "publishStatus", publishStatusValues, "scenario.publishStatus");
  const tags = readOptionalStringArray(record, "tags", "scenario.tags");
  const estimatedMinutes = readNullablePositiveInteger(record, "estimatedMinutes", "scenario.estimatedMinutes");
  const recommendedPlayersMin = readNullableIntegerInRange(
    record,
    "recommendedPlayersMin",
    1,
    8,
    "scenario.recommendedPlayersMin",
  );
  const recommendedPlayersMax = readNullableIntegerInRange(
    record,
    "recommendedPlayersMax",
    1,
    8,
    "scenario.recommendedPlayersMax",
  );
  const gmMode = readNullableStringEnum(record, "gmMode", scenarioGmModeValues, "scenario.gmMode");
  const contentWarnings = readOptionalStringArray(record, "contentWarnings", "scenario.contentWarnings");
  const forkCount = readOptionalNonNegativeInteger(record, "forkCount", "scenario.forkCount");
  const forkAllowed = readOptionalBoolean(record, "forkAllowed", "scenario.forkAllowed");
  const recommendationReason = readNullableString(record, "recommendationReason", "scenario.recommendationReason");
  const moderationStatus = readOptionalStringEnum(record, "moderationStatus", moderationStatusValues, "scenario.moderationStatus");
  const moderationProcessingStatus = readOptionalStringEnum(record, "moderationProcessingStatus", moderationProcessingStatusValues, "scenario.moderationProcessingStatus");
  const creatorNoticeStatus = readOptionalStringEnum(record, "creatorNoticeStatus", creatorNoticeStatusValues, "scenario.creatorNoticeStatus");
  const viewerCapabilities = record.viewerCapabilities === undefined || record.viewerCapabilities === null
    ? undefined
    : decodeScenarioViewerCapabilities(record.viewerCapabilities);
  return {
    id: readString(record, "id", "scenario.id"),
    title: readString(record, "title", "scenario.title"),
    createdByUserId: readNullableString(record, "createdByUserId", "scenario.createdByUserId"),
    createdByDisplayName: readNullableString(record, "createdByDisplayName", "scenario.createdByDisplayName"),
    description: readNullableString(record, "description", "scenario.description"),
    thumbnailUrl: readNullableString(record, "thumbnailUrl", "scenario.thumbnailUrl"),
    ruleSetId: readNullableString(record, "ruleSetId", "scenario.ruleSetId"),
    difficulty: readNullableString(record, "difficulty", "scenario.difficulty"),
    startLevel: readIntegerInRange(record, "startLevel", 1, 20, "scenario.startLevel"),
    recommendedEndLevel: readNullableIntegerInRange(record, "recommendedEndLevel", 1, 20, "scenario.recommendedEndLevel"),
    license: readStringEnum(record, "license", scenarioLicenseValues, "scenario.license"),
    sourceType: readStringEnum(record, "sourceType", scenarioSourceTypeValues, "scenario.sourceType"),
    attribution: readNullableString(record, "attribution", "scenario.attribution"),
    startNodeId: readNullableString(record, "startNodeId", "scenario.startNodeId"),
    baseScenarioId,
    revisionNumber,
    changelog,
    validationReport: validationReport ?? null,
    publishedAt,
    publishedByUserId,
    publishedByDisplayName,
    ...(publishStatus ? { publishStatus } : {}),
    ...(tags ? { tags } : {}),
    estimatedMinutes,
    recommendedPlayersMin,
    recommendedPlayersMax,
    gmMode,
    ...(contentWarnings ? { contentWarnings } : {}),
    ...(forkCount !== undefined ? { forkCount } : {}),
    ...(forkAllowed !== undefined ? { forkAllowed } : {}),
    recommendationReason,
    ...(moderationStatus ? { moderationStatus } : {}),
    ...(moderationProcessingStatus ? { moderationProcessingStatus } : {}),
    ...(creatorNoticeStatus ? { creatorNoticeStatus } : {}),
    ...(viewerCapabilities ? { viewerCapabilities } : {}),
    createdAt: readString(record, "createdAt", "scenario.createdAt"),
    updatedAt: readString(record, "updatedAt", "scenario.updatedAt"),
  };
}

export function decodeScenarioNode(value: unknown): ScenarioNodeResponseDto {
  const record = readRecord(value, "scenarioNode");
  const id = readString(record, "id", "scenarioNode.id");
  return {
    id,
    nodeType: readStringEnum(record, "nodeType", scenarioNodeTypeValues, "scenarioNode.nodeType"),
    title: readString(record, "title", "scenarioNode.title"),
    sceneText: readString(record, "sceneText", "scenarioNode.sceneText"),
    imageUrl: readNullableString(record, "imageUrl", "scenarioNode.imageUrl"),
    checkOptions: readArray(record, "checkOptions", decodeScenarioCheckOption, "scenarioNode.checkOptions"),
    transitions: readArray(record, "transitions", decodeScenarioTransition, "scenarioNode.transitions"),
    clues: readArray(record, "clues", decodeScenarioClue, "scenarioNode.clues"),
    vttMap: decodeScenarioNodeVttMap(record.vttMap, id),
    nodeMeta: decodeScenarioNodeMeta(record.nodeMeta),
    fallbackNodeId: readNullableString(record, "fallbackNodeId", "scenarioNode.fallbackNodeId"),
  };
}

function decodeScenarioNodeVttMap(value: unknown, nodeId: string | null): VttMapStateDto | null {
  if (value === undefined || value === null) {
    return null;
  }
  const record = readRecord(value, "scenarioNode.vttMap");
  const fallbackScenarioNodeId = readOptionalString(record, "scenarioNodeId", "scenarioNode.vttMap.scenarioNodeId") ?? nodeId;
  const gridType = record.gridType === undefined || record.gridType === null
    ? "square"
    : readStringEnum(record, "gridType", ["square", "hex"], "scenarioNode.vttMap.gridType");
  const normalized = {
    id: readOptionalString(record, "id", "scenarioNode.vttMap.id") ?? `map:${fallbackScenarioNodeId ?? "scenario-node"}`,
    scenarioNodeId: fallbackScenarioNodeId,
    imageUrl: readNullableString(record, "imageUrl", "scenarioNode.vttMap.imageUrl"),
    gridType,
    gridSize: readOptionalIntegerInRange(record, "gridSize", 16, 160, "scenarioNode.vttMap.gridSize") ?? 64,
    width: readOptionalIntegerInRange(record, "width", 320, 4000, "scenarioNode.vttMap.width") ?? 1280,
    height: readOptionalIntegerInRange(record, "height", 240, 4000, "scenarioNode.vttMap.height") ?? 832,
    tokens: record.tokens === undefined || record.tokens === null ? [] : record.tokens,
    encounterScaling: record.encounterScaling ?? null,
    fogRects: record.fogRects === undefined || record.fogRects === null ? [] : record.fogRects,
    ...(record.startingPositions !== undefined && record.startingPositions !== null ? { startingPositions: record.startingPositions } : {}),
    ...(record.pings !== undefined && record.pings !== null ? { pings: record.pings } : {}),
    ...(record.lightSources !== undefined && record.lightSources !== null ? { lightSources: record.lightSources } : {}),
    ...(record.terrainCells !== undefined && record.terrainCells !== null ? { terrainCells: record.terrainCells } : {}),
    ...(record.wallCells !== undefined && record.wallCells !== null ? { wallCells: record.wallCells } : {}),
    ...(record.doorCells !== undefined && record.doorCells !== null ? { doorCells: record.doorCells } : {}),
    ...(record.objectCells !== undefined && record.objectCells !== null ? { objectCells: record.objectCells } : {}),
    updatedAt: readOptionalString(record, "updatedAt", "scenarioNode.vttMap.updatedAt") ?? new Date(0).toISOString(),
  };
  return { ...decodeVttMapState(normalized) };
}

function decodeScenarioCheckOption(value: unknown): ScenarioCheckOptionDto {
  const record = readRecord(value, "scenarioNode.checkOptions[]");
  const dc = readOptionalIntegerInRange(record, "dc", 1, 40, "scenarioNode.checkOptions.dc");
  return {
    ...optionalStringField(record, "id", "scenarioNode.checkOptions.id"),
    ...optionalStringField(record, "playerLabel", "scenarioNode.checkOptions.playerLabel"),
    ...optionalStringField(record, "label", "scenarioNode.checkOptions.label"),
    ...optionalStringField(record, "type", "scenarioNode.checkOptions.type"),
    ...optionalStringField(record, "skill", "scenarioNode.checkOptions.skill"),
    ...optionalStringField(record, "ability", "scenarioNode.checkOptions.ability"),
    ...(dc !== undefined ? { dc } : {}),
    ...optionalStringField(record, "reason", "scenarioNode.checkOptions.reason"),
    ...(record.nextNodeId === undefined
      ? {}
      : { nextNodeId: readNullableString(record, "nextNodeId", "scenarioNode.checkOptions.nextNodeId") }),
  };
}

function decodeScenarioCheckOptionArray(value: unknown): ScenarioCheckOptionDto[] {
  return decodeArray(value, decodeScenarioCheckOption, "scenarioNode.checkOptions");
}

export function decodeScenarioNodeCheckOptionsConfig(value: unknown, nodeId: string | null = null): ScenarioNodeCheckOptionsConfigDto {
  return decodeScenarioNodeCheckOptionsConfigWith(value, nodeId, decodeScenarioCheckOptionArray);
}

export function decodeLenientScenarioNodeCheckOptionsConfig(
  value: unknown,
  nodeId: string | null = null,
): ScenarioNodeCheckOptionsConfigDto {
  return decodeScenarioNodeCheckOptionsConfigWith(
    value,
    nodeId,
    (checks) => decodeLenientArray(checks, decodeScenarioCheckOption, "scenarioNode.checkOptions"),
  );
}

function decodeScenarioNodeCheckOptionsConfigWith(
  value: unknown,
  nodeId: string | null,
  decodeChecks: (checks: unknown) => ScenarioCheckOptionDto[],
): ScenarioNodeCheckOptionsConfigDto {
  if (Array.isArray(value)) {
    return { checks: decodeChecks(value), vttMap: null };
  }
  const record = readRecord(value, "scenarioNode.checkOptionsConfig");
  return {
    checks: record.checks === undefined || record.checks === null
      ? []
      : decodeChecks(record.checks),
    vttMap: record.vttMap === undefined || record.vttMap === null
      ? null
      : decodeScenarioNodeVttMap(record.vttMap, nodeId),
  };
}

function decodeScenarioTransition(value: unknown): ScenarioTransitionDto {
  const record = readRecord(value, "scenarioNode.transitions[]");
  const conditionRule = record.conditionRule === undefined || record.conditionRule === null
    ? undefined
    : decodeScenarioTransitionConditionRule(record.conditionRule);
  return {
    ...optionalStringField(record, "id", "scenarioNode.transitions.id"),
    ...optionalStringField(record, "label", "scenarioNode.transitions.label"),
    ...optionalStringField(record, "condition", "scenarioNode.transitions.condition"),
    ...(record.nextNodeId === undefined
      ? {}
      : { nextNodeId: readNullableString(record, "nextNodeId", "scenarioNode.transitions.nextNodeId") }),
    ...optionalStringField(record, "note", "scenarioNode.transitions.note"),
    ...(conditionRule ? { conditionRule } : {}),
  };
}

export function decodeScenarioTransitionArray(value: unknown): ScenarioTransitionDto[] {
  return decodeArray(value, decodeScenarioTransition, "scenarioNode.transitions");
}

export function decodeLenientScenarioTransitionArray(value: unknown): ScenarioTransitionDto[] {
  return decodeLenientArray(value, decodeScenarioTransition, "scenarioNode.transitions");
}

function decodeScenarioTransitionConditionRule(value: unknown): ScenarioTransitionConditionRuleDto {
  const record = readRecord(value, "scenarioNode.transitions.conditionRule");
  const requirements = record.requirements === undefined || record.requirements === null
    ? undefined
    : decodeArray(
        record.requirements,
        decodeScenarioTransitionRequirement,
        "scenarioNode.transitions.conditionRule.requirements",
      );
  return {
    ...optionalStringField(record, "logic", "scenarioNode.transitions.conditionRule.logic"),
    ...(requirements ? { requirements } : {}),
  };
}

function decodeScenarioTransitionRequirement(value: unknown): ScenarioTransitionRequirementDto {
  const record = readRecord(value, "scenarioNode.transitions.conditionRule.requirements[]");
  return {
    ...optionalStringField(record, "id", "scenarioNode.transitions.conditionRule.requirements.id"),
    ...optionalStringField(record, "type", "scenarioNode.transitions.conditionRule.requirements.type"),
    ...optionalStringField(record, "targetId", "scenarioNode.transitions.conditionRule.requirements.targetId"),
    ...optionalStringField(record, "flagKey", "scenarioNode.transitions.conditionRule.requirements.flagKey"),
    ...optionalStringField(record, "flagValue", "scenarioNode.transitions.conditionRule.requirements.flagValue"),
  };
}

function decodeScenarioClue(value: unknown): ScenarioClueDto {
  const record = readRecord(value, "scenarioNode.clues[]");
  const revealPolicy = record.revealPolicy;
  return {
    ...optionalStringField(record, "id", "scenarioNode.clues.id"),
    ...optionalStringField(record, "title", "scenarioNode.clues.title"),
    ...optionalStringField(record, "text", "scenarioNode.clues.text"),
    ...optionalStringField(record, "summary", "scenarioNode.clues.summary"),
    ...optionalStringField(record, "revelation", "scenarioNode.clues.revelation"),
    ...optionalStringField(record, "source", "scenarioNode.clues.source"),
    ...optionalStringField(record, "discoverySource", "scenarioNode.clues.discoverySource"),
    ...optionalStringField(record, "pointsToNodeId", "scenarioNode.clues.pointsToNodeId"),
    ...optionalStringField(record, "importance", "scenarioNode.clues.importance"),
    ...optionalStringField(record, "revealMode", "scenarioNode.clues.revealMode"),
    ...optionalStringField(record, "revealPolicyMode", "scenarioNode.clues.revealPolicyMode"),
    ...(typeof revealPolicy === "string" || isRecord(revealPolicy) ? { revealPolicy } : {}),
    ...optionalStringField(record, "handoutText", "scenarioNode.clues.handoutText"),
    ...optionalStringField(record, "playerText", "scenarioNode.clues.playerText"),
    ...optionalStringField(record, "gmNotes", "scenarioNode.clues.gmNotes"),
  };
}

export function decodeScenarioClueArray(value: unknown): ScenarioClueDto[] {
  return decodeArray(value, decodeScenarioClue, "scenarioNode.clues");
}

export function decodeLenientScenarioClueArray(value: unknown): ScenarioClueDto[] {
  return decodeLenientArray(value, decodeScenarioClue, "scenarioNode.clues");
}

export function decodeScenarioNodeMeta(value: unknown): ScenarioNodeMetaDto | null {
  if (value === undefined || value === null) {
    return null;
  }
  const record = readRecord(value, "scenarioNode.nodeMeta");
  const meta: ScenarioNodeMetaDto = {};

  for (const [key, entry] of Object.entries(record)) {
    switch (key) {
      case "npcs":
      case "objects":
      case "items":
      case "areas":
        meta[key] = decodeArray(
          entry,
          (item) => decodeScenarioNodeMetaEntity(item, `scenarioNode.nodeMeta.${key}[]`),
          `scenarioNode.nodeMeta.${key}`,
        );
        break;
      case "isEndingNode":
        Object.assign(meta, optionalBooleanField(record, key, "scenarioNode.nodeMeta.isEndingNode"));
        break;
      case "endBehavior":
        Object.assign(meta, optionalStringField(record, key, "scenarioNode.nodeMeta.endBehavior"));
        break;
      case "gmNotes":
        Object.assign(meta, optionalStringField(record, key, "scenarioNode.nodeMeta.gmNotes"));
        break;
      case "ruleRefs":
        meta[key] = decodeScenarioNodeMetaRuleRefs(entry);
        break;
      default:
        meta[key] = decodeJsonCompatibleValue(entry, `scenarioNode.nodeMeta.${key}`);
        break;
    }
  }

  return meta;
}

function decodeScenarioNodeMetaEntity(value: unknown, label: string): ScenarioNodeMetaEntityDto {
  const record = readRecord(value, label);
  return {
    ...optionalStringField(record, "id", `${label}.id`),
    ...optionalStringField(record, "name", `${label}.name`),
    ...optionalStringField(record, "title", `${label}.title`),
    ...optionalStringField(record, "shortDescription", `${label}.shortDescription`),
    ...optionalStringField(record, "description", `${label}.description`),
    ...optionalStringField(record, "summary", `${label}.summary`),
    ...optionalStringField(record, "disposition", `${label}.disposition`),
    ...optionalStringField(record, "imageUrl", `${label}.imageUrl`),
    ...optionalBooleanField(record, "isVisible", `${label}.isVisible`),
    ...optionalBooleanField(record, "hidden", `${label}.hidden`),
  };
}

function decodeScenarioNodeMetaRuleRefs(value: unknown): ScenarioNodeMetaRuleRefsDto {
  const record = readRecord(value, "scenarioNode.nodeMeta.ruleRefs");
  return {
    ...optionalStringArrayField(record, "spellIds", "scenarioNode.nodeMeta.ruleRefs.spellIds"),
    ...optionalStringArrayField(record, "conditionIds", "scenarioNode.nodeMeta.ruleRefs.conditionIds"),
    ...optionalStringArrayField(record, "terrainEffectIds", "scenarioNode.nodeMeta.ruleRefs.terrainEffectIds"),
  };
}

function optionalStringArrayField(record: Record<string, unknown>, key: string, label: string): Record<string, string[]> {
  const value = record[key];
  if (value === undefined || value === null) {
    return {};
  }
  if (!Array.isArray(value) || !value.every(isString)) {
    throw new Error(`${label} must be a string array.`);
  }
  return { [key]: value };
}

function decodeJsonCompatibleValue(value: unknown, label: string): JsonValue {
  if (value === null || isString(value) || isNumber(value) || isBoolean(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      entry === undefined ? null : decodeJsonCompatibleValue(entry, `${label}[${index}]`),
    );
  }
  if (isRecord(value)) {
    const decoded: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      decoded[key] = decodeJsonCompatibleValue(entry, `${label}.${key}`);
    }
    return decoded;
  }
  throw new Error(`${label} must be JSON-compatible.`);
}

export function decodeJsonObject(value: unknown, label: string): Record<string, JsonValue> {
  const record = readRecord(value, label);
  const decoded: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (entry === undefined) continue;
    decoded[key] = decodeJsonCompatibleValue(entry, `${label}.${key}`);
  }
  return decoded;
}

export function decodeScenarioResponse(value: unknown): ScenarioResponseDto {
  const record = readRecord(value, "scenario");
  const summary = decodeScenarioSummary(record);
  const npcs = record.npcs === undefined || record.npcs === null
    ? undefined
    : decodeScenarioNpcArray(record.npcs);
  return {
    ...summary,
    ...(npcs ? { npcs } : {}),
    nodes: readArray(record, "nodes", decodeScenarioNode, "scenario.nodes"),
  };
}

function decodeScenarioNpc(value: unknown): ScenarioNpcDto {
  const record = readRecord(value, "scenario.npcs[]");
  const disposition = record.disposition === undefined || record.disposition === null
    ? undefined
    : readStringEnum(record, "disposition", ["friendly", "neutral", "hostile"], "scenario.npcs.disposition");
  const isVisible = readOptionalBoolean(record, "isVisible", "scenario.npcs.isVisible");
  return {
    ...optionalStringField(record, "id", "scenario.npcs.id"),
    ...optionalStringField(record, "name", "scenario.npcs.name"),
    ...optionalStringField(record, "title", "scenario.npcs.title"),
    ...optionalStringField(record, "shortDescription", "scenario.npcs.shortDescription"),
    ...optionalStringField(record, "summary", "scenario.npcs.summary"),
    ...optionalStringField(record, "description", "scenario.npcs.description"),
    ...(disposition ? { disposition } : {}),
    ...(isVisible === undefined ? {} : { isVisible }),
    ...(record.imageUrl === undefined
      ? {}
      : { imageUrl: readNullableString(record, "imageUrl", "scenario.npcs.imageUrl") }),
  };
}

export function decodeScenarioNpcArray(value: unknown): ScenarioNpcDto[] {
  return decodeArray(value, decodeScenarioNpc, "scenario.npcs");
}

export function decodeLenientScenarioNpcArray(value: unknown): ScenarioNpcDto[] {
  return decodeLenientArray(value, decodeScenarioNpc, "scenario.npcs");
}

export function decodeScenarioSummaryArray(value: unknown): ScenarioSummaryResponseDto[] {
  return decodeArray(value, decodeScenarioSummary, "scenarios");
}

function decodePlayerScenarioClue(value: unknown): PlayerScenarioClueDto {
  const record = readRecord(value, "playerScenarioClue");
  return {
    id: readString(record, "id", "playerScenarioClue.id"),
    title: readString(record, "title", "playerScenarioClue.title"),
    text: readString(record, "text", "playerScenarioClue.text"),
    importance: readNullableString(record, "importance", "playerScenarioClue.importance"),
  };
}

function decodePlayerVisibleTarget(value: unknown): PlayerVisibleTargetDto {
  const record = readRecord(value, "playerVisibleTarget");
  return {
    id: readString(record, "id", "playerVisibleTarget.id"),
    name: readString(record, "name", "playerVisibleTarget.name"),
    targetType: readStringEnum(record, "targetType", mainCommandTargetTypeValues, "playerVisibleTarget.targetType"),
    summary: readString(record, "summary", "playerVisibleTarget.summary"),
    disposition: readNullableString(record, "disposition", "playerVisibleTarget.disposition"),
  };
}

function decodePlayerCheckOption(value: unknown): PlayerScenarioNodeDto["checkOptions"][number] {
  const record = readRecord(value, "playerScenarioNode.checkOptions[]");
  const id = readOptionalString(record, "id", "playerScenarioNode.checkOptions.id");
  const type = readOptionalString(record, "type", "playerScenarioNode.checkOptions.type");
  const skill = readOptionalString(record, "skill", "playerScenarioNode.checkOptions.skill");
  return {
    ...(id !== undefined ? { id } : {}),
    label: readString(record, "label", "playerScenarioNode.checkOptions.label"),
    ...(type !== undefined ? { type } : {}),
    ...(skill !== undefined ? { skill } : {}),
  };
}

function decodePlayerScenarioNode(value: unknown): PlayerScenarioNodeDto {
  const record = readRecord(value, "playerScenarioNode");
  return {
    id: readString(record, "id", "playerScenarioNode.id"),
    nodeType: readStringEnum(record, "nodeType", scenarioNodeTypeValues, "playerScenarioNode.nodeType"),
    title: readString(record, "title", "playerScenarioNode.title"),
    sceneText: readString(record, "sceneText", "playerScenarioNode.sceneText"),
    imageUrl: readNullableString(record, "imageUrl", "playerScenarioNode.imageUrl"),
    checkOptions: readArray(record, "checkOptions", decodePlayerCheckOption, "playerScenarioNode.checkOptions"),
    publicClues: readArray(record, "publicClues", decodePlayerScenarioClue, "playerScenarioNode.publicClues"),
    visibleTargets: readArray(record, "visibleTargets", decodePlayerVisibleTarget, "playerScenarioNode.visibleTargets"),
  };
}

export function decodePlayerScenarioView(value: unknown): PlayerScenarioViewDto {
  const record = readRecord(value, "playerScenarioView");
  return {
    sessionScenarioId: readString(record, "sessionScenarioId", "playerScenarioView.sessionScenarioId"),
    scenarioId: readString(record, "scenarioId", "playerScenarioView.scenarioId"),
    currentNodeId: readNullableString(record, "currentNodeId", "playerScenarioView.currentNodeId"),
    currentNode: record.currentNode === undefined || record.currentNode === null
      ? null
      : decodePlayerScenarioNode(record.currentNode),
    visitedNodes: readArray(record, "visitedNodes", decodePlayerScenarioNode, "playerScenarioView.visitedNodes"),
    revealedClues: readArray(record, "revealedClues", decodePlayerScenarioClue, "playerScenarioView.revealedClues"),
  };
}

export function decodeHumanGmRevealOption(value: unknown): HumanGmRevealOptionDto {
  const record = readRecord(value, "humanGmRevealOption");
  return {
    contentId: readString(record, "contentId", "humanGmRevealOption.contentId"),
    title: readString(record, "title", "humanGmRevealOption.title"),
    preview: readNullableString(record, "preview", "humanGmRevealOption.preview"),
  };
}

export function decodeHumanGmRevealOptionArray(value: unknown): HumanGmRevealOptionDto[] {
  return decodeArray(value, decodeHumanGmRevealOption, "humanGmRevealOptions");
}

export function decodeSessionRevealResponse(value: unknown): SessionRevealResponseDto {
  const record = readRecord(value, "sessionReveal");
  return {
    id: readString(record, "id", "sessionReveal.id"),
    sessionScenarioId: readString(record, "sessionScenarioId", "sessionReveal.sessionScenarioId"),
    contentId: readString(record, "contentId", "sessionReveal.contentId"),
    contentKind: readStringEnum(record, "contentKind", ["clue", "item", "event"], "sessionReveal.contentKind"),
    scope: readStringEnum(record, "scope", ["party", "user", "character"], "sessionReveal.scope"),
    recipientId: readNullableString(record, "recipientId", "sessionReveal.recipientId"),
    revealedAt: readString(record, "revealedAt", "sessionReveal.revealedAt"),
    revealedBy: readString(record, "revealedBy", "sessionReveal.revealedBy"),
    reason: readNullableString(record, "reason", "sessionReveal.reason"),
  };
}

export function decodeScenarioNodeImageUploadResponse(value: unknown): ScenarioNodeImageUploadResponseDto {
  const record = readRecord(value, "scenarioNodeImageUpload");
  return {
    imageUrl: readString(record, "imageUrl", "scenarioNodeImageUpload.imageUrl"),
  };
}

export function decodeScenarioAssetResponse(value: unknown): ScenarioAssetResponseDto {
  const record = readRecord(value, "scenarioAsset");
  return {
    id: readString(record, "id", "scenarioAsset.id"),
    scenarioId: readString(record, "scenarioId", "scenarioAsset.scenarioId"),
    kind: readStringEnum(record, "kind", scenarioAssetKindValues, "scenarioAsset.kind"),
    fileName: readString(record, "fileName", "scenarioAsset.fileName"),
    contentType: readString(record, "contentType", "scenarioAsset.contentType"),
    storageKey: readString(record, "storageKey", "scenarioAsset.storageKey"),
    publicUrl: readString(record, "publicUrl", "scenarioAsset.publicUrl"),
    width: readNullablePositiveInteger(record, "width", "scenarioAsset.width"),
    height: readNullablePositiveInteger(record, "height", "scenarioAsset.height"),
    fileSizeBytes: readNonNegativeInteger(record, "fileSizeBytes", "scenarioAsset.fileSizeBytes"),
    uploadedByUserId: readString(record, "uploadedByUserId", "scenarioAsset.uploadedByUserId"),
    createdAt: readString(record, "createdAt", "scenarioAsset.createdAt"),
    updatedAt: readString(record, "updatedAt", "scenarioAsset.updatedAt"),
  };
}

export function decodeScenarioAssetResponseArray(value: unknown): ScenarioAssetResponseDto[] {
  return decodeArray(value, decodeScenarioAssetResponse, "scenarioAssets");
}

function decodeScenarioReview(value: unknown): ScenarioReviewResponseDto {
  const record = readRecord(value, "scenarioReview");
  return {
    reviewId: readString(record, "reviewId", "scenarioReview.reviewId"),
    requestedByUserId: readString(record, "requestedByUserId", "scenarioReview.requestedByUserId"),
    reviewerUserId: readString(record, "reviewerUserId", "scenarioReview.reviewerUserId"),
    status: readStringEnum(record, "status", reviewStatusValues, "scenarioReview.status"),
    comment: readNullableString(record, "comment", "scenarioReview.comment"),
    decidedAt: readNullableString(record, "decidedAt", "scenarioReview.decidedAt"),
  };
}

function decodeScenarioCollaborator(value: unknown): ScenarioCollaborationStateResponseDto["collaborators"][number] {
  const record = readRecord(value, "scenarioCollaborationState.collaborators[]");
  return {
    userId: readString(record, "userId", "scenarioCollaborationState.collaborators.userId"),
    role: readStringEnum(record, "role", collaboratorRoleValues, "scenarioCollaborationState.collaborators.role"),
  };
}

export function decodeScenarioCollaborationState(value: unknown): ScenarioCollaborationStateResponseDto {
  const record = readRecord(value, "scenarioCollaborationState");
  return {
    collaborators: readArray(record, "collaborators", decodeScenarioCollaborator, "scenarioCollaborationState.collaborators"),
    reviews: readArray(record, "reviews", decodeScenarioReview, "scenarioCollaborationState.reviews"),
  };
}

export function decodeScenarioModerationReportResponse(value: unknown): ScenarioModerationReportResponseDto {
  const record = readRecord(value, "scenarioModerationReport");
  const status = readString(record, "status", "scenarioModerationReport.status");
  if (status !== "received") {
    throw new Error("scenarioModerationReport.status must be received.");
  }
  return {
    reportId: readString(record, "reportId", "scenarioModerationReport.reportId"),
    scenarioId: readString(record, "scenarioId", "scenarioModerationReport.scenarioId"),
    status,
  };
}

export function decodeScenarioModerationAppealResponse(value: unknown): ScenarioModerationAppealResponseDto {
  const record = readRecord(value, "scenarioModerationAppeal");
  const status = readString(record, "status", "scenarioModerationAppeal.status");
  if (status !== "submitted") {
    throw new Error("scenarioModerationAppeal.status must be submitted.");
  }
  return {
    appealId: readString(record, "appealId", "scenarioModerationAppeal.appealId"),
    scenarioId: readString(record, "scenarioId", "scenarioModerationAppeal.scenarioId"),
    status,
  };
}

export function decodeScenarioModerationActionResponse(value: unknown): ScenarioModerationActionResponseDto {
  const record = readRecord(value, "scenarioModerationAction");
  return {
    actionId: readString(record, "actionId", "scenarioModerationAction.actionId"),
    scenarioId: readString(record, "scenarioId", "scenarioModerationAction.scenarioId"),
    action: readStringEnum(record, "action", moderationActionValues, "scenarioModerationAction.action"),
    moderationStatus: readStringEnum(record, "moderationStatus", moderationStatusValues, "scenarioModerationAction.moderationStatus"),
    processingStatus: readStringEnum(record, "processingStatus", moderationProcessingStatusValues, "scenarioModerationAction.processingStatus"),
    creatorNoticeStatus: readStringEnum(record, "creatorNoticeStatus", creatorNoticeStatusValues, "scenarioModerationAction.creatorNoticeStatus"),
  };
}

function decodeScenarioModerationQueueReport(value: unknown): ScenarioModerationQueueItemDto["reports"][number] {
  const record = readRecord(value, "scenarioModerationQueueItem.reports[]");
  return {
    reportId: readString(record, "reportId", "scenarioModerationQueueItem.reports.reportId"),
    reportedByUserId: readString(record, "reportedByUserId", "scenarioModerationQueueItem.reports.reportedByUserId"),
    reason: readStringEnum(record, "reason", moderationReportReasonValues, "scenarioModerationQueueItem.reports.reason"),
    comment: readNullableString(record, "comment", "scenarioModerationQueueItem.reports.comment"),
    createdAt: readString(record, "createdAt", "scenarioModerationQueueItem.reports.createdAt"),
  };
}

function decodeScenarioModerationQueueAppeal(value: unknown): ScenarioModerationQueueItemDto["appeals"][number] {
  const record = readRecord(value, "scenarioModerationQueueItem.appeals[]");
  return {
    appealId: readString(record, "appealId", "scenarioModerationQueueItem.appeals.appealId"),
    appealedByUserId: readString(record, "appealedByUserId", "scenarioModerationQueueItem.appeals.appealedByUserId"),
    message: readString(record, "message", "scenarioModerationQueueItem.appeals.message"),
    createdAt: readString(record, "createdAt", "scenarioModerationQueueItem.appeals.createdAt"),
    status: readStringEnum(record, "status", moderationAppealStatusValues, "scenarioModerationQueueItem.appeals.status"),
  };
}

function decodeScenarioModerationQueueAction(value: unknown): ScenarioModerationQueueItemDto["actions"][number] {
  const record = readRecord(value, "scenarioModerationQueueItem.actions[]");
  const processingStatus = readOptionalStringEnum(record, "processingStatus", moderationProcessingStatusValues, "scenarioModerationQueueItem.actions.processingStatus");
  const creatorNoticeStatus = readOptionalStringEnum(record, "creatorNoticeStatus", creatorNoticeStatusValues, "scenarioModerationQueueItem.actions.creatorNoticeStatus");
  const auditRecordType = readOptionalString(record, "auditRecordType", "scenarioModerationQueueItem.actions.auditRecordType");
  if (auditRecordType !== undefined && auditRecordType !== "scenario_moderation_action") {
    throw new Error("scenarioModerationQueueItem.actions.auditRecordType is invalid.");
  }
  return {
    actionId: readString(record, "actionId", "scenarioModerationQueueItem.actions.actionId"),
    operatorUserId: readString(record, "operatorUserId", "scenarioModerationQueueItem.actions.operatorUserId"),
    action: readStringEnum(record, "action", moderationActionValues, "scenarioModerationQueueItem.actions.action"),
    reason: readString(record, "reason", "scenarioModerationQueueItem.actions.reason"),
    targetUserId: readNullableString(record, "targetUserId", "scenarioModerationQueueItem.actions.targetUserId"),
    createdAt: readString(record, "createdAt", "scenarioModerationQueueItem.actions.createdAt"),
    previousStatus: readStringEnum(record, "previousStatus", moderationStatusValues, "scenarioModerationQueueItem.actions.previousStatus"),
    nextStatus: readStringEnum(record, "nextStatus", moderationStatusValues, "scenarioModerationQueueItem.actions.nextStatus"),
    ...(processingStatus ? { processingStatus } : {}),
    ...(creatorNoticeStatus ? { creatorNoticeStatus } : {}),
    ...(auditRecordType ? { auditRecordType } : {}),
  };
}

export function decodeScenarioModerationQueueItem(value: unknown): ScenarioModerationQueueItemDto {
  const record = readRecord(value, "scenarioModerationQueueItem");
  return {
    scenarioId: readString(record, "scenarioId", "scenarioModerationQueueItem.scenarioId"),
    title: readString(record, "title", "scenarioModerationQueueItem.title"),
    createdByUserId: readNullableString(record, "createdByUserId", "scenarioModerationQueueItem.createdByUserId"),
    moderationStatus: readStringEnum(record, "moderationStatus", moderationStatusValues, "scenarioModerationQueueItem.moderationStatus"),
    processingStatus: readStringEnum(record, "processingStatus", moderationProcessingStatusValues, "scenarioModerationQueueItem.processingStatus"),
    creatorNoticeStatus: readStringEnum(record, "creatorNoticeStatus", creatorNoticeStatusValues, "scenarioModerationQueueItem.creatorNoticeStatus"),
    reportCount: readNonNegativeInteger(record, "reportCount", "scenarioModerationQueueItem.reportCount"),
    appealCount: readNonNegativeInteger(record, "appealCount", "scenarioModerationQueueItem.appealCount"),
    actionCount: readNonNegativeInteger(record, "actionCount", "scenarioModerationQueueItem.actionCount"),
    reports: readArray(record, "reports", decodeScenarioModerationQueueReport, "scenarioModerationQueueItem.reports"),
    appeals: readArray(record, "appeals", decodeScenarioModerationQueueAppeal, "scenarioModerationQueueItem.appeals"),
    actions: readArray(record, "actions", decodeScenarioModerationQueueAction, "scenarioModerationQueueItem.actions"),
  };
}

export function decodeScenarioModerationQueueItemArray(value: unknown): ScenarioModerationQueueItemDto[] {
  return decodeArray(value, decodeScenarioModerationQueueItem, "scenarioModerationQueue");
}

export function decodeHumanGmNodeMoveOption(value: unknown): HumanGmNodeMoveOptionDto {
  const record = readRecord(value, "humanGmNodeMoveOption");
  const isFallback = readOptionalBoolean(record, "isFallback", "humanGmNodeMoveOption.isFallback");
  return {
    nodeId: readString(record, "nodeId", "humanGmNodeMoveOption.nodeId"),
    title: readString(record, "title", "humanGmNodeMoveOption.title"),
    nodeType: readString(record, "nodeType", "humanGmNodeMoveOption.nodeType"),
    label: readNullableString(record, "label", "humanGmNodeMoveOption.label"),
    condition: readNullableString(record, "condition", "humanGmNodeMoveOption.condition"),
    note: readNullableString(record, "note", "humanGmNodeMoveOption.note"),
    ...(isFallback !== undefined ? { isFallback } : {}),
  };
}

export function decodeHumanGmNodeMoveOptionArray(value: unknown): HumanGmNodeMoveOptionDto[] {
  return decodeArray(value, decodeHumanGmNodeMoveOption, "humanGmNodeMoveOptions");
}

export function decodeHumanGmPrivateNote(value: unknown): HumanGmPrivateNoteDto {
  const record = readRecord(value, "humanGmPrivateNote");
  return {
    id: readString(record, "id", "humanGmPrivateNote.id"),
    turnLogId: readString(record, "turnLogId", "humanGmPrivateNote.turnLogId"),
    kind: readString(record, "kind", "humanGmPrivateNote.kind"),
    targetId: readNullableString(record, "targetId", "humanGmPrivateNote.targetId"),
    note: readString(record, "note", "humanGmPrivateNote.note"),
    gmUserId: readString(record, "gmUserId", "humanGmPrivateNote.gmUserId"),
    createdAt: readString(record, "createdAt", "humanGmPrivateNote.createdAt"),
  };
}

export function decodeHumanGmPrivateNoteArray(value: unknown): HumanGmPrivateNoteDto[] {
  return decodeArray(value, decodeHumanGmPrivateNote, "humanGmPrivateNotes");
}

export function decodeHumanGmAiAssistSuggestion(value: unknown): HumanGmAiAssistSuggestionDto {
  const record = readRecord(value, "humanGmAiAssistSuggestion");
  const status = readString(record, "status", "humanGmAiAssistSuggestion.status");
  if (status !== "PENDING" && status !== "ACCEPTED") {
    throw new Error("humanGmAiAssistSuggestion.status must be PENDING or ACCEPTED.");
  }
  return {
    id: readString(record, "id", "humanGmAiAssistSuggestion.id"),
    assistType: readString(record, "assistType", "humanGmAiAssistSuggestion.assistType"),
    content: readString(record, "content", "humanGmAiAssistSuggestion.content"),
    suggestedActionId: readNullableString(record, "suggestedActionId", "humanGmAiAssistSuggestion.suggestedActionId"),
    targetId: readNullableString(record, "targetId", "humanGmAiAssistSuggestion.targetId"),
    status,
    createdByUserId: readString(record, "createdByUserId", "humanGmAiAssistSuggestion.createdByUserId"),
    acceptedByUserId: readNullableString(record, "acceptedByUserId", "humanGmAiAssistSuggestion.acceptedByUserId"),
    createdAt: readString(record, "createdAt", "humanGmAiAssistSuggestion.createdAt"),
    acceptedAt: readNullableString(record, "acceptedAt", "humanGmAiAssistSuggestion.acceptedAt"),
  };
}

export function decodeHumanGmAiAssistSuggestionArray(value: unknown): HumanGmAiAssistSuggestionDto[] {
  return decodeArray(value, decodeHumanGmAiAssistSuggestion, "humanGmAiAssistSuggestions");
}

function decodeCampaignArchiveCharacter(value: unknown): CampaignArchiveResponseDto["characters"][number] {
  const record = readRecord(value, "campaignArchive.character");
  return {
    sessionCharacterId: readString(record, "sessionCharacterId", "campaignArchive.character.sessionCharacterId"),
    characterId: readString(record, "characterId", "campaignArchive.character.characterId"),
    userId: readString(record, "userId", "campaignArchive.character.userId"),
    name: readString(record, "name", "campaignArchive.character.name"),
    className: readString(record, "className", "campaignArchive.character.className"),
    subclassName: readNullableString(record, "subclassName", "campaignArchive.character.subclassName"),
    level: readIntegerInRange(record, "level", 1, 20, "campaignArchive.character.level"),
    status: readString(record, "status", "campaignArchive.character.status"),
  };
}

function decodeCampaignArchiveAnalytics(value: unknown): CampaignArchiveResponseDto["analytics"] {
  const record = readRecord(value, "campaignArchive.analytics");
  return {
    turnLogCount: readNonNegativeInteger(record, "turnLogCount", "campaignArchive.analytics.turnLogCount"),
    combatCount: readNonNegativeInteger(record, "combatCount", "campaignArchive.analytics.combatCount"),
    completedDowntimeTaskCount: readNonNegativeInteger(record, "completedDowntimeTaskCount", "campaignArchive.analytics.completedDowntimeTaskCount"),
    nodeVisitCount: readNonNegativeInteger(record, "nodeVisitCount", "campaignArchive.analytics.nodeVisitCount"),
    sessionCharacterCount: readNonNegativeInteger(record, "sessionCharacterCount", "campaignArchive.analytics.sessionCharacterCount"),
  };
}

function decodeCampaignArchivePublicRevisionLineage(value: unknown): CampaignArchivePublicRevisionLineageDto | null {
  if (value === undefined || value === null) {
    return null;
  }
  const record = readRecord(value, "campaignArchive.snapshot.publicRevisionLineage");
  return {
    sourceScenarioId: readNullableString(record, "sourceScenarioId", "campaignArchive.snapshot.publicRevisionLineage.sourceScenarioId"),
    sourceRevisionId: readNullableString(record, "sourceRevisionId", "campaignArchive.snapshot.publicRevisionLineage.sourceRevisionId"),
    forkedFromScenarioId: readNullableString(record, "forkedFromScenarioId", "campaignArchive.snapshot.publicRevisionLineage.forkedFromScenarioId"),
    forkedAt: readNullableString(record, "forkedAt", "campaignArchive.snapshot.publicRevisionLineage.forkedAt"),
    forkedByUserId: readNullableString(record, "forkedByUserId", "campaignArchive.snapshot.publicRevisionLineage.forkedByUserId"),
  };
}

function decodeCampaignArchiveSnapshot(value: unknown): CampaignArchiveResponseDto["snapshot"] {
  const record = readRecord(value, "campaignArchive.snapshot");
  const downtime = readRecord(record.downtime, "campaignArchive.snapshot.downtime");
  const economy = readRecord(record.economy, "campaignArchive.snapshot.economy");
  const inventory = readRecord(record.inventory, "campaignArchive.snapshot.inventory");
  const combat = readRecord(record.combat, "campaignArchive.snapshot.combat");
  return {
    stateVersion: readNonNegativeInteger(record, "stateVersion", "campaignArchive.snapshot.stateVersion"),
    currentNodeId: readNullableString(record, "currentNodeId", "campaignArchive.snapshot.currentNodeId"),
    downtime: {
      activeTaskCount: readNonNegativeInteger(downtime, "activeTaskCount", "campaignArchive.snapshot.downtime.activeTaskCount"),
      pausedTaskCount: readNonNegativeInteger(downtime, "pausedTaskCount", "campaignArchive.snapshot.downtime.pausedTaskCount"),
      completedTaskCount: readNonNegativeInteger(downtime, "completedTaskCount", "campaignArchive.snapshot.downtime.completedTaskCount"),
      taskIds: readStringArray(downtime, "taskIds", "campaignArchive.snapshot.downtime.taskIds"),
    },
    economy: {
      hasEconomyState: readBoolean(economy, "hasEconomyState", "campaignArchive.snapshot.economy.hasEconomyState"),
      partyStashItemCount: readNonNegativeInteger(economy, "partyStashItemCount", "campaignArchive.snapshot.economy.partyStashItemCount"),
      walletCount: readNonNegativeInteger(economy, "walletCount", "campaignArchive.snapshot.economy.walletCount"),
      shopCount: readNonNegativeInteger(economy, "shopCount", "campaignArchive.snapshot.economy.shopCount"),
      craftingProgressCount: readNonNegativeInteger(economy, "craftingProgressCount", "campaignArchive.snapshot.economy.craftingProgressCount"),
      downtimeCompletionCount: readNonNegativeInteger(economy, "downtimeCompletionCount", "campaignArchive.snapshot.economy.downtimeCompletionCount"),
    },
    inventory: {
      totalItemCount: readNonNegativeInteger(inventory, "totalItemCount", "campaignArchive.snapshot.inventory.totalItemCount"),
      characterInventoryCounts: decodeNonNegativeIntegerRecord(inventory.characterInventoryCounts, "campaignArchive.snapshot.inventory.characterInventoryCounts"),
    },
    combat: {
      combatCount: readNonNegativeInteger(combat, "combatCount", "campaignArchive.snapshot.combat.combatCount"),
      turnLogCount: readNonNegativeInteger(combat, "turnLogCount", "campaignArchive.snapshot.combat.turnLogCount"),
      nodeVisitCount: readNonNegativeInteger(combat, "nodeVisitCount", "campaignArchive.snapshot.combat.nodeVisitCount"),
    },
    publicRevisionLineage: decodeCampaignArchivePublicRevisionLineage(record.publicRevisionLineage),
  };
}

export function decodeCampaignArchiveResponse(value: unknown): CampaignArchiveResponseDto {
  const record = readRecord(value, "campaignArchive");
  const shareScope = readStringEnum(record, "shareScope", campaignArchiveShareScopeValues, "campaignArchive.shareScope");
  return {
    archiveId: readString(record, "archiveId", "campaignArchive.archiveId"),
    sessionId: readString(record, "sessionId", "campaignArchive.sessionId"),
    sessionTitle: readString(record, "sessionTitle", "campaignArchive.sessionTitle"),
    scenarioId: readString(record, "scenarioId", "campaignArchive.scenarioId"),
    scenarioTitle: readNullableString(record, "scenarioTitle", "campaignArchive.scenarioTitle"),
    completedAt: readString(record, "completedAt", "campaignArchive.completedAt"),
    completedByUserId: readString(record, "completedByUserId", "campaignArchive.completedByUserId"),
    epilogue: readString(record, "epilogue", "campaignArchive.epilogue"),
    shareScope,
    allowCharacterTransfer: readBoolean(record, "allowCharacterTransfer", "campaignArchive.allowCharacterTransfer"),
    finalNodeId: readNullableString(record, "finalNodeId", "campaignArchive.finalNodeId"),
    finalRewardIds: readStringArray(record, "finalRewardIds", "campaignArchive.finalRewardIds"),
    characters: readArray(record, "characters", decodeCampaignArchiveCharacter, "campaignArchive.characters"),
    analytics: decodeCampaignArchiveAnalytics(record.analytics),
    snapshot: decodeCampaignArchiveSnapshot(record.snapshot),
  };
}

export function decodeCharacterVaultItem(value: unknown): CharacterVaultItemDto {
  const record = readRecord(value, "characterVaultItem");
  return {
    sourceSessionCharacterId: readString(record, "sourceSessionCharacterId", "characterVaultItem.sourceSessionCharacterId"),
    sourceSessionId: readString(record, "sourceSessionId", "characterVaultItem.sourceSessionId"),
    sourceSessionTitle: readString(record, "sourceSessionTitle", "characterVaultItem.sourceSessionTitle"),
    archiveId: readString(record, "archiveId", "characterVaultItem.archiveId"),
    archivedAt: readString(record, "archivedAt", "characterVaultItem.archivedAt"),
    characterId: readString(record, "characterId", "characterVaultItem.characterId"),
    name: readString(record, "name", "characterVaultItem.name"),
    className: readString(record, "className", "characterVaultItem.className"),
    subclassName: readNullableString(record, "subclassName", "characterVaultItem.subclassName"),
    level: readIntegerInRange(record, "level", 1, 20, "characterVaultItem.level"),
    status: readString(record, "status", "characterVaultItem.status"),
    transferable: readBoolean(record, "transferable", "characterVaultItem.transferable"),
  };
}

export function decodeCharacterVaultItemArray(value: unknown): CharacterVaultItemDto[] {
  return decodeArray(value, decodeCharacterVaultItem, "characterVaultItems");
}

export function decodeCharacterTransferResponse(value: unknown): CharacterTransferResponseDto {
  const record = readRecord(value, "characterTransfer");
  return {
    requestId: readString(record, "requestId", "characterTransfer.requestId"),
    targetSessionId: readString(record, "targetSessionId", "characterTransfer.targetSessionId"),
    sourceSessionId: readString(record, "sourceSessionId", "characterTransfer.sourceSessionId"),
    sourceSessionCharacterId: readString(record, "sourceSessionCharacterId", "characterTransfer.sourceSessionCharacterId"),
    requestedByUserId: readString(record, "requestedByUserId", "characterTransfer.requestedByUserId"),
    status: readStringEnum(record, "status", characterTransferStatusValues, "characterTransfer.status"),
    mode: readStringEnum(record, "mode", characterTransferModeValues, "characterTransfer.mode"),
    targetSessionCharacterId: readNullableString(record, "targetSessionCharacterId", "characterTransfer.targetSessionCharacterId"),
    sourceDisposition: readNullableStringEnum(record, "sourceDisposition", characterTransferSourceDispositionValues, "characterTransfer.sourceDisposition"),
    note: readNullableString(record, "note", "characterTransfer.note"),
    createdAt: readString(record, "createdAt", "characterTransfer.createdAt"),
    resolvedAt: readNullableString(record, "resolvedAt", "characterTransfer.resolvedAt"),
  };
}

function decodeRestApproval(value: unknown): NonNullable<ActionAcceptedResponseDto["restApproval"]> {
  const record = readRecord(value, "actionAccepted.restApproval");
  const restType = readNullableString(record, "restType", "actionAccepted.restApproval.restType");
  const status = readString(record, "status", "actionAccepted.restApproval.status");
  if (restType !== null && restType !== "short" && restType !== "long") {
    throw new Error("actionAccepted.restApproval.restType is invalid.");
  }
  if (
    status !== "gm_required" &&
    status !== "approved" &&
    status !== "rejected" &&
    status !== "cancelled" &&
    status !== "expired"
  ) {
    throw new Error("actionAccepted.restApproval.status is invalid.");
  }
  return {
    actionId: readString(record, "actionId", "actionAccepted.restApproval.actionId"),
    restType,
    status,
    hitDiceToSpend: readNullableNonNegativeInteger(record, "hitDiceToSpend", "actionAccepted.restApproval.hitDiceToSpend"),
    expiresAt: readNullableString(record, "expiresAt", "actionAccepted.restApproval.expiresAt"),
  };
}

function decodeMainCommandCheckOption(value: unknown): NonNullable<MainCommandResponseDto["checkOptions"]>[number] {
  const record = readRecord(value, "mainCommandResponse.checkOptions[]");
  const ability = readOptionalString(record, "ability", "mainCommandResponse.checkOptions.ability");
  const skill = readOptionalString(record, "skill", "mainCommandResponse.checkOptions.skill");
  const dc = readOptionalIntegerInRange(record, "dc", 5, 30, "mainCommandResponse.checkOptions.dc");
  return {
    ...(ability !== undefined ? { ability } : {}),
    ...(skill !== undefined ? { skill } : {}),
    ...(dc !== undefined ? { dc } : {}),
    reason: readString(record, "reason", "mainCommandResponse.checkOptions.reason"),
  };
}

function decodeMainCommandActionCandidate(value: unknown): NonNullable<MainCommandResponseDto["actionCandidate"]> {
  const record = readRecord(value, "mainCommandResponse.actionCandidate");
  return {
    actorId: readString(record, "actorId", "mainCommandResponse.actionCandidate.actorId"),
    targetId: readNullableString(record, "targetId", "mainCommandResponse.actionCandidate.targetId"),
    actionSummary: readString(record, "actionSummary", "mainCommandResponse.actionCandidate.actionSummary"),
    declaredMethod: readNullableString(record, "declaredMethod", "mainCommandResponse.actionCandidate.declaredMethod"),
  };
}

export function decodeActionAcceptedResponse(value: unknown): ActionAcceptedResponseDto {
  const record = readRecord(value, "actionAccepted");
  const restApproval = record.restApproval === undefined || record.restApproval === null
    ? null
    : decodeRestApproval(record.restApproval);
  return {
    playerActionId: readString(record, "playerActionId", "actionAccepted.playerActionId"),
    sessionId: readString(record, "sessionId", "actionAccepted.sessionId"),
    queueStatus: readStringEnum(record, "queueStatus", actionQueueStatusValues, "actionAccepted.queueStatus"),
    baseStateVersion: readNonNegativeInteger(record, "baseStateVersion", "actionAccepted.baseStateVersion"),
    ...(record.restApproval !== undefined ? { restApproval } : {}),
  };
}

export function decodeMainCommandResponse(value: unknown): MainCommandResponseDto {
  const record = readRecord(value, "mainCommandResponse");
  const checkOptions = record.checkOptions === undefined || record.checkOptions === null
    ? undefined
    : decodeArray(record.checkOptions, decodeMainCommandCheckOption, "mainCommandResponse.checkOptions");
  const actionCandidate = record.actionCandidate === undefined || record.actionCandidate === null
    ? undefined
    : decodeMainCommandActionCandidate(record.actionCandidate);
  const statePatch = record.statePatch === undefined || record.statePatch === null
    ? null
    : decodeJsonObject(record.statePatch, "mainCommandResponse.statePatch");
  const data = record.data === undefined || record.data === null
    ? null
    : decodeMainCommandResponseData(record.data, "mainCommandResponse.data");
  return {
    requestId: readString(record, "requestId", "mainCommandResponse.requestId"),
    status: readStringEnum(record, "status", mainCommandStatusValues, "mainCommandResponse.status"),
    message: readString(record, "message", "mainCommandResponse.message"),
    ...(checkOptions ? { checkOptions } : {}),
    ...(actionCandidate ? { actionCandidate } : {}),
    ...(record.statePatch !== undefined ? { statePatch: statePatch ?? null } : {}),
    ...(record.data !== undefined ? { data: data ?? null } : {}),
  };
}

function decodeMainCommandResponseData(value: unknown, label: string): NonNullable<MainCommandResponseDto["data"]> {
  const record = readRecord(value, label);
  const result: NonNullable<MainCommandResponseDto["data"]> = {};
  for (const [key, entryValue] of Object.entries(record)) {
    if ((key === "checkEffect" || key === "effect") && entryValue !== null && entryValue !== undefined) {
      if (!isMainCommandCheckEffect(entryValue)) {
        throw new Error(`${label}.${key} must be a valid check effect.`);
      }
      result[key] = entryValue;
      continue;
    }
    result[key] = entryValue;
  }
  return result;
}

export function decodeUseInventoryItemResponse(value: unknown): UseInventoryItemResponseDto {
  const record = readRecord(value, "useInventoryItemResponse");
  return {
    sessionId: readString(record, "sessionId", "useInventoryItemResponse.sessionId"),
    itemId: readString(record, "itemId", "useInventoryItemResponse.itemId"),
    itemName: readString(record, "itemName", "useInventoryItemResponse.itemName"),
    consumedQuantity: readPositiveInteger(record, "consumedQuantity", "useInventoryItemResponse.consumedQuantity"),
    healedHp: readNullableNonNegativeInteger(record, "healedHp", "useInventoryItemResponse.healedHp"),
    message: readString(record, "message", "useInventoryItemResponse.message"),
    character: decodeSessionCharacter(record.character),
  };
}

export function decodeDiceRollResponse(value: unknown): DiceRollResponseDto {
  const record = readRecord(value, "diceResult");
  const rolls = record.rolls;
  if (!Array.isArray(rolls) || !rolls.every((roll): roll is number => Number.isInteger(roll) && roll >= 1)) {
    throw new Error("diceResult.rolls must be a positive integer array.");
  }
  return {
    expression: readString(record, "expression", "diceResult.expression"),
    rolls,
    modifier: readInteger(record, "modifier", "diceResult.modifier"),
    total: readInteger(record, "total", "diceResult.total"),
    advantageState: readStringEnum(
      record,
      "advantageState",
      [DiceAdvantageState.NORMAL, DiceAdvantageState.ADVANTAGE, DiceAdvantageState.DISADVANTAGE],
      "diceResult.advantageState",
    ),
  };
}

export function decodeTurnLogDiceResult(value: unknown): NonNullable<TurnLogResponseDto["diceResult"]> {
  const record = readRecord(value, "turnLog.diceResult");
  const rolls = record.rolls;
  if (!Array.isArray(rolls) || !rolls.every((roll): roll is number => Number.isInteger(roll) && roll >= 1)) {
    throw new Error("turnLog.diceResult.rolls must be a positive integer array.");
  }
  const decoded: NonNullable<TurnLogResponseDto["diceResult"]> = {
    expression: readString(record, "expression", "turnLog.diceResult.expression"),
    rolls,
    modifier: readInteger(record, "modifier", "turnLog.diceResult.modifier"),
    total: readInteger(record, "total", "turnLog.diceResult.total"),
  };
  for (const [key, entry] of Object.entries(record)) {
    decoded[key] = decodeJsonCompatibleValue(entry, `turnLog.diceResult.${key}`);
  }
  const advantageState = readOptionalStringEnum(
    record,
    "advantageState",
    [DiceAdvantageState.NORMAL, DiceAdvantageState.ADVANTAGE, DiceAdvantageState.DISADVANTAGE],
    "turnLog.diceResult.advantageState",
  );
  const naturalRoll = readOptionalIntegerInRange(record, "naturalRoll", 1, 20, "turnLog.diceResult.naturalRoll");
  const dc = readOptionalIntegerInRange(record, "dc", 1, 40, "turnLog.diceResult.dc");
  const outcome = readOptionalStringEnum(record, "outcome", actionOutcomeValues, "turnLog.diceResult.outcome");
  return {
    ...decoded,
    ...(advantageState !== undefined ? { advantageState } : {}),
    ...(naturalRoll !== undefined ? { naturalRoll } : {}),
    ...(dc !== undefined ? { dc } : {}),
    ...(outcome !== undefined ? { outcome } : {}),
  };
}

export function decodeStateDiffResponse(value: unknown): StateDiffResponseDto {
  const record = readRecord(value, "stateDiff");
  return {
    baseVersion: readNonNegativeInteger(record, "baseVersion", "stateDiff.baseVersion"),
    nextVersion: readNonNegativeInteger(record, "nextVersion", "stateDiff.nextVersion"),
    reason: readString(record, "reason", "stateDiff.reason"),
    diff: decodeJsonObject(record.diff, "stateDiff.diff"),
  };
}

export function decodeTurnLogStructuredAction(value: unknown): NonNullable<TurnLogResponseDto["structuredAction"]> {
  const record = readRecord(value, "turnLog.structuredAction");
  const decoded: NonNullable<TurnLogResponseDto["structuredAction"]> = {};
  for (const [key, entry] of Object.entries(record)) {
    decoded[key] = decodeJsonCompatibleValue(entry, `turnLog.structuredAction.${key}`);
  }
  return decoded;
}

export function decodeTurnLogStateDiff(value: unknown): NonNullable<TurnLogResponseDto["stateDiff"]> {
  const record = readRecord(value, "turnLog.stateDiff");
  if (
    typeof record.baseVersion === "number"
    && Number.isInteger(record.baseVersion)
    && record.baseVersion >= 0
    && typeof record.nextVersion === "number"
    && Number.isInteger(record.nextVersion)
    && record.nextVersion >= 0
    && typeof record.reason === "string"
    && isRecord(record.diff)
  ) {
    return decodeStateDiffResponse(record);
  }

  return decodeJsonObject(record, "turnLog.stateDiff");
}

function decodeAbilityScores(value: unknown, label: string): CharacterResponseDto["abilities"] {
  const record = readRecord(value, label);
  return {
    str: readIntegerInRange(record, "str", 1, 30, `${label}.str`),
    dex: readIntegerInRange(record, "dex", 1, 30, `${label}.dex`),
    con: readIntegerInRange(record, "con", 1, 30, `${label}.con`),
    int: readIntegerInRange(record, "int", 1, 30, `${label}.int`),
    wis: readIntegerInRange(record, "wis", 1, 30, `${label}.wis`),
    cha: readIntegerInRange(record, "cha", 1, 30, `${label}.cha`),
  };
}

function decodeInventoryPackContent(value: unknown, label: string): NonNullable<CharacterResponseDto["inventory"][number]["packContents"]>[number] {
  const record = readRecord(value, label);
  const displayName = readOptionalString(record, "displayName", `${label}.displayName`);
  return {
    itemId: readString(record, "itemId", `${label}.itemId`),
    name: readString(record, "name", `${label}.name`),
    quantity: readPositiveInteger(record, "quantity", `${label}.quantity`),
    ...(displayName !== undefined ? { displayName } : {}),
  };
}

function optionalStringField(record: Record<string, unknown>, key: string, label: string): Record<string, string> {
  const value = readOptionalString(record, key, label);
  return value === undefined ? {} : { [key]: value };
}

function optionalNonNegativeNumberField(record: Record<string, unknown>, key: string, label: string): Record<string, number> {
  const value = readOptionalNumber(record, key, label);
  if (value === undefined) {
    return {};
  }
  if (value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return { [key]: value };
}

function optionalNonNegativeIntegerField(record: Record<string, unknown>, key: string, label: string): Record<string, number> {
  const value = readOptionalNonNegativeInteger(record, key, label);
  return value === undefined ? {} : { [key]: value };
}

function optionalIntegerField(record: Record<string, unknown>, key: string, label: string): Record<string, number> {
  const value = record[key];
  if (value === undefined || value === null) {
    return {};
  }
  return { [key]: readInteger(record, key, label) };
}

function optionalBooleanField(record: Record<string, unknown>, key: string, label: string): Record<string, boolean> {
  const value = readOptionalBoolean(record, key, label);
  return value === undefined ? {} : { [key]: value };
}

function decodeInventoryItem(value: unknown, label: string): CharacterResponseDto["inventory"][number] {
  const record = readRecord(value, label);
  const packContents = record.packContents === undefined || record.packContents === null
    ? undefined
    : decodeArray(record.packContents, (entry) => decodeInventoryPackContent(entry, `${label}.packContents[]`), `${label}.packContents`);
  const displayPackContents = record.displayPackContents === undefined || record.displayPackContents === null
    ? undefined
    : decodeArray(record.displayPackContents, (entry) => decodeInventoryPackContent(entry, `${label}.displayPackContents[]`), `${label}.displayPackContents`);
  const properties = readOptionalStringArray(record, "properties", `${label}.properties`);
  const displayPropertyLabels = readOptionalStringArray(record, "displayPropertyLabels", `${label}.displayPropertyLabels`);
  return {
    id: readString(record, "id", `${label}.id`),
    name: readString(record, "name", `${label}.name`),
    quantity: readPositiveInteger(record, "quantity", `${label}.quantity`),
    ...optionalStringField(record, "itemDefinitionId", `${label}.itemDefinitionId`),
    ...optionalStringField(record, "itemType", `${label}.itemType`),
    ...optionalStringField(record, "description", `${label}.description`),
    ...optionalNonNegativeNumberField(record, "weightLb", `${label}.weightLb`),
    ...optionalNonNegativeNumberField(record, "volumeCuFt", `${label}.volumeCuFt`),
    ...optionalStringField(record, "damageDice", `${label}.damageDice`),
    ...optionalStringField(record, "damageType", `${label}.damageType`),
    ...optionalNonNegativeIntegerField(record, "rangeFt", `${label}.rangeFt`),
    ...optionalNonNegativeIntegerField(record, "longRangeFt", `${label}.longRangeFt`),
    ...optionalNonNegativeIntegerField(record, "armorClassBase", `${label}.armorClassBase`),
    ...optionalIntegerField(record, "armorClassBonus", `${label}.armorClassBonus`),
    ...optionalNonNegativeIntegerField(record, "armorStrengthRequirement", `${label}.armorStrengthRequirement`),
    ...optionalBooleanField(record, "armorStealthDisadvantage", `${label}.armorStealthDisadvantage`),
    ...optionalStringField(record, "useEffect", `${label}.useEffect`),
    ...(packContents !== undefined ? { packContents } : {}),
    ...(properties !== undefined ? { properties } : {}),
    ...optionalStringField(record, "containerId", `${label}.containerId`),
    ...optionalStringField(record, "displayName", `${label}.displayName`),
    ...optionalStringField(record, "displayTypeLabel", `${label}.displayTypeLabel`),
    ...optionalStringField(record, "displayDescription", `${label}.displayDescription`),
    ...optionalStringField(record, "displayUseEffect", `${label}.displayUseEffect`),
    ...(displayPropertyLabels !== undefined ? { displayPropertyLabels } : {}),
    ...(displayPackContents !== undefined ? { displayPackContents } : {}),
  };
}

function decodeStartingSpells(value: unknown, label: string): NonNullable<CharacterResponseDto["spells"]> {
  const record = readRecord(value, label);
  const preparedSpells = readOptionalStringArray(record, "preparedSpells", `${label}.preparedSpells`);
  return {
    cantrips: readStringArray(record, "cantrips", `${label}.cantrips`),
    spells: readStringArray(record, "spells", `${label}.spells`),
    ...(preparedSpells !== undefined ? { preparedSpells } : {}),
  };
}

function decodeNullableStartingSpells(value: unknown, label: string): CharacterResponseDto["spells"] {
  if (value === undefined || value === null) {
    return null;
  }
  return decodeStartingSpells(value, label);
}

function decodeLevelUpPreviewContext(value: unknown): CharacterResponseDto["levelUpPreviewContext"] {
  const record = readRecord(value, "character.levelUpPreviewContext");
  const transferEligibility = readString(record, "transferEligibility", "character.levelUpPreviewContext.transferEligibility");
  if (transferEligibility !== "not_archived" && transferEligibility !== "transfer_allowed" && transferEligibility !== "transfer_blocked") {
    throw new Error("character.levelUpPreviewContext.transferEligibility is invalid.");
  }
  return {
    activeSessionId: readNullableString(record, "activeSessionId", "character.levelUpPreviewContext.activeSessionId"),
    activeSessionStatus: readNullableString(record, "activeSessionStatus", "character.levelUpPreviewContext.activeSessionStatus"),
    currentNodeId: readNullableString(record, "currentNodeId", "character.levelUpPreviewContext.currentNodeId"),
    campaignArchiveAvailable: readBoolean(record, "campaignArchiveAvailable", "character.levelUpPreviewContext.campaignArchiveAvailable"),
    campaignArchiveAllowsTransfer: readBoolean(record, "campaignArchiveAllowsTransfer", "character.levelUpPreviewContext.campaignArchiveAllowsTransfer"),
    transferEligibility,
    activeDowntimeTaskCount: readNonNegativeInteger(record, "activeDowntimeTaskCount", "character.levelUpPreviewContext.activeDowntimeTaskCount"),
    completedDowntimeTaskCount: readNonNegativeInteger(record, "completedDowntimeTaskCount", "character.levelUpPreviewContext.completedDowntimeTaskCount"),
    hasEconomyState: readBoolean(record, "hasEconomyState", "character.levelUpPreviewContext.hasEconomyState"),
    inventoryItemCount: readNonNegativeInteger(record, "inventoryItemCount", "character.levelUpPreviewContext.inventoryItemCount"),
    equippedWeaponId: readNullableString(record, "equippedWeaponId", "character.levelUpPreviewContext.equippedWeaponId"),
    offhandWeaponId: readNullableString(record, "offhandWeaponId", "character.levelUpPreviewContext.offhandWeaponId"),
    knownSpellCount: readNonNegativeInteger(record, "knownSpellCount", "character.levelUpPreviewContext.knownSpellCount"),
    preparedSpellCount: readNonNegativeInteger(record, "preparedSpellCount", "character.levelUpPreviewContext.preparedSpellCount"),
    activeConditionCount: readNonNegativeInteger(record, "activeConditionCount", "character.levelUpPreviewContext.activeConditionCount"),
    hasActiveConcentration: readBoolean(record, "hasActiveConcentration", "character.levelUpPreviewContext.hasActiveConcentration"),
  };
}

export function decodeTurnLogResponse(value: unknown): TurnLogResponseDto {
  const record = readRecord(value, "turnLog");
  const actionQueueStatus = readNullableStringEnum(record, "actionQueueStatus", actionQueueStatusValues, "turnLog.actionQueueStatus");
  const diceResult = record.diceResult === undefined || record.diceResult === null
    ? null
    : decodeTurnLogDiceResult(record.diceResult);
  const stateDiff = record.stateDiff === undefined || record.stateDiff === null
    ? null
    : decodeTurnLogStateDiff(record.stateDiff);
  return {
    turnLogId: readString(record, "turnLogId", "turnLog.turnLogId"),
    turnNumber: readPositiveInteger(record, "turnNumber", "turnLog.turnNumber"),
    playerActionId: readNullableString(record, "playerActionId", "turnLog.playerActionId"),
    actorUserId: readNullableString(record, "actorUserId", "turnLog.actorUserId"),
    sessionCharacterId: readNullableString(record, "sessionCharacterId", "turnLog.sessionCharacterId"),
    actionClientCreatedAt: readNullableString(record, "actionClientCreatedAt", "turnLog.actionClientCreatedAt"),
    actionCreatedAt: readNullableString(record, "actionCreatedAt", "turnLog.actionCreatedAt"),
    actionQueueStatus,
    rawInput: readNullableString(record, "rawInput", "turnLog.rawInput"),
    structuredAction: record.structuredAction === undefined || record.structuredAction === null
      ? null
      : decodeTurnLogStructuredAction(record.structuredAction),
    diceResult,
    stateDiff,
    outcome: readStringEnum(record, "outcome", actionOutcomeValues, "turnLog.outcome"),
    narration: readNullableString(record, "narration", "turnLog.narration"),
    createdAt: readString(record, "createdAt", "turnLog.createdAt"),
  };
}

export function decodeTurnLogListResponse(value: unknown): TurnLogListResponseDto {
  const record = readRecord(value, "turnLogList");
  return {
    turnLogs: readArray(record, "turnLogs", decodeTurnLogResponse, "turnLogList.turnLogs"),
    nextCursor: readNullableString(record, "nextCursor", "turnLogList.nextCursor"),
  };
}

export function decodeActionAcceptedEvent(value: unknown): ActionAcceptedEventDto {
  const record = readRecord(value, "action.accepted payload");
  return {
    sessionId: readString(record, "sessionId", "action.accepted.sessionId"),
    playerActionId: readString(record, "playerActionId", "action.accepted.playerActionId"),
    actorUserId: readString(record, "actorUserId", "action.accepted.actorUserId"),
    rawText: readString(record, "rawText", "action.accepted.rawText"),
    clientCreatedAt: readString(record, "clientCreatedAt", "action.accepted.clientCreatedAt"),
  };
}

export function decodeSystemMessageEvent(value: unknown): SystemMessageEventDto {
  const record = readRecord(value, "system.message payload");
  const playerActionId = readNullableString(record, "playerActionId", "system.message.playerActionId");
  return {
    sessionId: readString(record, "sessionId", "system.message.sessionId"),
    message: readString(record, "message", "system.message.message"),
    code: readString(record, "code", "system.message.code"),
    ...(playerActionId !== null || Object.prototype.hasOwnProperty.call(record, "playerActionId") ? { playerActionId } : {}),
  };
}

export function decodeChatMessageEvent(value: unknown): ChatMessageEventDto {
  const record = readRecord(value, "chat.message");
  const scope = readOptionalStringEnum(record, "scope", ["CHAT", "MAIN"], "chat.message.scope");
  return {
    id: readString(record, "id", "chat.message.id"),
    sessionId: readString(record, "sessionId", "chat.message.sessionId"),
    senderUserId: readString(record, "senderUserId", "chat.message.senderUserId"),
    senderDisplayName: readString(record, "senderDisplayName", "chat.message.senderDisplayName"),
    content: readString(record, "content", "chat.message.content"),
    ...(scope ? { scope } : {}),
    createdAt: readString(record, "createdAt", "chat.message.createdAt"),
  };
}

export function decodeChatMessageEventPayload(value: unknown): { message: ChatMessageEventDto } {
  const record = readRecord(value, "chat.message payload");
  return { message: decodeChatMessageEvent(record.message) };
}

export function decodeSessionSnapshotEvent(value: unknown): SessionSnapshotEventDto {
  const record = readRecord(value, "session.snapshot payload");
  return {
    sessionId: readString(record, "sessionId", "session.snapshot.sessionId"),
    snapshot: decodeSessionSnapshot(record.snapshot),
  };
}

export function decodeParticipantUpdatedEvent(value: unknown): ParticipantUpdatedEventDto {
  const record = readRecord(value, "participant.updated payload");
  return {
    sessionId: readString(record, "sessionId", "participant.updated.sessionId"),
    participant: decodeSessionParticipant(record.participant),
  };
}

export function decodeCharacterUpdatedEvent(value: unknown): CharacterUpdatedEventDto {
  const record = readRecord(value, "character.updated payload");
  return {
    sessionId: readString(record, "sessionId", "character.updated.sessionId"),
    character: decodeSessionCharacter(record.character),
  };
}

export function decodeTurnLogCreatedEvent(value: unknown): TurnLogCreatedEventDto {
  const record = readRecord(value, "turn.log.created payload");
  return {
    sessionId: readString(record, "sessionId", "turn.log.created.sessionId"),
    turnLog: decodeTurnLogResponse(record.turnLog),
  };
}

export function decodeDiceRolledEvent(value: unknown): DiceRolledEventDto {
  const record = readRecord(value, "dice.rolled payload");
  return {
    sessionId: readString(record, "sessionId", "dice.rolled.sessionId"),
    diceResult: decodeDiceRollResponse(record.diceResult),
  };
}

export function decodeStateDiffAppliedEvent(value: unknown): StateDiffAppliedEventDto {
  const record = readRecord(value, "state.diff.applied payload");
  return {
    sessionId: readString(record, "sessionId", "state.diff.applied.sessionId"),
    stateDiff: decodeStateDiffResponse(record.stateDiff),
  };
}

export function decodeVttMapUpdatedEvent(value: unknown): VttMapUpdatedEventDto {
  const record = readRecord(value, "vtt.map.updated payload");
  return {
    sessionId: readString(record, "sessionId", "vtt.map.updated.sessionId"),
    map: decodeVttMapState(record.map),
  };
}

export function decodeCombatUpdatedEvent(value: unknown): CombatUpdatedEventDto {
  const record = readRecord(value, "combat.updated payload");
  return {
    sessionId: readString(record, "sessionId", "combat.updated.sessionId"),
    combat: decodeCombatResponse(record.combat),
  };
}

export function decodeCombatReactionPromptEvent(value: unknown): CombatReactionPromptEventDto {
  const record = readRecord(value, "combat.reaction.prompt payload");
  return {
    sessionId: readString(record, "sessionId", "combat.reaction.prompt.sessionId"),
    reaction: decodeCombatReactionPrompt(record.reaction, "combat.reaction.prompt.reaction"),
  };
}

export function decodeCharacterResponse(value: unknown): CharacterResponseDto {
  const record = readRecord(value, "character");
  const avatarType = readString(record, "avatarType", "character.avatarType");
  const normalizedAvatarType =
    avatarType === CharacterAvatarType.DEFAULT
      ? CharacterAvatarType.DEFAULT
      : avatarType === CharacterAvatarType.PRESET
        ? CharacterAvatarType.PRESET
        : avatarType === CharacterAvatarType.UPLOAD
          ? CharacterAvatarType.UPLOAD
          : null;
  if (!normalizedAvatarType) {
    throw new Error("character.avatarType must be DEFAULT, PRESET, or UPLOAD.");
  }
  return {
    id: readString(record, "id", "character.id"),
    ownerUserId: readString(record, "ownerUserId", "character.ownerUserId"),
    scenarioId: readNullableString(record, "scenarioId", "character.scenarioId"),
    name: readString(record, "name", "character.name"),
    ancestry: readString(record, "ancestry", "character.ancestry"),
    className: readString(record, "className", "character.className"),
    subclassName: readNullableString(record, "subclassName", "character.subclassName"),
    level: readIntegerInRange(record, "level", 1, 20, "character.level"),
    bio: readNullableString(record, "bio", "character.bio"),
    abilities: decodeAbilityScores(record.abilities, "character.abilities"),
    proficiencyBonus: readPositiveInteger(record, "proficiencyBonus", "character.proficiencyBonus"),
    proficientSkills: readStringArray(record, "proficientSkills", "character.proficientSkills"),
    features: readStringArray(record, "features", "character.features"),
    maxHp: readPositiveInteger(record, "maxHp", "character.maxHp"),
    armorClass: readPositiveInteger(record, "armorClass", "character.armorClass"),
    speed: readNonNegativeInteger(record, "speed", "character.speed"),
    inventory: readArray(record, "inventory", (entry) => decodeInventoryItem(entry, "character.inventory[]"), "character.inventory"),
    spells: decodeNullableStartingSpells(record.spells, "character.spells"),
    equippedWeaponId: readNullableString(record, "equippedWeaponId", "character.equippedWeaponId"),
    offhandWeaponId: readNullableString(record, "offhandWeaponId", "character.offhandWeaponId"),
    avatarType: normalizedAvatarType,
    avatarPresetId: readNullableString(record, "avatarPresetId", "character.avatarPresetId"),
    avatarUrl: readNullableString(record, "avatarUrl", "character.avatarUrl"),
    avatarUpdatedAt: readNullableString(record, "avatarUpdatedAt", "character.avatarUpdatedAt"),
    activeSessionId: readNullableString(record, "activeSessionId", "character.activeSessionId"),
    activeSessionConditions: readStringArray(record, "activeSessionConditions", "character.activeSessionConditions"),
    levelUpPreviewContext: decodeLevelUpPreviewContext(record.levelUpPreviewContext),
    isSelectable: readBoolean(record, "isSelectable", "character.isSelectable"),
    createdAt: readString(record, "createdAt", "character.createdAt"),
    updatedAt: readString(record, "updatedAt", "character.updatedAt"),
  };
}

export function decodeCharacterResponseArray(value: unknown): CharacterResponseDto[] {
  return decodeArray(value, decodeCharacterResponse, "characters");
}

export function decodeCharacterAvatarAssetResponse(value: unknown): CharacterAvatarAssetResponseDto {
  const record = readRecord(value, "characterAvatarAsset");
  return {
    id: readString(record, "id", "characterAvatarAsset.id"),
    fileName: readString(record, "fileName", "characterAvatarAsset.fileName"),
    contentType: readString(record, "contentType", "characterAvatarAsset.contentType"),
    storageKey: readString(record, "storageKey", "characterAvatarAsset.storageKey"),
    publicUrl: readString(record, "publicUrl", "characterAvatarAsset.publicUrl"),
    width: readNullablePositiveInteger(record, "width", "characterAvatarAsset.width"),
    height: readNullablePositiveInteger(record, "height", "characterAvatarAsset.height"),
    fileSizeBytes: readNonNegativeInteger(record, "fileSizeBytes", "characterAvatarAsset.fileSizeBytes"),
    uploadedByUserId: readString(record, "uploadedByUserId", "characterAvatarAsset.uploadedByUserId"),
    createdAt: readString(record, "createdAt", "characterAvatarAsset.createdAt"),
    updatedAt: readString(record, "updatedAt", "characterAvatarAsset.updatedAt"),
  };
}

export function decodeCharacterAvatarAssetResponseArray(value: unknown): CharacterAvatarAssetResponseDto[] {
  return decodeArray(value, decodeCharacterAvatarAssetResponse, "characterAvatarAssets");
}

export function decodeSessionResponse(value: unknown): SessionSnapshotDto["session"] {
  const record = readRecord(value, "session");
  return {
    id: readString(record, "id", "session.id"),
    publicId: readString(record, "publicId", "session.publicId"),
    sessionId: readString(record, "sessionId", "session.sessionId"),
    title: readString(record, "title", "session.title"),
    description: readString(record, "description", "session.description"),
    hostUserId: readString(record, "hostUserId", "session.hostUserId"),
    ownerUserId: readString(record, "ownerUserId", "session.ownerUserId"),
    captainUserId: readNullableString(record, "captainUserId", "session.captainUserId"),
    gmMode: readStringEnum(record, "gmMode", gmModeValues, "session.gmMode"),
    gmUserId: readNullableString(record, "gmUserId", "session.gmUserId"),
    inviteCode: readString(record, "inviteCode", "session.inviteCode"),
    status: readStringEnum(record, "status", sessionStatusValues, "session.status"),
    activityStatus: readStringEnum(record, "activityStatus", sessionActivityStatusValues, "session.activityStatus"),
    recruitmentStatus: readStringEnum(record, "recruitmentStatus", recruitmentStatusValues, "session.recruitmentStatus"),
    joinPolicy: readStringEnum(record, "joinPolicy", sessionJoinPolicyValues, "session.joinPolicy"),
    currentPlayId: readNullableString(record, "currentPlayId", "session.currentPlayId"),
    visibility: readStringEnum(record, "visibility", sessionVisibilityValues, "session.visibility"),
    maxParticipants: readPositiveInteger(record, "maxParticipants", "session.maxParticipants"),
    maxPlayers: readPositiveInteger(record, "maxPlayers", "session.maxPlayers"),
    isPublic: readBoolean(record, "isPublic", "session.isPublic"),
    isPrivate: readBoolean(record, "isPrivate", "session.isPrivate"),
    ruleSetId: readNullableString(record, "ruleSetId", "session.ruleSetId"),
    nextSessionAt: readNullableString(record, "nextSessionAt", "session.nextSessionAt"),
    scenarioId: readNullableString(record, "scenarioId", "session.scenarioId"),
    currentNodeId: readNullableString(record, "currentNodeId", "session.currentNodeId"),
    activeSessionScenarioId: readNullableString(record, "activeSessionScenarioId", "session.activeSessionScenarioId"),
    createdAt: readString(record, "createdAt", "session.createdAt"),
    updatedAt: readString(record, "updatedAt", "session.updatedAt"),
  };
}

export function decodeSessionParticipant(value: unknown): SessionParticipantResponseDto {
  const record = readRecord(value, "participant");
  if (!isRecord(record.user)) {
    throw new Error("participant.user must be an object.");
  }
  readString(record.user, "id", "participant.user.id");
  readString(record.user, "displayName", "participant.user.displayName");
  return {
    id: readString(record, "id", "participant.id"),
    sessionId: readString(record, "sessionId", "participant.sessionId"),
    userId: readString(record, "userId", "participant.userId"),
    characterId: readNullableString(record, "characterId", "participant.characterId"),
    sessionCharacterId: readNullableString(record, "sessionCharacterId", "participant.sessionCharacterId"),
    role: readStringEnum(record, "role", participantRoleValues, "participant.role"),
    status: readStringEnum(record, "status", sessionParticipantStatusValues, "participant.status"),
    connectionStatus: readStringEnum(record, "connectionStatus", connectionStatusValues, "participant.connectionStatus"),
    isReady: readBoolean(record, "isReady", "participant.isReady"),
    readyAt: readNullableString(record, "readyAt", "participant.readyAt"),
    joinedAt: readString(record, "joinedAt", "participant.joinedAt"),
    leftAt: readNullableString(record, "leftAt", "participant.leftAt"),
    user: decodeUserResponse(record.user),
  };
}

export function decodeSessionCharacter(value: unknown): SessionSnapshotDto["sessionCharacters"][number] {
  const record = readRecord(value, "sessionCharacter");
  return {
    id: readString(record, "id", "sessionCharacter.id"),
    sessionId: readString(record, "sessionId", "sessionCharacter.sessionId"),
    userId: readString(record, "userId", "sessionCharacter.userId"),
    characterId: readString(record, "characterId", "sessionCharacter.characterId"),
    ownerUserId: readString(record, "ownerUserId", "sessionCharacter.ownerUserId"),
    status: readStringEnum(record, "status", sessionCharacterStatusValues, "sessionCharacter.status"),
    name: readString(record, "name", "sessionCharacter.name"),
    ancestry: readString(record, "ancestry", "sessionCharacter.ancestry"),
    className: readString(record, "className", "sessionCharacter.className"),
    subclassName: readNullableString(record, "subclassName", "sessionCharacter.subclassName"),
    level: readIntegerInRange(record, "level", 1, 20, "sessionCharacter.level"),
    hitDiceTotal: readNonNegativeInteger(record, "hitDiceTotal", "sessionCharacter.hitDiceTotal"),
    hitDiceSpent: readNonNegativeInteger(record, "hitDiceSpent", "sessionCharacter.hitDiceSpent"),
    hitDiceRemaining: readNonNegativeInteger(record, "hitDiceRemaining", "sessionCharacter.hitDiceRemaining"),
    abilities: decodeAbilityScores(record.abilities, "sessionCharacter.abilities"),
    proficiencyBonus: readPositiveInteger(record, "proficiencyBonus", "sessionCharacter.proficiencyBonus"),
    proficientSkills: readStringArray(record, "proficientSkills", "sessionCharacter.proficientSkills"),
    features: readStringArray(record, "features", "sessionCharacter.features"),
    maxHp: readPositiveInteger(record, "maxHp", "sessionCharacter.maxHp"),
    currentHp: readNonNegativeInteger(record, "currentHp", "sessionCharacter.currentHp"),
    tempHp: readNonNegativeInteger(record, "tempHp", "sessionCharacter.tempHp"),
    armorClass: readPositiveInteger(record, "armorClass", "sessionCharacter.armorClass"),
    speed: readNonNegativeInteger(record, "speed", "sessionCharacter.speed"),
    inventory: readArray(record, "inventory", (entry) => decodeInventoryItem(entry, "sessionCharacter.inventory[]"), "sessionCharacter.inventory"),
    spells: decodeNullableStartingSpells(record.spells, "sessionCharacter.spells"),
    equippedWeaponId: readNullableString(record, "equippedWeaponId", "sessionCharacter.equippedWeaponId"),
    offhandWeaponId: readNullableString(record, "offhandWeaponId", "sessionCharacter.offhandWeaponId"),
    bio: readNullableString(record, "bio", "sessionCharacter.bio"),
    avatarType: readStringEnum(record, "avatarType", [CharacterAvatarType.DEFAULT, CharacterAvatarType.PRESET, CharacterAvatarType.UPLOAD], "sessionCharacter.avatarType"),
    avatarPresetId: readNullableString(record, "avatarPresetId", "sessionCharacter.avatarPresetId"),
    avatarUrl: readNullableString(record, "avatarUrl", "sessionCharacter.avatarUrl"),
    conditions: readStringArray(record, "conditions", "sessionCharacter.conditions"),
    initiative: readNullableInteger(record, "initiative", "sessionCharacter.initiative"),
    createdAt: readString(record, "createdAt", "sessionCharacter.createdAt"),
    updatedAt: readString(record, "updatedAt", "sessionCharacter.updatedAt"),
  };
}

function decodeSessionScenario(value: unknown): SessionSnapshotDto["sessionScenarios"][number] {
  const record = readRecord(value, "sessionScenario");
  return {
    id: readString(record, "id", "sessionScenario.id"),
    sessionId: readString(record, "sessionId", "sessionScenario.sessionId"),
    scenarioId: readString(record, "scenarioId", "sessionScenario.scenarioId"),
    sequence: readNonNegativeInteger(record, "sequence", "sessionScenario.sequence"),
    status: readStringEnum(record, "status", sessionScenarioStatusValues, "sessionScenario.status"),
    startedAt: readNullableString(record, "startedAt", "sessionScenario.startedAt"),
    endedAt: readNullableString(record, "endedAt", "sessionScenario.endedAt"),
    createdAt: readString(record, "createdAt", "sessionScenario.createdAt"),
    scenario: decodeScenarioSummary(record.scenario),
  };
}

export function decodeGameStateResponse(value: unknown): SessionSnapshotDto["state"] {
  const record = readRecord(value, "sessionSnapshot.state");
  return {
    sessionScenarioId: readString(record, "sessionScenarioId", "sessionSnapshot.state.sessionScenarioId"),
    sessionId: readNullableString(record, "sessionId", "sessionSnapshot.state.sessionId"),
    version: readNonNegativeInteger(record, "version", "sessionSnapshot.state.version"),
    currentNodeId: readNullableString(record, "currentNodeId", "sessionSnapshot.state.currentNodeId"),
    phase: readStringEnum(record, "phase", gamePhaseValues, "sessionSnapshot.state.phase"),
    flags: readRecord(record.flags, "sessionSnapshot.state.flags"),
    state: readRecord(record.state, "sessionSnapshot.state.state"),
    updatedAt: readString(record, "updatedAt", "sessionSnapshot.state.updatedAt"),
  };
}

function decodePendingRestApproval(value: unknown): NonNullable<SessionSnapshotDto["pendingRestApprovals"]>[number] {
  const record = readRecord(value, "sessionSnapshot.pendingRestApprovals[]");
  const restType = readNullableString(record, "restType", "sessionSnapshot.pendingRestApprovals.restType");
  if (restType !== null && restType !== "short" && restType !== "long") {
    throw new Error("sessionSnapshot.pendingRestApprovals.restType is invalid.");
  }
  return {
    actionId: readString(record, "actionId", "sessionSnapshot.pendingRestApprovals.actionId"),
    restType,
    hitDiceToSpend: readNullableNonNegativeInteger(record, "hitDiceToSpend", "sessionSnapshot.pendingRestApprovals.hitDiceToSpend"),
    requesterUserId: readString(record, "requesterUserId", "sessionSnapshot.pendingRestApprovals.requesterUserId"),
    requesterDisplayName: readString(record, "requesterDisplayName", "sessionSnapshot.pendingRestApprovals.requesterDisplayName"),
    sessionCharacterId: readNullableString(record, "sessionCharacterId", "sessionSnapshot.pendingRestApprovals.sessionCharacterId"),
    characterName: readNullableString(record, "characterName", "sessionSnapshot.pendingRestApprovals.characterName"),
    requestedAt: readString(record, "requestedAt", "sessionSnapshot.pendingRestApprovals.requestedAt"),
    expiresAt: readString(record, "expiresAt", "sessionSnapshot.pendingRestApprovals.expiresAt"),
  };
}

export function decodeSessionSnapshot(value: unknown): SessionSnapshotDto {
  const record = readRecord(value, "sessionSnapshot");
  const pendingRestApprovals = record.pendingRestApprovals === undefined || record.pendingRestApprovals === null
    ? undefined
    : decodeArray(record.pendingRestApprovals, decodePendingRestApproval, "sessionSnapshot.pendingRestApprovals");
  return {
    session: decodeSessionResponse(record.session),
    sessionScenarios: readArray(record, "sessionScenarios", decodeSessionScenario, "sessionSnapshot.sessionScenarios"),
    participants: readArray(record, "participants", decodeSessionParticipant, "sessionSnapshot.participants"),
    sessionCharacters: readArray(record, "sessionCharacters", decodeSessionCharacter, "sessionSnapshot.sessionCharacters"),
    state: decodeGameStateResponse(record.state),
    ...(pendingRestApprovals ? { pendingRestApprovals } : {}),
  };
}

export function decodeSessionNodeTransitionResponse(value: unknown): SessionNodeTransitionResponseDto {
  const record = readRecord(value, "sessionNodeTransition");
  return {
    snapshot: decodeSessionSnapshot(record.snapshot),
    playerScenario: decodePlayerScenarioView(record.playerScenario),
  };
}

export function decodeSessionDetail(value: unknown): SessionDetailResponseDto {
  const record = readRecord(value, "sessionDetail");
  const snapshot = decodeSessionSnapshot(record);
  if (!isRecord(record.host)) {
    throw new Error("sessionDetail.host must be an object.");
  }
  readString(record.host, "id", "sessionDetail.host.id");
  if (!isRecord(record.scenario)) {
    throw new Error("sessionDetail.scenario must be an object.");
  }
  readString(record.scenario, "id", "sessionDetail.scenario.id");
  const captain = record.captain === undefined || record.captain === null
    ? null
    : decodeUserResponse(record.captain);
  return {
    ...snapshot,
    scenario: decodeScenarioSummary(record.scenario),
    host: decodeUserResponse(record.host),
    owner: decodeUserResponse(record.owner),
    captain,
  };
}

export function decodeSessionListItem(value: unknown): SessionListItemResponseDto {
  const record = readRecord(value, "sessionListItem");
  if (!isRecord(record.scenario)) {
    throw new Error("sessionListItem.scenario must be an object.");
  }
  readString(record.scenario, "id", "sessionListItem.scenario.id");
  readString(record.scenario, "title", "sessionListItem.scenario.title");
  const role = record.role;
  if (role !== undefined && !isString(role)) {
    throw new Error("sessionListItem.role must be a string.");
  }
  const decodedRole = readOptionalStringEnum(record, "role", participantRoleValues, "sessionListItem.role");
  return {
    session: decodeSessionResponse(record.session),
    scenario: decodeScenarioSummary(record.scenario),
    host: decodeUserResponse(record.host),
    owner: decodeUserResponse(record.owner),
    participantCount: readNonNegativeInteger(record, "participantCount", "sessionListItem.participantCount"),
    availableSlots: readNonNegativeInteger(record, "availableSlots", "sessionListItem.availableSlots"),
    currentSceneTitle: readNullableString(record, "currentSceneTitle", "sessionListItem.currentSceneTitle"),
    lastActivityAt: readString(record, "lastActivityAt", "sessionListItem.lastActivityAt"),
    ...(decodedRole !== undefined ? { role: decodedRole } : {}),
  };
}

export function decodePaginatedResponse<T>(
  value: unknown,
  decodeItem: (value: unknown) => T,
): PaginatedResponse<T> {
  const record = readRecord(value, "paginatedResponse");
  const content = readArray(record, "content", decodeItem, "paginatedResponse.content");
  return {
    content,
    page: readNonNegativeInteger(record, "page", "paginatedResponse.page"),
    size: readPositiveInteger(record, "size", "paginatedResponse.size"),
    totalElements: readNonNegativeInteger(record, "totalElements", "paginatedResponse.totalElements"),
    totalPages: readNonNegativeInteger(record, "totalPages", "paginatedResponse.totalPages"),
  };
}

function decodeVttStartingPosition(value: unknown): NonNullable<VttMapStateDto["startingPositions"]>[number] {
  const record = readRecord(value, "vttMap.startingPositions[]");
  const label = readNullableString(record, "label", "vttMap.startingPositions.label");
  return {
    id: readString(record, "id", "vttMap.startingPositions.id"),
    ...(record.label !== undefined ? { label } : {}),
    x: readNumber(record, "x", "vttMap.startingPositions.x"),
    y: readNumber(record, "y", "vttMap.startingPositions.y"),
  };
}

function decodeVttPing(value: unknown): NonNullable<VttMapStateDto["pings"]>[number] {
  const record = readRecord(value, "vttMap.pings[]");
  const label = readOptionalString(record, "label", "vttMap.pings.label");
  return {
    id: readString(record, "id", "vttMap.pings.id"),
    x: readNumber(record, "x", "vttMap.pings.x"),
    y: readNumber(record, "y", "vttMap.pings.y"),
    ...(label !== undefined ? { label } : {}),
    expiresAt: readString(record, "expiresAt", "vttMap.pings.expiresAt"),
  };
}

function decodeVttLightSource(value: unknown): NonNullable<VttMapStateDto["lightSources"]>[number] {
  const record = readRecord(value, "vttMap.lightSources[]");
  const label = readNullableString(record, "label", "vttMap.lightSources.label");
  const createdBySessionCharacterId = readNullableString(record, "createdBySessionCharacterId", "vttMap.lightSources.createdBySessionCharacterId");
  return {
    id: readString(record, "id", "vttMap.lightSources.id"),
    x: readNumber(record, "x", "vttMap.lightSources.x"),
    y: readNumber(record, "y", "vttMap.lightSources.y"),
    rangeFt: readPositiveInteger(record, "rangeFt", "vttMap.lightSources.rangeFt"),
    ...(record.label !== undefined ? { label } : {}),
    ...(record.createdBySessionCharacterId !== undefined ? { createdBySessionCharacterId } : {}),
  };
}

function decodeSrdMonsterReferenceSource(value: unknown): NonNullable<NonNullable<VttMapStateDto["tokens"][number]["monster"]>["source"]> {
  const record = readRecord(value, "vttMap.tokens.monster.source");
  return {
    ...(readOptionalString(record, "file", "vttMap.tokens.monster.source.file") !== undefined ? { file: readOptionalString(record, "file", "vttMap.tokens.monster.source.file") } : {}),
    ...(readOptionalString(record, "page", "vttMap.tokens.monster.source.page") !== undefined ? { page: readOptionalString(record, "page", "vttMap.tokens.monster.source.page") } : {}),
    ...(readOptionalString(record, "heading", "vttMap.tokens.monster.source.heading") !== undefined ? { heading: readOptionalString(record, "heading", "vttMap.tokens.monster.source.heading") } : {}),
  };
}

function decodeSrdMonsterReference(value: unknown): NonNullable<VttMapStateDto["tokens"][number]["monster"]> {
  const record = readRecord(value, "vttMap.tokens.monster");
  const source = record.source === undefined || record.source === null ? record.source : decodeSrdMonsterReferenceSource(record.source);
  return {
    id: readString(record, "id", "vttMap.tokens.monster.id"),
    nameEn: readString(record, "nameEn", "vttMap.tokens.monster.nameEn"),
    nameKo: readNullableString(record, "nameKo", "vttMap.tokens.monster.nameKo"),
    basicRaw: readString(record, "basicRaw", "vttMap.tokens.monster.basicRaw"),
    armorClassRaw: readNullableString(record, "armorClassRaw", "vttMap.tokens.monster.armorClassRaw"),
    hitPointsRaw: readNullableString(record, "hitPointsRaw", "vttMap.tokens.monster.hitPointsRaw"),
    speedRaw: readNullableString(record, "speedRaw", "vttMap.tokens.monster.speedRaw"),
    challengeRaw: readNullableString(record, "challengeRaw", "vttMap.tokens.monster.challengeRaw"),
    sensesRaw: readNullableString(record, "sensesRaw", "vttMap.tokens.monster.sensesRaw"),
    languagesRaw: readNullableString(record, "languagesRaw", "vttMap.tokens.monster.languagesRaw"),
    traits: readStringArray(record, "traits", "vttMap.tokens.monster.traits"),
    actions: readStringArray(record, "actions", "vttMap.tokens.monster.actions"),
    legendaryActions: readStringArray(record, "legendaryActions", "vttMap.tokens.monster.legendaryActions"),
    playReference: readNullableString(record, "playReference", "vttMap.tokens.monster.playReference"),
    ...(record.source !== undefined ? { source } : {}),
  };
}

function decodeVttToken(value: unknown): VttMapStateDto["tokens"][number] {
  const record = readRecord(value, "vttMap.tokens[]");
  const encounterRole = readOptionalStringEnum(record, "encounterRole", ["fixed", "scalable"], "vttMap.tokens.encounterRole");
  const monster = record.monster === undefined || record.monster === null ? record.monster : decodeSrdMonsterReference(record.monster);
  const hidden = readOptionalBoolean(record, "hidden", "vttMap.tokens.hidden");
  const isHostile = readOptionalBoolean(record, "isHostile", "vttMap.tokens.isHostile");
  const encounterPriority = readOptionalNonNegativeInteger(record, "encounterPriority", "vttMap.tokens.encounterPriority");
  return {
    id: readString(record, "id", "vttMap.tokens.id"),
    npcId: readNullableString(record, "npcId", "vttMap.tokens.npcId"),
    sessionCharacterId: readNullableString(record, "sessionCharacterId", "vttMap.tokens.sessionCharacterId"),
    startingPositionId: readNullableString(record, "startingPositionId", "vttMap.tokens.startingPositionId"),
    name: readString(record, "name", "vttMap.tokens.name"),
    imageUrl: readNullableString(record, "imageUrl", "vttMap.tokens.imageUrl"),
    x: readNumber(record, "x", "vttMap.tokens.x"),
    y: readNumber(record, "y", "vttMap.tokens.y"),
    size: readPositiveInteger(record, "size", "vttMap.tokens.size"),
    ...(hidden !== undefined ? { hidden } : {}),
    ...(isHostile !== undefined ? { isHostile } : {}),
    ...(encounterRole !== undefined ? { encounterRole } : {}),
    encounterGroupId: readNullableString(record, "encounterGroupId", "vttMap.tokens.encounterGroupId"),
    ...(encounterPriority !== undefined ? { encounterPriority } : {}),
    ...(record.monster !== undefined ? { monster } : {}),
  };
}

function decodeVttEncounterScaling(value: unknown): NonNullable<VttMapStateDto["encounterScaling"]> {
  const record = readRecord(value, "vttMap.encounterScaling");
  const mode = readString(record, "mode", "vttMap.encounterScaling.mode");
  if (mode !== "by_party_ratio") {
    throw new Error("vttMap.encounterScaling.mode is invalid.");
  }
  const minMonsterCount = readOptionalPositiveInteger(record, "minMonsterCount", "vttMap.encounterScaling.minMonsterCount");
  return {
    enabled: readBoolean(record, "enabled", "vttMap.encounterScaling.enabled"),
    basePartySize: readPositiveInteger(record, "basePartySize", "vttMap.encounterScaling.basePartySize"),
    ...(minMonsterCount !== undefined ? { minMonsterCount } : {}),
    mode,
  };
}

function decodeVttFogRect(value: unknown): VttMapStateDto["fogRects"][number] {
  const record = readRecord(value, "vttMap.fogRects[]");
  return {
    id: readString(record, "id", "vttMap.fogRects.id"),
    x: readNumber(record, "x", "vttMap.fogRects.x"),
    y: readNumber(record, "y", "vttMap.fogRects.y"),
    width: readPositiveInteger(record, "width", "vttMap.fogRects.width"),
    height: readPositiveInteger(record, "height", "vttMap.fogRects.height"),
  };
}

function decodeVttTerrainCellBase(
  value: unknown,
  label: string,
): NonNullable<VttMapStateDto["terrainCells"]>[number] {
  const record = readRecord(value, label);
  return {
    id: readString(record, "id", `${label}.id`),
    x: readNumber(record, "x", `${label}.x`),
    y: readNumber(record, "y", `${label}.y`),
    width: readPositiveInteger(record, "width", `${label}.width`),
    height: readPositiveInteger(record, "height", `${label}.height`),
    name: readNullableString(record, "name", `${label}.name`),
    description: readNullableString(record, "description", `${label}.description`),
    terrainEffectId: readNullableString(record, "terrainEffectId", `${label}.terrainEffectId`),
  };
}

function decodeVttDoorCell(value: unknown): NonNullable<VttMapStateDto["doorCells"]>[number] {
  const record = readRecord(value, "vttMap.doorCells[]");
  const state = readStringEnum(record, "state", ["open", "closed", "locked", "broken"], "vttMap.doorCells.state");
  const canBreak = readOptionalBoolean(record, "canBreak", "vttMap.doorCells.canBreak");
  return {
    ...decodeVttTerrainCellBase(record, "vttMap.doorCells"),
    state,
    keyItemId: readNullableString(record, "keyItemId", "vttMap.doorCells.keyItemId"),
    ...(canBreak !== undefined ? { canBreak } : {}),
    breakCheckDc: readNullableIntegerInRange(record, "breakCheckDc", 1, 40, "vttMap.doorCells.breakCheckDc"),
  };
}

function decodeVttShapeCell(value: unknown, label: string): NonNullable<NonNullable<VttMapStateDto["objectCells"]>[number]["shapeCells"]>[number] {
  const record = readRecord(value, label);
  return {
    x: readNumber(record, "x", `${label}.x`),
    y: readNumber(record, "y", `${label}.y`),
    width: readPositiveInteger(record, "width", `${label}.width`),
    height: readPositiveInteger(record, "height", `${label}.height`),
  };
}

function decodeVttRevealCheck(value: unknown, label: string): NonNullable<NonNullable<VttMapStateDto["objectCells"]>[number]["revealChecks"]>[number] {
  const record = readRecord(value, label);
  const requiresCheck = readOptionalBoolean(record, "requiresCheck", `${label}.requiresCheck`);
  const dc = readOptionalIntegerInRange(record, "dc", 1, 40, `${label}.dc`);
  return {
    contentId: readString(record, "contentId", `${label}.contentId`),
    ...(requiresCheck !== undefined ? { requiresCheck } : {}),
    ability: readNullableString(record, "ability", `${label}.ability`),
    skill: readNullableString(record, "skill", `${label}.skill`),
    ...(dc !== undefined ? { dc } : {}),
  };
}

function decodeVttObjectEvent(value: unknown, label: string): NonNullable<NonNullable<VttMapStateDto["objectCells"]>[number]["events"]>[number] {
  const record = readRecord(value, label);
  const type = readString(record, "type", `${label}.type`);
  if (type !== "REVEAL_FOG_ON_PROXIMITY") {
    throw new Error(`${label}.type is invalid.`);
  }
  const trigger = readRecord(record.trigger, `${label}.trigger`);
  const effect = readRecord(record.effect, `${label}.effect`);
  const once = readOptionalBoolean(trigger, "once", `${label}.trigger.once`);
  return {
    id: readString(record, "id", `${label}.id`),
    name: readNullableString(record, "name", `${label}.name`),
    type,
    trigger: {
      distanceFeet: readPositiveInteger(trigger, "distanceFeet", `${label}.trigger.distanceFeet`),
      ...(once !== undefined ? { once } : {}),
    },
    effect: {
      revealRadiusFeet: readPositiveInteger(effect, "revealRadiusFeet", `${label}.effect.revealRadiusFeet`),
    },
  };
}

function decodeVttObjectHazard(value: unknown, label: string): NonNullable<NonNullable<VttMapStateDto["objectCells"]>[number]["hazard"]> {
  const record = readRecord(value, label);
  const kind = readStringEnum(record, "kind", ["TRAP", "AMBUSH", "HAZARD"], `${label}.kind`);
  const armed = readOptionalBoolean(record, "armed", `${label}.armed`);
  const triggerOnce = readOptionalBoolean(record, "triggerOnce", `${label}.triggerOnce`);
  const detectionRadiusCells = readOptionalPositiveInteger(record, "detectionRadiusCells", `${label}.detectionRadiusCells`);
  const detectionDc = readOptionalIntegerInRange(record, "detectionDc", 1, 40, `${label}.detectionDc`);
  const linkedClueIds = readOptionalStringArray(record, "linkedClueIds", `${label}.linkedClueIds`);
  const attemptedBySessionCharacterIds = readOptionalStringArray(record, "attemptedBySessionCharacterIds", `${label}.attemptedBySessionCharacterIds`);
  const detectedBySessionCharacterIds = readOptionalStringArray(record, "detectedBySessionCharacterIds", `${label}.detectedBySessionCharacterIds`);
  return {
    kind,
    ...(armed !== undefined ? { armed } : {}),
    ...(triggerOnce !== undefined ? { triggerOnce } : {}),
    ...(detectionRadiusCells !== undefined ? { detectionRadiusCells } : {}),
    ...(detectionDc !== undefined ? { detectionDc } : {}),
    ...(linkedClueIds !== undefined ? { linkedClueIds } : {}),
    ...(attemptedBySessionCharacterIds !== undefined ? { attemptedBySessionCharacterIds } : {}),
    ...(detectedBySessionCharacterIds !== undefined ? { detectedBySessionCharacterIds } : {}),
  };
}

function decodeVttObjectCell(value: unknown): NonNullable<VttMapStateDto["objectCells"]>[number] {
  const record = readRecord(value, "vttMap.objectCells[]");
  const shapeCells = record.shapeCells === undefined || record.shapeCells === null
    ? undefined
    : decodeArray(record.shapeCells, (entry) => decodeVttShapeCell(entry, "vttMap.objectCells.shapeCells[]"), "vttMap.objectCells.shapeCells");
  const revealChecks = record.revealChecks === undefined || record.revealChecks === null
    ? undefined
    : decodeArray(record.revealChecks, (entry) => decodeVttRevealCheck(entry, "vttMap.objectCells.revealChecks[]"), "vttMap.objectCells.revealChecks");
  const events = record.events === undefined || record.events === null
    ? undefined
    : decodeArray(record.events, (entry) => decodeVttObjectEvent(entry, "vttMap.objectCells.events[]"), "vttMap.objectCells.events");
  const hazard = record.hazard === undefined || record.hazard === null ? record.hazard : decodeVttObjectHazard(record.hazard, "vttMap.objectCells.hazard");
  const visibleToPlayers = readOptionalBoolean(record, "visibleToPlayers", "vttMap.objectCells.visibleToPlayers");
  const canBreak = readOptionalBoolean(record, "canBreak", "vttMap.objectCells.canBreak");
  const broken = readOptionalBoolean(record, "broken", "vttMap.objectCells.broken");
  const hiddenClueIds = readOptionalStringArray(record, "hiddenClueIds", "vttMap.objectCells.hiddenClueIds");
  const hiddenItemIds = readOptionalStringArray(record, "hiddenItemIds", "vttMap.objectCells.hiddenItemIds");
  const hiddenEventIds = readOptionalStringArray(record, "hiddenEventIds", "vttMap.objectCells.hiddenEventIds");
  const observedBySessionCharacterIds = readOptionalStringArray(record, "observedBySessionCharacterIds", "vttMap.objectCells.observedBySessionCharacterIds");
  return {
    ...decodeVttTerrainCellBase(record, "vttMap.objectCells"),
    ...(shapeCells !== undefined ? { shapeCells } : {}),
    ...(visibleToPlayers !== undefined ? { visibleToPlayers } : {}),
    ...(canBreak !== undefined ? { canBreak } : {}),
    ...(broken !== undefined ? { broken } : {}),
    breakCheckDc: readNullableIntegerInRange(record, "breakCheckDc", 1, 40, "vttMap.objectCells.breakCheckDc"),
    ...(hiddenClueIds !== undefined ? { hiddenClueIds } : {}),
    ...(hiddenItemIds !== undefined ? { hiddenItemIds } : {}),
    ...(hiddenEventIds !== undefined ? { hiddenEventIds } : {}),
    ...(observedBySessionCharacterIds !== undefined ? { observedBySessionCharacterIds } : {}),
    ...(revealChecks !== undefined ? { revealChecks } : {}),
    ...(events !== undefined ? { events } : {}),
    ...(record.hazard !== undefined ? { hazard } : {}),
  };
}

export function decodeVttMapState(value: unknown): VttMapStateDto {
  const record = readRecord(value, "vttMap");
  const gridType = readString(record, "gridType", "vttMap.gridType");
  if (gridType !== "square" && gridType !== "hex") {
    throw new Error("vttMap.gridType must be square or hex.");
  }
  const encounterScaling = record.encounterScaling === undefined || record.encounterScaling === null
    ? record.encounterScaling
    : decodeVttEncounterScaling(record.encounterScaling);
  const startingPositions = record.startingPositions === undefined || record.startingPositions === null
    ? undefined
    : decodeArray(record.startingPositions, decodeVttStartingPosition, "vttMap.startingPositions");
  const pings = record.pings === undefined || record.pings === null
    ? undefined
    : decodeArray(record.pings, decodeVttPing, "vttMap.pings");
  const lightSources = record.lightSources === undefined || record.lightSources === null
    ? undefined
    : decodeArray(record.lightSources, decodeVttLightSource, "vttMap.lightSources");
  const terrainCells = record.terrainCells === undefined || record.terrainCells === null
    ? undefined
    : decodeArray(record.terrainCells, (entry) => decodeVttTerrainCellBase(entry, "vttMap.terrainCells[]"), "vttMap.terrainCells");
  const wallCells = record.wallCells === undefined || record.wallCells === null
    ? undefined
    : decodeArray(record.wallCells, (entry) => decodeVttTerrainCellBase(entry, "vttMap.wallCells[]"), "vttMap.wallCells");
  const doorCells = record.doorCells === undefined || record.doorCells === null
    ? undefined
    : decodeArray(record.doorCells, decodeVttDoorCell, "vttMap.doorCells");
  const objectCells = record.objectCells === undefined || record.objectCells === null
    ? undefined
    : decodeArray(record.objectCells, decodeVttObjectCell, "vttMap.objectCells");
  return {
    id: readString(record, "id", "vttMap.id"),
    scenarioNodeId: readNullableString(record, "scenarioNodeId", "vttMap.scenarioNodeId"),
    imageUrl: readNullableString(record, "imageUrl", "vttMap.imageUrl"),
    gridType,
    gridSize: readIntegerInRange(record, "gridSize", 16, 160, "vttMap.gridSize"),
    width: readIntegerInRange(record, "width", 320, 4000, "vttMap.width"),
    height: readIntegerInRange(record, "height", 240, 4000, "vttMap.height"),
    tokens: readArray(record, "tokens", decodeVttToken, "vttMap.tokens"),
    ...(encounterScaling !== undefined ? { encounterScaling } : {}),
    fogRects: readArray(record, "fogRects", decodeVttFogRect, "vttMap.fogRects"),
    ...(startingPositions ? { startingPositions } : {}),
    ...(pings ? { pings } : {}),
    ...(lightSources ? { lightSources } : {}),
    ...(terrainCells ? { terrainCells } : {}),
    ...(wallCells ? { wallCells } : {}),
    ...(doorCells ? { doorCells } : {}),
    ...(objectCells ? { objectCells } : {}),
    updatedAt: readString(record, "updatedAt", "vttMap.updatedAt"),
  };
}

export function decodeCombatReactionPrompt(value: unknown, label = "combatReactionPrompt"): CombatReactionPromptDto {
  const record = readRecord(value, label);
  const type = readString(record, "type", `${label}.type`);
  if (type !== "opportunity_attack" && type !== "shield" && type !== "ready_action" && type !== "counterspell") {
    throw new Error(`${label}.type is invalid.`);
  }
  return {
    id: readString(record, "id", `${label}.id`),
    type,
    reactorParticipantId: readString(record, "reactorParticipantId", `${label}.reactorParticipantId`),
    reactorName: readString(record, "reactorName", `${label}.reactorName`),
    moverParticipantId: readString(record, "moverParticipantId", `${label}.moverParticipantId`),
    moverName: readString(record, "moverName", `${label}.moverName`),
    message: readString(record, "message", `${label}.message`),
  };
}

function decodeOptionalCombatReactionPrompt(value: unknown, label: string): CombatReactionPromptDto | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return decodeCombatReactionPrompt(value, label);
}

function decodeCombatConcentration(value: unknown, label: string): NonNullable<CombatParticipantResponseDto["concentration"]> {
  const record = readRecord(value, label);
  return {
    spellId: readString(record, "spellId", `${label}.spellId`),
    targetIds: readStringArray(record, "targetIds", `${label}.targetIds`),
    effectIds: readStringArray(record, "effectIds", `${label}.effectIds`),
    startedAtRound: readPositiveInteger(record, "startedAtRound", `${label}.startedAtRound`),
    endsAtRound: readNullableNonNegativeInteger(record, "endsAtRound", `${label}.endsAtRound`),
    endsAtTurn: readNullableNonNegativeInteger(record, "endsAtTurn", `${label}.endsAtTurn`),
  };
}

function decodeSpellSlotResources(value: unknown, label: string): NonNullable<CombatParticipantResponseDto["actionResources"]["spellSlots"]> {
  const record = readRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      const slot = readRecord(entry, `${label}.${key}`);
      return [key, {
        total: readNonNegativeInteger(slot, "total", `${label}.${key}.total`),
        remaining: readNonNegativeInteger(slot, "remaining", `${label}.${key}.remaining`),
      }];
    }),
  );
}

function decodeCombatActionResources(value: unknown): CombatParticipantResponseDto["actionResources"] {
  const record = readRecord(value, "combat.participant.actionResources");
  const hasteActionAvailable = readOptionalBoolean(record, "hasteActionAvailable", "combat.participant.actionResources.hasteActionAvailable");
  const spellSlots = record.spellSlots === undefined || record.spellSlots === null
    ? undefined
    : decodeSpellSlotResources(record.spellSlots, "combat.participant.actionResources.spellSlots");
  return {
    actionAvailable: readBoolean(record, "actionAvailable", "combat.participant.actionResources.actionAvailable"),
    bonusActionAvailable: readBoolean(record, "bonusActionAvailable", "combat.participant.actionResources.bonusActionAvailable"),
    reactionAvailable: readBoolean(record, "reactionAvailable", "combat.participant.actionResources.reactionAvailable"),
    additionalActionAvailable: readBoolean(record, "additionalActionAvailable", "combat.participant.actionResources.additionalActionAvailable"),
    extraAttackAvailable: readBoolean(record, "extraAttackAvailable", "combat.participant.actionResources.extraAttackAvailable"),
    ...(hasteActionAvailable !== undefined ? { hasteActionAvailable } : {}),
    twoWeaponAttackAvailable: readBoolean(record, "twoWeaponAttackAvailable", "combat.participant.actionResources.twoWeaponAttackAvailable"),
    sneakAttackAvailable: readBoolean(record, "sneakAttackAvailable", "combat.participant.actionResources.sneakAttackAvailable"),
    movementFtTotal: readNonNegativeInteger(record, "movementFtTotal", "combat.participant.actionResources.movementFtTotal"),
    movementFtRemaining: readNonNegativeInteger(record, "movementFtRemaining", "combat.participant.actionResources.movementFtRemaining"),
    spellSlotLevel1Total: readNonNegativeInteger(record, "spellSlotLevel1Total", "combat.participant.actionResources.spellSlotLevel1Total"),
    spellSlotLevel1Remaining: readNonNegativeInteger(record, "spellSlotLevel1Remaining", "combat.participant.actionResources.spellSlotLevel1Remaining"),
    ...(spellSlots !== undefined ? { spellSlots } : {}),
  };
}

function decodeCombatMonsterAction(value: unknown, label: string): CombatParticipantResponseDto["monsterActions"][number] {
  const record = readRecord(value, label);
  const decodedSave = record.save === undefined || record.save === null
    ? null
    : decodeCombatMonsterActionSave(record.save, `${label}.save`);
  return {
    actionId: readString(record, "actionId", `${label}.actionId`),
    label: readString(record, "label", `${label}.label`),
    attackKind: readString(record, "attackKind", `${label}.attackKind`),
    attackBonus: readInteger(record, "attackBonus", `${label}.attackBonus`),
    damageDice: readString(record, "damageDice", `${label}.damageDice`),
    damageType: readNullableString(record, "damageType", `${label}.damageType`),
    rangeFt: readNonNegativeInteger(record, "rangeFt", `${label}.rangeFt`),
    longRangeFt: readNullableNonNegativeInteger(record, "longRangeFt", `${label}.longRangeFt`),
    confidence: readNullableStringEnum(record, "confidence", ["high", "medium", "low", "none"], `${label}.confidence`),
    costType: readNullableString(record, "costType", `${label}.costType`),
    targetKind: readNullableStringEnum(
      record,
      "targetKind",
      ["none", "self", "single_target", "area"] as const,
      `${label}.targetKind`,
    ),
    resolutionKind: readNullableStringEnum(
      record,
      "resolutionKind",
      ["attack", "save", "special"] as const,
      `${label}.resolutionKind`,
    ),
    specialType: readNullableString(record, "specialType", `${label}.specialType`),
    usage: readNullableString(record, "usage", `${label}.usage`),
    recharge: readNullableString(record, "recharge", `${label}.recharge`),
    save: decodedSave,
    conditionRiders: readOptionalStringArray(record, "conditionRiders", `${label}.conditionRiders`) ?? [],
    effectTags: readOptionalStringArray(record, "effectTags", `${label}.effectTags`) ?? [],
    childActions: record.childActions === undefined || record.childActions === null
      ? []
      : decodeArray(
          record.childActions,
          (entry) => decodeCombatMonsterChildAction(entry, `${label}.childActions[]`),
          `${label}.childActions`,
        ),
    available: readOptionalBoolean(record, "available", `${label}.available`),
    unavailableReason: readNullableString(record, "unavailableReason", `${label}.unavailableReason`),
  };
}

function decodeCombatMonsterActionSave(
  value: unknown,
  label: string,
): NonNullable<CombatParticipantResponseDto["monsterActions"][number]["save"]> {
  const record = readRecord(value, label);
  return {
    ability: readString(record, "ability", `${label}.ability`),
    dcSource: readNullableString(record, "dcSource", `${label}.dcSource`),
    fixedDc: readNullableIntegerInRange(record, "fixedDc", 1, 40, `${label}.fixedDc`),
  };
}

function decodeCombatMonsterChildAction(
  value: unknown,
  label: string,
): NonNullable<CombatParticipantResponseDto["monsterActions"][number]["childActions"]>[number] {
  const record = readRecord(value, label);
  return {
    actionId: readString(record, "actionId", `${label}.actionId`),
    count: readPositiveInteger(record, "count", `${label}.count`),
  };
}

function decodeCombatTerrainDamagePacket(value: unknown, label: string): NonNullable<CombatMoveResultDto["terrainEffects"]>["damagePackets"][number] {
  const record = readRecord(value, label);
  return {
    sourceEffectId: readString(record, "sourceEffectId", `${label}.sourceEffectId`),
    damageType: readString(record, "damageType", `${label}.damageType`),
    expression: readString(record, "expression", `${label}.expression`),
    total: readNonNegativeInteger(record, "total", `${label}.total`),
  };
}

function decodeCombatTerrainEffect(value: unknown, label: string): NonNullable<CombatMoveResultDto["terrainEffects"]> {
  const record = readRecord(value, label);
  const trigger = readString(record, "trigger", `${label}.trigger`);
  if (trigger !== "on_enter" && trigger !== "on_turn_start" && trigger !== "on_turn_end" && trigger !== "on_exit") {
    throw new Error(`${label}.trigger is invalid.`);
  }
  return {
    trigger,
    damageTotal: readNonNegativeInteger(record, "damageTotal", `${label}.damageTotal`),
    damagePackets: readArray(record, "damagePackets", (entry) => decodeCombatTerrainDamagePacket(entry, `${label}.damagePackets[]`), `${label}.damagePackets`),
    appliedConditionTags: readStringArray(record, "appliedConditionTags", `${label}.appliedConditionTags`),
    removedConditionTags: readStringArray(record, "removedConditionTags", `${label}.removedConditionTags`),
    concentrationMaintained: readNullableBoolean(record, "concentrationMaintained", `${label}.concentrationMaintained`),
  };
}

export function decodeCombatResponse(value: unknown): CombatResponseDto {
  const record = readRecord(value, "combat");
  const pendingReactions = record.pendingReactions === undefined || record.pendingReactions === null
    ? undefined
    : decodeArray(record.pendingReactions, (entry) => decodeCombatReactionPrompt(entry, "combat.pendingReactions[]"), "combat.pendingReactions");
  return {
    combatId: readString(record, "combatId", "combat.combatId"),
    sessionId: readString(record, "sessionId", "combat.sessionId"),
    status: readStringEnum(record, "status", combatStatusValues, "combat.status"),
    roundNo: readPositiveInteger(record, "roundNo", "combat.roundNo"),
    turnNo: readNonNegativeInteger(record, "turnNo", "combat.turnNo"),
    roundTurnNo: readNonNegativeInteger(record, "roundTurnNo", "combat.roundTurnNo"),
    currentEntityId: readNullableString(record, "currentEntityId", "combat.currentEntityId"),
    participants: readArray(record, "participants", decodeCombatParticipant, "combat.participants"),
    ...(pendingReactions ? { pendingReactions } : {}),
  };
}

function decodeCombatParticipant(value: unknown): CombatParticipantResponseDto {
  const record = readRecord(value, "combat.participant");
  return {
    sessionEntityId: readString(record, "sessionEntityId", "combat.participant.sessionEntityId"),
    entityType: readStringEnum(record, "entityType", combatEntityTypeValues, "combat.participant.entityType"),
    sessionCharacterId: readNullableString(record, "sessionCharacterId", "combat.participant.sessionCharacterId"),
    tokenId: readNullableString(record, "tokenId", "combat.participant.tokenId"),
    name: readString(record, "name", "combat.participant.name"),
    currentHp: readNullableNonNegativeInteger(record, "currentHp", "combat.participant.currentHp"),
    tempHp: readNullableNonNegativeInteger(record, "tempHp", "combat.participant.tempHp"),
    maxHp: readNullableNonNegativeInteger(record, "maxHp", "combat.participant.maxHp"),
    armorClass: readNullableNonNegativeInteger(record, "armorClass", "combat.participant.armorClass"),
    initiative: readInteger(record, "initiative", "combat.participant.initiative"),
    turnOrder: readNonNegativeInteger(record, "turnOrder", "combat.participant.turnOrder"),
    isAlive: readBoolean(record, "isAlive", "combat.participant.isAlive"),
    isHostile: readBoolean(record, "isHostile", "combat.participant.isHostile"),
    hasActedThisRound: readBoolean(record, "hasActedThisRound", "combat.participant.hasActedThisRound"),
    conditions: readStringArray(record, "conditions", "combat.participant.conditions"),
    concentration: record.concentration === undefined || record.concentration === null
      ? null
      : decodeCombatConcentration(record.concentration, "combat.participant.concentration"),
    actionResources: decodeCombatActionResources(record.actionResources),
    monsterActions: record.monsterActions === undefined || record.monsterActions === null
      ? []
      : decodeArray(record.monsterActions, (entry) => decodeCombatMonsterAction(entry, "combat.participant.monsterActions[]"), "combat.participant.monsterActions"),
  };
}

export function decodeCombatActionResult(value: unknown): CombatActionResultDto {
  const record = readRecord(value, "combatActionResult");
  const map = record.map === undefined || record.map === null ? record.map : decodeVttMapState(record.map);
  const pendingReaction = decodeOptionalCombatReactionPrompt(record.pendingReaction, "combatActionResult.pendingReaction");
  const pendingReactions = record.pendingReactions === undefined || record.pendingReactions === null
    ? undefined
    : decodeArray(record.pendingReactions, (entry) => decodeCombatReactionPrompt(entry, "combatActionResult.pendingReactions[]"), "combatActionResult.pendingReactions");
  return {
    combat: decodeCombatResponse(record.combat),
    message: readString(record, "message", "combatActionResult.message"),
    attackTotal: readNullableInteger(record, "attackTotal", "combatActionResult.attackTotal"),
    damageTotal: readNullableNonNegativeInteger(record, "damageTotal", "combatActionResult.damageTotal"),
    turnLogId: readNullableString(record, "turnLogId", "combatActionResult.turnLogId"),
    ...(map !== undefined ? { map } : {}),
    ...(pendingReaction !== undefined ? { pendingReaction } : {}),
    ...(pendingReactions ? { pendingReactions } : {}),
  };
}

export function decodeCombatMoveResult(value: unknown): CombatMoveResultDto {
  const record = readRecord(value, "combatMoveResult");
  const pendingReaction = decodeOptionalCombatReactionPrompt(record.pendingReaction, "combatMoveResult.pendingReaction");
  const pendingReactions = record.pendingReactions === undefined || record.pendingReactions === null
    ? undefined
    : decodeArray(record.pendingReactions, (entry) => decodeCombatReactionPrompt(entry, "combatMoveResult.pendingReactions[]"), "combatMoveResult.pendingReactions");
  const movementDistanceFt = readOptionalNonNegativeInteger(record, "movementDistanceFt", "combatMoveResult.movementDistanceFt");
  const movementCostFt = readOptionalNonNegativeInteger(record, "movementCostFt", "combatMoveResult.movementCostFt");
  return {
    combat: decodeCombatResponse(record.combat),
    map: decodeVttMapState(record.map),
    message: readString(record, "message", "combatMoveResult.message"),
    pendingReaction: pendingReaction ?? null,
    ...(pendingReactions ? { pendingReactions } : {}),
    ...(movementDistanceFt !== undefined ? { movementDistanceFt } : {}),
    ...(movementCostFt !== undefined ? { movementCostFt } : {}),
    ...(record.terrainEffects !== undefined
      ? { terrainEffects: record.terrainEffects === null ? null : decodeCombatTerrainEffect(record.terrainEffects, "combatMoveResult.terrainEffects") }
      : {}),
  };
}

export function decodeTurnAdvanceResponse(value: unknown): TurnAdvanceResponseDto {
  const record = readRecord(value, "turnAdvance");
  const message = readOptionalString(record, "message", "turnAdvance.message");
  const terrainEffects = record.terrainEffects === undefined || record.terrainEffects === null
    ? record.terrainEffects
    : decodeCombatTerrainEffect(record.terrainEffects, "turnAdvance.terrainEffects");
  const turnEndTerrainEffects = record.turnEndTerrainEffects === undefined || record.turnEndTerrainEffects === null
    ? record.turnEndTerrainEffects
    : decodeCombatTerrainEffect(record.turnEndTerrainEffects, "turnAdvance.turnEndTerrainEffects");
  return {
    combatId: readString(record, "combatId", "turnAdvance.combatId"),
    endedEntityId: readNullableString(record, "endedEntityId", "turnAdvance.endedEntityId"),
    nextEntityId: readNullableString(record, "nextEntityId", "turnAdvance.nextEntityId"),
    roundNo: readPositiveInteger(record, "roundNo", "turnAdvance.roundNo"),
    turnNo: readNonNegativeInteger(record, "turnNo", "turnAdvance.turnNo"),
    ...(message !== undefined ? { message } : {}),
    ...(record.terrainEffects !== undefined ? { terrainEffects: terrainEffects ?? null } : {}),
    ...(record.turnEndTerrainEffects !== undefined ? { turnEndTerrainEffects: turnEndTerrainEffects ?? null } : {}),
  };
}

export function decodeVttMapInteractionResponse(value: unknown): VttMapInteractionResponseDto {
  const record = readRecord(value, "vttMapInteraction");
  const map = record.map === undefined || record.map === null ? record.map : decodeVttMapState(record.map);
  const checkOptions = record.checkOptions === undefined || record.checkOptions === null
    ? undefined
    : decodeArray(record.checkOptions, decodeMainCommandCheckOption, "vttMapInteraction.checkOptions");
  const data = record.data === undefined || record.data === null
    ? record.data
    : decodeVttMapInteractionData(record.data);
  return {
    status: readStringEnum(record, "status", mainCommandStatusValues, "vttMapInteraction.status"),
    message: readString(record, "message", "vttMapInteraction.message"),
    ...(map !== undefined ? { map } : {}),
    ...(checkOptions ? { checkOptions } : {}),
    ...(record.data !== undefined ? { data: data ?? null } : {}),
  };
}

function decodeVttMapInteractionData(value: unknown): NonNullable<VttMapInteractionResponseDto["data"]> {
  return decodeMainCommandResponseData(value, "vttMapInteraction.data");
}
