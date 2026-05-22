import type { VttMapStateDto } from '@trpg/shared-types';

type MapStructureKind = 'terrain' | 'wall' | 'door' | 'object';
type TerrainCell = NonNullable<VttMapStateDto['terrainCells']>[number];
type WallCell = NonNullable<VttMapStateDto['wallCells']>[number];
type DoorCell = NonNullable<VttMapStateDto['doorCells']>[number];
type ObjectCell = NonNullable<VttMapStateDto['objectCells']>[number];
type StructureCell = TerrainCell | WallCell | DoorCell | ObjectCell;
type ObjectEvent = NonNullable<ObjectCell['events']>[number];
type ObjectHazard = NonNullable<ObjectCell['hazard']>;
type ObjectRevealCheck = NonNullable<ObjectCell['revealChecks']>[number];

interface BattleMapStructureInspectorProps {
  kind: MapStructureKind;
  cell: StructureCell;
  clueOptions: Array<{ id: string; label: string }>;
  itemOptions: Array<{ id: string; label: string }>;
  enableObjectEventEditing: boolean;
  labels: {
    mapFeature: string;
    terrain: string;
    wall: string;
    door: string;
    object: string;
    close: string;
    name: string;
    description: string;
    width: string;
    height: string;
    doorState: string;
    keyItem: string;
    canBreak: string;
    breakDc: string;
    visibleToPlayers: string;
    linkedClues: string;
    linkedItems: string;
    hazard: string;
    hazardEnabled: string;
    hazardKind: string;
    hazardTrap: string;
    hazardAmbush: string;
    hazardGeneric: string;
    hazardRadius: string;
    hazardDc: string;
    hazardLinkedClues: string;
    hazardTriggerOnce: string;
    hazardResetState: string;
    fogRevealEvent: string;
    eventName: string;
    triggerDistance: string;
    revealRadius: string;
    triggerOnce: string;
    addFogEvent: string;
    removeEvent: string;
    deleteFeature: string;
  };
  onClose: () => void;
  onUpdate: (kind: MapStructureKind, cellId: string, patch: Partial<StructureCell>) => void;
  onDelete: (kind: MapStructureKind, cellId: string) => void;
  onUpdateObjectRevealChecks: (contentIds: string[]) => void;
  onPatchObjectRevealCheck: (contentId: string, patch: Partial<ObjectRevealCheck>) => void;
  onSetObjectHazardEnabled: (enabled: boolean) => void;
  onUpdateObjectHazard: (patch: Partial<ObjectHazard>) => void;
  onResetObjectHazardState: () => void;
  onAddObjectFogRevealEvent: () => void;
  onUpdateObjectEvent: (eventId: string, updater: (event: ObjectEvent) => ObjectEvent) => void;
  onDeleteObjectEvent: (eventId: string) => void;
}

const objectRevealAbilityOptions = [
  { value: 'int', label: '지능' },
  { value: 'wis', label: '지혜' },
  { value: 'dex', label: '민첩' },
  { value: 'str', label: '근력' },
] as const;

