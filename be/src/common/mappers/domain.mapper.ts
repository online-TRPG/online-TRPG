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
  CharacterResponseDto,
  ConnectionStatus,
  GamePhase,
  GameStateResponseDto,
  GmMode,
  InventoryItemDto,
  ParticipantRole,
  ScenarioLicense,
  ScenarioNodeResponseDto,
  ScenarioNodeType,
  ScenarioResponseDto,
  ScenarioSourceType,
  ScenarioSummaryResponseDto,
  SessionCharacterResponseDto,
  SessionCharacterStatus,
  SessionParticipantResponseDto,
  SessionParticipantStatus,
  SessionResponseDto,
  SessionScenarioResponseDto,
  SessionScenarioStatus,
  SessionStatus,
  SessionVisibility,
  UserResponseDto,
} from "@trpg/shared-types";

type SessionScenarioWithScenario = SessionScenario & {
  scenario: Scenario;
  gameState?: GameState | null;
};

type ParticipantWithUserAndCharacter = SessionParticipant & {
  user: User;
  sessionCharacter?: (SessionCharacter & { character: Character }) | null;
};

type CharacterWithAssignments = Character & {
  sessionCharacters?: Array<SessionCharacter & { session: Session }>;
};

type SessionCharacterWithBase = SessionCharacter & {
  character: Character;
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

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }
  return JSON.parse(value) as T;
}

function parseScenarioNodeConfig(value: string): {
  checks: Record<string, unknown>[];
  vttMap: Record<string, unknown> | null;
} {
  const parsed = parseJson<unknown>(value, []);
  if (Array.isArray(parsed)) {
    return { checks: parsed as Record<string, unknown>[], vttMap: null };
  }
  if (parsed && typeof parsed === "object") {
    const candidate = parsed as Record<string, unknown>;
    return {
      checks: Array.isArray(candidate.checks)
        ? (candidate.checks as Record<string, unknown>[])
        : [],
      vttMap:
        candidate.vttMap && typeof candidate.vttMap === "object"
          ? (candidate.vttMap as Record<string, unknown>)
          : null,
    };
  }
  return { checks: [], vttMap: null };
}

function stripPrivateGameFlags(flags: Record<string, unknown>): Record<string, unknown> {
  const { vttMap: _vttMap, ...publicFlags } = flags;
  return publicFlags;
}

function toIsoString(value: Date): string {
  return value.toISOString();
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
    gmUserId: session.gmMode === "HUMAN" ? session.hostUserId : null,
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
    abilities: parseJson<AbilityScoresDto>(character.abilitiesJson, {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    }),
    proficiencyBonus: character.proficiencyBonus,
    proficientSkills: parseJson<string[]>(character.proficientSkillsJson, []),
    features: parseJson<string[]>(character.featuresJson, []),
    maxHp: character.maxHp,
    armorClass: character.armorClass,
    speed: character.speed,
    inventory: parseJson<InventoryItemDto[]>(character.inventoryJson, []),
    spells: character.spellsJson
      ? parseJson<{ cantrips: string[]; spells: string[] } | null>(character.spellsJson, null)
      : null,
    equippedWeaponId: character.equippedWeaponId ?? null,
    offhandWeaponId: character.offhandWeaponId ?? null,
    avatarType: characterAvatarTypeMap[character.avatarType],
    avatarPresetId: character.avatarPresetId ?? null,
    avatarUrl: character.avatarUrl ?? null,
    avatarUpdatedAt: character.avatarUpdatedAt ? toIsoString(character.avatarUpdatedAt) : null,
    activeSessionId: activeAssignment?.sessionId ?? null,
    isSelectable: !activeAssignment,
    createdAt: toIsoString(character.createdAt),
    updatedAt: toIsoString(character.updatedAt),
  };
}

