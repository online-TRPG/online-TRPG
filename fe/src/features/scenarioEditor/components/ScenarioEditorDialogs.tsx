import type { FormEvent } from 'react';
import { useDialogFocusTrap } from '../../../hooks/useDialogFocusTrap';
import type { ScenarioPublicationVisibility } from '../hooks/useScenarioPublicationForm';

interface ScenarioPublicationDialogProps {
  open: boolean;
  busy: boolean;
  status: string | null;
  visibility: ScenarioPublicationVisibility;
  changelog: string;
  rightsBasis: string;
  rightsConfirmed: boolean;
  forkAllowed: boolean;
  onVisibilityChange: (value: ScenarioPublicationVisibility) => void;
  onChangelogChange: (value: string) => void;
  onRightsBasisChange: (value: string) => void;
  onRightsConfirmedChange: (value: boolean) => void;
  onForkAllowedChange: (value: boolean) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ScenarioPublicationDialog({
  open,
  busy,
  status,
  visibility,
  changelog,
  rightsBasis,
  rightsConfirmed,
  forkAllowed,
  onVisibilityChange,
  onChangelogChange,
  onRightsBasisChange,
  onRightsConfirmedChange,
  onForkAllowedChange,
  onClose,
  onSubmit,
}: ScenarioPublicationDialogProps) {
  const focus = useDialogFocusTrap<HTMLElement>(open, onClose);
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={focus.dialogRef}
        className="modal-card scenario-publication-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-publication-title"
        tabIndex={-1}
        onKeyDown={focus.onDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">공개 설정</span>
            <h2 id="scenario-publication-title">시나리오 발행</h2>
          </div>
          <button type="button" className="modal-close" disabled={busy} onClick={onClose}>닫기</button>
        </div>
        <form className="scenario-publication-form" onSubmit={onSubmit}>
          <label>
            발행 범위
            <select
              value={visibility}
              onChange={(event) => onVisibilityChange(event.target.value as ScenarioPublicationVisibility)}
            >
              <option value="public">공개 목록에 표시</option>
              <option value="link">링크를 아는 사람만 열기</option>
              <option value="private">나만 보기</option>
            </select>
          </label>
          <label>
            이번 버전의 변경 내역 (선택)
            <textarea value={changelog} onChange={(event) => onChangelogChange(event.target.value)} maxLength={500} rows={3} />
          </label>
          {visibility !== 'private' ? (
            <>
              <label>
                공개 가능 근거·출처
                <textarea
                  value={rightsBasis}
                  onChange={(event) => onRightsBasisChange(event.target.value)}
                  placeholder="예: 직접 창작, CC BY 4.0 출처 URL, 사용 허가 내역"
                  rows={3}
                />
              </label>
              <label className="scenario-publication-check">
                <input type="checkbox" checked={rightsConfirmed} onChange={(event) => onRightsConfirmedChange(event.target.checked)} />
                <span>직접 창작했거나 공개·재배포 권한이 있으며, 타인의 유료 시나리오·이미지·지도·텍스트를 무단으로 포함하지 않았습니다.</span>
              </label>
              <label className="scenario-publication-check">
                <input type="checkbox" checked={forkAllowed} onChange={(event) => onForkAllowedChange(event.target.checked)} />
                <span>다른 사용자가 이 버전을 독립 시나리오로 복제하는 것을 허용합니다.</span>
              </label>
            </>
          ) : null}
          {status ? <p className="panel-error" role="status">{status}</p> : null}
          <div className="session-page-actions">
            <button type="button" className="ghost" disabled={busy} onClick={onClose}>취소</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? '발행 중...' : '발행하기'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

interface ScenarioAssetDeleteDialogProps {
  open: boolean;
  fileName: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ScenarioAssetDeleteDialog({
  open,
  fileName,
  busy = false,
  onClose,
  onConfirm,
}: ScenarioAssetDeleteDialogProps) {
  const focus = useDialogFocusTrap<HTMLElement>(open, onClose);
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={focus.dialogRef}
        className="modal-card scenario-asset-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-asset-delete-title"
        tabIndex={-1}
        onKeyDown={focus.onDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="scenario-asset-delete-title">이미지 삭제</h2>
        </div>
        <p>라이브러리에서 <strong>{fileName}</strong>을(를) 삭제할까요?</p>
        <p>현재 시나리오에서 이 이미지를 사용하는 장면이나 맵의 연결도 함께 제거됩니다.</p>
        <div className="session-page-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>취소</button>
          <button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>{busy ? '삭제 중...' : '삭제'}</button>
        </div>
      </section>
    </div>
  );
}
