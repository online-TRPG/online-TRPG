import {
  Character,
  CharacterAvatarType as PrismaCharacterAvatarType,
  ConnectionStatus as PrismaConnectionStatus,
  GamePhase as PrismaGamePhase,
  GameState,
  GmMode as PrismaGmMode,
  InventoryEntry,
  ItemDefinition,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  Scenario,
  ScenarioLicense as PrismaScenarioLicense,
  ScenarioNode,
  ScenarioSourceType as PrismaScenarioSourceType,
  Session,
  SessionCharacter,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionParticipant,
  SessionScenario,
  SessionScenarioStatus as PrismaSessionScenarioStatus,
  SessionStatus as PrismaSessionStatus,
  SessionVisibility as PrismaSessionVisibility,
  User,
} from "@prisma/client";
import {
  AbilityScoresDto,
  AuthProvider,
  CharacterAvatarType,
  CharacterLevelUpPreviewContextDto,
  CharacterResponseDto,
  ConnectionStatus,
  GamePhase,
  GameStateResponseDto,
  GmMode,
  InventoryItemDto,
  normalizeInventoryItemsDisplay,
  ParticipantRole,
  ScenarioLicense,
  ScenarioNodeResponseDto,
  ScenarioNodeCheckOptionsConfigDto,
  ScenarioNodeType,
  ScenarioResponseDto,
  ScenarioSourceType,
  ScenarioSummaryResponseDto,
  ScenarioValidationReportDto,
  SessionCharacterResponseDto,
  SessionCharacterStatus,
  SessionParticipantResponseDto,
  SessionParticipantStatus,
  SessionResponseDto,
  SessionScenarioResponseDto,
  SessionScenarioStatus,
  SessionStatus,
  SessionVisibility,
  StartingSpellsDto,
  UserRole,
  UserResponseDto,
  decodeLenientScenarioClueArray,
  decodeLenientScenarioNodeCheckOptionsConfig,
  decodeLenientScenarioNpcArray,
  decodeLenientScenarioTransitionArray,
  decodeScenarioNodeMeta,
  decodeScenarioValidationReport,
} from "@trpg/shared-types";
import {
  parseJsonOrFallback,
  parseJsonRecordOrFallback,
  parseJsonStringArrayOrFallback,
} from "../utils/json-runtime";

type SessionScenarioWithScenario = SessionScenario & {
  scenario: Scenario;
  gameState?: GameState | null;
};

type ParticipantWithUserAndCharacter = SessionParticipant & {
  user: User;
  sessionCharacter?: (SessionCharacter & { character: Character }) | null;
};

type CharacterWithAssignments = Character & {
  sessionCharacters?: Array<
    SessionCharacter & {
      session: Session & {
        sessionScenarios?: Array<SessionScenario & { gameState?: GameState | null }>;
      };
    }
  >;
};

type SessionCharacterWithBase = SessionCharacter & {
  character: Character;
  resource?: { hitDiceSpent?: number | null } | null;
  inventoryEntries?: Array<InventoryEntry & { itemDefinition: ItemDefinition }>;
};

type SessionWithRelations = Session & {
  sessionScenarios?: SessionScenarioWithScenario[];
};

const sessionStatusMap: Record<PrismaSessionStatus, SessionStatus> = {
  RECRUITING: SessionStatus.RECRUITING,
  PLAYING: SessionStatus.PLAYING,
  PAUSED: SessionStatus.PAUSED,
  COMPLETED: SessionStatus.COMPLETED,
  DISBANDED: SessionStatus.DISBANDED,
};

const sessionVisibilityMap: Record<PrismaSessionVisibility, SessionVisibility> = {
  PUBLIC: SessionVisibility.PUBLIC,
  PRIVATE: SessionVisibility.PRIVATE,
};

const sessionScenarioStatusMap: Record<PrismaSessionScenarioStatus, SessionScenarioStatus> = {
  PLANNED: SessionScenarioStatus.PLANNED,
  ACTIVE: SessionScenarioStatus.ACTIVE,
  COMPLETED: SessionScenarioStatus.COMPLETED,
  ABANDONED: SessionScenarioStatus.ABANDONED,
};

const participantRoleMap: Record<PrismaParticipantRole, ParticipantRole> = {
  HOST: ParticipantRole.HOST,
  GM: ParticipantRole.GM,
  PLAYER: ParticipantRole.PLAYER,
  SPECTATOR: ParticipantRole.SPECTATOR,
};

const participantStatusMap: Record<PrismaParticipantStatus, SessionParticipantStatus> = {
  JOINED: SessionParticipantStatus.JOINED,
  LEFT: SessionParticipantStatus.LEFT,
  KICKED: SessionParticipantStatus.KICKED,
};

