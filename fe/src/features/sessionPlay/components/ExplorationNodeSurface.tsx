import { useMemo, useState } from 'react';
import type {
  PlayerCheckOptionDto,
  PlayerScenarioNodeDto,
  PlayerVisibleTargetDto,
  SessionCharacterResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import { BattleMap } from '../../../components/BattleMap';
import { getCharacterClassLabel, getCharacterImage } from '../utils/characterVisuals';
import './ExplorationNodeSurface.css';

type ExplorationActionTab = 'explore' | 'interact' | 'item';

interface ExplorationNodeSurfaceProps {
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
  ACTOR: '인물',
  AREA: '구역',
  POINT: '지점',
  SELF: '나',
};

const actionTabs: Array<{ id: ExplorationActionTab; label: string; actions: string[] }> = [
  {
    id: 'explore',
    label: '탐색',
    actions: ['주변 관찰', '자세히 조사', '소리 듣기', '위험 감지'],
  },
  {
    id: 'interact',
    label: '상호작용',
    actions: ['대상 확인', '문 열기', '함정 확인', '상호작용 요청'],
  },
  {
    id: 'item',
    label: '아이템',
    actions: ['아이템 사용', '도구 사용', '빛 비추기', '기록 확인'],
  },
];

function getTargetTypeLabel(targetType: PlayerVisibleTargetDto['targetType']) {
  return targetTypeLabels[targetType] ?? targetType;
}

function getPhaseLabel(phase: string | null | undefined) {
  if (!phase) return '상태 미확인';
  if (phase === 'exploration') return '진행: 탐색';
  if (phase === 'dialogue') return '진행: 대화';
  if (phase === 'combat') return '진행: 전투';
  if (phase === 'lobby') return '진행: 대기';
  if (phase === 'rest') return '진행: 휴식';
  return `진행: ${phase}`;
}

function getHpPercent(character: SessionCharacterResponseDto) {
  if (character.maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((character.currentHp / character.maxHp) * 100)));
}

function getCheckOptionLabel(option: PlayerCheckOptionDto, index: number) {
  return option.label || option.skill || option.type || `판정 후보 ${index + 1}`;
}

function splitSceneParagraphs(sceneText: string | undefined) {
  const paragraphs = (sceneText ?? '')
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : ['현재 탐색 지역 설명이 아직 준비되지 않았습니다.'];
}

