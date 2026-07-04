import { NotFoundException } from "@nestjs/common";
import { SessionScenarioNodeSnapshotService } from "./session-scenario-node-snapshot.service";

describe("SessionScenarioNodeSnapshotService", () => {
  const prisma = {
    $transaction: jest.fn(),
    sessionScenarioNode: {
      findUnique: jest.fn(),
    },
  };
  const tx = {
    sessionScenarioNode: {
      count: jest.fn(),
      createMany: jest.fn(),
    },
    scenarioNode: {
      findMany: jest.fn(),
    },
  };
  const service = new SessionScenarioNodeSnapshotService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an existing session scenario node", async () => {
    prisma.sessionScenarioNode.findUnique.mockResolvedValue({ id: "node-1", nodeId: "node-a" });

    await expect(service.getNodeEntityOrThrow("session-scenario-1", "node-a")).resolves.toMatchObject({
      nodeId: "node-a",
    });
    expect(prisma.sessionScenarioNode.findUnique).toHaveBeenCalledWith({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: "session-scenario-1",
          nodeId: "node-a",
        },
      },
    });
  });

  it("rejects missing session scenario nodes", async () => {
    prisma.sessionScenarioNode.findUnique.mockResolvedValue(null);

    await expect(service.getNodeEntityOrThrow("session-scenario-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("skips snapshot creation when nodes already exist", async () => {
    tx.sessionScenarioNode.count.mockResolvedValue(1);

    await service.ensure(tx as never, "session-scenario-1", "scenario-1");

    expect(tx.scenarioNode.findMany).not.toHaveBeenCalled();
    expect(tx.sessionScenarioNode.createMany).not.toHaveBeenCalled();
  });

  it("copies scenario nodes into a session scenario snapshot", async () => {
    const now = new Date("2026-07-02T00:00:00.000Z");
    tx.sessionScenarioNode.count.mockResolvedValue(0);
    tx.scenarioNode.findMany.mockResolvedValue([
      {
        id: "node-a",
        nodeType: "story",
        title: "Start",
        sceneText: "Begin",
        imageUrl: null,
        checkOptionsJson: "[]",
        transitionsJson: "[]",
        cluesJson: "[]",
        nodeMetaJson: null,
        fallbackNodeId: null,
        createdAt: now,
      },
    ]);

    await service.ensure(tx as never, "session-scenario-1", "scenario-1");

    expect(tx.scenarioNode.findMany).toHaveBeenCalledWith({
      where: { scenarioId: "scenario-1" },
      orderBy: { createdAt: "asc" },
    });
    expect(tx.sessionScenarioNode.createMany).toHaveBeenCalledWith({
      data: [
        {
          sessionScenarioId: "session-scenario-1",
          originalNodeId: "node-a",
          nodeId: "node-a",
          nodeType: "story",
          title: "Start",
          sceneText: "Begin",
          imageUrl: null,
          checkOptionsJson: "[]",
          transitionsJson: "[]",
          cluesJson: "[]",
          nodeMetaJson: null,
          fallbackNodeId: null,
        },
      ],
    });
  });

  it("keeps the transaction boundary for ensureForScenario", async () => {
    prisma.$transaction.mockImplementation((callback: (txClient: typeof tx) => Promise<void>) => callback(tx));
    tx.sessionScenarioNode.count.mockResolvedValue(1);

    await service.ensureForScenario("session-scenario-1", "scenario-1");

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
  });
});
