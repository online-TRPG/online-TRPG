import {
  AuthProvider as PrismaAuthProvider,
  ConnectionStatus as PrismaConnectionStatus,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionStatus as PrismaSessionStatus,
  UserRole as PrismaUserRole,
} from "@prisma/client";
import { ConnectionStatus } from "@trpg/shared-types";
import { SessionParticipantStatusService } from "./session-participant-status.service";

describe("SessionParticipantStatusService", () => {
  const prisma = {
    sessionParticipant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const realtimeEvents = {
    emitParticipantUpdated: jest.fn(),
  };
  const campaignArchiveRuntime = {
    ensureCharacterMatchesScenarioLevel: jest.fn(),
  };
  const service = new SessionParticipantStatusService(
    prisma as never,
    realtimeEvents as never,
    campaignArchiveRuntime as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists joined participants ordered by join time", async () => {
    prisma.sessionParticipant.findMany.mockResolvedValue([
      {
        id: "participant-1",
        sessionId: "session-1",
        userId: "user-1",
        role: PrismaParticipantRole.PLAYER,
        status: PrismaParticipantStatus.JOINED,
        connectionStatus: PrismaConnectionStatus.ONLINE,
        isReady: true,
        readyAt: new Date("2026-05-14T01:00:00.000Z"),
        joinedAt: new Date("2026-05-14T00:30:00.000Z"),
        leftAt: null,
        user: {
          id: "user-1",
          publicId: "public-user-1",
          email: "user@example.com",
          displayName: "User",
          nickname: "User",
          authProvider: PrismaAuthProvider.LOCAL,
          role: PrismaUserRole.USER,
          profileImageUrl: null,
          createdAt: new Date("2026-05-14T00:00:00.000Z"),
        },
        sessionCharacter: null,
      },
    ]);

    const result = await service.listJoinedParticipants("session-1");

    expect(prisma.sessionParticipant.findMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        status: PrismaParticipantStatus.JOINED,
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sessionId: "session-1",
      userId: "user-1",
      role: "PLAYER",
      status: "JOINED",
      connectionStatus: "ONLINE",
      isReady: true,
    });
  });

  it("maps prisma connection status to public connection status", async () => {
    prisma.sessionParticipant.findMany.mockResolvedValue([
      {
        userId: "online-user",
        connectionStatus: PrismaConnectionStatus.ONLINE,
      },
      {
        userId: "offline-user",
        connectionStatus: PrismaConnectionStatus.OFFLINE,
      },
    ]);

    await expect(service.listConnectionStatuses("session-1")).resolves.toEqual([
      {
        userId: "online-user",
        connectionStatus: ConnectionStatus.ONLINE,
      },
      {
        userId: "offline-user",
        connectionStatus: ConnectionStatus.OFFLINE,
      },
    ]);
    expect(prisma.sessionParticipant.findMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        status: PrismaParticipantStatus.JOINED,
      },
      select: {
        userId: true,
        connectionStatus: true,
      },
      orderBy: { joinedAt: "asc" },
    });
  });

  it("updates changed connection status and emits the mapped participant", async () => {
    const participant = {
      id: "participant-1",
      sessionId: "session-1",
      userId: "user-1",
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
      connectionStatus: PrismaConnectionStatus.OFFLINE,
      isReady: false,
      readyAt: null,
      joinedAt: new Date("2026-05-14T00:30:00.000Z"),
      leftAt: null,
      user: {
        id: "user-1",
        publicId: "public-user-1",
        email: "user@example.com",
        displayName: "User",
        nickname: "User",
        authProvider: PrismaAuthProvider.LOCAL,
        role: PrismaUserRole.USER,
        profileImageUrl: null,
        createdAt: new Date("2026-05-14T00:00:00.000Z"),
      },
      sessionCharacter: null,
    };
    prisma.sessionParticipant.findUnique.mockResolvedValue(participant);
    prisma.sessionParticipant.update.mockResolvedValue({
      ...participant,
      connectionStatus: PrismaConnectionStatus.ONLINE,
    });

    await service.updateConnectionStatus({
      sessionId: "session-1",
      userId: "user-1",
      status: PrismaConnectionStatus.ONLINE,
    });

    expect(prisma.sessionParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-1" },
      data: {
        connectionStatus: PrismaConnectionStatus.ONLINE,
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });
    expect(realtimeEvents.emitParticipantUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        userId: "user-1",
        connectionStatus: "ONLINE",
      }),
    );
  });

  it("skips connection status updates when participant is missing or unchanged", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValueOnce(null);

    await service.updateConnectionStatus({
      sessionId: "session-1",
      userId: "user-1",
      status: PrismaConnectionStatus.ONLINE,
    });

    prisma.sessionParticipant.findUnique.mockResolvedValueOnce({
      status: PrismaParticipantStatus.JOINED,
      connectionStatus: PrismaConnectionStatus.ONLINE,
    });

    await service.updateConnectionStatus({
      sessionId: "session-1",
      userId: "user-1",
      status: PrismaConnectionStatus.ONLINE,
    });

    expect(prisma.sessionParticipant.update).not.toHaveBeenCalled();
    expect(realtimeEvents.emitParticipantUpdated).not.toHaveBeenCalled();
  });

  it("updates player ready state after scenario level validation", async () => {
    const participant = {
      id: "participant-1",
      sessionId: "session-1",
      userId: "user-1",
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
      connectionStatus: PrismaConnectionStatus.ONLINE,
      isReady: false,
      readyAt: null,
      joinedAt: new Date("2026-05-14T00:30:00.000Z"),
      leftAt: null,
      user: {
        id: "user-1",
        publicId: "public-user-1",
        email: "user@example.com",
        displayName: "User",
        nickname: "User",
        authProvider: PrismaAuthProvider.LOCAL,
        role: PrismaUserRole.USER,
        profileImageUrl: null,
        createdAt: new Date("2026-05-14T00:00:00.000Z"),
      },
      sessionCharacter: {
        id: "session-character-1",
        characterId: "character-1",
        character: {
          name: "Hero",
          level: 3,
        },
      },
    };
    prisma.sessionParticipant.findUnique.mockResolvedValue(participant);
    prisma.sessionParticipant.update.mockResolvedValue({
      ...participant,
      isReady: true,
      readyAt: new Date("2026-05-14T01:00:00.000Z"),
    });

    const result = await service.updateReadyState({
      sessionId: "session-1",
      userId: "user-1",
      sessionStatus: PrismaSessionStatus.RECRUITING,
      isReady: true,
      getScenarioForReadyValidation: jest.fn(async () => ({
        scenario: {
          title: "Scenario",
          startLevel: 1,
          recommendedEndLevel: 5,
        },
      })),
    });

    expect(campaignArchiveRuntime.ensureCharacterMatchesScenarioLevel).toHaveBeenCalledWith({
      characterName: "Hero",
      characterLevel: 3,
      scenario: {
        title: "Scenario",
        startLevel: 1,
        recommendedEndLevel: 5,
      },
    });
    expect(prisma.sessionParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "participant-1" },
        data: expect.objectContaining({ isReady: true }),
      }),
    );
    expect(result).toMatchObject({
      userId: "user-1",
      isReady: true,
    });
  });

  it("auto-marks GM participants ready", async () => {
    const readyAt = new Date("2026-05-14T00:45:00.000Z");
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      id: "participant-gm",
      role: PrismaParticipantRole.GM,
      status: PrismaParticipantStatus.JOINED,
      readyAt,
    });
    prisma.sessionParticipant.update.mockResolvedValue({
      id: "participant-gm",
      sessionId: "session-1",
      userId: "gm-user",
      role: PrismaParticipantRole.GM,
      status: PrismaParticipantStatus.JOINED,
      connectionStatus: PrismaConnectionStatus.ONLINE,
      isReady: true,
      readyAt,
      joinedAt: new Date("2026-05-14T00:30:00.000Z"),
      leftAt: null,
      user: {
        id: "gm-user",
        publicId: "public-gm-user",
        email: "gm@example.com",
        displayName: "GM",
        nickname: "GM",
        authProvider: PrismaAuthProvider.LOCAL,
        role: PrismaUserRole.USER,
        profileImageUrl: null,
        createdAt: new Date("2026-05-14T00:00:00.000Z"),
      },
      sessionCharacter: null,
    });

    await service.updateReadyState({
      sessionId: "session-1",
      userId: "gm-user",
      sessionStatus: PrismaSessionStatus.RECRUITING,
      isReady: false,
      getScenarioForReadyValidation: jest.fn(),
    });

    expect(prisma.sessionParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "participant-gm" },
        data: {
          isReady: true,
          readyAt,
        },
      }),
    );
  });

  it("clears ready state and emits the mapped participant", async () => {
    const updatedParticipant = {
      id: "participant-1",
      sessionId: "session-1",
      userId: "user-1",
      role: PrismaParticipantRole.PLAYER,
      status: PrismaParticipantStatus.JOINED,
      connectionStatus: PrismaConnectionStatus.ONLINE,
      isReady: false,
      readyAt: null,
      joinedAt: new Date("2026-05-14T00:30:00.000Z"),
      leftAt: null,
      user: {
        id: "user-1",
        publicId: "public-user-1",
        email: "user@example.com",
        displayName: "User",
        nickname: "User",
        authProvider: PrismaAuthProvider.LOCAL,
        role: PrismaUserRole.USER,
        profileImageUrl: null,
        createdAt: new Date("2026-05-14T00:00:00.000Z"),
      },
      sessionCharacter: null,
    };
    prisma.sessionParticipant.update.mockResolvedValue(updatedParticipant);

    await expect(
      service.clearReadyState({
        sessionId: "session-1",
        participantId: "participant-1",
      }),
    ).resolves.toMatchObject({
      userId: "user-1",
      isReady: false,
      readyAt: null,
    });

    expect(prisma.sessionParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-1" },
      data: {
        isReady: false,
        readyAt: null,
      },
      include: {
        user: true,
        sessionCharacter: {
          include: { character: true },
        },
      },
    });
    expect(realtimeEvents.emitParticipantUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        userId: "user-1",
        isReady: false,
      }),
    );
  });
});