export function mapSessionCharacter(
  sessionCharacter: SessionCharacterWithBase,
): SessionCharacterResponseDto {
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
    bio: sessionCharacter.character.bio ?? null,
    abilities: parseJson<AbilityScoresDto>(sessionCharacter.character.abilitiesJson, {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    }),
    proficiencyBonus: sessionCharacter.character.proficiencyBonus,
    proficientSkills: parseJson<string[]>(sessionCharacter.character.proficientSkillsJson, []),
    features: parseJson<string[]>(sessionCharacter.character.featuresJson, []),
    maxHp: sessionCharacter.character.maxHp,
    currentHp: sessionCharacter.currentHp,
    tempHp: sessionCharacter.tempHp,
    armorClass: sessionCharacter.character.armorClass,
    speed: sessionCharacter.character.speed,
    inventory: mapSessionCharacterInventory(sessionCharacter),
    equippedWeaponId: sessionCharacter.character.equippedWeaponId ?? null,
    offhandWeaponId: sessionCharacter.character.offhandWeaponId ?? null,
    avatarType: characterAvatarTypeMap[sessionCharacter.character.avatarType],
    avatarPresetId: sessionCharacter.character.avatarPresetId ?? null,
    avatarUrl: sessionCharacter.character.avatarUrl ?? null,
    conditions: parseJson<string[]>(sessionCharacter.conditionsJson, []),
    initiative: null,
    createdAt: toIsoString(sessionCharacter.createdAt),
    updatedAt: toIsoString(sessionCharacter.updatedAt),
  };
}

function mapSessionCharacterInventory(
  sessionCharacter: SessionCharacterWithBase,
): InventoryItemDto[] {
  if (sessionCharacter.inventoryEntries?.length) {
    return sessionCharacter.inventoryEntries.map((entry) => ({
      id: entry.id,
      name: entry.itemDefinition.name,
      quantity: entry.quantity,
      itemDefinitionId: entry.itemDefinitionId,
      itemType: entry.itemDefinition.itemType,
      weightLb: entry.itemDefinition.weightLb ?? undefined,
      volumeCuFt: entry.itemDefinition.volumeCuFt ?? undefined,
      damageDice: entry.itemDefinition.damageDice ?? undefined,
      damageType: entry.itemDefinition.damageType ?? undefined,
      properties: parseJson<string[] | undefined>(entry.itemDefinition.propertiesJson, undefined),
      containerId: entry.containerEntryId ?? undefined,
    }));
  }

  return parseJson<InventoryItemDto[]>(
    sessionCharacter.inventorySnapshotJson ?? sessionCharacter.character.inventoryJson,
    [],
  );
}

export function mapGameState(
  state: GameState,
  sessionId: string | null = null,
): GameStateResponseDto {
  const flags = stripPrivateGameFlags(parseJson<Record<string, unknown>>(state.flagsJson, {}));

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

export function mapScenarioSummary(scenario: Scenario): ScenarioSummaryResponseDto {
  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description ?? null,
    thumbnailUrl: scenario.thumbnailUrl ?? null,
    ruleSetId: scenario.ruleSetId ?? null,
    difficulty: scenario.difficulty ?? null,
    startLevel: scenario.startLevel,
    recommendedEndLevel: scenario.recommendedEndLevel ?? null,
    license: scenarioLicenseMap[scenario.license],
    sourceType: scenarioSourceTypeMap[scenario.sourceType],
    attribution: scenario.attribution ?? null,
    startNodeId: scenario.startNodeId ?? null,
    createdAt: toIsoString(scenario.createdAt),
    updatedAt: toIsoString(scenario.updatedAt),
  };
}

export function mapScenarioNode(node: ScenarioNode): ScenarioNodeResponseDto {
  const nodeConfig = parseScenarioNodeConfig(node.checkOptionsJson);

  return {
    id: node.id,
    nodeType: toScenarioNodeType(node.nodeType),
    title: node.title,
    sceneText: node.sceneText,
    imageUrl: node.imageUrl ?? null,
    checkOptions: nodeConfig.checks,
    transitions: parseJson<Record<string, unknown>[]>(node.transitionsJson, []),
    clues: parseJson<Record<string, unknown>[]>(node.cluesJson, []),
    vttMap: nodeConfig.vttMap,
    nodeMeta: parseJson<Record<string, unknown> | null>(node.nodeMetaJson, null),
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
    npcs: parseJson<Record<string, unknown>[]>(scenario.npcsJson, []),
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

    const transitions = parseJson<Record<string, unknown>[]>(node.transitionsJson, []);
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
    const transitions = parseJson<Record<string, unknown>[]>(node.transitionsJson, []);
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
