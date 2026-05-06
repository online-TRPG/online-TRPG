import type { Request } from "express";

export type AccessTokenAuth = {
  userId: string;
  email?: string | null;
};

export type AuthenticatedRequest = Request & {
  accessTokenAuth?: AccessTokenAuth;
};
