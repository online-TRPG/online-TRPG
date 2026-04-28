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

export enum CharacterAvatarType {
  DEFAULT = "DEFAULT",
  PRESET = "PRESET",
  UPLOAD = "UPLOAD",
}
