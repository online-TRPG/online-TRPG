import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerScenarioView, StoredUser } from '../../../types/session';
import { getPlayerScenario } from '../../../services/scenarioApi';
import { getVttMap } from '../../../services/vttMapApi';
import { createPlayerScenarioLoadKey } from '../utils/sessionNodeTransition';
import { usePlayScenarioMapLoader } from './usePlayScenarioMapLoader';

vi.mock('../../../services/scenarioApi', () => ({
  getPlayerScenario: vi.fn(),
}));

vi.mock('../../../services/vttMapApi', () => ({
  getVttMap: vi.fn(),
}));

const user = {
  id: 'gm-1',
  publicId: 'gm-1',
  displayName: 'GM',
  createdAt: '2026-07-31T00:00:00.000Z',
  role: 'USER',
} as StoredUser;

function createParams() {
  return {
    user,
    sessionId: 'session-1',
    isRecruiting: true,
    currentNodeId: 'node-2' as string | null,
    stateVersion: 7,
    snapshotVttMap: null,
    latestConfirmedMapRef: { current: null },
    playerScenarioLoadKeyRef: { current: null },
    nodeTransitionTargetIdRef: { current: null },
    setPlayerScenario: vi.fn(),
    setMap: vi.fn(),
    setMapIfChanged: vi.fn(),
    setScenarioLoadError: vi.fn(),
    setMapLoadError: vi.fn(),
    resetMapSaveQueue: vi.fn(),
    switchMapSaveSession: vi.fn(),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('usePlayScenarioMapLoader', () => {
  it('does not reload a player scenario already supplied by the node transition response', () => {
    const params = createParams();
    params.playerScenarioLoadKeyRef.current = createPlayerScenarioLoadKey(
      'session-1',
      'node-2',
      7,
    );

    renderHook(() => usePlayScenarioMapLoader(params));

    expect(getPlayerScenario).not.toHaveBeenCalled();
    expect(getVttMap).not.toHaveBeenCalled();
  });

  it('does not race the node transition request when its socket snapshot arrives first', () => {
    const params = createParams();
    params.nodeTransitionTargetIdRef.current = 'node-2';

    renderHook(() => usePlayScenarioMapLoader(params));

    expect(getPlayerScenario).not.toHaveBeenCalled();
  });

  it('reloads once when the same node receives a newer state version', async () => {
    const params = createParams();
    params.playerScenarioLoadKeyRef.current = createPlayerScenarioLoadKey(
      'session-1',
      'node-2',
      6,
    );
    const scenario = {
      currentNodeId: 'node-2',
      currentNode: { id: 'node-2' },
    } as PlayerScenarioView;
    vi.mocked(getPlayerScenario).mockResolvedValue(scenario);

    renderHook(() => usePlayScenarioMapLoader(params));

    await waitFor(() => {
      expect(getPlayerScenario).toHaveBeenCalledTimes(1);
      expect(params.setPlayerScenario).toHaveBeenCalledWith(scenario);
    });
    expect(params.playerScenarioLoadKeyRef.current).toEqual(
      createPlayerScenarioLoadKey('session-1', 'node-2', 7),
    );
  });

  it('loads the scenario when both the transition target and current node are empty', async () => {
    const params = createParams();
    params.currentNodeId = null;
    const scenario = {
      currentNodeId: null,
      currentNode: null,
    } as PlayerScenarioView;
    vi.mocked(getPlayerScenario).mockResolvedValue(scenario);

    renderHook(() => usePlayScenarioMapLoader(params));

    await waitFor(() => {
      expect(getPlayerScenario).toHaveBeenCalledTimes(1);
    });
  });

  it('ignores a slow map response after the current node changes', async () => {
    const params = createParams();
    params.isRecruiting = false;
    vi.mocked(getPlayerScenario).mockResolvedValue({
      currentNodeId: 'node-1',
      currentNode: { id: 'node-1' },
    } as PlayerScenarioView);
    let resolveNodeOne!: (map: never) => void;
    const nodeOneRequest = new Promise<never>((resolve) => {
      resolveNodeOne = resolve;
    });
    vi.mocked(getVttMap)
      .mockReturnValueOnce(nodeOneRequest)
      .mockResolvedValueOnce({
        id: 'map-node-2',
        scenarioNodeId: 'node-2',
        tokens: [],
        fogRects: [],
      } as never);

    params.currentNodeId = 'node-1';
    params.stateVersion = 7;
    const { rerender } = renderHook(() => usePlayScenarioMapLoader(params));

    params.currentNodeId = 'node-2';
    params.stateVersion = 8;
    rerender();
    await waitFor(() => {
      expect(params.setMapIfChanged).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'map-node-2' }),
        'load',
      );
    });

    resolveNodeOne({
      id: 'map-node-1',
      scenarioNodeId: 'node-1',
      tokens: [],
      fogRects: [],
    } as never);
    await Promise.resolve();

    expect(params.setMapIfChanged).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'map-node-1' }),
      'load',
    );
  });
});
