import type {
  CharacterAvatarType,
  ConnectionStatus,
  GamePhase,
  GmMode,
  ParticipantRole,
  ScenarioLicense,
  ScenarioNodeType,
  SessionCharacterStatus,
  SessionParticipantStatus,
  SessionScenarioStatus,
  SessionStatus,
  SessionVisibility,
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
  hostUserId: string;
  ownerUserId: string;
  captainUserId?: string | null;
  gmMode: GmMode;
  gmUserId?: string | null;
  inviteCode: string;
  status: SessionStatus;
  visibility: SessionVisibility;
  maxParticipants: number;
  maxPlayers: number;
  isPublic: boolean;
  isPrivate: boolean;
  ruleSetId?: string | null;
  nextSessionAt?: string | null;
  scenarioId?: string | null;
  currentNodeId?: string | null;
  activeSessionScenarioId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionScenarioModel = {
  id: string;
  sessionId: string;
  scenarioId: string;
  sequence: number;
  status: SessionScenarioStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
};

export type SessionParticipantModel = {
  id: string;
  sessionId: string;
  userId: string;
  characterId?: string | null;
  sessionCharacterId?: string | null;
  role: ParticipantRole;
  status: SessionParticipantStatus;
  connectionStatus: ConnectionStatus;
  isReady: boolean;
  readyAt?: string | null;
  joinedAt: string;
  leftAt?: string | null;
};

export type CharacterModel = {
  id: string;
  ownerUserId: string;
  name: string;
  ancestry: string;
  className: string;
  subclassName?: string | null;
  level: number;
  bio?: string | null;
  abilities: AbilityScores;
  proficiencyBonus: number;
  proficientSkills: string[];
  features: string[];
  maxHp: number;
  armorClass: number;
  speed: number;
  inventory: InventoryItem[];
  equippedWeaponId?: string | null;
  avatarType: CharacterAvatarType;
  avatarPresetId?: string | null;
  avatarUrl?: string | null;
  avatarUpdatedAt?: string | null;
  activeSessionId?: string | null;
  isSelectable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SessionCharacterModel = {
  id: string;
  sessionId: string;
  userId: string;
  characterId: string;
  ownerUserId: string;
  status: SessionCharacterStatus;
  name: string;
  ancestry: string;
  className: string;
  subclassName?: string | null;
  level: number;
  bio?: string | null;
  abilities: AbilityScores;
  proficiencyBonus: number;
  proficientSkills: string[];
  features: string[];
  maxHp: number;
  currentHp: number;
  tempHp: number;
  armorClass: number;
  speed: number;
  inventory: InventoryItem[];
  equippedWeaponId?: string | null;
  avatarType: CharacterAvatarType;
  avatarPresetId?: string | null;
  avatarUrl?: string | null;
  conditions: string[];
  createdAt: string;
  updatedAt: string;
};

export type ScenarioNodeModel = {
  id: string;
  nodeType: ScenarioNodeType;
  title: string;
  sceneText: string;
  imageUrl?: string | null;
  checkOptions: Record<string, unknown>[];
  transitions: Record<string, unknown>[];
  clues: Record<string, unknown>[];
  fallbackNodeId?: string | null;
};

export type ScenarioModel = {
  id: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  ruleSetId?: string | null;
  difficulty?: string | null;
  license: ScenarioLicense;
  attribution?: string | null;
  startNodeId?: string | null;
  createdAt: string;
  updatedAt: string;
  nodes?: ScenarioNodeModel[];
};

export type GameStateModel = {
  sessionScenarioId: string;
  sessionId?: string | null;
  version: number;
  currentNodeId?: string | null;
  phase: GamePhase;
  flags: Record<string, unknown>;
  state: Record<string, unknown>;
  updatedAt: string;
};
