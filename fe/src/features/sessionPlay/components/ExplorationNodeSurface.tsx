import { useEffect, useMemo, useState } from 'react';
import type {
  InventoryItemDto,
  ItemResponseDto,
  PlayerScenarioNodeDto,
  SessionCharacterResponseDto,
  SubmitMainCommandDto,
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import type { CSSProperties } from 'react';
import { SessionBattleMap } from './SessionBattleMap';
import type { BattleMapSelection } from './SessionBattleMap';
import { GameIcon } from '../../../components/GameIcon';
import type { GameIconName } from '../../../components/GameIcon';
import explorationNodeBadge from '../../../components/node_badge_exploration.webp';
import { getCharacterClassLabel } from '../utils/characterVisuals';
import { CharacterDetailModal } from './CharacterDetailModal';
import { InventoryEquipmentStatus } from './InventoryEquipmentStatus';
import { InventoryItemInfo } from './InventoryItemInfo';
import { MapPartyOverlay } from './MapPartyOverlay';
import { NodeHeaderScroll } from './NodeHeaderScroll';
import './ExplorationNodeSurface.css';

export type ExplorationMainCommandRequest = {
  intent: SubmitMainCommandDto['intent'];
  playerText: string;
  mapPoint?: { x: number; y: number };
  targetId?: string;
  itemId?: string;
};

export type ExplorationNodeMoveOption = {
  nodeId: string;
  title: string;
  nodeType: string;
  label?: string | null;
  condition?: string | null;
  note?: string | null;
  isFallback?: boolean;
};

type ExplorationActionButton = {
  label: string;
  request?: ExplorationMainCommandRequest;
  localAction?:
    | 'move'
    | 'ping'
    | 'open_door'
    | 'close_door'
    | 'unlock_door'
    | 'break_door'
    | 'investigate_object'
    | 'disarm_hazard';
  disabled?: boolean;
  // 기본 탐험 행동은 전투/채팅 버튼과 바로 구분되도록 RPG풍 아이콘을 함께 표시합니다.
  iconName?: GameIconName;
};
type ExplorationLocalAction = NonNullable<ExplorationActionButton['localAction']>;
type ExplorationGmMapAction =
  | 'toggle_token_hidden'
  | 'toggle_object_visible'
  | 'reveal_fog_at_selection'
  | 'reveal_all_fog'
  | 'trigger_object';

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
  isBusy?: boolean;
  selectedInventoryItemId?: string;
  getCharacterColorStyle?: (character: SessionCharacterResponseDto) => CSSProperties;
  onMapChange: (map: VttMapStateDto) => void;
  onTokenMoveRequest?: (
    token: VttMapStateDto['tokens'][number],
    to: { x: number; y: number },
    path: Array<{ x: number; y: number }>,
    movementMode?: 'normal' | 'jump'
  ) => Promise<VttMapStateDto | null>;
  onPingRequest?: (point: { x: number; y: number }, label?: string) => Promise<VttMapStateDto | null>;
  onMapInteractionRequest?: (
    interaction: VttMapInteractionDto
  ) => Promise<VttMapInteractionResponseDto | null>;
  onUseInventoryItem: (item: InventoryItemDto) => void;
  onEquipInventoryItem?: (item: InventoryItemDto) => void;
  onSelectInventoryItem?: (item: InventoryItemDto | null) => void;
  onMapSelectionChange?: (selection: BattleMapSelection | null) => void;
  onRequestMainCommand?: (request: ExplorationMainCommandRequest) => void;
  gmNodeMoveOptions?: ExplorationNodeMoveOption[];
  onGmNodeMove?: (nodeId: string) => Promise<void> | void;
  gmItemCatalog?: ItemResponseDto[];
  isGmItemCatalogLoading?: boolean;
  gmItemCatalogError?: string | null;
  isGmInventoryGrantPending?: boolean;
  onGmGrantInventoryItem?: (
    sessionCharacterId: string,
    item: ItemResponseDto,
    quantity: number
  ) => Promise<void> | void;
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

const explorationActionIconNames: Partial<Record<string, GameIconName>> = {
  관찰: 'game-icons:eye-target',
  이동: 'game-icons:boots',
  '핑 찍기': 'game-icons:flag-objective',
  대화: 'game-icons:conversation',
  조사: 'game-icons:magnifying-glass',
  열기: 'game-icons:open-gate',
  닫기: 'game-icons:closed-doors',
  '잠금 해제': 'game-icons:padlock-open',
  부수기: 'game-icons:hammer-break',
  '함정 해제': 'game-icons:wolf-trap',
};

function getExplorationActionIconName(label: string): GameIconName | undefined {
  // 탐험 행동 아이콘은 라벨 기준으로 모아 두어, 같은 행동이 여러 선택 대상에서 반복되어도 같은 그림을 쓰게 합니다.
  return explorationActionIconNames[label];
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

function isWeaponItem(item: InventoryItemDto) {
  const key = getInventoryItemKey(item);
  return item.itemType === 'weapon' || Boolean(item.damageDice) || key.includes('weapon');
}

function isArmorItem(item: InventoryItemDto) {
  if (isShieldItem(item)) return false;
  const key = getInventoryItemKey(item);
  return item.itemType === 'armor' || key.includes('armor') || key.includes('갑옷');
}

function isShieldItem(item: InventoryItemDto) {
  const key = getInventoryItemKey(item);
  return item.itemType === 'shield' || key.includes('shield') || key.includes('방패');
}

function isEquippedItem(item: InventoryItemDto, equippedId: string | null | undefined) {
  return Boolean(
    equippedId &&
      (item.id === equippedId || item.itemDefinitionId === equippedId || item.name === equippedId)
  );
}

function getInventoryItemIconName(item: InventoryItemDto): GameIconName {
  const key = getInventoryItemKey(item).replace(/_/g, '-');

  // 기타 아이템 기본값은 가방보다 중립적인 보급 상자로 두어, 꾸러미 전용 아이콘과 역할이 섞이지 않게 합니다.
  if (key.includes('shield') || key.includes('방패')) return 'game-icons:shield';
  if (item.itemType === 'armor' || key.includes('armor') || key.includes('갑옷')) return 'game-icons:armor-vest';
  if (key.includes('bow') || key.includes('crossbow') || key.includes('활') || key.includes('석궁')) return 'game-icons:bow-arrow';
  if (key.includes('dagger') || key.includes('knife') || key.includes('단검')) return 'game-icons:plain-dagger';
  if (key.includes('axe') || key.includes('액스') || key.includes('도끼')) return 'game-icons:battle-axe';
  if (isWeaponItem(item)) return 'game-icons:rune-sword';
  if (key.includes('potion') || key.includes('healing') || key.includes('포션')) return 'game-icons:health-potion';
  if (item.itemType === 'pack' || key.includes('꾸러미')) return 'game-icons:swap-bag';
  if (key.includes('scroll') || key.includes('spell') || key.includes('두루마리')) return 'game-icons:scroll-unfurled';
  if (key.includes('book') || key.includes('책')) return 'game-icons:spell-book';
  if (key.includes('key') || key.includes('열쇠')) return 'game-icons:key';
  if (key.includes('tool') || key.includes('kit') || key.includes('도구')) return 'game-icons:toolbox';
  if (key.includes('coin') || key.includes('gold') || key.includes('코인') || key.includes('금화')) return 'game-icons:coins';
  return 'game-icons:wooden-crate';
}

function getCatalogItemSearchKey(item: ItemResponseDto) {
  return [item.id, item.key, item.koName, item.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
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

function getArrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function getResourceFillPercent(
  current: number | null | undefined,
  max: number | null | undefined
) {
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
}

function getGmMapSummary(map: VttMapStateDto | null) {
  if (!map) {
    return {
      hiddenTokens: 0,
      hiddenObjects: 0,
      hazards: 0,
      lockedDoors: 0,
      fogRects: 0,
    };
  }

  return {
    hiddenTokens: map.tokens.filter((token) => token.hidden).length,
    hiddenObjects: (map.objectCells ?? []).filter((cell) => cell.visibleToPlayers === false).length,
    hazards: (map.objectCells ?? []).filter((cell) => cell.hazard && cell.hazard.armed !== false).length,
    lockedDoors: (map.doorCells ?? []).filter((door) => door.state === 'locked').length,
    fogRects: map.fogRects.length,
  };
}

function getGmSelectionDetails(selection: BattleMapSelection | null) {
  if (!selection) {
    return {
      title: '선택 없음',
      tags: ['맵 선택 대기'],
      lines: ['지도에서 토큰, 문, 오브젝트, 타일을 선택하면 GM 전용 정보가 표시됩니다.'],
    };
  }

  if (selection.kind === 'tile') {
    return {
      title: `타일 ${selection.tile.column}, ${selection.tile.row}`,
      tags: ['좌표'],
      lines: [`좌표 ${Math.round(selection.point.x)}, ${Math.round(selection.point.y)}`],
    };
  }

  if (selection.kind === 'token') {
    const { token, character } = selection;
    return {
      title: token.name,
      tags: [
        token.hidden ? '숨김 토큰' : '공개 토큰',
        token.isHostile ? '적대' : character ? '플레이어' : 'NPC',
        token.monster ? '몬스터' : null,
      ].filter(Boolean) as string[],
      lines: [
        `좌표 ${Math.round(token.x)}, ${Math.round(token.y)} / 크기 ${token.size}`,
        character ? `HP ${character.currentHp}/${character.maxHp} / AC ${character.armorClass}` : null,
        token.monster ? getMonsterSummary(token) : null,
        token.npcId ? `NPC ID: ${token.npcId}` : null,
      ].filter(Boolean) as string[],
    };
  }

  const cell = selection.cell;
  const hiddenContentCount =
    selection.kind === 'object' && 'hiddenClueIds' in cell
      ? getArrayCount(cell.hiddenClueIds) +
        getArrayCount(cell.hiddenItemIds) +
        getArrayCount(cell.hiddenEventIds)
      : 0;
  const revealCheckCount =
    selection.kind === 'object' && 'revealChecks' in cell ? getArrayCount(cell.revealChecks) : 0;
  const hazard = selection.kind === 'object' && 'hazard' in cell ? cell.hazard : null;
  const objectEvents = selection.kind === 'object' && 'events' in cell && Array.isArray(cell.events) ? cell.events : [];

  return {
    title: cell.name?.trim() || getCellKindLabel(selection),
    tags: [
      getCellKindLabel(selection),
      selection.kind === 'door' && 'state' in cell ? getDoorStateLabel(cell.state) : null,
      selection.kind === 'object' && 'visibleToPlayers' in cell && cell.visibleToPlayers === false
        ? '플레이어 비공개'
        : null,
      hiddenContentCount ? `숨김 콘텐츠 ${hiddenContentCount}개` : null,
      revealCheckCount ? `판정 ${revealCheckCount}개` : null,
      hazard ? (hazard.armed === false ? '위험 해제됨' : '위험 활성') : null,
      objectEvents.length ? `이벤트 ${objectEvents.length}개` : null,
    ].filter(Boolean) as string[],
    lines: [
      cell.description?.trim() || '설명이 등록되지 않았습니다.',
      selection.kind === 'door' && 'keyItemId' in cell && cell.keyItemId ? `열쇠: ${cell.keyItemId}` : null,
      selection.kind === 'door' && 'breakCheckDc' in cell && cell.breakCheckDc
        ? `파괴 DC ${cell.breakCheckDc}`
        : null,
      hazard
        ? `탐지 DC ${hazard.detectionDc ?? '미설정'} / 반경 ${hazard.detectionRadiusCells ?? 1}칸`
        : null,
      ...objectEvents.map((event) => `이벤트: ${event.name?.trim() || event.type}`),
    ].filter(Boolean) as string[],
  };
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function subtractRect(
  rect: VttMapStateDto['fogRects'][number],
  cut: { x: number; y: number; width: number; height: number }
) {
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const cutRight = cut.x + cut.width;
  const cutBottom = cut.y + cut.height;
  const left = Math.max(rect.x, cut.x);
  const top = Math.max(rect.y, cut.y);
  const right = Math.min(rectRight, cutRight);
  const bottom = Math.min(rectBottom, cutBottom);

  if (left >= right || top >= bottom) return [rect];

  return [
    { ...rect, id: `${rect.id}:gm-top:${Date.now()}`, height: top - rect.y },
    { ...rect, id: `${rect.id}:gm-bottom:${Date.now()}`, y: bottom, height: rectBottom - bottom },
    { ...rect, id: `${rect.id}:gm-left:${Date.now()}`, y: top, width: left - rect.x, height: bottom - top },
    { ...rect, id: `${rect.id}:gm-right:${Date.now()}`, x: right, y: top, width: rectRight - right, height: bottom - top },
  ].filter((piece) => piece.width > 0 && piece.height > 0);
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
  // 상하좌우 + 대각 8방향. 대각 이동을 허용한다.
  const directions = [
    { column: 1, row: 0 },
    { column: -1, row: 0 },
    { column: 0, row: 1 },
    { column: 0, row: -1 },
    { column: 1, row: 1 },
    { column: 1, row: -1 },
    { column: -1, row: 1 },
    { column: -1, row: -1 },
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
    iconName: getExplorationActionIconName(label),
    request: {
      intent,
      playerText,
      mapPoint: getSelectionMapPoint(selection),
      targetId: selection?.kind === 'token' ? (selection.token.npcId ?? undefined) : undefined,
    },
  };
}

function isDetectedArmedHazardSelection(selection: BattleMapSelection | null): boolean {
  const hazard = getSelectionHazard(selection);
  return Boolean(
    hazard &&
      hazard.armed !== false &&
      Array.isArray(hazard.detectedBySessionCharacterIds) &&
      hazard.detectedBySessionCharacterIds.length > 0
  );
}

function isArmedHazardSelection(selection: BattleMapSelection | null): boolean {
  const hazard = getSelectionHazard(selection);
  return Boolean(hazard && hazard.armed !== false);
}

function getSelectionHazard(selection: BattleMapSelection | null) {
  if (!selection || selection.kind !== 'object') return null;
  if (!('hazard' in selection.cell)) return null;
  return selection.cell.hazard;
}

function hasObjectEvents(selection: BattleMapSelection | null): boolean {
  if (!selection || selection.kind !== 'object') return false;
  if (!('events' in selection.cell)) return false;
  return Array.isArray(selection.cell.events) && selection.cell.events.length > 0;
}

function getBasePositionActions(): ExplorationActionButton[] {
  return [
    { label: '이동', localAction: 'move' satisfies ExplorationLocalAction, iconName: getExplorationActionIconName('이동') },
    { label: '핑 찍기', localAction: 'ping' satisfies ExplorationLocalAction, iconName: getExplorationActionIconName('핑 찍기') },
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

function getContextActions(selection: BattleMapSelection | null, isGmView = false): ExplorationActionButton[] {
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
    const investigateAction: ExplorationActionButton = isGmView
      ? {
          label: '조사',
          localAction: 'investigate_object' satisfies ExplorationLocalAction,
          iconName: getExplorationActionIconName('조사'),
        }
      : command('조사', ExplorationMainCommandIntent.INVESTIGATE_OBJECT, selection, `${targetLabel}을 조사합니다.`);
    const unlockAction: ExplorationActionButton = isGmView
      ? {
          label: '잠금 해제',
          localAction: 'unlock_door' satisfies ExplorationLocalAction,
          iconName: getExplorationActionIconName('잠금 해제'),
        }
      : command('잠금 해제', ExplorationMainCommandIntent.INTERACT_OBJECT, selection, `${targetLabel}의 잠금을 해제합니다.`);

    return [
      ...positionActions,
      { label: '열기', localAction: 'open_door' satisfies ExplorationLocalAction, iconName: getExplorationActionIconName('열기') },
      { label: '닫기', localAction: 'close_door' satisfies ExplorationLocalAction, iconName: getExplorationActionIconName('열기') },
      investigateAction,
      unlockAction,
      { label: '부수기', localAction: 'break_door' satisfies ExplorationLocalAction, iconName: getExplorationActionIconName('부수기') },
    ];
  }

  if (selection.kind === 'object') {
    const canDisarmHazard = isGmView
      ? isArmedHazardSelection(selection)
      : isDetectedArmedHazardSelection(selection);
    const hazardActions: ExplorationActionButton[] = canDisarmHazard
      ? [
          {
            label: '함정 해제',
            localAction: 'disarm_hazard' satisfies ExplorationLocalAction,
            iconName: getExplorationActionIconName('함정 해제'),
          },
        ]
      : [];
    const investigateAction: ExplorationActionButton = isGmView
      ? {
          label: '조사',
          localAction: 'investigate_object' satisfies ExplorationLocalAction,
          iconName: getExplorationActionIconName('조사'),
        }
      : command('조사', ExplorationMainCommandIntent.INVESTIGATE_OBJECT, selection, `${targetLabel}을 조사합니다.`);

    return [
      ...positionActions,
      ...hazardActions,
      investigateAction,
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
  isBusy = false,
  selectedInventoryItemId = '',
  getCharacterColorStyle,
  onMapChange,
  onTokenMoveRequest,
  onPingRequest,
  onMapInteractionRequest,
  onUseInventoryItem,
  onEquipInventoryItem,
  onSelectInventoryItem,
  onMapSelectionChange,
  onRequestMainCommand,
  gmNodeMoveOptions = [],
  onGmNodeMove,
  gmItemCatalog = [],
  isGmItemCatalogLoading = false,
  gmItemCatalogError = null,
  isGmInventoryGrantPending = false,
  onGmGrantInventoryItem,
}: ExplorationNodeSurfaceProps) {
  const [isInventoryExpanded, setInventoryExpanded] = useState(false);
  const [mapSelection, setMapSelection] = useState<BattleMapSelection | null>(null);
  const [mapActionFeedback, setMapActionFeedback] = useState<string | null>(null);
  const [selectedMapCharacterId, setSelectedMapCharacterId] = useState<string | null>(null);
  const [isGmPanelCollapsed, setGmPanelCollapsed] = useState(false);
  const [isGmItemPickerOpen, setGmItemPickerOpen] = useState(false);
  const [gmItemQuery, setGmItemQuery] = useState('');
  const [gmItemQuantity, setGmItemQuantity] = useState(1);
  const [selectedGmCatalogItemId, setSelectedGmCatalogItemId] = useState('');
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const selectedMapCharacter =
    characters.find((character) => character.id === selectedMapCharacterId) ?? null;
  const selectedTokenCharacter =
    mapSelection?.kind === 'token' && mapSelection.token.sessionCharacterId
      ? (characters.find((character) => character.id === mapSelection.token.sessionCharacterId) ?? null)
      : null;
  const displayedCharacter = isGmView ? selectedTokenCharacter : myCharacter;
  const displayedInventory = isGmView ? (displayedCharacter?.inventory ?? []) : inventory;
  const canUseDisplayedInventory = !isGmView || displayedCharacter?.id === myCharacter?.id;
  const gmSelectedNonCharacterToken =
    isGmView && mapSelection?.kind === 'token' && !selectedTokenCharacter ? mapSelection.token : null;
  const selectedMapToken = mapSelection?.kind === 'token' ? mapSelection.token : null;
  const shouldShowActorAndInventory = !isGmView || mapSelection?.kind === 'token';
  const actorHpMeterStyle = {
    '--exploration-resource-fill': `${getResourceFillPercent(
      displayedCharacter?.currentHp,
      displayedCharacter?.maxHp
    )}%`,
  } as CSSProperties;
  const actorMovementMeterStyle = {
    '--exploration-resource-fill': `${getResourceFillPercent(
      displayedCharacter?.speed,
      displayedCharacter?.speed
    )}%`,
  } as CSSProperties;
  const selectedTokenGridLabel =
    map && selectedMapToken
      ? `${Math.floor(selectedMapToken.x / map.gridSize)}, ${Math.floor(selectedMapToken.y / map.gridSize)}`
      : null;
  const selectedTokenTypeLabel = displayedCharacter
    ? '플레이어'
    : selectedMapToken?.monster
      ? '몬스터'
      : selectedMapToken?.npcId
        ? 'NPC'
        : '토큰';
  const displayedConditionLabel = displayedCharacter?.conditions.length
    ? displayedCharacter.conditions.join(', ')
    : '없음';
  const selectionDisplay = useMemo(
    () => getSelectionDisplay(mapSelection, node),
    [mapSelection, node]
  );
  const gmMapSummary = useMemo(() => getGmMapSummary(map), [map]);
  const gmSelectionDetails = useMemo(
    () => getGmSelectionDetails(mapSelection),
    [mapSelection]
  );
  const contextActions = useMemo(
    () => getContextActions(mapSelection, isGmView),
    [mapSelection, isGmView]
  );
  const inventoryPanelStyle = {
    '--exploration-inventory-item-count': Math.max(displayedInventory.length, 1),
  } as CSSProperties;
  const gmCatalogItemMatches = useMemo(() => {
    const normalizedQuery = gmItemQuery.trim().toLowerCase();
    const matches = normalizedQuery
      ? gmItemCatalog.filter((item) => getCatalogItemSearchKey(item).includes(normalizedQuery))
      : gmItemCatalog;

    return matches.slice(0, 40);
  }, [gmItemCatalog, gmItemQuery]);
  const selectedGmCatalogItem =
    gmItemCatalog.find((item) => item.id === selectedGmCatalogItemId) ??
    gmCatalogItemMatches[0] ??
    null;

  useEffect(() => {
    onMapSelectionChange?.(mapSelection);
  }, [mapSelection, onMapSelectionChange]);

  useEffect(() => {
    if ((!displayedInventory.length || !shouldShowActorAndInventory) && isInventoryExpanded) {
      setInventoryExpanded(false);
    }
  }, [displayedInventory.length, isInventoryExpanded, shouldShowActorAndInventory]);

  useEffect(() => {
    if (!displayedCharacter || !isGmView) {
      setGmItemPickerOpen(false);
      setSelectedGmCatalogItemId('');
    }
  }, [displayedCharacter, isGmView]);

  async function handleGmInventoryGrant() {
    if (
      !isGmView ||
      !displayedCharacter ||
      !selectedGmCatalogItem ||
      !onGmGrantInventoryItem ||
      isGmInventoryGrantPending
    ) {
      return;
    }

    const quantity = Math.min(99, Math.max(1, Math.trunc(gmItemQuantity || 1)));
    await onGmGrantInventoryItem(displayedCharacter.id, selectedGmCatalogItem, quantity);
    setGmItemPickerOpen(false);
    setGmItemQuery('');
    setGmItemQuantity(1);
    setSelectedGmCatalogItemId('');
  }

  function getControlledToken() {
    if (!map || !myCharacter) return null;
    return map.tokens.find((token) => token.sessionCharacterId === myCharacter.id) ?? null;
  }

  async function handleLocalMapAction(action: NonNullable<ExplorationActionButton['localAction']>) {
    if (!mapSelection) {
      setMapActionFeedback('먼저 맵 타일이나 대상을 선택해 주세요.');
      return;
    }
    if (!map) {
      setMapActionFeedback('맵을 아직 불러오지 못했습니다.');
      return;
    }

    if (action === 'ping') {
      if (onPingRequest) {
        const savedMap = await onPingRequest(mapSelection.point, '!');
        setMapActionFeedback(
          savedMap ? '선택한 위치에 핑을 찍었습니다.' : '핑을 찍지 못했습니다.'
        );
        return;
      }
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

    if (isGmView && mapSelection.kind === 'door' && action === 'unlock_door') {
      onMapChange({
        ...map,
        doorCells: (map.doorCells ?? []).map((door) =>
          door.id === mapSelection.cell.id ? { ...door, state: 'closed' } : door
        ),
        updatedAt: new Date().toISOString(),
      });
      setMapActionFeedback('선택한 문의 잠금을 해제했습니다.');
      return;
    }

    if (
      isGmView &&
      mapSelection.kind === 'door' &&
      (action === 'open_door' || action === 'close_door' || action === 'break_door')
    ) {
      const nextState = action === 'open_door' ? 'open' : action === 'break_door' ? 'broken' : 'closed';
      onMapChange({
        ...map,
        doorCells: (map.doorCells ?? []).map((door) =>
          door.id === mapSelection.cell.id ? { ...door, state: nextState } : door
        ),
        updatedAt: new Date().toISOString(),
      });
      setMapActionFeedback(`선택한 문의 상태를 ${getDoorStateLabel(nextState)}으로 변경했습니다.`);
      return;
    }

    if (isGmView && mapSelection.kind === 'object' && action === 'disarm_hazard') {
      onMapChange({
        ...map,
        objectCells: (map.objectCells ?? []).map((cell) =>
          cell.id === mapSelection.cell.id && cell.hazard
            ? { ...cell, hazard: { ...cell.hazard, armed: false } }
            : cell
        ),
        updatedAt: new Date().toISOString(),
      });
      setMapActionFeedback('선택한 위험 요소를 판정 없이 해제했습니다.');
      return;
    }

    if (
      isGmView &&
      (mapSelection.kind === 'door' || mapSelection.kind === 'object') &&
      action === 'investigate_object'
    ) {
      setMapActionFeedback('GM은 판정 없이 선택한 대상 정보를 확인합니다.');
      return;
    }

    if (
      action === 'open_door' ||
      action === 'close_door' ||
      action === 'break_door' ||
      action === 'investigate_object' ||
      action === 'disarm_hazard'
    ) {
      if (!onMapInteractionRequest) {
        setMapActionFeedback('맵 상호작용을 처리할 수 없습니다.');
        return;
      }
      const response = await onMapInteractionRequest({
        kind: action,
        targetId:
          mapSelection.kind !== 'token' && mapSelection.kind !== 'tile'
            ? mapSelection.cell.id
            : undefined,
        mapPoint: {
          x: Math.round(mapSelection.point.x),
          y: Math.round(mapSelection.point.y),
        },
        actorSessionCharacterId: myCharacter?.id ?? null,
      });
      setMapActionFeedback(response?.message ?? '맵 상호작용을 처리하지 못했습니다.');
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

    if (onTokenMoveRequest) {
      const savedMap = await onTokenMoveRequest(controlledToken, nextPosition, [
        { x: controlledToken.x, y: controlledToken.y },
        nextPosition,
      ]);
      setMapActionFeedback(
        savedMap
          ? `${controlledToken.name} 토큰을 선택한 타일로 이동했습니다.`
          : `${controlledToken.name} 토큰을 이동하지 못했습니다.`
      );
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

  async function handleGmMapAction(action: ExplorationGmMapAction) {
    if (!isGmView) return;
    if (!map) {
      setMapActionFeedback('맵을 아직 불러오지 못했습니다.');
      return;
    }

    if (action === 'reveal_all_fog') {
      onMapChange({ ...map, fogRects: [], updatedAt: new Date().toISOString() });
      setMapActionFeedback('전체 안개를 공개 상태로 변경했습니다.');
      return;
    }

    if (!mapSelection) {
      setMapActionFeedback('먼저 GM이 조작할 맵 요소를 선택해 주세요.');
      return;
    }

    if (action === 'reveal_fog_at_selection') {
      const radius = map.gridSize * 2;
      const cut = {
        x: Math.max(0, mapSelection.point.x - radius),
        y: Math.max(0, mapSelection.point.y - radius),
        width: Math.min(map.width, radius * 2),
        height: Math.min(map.height, radius * 2),
      };
      onMapChange({
        ...map,
        fogRects: map.fogRects.flatMap((rect) => subtractRect(rect, cut)),
        updatedAt: new Date().toISOString(),
      });
      setMapActionFeedback('선택 지점 주변의 안개를 공개했습니다.');
      return;
    }

    if (mapSelection.kind === 'token' && action === 'toggle_token_hidden') {
      onMapChange({
        ...map,
        tokens: map.tokens.map((token) =>
          token.id === mapSelection.token.id ? { ...token, hidden: !token.hidden } : token
        ),
        updatedAt: new Date().toISOString(),
      });
      setMapActionFeedback(
        mapSelection.token.hidden ? '선택 토큰을 플레이어에게 공개했습니다.' : '선택 토큰을 숨김 처리했습니다.'
      );
      return;
    }

    if (mapSelection.kind === 'object' && action === 'toggle_object_visible') {
      onMapChange({
        ...map,
        objectCells: (map.objectCells ?? []).map((cell) =>
          cell.id === mapSelection.cell.id
            ? { ...cell, visibleToPlayers: cell.visibleToPlayers === false }
            : cell
        ),
        updatedAt: new Date().toISOString(),
      });
      setMapActionFeedback(
        'visibleToPlayers' in mapSelection.cell && mapSelection.cell.visibleToPlayers === false
          ? '선택 오브젝트를 플레이어에게 공개했습니다.'
          : '선택 오브젝트를 플레이어에게 비공개 처리했습니다.'
      );
      return;
    }

    if (mapSelection.kind === 'object' && action === 'trigger_object') {
      if (!hasObjectEvents(mapSelection)) {
        setMapActionFeedback('선택한 오브젝트에 등록된 이벤트가 없습니다.');
        return;
      }
      if (!onMapInteractionRequest) {
        setMapActionFeedback('맵 상호작용을 처리할 수 없습니다.');
        return;
      }
      const response = await onMapInteractionRequest({
        kind: 'trigger_object',
        targetId: mapSelection.cell.id,
        mapPoint: {
          x: Math.round(mapSelection.point.x),
          y: Math.round(mapSelection.point.y),
        },
        actorSessionCharacterId: null,
      });
      setMapActionFeedback(response?.message ?? '오브젝트 이벤트를 처리하지 못했습니다.');
      return;
    }

    setMapActionFeedback('선택 대상에 사용할 수 없는 GM 조작입니다.');
  }

  return (
    <div className="exploration-node-surface">
      <NodeHeaderScroll variant="exploration" className="exploration-node-header">
        <div className="exploration-node-title-row">
          <img
            src={explorationNodeBadge}
            alt="탐험 노드"
            className="session-node-type-badge"
          />
          <h1 className="node-header-scroll-title">{node?.title ?? scenarioTitle ?? '탐색 중인 지역'}</h1>
        </div>

        <div className="exploration-node-status-row" aria-label="탐색 상태">
          <span>{getPhaseLabel(phase)}</span>
          {isGmView ? <span>GM 화면</span> : <span>플레이어 화면</span>}
        </div>
      </NodeHeaderScroll>

      <div
        className={`exploration-node-content${isGmView ? ' gm-view' : ''}${
          isGmView && isGmPanelCollapsed ? ' gm-panel-collapsed' : ''
        }`}
      >
        <main className="exploration-map-column">
          <section className="exploration-map-panel" aria-label="탐색 지도">
            <MapPartyOverlay
              characters={characters}
              currentUserId={currentUserId}
              getCharacterColorStyle={getCharacterColorStyle}
              onCharacterClick={(character) => setSelectedMapCharacterId(character.id)}
            />
            {map ? (
              <SessionBattleMap
                map={map}
                characters={characters}
                isHost={isHost}
                currentUserId={currentUserId}
                showHiddenContent={isGmView}
                onMapChange={onMapChange}
                onTokenMoveRequest={isGmView ? undefined : onTokenMoveRequest}
                onPingRequest={onPingRequest}
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

        {isGmView ? (
          <aside
            className={`exploration-gm-panel${isGmPanelCollapsed ? ' collapsed' : ''}`}
            aria-label="GM 탐색 제어"
          >
            <button
              type="button"
              className="exploration-gm-panel-toggle"
              aria-label={isGmPanelCollapsed ? 'GM 패널 열기' : 'GM 패널 접기'}
              aria-expanded={!isGmPanelCollapsed}
              title={isGmPanelCollapsed ? 'GM 패널 열기' : 'GM 패널 접기'}
              onClick={() => setGmPanelCollapsed((current) => !current)}
            >
              <span className="exploration-gm-panel-toggle-arrow" aria-hidden="true" />
            </button>
            <div className="exploration-gm-panel-body" aria-hidden={isGmPanelCollapsed}>
              <div className="exploration-gm-card">
              <span className="exploration-node-eyebrow">GM 지도 상태</span>
              <div className="exploration-gm-metrics">
                <span>
                  숨김 토큰 <strong>{gmMapSummary.hiddenTokens}</strong>
                </span>
                <span>
                  비공개 오브젝트 <strong>{gmMapSummary.hiddenObjects}</strong>
                </span>
                <span>
                  활성 위험 <strong>{gmMapSummary.hazards}</strong>
                </span>
                <span>
                  잠긴 문 <strong>{gmMapSummary.lockedDoors}</strong>
                </span>
                <span>
                  안개 영역 <strong>{gmMapSummary.fogRects}</strong>
                </span>
              </div>
              </div>

              <div className="exploration-gm-card">
              <span className="exploration-node-eyebrow">선택 대상 인스펙터</span>
              <strong className="exploration-gm-selection-title">{gmSelectionDetails.title}</strong>
              <div className="exploration-gm-tag-list">
                {gmSelectionDetails.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="exploration-gm-detail-list">
                {gmSelectionDetails.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              </div>

              <div className="exploration-gm-card exploration-gm-controls">
              <span className="exploration-node-eyebrow">GM 조작</span>
              <div className="exploration-gm-button-grid">
                <button
                  type="button"
                  disabled={isBusy || mapSelection?.kind !== 'token'}
                  onClick={() => void handleGmMapAction('toggle_token_hidden')}
                >
                  토큰 공개/숨김
                </button>
                <button
                  type="button"
                  disabled={isBusy || mapSelection?.kind !== 'object'}
                  onClick={() => void handleGmMapAction('toggle_object_visible')}
                >
                  오브젝트 공개/숨김
                </button>
                <button
                  type="button"
                  disabled={isBusy || !hasObjectEvents(mapSelection)}
                  onClick={() => void handleGmMapAction('trigger_object')}
                >
                  이벤트 발동
                </button>
                <button
                  type="button"
                  disabled={isBusy || !mapSelection || !map?.fogRects.length}
                  onClick={() => void handleGmMapAction('reveal_fog_at_selection')}
                >
                  주변 공개
                </button>
                <button
                  type="button"
                  disabled={isBusy || !map?.fogRects.length}
                  onClick={() => void handleGmMapAction('reveal_all_fog')}
                >
                  전체 공개
                </button>
              </div>
              </div>

              <div className="exploration-gm-card exploration-gm-node-move">
              <span className="exploration-node-eyebrow">장면 이동</span>
              {gmNodeMoveOptions.length ? (
                <div className="exploration-gm-node-list">
                  {gmNodeMoveOptions.map((option) => (
                    <button
                      type="button"
                      key={`${option.nodeId}-${option.label ?? option.condition ?? option.title}`}
                      disabled={isBusy || !onGmNodeMove}
                      onClick={() => void onGmNodeMove?.(option.nodeId)}
                    >
                      <strong>{option.label?.trim() || option.title}</strong>
                      <span>
                        {option.title}
                        {option.isFallback ? ' · 기본 이동' : ''}
                        {option.nodeType ? ` · ${option.nodeType}` : ''}
                      </span>
                      {option.condition ? <small>{option.condition}</small> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="exploration-gm-empty-text">현재 노드에서 바로 이동 가능한 노드가 없습니다.</p>
              )}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <section
        className={`exploration-action-dock${shouldShowActorAndInventory ? '' : ' action-only'}`}
        aria-label="탐색 행동"
      >
        {shouldShowActorAndInventory ? (
          <div className="exploration-actor-status">
            <span className="exploration-frame-corner top-left" aria-hidden="true" />
            <span className="exploration-frame-corner top-right" aria-hidden="true" />
            <span className="exploration-frame-corner bottom-left" aria-hidden="true" />
            <span className="exploration-frame-corner bottom-right" aria-hidden="true" />
            <span className="exploration-node-eyebrow">{isGmView ? '선택한 캐릭터' : '현재 조작 캐릭터'}</span>
            <strong>
              {displayedCharacter?.name ??
                (gmSelectedNonCharacterToken ? gmSelectedNonCharacterToken.name : '캐릭터 미선택')}
            </strong>
            {displayedCharacter ? (
              <>
                <div className="exploration-actor-stat-grid" aria-label="선택 캐릭터 주요 능력치">
                  <span>
                    직업 <strong>{getCharacterClassLabel(displayedCharacter.className)}</strong>
                  </span>
                  <span>
                    레벨 <strong>{displayedCharacter.level}</strong>
                  </span>
                  <span>
                    AC <strong>{displayedCharacter.armorClass}</strong>
                  </span>
                  <span>
                    상태 <strong>{displayedConditionLabel}</strong>
                  </span>
                </div>
                <div className="exploration-resource-meter-grid">
                  <div className="exploration-resource-meter hp" style={actorHpMeterStyle}>
                    <div className="exploration-resource-meter-label">
                      <span>HP</span>
                      <strong>
                        {displayedCharacter.currentHp}/{displayedCharacter.maxHp}
                      </strong>
                    </div>
                    <span className="exploration-resource-meter-track" aria-hidden="true">
                      <span className="exploration-resource-meter-fill" />
                    </span>
                  </div>
                  <div className="exploration-resource-meter" style={actorMovementMeterStyle}>
                    <div className="exploration-resource-meter-label">
                      <span>이동</span>
                      <strong>{displayedCharacter.speed}ft</strong>
                    </div>
                    <span className="exploration-resource-meter-track" aria-hidden="true">
                      <span className="exploration-resource-meter-fill" />
                    </span>
                  </div>
                </div>
                {selectedTokenGridLabel ? (
                  <p className="exploration-actor-token-note">
                    토큰 좌표 {selectedTokenGridLabel}
                    {selectedMapToken?.hidden ? ' · 플레이어 비공개' : ' · 플레이어 공개'}
                  </p>
                ) : null}
              </>
            ) : gmSelectedNonCharacterToken ? (
              <>
                <div className="exploration-actor-stat-grid" aria-label="선택 토큰 정보">
                  <span>
                    유형 <strong>{selectedTokenTypeLabel}</strong>
                  </span>
                  <span>
                    크기 <strong>{gmSelectedNonCharacterToken.size}</strong>
                  </span>
                  <span>
                    좌표 <strong>{selectedTokenGridLabel ?? '-'}</strong>
                  </span>
                  <span>
                    공개 <strong>{gmSelectedNonCharacterToken.hidden ? '숨김' : '공개'}</strong>
                  </span>
                </div>
                <p className="exploration-actor-token-note">
                  NPC와 몬스터 토큰은 현재 인벤토리 대신 지도 상태만 표시합니다.
                </p>
              </>
            ) : (
              <p>지도에서 위치를 확인하고 메인 명령으로 행동을 선언하세요.</p>
            )}
          </div>
        ) : null}

        <div className="exploration-action-panel">
          <span className="exploration-frame-corner top-left" aria-hidden="true" />
          <span className="exploration-frame-corner top-right" aria-hidden="true" />
          <span className="exploration-frame-corner bottom-left" aria-hidden="true" />
          <span className="exploration-frame-corner bottom-right" aria-hidden="true" />
          <span className="exploration-node-eyebrow">선택 대상 행동</span>
          <div className="exploration-action-list">
            {contextActions.map((action) => {
              const hasIcon = Boolean(action.iconName);

              return (
                <button
                  type="button"
                  key={action.label}
                  className={hasIcon ? 'exploration-action-button has-action-icon' : 'exploration-action-button'}
                  disabled={
                    action.disabled ||
                    isBusy ||
                    (!action.localAction && (!action.request || !onRequestMainCommand))
                  }
                  onClick={() => {
                    if (action.localAction) {
                      void handleLocalMapAction(action.localAction);
                      return;
                    }
                    if (!action.request) return;
                    onRequestMainCommand?.(action.request);
                  }}
                >
                  {action.iconName ? (
                    <>
                      <GameIcon
                        name={action.iconName}
                        size={36}
                        className="exploration-action-button-icon"
                      />
                      <span className="exploration-action-button-label">{action.label}</span>
                    </>
                  ) : (
                    action.label
                  )}
                </button>
              );
            })}
          </div>
          {mapActionFeedback ? (
            <p className="exploration-map-action-feedback">{mapActionFeedback}</p>
          ) : null}
        </div>

        {shouldShowActorAndInventory ? (
          <div className="exploration-inventory-slot">
            <div
              className={`exploration-inventory-panel${isInventoryExpanded ? ' expanded' : ''}`}
              style={inventoryPanelStyle}
            >
            <span className="exploration-frame-corner top-left" aria-hidden="true" />
            <span className="exploration-frame-corner top-right" aria-hidden="true" />
            <span className="exploration-frame-corner bottom-left" aria-hidden="true" />
            <span className="exploration-frame-corner bottom-right" aria-hidden="true" />
            <div className="exploration-inventory-head">
              <span className="exploration-node-eyebrow">인벤토리</span>
              <div className="exploration-inventory-head-actions">
                {isGmView && displayedCharacter && onGmGrantInventoryItem ? (
                  <button
                    type="button"
                    className="exploration-gm-inventory-grant-button"
                    disabled={isBusy || isGmInventoryGrantPending}
                    title={`${displayedCharacter.name}에게 아이템 지급`}
                    onClick={() => setGmItemPickerOpen(true)}
                  >
                    지급
                  </button>
                ) : null}
                {displayedInventory.length ? (
                  <button
                    type="button"
                    className="exploration-inventory-toggle"
                    aria-expanded={isInventoryExpanded}
                    aria-controls="exploration-inventory-list"
                    title={isInventoryExpanded ? '인벤토리 접기' : '인벤토리 펼치기'}
                    onClick={() => setInventoryExpanded((current) => !current)}
                  >
                    <span className="exploration-inventory-toggle-arrow" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
            <InventoryEquipmentStatus
              inventory={displayedInventory}
              equippedWeaponId={displayedCharacter?.equippedWeaponId}
              offhandWeaponId={displayedCharacter?.offhandWeaponId}
            />
            <div className="inventory-section-heading">
              <span>보유 아이템</span>
            </div>
            {displayedInventory.length ? (
              <div
                id="exploration-inventory-list"
                className={`exploration-inventory-list${isInventoryExpanded ? ' expanded' : ''}`}
              >
                {displayedInventory.flatMap((item) => {
                  const isWeapon = isWeaponItem(item);
                  const isShield = isShieldItem(item);
                  const equippedCount = isWeapon || isShield
                    ? Number(isEquippedItem(item, displayedCharacter?.equippedWeaponId)) +
                      Number(isEquippedItem(item, displayedCharacter?.offhandWeaponId))
                    : 0;
                  const availableCount = Math.max(0, item.quantity - equippedCount);
                  if (!equippedCount) {
                    return [{ item, equipmentDisplayState: 'available' as const }];
                  }

                  const rows: Array<{
                    item: InventoryItemDto;
                    equipmentDisplayState: 'equipped' | 'available';
                  }> = [
                    {
                      item: { ...item, quantity: equippedCount },
                      equipmentDisplayState: 'equipped' as const,
                    },
                  ];
                  if (availableCount > 0) {
                    rows.push({
                      item: { ...item, quantity: availableCount },
                      equipmentDisplayState: 'available' as const,
                    });
                  }
                  return rows;
                }).map(({ item, equipmentDisplayState }) => {
                  const canUse = isQuickUsableItem(item);
                  const isSelected = selectedInventoryItemId === item.id;
                  const isWeapon = isWeaponItem(item);
                  const isArmor = isArmorItem(item);
                  const isShield = isShieldItem(item);
                  const isEquipped = isWeapon
                    ? equipmentDisplayState === 'equipped'
                    : isShield
                      ? equipmentDisplayState === 'equipped'
                      : isArmor;
                  const equipmentActionItem = {
                    ...item,
                    __equipmentDisplayState: equipmentDisplayState,
                  } as InventoryItemDto;
                  return (
                    <article
                      className={`exploration-inventory-item${isSelected ? ' selected' : ''}`}
                      key={`${item.id}-${equipmentDisplayState}`}
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
                      <span className="exploration-inventory-item-icon" aria-hidden="true">
                        <GameIcon name={getInventoryItemIconName(item)} size={28} />
                      </span>
                      <div className="exploration-inventory-item-body">
                        <strong className="inventory-item-info-host">
                          <InventoryItemInfo item={item} triggerMode="button" />
                        </strong>
                      </div>
                      <span className="exploration-inventory-quantity">x{item.quantity}</span>
                      {isWeapon || isArmor || isShield ? (
                        <button
                          type="button"
                          disabled={isArmor || isBusy || !onEquipInventoryItem || !canUseDisplayedInventory}
                          title={
                            !canUseDisplayedInventory
                              ? 'GM 화면에서는 선택 캐릭터의 인벤토리를 조회만 합니다.'
                              : isArmor
                                ? '몸통 방어구는 현재 캐릭터 AC에 반영되어 있습니다.'
                                : isEquipped
                                  ? `${item.name} 착용 해제`
                                  : `${item.name} 착용`
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onEquipInventoryItem?.(equipmentActionItem);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {isEquipped ? '해제' : '착용'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canUse || isBusy || !canUseDisplayedInventory}
                          title={
                            !canUseDisplayedInventory
                              ? 'GM 화면에서는 선택 캐릭터의 인벤토리를 조회만 합니다.'
                              : canUse
                                ? `${item.name} 사용`
                                : '현재 바로 사용할 수 없는 아이템입니다.'
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onUseInventoryItem(item);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          사용
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p>보유 중인 아이템이 없습니다.</p>
            )}
            </div>
          </div>
        ) : null}
      </section>
      {isGmItemPickerOpen && displayedCharacter ? (
        <div
          className="exploration-gm-item-picker-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setGmItemPickerOpen(false);
            }
          }}
        >
          <section
            className="exploration-gm-item-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exploration-gm-item-picker-title"
          >
            <div className="exploration-gm-item-picker-head">
              <div>
                <span className="exploration-node-eyebrow">아이템 지급</span>
                <h3 id="exploration-gm-item-picker-title">{displayedCharacter.name}</h3>
              </div>
              <button
                type="button"
                className="exploration-gm-item-picker-close"
                title="닫기"
                onClick={() => setGmItemPickerOpen(false)}
              >
                ×
              </button>
            </div>
            <label className="exploration-gm-item-picker-search">
              <span>아이템 검색</span>
              <input
                value={gmItemQuery}
                onChange={(event) => {
                  setGmItemQuery(event.target.value);
                  setSelectedGmCatalogItemId('');
                }}
                placeholder="이름, 키, 분류"
              />
            </label>
            <div className="exploration-gm-item-picker-list">
              {isGmItemCatalogLoading ? (
                <p>아이템 목록을 불러오는 중입니다.</p>
              ) : gmItemCatalogError ? (
                <p>{gmItemCatalogError}</p>
              ) : gmCatalogItemMatches.length ? (
                gmCatalogItemMatches.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={selectedGmCatalogItem?.id === item.id ? 'selected' : ''}
                    onClick={() => setSelectedGmCatalogItemId(item.id)}
                  >
                    <strong>{item.koName}</strong>
                    <span>{item.category}</span>
                  </button>
                ))
              ) : (
                <p>검색 결과가 없습니다.</p>
              )}
            </div>
            <div className="exploration-gm-item-picker-footer">
              <label>
                <span>수량</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={gmItemQuantity}
                  onChange={(event) =>
                    setGmItemQuantity(
                      Math.min(99, Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                    )
                  }
                />
              </label>
              <button
                type="button"
                disabled={!selectedGmCatalogItem || isGmInventoryGrantPending}
                onClick={() => void handleGmInventoryGrant()}
              >
                {isGmInventoryGrantPending ? '지급 중' : '지급'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {selectedMapCharacter ? (
        <CharacterDetailModal
          character={selectedMapCharacter}
          onEquipInventoryItem={onEquipInventoryItem}
          isEquipmentBusy={isBusy}
          onClose={() => setSelectedMapCharacterId(null)}
        />
      ) : null}
    </div>
  );
}
