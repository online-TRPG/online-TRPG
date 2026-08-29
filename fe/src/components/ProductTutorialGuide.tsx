import type { UserProductProgressResponseDto } from '@trpg/shared-types';
import type { AuthMode } from '../types/auth';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';
import './ProductTutorialGuide.css';

type TutorialView = 'main' | 'characters' | 'sessionsNew' | 'gameroom' | string;

interface ProductTutorialGuideProps {
  activeView: TutorialView;
  authMode: AuthMode | null;
  progress: UserProductProgressResponseDto | null;
  loading: boolean;
  busy: boolean;
  onStart: () => void;
  onDismiss: () => void;
  onOpenCharacters: () => void;
  onOpenSessionCreate: () => void;
  onDismissCoachmark: (coachmark: string) => void;
}

const playCoachmarks = [
  {
    id: 'action_and_chat',
    title: '행동과 대화',
    description: '캐릭터의 행동은 행동 입력에, 플레이어끼리 나누는 말은 채팅에 입력합니다.',
  },
  {
    id: 'read_result',
    title: '판정 결과 읽기',
    description: '주사위 결과와 적용된 보정, 성공 여부는 행동 뒤에 나타나는 결과 카드에서 확인합니다.',
  },
  {
    id: 'hint_and_summary',
    title: '힌트와 요약',
    description: '진행이 막히거나 지난 내용을 확인하고 싶을 때 /힌트 또는 /요약을 요청할 수 있습니다.',
  },
] as const;

export function ProductTutorialGuide({
  activeView,
  authMode,
  progress,
  loading,
  busy,
  onStart,
  onDismiss,
  onOpenCharacters,
  onOpenSessionCreate,
  onDismissCoachmark,
}: ProductTutorialGuideProps) {
  const proposalOpen = Boolean(
    !loading && progress && !progress.tutorialStartedAt && !progress.completedAt && !progress.dismissedAt && activeView === 'main',
  );
  const proposalFocus = useDialogFocusTrap<HTMLElement>(proposalOpen, onDismiss);
  if (loading || !progress) return null;

  const tutorialDecided = Boolean(progress.tutorialStartedAt || progress.completedAt || progress.dismissedAt);
  if (!tutorialDecided && activeView === 'main') {
    return (
      <section
        ref={proposalFocus.dialogRef}
        tabIndex={-1}
        className="product-tutorial-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        onKeyDown={proposalFocus.onDialogKeyDown}
      >
        <div className="product-tutorial-card">
          <p className="product-tutorial-eyebrow">처음 오셨나요?</p>
          <h2 id="tutorial-title">첫 플레이 흐름을 짧게 안내해드릴게요</h2>
          <p>기존 캐릭터 생성과 세션 생성 화면을 차례로 살펴보고, AI GM과 1인 세션으로 첫 행동까지 진행합니다.</p>
          {authMode === 'guest' ? (
            <p className="product-tutorial-guest-note">
              게스트 데이터는 7일간 보존됩니다. 나중에 계정을 저장하면 만든 캐릭터와 진행 기록을 이어갈 수 있습니다.
            </p>
          ) : null}
          <div className="product-tutorial-actions">
            <button type="button" onClick={onStart} disabled={busy}>시작</button>
            <button type="button" className="secondary" onClick={onDismiss} disabled={busy}>건너뛰기</button>
          </div>
        </div>
      </section>
    );
  }

  const tutorialActive = Boolean(progress.tutorialStartedAt && !progress.completedAt && !progress.dismissedAt);
  if (tutorialActive && activeView === 'characters') {
    return (
      <aside className="product-tutorial-guide" aria-label="첫 플레이 안내">
        <strong>1. 플레이할 캐릭터 만들기</strong>
        <span>이 화면에서 새 캐릭터를 만드세요. 이미 사용할 캐릭터가 있다면 바로 다음 단계로 넘어가도 됩니다.</span>
        <div className="product-tutorial-actions">
          <button type="button" onClick={onOpenSessionCreate}>다음: 세션 만들기</button>
          <button type="button" className="secondary" onClick={onDismiss}>안내 끝내기</button>
        </div>
      </aside>
    );
  }

  if (tutorialActive && activeView === 'sessionsNew') {
    return (
      <aside className="product-tutorial-guide" aria-label="첫 플레이 안내">
        <strong>2. 기존 방식으로 1인 세션 만들기</strong>
        <span>원하는 시나리오를 고르고 GM을 ‘AI GM’, 총 인원을 1명으로 설정해 세션을 만드세요. 별도 체험 세션은 생성되지 않습니다.</span>
        <button type="button" className="secondary" onClick={onDismiss}>안내 끝내기</button>
      </aside>
    );
  }

  if (tutorialActive && activeView === 'main') {
    return (
      <aside className="product-tutorial-guide" aria-label="첫 플레이 안내">
        <strong>첫 플레이 안내를 이어갈 수 있습니다</strong>
        <div className="product-tutorial-actions">
          <button type="button" onClick={onOpenCharacters}>캐릭터 만들기부터 계속</button>
          <button type="button" className="secondary" onClick={onDismiss}>안내 끝내기</button>
        </div>
      </aside>
    );
  }

  if (activeView === 'gameroom' && progress.tutorialStartedAt) {
    const coachmark = playCoachmarks.find((item) => !progress.dismissedCoachmarks.includes(item.id));
    if (!coachmark) return null;
    return (
      <aside className="product-tutorial-guide product-tutorial-play-guide" aria-label="첫 플레이 조작 안내">
        <strong>{coachmark.title}</strong>
        <span>{coachmark.description}</span>
        <button type="button" onClick={() => onDismissCoachmark(coachmark.id)}>확인</button>
      </aside>
    );
  }

  return null;
}
