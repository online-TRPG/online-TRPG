import { FormEvent, useState } from "react";
import logoImage from "../assets/images/Logo.webp";
import { Icon } from "../components/Icon";
import type { AuthNotice } from "../hooks/useAuth";
import {
  mapAuthServerErrorToFields,
  validateGuestLogin,
  validateLoginForm,
  validateRegisterForm,
  type AuthField,
  type AuthFieldErrors,
} from "../utils/authValidation";

type LoginMode = "guest" | "login" | "register";

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
  const [mode, setMode] = useState<LoginMode>("guest");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
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

  function submitGuest(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateGuestLogin(displayName);
    setFieldErrors(nextErrors);
    onClearFeedback();
    if (hasFieldErrors(nextErrors)) return;

    onGuestLogin(displayName);
  }

  function submitLogin(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateLoginForm(email, password);
    setFieldErrors(nextErrors);
    onClearFeedback();
    if (hasFieldErrors(nextErrors)) return;

    onEmailLogin(email, password);
  }

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
      <section className="login-shell" aria-label="로그인 화면">
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
