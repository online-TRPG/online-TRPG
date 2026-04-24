import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthProvider as PrismaAuthProvider } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import {
  AuthTokenResponseDto,
  CreateGuestUserDto,
  DeleteMeDto,
  EmailCheckResponseDto,
  LoginResponseDto,
  LoginUserDto,
  OAuthLoginDto,
  OAuthUrlResponseDto,
  RegisterUserDto,
  UserResponseDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { mapUser } from "../../common/mappers/domain.mapper";
import {
  createAccessToken,
  createRefreshToken,
  getAccessTokenExpiresIn,
  getRefreshTokenExpiresAt,
  verifyToken,
} from "../../common/auth/token.utils";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createGuest(dto: CreateGuestUserDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.create({
      data: {
        displayName: dto.displayName.trim(),
      },
    });

    return mapUser(user);
  }

  async register(dto: RegisterUserDto): Promise<UserResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("이미 사용 중인 이메일입니다.");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: dto.name.trim(),
        authProvider: PrismaAuthProvider.LOCAL,
      },
    });

    return mapUser(user);
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

  async deleteMe(userId: string, dto: DeleteMeDto): Promise<void> {
    const user = await this.getUserEntityOrThrow(userId);
    if (!user.passwordHash) {
      throw new ForbiddenException("비밀번호가 일치하지 않습니다.");
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new ForbiddenException("비밀번호가 일치하지 않습니다.");
    }

    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      }),
    ]);
  }

  getOAuthUrl(provider: "KAKAO" | "DISCORD", redirectUri: string, state?: string): OAuthUrlResponseDto {
    const trimmedRedirectUri = redirectUri.trim();
    if (!trimmedRedirectUri) {
      throw new BadRequestException("redirectUri가 필요합니다.");
    }

    const encodedRedirectUri = encodeURIComponent(trimmedRedirectUri);
    const encodedState = state ? `&state=${encodeURIComponent(state)}` : "";
    const authUrl =
      provider === "KAKAO"
        ? `https://kauth.kakao.com/oauth/authorize?client_id=${process.env.KAKAO_CLIENT_ID ?? "local"}&redirect_uri=${encodedRedirectUri}&response_type=code${encodedState}`
        : `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID ?? "local"}&response_type=code&redirect_uri=${encodedRedirectUri}&scope=identify%20email${encodedState}`;

    return { provider, authUrl };
  }

  async oauthLogin(
    provider: "KAKAO" | "DISCORD",
    dto: OAuthLoginDto,
  ): Promise<{ body: LoginResponseDto; refreshToken: string }> {
    const providerUserId = `${provider.toLowerCase()}-${this.hashToken(dto.code).slice(0, 16)}`;
    const email = `${providerUserId}@oauth.local`;
    const authProvider =
      provider === "KAKAO" ? PrismaAuthProvider.KAKAO : PrismaAuthProvider.DISCORD;

    const socialAccount = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: authProvider,
          providerUserId,
        },
      },
      include: { user: true },
    });

    const user =
      socialAccount?.user ??
      (await this.prisma.user.create({
        data: {
          email,
          displayName: provider === "KAKAO" ? "카카오모험가" : "디코바드",
          authProvider,
          socialAccounts: {
            create: {
              provider: authProvider,
              providerUserId,
              email,
            },
          },
        },
      }));

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

  async getUserEntityOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException(`User ${userId} was not found.`);
    }

    return user;
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

  private assertValidEmail(email: string): void {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      throw new BadRequestException("email 형식이 올바르지 않습니다.");
    }
  }
}
