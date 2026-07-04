import { useCallback, useMemo, useState } from 'react';
import type { LogEntry, SessionSnapshot } from '../../../types/session';
import {
  buildOwnRestRequestBannerPresentation,
  buildPendingRestApprovalViewModels,
  buildPendingRestApprovalBannerPresentation,
  getVisibleOwnRestRequest,
} from '../utils/restApprovalPresentation';

type SnapshotRestApproval = NonNullable<SessionSnapshot['pendingRestApprovals']>[number];

const EMPTY_REST_APPROVALS: SnapshotRestApproval[] = [];

type UseRestApprovalActionsParams = {
  logs: LogEntry[];
  snapshotApprovals?: SnapshotRestApproval[];
  userId: string;
  canUseHumanGmView: boolean;
  onApproveRestRequest: (actionId: string) => Promise<boolean> | boolean;
  onRejectRestRequest: (actionId: string) => Promise<boolean> | boolean;
  onCancelRestRequest: (actionId: string) => Promise<boolean> | boolean;
};

export function useRestApprovalActions(params: UseRestApprovalActionsParams) {
  const {
    logs,
    snapshotApprovals = EMPTY_REST_APPROVALS,
    userId,
    canUseHumanGmView,
    onApproveRestRequest,
    onRejectRestRequest,
    onCancelRestRequest,
  } = params;
  const [resolvedRestRequestIds, setResolvedRestRequestIds] = useState<Set<string>>(
    () => new Set(),
  );

  const markRestRequestResolved = useCallback((actionId: string) => {
    setResolvedRestRequestIds((current) => {
      const next = new Set(current);
      next.add(actionId);
      return next;
    });
  }, []);

  const pendingRestApprovals = useMemo(
    () =>
      buildPendingRestApprovalViewModels({
        logs,
        snapshotApprovals,
        resolvedRequestIds: resolvedRestRequestIds,
      }),
    [resolvedRestRequestIds, logs, snapshotApprovals],
  );

  const visibleRestApproval = canUseHumanGmView ? pendingRestApprovals[0] ?? null : null;
  const visibleOwnRestRequest = !canUseHumanGmView
    ? getVisibleOwnRestRequest({
        snapshotApprovals,
        userId,
        resolvedRequestIds: resolvedRestRequestIds,
      })
    : null;
  const visibleRestApprovalBanner =
    buildPendingRestApprovalBannerPresentation(visibleRestApproval);
  const visibleOwnRestRequestBanner =
    buildOwnRestRequestBannerPresentation(visibleOwnRestRequest);

  const handleApproveRestRequest = useCallback(async (actionId: string) => {
    const resolved = await onApproveRestRequest(actionId);
    if (resolved) {
      markRestRequestResolved(actionId);
    }
  }, [markRestRequestResolved, onApproveRestRequest]);

  const handleRejectRestRequest = useCallback(async (actionId: string) => {
    const resolved = await onRejectRestRequest(actionId);
    if (resolved) {
      markRestRequestResolved(actionId);
    }
  }, [markRestRequestResolved, onRejectRestRequest]);

  const handleCancelRestRequest = useCallback(async (actionId: string) => {
    const resolved = await onCancelRestRequest(actionId);
    if (resolved) {
      markRestRequestResolved(actionId);
    }
  }, [markRestRequestResolved, onCancelRestRequest]);

  const isRestRequestResolved = useCallback(
    (actionId: string) => resolvedRestRequestIds.has(actionId),
    [resolvedRestRequestIds],
  );

  return {
    visibleRestApprovalBanner,
    visibleOwnRestRequestBanner,
    handleApproveRestRequest,
    handleRejectRestRequest,
    handleCancelRestRequest,
    isRestRequestResolved,
  };
}
