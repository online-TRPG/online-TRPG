import type { CSSProperties } from 'react';
import type {
  InventoryItemDto,
  SessionCharacterResponseDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import type { BattleMapSelection } from '../components/SessionBattleMap';

function getResourceFillPercent(
  current: number | null | undefined,
  max: number | null | undefined
) {
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
}

function getResourceMeterStyle(current: number | null | undefined, max: number | null | undefined) {
  return {
    '--exploration-resource-fill': `${getResourceFillPercent(current, max)}%`,
  } as CSSProperties;
}

export function getExplorationActorStatusModel({
  characters,
  currentUserId,
  inventory,
  isGmView,
  map,
  selection,
  shortRestHitDiceToSpend,
}: {
  characters: SessionCharacterResponseDto[];
  currentUserId: string;
  inventory: InventoryItemDto[];
  isGmView: boolean;
  map: VttMapStateDto | null;
  selection: BattleMapSelection | null;
  shortRestHitDiceToSpend: number;
}) {
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const selectedTokenCharacter =
    selection?.kind === 'token' && selection.token.sessionCharacterId
      ? (characters.find((character) => character.id === selection.token.sessionCharacterId) ?? null)
      : null;
  const displayedCharacter = isGmView ? selectedTokenCharacter : myCharacter;
  const displayedInventory = isGmView ? (displayedCharacter?.inventory ?? []) : inventory;
  const canUseDisplayedInventory = !isGmView || displayedCharacter?.id === myCharacter?.id;
  const gmSelectedNonCharacterToken =
    isGmView && selection?.kind === 'token' && !selectedTokenCharacter ? selection.token : null;
  const selectedMapToken = selection?.kind === 'token' ? selection.token : null;
  const shouldShowActorAndInventory = !isGmView || selection?.kind === 'token';
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
  const restTargetCharacterId = displayedCharacter?.id;
  const restHitDiceMaximum = Math.max(
    displayedCharacter?.hitDiceRemaining ?? displayedCharacter?.level ?? 0,
    0
  );
  const clampedShortRestHitDiceToSpend = Math.min(
    Math.max(shortRestHitDiceToSpend, 0),
    restHitDiceMaximum
  );
  const controlledToken =
    map && myCharacter
      ? (map.tokens.find((token) => token.sessionCharacterId === myCharacter.id) ?? null)
      : null;

  return {
    myCharacter,
    displayedCharacter,
    displayedInventory,
    canUseDisplayedInventory,
    gmSelectedNonCharacterToken,
    selectedMapToken,
    shouldShowActorAndInventory,
    actorHpMeterStyle: getResourceMeterStyle(
      displayedCharacter?.currentHp,
      displayedCharacter?.maxHp
    ),
    actorMovementMeterStyle: getResourceMeterStyle(
      displayedCharacter?.speed,
      displayedCharacter?.speed
    ),
    selectedTokenGridLabel,
    selectedTokenTypeLabel,
    displayedConditionLabel,
    restTargetCharacterId,
    restHitDiceMaximum,
    clampedShortRestHitDiceToSpend,
    controlledToken,
  };
}
