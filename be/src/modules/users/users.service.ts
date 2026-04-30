import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthProvider as PrismaAuthProvider, User as PrismaUser } from "@prisma/client";
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
import { generateEightDigitPublicId } from "../../common/utils/public-id";
import { mapUser } from "../../common/mappers/domain.mapper";
import {
  createAccessToken,
  createRefreshToken,
  getAccessTokenExpiresIn,
  getRefreshTokenExpiresAt,
  verifyToken,
} from "../../common/auth/token.utils";

type KakaoTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  id_token?: string;
};

type KakaoUserResponse = {
  id?: number | string;
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
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

type DiscordUserResponse = {
  id?: string;
  username?: string;
  global_name?: string | null;
  email?: string | null;
  verified?: boolean;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("이미 사용 중인 이메일입니다.");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        publicId: await this.generateUserPublicId(),
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
    const providerUserId = String(kakaoUser.id ?? "").trim();
    if (!providerUserId) {
      throw new UnauthorizedException("카카오 사용자 식별값을 확인할 수 없습니다.");
    }

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

    const payload = await this.readJson<KakaoTokenResponse>(response);
    if (!response.ok || !payload.access_token) {
      throw new UnauthorizedException("카카오 토큰 발급에 실패했습니다.");
    }

    return { accessToken: payload.access_token };
  }

  private async requestKakaoUser(accessToken: string): Promise<KakaoUserResponse> {
    const response = await fetch("https://kapi.kakao.com/v2/user/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = await this.readJson<KakaoUserResponse>(response);
    if (!response.ok) {
      throw new UnauthorizedException("카카오 사용자 정보 조회에 실패했습니다.");
    }

    return payload;
  }

  private async discordLogin(dto: OAuthLoginDto): Promise<{ body: LoginResponseDto; refreshToken: string }> {
    const code = dto.code.trim();
    const redirectUri = dto.redirectUri.trim();
    if (!code || !redirectUri) {
      throw new BadRequestException("code와 redirectUri가 필요합니다.");
    }

    const token = await this.requestDiscordToken(code, redirectUri);
    const discordUser = await this.requestDiscordUser(token.accessToken);
    const providerUserId = String(discordUser.id ?? "").trim();
    if (!providerUserId) {
      throw new UnauthorizedException("디스코드 사용자 식별값을 확인할 수 없습니다.");
    }

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

    const payload = await this.readJson<DiscordTokenResponse>(response);
    if (!response.ok || !payload.access_token) {
      throw new UnauthorizedException("디스코드 토큰 발급에 실패했습니다.");
    }

    return { accessToken: payload.access_token };
  }

  private async requestDiscordUser(accessToken: string): Promise<DiscordUserResponse> {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = await this.readJson<DiscordUserResponse>(response);
    if (!response.ok) {
      throw new UnauthorizedException("디스코드 사용자 정보 조회에 실패했습니다.");
    }

    return payload;
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

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw new UnauthorizedException("OAuth 응답을 해석할 수 없습니다.");
    }
  }

  private assertValidEmail(email: string): void {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      throw new BadRequestException("email 형식이 올바르지 않습니다.");
    }
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
