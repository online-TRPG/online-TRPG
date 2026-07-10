export type ApiSuccessEnvelope<T> = {
  code: string;
  message: string;
  data: T;
};

export type ApiFieldError = {
  field?: string;
  reason: string;
};

export type ApiErrorEnvelope = {
  code?: string;
  statusCode?: number;
  message?: string | string[];
  data?: {
    fieldErrors?: ApiFieldError[];
    [key: string]: unknown;
  } | null;
  timestamp?: string;
  path?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalHttpStatusCode(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function readOptionalMessage(record: Record<string, unknown>): string | string[] | undefined {
  const value = record.message;
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value;
  }
  return undefined;
}

function decodeApiErrorData(value: unknown): ApiErrorEnvelope["data"] {
  if (value === undefined || value === null || !isRecord(value)) {
    return null;
  }
  const fieldErrors = Array.isArray(value.fieldErrors)
    ? value.fieldErrors.flatMap((entry) => toApiFieldError(entry))
    : undefined;
  return {
    ...value,
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

export function decodeApiErrorEnvelope(value: unknown): ApiErrorEnvelope | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    code: readOptionalString(value, "code"),
    statusCode: readOptionalHttpStatusCode(value, "statusCode"),
    message: readOptionalMessage(value),
    data: decodeApiErrorData(value.data),
    timestamp: readOptionalString(value, "timestamp"),
    path: readOptionalString(value, "path"),
  };
}

export function isApiSuccessEnvelope<T = unknown>(value: unknown): value is ApiSuccessEnvelope<T> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "code" in value &&
      "message" in value &&
      "data" in value,
  );
}

export function isApiFieldError(value: unknown): value is ApiFieldError {
  return isRecord(value) && typeof value.reason === "string";
}

export function getApiFieldErrorReasons(data: unknown): string[] {
  if (!isRecord(data) || !("fieldErrors" in data)) {
    return [];
  }

  const fieldErrors = data.fieldErrors;
  if (!Array.isArray(fieldErrors)) {
    return [];
  }

  return fieldErrors
    .flatMap((entry) => toApiFieldError(entry))
    .map((error) => error.reason)
    .filter((reason) => reason.length > 0);
}

function toApiFieldError(value: unknown): ApiFieldError[] {
  return isApiFieldError(value) ? [value] : [];
}
