import type { ApiSuccessEnvelope } from "@trpg/shared-types";

export type ApiResponse<T> = ApiSuccessEnvelope<T>;

export function apiResponse<T>(code: string, message: string, data: T): ApiResponse<T> {
  return { code, message, data };
}

