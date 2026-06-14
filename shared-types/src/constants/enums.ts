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
  GM = "GM",
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

export enum ScenarioSourceType {
  SYSTEM = "SYSTEM",
  USER = "USER",
  CLONED = "CLONED",
}

export enum ScenarioNodeType {
  STORY = "story",
  EXPLORATION = "exploration",
  COMBAT = "combat",
}

export enum ScenarioAssetKind {
  MAP = "MAP",
  SCENE = "SCENE",
  TOKEN = "TOKEN",
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
  ACTOR = "ACTOR",
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

export enum MainCommandScreenType {
  STORY = "STORY",
  EXPLORATION = "EXPLORATION",
  COMBAT = "COMBAT",
}

export enum MainCommandCategory {
  TALK = "TALK",
  SOCIAL = "SOCIAL",
  QUESTION = "QUESTION",
  INSPECTION = "INSPECTION",
  RP_ACTION = "RP_ACTION",
  SUPPORT = "SUPPORT",
  OBSERVATION = "OBSERVATION",
  SENSE = "SENSE",
  MOVEMENT = "MOVEMENT",
  INTERACTION = "INTERACTION",
  TOOL_ITEM = "TOOL_ITEM",
  CREATIVE_ACTION = "CREATIVE_ACTION",
  ENVIRONMENT = "ENVIRONMENT",
  SPECIAL_ATTACK = "SPECIAL_ATTACK",
  TACTIC = "TACTIC",
  REACTION_READY = "REACTION_READY",
  ITEM_SPELL = "ITEM_SPELL",
}

export enum MainCommandIntent {
  GENERAL_GM_REQUEST = "GENERAL_GM_REQUEST",
  TALK_TO_NPC = "TALK_TO_NPC",
  SOCIAL_PERSUADE = "SOCIAL_PERSUADE",
  SOCIAL_INTIMIDATE = "SOCIAL_INTIMIDATE",
  SOCIAL_DECEIVE = "SOCIAL_DECEIVE",
  READ_EMOTION = "READ_EMOTION",
  ASK_SCENE_INFO = "ASK_SCENE_INFO",
  INSPECT_STORY_OBJECT = "INSPECT_STORY_OBJECT",
  DECLARE_RP_ACTION = "DECLARE_RP_ACTION",
  ASK_HINT = "ASK_HINT",
  ASK_SUMMARY = "ASK_SUMMARY",
  REQUEST_SCENE_TRANSITION = "REQUEST_SCENE_TRANSITION",
  OBSERVE_AREA = "OBSERVE_AREA",
  INVESTIGATE_OBJECT = "INVESTIGATE_OBJECT",
  LISTEN = "LISTEN",
  DETECT_DANGER = "DETECT_DANGER",
  SPECIAL_MOVE = "SPECIAL_MOVE",
  INTERACT_OBJECT = "INTERACT_OBJECT",
  USE_TOOL = "USE_TOOL",
  USE_ITEM_EXPLORE = "USE_ITEM_EXPLORE",
  SPLIT_PARTY_TASK = "SPLIT_PARTY_TASK",
  COMBAT_MANEUVER = "COMBAT_MANEUVER",
  ENVIRONMENT_USE = "ENVIRONMENT_USE",
  IMPROVISED_ATTACK = "IMPROVISED_ATTACK",
  CALLED_SHOT = "CALLED_SHOT",
  READY_ACTION = "READY_ACTION",
  REACTION_REQUEST = "REACTION_REQUEST",
  COMBAT_TALK = "COMBAT_TALK",
  USE_ITEM_COMBAT = "USE_ITEM_COMBAT",
  USE_SPELL_CREATIVELY = "USE_SPELL_CREATIVELY",
  TACTIC_QUERY = "TACTIC_QUERY",
  ASK_RULE = "ASK_RULE",
}

export enum MainCommandTargetType {
  NPC = "NPC",
  OBJECT = "OBJECT",
  ACTOR = "ACTOR",
  AREA = "AREA",
  POINT = "POINT",
  SELF = "SELF",
}

export enum MainCommandStatus {
  MESSAGE = "MESSAGE",
  CHECK_REQUIRED = "CHECK_REQUIRED",
  GM_APPROVAL_REQUIRED = "GM_APPROVAL_REQUIRED",
  ACTION_READY = "ACTION_READY",
  IMPOSSIBLE = "IMPOSSIBLE",
  RESOLVED = "RESOLVED",
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
