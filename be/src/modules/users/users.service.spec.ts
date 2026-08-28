import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createRefreshToken, verifyToken } from "../../common/auth/token.utils";
import { UsersService } from "./users.service";

function createService() {
  const prisma = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
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
      findFirst: jest.fn(),
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

  const email = { sendPasswordReset: jest.fn() };
  const realtimeEvents = { disconnectAuthenticatedUser: jest.fn() };
  return {
    prisma,
    email,
    realtimeEvents,
    service: new UsersService(
      prisma as never,
      email as never,
      undefined,
      realtimeEvents as never,
    ),
  };
}

const localUser = {
  id: "user-1",
  publicId: "12345678",
  email: "user@example.com",
  passwordHash: "$2b$12$O49rl9EK5V8VD.6j4QZWCeRfKKBte.MCGSpgVppMlYkIBz2KYrcDO",
  displayName: "test-user",
  authProvider: "LOCAL",
  role: "USER",
  tokenVersion: 0,
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("UsersService", () => {
  describe("guest authentication", () => {
    it("creates a guest with signed access/refresh tokens and a bound CSRF token", async () => {
      const { prisma, service } = createService();
      const guest = {
        ...localUser,
        id: "guest-1",
        publicId: "87654321",
        email: null,
        passwordHash: null,
        authProvider: "GUEST",
      };
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(guest);
      prisma.refreshToken.create.mockResolvedValue({ id: "refresh-1" });

      const result = await service.createGuest({ displayName: "Guest" });

      expect(result.body.user.id).toBe(guest.id);
      expect(result.body.csrfToken).toHaveLength(43);
      expect(verifyToken(result.body.accessToken, "access").sub).toBe(guest.id);
      expect(verifyToken(result.refreshToken, "refresh")).toMatchObject({
        sub: guest.id,
        csrf: result.body.csrfToken,
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: guest.id,
          tokenHash: expect.not.stringContaining(result.refreshToken),
        }),
      });
    });

    it("revokes guest sessions when converting the account to local credentials", async () => {
      const { prisma, realtimeEvents, service } = createService();
      const guest = {
        ...localUser,
        id: "guest-1",
        publicId: "87654321",
        email: null,
        passwordHash: null,
        authProvider: "GUEST",
      };
      const converted = {
        ...guest,
        email: "member@example.com",
        authProvider: "LOCAL",
        tokenVersion: 1,
      };
      prisma.user.findUnique.mockResolvedValueOnce(guest).mockResolvedValueOnce(null);
      prisma.user.update.mockResolvedValue(converted);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({ id: "refresh-2" });

      const result = await service.convertGuestToLocal(guest.id, {
        email: "member@example.com",
        password: "NewPassword123!",
        name: "Member",
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: guest.id },
        data: expect.objectContaining({
          authProvider: "LOCAL",
          tokenVersion: { increment: 1 },
        }),
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: guest.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(verifyToken(result.body.accessToken, "access").ver).toBe(1);
      expect(verifyToken(result.refreshToken, "refresh").ver).toBe(1);
      expect(realtimeEvents.disconnectAuthenticatedUser).toHaveBeenCalledWith(guest.id);
    });

    it("rejects refresh token reissue when the CSRF token does not match", async () => {
      const { prisma, service } = createService();
      const csrfToken = "a".repeat(43);
      const refreshToken = createRefreshToken(localUser.id, localUser.email, csrfToken);
      prisma.refreshToken.findUnique.mockResolvedValue({
        userId: localUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: localUser,
      });

      await expect(service.reissue(refreshToken, "b".repeat(43))).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.reissue(refreshToken, csrfToken)).resolves.toMatchObject({
        tokenType: "Bearer",
        csrfToken,
      });
    });

    it("rejects refresh tokens issued for an older token version", async () => {
      const { prisma, service } = createService();
      const csrfToken = "a".repeat(43);
      const refreshToken = createRefreshToken(localUser.id, localUser.email, csrfToken, 2);
      prisma.refreshToken.findUnique.mockResolvedValue({
        userId: localUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { ...localUser, tokenVersion: 3 },
      });

      await expect(service.reissue(refreshToken, csrfToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("token revocation", () => {
    it("increments the token version and revokes refresh tokens after a password change", async () => {
      const { prisma, realtimeEvents, service } = createService();
      prisma.user.findUnique.mockResolvedValue(localUser);
      prisma.user.update.mockResolvedValue({ ...localUser, tokenVersion: 1 });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.changePassword(localUser.id, {
        currentPassword: "P@ssword123",
        newPassword: "NewPassword123!",
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: localUser.id },
        data: {
          passwordHash: expect.any(String),
          tokenVersion: { increment: 1 },
        },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: localUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(realtimeEvents.disconnectAuthenticatedUser).toHaveBeenCalledWith(localUser.id);
    });

    it("disconnects existing sockets after logout-all revokes every token", async () => {
      const { prisma, realtimeEvents, service } = createService();
      const csrfToken = "a".repeat(43);
      const refreshToken = createRefreshToken(
        localUser.id,
        localUser.email,
        csrfToken,
        localUser.tokenVersion,
      );
      prisma.user.update.mockResolvedValue({ ...localUser, tokenVersion: 1 });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logoutAll(localUser.id, refreshToken, csrfToken);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: localUser.id },
        data: { tokenVersion: { increment: 1 } },
      });
      expect(realtimeEvents.disconnectAuthenticatedUser).toHaveBeenCalledWith(localUser.id);
    });
  });

  describe("password reset", () => {
    it("존재하지 않는 이메일에도 성공 응답 경로를 유지하고 토큰을 만들지 않는다.", async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.requestPasswordReset({ email: "missing@example.com" })).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it("이미 사용된 재설정 토큰을 거절한다.", async () => {
      const { prisma, service } = createService();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "reset-1",
        userId: localUser.id,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: localUser,
      });

      await expect(service.confirmPasswordReset({ token: "used-token", newPassword: "NewPassword123!" }))
        .rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

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

  describe("public profile", () => {
    it("returns only explicitly public identity fields", async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue({
        ...localUser,
        profile: { profileImageUrl: "https://assets.example/avatar.webp" },
      });

      const result = await service.getPublicProfile(localUser.publicId);

      expect(result).toEqual({
        publicId: localUser.publicId,
        displayName: localUser.displayName,
        profileImageUrl: "https://assets.example/avatar.webp",
      });
      expect(result).not.toHaveProperty("id");
      expect(result).not.toHaveProperty("email");
      expect(result).not.toHaveProperty("role");
      expect(result).not.toHaveProperty("authProvider");
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

    it("호스트 모집 세션은 해산하고, 일반 참가 활성 세션은 LEFT 처리한 뒤 탈퇴한다.", async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue(localUser);
      prisma.session.findFirst.mockResolvedValue(null);
      prisma.session.findMany.mockResolvedValue([{ id: "hosted-recruiting-session" }]);
      prisma.sessionParticipant.findMany.mockResolvedValue([
        { sessionId: "joined-recruiting-session" },
        { sessionId: "joined-playing-session" },
        { sessionId: "joined-paused-session" },
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

      expect(prisma.sessionParticipant.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          status: "JOINED",
          role: { not: "HOST" },
          session: {
            is: {
              hostUserId: { not: "user-1" },
              status: {
                in: ["RECRUITING", "PLAYING", "PAUSED"],
              },
            },
          },
        },
        select: {
          sessionId: true,
        },
      });

      // 일반 참가자로 들어간 활성 세션은 세션 자체를 건드리지 않고 해당 참가자만 떠난 상태로 정리한다.
      expect(prisma.sessionParticipant.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          sessionId: {
            in: [
              "joined-recruiting-session",
              "joined-playing-session",
              "joined-paused-session",
            ],
          },
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
          sessionId: {
            in: [
              "joined-recruiting-session",
              "joined-playing-session",
              "joined-paused-session",
            ],
          },
        },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          deletedAt: expect.any(Date),
          tokenVersion: { increment: 1 },
        },
      });
    });
  });
});
