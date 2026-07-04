import type { PlayerScenarioNodeDto, VttMapStateDto } from '@trpg/shared-types';
import type { BattleMapSelection } from '../components/SessionBattleMap';
import { getCharacterClassLabel } from './characterVisuals';

function getArrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function getCellKindLabel(
  selection: Extract<BattleMapSelection, { kind: 'terrain' | 'wall' | 'door' | 'object' }>
) {
  if (selection.kind === 'terrain') return '접근불가';
  if (selection.kind === 'wall') return '벽';
  if (selection.kind === 'door') return '문';
  return '오브젝트';
}

export function getDoorStateLabel(state: string | undefined) {
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

export function getSelectionDisplay(
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

export function getGmMapSummary(map: VttMapStateDto | null) {
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

export function getGmSelectionDetails(selection: BattleMapSelection | null) {
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
