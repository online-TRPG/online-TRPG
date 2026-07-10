import type { VttMapStateDto } from '@trpg/shared-types';

type FogRect = VttMapStateDto['fogRects'][number];

interface BattleMapFogInspectorProps {
  fog: FogRect;
  labels: {
    fogLabel: string;
    close: string;
    width: string;
    height: string;
    deleteFog: string;
  };
  onClose: () => void;
  onUpdate: (fogId: string, patch: Partial<FogRect>) => void;
  onDelete: (fogId: string) => void;
}

function readFiniteNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readPositiveNumber(value: string, fallback: number): number {
  return Math.max(1, readFiniteNumber(value, fallback));
}

export function BattleMapFogInspector({
  fog,
  labels,
  onClose,
  onUpdate,
  onDelete,
}: BattleMapFogInspectorProps) {
  return (
    <aside className="vtt-inspector">
      <div className="vtt-inspector-head">
        <span className="eyebrow">{labels.fogLabel}</span>
        <button type="button" onClick={onClose}>
          {labels.close}
        </button>
      </div>
      <div className="vtt-field-row">
        <label>
          X
          <input type="number" value={fog.x} onChange={(event) => onUpdate(fog.id, { x: readFiniteNumber(event.target.value, fog.x) })} />
        </label>
        <label>
          Y
          <input type="number" value={fog.y} onChange={(event) => onUpdate(fog.id, { y: readFiniteNumber(event.target.value, fog.y) })} />
        </label>
      </div>
      <div className="vtt-field-row">
        <label>
          {labels.width}
          <input
            type="number"
            value={fog.width}
            onChange={(event) => onUpdate(fog.id, { width: readPositiveNumber(event.target.value, fog.width) })}
          />
        </label>
        <label>
          {labels.height}
          <input
            type="number"
            value={fog.height}
            onChange={(event) => onUpdate(fog.id, { height: readPositiveNumber(event.target.value, fog.height) })}
          />
        </label>
      </div>
      <button type="button" className="danger" onClick={() => onDelete(fog.id)}>
        {labels.deleteFog}
      </button>
    </aside>
  );
}
