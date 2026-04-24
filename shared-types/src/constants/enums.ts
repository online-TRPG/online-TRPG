export enum SessionStatus {
  LOBBY = "lobby",
  PLAYING = "playing",
  PAUSED = "paused",
  COMPLETED = "completed",
}

export enum ParticipantRole {
  HOST = "host",
  PLAYER = "player",
  SPECTATOR = "spectator",
}

export enum ConnectionStatus {
  ONLINE = "online",
  OFFLINE = "offline",
}

export enum ScenarioLicense {
  ORIGINAL = "original",
  CC_BY_4_0 = "cc-by-4.0",
  OTHER_FREE = "other-free",
}

export enum GamePhase {
  EXPLORATION = "exploration",
  COMBAT = "combat",
  DIALOGUE = "dialogue",
  REST = "rest",
}
