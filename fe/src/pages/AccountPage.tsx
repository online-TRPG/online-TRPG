/*
 * AccountPage
 * 역할: 로그인한 사용자의 계정/인증 정보를 보여주는 개인 설정 페이지입니다.
 * 읽는 순서:
 * 1) AccountPageProps: 부모가 넘기는 사용자 정보와 이동/로그아웃/회원 탈퇴 콜백
 * 2) useCurrentProfile: 게스트/회원 상태를 반영한 최신 프로필 계산
 * 3) accountRows: 화면의 "계정 정보" 표에 출력할 행 데이터
 * 4) JSX: 상단 히어로, 계정 정보 카드, 연동 상태 카드, 회원 탈퇴 모달
 */
import { FormEvent, useState } from "react";
import type { AuthMode } from "../types/auth";
import { formatDate, useCurrentProfile } from "../hooks/useCurrentProfile";
import type { StoredUser } from "../types/session";
import "./ProfilePage.css";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface AccountPageProps {
  user: StoredUser;
  accessToken: string | null;
  authMode: AuthMode | null;
  busy: boolean;
  error: string | null;
  onLogout: () => void;
  onOpenProfile: () => void;
  onConvertGuestAccount: (email: string, password: string, name: string) => Promise<boolean>;
  onDeleteAccount: (password: string) => Promise<boolean>;
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function AccountPage({
  user,
  accessToken,
  authMode,
  busy,
  error,
  onLogout,
  onOpenProfile,
  onConvertGuestAccount,
  onDeleteAccount,
}: AccountPageProps) {
  // 게스트/회원 여부에 맞춰 서버 프로필과 로컬 사용자 정보를 합친 표시용 프로필입니다.
  const { effectiveProfile, loadingProfile, profileError } = useCurrentProfile({
    user,
    accessToken,
    authMode,
  });

  const canDeleteAccount = authMode === "member" && Boolean(accessToken);

  const [convertEmail, setConvertEmail] = useState("");
  const [convertName, setConvertName] = useState(user.displayName);
  const [convertPassword, setConvertPassword] = useState("");
  const [convertConfirmPassword, setConvertConfirmPassword] = useState("");
  const [convertFormError, setConvertFormError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteFormError, setDeleteFormError] = useState<string | null>(null);

  function openDeleteModal() {
    setDeletePassword("");
    setDeleteFormError(null);
    setIsDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setDeletePassword("");
    setDeleteFormError(null);
    setIsDeleteModalOpen(false);
  }

  async function submitDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!deletePassword) {
      setDeleteFormError("회원 탈퇴를 진행하려면 비밀번호를 입력해주세요.");
      return;
    }

    const deleted = await onDeleteAccount(deletePassword);
    if (!deleted) {
      return;
    }

    closeDeleteModal();
  }

  async function submitConvertGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!convertName.trim() || convertName.trim().length < 2 || convertName.trim().length > 10) {
      setConvertFormError("이름은 2자 이상 10자 이하여야 합니다.");
      return;
    }
    if (!convertEmail.trim()) {
      setConvertFormError("이메일을 입력해주세요.");
      return;
    }
    if (convertPassword.length < 8) {
      setConvertFormError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (convertPassword !== convertConfirmPassword) {
      setConvertFormError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    const converted = await onConvertGuestAccount(
      convertEmail,
      convertPassword,
      convertName,
    );
    if (converted) {
      setConvertPassword("");
      setConvertConfirmPassword("");
      setConvertFormError(null);
    }
  }

  // 계정 정보 카드의 <dl> 항목을 배열로 만들어 JSX를 짧게 유지합니다.
  const accountRows = [
    { label: "계정 ID", value: effectiveProfile.id },
    { label: "사용자 식별자", value: effectiveProfile.userId },
    { label: "이메일", value: effectiveProfile.email || "비공개 또는 미연동" },
    { label: "인증 제공자", value: effectiveProfile.authProvider },
    { label: "세션 상태", value: effectiveProfile.sessionAuthModeLabel },
    { label: "가입일", value: formatDate(effectiveProfile.createdAt) },
  ];

  // 여기부터 실제 화면 구조입니다.
  return (
    <main className="profile-page">
      {/* 상단 프로필/계정 요약 영역입니다. */}
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

      {/* 아래 그리드는 계정 상세 정보, 연동 상태, 위험 작업 카드를 나란히 배치합니다. */}
      <section className="profile-grid">
        {/* 내부 식별자, 이메일, 인증 제공자 등 민감한 계정 정보를 보여주는 카드입니다. */}
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

        {authMode === "guest" ? (
          <article className="profile-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Save</span>
                <h2>게스트 계정 저장</h2>
              </div>
            </div>

            <form className="modal-form" onSubmit={submitConvertGuest}>
              <p className="profile-muted-text">
                게스트 데이터는 7일 뒤 정리됩니다. 캐릭터와 진행 기록을 보존하려면 이메일 계정으로 저장하세요.
              </p>
              <label htmlFor="guest-convert-name">이름</label>
              <input
                id="guest-convert-name"
                value={convertName}
                onChange={(event) => {
                  setConvertName(event.target.value);
                  setConvertFormError(null);
                }}
                minLength={2}
                maxLength={10}
                disabled={busy}
              />
              <label htmlFor="guest-convert-email">Email</label>
              <input
                id="guest-convert-email"
                type="email"
                value={convertEmail}
                onChange={(event) => {
                  setConvertEmail(event.target.value);
                  setConvertFormError(null);
                }}
                autoComplete="email"
                disabled={busy}
              />
              <label htmlFor="guest-convert-password">Password</label>
              <input
                id="guest-convert-password"
                type="password"
                value={convertPassword}
                onChange={(event) => {
                  setConvertPassword(event.target.value);
                  setConvertFormError(null);
                }}
                autoComplete="new-password"
                disabled={busy}
              />
              <label htmlFor="guest-convert-confirm-password">Password Confirm</label>
              <input
                id="guest-convert-confirm-password"
                type="password"
                value={convertConfirmPassword}
                onChange={(event) => {
                  setConvertConfirmPassword(event.target.value);
                  setConvertFormError(null);
                }}
                autoComplete="new-password"
                disabled={busy}
              />
              {convertFormError ? <p className="profile-inline-error">{convertFormError}</p> : null}
              <button type="submit" disabled={busy}>
                회원 계정으로 저장
              </button>
            </form>
          </article>
        ) : null}

        {/* 현재 로그인 방식과 동기화 상태를 설명하는 카드입니다. */}
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
              <strong>계정 보안</strong>
              <p>비밀번호 변경, OAuth 추가 연동/해제는 다음 단계에서 확장할 수 있습니다.</p>
            </div>
          </div>
        </article>

        {/* 회원 탈퇴는 되돌리기 어려운 작업이라 별도 위험 영역으로 분리합니다. */}
        <article className="profile-card profile-danger-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Danger</span>
              <h2>회원 탈퇴</h2>
            </div>
          </div>

          <div className="profile-notes">
            <div className="profile-note">
              <strong>계정 삭제</strong>
              <p>
                탈퇴하면 현재 계정으로 다시 로그인할 수 없습니다. 호스트인 모집 중 세션은 해산되고,
                일반 참가자로 참여 중인 활성 세션에서는 나간 상태로 정리됩니다.
              </p>
            </div>
            <button
              type="button"
              className="profile-danger-button"
              onClick={openDeleteModal}
              disabled={busy || !canDeleteAccount}
            >
              회원 탈퇴
            </button>
            {!canDeleteAccount ? (
              <p className="profile-muted-text">게스트 계정은 로그아웃으로 세션을 종료해주세요.</p>
            ) : null}
          </div>
        </article>
      </section>

      {profileError || error ? <p className="panel-error">{profileError ?? error}</p> : null}

      {isDeleteModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDeleteModal}>
          <div
            className="modal-card profile-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Delete Account</span>
                <h2 id="account-delete-title">정말 탈퇴하시겠습니까?</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeDeleteModal}>
                닫기
              </button>
            </div>

            <form className="modal-form" onSubmit={submitDeleteAccount}>
              <p className="profile-modal-warning">
                탈퇴 후에는 계정 복구가 어렵습니다. 진행 중이거나 일시정지된 호스트 세션이 있으면
                서버에서 탈퇴를 막습니다.
              </p>
              <label htmlFor="account-delete-password">비밀번호</label>
              <input
                id="account-delete-password"
                type="password"
                value={deletePassword}
                onChange={(event) => {
                  setDeletePassword(event.target.value);
                  setDeleteFormError(null);
                }}
                autoComplete="current-password"
                disabled={busy}
                autoFocus
              />
              {deleteFormError || error ? (
                <p className="profile-inline-error">{deleteFormError ?? error}</p>
              ) : null}
              <button type="submit" className="profile-danger-submit" disabled={busy}>
                탈퇴하기
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
