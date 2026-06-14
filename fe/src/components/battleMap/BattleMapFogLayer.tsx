import { Layer, Rect } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';

type FogRect = VttMapStateDto['fogRects'][number];
type FogAction = 'reveal' | 'hide';
type FogBox = Pick<FogRect, 'x' | 'y' | 'width' | 'height'>;

interface BattleMapFogLayerProps {
  fogRects: FogRect[];
  selectedFogId: string | null;
  fogDraft: FogBox | null;
  fogAction: FogAction;
  isInteractive: boolean;
  isGmPreview?: boolean;
  onSelectFog: (fogId: string) => void;
}

export function BattleMapFogLayer({
  fogRects,
  selectedFogId,
  fogDraft,
  fogAction,
  isInteractive,
  isGmPreview = false,
  onSelectFog,
}: BattleMapFogLayerProps) {
  return (
    <Layer listening={isInteractive}>
      {fogRects.map((rect) => (
        <Rect
          key={rect.id}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={rect.id === selectedFogId ? '#18283a' : '#03060a'}
          opacity={isGmPreview ? (rect.id === selectedFogId ? 0.34 : 0.22) : rect.id === selectedFogId ? 0.9 : 0.82}
          stroke={rect.id === selectedFogId ? '#79d8ff' : undefined}
          strokeWidth={rect.id === selectedFogId ? 2 : 0}
          onClick={(event) => {
            event.cancelBubble = true;
            onSelectFog(rect.id);
          }}
        />
      ))}
      {fogDraft ? (
        <Rect
          x={fogDraft.x}
          y={fogDraft.y}
          width={fogDraft.width}
          height={fogDraft.height}
          fill={fogAction === 'reveal' ? 'rgba(121, 216, 255, 0.16)' : 'rgba(255, 214, 102, 0.18)'}
          stroke={fogAction === 'reveal' ? '#79d8ff' : '#ffd666'}
          strokeWidth={2}
          dash={[10, 7]}
          listening={false}
        />
      ) : null}
    </Layer>
  );
}
