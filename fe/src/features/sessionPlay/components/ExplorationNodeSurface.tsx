import { useEffect, useMemo, useState } from 'react';
import {
  type AiHumanGmAssistSuggestionRequestDto,
  type InventoryItemDto,
  type ItemResponseDto,
  type CreateHumanGmAiAssistSuggestionDto,
  type HumanGmAiAssistSuggestionDto,
  type PlayerScenarioNodeDto,
  type RestActionDto,
  type SessionCharacterResponseDto,
  type VttMapInteractionDto,
  type VttMapInteractionResponseDto,
  type VttMapStateDto,
} from '@trpg/shared-types';
import {
  HUMAN_GM_INVENTORY_QUANTITY_MAX,
  HUMAN_GM_INVENTORY_QUANTITY_MIN,
  HUMAN_GM_MESSAGE_CONTENT_MAX_LENGTH,
  HUMAN_GM_PRIVATE_NOTE_MAX_LENGTH,
  VTT_DOOR_STATES,
  VTT_MAP_INTERACTION_KINDS,
} from '@trpg/shared-types/frontend';
import type { CSSProperties } from 'react';
import { SessionBattleMap } from './SessionBattleMap';
import type { BattleMapSelection } from './SessionBattleMap';
import { GameIcon } from '../../../components/GameIcon';
import explorationNodeBadge from '../../../components/node_badge_exploration.webp';
import { getCharacterClassLabel } from '../utils/characterVisuals';
import { getUserFacingItemName, getUserFacingItemTypeLabel } from '../utils/displayNames';
import { CharacterDetailModal } from './CharacterDetailModal';
import { InventoryEquipmentStatus } from './InventoryEquipmentStatus';
import { InventoryItemInfo } from './InventoryItemInfo';
import { HumanGmAiAssistPanel } from './HumanGmAiAssistPanel';
import { MapPartyOverlay } from './MapPartyOverlay';
import { NodeHeaderScroll } from './NodeHeaderScroll';
import { useExplorationNodeSurfacePresentation } from '../hooks/useExplorationNodeSurfacePresentation';
import type { InventoryItemWithEquipmentDisplayState } from '../hooks/useInventoryItemActions';
import {
  getContextActions,
  hasObjectEvents,
  type ExplorationActionButton,
  type ExplorationLocalAction,
  type ExplorationMainCommandRequest,
} from '../utils/explorationActionModel';
import {
  getDoorStateLabel,
  getGmMapSummary,
  getGmSelectionDetails,
  getSelectionDisplay,
} from '../utils/explorationSelectionPresentation';
import { findReachableTokenMove } from '../utils/explorationMapGeometry';
import {
  getMapObjectItemPayload,
  getSelectionGridPoint,
  isSameMapSelection,
} from '../utils/explorationMapObjectModel';
import { getExplorationActorStatusModel } from '../utils/explorationActorStatusModel';
import {
  appendPingToMap,
  disarmSelectedObjectHazard,
  markSelectedObjectBroken,
  moveTokenOnMap,
  revealAllFog,
  revealFogAroundPoint,
  toggleSelectedObjectVisible,
  toggleSelectedTokenHidden,
  updateSelectedDoorState,
} from '../utils/explorationMapMutation';
import {
  getCatalogItemSearchKey,
  getInventoryItemIconName,
  isArmorInventoryItem,
  isEquippedInventoryItem,
  isQuickUsableInventoryItem,
  isShieldInventoryItem,
  isWeaponInventoryItem,
} from '../utils/inventoryItemModel';
import './ExplorationNodeSurface.css';

export type { ExplorationMainCommandRequest } from '../utils/explorationActionModel';

export type ExplorationNodeMoveOption = {
  nodeId: string;
  title: string;
  nodeType: string;
  label?: string | null;
  condition?: string | null;
  note?: string | null;
  isFallback?: boolean;
};

type ExplorationGmMapAction =
  | 'toggle_token_hidden'
  | 'toggle_object_visible'
  | 'reveal_fog_at_selection'
  | 'reveal_all_fog'
  | typeof VTT_MAP_INTERACTION_KINDS.TRIGGER_OBJECT;

