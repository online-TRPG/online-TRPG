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
import { CharacterDetailModal } from './CharacterDetailModal';
import { MapPartyOverlay } from './MapPartyOverlay';
import { getCharacterImage } from '../utils/characterVisuals';
import './CombatNodeSurface.css';

type CombatActionTab = 'basic' | 'ability' | 'spell';
type CombatResourceIconKind = 'action' | 'bonus' | 'reaction';

type CombatAbilityButton = {
  key: string;
  label: string;
  action: 'second_wind';
  title: string;
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
  onDash: () => void | Promise<void>;
  onDodge: () => void | Promise<void>;
  onHide: () => void | Promise<void>;
  onUseClassFeature: (action: CombatAbilityButton['action']) => void | Promise<void>;
  onCastSpell: (
    spellId: string,
    payload: { targetParticipantIds?: string[]; point?: { x: number; y: number } | null }
  ) => void | Promise<void>;
  onEndCombat: () => void;
  onEndTurn: (force?: boolean) => void;
}

const spellcastingClassKeys = new Set([
  'bard',
  'cleric',
  'druid',
  'paladin',
  'ranger',
  'sorcerer',
  'warlock',
  'wizard',
]);

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

const spellActionTab: { id: CombatActionTab; label: string; actions: string[] } = {
  id: 'spell',
  label: '마법',
  actions: ['Fire Bolt', 'Light', 'Magic Missile', 'Shield', 'Sleep'],
};

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

  return buttons;
}

function canLearnSpells(
  character: SessionCharacterResponseDto | null,
  classDefinitions: ClassDefinitionResponseDto[]
) {
  const classKey = normalizeClassKey(character?.className);
  if (!classKey) return false;

  const classDefinition = classDefinitions.find((klass) => {
    const definitionKey = normalizeClassKey(klass.key);
    const definitionName = normalizeClassKey(klass.koName);
    return definitionKey === classKey || definitionName === classKey;
  });

  if (classDefinition) {
    return (
      classDefinition.startingCantripCount > 0 ||
      classDefinition.startingSpellCount > 0 ||
      spellcastingClassKeys.has(normalizeClassKey(classDefinition.key))
    );
  }

  return spellcastingClassKeys.has(classKey);
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
  if (learned.includes(spellId)) return true;
  return normalizeClassKey(character.className).includes('wizard');
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
  const key = getInventoryItemKey(item);
  return (
    item.itemType === 'armor' ||
    item.itemType === 'shield' ||
    key.includes('armor') ||
    key.includes('갑옷') ||
    key.includes('방패')
  );
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
    key.includes('handaxe') ||
    key.includes('scimitar') ||
    key.includes('shortsword') ||
    key.includes('단검') ||
    key.includes('핸드액스') ||
    key.includes('시미터') ||
    key.includes('쇼트소드')
  ) {
    properties.add('light');
    properties.add('melee');
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
  if (kind === 'action') return <GameIcon name="game-icons:rune-sword" size={21} />;
  if (kind === 'bonus') return <GameIcon name="game-icons:sun" size={21} />;
  return <GameIcon name="game-icons:shield" size={21} />;
}

