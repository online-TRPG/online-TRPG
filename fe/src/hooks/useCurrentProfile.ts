import { useEffect, useMemo, useState } from "react";
import { getMe } from "../services/api";
import type { AuthMode } from "../types/auth";
import type { StoredUser, User } from "../types/session";

interface UseCurrentProfileOptions {
  user: StoredUser;
  accessToken: string | null;
  authMode: AuthMode | null;
}

export interface EffectiveProfile extends User {
  sessionAuthModeLabel: string;
}

function fallbackProfile(user: StoredUser, authMode: AuthMode | null): User {
  return {
    id: user.id,
    publicId: user.publicId,
    userId: user.id,
    email: null,
    name: user.displayName,
    nickname: user.displayName,
    authProvider: (authMode === "guest" ? "GUEST" : "LOCAL") as User["authProvider"],
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

export function formatDate(value: string | undefined): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function useCurrentProfile({ user, accessToken, authMode }: UseCurrentProfileOptions) {
  const [memberProfile, setMemberProfile] = useState<User | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setMemberProfile(null);
      setProfileError(null);
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);
    setProfileError(null);

    void getMe(accessToken)
      .then((profile) => {
        if (cancelled) return;
        setMemberProfile(profile);
      })
      .catch((caught) => {
        if (cancelled) return;
        setProfileError(caught instanceof Error ? caught.message : "계정 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const effectiveProfile = useMemo<EffectiveProfile>(() => {
    const base = memberProfile ?? fallbackProfile(user, authMode);
    return {
      ...base,
      sessionAuthModeLabel: authMode === "guest" ? "게스트 세션" : "회원 세션",
    };
  }, [authMode, memberProfile, user]);

  return {
    effectiveProfile,
    loadingProfile,
    profileError,
    mutateProfile: setMemberProfile,
  };
}
