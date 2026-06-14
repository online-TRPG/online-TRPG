import type { Session, User } from "../types/session";

function slugifySegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildPublicProfilePath(user: Pick<User, "publicId" | "nickname" | "displayName">): string {
  const label = slugifySegment(user.nickname || user.displayName || "profile") || "profile";
  return `/users/${user.publicId}/${label}`;
}

export function buildSessionPath(session: Pick<Session, "publicId" | "title">): string {
  const slug = slugifySegment(session.title || "session") || "session";
  return `/sessions/${session.publicId}/${slug}`;
}

export function buildGameroomPath(session: Pick<Session, "publicId" | "title">): string {
  const slug = slugifySegment(session.title || "gameroom") || "gameroom";
  return `/gameroom/${session.publicId}/${slug}`;
}

