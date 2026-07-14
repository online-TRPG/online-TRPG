import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AuthProvider as PrismaAuthProvider,
  ConnectionStatus as PrismaConnectionStatus,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  Prisma,
  SessionStatus as PrismaSessionStatus,
  User as PrismaUser,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import {
  AuthTokenResponseDto,
  ConvertGuestToLocalUserDto,
  ChangePasswordDto,
  ConfirmPasswordResetDto,
  CreateGuestUserDto,
  DeleteMeDto,
  EmailCheckResponseDto,
  LoginResponseDto,
  LoginUserDto,
  OAuthLoginDto,
  OAuthReauthResponseDto,
  OAuthUrlResponseDto,
  RegisterUserDto,
  RequestPasswordResetDto,
  UpdateUserProductProgressDto,
  UpdateMeDto,
  UserProductProgressResponseDto,
  UserResponseDto,
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { generateEightDigitPublicId } from "../../common/utils/public-id";
import { mapUser } from "../../common/mappers/domain.mapper";
import { badRequest, conflict, internalError } from "../../common/exceptions/domain-error";
import {
  createAccessToken,
  createReauthToken,
  createRefreshToken,
  getAccessTokenExpiresIn,
  getReauthTokenExpiresIn,
  getRefreshTokenExpiresAt,
  verifyToken,
} from "../../common/auth/token.utils";
import { PasswordResetEmailService } from "./password-reset-email.service";

type KakaoTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  id_token?: string;
};

type KakaoUserResponse = {
  id: number | string;
  kakao_account?: {
    email?: string;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    name?: string;
    profile?: {
      nickname?: string;
    };
  };
  properties?: {
    nickname?: string;
  };
};

type DiscordTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

