/*
 * LoginPage
 * 역할: 게스트 입장, 이메일 로그인, 회원가입, OAuth 로그인을 한 화면에서 처리합니다.
 * 읽는 순서:
 * 1) LoginMode: 현재 표시할 폼 종류
 * 2) LoginPageProps: 인증 훅에서 받은 상태와 로그인/가입 콜백
 * 3) form state: 입력값과 필드별 검증 에러
 * 4) submit 함수들: 각 모드의 유효성 검사 후 부모 콜백 호출
 * 5) JSX: 브랜드 영역, 모드 탭, 게스트/로그인/회원가입 폼
 */
import { FormEvent, useState } from "react";
import logoImage from "../assets/images/Logo.webp";
import { Icon } from "../components/Icon";
import type { AuthNotice } from "../hooks/useAuth";
import "./LoginPage.css";
import {
  mapAuthServerErrorToFields,
  validateGuestLogin,
  validateLoginForm,
  validateRegisterForm,
  type AuthField,
  type AuthFieldErrors,
} from "../utils/authValidation";

// 현재 화면에 보여줄 인증 폼 종류입니다.
type LoginMode = "guest" | "login" | "register";

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface LoginPageProps {
  busy: boolean;
  error: string | null;
  notice: AuthNotice | null;
  onGuestLogin: (displayName: string) => void;
  onEmailLogin: (email: string, password: string) => void;
  onRegister: (email: string, password: string, name: string) => void;
  onOAuthLogin: (provider: "kakao" | "discord") => void;
  onClearFeedback: () => void;
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function LoginPage({
  busy,
  error,
  notice,
  onGuestLogin,
  onEmailLogin,
  onRegister,
  onOAuthLogin,
  onClearFeedback,
}: LoginPageProps) {
  // 입력 폼 상태: 선택된 로그인 방식과 각 입력값을 관리합니다.
  const [mode, setMode] = useState<LoginMode>("guest");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  // 서버 에러를 필드별 메시지로 변환해 클라이언트 검증 에러와 합칩니다.
  const serverFieldErrors = mapAuthServerErrorToFields(mode, error);
  const visibleFieldErrors = { ...fieldErrors, ...serverFieldErrors };
  const formError = error && Object.keys(serverFieldErrors).length === 0 ? error : null;

  function selectMode(nextMode: LoginMode) {
    setMode(nextMode);
    setFieldErrors({});
    onClearFeedback();
  }

  function clearFieldError(field: AuthField) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    onClearFeedback();
  }

  function hasFieldErrors(errors: AuthFieldErrors): boolean {
    return Object.keys(errors).length > 0;
  }

  // 게스트 입장 폼 제출: 닉네임 검증 후 부모 콜백을 호출합니다.
  function submitGuest(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateGuestLogin(displayName);
    setFieldErrors(nextErrors);
    onClearFeedback();
    if (hasFieldErrors(nextErrors)) return;

    onGuestLogin(displayName);
  }

  // 이메일 로그인 폼 제출: 이메일/비밀번호 검증 후 부모 콜백을 호출합니다.
  function submitLogin(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateLoginForm(email, password);
    setFieldErrors(nextErrors);
    onClearFeedback();
    if (hasFieldErrors(nextErrors)) return;

    onEmailLogin(email, password);
  }

  // 회원가입 폼 제출: 이름/이메일/비밀번호/확인값 검증 후 부모 콜백을 호출합니다.
  function submitRegister(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateRegisterForm(name, email, password, confirmPassword);
    setFieldErrors(nextErrors);
    onClearFeedback();
    if (hasFieldErrors(nextErrors)) return;

    onRegister(email, password, name);
  }
  return (
    <main className="login-page">
      {/* 로그인 전체 화면 컨테이너입니다. */}
      <section className="login-shell" aria-label="로그인 화면">
        {/* 서비스 로고와 브랜드 카피 영역입니다. */}
        <div className="brand-mark">
          <img src={logoImage} alt="모두의 TRPG" className="brand-mark-image" />
        </div>

        {notice ? (
          <div className={`login-alert ${notice.kind}`} role="status" aria-live="polite">
            {notice.message}
          </div>
        ) : null}

        <div className="login-tabs" role="tablist" aria-label="로그인 방식 선택">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "guest"}
            className={mode === "guest" ? "active" : ""}
            onClick={() => selectMode("guest")}
          >
            게스트
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => selectMode("login")}
          >
            로그인
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => selectMode("register")}
          >
            회원가입
          </button>
        </div>

        {/* 게스트 입장 폼: 계정 없이 표시 이름만 입력합니다. */}
        {mode === "guest" ? (
          <form className="login-card login-card-fantasy" onSubmit={submitGuest} noValidate>
            <label htmlFor="displayName">닉네임</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                clearFieldError("guestDisplayName");
              }}
              placeholder="닉네임을 입력하세요"
              maxLength={50}
              autoComplete="nickname"
              aria-invalid={Boolean(visibleFieldErrors.guestDisplayName)}
              aria-describedby={visibleFieldErrors.guestDisplayName ? "guest-display-name-error" : undefined}
            />
            {visibleFieldErrors.guestDisplayName ? (
              <p id="guest-display-name-error" className="field-error" role="alert">
                {visibleFieldErrors.guestDisplayName}
              </p>
            ) : null}
            <button type="submit" disabled={busy}>
              <Icon name="enter" />
              {busy ? "입장 중..." : "게스트로 시작"}
            </button>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          </form>
        ) : null}

        {/* 이메일 로그인 폼: 일반 계정으로 접속합니다. */}
        {mode === "login" ? (
          <form className="login-card login-card-fantasy" onSubmit={submitLogin} noValidate>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError("loginEmail");
              }}
              placeholder=""
              autoComplete="email"
              aria-invalid={Boolean(visibleFieldErrors.loginEmail)}
              aria-describedby={visibleFieldErrors.loginEmail ? "login-email-error" : undefined}
            />
            {visibleFieldErrors.loginEmail ? (
              <p id="login-email-error" className="field-error" role="alert">
                {visibleFieldErrors.loginEmail}
              </p>
            ) : null}

            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("loginPassword");
              }}
              placeholder=""
              autoComplete="current-password"
              aria-invalid={Boolean(visibleFieldErrors.loginPassword)}
              aria-describedby={visibleFieldErrors.loginPassword ? "login-password-error" : undefined}
            />
            {visibleFieldErrors.loginPassword ? (
              <p id="login-password-error" className="field-error" role="alert">
                {visibleFieldErrors.loginPassword}
              </p>
            ) : null}

            <button type="submit" className="login-submit-muted" disabled={busy}>
              {busy ? "로그인 중..." : "로그인"}
            </button>

            <div className="login-divider">
              <span />
              <strong>간편 로그인</strong>
              <span />
            </div>

            <div className="social-row social-row-fantasy">
              <button type="button" className="social-kakao" onClick={() => onOAuthLogin("kakao")} disabled={busy}>
                kakao
              </button>
              <button
                type="button"
                className="social-discord"
                onClick={() => onOAuthLogin("discord")}
                disabled={busy}
              >
                Discord
              </button>
            </div>

            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          </form>
        ) : null}

        {/* 회원가입 폼: 새 로컬 계정을 만듭니다. */}
        {mode === "register" ? (
          <form className="login-card login-card-fantasy" onSubmit={submitRegister} noValidate>
            <label htmlFor="reg-name">이름</label>
            <input
              id="reg-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFieldError("registerName");
              }}
              placeholder="이름을 입력하세요"
              minLength={2}
              maxLength={10}
              aria-invalid={Boolean(visibleFieldErrors.registerName)}
              aria-describedby={visibleFieldErrors.registerName ? "register-name-error" : undefined}
            />
            {visibleFieldErrors.registerName ? (
              <p id="register-name-error" className="field-error" role="alert">
                {visibleFieldErrors.registerName}
              </p>
            ) : null}

            <label htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError("registerEmail");
              }}
              placeholder=""
              autoComplete="email"
              aria-invalid={Boolean(visibleFieldErrors.registerEmail)}
              aria-describedby={visibleFieldErrors.registerEmail ? "register-email-error" : undefined}
            />
            {visibleFieldErrors.registerEmail ? (
              <p id="register-email-error" className="field-error" role="alert">
                {visibleFieldErrors.registerEmail}
              </p>
            ) : null}

            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("registerPassword");
                clearFieldError("registerConfirmPassword");
              }}
              placeholder=""
              minLength={8}
              autoComplete="new-password"
              aria-invalid={Boolean(visibleFieldErrors.registerPassword)}
              aria-describedby={visibleFieldErrors.registerPassword ? "register-password-error" : undefined}
            />
            {visibleFieldErrors.registerPassword ? (
              <p id="register-password-error" className="field-error" role="alert">
                {visibleFieldErrors.registerPassword}
              </p>
            ) : null}

            <label htmlFor="reg-confirm-password">Password Confirm</label>
            <input
              id="reg-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearFieldError("registerConfirmPassword");
              }}
              placeholder=""
              minLength={8}
              autoComplete="new-password"
              aria-invalid={Boolean(visibleFieldErrors.registerConfirmPassword)}
              aria-describedby={
                visibleFieldErrors.registerConfirmPassword ? "register-confirm-password-error" : undefined
              }
            />
            {visibleFieldErrors.registerConfirmPassword ? (
              <p id="register-confirm-password-error" className="field-error" role="alert">
                {visibleFieldErrors.registerConfirmPassword}
              </p>
            ) : null}

            <button type="submit" disabled={busy}>
              <Icon name="spark" />
              {busy ? "가입 중..." : "회원가입"}
            </button>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          </form>
        ) : null}
      </section>
    </main>
  );
}
