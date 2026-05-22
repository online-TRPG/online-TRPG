import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { SrdMonsterReferenceDto, VttMapStateDto } from '@trpg/shared-types';
import { Icon } from '../Icon';

type MapStructureKind = 'terrain' | 'wall' | 'door' | 'object';
type EditorTool = 'pan' | 'measure' | 'ping' | 'fog' | MapStructureKind;
type FogAction = 'reveal' | 'hide';
type MapSizeField = 'width' | 'height' | 'gridSize';

interface BattleMapEditorToolbarControlsProps {
  showPartyTools: boolean;
  monsterSearch: string;
  selectedMonster: SrdMonsterReferenceDto | null;
  filteredMonsterCatalog: SrdMonsterReferenceDto[];
  monsterCatalogLength: number;
  monsterCatalogError: string | null;
  encounterScaling: VttMapStateDto['encounterScaling'];
  isPanMode: boolean;
  isMeasureMode: boolean;
  isPingMode: boolean;
  isFogMode: boolean;
  mapStructureTool: MapStructureKind | null;
  isFullscreen: boolean;
  labels: {
    syncParty: string;
    monsterSearchPlaceholder: string;
    srdMonster: string;
    unknownCr: string;
    noMonsterOptions: string;
    addMonster: string;
    encounterScaling: string;
    basePartySize: string;
    pan: string;
    measure: string;
    ping: string;
    fog: string;
    terrain: string;
    wall: string;
    door: string;
    object: string;
    hideAll: string;
  };
  onSyncPartyTokens: () => void;
  onMonsterSearchChange: (value: string) => void;
  onSelectedMonsterChange: (monsterId: string) => void;
  onAddHostileToken: () => void;
  onUpdateEncounterScaling: (patch: Partial<NonNullable<VttMapStateDto['encounterScaling']>>) => void;
  onSelectTool: (tool: EditorTool) => void;
  onHideFullMap: () => void;
  onToggleFullscreen: () => void;
  getMonsterDisplayName: (monster: SrdMonsterReferenceDto) => string;
  clamp: (value: number, min: number, max: number) => number;
}

interface BattleMapEditorSubtoolbarControlsProps {
  zoom: number;
  zoomSteps: number[];
  canEditMap: boolean;
  mapSizeDraft: Record<MapSizeField, string>;
  measureStart: boolean;
  isTokenSnapEnabled: boolean;
  isFogMode: boolean;
  fogAction: FogAction;
  isFogSnapEnabled: boolean;
  labels: {
    reset: string;
    width: string;
    height: string;
    grid: string;
    clearMeasure: string;
    tokenSnap: string;
    reveal: string;
    hide: string;
    snap: string;
    hideAll: string;
    revealAll: string;
  };
  onZoomChange: (updater: (value: number) => number) => void;
  onZoomSelect: (value: number) => void;
  onResetView: () => void;
  onMapSizeDraftChange: (field: MapSizeField, value: string) => void;
  onMapSizeFieldCommit: (field: MapSizeField) => void;
  onMapSizeDraftKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement>,
    field: MapSizeField
  ) => void;
  onClearMeasure: () => void;
  onTokenSnapChange: (enabled: boolean) => void;
  onFogActionChange: (action: FogAction) => void;
  onFogSnapChange: (enabled: boolean) => void;
  onHideFullMap: () => void;
  onRevealFullMap: () => void;
}

