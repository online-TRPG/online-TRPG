import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { SessionInviteResponseDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionInviteService {
  constructor(private readonly prisma: PrismaService) {}

  async generateCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const existing = await this.prisma.session.findUnique({
        where: { inviteCode: code },
      });

      if (!existing) {
        return code;
      }
    }

    throw new ConflictException("Failed to allocate a unique invite code.");
  }

  async getSessionByCode(inviteCode: string) {
    const session = await this.prisma.session.findUnique({
      where: { inviteCode: this.normalizeCode(inviteCode) },
    });

    if (!session) {
      throw new NotFoundException("Session with this invite code was not found.");
    }

    return session;
  }

  buildInviteInfo(params: {
    sessionId: string;
    inviteCode: string;
    appBaseUrl?: string | null;
  }): SessionInviteResponseDto {
    const appBaseUrl = params.appBaseUrl?.trim();
    return {
      sessionId: params.sessionId,
      inviteCode: params.inviteCode,
      shareUrl: appBaseUrl ? `${appBaseUrl}/join/${params.inviteCode}` : null,
    };
  }

  private normalizeCode(inviteCode: string): string {
    return inviteCode.trim().toUpperCase();
  }
}
