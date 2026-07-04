import { Injectable } from "@nestjs/common";
import { GamePhase as PrismaGamePhase } from "@prisma/client";
import { MainCommandResponseDto, MainCommandStatus, ScenarioNodeType } from "@trpg/shared-types";
import type { EvaluatedTransitionCandidate, TransitionCandidate, TransitionConditionEvaluation } from "./main-command-transition-evaluator.service";

@Injectable()
export class MainCommandSceneTransitionResponseService {
  buildResolvedResponse(
    requestId: string,
    target: TransitionCandidate,
    conditionResult: TransitionConditionEvaluation,
  ): MainCommandResponseDto {
    return {
      requestId,
      status: MainCommandStatus.RESOLVED,
      message: `${target.title} 화면으로 이동했습니다.`,
      data: {
        transitionCondition: target.condition ?? null,
        transitionLabel: target.label ?? null,
        conditionMatchedTerms: conditionResult.matchedTerms,
      },
      statePatch: {
        currentNodeId: target.nodeId,
        nodeType: target.nodeType,
        phase: this.toPhaseForNodeType(target.nodeType),
      },
    };
  }

  buildBlockedResponse(
    requestId: string,
    target: TransitionCandidate,
    conditionResult: TransitionConditionEvaluation,
  ): MainCommandResponseDto {
    return {
      requestId,
      status: conditionResult.needsReview ? MainCommandStatus.GM_APPROVAL_REQUIRED : MainCommandStatus.IMPOSSIBLE,
      message: conditionResult.reason,
      data: {
        transitionCondition: target.condition ?? null,
        matchedTerms: conditionResult.matchedTerms,
        missingTerms: conditionResult.missingTerms,
      },
    };
  }

  buildNoCandidatesResponse(requestId: string): MainCommandResponseDto {
    return {
      requestId,
      status: MainCommandStatus.IMPOSSIBLE,
      message: "현재 화면에서 이동 가능한 다음 노드가 없습니다.",
    };
  }

  buildAmbiguousDestinationResponse(requestId: string, candidates: EvaluatedTransitionCandidate[]): MainCommandResponseDto {
    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `이동 가능한 분기가 여러 개입니다. 목적지를 지정해주세요. 가능한 목적지: ${candidates.map((item) => item.target.title).join(", ")}`,
    };
  }

  buildNoSatisfiedTransitionResponse(requestId: string, candidates: EvaluatedTransitionCandidate[]): MainCommandResponseDto {
    const blockedCandidates = candidates.filter((candidate) => candidate.conditionResult.missingTerms.length);
    return {
      requestId,
      status: MainCommandStatus.IMPOSSIBLE,
      message: "아직 앞으로 나아갈 길을 찾지 못했습니다.",
      data: {
        transitionConditions: blockedCandidates.map((candidate) => ({
          targetNodeId: candidate.target.nodeId,
          targetTitle: candidate.target.title,
          transitionCondition: candidate.target.condition ?? null,
          missingTerms: candidate.conditionResult.missingTerms,
        })),
      },
    };
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
