import type { AuthMode } from "../types/auth";
import { formatDate, useCurrentProfile } from "../hooks/useCurrentProfile";
import type { StoredUser } from "../types/session";
import { buildPublicProfilePath } from "../utils/routes";

interface ProfilePageProps {
  user: StoredUser;
  accessToken: string | null;
  authMode: AuthMode | null;
  busy: boolean;
  error: string | null;
  onLogout: () => void;
  onOpenAccount: () => void;
}

export function ProfilePage({
  user,
  accessToken,
  authMode,
  busy,
  error,
  onLogout,
  onOpenAccount,
}: ProfilePageProps) {
  const { effectiveProfile, loadingProfile, profileError } = useCurrentProfile({ user, accessToken, authMode });

  const profileRows = [
    { label: "표시 이름", value: effectiveProfile.displayName },
    { label: "닉네임", value: effectiveProfile.nickname || "-" },
    { label: "이름", value: effectiveProfile.name || "-" },
    { label: "프로필 주소", value: buildPublicProfilePath(effectiveProfile) },
    { label: "대표 상태", value: authMode === "guest" ? "게스트 프로필" : "회원 프로필" },
    { label: "가입일", value: formatDate(effectiveProfile.createdAt) },
  ];

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
                  : "이 화면은 다른 사용자에게도 보여줄 수 있는 공개 프로필의 초안으로, 표시 이름과 캐릭터/활동 소개 중심으로 확장될 자리입니다."}
              </p>
            </div>
          </div>
        </div>

        <div className="profile-hero-actions profile-hero-actions-stack">
          <button type="button" className="ghost" onClick={onOpenAccount}>
            계정 관리
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
              <h2>프로필 상태</h2>
            </div>
          </div>

          <div className="profile-notes">
            <div className="profile-note">
              <strong>프로필 공개 방향</strong>
              <p>현재는 내 정보 화면으로 시작하지만, 다음 단계에서는 대표 캐릭터와 소개글, 공개 세션 기록을 여기에 붙이게 됩니다.</p>
            </div>
            <div className="profile-note">
              <strong>프로필 로드</strong>
              <p>{loadingProfile ? "서버에서 최신 정보를 확인하는 중입니다." : "현재 저장된 사용자 정보를 표시 중입니다."}</p>
            </div>
            <div className="profile-note">
              <strong>계정 관리 분리</strong>
              <p>이메일, OAuth 연동 상태, 비밀번호 변경, 회원 탈퇴 같은 민감 정보는 별도 Account 페이지로 분리합니다.</p>
            </div>
          </div>
        </article>
      </section>

      {profileError || error ? <p className="panel-error">{profileError ?? error}</p> : null}
    </main>
  );
}
