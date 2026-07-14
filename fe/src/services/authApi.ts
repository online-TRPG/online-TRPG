import type {
  AuthTokenResponseDto,
  LoginResponseDto,
  OAuthUrlResponseDto,
  OAuthReauthResponseDto,
  ProductProgressAction,
  UserProductProgressResponseDto,
  UserResponseDto,
} from '@trpg/shared-types';
import {
  decodeOAuthUrlResponse,
  decodeUserResponse,
  isRecord,
  readNumber,
} from '@trpg/shared-types/frontend';
import type { StoredUser, User } from '../types/session';
import {
  decodeValidatedAuthTokenResponse,
  decodeValidatedLoginResponse,
} from './authToken';
import { requestJson } from './httpClient';

function decodeProductProgress(value: unknown): UserProductProgressResponseDto {
  if (!isRecord(value)) throw new Error('product progress must be an object.');
  const readNullableDate = (key: string) => {
    const field = value[key];
    if (field === null) return null;
    if (typeof field !== 'string') throw new Error(`${key} must be a string or null.`);
    return field;
  };
  if (!Array.isArray(value.dismissedCoachmarks) || !value.dismissedCoachmarks.every((item) => typeof item === 'string')) {
    throw new Error('dismissedCoachmarks must be a string array.');
  }
  return {
    onboardingVersion: readNumber(value, 'onboardingVersion'),
    tutorialStartedAt: readNullableDate('tutorialStartedAt'),
    firstActionAt: readNullableDate('firstActionAt'),
    completedAt: readNullableDate('completedAt'),
    dismissedAt: readNullableDate('dismissedAt'),
    dismissedCoachmarks: [...value.dismissedCoachmarks],
  };
}

export function createGuest(displayName: string): Promise<User> {
  return requestJson<User>('/users/guest', {
    method: 'POST',
    body: { displayName },
    decode: decodeUserResponse,
  });
}

export function register(email: string, password: string, name: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>('/users/register', {
    method: 'POST',
    body: { email, password, name },
    decode: decodeUserResponse,
  });
}

export function convertGuestToLocal(
  user: StoredUser,
  email: string,
  password: string,
  name: string
): Promise<LoginResponseDto> {
  return requestJson<LoginResponseDto>('/users/guest/convert-local', {
    method: 'POST',
    user,
    body: { email, password, name },
    withCredentials: true,
    decode: decodeValidatedLoginResponse,
  });
}

export function login(email: string, password: string): Promise<LoginResponseDto> {
  return requestJson<LoginResponseDto>('/users/login', {
    method: 'POST',
    body: { email, password },
    withCredentials: true,
    decode: decodeValidatedLoginResponse,
  });
}

export function logout(accessToken: string): Promise<void> {
  return requestJson<void>('/users/logout', {
    method: 'POST',
    accessToken,
    withCredentials: true,
  });
}

export function reissue(): Promise<AuthTokenResponseDto> {
  return requestJson<AuthTokenResponseDto>('/users/reissue', {
    method: 'POST',
    withCredentials: true,
    decode: decodeValidatedAuthTokenResponse,
  });
}

export function getMe(accessToken: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>('/users/me', { accessToken, decode: decodeUserResponse });
}

export function updateMe(accessToken: string, displayName: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>('/users/me', {
    method: 'PATCH',
    accessToken,
    body: { displayName },
    decode: decodeUserResponse,
  });
}

export function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return requestJson<void>('/users/me/password', {
    method: 'PATCH',
    accessToken,
    body: { currentPassword, newPassword },
  });
}

export function requestPasswordReset(email: string): Promise<void> {
  return requestJson<void>('/users/password-reset/request', {
    method: 'POST',
    body: { email },
  });
}

export function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  return requestJson<void>('/users/password-reset/confirm', {
    method: 'POST',
    body: { token, newPassword },
  });
}

export function getProductProgress(
  user: StoredUser,
  accessToken: string | null,
): Promise<UserProductProgressResponseDto> {
  return requestJson<UserProductProgressResponseDto>('/users/me/product-progress', {
    user,
    accessToken,
    decode: decodeProductProgress,
  });
}

export function updateProductProgress(
  user: StoredUser,
  accessToken: string | null,
  action: ProductProgressAction,
  coachmark?: string,
): Promise<UserProductProgressResponseDto> {
  return requestJson<UserProductProgressResponseDto>('/users/me/product-progress', {
    method: 'PATCH',
    user,
    accessToken,
    body: { action, ...(coachmark ? { coachmark } : {}) },
    decode: decodeProductProgress,
  });
}

export function getPublicProfile(publicId: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>(`/users/public/${publicId}`, { decode: decodeUserResponse });
}

export type DeleteAccountCredential = {
  password?: string;
  reauthTicket?: string;
  confirmation?: 'DELETE';
};

export function deleteMe(
  user: StoredUser,
  accessToken: string | null,
  credential: DeleteAccountCredential,
): Promise<void> {
  return requestJson<void>('/users/me', {
    method: 'DELETE',
    user,
    accessToken,
    withCredentials: true,
    body: credential,
  });
}

export function reauthenticateOAuth(
  user: StoredUser,
  accessToken: string | null,
  provider: 'kakao' | 'discord',
  code: string,
  redirectUri: string,
): Promise<OAuthReauthResponseDto> {
  return requestJson<OAuthReauthResponseDto>(`/users/me/reauth/${provider}`, {
    method: 'POST',
    user,
    accessToken,
    body: { code, redirectUri },
    decode: (value) => {
      if (!isRecord(value) || typeof value.ticket !== 'string' || typeof value.expiresIn !== 'number') {
        throw new Error('OAuth reauthentication response is invalid.');
      }
      return { ticket: value.ticket, expiresIn: value.expiresIn };
    },
  });
}

export function getOAuthUrl(
  provider: 'kakao' | 'discord',
  redirectUri: string
): Promise<OAuthUrlResponseDto> {
  const params = new URLSearchParams({ redirectUri });
  return requestJson<OAuthUrlResponseDto>(`/users/oauth/${provider}/url?${params.toString()}`, {
    decode: decodeOAuthUrlResponse,
  });
}

export function oauthLogin(
  provider: 'kakao' | 'discord',
  code: string,
  redirectUri: string
): Promise<LoginResponseDto> {
  return requestJson<LoginResponseDto>(`/users/oauth/${provider}/login`, {
    method: 'POST',
    body: { code, redirectUri },
    withCredentials: true,
    decode: decodeValidatedLoginResponse,
  });
}