const objectRevealSkillOptions = [
  { value: 'investigation', label: '조사' },
  { value: 'perception', label: '감지' },
  { value: 'insight', label: '통찰' },
  { value: 'sleight_of_hand', label: '손재주' },
  { value: 'athletics', label: '운동' },
  { value: 'acrobatics', label: '곡예' },
] as const;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function BattleMapStructureInspector({
  kind,
  cell,
  clueOptions,
  itemOptions,
  enableObjectEventEditing,
  labels,
  onClose,
  onUpdate,
  onDelete,
  onUpdateObjectRevealChecks,
  onPatchObjectRevealCheck,
  onSetObjectHazardEnabled,
  onUpdateObjectHazard,
  onResetObjectHazardState,
  onAddObjectFogRevealEvent,
  onUpdateObjectEvent,
  onDeleteObjectEvent,
}: BattleMapStructureInspectorProps) {
  const doorCell = kind === 'door' ? (cell as DoorCell) : null;
  const objectCell = kind === 'object' ? (cell as ObjectCell) : null;

  return (
    <aside className="vtt-inspector">
      <div className="vtt-inspector-head">
        <span className="eyebrow">
          {labels.mapFeature} / {labels[kind]}
        </span>
        <button type="button" onClick={onClose}>
          {labels.close}
        </button>
      </div>
      <label>
        {labels.name}
        <input value={cell.name ?? ''} onChange={(event) => onUpdate(kind, cell.id, { name: event.target.value || null })} />
      </label>
      <label>
        {labels.description}
        <input
          value={cell.description ?? ''}
          onChange={(event) => onUpdate(kind, cell.id, { description: event.target.value || null })}
        />
      </label>
      <div className="vtt-field-row">
        <label>
          X
          <input type="number" value={cell.x} onChange={(event) => onUpdate(kind, cell.id, { x: Number(event.target.value) })} />
        </label>
        <label>
          Y
          <input type="number" value={cell.y} onChange={(event) => onUpdate(kind, cell.id, { y: Number(event.target.value) })} />
        </label>
      </div>
      <div className="vtt-field-row">
        <label>
          {labels.width}
          <input
            type="number"
            value={cell.width}
            onChange={(event) => onUpdate(kind, cell.id, { width: Number(event.target.value) })}
          />
        </label>
        <label>
          {labels.height}
          <input
            type="number"
            value={cell.height}
            onChange={(event) => onUpdate(kind, cell.id, { height: Number(event.target.value) })}
          />
        </label>
      </div>

      {doorCell ? (
        <>
          <label>
            {labels.doorState}
            <select
              value={doorCell.state}
              onChange={(event) =>
                onUpdate(kind, cell.id, {
                  state: event.target.value as DoorCell['state'],
                })
              }
            >
              <option value="open">열림</option>
              <option value="closed">닫힘</option>
              <option value="locked">잠김</option>
              <option value="broken">파괴됨</option>
            </select>
          </label>
          <label>
            {labels.keyItem}
            <input
              value={doorCell.keyItemId ?? ''}
              onChange={(event) => onUpdate(kind, cell.id, { keyItemId: event.target.value || null })}
            />
          </label>
          <div className="vtt-check-row">
            <label>
              <input
                type="checkbox"
                checked={doorCell.canBreak === true}
                onChange={(event) => onUpdate(kind, cell.id, { canBreak: event.target.checked })}
              />
              {labels.canBreak}
            </label>
          </div>
          <label>
            {labels.breakDc}
            <input
              type="number"
              min={1}
              max={40}
              value={doorCell.breakCheckDc ?? ''}
              onChange={(event) =>
                onUpdate(kind, cell.id, {
                  breakCheckDc: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </label>
        </>
      ) : null}

      {objectCell ? (
        <>
          <div className="vtt-check-row">
            <label>
              <input
                type="checkbox"
                checked={objectCell.visibleToPlayers !== false}
                onChange={(event) => onUpdate(kind, cell.id, { visibleToPlayers: event.target.checked })}
              />
              {labels.visibleToPlayers}
            </label>
          </div>
          <label>
            {labels.linkedClues}
            <select
              multiple
              size={Math.min(Math.max(clueOptions.length, 3), 8)}
              value={objectCell.hiddenClueIds ?? []}
              onChange={(event) =>
                onUpdateObjectRevealChecks(
                  Array.from(event.target.selectedOptions, (option) => option.value).slice(0, 30)
                )
              }
            >
              {clueOptions.length ? (
                clueOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))
              ) : (
                <option disabled>선택 가능한 단서 없음</option>
              )}
            </select>
          </label>
          {(objectCell.hiddenClueIds ?? []).length ? (
            <div className="vtt-object-events">
              <span className="eyebrow">단서 조사 판정 조건</span>
              {(objectCell.hiddenClueIds ?? []).map((contentId) => {
                const clueLabel = clueOptions.find((option) => option.id === contentId)?.label ?? contentId;
                const revealCheck =
                  objectCell.revealChecks?.find((check) => check.contentId === contentId) ?? {
                    contentId,
                    requiresCheck: true,
                    ability: 'int',
                    skill: 'investigation',
                    dc: 15,
                  };
                const requiresCheck = revealCheck.requiresCheck !== false;

                return (
                  <div className="vtt-field-row" key={`reveal-check:${contentId}`}>
                    <label className="vtt-check-row">
                      <input
                        type="checkbox"
                        checked={!requiresCheck}
                        onChange={(event) =>
                          onPatchObjectRevealCheck(contentId, {
                            requiresCheck: !event.target.checked,
                          })
                        }
                      />
                      판정 필요 없음
                    </label>
                    <label>
                      {clueLabel}
                      <select
                        value={revealCheck.ability ?? 'int'}
                        disabled={!requiresCheck}
                        onChange={(event) =>
                          onPatchObjectRevealCheck(contentId, { ability: event.target.value })
                        }
                      >
                        {objectRevealAbilityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      기술
                      <select
                        value={revealCheck.skill ?? 'investigation'}
                        disabled={!requiresCheck}
                        onChange={(event) =>
                          onPatchObjectRevealCheck(contentId, { skill: event.target.value })
                        }
                      >
                        {objectRevealSkillOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      DC
                      <input
                        type="number"
                        min={1}
                        max={40}
                        value={revealCheck.dc ?? 15}
                        disabled={!requiresCheck}
                        onChange={(event) =>
                          onPatchObjectRevealCheck(contentId, {
                            dc: clamp(Number(event.target.value) || 15, 1, 40),
                          })
                        }
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          ) : null}
          <label>
            {labels.linkedItems}
            <select
              multiple
              size={Math.min(Math.max(itemOptions.length, 3), 8)}
              value={objectCell.hiddenItemIds ?? []}
              onChange={(event) =>
                onUpdate(kind, cell.id, {
                  hiddenItemIds: Array.from(event.target.selectedOptions, (option) => option.value).slice(0, 30),
                } as Partial<ObjectCell>)
              }
            >
              {itemOptions.length ? (
                itemOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))
              ) : (
                <option disabled>선택 가능한 아이템 없음</option>
              )}
            </select>
          </label>
          <div className="vtt-object-events">
            <span className="eyebrow">{labels.hazard}</span>
            <div className="vtt-check-row">
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(objectCell.hazard)}
                  onChange={(event) => onSetObjectHazardEnabled(event.target.checked)}
                />
                {labels.hazardEnabled}
              </label>
            </div>
            {objectCell.hazard ? (
              <>
                <label>
                  {labels.hazardKind}
                  <select
                    value={objectCell.hazard.kind ?? 'TRAP'}
                    onChange={(event) =>
                      onUpdateObjectHazard({
                        kind: event.target.value as ObjectHazard['kind'],
                      })
                    }
                  >
                    <option value="TRAP">{labels.hazardTrap}</option>
                    <option value="AMBUSH">{labels.hazardAmbush}</option>
                    <option value="HAZARD">{labels.hazardGeneric}</option>
                  </select>
                </label>
                <div className="vtt-field-row">
                  <label>
                    {labels.hazardRadius}
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={objectCell.hazard.detectionRadiusCells ?? 3}
                      onChange={(event) =>
                        onUpdateObjectHazard({
                          detectionRadiusCells: clamp(Number(event.target.value) || 3, 1, 20),
                        })
                      }
                    />
                  </label>
                  <label>
                    {labels.hazardDc}
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={objectCell.hazard.detectionDc ?? 12}
                      onChange={(event) =>
                        onUpdateObjectHazard({
                          detectionDc: clamp(Number(event.target.value) || 12, 1, 40),
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  {labels.hazardLinkedClues}
                  <select
                    multiple
                    size={Math.min(Math.max(clueOptions.length, 3), 8)}
                    value={objectCell.hazard.linkedClueIds ?? []}
                    onChange={(event) =>
                      onUpdateObjectHazard({
                        linkedClueIds: Array.from(event.target.selectedOptions, (option) => option.value).slice(
                          0,
                          30
                        ),
                      })
                    }
                  >
                    {clueOptions.length ? (
                      clueOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))
                    ) : (
                      <option disabled>선택 가능한 단서 없음</option>
                    )}
                  </select>
                </label>
                <div className="vtt-check-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={objectCell.hazard.triggerOnce !== false}
                      onChange={(event) => onUpdateObjectHazard({ triggerOnce: event.target.checked })}
                    />
                    {labels.hazardTriggerOnce}
                  </label>
                </div>
                <button type="button" className="ghost small" onClick={onResetObjectHazardState}>
                  {labels.hazardResetState}
                </button>
              </>
            ) : null}
          </div>
          {enableObjectEventEditing ? (
            <div className="vtt-object-events">
              <span className="eyebrow">{labels.fogRevealEvent}</span>
              {(objectCell.events ?? []).map((event) => (
                <div className="vtt-object-event" key={event.id}>
                  <label>
                    {labels.eventName}
                    <input
                      value={event.name ?? ''}
                      onChange={(changeEvent) =>
                        onUpdateObjectEvent(event.id, (current) => ({
                          ...current,
                          name: changeEvent.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="vtt-field-row">
                    <label>
                      {labels.triggerDistance}
                      <input
                        type="number"
                        min={0}
                        value={event.trigger?.distanceFeet ?? 15}
                        onChange={(changeEvent) =>
                          onUpdateObjectEvent(event.id, (current) => ({
                            ...current,
                            trigger: {
                              ...current.trigger,
                              distanceFeet: clamp(Number(changeEvent.target.value) || 0, 0, 500),
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      {labels.revealRadius}
                      <input
                        type="number"
                        min={5}
                        value={event.effect?.revealRadiusFeet ?? 30}
                        onChange={(changeEvent) =>
                          onUpdateObjectEvent(event.id, (current) => ({
                            ...current,
                            effect: {
                              ...current.effect,
                              revealRadiusFeet: clamp(Number(changeEvent.target.value) || 5, 5, 500),
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="vtt-check-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={event.trigger?.once !== false}
                        onChange={(changeEvent) =>
                          onUpdateObjectEvent(event.id, (current) => ({
                            ...current,
                            trigger: { ...current.trigger, once: changeEvent.target.checked },
                          }))
                        }
                      />
                      {labels.triggerOnce}
                    </label>
                  </div>
                  <button type="button" className="ghost small" onClick={() => onDeleteObjectEvent(event.id)}>
                    {labels.removeEvent}
                  </button>
                </div>
              ))}
              <button type="button" className="small" onClick={onAddObjectFogRevealEvent}>
                {labels.addFogEvent}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <button type="button" className="danger" onClick={() => onDelete(kind, cell.id)}>
        {labels.deleteFeature}
      </button>
    </aside>
  );
}
