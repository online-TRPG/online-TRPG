import type {
  VttMapDeltaDto,
  VttMapDeltaPatchDto,
  VttMapStateDto,
} from "../dto/api/sessions.dto";

type MapEntity = { id: string };

const PATCH_KEYS = [
  "scenarioNodeId",
  "imageUrl",
  "gridType",
  "gridSize",
  "width",
  "height",
  "encounterScaling",
  "fogRects",
  "startingPositions",
  "pings",
  "lightSources",
  "terrainCells",
  "wallCells",
  "doorCells",
] as const satisfies ReadonlyArray<keyof VttMapDeltaPatchDto>;

export type ApplyVttMapDeltaResult =
  | { status: "applied"; map: VttMapStateDto }
  | { status: "map_mismatch" | "version_mismatch" };

function valuesEqual(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function buildEntityDelta<T extends MapEntity>(
  previous: readonly T[],
  next: readonly T[],
): { changed: T[]; removedIds: string[] } {
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  const nextIds = new Set(next.map((entry) => entry.id));
  return {
    changed: next.filter((entry) => {
      const previousEntry = previousById.get(entry.id);
      return !previousEntry || !valuesEqual(previousEntry, entry);
    }),
    removedIds: previous
      .filter((entry) => !nextIds.has(entry.id))
      .map((entry) => entry.id),
  };
}

function buildOrderDelta<T extends MapEntity>(
  previous: readonly T[],
  next: readonly T[],
): string[] | undefined {
  if (
    previous.length === next.length &&
    previous.every((entry, index) => entry.id === next[index]?.id)
  ) {
    return undefined;
  }
  return next.map((entry) => entry.id);
}

export function buildVttMapDelta(
  previous: VttMapStateDto,
  next: VttMapStateDto,
): VttMapDeltaDto | null {
  if (
    previous.id !== next.id ||
    !previous.updatedAt ||
    !next.updatedAt ||
    previous.updatedAt === next.updatedAt
  ) {
    return null;
  }

  const patch: VttMapDeltaPatchDto = {};
  const mutablePatch = patch as Record<string, unknown>;
  for (const key of PATCH_KEYS) {
    if (!valuesEqual(previous[key], next[key])) {
      mutablePatch[key] = next[key] === undefined ? null : next[key];
    }
  }

  const tokenDelta = buildEntityDelta(previous.tokens, next.tokens);
  const objectCellDelta = buildEntityDelta(
    previous.objectCells ?? [],
    next.objectCells ?? [],
  );

  return {
    mapId: next.id,
    baseUpdatedAt: previous.updatedAt,
    updatedAt: next.updatedAt,
    patch,
    changedTokens: tokenDelta.changed,
    removedTokenIds: tokenDelta.removedIds,
    tokenOrder: buildOrderDelta(previous.tokens, next.tokens),
    changedObjectCells: objectCellDelta.changed,
    removedObjectCellIds: objectCellDelta.removedIds,
    objectCellOrder: buildOrderDelta(previous.objectCells ?? [], next.objectCells ?? []),
    objectCellsDefined: next.objectCells !== undefined,
  };
}

function applyEntityDelta<T extends MapEntity>(
  current: readonly T[],
  changed: readonly T[],
  removedIds: readonly string[],
  order: readonly string[],
): T[] {
  const removed = new Set(removedIds);
  const nextById = new Map(
    current
      .filter((entry) => !removed.has(entry.id))
      .map((entry) => [entry.id, entry]),
  );
  for (const entry of changed) {
    nextById.set(entry.id, entry);
  }
  const ordered = order
    .map((id) => nextById.get(id))
    .filter((entry): entry is T => Boolean(entry));
  const orderedIds = new Set(order);
  for (const [id, entry] of nextById) {
    if (!orderedIds.has(id)) {
      ordered.push(entry);
    }
  }
  return ordered;
}

export function applyVttMapDelta(
  current: VttMapStateDto,
  delta: VttMapDeltaDto,
): ApplyVttMapDeltaResult {
  if (current.id !== delta.mapId) {
    return { status: "map_mismatch" };
  }
  if (current.updatedAt === delta.updatedAt) {
    return { status: "applied", map: current };
  }
  if (current.updatedAt !== delta.baseUpdatedAt) {
    return { status: "version_mismatch" };
  }

  const next = { ...current } as VttMapStateDto & Record<string, unknown>;
  for (const [key, value] of Object.entries(delta.patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  next.tokens = applyEntityDelta(
    current.tokens,
    delta.changedTokens,
    delta.removedTokenIds,
    delta.tokenOrder ?? current.tokens.map((token) => token.id),
  );
  const nextObjectCells = applyEntityDelta(
    current.objectCells ?? [],
    delta.changedObjectCells,
    delta.removedObjectCellIds,
    delta.objectCellOrder ?? (current.objectCells ?? []).map((objectCell) => objectCell.id),
  );
  if (delta.objectCellsDefined) {
    next.objectCells = nextObjectCells;
  } else {
    delete next.objectCells;
  }
  next.updatedAt = delta.updatedAt;

  return { status: "applied", map: next };
}
