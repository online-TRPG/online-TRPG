import type { HumanGmRevealOptionDto } from '@trpg/shared-types';

interface HumanGmQuickActionsProps {
  currentSceneTitle: string;
  revealOptions: HumanGmRevealOptionDto[];
  selectedRevealId: string;
  isRevealPending: boolean;
  feedback: string | null;
  canStartCombat: boolean;
  isCombatPending: boolean;
  onRevealSelectionChange: (contentId: string) => void;
  onReveal: () => void;
  onStartCombat: () => void;
}

export function HumanGmQuickActions({
  currentSceneTitle,
  revealOptions,
  selectedRevealId,
  isRevealPending,
  feedback,
  canStartCombat,
  isCombatPending,
  onRevealSelectionChange,
  onReveal,
  onStartCombat,
}: HumanGmQuickActionsProps) {
  return (
    <section className="human-gm-quick-actions" aria-labelledby="human-gm-quick-actions-title">
      <div>
        <span className="eyebrow">사람 GM 빠른 진행</span>
        <strong id="human-gm-quick-actions-title">현재 장면: {currentSceneTitle}</strong>
      </div>
      <div className="human-gm-quick-actions__controls">
        <label>
          플레이어에게 공개할 자료
          <select
            value={selectedRevealId}
            disabled={isRevealPending || !revealOptions.length}
            onChange={(event) => onRevealSelectionChange(event.target.value)}
          >
            {!revealOptions.length ? <option value="">공개할 자료 없음</option> : null}
            {revealOptions.map((option) => (
              <option key={option.contentId} value={option.contentId}>{option.title}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!selectedRevealId || isRevealPending} onClick={onReveal}>
          {isRevealPending ? '공개 중...' : '자료 공개'}
        </button>
        {canStartCombat ? (
          <button type="button" className="primary" disabled={isCombatPending} onClick={onStartCombat}>
            {isCombatPending ? '전투 준비 중...' : '전투 시작'}
          </button>
        ) : null}
      </div>
      {feedback ? <p role="status">{feedback}</p> : null}
    </section>
  );
}
