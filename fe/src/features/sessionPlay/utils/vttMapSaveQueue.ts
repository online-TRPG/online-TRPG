import type { VttMapStateDto } from '@trpg/shared-types';

export type VttMapSaveQueueState = {
  isSaving: boolean;
  pending: VttMapStateDto | null;
  activeSessionId: string | null;
};

export function createVttMapSaveQueueState(): VttMapSaveQueueState {
  return {
    isSaving: false,
    pending: null,
    activeSessionId: null,
  };
}

export function queueVttMapSave(
  state: VttMapSaveQueueState,
  params: {
    sessionId: string;
    map: VttMapStateDto;
  },
): void {
  state.activeSessionId = params.sessionId;
  state.pending = params.map;
}

export function switchVttMapSaveSession(
  state: VttMapSaveQueueState,
  sessionId: string | null,
): void {
  state.activeSessionId = sessionId;
  state.pending = null;
}

export function claimNextVttMapSave(state: VttMapSaveQueueState): VttMapStateDto | null {
  if (state.isSaving || !state.pending) {
    return null;
  }

  const mapToSave = state.pending;
  state.pending = null;
  state.isSaving = true;
  return mapToSave;
}

export function completeVttMapSave(state: VttMapSaveQueueState): void {
  state.isSaving = false;
}

export function isVttMapSaveActiveForSession(
  state: VttMapSaveQueueState,
  sessionId: string,
): boolean {
  return state.activeSessionId === sessionId;
}

export function shouldFlushQueuedVttMapSave(
  state: VttMapSaveQueueState,
  sessionId: string,
): boolean {
  return Boolean(state.pending && isVttMapSaveActiveForSession(state, sessionId));
}
