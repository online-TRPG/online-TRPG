import { BattleMap } from '../../../components/battleMap/BattleMapCore';
import type { BattleMapSelection } from '../../../components/battleMap/BattleMapCore';
import type {
  SessionCharacterResponseDto,
  ScenarioAssetResponseDto,
  SrdMonsterReferenceDto,
  VttMapStateDto,
} from '@trpg/shared-types';

type CombatMovementMode = 'normal' | 'jump';

type TokenHealthFrame = {
  currentHp: number | null;
  maxHp: number | null;
  armorClass: number | null;
};

interface SessionBattleMapProps {
  map: VttMapStateDto;
  characters: SessionCharacterResponseDto[];
  isHost: boolean;
  currentUserId?: string | null;
  title?: string;
  showPartyTools?: boolean;
  monsterCatalog?: SrdMonsterReferenceDto[];
  monsterCatalogError?: string | null;
  tokenAssets?: ScenarioAssetResponseDto[];
  tokenAssetsLoading?: boolean;
  tokenAssetsError?: string | null;
  uploadTokenAsset?: (file: File | null) => Promise<ScenarioAssetResponseDto | null>;
  clueOptions?: Array<{ id: string; label: string }>;
  itemOptions?: Array<{ id: string; label: string }>;
  enableObjectEventEditing?: boolean;
  isInteractionLocked?: boolean;
  tokenMovementRangeFtByTokenId?: Record<string, number>;
  tokenHealthByTokenId?: Record<string, TokenHealthFrame>;
  attackRangeOverlay?: { tokenId: string; rangeFt: number } | null;
  combatMovementMode?: CombatMovementMode;
  onMapChange: (map: VttMapStateDto) => void;
  onSelectionChange?: (selection: BattleMapSelection | null) => void;
  onTokenMoveRequest?: (
    token: VttMapStateDto['tokens'][number],
    to: { x: number; y: number },
    path: Array<{ x: number; y: number }>,
    movementMode?: CombatMovementMode
  ) => Promise<VttMapStateDto | null>;
  onPingRequest?: (point: { x: number; y: number }, label?: string) => Promise<VttMapStateDto | null>;
}

export type { BattleMapSelection };

export function SessionBattleMap({
  map,
  characters,
  isHost,
  currentUserId,
  title,
  showPartyTools,
  monsterCatalog,
  monsterCatalogError,
  tokenAssets,
  tokenAssetsLoading,
  tokenAssetsError,
  uploadTokenAsset,
  clueOptions,
  itemOptions,
  enableObjectEventEditing,
  isInteractionLocked,
  tokenMovementRangeFtByTokenId,
  tokenHealthByTokenId,
  attackRangeOverlay,
  combatMovementMode,
  onMapChange,
  onSelectionChange,
  onTokenMoveRequest,
  onPingRequest,
}: SessionBattleMapProps) {
  return (
    <BattleMap
      map={map}
      characters={characters}
      isHost={isHost}
      currentUserId={currentUserId}
      title={title}
      interactionMode="session"
      showPartyTools={showPartyTools}
      monsterCatalog={monsterCatalog}
      monsterCatalogError={monsterCatalogError}
      tokenAssets={tokenAssets}
      tokenAssetsLoading={tokenAssetsLoading}
      tokenAssetsError={tokenAssetsError}
      uploadTokenAsset={uploadTokenAsset}
      clueOptions={clueOptions}
      itemOptions={itemOptions}
      enableObjectEventEditing={enableObjectEventEditing}
      isInteractionLocked={isInteractionLocked}
      tokenMovementRangeFtByTokenId={tokenMovementRangeFtByTokenId}
      tokenHealthByTokenId={tokenHealthByTokenId}
      attackRangeOverlay={attackRangeOverlay}
      combatMovementMode={combatMovementMode}
      onChange={onMapChange}
      onSelectionChange={onSelectionChange}
      onTokenMoveRequest={onTokenMoveRequest}
      onPingRequest={onPingRequest}
    />
  );
}
