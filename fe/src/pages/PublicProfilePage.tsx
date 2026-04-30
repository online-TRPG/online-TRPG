import type { User } from "../types/session";

interface PublicProfilePageProps {
  userId: string;
  previewUser: User | null;
  onOpenOwnProfile: () => void;
}

export function PublicProfilePage({ userId, previewUser, onOpenOwnProfile }: PublicProfilePageProps) {
  const resolvedPreview = previewUser?.userId === userId ? previewUser : null;

  const profile = resolvedPreview ?? {
    id: "",
    userId,
    email: null,
    name: "알 수 없는 사용자",
    nickname: "미확인",
    authProvider: "LOCAL" as User["authProvider"],
    displayName: userId,
    createdAt: "",
  };

  const profileRows = [
    { label: "표시 이름", value: profile.displayName },
    { label: "닉네임", value: profile.nickname || "-" },
    { label: "이름", value: profile.name || "-" },
    { label: "프로필 주소", value: `/users/${profile.userId}/profile` },
    { label: "회원 유형", value: profile.authProvider },
    { label: "공개 대상", value: "세션 탐색 중 확인 가능한 기본 프로필" },
  ];

  return (
    <main className="profile-page">
      <section className="profile-hero">
        <div className="profile-hero-main">
          <span className="eyebrow">Public profile</span>
          <div className="profile-hero-header">
            <div className="avatar avatar-xl">{profile.displayName.slice(0, 1)}</div>
            <div>
              <h1>{profile.displayName}</h1>
              <p>
                현재 MVP에서는 세션 상세 화면에서 받은 최소 프로필 정보만 공개합니다. 쪽지, 외부 연락 수단, 대표 캐릭터 같은 확장 요소는 이후 단계에서 붙일 예정입니다.
              </p>
            </div>
          </div>
        </div>

        <div className="profile-hero-actions profile-hero-actions-stack">
          <button type="button" className="ghost" onClick={onOpenOwnProfile}>
            내 프로필 보기
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
              <span className="eyebrow">Availability</span>
              <h2>확장 예정 기능</h2>
            </div>
          </div>

          <div className="profile-notes">
            <div className="profile-note">
              <strong>직접 연락 기능</strong>
              <p>자체 쪽지나 외부 OAuth 계정 연동을 통한 연락 기능은 MVP 범위 밖으로 두고, 프로필 화면에서 역할과 기본 정보만 우선 확인합니다.</p>
            </div>
            <div className="profile-note">
              <strong>현재 상태</strong>
              <p>{resolvedPreview ? "세션 탐색 화면에서 가져온 프로필 정보를 표시 중입니다." : "직접 링크로 접근한 상태라 공개 프로필 상세 API가 준비되기 전까지는 기본 식별자만 표시합니다."}</p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
