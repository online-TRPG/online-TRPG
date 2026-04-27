export enum SessionStatus {
  LOBBY = "lobby",
  PLAYING = "playing",
  PAUSED = "paused",
  COMPLETED = "completed",
}

export enum SessionGmMode {
  AI = "ai",
  HUMAN = "human",
}

export enum ParticipantRole {
  HOST = "HOST",
  PLAYER = "PLAYER",
  SPECTATOR = "SPECTATOR",
}

export enum ConnectionStatus {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
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
