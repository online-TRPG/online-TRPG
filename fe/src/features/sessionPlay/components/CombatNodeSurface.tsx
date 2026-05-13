import { useMemo, useState } from 'react';
import type {
  PlayerCheckOptionDto,
  PlayerScenarioNodeDto,
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
  onMapChange: (map: VttMapStateDto) => void;
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
  onMapChange,
}: CombatNodeSurfaceProps) {
  const [activeTab, setActiveTab] = useState<CombatActionTab>('basic');
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
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
          <span>라운드 -</span>
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
                <small>{getCharacterClassLabel(character.className)}</small>
              </article>
            ))
          ) : (
            <p>전투 참여자 정보가 아직 없습니다.</p>
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
          <span className="combat-node-eyebrow">판정 가이드</span>
          {node?.checkOptions.length ? (
            <div className="combat-check-list">
              {node.checkOptions.map((option, index) => (
                <span key={`${getCheckOptionLabel(option, index)}-${index}`}>
                  {getCheckOptionLabel(option, index)}
                </span>
              ))}
            </div>
          ) : (
            <p>설정된 판정 가이드가 아직 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}
