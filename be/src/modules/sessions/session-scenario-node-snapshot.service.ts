import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionScenarioNodeSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async getNodeEntityOrThrow(sessionScenarioId: string, nodeId: string) {
    const node = await this.prisma.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId,
          nodeId,
        },
      },
    });

    if (!node) {
      throw new NotFoundException(`Session scenario node ${nodeId} was not found.`);
    }

    return node;
  }

  async ensureForScenario(sessionScenarioId: string, scenarioId: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.ensure(tx, sessionScenarioId, scenarioId));
  }

  async ensure(tx: Prisma.TransactionClient, sessionScenarioId: string, scenarioId: string): Promise<void> {
    const existingNodeCount = await tx.sessionScenarioNode.count({
      where: { sessionScenarioId },
    });
    if (existingNodeCount > 0) {
      return;
    }

    const nodes = await tx.scenarioNode.findMany({
      where: { scenarioId },
      orderBy: { createdAt: "asc" },
    });

    await tx.sessionScenarioNode.createMany({
      data: nodes.map((node) => ({
        sessionScenarioId,
        originalNodeId: node.id,
        nodeId: node.id,
        nodeType: node.nodeType,
        title: node.title,
        sceneText: node.sceneText,
        imageUrl: node.imageUrl,
        checkOptionsJson: node.checkOptionsJson,
        transitionsJson: node.transitionsJson,
        cluesJson: node.cluesJson,
        nodeMetaJson: node.nodeMetaJson ?? null,
        fallbackNodeId: node.fallbackNodeId,
      })),
    });
  }
}
