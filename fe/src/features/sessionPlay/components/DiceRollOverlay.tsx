import { useCallback, useEffect, useRef, useState } from 'react';
import './DiceRollOverlay.css';

export type DiceRollOutcome = 'SUCCESS' | 'FAILURE' | 'NO_ROLL' | 'IMPOSSIBLE';
export type DiceAdvantage = 'NORMAL' | 'ADVANTAGE' | 'DISADVANTAGE';

// useSession 이 turn.log.created 이벤트에서 추출해 채우는 오버레이 표시 데이터.
export interface DiceRollOverlayData {
  // turnLogId — React key 겸 중복 트리거 차단용.
  id: string;
  actorName: string;
  // 스킬명("손재주") / "공격" / 주사위 수식 등 큰 제목.
  title: string;
  // "민첩 판정" / "공격 판정" 같은 부제. 없으면 null.
  subtitle: string | null;
  // "난이도" / "방어도" 등 목표 수치 라벨. 목표 수치 없으면 null.
  targetLabel: string | null;
  targetValue: number | null;
  // 1차 주사위가 d20 인지. d20 이 아니면 텀블 연출 대신 결과 카드만 보여준다.
  isD20: boolean;
  // 유리함/불리함까지 반영해 최종 선택된 d20 원본 눈.
  naturalRoll: number;
  // 원본 굴림값 전체 (유리/불리 시 2개).
  rolls: number[];
  modifier: number;
  total: number;
  expression: string;
  advantage: DiceAdvantage;
  outcome: DiceRollOutcome;
}

interface DiceRollOverlayProps {
  data: DiceRollOverlayData | null;
  onDismiss: () => void;
}

// 텀블(주사위 구르는 연출) 지속 시간.
const TUMBLE_MS = 1200;
// 비-d20 굴림의 짧은 진입 연출 시간.
const SETTLE_MS = 420;
// 결과 공개 후 자동으로 사라지기까지 유지 시간.
const HOLD_MS = 2500;
// 퇴장 페이드아웃 트랜지션 시간 (CSS 와 일치시켜야 함).
const EXIT_MS = 300;

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

// 외부 래퍼: data 가 바뀌면 key 로 내부 컴포넌트를 통째로 remount 해서 연출을 처음부터 다시 재생한다.
export function DiceRollOverlay({ data, onDismiss }: DiceRollOverlayProps) {
  if (!data) {
    return null;
  }
  return <DiceRollOverlayInner key={data.id} data={data} onDismiss={onDismiss} />;
}

function DiceRollOverlayInner({
  data,
  onDismiss,
}: {
  data: DiceRollOverlayData;
  onDismiss: () => void;
}) {
  const [phase, setPhase] = useState<'tumbling' | 'revealed' | 'leaving'>('tumbling');
  // 텀블 중 빠르게 바뀌는 숫자. d20 이면 1, 아니면 최종값으로 시작.
  const [displayRoll, setDisplayRoll] = useState<number>(() =>
    data.isD20 ? 1 : data.naturalRoll,
  );
  const dismissedRef = useRef(false);

  const handleDismiss = useCallback(() => {
    if (dismissedRef.current) {
      return;
    }
    dismissedRef.current = true;
    setPhase('leaving');
    window.setTimeout(onDismiss, EXIT_MS);
  }, [onDismiss]);

  // 진입 → 결과 공개. d20 이면 숫자를 빠르게 굴리다가 멈춘다.
  useEffect(() => {
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 모션 최소화 선호 시 숫자 깜빡임 없이 곧바로 결과만 공개한다.
    if (!data.isD20 || reduceMotion) {
      setDisplayRoll(data.naturalRoll);
      const revealTimer = window.setTimeout(() => setPhase('revealed'), SETTLE_MS);
      return () => window.clearTimeout(revealTimer);
    }

    const interval = window.setInterval(() => {
      setDisplayRoll(Math.floor(Math.random() * 20) + 1);
    }, 70);
    const revealTimer = window.setTimeout(() => {
      window.clearInterval(interval);
      setDisplayRoll(data.naturalRoll);
      setPhase('revealed');
    }, TUMBLE_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(revealTimer);
    };
  }, [data]);

  // 결과 공개 후 일정 시간 뒤 자동 퇴장.
  useEffect(() => {
    if (phase !== 'revealed') {
      return undefined;
    }
    const timer = window.setTimeout(handleDismiss, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase, handleDismiss]);

  const isCrit = data.isD20 && data.naturalRoll === 20;
  const isFumble = data.isD20 && data.naturalRoll === 1;
  const showBanner =
    phase === 'revealed' && (data.outcome === 'SUCCESS' || data.outcome === 'FAILURE');

  const backdropClass = [
    'dice-overlay-backdrop',
    phase === 'leaving' ? 'is-leaving' : 'is-entering',
  ].join(' ');

  const dieClass = [
    'dice-overlay-die',
    phase === 'tumbling' ? 'is-tumbling' : 'is-revealed',
    isCrit ? 'is-crit' : '',
    isFumble ? 'is-fumble' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={backdropClass}
      role="alertdialog"
      aria-live="assertive"
      aria-label={`${data.actorName}의 ${data.title} 주사위 결과`}
      onClick={handleDismiss}
    >
      <div className="dice-overlay-panel" onClick={(event) => event.stopPropagation()}>
        <div className="dice-overlay-heading">
          <span className="dice-overlay-actor">{data.actorName}</span>
          <h2 className="dice-overlay-title">{data.title}</h2>
          {data.subtitle ? (
            <span className="dice-overlay-subtitle">{data.subtitle}</span>
          ) : null}
        </div>

        {data.targetValue !== null ? (
          <div className="dice-overlay-target">
            <span className="dice-overlay-target-label">
              {data.targetLabel ?? '목표'}
            </span>
            <span className="dice-overlay-target-value">{data.targetValue}</span>
          </div>
        ) : null}

        <div className="dice-overlay-stage">
          {data.isD20 ? (
            <div className={dieClass} aria-hidden="true">
              <div className="dice-overlay-die-face">
                <span className="dice-overlay-die-value">{displayRoll}</span>
              </div>
            </div>
          ) : (
            <div className="dice-overlay-roll-card" aria-hidden="true">
              <span className="dice-overlay-roll-expression">{data.expression}</span>
              <span className="dice-overlay-roll-total">{data.total}</span>
            </div>
          )}
        </div>

        {phase === 'revealed' ? (
          <div className="dice-overlay-breakdown">
            {data.advantage !== 'NORMAL' && data.rolls.length > 1 ? (
              <span className="dice-overlay-advantage">
                {data.advantage === 'ADVANTAGE' ? '유리함' : '불리함'} (
                {data.rolls.join(', ')})
              </span>
            ) : null}
            {data.isD20 ? (
              <span className="dice-overlay-equation">
                <strong>{data.naturalRoll}</strong>
                {data.modifier !== 0 ? (
                  <>
                    {' '}
                    {formatSigned(data.modifier)} ={' '}
                    <strong className="dice-overlay-equation-total">{data.total}</strong>
                  </>
                ) : null}
              </span>
            ) : (
              <span className="dice-overlay-equation">
                {data.expression} ={' '}
                <strong className="dice-overlay-equation-total">{data.total}</strong>
              </span>
            )}
          </div>
        ) : null}

        {showBanner ? (
          <div
            className={`dice-overlay-banner is-${data.outcome === 'SUCCESS' ? 'success' : 'failure'}`}
          >
            {data.outcome === 'SUCCESS' ? '성공' : '실패'}
          </div>
        ) : null}
      </div>
    </div>
  );
}
