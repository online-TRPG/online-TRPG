import { Injectable } from "@nestjs/common";

export type ScenarioCollaboratorRole = "owner" | "editor" | "reviewer" | "viewer";
export type ScenarioReviewStatus = "none" | "requested" | "approved" | "rejected" | "changes_requested";
export type ScenarioPublishVisibility = "public" | "link" | "private";

export type ScenarioCollaborator = {
  userId: string;
  role: ScenarioCollaboratorRole;
};

export type ScenarioReviewRecord = {
  reviewId: string;
  requestedByUserId: string;
  reviewerUserId: string;
  status: ScenarioReviewStatus;
  comment?: string | null;
  decidedAt?: string | null;
};

export type ScenarioPolicyNode = {
  id: string;
  nodeType: string;
  title: string;
  sceneText?: string | null;
  checkOptions?: unknown;
  nodeMeta?: unknown;
  transitions?: Array<{ nextNodeId?: string | null }>;
  fallbackNodeId?: string | null;
};

export type ScenarioPolicyDraft = {
  scenarioId: string;
  ownerUserId: string;
  license: "ORIGINAL" | "SRD5E" | "CC_BY" | "CC_BY_SA" | "OTHER";
  attribution?: string | null;
  collaborators: ScenarioCollaborator[];
  reviews: ScenarioReviewRecord[];
  nodes: ScenarioPolicyNode[];
};

export type ScenarioPolicyIssue = {
  code:
    | "FORBIDDEN_ROLE"
    | "PRIVATE_DATA_EXPOSED"
    | "ATTRIBUTION_REQUIRED"
    | "BROKEN_NODE_REFERENCE";
  severity: "blocker" | "warning";
  message: string;
  nodeId?: string | null;
  path?: string | null;
};

export type ScenarioPermissionCheck = {
  allowed: boolean;
  role: ScenarioCollaboratorRole | null;
  reason?: "not_collaborator" | "insufficient_role";
};

export type ScenarioRevisionDiff = {
  addedNodeIds: string[];
  removedNodeIds: string[];
  changedNodeIds: string[];
  changedSections: Record<string, string[]>;
};

export type ScenarioPublishPolicyResult = {
  allowed: boolean;
  visibility: ScenarioPublishVisibility;
  role: ScenarioCollaboratorRole | null;
  issues: ScenarioPolicyIssue[];
  diff: ScenarioRevisionDiff | null;
  validationReport: {
    status: "valid" | "invalid";
    issueCount: number;
    blockerCount: number;
    warningCount: number;
  };
};

const EDIT_ROLES = new Set<ScenarioCollaboratorRole>(["owner", "editor"]);
const REVIEW_REQUEST_ROLES = new Set<ScenarioCollaboratorRole>(["owner", "editor"]);
const REVIEW_ROLES = new Set<ScenarioCollaboratorRole>(["reviewer"]);
const PUBLISH_ROLES = new Set<ScenarioCollaboratorRole>(["owner"]);

@Injectable()
export class ScenarioCollaborationPolicyService {
  resolvePermission(params: {
    draft: ScenarioPolicyDraft;
    userId: string;
    action: "view" | "edit" | "request_review" | "review" | "publish" | "manage_collaborators";
  }): ScenarioPermissionCheck {
    const role = this.resolveRole(params.draft, params.userId);
    if (!role) {
      return { allowed: false, role: null, reason: "not_collaborator" };
    }
    const allowed =
      params.action === "view"
        ? true
        : params.action === "edit"
          ? EDIT_ROLES.has(role)
          : params.action === "request_review"
            ? REVIEW_REQUEST_ROLES.has(role)
          : params.action === "review"
            ? REVIEW_ROLES.has(role)
            : params.action === "publish" || params.action === "manage_collaborators"
              ? PUBLISH_ROLES.has(role)
              : false;
    return allowed
      ? { allowed, role }
      : { allowed, role, reason: "insufficient_role" };
  }

  evaluatePublishPolicy(params: {
    draft: ScenarioPolicyDraft;
    actorUserId: string;
    visibility: ScenarioPublishVisibility;
    previousRevisionNodes?: ScenarioPolicyNode[];
  }): ScenarioPublishPolicyResult {
    const permission = this.resolvePermission({
      draft: params.draft,
      userId: params.actorUserId,
      action: "publish",
    });
    const issues: ScenarioPolicyIssue[] = [];
    if (!permission.allowed) {
      issues.push({
        code: "FORBIDDEN_ROLE",
        severity: "blocker",
        message: "owner만 시나리오 revision을 발행할 수 있습니다.",
      });
    }

    issues.push(...this.validatePrivateDataExposure(params.draft));
    issues.push(...this.validateAttribution(params.draft));
    issues.push(...this.validateNodeReferences(params.draft));

    const blockerCount = issues.filter((issue) => issue.severity === "blocker").length;
    const warningCount = issues.filter((issue) => issue.severity === "warning").length;
    return {
      allowed: blockerCount === 0,
      visibility: params.visibility,
      role: permission.role,
      issues,
      diff: params.previousRevisionNodes
        ? this.diffNodes(params.previousRevisionNodes, params.draft.nodes)
        : null,
      validationReport: {
        status: blockerCount === 0 ? "valid" : "invalid",
        issueCount: issues.length,
        blockerCount,
        warningCount,
      },
    };
  }

