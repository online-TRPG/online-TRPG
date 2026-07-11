import { Injectable } from "@nestjs/common";
import { ScenarioNodeType, SubmitMainCommandDto } from "@trpg/shared-types";
import { readCompletedCombatNodeIds } from "../sessions/session-completion-flag-store.service";
import { MAIN_COMMAND_CONFIDENCE, TRANSITION_MATCH_POLICY } from "./main-command-policy.constants";

export type TransitionConditionEvaluation = {
  satisfied: boolean;
  needsReview: boolean;
  reason: string;
  matchedTerms: string[];
  missingTerms: string[];
};

export type TransitionConditionRequirementType = "ALWAYS" | "CLUE_REVEALED" | "COMBAT_RESOLVED" | "NODE_VISITED" | "FLAG_SET" | "GM_APPROVAL";

export type TransitionConditionRequirement = {
  type: TransitionConditionRequirementType;
  targetId?: string | null;
  flagKey?: string | null;
  flagValue?: string | null;
};

export type TransitionConditionRule = {
  logic: "ALL" | "ANY";
  requirements: TransitionConditionRequirement[];
};

export type TransitionConditionContractRequirement = {
  type: "ACTION_EVIDENCE" | "CLUE_REVEALED" | "CLUE_NOT_REVEALED" | "OBJECT_STATE" | "FLAG_SET" | "COMBAT_RESOLVED" | "GM_APPROVAL";
  text: string;
  polarity?: "MUST" | "MUST_NOT";
};

export type TransitionConditionCandidateContract = {
  transitionId?: string | null;
  targetNodeId: string;
  logic: "ALL" | "ANY";
  requirements: TransitionConditionContractRequirement[];
  confidence: number;
  rationale?: string | null;
};

export type TransitionCandidate = {
  transitionId: string | null;
  label: string | null;
  condition: string | null;
  conditionRule: TransitionConditionRule | null;
  note: string | null;
  nodeId: string;
  title: string;
  nodeType: ScenarioNodeType;
  isFallback: boolean;
};

export type EvaluatedTransitionCandidate = {
  target: TransitionCandidate;
  conditionResult: TransitionConditionEvaluation;
};

export type TransitionEvidence = {
  recentLogs: string[];
  revealedClues: string[];
  revealedClueIds: string[];
  unrevealedClues: string[];
  visitedNodeIds: string[];
  flags: Record<string, unknown>;
  currentNodeId: string;
  combatResolvedForCurrentNode: boolean;
};

const AUTO_TRANSITION_CONDITIONS = new Set([
  "",
  "default",
  "always",
  "auto",
  "automatic",
  "true",
  "none",
  "무조건",
  "무조건 가능",
  "항상",
  "항상 가능",
  "자동",
  "기본",
  "없음",
]);

const TRANSITION_CONDITION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "by",
  "condition",
  "default",
  "for",
  "from",
  "if",
  "in",
  "is",
  "next",
  "node",
  "of",
  "on",
  "or",
  "scene",
  "the",
  "then",
  "to",
  "when",
  "with",
  "경우",
  "그리고",
  "기본",
  "노드",
  "가능",
  "가능한",
  "가능해야",
  "다음",
  "때",
  "또는",
  "및",
  "밝혀야",
  "밝히기",
  "성공",
  "상태",
  "시",
  "이후",
  "이동",
  "이동가능",
  "완료",
  "하거나",
  "오브젝트",
  "요구",
  "필요",
  "필요함",
  "장면",
  "전",
  "전이",
  "조건",
  "후",
]);

@Injectable()
export class MainCommandTransitionEvaluatorService {
  matchTransitionCandidate(candidates: TransitionCandidate[], dto: SubmitMainCommandDto): TransitionCandidate | null {
    if (dto.targetId) {
      const normalizedTargetId = dto.targetId.trim().toLowerCase();
      const direct = candidates.find((candidate) =>
        compactPresentStrings([candidate.nodeId, candidate.transitionId, candidate.label])
          .some((value) => value.trim().toLowerCase() === normalizedTargetId),
      );
      if (direct) {
        return direct;
      }
    }

    const normalizedText = dto.playerText.trim().toLowerCase();
    return (
      candidates.find((candidate) =>
        compactPresentStrings([candidate.nodeId, candidate.transitionId, candidate.title, candidate.label, candidate.condition])
          .some((value) => normalizedText.includes(value.trim().toLowerCase())),
      ) ?? null
    );
  }

