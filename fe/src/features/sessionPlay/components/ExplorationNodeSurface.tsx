import { useMemo, useState } from 'react';
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

type ExplorationActionTab = 'explore' | 'interact' | 'item';

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
  getCharacterColorStyle?: (character: SessionCharacterResponseDto) => CSSProperties;
  onMapChange: (map: VttMapStateDto) => void;
  onUseInventoryItem: (item: InventoryItemDto) => void;
  onRequestMainCommand?: (request: ExplorationMainCommandRequest) => void;
}

const actionTabs: Array<{ id: ExplorationActionTab; label: string }> = [
  {
    id: 'explore',
    label: '탐색',
  },
  {
    id: 'interact',
    label: '상호작용',
  },
  {
    id: 'item',
    label: '아이템',
  },
];

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
  ENVIRONMENT_USE: 'ENVIRONMENT_USE' as SubmitMainCommandDto['intent'],
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

function formatMapPoint(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getSelectionDisplay(selection: BattleMapSelection | null) {
  if (!selection) {
    return {
      target: '없음',
      status: '맵 타일이나 토큰을 선택해 주세요',
      summary: '선택한 대상의 좌표와 상태가 여기에 표시됩니다.',
    };
  }

  const coordinateLabel = `좌표 ${formatMapPoint(selection.point.x)}, ${formatMapPoint(
    selection.point.y
  )} / 타일 ${selection.tile.column}, ${selection.tile.row}`;

  if (selection.kind === 'tile') {
    return {
      target: `맵 타일 (${selection.tile.column}, ${selection.tile.row})`,
      status: coordinateLabel,
      summary: '토큰이 없는 지점입니다. 이동, 조사, 상호작용 명령의 위치 기준으로 사용할 수 있습니다.',
    };
  }

  if (selection.kind !== 'token') {
    const cell = selection.cell;
    const kindLabel =
      selection.kind === 'terrain'
        ? '이동 불가 칸'
        : selection.kind === 'wall'
          ? '벽 칸'
          : selection.kind === 'door'
            ? '문 칸'
            : '오브젝트';
    const doorStatus =
      selection.kind === 'door'
        ? `문 상태 ${
            'state' in cell
              ? cell.state === 'open'
                ? '열림'
                : cell.state === 'locked'
                  ? '잠김'
                  : cell.state === 'broken'
                    ? '파괴됨'
                    : '닫힘'
              : '닫힘'
          }`
        : null;
    const objectStatus =
      selection.kind === 'object' && 'visibleToPlayers' in cell
        ? cell.visibleToPlayers === false
          ? '숨김 오브젝트'
          : '공개 오브젝트'
        : null;
    const blockStatus =
      selection.kind === 'terrain'
        ? '이동 차단'
        : selection.kind === 'wall'
          ? '이동/시야 차단'
          : selection.kind === 'door'
            ? 'state' in cell && (cell.state === 'open' || cell.state === 'broken')
              ? '이동 가능'
              : '이동/시야 차단'
            : null;

    return {
      target: `${cell.name?.trim() || kindLabel} (${kindLabel})`,
      status: [coordinateLabel, blockStatus, doorStatus, objectStatus].filter(Boolean).join(' · '),
      summary:
        cell.description?.trim() ||
        (selection.kind === 'terrain'
          ? '이 칸은 이동이 불가능한 지형입니다.'
          : selection.kind === 'wall'
            ? '이 칸은 이동과 시야를 모두 차단하는 벽입니다.'
            : selection.kind === 'door'
              ? '문 상태와 열쇠/파괴 조건은 시나리오 맵 설정을 따릅니다.'
              : '조사 가능한 맵 오브젝트입니다.'),
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
  const statusParts = [
    coordinateLabel,
    token.hidden ? '숨김' : '표시',
    token.isHostile ? '적대적' : null,
    character ? `HP ${character.currentHp}/${character.maxHp}` : null,
    character?.conditions.length ? `상태 ${character.conditions.join(', ')}` : null,
  ].filter(Boolean);
  const monsterSummary = token.monster
    ? [
        token.monster.basicRaw,
        token.monster.armorClassRaw ? `AC ${token.monster.armorClassRaw}` : null,
        token.monster.hitPointsRaw ? `HP ${token.monster.hitPointsRaw}` : null,
        token.monster.challengeRaw ? `CR ${token.monster.challengeRaw}` : null,
      ]
        .filter(Boolean)
        .join(' / ')
    : null;
  const characterSummary = character
    ? `${getCharacterClassLabel(character.className)} Lv ${character.level} / AC ${
        character.armorClass
      } / 이동 ${character.speed}`
    : null;

  return {
    target: `${token.name} (${targetType})`,
    status: statusParts.join(' · '),
    summary: characterSummary ?? monsterSummary ?? '등록된 상세 요약이 없는 지도 토큰입니다.',
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

function getContextActions(
  tab: ExplorationActionTab,
  selection: BattleMapSelection | null,
  inventory: InventoryItemDto[]
): ExplorationActionButton[] {
  const targetLabel = getSelectionTargetLabel(selection);

  if (tab === 'explore') {
    return [
      command('주변 관찰', ExplorationMainCommandIntent.OBSERVE_AREA, selection, `${targetLabel} 주변을 살핍니다.`),
      command('자세히 조사', ExplorationMainCommandIntent.INVESTIGATE_OBJECT, selection, `${targetLabel}을 조사합니다.`),
      command('소리 듣기', ExplorationMainCommandIntent.LISTEN, selection, `${targetLabel} 주변의 소리를 듣습니다.`),
      command('위험 감지', ExplorationMainCommandIntent.DETECT_DANGER, selection, `${targetLabel}에 위험이 있는지 살핍니다.`),
    ];
  }

  if (tab === 'interact') {
    if (selection?.kind === 'door') {
      return [
        command('열기', ExplorationMainCommandIntent.INTERACT_OBJECT, selection, `${targetLabel}을 엽니다.`),
        command('잠금 확인', ExplorationMainCommandIntent.INVESTIGATE_OBJECT, selection, `${targetLabel}의 잠금 장치를 확인합니다.`),
        command('함정 확인', ExplorationMainCommandIntent.DETECT_DANGER, selection, `${targetLabel}에 함정이 있는지 확인합니다.`),
        command('부수기', ExplorationMainCommandIntent.ENVIRONMENT_USE, selection, `${targetLabel}을 힘으로 부수려 합니다.`),
      ];
    }

    if (selection?.kind === 'object') {
      return [
        command('조사', ExplorationMainCommandIntent.INVESTIGATE_OBJECT, selection, `${targetLabel}을 자세히 조사합니다.`),
        command('상호작용', ExplorationMainCommandIntent.INTERACT_OBJECT, selection, `${targetLabel}을 조작합니다.`),
        command('들기/옮기기', ExplorationMainCommandIntent.ENVIRONMENT_USE, selection, `${targetLabel}을 들어 올리거나 옮겨 봅니다.`),
        command('위험 확인', ExplorationMainCommandIntent.DETECT_DANGER, selection, `${targetLabel}에 위험 요소가 있는지 확인합니다.`),
      ];
    }

    if (selection?.kind === 'token') {
      return selection.token.npcId || !selection.token.sessionCharacterId
        ? [
            command('대화', ExplorationMainCommandIntent.TALK_TO_NPC, selection, `${targetLabel}에게 말을 겁니다.`),
            command('관찰', ExplorationMainCommandIntent.INVESTIGATE_OBJECT, selection, `${targetLabel}의 상태와 행동을 살핍니다.`),
          ]
        : [
            command('위치 확인', ExplorationMainCommandIntent.OBSERVE_AREA, selection, `${targetLabel} 주변 상황을 확인합니다.`),
            command('협력 요청', ExplorationMainCommandIntent.SPLIT_PARTY_TASK, selection, `${targetLabel}에게 협력 행동을 요청합니다.`),
          ];
    }

    return [
      command('이동', ExplorationMainCommandIntent.SPECIAL_MOVE, selection, `${targetLabel} 위치로 이동합니다.`),
      command('핑 찍기', ExplorationMainCommandIntent.OBSERVE_AREA, selection, `${targetLabel} 위치를 파티에 알립니다.`),
    ];
  }

  if (!selection) {
    return [{ label: '대상 선택 필요', disabled: true }];
  }

  const quickItems = inventory.filter((item) => item.quantity > 0).slice(0, 4);
  if (!quickItems.length) {
    return [{ label: '사용 가능한 아이템 없음', disabled: true }];
  }

  return quickItems.map((item) => ({
    label: item.name,
    request: {
      intent: ExplorationMainCommandIntent.USE_ITEM_EXPLORE,
      itemId: item.id,
      mapPoint: getSelectionMapPoint(selection),
      playerText: `${targetLabel}에 ${item.name}을 사용합니다.`,
    },
  }));
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
  getCharacterColorStyle,
  onMapChange,
  onUseInventoryItem,
  onRequestMainCommand,
}: ExplorationNodeSurfaceProps) {
  const [activeTab, setActiveTab] = useState<ExplorationActionTab>('explore');
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const [mapSelection, setMapSelection] = useState<BattleMapSelection | null>(null);
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const selectionDisplay = useMemo(() => getSelectionDisplay(mapSelection), [mapSelection]);
  const contextActions = useMemo(
    () => getContextActions(activeTab, mapSelection, inventory),
    [activeTab, inventory, mapSelection]
  );

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
                onSelectionChange={setMapSelection}
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
              상태: <strong>{selectionDisplay.status}</strong>
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
            {contextActions.map((action) => (
              <button
                type="button"
                key={action.label}
                disabled={action.disabled || isBusy || !action.request || !onRequestMainCommand}
                onClick={() => {
                  if (!action.request) return;
                  onRequestMainCommand?.(action.request);
                }}
              >
                {action.label}
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
