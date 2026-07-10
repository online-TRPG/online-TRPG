import { Injectable } from "@nestjs/common";
import { ScenarioNodeType, decodeScenarioTransitionArray } from "@trpg/shared-types";
import { parseJsonOrThrow } from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandTransitionEvaluatorService } from "./main-command-transition-evaluator.service";
import type { TransitionCandidate } from "./main-command-transition-evaluator.service";

@Injectable()
export class MainCommandTransitionCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mainCommandTransitionEvaluator: MainCommandTransitionEvaluatorService,
  ) {}

  async loadTransitionCandidates(context: LoadedContext): Promise<TransitionCandidate[]> {
    const transitions = parseJsonOrThrow(
      context.currentNodeTransitionsJson,
      [],
      decodeScenarioTransitionArray,
      "scenarioNode.transitionsJson",
    );
    const candidateStubs: Array<Omit<TransitionCandidate, "title" | "nodeType">> = [];
    for (const transition of transitions) {
      const nextNodeId = transition.nextNodeId?.trim() || null;
      if (nextNodeId) {
        candidateStubs.push({
          transitionId: transition.id?.trim() || null,
          label: transition.label?.trim() || null,
          condition: transition.condition?.trim() || null,
          conditionRule: this.mainCommandTransitionEvaluator.readTransitionConditionRule(transition.conditionRule),
          note: transition.note?.trim() || null,
          nodeId: nextNodeId,
          isFallback: false,
        });
      }
    }
    const hasExplicitTransition = candidateStubs.length > 0;
    if (context.currentNodeFallbackNodeId && !hasExplicitTransition) {
      candidateStubs.push({
        transitionId: null,
        label: "기본 이동",
        condition: "default",
        conditionRule: {
          logic: "ALL",
          requirements: [{ type: "ALWAYS" }],
        },
        note: null,
        nodeId: context.currentNodeFallbackNodeId,
        isFallback: true,
      });
    }

    if (!candidateStubs.length) {
      return [];
    }

    const nodes = await this.prisma.sessionScenarioNode.findMany({
      where: {
        sessionScenarioId: context.sessionScenarioId,
        nodeId: { in: Array.from(new Set(candidateStubs.map((candidate) => candidate.nodeId))) },
      },
      select: {
        nodeId: true,
        title: true,
        nodeType: true,
      },
    });

    const nodeByNodeId = new Map(nodes.map((node) => [node.nodeId, node]));
    return candidateStubs
      .flatMap((candidate) => {
        const node = nodeByNodeId.get(candidate.nodeId);
        if (!node) {
          return [];
        }
        return [{
          ...candidate,
          title: node.title,
          nodeType: this.toScenarioNodeType(node.nodeType),
        }];
      });
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
}
