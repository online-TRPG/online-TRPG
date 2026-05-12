import { useMemo, useState } from 'react';
import type {
  PlayerCheckOptionDto,
  PlayerScenarioNodeDto,
  PlayerVisibleTargetDto,
  SessionCharacterResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import { BattleMap } from '../../../components/BattleMap';
import { getClassLabel } from '../../../services/staticSrd';
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
  onMapChange: (map: VttMapStateDto) => void;
  selectedTargetId?: string;
  onSelectTarget?: (targetId: string) => void;
}

const targetTypeLabels: Partial<Record<PlayerVisibleTargetDto['targetType'], string>> = {
  NPC: 'NPC',
  OBJECT: '오브젝트',
  ACTOR: '전투원',
  AREA: '구역',
  POINT: '지점',
  SELF: '나',
};

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

function getTargetTypeLabel(targetType: PlayerVisibleTargetDto['targetType']) {
  return targetTypeLabels[targetType] ?? targetType;
}

function getPhaseLabel(phase: string | null | undefined) {
  if (!phase) return '상태 미확인';
  if (phase === 'combat') return '진행: 전투';
  if (phase === 'exploration') return '진행: 탐색';
  if (phase === 'dialogue') return '진행: 대화';
  if (phase === 'lobby') return '진행: 대기';
  if (phase === 'rest') return '진행: 휴식';
  return `진행: ${phase}`;
}

function getHpPercent(character: SessionCharacterResponseDto) {
  if (character.maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((character.currentHp / character.maxHp) * 100)));
}

function getCheckOptionLabel(option: PlayerCheckOptionDto, index: number) {
  return option.label || option.skill || option.type || `전투 판정 ${index + 1}`;
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
  onMapChange,
  selectedTargetId = '',
  onSelectTarget,
}: CombatNodeSurfaceProps) {
  const [activeTab, setActiveTab] = useState<CombatActionTab>('basic');
  const visibleTargets = node?.visibleTargets ?? [];
  const selectedTarget =
    visibleTargets.find((target) => target.id === selectedTargetId) ?? visibleTargets[0] ?? null;
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const currentTab = actionTabs.find((tab) => tab.id === activeTab) ?? actionTabs[0];
  // 전투 API 연결 전에는 파티 캐릭터 목록으로 턴 순서 자리를 먼저 채워 화면 구조를 검증합니다.
  const turnOrder = useMemo(
    () =>
      [...characters].sort((left, right) => {
        const leftMine = left.userId === currentUserId ? -1 : 0;
        const rightMine = right.userId === currentUserId ? -1 : 0;
        return leftMine - rightMine || left.name.localeCompare(right.name);
      }),
    [characters, currentUserId]
  );

  return (
    <div className="combat-node-surface">
      <header className="combat-turn-bar" aria-label="전투 턴 정보">
        <div>
          <span className="combat-node-eyebrow">전투 노드</span>
          <h1>{node?.title ?? scenarioTitle ?? '전투 진행 중'}</h1>
        </div>
        <div className="combat-round-status">
          <span>COMBAT</span>
          <span>{getPhaseLabel(phase)}</span>
          <span>라운드 -</span>
          {isGmView ? <span>GM 화면</span> : <span>플레이어 화면</span>}
        </div>
      </header>

      <section className="combat-initiative-strip" aria-label="턴 순서">
        <span className="combat-node-eyebrow">턴 순서</span>
        <div className="combat-turn-list">
          {turnOrder.length ? (
            turnOrder.map((character, index) => (
              <article
                key={character.id}
                className={`combat-turn-card${character.userId === currentUserId ? ' mine' : ''}`}
              >
                <span>{index + 1}</span>
                <strong>{character.name}</strong>
                <small>{getClassLabel(character.className)}</small>
              </article>
            ))
          ) : (
            <p>전투 참여자 정보가 아직 없습니다.</p>
          )}
        </div>
      </section>

      <div className="combat-node-content">
        <aside className="combat-party-rail" aria-label="파티 초상화">
          <span className="combat-node-eyebrow">Party</span>
          <div className="combat-party-list">
            {characters.length ? (
              characters.map((character) => {
                const hpPercent = getHpPercent(character);
                const isMine = character.userId === currentUserId;

                return (
                  <article key={character.id} className={`combat-party-card${isMine ? ' mine' : ''}`}>
                    <div className="combat-party-avatar">{character.name.slice(0, 1)}</div>
                    <div className="combat-party-body">
                      <strong>{character.name}</strong>
                      <span>AC {character.armorClass} / HP {character.currentHp}</span>
                      <div
                        className="combat-hp-track"
                        aria-label={`HP ${character.currentHp}/${character.maxHp}`}
                      >
                        <span style={{ width: `${hpPercent}%` }} />
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="combat-empty-text">파티 캐릭터 정보가 아직 없습니다.</p>
            )}
          </div>
        </aside>

        <main className="combat-map-panel" aria-label="전투 지도">
          {map ? (
            <BattleMap
              map={map}
              characters={characters}
              isHost={isHost}
              currentUserId={currentUserId}
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

        <aside className="combat-target-panel" aria-label="대상 정보">
          <section className="combat-panel-block">
            <div className="combat-panel-heading">
              <span className="combat-node-eyebrow">Target</span>
              <strong>대상 정보</strong>
            </div>
            {selectedTarget ? (
              <article className="combat-selected-target">
                <span>{getTargetTypeLabel(selectedTarget.targetType)}</span>
                <strong>{selectedTarget.name}</strong>
                <p>{selectedTarget.summary || '요약 정보가 아직 없습니다.'}</p>
              </article>
            ) : (
              <p className="combat-empty-text">선택 가능한 대상이 없습니다.</p>
            )}
          </section>

          <section className="combat-panel-block">
            <div className="combat-panel-heading">
              <span className="combat-node-eyebrow">Targets</span>
              <strong>공개 대상</strong>
            </div>
            {visibleTargets.length ? (
              <div className="combat-target-list">
                {visibleTargets.map((target) => (
                  <button
                    type="button"
                    key={target.id}
                    className={`combat-target-button${
                      selectedTarget?.id === target.id ? ' selected' : ''
                    }`}
                    onClick={() => onSelectTarget?.(target.id)}
                  >
                    <span>{getTargetTypeLabel(target.targetType)}</span>
                    <strong>{target.name}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <p className="combat-empty-text">현재 공개된 대상이 없습니다.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="combat-action-dock" aria-label="전투 행동">
        <div className="combat-resource-panel">
          <span className="combat-node-eyebrow">행동 자원</span>
          <strong>{myCharacter?.name ?? '캐릭터 미선택'}</strong>
          <div className="combat-resource-grid">
            <span>행동 -</span>
            <span>추가 행동 -</span>
            <span>반응 -</span>
            <span>이동 {myCharacter?.speed ?? '-'}ft</span>
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
              <button type="button" key={action}>
                {action}
              </button>
            ))}
          </div>
        </div>

        <div className="combat-check-panel">
          <span className="combat-node-eyebrow">판정 후보</span>
          {node?.checkOptions.length ? (
            <div className="combat-check-list">
              {node.checkOptions.map((option, index) => (
                <span key={`${getCheckOptionLabel(option, index)}-${index}`}>
                  {getCheckOptionLabel(option, index)}
                </span>
              ))}
            </div>
          ) : (
            <p>서버가 제안한 판정 후보가 아직 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}