const connectionStatusMap: Record<PrismaConnectionStatus, ConnectionStatus> = {
  ONLINE: ConnectionStatus.ONLINE,
  OFFLINE: ConnectionStatus.OFFLINE,
};

const gamePhaseMap: Record<PrismaGamePhase, GamePhase> = {
  LOBBY: GamePhase.LOBBY,
  EXPLORATION: GamePhase.EXPLORATION,
  COMBAT: GamePhase.COMBAT,
  DIALOGUE: GamePhase.DIALOGUE,
  REST: GamePhase.REST,
};

const gmModeMap: Record<PrismaGmMode, GmMode> = {
  AI: GmMode.AI,
  HUMAN: GmMode.HUMAN,
};

const authProviderMap = {
  LOCAL: AuthProvider.LOCAL,
  KAKAO: AuthProvider.KAKAO,
  DISCORD: AuthProvider.DISCORD,
  GUEST: AuthProvider.GUEST,
} as const;

const userRoleMap = {
  USER: UserRole.USER,
  MODERATOR: UserRole.MODERATOR,
  ADMIN: UserRole.ADMIN,
} as const;

const scenarioLicenseMap: Record<PrismaScenarioLicense, ScenarioLicense> = {
  ORIGINAL: ScenarioLicense.ORIGINAL,
  CC_BY_4_0: ScenarioLicense.CC_BY_4_0,
  OTHER_FREE: ScenarioLicense.OTHER_FREE,
};

const scenarioSourceTypeMap: Record<PrismaScenarioSourceType, ScenarioSourceType> = {
  SYSTEM: ScenarioSourceType.SYSTEM,
  USER: ScenarioSourceType.USER,
  CLONED: ScenarioSourceType.CLONED,
};

const sessionCharacterStatusMap: Record<PrismaSessionCharacterStatus, SessionCharacterStatus> = {
  ACTIVE: SessionCharacterStatus.ACTIVE,
  RETIRED: SessionCharacterStatus.RETIRED,
  DEAD: SessionCharacterStatus.DEAD,
  LEFT: SessionCharacterStatus.LEFT,
};

const characterAvatarTypeMap: Record<PrismaCharacterAvatarType, CharacterAvatarType> = {
  DEFAULT: CharacterAvatarType.DEFAULT,
  PRESET: CharacterAvatarType.PRESET,
  UPLOAD: CharacterAvatarType.UPLOAD,
};

const defaultAbilityScores: AbilityScoresDto = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

type LevelUpPreviewDowntimeTaskSummary = {
  status: "active" | "paused" | "completed";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeLevelUpPreviewDowntimeTasks(value: unknown): LevelUpPreviewDowntimeTaskSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((task) => {
    if (!isRecord(task) || !isLevelUpPreviewDowntimeStatus(task.status)) {
      return [];
    }
    return [{ status: task.status }];
  });
}

function isLevelUpPreviewDowntimeStatus(value: unknown): value is LevelUpPreviewDowntimeTaskSummary["status"] {
  return value === "active" || value === "paused" || value === "completed";
}

function readNumberOrFallback(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseAbilityScores(value: string | null | undefined): AbilityScoresDto {
  return parseJsonOrFallback(value, defaultAbilityScores, decodeAbilityScores);
}

function decodeAbilityScores(value: unknown): AbilityScoresDto {
  if (!isRecord(value)) {
    throw new Error("ability scores must be an object.");
  }
  return {
    str: readNumberOrFallback(value, "str", defaultAbilityScores.str),
    dex: readNumberOrFallback(value, "dex", defaultAbilityScores.dex),
    con: readNumberOrFallback(value, "con", defaultAbilityScores.con),
    int: readNumberOrFallback(value, "int", defaultAbilityScores.int),
    wis: readNumberOrFallback(value, "wis", defaultAbilityScores.wis),
    cha: readNumberOrFallback(value, "cha", defaultAbilityScores.cha),
  };
}

function readStringArrayFromRecord(record: Record<string, unknown>, key: string): string[] {
  return decodeStringArray(record[key]);
}

function decodeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
}

function parseStartingSpells(value: string | null | undefined): StartingSpellsDto | null {
  return parseJsonOrFallback(value, null, decodeStartingSpells);
}

function decodeStartingSpells(value: unknown): StartingSpellsDto | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("spells must be an object or null.");
  }
  const preparedSpells = readStringArrayFromRecord(value, "preparedSpells");
  return {
    cantrips: readStringArrayFromRecord(value, "cantrips"),
    spells: readStringArrayFromRecord(value, "spells"),
    ...(preparedSpells.length ? { preparedSpells } : {}),
  };
}

function parseInventoryItems(value: string | null | undefined): InventoryItemDto[] {
  return parseJsonOrFallback(value, [], decodeInventoryItems);
}

