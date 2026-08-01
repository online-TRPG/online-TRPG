import { describe, expect, it } from 'vitest';
import type { VttMapUpdatedEventDto } from '@trpg/shared-types';
import { decideVttMapEventDisposition } from './vttMapEventGuard';

const map = {
  id: 'map-b',
  scenarioNodeId: 'B',
  imageUrl: null,
  gridType: 'square' as const,
  gridSize: 64,
  width: 640,
  height: 480,
  tokens: [],
  fogRects: [],
  updatedAt: '2026-07-31T00:00:00.000Z',
};

function event(
  overrides: Partial<VttMapUpdatedEventDto> = {},
): VttMapUpdatedEventDto {
  return {
    sessionId: 'session-1',
    scenarioNodeId: 'B',
    stateVersion: 12,
    runtimeVersion: 4,
    map,
    ...overrides,
  };
}

describe('decideVttMapEventDisposition', () => {
  it('drops a late map event from the previous node', () => {
    expect(
      decideVttMapEventDisposition({
        currentSessionId: 'session-1',
        currentNodeId: 'B',
        currentStateVersion: 12,
        currentRuntimeVersion: 4,
        event: event({
          scenarioNodeId: 'A',
          map: { ...map, scenarioNodeId: 'A' },
        }),
      }),
    ).toBe('stale');
  });

  it('drops an older runtime version for the current node', () => {
    expect(
      decideVttMapEventDisposition({
        currentSessionId: 'session-1',
        currentNodeId: 'B',
        currentStateVersion: 12,
        currentRuntimeVersion: 4,
        event: event({ runtimeVersion: 3 }),
      }),
    ).toBe('stale');
  });

  it('requests a snapshot resync when the event state is ahead', () => {
    expect(
      decideVttMapEventDisposition({
        currentSessionId: 'session-1',
        currentNodeId: 'B',
        currentStateVersion: 12,
        currentRuntimeVersion: 4,
        event: event({ stateVersion: 13, runtimeVersion: 5 }),
      }),
    ).toBe('resync');
  });

  it('requests a safe resync for a legacy event without versions', () => {
    expect(
      decideVttMapEventDisposition({
        currentSessionId: 'session-1',
        currentNodeId: 'B',
        currentStateVersion: 12,
        event: event({
          stateVersion: undefined,
          runtimeVersion: undefined,
        }),
      }),
    ).toBe('resync');
  });
});
