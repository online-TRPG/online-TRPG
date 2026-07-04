import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SessionScenarioStatus as PrismaSessionScenarioStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionScenarioLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveEntityOrThrow(sessionId: string) {
    const sessionScenario = await this.prisma.sessionScenario.findFirst({
      where: {
        sessionId,
        status: PrismaSessionScenarioStatus.ACTIVE,
      },
      include: {
        scenario: true,
        gameState: true,
      },
      orderBy: { sequence: "asc" },
    });

    if (sessionScenario) {
      return sessionScenario;
    }

    const fallbackScenario = await this.prisma.sessionScenario.findFirst({
      where: { sessionId },
      include: {
        scenario: true,
        gameState: true,
      },
      orderBy: { sequence: "asc" },
    });

    if (!fallbackScenario) {
      throw new NotFoundException(`Session ${sessionId} does not have a scenario.`);
    }

    return fallbackScenario;
  }

  async deleteLinks(tx: Prisma.TransactionClient, sessionId: string): Promise<void> {
    await tx.sessionScenario.deleteMany({ where: { sessionId } });
  }

  selectActive<T extends { status: PrismaSessionScenarioStatus }>(sessionScenarios: T[]): T | null {
    return sessionScenarios.find((candidate) => candidate.status === PrismaSessionScenarioStatus.ACTIVE) ?? sessionScenarios[0] ?? null;
  }
}