function decodeInventoryItems(value: unknown): InventoryItemDto[] {
  if (!Array.isArray(value)) {
    throw new Error("inventory must be an array.");
  }
  return value.flatMap((item) => {
    const decoded = decodeInventoryItem(item);
    return decoded ? [decoded] : [];
  });
}

function readPositiveIntegerProperty(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function readFiniteNumberProperty(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNonNegativeNumberProperty(record: Record<string, unknown>, key: string): number | undefined {
  const value = readFiniteNumberProperty(record, key);
  return value !== undefined && value >= 0 ? value : undefined;
}

function decodeInventoryItem(value: unknown): InventoryItemDto | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const quantity = readPositiveIntegerProperty(value, "quantity");
  if (quantity === null) {
    return null;
  }
  const weightLb = readNonNegativeNumberProperty(value, "weightLb");
  const volumeCuFt = readNonNegativeNumberProperty(value, "volumeCuFt");
  const armorClassBase = readNonNegativeNumberProperty(value, "armorClassBase");
  const armorClassBonus = readFiniteNumberProperty(value, "armorClassBonus");
  const armorStrengthRequirement = readNonNegativeNumberProperty(value, "armorStrengthRequirement");
  return {
    id: value.id,
    name: value.name,
    quantity,
    ...(typeof value.itemDefinitionId === "string" ? { itemDefinitionId: value.itemDefinitionId } : {}),
    ...(typeof value.itemType === "string" ? { itemType: value.itemType } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(weightLb !== undefined ? { weightLb } : {}),
    ...(volumeCuFt !== undefined ? { volumeCuFt } : {}),
    ...(typeof value.damageDice === "string" ? { damageDice: value.damageDice } : {}),
    ...(typeof value.damageType === "string" ? { damageType: value.damageType } : {}),
    ...(armorClassBase !== undefined ? { armorClassBase } : {}),
    ...(armorClassBonus !== undefined ? { armorClassBonus } : {}),
    ...(armorStrengthRequirement !== undefined ? { armorStrengthRequirement } : {}),
    ...(typeof value.armorStealthDisadvantage === "boolean" ? { armorStealthDisadvantage: value.armorStealthDisadvantage } : {}),
    ...(typeof value.useEffect === "string" ? { useEffect: value.useEffect } : {}),
    ...(Array.isArray(value.packContents) ? { packContents: decodeInventoryPackContents(value.packContents) } : {}),
    ...(Array.isArray(value.properties) ? { properties: decodeStringArray(value.properties) } : {}),
    ...(typeof value.containerId === "string" ? { containerId: value.containerId } : {}),
  };
}

function decodeInventoryPackContents(value: unknown): NonNullable<InventoryItemDto["packContents"]> {
  if (!Array.isArray(value)) {
    throw new Error("pack contents must be an array.");
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== "string" || typeof entry.name !== "string") {
      return [];
    }
    const quantity = readPositiveIntegerProperty(entry, "quantity");
    if (quantity === null) {
      return [];
    }
    return [{
      itemId: entry.itemId,
      name: entry.name,
      quantity,
      ...(typeof entry.displayName === "string" ? { displayName: entry.displayName } : {}),
    }];
  });
}

function parseConditionSummary(value: string | null | undefined): string[] {
  return parseJsonOrFallback(value, [], decodeConditionSummary);
}

function decodeConditionSummary(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("conditions must be an array.");
  }
  return Array.from(
    new Set(
      value
        .flatMap((condition) => {
          if (typeof condition === "string") {
            return [condition];
          }
          if (!isRecord(condition)) {
            return [];
          }
          const conditionId = typeof condition.conditionId === "string" ? condition.conditionId : null;
          const tags = decodeStringArray(condition.tags);
          return conditionId ? [conditionId, ...tags] : tags;
        })
        .filter((entry) => entry.length > 0),
    ),
  );
}

function parseSpellSummary(value: string | null | undefined): { knownSpellCount: number; preparedSpellCount: number } {
  return parseJsonOrFallback(value, { knownSpellCount: 0, preparedSpellCount: 0 }, decodeSpellSummary);
}

function decodeSpellSummary(value: unknown): { knownSpellCount: number; preparedSpellCount: number } {
  if (!isRecord(value)) {
    throw new Error("spell summary must be an object.");
  }
  const parsed = value;
  const spells = decodeStringArray(parsed.spells);
  const cantrips = decodeStringArray(parsed.cantrips);
  const preparedSpells = decodeStringArray(parsed.preparedSpells);
  return {
    knownSpellCount: new Set([...spells, ...cantrips]).size,
    preparedSpellCount: new Set(preparedSpells).size,
  };
}

type CharacterAssignmentWithSession = NonNullable<CharacterWithAssignments["sessionCharacters"]>[number];

const LEVEL_UP_PREVIEW_FLAGS = {
  campaignArchive: "p6CampaignArchive",
  campaignCalendar: "campaignCalendar",
  economy: "economy",
} as const;

