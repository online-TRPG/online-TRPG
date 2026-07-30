export type PlayerScenarioLoadKey = {
  sessionId: string;
  currentNodeId: string | null;
  stateVersion: number | null;
};

export function createPlayerScenarioLoadKey(
  sessionId: string,
  currentNodeId?: string | null,
  stateVersion?: number,
): PlayerScenarioLoadKey {
  return {
    sessionId,
    currentNodeId: currentNodeId ?? null,
    stateVersion: stateVersion ?? null,
  };
}

export function isSamePlayerScenarioLoadKey(
  left: PlayerScenarioLoadKey | null,
  right: PlayerScenarioLoadKey,
): boolean {
  return Boolean(
    left
      && left.sessionId === right.sessionId
      && left.currentNodeId === right.currentNodeId
      && left.stateVersion === right.stateVersion,
  );
}

export function isVttMapForLoadKey(
  mapNodeId: string | null | undefined,
  key: PlayerScenarioLoadKey,
): boolean {
  return key.currentNodeId === (mapNodeId ?? null);
}

export function isCurrentNodeScenarioPending(
  expectedNodeId: string | null | undefined,
  loadedNodeId: string | null | undefined,
  scenarioLoadError: string | null,
): boolean {
  return Boolean(
    expectedNodeId
      && expectedNodeId !== loadedNodeId
      && !scenarioLoadError,
  );
}
