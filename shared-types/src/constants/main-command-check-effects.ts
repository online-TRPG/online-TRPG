export const MAIN_COMMAND_CHECK_EFFECT_TYPES = {
  MAIN_COMMAND_CHECK: "mainCommandCheck",
  VTT_DOOR: "vttDoor",
  VTT_HAZARD: "vttHazard",
  VTT_OBJECT: "vttObject",
} as const;

export type MainCommandCheckEffectType =
  (typeof MAIN_COMMAND_CHECK_EFFECT_TYPES)[keyof typeof MAIN_COMMAND_CHECK_EFFECT_TYPES];

export const VTT_CHECK_EFFECT_ACTIONS = {
  OPEN: "open",
  BROKEN: "broken",
  DISARM: "disarm",
} as const;

export type VttCheckEffectAction =
  (typeof VTT_CHECK_EFFECT_ACTIONS)[keyof typeof VTT_CHECK_EFFECT_ACTIONS];
