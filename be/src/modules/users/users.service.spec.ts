import { BadRequestException, ConflictException, InternalServerErrorException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { UsersService } from "./users.service";

function createService() {
  const prisma = {
    refreshToken: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    session: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    sessionCharacter: {
      deleteMany: jest.fn(),
    },
    sessionParticipant: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  prisma.$transaction.mockImplementation((input: unknown) => {
    if (Array.isArray(input)) {
      return Promise.all(input);
    }
    return (input as (tx: typeof prisma) => Promise<unknown>)(prisma);
  });

  return {
    prisma,
    service: new UsersService(prisma as never),
  };
}

const localUser = {
  id: "user-1",
  publicId: "12345678",
  email: "user@example.com",
  passwordHash: "$2b$12$O49rl9EK5V8VD.6j4QZWCeRfKKBte.MCGSpgVppMlYkIBz2KYrcDO",
  displayName: "test-user",
  authProvider: "LOCAL",
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("UsersService", () => {
  describe("checkEmail", () => {
    it("이메일을 소문자로 정규화하고 중복 여부를 반환한다.", async () => {
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
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: "USER_400",
          data: {
            fieldErrors: [
              {
                field: "email",
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
          name: "test-user",
        }),
      ).rejects.toThrow(ConflictException);

      try {
        await service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "test-user",
        });
      } catch (error) {
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: "USER_409",
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

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(uniqueError);

      await expect(
        service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "test-user",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("일반 DB 저장 실패는 사용자용 USER_500 메시지로 반환한다.", async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error("database unavailable"));

      await expect(
        service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "test-user",
        }),
      ).rejects.toThrow(InternalServerErrorException);

      try {
        await service.register({
          email: "user@example.com",
          password: "P@ssword123",
          name: "test-user",
        });
      } catch (error) {
        expect((error as InternalServerErrorException).getResponse()).toMatchObject({
          code: "USER_500",
          data: null,
        });
      }
    });
  });

  describe("login", () => {
    it("refresh token 저장 실패는 사용자용 AUTH_500 메시지로 반환한다.", async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue(localUser);
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
        expect((error as InternalServerErrorException).getResponse()).toMatchObject({
          code: "AUTH_500",
          data: null,
        });
      }
    });
  });

  describe("deleteMe", () => {
    it("진행 중이거나 일시정지된 호스트 세션이 있으면 회원 탈퇴를 막는다.", async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue(localUser);
      prisma.session.findFirst.mockResolvedValue({ id: "playing-session" });

      await expect(
        service.deleteMe("user-1", { password: "P@ssword123" }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.session.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("호스트 모집 세션은 해산하고, 일반 참가 모집 세션은 LEFT 처리한 뒤 탈퇴한다.", async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue(localUser);
      prisma.session.findFirst.mockResolvedValue(null);
      prisma.session.findMany.mockResolvedValue([{ id: "hosted-recruiting-session" }]);
      prisma.sessionParticipant.findMany.mockResolvedValue([
        { sessionId: "joined-recruiting-session" },
      ]);

      await service.deleteMe("user-1", { password: "P@ssword123" });

      // 호스트가 탈퇴한 모집 세션은 더 이상 운영 주체가 없으므로 DISBANDED로 닫는다.
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["hosted-recruiting-session"] },
        },
        data: {
          status: "DISBANDED",
        },
      });
      expect(prisma.sessionParticipant.updateMany).toHaveBeenCalledWith({
        where: {
          sessionId: { in: ["hosted-recruiting-session"] },
          status: "JOINED",
        },
        data: expect.objectContaining({
          status: "LEFT",
          connectionStatus: "OFFLINE",
          isReady: false,
          readyAt: null,
          leftAt: expect.any(Date),
        }),
      });

      // 일반 참가자로 들어간 모집 세션은 세션 자체를 건드리지 않고 해당 참가자만 떠난 상태로 정리한다.
      expect(prisma.sessionParticipant.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          sessionId: { in: ["joined-recruiting-session"] },
          status: "JOINED",
          role: { not: "HOST" },
        },
        data: expect.objectContaining({
          status: "LEFT",
          connectionStatus: "OFFLINE",
          isReady: false,
          readyAt: null,
          leftAt: expect.any(Date),
        }),
      });
      expect(prisma.sessionCharacter.deleteMany).toHaveBeenCalledWith({
        where: {
          sessionId: { in: ["hosted-recruiting-session"] },
        },
      });
      expect(prisma.sessionCharacter.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          sessionId: { in: ["joined-recruiting-session"] },
        },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
