export type Decoder<T> = (value: unknown) => T;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

export function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

export function readString(record: Record<string, unknown>, key: string, label = key): string {
  const value = record[key];
  if (!isString(value)) {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  label = key,
): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isString(value)) {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

export function readNumber(record: Record<string, unknown>, key: string, label = key): number {
  const value = record[key];
  if (!isNumber(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

export function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
  label = key,
): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  return readNumber(record, key, label);
}

export function readBoolean(record: Record<string, unknown>, key: string, label = key): boolean {
  const value = record[key];
  if (!isBoolean(value)) {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

export function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
  label = key,
): boolean | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  return readBoolean(record, key, label);
}

export function readArray<T>(
  record: Record<string, unknown>,
  key: string,
  decodeItem: Decoder<T>,
  label = key,
): T[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((item, index) => decodeOrThrow(item, decodeItem, `${label}[${index}]`));
}

export function readOptionalArray<T>(
  record: Record<string, unknown>,
  key: string,
  decodeItem: Decoder<T>,
  label = key,
): T[] | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((item, index) => decodeOrThrow(item, decodeItem, `${label}[${index}]`));
}

export function decodeArray<T>(value: unknown, decodeItem: Decoder<T>, label: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((item, index) => decodeOrThrow(item, decodeItem, `${label}[${index}]`));
}

export function parseJsonWithDecoder<T>(raw: string, decode: Decoder<T>, label = "json"): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  return decodeOrThrow(parsed, decode, label);
}

export function decodeOrThrow<T>(value: unknown, decode: Decoder<T>, label: string): T {
  try {
    return decode(value);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${label}: ${error.message}`);
    }
    throw error;
  }
}

export function decodeItemWithLabel<T>(value: unknown, decode: Decoder<T>, label: string): T {
  return decodeOrThrow(value, decode, label);
}