type DiscordUserResponse = {
  id: string;
  username?: string;
  global_name?: string | null;
  email?: string | null;
  verified?: boolean;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordResetEmail: PasswordResetEmailService = new PasswordResetEmailService(),
  ) {}

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.getUserEntityOrThrow(userId);
    if (user.authProvider !== PrismaAuthProvider.LOCAL || !user.passwordHash) {
      throw new ForbiddenException("이 계정은 비밀번호 변경을 지원하지 않습니다.");
    }
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new ForbiddenException("현재 비밀번호가 일치하지 않습니다.");
    }
    const nextHash = await bcrypt.hash(dto.newPassword, 12);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: nextHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<void> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || user.authProvider !== PrismaAuthProvider.LOCAL || !user.passwordHash) return;

    const token = randomBytes(32).toString("base64url");
    const expiresInMinutes = 30;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: this.hashToken(token), expiresAt },
      }),
    ]);

    const baseUrl = (process.env.PASSWORD_RESET_BASE_URL ?? "http://localhost:5173/reset-password").replace(/\/$/, "");
    try {
      await this.passwordResetEmail.sendPasswordReset({
        email,
        resetUrl: `${baseUrl}?token=${encodeURIComponent(token)}`,
        expiresInMinutes,
      });
    } catch {
      // 계정 존재 여부와 발송 상태를 요청 응답으로 노출하지 않는다.
    }
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token.trim());
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const now = new Date();
    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <= now ||
      resetToken.user.deletedAt ||
      resetToken.user.authProvider !== PrismaAuthProvider.LOCAL
    ) {
      throw new BadRequestException("비밀번호 재설정 링크가 만료되었거나 이미 사용되었습니다.");
    }
    const nextHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException("비밀번호 재설정 링크가 만료되었거나 이미 사용되었습니다.");
      }
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash: nextHash } });
      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async createGuest(dto: CreateGuestUserDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.create({
      data: {
        publicId: await this.generateUserPublicId(),
        displayName: dto.displayName.trim(),
      },
    });

    return mapUser(user);
  }

  async register(dto: RegisterUserDto): Promise<UserResponseDto> {
    const email = dto.email.trim().toLowerCase();
    this.assertValidEmail(email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      this.throwDuplicateEmail();
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    let user: PrismaUser;
    try {
      user = await this.prisma.user.create({
        data: {
          publicId: await this.generateUserPublicId(),
          email,
          passwordHash,
          displayName: dto.name.trim(),
          authProvider: PrismaAuthProvider.LOCAL,
        },
      });
    } catch (error) {
      if (this.isEmailUniqueConstraintError(error)) {
        this.throwDuplicateEmail();
      }
      this.throwRegisterFailed();
    }

    return mapUser(user);
  }

  async convertGuestToLocal(
    userId: string,
    dto: ConvertGuestToLocalUserDto,
  ): Promise<{ body: LoginResponseDto; refreshToken: string }> {
    const email = dto.email.trim().toLowerCase();
    this.assertValidEmail(email);

    const guest = await this.getUserEntityOrThrow(userId);
    if (guest.authProvider !== PrismaAuthProvider.GUEST || guest.deletedAt) {
      throw new ForbiddenException("게스트 계정만 회원 계정으로 전환할 수 있습니다.");
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== userId) {
      this.throwDuplicateEmail();
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          email,
          passwordHash,
          displayName: dto.name.trim(),
          authProvider: PrismaAuthProvider.LOCAL,
        },
      });
      const ensuredUser = await this.ensureUserPublicId(user);
      const refreshToken = await this.issueRefreshToken(ensuredUser.id, ensuredUser.email);
      return {
        body: {
          accessToken: createAccessToken(ensuredUser.id, ensuredUser.email),
          tokenType: "Bearer",
          expiresIn: getAccessTokenExpiresIn(),
          user: mapUser(ensuredUser),
        },
        refreshToken,
      };
    } catch (error) {
      if (this.isEmailUniqueConstraintError(error)) {
        this.throwDuplicateEmail();
      }
      this.throwRegisterFailed();
    }
  }

  async checkEmail(email: string): Promise<EmailCheckResponseDto> {
    const normalizedEmail = email.trim().toLowerCase();
    this.assertValidEmail(normalizedEmail);
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    return {
      email: normalizedEmail,
      available: !existing,
    };
  }

  async login(dto: LoginUserDto): Promise<{ body: LoginResponseDto; refreshToken: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || user.deletedAt) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    try {
      const ensuredUser = await this.ensureUserPublicId(user);
      const refreshToken = await this.issueRefreshToken(ensuredUser.id, ensuredUser.email);
      return {
        body: {
          accessToken: createAccessToken(ensuredUser.id, ensuredUser.email),
          tokenType: "Bearer",
          expiresIn: getAccessTokenExpiresIn(),
          user: mapUser(ensuredUser),
        },
        refreshToken,
      };
    } catch {
      this.throwLoginTokenIssueFailed();
    }
  }

  async reissue(refreshToken: string | undefined): Promise<AuthTokenResponseDto> {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh Token이 유효하지 않습니다.");
    }

    const payload = verifyToken(refreshToken, "refresh");
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date() ||
      storedToken.user.deletedAt ||
      storedToken.userId !== payload.sub
    ) {
      throw new UnauthorizedException("Refresh Token이 유효하지 않습니다.");
    }

    return {
      accessToken: createAccessToken(storedToken.user.id, storedToken.user.email),
      tokenType: "Bearer",
      expiresIn: getAccessTokenExpiresIn(),
    };
  }

  async logout(userId: string, refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async getMe(userId: string): Promise<UserResponseDto> {
    return mapUser(await this.getUserEntityOrThrow(userId));
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<UserResponseDto> {
    const displayName = dto.displayName.trim();
    if (displayName.length < 2 || displayName.length > 10) {
      throw new BadRequestException("닉네임은 2자 이상 10자 이하여야 합니다.");
    }
    await this.getUserEntityOrThrow(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { displayName },
    });
    return mapUser(user);
  }

  async getProductProgress(userId: string): Promise<UserProductProgressResponseDto> {
    await this.getUserEntityOrThrow(userId);
    const progress = await this.prisma.userProductProgress.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return this.mapProductProgress(progress);
  }

  async updateProductProgress(
    userId: string,
    dto: UpdateUserProductProgressDto,
  ): Promise<UserProductProgressResponseDto> {
    await this.getUserEntityOrThrow(userId);
    const current = await this.prisma.userProductProgress.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const now = new Date();

    if (dto.action === "dismiss_coachmark") {
      const coachmark = dto.coachmark?.trim();
      if (!coachmark) {
        throw new BadRequestException("닫을 안내 항목이 필요합니다.");
      }
      const dismissedCoachmarks = current.dismissedCoachmarks.includes(coachmark)
        ? current.dismissedCoachmarks
        : [...current.dismissedCoachmarks, coachmark];
      const progress = await this.prisma.userProductProgress.update({
        where: { userId },
        data: { dismissedCoachmarks },
      });
      return this.mapProductProgress(progress);
    }

    const data =
      dto.action === "start_tutorial"
        ? { tutorialStartedAt: current.tutorialStartedAt ?? now, onboardingVersion: 1 }
        : dto.action === "dismiss_tutorial"
          ? { dismissedAt: current.dismissedAt ?? now }
          : dto.action === "complete_tutorial"
            ? { completedAt: current.completedAt ?? now }
            : { firstActionAt: current.firstActionAt ?? now };
    const progress = await this.prisma.userProductProgress.update({
      where: { userId },
      data,
    });
    return this.mapProductProgress(progress);
  }

  async getPublicProfile(publicId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        publicId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${publicId} was not found.`);
    }

    return mapUser(await this.ensureUserPublicId(user));
  }

  private mapProductProgress(progress: {
    onboardingVersion: number;
    tutorialStartedAt: Date | null;
    firstActionAt: Date | null;
    completedAt: Date | null;
    dismissedAt: Date | null;
    dismissedCoachmarks: string[];
  }): UserProductProgressResponseDto {
    return {
      onboardingVersion: progress.onboardingVersion,
      tutorialStartedAt: progress.tutorialStartedAt?.toISOString() ?? null,
      firstActionAt: progress.firstActionAt?.toISOString() ?? null,
      completedAt: progress.completedAt?.toISOString() ?? null,
      dismissedAt: progress.dismissedAt?.toISOString() ?? null,
      dismissedCoachmarks: progress.dismissedCoachmarks,
    };
  }

  async deleteMe(userId: string, dto: DeleteMeDto): Promise<void> {
    const user = await this.getUserEntityOrThrow(userId);
    await this.assertDeleteAuthorization(user, dto);

    await this.prisma.$transaction(async (tx) => {
      const blockingHostSession = await tx.session.findFirst({
        where: {
          hostUserId: userId,
          status: {
            in: [PrismaSessionStatus.PLAYING, PrismaSessionStatus.PAUSED],
          },
        },
        select: {
          id: true,
        },
      });

      if (blockingHostSession) {
        throw new ConflictException(
          "진행 중이거나 대기 중인 관리 세션이 있어 회원 탈퇴를 진행할 수 없습니다.",
        );
      }

      const now = new Date();
      const hostedRecruitingSessions = await tx.session.findMany({
        where: {
          hostUserId: userId,
          status: PrismaSessionStatus.RECRUITING,
        },
        select: {
          id: true,
        },
      });
      const hostedRecruitingSessionIds = hostedRecruitingSessions.map((session) => session.id);

      if (hostedRecruitingSessionIds.length > 0) {
        // 세션 관리자가 사라진 모집 세션은 운영할 주체가 없으므로 해산하고, 참가자 상태도 함께 닫아 둔다.
        await tx.sessionCharacter.deleteMany({
          where: {
            sessionId: { in: hostedRecruitingSessionIds },
          },
        });
        await tx.sessionParticipant.updateMany({
          where: {
            sessionId: { in: hostedRecruitingSessionIds },
            status: PrismaParticipantStatus.JOINED,
          },
          data: {
            status: PrismaParticipantStatus.LEFT,
            leftAt: now,
            connectionStatus: PrismaConnectionStatus.OFFLINE,
            isReady: false,
            readyAt: null,
          },
        });
        await tx.session.updateMany({
          where: {
            id: { in: hostedRecruitingSessionIds },
          },
          data: {
            status: PrismaSessionStatus.DISBANDED,
          },
        });
      }

      const joinedActiveSessions = await tx.sessionParticipant.findMany({
        where: {
          userId,
          status: PrismaParticipantStatus.JOINED,
          role: { not: PrismaParticipantRole.HOST },
          session: {
            is: {
              hostUserId: { not: userId },
              status: {
                in: [
                  PrismaSessionStatus.RECRUITING,
                  PrismaSessionStatus.PLAYING,
                  PrismaSessionStatus.PAUSED,
                ],
              },
            },
          },
        },
        select: {
          sessionId: true,
        },
      });
      const joinedActiveSessionIds = joinedActiveSessions.map((participant) => participant.sessionId);

      if (joinedActiveSessionIds.length > 0) {
        // 일반 참가자는 계정 탈퇴 후에도 세션에 남아 보이면 안 되므로, 진행 중/대기 중 세션에서도 퇴장 상태로 정리한다.
        await tx.sessionCharacter.deleteMany({
          where: {
            userId,
            sessionId: { in: joinedActiveSessionIds },
          },
        });
        await tx.sessionParticipant.updateMany({
          where: {
            userId,
            sessionId: { in: joinedActiveSessionIds },
            status: PrismaParticipantStatus.JOINED,
            role: { not: PrismaParticipantRole.HOST },
          },
          data: {
            status: PrismaParticipantStatus.LEFT,
            leftAt: now,
            connectionStatus: PrismaConnectionStatus.OFFLINE,
            isReady: false,
            readyAt: null,
          },
        });
      }

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.user.update({
        where: { id: userId },
        data: { deletedAt: now },
      });
    });
  }

  async reauthenticateOAuth(
    userId: string,
    provider: "KAKAO" | "DISCORD",
    dto: OAuthLoginDto,
  ): Promise<OAuthReauthResponseDto> {
    const user = await this.getUserEntityOrThrow(userId);
    const expectedProvider = provider === "KAKAO" ? PrismaAuthProvider.KAKAO : PrismaAuthProvider.DISCORD;
    if (user.authProvider !== expectedProvider) {
      throw new ForbiddenException("현재 로그인 제공자와 재인증 제공자가 일치하지 않습니다.");
    }

    const linkedAccount = await this.prisma.socialAccount.findFirst({
      where: { userId, provider: expectedProvider },
      select: { providerUserId: true },
    });
    if (!linkedAccount) {
      throw new ForbiddenException("연결된 소셜 계정을 확인할 수 없습니다.");
    }

    let providerUserId: string;
    if (provider === "KAKAO") {
      const token = await this.requestKakaoToken(dto.code.trim(), dto.redirectUri.trim());
      providerUserId = String((await this.requestKakaoUser(token.accessToken)).id).trim();
    } else {
      const token = await this.requestDiscordToken(dto.code.trim(), dto.redirectUri.trim());
      providerUserId = (await this.requestDiscordUser(token.accessToken)).id.trim();
    }
    if (providerUserId !== linkedAccount.providerUserId) {
      throw new ForbiddenException("현재 계정과 재인증한 소셜 계정이 일치하지 않습니다.");
    }

    return {
      ticket: createReauthToken(userId, provider),
      expiresIn: getReauthTokenExpiresIn(),
    };
  }

  private async assertDeleteAuthorization(user: PrismaUser, dto: DeleteMeDto): Promise<void> {
    if (user.authProvider === PrismaAuthProvider.LOCAL) {
      if (!user.passwordHash || !dto.password) {
        throw new ForbiddenException("현재 비밀번호를 입력해주세요.");
      }
      const matches = await bcrypt.compare(dto.password, user.passwordHash);
      if (!matches) throw new ForbiddenException("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (user.authProvider === PrismaAuthProvider.GUEST) {
      if (dto.confirmation !== "DELETE") {
        throw new ForbiddenException("게스트 계정 삭제 확인이 필요합니다.");
      }
      return;
    }

    if (!dto.reauthTicket) {
      throw new ForbiddenException("소셜 계정 재인증이 필요합니다.");
    }
    const payload = verifyToken(dto.reauthTicket, "reauth");
    const expectedProvider = user.authProvider === PrismaAuthProvider.KAKAO ? "KAKAO" : "DISCORD";
    if (payload.sub !== user.id || payload.provider !== expectedProvider) {
      throw new ForbiddenException("소셜 계정 재인증 정보가 일치하지 않습니다.");
    }
  }

  getOAuthUrl(provider: "KAKAO" | "DISCORD", redirectUri: string, state?: string): OAuthUrlResponseDto {
    const trimmedRedirectUri = redirectUri.trim();
    if (!trimmedRedirectUri) {
      throw new BadRequestException("redirectUri가 필요합니다.");
    }

    const encodedRedirectUri = encodeURIComponent(trimmedRedirectUri);
    const encodedState = state ? `&state=${encodeURIComponent(state)}` : "";
    if (provider === "KAKAO") {
      return {
        provider,
        authUrl: `https://kauth.kakao.com/oauth/authorize?client_id=${this.getRequiredEnv("KAKAO_REST_API_KEY")}&redirect_uri=${encodedRedirectUri}&response_type=code${encodedState}`,
      };
    }

    const params = new URLSearchParams({
      client_id: this.getRequiredEnv("DISCORD_CLIENT_ID"),
      response_type: "code",
      redirect_uri: trimmedRedirectUri,
      scope: "identify email",
    });
    if (state) {
      params.set("state", state);
    }

    return {
      provider,
      authUrl: `https://discord.com/oauth2/authorize?${params.toString()}`,
    };
  }

  async oauthLogin(
    provider: "KAKAO" | "DISCORD",
    dto: OAuthLoginDto,
  ): Promise<{ body: LoginResponseDto; refreshToken: string }> {
    if (provider === "KAKAO") {
      return this.kakaoLogin(dto);
    }

    return this.discordLogin(dto);
  }

  async getUserEntityOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException(`User ${userId} was not found.`);
    }

    return this.ensureUserPublicId(user);
  }

  private async issueRefreshToken(userId: string, email: string | null): Promise<string> {
    const refreshToken = createRefreshToken(userId, email);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: getRefreshTokenExpiresAt(),
      },
    });
    return refreshToken;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async kakaoLogin(dto: OAuthLoginDto): Promise<{ body: LoginResponseDto; refreshToken: string }> {
    const code = dto.code.trim();
    const redirectUri = dto.redirectUri.trim();
    if (!code || !redirectUri) {
      throw new BadRequestException("code와 redirectUri가 필요합니다.");
    }

    const token = await this.requestKakaoToken(code, redirectUri);
    const kakaoUser = await this.requestKakaoUser(token.accessToken);
    const providerUserId = String(kakaoUser.id).trim();

    // 카카오는 이메일 동의가 없을 수 있으므로, 로그인 식별은 항상 providerUserId를 기준으로 한다.
    const email = this.getVerifiedKakaoEmail(kakaoUser);
    const displayName = this.getKakaoDisplayName(kakaoUser, providerUserId);
    const user = await this.findOrCreateKakaoUser(providerUserId, email, displayName);
    const refreshToken = await this.issueRefreshToken(user.id, user.email);

    return {
      body: {
        accessToken: createAccessToken(user.id, user.email),
        tokenType: "Bearer",
        expiresIn: getAccessTokenExpiresIn(),
        user: mapUser(user),
      },
      refreshToken,
    };
  }

  private async requestKakaoToken(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.getRequiredEnv("KAKAO_REST_API_KEY"),
      redirect_uri: redirectUri,
      code,
      client_secret: this.getRequiredEnv("KAKAO_CLIENT_SECRET"),
    });

    // 인가 코드를 access token으로 바꾸는 과정은 secret을 보호해야 해서 서버에서만 수행한다.
    const response = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body,
    });

    if (!response.ok) {
      throw new UnauthorizedException("카카오 토큰 발급에 실패했습니다.");
    }

    const payload = await this.readJson(response, decodeKakaoTokenResponse);
    return { accessToken: payload.access_token };
  }

  private async requestKakaoUser(accessToken: string): Promise<KakaoUserResponse> {
    const response = await fetch("https://kapi.kakao.com/v2/user/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException("카카오 사용자 정보 조회에 실패했습니다.");
    }

    return this.readJson(response, decodeKakaoUserResponse);
  }

  private async discordLogin(dto: OAuthLoginDto): Promise<{ body: LoginResponseDto; refreshToken: string }> {
    const code = dto.code.trim();
    const redirectUri = dto.redirectUri.trim();
    if (!code || !redirectUri) {
      throw new BadRequestException("code와 redirectUri가 필요합니다.");
    }

    const token = await this.requestDiscordToken(code, redirectUri);
    const discordUser = await this.requestDiscordUser(token.accessToken);
    const providerUserId = discordUser.id.trim();

    // Discord 이메일은 email scope가 있어도 없거나 미인증일 수 있어 providerUserId를 기본 식별자로 사용한다.
    const email = this.getVerifiedDiscordEmail(discordUser);
    const displayName = this.getDiscordDisplayName(discordUser, providerUserId);
    const user = await this.findOrCreateDiscordUser(providerUserId, email, displayName);
    const refreshToken = await this.issueRefreshToken(user.id, user.email);

    return {
      body: {
        accessToken: createAccessToken(user.id, user.email),
        tokenType: "Bearer",
        expiresIn: getAccessTokenExpiresIn(),
        user: mapUser(user),
      },
      refreshToken,
    };
  }

  private async requestDiscordToken(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.getRequiredEnv("DISCORD_CLIENT_ID"),
      client_secret: this.getRequiredEnv("DISCORD_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
    });

    // client secret은 브라우저에 노출하면 안 되므로 토큰 교환은 백엔드에서만 처리한다.
    const response = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new UnauthorizedException("디스코드 토큰 발급에 실패했습니다.");
    }

    const payload = await this.readJson(response, decodeDiscordTokenResponse);
    return { accessToken: payload.access_token };
  }

  private async requestDiscordUser(accessToken: string): Promise<DiscordUserResponse> {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException("디스코드 사용자 정보 조회에 실패했습니다.");
    }

    return this.readJson(response, decodeDiscordUserResponse);
  }

  private async findOrCreateKakaoUser(
    providerUserId: string,
    email: string | null,
    displayName: string,
  ) {
    const socialAccount = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: PrismaAuthProvider.KAKAO,
          providerUserId,
        },
      },
      include: { user: true },
    });

    if (socialAccount?.user.deletedAt) {
      throw new UnauthorizedException("탈퇴한 계정입니다.");
    }

    if (socialAccount) {
      return this.ensureUserPublicId(socialAccount.user);
    }

    const existingUser = email
      ? await this.prisma.user.findUnique({ where: { email } })
      : null;

    if (existingUser && !existingUser.deletedAt) {
      const linked = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          socialAccounts: {
            create: {
              provider: PrismaAuthProvider.KAKAO,
              providerUserId,
              email,
            },
          },
        },
      });
      return this.ensureUserPublicId(linked);
    }

    // 탈퇴 계정의 이메일은 unique 제약에 남아 있을 수 있어 신규 OAuth 계정에는 안전하게 비워둔다.
    const usableEmail = existingUser?.deletedAt ? null : email;
    return this.prisma.user.create({
      data: {
        publicId: await this.generateUserPublicId(),
        email: usableEmail,
        displayName,
        authProvider: PrismaAuthProvider.KAKAO,
        socialAccounts: {
          create: {
            provider: PrismaAuthProvider.KAKAO,
            providerUserId,
            email: usableEmail,
          },
        },
      },
    });
  }

  private async findOrCreateDiscordUser(
    providerUserId: string,
    email: string | null,
    displayName: string,
  ) {
    const socialAccount = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: PrismaAuthProvider.DISCORD,
          providerUserId,
        },
      },
      include: { user: true },
    });

    if (socialAccount?.user.deletedAt) {
      throw new UnauthorizedException("탈퇴한 계정입니다.");
    }

    if (socialAccount) {
      return this.ensureUserPublicId(socialAccount.user);
    }

    const existingUser = email
      ? await this.prisma.user.findUnique({ where: { email } })
      : null;

    if (existingUser && !existingUser.deletedAt) {
      const linked = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          socialAccounts: {
            create: {
              provider: PrismaAuthProvider.DISCORD,
              providerUserId,
              email,
            },
          },
        },
      });
      return this.ensureUserPublicId(linked);
    }

    // 탈퇴 계정의 이메일은 unique 제약에 남아 있을 수 있어 신규 OAuth 계정에는 안전하게 비워둔다.
    const usableEmail = existingUser?.deletedAt ? null : email;
    return this.prisma.user.create({
      data: {
        publicId: await this.generateUserPublicId(),
        email: usableEmail,
        displayName,
        authProvider: PrismaAuthProvider.DISCORD,
        socialAccounts: {
          create: {
            provider: PrismaAuthProvider.DISCORD,
            providerUserId,
            email: usableEmail,
          },
        },
      },
    });
  }

  private getVerifiedKakaoEmail(kakaoUser: KakaoUserResponse): string | null {
    const account = kakaoUser.kakao_account;
    const email = account?.email?.trim().toLowerCase();
    if (!email || account?.is_email_valid === false || account?.is_email_verified === false) {
      return null;
    }
    return email;
  }

  private getKakaoDisplayName(kakaoUser: KakaoUserResponse, providerUserId: string): string {
    const fallbackName = `카카오사용자${providerUserId.slice(-4)}`;
    const name =
      kakaoUser.kakao_account?.profile?.nickname ??
      kakaoUser.properties?.nickname ??
      kakaoUser.kakao_account?.name ??
      fallbackName;

    return name.trim().slice(0, 50) || fallbackName;
  }

  private getVerifiedDiscordEmail(discordUser: DiscordUserResponse): string | null {
    const email = discordUser.email?.trim().toLowerCase();
    if (!email || discordUser.verified === false) {
      return null;
    }
    return email;
  }

  private getDiscordDisplayName(discordUser: DiscordUserResponse, providerUserId: string): string {
    const fallbackName = `디스코드사용자${providerUserId.slice(-4)}`;
    const name = discordUser.global_name ?? discordUser.username ?? fallbackName;

    return name.trim().slice(0, 50) || fallbackName;
  }

  private getRequiredEnv(key: string): string {
    const value = process.env[key]?.trim();
    if (!value) {
      throw new InternalServerErrorException(`${key} 환경변수가 필요합니다.`);
    }
    return value;
  }

  private async readJson<T>(response: Response, decode: (value: unknown) => T): Promise<T> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new UnauthorizedException("OAuth 응답을 해석할 수 없습니다.");
    }

    try {
      return decode(payload);
    } catch {
      throw new UnauthorizedException("OAuth 응답 형식이 올바르지 않습니다.");
    }
  }

  private assertValidEmail(email: string): void {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      this.throwEmailFieldError("이메일을 입력해주세요.");
    }
    if (!emailPattern.test(email)) {
      this.throwEmailFieldError("이메일 형식이 올바르지 않습니다.");
    }
  }

  private throwEmailFieldError(reason: string): never {
    throw badRequest("USER_400", "잘못된 요청입니다.", {
      fieldErrors: [
        {
          field: "email",
          reason,
        },
      ],
    });
  }

  private throwDuplicateEmail(): never {
    throw conflict("USER_409", "이미 사용 중인 이메일입니다.");
  }

  private throwRegisterFailed(): never {
    throw internalError("USER_500", "회원가입 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

  private throwLoginTokenIssueFailed(): never {
    throw internalError("AUTH_500", "로그인 처리 중 문제가 발생했습니다. 다시 시도해주세요.");
  }

  private isEmailUniqueConstraintError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      return false;
    }

    const target = error.meta?.target;
    return Array.isArray(target) && target.includes("email");
  }

  private async ensureUserPublicId(user: PrismaUser): Promise<PrismaUser> {
    if (user.publicId) {
      return user;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        return await this.prisma.user.update({
          where: { id: user.id },
          data: { publicId: generateEightDigitPublicId() },
        });
      } catch {
        // unique collision: retry with a new random value
      }
    }

    throw new ConflictException("사용자 공개 식별자를 생성하지 못했습니다.");
  }

  private async generateUserPublicId(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const publicId = generateEightDigitPublicId();
      const existing = await this.prisma.user.findUnique({
        where: { publicId },
        select: { id: true },
      });

      if (!existing) {
        return publicId;
      }
    }

    throw new ConflictException("사용자 공개 식별자를 생성하지 못했습니다.");
  }
}

