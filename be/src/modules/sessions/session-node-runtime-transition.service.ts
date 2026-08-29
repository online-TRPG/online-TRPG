import { BadRequestException, Injectable } from "@nestjs/common";
import {
  GamePhase,
  SessionStatus,
} from "@prisma/client";
import { VttMapStateDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { SessionNodeRuntimeMapService } from "./session-node-runtime-map.service";

export type SessionNodeRuntimeTransitionResult = {
  currentNodeId: string;
  phase: GamePhase;
  stateVersion: number;
  map: VttMapStateDto;
  runtimeVersion: number;
  initialized: boolean;
};

@Injectable()
export class SessionNodeRuntimeTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeMaps: SessionNodeRuntimeMapService,
  ) {}

  async transition(params: {
    sessionId: string;
    sessionScenarioId: string;
    targetNodeId: string;
  }): Promise<SessionNodeRuntimeTransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.sessionId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.sessionScenarioId}))`;
      const [node, state] = await Promise.all([
        tx.sessionScenarioNode.findUnique({
          where: {
            sessionScenarioId_nodeId: {
              sessionScenarioId: params.sessionScenarioId,
              nodeId: params.targetNodeId,
            },
          },
          select: {
            id: true,
            nodeId: true,
            nodeType: true,
            checkOptionsJson: true,
          },
        }),
        tx.gameState.findUnique({
          where: { sessionScenarioId: params.sessionScenarioId },
          select: { flagsJson: true },
        }),
      ]);
      if (!node) {
        throw new BadRequestException({
          code: "MAIN_COMMAND_400",
          reason: "TRANSITION_TARGET_NOT_FOUND",
          message: "이동 대상 노드를 찾을 수 없습니다.",
        });
      }

      const runtime = await this.runtimeMaps.loadOrInitialize(tx, {
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        node,
      });
      const phase = this.toPhase(node.nodeType);
      const flags = this.parseFlags(state?.flagsJson);
      const updatedState = await tx.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: {
          version: { increment: 1 },
          currentNodeId: node.nodeId,
          phase,
          flagsJson: JSON.stringify({ ...flags, vttMap: runtime.map }),
        },
        select: { version: true },
      });
      await tx.session.updateMany({
        where: {
          id: params.sessionId,
          status: SessionStatus.RECRUITING,
        },
        data: { status: SessionStatus.PLAYING },
      });
      await tx.sessionNodeVisit.upsert({
        where: {
          sessionScenarioId_nodeId: {
            sessionScenarioId: params.sessionScenarioId,
            nodeId: node.nodeId,
          },
        },
        create: {
          sessionScenarioId: params.sessionScenarioId,
          sessionScenarioNodeId: node.id,
          nodeId: node.nodeId,
        },
        update: {
          sessionScenarioNodeId: node.id,
          visitCount: { increment: 1 },
        },
      });

      return {
        currentNodeId: node.nodeId,
        phase,
        stateVersion: updatedState.version,
        map: runtime.map,
        runtimeVersion: runtime.version,
        initialized: runtime.initialized,
      };
    });
  }

  private toPhase(nodeType: string): GamePhase {
    switch (nodeType) {
      case "exploration":
        return GamePhase.EXPLORATION;
      case "combat":
        return GamePhase.COMBAT;
      default:
        return GamePhase.DIALOGUE;
    }
  }

  private parseFlags(value: string | null | undefined): Record<string, unknown> {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
