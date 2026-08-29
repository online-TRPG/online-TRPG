export const COMBAT_TARGET_SHAPES = ['single', 'circle', 'cone', 'line'] as const;

export type CombatTargetShape = (typeof COMBAT_TARGET_SHAPES)[number];