const PRIVATE_GAME_FLAG_KEYS = new Set<string>([
  "vttMap",
  "gmPrivateNotes",
  "humanGmAiAssistSuggestions",
]);

function getAssignmentActiveScenario(
  assignment: CharacterAssignmentWithSession | null,
): (SessionScenario & { gameState?: GameState | null }) | null {
  return (
    assignment?.session.sessionScenarios?.find((candidate) => candidate.status === "ACTIVE") ??
    assignment?.session.sessionScenarios?.[0] ??
    null
  );
}

function getAssignmentGameFlags(assignment: CharacterAssignmentWithSession | null): Record<string, unknown> {
  const activeScenario =
    getAssignmentActiveScenario(assignment);
  return parseJsonRecordOrFallback(activeScenario?.gameState?.flagsJson);
}

function buildCharacterLevelUpPreviewContext(
  character: CharacterWithAssignments,
  activeAssignment: CharacterAssignmentWithSession | null,
): CharacterLevelUpPreviewContextDto {
  const activeFlags = getAssignmentGameFlags(activeAssignment);
  const activeScenario = getAssignmentActiveScenario(activeAssignment);
  const archiveAssignment =
    character.sessionCharacters?.find((assignment) => {
      if (assignment.session.status !== PrismaSessionStatus.COMPLETED) {
        return false;
      }
      const flags = getAssignmentGameFlags(assignment);
      return Boolean(readRecordFlag(flags, LEVEL_UP_PREVIEW_FLAGS.campaignArchive));
    }) ?? null;
  const archiveFlags = getAssignmentGameFlags(archiveAssignment);
  const archive = readRecordFlag(archiveFlags, LEVEL_UP_PREVIEW_FLAGS.campaignArchive);
  const calendar = readRecordFlag(activeFlags, LEVEL_UP_PREVIEW_FLAGS.campaignCalendar);
  const downtimeTasks = decodeLevelUpPreviewDowntimeTasks(calendar?.downtimeTasks);
  const activeConditions = parseConditionSummary(activeAssignment?.conditionsJson);
  const inventory = parseInventoryItems(character.inventoryJson);
  const spellSummary = parseSpellSummary(character.spellsJson);
  const campaignArchiveAvailable = Boolean(archive);
  const campaignArchiveAllowsTransfer = archive?.allowCharacterTransfer !== false && campaignArchiveAvailable;

  return {
    activeSessionId: activeAssignment?.sessionId ?? null,
    activeSessionStatus: activeAssignment?.session.status ? sessionStatusMap[activeAssignment.session.status] : null,
    currentNodeId: activeScenario?.gameState?.currentNodeId ?? null,
    campaignArchiveAvailable,
    campaignArchiveAllowsTransfer,
    transferEligibility: campaignArchiveAvailable
      ? campaignArchiveAllowsTransfer
        ? "transfer_allowed"
        : "transfer_blocked"
      : "not_archived",
    activeDowntimeTaskCount: downtimeTasks.filter((task) => task.status === "active" || task.status === "paused").length,
    completedDowntimeTaskCount: downtimeTasks.filter((task) => task.status === "completed").length,
    hasEconomyState: Boolean(readRecordFlag(activeFlags, LEVEL_UP_PREVIEW_FLAGS.economy)),
    inventoryItemCount: inventory.reduce((sum, item) => sum + Math.max(0, item.quantity ?? 0), 0),
    equippedWeaponId: character.equippedWeaponId ?? null,
    offhandWeaponId: character.offhandWeaponId ?? null,
    knownSpellCount: spellSummary.knownSpellCount,
    preparedSpellCount: spellSummary.preparedSpellCount,
    activeConditionCount: activeConditions.length,
    hasActiveConcentration: activeConditions.some((condition) => condition.toLowerCase().includes("concentration")),
  };
}

function readRecordFlag(flags: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = flags[key];
  return isRecord(value) ? value : null;
}

function parseScenarioNodeConfig(value: string, nodeId: string): ScenarioNodeCheckOptionsConfigDto {
  return parseJsonOrFallback(value, { checks: [], vttMap: null }, (candidate) => decodeScenarioNodeConfig(candidate, nodeId));
}

function decodeScenarioNodeConfig(parsed: unknown, nodeId: string): ScenarioNodeCheckOptionsConfigDto {
  return decodeLenientScenarioNodeCheckOptionsConfig(parsed, nodeId);
}

function stripPrivateGameFlags(flags: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(flags).filter(([key]) => !PRIVATE_GAME_FLAG_KEYS.has(key)),
  );
}

function toIsoString(value: Date | string | undefined | null): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return new Date(0).toISOString();
}

function mapUserRole(user: User): UserRole {
  if (!("role" in user)) {
    return UserRole.USER;
  }
  const role = user.role;
  return role === "MODERATOR" || role === "ADMIN" || role === "USER"
    ? userRoleMap[role]
    : UserRole.USER;
}

