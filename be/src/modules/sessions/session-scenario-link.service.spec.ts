import { NotFoundException } from "@nestjs/common";
import { SessionScenarioStatus as PrismaSessionScenarioStatus } from "@prisma/client";
import { SessionScenarioLinkService } from "./session-scenario-link.service";

describe("SessionScenarioLinkService", () => {
  const prisma = {
    sessionScenario: {
      findFirst: jest.fn(),
    },
  };
  const service = new SessionScenarioLinkService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the active session scenario first", async () => {
    prisma.sessionScenario.findFirst.mockResolvedValueOnce({ id: "active-scenario" });

    await expect(service.getActiveEntityOrThrow("session-1")).resolves.toMatchObject({ id: "active-scenario" });
    expect(prisma.sessionScenario.findFirst).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        status: PrismaSessionScenarioStatus.ACTIVE,
      },
      include: {
        scenario: true,
        gameState: true,
      },
      orderBy: { sequence: "asc" },
    });
  });

  it("falls back to the first linked scenario and rejects empty sessions", async () => {
    prisma.sessionScenario.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "fallback-scenario" });

    await expect(service.getActiveEntityOrThrow("session-1")).resolves.toMatchObject({ id: "fallback-scenario" });

    prisma.sessionScenario.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(service.getActiveEntityOrThrow("session-empty")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deletes scenario links through the provided transaction", async () => {
    const tx = {
      sessionScenario: {
        deleteMany: jest.fn(),
      },
    };

    await service.deleteLinks(tx as never, "session-1");

    expect(tx.sessionScenario.deleteMany).toHaveBeenCalledWith({ where: { sessionId: "session-1" } });
  });

  it("selects the active scenario from included links", () => {
    expect(
      service.selectActive([
        { id: "draft", status: PrismaSessionScenarioStatus.DRAFT },
        { id: "active", status: PrismaSessionScenarioStatus.ACTIVE },
      ]),
    ).toMatchObject({ id: "active" });
    expect(service.selectActive([{ id: "first", status: PrismaSessionScenarioStatus.DRAFT }])).toMatchObject({ id: "first" });
    expect(service.selectActive([])).toBeNull();
  });
});
