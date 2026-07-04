import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  AiHumanGmAssistSuggestionRequestDto,
  ClassDefinitionResponseDto,
  CombatResponseDto,
  CreateHumanGmAiAssistSuggestionDto,
  HumanGmAiAssistSuggestionDto,
  InventoryItemDto,
  PlayerScenarioNodeDto,
  RuleCatalogReferenceDto,
  SessionCharacterResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import { SessionBattleMap } from './SessionBattleMap';
import type { BattleMapSelection } from './SessionBattleMap';
import { GameIcon } from '../../../components/GameIcon';
import battleNodeBadge from '../../../components/node_badge_battle.webp';
import turnDividerArrow from '../../../components/divider-arrow-gold-horizontal.webp';
import { CharacterDetailModal } from './CharacterDetailModal';
import { InventoryEquipmentStatus } from './InventoryEquipmentStatus';
import { InventoryItemInfo } from './InventoryItemInfo';
import { HumanGmAiAssistPanel } from './HumanGmAiAssistPanel';
import { MapPartyOverlay } from './MapPartyOverlay';
import { NodeHeaderScroll } from './NodeHeaderScroll';
import {
  getCombatResourceMeterStyle,
  getCombatTurnCardColorStyle,
  useCombatNodeSurfacePresentation,
} from '../hooks/useCombatNodeSurfacePresentation';
import { getCharacterImage } from '../utils/characterVisuals';
import { describeCombatParticipantObservation } from '../utils/combatParticipantObservation';
import { formatInternalIdAsReadableName, getUserFacingItemName } from '../utils/displayNames';
import {
  CombatActionButtonContent,
  getMonsterActionRangeLabel,
  getMonsterActionSummaryLabels,
  getMonsterActionUnavailableLabel,
} from './CombatActionPresentation';
import {
  getInventoryItemIconName,
  isArmorInventoryItem as isArmorItem,
  isEquippedInventoryItem as isEquippedItem,
  isQuickUsableInventoryItem as isQuickUsableItem,
  isShieldInventoryItem as isShieldItem,
  isWeaponInventoryItem as isWeaponItem,
} from '../utils/inventoryItemModel';
import {
  getThrowableLongRangeFt,
  getWeaponRangeFt,
  isLightMeleeWeaponItem,
  isSneakAttackWeaponItem,
} from '../utils/combatInventoryRules';
import {
  getClassAbilityButtons,
  type CombatClassAbilityAction,
} from '../utils/combatClassAbilityButtons';
import type { CombatClassFeatureAction } from '../utils/combatClassFeatureCommand';
import {
  formatLevel1SpellSlots,
  formatSpellSlotPips,
  getCombatSpellActionButtonTitle,
  getSpellTargetingHint,
  spellFilterOptions,
  type SpellFilter,
} from '../utils/combatSpellPresentation';
import {
  getAvailableSlotLevelsForSpell,
  canLegacyCombatSpellTargetParticipant,
  type CombatSpellSlotResource,
  getCombatSpellActionCostKind,
  getCombatCatalogSpellMetadataById,
  getLegacyCombatSpellTargetKind,
  getKnownMvpSpellActions,
  getSelectedSlotLevelForSpell,
  getSpellSlotRemaining,
  getVisibleSpellActions,
  getVisibleSpellSlotEntries,
  isImmediateSelfCombatSpell,
  isCombatSpellActionDisabled,
  mvpSpellLevelById,
  mvpSpellRangeFtById,
  p3CombatSpellMetadataById,
} from '../utils/combatSpellModel';
import { getMapObjectItemPayload } from '../utils/explorationMapObjectModel';
import { getGridDistanceFt } from '../utils/explorationMapGeometry';
import { MONSTER_TOKEN_COLOR, NPC_TOKEN_COLOR } from '../../../utils/sessionTokenColors';
import './CombatNodeSurface.css';

