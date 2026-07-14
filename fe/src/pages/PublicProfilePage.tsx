/*
 * PublicProfilePage
 * 역할: 다른 사용자의 공개 프로필을 보여주는 페이지입니다.
 * 읽는 순서:
 * 1) PublicProfilePageProps: URL의 publicId, 미리보기 프로필, 내 프로필 이동 콜백
 * 2) profile/loading/error state: API 조회 결과와 로딩 상태
 * 3) useEffect: 미리보기 데이터 사용 또는 공개 프로필 API 호출
 * 4) canonicalPath useEffect: 실제 publicId 기준 URL로 주소 정규화
 * 5) JSX: 공개 프로필 히어로, 기본 정보, 확장 예정 기능 설명
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getPublicProfile } from "../services/authApi";
import type { User } from "../types/session";
import { buildPublicProfilePath } from "../utils/routes";
import "./ProfilePage.css";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface PublicProfilePageProps {
  publicId: string;
  previewUser: User | null;
  onOpenOwnProfile: () => void;
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function PublicProfilePage({ publicId, previewUser, onOpenOwnProfile }: PublicProfilePageProps) {
  // 라우터 훅: 공개 프로필 URL을 정규화할 때 사용합니다.
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedPreview = previewUser?.publicId === publicId ? previewUser : null;
  // 직접 링크 접근이면 API로 불러오고, 세션 화면에서 넘어온 경우 previewUser를 먼저 사용합니다.
  const [profile, setProfile] = useState<User | null>(resolvedPreview);
  const [loading, setLoading] = useState(!resolvedPreview);
  const [error, setError] = useState<string | null>(null);

  // 공개 프로필 데이터 로드: 미리보기 데이터가 있으면 API 호출을 건너뜁니다.
  useEffect(() => {
    if (resolvedPreview) {
      setProfile(resolvedPreview);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getPublicProfile(publicId)
      .then((next) => {
        if (cancelled) return;
        setProfile(next);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "공개 프로필을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
  return () => {
      cancelled = true;
    };
  }, [publicId, resolvedPreview]);

  // 로딩/에러 중에도 화면이 깨지지 않도록 fallback 프로필을 만듭니다.
  const effectiveProfile =
    profile ?? {
      id: "",
      publicId,
      userId: "",
      email: null,
      name: "알 수 없는 사용자",
      nickname: "미확인",
      authProvider: "LOCAL",
      displayName: publicId,
      createdAt: "",
    };
  const canonicalPath = buildPublicProfilePath(effectiveProfile);
  const nickname = effectiveProfile.nickname || effectiveProfile.displayName || "-";

  useEffect(() => {
    if (!effectiveProfile.publicId) return;
    if (!resolvedPreview && !profile) return;
    if (location.pathname === canonicalPath) return;
    navigate(canonicalPath, {
      replace: true,
      state: resolvedPreview ? { profilePreview: resolvedPreview } : undefined,
    });
  }, [canonicalPath, effectiveProfile.publicId, location.pathname, navigate, profile, resolvedPreview]);

  // 공개 프로필에서도 이름 계열 필드는 닉네임 하나만 보여줘 사용자가 같은 값을 여러 이름으로 보지 않게 합니다.
  const profileRows = [
    { label: "닉네임", value: nickname },
    { label: "가입일", value: effectiveProfile.createdAt ? new Date(effectiveProfile.createdAt).toLocaleDateString("ko-KR") : "-" },
    { label: "공개 대상", value: "세션 탐색 중 확인 가능한 기본 프로필" },
  ];

  return (
    <main className="profile-page">
      {/* 공개 프로필의 대표 이름과 설명 영역입니다. */}
      <section className="profile-hero">
        <div className="profile-hero-main">
          <span className="eyebrow">Public profile</span>
          <div className="profile-hero-header">
            <div className="avatar avatar-xl">{nickname.slice(0, 1)}</div>
            <div>
              <h1>{nickname}</h1>
              <p>
                세션에 함께할 사용자를 확인할 수 있도록 공개 닉네임과 가입 정보를 표시합니다.
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

      {/* 공개 가능한 기본 정보와 현재 조회 상태를 표시합니다. */}
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
              <span className="eyebrow">프로필 안내</span>
              <h2>공개 정보</h2>
            </div>
          </div>

          <div className="profile-notes">
            <div className="profile-note">
              <strong>현재 상태</strong>
              <p>
                {resolvedPreview
                  ? "세션 탐색 화면에서 가져온 프로필 정보를 표시 중입니다."
                  : loading
                    ? "공개 프로필을 불러오는 중입니다."
                    : error
                      ? error
                      : "직접 링크로 접근한 상태에서 공개 프로필 API로 정보를 확인했습니다."}
              </p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
