import type { VttMapStateDto } from '@trpg/shared-types';
import { subtractRect } from './explorationMapGeometry';

type CellSelection = { cell: { id: string } };
type TokenSelection = { token: { id: string; hidden?: boolean } };

function markUpdated(map: VttMapStateDto) {
  return {
    ...map,
    updatedAt: new Date().toISOString(),
  };
}

export function appendPingToMap(
  map: VttMapStateDto,
  point: { x: number; y: number },
  label: string
) {
  const now = Date.now();
  return markUpdated({
    ...map,
    pings: [
      ...(map.pings ?? []).filter((ping) => Date.parse(ping.expiresAt) > now).slice(-4),
      {
        id: `ping:${now}`,
        x: point.x,
        y: point.y,
        label,
        expiresAt: new Date(now + 2200).toISOString(),
      },
    ],
  });
}

export function updateSelectedDoorState(
  map: VttMapStateDto,
  selection: CellSelection,
  state: NonNullable<VttMapStateDto['doorCells']>[number]['state']
) {
  return markUpdated({
    ...map,
    doorCells: (map.doorCells ?? []).map((door) =>
      door.id === selection.cell.id ? { ...door, state } : door
    ),
  });
}

export function disarmSelectedObjectHazard(map: VttMapStateDto, selection: CellSelection) {
  return markUpdated({
    ...map,
    objectCells: (map.objectCells ?? []).map((cell) =>
      cell.id === selection.cell.id && cell.hazard
        ? { ...cell, hazard: { ...cell.hazard, armed: false } }
        : cell
    ),
  });
}

export function markSelectedObjectBroken(map: VttMapStateDto, selection: CellSelection) {
  return markUpdated({
    ...map,
    objectCells: (map.objectCells ?? []).map((cell) =>
      cell.id === selection.cell.id ? { ...cell, broken: true } : cell
    ),
  });
}

export function revealAllFog(map: VttMapStateDto) {
  return markUpdated({ ...map, fogRects: [] });
}

export function revealFogAroundPoint(
  map: VttMapStateDto,
  point: { x: number; y: number }
) {
  const radius = map.gridSize * 2;
  const cut = {
    x: Math.max(0, point.x - radius),
    y: Math.max(0, point.y - radius),
    width: Math.min(map.width, radius * 2),
    height: Math.min(map.height, radius * 2),
  };
  return markUpdated({
    ...map,
    fogRects: map.fogRects.flatMap((rect) => subtractRect(rect, cut)),
  });
}

export function toggleSelectedTokenHidden(map: VttMapStateDto, selection: TokenSelection) {
  return markUpdated({
    ...map,
    tokens: map.tokens.map((token) =>
      token.id === selection.token.id ? { ...token, hidden: !token.hidden } : token
    ),
  });
}

export function toggleSelectedObjectVisible(map: VttMapStateDto, selection: CellSelection) {
  return markUpdated({
    ...map,
    objectCells: (map.objectCells ?? []).map((cell) =>
      cell.id === selection.cell.id
        ? { ...cell, visibleToPlayers: cell.visibleToPlayers === false }
        : cell
    ),
  });
}

export function moveTokenOnMap(
  map: VttMapStateDto,
  tokenId: string,
  nextPosition: { x: number; y: number }
) {
  return markUpdated({
    ...map,
    tokens: map.tokens.map((token) =>
      token.id === tokenId
        ? {
            ...token,
            x: nextPosition.x,
            y: nextPosition.y,
          }
        : token
    ),
  });
}
