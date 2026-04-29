import { useEffect, useMemo, useState } from "react";
import { getMe } from "../services/api";
import type { AuthMode } from "../types/auth";
import type { StoredUser, User } from "../types/session";

interface ProfilePageProps {
  user: StoredUser;
  accessToken: string | null;
  authMode: AuthMode | null;
  busy: boolean;
  error: string | null;
  onLogout: () => void;
}

function formatDate(value: string | undefined): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function ProfilePage({ user, accessToken, authMode, busy, error, onLogout }: ProfilePageProps) {
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
        setProfileError(caught instanceof Error ? caught.message : "프로필 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const effectiveProfile = memberProfile ?? {
    id: user.id,
    userId: user.id,
    email: null,
    name: user.displayName,
    nickname: user.displayName,
    authProvider: authMode === "guest" ? "GUEST" : "LOCAL",
    displayName: user.displayName,
    createdAt: user.createdAt,
  };

  const profileRows = useMemo(
    () => [
      { label: "표시 이름", value: effectiveProfile.displayName },
      { label: "닉네임", value: effectiveProfile.nickname || "-" },
      { label: "이름", value: effectiveProfile.name || "-" },
      { label: "이메일", value: effectiveProfile.email || "비공개 또는 미연동" },
      { label: "로그인 방식", value: authMode === "guest" ? "게스트" : effectiveProfile.authProvider },
      { label: "가입일", value: formatDate(effectiveProfile.createdAt) },
    ],
    [authMode, effectiveProfile],
  );

  return (
    <main className="profile-page">
      <section className="profile-hero">
        <div className="profile-hero-main">
          <span className="eyebrow">Profile</span>
          <div className="profile-hero-header">
            <div className="avatar avatar-xl">{effectiveProfile.displayName.slice(0, 1)}</div>
            <div>
              <h1>{effectiveProfile.displayName}</h1>
              <p>
                {authMode === "guest"
                  ? "게스트 세션으로 접속 중입니다. 계정을 만들면 프로필과 진행 기록을 더 안정적으로 유지할 수 있습니다."
                  : "현재 계정의 기본 정보와 로그인 방식을 확인할 수 있습니다."}
              </p>
            </div>
          </div>
        </div>

        <div className="profile-hero-actions">
          <button type="button" className="ghost" onClick={onLogout} disabled={busy}>
            로그아웃
          </button>
        </div>
      </section>

      <section className="profile-grid">
        <article className="profile-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Identity</span>
              <h2>기본 정보</h2>
            </div>
          </div>

          <dl className="profile-kv-grid">
            {profileRows.map((row) => (
              <div key={row.label} className="profile-kv-item">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="profile-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Session</span>
              <h2>계정 상태</h2>
            </div>
          </div>

          <div className="profile-notes">
            <div className="profile-note">
              <strong>인증 모드</strong>
              <p>{authMode === "guest" ? "게스트 세션" : "회원 세션"}</p>
            </div>
            <div className="profile-note">
              <strong>프로필 로드</strong>
              <p>{loadingProfile ? "서버에서 최신 정보를 확인하는 중입니다." : "현재 저장된 사용자 정보를 표시 중입니다."}</p>
            </div>
            <div className="profile-note">
              <strong>다음 구현 메모</strong>
              <p>공개 프로필, 계정 관리, OAuth 연동 관리 페이지는 이 화면을 기준으로 이어서 붙이면 됩니다.</p>
            </div>
          </div>
        </article>
      </section>

      {profileError || error ? <p className="panel-error">{profileError ?? error}</p> : null}
    </main>
  );
}
