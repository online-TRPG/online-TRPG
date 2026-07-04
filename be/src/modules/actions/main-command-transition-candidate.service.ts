import { Injectable } from "@nestjs/common";
import { ScenarioNodeType } from "@trpg/shared-types";
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
    const transitions = this.parseJson<Record<string, unknown>[]>(context.currentNodeTransitionsJson, []);
    const candidateStubs: Array<Omit<TransitionCandidate, "title" | "nodeType">> = [];
    for (const transition of transitions) {
      const nextNodeId = this.readString(transition.nextNodeId);
      if (nextNodeId) {
        candidateStubs.push({
          transitionId: this.readString(transition.id),
          label: this.readString(transition.label),
          condition: this.readString(transition.condition),
          conditionRule: this.mainCommandTransitionEvaluator.readTransitionConditionRule(transition.conditionRule),
          note: this.readString(transition.note),
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
      .map((candidate) => {
        const node = nodeByNodeId.get(candidate.nodeId);
        if (!node) {
          return null;
        }
        return {
          ...candidate,
          title: node.title,
          nodeType: this.toScenarioNodeType(node.nodeType),
        };
      })
      .filter((candidate): candidate is TransitionCandidate => Boolean(candidate));
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

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
