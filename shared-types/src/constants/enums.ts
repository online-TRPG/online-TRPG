export enum SessionStatus {
  RECRUITING = "recruiting",
  PLAYING = "playing",
  PAUSED = "paused",
  COMPLETED = "completed",
  DISBANDED = "disbanded",
}

export enum SessionGmMode {
  AI = "ai",
  HUMAN = "human",
}

export enum SessionVisibility {
  PUBLIC = "PUBLIC",
  PRIVATE = "PRIVATE",
}

export enum SessionScenarioStatus {
  PLANNED = "PLANNED",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  ABANDONED = "ABANDONED",
}

export enum ParticipantRole {
  HOST = "HOST",
  PLAYER = "PLAYER",
  SPECTATOR = "SPECTATOR",
}

export enum SessionParticipantStatus {
  JOINED = "JOINED",
  LEFT = "LEFT",
  KICKED = "KICKED",
}

export enum ConnectionStatus {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
}

export enum SessionCharacterStatus {
  ACTIVE = "ACTIVE",
  RETIRED = "RETIRED",
  DEAD = "DEAD",
  LEFT = "LEFT",
}

export enum ScenarioLicense {
  ORIGINAL = "original",
  CC_BY_4_0 = "cc-by-4.0",
  OTHER_FREE = "other-free",
}

export enum ScenarioNodeType {
  STORY = "story",
  EXPLORATION = "exploration",
  COMBAT = "combat",
}

export enum GamePhase {
  LOBBY = "lobby",
  EXPLORATION = "exploration",
  COMBAT = "combat",
  DIALOGUE = "dialogue",
  REST = "rest",
}

export enum AuthProvider {
  LOCAL = "LOCAL",
  KAKAO = "KAKAO",
  DISCORD = "DISCORD",
  GUEST = "GUEST",
}

export enum GmMode {
  AI = "AI",
  HUMAN = "HUMAN",
}

export enum AiTraceKind {
  NARRATION = "NARRATION",
  HINT = "HINT",
  SUMMARY = "SUMMARY",
  NPC_DIALOGUE = "NPC_DIALOGUE",
  INTERPRETER = "INTERPRETER",
}

export enum AiTraceStatus {
  SUCCESS = "SUCCESS",
  TIMEOUT = "TIMEOUT",
  ERROR = "ERROR",
}

export enum CharacterAvatarType {
  DEFAULT = "DEFAULT",
  PRESET = "PRESET",
  UPLOAD = "UPLOAD",
}

export enum ActionQueueStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REJECTED = "REJECTED",
}

export enum ActionInputType {
  TEXT = "TEXT",
  SELECT = "SELECT",
  COMMAND = "COMMAND",
}

export enum ActionScope {
  PARTY_SHARED = "PARTY_SHARED",
  INDIVIDUAL_TURN = "INDIVIDUAL_TURN",
}

export enum ActionOutcome {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
  IMPOSSIBLE = "IMPOSSIBLE",
  NO_ROLL = "NO_ROLL",
}

export enum DiceAdvantageState {
  NORMAL = "NORMAL",
  ADVANTAGE = "ADVANTAGE",
  DISADVANTAGE = "DISADVANTAGE",
}

export enum CombatStatus {
  ACTIVE = "ACTIVE",
  ENDED = "ENDED",
}

export enum CombatEntityType {
  PLAYER_CHARACTER = "PLAYER_CHARACTER",
  NPC = "NPC",
  MONSTER = "MONSTER",
}
