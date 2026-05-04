import { FormEvent, useState } from "react";
import logoImage from "../assets/images/Logo.webp";
import { Icon } from "../components/Icon";

type LoginMode = "guest" | "login" | "register";

interface LoginPageProps {
  busy: boolean;
  error: string | null;
  onGuestLogin: (displayName: string) => void;
  onEmailLogin: (email: string, password: string) => void;
  onRegister: (email: string, password: string, name: string) => void;
  onOAuthLogin: (provider: "kakao" | "discord") => void;
}

export function LoginPage({
  busy,
  error,
  onGuestLogin,
  onEmailLogin,
  onRegister,
  onOAuthLogin,
}: LoginPageProps) {
  const [mode, setMode] = useState<LoginMode>("guest");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  function submitGuest(e: FormEvent) {
    e.preventDefault();
    onGuestLogin(displayName);
  }

  function submitLogin(e: FormEvent) {
    e.preventDefault();
    onEmailLogin(email, password);
  }

  function submitRegister(e: FormEvent) {
    e.preventDefault();
    onRegister(email, password, name);
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-label="로그인 화면">
        <div className="brand-mark">
          <img src={logoImage} alt="모두의 TRPG" className="brand-mark-image" />
        </div>

        <div className="login-tabs" role="tablist" aria-label="로그인 방식 선택">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "guest"}
            className={mode === "guest" ? "active" : ""}
            onClick={() => setMode("guest")}
          >
            게스트
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            로그인
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            회원가입
          </button>
        </div>

        {mode === "guest" ? (
          <form className="login-card login-card-fantasy" onSubmit={submitGuest}>
            <label htmlFor="displayName">닉네임</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="닉네임을 입력하세요"
              maxLength={50}
              autoComplete="nickname"
            />
            <button type="submit" disabled={busy}>
              <Icon name="enter" />
              {busy ? "입장 중..." : "게스트로 시작"}
            </button>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        ) : null}

        {mode === "login" ? (
          <form className="login-card login-card-fantasy" onSubmit={submitLogin}>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=""
              autoComplete="email"
            />

            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=""
              autoComplete="current-password"
            />

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

            {error ? <p className="form-error">{error}</p> : null}
          </form>
        ) : null}

        {mode === "register" ? (
          <form className="login-card login-card-fantasy" onSubmit={submitRegister}>
            <label htmlFor="reg-name">이름</label>
            <input
              id="reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              minLength={2}
              maxLength={10}
            />

            <label htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=""
              autoComplete="email"
            />

            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=""
              minLength={8}
              autoComplete="new-password"
            />

            <button type="submit" disabled={busy}>
              <Icon name="spark" />
              {busy ? "가입 중..." : "회원가입"}
            </button>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        ) : null}
      </section>
    </main>
  );
}