export function CombatNodeSurface({
  node,
  scenarioTitle,
  phase,
  characters,
  classDefinitions,
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
  const [targetingSpellId, setTargetingSpellId] = useState<string | null>(null);
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const actionTabs = useMemo(
    () =>
      canLearnSpells(myCharacter, classDefinitions)
        ? [...baseActionTabs, spellActionTab]
        : baseActionTabs,
    [classDefinitions, myCharacter]
  );
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
  const equippedWeapon =
    inventory.find((item) => isEquippedItem(item, myCharacter?.equippedWeaponId)) ?? null;
  const offhandWeapon =
    inventory.find((item) => isEquippedItem(item, myCharacter?.offhandWeaponId)) ?? null;
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
  const attackRangeOverlay = useMemo(() => {
    if ((!isAttackTargeting && !targetingSpellId) || !myCombatParticipant) return null;
    const tokenId = getParticipantTokenId(myCombatParticipant);
    const rangeFt = targetingSpellId ? (mvpSpellRangeFtById[targetingSpellId] ?? attackRangeFt) : attackRangeFt;
    return tokenId ? { tokenId, rangeFt } : null;
  }, [attackRangeFt, isAttackTargeting, map?.tokens, myCombatParticipant, targetingSpellId]);

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

  function isParticipantAttackTargetInRange(
    participant: CombatResponseDto['participants'][number] | null
  ) {
    if (!map || !myCombatParticipant || !participant) return false;
    const sourceToken = getMapToken(getParticipantTokenId(myCombatParticipant));
    const targetToken = getMapToken(getParticipantTokenId(participant));
    if (!sourceToken || !targetToken) return false;
    return getGridDistanceFt(map, sourceToken, targetToken) <= attackRangeFt;
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
    setTargetingSpellId(null);
    void onAttackWithEquippedWeapon(targetParticipantId);
  }

  function runOffhandWeaponAttack(targetParticipantId: string) {
    setAttackTargeting(false);
    setTargetingSpellId(null);
    void onAttackWithOffhandWeapon(targetParticipantId);
  }

  function startSpellTargeting(spellId: string) {
    if (!spellId || spellId === 'spell.shield') return;
    setAttackTargeting(false);
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
      return;
    }
    setSelectedMapTokenId(selection.token.id);
    const participant = getParticipantByTokenId(selection.token.id);
    setSelectedTargetParticipantId(
      participant?.isHostile && participant.isAlive ? participant.sessionEntityId : null
    );

    if (!isAttackTargeting) return;
    if (!participant?.isHostile || !participant.isAlive) return;
    if (!isParticipantAttackTargetInRange(participant)) return;
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
                {turnOrder.map((participant) => {
                  const avatar = getParticipantAvatar(participant);
                  const tokenId = getParticipantTokenId(participant);
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
                        tokenId && tokenId === selectedMapTokenId ? 'selected' : '',
                        participant.sessionCharacterId === myCharacter?.id ? 'mine' : '',
                        !participant.isAlive ? 'defeated' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={`${participant.name} / HP ${participant.currentHp ?? '-'}/${participant.maxHp ?? '-'}`}
                      onClick={() => {
                        setSelectedMapTokenId(tokenId ?? null);
                        if (detailCharacter) {
                          setSelectedTurnCharacterId(detailCharacter.id);
                        } else if (participant.isHostile && participant.isAlive) {
                          setSelectedTargetParticipantId(participant.sessionEntityId);
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
        <div className="combat-resource-panel">
          <span className="combat-frame-corner top-left" aria-hidden="true" />
          <span className="combat-frame-corner top-right" aria-hidden="true" />
          <span className="combat-frame-corner bottom-left" aria-hidden="true" />
          <span className="combat-frame-corner bottom-right" aria-hidden="true" />
          <div className="combat-resource-head">
            <span className="combat-node-eyebrow">행동 자원</span>
            <div className="combat-resource-actions">
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
              <button
                type="button"
                className="combat-end-turn-button"
                disabled={!combat || isCombatBusy}
                onClick={() => onEndTurn(isGmView)}
              >
                턴 종료
              </button>
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
                const isKnown = Boolean(spellId && hasMvpSpell(myCharacter, spellId));
                const disabled =
                  !isMyCombatTurn ||
                  !canUseAction ||
                  isCombatBusy ||
                  !isKnown ||
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
                        : !isKnown
                          ? '익히지 않은 주문입니다.'
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
                      (!ability.requiresBonusAction || myActionResources?.bonusActionAvailable)
                  );
                  return (
                    <button
                      type="button"
                      key={ability.key}
                      className="combat-action-button has-action-icon"
                      disabled={!canUseFeature}
                      title={ability.disabled ? '이미 사용한 능력입니다.' : ability.title}
                      onClick={() => void onUseClassFeature(ability.action)}
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
                {inventory.map((item) => {
                  const canUse = isQuickUsableItem(item);
                  const isWeapon = isWeaponItem(item);
                  const isArmor = isArmorItem(item);
                  const isEquipped = isWeapon
                    ? isEquippedItem(item, myCharacter?.equippedWeaponId) ||
                      isEquippedItem(item, myCharacter?.offhandWeaponId)
                    : isArmor;
                  return (
                    <article className="combat-inventory-item" key={item.id}>
                      <span className="combat-inventory-item-icon" aria-hidden="true">
                        <GameIcon name={getInventoryItemIconName(item)} size={28} />
                      </span>
                      <div className="combat-inventory-item-body">
                        <strong>{item.name}</strong>
                        <span>{getItemMetaLabel(item)}</span>
                      </div>
                      <span className="combat-inventory-quantity">x{item.quantity}</span>
                      {isWeapon || isArmor ? (
                        <button
                          type="button"
                          disabled={isArmor || isInventoryBusy}
                          title={
                            isArmor
                              ? '방어구는 현재 캐릭터 AC에 이미 반영되어 있습니다.'
                              : isEquipped
                                ? `${item.name} 착용 해제`
                                : `${item.name} 착용`
                          }
                          onClick={() => onEquipInventoryItem(item)}
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
          onClose={() => setSelectedTurnCharacterId(null)}
        />
      ) : null}
    </div>
  );
}
