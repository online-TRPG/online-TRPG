export const VTT_DOOR_STATES = {
  OPEN: "open",
  CLOSED: "closed",
  LOCKED: "locked",
  BROKEN: "broken",
} as const;

export type VttDoorState = (typeof VTT_DOOR_STATES)[keyof typeof VTT_DOOR_STATES];

export const VTT_DOOR_STATE_VALUES = Object.values(VTT_DOOR_STATES);

export const VTT_MAP_INTERACTION_KINDS = {
  OPEN_DOOR: "open_door",
  CLOSE_DOOR: "close_door",
  BREAK_DOOR: "break_door",
  BREAK_OBJECT: "break_object",
  INVESTIGATE_OBJECT: "investigate_object",
  DISARM_HAZARD: "disarm_hazard",
  DETECT_HAZARD: "detect_hazard",
  TRIGGER_OBJECT: "trigger_object",
} as const;

export type VttMapInteractionKind = (typeof VTT_MAP_INTERACTION_KINDS)[keyof typeof VTT_MAP_INTERACTION_KINDS];

export const VTT_MAP_INTERACTION_KIND_VALUES = Object.values(VTT_MAP_INTERACTION_KINDS);
