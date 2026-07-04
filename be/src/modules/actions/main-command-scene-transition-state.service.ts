import { Injectable } from "@nestjs/common";
import { GamePhase as PrismaGamePhase } from "@prisma/client";
import { ScenarioNodeType } from "@trpg/shared-types";
import { badRequest } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import type { LoadedContext } from "./main-commands.service";

@Injectable()
export class MainCommandSceneTransitionStateService {
  constructor(private readonly prisma: PrismaService) {}

  async applySceneTransition(context: LoadedContext, targetNodeId: string): Promise<void> {
    const targetNode = await this.prisma.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: context.sessionScenarioId,
          nodeId: targetNodeId,
        },
      },
      select: {
        id: true,
        nodeId: true,
        nodeType: true,
        checkOptionsJson: true,
      },
    });

    if (!targetNode) {
      throw badRequest("MAIN_COMMAND_400", "이동 대상 노드를 찾을 수 없습니다.", {
        reason: "TRANSITION_TARGET_NOT_FOUND",
      });
    }

    const currentState = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: context.sessionScenarioId },
      select: { flagsJson: true },
    });
    const flags = this.parseJson<Record<string, unknown>>(currentState?.flagsJson, {});
    const targetDefaultMap = this.extractVttMapFromCheckOptions(targetNode.checkOptionsJson);

    await this.prisma.$transaction(async (tx) => {
      await tx.gameState.update({
        where: { sessionScenarioId: context.sessionScenarioId },
        data: {
          version: { increment: 1 },
          currentNodeId: targetNode.nodeId,
          phase: this.toPhaseForNodeType(this.toScenarioNodeType(targetNode.nodeType)),
          flagsJson: JSON.stringify({
            ...flags,
            ...(targetDefaultMap ? { vttMap: targetDefaultMap } : {}),
          }),
        },
      });

      await tx.sessionNodeVisit.upsert({
        where: {
          sessionScenarioId_nodeId: {
            sessionScenarioId: context.sessionScenarioId,
            nodeId: targetNode.nodeId,
          },
        },
        create: {
          sessionScenarioId: context.sessionScenarioId,
          sessionScenarioNodeId: targetNode.id,
          nodeId: targetNode.nodeId,
        },
        update: {
          sessionScenarioNodeId: targetNode.id,
          visitCount: { increment: 1 },
        },
      });
    });
  }

  private extractVttMapFromCheckOptions(value: string): Record<string, unknown> | null {
    const parsed = this.parseJson<unknown>(value, []);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return null;
    }

    const vttMap = (parsed as Record<string, unknown>).vttMap;
    if (!vttMap || typeof vttMap !== "object" || Array.isArray(vttMap)) {
      return null;
    }

    return vttMap as Record<string, unknown>;
  }

  private toScenarioNodeType(nodeType: string): ScenarioNodeType {
    switch (nodeType) {
      case ScenarioNodeType.EXPLORATION:
        return ScenarioNodeType.EXPLORATION;
      case ScenarioNodeType.COMBAT:
        return ScenarioNodeType.COMBAT;
      case ScenarioNodeType.STORY:
      default:
        return ScenarioNodeType.STORY;
    }
  }

  private toPhaseForNodeType(nodeType: ScenarioNodeType): PrismaGamePhase {
    switch (nodeType) {
      case ScenarioNodeType.EXPLORATION:
        return PrismaGamePhase.EXPLORATION;
      case ScenarioNodeType.COMBAT:
        return PrismaGamePhase.COMBAT;
      case ScenarioNodeType.STORY:
      default:
        return PrismaGamePhase.DIALOGUE;
    }
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
