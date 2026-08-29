import type {
  CombatConditionViewDto,
  CombatPresentationV1,
  CombatTargetShape,
} from '@trpg/shared-types';

export type CombatMotionPreference = 'full' | 'reduced' | 'off';

export type CombatPresentationEnvelope = {
  turnLogId: string;
  createdAt: string;
  narration: string;
  presentation: CombatPresentationV1;
};

export type CombatEffectPlayback = {
  id: string;
  envelope: CombatPresentationEnvelope | null;
  startedAt: number;
  durationMs: number;
  collapsedCount: number;
};

export type CombatTokenConditionState = CombatConditionViewDto & {
  participantId: string;
  tokenId: string;
};

export type CombatTokenVisualResponse =
  | 'source'
  | 'none'
  | 'hit'
  | 'critical'
  | 'guarded'
  | 'vulnerable'
  | 'healing'
  | 'applied';

export type CombatTokenVisualEffect = {
  id: string;
  startedAt: number;
  durationMs: number;
  response: CombatTokenVisualResponse;
  damageType: string;
};

export type CombatMapAttentionState = {
  activeTokenId: string | null;
  reactingTokenIds: string[];
  concentrationCasters: Array<{
    tokenId: string;
    visibleTargetTokenIds: string[];
  }>;
};

export type CombatTargetingMode = {
  sourceTokenId: string;
  actionId: string;
  shape: CombatTargetShape;
  rangeFt: number;
  radiusFt?: number;
  lengthFt?: number;
  widthFt?: number;
  angleDegrees?: number;
  geometryKnown: boolean;
  eligibleTokenIds: string[];
  defeatedTokenIds: string[];
};

export type CombatTargetPreview = CombatTargetingMode & {
  point: { x: number; y: number } | null;
  validity: 'valid' | 'invalid' | 'unknown';
  visibleAffectedTokenIds: string[];
  reasonLabel: string | null;
};