export function BattleMapEditorToolbarControls({
  showPartyTools,
  monsterSearch,
  selectedMonster,
  filteredMonsterCatalog,
  monsterCatalogLength,
  monsterCatalogError,
  encounterScaling,
  isPanMode,
  isMeasureMode,
  isPingMode,
  isFogMode,
  mapStructureTool,
  isFullscreen,
  labels,
  onSyncPartyTokens,
  onMonsterSearchChange,
  onSelectedMonsterChange,
  onAddHostileToken,
  onUpdateEncounterScaling,
  onSelectTool,
  onHideFullMap,
  onToggleFullscreen,
  getMonsterDisplayName,
  clamp,
}: BattleMapEditorToolbarControlsProps) {
  return (
    <div className="vtt-controls">
      {showPartyTools ? (
        <button type="button" onClick={onSyncPartyTokens}>
          {labels.syncParty}
        </button>
      ) : null}
      <div className="vtt-monster-picker">
        <input
          value={monsterSearch}
          onChange={(event) => onMonsterSearchChange(event.target.value)}
          placeholder={labels.monsterSearchPlaceholder}
        />
        <select
          value={selectedMonster?.id ?? ''}
          onChange={(event) => onSelectedMonsterChange(event.target.value)}
          disabled={monsterCatalogLength === 0}
          title={selectedMonster ? getMonsterDisplayName(selectedMonster) : labels.srdMonster}
        >
          {filteredMonsterCatalog.length ? (
            filteredMonsterCatalog.slice(0, 120).map((monster) => (
              <option key={monster.id} value={monster.id}>
                {getMonsterDisplayName(monster)} ({monster.challengeRaw ?? labels.unknownCr})
              </option>
            ))
          ) : (
            <option value="">{monsterCatalogError ?? labels.noMonsterOptions}</option>
          )}
        </select>
      </div>
      <button type="button" onClick={onAddHostileToken}>
        {labels.addMonster}
      </button>
      <label className="vtt-inline-toggle">
        <input
          type="checkbox"
          checked={encounterScaling?.enabled === true}
          onChange={(event) => onUpdateEncounterScaling({ enabled: event.target.checked })}
        />
        {labels.encounterScaling}
      </label>
      <label className="vtt-compact-field">
        {labels.basePartySize}
        <input
          type="number"
          min={1}
          max={12}
          value={encounterScaling?.basePartySize ?? 4}
          onChange={(event) =>
            onUpdateEncounterScaling({
              basePartySize: clamp(Number(event.target.value), 1, 12),
            })
          }
        />
      </label>
      <button type="button" className={isPanMode ? 'active' : ''} onClick={() => onSelectTool('pan')}>
        {labels.pan}
      </button>
      <button type="button" className={isMeasureMode ? 'active' : ''} onClick={() => onSelectTool('measure')}>
        {labels.measure}
      </button>
      <button type="button" className={isPingMode ? 'active' : ''} onClick={() => onSelectTool('ping')}>
        {labels.ping}
      </button>
      <button type="button" className={isFogMode ? 'active' : ''} onClick={() => onSelectTool('fog')}>
        {labels.fog}
      </button>
      <button
        type="button"
        className={mapStructureTool === 'terrain' ? 'active' : ''}
        onClick={() => onSelectTool('terrain')}
      >
        {labels.terrain}
      </button>
      <button
        type="button"
        className={mapStructureTool === 'wall' ? 'active' : ''}
        onClick={() => onSelectTool('wall')}
      >
        {labels.wall}
      </button>
      <button
        type="button"
        className={mapStructureTool === 'door' ? 'active' : ''}
        onClick={() => onSelectTool('door')}
      >
        {labels.door}
      </button>
      <button
        type="button"
        className={mapStructureTool === 'object' ? 'active' : ''}
        onClick={() => onSelectTool('object')}
      >
        {labels.object}
      </button>
      <button type="button" onClick={onHideFullMap}>
        {labels.hideAll}
      </button>
      <button
        type="button"
        className={`vtt-fullscreen-toggle${isFullscreen ? ' active' : ''}`}
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? '전체화면 종료' : '전체화면'}
        title={isFullscreen ? '전체화면 종료 (Esc)' : '전체화면'}
      >
        <Icon name={isFullscreen ? 'minimize' : 'maximize'} />
      </button>
    </div>
  );
}

