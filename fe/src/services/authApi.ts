import type {
  AuthTokenResponseDto,
  LoginResponseDto,
  OAuthUrlResponseDto,
  UserResponseDto,
} from '@trpg/shared-types';
import {
  decodeOAuthUrlResponse,
  decodeUserResponse,
} from '@trpg/shared-types/frontend';
import type { StoredUser, User } from '../types/session';
import {
  decodeValidatedAuthTokenResponse,
  decodeValidatedLoginResponse,
} from './authToken';
import { requestJson } from './httpClient';

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

export function getPublicProfile(publicId: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>(`/users/public/${publicId}`, { decode: decodeUserResponse });
}

export function deleteMe(accessToken: string, password: string): Promise<void> {
  return requestJson<void>('/users/me', {
    method: 'DELETE',
    accessToken,
    withCredentials: true,
    body: { password },
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