export function ExplorationNodeSurface({
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
}: ExplorationNodeSurfaceProps) {
  const [activeTab, setActiveTab] = useState<ExplorationActionTab>('explore');
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const visibleTargets = node?.visibleTargets ?? [];
  const selectedTarget =
    visibleTargets.find((target) => target.id === selectedTargetId) ?? visibleTargets[0] ?? null;
  const currentTab = actionTabs.find((tab) => tab.id === activeTab) ?? actionTabs[0];
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;

  return (
    <div className="exploration-node-surface">
      <header className="exploration-node-header">
        <div className="exploration-node-title-row">
          <span className="exploration-node-eyebrow">탐색 노드</span>
          <h1>{node?.title ?? scenarioTitle ?? '탐색 중인 지역'}</h1>
          <button
            type="button"
            className={`exploration-node-summary-button${isSummaryOpen ? ' active' : ''}`}
            onClick={() => setSummaryOpen((current) => !current)}
            aria-expanded={isSummaryOpen}
            aria-controls="exploration-node-summary-popover"
          >
            장면 설명
          </button>
        </div>

        <div className="exploration-node-status-row" aria-label="탐색 상태">
          <span>EXPLORATION</span>
          <span>{getPhaseLabel(phase)}</span>
          {isGmView ? <span>GM 화면</span> : <span>플레이어 화면</span>}
        </div>
      </header>

      {isSummaryOpen ? (
        <div
          id="exploration-node-summary-popover"
          className="exploration-node-summary-popover"
          role="dialog"
          aria-label="장면 설명"
        >
          <div className="exploration-node-summary-popover-head">
            <strong>장면 설명</strong>
            <button type="button" onClick={() => setSummaryOpen(false)}>
              닫기
            </button>
          </div>
          <div className="exploration-node-summary-popover-body">
            {sceneParagraphs.map((paragraph, index) => (
              <p key={`${paragraph.slice(0, 20)}-${index}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="exploration-node-content">
        <main className="exploration-map-column">
          <section className="exploration-map-panel" aria-label="탐색 지도">
            <aside className="exploration-party-overlay" aria-label="파티 상태">
              <div className="exploration-party-list">
                {characters.length ? (
                  characters.map((character) => {
                    const hpPercent = getHpPercent(character);
                    const isMine = character.userId === currentUserId;
                    const characterImage = getCharacterImage(character);

                    return (
                      <article
                        key={character.id}
                        className={`exploration-party-card${isMine ? ' mine' : ''}`}
                        title={`${character.name} / ${getCharacterClassLabel(character.className)} Lv ${character.level} / HP ${character.currentHp}/${character.maxHp}`}
                      >
                        <div className="exploration-party-avatar">
                          <img src={characterImage} alt={character.name} />
                          <span
                            className="exploration-party-damage"
                            style={{ height: `${100 - hpPercent}%` }}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="exploration-party-body">
                          <div className="exploration-party-line">
                            <strong>{character.name}</strong>
                            <span>Lv {character.level}</span>
                          </div>
                          <span className="exploration-party-hp">
                            {character.currentHp}/{character.maxHp}
                          </span>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="exploration-empty-text">파티 캐릭터 정보가 아직 없습니다.</p>
                )}
              </div>
            </aside>
            {map ? (
              <BattleMap
                map={map}
                characters={characters}
                isHost={isHost}
                currentUserId={currentUserId}
                interactionMode="session"
                onChange={onMapChange}
                title={node?.title ?? '탐색 지도'}
              />
            ) : (
              <div className="exploration-map-placeholder">
                <span>탐색 지도</span>
                <strong>맵을 불러오는 중입니다</strong>
              </div>
            )}
          </section>
        </main>

        <aside className="exploration-target-panel" aria-label="선택 대상 정보">
          <section className="exploration-panel-block">
            <div className="exploration-panel-heading">
              <span className="exploration-node-eyebrow">Target</span>
              <strong>선택 대상</strong>
            </div>
            {selectedTarget ? (
              <article className="exploration-selected-target">
                <span>{getTargetTypeLabel(selectedTarget.targetType)}</span>
                <strong>{selectedTarget.name}</strong>
                <p>{selectedTarget.summary || '요약 정보가 아직 없습니다.'}</p>
              </article>
            ) : (
              <p className="exploration-empty-text">선택 가능한 공개 대상이 없습니다.</p>
            )}
          </section>

          <section className="exploration-panel-block">
            <div className="exploration-panel-heading">
              <span className="exploration-node-eyebrow">Visible</span>
              <strong>공개 대상</strong>
            </div>
            {visibleTargets.length ? (
              <div className="exploration-target-list">
                {visibleTargets.map((target) => (
                  <button
                    type="button"
                    key={target.id}
                    className={`exploration-target-button${
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
              <p className="exploration-empty-text">현재 공개된 대상이 없습니다.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="exploration-action-dock" aria-label="탐색 행동">
        <div className="exploration-actor-status">
          <span className="exploration-node-eyebrow">현재 조작 캐릭터</span>
          <strong>{myCharacter?.name ?? '캐릭터 미선택'}</strong>
          <p>
            {selectedTarget
              ? `${selectedTarget.name} 대상 선택 중`
              : '대상 또는 위치를 선택하세요.'}
          </p>
        </div>

        <div className="exploration-action-panel">
          <div className="exploration-action-tabs" role="tablist" aria-label="탐색 행동 유형">
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

          <div className="exploration-action-list">
            {currentTab.actions.map((action) => (
              <button type="button" key={action}>
                {action}
              </button>
            ))}
          </div>
        </div>

        <div className="exploration-check-panel">
          <span className="exploration-node-eyebrow">판정 후보</span>
          {node?.checkOptions.length ? (
            <div className="exploration-check-list">
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
