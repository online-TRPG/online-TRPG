import {
  type Decoder,
  decodeOrThrow,
  isRecord,
  isStringArray,
  readRecord,
} from "@trpg/shared-types";

export type JsonParseDecoder<T> = Decoder<T>;

export function parseJsonOrFallback<T, Decoded = T>(
  value: string | null | undefined,
  fallback: T,
  decode: JsonParseDecoder<Decoded>,
): T | Decoded {
  if (!value) {
    return fallback;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fallback;
  }

  try {
    return decode(parsed);
  } catch {
    return fallback;
  }
}

export function parseJsonOrThrow<T, Decoded = T>(
  value: string | null | undefined,
  fallback: T,
  decode: JsonParseDecoder<Decoded>,
  label = "json",
): T | Decoded {
  if (!value) {
    return fallback;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }

  return decodeOrThrow(parsed, decode, label);
}

export function parseJsonRecordOrFallback(
  value: string | null | undefined,
  fallback: Record<string, unknown> = {},
): Record<string, unknown> {
  return parseJsonOrFallback(value, fallback, decodeRecord);
}

export function parseJsonRecordOrThrow(
  value: string | null | undefined,
  fallback: Record<string, unknown> = {},
  label = "json record",
): Record<string, unknown> {
  return parseJsonOrThrow(value, fallback, decodeRecord, label);
}

export function parseUnknownJsonOrFallback(
  value: string | null | undefined,
  fallback: unknown = null,
): unknown {
  return parseJsonOrFallback(value, fallback, (parsed) => parsed);
}

export function parseJsonStringArrayOrFallback(
  value: string | null | undefined,
  fallback: string[],
): string[];
export function parseJsonStringArrayOrFallback(
  value: string | null | undefined,
  fallback: undefined,
): string[] | undefined;
export function parseJsonStringArrayOrFallback(
  value: string | null | undefined,
  fallback: string[] | undefined = [],
): string[] | undefined {
  return parseJsonOrFallback(value, fallback, decodeStringArray);
}

export function decodeRecord(value: unknown): Record<string, unknown> {
  return readRecord(value, "json");
}

export function decodeStringArray(value: unknown): string[] {
  if (!isStringArray(value)) {
    throw new Error("json must be a string array.");
  }
  return value;
}

export function decodeRecordLikeOrFallback(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