export function buildBattleMapEditorSubtoolbarControls({
  zoom,
  zoomSteps,
  canEditMap,
  mapSizeDraft,
  measureStart,
  isTokenSnapEnabled,
  isFogMode,
  fogAction,
  isFogSnapEnabled,
  labels,
  onZoomChange,
  onZoomSelect,
  onResetView,
  onMapSizeDraftChange,
  onMapSizeFieldCommit,
  onMapSizeDraftKeyDown,
  onClearMeasure,
  onTokenSnapChange,
  onFogActionChange,
  onFogSnapChange,
  onHideFullMap,
  onRevealFullMap,
}: BattleMapEditorSubtoolbarControlsProps) {
  return {
    zoomControls: (
      <div className="vtt-zoom-controls">
        <button type="button" onClick={() => onZoomChange((value) => Math.max(0.5, value - 0.25))}>
          -
        </button>
        <select value={zoom} onChange={(event) => onZoomSelect(Number(event.target.value))}>
          {zoomSteps.map((step) => (
            <option key={step} value={step}>
              {Math.round(step * 100)}%
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onZoomChange((value) => Math.min(2, value + 0.25))}>
          +
        </button>
        <button type="button" onClick={onResetView}>
          {labels.reset}
        </button>
      </div>
    ),
    mapSettings: canEditMap ? (
      <div className="vtt-map-settings">
        <label>
          {labels.width}
          <input
            type="number"
            min={320}
            max={4000}
            value={mapSizeDraft.width}
            onChange={(event) => onMapSizeDraftChange('width', event.target.value)}
            onBlur={() => onMapSizeFieldCommit('width')}
            onKeyDown={(event) => onMapSizeDraftKeyDown(event, 'width')}
          />
        </label>
        <label>
          {labels.height}
          <input
            type="number"
            min={240}
            max={4000}
            value={mapSizeDraft.height}
            onChange={(event) => onMapSizeDraftChange('height', event.target.value)}
            onBlur={() => onMapSizeFieldCommit('height')}
            onKeyDown={(event) => onMapSizeDraftKeyDown(event, 'height')}
          />
        </label>
        <label>
          {labels.grid}
          <input
            type="number"
            min={16}
            max={160}
            value={mapSizeDraft.gridSize}
            onChange={(event) => onMapSizeDraftChange('gridSize', event.target.value)}
            onBlur={() => onMapSizeFieldCommit('gridSize')}
            onKeyDown={(event) => onMapSizeDraftKeyDown(event, 'gridSize')}
          />
        </label>
      </div>
    ) : null,
    measureControl: measureStart ? (
      <button type="button" className="vtt-clear-measure" onClick={onClearMeasure}>
        {labels.clearMeasure}
      </button>
    ) : null,
    tokenSnapControl: (
      <label className="vtt-token-snap">
        <input
          type="checkbox"
          checked={isTokenSnapEnabled}
          onChange={(event) => onTokenSnapChange(event.target.checked)}
        />
        {labels.tokenSnap}
      </label>
    ),
    fogTools:
      canEditMap && isFogMode ? (
        <div className="vtt-fog-tools">
          <button
            type="button"
            className={fogAction === 'reveal' ? 'active' : ''}
            onClick={() => onFogActionChange('reveal')}
          >
            {labels.reveal}
          </button>
          <button
            type="button"
            className={fogAction === 'hide' ? 'active' : ''}
            onClick={() => onFogActionChange('hide')}
          >
            {labels.hide}
          </button>
          <label>
            <input
              type="checkbox"
              checked={isFogSnapEnabled}
              onChange={(event) => onFogSnapChange(event.target.checked)}
            />
            {labels.snap}
          </label>
          <button type="button" onClick={onHideFullMap}>
            {labels.hideAll}
          </button>
          <button type="button" onClick={onRevealFullMap}>
            {labels.revealAll}
          </button>
        </div>
      ) : null,
  };
}
