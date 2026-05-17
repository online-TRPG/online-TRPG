import { useMemo, useState } from 'react';
import type {
  CombatResponseDto,
  InventoryItemDto,
  PlayerScenarioNodeDto,
  SessionCharacterResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import { BattleMap } from '../../../components/BattleMap';
import { CharacterDetailModal } from './CharacterDetailModal';
import { getCharacterImage } from '../utils/characterVisuals';
import './CombatNodeSurface.css';

type CombatActionTab = 'basic' | 'ability' | 'item';
type CombatResourceIconKind = 'action' | 'bonus' | 'reaction';

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
  inventory: InventoryItemDto[];
  isInventoryBusy?: boolean;
  onMapChange: (map: VttMapStateDto) => void;
  onUseInventoryItem: (item: InventoryItemDto) => void;
  onEndCombat: () => void;
  onEndTurn: (force?: boolean) => void;
}

const actionTabs: Array<{ id: CombatActionTab; label: string; actions: string[] }> = [
  {
    id: 'basic',
    label: '일반',
    actions: ['이동', '공격', '대시', '회피', '도움', '숨기', '상호작용'],
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

function getInventoryItemKey(item: InventoryItemDto) {
  return [item.itemType, item.itemDefinitionId, item.name, ...(item.properties ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isQuickUsableItem(item: InventoryItemDto) {
  const key = getInventoryItemKey(item);
  const isPack = item.itemType === 'pack' || key.includes('꾸러미');
  return (
    item.quantity > 0 &&
    (key.includes('consumable') ||
      key.includes('potion') ||
      key.includes('포션') ||
      key.includes('healing') ||
      isPack)
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

function splitSceneParagraphs(sceneText: string | undefined) {
  const paragraphs = (sceneText ?? '')
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : ['현재 전투 장면 설명이 아직 준비되지 않았습니다.'];
}

function CombatResourceIcon({ kind }: { kind: CombatResourceIconKind }) {
  if (kind === 'action') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19 17.5 6.5" />
        <path d="m14 5 5 5" />
        <path d="m3.5 20.5 3-1 11-11-2-2-11 11-1 3Z" />
      </svg>
    );
  }

  if (kind === 'bonus') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M3 12h18" />
        <path d="m7 7 10 10" />
        <path d="m17 7-10 10" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
      <path d="M9 12h6" />
    </svg>
  );
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
  inventory,
  isInventoryBusy = false,
  onMapChange,
  onUseInventoryItem,
  onEndCombat,
  onEndTurn,
}: CombatNodeSurfaceProps) {
  const [activeTab, setActiveTab] = useState<CombatActionTab>('basic');
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const [selectedTurnCharacterId, setSelectedTurnCharacterId] = useState<string | null>(null);
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const selectedTurnCharacter =
    characters.find((character) => character.id === selectedTurnCharacterId) ?? null;
  const myCombatParticipant =
    combat?.participants.find((participant) => participant.sessionCharacterId === myCharacter?.id) ?? null;
  const isMyCombatTurn =
    Boolean(combat?.currentEntityId) &&
    Boolean(myCombatParticipant?.sessionEntityId) &&
    combat?.currentEntityId === myCombatParticipant?.sessionEntityId;
  const myActionResources = myCombatParticipant?.actionResources ?? null;
  const myCurrentHp = myCombatParticipant?.currentHp ?? myCharacter?.currentHp ?? null;
  const myMaxHp = myCombatParticipant?.maxHp ?? myCharacter?.maxHp ?? null;
  const currentParticipant =
    combat?.participants.find((participant) => participant.sessionEntityId === combat.currentEntityId) ?? null;
  const currentTab = actionTabs.find((tab) => tab.id === activeTab) ?? actionTabs[0];
  const turnOrder = combat?.participants ?? [];
  const activeParticipantCount = turnOrder.filter((participant) => participant.isAlive).length;
  const combatResources = [
    {
      kind: 'action' as const,
      label: '행동',
      available: myActionResources?.actionAvailable ?? false,
    },
    {
      kind: 'bonus' as const,
      label: '추가 행동',
      available: myActionResources?.bonusActionAvailable ?? false,
    },
    {
      kind: 'reaction' as const,
      label: '반응',
      available: myActionResources?.reactionAvailable ?? false,
    },
  ];
  const tokenMovementRangeFtByTokenId = useMemo(() => {
    const entries =
      combat?.participants
        .filter((participant) => participant.tokenId)
        .map((participant) => [
          participant.tokenId as string,
          participant.sessionEntityId === combat.currentEntityId
            ? participant.actionResources.movementFtRemaining
            : 0,
        ]) ?? [];
    return Object.fromEntries(entries);
  }, [combat]);

  function getParticipantAvatar(participant: CombatResponseDto['participants'][number]) {
    const character = participant.sessionCharacterId
      ? characters.find((candidate) => candidate.id === participant.sessionCharacterId)
      : null;
    if (character) {
      return getCharacterImage(character);
    }

    return participant.tokenId
      ? (map?.tokens.find((token) => token.id === participant.tokenId)?.imageUrl ?? null)
      : null;
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

      <div className="combat-node-content">
        <main className="combat-map-panel" aria-label="전투 지도">
          <div className="combat-turn-overlay" aria-label="턴 순서">
            {turnOrder.length ? (
              <div className="combat-turn-list">
                {turnOrder.map((participant) => {
                  const avatar = getParticipantAvatar(participant);
                  const detailCharacter = participant.sessionCharacterId
                    ? characters.find((character) => character.id === participant.sessionCharacterId) ?? null
                    : null;
                  return (
                    <button
                      type="button"
                      key={participant.sessionEntityId}
                      className={[
                        'combat-turn-card',
                        participant.sessionEntityId === combat?.currentEntityId ? 'active' : '',
                        participant.sessionCharacterId === myCharacter?.id ? 'mine' : '',
                        !participant.isAlive ? 'defeated' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={`${participant.name} / HP ${participant.currentHp ?? '-'}/${participant.maxHp ?? '-'}`}
                      onClick={() => {
                        if (detailCharacter) {
                          setSelectedTurnCharacterId(detailCharacter.id);
                        }
                      }}
                    >
                      {avatar ? (
                        <img src={avatar} alt={participant.name} />
                      ) : (
                        <span>{participant.name.slice(0, 1)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p>{isCombatBusy ? '전투를 시작하는 중입니다.' : '전투 정보를 기다리는 중입니다.'}</p>
            )}
            {combatError ? <p className="combat-error">{combatError}</p> : null}
          </div>
          {map ? (
            <BattleMap
              map={map}
              characters={characters}
              isHost={isHost}
              currentUserId={currentUserId}
              interactionMode="session"
              isInteractionLocked={!isGmView && !isMyCombatTurn}
              tokenMovementRangeFtByTokenId={tokenMovementRangeFtByTokenId}
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
          <div className="combat-resource-head">
            <span className="combat-node-eyebrow">행동 자원</span>
            {isGmView ? (
              <button
                type="button"
                className="combat-end-turn-button"
                disabled={!combat || isCombatBusy}
                onClick={onEndCombat}
              >
                전투 종료
              </button>
            ) : null}
            <button
              type="button"
              className="combat-end-turn-button"
              disabled={!combat || isCombatBusy}
              onClick={() => onEndTurn(isGmView)}
            >
              턴 종료
            </button>
          </div>
          <strong>{myCharacter?.name ?? '캐릭터 미선택'}</strong>
          <div className="combat-resource-row" aria-label="행동 자원">
            {combatResources.map((resource) => (
              <span
                key={resource.kind}
                className={`combat-resource-token${resource.available ? ' available' : ' spent'}`}
                title={`${resource.label}: ${resource.available ? '가능' : '사용됨'}`}
                aria-label={`${resource.label}: ${resource.available ? '가능' : '사용됨'}`}
              >
                <CombatResourceIcon kind={resource.kind} />
              </span>
            ))}
          </div>
          <div className="combat-resource-meta">
            <span>HP {myCurrentHp ?? '-'}/{myMaxHp ?? '-'}</span>
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
              <button type="button" key={action} disabled>
                {action}
              </button>
            ))}
          </div>
        </div>

        <div className="combat-inventory-panel">
          <span className="combat-node-eyebrow">인벤토리</span>
          {inventory.length ? (
            <div className="combat-inventory-list">
              {inventory.map((item) => {
                const canUse = isQuickUsableItem(item);
                return (
                  <article className="combat-inventory-item" key={item.id}>
                    <div className="combat-inventory-item-body">
                      <strong>{item.name}</strong>
                      <span>{getItemMetaLabel(item)}</span>
                    </div>
                    <span className="combat-inventory-quantity">x{item.quantity}</span>
                    <button
                      type="button"
                      disabled={!canUse || isInventoryBusy}
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
        </div>
      </section>
      {selectedTurnCharacter ? (
        <CharacterDetailModal
          character={selectedTurnCharacter}
          onClose={() => setSelectedTurnCharacterId(null)}
        />
      ) : null}
    </div>
  );
}
