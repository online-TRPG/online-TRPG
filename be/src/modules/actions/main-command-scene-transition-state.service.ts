import { Injectable } from "@nestjs/common";
import { GamePhase as PrismaGamePhase } from "@prisma/client";
import {
  decodeScenarioNodeCheckOptionsConfig,
  ScenarioNodeType,
  type VttMapStateDto,
} from "@trpg/shared-types";
import { badRequest } from "../../common/exceptions/domain-error";
import {
  parseJsonOrThrow,
  parseJsonRecordOrThrow,
} from "../../common/utils/json-runtime";
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
    const flags = parseJsonRecordOrThrow(currentState?.flagsJson, {}, "gameState.flagsJson");
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

  private extractVttMapFromCheckOptions(value: string): VttMapStateDto | null {
    return parseJsonOrThrow(
      value,
      { checks: [], vttMap: null },
      decodeScenarioNodeCheckOptionsConfig,
      "scenarioNode.checkOptionsJson",
    ).vttMap;
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

}
