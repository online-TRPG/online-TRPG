import { useMemo, useState } from 'react';
import type {
  PlayerCheckOptionDto,
  PlayerScenarioNodeDto,
  CombatResponseDto,
  SessionCharacterResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import { BattleMap } from '../../../components/BattleMap';
import { getCharacterClassLabel } from '../utils/characterVisuals';
import './CombatNodeSurface.css';

type CombatActionTab = 'basic' | 'ability' | 'item';

interface CombatNodeSurfaceProps {
  node: PlayerScenarioNodeDto | null;
  scenarioTitle?: string | null;
  phase?: string | null;
  characters: SessionCharacterResponseDto[];
  currentUserId: string;
  isHost: boolean;
  isGmView?: boolean;
  map: VttMapStateDto | null;
  combat: CombatResponseDto | null;
  combatError?: string | null;
  isCombatBusy?: boolean;
  onMapChange: (map: VttMapStateDto) => void;
  onStartCombat: () => void;
  onEndTurn: (force?: boolean) => void;
  onApplyDamage: (targetParticipantId: string, amount: number, healing?: boolean) => void;
  onResolveAttack: (params: {
    attackerParticipantId: string;
    targetParticipantId: string;
    attackBonus: number;
    damageDice: string;
    damageBonus: number;
  }) => void;
}

const actionTabs: Array<{ id: CombatActionTab; label: string; actions: string[] }> = [
  {
    id: 'basic',
    label: '일반',
    actions: ['이동', '공격', '대시', '회피', '도움', '숨기', '상호작용', '턴 종료'],
  },
  {
    id: 'ability',
    label: '능력',
    actions: ['특수 행동', '전술 질문', '준비 행동', '반응 요청'],
  },
  {
    id: 'item',
    label: '아이템',
    actions: ['아이템 사용', '주문 사용', '도구 사용', '임기응변'],
  },
];

function getPhaseLabel(phase: string | null | undefined) {
  if (!phase) return '상태 미확인';
  if (phase === 'combat') return '진행: 전투';
  if (phase === 'exploration') return '진행: 탐색';
  if (phase === 'dialogue') return '진행: 대화';
  if (phase === 'lobby') return '진행: 대기';
  if (phase === 'rest') return '진행: 휴식';
  return `진행: ${phase}`;
}

function getCheckOptionLabel(option: PlayerCheckOptionDto, index: number) {
  return option.label || option.skill || option.type || `전투 판정 가이드 ${index + 1}`;
}

function splitSceneParagraphs(sceneText: string | undefined) {
  const paragraphs = (sceneText ?? '')
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : ['현재 전투 장면 설명이 아직 준비되지 않았습니다.'];
}

export function CombatNodeSurface({
  node,
  scenarioTitle,
  phase,
  characters,
  currentUserId,
  isHost,
  isGmView = false,
  map,
  combat,
  combatError = null,
  isCombatBusy = false,
  onMapChange,
  onStartCombat,
  onEndTurn,
  onApplyDamage,
  onResolveAttack,
}: CombatNodeSurfaceProps) {
  const [activeTab, setActiveTab] = useState<CombatActionTab>('basic');
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [damageAmount, setDamageAmount] = useState('1');
  const [attackBonus, setAttackBonus] = useState('0');
  const [damageDice, setDamageDice] = useState('1d6');
  const [damageBonus, setDamageBonus] = useState('0');
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const myCombatParticipant =
    combat?.participants.find((participant) => participant.sessionCharacterId === myCharacter?.id) ?? null;
  const myActionResources = myCombatParticipant?.actionResources ?? null;
  const currentParticipant =
    combat?.participants.find((participant) => participant.sessionEntityId === combat.currentEntityId) ?? null;
  const selectedTarget =
    combat?.participants.find((participant) => participant.sessionEntityId === selectedTargetId) ?? null;
  const currentTab = actionTabs.find((tab) => tab.id === activeTab) ?? actionTabs[0];
  const turnOrder = combat?.participants ?? [];
  const activeParticipantCount = turnOrder.filter((participant) => participant.isAlive).length;

  function hpPercent(currentHp: number | null, maxHp: number | null) {
    if (!currentHp || !maxHp || maxHp <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((currentHp / maxHp) * 100)));
  }

  function numeric(value: string, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return (
    <div className="combat-node-surface">
      <header className="combat-turn-bar" aria-label="전투 턴 정보">
        <div className="combat-node-title-row">
          <span className="combat-node-eyebrow">전투 노드</span>
          <h1>{node?.title ?? scenarioTitle ?? '전투 진행 중'}</h1>
          <button
            type="button"
            className={`combat-node-summary-button${isSummaryOpen ? ' active' : ''}`}
            onClick={() => setSummaryOpen((current) => !current)}
            aria-expanded={isSummaryOpen}
            aria-controls="combat-node-summary-popover"
          >
            장면 설명
          </button>
        </div>
        <div className="combat-round-status">
          <span>COMBAT</span>
          <span>{getPhaseLabel(phase)}</span>
          <span>라운드 {combat?.roundNo ?? '-'}</span>
          <span>
            라운드 턴 {combat ? `${combat.roundTurnNo}/${Math.max(activeParticipantCount, 1)}` : '-'}
          </span>
          <span>현재 턴 {currentParticipant?.name ?? '-'}</span>
          {isGmView ? <span>GM 화면</span> : <span>플레이어 화면</span>}
        </div>
      </header>

      {isSummaryOpen ? (
        <div
          id="combat-node-summary-popover"
          className="combat-node-summary-popover"
          role="dialog"
          aria-label="장면 설명"
        >
          <div className="combat-node-summary-popover-head">
            <strong>장면 설명</strong>
            <button type="button" onClick={() => setSummaryOpen(false)}>
              닫기
            </button>
          </div>
          <div className="combat-node-summary-popover-body">
            {sceneParagraphs.map((paragraph, index) => (
              <p key={`${paragraph.slice(0, 20)}-${index}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      ) : null}

      <section className="combat-initiative-strip" aria-label="턴 순서">
        <div className="combat-tracker-head">
          <span className="combat-node-eyebrow">턴 순서</span>
          {!combat && isGmView ? (
            <button type="button" disabled={isCombatBusy} onClick={onStartCombat}>
              전투 시작
            </button>
          ) : combat ? (
            <button type="button" disabled={isCombatBusy} onClick={() => onEndTurn(isGmView)}>
              턴 종료
            </button>
          ) : null}
        </div>
        {combatError ? <p className="combat-error">{combatError}</p> : null}
        <div className="combat-turn-list">
          {turnOrder.length ? (
            turnOrder.map((participant, index) => (
              <article
                key={participant.sessionEntityId}
                className={[
                  'combat-turn-card',
                  participant.sessionEntityId === combat?.currentEntityId ? 'active' : '',
                  participant.sessionCharacterId === myCharacter?.id ? 'mine' : '',
                  !participant.isAlive ? 'defeated' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span>{index + 1}</span>
                <strong>{participant.name}</strong>
                <small>
                  AC {participant.armorClass ?? '-'} · HP {participant.currentHp ?? '-'}/
                  {participant.maxHp ?? '-'}
                </small>
                <em>
                  {participant.sessionEntityId === combat?.currentEntityId
                    ? '진행 중'
                    : participant.hasActedThisRound
                      ? '완료'
                      : participant.isAlive
                        ? '대기'
                        : '전투 불능'}
                </em>
                <div className="combat-hp-bar" aria-label="HP">
                  <span style={{ width: `${hpPercent(participant.currentHp, participant.maxHp)}%` }} />
                </div>
              </article>
            ))
          ) : (
            <p>전투가 아직 시작되지 않았습니다.</p>
          )}
        </div>
      </section>

      <div className="combat-node-content">
        <main className="combat-map-panel" aria-label="전투 지도">
          {map ? (
            <BattleMap
              map={map}
              characters={characters}
              isHost={isHost}
              currentUserId={currentUserId}
              interactionMode="session"
              onChange={onMapChange}
              title={node?.title ?? '전투 지도'}
            />
          ) : (
            <div className="combat-map-placeholder">
              <span>전투 지도</span>
              <strong>맵을 불러오는 중입니다</strong>
            </div>
          )}
        </main>
      </div>

      <section className="combat-action-dock" aria-label="전투 행동">
        <div className="combat-resource-panel">
          <span className="combat-node-eyebrow">행동 자원</span>
          <strong>{myCharacter?.name ?? '캐릭터 미선택'}</strong>
          <div className="combat-resource-grid">
            <span>현재 턴 {currentParticipant?.name ?? '-'}</span>
            <span>내 차례 {myCombatParticipant?.sessionEntityId === combat?.currentEntityId ? '예' : '아니오'}</span>
            <span>내 HP {myCombatParticipant?.currentHp ?? myCharacter?.currentHp ?? '-'}</span>
            <span>행동 {myActionResources ? (myActionResources.actionAvailable ? '가능' : '사용됨') : '-'}</span>
            <span>
              추가 행동 {myActionResources ? (myActionResources.bonusActionAvailable ? '가능' : '없음') : '-'}
            </span>
            <span>반응 {myActionResources ? (myActionResources.reactionAvailable ? '가능' : '사용됨') : '-'}</span>
            <span>
              이동{' '}
              {myActionResources
                ? `${myActionResources.movementFtRemaining}/${myActionResources.movementFtTotal}ft`
                : `${myCharacter?.speed ?? '-'}ft`}
            </span>
          </div>
        </div>

        <div className="combat-action-panel">
          <div className="combat-action-tabs" role="tablist" aria-label="전투 행동 유형">
            {actionTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? 'active' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="combat-action-list">
            {currentTab.actions.map((action) => (
              <button
                type="button"
                key={action}
                disabled={action === '턴 종료' ? !combat || isCombatBusy : true}
                onClick={() => {
                  if (action === '턴 종료') onEndTurn(false);
                }}
              >
                {action}
              </button>
            ))}
          </div>
        </div>

        <div className="combat-check-panel">
          <span className="combat-node-eyebrow">전투 처리</span>
          {combat ? (
            <div className="combat-resolver">
              <label>
                대상
                <select value={selectedTargetId} onChange={(event) => setSelectedTargetId(event.target.value)}>
                  <option value="">선택</option>
                  {combat.participants.map((participant) => (
                    <option key={participant.sessionEntityId} value={participant.sessionEntityId}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="combat-resolver-row">
                <label>
                  공격 보너스
                  <input value={attackBonus} onChange={(event) => setAttackBonus(event.target.value)} />
                </label>
                <label>
                  피해 주사위
                  <input value={damageDice} onChange={(event) => setDamageDice(event.target.value)} />
                </label>
                <label>
                  피해 보너스
                  <input value={damageBonus} onChange={(event) => setDamageBonus(event.target.value)} />
                </label>
              </div>
              <button
                type="button"
                disabled={!selectedTarget || !currentParticipant || isCombatBusy}
                onClick={() =>
                  currentParticipant &&
                  selectedTarget &&
                  onResolveAttack({
                    attackerParticipantId: currentParticipant.sessionEntityId,
                    targetParticipantId: selectedTarget.sessionEntityId,
                    attackBonus: numeric(attackBonus, 0),
                    damageDice,
                    damageBonus: numeric(damageBonus, 0),
                  })
                }
              >
                현재 턴 공격 굴림
              </button>
              <div className="combat-resolver-row">
                <input value={damageAmount} onChange={(event) => setDamageAmount(event.target.value)} />
                <button
                  type="button"
                  disabled={!selectedTarget || isCombatBusy}
                  onClick={() => selectedTarget && onApplyDamage(selectedTarget.sessionEntityId, numeric(damageAmount, 0))}
                >
                  피해 적용
                </button>
                <button
                  type="button"
                  disabled={!selectedTarget || isCombatBusy}
                  onClick={() =>
                    selectedTarget && onApplyDamage(selectedTarget.sessionEntityId, numeric(damageAmount, 0), true)
                  }
                >
                  회복 적용
                </button>
              </div>
            </div>
          ) : node?.checkOptions.length ? (
            <div className="combat-check-list">
              {node.checkOptions.map((option, index) => (
                <span key={`${getCheckOptionLabel(option, index)}-${index}`}>
                  {getCheckOptionLabel(option, index)}
                </span>
              ))}
            </div>
          ) : (
            <p>전투 시작 후 참여자와 HP가 표시됩니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}
