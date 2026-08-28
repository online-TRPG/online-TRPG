import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthProvider as PrismaAuthProvider } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../../database/prisma.service";

export type OAuthProvider = "KAKAO" | "DISCORD";
export type OAuthIntent = "login" | "reauth";

type OAuthTransaction = {
  redirectUri: string;
  codeVerifier: string;
};

const transactionTtlMs = 10 * 60_000;
const localRedirectUris = [
  "http://localhost:5173/oauth/callback",
  "http://127.0.0.1:5173/oauth/callback",
];

@Injectable()
export class OAuthTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async begin(params: {
    provider: OAuthProvider;
    intent: OAuthIntent;
    redirectUri: string;
    userId?: string | null;
  }): Promise<{ state: string; codeChallenge: string; redirectUri: string }> {
    const redirectUri = this.assertAllowedRedirectUri(params.redirectUri);
    if (params.intent === "reauth" && !params.userId) {
      throw new UnauthorizedException("OAuth 재인증을 시작하려면 로그인이 필요합니다.");
    }

    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const now = new Date();
    await this.prisma.oAuthTransaction.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    await this.prisma.oAuthTransaction.create({
      data: {
        stateHash: this.hashState(state),
        provider: this.toPrismaProvider(params.provider),
        intent: params.intent,
        redirectUri,
        codeVerifier,
        userId: params.userId ?? null,
        expiresAt: new Date(now.getTime() + transactionTtlMs),
      },
    });

    return {
      state,
      codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
      redirectUri,
    };
  }

  async consume(params: {
    provider: OAuthProvider;
    intent: OAuthIntent;
    state: string | undefined;
    redirectUri: string;
    userId?: string | null;
  }): Promise<OAuthTransaction> {
    const state = params.state?.trim();
    if (!state) {
      throw this.invalidTransaction();
    }
    const redirectUri = this.assertAllowedRedirectUri(params.redirectUri);
    const provider = this.toPrismaProvider(params.provider);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.oAuthTransaction.findUnique({
        where: { stateHash: this.hashState(state) },
      });
      if (
        !transaction ||
        transaction.expiresAt <= now ||
        transaction.provider !== provider ||
        transaction.intent !== params.intent ||
        transaction.redirectUri !== redirectUri ||
        transaction.userId !== (params.userId ?? null)
      ) {
        throw this.invalidTransaction();
      }

      const claimed = await tx.oAuthTransaction.deleteMany({
        where: { id: transaction.id, expiresAt: { gt: now } },
      });
      if (claimed.count !== 1) {
        throw this.invalidTransaction();
      }
      return {
        redirectUri: transaction.redirectUri,
        codeVerifier: transaction.codeVerifier,
      };
    });
  }

  private assertAllowedRedirectUri(value: string): string {
    let parsed: URL;
    try {
      parsed = new URL(value.trim());
    } catch {
      throw new BadRequestException("허용되지 않은 OAuth redirect URI입니다.");
    }
    if (parsed.username || parsed.password || parsed.hash) {
      throw new BadRequestException("허용되지 않은 OAuth redirect URI입니다.");
    }

    const configured = (process.env.OAUTH_REDIRECT_URIS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const allowed = configured.length > 0
      ? configured
      : process.env.NODE_ENV === "production"
        ? []
        : localRedirectUris;
    const redirectUri = parsed.toString();
    if (!allowed.includes(redirectUri)) {
      throw new BadRequestException("허용되지 않은 OAuth redirect URI입니다.");
    }
    return redirectUri;
  }

  private hashState(state: string): string {
    return createHash("sha256").update(state).digest("hex");
  }

  private toPrismaProvider(provider: OAuthProvider): PrismaAuthProvider {
    return provider === "KAKAO" ? PrismaAuthProvider.KAKAO : PrismaAuthProvider.DISCORD;
  }

  private invalidTransaction(): UnauthorizedException {
    return new UnauthorizedException("OAuth 요청 상태가 유효하지 않거나 만료되었습니다.");
  }
}
