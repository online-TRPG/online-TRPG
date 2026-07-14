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
import { AuthProvider } from "@trpg/shared-types/frontend";
import type { AuthMode } from "../types/auth";
import type { DeleteAccountCredential } from "../services/authApi";
import { changePassword } from "../services/authApi";
import {
  clearStoredDeleteReauthTicket,
  loadStoredDeleteReauthTicket,
} from "../services/storage";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
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
  onDeleteAccount: (credential: DeleteAccountCredential) => Promise<boolean>;
  onBeginOAuthDeleteReauth: (provider: "kakao" | "discord") => void;
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
  onBeginOAuthDeleteReauth,
}: AccountPageProps) {
  // 게스트/회원 여부에 맞춰 서버 프로필과 로컬 사용자 정보를 합친 표시용 프로필입니다.
  const { effectiveProfile, loadingProfile, profileError } = useCurrentProfile({
    user,
    accessToken,
    authMode,
  });

  const canDeleteAccount = Boolean(authMode);

  const [convertEmail, setConvertEmail] = useState("");
  const [convertName, setConvertName] = useState(user.displayName);
  const [convertPassword, setConvertPassword] = useState("");
  const [convertConfirmPassword, setConvertConfirmPassword] = useState("");
  const [convertFormError, setConvertFormError] = useState<string | null>(null);
  const [deleteReauthTicket] = useState(() => loadStoredDeleteReauthTicket());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(Boolean(deleteReauthTicket));
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteFormError, setDeleteFormError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const deleteDialogFocus = useDialogFocusTrap<HTMLDivElement>(isDeleteModalOpen, closeDeleteModal);

  function openDeleteModal() {
    setDeletePassword("");
    setDeleteConfirmed(false);
    setDeleteFormError(null);
    setIsDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setDeletePassword("");
    setDeleteConfirmed(false);
    setDeleteFormError(null);
    setIsDeleteModalOpen(false);
  }

  async function submitDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const provider = effectiveProfile.authProvider;
    let credential: DeleteAccountCredential;
    if (provider === AuthProvider.LOCAL) {
      if (!deletePassword) {
        setDeleteFormError("회원 탈퇴를 진행하려면 현재 비밀번호를 입력해주세요.");
        return;
      }
      credential = { password: deletePassword };
    } else if (provider === AuthProvider.GUEST) {
      if (!deleteConfirmed) {
        setDeleteFormError("계정과 게스트 데이터를 삭제한다는 내용을 확인해주세요.");
        return;
      }
      credential = { confirmation: "DELETE" };
    } else {
      if (!deleteReauthTicket) {
        setDeleteFormError("소셜 계정을 다시 인증해주세요.");
        return;
      }
      credential = { reauthTicket: deleteReauthTicket.ticket };
    }

    const deleted = await onDeleteAccount(credential);
    if (!deleted) {
      return;
    }

    clearStoredDeleteReauthTicket();
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

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    if (newPassword.length < 8) {
      setPasswordFeedback("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordFeedback("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setPasswordBusy(true);
    setPasswordFeedback(null);
    try {
      await changePassword(accessToken, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordFeedback("비밀번호를 변경했습니다. 보안을 위해 다시 로그인합니다.");
      onLogout();
    } catch (caught) {
      setPasswordFeedback(caught instanceof Error ? caught.message : "비밀번호를 변경하지 못했습니다.");
    } finally {
      setPasswordBusy(false);
    }
  }

  // 계정 정보 카드의 <dl> 항목을 배열로 만들어 JSX를 짧게 유지합니다.
  const accountRows = [
    { label: "이메일", value: effectiveProfile.email || "비공개 또는 미연동" },
    { label: "로그인 방식", value: effectiveProfile.authProviderLabel },
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
              <p>로그인 방식과 이메일 등 공개 프로필과 분리된 계정 정보를 관리합니다.</p>
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

        {effectiveProfile.authProvider === AuthProvider.LOCAL ? (
          <article className="profile-card">
            <div className="section-heading">
              <div><span className="eyebrow">비밀번호</span><h2>비밀번호 변경</h2></div>
            </div>
            <form className="modal-form" onSubmit={submitPasswordChange}>
              <label htmlFor="current-password">현재 비밀번호</label>
              <input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
              <label htmlFor="new-password">새 비밀번호</label>
              <input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
              <label htmlFor="new-password-confirm">새 비밀번호 확인</label>
              <input id="new-password-confirm" type="password" value={newPasswordConfirm} onChange={(event) => setNewPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={8} required />
              {passwordFeedback ? <p className="profile-inline-error" role="status">{passwordFeedback}</p> : null}
              <button type="submit" disabled={passwordBusy}>{passwordBusy ? "변경 중..." : "비밀번호 변경"}</button>
            </form>
          </article>
        ) : null}

        {/* 현재 로그인 방식과 동기화 상태를 설명하는 카드입니다. */}
        <article className="profile-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">계정 상태</span>
              <h2>연동 상태</h2>
            </div>
          </div>

          <div className="profile-notes">
            <div className="profile-note">
              <strong>현재 로그인 방식</strong>
              <p>
                {authMode === "guest"
                  ? "게스트로 접속 중이라 이메일, OAuth 연동, 비밀번호 변경 기능이 제한됩니다."
                  : `${effectiveProfile.authProviderLabel} 계정으로 접속 중입니다.`}
              </p>
            </div>
            <div className="profile-note">
              <strong>계정 동기화</strong>
              <p>{loadingProfile ? "서버에서 최신 계정 정보를 확인하는 중입니다." : "서버 기준 최신 계정 정보를 표시 중입니다."}</p>
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
                탈퇴하면 현재 계정으로 다시 로그인할 수 없습니다. 관리 중인 모집 세션은 해산되고,
                일반 참가자로 참여 중인 활성 세션에서는 나간 상태로 정리됩니다.
              </p>
            </div>
            <button
              type="button"
              className="profile-danger-button"
              onClick={openDeleteModal}
              disabled={busy || loadingProfile || !canDeleteAccount}
            >
              회원 탈퇴
            </button>
            {authMode === "guest" ? (
              <p className="profile-muted-text">게스트 계정도 여기서 저장된 캐릭터와 진행 기록을 함께 삭제할 수 있습니다.</p>
            ) : null}
          </div>
        </article>
      </section>

      {profileError || error ? <p className="panel-error">{profileError ?? error}</p> : null}

      {isDeleteModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDeleteModal}>
          <div
            ref={deleteDialogFocus.dialogRef}
            tabIndex={-1}
            className="modal-card profile-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-delete-title"
            onKeyDown={deleteDialogFocus.onDialogKeyDown}
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
                탈퇴 후에는 계정 복구가 어렵습니다. 진행 중이거나 대기 중인 관리 세션이 있으면
                서버에서 탈퇴를 막습니다.
              </p>
              {effectiveProfile.authProvider === AuthProvider.LOCAL ? (
                <>
                  <label htmlFor="account-delete-password">현재 비밀번호</label>
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
                </>
              ) : null}
              {effectiveProfile.authProvider === AuthProvider.GUEST ? (
                <label className="profile-delete-confirmation">
                  <input
                    type="checkbox"
                    checked={deleteConfirmed}
                    onChange={(event) => {
                      setDeleteConfirmed(event.target.checked);
                      setDeleteFormError(null);
                    }}
                  />
                  게스트 계정의 캐릭터와 진행 기록이 삭제되는 것을 확인했습니다.
                </label>
              ) : null}
              {effectiveProfile.authProvider === AuthProvider.KAKAO || effectiveProfile.authProvider === AuthProvider.DISCORD ? (
                deleteReauthTicket ? (
                  <p className="profile-muted-text">소셜 계정 재인증이 완료되었습니다. 5분 안에 탈퇴를 확정해주세요.</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => onBeginOAuthDeleteReauth(
                      effectiveProfile.authProvider === AuthProvider.KAKAO ? "kakao" : "discord",
                    )}
                    disabled={busy}
                  >
                    {effectiveProfile.authProviderLabel} 계정 다시 인증
                  </button>
                )
              ) : null}
              {deleteFormError || error ? (
                <p className="profile-inline-error">{deleteFormError ?? error}</p>
              ) : null}
              <button
                type="submit"
                className="profile-danger-submit"
                disabled={busy || (
                  (effectiveProfile.authProvider === AuthProvider.KAKAO || effectiveProfile.authProvider === AuthProvider.DISCORD) &&
                  !deleteReauthTicket
                )}
              >
                탈퇴하기
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