function decodeKakaoTokenResponse(value: unknown): KakaoTokenResponse {
  const record = getOAuthRecord(value);
  const accessToken = record.access_token;
  if (!isString(accessToken) || !accessToken.trim()) {
    throw new UnauthorizedException("카카오 토큰 응답 형식이 올바르지 않습니다.");
  }
  return {
    access_token: accessToken.trim(),
    token_type: readOptionalString(record.token_type),
    expires_in: readOptionalInteger(record.expires_in),
    refresh_token: readOptionalString(record.refresh_token),
    refresh_token_expires_in: readOptionalInteger(record.refresh_token_expires_in),
    scope: readOptionalString(record.scope),
    id_token: readOptionalString(record.id_token),
  };
}

function decodeKakaoUserResponse(value: unknown): KakaoUserResponse {
  const record = getOAuthRecord(value);
  const id = record.id;
  if (!isNonEmptyString(id) && !isIntegerNumber(id)) {
    throw new UnauthorizedException("카카오 사용자 응답 형식이 올바르지 않습니다.");
  }
  const account = readOptionalRecord(record.kakao_account, "kakao_account");
  const profile = account ? readOptionalRecord(account.profile, "kakao_account.profile") : undefined;
  const properties = readOptionalRecord(record.properties, "properties");

  return {
    id,
    kakao_account: account
      ? {
          email: readOptionalString(account.email),
          is_email_valid: readOptionalBoolean(account.is_email_valid),
          is_email_verified: readOptionalBoolean(account.is_email_verified),
          name: readOptionalString(account.name),
          profile: profile
            ? {
                nickname: readOptionalString(profile.nickname),
              }
            : undefined,
        }
      : undefined,
    properties: properties
      ? {
          nickname: readOptionalString(properties.nickname),
        }
      : undefined,
  };
}

