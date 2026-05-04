import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getPublicProfile } from "../services/api";
import type { User } from "../types/session";
import { buildPublicProfilePath } from "../utils/routes";

interface PublicProfilePageProps {
  publicId: string;
  previewUser: User | null;
  onOpenOwnProfile: () => void;
}

export function PublicProfilePage({ publicId, previewUser, onOpenOwnProfile }: PublicProfilePageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedPreview = previewUser?.publicId === publicId ? previewUser : null;
  const [profile, setProfile] = useState<User | null>(resolvedPreview);
  const [loading, setLoading] = useState(!resolvedPreview);
  const [error, setError] = useState<string | null>(null);

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

  const effectiveProfile =
    profile ?? {
      id: "",
      publicId,
      userId: "",
      email: null,
      name: "알 수 없는 사용자",
      nickname: "미확인",
      authProvider: "LOCAL" as User["authProvider"],
      displayName: publicId,
      createdAt: "",
    };
  const canonicalPath = buildPublicProfilePath(effectiveProfile);

  useEffect(() => {
    if (!effectiveProfile.publicId) return;
    if (!resolvedPreview && !profile) return;
    if (location.pathname === canonicalPath) return;
    navigate(canonicalPath, {
      replace: true,
      state: resolvedPreview ? { profilePreview: resolvedPreview } : undefined,
    });
  }, [canonicalPath, effectiveProfile.publicId, location.pathname, navigate, profile, resolvedPreview]);

  const profileRows = [
    { label: "표시 이름", value: effectiveProfile.displayName },
    { label: "닉네임", value: effectiveProfile.nickname || "-" },
    { label: "이름", value: effectiveProfile.name || "-" },
    { label: "프로필 주소", value: canonicalPath },
    { label: "회원 유형", value: effectiveProfile.authProvider },
    { label: "공개 대상", value: "세션 탐색 중 확인 가능한 기본 프로필" },
  ];

  return (
    <main className="profile-page">
      <section className="profile-hero">
        <div className="profile-hero-main">
          <span className="eyebrow">Public profile</span>
          <div className="profile-hero-header">
            <div className="avatar avatar-xl">{effectiveProfile.displayName.slice(0, 1)}</div>
            <div>
              <h1>{effectiveProfile.displayName}</h1>
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
