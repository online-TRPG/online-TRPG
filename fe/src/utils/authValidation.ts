export type AuthField =
  | "guestDisplayName"
  | "loginEmail"
  | "loginPassword"
  | "registerName"
  | "registerEmail"
  | "registerPassword"
  | "registerConfirmPassword";

export type AuthFieldErrors = Partial<Record<AuthField, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const minPasswordLength = 8;
const minNameLength = 2;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function validateGuestLogin(displayName: string): AuthFieldErrors {
  if (isBlank(displayName)) {
    return { guestDisplayName: "닉네임을 입력해주세요." };
  }

  return {};
}

function validateEmail(value: string): string | null {
  if (isBlank(value)) {
    return "이메일을 입력해주세요.";
  }

  if (!emailPattern.test(value.trim())) {
    return "올바른 이메일 형식이 아닙니다.";
  }

  return null;
}

export function validateLoginForm(email: string, password: string): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const emailError = validateEmail(email);

  if (emailError) {
    errors.loginEmail = emailError;
  }

  if (isBlank(password)) {
    errors.loginPassword = "비밀번호를 입력해주세요.";
  }

  return errors;
}

export function validateRegisterForm(
  name: string,
  email: string,
  password: string,
  confirmPassword: string,
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const emailError = validateEmail(email);

  if (isBlank(name)) {
    errors.registerName = "이름을 입력해주세요.";
  } else if (name.trim().length < minNameLength) {
    errors.registerName = `이름은 ${minNameLength}자 이상 입력해주세요.`;
  }

  if (emailError) {
    errors.registerEmail = emailError;
  }

  if (isBlank(password)) {
    errors.registerPassword = "비밀번호를 입력해주세요.";
  } else if (password.length < minPasswordLength) {
    errors.registerPassword = `비밀번호는 ${minPasswordLength}자 이상이어야 합니다.`;
  }

  if (isBlank(confirmPassword)) {
    errors.registerConfirmPassword = "비밀번호 확인을 입력해주세요.";
  } else if (password !== confirmPassword) {
    errors.registerConfirmPassword = "비밀번호가 일치하지 않습니다.";
  }

  return errors;
}

export function mapAuthServerErrorToFields(
  mode: "guest" | "login" | "register",
  error: string | null,
): AuthFieldErrors {
  if (!error) return {};

  if (mode === "guest" && error.includes("닉네임")) {
    return { guestDisplayName: error };
  }

  // 로그인 실패는 계정 존재 여부를 숨겨야 하므로 폼 공통 오류로 남긴다.
  if (mode !== "register") {
    return {};
  }

  if (error.includes("이메일")) {
    return { registerEmail: error };
  }

  if (error.includes("비밀번호")) {
    return { registerPassword: error };
  }

  if (error.includes("이름")) {
    return { registerName: error };
  }

  return {};
}
