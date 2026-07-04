import {
  getApiFieldErrorReasons,
  isApiSuccessEnvelope,
} from '@trpg/shared-types/frontend';
import type {
  ApiErrorEnvelope,
  AuthTokenResponseDto,
} from '@trpg/shared-types';
import type { StoredUser } from '../types/session';
import { saveStoredToken } from './storage';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const configuredWsBaseUrl = import.meta.env.VITE_WS_BASE_URL as string | undefined;
const localDevBaseUrls = ['http://localhost:8080', 'http://127.0.0.1:8080'];
const isLocalFrontend =
  import.meta.env.DEV &&
  typeof globalThis.location !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1'].includes(globalThis.location.hostname);
const defaultBase = import.meta.env.PROD || !isLocalFrontend ? '' : localDevBaseUrls[0];
const preferredBaseUrl = configuredBaseUrl?.replace(/\/$/, '');
const rawBaseUrl = (
  preferredBaseUrl || (isLocalFrontend ? localDevBaseUrls[0] : defaultBase)
).replace(/\/$/, '');
export const API_BASE_URL = rawBaseUrl.endsWith('/api/v1') ? rawBaseUrl : `${rawBaseUrl}/api/v1`;
const fallbackApiBaseUrls = import.meta.env.PROD
  ? [API_BASE_URL]
  : Array.from(
      new Set(
        [
          API_BASE_URL,
          ...(isLocalFrontend && !preferredBaseUrl ? localDevBaseUrls.map((url) => `${url}/api/v1`) : []),
        ]
          .filter((url): url is string => Boolean(url))
          .map((url) => url.replace(/\/$/, ''))
      )
    );
export const SOCKET_BASE_URL = (
  configuredWsBaseUrl || API_BASE_URL.replace(/\/api\/v1$/, '')
).replace(/\/$/, '');

if (import.meta.env.DEV && typeof console !== 'undefined') {
  console.info('[API_BASE_URL]', {
    apiBaseUrl: API_BASE_URL,
    socketBaseUrl: SOCKET_BASE_URL,
    configuredBaseUrl: configuredBaseUrl ?? null,
  });
}

export const AUTH_EXPIRED_EVENT = 'trpg:auth-expired';
export const AUTH_TOKEN_REISSUED_EVENT = 'trpg:auth-token-reissued';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  user?: StoredUser | null;
  accessToken?: string | null;
  withCredentials?: boolean;
  skipAuthRefresh?: boolean;
}

function formatApiError(body: ApiErrorEnvelope | null, fallback: string): string {
  const fieldErrorReasons = getApiFieldErrorReasons(body?.data);
  if (fieldErrorReasons.length > 0) return fieldErrorReasons.join('\n');
  if (!body?.message) return fallback;
  return Array.isArray(body.message) ? body.message.join(', ') : body.message;
}

async function readApiErrorBody(response: Response): Promise<ApiErrorEnvelope | null> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as ApiErrorEnvelope;
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text ? ({ message: text } as ApiErrorEnvelope) : null;
  } catch {
    return null;
  }
}

async function peekApiErrorBody(response: Response): Promise<ApiErrorEnvelope | null> {
  return readApiErrorBody(response.clone());
}

function isMissingRouteResponse(response: Response, body: ApiErrorEnvelope | null): boolean {
  const message = formatApiError(body, '');
  // Development fallback only: Nest returns this default message when the current base URL has no matching route.
  return response.status === 404 && /Cannot\s+(GET|POST|PATCH|DELETE)\s+/i.test(message);
}

function unwrapApiResponse<T>(body: unknown): T {
  if (isApiSuccessEnvelope<T>(body)) {
    return body.data;
  }
  return body as T;
}

function notifyAuthExpired(message: string): void {
  if (typeof window === 'undefined') return;

  // API 서비스에서 401을 감지해 훅에 알려주면, 화면마다 같은 로그아웃 처리를 반복하지 않아도 된다.
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { message } }));
}

function notifyAuthTokenReissued(accessToken: string): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(AUTH_TOKEN_REISSUED_EVENT, { detail: { accessToken } }));
}

let pendingReissue: Promise<AuthTokenResponseDto> | null = null;

async function requestAccessTokenReissue(): Promise<AuthTokenResponseDto> {
  if (!pendingReissue) {
    pendingReissue = fetchAccessTokenReissue().finally(() => {
      pendingReissue = null;
    });
  }

  return pendingReissue;
}

async function fetchAccessTokenReissue(): Promise<AuthTokenResponseDto> {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };
  let response: Response | null = null;
  let lastNetworkError: unknown = null;
  let lastNotFoundBody: ApiErrorEnvelope | null = null;

  for (const baseUrl of fallbackApiBaseUrls) {
    try {
      response = await fetch(`${baseUrl}/users/reissue`, init);
    } catch (error) {
      lastNetworkError = error;
      break;
    }

    if (response.status !== 404 || fallbackApiBaseUrls.length === 1) {
      break;
    }

    lastNotFoundBody = await peekApiErrorBody(response);

    if (!isMissingRouteResponse(response, lastNotFoundBody)) {
      break;
    }
  }

  if (!response) {
    throw new Error(
      lastNetworkError instanceof Error
        ? lastNetworkError.message
        : 'API 서버에 연결하지 못했습니다.'
    );
  }

  if (!response.ok) {
    const body = (await readApiErrorBody(response)) ?? lastNotFoundBody;
    throw new Error(formatApiError(body, '로그인 시간이 만료되었습니다. 다시 로그인해주세요.'));
  }

  const body = (await response.json()) as unknown;
  return unwrapApiResponse<AuthTokenResponseDto>(body);
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  } else if (options.user) {
    headers['x-user-id'] = options.user.id;
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: options.withCredentials ? 'include' : 'same-origin',
  };

  let response: Response | null = null;
  let lastNetworkError: unknown = null;
  let lastNotFoundBody: ApiErrorEnvelope | null = null;

  for (const baseUrl of fallbackApiBaseUrls) {
    try {
      response = await fetch(`${baseUrl}${path}`, init);
    } catch (error) {
      lastNetworkError = error;
      break;
    }

    if (response.status !== 404 || fallbackApiBaseUrls.length === 1) {
      break;
    }

    lastNotFoundBody = await peekApiErrorBody(response);

    if (!isMissingRouteResponse(response, lastNotFoundBody)) {
      break;
    }
  }

  if (!response) {
    throw new Error(
      lastNetworkError instanceof Error
        ? lastNetworkError.message
        : 'API 서버에 연결하지 못했습니다.'
    );
  }

  if (!response.ok) {
    const body = (await readApiErrorBody(response)) ?? lastNotFoundBody;
    const message = formatApiError(body, `요청에 실패했습니다. (${response.status})`);
    if (response.status === 401 && options.accessToken && !options.skipAuthRefresh) {
      try {
        const nextToken = await requestAccessTokenReissue();
        saveStoredToken(nextToken.accessToken);
        notifyAuthTokenReissued(nextToken.accessToken);
        return requestJson<T>(path, {
          ...options,
          accessToken: nextToken.accessToken,
          skipAuthRefresh: true,
        });
      } catch {
        notifyAuthExpired('로그인 시간이 만료되었습니다. 다시 로그인해주세요.');
      }
    } else if (response.status === 401 && options.accessToken) {
      notifyAuthExpired(message);
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json()) as unknown;
  return unwrapApiResponse<T>(body);
}