function readClampedInteger(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return Math.min(Math.max(fallback, min), max);
  }
  return Math.min(Math.max(parsed, min), max);
}

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
  onEquipInventoryItem?: (item: InventoryItemWithEquipmentDisplayState) => void;
  onDropInventoryItem?: (item: InventoryItemDto, point: { x: number; y: number }) => void | Promise<void>;
  onPickupMapObject?: (
    objectId: string,
    itemDefinitionId: string,
    quantity: number,
    point: { x: number; y: number }
  ) => void | Promise<void>;
  onSelectInventoryItem?: (item: InventoryItemDto | null) => void;
  onMapSelectionChange?: (selection: BattleMapSelection | null) => void;
  onRequestMainCommand?: (request: ExplorationMainCommandRequest) => void;
  onRequestRest?: (
    restType: RestActionDto['restType'],
    characterId?: string,
    hitDiceToSpend?: number,
  ) => Promise<void> | void;
  gmNodeMoveOptions?: ExplorationNodeMoveOption[];
  onGmNodeMove?: (nodeId: string) => Promise<void> | void;
  onGmMessage?: (payload: {
    content: string;
    speakerName?: string | null;
    asNpc?: boolean;
    privateNote?: string | null;
  }) => Promise<void> | void;
  isGmMessagePending?: boolean;
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
  onDropInventoryItem,
  onPickupMapObject,
  onSelectInventoryItem,
  onMapSelectionChange,
  onRequestMainCommand,
  onRequestRest,
  gmNodeMoveOptions = [],
  onGmNodeMove,
  onGmMessage,
  isGmMessagePending = false,
  gmAiAssistSuggestions = [],
  onGmAiAssistCreate,
  onGmAiAssistGenerate,
  onGmAiAssistAccept,
  isGmAiAssistPending = false,
  recentGmAiAssistLogs = [],
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
  const [gmMessageContent, setGmMessageContent] = useState('');
  const [gmMessageSpeaker, setGmMessageSpeaker] = useState('');
  const [gmMessagePrivateNote, setGmMessagePrivateNote] = useState('');
  const [isGmNpcMessage, setGmNpcMessage] = useState(false);
  const [shortRestHitDiceToSpend, setShortRestHitDiceToSpend] = useState(0);
  const explorationPresentation = useExplorationNodeSurfacePresentation({
    nodeTitle: node?.title,
    scenarioTitle,
    phase,
    isGmView,
    isGmPanelCollapsed,
    isGmNpcMessage,
    isGmMessagePending,
    isInventoryExpanded,
    isGmInventoryGrantPending,
  });
  const selectedMapCharacter =
    characters.find((character) => character.id === selectedMapCharacterId) ?? null;
  const {
    myCharacter,
    displayedCharacter,
    displayedInventory,
    canUseDisplayedInventory,
    gmSelectedNonCharacterToken,
    selectedMapToken,
    shouldShowActorAndInventory,
    actorHpMeterStyle,
    actorMovementMeterStyle,
    selectedTokenGridLabel,
    selectedTokenTypeLabel,
    displayedConditionLabel,
    restTargetCharacterId,
    restHitDiceMaximum,
    clampedShortRestHitDiceToSpend,
    controlledToken,
  } = getExplorationActorStatusModel({
    characters,
    currentUserId,
    inventory,
    isGmView,
    map,
    selection: mapSelection,
    shortRestHitDiceToSpend,
  });
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
  const selectedMapGridPoint = getSelectionGridPoint(mapSelection, map);
  const selectedObjectItemPayload = getMapObjectItemPayload(mapSelection, map);
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
    if (shortRestHitDiceToSpend > restHitDiceMaximum) {
      setShortRestHitDiceToSpend(restHitDiceMaximum);
    }
  }, [restHitDiceMaximum, shortRestHitDiceToSpend]);

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

    const quantity = Math.min(
      HUMAN_GM_INVENTORY_QUANTITY_MAX,
      Math.max(HUMAN_GM_INVENTORY_QUANTITY_MIN, Math.trunc(gmItemQuantity || HUMAN_GM_INVENTORY_QUANTITY_MIN))
    );
    await onGmGrantInventoryItem(displayedCharacter.id, selectedGmCatalogItem, quantity);
    setGmItemPickerOpen(false);
    setGmItemQuery('');
    setGmItemQuantity(1);
    setSelectedGmCatalogItemId('');
  }

  async function handleGmMessageSubmit() {
    const content = gmMessageContent.trim();
    if (!content || !onGmMessage || isGmMessagePending) {
      return;
    }

    await onGmMessage({
      content,
      speakerName: gmMessageSpeaker.trim() || null,
      asNpc: isGmNpcMessage,
      privateNote: gmMessagePrivateNote.trim() || null,
    });
    setGmMessageContent('');
    setGmMessagePrivateNote('');
  }

  async function handleLocalMapAction(action: ExplorationLocalAction) {
    if (!mapSelection) {
      setMapActionFeedback(explorationPresentation.localSelectionRequiredFeedback);
      return;
    }
    if (!map) {
      setMapActionFeedback(explorationPresentation.gmMapNotReadyFeedback);
      return;
    }

    if (action === 'ping') {
      if (onPingRequest) {
        const savedMap = await onPingRequest(mapSelection.point, '!');
        setMapActionFeedback(
          savedMap
            ? explorationPresentation.localPingSuccessFeedback
            : explorationPresentation.localPingFailureFeedback
        );
        return;
      }
      onMapChange(appendPingToMap(map, mapSelection.point, '!'));
      setMapActionFeedback(explorationPresentation.localPingSuccessFeedback);
      return;
    }

    if (isGmView && mapSelection.kind === 'door' && action === 'unlock_door') {
      onMapChange(updateSelectedDoorState(map, mapSelection, VTT_DOOR_STATES.CLOSED));
      setMapActionFeedback(explorationPresentation.localDoorUnlockedFeedback);
      return;
    }

    if (
      isGmView &&
      mapSelection.kind === 'door' &&
      (action === VTT_MAP_INTERACTION_KINDS.OPEN_DOOR ||
        action === VTT_MAP_INTERACTION_KINDS.CLOSE_DOOR ||
        action === VTT_MAP_INTERACTION_KINDS.BREAK_DOOR)
    ) {
      const nextState =
        action === VTT_MAP_INTERACTION_KINDS.OPEN_DOOR
          ? VTT_DOOR_STATES.OPEN
          : action === VTT_MAP_INTERACTION_KINDS.BREAK_DOOR
            ? VTT_DOOR_STATES.BROKEN
            : VTT_DOOR_STATES.CLOSED;
      onMapChange(updateSelectedDoorState(map, mapSelection, nextState));
      setMapActionFeedback(
        explorationPresentation.localDoorStateChangedFeedback(getDoorStateLabel(nextState))
      );
      return;
    }

    if (isGmView && mapSelection.kind === 'object' && action === VTT_MAP_INTERACTION_KINDS.DISARM_HAZARD) {
      onMapChange(disarmSelectedObjectHazard(map, mapSelection));
      setMapActionFeedback(explorationPresentation.localHazardDisarmedFeedback);
      return;
    }

    if (isGmView && mapSelection.kind === 'object' && action === VTT_MAP_INTERACTION_KINDS.BREAK_OBJECT) {
      onMapChange(markSelectedObjectBroken(map, mapSelection));
      setMapActionFeedback(explorationPresentation.localObjectBrokenFeedback);
      return;
    }

    if (
      isGmView &&
      (mapSelection.kind === 'door' || mapSelection.kind === 'object') &&
      action === VTT_MAP_INTERACTION_KINDS.INVESTIGATE_OBJECT
    ) {
      setMapActionFeedback(explorationPresentation.localGmInspectWithoutCheckFeedback);
      return;
    }

    if (
      action === VTT_MAP_INTERACTION_KINDS.OPEN_DOOR ||
      action === VTT_MAP_INTERACTION_KINDS.CLOSE_DOOR ||
      action === VTT_MAP_INTERACTION_KINDS.BREAK_DOOR ||
      action === VTT_MAP_INTERACTION_KINDS.BREAK_OBJECT ||
      action === VTT_MAP_INTERACTION_KINDS.INVESTIGATE_OBJECT ||
      action === VTT_MAP_INTERACTION_KINDS.DISARM_HAZARD
    ) {
      if (!onMapInteractionRequest) {
        setMapActionFeedback(explorationPresentation.gmMapInteractionUnavailableFeedback);
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
      setMapActionFeedback(
        response?.message ?? explorationPresentation.localMapInteractionFailureFeedback
      );
      return;
    }

    if (!controlledToken) {
      setMapActionFeedback(explorationPresentation.localControlledTokenMissingFeedback);
      return;
    }

    const nextPosition = findReachableTokenMove(map, controlledToken, mapSelection.tile);
    if (!nextPosition) {
      setMapActionFeedback(explorationPresentation.localPathUnavailableFeedback);
      return;
    }

    if (onTokenMoveRequest) {
      const savedMap = await onTokenMoveRequest(controlledToken, nextPosition, [
        { x: controlledToken.x, y: controlledToken.y },
        nextPosition,
      ]);
      setMapActionFeedback(
        savedMap
          ? explorationPresentation.localTokenMoveSuccessFeedback(controlledToken.name)
          : explorationPresentation.localTokenMoveFailureFeedback(controlledToken.name)
      );
      return;
    }

    onMapChange(moveTokenOnMap(map, controlledToken.id, nextPosition));
    setMapActionFeedback(
      explorationPresentation.localTokenMoveSuccessFeedback(controlledToken.name)
    );
  }

  async function handleGmMapAction(action: ExplorationGmMapAction) {
    if (!isGmView) return;
    if (!map) {
      setMapActionFeedback(explorationPresentation.gmMapNotReadyFeedback);
      return;
    }

    if (action === 'reveal_all_fog') {
      onMapChange(revealAllFog(map));
      setMapActionFeedback(explorationPresentation.gmRevealAllFogFeedback);
      return;
    }

    if (!mapSelection) {
      setMapActionFeedback(explorationPresentation.gmSelectionRequiredFeedback);
      return;
    }

    if (action === 'reveal_fog_at_selection') {
      onMapChange(revealFogAroundPoint(map, mapSelection.point));
      setMapActionFeedback(explorationPresentation.gmRevealFogAtSelectionFeedback);
      return;
    }

    if (mapSelection.kind === 'token' && action === 'toggle_token_hidden') {
      onMapChange(toggleSelectedTokenHidden(map, mapSelection));
      setMapActionFeedback(
        mapSelection.token.hidden
          ? explorationPresentation.gmTokenVisibleFeedback
          : explorationPresentation.gmTokenHiddenFeedback
      );
      return;
    }

    if (mapSelection.kind === 'object' && action === 'toggle_object_visible') {
      onMapChange(toggleSelectedObjectVisible(map, mapSelection));
      setMapActionFeedback(
        'visibleToPlayers' in mapSelection.cell && mapSelection.cell.visibleToPlayers === false
          ? explorationPresentation.gmObjectVisibleFeedback
          : explorationPresentation.gmObjectHiddenFeedback
      );
      return;
    }

    if (mapSelection.kind === 'object' && action === VTT_MAP_INTERACTION_KINDS.TRIGGER_OBJECT) {
      if (!hasObjectEvents(mapSelection)) {
        setMapActionFeedback(explorationPresentation.gmObjectEventMissingFeedback);
        return;
      }
      if (!onMapInteractionRequest) {
        setMapActionFeedback(explorationPresentation.gmMapInteractionUnavailableFeedback);
        return;
      }
      const response = await onMapInteractionRequest({
        kind: VTT_MAP_INTERACTION_KINDS.TRIGGER_OBJECT,
        targetId: mapSelection.cell.id,
        mapPoint: {
          x: Math.round(mapSelection.point.x),
          y: Math.round(mapSelection.point.y),
        },
        actorSessionCharacterId: null,
      });
      setMapActionFeedback(response?.message ?? explorationPresentation.gmObjectEventFailureFeedback);
      return;
    }

    setMapActionFeedback(explorationPresentation.gmUnsupportedActionFeedback);
  }

  return (
    <div className="exploration-node-surface">
      <NodeHeaderScroll variant="exploration" className="exploration-node-header">
        <div className="exploration-node-title-row">
          <img
            src={explorationNodeBadge}
            alt={explorationPresentation.nodeBadgeAlt}
            className="session-node-type-badge"
          />
          <h1 className="node-header-scroll-title">{explorationPresentation.titleText}</h1>
        </div>

        <div
          className="exploration-node-status-row"
          aria-label={explorationPresentation.statusRowAriaLabel}
        >
          <span>{explorationPresentation.phaseLabel}</span>
          <span>{explorationPresentation.viewModeLabel}</span>
        </div>
      </NodeHeaderScroll>

      <div
        className={`exploration-node-content${isGmView ? ' gm-view' : ''}${
          isGmView && isGmPanelCollapsed ? ' gm-panel-collapsed' : ''
        }`}
      >
        <main className="exploration-map-column">
          <section
            className="exploration-map-panel"
            aria-label={explorationPresentation.mapPanelAriaLabel}
          >
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
                title={explorationPresentation.mapTitle}
              />
            ) : (
              <div className="exploration-map-placeholder">
                <span>{explorationPresentation.mapPlaceholderEyebrow}</span>
                <strong>{explorationPresentation.mapPlaceholderTitle}</strong>
              </div>
            )}
          </section>
          <section
            className="exploration-selection-strip"
            aria-label={explorationPresentation.selectionStripAriaLabel}
          >
            <span>
              {explorationPresentation.selectionTargetLabel}: <strong>{selectionDisplay.target}</strong>
            </span>
            <span>
              {explorationPresentation.selectionStatusLabel}:{' '}
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
            aria-label={explorationPresentation.gmPanelAriaLabel}
          >
            <button
              type="button"
              className="exploration-gm-panel-toggle"
              aria-label={explorationPresentation.gmPanelToggleLabel}
              aria-expanded={!isGmPanelCollapsed}
              title={explorationPresentation.gmPanelToggleLabel}
              onClick={() => setGmPanelCollapsed((current) => !current)}
            >
              <span className="exploration-gm-panel-toggle-arrow" aria-hidden="true" />
            </button>
            <div className="exploration-gm-panel-body" aria-hidden={isGmPanelCollapsed}>
              <div className="exploration-gm-card">
                <span className="exploration-node-eyebrow">
                  {explorationPresentation.gmMapStatusEyebrow}
                </span>
                <div className="exploration-gm-metrics">
                  <span>
                    {explorationPresentation.gmHiddenTokensLabel}{' '}
                    <strong>{gmMapSummary.hiddenTokens}</strong>
                  </span>
                  <span>
                    {explorationPresentation.gmHiddenObjectsLabel}{' '}
                    <strong>{gmMapSummary.hiddenObjects}</strong>
                  </span>
                  <span>
                    {explorationPresentation.gmHazardsLabel}{' '}
                    <strong>{gmMapSummary.hazards}</strong>
                  </span>
                  <span>
                    {explorationPresentation.gmLockedDoorsLabel}{' '}
                    <strong>{gmMapSummary.lockedDoors}</strong>
                  </span>
                  <span>
                    {explorationPresentation.gmFogRectsLabel}{' '}
                    <strong>{gmMapSummary.fogRects}</strong>
                  </span>
                </div>
              </div>

              <div className="exploration-gm-card">
                <span className="exploration-node-eyebrow">
                  {explorationPresentation.gmSelectionInspectorEyebrow}
                </span>
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

              <div className="exploration-gm-card exploration-gm-message">
                <span className="exploration-node-eyebrow">
                  {explorationPresentation.gmMessageEyebrow}
                </span>
                <label className="exploration-gm-message-mode">
                  <input
                    type="checkbox"
                    checked={isGmNpcMessage}
                    onChange={(event) => setGmNpcMessage(event.target.checked)}
                  />
                  {explorationPresentation.gmNpcMessageLabel}
                </label>
                {isGmNpcMessage ? (
                  <input
                    className="exploration-gm-input"
                    value={gmMessageSpeaker}
                    placeholder={explorationPresentation.gmSpeakerPlaceholder}
                    onChange={(event) => setGmMessageSpeaker(event.target.value)}
                  />
                ) : null}
                <textarea
                  className="exploration-gm-textarea"
                  value={gmMessageContent}
                  placeholder={explorationPresentation.gmMessagePlaceholder}
                  rows={3}
                  maxLength={HUMAN_GM_MESSAGE_CONTENT_MAX_LENGTH}
                  onChange={(event) => setGmMessageContent(event.target.value)}
                />
                <input
                  className="exploration-gm-input"
                  value={gmMessagePrivateNote}
                  placeholder={explorationPresentation.gmPrivateNotePlaceholder}
                  maxLength={HUMAN_GM_PRIVATE_NOTE_MAX_LENGTH}
                  onChange={(event) => setGmMessagePrivateNote(event.target.value)}
                />
                <button
                  type="button"
                  disabled={isBusy || isGmMessagePending || !onGmMessage || !gmMessageContent.trim()}
                  onClick={() => void handleGmMessageSubmit()}
                >
                  {explorationPresentation.gmSubmitLabel}
                </button>
              </div>

              <div className="exploration-gm-card exploration-gm-controls">
                <span className="exploration-node-eyebrow">
                  {explorationPresentation.gmControlsEyebrow}
                </span>
                <div className="exploration-gm-button-grid">
                  <button
                    type="button"
                    disabled={isBusy || mapSelection?.kind !== 'token'}
                    onClick={() => void handleGmMapAction('toggle_token_hidden')}
                  >
                    {explorationPresentation.gmToggleTokenHiddenLabel}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || mapSelection?.kind !== 'object'}
                    onClick={() => void handleGmMapAction('toggle_object_visible')}
                  >
                    {explorationPresentation.gmToggleObjectVisibleLabel}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !hasObjectEvents(mapSelection)}
                    onClick={() => void handleGmMapAction(VTT_MAP_INTERACTION_KINDS.TRIGGER_OBJECT)}
                  >
                    {explorationPresentation.gmTriggerObjectLabel}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !mapSelection || !map?.fogRects.length}
                    onClick={() => void handleGmMapAction('reveal_fog_at_selection')}
                  >
                    {explorationPresentation.gmRevealFogAtSelectionLabel}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !map?.fogRects.length}
                    onClick={() => void handleGmMapAction('reveal_all_fog')}
                  >
                    {explorationPresentation.gmRevealAllFogLabel}
                  </button>
                </div>
              </div>

              <div className="exploration-gm-card exploration-gm-node-move">
                <span className="exploration-node-eyebrow">
                  {explorationPresentation.gmNodeMoveEyebrow}
                </span>
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
                          {option.isFallback ? explorationPresentation.gmDefaultMoveSuffix : ''}
                          {option.nodeType ? ` · ${option.nodeType}` : ''}
                        </span>
                        {option.condition ? <small>{option.condition}</small> : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="exploration-gm-empty-text">
                    {explorationPresentation.gmNodeMoveEmptyText}
                  </p>
                )}
              </div>

              <HumanGmAiAssistPanel
                className="exploration-gm-card exploration-gm-ai-assist"
                nodeId={node?.id}
                suggestions={gmAiAssistSuggestions}
                nodeMoveOptions={gmNodeMoveOptions}
                onCreate={onGmAiAssistCreate}
                onGenerate={onGmAiAssistGenerate}
                onAccept={onGmAiAssistAccept}
                isBusy={isBusy}
                isPending={isGmAiAssistPending}
                sceneSummary={node?.sceneText ?? node?.title ?? scenarioTitle}
                recentLogs={recentGmAiAssistLogs}
              />
            </div>
          </aside>
        ) : null}
      </div>

      <section
        className={`exploration-action-dock${shouldShowActorAndInventory ? '' : ' action-only'}`}
        aria-label={explorationPresentation.actionDockAriaLabel}
      >
        {shouldShowActorAndInventory ? (
          <div className="exploration-actor-status">
            <span className="exploration-frame-corner top-left" aria-hidden="true" />
            <span className="exploration-frame-corner top-right" aria-hidden="true" />
            <span className="exploration-frame-corner bottom-left" aria-hidden="true" />
            <span className="exploration-frame-corner bottom-right" aria-hidden="true" />
            <span className="exploration-node-eyebrow">
              {explorationPresentation.actorEyebrow}
            </span>
            <strong>
              {displayedCharacter?.name ??
                (gmSelectedNonCharacterToken
                  ? gmSelectedNonCharacterToken.name
                  : explorationPresentation.actorFallbackName)}
            </strong>
            {displayedCharacter ? (
              <>
                <div
                  className="exploration-actor-stat-grid"
                  aria-label={explorationPresentation.characterStatsAriaLabel}
                >
                  <span>
                    {explorationPresentation.classLabel}{' '}
                    <strong>{getCharacterClassLabel(displayedCharacter.className)}</strong>
                  </span>
                  <span>
                    {explorationPresentation.levelLabel} <strong>{displayedCharacter.level}</strong>
                  </span>
                  <span>
                    {explorationPresentation.armorClassLabel}{' '}
                    <strong>{displayedCharacter.armorClass}</strong>
                  </span>
                  <span>
                    {explorationPresentation.conditionLabel}{' '}
                    <strong>{displayedConditionLabel}</strong>
                  </span>
                </div>
                <div className="exploration-resource-meter-grid">
                  <div className="exploration-resource-meter hp" style={actorHpMeterStyle}>
                    <div className="exploration-resource-meter-label">
                      <span>{explorationPresentation.hpLabel}</span>
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
                      <span>{explorationPresentation.movementLabel}</span>
                      <strong>{displayedCharacter.speed}ft</strong>
                    </div>
                    <span className="exploration-resource-meter-track" aria-hidden="true">
                      <span className="exploration-resource-meter-fill" />
                    </span>
                  </div>
                </div>
                {selectedTokenGridLabel ? (
                  <p className="exploration-actor-token-note">
                    {explorationPresentation.tokenCoordinateLabel} {selectedTokenGridLabel}
                    {selectedMapToken?.hidden
                      ? ` · ${explorationPresentation.tokenHiddenLabel}`
                      : ` · ${explorationPresentation.tokenVisibleLabel}`}
                  </p>
                ) : null}
              </>
            ) : gmSelectedNonCharacterToken ? (
              <>
                <div
                  className="exploration-actor-stat-grid"
                  aria-label={explorationPresentation.tokenStatsAriaLabel}
                >
                  <span>
                    {explorationPresentation.tokenTypeLabel}{' '}
                    <strong>{selectedTokenTypeLabel}</strong>
                  </span>
                  <span>
                    {explorationPresentation.tokenSizeLabel}{' '}
                    <strong>{gmSelectedNonCharacterToken.size}</strong>
                  </span>
                  <span>
                    {explorationPresentation.tokenGridLabel}{' '}
                    <strong>{selectedTokenGridLabel ?? '-'}</strong>
                  </span>
                  <span>
                    {explorationPresentation.tokenVisibilityLabel}{' '}
                    <strong>
                      {gmSelectedNonCharacterToken.hidden
                        ? explorationPresentation.tokenHiddenValueLabel
                        : explorationPresentation.tokenVisibleValueLabel}
                    </strong>
                  </span>
                </div>
                <p className="exploration-actor-token-note">
                  {explorationPresentation.nonCharacterTokenInventoryNote}
                </p>
              </>
            ) : (
              <p>{explorationPresentation.noActorInstructionText}</p>
            )}
          </div>
        ) : null}

        <div className="exploration-action-panel">
          <span className="exploration-frame-corner top-left" aria-hidden="true" />
          <span className="exploration-frame-corner top-right" aria-hidden="true" />
          <span className="exploration-frame-corner bottom-left" aria-hidden="true" />
          <span className="exploration-frame-corner bottom-right" aria-hidden="true" />
          <span className="exploration-node-eyebrow">
            {explorationPresentation.actionPanelEyebrow}
          </span>
          <div className="exploration-action-list">
            {onRequestRest ? (
              <>
                <button
                  type="button"
                  className="exploration-action-button has-action-icon"
                  disabled={isBusy || !restTargetCharacterId}
                  onClick={() =>
                    void onRequestRest(
                      'short',
                      restTargetCharacterId,
                      clampedShortRestHitDiceToSpend,
                    )
                  }
                >
                  <GameIcon
                    name="game-icons:campfire"
                    size={36}
                    className="exploration-action-button-icon"
                  />
                  <span className="exploration-action-button-label">
                    {explorationPresentation.shortRestLabel}
                  </span>
                </button>
                <label className="exploration-hit-dice-control">
                  <span>HD {restHitDiceMaximum}</span>
                  <input
                    type="number"
                    min={0}
                    max={restHitDiceMaximum}
                    step={1}
                    value={clampedShortRestHitDiceToSpend}
                    disabled={isBusy || !restTargetCharacterId}
                    aria-label={explorationPresentation.shortRestHitDiceAriaLabel}
                    onChange={(event) =>
                      setShortRestHitDiceToSpend((current) =>
                        readClampedInteger(event.target.value, current, 0, restHitDiceMaximum),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="exploration-action-button has-action-icon"
                  disabled={isBusy || !restTargetCharacterId}
                  onClick={() => void onRequestRest('long', restTargetCharacterId)}
                >
                  <GameIcon
                    name="game-icons:bed"
                    size={36}
                    className="exploration-action-button-icon"
                  />
                  <span className="exploration-action-button-label">
                    {explorationPresentation.longRestLabel}
                  </span>
                </button>
              </>
            ) : null}
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
            {selectedObjectItemPayload ? (
              <button
                type="button"
                className="exploration-action-button has-action-icon"
                disabled={isBusy || isGmView || !onPickupMapObject || !canUseDisplayedInventory}
                title={
                  isGmView
                    ? explorationPresentation.gmObjectPickupReadonlyTitle
                    : explorationPresentation.mapObjectPickupTitle(selectionDisplay.target)
                }
                onClick={() =>
                  void onPickupMapObject?.(
                    selectedObjectItemPayload.objectId,
                    selectedObjectItemPayload.itemDefinitionId,
                    1,
                    selectedObjectItemPayload.point
                  )
                }
              >
                <GameIcon
                  name="game-icons:hand"
                  size={36}
                  className="exploration-action-button-icon"
                />
                <span className="exploration-action-button-label">
                  {explorationPresentation.mapObjectPickupLabel}
                </span>
              </button>
            ) : null}
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
                <span className="exploration-node-eyebrow">
                  {explorationPresentation.inventoryEyebrow}
                </span>
                <div className="exploration-inventory-head-actions">
                  {isGmView && displayedCharacter && onGmGrantInventoryItem ? (
                    <button
                      type="button"
                      className="exploration-gm-inventory-grant-button"
                      disabled={isBusy || isGmInventoryGrantPending}
                      title={explorationPresentation.grantInventoryTitle(displayedCharacter.name)}
                      onClick={() => setGmItemPickerOpen(true)}
                    >
                      {explorationPresentation.grantInventoryLabel}
                    </button>
                  ) : null}
                  {displayedInventory.length ? (
                    <button
                      type="button"
                      className="exploration-inventory-toggle"
                      aria-expanded={isInventoryExpanded}
                      aria-controls="exploration-inventory-list"
                      title={explorationPresentation.inventoryToggleTitle}
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
                <span>{explorationPresentation.inventoryItemsHeading}</span>
              </div>
              {displayedInventory.length ? (
                <div
                  id="exploration-inventory-list"
                  className={`exploration-inventory-list${isInventoryExpanded ? ' expanded' : ''}`}
                >
                  {displayedInventory.flatMap((item) => {
                  const isWeapon = isWeaponInventoryItem(item);
                  const isShield = isShieldInventoryItem(item);
                  const equippedCount = isWeapon || isShield
                    ? Number(isEquippedInventoryItem(item, displayedCharacter?.equippedWeaponId)) +
                      Number(isEquippedInventoryItem(item, displayedCharacter?.offhandWeaponId))
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
                  const canUse = isQuickUsableInventoryItem(item);
                  const isSelected = selectedInventoryItemId === item.id;
                  const isWeapon = isWeaponInventoryItem(item);
                  const isArmor = isArmorInventoryItem(item);
                  const isShield = isShieldInventoryItem(item);
                  const isEquipped = isWeapon
                    ? equipmentDisplayState === 'equipped'
                    : isShield
                      ? equipmentDisplayState === 'equipped'
                      : isArmor;
                  const equipmentActionItem: InventoryItemWithEquipmentDisplayState = {
                    ...item,
                    __equipmentDisplayState: equipmentDisplayState,
                  };
                  const itemDisplayName = getUserFacingItemName(item);
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
                        <>
                          <button
                            type="button"
                            disabled={isArmor || isBusy || !onEquipInventoryItem || !canUseDisplayedInventory}
                            title={
                              !canUseDisplayedInventory
                                ? explorationPresentation.inventoryReadonlyTitle
                                : isArmor
                                  ? explorationPresentation.armorAppliedTitle
                                  : isEquipped
                                    ? explorationPresentation.unequipItemTitle(itemDisplayName)
                                    : explorationPresentation.equipItemTitle(itemDisplayName)
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              onEquipInventoryItem?.(equipmentActionItem);
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            {isEquipped
                              ? explorationPresentation.unequipLabel
                              : explorationPresentation.equipLabel}
                          </button>
                          <button
                            type="button"
                            disabled={
                              isBusy ||
                              !canUseDisplayedInventory ||
                              !onDropInventoryItem ||
                              !selectedMapGridPoint ||
                              equipmentDisplayState === 'equipped'
                            }
                            title={
                              equipmentDisplayState === 'equipped'
                                ? explorationPresentation.equippedDropBlockedTitle
                                : !selectedMapGridPoint
                                  ? explorationPresentation.dropTileRequiredTitle
                                  : explorationPresentation.dropItemTitle(itemDisplayName)
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (selectedMapGridPoint) {
                                void onDropInventoryItem?.(item, selectedMapGridPoint);
                              }
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            {explorationPresentation.dropItemLabel}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!canUse || isBusy || !canUseDisplayedInventory}
                            title={
                              !canUseDisplayedInventory
                                ? explorationPresentation.inventoryReadonlyTitle
                                : canUse
                                  ? explorationPresentation.useItemTitle(itemDisplayName)
                                  : explorationPresentation.unusableItemTitle
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              onUseInventoryItem(item);
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            {explorationPresentation.useItemLabel}
                          </button>
                          <button
                            type="button"
                            disabled={
                              isBusy ||
                              !canUseDisplayedInventory ||
                              !onDropInventoryItem ||
                              !selectedMapGridPoint
                            }
                            title={
                              !selectedMapGridPoint
                                ? explorationPresentation.dropTileRequiredTitle
                                : explorationPresentation.dropItemTitle(itemDisplayName)
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (selectedMapGridPoint) {
                                void onDropInventoryItem?.(item, selectedMapGridPoint);
                              }
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            {explorationPresentation.dropItemLabel}
                          </button>
                        </>
                      )}
                    </article>
                  );
                  })}
                </div>
              ) : (
                <p>{explorationPresentation.inventoryEmptyText}</p>
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
                <span className="exploration-node-eyebrow">
                  {explorationPresentation.gmItemPickerEyebrow}
                </span>
                <h3 id="exploration-gm-item-picker-title">{displayedCharacter.name}</h3>
              </div>
              <button
                type="button"
                className="exploration-gm-item-picker-close"
                title={explorationPresentation.gmItemPickerCloseTitle}
                onClick={() => setGmItemPickerOpen(false)}
              >
                ×
              </button>
            </div>
            <label className="exploration-gm-item-picker-search">
              <span>{explorationPresentation.gmItemSearchLabel}</span>
              <input
                value={gmItemQuery}
                onChange={(event) => {
                  setGmItemQuery(event.target.value);
                  setSelectedGmCatalogItemId('');
                }}
                placeholder={explorationPresentation.gmItemSearchPlaceholder}
              />
            </label>
            <div className="exploration-gm-item-picker-list">
              {isGmItemCatalogLoading ? (
                <p>{explorationPresentation.gmItemLoadingText}</p>
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
                    <span>{getUserFacingItemTypeLabel(item.category)}</span>
                  </button>
                ))
              ) : (
                <p>{explorationPresentation.gmItemEmptyText}</p>
              )}
            </div>
            <div className="exploration-gm-item-picker-footer">
              <label>
                <span>{explorationPresentation.gmItemQuantityLabel}</span>
                <input
                  type="number"
                  min={HUMAN_GM_INVENTORY_QUANTITY_MIN}
                  max={HUMAN_GM_INVENTORY_QUANTITY_MAX}
                  value={gmItemQuantity}
                  onChange={(event) =>
                    setGmItemQuantity((current) =>
                      readClampedInteger(
                        event.target.value,
                        current,
                        HUMAN_GM_INVENTORY_QUANTITY_MIN,
                        HUMAN_GM_INVENTORY_QUANTITY_MAX,
                      )
                    )
                  }
                />
              </label>
              <button
                type="button"
                disabled={!selectedGmCatalogItem || isGmInventoryGrantPending}
                onClick={() => void handleGmInventoryGrant()}
              >
                {explorationPresentation.gmItemGrantSubmitLabel}
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
