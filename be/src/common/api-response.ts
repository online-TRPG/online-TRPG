export type ApiResponse<T> = {
  code: string;
  message: string;
  data: T;
};

export function apiResponse<T>(code: string, message: string, data: T): ApiResponse<T> {
  return { code, message, data };
}

