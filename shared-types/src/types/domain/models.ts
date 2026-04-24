import type {
  ConnectionStatus,
  GamePhase,
  GmMode,
  ParticipantRole,
  ScenarioLicense,
  SessionStatus,
} from "../../constants/enums";
import type { AbilityScores, InventoryItem } from "../common/ability-scores";

export type UserModel = {
  id: string;
  userId: string;
  email?: string | null;
  name: string;
  nickname: string;
  authProvider: string;
  displayName: string;
  createdAt: string;
};

export type SessionModel = {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  ownerUserId: string;
  hostUserId: string;
  captainUserId?: string | null;
  gmMode: GmMode;
  gmUserId?: string | null;
  inviteCode: string;
  status: SessionStatus;
  maxParticipants: number;
  maxPlayers: number;
  isPublic: boolean;
  isPrivate: boolean;
  ruleSetId?: string | null;
  scenarioId: string;
  currentNodeId: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionParticipantModel = {
  id: string;
  sessionId: string;
  userId: string;
  characterId?: string | null;
  sessionCharacterId?: string | null;
  role: ParticipantRole;
  connectionStatus: ConnectionStatus;
  isReady: boolean;
  readyAt?: string | null;
  joinedAt: string;
};

export type CharacterModel = {
  id: string;
  ownerUserId: string;
  name: string;
  ancestry: string;
  className: string;
  level: number;
  abilities: AbilityScores;
  proficiencyBonus: number;
  proficientSkills: string[];
  maxHp: number;
  armorClass: number;
  speed: number;
  inventory: InventoryItem[];
  equippedWeaponId?: string | null;
  activeSessionId?: string | null;
  isSelectable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SessionCharacterModel = {
  id: string;
  sessionId: string;
  participantId: string;
  characterId: string;
  ownerUserId: string;
  name: string;
  ancestry: string;
  className: string;
  level: number;
  abilities: AbilityScores;
  proficiencyBonus: number;
  proficientSkills: string[];
  maxHp: number;
  currentHp: number;
  tempHp: number;
  armorClass: number;
  speed: number;
  inventory: InventoryItem[];
  equippedWeaponId?: string | null;
  conditions: string[];
  initiative?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ScenarioNodeModel = {
  id: string;
  title: string;
  sceneText: string;
  visibleToPlayers: boolean;
  checkOptions: Record<string, unknown>[];
  transitions: Record<string, unknown>[];
  clues: Record<string, unknown>[];
  fallbackNodeId?: string | null;
};

export type ScenarioModel = {
  id: string;
  title: string;
  license: ScenarioLicense;
  attribution: string;
  startNodeId: string;
  nodes?: ScenarioNodeModel[];
};

export type GameStateModel = {
  sessionId: string;
  version: number;
  currentNodeId: string;
  phase: GamePhase;
  state: Record<string, unknown>;
  updatedAt: string;
};
