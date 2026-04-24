import { FormEvent, useState } from "react";
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
      <section className="login-shell" aria-label="로그인">
        <div className="brand-mark">
          <Icon name="logo" />
        </div>
        <h1>모두의 TRPG</h1>
        <p>모험의 세계로 입장하세요.</p>

        <div className="login-tabs" role="tablist">
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

        {mode === "guest" && (
          <form className="login-card" onSubmit={submitGuest}>
            <label htmlFor="displayName">모험가 이름</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="예: 던전 마스터"
              maxLength={50}
              autoComplete="nickname"
            />
            <button type="submit" disabled={busy}>
              <Icon name="enter" />
              {busy ? "입장 중..." : "게스트로 입장"}
            </button>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        )}

        {mode === "login" && (
          <form className="login-card" onSubmit={submitLogin}>
            <label htmlFor="login-email">이메일</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              autoComplete="email"
            />
            <label htmlFor="login-password">비밀번호</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button type="submit" disabled={busy}>
              <Icon name="enter" />
              {busy ? "로그인 중..." : "로그인"}
            </button>
            <div className="login-divider">
              <span />
              <strong>또는 다음으로 계속</strong>
              <span />
            </div>
            <div className="social-row">
              <button type="button" onClick={() => onOAuthLogin("kakao")} disabled={busy}>
                Kakao
              </button>
              <button type="button" onClick={() => onOAuthLogin("discord")} disabled={busy}>
                Discord
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        )}

        {mode === "register" && (
          <form className="login-card" onSubmit={submitRegister}>
            <label htmlFor="reg-name">닉네임</label>
            <input
              id="reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              minLength={2}
              maxLength={10}
            />
            <label htmlFor="reg-email">이메일</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              autoComplete="email"
            />
            <label htmlFor="reg-password">비밀번호 (8자 이상)</label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
            <button type="submit" disabled={busy}>
              <Icon name="spark" />
              {busy ? "가입 중..." : "회원가입"}
            </button>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        )}
      </section>
    </main>
  );
}
