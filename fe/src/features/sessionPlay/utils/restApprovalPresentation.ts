import type { LogEntry, SessionSnapshot } from '../../../types/session';
import { stripScopePrefix } from './sessionLogPresentation';

export type PendingRestApprovalViewModel = {
  actionId: string;
  restType: 'short' | 'long' | null;
  requester: string;
  message: string;
  expiresAt: string | null;
};

type SnapshotRestApproval = NonNullable<SessionSnapshot['pendingRestApprovals']>[number];

export type RestApprovalBannerPresentation = {
  actionId: string;
  ariaLabel: string;
  eyebrow: string;
  title: string;
  message: string;
  approveLabel?: string;
  rejectLabel?: string;
  cancelLabel?: string;
};

export function buildPendingRestApprovalViewModels(params: {
  logs: LogEntry[];
  snapshotApprovals: SnapshotRestApproval[];
  resolvedRequestIds: ReadonlySet<string>;
  nowMs?: number;
}): PendingRestApprovalViewModel[] {
  const { logs, snapshotApprovals, resolvedRequestIds, nowMs = Date.now() } = params;
  const seenActionIds = new Set<string>();
  const resolvedActionIds = new Set<string>();

  for (const log of logs) {
    const approval = log.metadata?.restApproval;
    if (approval?.actionId && approval.status !== 'gm_required') {
      resolvedActionIds.add(approval.actionId);
    }
  }

  const logApprovals = logs
    .flatMap((log) => {
      const restApproval = log.metadata?.restApproval;
      if (
        !restApproval?.actionId ||
        restApproval.status !== 'gm_required' ||
        isExpiredRestApproval(restApproval.expiresAt, nowMs) ||
        resolvedRequestIds.has(restApproval.actionId) ||
        resolvedActionIds.has(restApproval.actionId) ||
        seenActionIds.has(restApproval.actionId)
      ) {
        return [];
      }

      seenActionIds.add(restApproval.actionId);
      const model: PendingRestApprovalViewModel = {
        actionId: restApproval.actionId,
        restType: restApproval.restType ?? null,
        requester: log.title,
        message: stripScopePrefix(log.message),
        expiresAt: restApproval.expiresAt ?? null,
      };
      return [model];
    });

  const snapshotApprovalModels = snapshotApprovals
    .flatMap((approval) => {
      if (
        !approval.actionId ||
        resolvedRequestIds.has(approval.actionId) ||
        resolvedActionIds.has(approval.actionId) ||
        seenActionIds.has(approval.actionId)
      ) {
        return [];
      }

      seenActionIds.add(approval.actionId);
      const model: PendingRestApprovalViewModel = {
        actionId: approval.actionId,
        restType: approval.restType,
        requester: approval.requesterDisplayName,
        message: formatSnapshotRestApprovalMessage(approval),
        expiresAt: approval.expiresAt ?? null,
      };
      return [model];
    });

  return [...logApprovals, ...snapshotApprovalModels];
}

export function getVisibleOwnRestRequest(params: {
  snapshotApprovals: SnapshotRestApproval[];
  userId: string;
  resolvedRequestIds: ReadonlySet<string>;
  nowMs?: number;
}): SnapshotRestApproval | null {
  const { snapshotApprovals, userId, resolvedRequestIds, nowMs = Date.now() } = params;

  return (
    snapshotApprovals.find(
      (approval) =>
        approval.requesterUserId === userId &&
        new Date(approval.expiresAt).getTime() > nowMs &&
        !resolvedRequestIds.has(approval.actionId)
    ) ?? null
  );
}

export function buildPendingRestApprovalBannerPresentation(
  approval: PendingRestApprovalViewModel | null,
): RestApprovalBannerPresentation | null {
  if (!approval) return null;

  return {
    actionId: approval.actionId,
    ariaLabel: '휴식 승인 대기',
    eyebrow: 'GM 승인 대기',
    title: `${getRestTypeLabel(approval.restType)} 요청`,
    message: `${approval.requester}: ${approval.message}`,
    approveLabel: '승인',
    rejectLabel: '거절',
  };
}

export function buildOwnRestRequestBannerPresentation(
  approval: SnapshotRestApproval | null,
): RestApprovalBannerPresentation | null {
  if (!approval) return null;

  return {
    actionId: approval.actionId,
    ariaLabel: '휴식 승인 대기',
    eyebrow: 'GM 승인 대기',
    title: `${getRestTypeLabel(approval.restType)} 요청`,
    message: 'GM이 결정하기 전까지 요청을 취소할 수 있습니다.',
    cancelLabel: '요청 취소',
  };
}

function formatSnapshotRestApprovalMessage(approval: SnapshotRestApproval): string {
  const restLabel = getRestTypeLabel(approval.restType);
  const characterLabel = approval.characterName ? `${approval.characterName}의 ` : '';

  return `${characterLabel}${restLabel} 요청이 GM 승인 대기 상태입니다.`;
}

function getRestTypeLabel(restType: 'short' | 'long' | null | undefined): string {
  return restType === 'long' ? '긴 휴식' : '짧은 휴식';
}

function isExpiredRestApproval(expiresAt: string | null | undefined, nowMs: number): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= nowMs);
}
