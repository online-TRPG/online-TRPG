import { describe, expect, it } from 'vitest';
import {
  createPlayerScenarioLoadKey,
  isCurrentNodeScenarioPending,
  isSamePlayerScenarioLoadKey,
} from './sessionNodeTransition';

describe('session node transition state', () => {
  it('treats only an exact session, node, and version match as already loaded', () => {
    const loaded = createPlayerScenarioLoadKey('session-1', 'node-2', 7);

    expect(isSamePlayerScenarioLoadKey(
      loaded,
      createPlayerScenarioLoadKey('session-1', 'node-2', 7),
    )).toBe(true);
    expect(isSamePlayerScenarioLoadKey(
      loaded,
      createPlayerScenarioLoadKey('session-1', 'node-2', 8),
    )).toBe(false);
    expect(isSamePlayerScenarioLoadKey(
      loaded,
      createPlayerScenarioLoadKey('session-1', 'node-3', 7),
    )).toBe(false);
  });

  it('keeps the surface loading while the loaded node belongs to the previous snapshot', () => {
    expect(isCurrentNodeScenarioPending('node-2', 'node-1', null)).toBe(true);
    expect(isCurrentNodeScenarioPending('node-2', 'node-2', null)).toBe(false);
    expect(isCurrentNodeScenarioPending('node-2', null, 'load failed')).toBe(false);
    expect(isCurrentNodeScenarioPending(null, 'node-1', null)).toBe(false);
  });
});
