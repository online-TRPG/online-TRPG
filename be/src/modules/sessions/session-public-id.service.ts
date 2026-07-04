import { ConflictException, Injectable } from "@nestjs/common";
import { generateEightDigitPublicId } from "../../common/utils/public-id";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionPublicIdService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure<T extends { id: string; publicId: string | null }>(
    session: T,
  ): Promise<T & { publicId: string }> {
    if (session.publicId) {
      return session as T & { publicId: string };
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const updated = await this.prisma.session.update({
          where: { id: session.id },
          data: { publicId: generateEightDigitPublicId() },
          select: { publicId: true },
        });

        return {
          ...session,
          publicId: updated.publicId!,
        };
      } catch {
        // unique collision: retry with another random value
      }
    }

    throw new ConflictException("세션 공개 식별자를 생성하지 못했습니다.");
  }

  async generate(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const publicId = generateEightDigitPublicId();
      const existing = await this.prisma.session.findUnique({
        where: { publicId },
        select: { id: true },
      });

      if (!existing) {
        return publicId;
      }
    }

    throw new ConflictException("세션 공개 식별자를 생성하지 못했습니다.");
  }
}
