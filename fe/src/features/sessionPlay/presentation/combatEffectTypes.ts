import type {
  CombatConditionViewDto,
  CombatPresentationV1,
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