function getActiveSessionScenario(session: SessionWithRelations): SessionScenarioWithScenario | null {
  return (
    session.sessionScenarios?.find((candidate) => candidate.status === "ACTIVE") ??
    session.sessionScenarios?.[0] ??
    null
  );
}

export function mapUser(user: User): UserResponseDto {
  const displayName = user.displayName || user.email || user.id;
  return {
    id: user.id,
    publicId: user.publicId ?? user.id,
    userId: user.id,
    email: user.email,
    name: displayName,
    nickname: displayName,
    authProvider: authProviderMap[user.authProvider],
    role: mapUserRole(user),
    displayName,
    createdAt: toIsoString(user.createdAt),
  };
}

export function mapSessionScenario(
  sessionScenario: SessionScenarioWithScenario,
): SessionScenarioResponseDto {
  return {
    id: sessionScenario.id,
    sessionId: sessionScenario.sessionId,
    scenarioId: sessionScenario.scenarioId,
    sequence: sessionScenario.sequence,
    status: sessionScenarioStatusMap[sessionScenario.status],
    startedAt: sessionScenario.startedAt ? toIsoString(sessionScenario.startedAt) : null,
    endedAt: sessionScenario.endedAt ? toIsoString(sessionScenario.endedAt) : null,
    createdAt: toIsoString(sessionScenario.createdAt),
    scenario: mapScenarioSummary(sessionScenario.scenario),
  };
}

export function mapSession(session: SessionWithRelations): SessionResponseDto {
  const activeScenario = getActiveSessionScenario(session);
  const activeGameState = activeScenario?.gameState ?? null;
  const visibility = sessionVisibilityMap[session.visibility];

  return {
    id: session.id,
    publicId: session.publicId ?? session.id,
    sessionId: session.id,
    title: session.title,
    description: session.description,
    hostUserId: session.hostUserId,
    ownerUserId: session.hostUserId,
    captainUserId: session.captainUserId,
    gmMode: gmModeMap[session.gmMode],
    gmUserId: session.gmMode === PrismaGmMode.HUMAN ? (session.gmUserId ?? session.hostUserId) : null,
    inviteCode: session.inviteCode,
    status: sessionStatusMap[session.status],
    visibility,
    maxParticipants: session.maxParticipants,
    maxPlayers: session.maxParticipants,
    isPublic: visibility === SessionVisibility.PUBLIC,
    isPrivate: visibility === SessionVisibility.PRIVATE,
    ruleSetId: session.ruleSetId,
    nextSessionAt: session.nextSessionAt ? toIsoString(session.nextSessionAt) : null,
    scenarioId: activeScenario?.scenarioId ?? null,
    currentNodeId: activeGameState?.currentNodeId ?? null,
    activeSessionScenarioId: activeScenario?.id ?? null,
    createdAt: toIsoString(session.createdAt),
    updatedAt: toIsoString(session.updatedAt),
  };
}

export function mapParticipant(
  participant: ParticipantWithUserAndCharacter,
): SessionParticipantResponseDto {
  return {
    id: participant.id,
    sessionId: participant.sessionId,
    userId: participant.userId,
    characterId: participant.sessionCharacter?.characterId ?? null,
    sessionCharacterId: participant.sessionCharacter?.id ?? null,
    role: participantRoleMap[participant.role],
    status: participantStatusMap[participant.status],
    connectionStatus: connectionStatusMap[participant.connectionStatus],
    isReady: participant.isReady,
    readyAt: participant.readyAt ? toIsoString(participant.readyAt) : null,
    joinedAt: toIsoString(participant.joinedAt),
    leftAt: participant.leftAt ? toIsoString(participant.leftAt) : null,
    user: mapUser(participant.user),
  };
}

