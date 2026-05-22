import { Circle, Group, Layer, Rect, Text } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';

type ObjectCell = NonNullable<VttMapStateDto['objectCells']>[number];
type ObjectShapeCell = NonNullable<ObjectCell['shapeCells']>[number];
type StructureBox = { x: number; y: number; width: number; height: number };
type ObjectHazard = NonNullable<ObjectCell['hazard']>;

interface BattleMapObjectMarkerLayerProps {
  map: Pick<VttMapStateDto, 'gridSize'>;
  detectedHazardCells: ObjectCell[];
  observedObjectCells: ObjectCell[];
  getObjectShapeCells: (cell: ObjectCell) => ObjectShapeCell[];
  getShapeBounds: (shapeCells: ObjectShapeCell[]) => StructureBox;
  getHazardMarkerLabel: (kind: ObjectHazard['kind'] | undefined) => string;
}

export function BattleMapObjectMarkerLayer({
  map,
  detectedHazardCells,
  observedObjectCells,
  getObjectShapeCells,
  getShapeBounds,
  getHazardMarkerLabel,
}: BattleMapObjectMarkerLayerProps) {
  if (!detectedHazardCells.length && !observedObjectCells.length) {
    return null;
  }

  return (
    <>
      {detectedHazardCells.length ? (
        <Layer listening={false}>
          {detectedHazardCells.map((cell) => {
            const shapeCells = getObjectShapeCells(cell);
            const bounds = getShapeBounds(shapeCells);
            const label = getHazardMarkerLabel(cell.hazard?.kind);

            return (
              <Group key={`detected-hazard:${cell.id}`}>
                {shapeCells.map((shapeCell, shapeIndex) => (
                  <Rect
                    key={`${cell.id}:hazard-shape:${shapeIndex}`}
                    x={shapeCell.x}
                    y={shapeCell.y}
                    width={shapeCell.width}
                    height={shapeCell.height}
                    fill="rgba(204, 52, 52, 0.24)"
                    stroke="#ff6b5f"
                    strokeWidth={2}
                    dash={[8, 5]}
                    cornerRadius={Math.min(10, map.gridSize / 8)}
                  />
                ))}
                <Circle
                  x={bounds.x + bounds.width / 2}
                  y={bounds.y + bounds.height / 2}
                  radius={Math.max(14, Math.min(24, map.gridSize * 0.28))}
                  fill="rgba(96, 14, 14, 0.88)"
                  stroke="#ffd1ca"
                  strokeWidth={2}
                />
                <Text
                  x={bounds.x}
                  y={bounds.y + bounds.height / 2 - 8}
                  width={bounds.width}
                  text="!"
                  align="center"
                  fontSize={18}
                  fontStyle="bold"
                  fill="#fff3f0"
                />
                <Text
                  x={bounds.x - map.gridSize * 0.25}
                  y={bounds.y + bounds.height + 4}
                  width={bounds.width + map.gridSize * 0.5}
                  text={label}
                  align="center"
                  fontSize={12}
                  fontStyle="bold"
                  fill="#ffd1ca"
                  stroke="#2f0b0b"
                  strokeWidth={2}
                />
              </Group>
            );
          })}
        </Layer>
      ) : null}

      {observedObjectCells.length ? (
        <Layer listening={false}>
          {observedObjectCells.map((cell) => {
            const shapeCells = getObjectShapeCells(cell);
            const bounds = getShapeBounds(shapeCells);

            return (
              <Group key={`observed-object:${cell.id}`}>
                {shapeCells.map((shapeCell, shapeIndex) => (
                  <Rect
                    key={`${cell.id}:observed-shape:${shapeIndex}`}
                    x={shapeCell.x}
                    y={shapeCell.y}
                    width={shapeCell.width}
                    height={shapeCell.height}
                    fill="rgba(242, 190, 75, 0.18)"
                    stroke="#ffd36a"
                    strokeWidth={2}
                    dash={[7, 5]}
                    cornerRadius={Math.min(10, map.gridSize / 8)}
                  />
                ))}
                <Circle
                  x={bounds.x + bounds.width / 2}
                  y={bounds.y + bounds.height / 2}
                  radius={Math.max(12, Math.min(22, map.gridSize * 0.24))}
                  fill="rgba(97, 62, 9, 0.86)"
                  stroke="#ffe7a6"
                  strokeWidth={2}
                />
                <Text
                  x={bounds.x}
                  y={bounds.y + bounds.height / 2 - 8}
                  width={bounds.width}
                  text="?"
                  align="center"
                  fontSize={18}
                  fontStyle="bold"
                  fill="#fff5d5"
                />
                <Text
                  x={bounds.x - map.gridSize * 0.25}
                  y={bounds.y + bounds.height + 4}
                  width={bounds.width + map.gridSize * 0.5}
                  text="관찰됨"
                  align="center"
                  fontSize={12}
                  fontStyle="bold"
                  fill="#ffe7a6"
                  stroke="#362103"
                  strokeWidth={2}
                />
              </Group>
            );
          })}
        </Layer>
      ) : null}
    </>
  );
}
