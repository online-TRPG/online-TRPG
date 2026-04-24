import type { AuthTokenResponseDto, LoginResponseDto, UserResponseDto } from "@trpg/shared-types";

export type AuthUser = UserResponseDto;
export type AuthTokens = AuthTokenResponseDto;
export type LoginResponse = LoginResponseDto;
export type AuthMode = "guest" | "member";