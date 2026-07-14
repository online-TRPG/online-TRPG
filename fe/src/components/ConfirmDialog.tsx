import type { ReactNode } from 'react';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = '취소',
  busy = false,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const focus = useDialogFocusTrap<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={focus.dialogRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        onKeyDown={focus.onDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header"><h2 id="confirm-dialog-title">{title}</h2></div>
        <div>{children}</div>
        <div className="session-page-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>{cancelLabel}</button>
          <button type="button" className={danger ? 'danger-button' : 'primary'} disabled={busy} onClick={onConfirm}>
            {busy ? '처리 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
