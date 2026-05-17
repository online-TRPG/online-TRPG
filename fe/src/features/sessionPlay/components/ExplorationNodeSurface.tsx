import { useEffect, useMemo, useState } from 'react';
import type {
  InventoryItemDto,
  PlayerScenarioNodeDto,
  SessionCharacterResponseDto,
  SubmitMainCommandDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import type { CSSProperties } from 'react';
import { BattleMap } from '../../../components/BattleMap';
import type { BattleMapSelection } from '../../../components/BattleMap';
import { getCharacterClassLabel } from '../utils/characterVisuals';
import { MapPartyOverlay } from './MapPartyOverlay';
import './ExplorationNodeSurface.css';

export type ExplorationMainCommandRequest = {
  intent: SubmitMainCommandDto['intent'];
  playerText: string;
  mapPoint?: { x: number; y: number };
  targetId?: string;
  itemId?: string;
};

type ExplorationActionButton = {
  label: string;
  request?: ExplorationMainCommandRequest;
  localAction?: 'move' | 'ping';
  disabled?: boolean;
};

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
  selectedInventoryItemId?: string;
  getCharacterColorStyle?: (character: SessionCharacterResponseDto) => CSSProperties;
  onMapChange: (map: VttMapStateDto) => void;
  onUseInventoryItem: (item: InventoryItemDto) => void;
  onSelectInventoryItem?: (item: InventoryItemDto | null) => void;
  onMapSelectionChange?: (selection: BattleMapSelection | null) => void;
  onRequestMainCommand?: (request: ExplorationMainCommandRequest) => void;
}

const ExplorationMainCommandIntent = {
  TALK_TO_NPC: 'TALK_TO_NPC' as SubmitMainCommandDto['intent'],
  OBSERVE_AREA: 'OBSERVE_AREA' as SubmitMainCommandDto['intent'],
  INVESTIGATE_OBJECT: 'INVESTIGATE_OBJECT' as SubmitMainCommandDto['intent'],
  LISTEN: 'LISTEN' as SubmitMainCommandDto['intent'],
  DETECT_DANGER: 'DETECT_DANGER' as SubmitMainCommandDto['intent'],
  SPECIAL_MOVE: 'SPECIAL_MOVE' as SubmitMainCommandDto['intent'],
  INTERACT_OBJECT: 'INTERACT_OBJECT' as SubmitMainCommandDto['intent'],
  USE_ITEM_EXPLORE: 'USE_ITEM_EXPLORE' as SubmitMainCommandDto['intent'],
  SPLIT_PARTY_TASK: 'SPLIT_PARTY_TASK' as SubmitMainCommandDto['intent'],
};

