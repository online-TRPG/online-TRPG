import { VttMapStateDto } from "@trpg/shared-types";

const AUTHORITATIVE_VTT_MAP: unique symbol = Symbol(
  "AUTHORITATIVE_VTT_MAP",
);
const PUBLIC_VTT_MAP: unique symbol = Symbol("PUBLIC_VTT_MAP");

export type AuthoritativeVttMap = VttMapStateDto & {
  readonly [AUTHORITATIVE_VTT_MAP]: true;
  readonly [PUBLIC_VTT_MAP]?: never;
};

export type PublicVttMap = VttMapStateDto & {
  readonly [PUBLIC_VTT_MAP]: true;
  readonly [AUTHORITATIVE_VTT_MAP]?: never;
};

function defineBrand<T extends VttMapStateDto, TBrand extends symbol>(
  map: T,
  brand: TBrand,
): T & { readonly [key in TBrand]: true } {
  Object.defineProperty(map, brand, {
    value: true,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  return map as T & { readonly [key in TBrand]: true };
}

/**
 * Marks a map decoded from an authoritative DB/scenario source. The enumerable
 * symbol survives ordinary object spreads but is omitted by JSON serialization.
 */
export function markAuthoritativeVttMap<T extends VttMapStateDto>(
  map: T,
): T & AuthoritativeVttMap {
  if ((map as unknown as PublicVttMap)[PUBLIC_VTT_MAP] === true) {
    throw new Error("PUBLIC_VTT_MAP_CANNOT_BE_PROMOTED_IN_PROCESS");
  }
  return defineBrand(map, AUTHORITATIVE_VTT_MAP) as T & AuthoritativeVttMap;
}

/**
 * Marks any user-facing projection, including a full human-GM projection, so
 * response objects cannot be passed back into authoritative persistence APIs.
 */
export function markPublicVttMap<T extends VttMapStateDto>(
  map: T,
): T & PublicVttMap {
  const projection =
    (map as unknown as AuthoritativeVttMap)[AUTHORITATIVE_VTT_MAP] === true
      ? ({ ...map } as T)
      : map;
  Reflect.deleteProperty(projection, AUTHORITATIVE_VTT_MAP);
  return defineBrand(projection, PUBLIC_VTT_MAP) as T & PublicVttMap;
}

/** Backward-compatible name for the player-redaction boundary. */
export const markPlayerRedactedVttMap = markPublicVttMap;

export function isAuthoritativeVttMap(
  map: VttMapStateDto,
): map is AuthoritativeVttMap {
  return (map as AuthoritativeVttMap)[AUTHORITATIVE_VTT_MAP] === true;
}

export function isPublicVttMap(map: VttMapStateDto): map is PublicVttMap {
  return (map as PublicVttMap)[PUBLIC_VTT_MAP] === true;
}

/** Backward-compatible name used by persistence guards and tests. */
export const isPlayerRedactedVttMap = isPublicVttMap;
