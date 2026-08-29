import type { VttMapUpdatedEventDto } from '@trpg/shared-types';

export type VttMapEventDisposition = 'apply' | 'stale' | 'resync';

export function decideVttMapEventDisposition(params: {
  currentSessionId: string;
  currentNodeId: string | null;
  currentStateVersion: number;
  currentRuntimeVersion?: number;
  event: VttMapUpdatedEventDto;
}): VttMapEventDisposition {
  if (params.event.sessionId !== params.currentSessionId) {
    return 'stale';
  }

  if (
    params.event.scenarioNodeId === undefined ||
    params.event.stateVersion === undefined ||
    params.event.runtimeVersion === undefined
  ) {
    return 'resync';
  }

  const eventNodeId =
    params.event.scenarioNodeId;
  if (
    eventNodeId !== null &&
    eventNodeId !== params.currentNodeId
  ) {
    return 'stale';
  }

  if (
    params.event.stateVersion < params.currentStateVersion
  ) {
    return 'stale';
  }
  if (
    params.event.stateVersion > params.currentStateVersion
  ) {
    return 'resync';
  }

  if (
    params.currentRuntimeVersion !== undefined &&
    params.event.runtimeVersion <= params.currentRuntimeVersion
  ) {
    return 'stale';
  }

  return 'apply';
}