function getPhaseLabel(phase: string | null | undefined) {
  if (!phase) return '상태 미확인';
  if (phase === 'exploration') return '진행: 탐색';
  if (phase === 'dialogue') return '진행: 대화';
  if (phase === 'combat') return '진행: 전투';
  if (phase === 'lobby') return '진행: 대기';
  if (phase === 'rest') return '진행: 휴식';
  return `진행: ${phase}`;
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

function getCellKindLabel(
  selection: Extract<BattleMapSelection, { kind: 'terrain' | 'wall' | 'door' | 'object' }>
) {
  if (selection.kind === 'terrain') return '접근불가';
  if (selection.kind === 'wall') return '벽';
  if (selection.kind === 'door') return '문';
  return '오브젝트';
}

function getDoorStateLabel(state: string | undefined) {
  if (state === 'open') return '열림';
  if (state === 'locked') return '잠김';
  if (state === 'broken') return '파괴됨';
  return '닫힘';
}

function getDispositionLabel(disposition: string | null | undefined) {
  if (disposition === 'friendly') return '우호';
  if (disposition === 'hostile') return '적대';
  return '중립';
}

function getVisibleTargetById(
  node: PlayerScenarioNodeDto | null,
  targetId: string | null | undefined
) {
  if (!targetId) return null;
  return node?.visibleTargets.find((target) => target.id === targetId) ?? null;
}

function getMonsterSummary(token: VttMapStateDto['tokens'][number]) {
  if (!token.monster) return null;
  const parts = [
    token.monster.armorClassRaw ? `AC: ${token.monster.armorClassRaw}` : null,
    token.monster.hitPointsRaw ? `HP: ${token.monster.hitPointsRaw}` : null,
    token.monster.speedRaw ? `속도: ${token.monster.speedRaw}` : null,
    token.monster.challengeRaw ? `CR: ${token.monster.challengeRaw}` : null,
  ]
    .filter(Boolean)
    .join(' / ');

  return parts || token.monster.basicRaw;
}

function getSelectionDisplay(
  selection: BattleMapSelection | null,
  node: PlayerScenarioNodeDto | null
) {
  if (!selection) {
    return {
      target: '없음',
      status: '맵 타일이나 토큰을 선택해 주세요',
      summary: '선택한 대상의 좌표와 상태가 여기에 표시됩니다.',
      monsterHpLabel: null,
    };
  }

  if (selection.kind === 'tile') {
    return {
      target: `맵 타일 (${selection.tile.column}, ${selection.tile.row})`,
      status: '타일',
      summary: '별도 설명이 없는 일반 타일입니다.',
      monsterHpLabel: null,
    };
  }

  if (selection.kind !== 'token') {
    const cell = selection.cell;
    const kindLabel = getCellKindLabel(selection);
    const doorStatus =
      selection.kind === 'door' && 'state' in cell ? getDoorStateLabel(cell.state) : null;

    return {
      target: `${cell.name?.trim() || kindLabel} (${kindLabel})`,
      status: [kindLabel, doorStatus].filter(Boolean).join(' · '),
      summary: cell.description?.trim() || '시나리오 에디터에 등록된 설명이 없습니다.',
      monsterHpLabel: null,
    };
  }

  const token = selection.token;
  const character = selection.character;
  const targetType = character
    ? '캐릭터 토큰'
    : token.monster
      ? '몬스터 토큰'
      : token.isHostile
        ? '적대 토큰'
        : token.npcId
          ? 'NPC 토큰'
          : '토큰';
  const npcTarget = getVisibleTargetById(node, token.npcId);
  const monsterSummary = getMonsterSummary(token);
  const characterSummary = character
    ? `${getCharacterClassLabel(character.className)} Lv ${character.level} / AC ${
        character.armorClass
      } / 이동 ${character.speed}`
    : null;
  const npcSummary = token.npcId
    ? npcTarget?.summary?.trim() || '등록된 NPC 요약이 없습니다.'
    : null;
  const tokenStatus = token.monster
    ? '상태이상 없음'
    : token.npcId
      ? `Disposition: ${getDispositionLabel(
          token.isHostile ? 'hostile' : npcTarget?.disposition
        )}`
      : character
        ? [
            `HP ${character.currentHp}/${character.maxHp}`,
            character.conditions.length ? `상태 ${character.conditions.join(', ')}` : '상태이상 없음',
          ].join(' · ')
        : token.isHostile
          ? '적대 토큰'
          : '토큰';

  return {
    target: `${token.name} (${targetType})`,
    status: tokenStatus,
    summary: npcSummary ?? characterSummary ?? monsterSummary ?? '등록된 상세 요약이 없는 지도 토큰입니다.',
    monsterHpLabel: token.monster ? `HP ${token.monster.hitPointsRaw ?? '정보 없음'}` : null,
  };
}

function getSelectionTargetLabel(selection: BattleMapSelection | null) {
  if (!selection) return '현재 위치';
  if (selection.kind === 'tile') return `타일 ${selection.tile.column}, ${selection.tile.row}`;
  if (selection.kind !== 'token') {
    const fallback =
      selection.kind === 'door'
        ? '문'
        : selection.kind === 'object'
          ? '오브젝트'
          : selection.kind === 'wall'
            ? '벽'
            : '지형';
    return selection.cell.name?.trim() || fallback;
  }
  return selection.token.name;
}

function getSelectionMapPoint(selection: BattleMapSelection | null) {
  if (!selection) return undefined;
  return {
    x: Math.round(selection.point.x),
    y: Math.round(selection.point.y),
  };
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function getMovementBlockers(map: VttMapStateDto) {
  return [
    ...(map.terrainCells ?? []),
    ...(map.wallCells ?? []),
    ...(map.doorCells ?? []).filter((door) => door.state !== 'open' && door.state !== 'broken'),
  ];
}

function isTokenPlacementBlocked(
  map: VttMapStateDto,
  token: VttMapStateDto['tokens'][number],
  column: number,
  row: number
) {
  const x = Math.min(Math.max(column * map.gridSize, 0), map.width - token.size);
  const y = Math.min(Math.max(row * map.gridSize, 0), map.height - token.size);
  const tokenRect = { x, y, width: token.size, height: token.size };
  return getMovementBlockers(map).some((blocker) => rectsOverlap(tokenRect, blocker));
}

function findReachableTokenMove(
  map: VttMapStateDto,
  token: VttMapStateDto['tokens'][number],
  tile: { column: number; row: number }
) {
  const start = {
    column: Math.floor(Math.min(Math.max(token.x, 0), Math.max(0, map.width - 1)) / map.gridSize),
    row: Math.floor(Math.min(Math.max(token.y, 0), Math.max(0, map.height - 1)) / map.gridSize),
  };
  const destination = {
    column: Math.max(0, tile.column - 1),
    row: Math.max(0, tile.row - 1),
  };
  const maxColumn = Math.max(0, Math.ceil(map.width / map.gridSize) - 1);
  const maxRow = Math.max(0, Math.ceil(map.height / map.gridSize) - 1);
  if (
    destination.column > maxColumn ||
    destination.row > maxRow ||
    isTokenPlacementBlocked(map, token, destination.column, destination.row)
  ) {
    return null;
  }

  const queue: Array<{ column: number; row: number }> = [start];
  const visited = new Set([`${start.column}:${start.row}`]);
  const directions = [
    { column: 1, row: 0 },
    { column: -1, row: 0 },
    { column: 0, row: 1 },
    { column: 0, row: -1 },
  ];

  while (queue.length) {
    const current = queue.shift()!;
    if (current.column === destination.column && current.row === destination.row) {
      return {
        x: Math.min(Math.max(destination.column * map.gridSize, 0), map.width - token.size),
        y: Math.min(Math.max(destination.row * map.gridSize, 0), map.height - token.size),
      };
    }

    directions.forEach((direction) => {
      const next = {
        column: current.column + direction.column,
        row: current.row + direction.row,
      };
      const key = `${next.column}:${next.row}`;
      if (
        next.column < 0 ||
        next.row < 0 ||
        next.column > maxColumn ||
        next.row > maxRow ||
        visited.has(key) ||
        isTokenPlacementBlocked(map, token, next.column, next.row)
      ) {
        return;
      }
      visited.add(key);
      queue.push(next);
    });
  }

  return null;
}

function command(
  label: string,
  intent: SubmitMainCommandDto['intent'],
  selection: BattleMapSelection | null,
  playerText: string
): ExplorationActionButton {
  return {
    label,
    request: {
      intent,
      playerText,
      mapPoint: getSelectionMapPoint(selection),
      targetId: selection?.kind === 'token' ? (selection.token.npcId ?? undefined) : undefined,
    },
  };
}

function getBasePositionActions(): ExplorationActionButton[] {
  return [
    { label: '이동', localAction: 'move' },
    { label: '핑 찍기', localAction: 'ping' },
  ];
}

function isSameMapSelection(
  left: BattleMapSelection | null,
  right: BattleMapSelection | null
): boolean {
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === 'token' && right.kind === 'token') {
    return left.token.id === right.token.id;
  }
  if (left.kind === 'tile' && right.kind === 'tile') {
    return left.tile.column === right.tile.column && left.tile.row === right.tile.row;
  }
  if (left.kind !== 'token' && left.kind !== 'tile' && right.kind !== 'token' && right.kind !== 'tile') {
    return left.cell.id === right.cell.id;
  }
  return false;
}

function getContextActions(selection: BattleMapSelection | null): ExplorationActionButton[] {
  const targetLabel = getSelectionTargetLabel(selection);
  const positionActions = getBasePositionActions();

  if (!selection) {
    return [
      command('관찰', ExplorationMainCommandIntent.OBSERVE_AREA, null, '주변을 살핍니다.'),
      ...positionActions,
    ];
  }

  if (selection.kind === 'token') {
    return selection.token.npcId
      ? [
          ...positionActions,
          command('대화', ExplorationMainCommandIntent.TALK_TO_NPC, selection, `${targetLabel}에게 말을 겁니다.`),
          command('조사', ExplorationMainCommandIntent.INVESTIGATE_OBJECT, selection, `${targetLabel}의 상태와 행동을 살핍니다.`),
        ]
      : positionActions;
  }

  if (selection.kind === 'door') {
    return [
      ...positionActions,
      command('열기', ExplorationMainCommandIntent.INTERACT_OBJECT, selection, `${targetLabel}을 엽니다.`),
      command('조사', ExplorationMainCommandIntent.INVESTIGATE_OBJECT, selection, `${targetLabel}을 조사합니다.`),
      command('잠금 해제', ExplorationMainCommandIntent.INTERACT_OBJECT, selection, `${targetLabel}의 잠금을 해제합니다.`),
      command('부수기', ExplorationMainCommandIntent.INTERACT_OBJECT, selection, `${targetLabel}을 힘으로 부수려 합니다.`),
    ];
  }

  if (selection.kind === 'object') {
    return [
      ...positionActions,
      command('조사', ExplorationMainCommandIntent.INVESTIGATE_OBJECT, selection, `${targetLabel}을 조사합니다.`),
    ];
  }

  return positionActions;
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
  selectedInventoryItemId = '',
  getCharacterColorStyle,
  onMapChange,
  onUseInventoryItem,
  onSelectInventoryItem,
  onMapSelectionChange,
  onRequestMainCommand,
}: ExplorationNodeSurfaceProps) {
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const [mapSelection, setMapSelection] = useState<BattleMapSelection | null>(null);
  const [mapActionFeedback, setMapActionFeedback] = useState<string | null>(null);
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const selectionDisplay = useMemo(
    () => getSelectionDisplay(mapSelection, node),
    [mapSelection, node]
  );
  const contextActions = useMemo(
    () => getContextActions(mapSelection),
    [mapSelection]
  );

  useEffect(() => {
    onMapSelectionChange?.(mapSelection);
  }, [mapSelection, onMapSelectionChange]);

  function getControlledToken() {
    if (!map || !myCharacter) return null;
    return map.tokens.find((token) => token.sessionCharacterId === myCharacter.id) ?? null;
  }

  function handleLocalMapAction(action: NonNullable<ExplorationActionButton['localAction']>) {
    if (!mapSelection) {
      setMapActionFeedback('먼저 맵 타일이나 대상을 선택해 주세요.');
      return;
    }
    if (!map) {
      setMapActionFeedback('맵을 아직 불러오지 못했습니다.');
      return;
    }

    if (action === 'ping') {
      const expiresAt = new Date(Date.now() + 2200).toISOString();
      onMapChange({
        ...map,
        pings: [
          ...(map.pings ?? []).filter((ping) => Date.parse(ping.expiresAt) > Date.now()).slice(-4),
          {
            id: `ping:${Date.now()}`,
            x: mapSelection.point.x,
            y: mapSelection.point.y,
            label: '!',
            expiresAt,
          },
        ],
        updatedAt: new Date().toISOString(),
      });
      setMapActionFeedback('선택한 위치에 핑을 찍었습니다.');
      return;
    }

    const controlledToken = getControlledToken();
    if (!controlledToken) {
      setMapActionFeedback('이동할 내 캐릭터 토큰이 맵에 없습니다.');
      return;
    }

    const nextPosition = findReachableTokenMove(map, controlledToken, mapSelection.tile);
    if (!nextPosition) {
      setMapActionFeedback('해당 타일까지 이동 가능한 경로가 없습니다.');
      return;
    }

    onMapChange({
      ...map,
      tokens: map.tokens.map((token) =>
        token.id === controlledToken.id
          ? {
              ...token,
              x: nextPosition.x,
              y: nextPosition.y,
            }
          : token
      ),
      updatedAt: new Date().toISOString(),
    });
    setMapActionFeedback(`${controlledToken.name} 토큰을 선택한 타일로 이동했습니다.`);
  }

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
            <MapPartyOverlay
              characters={characters}
              currentUserId={currentUserId}
              getCharacterColorStyle={getCharacterColorStyle}
            />
            {map ? (
              <BattleMap
                map={map}
                characters={characters}
                isHost={isHost}
                currentUserId={currentUserId}
                interactionMode="session"
                onChange={onMapChange}
                onSelectionChange={(nextSelection) =>
                  setMapSelection((current) =>
                    isSameMapSelection(current, nextSelection) ? null : nextSelection
                  )
                }
                title={node?.title ?? '탐색 지도'}
              />
            ) : (
              <div className="exploration-map-placeholder">
                <span>탐색 지도</span>
                <strong>맵을 불러오는 중입니다</strong>
              </div>
            )}
          </section>
          <section className="exploration-selection-strip" aria-label="맵 선택 정보">
            <span>
              선택 대상: <strong>{selectionDisplay.target}</strong>
            </span>
            <span>
              상태:{' '}
              <strong>
                {selectionDisplay.monsterHpLabel ? (
                  <span className="exploration-selection-hp">
                    <span className="exploration-selection-hp-bar" aria-hidden="true">
                      <span />
                    </span>
                    <span>{selectionDisplay.monsterHpLabel}</span>
                    <span>{selectionDisplay.status}</span>
                  </span>
                ) : (
                  selectionDisplay.status
                )}
              </strong>
            </span>
            <span>
              요약: <strong>{selectionDisplay.summary}</strong>
            </span>
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
          <span className="exploration-node-eyebrow">선택 대상 행동</span>
          <div className="exploration-action-list">
            {contextActions.map((action) => (
              <button
                type="button"
                key={action.label}
                disabled={
                  action.disabled ||
                  isBusy ||
                  (!action.localAction && (!action.request || !onRequestMainCommand))
                }
                onClick={() => {
                  if (action.localAction) {
                    handleLocalMapAction(action.localAction);
                    return;
                  }
                  if (!action.request) return;
                  onRequestMainCommand?.(action.request);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
          {mapActionFeedback ? (
            <p className="exploration-map-action-feedback">{mapActionFeedback}</p>
          ) : null}
        </div>

        <div className="exploration-inventory-panel">
          <span className="exploration-node-eyebrow">인벤토리</span>
          {inventory.length ? (
            <div className="exploration-inventory-list">
              {inventory.map((item) => {
                const canUse = isQuickUsableItem(item);
                const isSelected = selectedInventoryItemId === item.id;
                return (
                  <article
                    className={`exploration-inventory-item${isSelected ? ' selected' : ''}`}
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => onSelectInventoryItem?.(item)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onSelectInventoryItem?.(item);
                    }}
                  >
                    <div className="exploration-inventory-item-body">
                      <strong>{item.name}</strong>
                      <span>{getItemMetaLabel(item)}</span>
                    </div>
                    <span className="exploration-inventory-quantity">x{item.quantity}</span>
                    <button
                      type="button"
                      disabled={!canUse || isBusy}
                      title={canUse ? `${item.name} 사용` : '현재 바로 사용할 수 없는 아이템입니다.'}
                      onClick={(event) => {
                        event.stopPropagation();
                        onUseInventoryItem(item);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
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