type CombatActionTab = 'basic' | 'ability' | 'spell';
type CombatMovementMode = 'normal' | 'jump';
type ForcedMovementMode = 'push' | 'pull' | 'slide';
type CombatActorActionType = 'attack' | 'dash' | 'dodge' | 'hide';
type CombatResourceIconKind = 'action' | 'bonus' | 'reaction';
type CombatParticipant = CombatResponseDto['participants'][number];
type CombatMonsterAction = NonNullable<CombatParticipant['monsterActions']>[number];
type CombatConditionOption = {
  id: string;
  label: string;
};
interface CombatNodeSurfaceProps {
  node: PlayerScenarioNodeDto | null;
  scenarioTitle?: string | null;
  phase?: string | null;
  characters: SessionCharacterResponseDto[];
  classDefinitions: ClassDefinitionResponseDto[];
  ruleCatalog?: RuleCatalogReferenceDto[];
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
  onUseInventoryItem: (
    item: InventoryItemDto,
    targetSessionCharacterId?: string | null,
    targetParticipantId?: string | null,
    point?: { x: number; y: number } | null
  ) => void;
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
  onAdjustHp?: (
    targetTokenOrParticipantId: string,
    currentHp: number
  ) => void | Promise<void>;
  onForceMoveParticipant?: (
    targetParticipantId: string,
    mode: ForcedMovementMode,
    origin: { x: number; y: number },
    distanceFt: number
  ) => void | Promise<void>;
  onUseClassFeature: (
    action: CombatClassFeatureAction,
    targetParticipantId?: string
  ) => void | Promise<void>;
  onCastSpell: (
    spellId: string,
    payload: {
      targetParticipantIds?: string[];
      point?: { x: number; y: number } | null;
      slotLevel?: number;
    }
  ) => void | Promise<void>;
  gmNodeMoveOptions?: Array<{
    nodeId: string;
    title: string;
    label?: string | null;
  }>;
  gmAiAssistSuggestions?: HumanGmAiAssistSuggestionDto[];
  onGmAiAssistCreate?: (
    payload: CreateHumanGmAiAssistSuggestionDto
  ) => Promise<void> | void;
  onGmAiAssistGenerate?: (
    payload: AiHumanGmAssistSuggestionRequestDto
  ) => Promise<void> | void;
  onGmAiAssistAccept?: (
    suggestion: HumanGmAiAssistSuggestionDto
  ) => Promise<void> | void;
  isGmAiAssistPending?: boolean;
  recentGmAiAssistLogs?: string[];
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
  ruleCatalog = [],
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
  onAdjustHp,
  onForceMoveParticipant,
  onUseClassFeature,
  onCastSpell,
  gmNodeMoveOptions = [],
  gmAiAssistSuggestions = [],
  onGmAiAssistCreate,
  onGmAiAssistGenerate,
  onGmAiAssistAccept,
  isGmAiAssistPending = false,
  recentGmAiAssistLogs = [],
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
  const [isBardicInspirationTargeting, setBardicInspirationTargeting] =
    useState(false);
  const [isDragonbornBreathTargeting, setDragonbornBreathTargeting] =
    useState(false);
  const [targetingSpellId, setTargetingSpellId] = useState<string | null>(null);
  const [gmHpValue, setGmHpValue] = useState(0);
  const [spellSlotLevelBySpellId, setSpellSlotLevelBySpellId] = useState<Record<string, number>>({});
  const [gmForcedMovementDistanceFt, setGmForcedMovementDistanceFt] = useState(10);
  const [targetingMonsterActionId, setTargetingMonsterActionId] = useState<string | null>(null);
  const [combatMovementMode, setCombatMovementMode] = useState<CombatMovementMode>('normal');
  const [spellFilter, setSpellFilter] = useState<SpellFilter>('all');
  const combatPresentation = useCombatNodeSurfacePresentation({
    phase,
  });
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const catalogSpellMetadataById = useMemo(
    () => getCombatCatalogSpellMetadataById(ruleCatalog),
    [ruleCatalog]
  );
  const knownSpellActions = useMemo(
    () => getKnownMvpSpellActions(myCharacter, ruleCatalog),
    [myCharacter, ruleCatalog]
  );
  const visibleSpellActions = useMemo(
    () => getVisibleSpellActions(knownSpellActions, spellFilter),
    [knownSpellActions, spellFilter]
  );
  const actionTabs = useMemo(() => {
    if (!knownSpellActions.length) {
      return baseActionTabs;
    }
    return [
      ...baseActionTabs,
      { id: 'spell' as const, label: '마법', actions: knownSpellActions.map((action) => action.label) },
    ];
  }, [knownSpellActions]);
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
  const spellSlotResources: Record<string, CombatSpellSlotResource> =
    myActionResources?.spellSlots ?? {};
  const visibleSpellSlotEntries = getVisibleSpellSlotEntries(spellSlotResources);
  const getSpellRangeFt = (spellId: string) =>
    mvpSpellRangeFtById[spellId] ?? catalogSpellMetadataById.get(spellId)?.rangeFt ?? 0;
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
  const attackName = equippedWeapon ? getUserFacingItemName(equippedWeapon) : '기본 공격';
  const attackRangeFt = equippedWeapon ? getWeaponRangeFt(equippedWeapon) : 5;
  const offhandAttackName = offhandWeapon
    ? `보조 공격(${getUserFacingItemName(offhandWeapon)})`
    : '보조 공격';
  const offhandAttackRangeFt = offhandWeapon ? getWeaponRangeFt(offhandWeapon) : 5;
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
    (myActionResources?.actionAvailable ||
      myActionResources?.extraAttackAvailable ||
      myActionResources?.hasteActionAvailable) &&
    selectedTargetParticipant?.isHostile &&
    selectedTargetParticipant.isAlive &&
    isSelectedTargetInRange &&
    !isCombatBusy
  );
  const canStartAttackTargeting = Boolean(
    canUsePlayerCharacterActions &&
      (myActionResources?.actionAvailable ||
        myActionResources?.extraAttackAvailable ||
        myActionResources?.hasteActionAvailable) &&
      myCombatParticipant &&
      !isCombatBusy
  );
  const canUseAction = Boolean(
    canControlActiveActor && activeActionResources?.actionAvailable && !isCombatBusy
  );
  const canUseHasteAction = Boolean(
    canControlActiveActor &&
      (activeActionResources?.actionAvailable ||
        activeActionResources?.hasteActionAvailable) &&
      !isCombatBusy
  );
  const canUseBonusAction = Boolean(
    canControlActiveActor && activeActionResources?.bonusActionAvailable && !isCombatBusy
  );
  const canUseSneakAttack = Boolean(
    canUsePlayerCharacterActions &&
    (myActionResources?.actionAvailable ||
      myActionResources?.extraAttackAvailable ||
      myActionResources?.hasteActionAvailable) &&
    myActionResources?.sneakAttackAvailable &&
    selectedTargetParticipant &&
    isSelectedTargetSneakAttackEligible &&
    !isCombatBusy
  );
  const canStartSneakAttackTargeting = Boolean(
    canUsePlayerCharacterActions &&
    (myActionResources?.actionAvailable ||
      myActionResources?.extraAttackAvailable ||
      myActionResources?.hasteActionAvailable) &&
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
  const isMonsterTargetedAction = (monsterAction: CombatMonsterAction) =>
    monsterAction.targetKind
      ? monsterAction.targetKind === 'single_target' || monsterAction.targetKind === 'area'
      : monsterAction.attackKind !== 'special' || monsterAction.specialType === 'multiattack';
  const isMonsterSelfAction = (monsterAction: CombatMonsterAction) =>
    monsterAction.targetKind
      ? monsterAction.targetKind === 'self'
      : monsterAction.attackKind === 'special' && monsterAction.specialType !== 'multiattack';
  const canUseMonsterTargetedAction = (monsterAction: CombatMonsterAction) => Boolean(
    canUseMonsterActionCost(monsterAction) &&
      isMonsterTargetedAction(monsterAction) &&
      selectedTargetParticipant &&
      selectedTargetParticipant.isAlive &&
      selectedTargetParticipant.isHostile !== activeCombatActor?.isHostile &&
      !isCombatBusy
  );
  const canUseMonsterSelfAction = (monsterAction: CombatMonsterAction) => Boolean(
    canUseMonsterActionCost(monsterAction) &&
      isMonsterSelfAction(monsterAction) &&
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
  const canAdjustGmHp = Boolean(
    isGmView &&
      onAdjustHp &&
      selectedConditionTargetId &&
      selectedTargetParticipant &&
      !isCombatBusy
  );
  useEffect(() => {
    setGmHpValue(selectedTargetParticipant?.currentHp ?? 0);
  }, [selectedTargetParticipant?.currentHp, selectedTargetParticipant?.sessionEntityId]);
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
  const hpMeterStyle = getCombatResourceMeterStyle(activeCurrentHp, activeMaxHp);
  const movementMeterStyle = getCombatResourceMeterStyle(movementCurrent, movementTotal);
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
      ? getSpellRangeFt(targetingSpellId)
      : attackRangeFt;
    return tokenId ? { tokenId, rangeFt } : null;
  }, [
    attackRangeFt,
    catalogSpellMetadataById,
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
    return getCombatTurnCardColorStyle(
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
    return getGridDistanceFt(map, sourceToken, targetToken) <= getSpellRangeFt(spellId);
  }

  function isPointSpellTargetInRange(point: { x: number; y: number }, spellId: string) {
    if (!map || !myCombatParticipant) return false;
    const sourceToken = getMapToken(getParticipantTokenId(myCombatParticipant));
    if (!sourceToken) return false;
    const pointToken = { ...sourceToken, x: point.x, y: point.y };
    return getGridDistanceFt(map, sourceToken, pointToken) <= getSpellRangeFt(spellId);
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
    setBardicInspirationTargeting(false);
    setDragonbornBreathTargeting(false);
    setTargetingSpellId(null);
    setTargetingMonsterActionId(null);
    void onAttackWithEquippedWeapon(targetParticipantId);
  }

  function runOffhandWeaponAttack(targetParticipantId: string) {
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setBardicInspirationTargeting(false);
    setDragonbornBreathTargeting(false);
    setTargetingSpellId(null);
    setTargetingMonsterActionId(null);
    void onAttackWithOffhandWeapon(targetParticipantId);
  }

  function runSneakAttack(targetParticipantId: string) {
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setBardicInspirationTargeting(false);
    setDragonbornBreathTargeting(false);
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
    setBardicInspirationTargeting(false);
    setDragonbornBreathTargeting(false);
    setTargetingSpellId(null);
    setTargetingMonsterActionId(null);
    void onMonsterAction?.(targetParticipantId ?? null, actionType, actionId ?? null);
  }

  function startSpellTargeting(spellId: string) {
    if (!spellId || spellId === 'spell.shield') return;
    const p3Spell = p3CombatSpellMetadataById.get(spellId);
    const catalogSpell = catalogSpellMetadataById.get(spellId);
    if (isImmediateSelfCombatSpell(spellId, p3Spell, catalogSpell)) {
      setTargetingSpellId(null);
      void onCastSpell(spellId, buildSpellCastPayload(spellId));
      return;
    }
    setAttackTargeting(false);
    setSneakAttackTargeting(false);
    setBardicInspirationTargeting(false);
    setDragonbornBreathTargeting(false);
    setTargetingMonsterActionId(null);
    setTargetingSpellId((current) => (current === spellId ? null : spellId));
  }

  function buildSpellCastPayload(spellId: string) {
    const spellLevel = mvpSpellLevelById[spellId] ?? catalogSpellMetadataById.get(spellId)?.level;
    const slotLevel = getSelectedSlotLevelForSpell(
      spellId,
      spellLevel,
      spellSlotResources,
      spellSlotLevelBySpellId
    );
    return typeof slotLevel === 'number' && slotLevel > 0 && slotLevel !== spellLevel
      ? { slotLevel }
      : {};
  }

  function castTargetingSpell(spellId: string, selection: BattleMapSelection | null) {
    const p3Spell = p3CombatSpellMetadataById.get(spellId);
    if (p3Spell?.targeting === 'token') {
      if (selection?.kind !== 'token') return;
      const participant = getParticipantByTokenId(selection.token.id);
      if (!participant || (!p3Spell.allowDefeated && !participant.isAlive)) return;
      if (p3Spell.targetDisposition === 'ally' && participant.isHostile) return;
      if (p3Spell.targetDisposition === 'enemy' && !participant.isHostile) return;
      if (!isParticipantSpellTargetInRange(participant, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, {
        targetParticipantIds: [participant.sessionEntityId],
        ...buildSpellCastPayload(spellId),
      });
      return;
    }
    if (p3Spell?.targeting === 'point') {
      const point = selection?.point ?? null;
      if (!point || !isPointSpellTargetInRange(point, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, { point, ...buildSpellCastPayload(spellId) });
      return;
    }
    const legacySpellTargetKind = getLegacyCombatSpellTargetKind(spellId);
    if (legacySpellTargetKind === 'token') {
      if (selection?.kind !== 'token') return;
      const participant = getParticipantByTokenId(selection.token.id);
      if (!participant) return;
      if (!canLegacyCombatSpellTargetParticipant(spellId, participant)) return;
      if (!isParticipantSpellTargetInRange(participant, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, {
        targetParticipantIds: [participant.sessionEntityId],
        ...buildSpellCastPayload(spellId),
      });
      return;
    }
    if (legacySpellTargetKind === 'point') {
      const point = selection?.point ?? null;
      if (!point || !isPointSpellTargetInRange(point, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, { point, ...buildSpellCastPayload(spellId) });
      return;
    }
    const catalogSpell = catalogSpellMetadataById.get(spellId);
    if (catalogSpell?.targetingType === 'creature') {
      if (selection?.kind !== 'token') return;
      const participant = getParticipantByTokenId(selection.token.id);
      if (!participant || !participant.isAlive) return;
      if (!isParticipantSpellTargetInRange(participant, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, {
        targetParticipantIds: [participant.sessionEntityId],
        ...buildSpellCastPayload(spellId),
      });
      return;
    }
    if (catalogSpell?.targetingType === 'area') {
      const point = selection?.point ?? null;
      if (!point || !isPointSpellTargetInRange(point, spellId)) return;
      setTargetingSpellId(null);
      void onCastSpell(spellId, { point, ...buildSpellCastPayload(spellId) });
      return;
    }
    if (catalogSpell) {
      setTargetingSpellId(null);
      void onCastSpell(spellId, buildSpellCastPayload(spellId));
      return;
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
    if (isBardicInspirationTargeting) {
      if (selection?.kind !== 'token') return;
      const participant = getParticipantByTokenId(selection.token.id);
      if (
        !participant?.isAlive ||
        participant.isHostile ||
        participant.sessionEntityId === myCombatParticipant?.sessionEntityId
      ) {
        return;
      }
      setBardicInspirationTargeting(false);
      void onUseClassFeature(
        'bardic_inspiration',
        participant.sessionEntityId
      );
      return;
    }
    if (isDragonbornBreathTargeting) {
      if (selection?.kind !== 'token') return;
      const participant = getParticipantByTokenId(selection.token.id);
      if (!participant?.isAlive || !participant.isHostile) {
        return;
      }
      setDragonbornBreathTargeting(false);
      void onUseClassFeature(
        'dragonborn_breath',
        participant.sessionEntityId
      );
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
          ? getSpellTargetingHint(targetingSpellId, p3CombatSpellMetadataById)
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
          <span>{combatPresentation.phaseLabel}</span>
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
                      const spellId = action.spellId;
                      const spellLevel =
                        action.level ?? mvpSpellLevelById[spellId] ?? catalogSpellMetadataById.get(spellId)?.level;
                      const isSlottedSpell = typeof spellLevel === 'number' && spellLevel > 0;
                      const availableSlotLevels = getAvailableSlotLevelsForSpell(
                        spellLevel,
                        spellSlotResources
                      );
                      const selectedSlotLevel =
                        spellId && isSlottedSpell
                          ? getSelectedSlotLevelForSpell(
                              spellId,
                              spellLevel,
                              spellSlotResources,
                              spellSlotLevelBySpellId
                            )
                          : undefined;
                      const spellSlotRemaining =
                        isSlottedSpell && selectedSlotLevel
                          ? getSpellSlotRemaining(
                              spellSlotResources,
                              selectedSlotLevel,
                              level1SpellSlotsRemaining,
                              level1SpellSlotsTotal
                            )
                          : isSlottedSpell
                            ? 0
                            : Number.POSITIVE_INFINITY;
                      const spellActionCostKind = getCombatSpellActionCostKind(spellId);
                      const disabled = isCombatSpellActionDisabled({
                        costKind: spellActionCostKind,
                        canUsePlayerCharacterActions,
                        canUseAction,
                        canUseBonusAction,
                        isCombatBusy,
                        isSlottedSpell,
                        spellSlotRemaining,
                      });
                      const isTargetingThisSpell = targetingSpellId === spellId;
                      return (
                        <div className="combat-spell-action-wrap" key={spellId}>
                          <button
                            type="button"
                            className={`combat-action-button has-action-icon${isTargetingThisSpell ? ' targeting' : ''}`}
                            disabled={disabled}
                            title={getCombatSpellActionButtonTitle({
                              label: action.label,
                              costKind: spellActionCostKind,
                              isSlottedSpell,
                              spellLevel,
                              spellSlotRemaining,
                              isTargeting: isTargetingThisSpell,
                            })}
                            onClick={() => spellId && startSpellTargeting(spellId)}
                          >
                            <CombatActionButtonContent label={action.label} spellId={spellId} />
                          </button>
                          {spellId && isSlottedSpell && availableSlotLevels.length ? (
                            <label
                              className="combat-spell-slot-select"
                              title={`${action.label}에 사용할 주문 슬롯`}
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
                   const isBardicInspiration =
                     ability.action === 'bardic_inspiration';
                   const isDragonbornBreath =
                     ability.action === 'dragonborn_breath';
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
                      className={`combat-action-button has-action-icon${
                         (isSneakAttackTargeting && isSneakAttack) ||
                         (isBardicInspirationTargeting && isBardicInspiration) ||
                         (isDragonbornBreathTargeting && isDragonbornBreath)
                          ? ' targeting'
                          : ''
                      }`}
                      disabled={!canUseSneakFeature}
                      title={
                        ability.unavailableReason ??
                        (ability.disabled ||
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
                                : ability.title)
                      }
                      onClick={() => {
                        if (!ability.action) return;
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
                        if (isBardicInspiration) {
                          setAttackTargeting(false);
                          setSneakAttackTargeting(false);
                          setTargetingSpellId(null);
                          setBardicInspirationTargeting((current) => !current);
                          return;
                        }
                        if (isDragonbornBreath) {
                          setAttackTargeting(false);
                          setSneakAttackTargeting(false);
                          setBardicInspirationTargeting(false);
                          setTargetingSpellId(null);
                          setDragonbornBreathTargeting((current) => !current);
                          return;
                        }
                        if (ability.action === 'second_wind') {
                          void onUseClassFeature(ability.action);
                          return;
                        }
                        if (
                          ability.action === 'action_surge' ||
                          ability.action === 'rage' ||
                          ability.action === 'frenzy' ||
                          ability.action === 'cunning_dash' ||
                          ability.action === 'cunning_disengage' ||
                          ability.action === 'cunning_hide' ||
                          ability.action === 'divine_sense' ||
                          ability.action === 'lay_on_hands' ||
                          ability.action === 'primeval_awareness' ||
                          ability.action === 'ki_patient_defense' ||
                          ability.action === 'ki_step_of_wind' ||
                          ability.action === 'channel_divinity' ||
                          ability.action === 'bardic_inspiration' ||
                          ability.action === 'font_of_magic' ||
                          ability.action === 'wild_shape' ||
                          ability.action === 'dragonborn_breath'
                        ) {
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
                  {isGmView ? (
                    <>
                      <label className="combat-spell-slot-select" title="대상 HP 직접 조정">
                        <span>HP</span>
                        <input
                          type="number"
                          min={0}
                          max={selectedTargetParticipant?.maxHp ?? undefined}
                          value={gmHpValue}
                          disabled={!canAdjustGmHp}
                          onChange={(event) => setGmHpValue(Number(event.target.value))}
                        />
                      </label>
                      <button
                        type="button"
                        className="combat-action-button has-action-icon"
                        disabled={!canAdjustGmHp}
                        title={
                          selectedTargetParticipant
                            ? `${selectedTargetParticipant.name}의 HP를 ${gmHpValue}(으)로 조정합니다.`
                            : 'HP를 조정할 토큰을 선택하세요.'
                        }
                        onClick={() => {
                          if (canAdjustGmHp && selectedConditionTargetId) {
                            void onAdjustHp?.(selectedConditionTargetId, gmHpValue);
                          }
                        }}
                      >
                        <CombatActionButtonContent label="HP 적용" />
                      </button>
                    </>
                  ) : null}
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
                          const summaryLabels = getMonsterActionSummaryLabels(monsterAction);
                          const summaryText = summaryLabels.join(' / ');
                          const monsterActionTitle = `${activeCombatActor.name} ${monsterAction.label}${
                            rangeLabel ? ` (${rangeLabel})` : ''
                          }${summaryText ? ` - ${summaryText}` : ''}`;
                          const unavailableLabel = getMonsterActionUnavailableLabel(monsterAction);
                          const isTargetingThisAction =
                            isAttackTargeting && targetingMonsterActionId === monsterActionId;
                          const canUseThisMonsterAction = canUseMonsterTargetedAction(monsterAction);
                          const canUseThisMonsterSelfAction = canUseMonsterSelfAction(monsterAction);
                          const canStartThisMonsterTargeting =
                            canControlHostileMonster &&
                            canUseMonsterActionCost(monsterAction) &&
                            isMonsterTargetedAction(monsterAction);
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
                                  ? monsterActionTitle
                                  : isTargetingThisAction
                                  ? `${monsterAction.label} 대상 플레이어 캐릭터 토큰을 선택하세요.`
                                  : unavailableLabel
                                  ? `${monsterAction.label}: ${unavailableLabel}`
                                  : !selectedTargetParticipant
                                    ? `${monsterAction.label} 버튼을 눌러 대상을 선택하세요.`
                                    : canUseThisMonsterAction
                                      ? monsterActionTitle
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
                              {summaryText ? (
                                <span className="combat-action-subtext">{summaryText}</span>
                              ) : null}
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
                      disabled={!canUseHasteAction}
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
                      disabled={!canUseHasteAction}
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
                        : `${formatInternalIdAsReadableName(
                            selectedObjectItemPayload.itemDefinitionId,
                            '아이템'
                          )} 줍기`
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
                    const itemDisplayName = formatInternalIdAsReadableName(
                      item.name,
                      formatInternalIdAsReadableName(item.itemDefinitionId, '아이템')
                    );
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
                                    ? `${itemDisplayName} 착용 해제`
                                    : `${itemDisplayName} 착용`
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
                                      : `${itemDisplayName} 던지기`
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
                                  ? `${itemDisplayName} 사용`
                                  : '현재 바로 사용할 수 없는 아이템입니다.'
                              }
                              onClick={() =>
                                onUseInventoryItem(
                                  item,
                                  selectedTargetParticipant?.sessionCharacterId ?? null,
                                  selectedTargetParticipant?.sessionEntityId ?? null,
                                  selectedMapSelection?.point ?? null
                                )
                              }
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
                                    : `${itemDisplayName} 던지기`
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
        {isGmView ? (
          <HumanGmAiAssistPanel
            className="combat-gm-ai-assist-panel"
            nodeId={node?.id}
            suggestions={gmAiAssistSuggestions}
            nodeMoveOptions={gmNodeMoveOptions}
            onCreate={onGmAiAssistCreate}
            onGenerate={onGmAiAssistGenerate}
            onAccept={onGmAiAssistAccept}
            isBusy={Boolean(isCombatBusy)}
            isPending={isGmAiAssistPending}
            sceneSummary={node?.sceneText ?? node?.title ?? scenarioTitle}
            recentLogs={recentGmAiAssistLogs}
          />
        ) : null}
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
