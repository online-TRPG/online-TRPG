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

  it("keeps a soft-deleted source scenario readable through its session link", async () => {
    prisma.sessionScenario.findFirst.mockResolvedValueOnce({
      id: "active-scenario",
      scenario: {
        id: "scenario-1",
        deletedAt: new Date("2026-07-31T00:00:00.000Z"),
      },
      gameState: { currentNodeId: "node-1" },
    });

    await expect(
      service.getActiveEntityOrThrow("session-1"),
    ).resolves.toMatchObject({
      id: "active-scenario",
      scenario: {
        id: "scenario-1",
        deletedAt: expect.any(Date),
      },
      gameState: { currentNodeId: "node-1" },
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
        { id: "planned", status: PrismaSessionScenarioStatus.PLANNED },
        { id: "active", status: PrismaSessionScenarioStatus.ACTIVE },
      ]),
    ).toMatchObject({ id: "active" });
    expect(service.selectActive([{ id: "first", status: PrismaSessionScenarioStatus.PLANNED }])).toMatchObject({ id: "first" });
    expect(service.selectActive([])).toBeNull();
  });
});
