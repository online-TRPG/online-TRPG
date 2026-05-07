/*
 * ProfilePage
 * 역할: 내가 보는 프로필 페이지입니다. 공개 프로필에 가까운 기본 정보와 계정 관리 진입점을 보여줍니다.
 * 읽는 순서:
 * 1) ProfilePageProps: 현재 사용자, 인증 상태, 로그아웃/계정관리 콜백
 * 2) useCurrentProfile: 게스트/회원 상태를 반영한 표시용 프로필 계산
 * 3) profileRows: 기본 정보 카드에 렌더링할 데이터 목록
 * 4) JSX: 프로필 히어로, 기본 정보 카드, 프로필 상태 카드, 에러 표시
 */
import type { AuthMode } from "../types/auth";
import { formatDate, useCurrentProfile } from "../hooks/useCurrentProfile";
import type { StoredUser } from "../types/session";
import { buildPublicProfilePath } from "../utils/routes";
import "./ProfilePage.css";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface ProfilePageProps {
  user: StoredUser;
  accessToken: string | null;
  authMode: AuthMode | null;
  busy: boolean;
  error: string | null;
  onLogout: () => void;
  onOpenAccount: () => void;
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function ProfilePage({
  user,
  accessToken,
  authMode,
  busy,
  error,
  onLogout,
  onOpenAccount,
}: ProfilePageProps) {
  // 현재 로그인 방식에 따라 표시할 프로필 데이터를 계산합니다.
  const { effectiveProfile, loadingProfile, profileError } = useCurrentProfile({ user, accessToken, authMode });

  // 기본 정보 카드에 반복 출력할 label/value 목록입니다.
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
      {/* 프로필 대표 정보와 계정 관리/로그아웃 버튼 영역입니다. */}
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

      {/* 상세 카드 영역: 왼쪽은 기본 정보, 오른쪽은 프로필 기능 설명입니다. */}
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
