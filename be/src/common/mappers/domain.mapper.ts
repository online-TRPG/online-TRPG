import {
  ConnectionStatus as PrismaConnectionStatus,
  GamePhase as PrismaGamePhase,
  ScenarioLicense as PrismaScenarioLicense,
  ParticipantRole as PrismaParticipantRole,
  SessionStatus as PrismaSessionStatus,
  Character,
  GameState,
  Scenario,
  ScenarioNode,
  Session,
  SessionParticipant,
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
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionStatus,
  UserResponseDto,
} from "@trpg/shared-types";

type ParticipantWithUser = SessionParticipant & { user: User };

const sessionStatusMap: Record<PrismaSessionStatus, SessionStatus> = {
  LOBBY: SessionStatus.LOBBY,
  PLAYING: SessionStatus.PLAYING,
  PAUSED: SessionStatus.PAUSED,
  COMPLETED: SessionStatus.COMPLETED,
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
    ownerUserId: session.ownerUserId,
    inviteCode: session.inviteCode,
    status: sessionStatusMap[session.status],
    scenarioId: session.scenarioId,
    currentNodeId: session.currentNodeId,
    createdAt: toIsoString(session.createdAt),
    updatedAt: toIsoString(session.updatedAt),
  };
}

export function mapParticipant(participant: ParticipantWithUser): SessionParticipantResponseDto {
  return {
    id: participant.id,
    sessionId: participant.sessionId,
    userId: participant.userId,
    characterId: participant.characterId,
    role: participantRoleMap[participant.role],
    connectionStatus: connectionStatusMap[participant.connectionStatus],
    joinedAt: toIsoString(participant.joinedAt),
    user: mapUser(participant.user),
  };
}

export function mapCharacter(character: Character): CharacterResponseDto {
  return {
    id: character.id,
    sessionId: character.sessionId,
    ownerUserId: character.ownerUserId,
    name: character.name,
    ancestry: character.ancestry,
    className: character.className,
    level: character.level,
    abilities: parseJson<AbilityScoresDto>(character.abilitiesJson),
    proficiencyBonus: character.proficiencyBonus,
    proficientSkills: parseJson<string[]>(character.proficientSkillsJson),
    maxHp: character.maxHp,
    currentHp: character.currentHp,
    tempHp: character.tempHp,
    armorClass: character.armorClass,
    speed: character.speed,
    inventory: parseJson<InventoryItemDto[]>(character.inventoryJson),
    equippedWeaponId: character.equippedWeaponId,
    conditions: parseJson<string[]>(character.conditionsJson),
    createdAt: toIsoString(character.createdAt),
    updatedAt: toIsoString(character.updatedAt),
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
