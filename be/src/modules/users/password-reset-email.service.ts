import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

export interface PasswordResetEmailProvider {
  sendPasswordReset(input: { email: string; resetUrl: string; expiresInMinutes: number }): Promise<void>;
}

@Injectable()
export class PasswordResetEmailService implements PasswordResetEmailProvider {
  private readonly logger = new Logger(PasswordResetEmailService.name);

  async sendPasswordReset(input: { email: string; resetUrl: string; expiresInMinutes: number }): Promise<void> {
    const endpoint = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL?.trim();
    if (!endpoint) {
      throw new ServiceUnavailableException("비밀번호 재설정 메일 발송 서비스가 아직 구성되지 않았습니다.");
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            template: "password-reset",
            to: input.email,
            resetUrl: input.resetUrl,
            expiresInMinutes: input.expiresInMinutes,
          }),
        });
        if (!response.ok) throw new Error(`email provider returned ${response.status}`);
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Password reset email attempt ${attempt} failed.`);
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      }
    }
    void lastError;
    throw new ServiceUnavailableException("비밀번호 재설정 메일을 발송하지 못했습니다.");
  }
}
