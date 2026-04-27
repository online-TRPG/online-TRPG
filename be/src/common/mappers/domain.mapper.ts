import {
  Character,
  ConnectionStatus as PrismaConnectionStatus,
  GamePhase as PrismaGamePhase,
  GameState,
  SessionGmMode as PrismaSessionGmMode,
  ParticipantRole as PrismaParticipantRole,
  Scenario,
  ScenarioLicense as PrismaScenarioLicense,
  ScenarioNode,
  Session,
  SessionCharacter,
  SessionParticipant,
  SessionStatus as PrismaSessionStatus,
  User,
} from "@prisma/client";
import {
  AbilityScoresDto,
  CharacterResponseDto,
  ConnectionStatus,
  GamePhase,
  GameStateResponseDto,
  InventoryItemDto,
  ParticipantRole,
  ScenarioLicense,
  ScenarioNodeResponseDto,
  ScenarioResponseDto,
  ScenarioSummaryResponseDto,
  SessionCharacterResponseDto,
  SessionGmMode,
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionStatus,
  UserResponseDto,
} from "@trpg/shared-types";

type ParticipantWithUserAndCharacter = SessionParticipant & {
  user: User;
  sessionCharacter?: (SessionCharacter & { character: Character }) | null;
};

type CharacterWithAssignments = Character & {
  sessionCharacters?: Array<SessionCharacter & { session: Session }>;
};

type SessionCharacterWithBase = SessionCharacter & {
  character: Character;
};

const sessionStatusMap: Record<PrismaSessionStatus, SessionStatus> = {
  LOBBY: SessionStatus.LOBBY,
  PLAYING: SessionStatus.PLAYING,
  PAUSED: SessionStatus.PAUSED,
  COMPLETED: SessionStatus.COMPLETED,
};

const sessionGmModeMap: Record<PrismaSessionGmMode, SessionGmMode> = {
  AI: SessionGmMode.AI,
  HUMAN: SessionGmMode.HUMAN,
};

const participantRoleMap: Record<PrismaParticipantRole, ParticipantRole> = {
  HOST: ParticipantRole.HOST,
  PLAYER: ParticipantRole.PLAYER,
  SPECTATOR: ParticipantRole.SPECTATOR,
};

const connectionStatusMap: Record<PrismaConnectionStatus, ConnectionStatus> = {
  ONLINE: ConnectionStatus.ONLINE,
  OFFLINE: ConnectionStatus.OFFLINE,
};

const gamePhaseMap: Record<PrismaGamePhase, GamePhase> = {
  EXPLORATION: GamePhase.EXPLORATION,
  COMBAT: GamePhase.COMBAT,
  DIALOGUE: GamePhase.DIALOGUE,
  REST: GamePhase.REST,
};

const scenarioLicenseMap: Record<PrismaScenarioLicense, ScenarioLicense> = {
  ORIGINAL: ScenarioLicense.ORIGINAL,
  CC_BY_4_0: ScenarioLicense.CC_BY_4_0,
  OTHER_FREE: ScenarioLicense.OTHER_FREE,
};

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

export function mapUser(user: User): UserResponseDto {
  return {
    id: user.id,
    displayName: user.displayName,
    createdAt: toIsoString(user.createdAt),
  };
}

export function mapSession(session: Session): SessionResponseDto {
  return {
    id: session.id,
    title: session.title,
    description: session.description,
    ownerUserId: session.ownerUserId,
    captainUserId: session.captainUserId,
    inviteCode: session.inviteCode,
    gmMode: sessionGmModeMap[session.gmMode],
    status: sessionStatusMap[session.status],
    maxParticipants: session.maxParticipants,
    isPublic: session.isPublic,
    scenarioId: session.scenarioId,
    currentNodeId: session.currentNodeId,
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
    connectionStatus: connectionStatusMap[participant.connectionStatus],
    isReady: participant.isReady,
    readyAt: participant.readyAt ? toIsoString(participant.readyAt) : null,
    joinedAt: toIsoString(participant.joinedAt),
    user: mapUser(participant.user),
  };
}

export function mapCharacter(character: CharacterWithAssignments): CharacterResponseDto {
  const activeAssignment =
    character.sessionCharacters?.find(
      (assignment) => assignment.session.status !== PrismaSessionStatus.COMPLETED,
    ) ?? null;

  return {
    id: character.id,
    ownerUserId: character.ownerUserId,
    name: character.name,
    ancestry: character.ancestry,
    className: character.className,
    level: character.level,
    abilities: parseJson<AbilityScoresDto>(character.abilitiesJson),
    proficiencyBonus: character.proficiencyBonus,
    proficientSkills: parseJson<string[]>(character.proficientSkillsJson),
    maxHp: character.maxHp,
    armorClass: character.armorClass,
    speed: character.speed,
    inventory: parseJson<InventoryItemDto[]>(character.inventoryJson),
    equippedWeaponId: character.equippedWeaponId ?? null,
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
    participantId: sessionCharacter.participantId,
    characterId: sessionCharacter.characterId,
    ownerUserId: sessionCharacter.character.ownerUserId,
    name: sessionCharacter.name,
    ancestry: sessionCharacter.ancestry,
    className: sessionCharacter.className,
    level: sessionCharacter.level,
    abilities: parseJson<AbilityScoresDto>(sessionCharacter.abilitiesJson),
    proficiencyBonus: sessionCharacter.proficiencyBonus,
    proficientSkills: parseJson<string[]>(sessionCharacter.proficientSkillsJson),
    maxHp: sessionCharacter.maxHp,
    currentHp: sessionCharacter.currentHp,
    tempHp: sessionCharacter.tempHp,
    armorClass: sessionCharacter.armorClass,
    speed: sessionCharacter.speed,
    inventory: parseJson<InventoryItemDto[]>(sessionCharacter.inventoryJson),
    equippedWeaponId: sessionCharacter.equippedWeaponId ?? null,
    conditions: parseJson<string[]>(sessionCharacter.conditionsJson),
    initiative: sessionCharacter.initiative ?? null,
    createdAt: toIsoString(sessionCharacter.createdAt),
    updatedAt: toIsoString(sessionCharacter.updatedAt),
  };
}

export function mapGameState(state: GameState): GameStateResponseDto {
  return {
    sessionId: state.sessionId,
    version: state.version,
    currentNodeId: state.currentNodeId,
    phase: gamePhaseMap[state.phase],
    state: parseJson<Record<string, unknown>>(state.stateJson),
    updatedAt: toIsoString(state.updatedAt),
  };
}

export function mapScenarioSummary(scenario: Scenario): ScenarioSummaryResponseDto {
  return {
    id: scenario.id,
    title: scenario.title,
    license: scenarioLicenseMap[scenario.license],
    attribution: scenario.attribution,
    startNodeId: scenario.startNodeId,
  };
}

export function mapScenarioNode(node: ScenarioNode): ScenarioNodeResponseDto {
  return {
    id: node.id,
    title: node.title,
    sceneText: node.sceneText,
    visibleToPlayers: node.visibleToPlayers,
    checkOptions: parseJson<Record<string, unknown>[]>(node.checkOptionsJson),
    transitions: parseJson<Record<string, unknown>[]>(node.transitionsJson),
    clues: parseJson<Record<string, unknown>[]>(node.cluesJson),
    fallbackNodeId: node.fallbackNodeId,
  };
}

export function mapScenario(
  scenario: Scenario & { nodes: ScenarioNode[] },
): ScenarioResponseDto {
  return {
    ...mapScenarioSummary(scenario),
    nodes: scenario.nodes.map(mapScenarioNode),
  };
}