  evaluateTransitionCondition(candidate: TransitionCandidate, recentLogs: string[], publicClues: string[], evidence?: TransitionEvidence): TransitionConditionEvaluation {
    if (candidate.conditionRule && evidence) {
      return this.evaluateStructuredTransitionCondition(candidate, evidence);
    }

    const condition = candidate.condition?.trim() ?? "";
    if (this.isAutoTransitionCondition(condition)) {
      return {
        satisfied: true,
        needsReview: false,
        reason: "조건 없이 이동 가능한 연결입니다.",
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const normalizedCondition = this.normalizeTransitionConditionText(condition);
    const evidenceText = this.normalizeTransitionConditionText(
      compactPresentStrings([
        ...recentLogs.slice(-8).filter((line) => !this.isSceneTransitionLogLine(line)),
        ...publicClues,
      ]).join(" "),
    );

    if (normalizedCondition && evidenceText.includes(normalizedCondition)) {
      return {
        satisfied: true,
        needsReview: false,
        reason: "장면 진행 조건을 만족했습니다.",
        matchedTerms: [condition],
        missingTerms: [],
      };
    }

    const alternatives = this.extractTransitionConditionAlternatives(condition);
    const candidateTermGroups = alternatives.length
      ? alternatives.map((alternative) => this.extractTransitionConditionTerms(alternative))
      : [this.extractTransitionConditionTerms(condition)];
    const nonEmptyTermGroups = candidateTermGroups.filter((terms) => terms.length > 0);
    const conditionTerms = this.dedupeTerms(nonEmptyTermGroups.flat());
    if (!conditionTerms.length) {
      return {
        satisfied: false,
        needsReview: true,
        reason: `장면 이동 조건 "${condition}"을 자동으로 판정하기 어렵습니다. GM 확인이 필요합니다.`,
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const evaluations = nonEmptyTermGroups.map((terms) => {
      const matchedTerms = terms.filter((term) => evidenceText.includes(term));
      const missingTerms = terms.filter((term) => !evidenceText.includes(term));
    const requiredMatchCount = terms.length <= TRANSITION_MATCH_POLICY.EXACT_MATCH_TERM_LIMIT
      ? terms.length
      : Math.ceil(terms.length * TRANSITION_MATCH_POLICY.PARTIAL_MATCH_RATIO);
      return {
        terms,
        matchedTerms,
        missingTerms,
        requiredMatchCount,
      };
    });
    const satisfiedEvaluation = evaluations.find((evaluation) => evaluation.matchedTerms.length >= evaluation.requiredMatchCount);

    if (satisfiedEvaluation) {
      return {
        satisfied: true,
        needsReview: false,
        reason: "장면 진행 조건을 만족했습니다.",
        matchedTerms: satisfiedEvaluation.matchedTerms,
        missingTerms: satisfiedEvaluation.missingTerms,
      };
    }

    const bestEvaluation =
      evaluations
        .filter((evaluation) => evaluation.matchedTerms.length > 0)
        .sort((left, right) => {
          const leftScore = left.matchedTerms.length / left.terms.length;
          const rightScore = right.matchedTerms.length / right.terms.length;
          return rightScore - leftScore;
        })[0] ?? null;

    if (bestEvaluation) {
      return {
        satisfied: false,
        needsReview: true,
        reason: `장면 이동 조건 "${condition}"을 아직 만족하지 못했습니다. 조건을 만족하는 행동이나 단서가 기록되어 있는지 확인해주세요.`,
        matchedTerms: bestEvaluation.matchedTerms,
        missingTerms: bestEvaluation.missingTerms,
      };
    }

    return {
      satisfied: false,
      needsReview: false,
      reason: "아직 앞으로 나아갈 길을 찾지 못했습니다.",
      matchedTerms: [],
      missingTerms: conditionTerms,
    };
  }

  evaluateTransitionConditionContract(contract: TransitionConditionCandidateContract, evidence: TransitionEvidence): TransitionConditionEvaluation {
    if (!contract.requirements.length) {
      return {
        satisfied: false,
        needsReview: true,
        reason: "장면 이동 조건을 구조화하지 못했습니다. GM 확인이 필요합니다.",
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const results = contract.requirements.map((requirement) => {
      const satisfied = this.evaluateTransitionRequirement(requirement, evidence);
      return {
        requirement,
        satisfied,
        label: `${requirement.type}:${requirement.text}`,
      };
    });
    const satisfied = contract.logic === "ANY" ? results.some((result) => result.satisfied) : results.every((result) => result.satisfied);
    const matchedTerms = results.filter((result) => result.satisfied).map((result) => result.label);
    const missingTerms = results.filter((result) => !result.satisfied).map((result) => result.label);

    if (satisfied) {
      return {
        satisfied: true,
        needsReview: false,
        reason: "장면 진행 조건을 만족했습니다.",
        matchedTerms,
        missingTerms,
      };
    }

    const requiresGmApproval = results.some(
      (result) =>
        result.requirement.type === "GM_APPROVAL" ||
        contract.confidence < MAIN_COMMAND_CONFIDENCE.DEFAULT_GM_REVIEW_THRESHOLD,
    );

    return {
      satisfied: false,
      needsReview: requiresGmApproval || matchedTerms.length > 0,
      reason: matchedTerms.length
        ? `장면 이동 조건을 일부만 확인했습니다. 부족한 조건: ${missingTerms.join(", ")}`
        : `아직 장면 이동 조건을 만족하지 못했습니다. 필요한 조건: ${missingTerms.join(", ")}`,
      matchedTerms,
      missingTerms,
    };
  }

  normalizeTransitionConditionText(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  textEvidenceMatches(needle: string, normalizedEvidenceText: string): boolean {
    const normalizedNeedle = this.normalizeTransitionConditionText(needle);
    if (!normalizedNeedle) {
      return false;
    }
    if (normalizedEvidenceText.includes(normalizedNeedle)) {
      return true;
    }

    const terms = this.extractTransitionConditionTerms(normalizedNeedle);
    if (!terms.length) {
      return false;
    }
    const matchedCount = terms.filter((term) => normalizedEvidenceText.includes(term)).length;
    const requiredMatchCount = terms.length <= TRANSITION_MATCH_POLICY.EXACT_MATCH_TERM_LIMIT
      ? terms.length
      : Math.ceil(terms.length * TRANSITION_MATCH_POLICY.PARTIAL_MATCH_RATIO);
    return matchedCount >= requiredMatchCount;
  }

  readTransitionConditionRule(value: unknown): TransitionConditionRule | null {
    if (!this.isRecord(value)) {
      return null;
    }
    const logic = value.logic === "ANY" ? "ANY" : "ALL";
    const rawRequirements = Array.isArray(value.requirements) ? value.requirements : [];
    const requirements: TransitionConditionRequirement[] = rawRequirements.reduce<TransitionConditionRequirement[]>((acc, item) => {
      if (!this.isRecord(item)) {
        return acc;
      }
      const rawType = this.readString(item.type);
      const type = this.readTransitionRequirementType(rawType);
      if (!type) {
        return acc;
      }
      acc.push({
        type,
        targetId: this.readString(item.targetId),
        flagKey: this.readString(item.flagKey),
        flagValue: this.readString(item.flagValue),
      });
      return acc;
    }, []);

    return requirements.length ? { logic, requirements } : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private evaluateStructuredTransitionCondition(candidate: TransitionCandidate, evidence: TransitionEvidence): TransitionConditionEvaluation {
    const rule = candidate.conditionRule;
    if (!rule || !rule.requirements.length) {
      return {
        satisfied: false,
        needsReview: true,
        reason: "장면 이동 조건을 구조화하지 못했습니다. GM 확인이 필요합니다.",
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const results = rule.requirements.map((requirement) => ({
      requirement,
      satisfied: this.evaluateStructuredTransitionRequirement(requirement, evidence),
      label: this.describeTransitionRequirement(requirement, evidence),
    }));
    const satisfied = rule.logic === "ANY" ? results.some((result) => result.satisfied) : results.every((result) => result.satisfied);
    const matchedTerms = results.filter((result) => result.satisfied).map((result) => result.label);
    const missingTerms = results.filter((result) => !result.satisfied).map((result) => result.label);
    const hasMissingGmApproval = results.some((result) => result.requirement.type === "GM_APPROVAL" && !result.satisfied);

    if (satisfied) {
      return {
        satisfied: true,
        needsReview: false,
        reason: "장면 진행 조건을 만족했습니다.",
        matchedTerms,
        missingTerms,
      };
    }

    return {
      satisfied: false,
      needsReview: hasMissingGmApproval,
      reason: hasMissingGmApproval ? "이 분기는 GM 승인이 필요합니다." : "아직 앞으로 나아갈 길을 찾지 못했습니다.",
      matchedTerms,
      missingTerms,
    };
  }

  private evaluateStructuredTransitionRequirement(requirement: TransitionConditionRequirement, evidence: TransitionEvidence): boolean {
    switch (requirement.type) {
      case "ALWAYS":
        return true;
      case "CLUE_REVEALED":
        return Boolean(requirement.targetId && evidence.revealedClueIds.includes(requirement.targetId));
      case "COMBAT_RESOLVED": {
        const targetNodeId = requirement.targetId || evidence.currentNodeId;
        const completedCombatNodeIds = readCompletedCombatNodeIds(evidence.flags);
        return completedCombatNodeIds.includes(targetNodeId);
      }
      case "NODE_VISITED": {
        const targetNodeId = requirement.targetId || evidence.currentNodeId;
        return evidence.visitedNodeIds.includes(targetNodeId);
      }
      case "FLAG_SET": {
        if (!requirement.flagKey) return false;
        const value = evidence.flags[requirement.flagKey];
        if (requirement.flagValue === undefined || requirement.flagValue === null || requirement.flagValue === "") {
          return value !== undefined && value !== null && value !== false;
        }
        return String(value) === requirement.flagValue;
      }
      case "GM_APPROVAL":
        return false;
      default:
        return false;
    }
  }

  private describeTransitionRequirement(requirement: TransitionConditionRequirement, evidence: TransitionEvidence): string {
    switch (requirement.type) {
      case "ALWAYS":
        return "항상 가능";
      case "CLUE_REVEALED":
        return `단서 공개:${requirement.targetId ?? "미지정"}`;
      case "COMBAT_RESOLVED":
        return `전투 종료:${requirement.targetId || evidence.currentNodeId}`;
      case "NODE_VISITED":
        return `노드 방문:${requirement.targetId || evidence.currentNodeId}`;
      case "FLAG_SET":
        return requirement.flagValue
          ? `상태 플래그:${requirement.flagKey ?? "미지정"}=${requirement.flagValue}`
          : `상태 플래그:${requirement.flagKey ?? "미지정"}`;
      case "GM_APPROVAL":
        return "GM 승인";
      default:
        return "알 수 없는 조건";
    }
  }

  private evaluateTransitionRequirement(requirement: TransitionConditionContractRequirement, evidence: TransitionEvidence): boolean {
    const polarity = requirement.polarity ?? "MUST";
    const positiveResult = (() => {
      switch (requirement.type) {
        case "ACTION_EVIDENCE":
        case "OBJECT_STATE":
          return this.textEvidenceMatches(requirement.text, this.normalizeTransitionConditionText(evidence.recentLogs.join(" ")));
        case "CLUE_REVEALED":
          return this.textEvidenceMatches(requirement.text, this.normalizeTransitionConditionText(evidence.revealedClues.join(" ")));
        case "CLUE_NOT_REVEALED":
          return !this.textEvidenceMatches(requirement.text, this.normalizeTransitionConditionText(evidence.revealedClues.join(" ")));
        case "COMBAT_RESOLVED":
          return (
            evidence.combatResolvedForCurrentNode ||
            this.textEvidenceMatches(requirement.text || "전투 종료", this.normalizeTransitionConditionText(evidence.recentLogs.join(" ")))
          );
        case "FLAG_SET":
          return this.textEvidenceMatches(requirement.text, this.normalizeTransitionConditionText(JSON.stringify(evidence.flags)));
        case "GM_APPROVAL":
          return false;
        default:
          return false;
      }
    })();

    return polarity === "MUST_NOT" ? !positiveResult : positiveResult;
  }

  isAutoTransitionCondition(condition: string): boolean {
    return AUTO_TRANSITION_CONDITIONS.has(this.normalizeTransitionConditionText(condition));
  }

  private isSceneTransitionLogLine(line: string): boolean {
    const normalized = line.trim();
    return normalized.includes("/장면진행") || normalized.includes("화면으로 이동했습니다") || normalized.includes("장면으로 이동했습니다");
  }

  private extractTransitionConditionTerms(condition: string): string[] {
    return this.dedupeTerms(
      this.normalizeTransitionConditionText(condition)
        .split(" ")
        .map((term) => this.stripKoreanCaseMarker(term))
        .filter((term) => term.length >= 2)
        .filter((term) => !TRANSITION_CONDITION_STOP_WORDS.has(term)),
    );
  }

  private extractTransitionConditionAlternatives(condition: string): string[] {
    return condition
      .split(/\b(?:or)\b|또는|혹은|아니면|하거나|거나|든지|던지/iu)
      .map((alternative) => alternative.trim())
      .flatMap((alternative) => compactPresentStrings([alternative]));
  }

  private dedupeTerms(terms: string[]): string[] {
    const seen = new Set<string>();
    return terms.filter((term) => {
      if (seen.has(term)) {
        return false;
      }
      seen.add(term);
      return true;
    });
  }

  private stripKoreanCaseMarker(term: string): string {
    return term
      .replace(/(해야만|해야|하여야|했으면|했을|했다|한다|했고|하고|하기|하거나|되었으면|되었을|되었다|되면|었으면|았으면|었을|았을|었다|았다|으면)$/u, "")
      .replace(/(으로는|으로서|으로써|에서|에게|부터|까지|처럼|보다|으로|로|은|는|이|가|을|를|에|의|도|만|와|과)$/u, "");
  }

  private readTransitionRequirementType(value: string | null): TransitionConditionRequirementType | null {
    switch (value) {
      case "ALWAYS":
      case "CLUE_REVEALED":
      case "COMBAT_RESOLVED":
      case "NODE_VISITED":
      case "FLAG_SET":
      case "GM_APPROVAL":
        return value;
      default:
        return null;
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}

function compactPresentStrings(value: readonly unknown[]): string[] {
  return value.flatMap((item) => (typeof item === "string" && item ? [item] : []));
}