function decodeDiscordTokenResponse(value: unknown): DiscordTokenResponse {
  const record = getOAuthRecord(value);
  const accessToken = record.access_token;
  if (!isString(accessToken) || !accessToken.trim()) {
    throw new UnauthorizedException("디스코드 토큰 응답 형식이 올바르지 않습니다.");
  }
  return {
    access_token: accessToken.trim(),
    token_type: readOptionalString(record.token_type),
    expires_in: readOptionalInteger(record.expires_in),
    refresh_token: readOptionalString(record.refresh_token),
    scope: readOptionalString(record.scope),
  };
}

function decodeDiscordUserResponse(value: unknown): DiscordUserResponse {
  const record = getOAuthRecord(value);
  if (!isString(record.id) || !record.id.trim()) {
    throw new UnauthorizedException("디스코드 사용자 응답 형식이 올바르지 않습니다.");
  }
  return {
    id: record.id,
    username: readOptionalString(record.username),
    global_name: readNullableString(record.global_name),
    email: readNullableString(record.email),
    verified: readOptionalBoolean(record.verified),
  };
}

function getOAuthRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new UnauthorizedException("OAuth 응답 형식이 올바르지 않습니다.");
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isString(value)) {
    throw new UnauthorizedException("OAuth 응답 문자열 필드 형식이 올바르지 않습니다.");
  }
  return value;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return readOptionalString(value);
}

function readOptionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isIntegerNumber(value)) {
    throw new UnauthorizedException("OAuth 응답 숫자 필드 형식이 올바르지 않습니다.");
  }
  return value;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isBoolean(value)) {
    throw new UnauthorizedException("OAuth 응답 boolean 필드 형식이 올바르지 않습니다.");
  }
  return value;
}

function readOptionalRecord(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw new UnauthorizedException(`OAuth 응답 ${label} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isIntegerNumber(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}
