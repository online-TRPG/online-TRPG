import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  ClassDefinitionResponseDto,
  CombatResponseDto,
  InventoryItemDto,
  PlayerScenarioNodeDto,
  SessionCharacterResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import { SessionBattleMap } from './SessionBattleMap';
import type { BattleMapSelection } from './SessionBattleMap';
import { GameIcon } from '../../../components/GameIcon';
import type { GameIconName } from '../../../components/GameIcon';
import battleNodeBadge from '../../../components/node_badge_battle.webp';
import turnDividerArrow from '../../../components/divider-arrow-gold-horizontal.webp';
import { CharacterDetailModal } from './CharacterDetailModal';
import { InventoryEquipmentStatus } from './InventoryEquipmentStatus';
import { InventoryItemInfo } from './InventoryItemInfo';
import { MapPartyOverlay } from './MapPartyOverlay';
import { NodeHeaderScroll } from './NodeHeaderScroll';
import { getCharacterImage } from '../utils/characterVisuals';
import { describeCombatParticipantObservation } from '../utils/combatParticipantObservation';
import { MONSTER_TOKEN_COLOR, NPC_TOKEN_COLOR } from '../../../utils/sessionTokenColors';
import type { SessionTokenColor } from '../../../utils/sessionTokenColors';
import './CombatNodeSurface.css';

type CombatActionTab = 'basic' | 'ability' | 'spell';
type CombatMovementMode = 'normal' | 'jump';
type ForcedMovementMode = 'push' | 'pull' | 'slide';
type CombatActorActionType = 'attack' | 'dash' | 'dodge' | 'hide';
type SpellFilter = 'all' | 'cantrip' | 'level1' | 'level3';
type CombatResourceIconKind = 'action' | 'bonus' | 'reaction';
type CombatParticipant = CombatResponseDto['participants'][number];
type CombatMonsterAction = NonNullable<CombatParticipant['monsterActions']>[number];
type CombatConditionOption = {
  id: string;
  label: string;
};

type CombatAbilityButton = {
  key: string;
  label: string;
  action: 'second_wind' | 'sneak_attack';
  title: string;
  requiresAction?: boolean;
  requiresBonusAction?: boolean;
  disabled?: boolean;
};

interface CombatNodeSurfaceProps {
  node: PlayerScenarioNodeDto | null;
  scenarioTitle?: string | null;
  phase?: string | null;
  characters: SessionCharacterResponseDto[];
  classDefinitions: ClassDefinitionResponseDto[];
  currentUserId: string;
  isHost: boolean;
  isGmView?: boolean;
  map: VttMapStateDto | null;
  combat: CombatResponseDto | null;
  combatError?: string | null;
  isCombatBusy?: boolean;
  inventory: InventoryItemDto[];
  isInventoryBusy?: boolean;
  getCharacterColorStyle?: (character: SessionCharacterResponseDto) => CSSProperties;
  onMapChange: (map: VttMapStateDto) => void;
  onPingRequest?: (point: { x: number; y: number }, label?: string) => Promise<VttMapStateDto | null>;
  onTokenMoveRequest?: (
    token: VttMapStateDto['tokens'][number],
    to: { x: number; y: number },
    path: Array<{ x: number; y: number }>,
    movementMode?: CombatMovementMode
  ) => Promise<VttMapStateDto | null>;
  onUseInventoryItem: (item: InventoryItemDto) => void;
  onEquipInventoryItem: (item: InventoryItemDto) => void;
  onThrowInventoryItem: (
    item: InventoryItemDto,
    point: { x: number; y: number }
  ) => void | Promise<void>;
  onPickupMapObject?: (
    objectId: string,
    itemDefinitionId: string,
    quantity: number,
    point: { x: number; y: number }
  ) => void | Promise<void>;
  onAttackWithEquippedWeapon: (targetParticipantId: string) => void | Promise<void>;
  onMonsterAction?: (
    targetParticipantId?: string | null,
    actionType?: CombatActorActionType,
    actionId?: string | null
  ) => void | Promise<void>;
  onAttackWithOffhandWeapon: (targetParticipantId: string) => void | Promise<void>;
  onSneakAttack: (targetParticipantId: string) => void | Promise<void>;
  onDash: () => void | Promise<void>;
  onDodge: () => void | Promise<void>;
  onHide: () => void | Promise<void>;
  onReadyAction: (targetParticipantId: string) => void | Promise<void>;
  onApplyCondition?: (
    targetTokenOrParticipantId: string,
    conditionId: string,
    operation: 'add' | 'remove'
  ) => void | Promise<void>;
  onForceMoveParticipant?: (
    targetParticipantId: string,
    mode: ForcedMovementMode,
    origin: { x: number; y: number },
    distanceFt: number
  ) => void | Promise<void>;
  onUseClassFeature: (action: 'second_wind') => void | Promise<void>;
  onCastSpell: (
    spellId: string,
    payload: {
      targetParticipantIds?: string[];
      point?: { x: number; y: number } | null;
      slotLevel?: number;
    }
  ) => void | Promise<void>;
  onEndCombat: () => void;
  onEndTurn: (force?: boolean) => void;
}

const baseActionTabs: Array<{ id: CombatActionTab; label: string; actions: string[] }> = [
  {
    id: 'basic',
    label: '일반',
    actions: ['공격', '도약', '대시', '회피', '숨기', '준비'],
  },
  {
    id: 'ability',
    label: '능력',
    actions: [],
  },
];

const mvpSpellLabels = [
  'Chill Touch',
  'Fire Bolt',
  'Ray of Frost',
  'Light',
  'Magic Missile',
  'Cure Wounds',
  'Shield',
  'Sleep',
  'Fireball',
];

const gmCombatConditionOptions: CombatConditionOption[] = [
  { id: 'condition.stunned', label: '기절' },
  { id: 'condition.poisoned', label: '중독' },
  { id: 'condition.prone', label: '넘어짐' },
  { id: 'condition.burning', label: '화상' },
];

const gmForcedMovementOptions: Array<{ mode: ForcedMovementMode; label: string }> = [
  { mode: 'push', label: '밀치기' },
  { mode: 'pull', label: '당기기' },
  { mode: 'slide', label: '이동시키기' },
];
const gmForcedMovementDistanceOptions = [5, 10, 15, 20, 30];

const mvpSpellIdsByLabel: Record<string, string> = {
  'Chill Touch': 'spell.chill_touch',
  'Fire Bolt': 'spell.fire_bolt',
  'Ray of Frost': 'spell.ray_of_frost',
  Light: 'spell.light',
  'Magic Missile': 'spell.magic_missile',
  'Cure Wounds': 'spell.cure_wounds',
  Shield: 'spell.shield',
  Sleep: 'spell.sleep',
  Fireball: 'spell.fireball',
};

const mvpSpellRangeFtById: Record<string, number> = {
  'spell.chill_touch': 120,
  'spell.fire_bolt': 120,
  'spell.ray_of_frost': 60,
  'spell.light': 5,
  'spell.magic_missile': 120,
  'spell.cure_wounds': 5,
  'spell.sleep': 90,
  'spell.fireball': 150,
};

const mvpSpellLevelById: Record<string, 0 | 1 | 3> = {
  'spell.chill_touch': 0,
  'spell.fire_bolt': 0,
  'spell.ray_of_frost': 0,
  'spell.light': 0,
  'spell.magic_missile': 1,
  'spell.cure_wounds': 1,
  'spell.shield': 1,
  'spell.sleep': 1,
  'spell.fireball': 3,
};

const preparedSpellClassKeys = new Set(['cleric', 'druid', 'paladin', 'wizard']);

const spellFilterOptions: Array<{ id: SpellFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'cantrip', label: '소마법' },
  { id: 'level1', label: '1레벨 마법' },
  { id: 'level3', label: '3레벨 마법' },
];

const combatActionIconNames: Partial<Record<string, GameIconName>> = {
  공격: 'game-icons:crossed-swords',
  '보조 공격': 'game-icons:two-handed-sword',
  도약: 'game-icons:jump-across',
  대시: 'game-icons:running-shoe',
  회피: 'game-icons:dodge',
  숨기: 'game-icons:ninja-mask',
  준비: 'game-icons:time-trap',
  기절: 'game-icons:knockout',
  중독: 'game-icons:poison-bottle',
  넘어짐: 'game-icons:falling',
  화상: 'game-icons:burning-round-shot',
  'Second Wind': 'game-icons:health-increase',
  'Chill Touch': 'game-icons:ice-bolt',
  'Fire Bolt': 'game-icons:fireball',
  'Ray of Frost': 'game-icons:ice-bolt',
  Light: 'game-icons:sun',
  'Magic Missile': 'game-icons:magic-swirl',
  'Cure Wounds': 'game-icons:health-increase',
  Shield: 'game-icons:magic-shield',
  Sleep: 'game-icons:night-sleep',
  Fireball: 'game-icons:fireball',
};

function getCombatActionIconName(label: string): GameIconName | undefined {
  // 전투 하위 액션은 상위 탭과 구분되도록 라벨별 RPG 아이콘을 한곳에서 관리합니다.
  return combatActionIconNames[label];
}

function CombatActionButtonContent({ label }: { label: string }) {
  const iconName = getCombatActionIconName(label);

  if (!iconName) return <span className="combat-action-button-label">{label}</span>;

  return (
    <>
      <GameIcon name={iconName} size={36} className="combat-action-button-icon" />
      <span className="combat-action-button-label">{label}</span>
    </>
  );
}

function getMonsterActionRangeLabel(action: CombatParticipant['monsterActions'][number]) {
  if (!action.rangeFt) return null;
  if (action.longRangeFt && action.longRangeFt > action.rangeFt) {
    return `${action.rangeFt}/${action.longRangeFt}ft`;
  }
  return `${action.rangeFt}ft`;
}

function getMonsterActionUnavailableLabel(action: CombatMonsterAction) {
  if (action.unavailableReason === 'MONSTER_RECHARGE_ACTION_EXPENDED') return '재충전 대기';
  if (action.unavailableReason === 'MONSTER_LIMITED_USE_ACTION_EXPENDED') return '사용 완료';
  return action.available === false ? '사용 불가' : null;
}

function normalizeClassKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
}

function getClassAbilityButtons(
  character: SessionCharacterResponseDto | null,
  participantConditions: string[] | undefined
): CombatAbilityButton[] {
  if (!character) return [];

  const classKey = normalizeClassKey(character.className);
  const buttons: CombatAbilityButton[] = [];

  if (classKey.includes('fighter')) {
    buttons.push({
      key: 'second_wind',
      label: 'Second Wind',
      action: 'second_wind',
      title: 'Bonus Action을 사용해 1d10 + Fighter 레벨만큼 자신을 회복합니다.',
      requiresBonusAction: true,
      disabled: (participantConditions ?? []).includes('resource:second_wind_expended'),
    });
  }

  if (classKey.includes('rogue')) {
    buttons.push({
      key: 'sneak_attack',
      label: '암습',
      action: 'sneak_attack',
      title:
        'Action을 사용해 이점이 있는 finesse 또는 원거리 무기 공격을 합니다. 명중하면 턴당 한 번 추가 피해를 줍니다.',
      requiresAction: true,
      disabled: participantConditions?.includes('resource:sneak_attack_expended'),
    });
  }

  return buttons;
}

function normalizeSpellId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return normalized.startsWith('spell.') ? normalized : `spell.${normalized}`;
}

