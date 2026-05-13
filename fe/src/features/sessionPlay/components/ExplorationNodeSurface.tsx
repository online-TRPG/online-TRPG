import { useMemo, useState } from 'react';
import type {
  InventoryItemDto,
  PlayerScenarioNodeDto,
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
  inventory: InventoryItemDto[];
  inventoryFeedback?: string | null;
  isBusy?: boolean;
  onMapChange: (map: VttMapStateDto) => void;
  onUseInventoryItem: (item: InventoryItemDto) => void;
}

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

function splitSceneParagraphs(sceneText: string | undefined) {
  const paragraphs = (sceneText ?? '')
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : ['현재 탐색 지역 설명이 아직 준비되지 않았습니다.'];
}

function getInventoryItemKey(item: InventoryItemDto) {
  return [item.itemType, item.itemDefinitionId, item.name, ...(item.properties ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isQuickUsableItem(item: InventoryItemDto) {
  const key = getInventoryItemKey(item);
  return (
    item.quantity > 0 &&
    (key.includes('consumable') ||
      key.includes('potion') ||
      key.includes('포션') ||
      key.includes('healing'))
  );
}

function getItemMetaLabel(item: InventoryItemDto) {
  const labels = [
    item.itemType,
    item.damageDice ? `${item.damageDice}${item.damageType ? ` ${item.damageType}` : ''}` : null,
    item.weightLb ? `${item.weightLb} lb` : null,
  ].filter(Boolean);

  return labels.length ? labels.join(' / ') : '상세 정보 없음';
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
  inventory,
  inventoryFeedback = null,
  isBusy = false,
  onMapChange,
  onUseInventoryItem,
}: ExplorationNodeSurfaceProps) {
  const [activeTab, setActiveTab] = useState<ExplorationActionTab>('explore');
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
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

      </div>

      <section className="exploration-action-dock" aria-label="탐색 행동">
        <div className="exploration-actor-status">
          <span className="exploration-node-eyebrow">현재 조작 캐릭터</span>
          <strong>{myCharacter?.name ?? '캐릭터 미선택'}</strong>
          <p>지도에서 위치를 확인하고 메인 명령으로 행동을 선언하세요.</p>
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

        <div className="exploration-inventory-panel">
          <span className="exploration-node-eyebrow">인벤토리</span>
          {inventory.length ? (
            <div className="exploration-inventory-list">
              {inventory.map((item) => {
                const canUse = isQuickUsableItem(item);
                return (
                  <article className="exploration-inventory-item" key={item.id}>
                    <div className="exploration-inventory-item-body">
                      <strong>{item.name}</strong>
                      <span>{getItemMetaLabel(item)}</span>
                    </div>
                    <span className="exploration-inventory-quantity">x{item.quantity}</span>
                    <button
                      type="button"
                      disabled={!canUse || isBusy}
                      title={canUse ? `${item.name} 사용` : '현재 바로 사용할 수 없는 아이템입니다.'}
                      onClick={() => onUseInventoryItem(item)}
                    >
                      사용
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <p>보유 중인 아이템이 없습니다.</p>
          )}
          {inventoryFeedback ? (
            <p className="exploration-inventory-feedback">{inventoryFeedback}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
