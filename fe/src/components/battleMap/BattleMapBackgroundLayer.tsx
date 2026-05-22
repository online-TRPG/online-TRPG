import { Image as KonvaImage, Layer, Line, Rect } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';

export type BattleMapGridLine = {
  isMajor: boolean;
  points: number[];
  key: string;
};

interface BattleMapBackgroundLayerProps {
  map: Pick<VttMapStateDto, 'width' | 'height'>;
  mapImage: HTMLImageElement | null;
  gridLines: BattleMapGridLine[];
}

export function BattleMapBackgroundLayer({
  map,
  mapImage,
  gridLines,
}: BattleMapBackgroundLayerProps) {
  return (
    <Layer>
      <Rect name="map-background" width={map.width} height={map.height} fill="#121925" />
      {mapImage ? (
        <KonvaImage
          name="map-background"
          image={mapImage}
          width={map.width}
          height={map.height}
          opacity={0.82}
        />
      ) : (
        <>
          <Rect
            name="map-background"
            x={80}
            y={96}
            width={420}
            height={180}
            fill="#26384b"
            opacity={0.55}
            cornerRadius={18}
          />
          <Rect
            name="map-background"
            x={620}
            y={340}
            width={440}
            height={210}
            fill="#233928"
            opacity={0.48}
            cornerRadius={18}
          />
          <Line
            name="map-background"
            points={[120, 660, 420, 480, 720, 520, 1100, 260]}
            stroke="#58718f"
            strokeWidth={28}
            opacity={0.28}
            tension={0.35}
          />
        </>
      )}
      {gridLines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          stroke={line.isMajor ? 'rgba(235, 244, 255, 0.54)' : 'rgba(222, 233, 245, 0.44)'}
          strokeWidth={line.isMajor ? 1.35 : 1}
          listening={false}
        />
      ))}
    </Layer>
  );
}