export function mapCharacter(character: CharacterWithAssignments): CharacterResponseDto {
  const activeAssignment =
    character.sessionCharacters?.find(
      (assignment) =>
        assignment.session.status !== PrismaSessionStatus.COMPLETED &&
        assignment.session.status !== PrismaSessionStatus.DISBANDED,
    ) ?? null;

  return {
    id: character.id,
    ownerUserId: character.ownerUserId,
    scenarioId: character.scenarioId ?? null,
    name: character.name,
    ancestry: character.ancestry,
    className: character.className,
    subclassName: character.subclassName ?? null,
    level: character.level,
    bio: character.bio ?? null,
    abilities: parseAbilityScores(character.abilitiesJson),
    proficiencyBonus: character.proficiencyBonus,
    proficientSkills: parseJsonStringArrayOrFallback(character.proficientSkillsJson, []),
    features: parseJsonStringArrayOrFallback(character.featuresJson, []),
    maxHp: character.maxHp,
    armorClass: character.armorClass,
    speed: character.speed,
    inventory: normalizeInventoryItemsDisplay(parseInventoryItems(character.inventoryJson)),
    spells: character.spellsJson
      ? parseStartingSpells(character.spellsJson)
      : null,
    equippedWeaponId: character.equippedWeaponId ?? null,
    offhandWeaponId: character.offhandWeaponId ?? null,
    avatarType: characterAvatarTypeMap[character.avatarType],
    avatarPresetId: character.avatarPresetId ?? null,
    avatarUrl: character.avatarUrl ?? null,
    avatarUpdatedAt: character.avatarUpdatedAt ? toIsoString(character.avatarUpdatedAt) : null,
    activeSessionId: activeAssignment?.sessionId ?? null,
    activeSessionConditions: parseConditionSummary(activeAssignment?.conditionsJson),
    levelUpPreviewContext: buildCharacterLevelUpPreviewContext(character, activeAssignment),
    isSelectable: !activeAssignment,
    createdAt: toIsoString(character.createdAt),
    updatedAt: toIsoString(character.updatedAt),
  };
}

export function mapSessionCharacter(
  sessionCharacter: SessionCharacterWithBase,
): SessionCharacterResponseDto {
  const hitDiceTotal = Math.max(sessionCharacter.character.level, 0);
  const hitDiceSpent = Math.min(
    Math.max(sessionCharacter.resource?.hitDiceSpent ?? 0, 0),
    hitDiceTotal,
  );
  return {
    id: sessionCharacter.id,
    sessionId: sessionCharacter.sessionId,
    userId: sessionCharacter.userId,
    characterId: sessionCharacter.characterId,
    ownerUserId: sessionCharacter.character.ownerUserId,
    status: sessionCharacterStatusMap[sessionCharacter.status],
    name: sessionCharacter.character.name,
    ancestry: sessionCharacter.character.ancestry,
    className: sessionCharacter.character.className,
    subclassName: sessionCharacter.character.subclassName ?? null,
    level: sessionCharacter.character.level,
    hitDiceTotal,
    hitDiceSpent,
    hitDiceRemaining: Math.max(hitDiceTotal - hitDiceSpent, 0),
    bio: sessionCharacter.character.bio ?? null,
    abilities: parseAbilityScores(sessionCharacter.character.abilitiesJson),
    proficiencyBonus: sessionCharacter.character.proficiencyBonus,
    proficientSkills: parseJsonStringArrayOrFallback(sessionCharacter.character.proficientSkillsJson, []),
    features: parseJsonStringArrayOrFallback(sessionCharacter.character.featuresJson, []),
    maxHp: sessionCharacter.character.maxHp,
    currentHp: sessionCharacter.currentHp,
    tempHp: sessionCharacter.tempHp,
    armorClass: sessionCharacter.character.armorClass,
    speed: sessionCharacter.character.speed,
    inventory: mapSessionCharacterInventory(sessionCharacter),
    spells: parseStartingSpells(sessionCharacter.character.spellsJson),
    equippedWeaponId: sessionCharacter.character.equippedWeaponId ?? null,
    offhandWeaponId: sessionCharacter.character.offhandWeaponId ?? null,
    avatarType: characterAvatarTypeMap[sessionCharacter.character.avatarType],
    avatarPresetId: sessionCharacter.character.avatarPresetId ?? null,
    avatarUrl: sessionCharacter.character.avatarUrl ?? null,
    conditions: parseConditionSummary(sessionCharacter.conditionsJson),
    initiative: null,
    createdAt: toIsoString(sessionCharacter.createdAt),
    updatedAt: toIsoString(sessionCharacter.updatedAt),
  };
}

function mapSessionCharacterInventory(
  sessionCharacter: SessionCharacterWithBase,
): InventoryItemDto[] {
  if (sessionCharacter.inventoryEntries?.length) {
    return normalizeInventoryItemsDisplay(
      sessionCharacter.inventoryEntries.map((entry) => ({
        id: entry.id,
        name: entry.itemDefinition.name,
        quantity: entry.quantity,
        itemDefinitionId: entry.itemDefinitionId,
        itemType: entry.itemDefinition.itemType,
        description: entry.itemDefinition.description ?? undefined,
        weightLb: entry.itemDefinition.weightLb ?? undefined,
        volumeCuFt: entry.itemDefinition.volumeCuFt ?? undefined,
        damageDice: entry.itemDefinition.damageDice ?? undefined,
        damageType: entry.itemDefinition.damageType ?? undefined,
        armorClassBase: entry.itemDefinition.armorClassBase ?? undefined,
        armorClassBonus: entry.itemDefinition.armorClassBonus ?? undefined,
        armorStrengthRequirement: entry.itemDefinition.armorStrengthRequirement ?? undefined,
        armorStealthDisadvantage: entry.itemDefinition.armorStealthDisadvantage ?? undefined,
        useEffect: entry.itemDefinition.useEffect ?? undefined,
        packContents: parseJsonOrFallback(
          entry.itemDefinition.packContentsJson,
          undefined,
          decodeInventoryPackContents,
        ),
        properties: parseJsonStringArrayOrFallback(entry.itemDefinition.propertiesJson, undefined),
        containerId: entry.containerEntryId ?? undefined,
      })),
    );
  }

  return normalizeInventoryItemsDisplay(
    parseInventoryItems(
      sessionCharacter.inventorySnapshotJson ?? sessionCharacter.character.inventoryJson,
    ),
  );
}

