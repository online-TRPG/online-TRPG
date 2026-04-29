import type { AuthMode } from "../types/auth";
import { formatDate, useCurrentProfile } from "../hooks/useCurrentProfile";
import type { StoredUser } from "../types/session";

interface AccountPageProps {
  user: StoredUser;
  accessToken: string | null;
  authMode: AuthMode | null;
  busy: boolean;
  error: string | null;
  onLogout: () => void;
  onOpenProfile: () => void;
}

export function AccountPage({
  user,
  accessToken,
  authMode,
  busy,
  error,
  onLogout,
  onOpenProfile,
}: AccountPageProps) {
  const { effectiveProfile, loadingProfile, profileError } = useCurrentProfile({ user, accessToken, authMode });

  const accountRows = [
    { label: "계정 ID", value: effectiveProfile.id },
    { label: "사용자 식별자", value: effectiveProfile.userId },
    { label: "이메일", value: effectiveProfile.email || "비공개 또는 미연동" },
    { label: "인증 제공자", value: effectiveProfile.authProvider },
    { label: "세션 상태", value: effectiveProfile.sessionAuthModeLabel },
    { label: "가입일", value: formatDate(effectiveProfile.createdAt) },
  ];

  return (
    <main className="profile-page">
      <section className="profile-hero">
        <div className="profile-hero-main">
          <span className="eyebrow">Account</span>
          <div className="profile-hero-header">
            <div className="avatar avatar-xl">{effectiveProfile.displayName.slice(0, 1)}</div>
            <div>
              <h1>내 계정</h1>
              <p>이 화면은 로그인 수단, 이메일, 내부 식별자처럼 공개 프로필과 분리되어야 하는 개인 정보 중심의 설정 화면입니다.</p>
            </div>
          </div>
        </div>

        <div className="profile-hero-actions profile-hero-actions-stack">
          <button type="button" className="ghost" onClick={onOpenProfile}>
            프로필 보기
          </button>
          <button type="button" className="ghost" onClick={onLogout} disabled={busy}>
            로그아웃
          </button>
        </div>
      </section>

      <section className="profile-grid">
        <article className="profile-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Private</span>
              <h2>계정 정보</h2>
            </div>
          </div>

          <dl className="profile-kv-grid">
            {accountRows.map((row) => (
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
              <span className="eyebrow">Status</span>
              <h2>연동 상태</h2>
            </div>
          </div>

          <div className="profile-notes">
            <div className="profile-note">
              <strong>현재 로그인 방식</strong>
              <p>
                {authMode === "guest"
                  ? "게스트로 접속 중이라 이메일, OAuth 연동, 비밀번호 변경 기능이 제한됩니다."
                  : `${effectiveProfile.authProvider} 계정으로 접속 중입니다.`}
              </p>
            </div>
            <div className="profile-note">
              <strong>계정 동기화</strong>
              <p>{loadingProfile ? "서버에서 최신 계정 정보를 확인하는 중입니다." : "서버 기준 최신 계정 정보를 표시 중입니다."}</p>
            </div>
            <div className="profile-note">
              <strong>다음 구현 메모</strong>
              <p>비밀번호 변경, OAuth 추가 연동/해제, 회원 탈퇴는 이 페이지에 이어서 붙이면 됩니다.</p>
            </div>
          </div>
        </article>
      </section>

      {profileError || error ? <p className="panel-error">{profileError ?? error}</p> : null}
    </main>
  );
}
