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
          <input type="number" value={fog.x} onChange={(event) => onUpdate(fog.id, { x: Number(event.target.value) })} />
        </label>
        <label>
          Y
          <input type="number" value={fog.y} onChange={(event) => onUpdate(fog.id, { y: Number(event.target.value) })} />
        </label>
      </div>
      <div className="vtt-field-row">
        <label>
          {labels.width}
          <input
            type="number"
            value={fog.width}
            onChange={(event) => onUpdate(fog.id, { width: Number(event.target.value) })}
          />
        </label>
        <label>
          {labels.height}
          <input
            type="number"
            value={fog.height}
            onChange={(event) => onUpdate(fog.id, { height: Number(event.target.value) })}
          />
        </label>
      </div>
      <button type="button" className="danger" onClick={() => onDelete(fog.id)}>
        {labels.deleteFog}
      </button>
    </aside>
  );
}
