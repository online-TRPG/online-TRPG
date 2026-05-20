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
import { BattleMap } from '../../../components/BattleMap';
import type { BattleMapSelection } from '../../../components/BattleMap';
import { GameIcon } from '../../../components/GameIcon';
import type { GameIconName } from '../../../components/GameIcon';
import battleNodeBadge from '../../../components/node_badge_battle.webp';
import turnDividerArrow from '../../../components/divider-arrow-gold-horizontal.webp';
import { CharacterDetailModal } from './CharacterDetailModal';
import { InventoryItemInfo, getInventoryMetaLabel } from './InventoryItemInfo';
import { MapPartyOverlay } from './MapPartyOverlay';
import { getCharacterImage } from '../utils/characterVisuals';
import { MONSTER_TOKEN_COLOR, NPC_TOKEN_COLOR } from '../../../utils/sessionTokenColors';
import type { SessionTokenColor } from '../../../utils/sessionTokenColors';
import './CombatNodeSurface.css';

type CombatActionTab = 'basic' | 'ability' | 'spell';
type CombatResourceIconKind = 'action' | 'bonus' | 'reaction';
type CombatParticipant = CombatResponseDto['participants'][number];

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
  onTokenMoveRequest?: (
    token: VttMapStateDto['tokens'][number],
    to: { x: number; y: number },
    path: Array<{ x: number; y: number }>
  ) => Promise<VttMapStateDto | null>;
  onUseInventoryItem: (item: InventoryItemDto) => void;
  onEquipInventoryItem: (item: InventoryItemDto) => void;
  onAttackWithEquippedWeapon: (targetParticipantId: string) => void | Promise<void>;
  onAttackWithOffhandWeapon: (targetParticipantId: string) => void | Promise<void>;
  onSneakAttack: (targetParticipantId: string) => void | Promise<void>;
  onDash: () => void | Promise<void>;
  onDodge: () => void | Promise<void>;
  onHide: () => void | Promise<void>;
  onUseClassFeature: (action: 'second_wind') => void | Promise<void>;
  onCastSpell: (
    spellId: string,
    payload: { targetParticipantIds?: string[]; point?: { x: number; y: number } | null }
  ) => void | Promise<void>;
  onEndCombat: () => void;
  onEndTurn: (force?: boolean) => void;
}

const baseActionTabs: Array<{ id: CombatActionTab; label: string; actions: string[] }> = [
  {
    id: 'basic',
    label: '일반',
    actions: ['공격', '대시', '회피', '숨기', '상호작용'],
  },
  {
    id: 'ability',
    label: '능력',
    actions: [],
  },
];

const mvpSpellLabels = ['Fire Bolt', 'Light', 'Magic Missile', 'Shield', 'Sleep'];

const mvpSpellIdsByLabel: Record<string, string> = {
  'Fire Bolt': 'spell.fire_bolt',
  Light: 'spell.light',
  'Magic Missile': 'spell.magic_missile',
  Shield: 'spell.shield',
  Sleep: 'spell.sleep',
};

const mvpSpellRangeFtById: Record<string, number> = {
  'spell.fire_bolt': 120,
  'spell.light': 120,
  'spell.magic_missile': 120,
  'spell.sleep': 90,
};

const combatActionIconNames: Partial<Record<string, GameIconName>> = {
  공격: 'game-icons:crossed-swords',
  '보조 공격': 'game-icons:two-handed-sword',
  대시: 'game-icons:running-shoe',
  회피: 'game-icons:dodge',
  숨기: 'game-icons:ninja-mask',
  상호작용: 'game-icons:hand',
  'Second Wind': 'game-icons:health-increase',
  'Fire Bolt': 'game-icons:fireball',
  Light: 'game-icons:sun',
  'Magic Missile': 'game-icons:magic-swirl',
  Shield: 'game-icons:magic-shield',
  Sleep: 'game-icons:night-sleep',
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
      title: 'Action을 사용해 이점이 있는 finesse 또는 원거리 무기 공격을 합니다. 명중하면 턴당 한 번 추가 피해를 줍니다.',
      requiresAction: true,
      disabled: participantConditions?.includes('resource:sneak_attack_expended'),
    });
  }

  return buttons;
}