export function mapGameState(
  state: GameState,
  sessionId: string | null = null,
): GameStateResponseDto {
  const flags = stripPrivateGameFlags(parseJsonRecordOrFallback(state.flagsJson));

  return {
    sessionScenarioId: state.sessionScenarioId,
    sessionId,
    version: state.version,
    currentNodeId: state.currentNodeId ?? null,
    phase: gamePhaseMap[state.phase],
    flags,
    state: {
      ...flags,
      flags,
    },
    updatedAt: toIsoString(state.updatedAt),
  };
}

type ScenarioUserDisplaySource = {
  displayName?: string | null;
  profile?: {
    nickname?: string | null;
  } | null;
};

type ScenarioSummarySource = Scenario & {
  creator?: ScenarioUserDisplaySource | null;
};

function mapUserDisplayName(user?: ScenarioUserDisplaySource | null): string | null {
  return user?.profile?.nickname?.trim() || user?.displayName?.trim() || null;
}

function parseScenarioValidationReportOrNull(value: unknown): ScenarioValidationReportDto | null {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    return decodeScenarioValidationReport(value);
  } catch {
    return null;
  }
}

export function mapScenarioSummary(scenario: ScenarioSummarySource): ScenarioSummaryResponseDto {
  const revision = parseScenarioRevisionMetadata(scenario.attribution);
  const creatorDisplayName = mapUserDisplayName(scenario.creator);
  const publishedByDisplayName =
    revision.publishedByUserId && revision.publishedByUserId === scenario.createdByUserId
      ? creatorDisplayName
      : null;
  return {
    id: scenario.id,
    title: scenario.title,
    createdByUserId: scenario.createdByUserId ?? null,
    createdByDisplayName: creatorDisplayName,
    description: scenario.description ?? null,
    thumbnailUrl: scenario.thumbnailUrl ?? null,
    ruleSetId: scenario.ruleSetId ?? null,
    difficulty: scenario.difficulty ?? null,
    startLevel: scenario.startLevel,
    recommendedEndLevel: scenario.recommendedEndLevel ?? null,
    license: scenarioLicenseMap[scenario.license],
    sourceType: scenarioSourceTypeMap[scenario.sourceType],
    attribution: revision.attribution,
    startNodeId: scenario.startNodeId ?? null,
    baseScenarioId: scenario.baseScenarioId ?? null,
    revisionNumber: revision.revisionNumber,
    changelog: revision.changelog,
    validationReport: revision.validationReport,
    publishedAt: revision.publishedAt,
    publishedByUserId: revision.publishedByUserId,
    publishedByDisplayName,
    publishStatus: revision.publishStatus,
    createdAt: toIsoString(scenario.createdAt),
    updatedAt: toIsoString(scenario.updatedAt),
  };
}

function parseScenarioRevisionMetadata(attribution: string | null | undefined): {
  attribution: string | null;
  revisionNumber: number | null;
  changelog: string | null;
  validationReport: ScenarioValidationReportDto | null;
  publishedAt: string | null;
  publishedByUserId: string | null;
  publishStatus: "draft" | "public" | "link" | "private" | "unpublished";
} {
  const raw = attribution ?? "";
  const marker = "P3_REVISION_META:";
  const markerIndex = raw.indexOf(marker);
  if (markerIndex < 0) {
    return {
      attribution: raw.trim() || null,
      revisionNumber: null,
      changelog: null,
      validationReport: null,
      publishedAt: null,
      publishedByUserId: null,
      publishStatus: "draft",
    };
  }
  const publicAttribution = raw.slice(0, markerIndex).trim() || null;
  const metadataText = raw.slice(markerIndex + marker.length).trim();
  try {
    const metadata = parseJsonOrFallback(metadataText, null, decodeDomainScenarioRevisionMetadata);
    if (!metadata) {
      throw new Error("scenario revision metadata is missing.");
    }
    return {
      attribution: publicAttribution,
      revisionNumber: metadata.revisionNumber,
      changelog: metadata.changelog,
      validationReport: parseScenarioValidationReportOrNull(metadata.validationReport),
      publishedAt: metadata.publishedAt,
      publishedByUserId: metadata.publishedByUserId,
      publishStatus: metadata.publishStatus,
    };
  } catch {
    return {
      attribution: publicAttribution,
      revisionNumber: null,
      changelog: null,
      validationReport: null,
      publishedAt: null,
      publishedByUserId: null,
      publishStatus: "draft",
    };
  }
}