  diffNodes(previous: ScenarioPolicyNode[], current: ScenarioPolicyNode[]): ScenarioRevisionDiff {
    const previousById = new Map(previous.map((node) => [node.id, node]));
    const currentById = new Map(current.map((node) => [node.id, node]));
    const addedNodeIds = current.filter((node) => !previousById.has(node.id)).map((node) => node.id).sort();
    const removedNodeIds = previous.filter((node) => !currentById.has(node.id)).map((node) => node.id).sort();
    const changedSections: Record<string, string[]> = {};

    for (const node of current) {
      const before = previousById.get(node.id);
      if (!before) continue;
      const sections = [
        ["title", before.title, node.title],
        ["sceneText", before.sceneText ?? null, node.sceneText ?? null],
        ["checkOptions", this.stableStringify(before.checkOptions), this.stableStringify(node.checkOptions)],
        ["nodeMeta", this.stableStringify(before.nodeMeta), this.stableStringify(node.nodeMeta)],
        ["transitions", this.stableStringify(before.transitions ?? []), this.stableStringify(node.transitions ?? [])],
        ["fallbackNodeId", before.fallbackNodeId ?? null, node.fallbackNodeId ?? null],
      ]
        .filter(([, left, right]) => left !== right)
        .map(([section]) => String(section));
      if (sections.length) {
        changedSections[node.id] = sections;
      }
    }

    return {
      addedNodeIds,
      removedNodeIds,
      changedNodeIds: Object.keys(changedSections).sort(),
      changedSections,
    };
  }

  private resolveRole(draft: ScenarioPolicyDraft, userId: string): ScenarioCollaboratorRole | null {
    if (draft.ownerUserId === userId) return "owner";
    return draft.collaborators.find((collaborator) => collaborator.userId === userId)?.role ?? null;
  }

  private validatePrivateDataExposure(draft: ScenarioPolicyDraft): ScenarioPolicyIssue[] {
    return draft.nodes.flatMap((node) => {
      const findings = [
        ...this.findPrivatePaths(node.nodeMeta, "nodeMeta"),
        ...this.findPrivatePaths(node.checkOptions, "checkOptions"),
      ];
      return findings.map((path) => ({
        code: "PRIVATE_DATA_EXPOSED" as const,
        severity: "blocker" as const,
        message: "공개 발행 전에 GM/private 전용 데이터 노출 표시를 제거하거나 공개 제외 처리해야 합니다.",
        nodeId: node.id,
        path,
      }));
    });
  }

  private validateAttribution(draft: ScenarioPolicyDraft): ScenarioPolicyIssue[] {
    if (draft.license === "ORIGINAL" || draft.license === "SRD5E") {
      return [];
    }
    return draft.attribution?.trim()
      ? []
      : [
          {
            code: "ATTRIBUTION_REQUIRED",
            severity: "blocker",
            message: "외부 라이선스 또는 OTHER 라이선스 시나리오는 attribution이 필요합니다.",
          },
        ];
  }

  private validateNodeReferences(draft: ScenarioPolicyDraft): ScenarioPolicyIssue[] {
    const nodeIds = new Set(draft.nodes.map((node) => node.id));
    const issues: ScenarioPolicyIssue[] = [];
    for (const node of draft.nodes) {
      for (const transition of node.transitions ?? []) {
        if (transition.nextNodeId && !nodeIds.has(transition.nextNodeId)) {
          issues.push({
            code: "BROKEN_NODE_REFERENCE",
            severity: "blocker",
            message: `존재하지 않는 전환 대상입니다: ${transition.nextNodeId}`,
            nodeId: node.id,
            path: "transitions.nextNodeId",
          });
        }
      }
      if (node.fallbackNodeId && !nodeIds.has(node.fallbackNodeId)) {
        issues.push({
          code: "BROKEN_NODE_REFERENCE",
          severity: "blocker",
          message: `존재하지 않는 fallback 대상입니다: ${node.fallbackNodeId}`,
          nodeId: node.id,
          path: "fallbackNodeId",
        });
      }
    }
    return issues;
  }

  private findPrivatePaths(value: unknown, path: string): string[] {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) {
      return value.flatMap((entry, index) => this.findPrivatePaths(entry, `${path}[${index}]`));
    }
    const record = value as Record<string, unknown>;
    return Object.entries(record).flatMap(([key, child]) => {
      const childPath = `${path}.${key}`;
      const normalizedKey = key.toLowerCase();
      const isPrivateKey =
        normalizedKey.includes("private") ||
        normalizedKey.includes("gmonly") ||
        normalizedKey.includes("gm_only") ||
        normalizedKey.includes("secretnote") ||
        normalizedKey.includes("secret_note");
      const isPrivateScope =
        normalizedKey === "scope" &&
        typeof child === "string" &&
        ["gm", "private", "owner"].includes(child.toLowerCase());
      return [
        ...(isPrivateKey || isPrivateScope ? [childPath] : []),
        ...this.findPrivatePaths(child, childPath),
      ];
    });
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return "null";
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((entry) => this.stableStringify(entry)).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
      .join(",")}}`;
  }
}