function hasMvpSpell(character: SessionCharacterResponseDto | null, spellId: string) {
  if (!character) return false;
  const cantrips = (character.spells?.cantrips ?? []).map(normalizeSpellId);
  if (cantrips.includes(spellId)) return true;

  const learnedSpells = (character.spells?.spells ?? []).map(normalizeSpellId);
  if (!learnedSpells.includes(spellId)) return false;

  const spellLevel = mvpSpellLevelById[spellId];
  const preparedSpells = character.spells?.preparedSpells;
  if (
    spellLevel &&
    preparedSpellClassKeys.has(normalizeClassKey(character.className)) &&
    preparedSpells
  ) {
    return preparedSpells.map(normalizeSpellId).includes(spellId);
  }

  return true;
}

function getKnownMvpSpellActions(character: SessionCharacterResponseDto | null) {
  return mvpSpellLabels.filter((label) => {
    const spellId = mvpSpellIdsByLabel[label];
    return Boolean(spellId && hasMvpSpell(character, spellId));
  });
}

function getSpellLevel(label: string) {
  const spellId = mvpSpellIdsByLabel[label];
  return spellId ? mvpSpellLevelById[spellId] : undefined;
}

function getSpellTargetingHint(spellId: string) {
  if (
    spellId === 'spell.chill_touch' ||
    spellId === 'spell.fire_bolt' ||
    spellId === 'spell.ray_of_frost'
  ) {
    return '사거리 안의 적 토큰을 선택하세요. 벽/닫힌 문/오브젝트 엄폐는 서버가 명중 보정에 반영합니다.';
  }
  if (spellId === 'spell.magic_missile') {
    return '사거리 안의 적 토큰을 선택하세요. 대상이 완전 엄폐 뒤에 있으면 슬롯/행동 소모 전에 서버가 차단합니다.';
  }
  if (spellId === 'spell.cure_wounds') {
    return '접촉 가능한 아군 또는 자기 토큰을 선택하세요. 완전 엄폐 뒤 대상은 서버가 차단합니다.';
  }
  if (spellId === 'spell.sleep') {
    return '사거리 안의 타일을 선택하세요. 원점에서 완전 엄폐인 대상은 Sleep HP pool에서 제외됩니다.';
  }
  if (spellId === 'spell.fireball') {
    return '사거리 안의 폭발 원점을 선택하세요. 완전 엄폐 대상은 제외되고, 일부 엄폐는 Dex 내성 보너스로 적용됩니다.';
  }
  if (spellId === 'spell.light') {
    return '사거리 안의 타일을 선택하세요.';
  }
  return '사거리 안의 타일 또는 대상을 선택하세요.';
}

function formatLevel1SpellSlots(remaining: number, total: number) {
  const cappedTotal = Math.max(0, Math.floor(total));
  const cappedRemaining = Math.min(cappedTotal, Math.max(0, Math.floor(remaining)));
  if (cappedTotal <= 0) return '1 --';
  return `1 ${Array.from({ length: cappedTotal }, (_, index) =>
    index < cappedRemaining ? '●' : '○'
  ).join('')}`;
}

function formatSpellSlotPips(level: string, remaining: number, total: number) {
  const cappedTotal = Math.max(0, Math.floor(total));
  const cappedRemaining = Math.min(cappedTotal, Math.max(0, Math.floor(remaining)));
  if (cappedTotal <= 0) return `${level} --`;
  return `${level} ${Array.from({ length: cappedTotal }, (_, index) =>
    index < cappedRemaining ? '●' : '○'
  ).join('')}`;
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
  if (item.itemType === 'armor' || key.includes('armor') || key.includes('갑옷'))
    return 'game-icons:armor-vest';
  if (key.includes('bow') || key.includes('crossbow') || key.includes('활') || key.includes('석궁'))
    return 'game-icons:bow-arrow';
  if (key.includes('dagger') || key.includes('knife') || key.includes('단검'))
    return 'game-icons:plain-dagger';
  if (key.includes('axe') || key.includes('액스') || key.includes('도끼'))
    return 'game-icons:battle-axe';
  if (isWeaponItem(item)) return 'game-icons:rune-sword';
  if (key.includes('potion') || key.includes('healing') || key.includes('포션'))
    return 'game-icons:health-potion';
  if (item.itemType === 'pack' || key.includes('꾸러미')) return 'game-icons:swap-bag';
  if (key.includes('scroll') || key.includes('spell') || key.includes('두루마리'))
    return 'game-icons:scroll-unfurled';
  if (key.includes('book') || key.includes('책')) return 'game-icons:spell-book';
  if (key.includes('key') || key.includes('열쇠')) return 'game-icons:key';
  if (key.includes('tool') || key.includes('kit') || key.includes('도구'))
    return 'game-icons:toolbox';
  if (key.includes('coin') || key.includes('gold') || key.includes('코인') || key.includes('금화'))
    return 'game-icons:coins';
  return 'game-icons:wooden-crate';
}

function getWeaponFallbackRangeFt(item: InventoryItemDto) {
  const key = getInventoryItemKey(item).replace(/_/g, '-');
  if (key.includes('longbow')) return 150;
  if (key.includes('shortbow') || key.includes('light-crossbow')) return 80;
  if (key.includes('javelin')) return 30;
  if (key.includes('dagger') || key.includes('dart') || key.includes('handaxe')) return 20;
  if (key.includes('롱보우')) return 150;
  if (key.includes('쇼트보우') || key.includes('라이트 크로스보우')) return 80;
  if (key.includes('재블린')) return 30;
  if (key.includes('단검') || key.includes('다트') || key.includes('핸드액스')) return 20;
  if ((item.properties ?? []).some((property) => property.toLowerCase().includes('ranged')))
    return 80;
  return 5;
}

function getThrowableLongRangeFt(item: InventoryItemDto) {
  const key = getInventoryItemKey(item).replace(/_/g, '-');
  const properties = getWeaponPropertySet(item);
  if (key.includes('javelin') || key.includes('재블린')) return 120;
  if (
    properties.has('thrown') ||
    key.includes('dagger') ||
    key.includes('dart') ||
    key.includes('handaxe') ||
    key.includes('단검') ||
    key.includes('다트') ||
    key.includes('핸드액스')
  ) {
    return 60;
  }
  return 60;
}

function getWeaponPropertySet(item: InventoryItemDto) {
  const key = getInventoryItemKey(item).replace(/_/g, '-');
  const properties = new Set(
    (item.properties ?? []).map((property) => property.toLowerCase().replace(/[_\s]+/g, '-'))
  );

  if (
    key.includes('longbow') ||
    key.includes('shortbow') ||
    key.includes('crossbow') ||
    key.includes('dart')
  ) {
    properties.add('ranged');
  } else if (isWeaponItem(item)) {
    properties.add('melee');
  }

  if (
    key.includes('dagger') ||
    key.includes('rapier') ||
    key.includes('handaxe') ||
    key.includes('scimitar') ||
    key.includes('shortsword') ||
    key.includes('단검') ||
    key.includes('레이피어') ||
    key.includes('핸드액스') ||
    key.includes('시미터') ||
    key.includes('쇼트소드')
  ) {
    properties.add('light');
    properties.add('melee');
  }

  if (
    key.includes('dagger') ||
    key.includes('rapier') ||
    key.includes('scimitar') ||
    key.includes('shortsword') ||
    key.includes('단검') ||
    key.includes('레이피어') ||
    key.includes('시미터') ||
    key.includes('쇼트소드')
  ) {
    properties.add('finesse');
  }

  if (
    key.includes('greataxe') ||
    key.includes('longbow') ||
    key.includes('shortbow') ||
    key.includes('crossbow') ||
    key.includes('그레이트액스') ||
    key.includes('롱보우') ||
    key.includes('쇼트보우') ||
    key.includes('크로스보우')
  ) {
    properties.add('two-handed');
  }

  return properties;
}

function isLightMeleeWeaponItem(item: InventoryItemDto | null) {
  if (!item || !isWeaponItem(item)) return false;
  const properties = getWeaponPropertySet(item);
  return (
    properties.has('light') &&
    (properties.has('melee') || !properties.has('ranged')) &&
    !properties.has('two-handed')
  );
}

function isSneakAttackWeaponItem(item: InventoryItemDto | null) {
  if (!item || !isWeaponItem(item)) return false;
  const properties = getWeaponPropertySet(item);
  return properties.has('finesse') || properties.has('ranged');
}

function getGridDistanceFt(
  map: VttMapStateDto,
  left: VttMapStateDto['tokens'][number],
  right: VttMapStateDto['tokens'][number]
) {
  const leftColumn = Math.floor(
    Math.min(Math.max(left.x, 0), Math.max(0, map.width - 1)) / map.gridSize
  );
  const leftRow = Math.floor(
    Math.min(Math.max(left.y, 0), Math.max(0, map.height - 1)) / map.gridSize
  );
  const rightColumn = Math.floor(
    Math.min(Math.max(right.x, 0), Math.max(0, map.width - 1)) / map.gridSize
  );
  const rightRow = Math.floor(
    Math.min(Math.max(right.y, 0), Math.max(0, map.height - 1)) / map.gridSize
  );
  return Math.max(Math.abs(leftColumn - rightColumn), Math.abs(leftRow - rightRow)) * 5;
}

function getSelectionGridPoint(
  selection: BattleMapSelection | null,
  map: VttMapStateDto | null
) {
  if (!selection || !map) return null;
  return {
    x: Math.floor(Math.min(Math.max(selection.point.x, 0), Math.max(0, map.width - 1)) / map.gridSize),
    y: Math.floor(Math.min(Math.max(selection.point.y, 0), Math.max(0, map.height - 1)) / map.gridSize),
  };
}

function getMapObjectItemPayload(
  selection: BattleMapSelection | null,
  map: VttMapStateDto | null
) {
  if (!selection || selection.kind !== 'object') return null;
  const objectCell = selection.cell as NonNullable<VttMapStateDto['objectCells']>[number];
  const itemDefinitionId = objectCell.hiddenItemIds?.[0]?.trim();
  if (!itemDefinitionId) return null;
  const gridPoint = getSelectionGridPoint(selection, map);
  if (!gridPoint) return null;
  const escapedItemDefinitionId = itemDefinitionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = objectCell.description?.match(
    new RegExp(`(?:^|\\s)${escapedItemDefinitionId}\\s+x(\\d+)(?:\\s|$)`)
  );
  const quantity = Number(match?.[1]);
  return {
    objectId: objectCell.id,
    itemDefinitionId,
    quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
    point: gridPoint,
  };
}

function getResourceFillPercent(
  current: number | null | undefined,
  max: number | null | undefined
) {
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
}

function splitSceneParagraphs(sceneText: string | undefined) {
  const paragraphs = (sceneText ?? '')
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : ['현재 전투 장면 설명이 아직 준비되지 않았습니다.'];
}