function decodeDomainScenarioRevisionMetadata(value: unknown): {
  revisionNumber: number | null;
  changelog: string | null;
  validationReport: unknown;
  publishedAt: string | null;
  publishedByUserId: string | null;
  publishStatus: "draft" | "public" | "link" | "private" | "unpublished";
} {
  if (!isRecord(value)) {
    throw new Error("scenario revision metadata must be an object.");
  }
  const status = value.status;
  return {
    revisionNumber:
      typeof value.revisionNumber === "number" && Number.isInteger(value.revisionNumber)
        ? value.revisionNumber
        : null,
    changelog: typeof value.changelog === "string" ? value.changelog : null,
    validationReport: value.validationReport,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    publishedByUserId:
      typeof value.publishedByUserId === "string" ? value.publishedByUserId : null,
    publishStatus:
      status === "public" || status === "link" || status === "private" || status === "unpublished"
        ? status
        : "draft",
  };
}

export function mapScenarioNode(node: ScenarioNode): ScenarioNodeResponseDto {
  const nodeConfig = parseScenarioNodeConfig(node.checkOptionsJson, node.id);

  return {
    id: node.id,
    nodeType: toScenarioNodeType(node.nodeType),
    title: node.title,
    sceneText: node.sceneText,
    imageUrl: node.imageUrl ?? null,
    checkOptions: nodeConfig.checks,
    transitions: parseJsonOrFallback(node.transitionsJson, [], decodeLenientScenarioTransitionArray),
    clues: parseJsonOrFallback(node.cluesJson, [], decodeLenientScenarioClueArray),
    vttMap: nodeConfig.vttMap,
    nodeMeta: parseJsonOrFallback(node.nodeMetaJson, null, decodeScenarioNodeMeta),
    fallbackNodeId: node.fallbackNodeId,
  };
}

function toScenarioNodeType(value: string): ScenarioNodeType {
  switch (value) {
    case ScenarioNodeType.EXPLORATION:
      return ScenarioNodeType.EXPLORATION;
    case ScenarioNodeType.COMBAT:
      return ScenarioNodeType.COMBAT;
    case ScenarioNodeType.STORY:
    default:
      return ScenarioNodeType.STORY;
  }
}

export function mapScenario(
  scenario: Scenario & { nodes: ScenarioNode[] },
): ScenarioResponseDto {
  const startNodeId = resolveScenarioStartNodeId(scenario.nodes, scenario.startNodeId ?? null);
  return {
    ...mapScenarioSummary(scenario),
    startNodeId,
    npcs: parseJsonOrFallback(scenario.npcsJson, [], decodeLenientScenarioNpcArray),
    nodes: sortScenarioNodes(scenario.nodes, startNodeId).map(mapScenarioNode),
  };
}

function sortScenarioNodes(nodes: ScenarioNode[], startNodeId: string | null): ScenarioNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const ordered: ScenarioNode[] = [];
  const visited = new Set<string>();

  function visit(nodeId: string | null | undefined): void {
    if (!nodeId || visited.has(nodeId)) {
      return;
    }
    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }
    visited.add(nodeId);
    ordered.push(node);

    const transitions = parseJsonOrFallback(node.transitionsJson, [], decodeLenientScenarioTransitionArray);
    transitions.forEach((transition) => {
      const nextNodeId = transition.nextNodeId;
      if (typeof nextNodeId === "string") {
        visit(nextNodeId);
      }
    });
  }

  visit(startNodeId);
  nodes.forEach((node) => visit(node.id));
  return ordered;
}

function resolveScenarioStartNodeId(nodes: ScenarioNode[], requestedStartNodeId: string | null): string | null {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.size) {
    return null;
  }

  const incoming = new Map<string, number>();
  nodes.forEach((node) => {
    const transitions = parseJsonOrFallback(node.transitionsJson, [], decodeLenientScenarioTransitionArray);
    transitions.forEach((transition) => {
      const nextNodeId = transition.nextNodeId;
      if (typeof nextNodeId === "string" && nodeIds.has(nextNodeId)) {
        incoming.set(nextNodeId, (incoming.get(nextNodeId) ?? 0) + 1);
      }
    });
  });

  const rootNodes = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  if (
    requestedStartNodeId &&
    nodeIds.has(requestedStartNodeId) &&
    (rootNodes.length !== 1 || rootNodes[0].id === requestedStartNodeId)
  ) {
    return requestedStartNodeId;
  }

  return rootNodes.length === 1 ? rootNodes[0].id : requestedStartNodeId ?? nodes[0].id;
}
