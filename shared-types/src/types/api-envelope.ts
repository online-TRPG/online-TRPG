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
  return Boolean(
    value &&
      typeof value === "object" &&
      "reason" in value &&
      typeof (value as { reason?: unknown }).reason === "string",
  );
}

export function getApiFieldErrorReasons(data: unknown): string[] {
  if (!data || typeof data !== "object" || !("fieldErrors" in data)) {
    return [];
  }

  const fieldErrors = (data as { fieldErrors?: unknown }).fieldErrors;
  if (!Array.isArray(fieldErrors)) {
    return [];
  }

  return fieldErrors
    .filter(isApiFieldError)
    .map((error) => error.reason)
    .filter(Boolean);
}