function normalizeSpellId(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized.startsWith('spell.') ? normalized : `spell.${normalized}`;
}

function hasMvpSpell(character: SessionCharacterResponseDto | null, spellId: string) {
  if (!character) return false;
  const learned = [
    ...(character.spells?.cantrips ?? []),
    ...(character.spells?.spells ?? []),
  ].map(normalizeSpellId);
  return learned.includes(spellId);
}

function getKnownMvpSpellActions(character: SessionCharacterResponseDto | null) {
  return mvpSpellLabels.filter((label) => {
    const spellId = mvpSpellIdsByLabel[label];
    return Boolean(spellId && hasMvpSpell(character, spellId));
  });
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
  if ((item.properties ?? []).some((property) => property.toLowerCase().includes('ranged'))) return 80;
  return 5;
}

function getWeaponPropertySet(item: InventoryItemDto) {
  const key = getInventoryItemKey(item).replace(/_/g, '-');
  const properties = new Set(
    (item.properties ?? []).map((property) => property.toLowerCase().replace(/[_\s]+/g, '-'))
  );

  if (key.includes('longbow') || key.includes('shortbow') || key.includes('crossbow') || key.includes('dart')) {
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
  return properties.has('light') && (properties.has('melee') || !properties.has('ranged')) && !properties.has('two-handed');
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
  const leftColumn = Math.floor(Math.min(Math.max(left.x, 0), Math.max(0, map.width - 1)) / map.gridSize);
  const leftRow = Math.floor(Math.min(Math.max(left.y, 0), Math.max(0, map.height - 1)) / map.gridSize);
  const rightColumn = Math.floor(Math.min(Math.max(right.x, 0), Math.max(0, map.width - 1)) / map.gridSize);
  const rightRow = Math.floor(Math.min(Math.max(right.y, 0), Math.max(0, map.height - 1)) / map.gridSize);
  return Math.max(Math.abs(leftColumn - rightColumn), Math.abs(leftRow - rightRow)) * 5;
}

function getResourceFillPercent(current: number | null | undefined, max: number | null | undefined) {
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
  const accentColor = readParticipantColorVar(colorStyle, '--participant-frame-color', fallbackColor.frame);
  const backgroundColor = readParticipantColorVar(colorStyle, '--participant-bg-color', fallbackColor.background);
  const textColor = readParticipantColorVar(colorStyle, '--participant-text-color', fallbackColor.text);

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
  onTokenMoveRequest,
  onUseInventoryItem,
  onEquipInventoryItem,
  onAttackWithEquippedWeapon,
  onAttackWithOffhandWeapon,
  onSneakAttack,
  onDash,
  onDodge,
  onHide,
  onUseClassFeature,
  onCastSpell,
  onEndCombat,
  onEndTurn,
}: CombatNodeSurfaceProps) {
  const [activeTab, setActiveTab] = useState<CombatActionTab>('basic');
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const [isInventoryExpanded, setInventoryExpanded] = useState(false);
  const [selectedTurnCharacterId, setSelectedTurnCharacterId] = useState<string | null>(null);
  const [selectedTargetParticipantId, setSelectedTargetParticipantId] = useState<string | null>(null);
  const [selectedMapTokenId, setSelectedMapTokenId] = useState<string | null>(null);
  const [selectedMapSelection, setSelectedMapSelection] = useState<BattleMapSelection | null>(null);
  const [isAttackTargeting, setAttackTargeting] = useState(false);
  const [isSneakAttackTargeting, setSneakAttackTargeting] = useState(false);
  const [targetingSpellId, setTargetingSpellId] = useState<string | null>(null);
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const knownMvpSpellActions = useMemo(() => getKnownMvpSpellActions(myCharacter), [myCharacter]);
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
    combat?.participants.find((participant) => participant.sessionCharacterId === myCharacter?.id) ?? null;
  const isMyCombatTurn =
    Boolean(combat?.currentEntityId) &&
    Boolean(myCombatParticipant?.sessionEntityId) &&
    combat?.currentEntityId === myCombatParticipant?.sessionEntityId;
  const canShowEndTurnButton = Boolean(combat && (isMyCombatTurn || isGmView));
  const myActionResources = myCombatParticipant?.actionResources ?? null;
  const myCurrentHp = myCombatParticipant?.currentHp ?? myCharacter?.currentHp ?? null;
  const myMaxHp = myCombatParticipant?.maxHp ?? myCharacter?.maxHp ?? null;
  const equippedWeapon =
    inventory.find((item) => isEquippedItem(item, myCharacter?.equippedWeaponId)) ?? null;
  const offhandWeapon =
    inventory.find((item) => isEquippedItem(item, myCharacter?.offhandWeaponId) && isWeaponItem(item)) ??
    null;
  const currentParticipant =
    combat?.participants.find((participant) => participant.sessionEntityId === combat.currentEntityId) ?? null;
  const selectedTargetParticipant =
    combat?.participants.find(
      (participant) => participant.sessionEntityId === selectedTargetParticipantId
    ) ?? null;
  const attackName = equippedWeapon?.name ?? '기본 공격';
  const attackRangeFt = equippedWeapon ? getWeaponFallbackRangeFt(equippedWeapon) : 5;
  const offhandAttackName = offhandWeapon ? `보조 공격(${offhandWeapon.name})` : '보조 공격';
  const offhandAttackRangeFt = offhandWeapon ? getWeaponFallbackRangeFt(offhandWeapon) : 5;
  const offhandWeaponIsLightMelee = isLightMeleeWeaponItem(offhandWeapon);
  const isSelectedTargetInRange = useMemo(() => {
    if (!map || !myCombatParticipant || !selectedTargetParticipant) return false;
    const sourceTokenId = getParticipantTokenId(myCombatParticipant);
    const targetTokenId = getParticipantTokenId(selectedTargetParticipant);
    const sourceToken = sourceTokenId ? map.tokens.find((token) => token.id === sourceTokenId) : null;
    const targetToken = targetTokenId ? map.tokens.find((token) => token.id === targetTokenId) : null;
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
    const sourceToken = sourceTokenId ? map.tokens.find((token) => token.id === sourceTokenId) : null;
    const targetToken = targetTokenId ? map.tokens.find((token) => token.id === targetTokenId) : null;
    if (!sourceToken || !targetToken) return false;
    return getGridDistanceFt(map, sourceToken, targetToken) <= offhandAttackRangeFt;
  }, [offhandAttackRangeFt, map, myCombatParticipant, selectedTargetParticipant]);
  const canAttackWithEquippedWeapon = Boolean(
    isMyCombatTurn &&
      myActionResources?.actionAvailable &&
      selectedTargetParticipant?.isHostile &&
      selectedTargetParticipant.isAlive &&
      isSelectedTargetInRange &&
      !isCombatBusy
  );
  const canStartAttackTargeting = Boolean(
    isMyCombatTurn &&
      myActionResources?.actionAvailable &&
      myCombatParticipant &&
      !isCombatBusy
  );
  const canUseAction = Boolean(isMyCombatTurn && myActionResources?.actionAvailable && !isCombatBusy);
  const canUseSneakAttack = Boolean(
    isMyCombatTurn &&
      myActionResources?.actionAvailable &&
      myActionResources?.sneakAttackAvailable &&
      selectedTargetParticipant &&
      isSelectedTargetSneakAttackEligible &&
      !isCombatBusy
  );
  const canStartSneakAttackTargeting = Boolean(
    isMyCombatTurn &&
      myActionResources?.actionAvailable &&
      myActionResources?.sneakAttackAvailable &&
      isSneakAttackWeaponEquipped &&
      myCombatParticipant &&
      !isCombatBusy
  );
  const canUseOffhandAttack = Boolean(
    isMyCombatTurn &&
      myActionResources?.twoWeaponAttackAvailable &&
      myActionResources?.bonusActionAvailable &&
      offhandWeapon &&
      offhandWeaponIsLightMelee &&
      selectedTargetParticipant?.isHostile &&
      selectedTargetParticipant.isAlive &&
      isSelectedTargetInOffhandRange &&
      !isCombatBusy
  );
  const classAbilityButtons = useMemo(
    () => getClassAbilityButtons(myCharacter, myCombatParticipant?.conditions),
    [myCharacter, myCombatParticipant?.conditions]
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
  const movementCurrent = myActionResources?.movementFtRemaining ?? myCharacter?.speed ?? null;
  const movementTotal = myActionResources?.movementFtTotal ?? myCharacter?.speed ?? null;
  const hpMeterStyle = {
    '--combat-resource-fill': `${getResourceFillPercent(myCurrentHp, myMaxHp)}%`,
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
    if (!participant.sessionCharacterId) return null;
    return (
      map?.tokens.find((token) => token.sessionCharacterId === participant.sessionCharacterId)?.id ??
      null
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
            { currentHp: number | null; maxHp: number | null; isAlive: boolean },
          ] => Boolean(entry)
        ) ?? [];
    return Object.fromEntries(entries);
  }, [combat, map?.tokens]);
  const attackRangeOverlay = useMemo(() => {
    if ((!isAttackTargeting && !isSneakAttackTargeting && !targetingSpellId) || !myCombatParticipant) return null;
    const tokenId = getParticipantTokenId(myCombatParticipant);
    const rangeFt = targetingSpellId ? (mvpSpellRangeFtById[targetingSpellId] ?? attackRangeFt) : attackRangeFt;
    return tokenId ? { tokenId, rangeFt } : null;
  }, [attackRangeFt, isAttackTargeting, isSneakAttackTargeting, map?.tokens, myCombatParticipant, targetingSpellId]);

  function getParticipantAvatar(participant: CombatResponseDto['participants'][number]) {
    const character = participant.sessionCharacterId
      ? characters.find((candidate) => candidate.id === participant.sessionCharacterId)
      : null;
    if (character) {
      return getCharacterImage(character);
    }

    const tokenId = getParticipantTokenId(participant);
    return tokenId
      ? (map?.tokens.find((token) => token.id === tokenId)?.imageUrl ?? null)
      : null;
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
    if (!isSneakAttackWeaponEquipped || !isParticipantAttackTargetInRange(participant)) return false;
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

  function runEquippedWeaponAttack(targetParticipantId: string) {
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setTargetingSpellId(null);
    void onAttackWithEquippedWeapon(targetParticipantId);
  }

  function runOffhandWeaponAttack(targetParticipantId: string) {
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setTargetingSpellId(null);
    void onAttackWithOffhandWeapon(targetParticipantId);
  }

  function runSneakAttack(targetParticipantId: string) {
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setTargetingSpellId(null);
    void onSneakAttack(targetParticipantId);
  }

  function startSpellTargeting(spellId: string) {
    if (!spellId || spellId === 'spell.shield') return;
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setTargetingSpellId((current) => (current === spellId ? null : spellId));
  }

  function castTargetingSpell(spellId: string, selection: BattleMapSelection | null) {
    if (spellId === 'spell.fire_bolt' || spellId === 'spell.magic_missile') {
      if (selection?.kind !== 'token') return;
      const participant = getParticipantByTokenId(selection.token.id);
      if (!participant?.isHostile || !participant.isAlive) return;
      if (!isParticipantSpellTargetInRange(participant, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, { targetParticipantIds: [participant.sessionEntityId] });
      return;
    }
    if (spellId === 'spell.sleep') {
      const point = selection?.point ?? null;
      if (!point || !isPointSpellTargetInRange(point, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, { point });
      return;
    }
    if (spellId === 'spell.light') {
      const point = selection?.point ?? null;
      if (!point || !isPointSpellTargetInRange(point, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, { point });
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
      participant?.isHostile && participant.isAlive ? participant.sessionEntityId : null
    );

    if (!isAttackTargeting && !isSneakAttackTargeting) return;
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
    if (!selectedTargetParticipant.isAlive || !isParticipantTokenVisible(selectedTargetParticipant)) {
      setSelectedTargetParticipantId(null);
      setSelectedMapTokenId(null);
    }
  }, [map?.tokens, selectedTargetParticipant]);

  useEffect(() => {
    if (!canStartAttackTargeting) {
      setAttackTargeting(false);
      setTargetingSpellId(null);
    }
  }, [canStartAttackTargeting]);

  useEffect(() => {
    if (!canStartSneakAttackTargeting) {
      setSneakAttackTargeting(false);
    }
  }, [canStartSneakAttackTargeting]);

  return (
    <div className="combat-node-surface">
      <header className="combat-turn-bar" aria-label="전투 턴 정보">
        <div className="combat-node-title-row">
          <img
            src={battleNodeBadge}
            alt="전투 노드"
            className="session-node-type-badge"
          />
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
                    ? characters.find((character) => character.id === participant.sessionCharacterId) ?? null
                    : null;
                  const isCurrentTurn = participant.sessionEntityId === combat?.currentEntityId;
                  const isNextTurn = participant.sessionEntityId === nextTurnEntityId;
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
                      title={
                        isSneakAttackTargeting && participant.isHostile
                          ? isParticipantSneakAttackEligible(participant)
                            ? `${participant.name} / 암습 가능`
                            : `${participant.name} / 암습 조건 불충족`
                          : `${participant.name} / HP ${participant.currentHp ?? '-'}/${participant.maxHp ?? '-'}`
                      }
                      aria-label={participant.name}
                      onClick={() => {
                        setSelectedMapTokenId(tokenId ?? null);
                        if (isSneakAttackTargeting && participant.isHostile && participant.isAlive) {
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
              <BattleMap
                map={map}
                characters={characters}
                isHost={isHost}
                currentUserId={currentUserId}
                interactionMode="session"
                isInteractionLocked={!isMyCombatTurn}
                tokenMovementRangeFtByTokenId={tokenMovementRangeFtByTokenId}
                tokenHealthByTokenId={enemyTokenHealthByTokenId}
                attackRangeOverlay={attackRangeOverlay}
                onChange={onMapChange}
                onTokenMoveRequest={onTokenMoveRequest}
                onSelectionChange={handleCombatMapSelection}
                title={node?.title ?? '전투 지도'}
              />
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
        <div className={`combat-resource-panel${isMyCombatTurn ? ' my-turn' : ''}`}>
          <span className="combat-frame-corner top-left" aria-hidden="true" />
          <span className="combat-frame-corner top-right" aria-hidden="true" />
          <span className="combat-frame-corner bottom-left" aria-hidden="true" />
          <span className="combat-frame-corner bottom-right" aria-hidden="true" />
          <div className="combat-resource-head">
            <span className="combat-node-eyebrow">행동 자원</span>
            <div className="combat-resource-actions">
              {isMyCombatTurn ? (
                <span className="combat-turn-alert" aria-label="현재 내 턴">
                  내 턴
                </span>
              ) : null}
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
              {canShowEndTurnButton ? (
                <button
                  type="button"
                  className="combat-end-turn-button"
                  disabled={!combat || isCombatBusy}
                  onClick={() => onEndTurn(isGmView)}
                >
                  턴 종료
                </button>
              ) : null}
            </div>
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
          <div className="combat-resource-meter-grid">
            <div className="combat-resource-meter hp" style={hpMeterStyle}>
              <div className="combat-resource-meter-label">
                <span>HP</span>
                <strong>{myCurrentHp ?? '-'}/{myMaxHp ?? '-'}</strong>
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
              currentTab.actions.map((action) => {
                const spellId = mvpSpellIdsByLabel[action];
                const disabled =
                  !isMyCombatTurn ||
                  !canUseAction ||
                  isCombatBusy ||
                  spellId === 'spell.shield';
                return (
                  <button
                    type="button"
                    className={`combat-action-button has-action-icon${targetingSpellId === spellId ? ' targeting' : ''}`}
                    key={action}
                    disabled={disabled}
                    title={
                      spellId === 'spell.shield'
                        ? 'Shield는 공격받을 때 반응 팝업으로 사용합니다.'
                        : targetingSpellId === spellId
                          ? `${action} 사거리 안의 유효한 대상 또는 지점을 선택하세요.`
                          : `${action} 타겟팅`
                    }
                    onClick={() => spellId && startSpellTargeting(spellId)}
                  >
                    <CombatActionButtonContent label={action} />
                  </button>
                );
              })
            ) : currentTab.id === 'ability' ? (
              classAbilityButtons.length ? (
                classAbilityButtons.map((ability) => {
                  const canUseFeature = Boolean(
                    isMyCombatTurn &&
                      !isCombatBusy &&
                      !ability.disabled &&
                      (!ability.requiresAction || myActionResources?.actionAvailable) &&
                      (!ability.requiresBonusAction || myActionResources?.bonusActionAvailable)
                  );
                  const isSneakAttack = ability.action === 'sneak_attack';
                  const canUseSneakFeature = isSneakAttack
                    ? Boolean(canUseFeature && isSneakAttackWeaponEquipped && myActionResources?.sneakAttackAvailable)
                    : canUseFeature;
                  return (
                    <button
                      type="button"
                      key={ability.key}
                      className={`combat-action-button has-action-icon${isSneakAttackTargeting && isSneakAttack ? ' targeting' : ''}`}
                      disabled={!canUseSneakFeature}
                      title={
                        ability.disabled || (isSneakAttack && !myActionResources?.sneakAttackAvailable)
                          ? '이미 사용한 능력입니다.'
                          : isSneakAttack && !isSneakAttackWeaponEquipped
                            ? '암습은 finesse 또는 원거리 무기를 장착해야 사용할 수 있습니다.'
                            : isSneakAttackTargeting
                              ? '암습 가능한 적 토큰을 선택하세요.'
                              : isSneakAttack && selectedTargetParticipant && !isSelectedTargetSneakAttackEligible
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
                })
              ) : (
                <button type="button" className="combat-action-empty-button" disabled>
                  사용 가능한 직업 능력 없음
                </button>
              )
            ) : currentTab.actions.map((action) => {
              if (action === '공격') {
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
                    onClick={() => void onDash()}
                  >
                    <CombatActionButtonContent label="대시" />
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
                    onClick={() => void onDodge()}
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
                    onClick={() => void onHide()}
                  >
                    <CombatActionButtonContent label="숨기" />
                  </button>
                );
              }
              return (
                <button type="button" key={action} className="combat-action-button has-action-icon" disabled>
                  <CombatActionButtonContent label={action} />
                </button>
              );
            })}
          </div>
          {isAttackTargeting ? (
            <p className="combat-targeting-hint" title={`${attackName} 사거리 안의 적 토큰을 선택하세요.`}>
              {attackName} 사거리 안의 적 토큰을 선택하세요.
            </p>
          ) : null}
          {isSneakAttackTargeting ? (
            <p className="combat-targeting-hint" title="암습 조건을 만족하는 적 토큰을 선택하세요.">
              암습 가능한 적 토큰을 선택하세요.
            </p>
          ) : null}
          {targetingSpellId ? (
            <p className="combat-targeting-hint" title="사거리 안의 유효한 대상 또는 지점을 선택하세요.">
              {targetingSpellId === 'spell.fire_bolt' || targetingSpellId === 'spell.magic_missile'
                ? '사거리 안의 적 토큰을 선택하세요.'
                : '사거리 안의 타일을 선택하세요.'}
            </p>
          ) : null}
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
            {inventory.length ? (
              <div
                id="combat-inventory-list"
                className={`combat-inventory-list${isInventoryExpanded ? ' expanded' : ''}`}
              >
                {inventory.flatMap((item) => {
                  const isWeapon = isWeaponItem(item);
                  const isShield = isShieldItem(item);
                  const equippedCount = isWeapon || isShield
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
                }).map(({ item, equipmentDisplayState }) => {
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
                          <InventoryItemInfo item={item} />
                        </strong>
                        <span>{getInventoryMetaLabel(item)}</span>
                      </div>
                      <span className="combat-inventory-quantity">x{item.quantity}</span>
                      {isWeapon || isArmor || isShield ? (
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
                      ) : (
                        <button
                          type="button"
                          disabled={!canUse || isInventoryBusy}
                          title={canUse ? `${item.name} 사용` : '현재 바로 사용할 수 없는 아이템입니다.'}
                          onClick={() => onUseInventoryItem(item)}
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