function readParticipantColorVar(
  colorStyle: CSSProperties | undefined,
  name: '--participant-frame-color' | '--participant-bg-color' | '--participant-text-color',
  fallback: string
) {
  const value = (colorStyle as Record<string, string> | undefined)?.[name];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getTurnCardColorStyle(
  colorStyle: CSSProperties | undefined,
  fallbackColor: SessionTokenColor
): CSSProperties {
  const accentColor = readParticipantColorVar(
    colorStyle,
    '--participant-frame-color',
    fallbackColor.frame
  );
  const backgroundColor = readParticipantColorVar(
    colorStyle,
    '--participant-bg-color',
    fallbackColor.background
  );
  const textColor = readParticipantColorVar(
    colorStyle,
    '--participant-text-color',
    fallbackColor.text
  );

  return {
    ...colorStyle,
    // 턴 카드는 플레이어별 고정 색을 가장 먼저 보이게 해야 해서 전용 CSS 변수로 한 번 더 연결합니다.
    ['--combat-turn-accent' as string]: accentColor,
    ['--combat-turn-bg' as string]: backgroundColor,
    ['--combat-turn-text' as string]: textColor,
  } as CSSProperties;
}

function CombatResourceIcon({ kind }: { kind: CombatResourceIconKind }) {
  if (kind === 'action') return <GameIcon name="game-icons:rune-sword" size={21} />;
  if (kind === 'bonus') return <GameIcon name="game-icons:sun" size={21} />;
  return <GameIcon name="game-icons:shield" size={21} />;
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
  getCharacterColorStyle,
  onMapChange,
  onPingRequest,
  onTokenMoveRequest,
  onUseInventoryItem,
  onEquipInventoryItem,
  onThrowInventoryItem,
  onPickupMapObject,
  onAttackWithEquippedWeapon,
  onMonsterAction,
  onAttackWithOffhandWeapon,
  onSneakAttack,
  onDash,
  onDodge,
  onHide,
  onReadyAction,
  onApplyCondition,
  onForceMoveParticipant,
  onUseClassFeature,
  onCastSpell,
  onEndCombat,
  onEndTurn,
}: CombatNodeSurfaceProps) {
  const [activeTab, setActiveTab] = useState<CombatActionTab>('basic');
  const [isInventoryExpanded, setInventoryExpanded] = useState(false);
  const [selectedTurnCharacterId, setSelectedTurnCharacterId] = useState<string | null>(null);
  const [selectedTargetParticipantId, setSelectedTargetParticipantId] = useState<string | null>(
    null
  );
  const [selectedMapTokenId, setSelectedMapTokenId] = useState<string | null>(null);
  const [selectedMapSelection, setSelectedMapSelection] = useState<BattleMapSelection | null>(null);
  const [isAttackTargeting, setAttackTargeting] = useState(false);
  const [isSneakAttackTargeting, setSneakAttackTargeting] = useState(false);
  const [targetingSpellId, setTargetingSpellId] = useState<string | null>(null);
  const [spellSlotLevelBySpellId, setSpellSlotLevelBySpellId] = useState<Record<string, number>>({});
  const [gmForcedMovementDistanceFt, setGmForcedMovementDistanceFt] = useState(10);
  const [targetingMonsterActionId, setTargetingMonsterActionId] = useState<string | null>(null);
  const [combatMovementMode, setCombatMovementMode] = useState<CombatMovementMode>('normal');
  const [spellFilter, setSpellFilter] = useState<SpellFilter>('all');
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const knownMvpSpellActions = useMemo(() => getKnownMvpSpellActions(myCharacter), [myCharacter]);
  const visibleSpellActions = useMemo(
    () =>
      knownMvpSpellActions.filter((label) => {
        const spellLevel = getSpellLevel(label);
        if (spellFilter === 'cantrip') return spellLevel === 0;
        if (spellFilter === 'level1') return spellLevel === 1;
        if (spellFilter === 'level3') return spellLevel === 3;
        return true;
      }),
    [knownMvpSpellActions, spellFilter]
  );
  const actionTabs = useMemo(() => {
    if (!knownMvpSpellActions.length) {
      return baseActionTabs;
    }
    return [
      ...baseActionTabs,
      { id: 'spell' as const, label: '마법', actions: knownMvpSpellActions },
    ];
  }, [knownMvpSpellActions]);
  const selectedTurnCharacter =
    characters.find((character) => character.id === selectedTurnCharacterId) ?? null;
  const myCombatParticipant =
    combat?.participants.find(
      (participant) => participant.sessionCharacterId === myCharacter?.id
    ) ?? null;
  const myActionResources = myCombatParticipant?.actionResources ?? null;
  const level1SpellSlotsTotal = myActionResources?.spellSlotLevel1Total ?? 0;
  const level1SpellSlotsRemaining = Math.min(
    level1SpellSlotsTotal,
    Math.max(0, myActionResources?.spellSlotLevel1Remaining ?? 0)
  );
  const level1SpellSlotLabel = formatLevel1SpellSlots(
    level1SpellSlotsRemaining,
    level1SpellSlotsTotal
  );
  const spellSlotResources = myActionResources?.spellSlots ?? {};
  const visibleSpellSlotEntries = Object.entries(spellSlotResources)
    .filter(([level, resource]) => {
      const numericLevel = Number(level);
      return Number.isInteger(numericLevel) && numericLevel > 0 && resource.total > 0;
    })
    .sort(([left], [right]) => Number(left) - Number(right));
  const getSpellSlotTotal = (spellLevel: number) => {
    if (spellLevel === 1) return spellSlotResources['1']?.total ?? level1SpellSlotsTotal;
    return spellSlotResources[String(spellLevel)]?.total ?? 0;
  };
  const getSpellSlotRemaining = (spellLevel: number) => {
    const total = getSpellSlotTotal(spellLevel);
    const remaining =
      spellLevel === 1
        ? (spellSlotResources['1']?.remaining ?? level1SpellSlotsRemaining)
        : (spellSlotResources[String(spellLevel)]?.remaining ?? 0);
    return Math.min(total, Math.max(0, remaining));
  };
  const getAvailableSlotLevelsForSpell = (spellLevel: number | undefined) => {
    if (typeof spellLevel !== 'number' || spellLevel <= 0) return [];
    return Object.entries(spellSlotResources)
      .map(([level, resource]) => ({
        level: Number(level),
        remaining: resource.remaining,
        total: resource.total,
      }))
      .filter(
        (entry) =>
          Number.isInteger(entry.level) &&
          entry.level >= spellLevel &&
          entry.total > 0 &&
          entry.remaining > 0
      )
      .sort((left, right) => left.level - right.level)
      .map((entry) => entry.level);
  };
  const getSelectedSlotLevelForSpell = (spellId: string, spellLevel: number | undefined) => {
    if (typeof spellLevel !== 'number' || spellLevel <= 0) return undefined;
    const availableLevels = getAvailableSlotLevelsForSpell(spellLevel);
    if (!availableLevels.length) return spellLevel;
    const selected = spellSlotLevelBySpellId[spellId];
    return availableLevels.includes(selected) ? selected : availableLevels[0];
  };
  const equippedWeapon =
    inventory.find((item) => isEquippedItem(item, myCharacter?.equippedWeaponId)) ?? null;
  const offhandWeapon =
    inventory.find(
      (item) => isEquippedItem(item, myCharacter?.offhandWeaponId) && isWeaponItem(item)
    ) ?? null;
  const currentParticipant =
    combat?.participants.find(
      (participant) => participant.sessionEntityId === combat.currentEntityId
    ) ?? null;
  const activeCombatActor = isGmView ? currentParticipant : myCombatParticipant;
  const activeActorCharacter = activeCombatActor?.sessionCharacterId
    ? (characters.find((character) => character.id === activeCombatActor.sessionCharacterId) ?? null)
    : null;
  const activeActionResources = activeCombatActor?.actionResources ?? null;
  const canControlActiveActor = Boolean(
    combat &&
      activeCombatActor &&
      activeCombatActor.sessionEntityId === combat.currentEntityId &&
      activeCombatActor.isAlive &&
      (isGmView
        ? activeCombatActor.isHostile
        : activeCombatActor.sessionCharacterId === myCharacter?.id)
  );
  const isActiveActorPending = Boolean(
    combat &&
      activeCombatActor &&
      !canControlActiveActor
  );
  const canUsePlayerCharacterActions = Boolean(
    canControlActiveActor &&
      !isGmView &&
      activeCombatActor?.sessionCharacterId &&
      activeCombatActor.sessionCharacterId === myCharacter?.id
  );
  const canShowEndTurnButton = Boolean(combat && canControlActiveActor);
  const activeActorName =
    activeActorCharacter?.name ?? activeCombatActor?.name ?? myCharacter?.name ?? '캐릭터 미선택';
  const activeCurrentHp = activeCombatActor?.currentHp ?? activeActorCharacter?.currentHp ?? null;
  const activeMaxHp = activeCombatActor?.maxHp ?? activeActorCharacter?.maxHp ?? null;
  const selectedTargetParticipant =
    combat?.participants.find(
      (participant) => participant.sessionEntityId === selectedTargetParticipantId
    ) ?? null;
  const selectedMapParticipant =
    combat?.participants.find((participant) => {
      const tokenId = getParticipantTokenId(participant);
      return Boolean(tokenId && tokenId === selectedMapTokenId);
    }) ?? null;
  const selectedHostileObservation = selectedMapParticipant?.isHostile
    ? describeCombatParticipantObservation(selectedMapParticipant)
    : null;
  const selectedObjectItemPayload = getMapObjectItemPayload(selectedMapSelection, map);
  const canPickupSelectedObject = Boolean(
    selectedObjectItemPayload &&
      onPickupMapObject &&
      canUsePlayerCharacterActions &&
      !isInventoryBusy &&
      !isCombatBusy
  );
  const attackName = equippedWeapon?.name ?? '기본 공격';
  const attackRangeFt = equippedWeapon ? getWeaponFallbackRangeFt(equippedWeapon) : 5;
  const offhandAttackName = offhandWeapon ? `보조 공격(${offhandWeapon.name})` : '보조 공격';
  const offhandAttackRangeFt = offhandWeapon ? getWeaponFallbackRangeFt(offhandWeapon) : 5;
  const offhandWeaponIsLightMelee = isLightMeleeWeaponItem(offhandWeapon);
  const isSelectedTargetInRange = useMemo(() => {
    if (!map || !myCombatParticipant || !selectedTargetParticipant) return false;
    const sourceTokenId = getParticipantTokenId(myCombatParticipant);
    const targetTokenId = getParticipantTokenId(selectedTargetParticipant);
    const sourceToken = sourceTokenId
      ? map.tokens.find((token) => token.id === sourceTokenId)
      : null;
    const targetToken = targetTokenId
      ? map.tokens.find((token) => token.id === targetTokenId)
      : null;
    if (!sourceToken || !targetToken) return false;
    return getGridDistanceFt(map, sourceToken, targetToken) <= attackRangeFt;
  }, [attackRangeFt, map, myCombatParticipant, selectedTargetParticipant]);
  const isSneakAttackWeaponEquipped = isSneakAttackWeaponItem(equippedWeapon);
  const isSelectedTargetSneakAttackEligible = useMemo(() => {
    return isParticipantSneakAttackEligible(selectedTargetParticipant);
  }, [
    combat?.participants,
    isSelectedTargetInRange,
    isSneakAttackWeaponEquipped,
    map,
    myCombatParticipant,
    selectedTargetParticipant,
  ]);
  const isSelectedTargetInOffhandRange = useMemo(() => {
    if (!map || !myCombatParticipant || !selectedTargetParticipant) return false;
    const sourceTokenId = getParticipantTokenId(myCombatParticipant);
    const targetTokenId = getParticipantTokenId(selectedTargetParticipant);
    const sourceToken = sourceTokenId
      ? map.tokens.find((token) => token.id === sourceTokenId)
      : null;
    const targetToken = targetTokenId
      ? map.tokens.find((token) => token.id === targetTokenId)
      : null;
    if (!sourceToken || !targetToken) return false;
    return getGridDistanceFt(map, sourceToken, targetToken) <= offhandAttackRangeFt;
  }, [offhandAttackRangeFt, map, myCombatParticipant, selectedTargetParticipant]);
  const canAttackWithEquippedWeapon = Boolean(
    canUsePlayerCharacterActions &&
    myActionResources?.actionAvailable &&
    selectedTargetParticipant?.isHostile &&
    selectedTargetParticipant.isAlive &&
    isSelectedTargetInRange &&
    !isCombatBusy
  );
  const canStartAttackTargeting = Boolean(
    canUsePlayerCharacterActions && myActionResources?.actionAvailable && myCombatParticipant && !isCombatBusy
  );
  const canUseAction = Boolean(
    canControlActiveActor && activeActionResources?.actionAvailable && !isCombatBusy
  );
  const canUseSneakAttack = Boolean(
    canUsePlayerCharacterActions &&
    myActionResources?.actionAvailable &&
    myActionResources?.sneakAttackAvailable &&
    selectedTargetParticipant &&
    isSelectedTargetSneakAttackEligible &&
    !isCombatBusy
  );
  const canStartSneakAttackTargeting = Boolean(
    canUsePlayerCharacterActions &&
    myActionResources?.actionAvailable &&
    myActionResources?.sneakAttackAvailable &&
    isSneakAttackWeaponEquipped &&
    myCombatParticipant &&
    !isCombatBusy
  );
  const canUseOffhandAttack = Boolean(
    canUsePlayerCharacterActions &&
    myActionResources?.twoWeaponAttackAvailable &&
    myActionResources?.bonusActionAvailable &&
    offhandWeapon &&
    offhandWeaponIsLightMelee &&
    selectedTargetParticipant?.isHostile &&
    selectedTargetParticipant.isAlive &&
    isSelectedTargetInOffhandRange &&
    !isCombatBusy
  );
  const canControlHostileMonster = Boolean(
    isGmView &&
      canControlActiveActor &&
      activeCombatActor?.isHostile &&
      activeActionResources &&
      !isCombatBusy
  );
  const selectedThrowTargetPoint = useMemo(() => {
    if (!map || !selectedTargetParticipant) return null;
    const tokenId = getParticipantTokenId(selectedTargetParticipant);
    const token = getMapToken(tokenId);
    if (!token) return null;
    return {
      x: Math.floor(token.x / map.gridSize),
      y: Math.floor(token.y / map.gridSize),
    };
  }, [map, selectedTargetParticipant]);
  const canThrowInventoryItem = (
    item: InventoryItemDto,
    equipmentDisplayState: 'equipped' | 'available'
  ) => {
    if (
      !canUsePlayerCharacterActions ||
      !myActionResources?.actionAvailable ||
      !selectedTargetParticipant?.isHostile ||
      !selectedTargetParticipant.isAlive ||
      !selectedThrowTargetPoint ||
      equipmentDisplayState === 'equipped' ||
      item.quantity < 1 ||
      isInventoryBusy ||
      isCombatBusy
    ) {
      return false;
    }
    if (!map || !myCombatParticipant) return false;
    const sourceToken = getMapToken(getParticipantTokenId(myCombatParticipant));
    const targetToken = getMapToken(getParticipantTokenId(selectedTargetParticipant));
    if (!sourceToken || !targetToken) return false;
    return getGridDistanceFt(map, sourceToken, targetToken) <= getThrowableLongRangeFt(item);
  };
  const canUseMonsterActionCost = (monsterAction: CombatMonsterAction) => {
    if (monsterAction.available === false) return false;
    if (!canControlHostileMonster || !activeActionResources) return false;
    if (monsterAction.costType === 'bonus_action') {
      return activeActionResources.bonusActionAvailable;
    }
    if (monsterAction.costType === 'reaction') {
      return activeActionResources.reactionAvailable;
    }
    return activeActionResources.actionAvailable;
  };
  const canUseMonsterTargetedAction = (monsterAction: CombatMonsterAction) => Boolean(
    canUseMonsterActionCost(monsterAction) &&
      selectedTargetParticipant &&
      selectedTargetParticipant.isAlive &&
      selectedTargetParticipant.isHostile !== activeCombatActor?.isHostile &&
      !isCombatBusy
  );
  const canUseMonsterSelfAction = (monsterAction: CombatMonsterAction) => Boolean(
    canUseMonsterActionCost(monsterAction) &&
      monsterAction.attackKind === 'special' &&
      !isCombatBusy
  );
  const canUseReadyAction = Boolean(
    !isGmView &&
      canControlActiveActor &&
      activeActionResources?.actionAvailable &&
      activeActionResources.reactionAvailable &&
      selectedTargetParticipant?.isHostile &&
      selectedTargetParticipant.isAlive &&
      !isCombatBusy
  );
  const canStartMonsterAttackTargeting = Boolean(
    isGmView &&
      canControlActiveActor &&
      activeCombatActor?.isHostile &&
      activeActionResources?.actionAvailable &&
      !isCombatBusy
  );
  const activeMonsterActions = activeCombatActor?.monsterActions?.length
    ? activeCombatActor.monsterActions
    : [
        {
          actionId: 'attack',
          label: '공격',
          attackKind: 'melee',
          attackBonus: 0,
          damageDice: '',
          damageType: null,
          rangeFt: 5,
          longRangeFt: null,
          confidence: null,
          costType: 'action',
        },
      ];
  const classAbilityButtons = useMemo(
    () => getClassAbilityButtons(myCharacter, myCombatParticipant?.conditions),
    [myCharacter, myCombatParticipant?.conditions]
  );
  const selectedConditionTargetId = selectedTargetParticipant
    ? getParticipantTokenId(selectedTargetParticipant) ?? selectedTargetParticipant.sessionEntityId
    : null;
  const canApplyGmCondition = Boolean(
    isGmView &&
      onApplyCondition &&
      selectedConditionTargetId &&
      selectedTargetParticipant?.isAlive &&
      !isCombatBusy
  );
  const activeActorToken = activeCombatActor
    ? getMapToken(getParticipantTokenId(activeCombatActor))
    : null;
  const selectedTargetToken = selectedTargetParticipant
    ? getMapToken(getParticipantTokenId(selectedTargetParticipant))
    : null;
  const forcedMovementOrigin = activeActorToken
    ? { x: activeActorToken.x, y: activeActorToken.y }
    : null;
  const canForceMoveSelectedTarget = Boolean(
    isGmView &&
      onForceMoveParticipant &&
      selectedTargetParticipant?.isAlive &&
      selectedTargetToken &&
      forcedMovementOrigin &&
      !isCombatBusy
  );
  const currentTab = actionTabs.find((tab) => tab.id === activeTab) ?? actionTabs[0];
  const turnOrder = combat?.participants ?? [];
  const currentTurnIndex = combat?.currentEntityId
    ? turnOrder.findIndex((participant) => participant.sessionEntityId === combat.currentEntityId)
    : -1;
  const nextTurnEntityId =
    currentTurnIndex >= 0 && turnOrder.length > 1
      ? turnOrder[(currentTurnIndex + 1) % turnOrder.length]?.sessionEntityId
      : null;
  const activeParticipantCount = turnOrder.filter((participant) => participant.isAlive).length;
  const combatResources = [
    {
      kind: 'action' as const,
      label: '행동',
      available: activeActionResources?.actionAvailable ?? false,
    },
    {
      kind: 'bonus' as const,
      label: '추가 행동',
      available: activeActionResources?.bonusActionAvailable ?? false,
    },
    {
      kind: 'reaction' as const,
      label: '반응',
      available: activeActionResources?.reactionAvailable ?? false,
    },
  ];
  const movementCurrent = activeActionResources?.movementFtRemaining ?? activeActorCharacter?.speed ?? null;
  const movementTotal = activeActionResources?.movementFtTotal ?? activeActorCharacter?.speed ?? null;
  const canUseJumpMovement = Boolean(
    canControlActiveActor && !isCombatBusy && movementCurrent !== null && movementCurrent > 10
  );
  const hpMeterStyle = {
    '--combat-resource-fill': `${getResourceFillPercent(activeCurrentHp, activeMaxHp)}%`,
  } as CSSProperties;
  const movementMeterStyle = {
    '--combat-resource-fill': `${getResourceFillPercent(movementCurrent, movementTotal)}%`,
  } as CSSProperties;
  const inventoryPanelStyle = {
    '--combat-inventory-item-count': Math.max(inventory.length, 1),
  } as CSSProperties;

  useEffect(() => {
    if (!actionTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('basic');
    }
  }, [activeTab, actionTabs]);

  useEffect(() => {
    if (!inventory.length && isInventoryExpanded) {
      setInventoryExpanded(false);
    }
  }, [inventory.length, isInventoryExpanded]);

  function getMapToken(tokenId: string | null | undefined) {
    return tokenId ? (map?.tokens.find((token) => token.id === tokenId) ?? null) : null;
  }

  function isParticipantTokenVisible(participant: CombatResponseDto['participants'][number]) {
    const tokenId = getParticipantTokenId(participant);
    const token = getMapToken(tokenId);
    return Boolean(token && token.hidden !== true);
  }

  function getParticipantTokenId(participant: CombatResponseDto['participants'][number]) {
    if (participant.tokenId) return participant.tokenId;
    if (!participant.sessionCharacterId) {
      const matchingHostileTokens =
        map?.tokens.filter(
          (token) =>
            token.hidden !== true &&
            token.isHostile === true &&
            token.name.trim() === participant.name.trim()
        ) ?? [];
      return matchingHostileTokens.length === 1 ? matchingHostileTokens[0].id : null;
    }
    return (
      map?.tokens.find((token) => token.sessionCharacterId === participant.sessionCharacterId)
        ?.id ?? null
    );
  }

  const tokenMovementRangeFtByTokenId = useMemo(() => {
    const entries =
      combat?.participants
        .map((participant) => {
          const tokenId = getParticipantTokenId(participant);
          return tokenId
            ? [
                tokenId,
                participant.sessionEntityId === combat.currentEntityId
                  ? participant.actionResources.movementFtRemaining
                  : 0,
              ]
            : null;
        })
        .filter((entry): entry is [string, number] => Boolean(entry)) ?? [];
    return Object.fromEntries(entries);
  }, [combat, map?.tokens]);
  const controllableCombatTokenIds = useMemo(() => {
    if (!combat || !canControlActiveActor || !activeCombatActor) return [];

    if (isGmView || activeCombatActor.sessionCharacterId === myCharacter?.id) {
      const tokenId = getParticipantTokenId(activeCombatActor);
      return tokenId ? [tokenId] : [];
    }

    return [];
  }, [activeCombatActor, canControlActiveActor, combat, isGmView, map?.tokens, myCharacter?.id]);

  async function handleTokenMoveRequest(
    token: VttMapStateDto['tokens'][number],
    to: { x: number; y: number },
    path: Array<{ x: number; y: number }>,
    movementMode: CombatMovementMode = combatMovementMode
  ): Promise<VttMapStateDto | null> {
    if (!onTokenMoveRequest) return null;
    if (isGmView) {
      const currentTokenId = activeCombatActor ? getParticipantTokenId(activeCombatActor) : null;
      if (!activeCombatActor?.isHostile || currentTokenId !== token.id) return null;
    }
    const result = await onTokenMoveRequest(token, to, path, movementMode);
    if (result && movementMode === 'jump') {
      setCombatMovementMode('normal');
    }
    return result;
  }

  const enemyTokenHealthByTokenId = useMemo(() => {
    const entries =
      combat?.participants
        .map((participant) => {
          if (!participant.isHostile) return null;
          const tokenId = getParticipantTokenId(participant);
          return tokenId
            ? [
                tokenId,
                {
                  currentHp: participant.currentHp,
                  maxHp: participant.maxHp,
                  armorClass: participant.armorClass,
                  isAlive: participant.isAlive,
                },
              ]
            : null;
        })
        .filter(
          (
            entry
          ): entry is [
            string,
            {
              currentHp: number | null;
              maxHp: number | null;
              armorClass: number | null;
              isAlive: boolean;
            },
          ] => Boolean(entry)
        ) ?? [];
    return Object.fromEntries(entries);
  }, [combat, map?.tokens]);
  const attackRangeOverlay = useMemo(() => {
    if (
      (!isAttackTargeting && !isSneakAttackTargeting && !targetingSpellId) ||
      !myCombatParticipant
    )
      return null;
    const tokenId = getParticipantTokenId(myCombatParticipant);
    const rangeFt = targetingSpellId
      ? (mvpSpellRangeFtById[targetingSpellId] ?? attackRangeFt)
      : attackRangeFt;
    return tokenId ? { tokenId, rangeFt } : null;
  }, [
    attackRangeFt,
    isAttackTargeting,
    isSneakAttackTargeting,
    map?.tokens,
    myCombatParticipant,
    targetingSpellId,
  ]);

  function getParticipantAvatar(participant: CombatResponseDto['participants'][number]) {
    const character = participant.sessionCharacterId
      ? characters.find((candidate) => candidate.id === participant.sessionCharacterId)
      : null;
    if (character) {
      return getCharacterImage(character);
    }

    const tokenId = getParticipantTokenId(participant);
    return tokenId ? (map?.tokens.find((token) => token.id === tokenId)?.imageUrl ?? null) : null;
  }

  function getParticipantTurnCardStyle(
    participant: CombatParticipant,
    character: SessionCharacterResponseDto | null
  ) {
    const fallbackColor = participant.isHostile ? MONSTER_TOKEN_COLOR : NPC_TOKEN_COLOR;
    return getTurnCardColorStyle(
      character ? getCharacterColorStyle?.(character) : undefined,
      fallbackColor
    );
  }

  function isParticipantAttackTargetInRange(
    participant: CombatResponseDto['participants'][number] | null
  ) {
    if (!map || !myCombatParticipant || !participant) return false;
    const sourceToken = getMapToken(getParticipantTokenId(myCombatParticipant));
    const targetToken = getMapToken(getParticipantTokenId(participant));
    if (!sourceToken || !targetToken) return false;
    return getGridDistanceFt(map, sourceToken, targetToken) <= attackRangeFt;
  }

  function isParticipantSneakAttackEligible(
    participant: CombatResponseDto['participants'][number] | null
  ) {
    if (!map || !myCombatParticipant || !participant) return false;
    if (!participant.isHostile || !participant.isAlive) return false;
    if (!isSneakAttackWeaponEquipped || !isParticipantAttackTargetInRange(participant))
      return false;
    if (participant.conditions.includes('combat:dodge')) return false;
    if (myCombatParticipant.conditions.includes('combat:hidden')) return true;

    const targetToken = getMapToken(getParticipantTokenId(participant));
    if (!targetToken) return false;
    return Boolean(
      combat?.participants.some((candidate) => {
        if (
          candidate.sessionEntityId === myCombatParticipant.sessionEntityId ||
          candidate.sessionEntityId === participant.sessionEntityId ||
          !candidate.isAlive ||
          candidate.isHostile !== myCombatParticipant.isHostile
        ) {
          return false;
        }
        const allyToken = getMapToken(getParticipantTokenId(candidate));
        return Boolean(allyToken && getGridDistanceFt(map, allyToken, targetToken) <= 5);
      })
    );
  }

  function isParticipantSpellTargetInRange(
    participant: CombatResponseDto['participants'][number] | null,
    spellId: string
  ) {
    if (!map || !myCombatParticipant || !participant) return false;
    const sourceToken = getMapToken(getParticipantTokenId(myCombatParticipant));
    const targetToken = getMapToken(getParticipantTokenId(participant));
    if (!sourceToken || !targetToken) return false;
    return getGridDistanceFt(map, sourceToken, targetToken) <= (mvpSpellRangeFtById[spellId] ?? 0);
  }

  function isPointSpellTargetInRange(point: { x: number; y: number }, spellId: string) {
    if (!map || !myCombatParticipant) return false;
    const sourceToken = getMapToken(getParticipantTokenId(myCombatParticipant));
    if (!sourceToken) return false;
    const pointToken = { ...sourceToken, x: point.x, y: point.y };
    return getGridDistanceFt(map, sourceToken, pointToken) <= (mvpSpellRangeFtById[spellId] ?? 0);
  }

  function getParticipantByTokenId(tokenId: string) {
    return (
      combat?.participants.find((candidate) => {
        if (!candidate.isAlive) return false;
        const participantTokenId = getParticipantTokenId(candidate);
        return participantTokenId === tokenId;
      }) ?? null
    );
  }

  function isOpposingParticipant(
    participant: CombatResponseDto['participants'][number] | null
  ) {
    return Boolean(
      activeCombatActor &&
        participant &&
        participant.isAlive &&
        participant.sessionEntityId !== activeCombatActor.sessionEntityId &&
        participant.isHostile !== activeCombatActor.isHostile
    );
  }

  function runEquippedWeaponAttack(targetParticipantId: string) {
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setTargetingSpellId(null);
    setTargetingMonsterActionId(null);
    void onAttackWithEquippedWeapon(targetParticipantId);
  }

  function runOffhandWeaponAttack(targetParticipantId: string) {
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setTargetingSpellId(null);
    setTargetingMonsterActionId(null);
    void onAttackWithOffhandWeapon(targetParticipantId);
  }

  function runSneakAttack(targetParticipantId: string) {
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setTargetingSpellId(null);
    setTargetingMonsterActionId(null);
    void onSneakAttack(targetParticipantId);
  }

  function runMonsterAction(
    targetParticipantId?: string | null,
    actionType: CombatActorActionType = 'attack',
    actionId?: string | null
  ) {
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setTargetingSpellId(null);
    setTargetingMonsterActionId(null);
    void onMonsterAction?.(targetParticipantId ?? null, actionType, actionId ?? null);
  }

  function startSpellTargeting(spellId: string) {
    if (!spellId || spellId === 'spell.shield') return;
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setTargetingMonsterActionId(null);
    setTargetingSpellId((current) => (current === spellId ? null : spellId));
  }

  function buildSpellCastPayload(spellId: string) {
    const spellLevel = mvpSpellLevelById[spellId];
    const slotLevel = getSelectedSlotLevelForSpell(spellId, spellLevel);
    return typeof slotLevel === 'number' && slotLevel > 0 && slotLevel !== spellLevel
      ? { slotLevel }
      : {};
  }

  function castTargetingSpell(spellId: string, selection: BattleMapSelection | null) {
    if (
      spellId === 'spell.chill_touch' ||
      spellId === 'spell.fire_bolt' ||
      spellId === 'spell.ray_of_frost' ||
      spellId === 'spell.magic_missile' ||
      spellId === 'spell.cure_wounds'
    ) {
      if (selection?.kind !== 'token') return;
      const participant = getParticipantByTokenId(selection.token.id);
      if (!participant?.isAlive) return;
      if (spellId !== 'spell.cure_wounds' && !participant.isHostile) return;
      if (!isParticipantSpellTargetInRange(participant, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, {
        targetParticipantIds: [participant.sessionEntityId],
        ...buildSpellCastPayload(spellId),
      });
      return;
    }
    if (spellId === 'spell.sleep' || spellId === 'spell.fireball') {
      const point = selection?.point ?? null;
      if (!point || !isPointSpellTargetInRange(point, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, { point, ...buildSpellCastPayload(spellId) });
      return;
    }
    if (spellId === 'spell.light') {
      const point = selection?.point ?? null;
      if (!point || !isPointSpellTargetInRange(point, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, { point, ...buildSpellCastPayload(spellId) });
    }
  }

  function handleCombatMapSelection(selection: BattleMapSelection | null) {
    setSelectedMapSelection(selection);
    if (targetingSpellId) {
      if (selection?.kind === 'token') {
        setSelectedMapTokenId(selection.token.id);
        const participant = getParticipantByTokenId(selection.token.id);
        setSelectedTargetParticipantId(
          participant?.isHostile && participant.isAlive ? participant.sessionEntityId : null
        );
      } else {
        setSelectedTargetParticipantId(null);
        setSelectedMapTokenId(null);
      }
      castTargetingSpell(targetingSpellId, selection);
      return;
    }
    if (selection?.kind !== 'token') {
      setSelectedTargetParticipantId(null);
      setSelectedMapTokenId(null);
      if (isAttackTargeting) {
        setAttackTargeting(false);
      }
      if (isSneakAttackTargeting) {
        setSneakAttackTargeting(false);
      }
      return;
    }
    setSelectedMapTokenId(selection.token.id);
    const participant = getParticipantByTokenId(selection.token.id);
    setSelectedTargetParticipantId(
      isOpposingParticipant(participant) ? participant?.sessionEntityId ?? null : null
    );

    if (!isAttackTargeting && !isSneakAttackTargeting) return;
    if (
      isAttackTargeting &&
      isGmView &&
      activeCombatActor?.isHostile &&
      isOpposingParticipant(participant)
    ) {
      runMonsterAction(participant?.sessionEntityId ?? null, 'attack', targetingMonsterActionId);
      return;
    }
    if (!participant?.isHostile || !participant.isAlive) return;
    if (!isParticipantAttackTargetInRange(participant)) return;
    if (isSneakAttackTargeting) {
      if (!isParticipantSneakAttackEligible(participant)) return;
      runSneakAttack(participant.sessionEntityId);
      return;
    }
    runEquippedWeaponAttack(participant.sessionEntityId);
  }

  useEffect(() => {
    if (!selectedTargetParticipant) return;
    if (
      !selectedTargetParticipant.isAlive ||
      !isParticipantTokenVisible(selectedTargetParticipant)
    ) {
      setSelectedTargetParticipantId(null);
      setSelectedMapTokenId(null);
    }
  }, [map?.tokens, selectedTargetParticipant]);

  useEffect(() => {
    if (!canStartAttackTargeting && !canStartMonsterAttackTargeting) {
      setAttackTargeting(false);
      setTargetingSpellId(null);
      setTargetingMonsterActionId(null);
    }
  }, [canStartAttackTargeting, canStartMonsterAttackTargeting]);

  useEffect(() => {
    if (!canStartSneakAttackTargeting) {
      setSneakAttackTargeting(false);
    }
  }, [canStartSneakAttackTargeting]);

  const combatTargetingHint = isAttackTargeting
    ? `${attackName} 사거리 안의 적 토큰을 선택하세요.`
    : isSneakAttackTargeting
      ? '암습 가능한 적 토큰을 선택하세요.'
      : combatMovementMode === 'jump'
        ? '도약: 경로상의 토큰은 무시하지만 벽과 이동불가 타일은 막습니다.'
        : targetingSpellId
          ? getSpellTargetingHint(targetingSpellId)
          : '';

  return (
    <div className="combat-node-surface">
      <NodeHeaderScroll variant="combat" className="combat-turn-bar" ariaLabel="전투 턴 정보">
        <div className="combat-node-title-row">
          <img src={battleNodeBadge} alt="전투 노드" className="session-node-type-badge" />
          <h1 className="node-header-scroll-title">
            {node?.title ?? scenarioTitle ?? '전투 진행 중'}
          </h1>
        </div>
        <div className="combat-round-status">
          <span>{getPhaseLabel(phase)}</span>
          <span>라운드 {combat?.roundNo ?? '-'}</span>
          <span>
            라운드 턴{' '}
            {combat ? `${combat.roundTurnNo}/${Math.max(activeParticipantCount, 1)}` : '-'}
          </span>
          <span>현재 턴 {currentParticipant?.name ?? '-'}</span>
          {isGmView ? <span>GM 화면</span> : <span>플레이어 화면</span>}
        </div>
      </NodeHeaderScroll>

      <div className="combat-node-content">
        <main className="combat-map-panel" aria-label="전투 지도">
          <div className="combat-turn-overlay" aria-label="턴 순서">
            {turnOrder.length ? (
              <div className="combat-turn-list">
                <img
                  className="combat-turn-divider"
                  src={turnDividerArrow}
                  alt=""
                  aria-hidden="true"
                />
                {turnOrder.map((participant) => {
                  const avatar = getParticipantAvatar(participant);
                  const tokenId = getParticipantTokenId(participant);
                  const detailCharacter = participant.sessionCharacterId
                    ? (characters.find(
                        (character) => character.id === participant.sessionCharacterId
                      ) ?? null)
                    : null;
                  const isCurrentTurn = participant.sessionEntityId === combat?.currentEntityId;
                  const isNextTurn = participant.sessionEntityId === nextTurnEntityId;
                  const participantObservation = participant.isHostile
                    ? describeCombatParticipantObservation(participant)
                    : null;
                  const participantTitle =
                    isSneakAttackTargeting && participant.isHostile
                      ? isParticipantSneakAttackEligible(participant)
                        ? `${participant.name} / 암습 가능`
                        : `${participant.name} / 암습 조건 불충족`
                      : participantObservation
                        ? [
                            participant.name,
                            participantObservation.healthText,
                            participantObservation.conditionText,
                          ].join(' / ')
                        : [
                            `${participant.name} / HP ${participant.currentHp ?? '-'}/${participant.maxHp ?? '-'}`,
                            participant.concentration ? '집중 유지 중' : null,
                          ]
                            .filter(Boolean)
                            .join(' / ');
                  return (
                    <button
                      type="button"
                      key={participant.sessionEntityId}
                      style={getParticipantTurnCardStyle(participant, detailCharacter)}
                      className={[
                        'combat-turn-card',
                        isCurrentTurn ? 'active' : '',
                        isNextTurn ? 'next-turn' : '',
                        tokenId && tokenId === selectedMapTokenId ? 'selected' : '',
                        participant.sessionCharacterId === myCharacter?.id ? 'mine' : '',
                        !participant.isAlive ? 'defeated' : '',
                        isSneakAttackTargeting && participant.isHostile && participant.isAlive
                          ? isParticipantSneakAttackEligible(participant)
                            ? 'sneak-eligible'
                            : 'sneak-ineligible'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={participantTitle}
                      aria-label={participant.name}
                      onClick={() => {
                        setSelectedMapTokenId(tokenId ?? null);
                        if (
                          isSneakAttackTargeting &&
                          participant.isHostile &&
                          participant.isAlive
                        ) {
                          setSelectedTargetParticipantId(participant.sessionEntityId);
                          if (isParticipantSneakAttackEligible(participant)) {
                            runSneakAttack(participant.sessionEntityId);
                          }
                          return;
                        }
                        if (detailCharacter) {
                          setSelectedTurnCharacterId(detailCharacter.id);
                        } else if (participant.isHostile && participant.isAlive) {
                          setSelectedTargetParticipantId(participant.sessionEntityId);
                        }
                      }}
                    >
                      <span className="combat-turn-card-content">
                        <span className="combat-turn-portrait" aria-hidden="true">
                          {avatar ? (
                            <img src={avatar} alt="" />
                          ) : (
                            <span>{participant.name.slice(0, 1)}</span>
                          )}
                        </span>
                        {participant.concentration ? (
                          <span
                            className="combat-turn-concentration"
                            title="정신을 집중해 주문을 유지하고 있다"
                            aria-label="집중 유지 중"
                          >
                            집중
                          </span>
                        ) : null}
                      </span>
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
            <>
              <MapPartyOverlay
                characters={characters}
                currentUserId={currentUserId}
                getCharacterColorStyle={getCharacterColorStyle}
                onCharacterClick={(character) => setSelectedTurnCharacterId(character.id)}
              />
              <SessionBattleMap
                map={map}
                characters={characters}
                isHost={isHost}
                currentUserId={currentUserId}
                isInteractionLocked={!canControlActiveActor}
                tokenMovementRangeFtByTokenId={tokenMovementRangeFtByTokenId}
                controllableTokenIds={controllableCombatTokenIds}
                tokenHealthByTokenId={enemyTokenHealthByTokenId}
                attackRangeOverlay={attackRangeOverlay}
                combatMovementMode={combatMovementMode}
                showHiddenContent={isGmView}
                showPlayerVisionPreview={isGmView}
                onMapChange={onMapChange}
                onPingRequest={onPingRequest}
                onTokenMoveRequest={handleTokenMoveRequest}
                onSelectionChange={handleCombatMapSelection}
                title={node?.title ?? '전투 지도'}
              />
              {selectedMapParticipant?.isHostile && selectedHostileObservation ? (
                <aside className="combat-monster-observation-popover" aria-live="polite">
                  <div className="combat-monster-observation-head">
                    <span>관찰</span>
                    <strong>{selectedMapParticipant.name}</strong>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMapSelection(null);
                        setSelectedMapTokenId(null);
                        setSelectedTargetParticipantId(null);
                      }}
                    >
                      닫기
                    </button>
                  </div>
                  <div className="combat-monster-observation-body">
                    <p>{selectedHostileObservation.healthText}</p>
                    <p>{selectedHostileObservation.conditionText}</p>
                  </div>
                </aside>
              ) : null}
            </>
          ) : (
            <div className="combat-map-placeholder">
              <span>전투 지도</span>
              <strong>맵을 불러오는 중입니다</strong>
            </div>
          )}
        </main>
      </div>

      <section className="combat-action-dock" aria-label="전투 행동">
        <div
          className={`combat-resource-panel${canControlActiveActor ? ' my-turn' : ''}${
            isActiveActorPending ? ' not-my-turn' : ''
          }`}
          aria-disabled={isActiveActorPending}
        >
          <span className="combat-frame-corner top-left" aria-hidden="true" />
          <span className="combat-frame-corner top-right" aria-hidden="true" />
          <span className="combat-frame-corner bottom-left" aria-hidden="true" />
          <span className="combat-frame-corner bottom-right" aria-hidden="true" />
          <div className="combat-resource-head">
            <span className="combat-node-eyebrow">행동 자원</span>
            <div className="combat-resource-actions">
              {canControlActiveActor ? (
                <span className="combat-turn-alert" aria-label="현재 내 턴">
                  {isGmView ? '조작 턴' : '내 턴'}
                </span>
              ) : null}
              {/* 발표 화면에서는 디버그용 전투 종료 버튼을 숨깁니다.
              {isGmView ? (
                <button
                  type="button"
                  className="combat-end-turn-button danger"
                  disabled={!combat || isCombatBusy}
                  onClick={onEndCombat}
                >
                  전투 종료
                </button>
              ) : null}
              */}
              {canShowEndTurnButton ? (
                <button
                  type="button"
                  className="combat-end-turn-button combat-end-turn-button-primary"
                  disabled={!combat || isCombatBusy}
                  onClick={() => onEndTurn(isGmView)}
                  aria-label="현재 턴 종료"
                >
                  <GameIcon name="game-icons:hourglass" size={18} className="combat-end-turn-icon" />
                  <span>턴 종료</span>
                </button>
              ) : null}
            </div>
          </div>
          <strong>{activeActorName}</strong>
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
          <div className="combat-resource-meter-grid">
            <div className="combat-resource-meter hp" style={hpMeterStyle}>
              <div className="combat-resource-meter-label">
                <span>HP</span>
                <strong>
                  {activeCurrentHp ?? '-'}/{activeMaxHp ?? '-'}
                </strong>
              </div>
              <span className="combat-resource-meter-track" aria-hidden="true">
                <span className="combat-resource-meter-fill" />
              </span>
            </div>
            <div className="combat-resource-meter" style={movementMeterStyle}>
              <div className="combat-resource-meter-label">
                <span>이동</span>
                <strong>
                  {movementCurrent ?? '-'}/{movementTotal ?? '-'}ft
                </strong>
              </div>
              <span className="combat-resource-meter-track" aria-hidden="true">
                <span className="combat-resource-meter-fill" />
              </span>
            </div>
          </div>
        </div>

        <div className="combat-action-panel">
          <span className="combat-frame-corner top-left" aria-hidden="true" />
          <span className="combat-frame-corner top-right" aria-hidden="true" />
          <span className="combat-frame-corner bottom-left" aria-hidden="true" />
          <span className="combat-frame-corner bottom-right" aria-hidden="true" />
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
            {currentTab.id === 'spell' ? (
              <div className="combat-spell-picker">
                <div className="combat-spell-filter-rail" aria-label="마법 목록 필터">
                  <div className="combat-spell-slot-stack" aria-label="주문 슬롯">
                    {visibleSpellSlotEntries.length ? (
                      visibleSpellSlotEntries.map(([level, resource]) => (
                        <span
                          key={level}
                          className="combat-spell-slot-mini"
                          title={`${level}레벨 주문 슬롯`}
                        >
                          {formatSpellSlotPips(level, resource.remaining, resource.total)}
                        </span>
                      ))
                    ) : (
                      <span className="combat-spell-slot-mini" title="1레벨 주문 슬롯">
                        {level1SpellSlotLabel}
                      </span>
                    )}
                  </div>
                  {spellFilterOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={spellFilter === option.id ? 'active' : ''}
                      onClick={() => setSpellFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="combat-spell-button-list">
                  {visibleSpellActions.length ? (
                    visibleSpellActions.map((action) => {
                      const spellId = mvpSpellIdsByLabel[action];
                      const spellLevel = spellId ? mvpSpellLevelById[spellId] : undefined;
                      const isSlottedSpell = typeof spellLevel === 'number' && spellLevel > 0;
                      const availableSlotLevels = getAvailableSlotLevelsForSpell(spellLevel);
                      const selectedSlotLevel =
                        spellId && isSlottedSpell
                          ? getSelectedSlotLevelForSpell(spellId, spellLevel)
                          : undefined;
                      const spellSlotRemaining =
                        isSlottedSpell && selectedSlotLevel
                          ? getSpellSlotRemaining(selectedSlotLevel)
                          : isSlottedSpell
                            ? 0
                            : Number.POSITIVE_INFINITY;
                      const disabled =
                        !canUsePlayerCharacterActions ||
                        !canUseAction ||
                        isCombatBusy ||
                        spellId === 'spell.shield' ||
                        (isSlottedSpell && spellSlotRemaining <= 0);
                      return (
                        <div className="combat-spell-action-wrap" key={action}>
                          <button
                            type="button"
                            className={`combat-action-button has-action-icon${targetingSpellId === spellId ? ' targeting' : ''}`}
                            disabled={disabled}
                            title={
                              spellId === 'spell.shield'
                                ? 'Shield는 공격받을 때 반응 팝업으로 사용합니다.'
                                : isSlottedSpell && spellSlotRemaining <= 0
                                  ? `사용 가능한 ${spellLevel}레벨 주문 슬롯이 없습니다.`
                                  : targetingSpellId === spellId
                                    ? `${action} 사거리 안의 유효한 대상 또는 지점을 선택하세요.`
                                    : `${action} 타겟팅`
                            }
                            onClick={() => spellId && startSpellTargeting(spellId)}
                          >
                            <CombatActionButtonContent label={action} />
                          </button>
                          {spellId && isSlottedSpell && availableSlotLevels.length ? (
                            <label
                              className="combat-spell-slot-select"
                              title={`${action}에 사용할 주문 슬롯`}
                            >
                              <span>슬롯</span>
                              <select
                                value={selectedSlotLevel}
                                disabled={disabled || targetingSpellId === spellId}
                                onChange={(event) => {
                                  const nextLevel = Number(event.target.value);
                                  setSpellSlotLevelBySpellId((current) => ({
                                    ...current,
                                    [spellId]: nextLevel,
                                  }));
                                }}
                              >
                                {availableSlotLevels.map((level) => (
                                  <option key={level} value={level}>
                                    {level}레벨
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <button type="button" className="combat-action-empty-button" disabled>
                      표시할 마법 없음
                    </button>
                  )}
                </div>
              </div>
            ) : currentTab.id === 'ability' ? (
              classAbilityButtons.length || isGmView ? (
                <>
                  {classAbilityButtons.map((ability) => {
                  const canUseFeature = Boolean(
                    canUsePlayerCharacterActions &&
                    !isCombatBusy &&
                    !ability.disabled &&
                    (!ability.requiresAction || myActionResources?.actionAvailable) &&
                    (!ability.requiresBonusAction || myActionResources?.bonusActionAvailable)
                  );
                  const isSneakAttack = ability.action === 'sneak_attack';
                  const canUseSneakFeature = isSneakAttack
                    ? Boolean(
                        canUseFeature &&
                        isSneakAttackWeaponEquipped &&
                        myActionResources?.sneakAttackAvailable
                      )
                    : canUseFeature;
                  return (
                    <button
                      type="button"
                      key={ability.key}
                      className={`combat-action-button has-action-icon${isSneakAttackTargeting && isSneakAttack ? ' targeting' : ''}`}
                      disabled={!canUseSneakFeature}
                      title={
                        ability.disabled ||
                        (isSneakAttack && !myActionResources?.sneakAttackAvailable)
                          ? '이미 사용한 능력입니다.'
                          : isSneakAttack && !isSneakAttackWeaponEquipped
                            ? '암습은 finesse 또는 원거리 무기를 장착해야 사용할 수 있습니다.'
                            : isSneakAttackTargeting
                              ? '암습 가능한 적 토큰을 선택하세요.'
                              : isSneakAttack &&
                                  selectedTargetParticipant &&
                                  !isSelectedTargetSneakAttackEligible
                                ? '선택한 대상은 현재 암습 조건을 만족하지 않습니다.'
                                : ability.title
                      }
                      onClick={() => {
                        if (isSneakAttack) {
                          if (canUseSneakAttack && selectedTargetParticipant) {
                            runSneakAttack(selectedTargetParticipant.sessionEntityId);
                            return;
                          }
                          if (canStartSneakAttackTargeting) {
                            setAttackTargeting(false);
                            setTargetingSpellId(null);
                            setSneakAttackTargeting((current) => !current);
                          }
                          return;
                        }
                        if (ability.action === 'second_wind') {
                          void onUseClassFeature(ability.action);
                        }
                      }}
                    >
                      <CombatActionButtonContent label={ability.label} />
                    </button>
                  );
                })}
                  {isGmView
                    ? gmCombatConditionOptions.map((condition) => {
                        const alreadyApplied = Boolean(
                          selectedTargetParticipant?.conditions.includes(condition.id) ||
                            selectedTargetParticipant?.conditions.includes(
                              condition.id.replace(/^condition\./, '')
                            )
                        );
                        return (
                          <button
                            type="button"
                            key={condition.id}
                            className="combat-action-button has-action-icon"
                            disabled={!canApplyGmCondition}
                            title={
                              !selectedTargetParticipant
                                ? '상태를 적용할 토큰을 선택하세요.'
                                : alreadyApplied
                                  ? `${selectedTargetParticipant.name}에게서 ${condition.label} 상태를 제거합니다.`
                                  : `${selectedTargetParticipant.name}에게 ${condition.label} 상태를 적용합니다.`
                            }
                            onClick={() => {
                              if (canApplyGmCondition && selectedConditionTargetId) {
                                void onApplyCondition?.(
                                  selectedConditionTargetId,
                                  condition.id,
                                  alreadyApplied ? 'remove' : 'add'
                                );
                              }
                            }}
                          >
                            <CombatActionButtonContent label={condition.label} />
                          </button>
                        );
                      })
                    : null}
                  {isGmView
                    ? (
                        <>
                          <label
                            className="combat-spell-slot-select"
                            title="강제 이동 거리"
                          >
                            <span>거리</span>
                            <select
                              value={gmForcedMovementDistanceFt}
                              disabled={isCombatBusy}
                              onChange={(event) =>
                                setGmForcedMovementDistanceFt(Number(event.target.value))
                              }
                            >
                              {gmForcedMovementDistanceOptions.map((distanceFt) => (
                                <option key={distanceFt} value={distanceFt}>
                                  {distanceFt}ft
                                </option>
                              ))}
                            </select>
                          </label>
                          {gmForcedMovementOptions.map((option) => (
                            <button
                              type="button"
                              key={option.mode}
                              className="combat-action-button has-action-icon"
                              disabled={!canForceMoveSelectedTarget}
                              title={
                                !selectedTargetParticipant
                                  ? '강제 이동할 토큰을 선택하세요.'
                                  : !forcedMovementOrigin
                                    ? '강제 이동 기준이 될 현재 전투 액터 토큰을 찾을 수 없습니다.'
                                    : `${selectedTargetParticipant.name}을 ${gmForcedMovementDistanceFt}ft ${option.label}`
                              }
                              onClick={() => {
                                if (
                                  canForceMoveSelectedTarget &&
                                  selectedTargetParticipant &&
                                  forcedMovementOrigin
                                ) {
                                  void onForceMoveParticipant?.(
                                    selectedTargetParticipant.sessionEntityId,
                                    option.mode,
                                    forcedMovementOrigin,
                                    gmForcedMovementDistanceFt
                                  );
                                }
                              }}
                            >
                              <CombatActionButtonContent label={option.label} />
                            </button>
                          ))}
                        </>
                      )
                    : null}
                </>
              ) : (
                <button type="button" className="combat-action-empty-button" disabled>
                  사용 가능한 직업 능력 없음
                </button>
              )
            ) : (
              currentTab.actions.map((action) => {
                if (action === '공격') {
                  if (isGmView && activeCombatActor?.isHostile) {
                    return (
                      <Fragment key={action}>
                        {activeMonsterActions.map((monsterAction) => {
                          const monsterActionId = monsterAction.actionId;
                          const rangeLabel = getMonsterActionRangeLabel(monsterAction);
                          const unavailableLabel = getMonsterActionUnavailableLabel(monsterAction);
                          const isTargetingThisAction =
                            isAttackTargeting && targetingMonsterActionId === monsterActionId;
                          const canUseThisMonsterAction = canUseMonsterTargetedAction(monsterAction);
                          const canUseThisMonsterSelfAction = canUseMonsterSelfAction(monsterAction);
                          const canStartThisMonsterTargeting =
                            canControlHostileMonster &&
                            canUseMonsterActionCost(monsterAction) &&
                            monsterAction.attackKind !== 'special';
                          return (
                            <button
                              type="button"
                              key={monsterActionId}
                              className={`combat-action-button has-action-icon${isTargetingThisAction ? ' targeting' : ''}`}
                              disabled={
                                !canControlHostileMonster ||
                                (!canUseMonsterActionCost(monsterAction) &&
                                  !canUseThisMonsterSelfAction)
                              }
                              title={
                                canUseThisMonsterSelfAction
                                  ? `${activeCombatActor.name} ${monsterAction.label}${
                                      rangeLabel ? ` (${rangeLabel})` : ''
                                    }`
                                  : isTargetingThisAction
                                  ? `${monsterAction.label} 대상 플레이어 캐릭터 토큰을 선택하세요.`
                                  : unavailableLabel
                                  ? `${monsterAction.label}: ${unavailableLabel}`
                                  : !selectedTargetParticipant
                                    ? `${monsterAction.label} 버튼을 눌러 대상을 선택하세요.`
                                    : canUseThisMonsterAction
                                      ? `${activeCombatActor.name} ${monsterAction.label}${
                                          rangeLabel ? ` (${rangeLabel})` : ''
                                        }`
                                      : '현재 몬스터가 행동할 수 없습니다.'
                              }
                              onClick={() => {
                                if (canUseThisMonsterSelfAction) {
                                  runMonsterAction(null, 'attack', monsterActionId);
                                  return;
                                }
                                if (canUseThisMonsterAction && selectedTargetParticipant) {
                                  runMonsterAction(
                                    selectedTargetParticipant.sessionEntityId,
                                    'attack',
                                    monsterActionId
                                  );
                                  return;
                                }
                                if (canStartThisMonsterTargeting) {
                                  setSneakAttackTargeting(false);
                                  setTargetingSpellId(null);
                                  setTargetingMonsterActionId(monsterActionId);
                                  setAttackTargeting((current) =>
                                    targetingMonsterActionId === monsterActionId ? !current : true
                                  );
                                }
                              }}
                            >
                              <CombatActionButtonContent label={monsterAction.label} />
                              {unavailableLabel ? (
                                <span className="combat-action-status-badge">{unavailableLabel}</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </Fragment>
                    );
                  }
                  return (
                    <Fragment key={action}>
                      <button
                        type="button"
                        className={`combat-action-button has-action-icon${isAttackTargeting ? ' targeting' : ''}`}
                        disabled={!canAttackWithEquippedWeapon && !canStartAttackTargeting}
                        title={
                          isAttackTargeting
                            ? `${attackName} 사거리 ${attackRangeFt}ft 안의 적 토큰을 선택하세요.`
                            : !selectedTargetParticipant
                              ? `${attackName} 버튼을 눌러 사거리를 확인하고 적 토큰을 선택하세요.`
                              : !isSelectedTargetInRange
                                ? `대상이 ${attackName} 사거리 ${attackRangeFt}ft 밖에 있습니다.`
                                : `${attackName} 공격`
                        }
                        onClick={() => {
                          if (canAttackWithEquippedWeapon && selectedTargetParticipant) {
                            runEquippedWeaponAttack(selectedTargetParticipant.sessionEntityId);
                            return;
                          }
                          if (canStartAttackTargeting) {
                            setTargetingSpellId(null);
                            setTargetingMonsterActionId(null);
                            setAttackTargeting((current) => !current);
                          }
                        }}
                      >
                        <CombatActionButtonContent label="공격" />
                      </button>
                      {offhandWeapon ? (
                        <button
                          type="button"
                          className="combat-action-button has-action-icon"
                          disabled={!canUseOffhandAttack}
                          title={
                            !offhandWeaponIsLightMelee
                              ? 'SRD 기준 쌍수 보조 공격은 light 근접 무기로만 가능합니다.'
                              : !myActionResources?.twoWeaponAttackAvailable
                                ? '먼저 Attack action으로 다른 손의 light 근접 무기 공격을 해야 합니다.'
                                : !selectedTargetParticipant
                                  ? '보조 공격할 적 토큰을 먼저 선택하세요.'
                                  : !isSelectedTargetInOffhandRange
                                    ? `대상이 ${offhandAttackName} 사거리 ${offhandAttackRangeFt}ft 밖에 있습니다.`
                                    : `${offhandAttackName} - 추가 행동 소모`
                          }
                          onClick={() => {
                            if (canUseOffhandAttack && selectedTargetParticipant) {
                              runOffhandWeaponAttack(selectedTargetParticipant.sessionEntityId);
                            }
                          }}
                        >
                          <CombatActionButtonContent label="보조 공격" />
                        </button>
                      ) : null}
                    </Fragment>
                  );
                }
                if (action === '대시') {
                  return (
                    <button
                      type="button"
                      key={action}
                      className="combat-action-button has-action-icon"
                      disabled={!canUseAction}
                      title="행동을 소모해 이번 턴 이동 가능 거리를 기본 이동속도만큼 늘립니다."
                      onClick={() => {
                        if (isGmView && activeCombatActor?.isHostile) {
                          runMonsterAction(null, 'dash');
                          return;
                        }
                        void onDash();
                      }}
                    >
                      <CombatActionButtonContent label="대시" />
                    </button>
                  );
                }
                if (action === '도약') {
                  return (
                    <button
                      type="button"
                      key={action}
                      className={`combat-action-button has-action-icon${combatMovementMode === 'jump' ? ' targeting' : ''}`}
                      disabled={!canUseJumpMovement}
                      title={
                        combatMovementMode === 'jump'
                          ? '도약 이동 모드입니다. 이동할 칸으로 토큰을 드래그하세요.'
                          : '이동거리 10ft를 추가로 소모해 경로상의 토큰을 넘어 이동합니다.'
                      }
                      onClick={() => {
                        setAttackTargeting(false);
                        setSneakAttackTargeting(false);
                        setTargetingSpellId(null);
                        setCombatMovementMode((current) =>
                          current === 'jump' ? 'normal' : 'jump'
                        );
                      }}
                    >
                      <CombatActionButtonContent label="도약" />
                    </button>
                  );
                }
                if (action === '회피') {
                  return (
                    <button
                      type="button"
                      key={action}
                      className="combat-action-button has-action-icon"
                      disabled={!canUseAction}
                      title="행동을 소모해 다음 자기 턴 시작 전까지 자신을 향한 공격 굴림에 불리점을 줍니다."
                      onClick={() => {
                        if (isGmView && activeCombatActor?.isHostile) {
                          runMonsterAction(null, 'dodge');
                          return;
                        }
                        void onDodge();
                      }}
                    >
                      <CombatActionButtonContent label="회피" />
                    </button>
                  );
                }
                if (action === '숨기') {
                  return (
                    <button
                      type="button"
                      key={action}
                      className="combat-action-button has-action-icon"
                      disabled={!canUseAction}
                      title="행동을 소모하고 민첩(은신) 판정에 성공하면 다음 공격 굴림에 이점을 얻습니다."
                      onClick={() => {
                        if (isGmView && activeCombatActor?.isHostile) {
                          runMonsterAction(null, 'hide');
                          return;
                        }
                        void onHide();
                      }}
                    >
                      <CombatActionButtonContent label="숨기" />
                    </button>
                  );
                }
                if (action === '준비') {
                  return (
                    <button
                      type="button"
                      key={action}
                      className="combat-action-button has-action-icon"
                      disabled={!canUseReadyAction}
                      title={
                        !activeActionResources?.reactionAvailable
                          ? '사용 가능한 반응이 없어 준비행동을 설정할 수 없습니다.'
                          : !selectedTargetParticipant
                            ? '준비행동 대상 적을 먼저 선택하세요.'
                            : '행동을 소모해 대상이 30ft 안으로 들어오면 반응으로 공격을 준비합니다.'
                      }
                      onClick={() => {
                        if (canUseReadyAction && selectedTargetParticipant) {
                          void onReadyAction(selectedTargetParticipant.sessionEntityId);
                        }
                      }}
                    >
                      <CombatActionButtonContent label="준비" />
                    </button>
                  );
                }
                return (
                  <button
                    type="button"
                    key={action}
                    className="combat-action-button has-action-icon"
                    disabled
                  >
                    <CombatActionButtonContent label={action} />
                  </button>
                );
              })
            )}
          </div>
          <p
            className={`combat-targeting-hint${combatTargetingHint ? '' : ' empty'}`}
            title={combatTargetingHint || undefined}
            aria-hidden={combatTargetingHint ? undefined : true}
          >
            {combatTargetingHint || '대상 안내'}
          </p>
        </div>

        <div className="combat-inventory-slot">
          <div
            className={`combat-inventory-panel${isInventoryExpanded ? ' expanded' : ''}`}
            style={inventoryPanelStyle}
          >
            <span className="combat-frame-corner top-left" aria-hidden="true" />
            <span className="combat-frame-corner top-right" aria-hidden="true" />
            <span className="combat-frame-corner bottom-left" aria-hidden="true" />
            <span className="combat-frame-corner bottom-right" aria-hidden="true" />
            <div className="combat-inventory-head">
              <span className="combat-node-eyebrow">인벤토리</span>
              {selectedObjectItemPayload ? (
                <button
                  type="button"
                  className="combat-inventory-pickup"
                  disabled={!canPickupSelectedObject}
                  title={
                    isGmView
                      ? 'GM 화면에서는 맵 오브젝트를 조회만 합니다.'
                      : !canUsePlayerCharacterActions
                        ? '자기 턴에 선택한 맵 오브젝트를 주울 수 있습니다.'
                        : `${selectedObjectItemPayload.itemDefinitionId} 줍기`
                  }
                  onClick={() => {
                    if (canPickupSelectedObject && selectedObjectItemPayload) {
                      void onPickupMapObject?.(
                        selectedObjectItemPayload.objectId,
                        selectedObjectItemPayload.itemDefinitionId,
                        selectedObjectItemPayload.quantity,
                        selectedObjectItemPayload.point
                      );
                    }
                  }}
                >
                  줍기
                </button>
              ) : null}
              {inventory.length ? (
                <button
                  type="button"
                  className="combat-inventory-toggle"
                  aria-expanded={isInventoryExpanded}
                  aria-controls="combat-inventory-list"
                  title={isInventoryExpanded ? '인벤토리 접기' : '인벤토리 펼치기'}
                  onClick={() => setInventoryExpanded((current) => !current)}
                >
                  <span className="combat-inventory-toggle-arrow" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <InventoryEquipmentStatus
              inventory={inventory}
              equippedWeaponId={myCharacter?.equippedWeaponId}
              offhandWeaponId={myCharacter?.offhandWeaponId}
            />
            <div className="inventory-section-heading">
              <span>보유 아이템</span>
            </div>
            {inventory.length ? (
              <div
                id="combat-inventory-list"
                className={`combat-inventory-list${isInventoryExpanded ? ' expanded' : ''}`}
              >
                {inventory
                  .flatMap((item) => {
                    const isWeapon = isWeaponItem(item);
                    const isShield = isShieldItem(item);
                    const equippedCount =
                      isWeapon || isShield
                        ? Number(isEquippedItem(item, myCharacter?.equippedWeaponId)) +
                          Number(isEquippedItem(item, myCharacter?.offhandWeaponId))
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
                  })
                  .map(({ item, equipmentDisplayState }) => {
                    const canUse = isQuickUsableItem(item);
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
                        className="combat-inventory-item"
                        key={`${item.id}-${equipmentDisplayState}`}
                      >
                        <span className="combat-inventory-item-icon" aria-hidden="true">
                          <GameIcon name={getInventoryItemIconName(item)} size={28} />
                        </span>
                        <div className="combat-inventory-item-body">
                          <strong className="inventory-item-info-host">
                            <InventoryItemInfo item={item} triggerMode="button" />
                          </strong>
                        </div>
                        <span className="combat-inventory-quantity">x{item.quantity}</span>
                        {isWeapon || isArmor || isShield ? (
                          <>
                            <button
                              type="button"
                              disabled={isArmor || isInventoryBusy}
                              title={
                                isArmor
                                  ? '몸통 방어구는 현재 캐릭터 AC에 반영되어 있습니다.'
                                  : isEquipped
                                    ? `${item.name} 착용 해제`
                                    : `${item.name} 착용`
                              }
                              onClick={() => onEquipInventoryItem(equipmentActionItem)}
                            >
                              {isEquipped ? '해제' : '착용'}
                            </button>
                            <button
                              type="button"
                              disabled={!canThrowInventoryItem(item, equipmentDisplayState)}
                              title={
                                equipmentDisplayState === 'equipped'
                                  ? '착용 중인 아이템은 해제 후 던질 수 있습니다.'
                                  : !selectedTargetParticipant
                                    ? '던질 적 토큰을 먼저 선택하세요.'
                                    : !myActionResources?.actionAvailable
                                      ? '사용 가능한 action이 없습니다.'
                                      : `${item.name} 던지기`
                              }
                              onClick={() => {
                                if (
                                  selectedThrowTargetPoint &&
                                  canThrowInventoryItem(item, equipmentDisplayState)
                                ) {
                                  void onThrowInventoryItem(item, selectedThrowTargetPoint);
                                }
                              }}
                            >
                              던지기
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={!canUse || isInventoryBusy}
                              title={
                                canUse
                                  ? `${item.name} 사용`
                                  : '현재 바로 사용할 수 없는 아이템입니다.'
                              }
                              onClick={() => onUseInventoryItem(item)}
                            >
                              사용
                            </button>
                            <button
                              type="button"
                              disabled={!canThrowInventoryItem(item, equipmentDisplayState)}
                              title={
                                !selectedTargetParticipant
                                  ? '던질 적 토큰을 먼저 선택하세요.'
                                  : !myActionResources?.actionAvailable
                                    ? '사용 가능한 action이 없습니다.'
                                    : `${item.name} 던지기`
                              }
                              onClick={() => {
                                if (
                                  selectedThrowTargetPoint &&
                                  canThrowInventoryItem(item, equipmentDisplayState)
                                ) {
                                  void onThrowInventoryItem(item, selectedThrowTargetPoint);
                                }
                              }}
                            >
                              던지기
                            </button>
                          </>
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
      </section>
      {selectedTurnCharacter ? (
        <CharacterDetailModal
          character={selectedTurnCharacter}
          onEquipInventoryItem={onEquipInventoryItem}
          isEquipmentBusy={isInventoryBusy}
          onClose={() => setSelectedTurnCharacterId(null)}
        />
      ) : null}
    </div>
  );
}
