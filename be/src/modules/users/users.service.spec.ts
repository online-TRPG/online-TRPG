import { BadRequestException, ConflictException, InternalServerErrorException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { UsersService } from "./users.service";

function createService() {
  const prisma = {
    refreshToken: {
      create: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  return {
    prisma,
    service: new UsersService(prisma as never),
  };
}

describe("UsersService", () => {
  describe("checkEmail", () => {
    it("이메일을 소문자로 정규화하고 중복 여부를 available로 반환한다.", async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue({ id: "user-1" });

      await expect(service.checkEmail("USER@Example.COM")).resolves.toEqual({
        email: "user@example.com",
        available: false,
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
      });
    });

    it("이메일 형식 오류를 USER_400 fieldErrors로 반환한다.", async () => {
      const { service } = createService();

      await expect(service.checkEmail("wrong-email")).rejects.toThrow(BadRequestException);

      try {
        await service.checkEmail("wrong-email");
      } catch (error) {
        expect((error as BadRequestException).getResponse()).toEqual({
          code: "USER_400",
          message: "잘못된 요청입니다.",
          data: {
            fieldErrors: [
              {
                field: "email",
                reason: "이메일 형식이 올바르지 않습니다.",
              },
            ],
          },
        });
      }
    });
  });

  describe("register", () => {
    it("이미 존재하는 이메일은 USER_409로 반환한다.", async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue({ id: "user-1" });

      await expect(
        service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "홍길동",
        }),
      ).rejects.toThrow(ConflictException);

      try {
        await service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "홍길동",
        });
      } catch (error) {
        expect((error as ConflictException).getResponse()).toEqual({
          code: "USER_409",
          message: "이미 사용 중인 이메일입니다.",
          data: null,
        });
      }
    });

    it("동시 요청으로 DB unique 충돌이 나도 USER_409로 반환한다.", async () => {
      const { prisma, service } = createService();
      const uniqueError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["email"] },
      });

      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.create.mockRejectedValue(uniqueError);

      await expect(
        service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "홍길동",
        }),
      ).rejects.toThrow(ConflictException);

      try {
        await service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "홍길동",
        });
      } catch (error) {
        expect((error as ConflictException).getResponse()).toEqual({
          code: "USER_409",
          message: "이미 사용 중인 이메일입니다.",
          data: null,
        });
      }
    });

    it("일반 DB 저장 실패는 사용자용 USER_500 메시지로 반환한다.", async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error("database unavailable"));

      await expect(
        service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "홍길동",
        }),
      ).rejects.toThrow(InternalServerErrorException);

      try {
        await service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "홍길동",
        });
      } catch (error) {
        expect((error as InternalServerErrorException).getResponse()).toEqual({
          code: "USER_500",
          message: "회원가입 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
          data: null,
        });
      }
    });
  });

  describe("login", () => {
    it("refresh token 저장 실패는 사용자용 AUTH_500 메시지로 반환한다.", async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        publicId: "12345678",
        email: "user@example.com",
        passwordHash: "$2b$12$O49rl9EK5V8VD.6j4QZWCeRfKKBte.MCGSpgVppMlYkIBz2KYrcDO",
        displayName: "홍길동",
        authProvider: "LOCAL",
        deletedAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      prisma.refreshToken.create.mockRejectedValue(new Error("database unavailable"));

      await expect(
        service.login({
          email: "user@example.com",
          password: "P@ssword123",
        }),
      ).rejects.toThrow(InternalServerErrorException);

      try {
        await service.login({
          email: "user@example.com",
          password: "P@ssword123",
        });
      } catch (error) {
        expect((error as InternalServerErrorException).getResponse()).toEqual({
          code: "AUTH_500",
          message: "로그인 처리 중 문제가 발생했습니다. 다시 시도해주세요.",
          data: null,
        });
      }
    });
  });
});
