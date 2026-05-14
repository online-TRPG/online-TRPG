import {
  GmMode as PrismaGmMode,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  MainCommandCategory,
  MainCommandIntent,
  MainCommandScreenType,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { MainCommandsService } from "./main-commands.service";

const dto: SubmitMainCommandDto = {
  commandId: "command-1",
  actorId: "session-character-1",
  intent: MainCommandIntent.OBSERVE_AREA,
  category: MainCommandCategory.OBSERVATION,
  screenType: MainCommandScreenType.EXPLORATION,
  playerText: "주변을 관찰한다",
};

describe("MainCommandsService.submitMainCommand permission", () => {
  const createService = () => {
    const prisma = {
      sessionParticipant: { findUnique: jest.fn() },
      sessionCharacter: { findUnique: jest.fn() },
    };
    const sessionsService = {
      getSessionEntityOrThrow: jest.fn().mockResolvedValue({
        id: "session-1",
        status: PrismaSessionStatus.PLAYING,
        gmMode: PrismaGmMode.AI,
      }),
      ensureMembership: jest.fn().mockResolvedValue(undefined),
    };
    const aiService = {};
    const turnLogsService = {};
    const realtimeEvents = {};

    return {
      service: new MainCommandsService(
        prisma as never,
        sessionsService as never,
        aiService as never,
        turnLogsService as never,
        realtimeEvents as never,
      ),
      prisma,
    };
  };

  it("rejects ownership mismatch with MAIN_COMMAND_403 CHARACTER_OWNERSHIP_MISMATCH", async () => {
    const { service, prisma } = createService();
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      status: PrismaParticipantStatus.JOINED,
    });
    // sessionId+userId 복합키로 본인 sessionCharacter 를 조회하지만 character.ownerUserId 는 다른 유저
    // (실제로는 캐릭터 이양/공유가 도입된 뒤 발생할 시나리오)
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      characterId: "character-1",
      status: PrismaSessionCharacterStatus.ACTIVE,
      character: { ownerUserId: "another-user" },
      inventoryEntries: [],
    });

    await expect(service.submitMainCommand("user-1", "session-1", dto)).rejects.toMatchObject({
      response: {
        code: "MAIN_COMMAND_403",
        data: { reason: "CHARACTER_OWNERSHIP_MISMATCH" },
      },
    });
  });

  it("rejects actor mismatch before reaching ownership check", async () => {
    const { service, prisma } = createService();
    prisma.sessionParticipant.findUnique.mockResolvedValue({
      status: PrismaParticipantStatus.JOINED,
    });
    prisma.sessionCharacter.findUnique.mockResolvedValue({
      id: "session-character-1",
      characterId: "character-1",
      status: PrismaSessionCharacterStatus.ACTIVE,
      character: { ownerUserId: "user-1" },
      inventoryEntries: [],
    });

    await expect(
      service.submitMainCommand("user-1", "session-1", { ...dto, actorId: "other-character" }),
    ).rejects.toMatchObject({
      response: {
        code: "MAIN_COMMAND_403",
        data: { reason: "ACTOR_MISMATCH" },
      },
    });
  });
});
