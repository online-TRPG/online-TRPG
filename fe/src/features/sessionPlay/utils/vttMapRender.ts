import type { VttMapStateDto } from '@trpg/shared-types';

export function shouldLogMapMovePerf() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return window.localStorage.getItem('trpg:debug:battle-map-perf') === '1';
}

export function logMapMovePerf(label: string, startedAt: number, detail = '') {
  if (!shouldLogMapMovePerf() || typeof performance === 'undefined') return;
  const suffix = detail ? ` ${detail}` : '';
  console.debug(`[battle-map] ${label}: ${(performance.now() - startedAt).toFixed(2)}ms${suffix}`);
}

export function getVttMapRenderSignature(map: VttMapStateDto | null) {
  if (!map) return 'null';
  const tokenSignature = map.tokens
    .map((token) =>
      [
        token.id,
        token.x,
        token.y,
        token.size,
        token.hidden === true ? 'h' : 'v',
        token.sessionCharacterId ?? '',
      ].join(',')
    )
    .join('|');
  return [
    map.id,
    map.updatedAt,
    map.width,
    map.height,
    map.gridSize,
    tokenSignature,
    map.terrainCells?.length ?? 0,
    map.wallCells?.length ?? 0,
    map.doorCells?.length ?? 0,
    map.objectCells?.length ?? 0,
    map.lightSources?.length ?? 0,
  ].join(';');
}
