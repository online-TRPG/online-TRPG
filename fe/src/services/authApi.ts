import type {
  AuthTokenResponseDto,
  LoginResponseDto,
  OAuthUrlResponseDto,
  UserResponseDto,
} from '@trpg/shared-types';
import type { StoredUser, User } from '../types/session';
import { requestJson } from './httpClient';

export function createGuest(displayName: string): Promise<User> {
  return requestJson<User>('/users/guest', {
    method: 'POST',
    body: { displayName },
  });
}

export function register(email: string, password: string, name: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>('/users/register', {
    method: 'POST',
    body: { email, password, name },
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
  });
}

export function login(email: string, password: string): Promise<LoginResponseDto> {
  return requestJson<LoginResponseDto>('/users/login', {
    method: 'POST',
    body: { email, password },
    withCredentials: true,
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
  });
}

export function getMe(accessToken: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>('/users/me', { accessToken });
}

export function updateMe(accessToken: string, displayName: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>('/users/me', {
    method: 'PATCH',
    accessToken,
    body: { displayName },
  });
}

export function getPublicProfile(publicId: string): Promise<UserResponseDto> {
  return requestJson<UserResponseDto>(`/users/public/${publicId}`);
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
  return requestJson<OAuthUrlResponseDto>(`/users/oauth/${provider}/url?${params.toString()}`);
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
  });
}
