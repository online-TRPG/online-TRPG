import type {
  ConnectionStatus,
  GamePhase,
  ParticipantRole,
  ScenarioLicense,
  SessionStatus,
} from "../../constants/enums";
import type { AbilityScores, InventoryItem } from "../common/ability-scores";

export type UserModel = {
  id: string;
  displayName: string;
  createdAt: string;
};

export type SessionModel = {
  id: string;
  title: string;
  ownerUserId: string;
  inviteCode: string;
  status: SessionStatus;
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
  role: ParticipantRole;
  connectionStatus: ConnectionStatus;
  joinedAt: string;
};

export type CharacterModel = {
  id: string;
  sessionId: string;
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
