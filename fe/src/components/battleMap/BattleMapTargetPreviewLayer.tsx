import { Circle, Group, Line, Rect, Text } from 'react-konva';
import type { VttMapStateDto } from '@trpg/shared-types';
import type { CombatTargetPreview } from '../../features/sessionPlay/presentation/combatEffectTypes';

type VttToken = VttMapStateDto['tokens'][number];

type BattleMapTargetPreviewLayerProps = {
  preview: CombatTargetPreview | null;
  tokens: VttToken[];
  gridSize: number;
};

function centerOf(token: VttToken) {
  return { x: token.x + token.size / 2, y: token.y + token.size / 2 };
}

export function BattleMapTargetPreviewLayer({
  preview,
  tokens,
  gridSize,
}: BattleMapTargetPreviewLayerProps) {
  if (!preview?.point) return null;
  const sourceToken = tokens.find((token) => token.id === preview.sourceTokenId) ?? null;
  if (!sourceToken) return null;
  const source = centerOf(sourceToken);
  const point = preview.point;
  const isValid = preview.validity === 'valid';
  const isInvalid = preview.validity === 'invalid';
  const color = isValid ? '#65E6C4' : isInvalid ? '#FF6B6B' : '#C0CBD6';
  const fill = isValid ? 'rgba(54, 214, 176, 0.16)' : isInvalid ? 'rgba(255, 76, 76, 0.13)' : 'rgba(180, 194, 208, 0.11)';
  const dash = isValid ? [12, 5] : isInvalid ? [5, 5] : [2, 7];
  const pixelPerFoot = gridSize / 5;
  const angle = Math.atan2(point.y - source.y, point.x - source.x);
  const directionLength = Math.hypot(point.x - source.x, point.y - source.y);
  const label = preview.reasonLabel ?? '';
  const labelWidth = Math.max(92, Math.min(210, label.length * 14 + 22));
  let shape: React.ReactNode = null;

  if (preview.shape === 'single') {
    shape = (
      <Group>
        <Line points={[source.x, source.y, point.x, point.y]} stroke={color} strokeWidth={2} dash={dash} opacity={0.78} />
        <Circle x={point.x} y={point.y} radius={11} stroke={color} strokeWidth={3} dash={dash} fill={fill} />
      </Group>
    );
  } else if (preview.shape === 'circle' && preview.geometryKnown) {
    shape = (
      <Group>
        <Line points={[source.x, source.y, point.x, point.y]} stroke={color} strokeWidth={2} dash={[4, 6]} opacity={0.6} />
        <Circle x={point.x} y={point.y} radius={(preview.radiusFt ?? 0) * pixelPerFoot} stroke={color} strokeWidth={3} dash={dash} fill={fill} />
        <Line points={[point.x - 8, point.y, point.x + 8, point.y, point.x, point.y, point.x, point.y - 8, point.x, point.y + 8]} stroke={color} strokeWidth={1.5} />
      </Group>
    );
  } else if (preview.shape === 'cone' && directionLength > 0.001) {
    const length = (preview.lengthFt ?? preview.rangeFt) * pixelPerFoot;
    const halfAngle = ((preview.angleDegrees ?? 90) / 2) * (Math.PI / 180);
    const left = { x: source.x + Math.cos(angle - halfAngle) * length, y: source.y + Math.sin(angle - halfAngle) * length };
    const right = { x: source.x + Math.cos(angle + halfAngle) * length, y: source.y + Math.sin(angle + halfAngle) * length };
    shape = (
      <Group>
        <Line points={[source.x, source.y, left.x, left.y, right.x, right.y]} closed fill={fill} stroke={color} strokeWidth={3} dash={dash} />
        <Line points={[source.x, source.y, source.x + Math.cos(angle) * length, source.y + Math.sin(angle) * length]} stroke={color} strokeWidth={1.5} dash={[3, 7]} opacity={0.72} />
      </Group>
    );
  } else if (preview.shape === 'line' && directionLength > 0.001) {
    const length = (preview.lengthFt ?? preview.rangeFt) * pixelPerFoot;
    const halfWidth = ((preview.widthFt ?? 5) * pixelPerFoot) / 2;
    const end = { x: source.x + Math.cos(angle) * length, y: source.y + Math.sin(angle) * length };
    const normal = { x: -Math.sin(angle) * halfWidth, y: Math.cos(angle) * halfWidth };
    shape = (
      <Group>
        <Line
          points={[
            source.x + normal.x, source.y + normal.y,
            end.x + normal.x, end.y + normal.y,
            end.x - normal.x, end.y - normal.y,
            source.x - normal.x, source.y - normal.y,
          ]}
          closed fill={fill} stroke={color} strokeWidth={3} dash={dash}
        />
        <Line points={[source.x, source.y, end.x, end.y]} stroke={color} strokeWidth={1.5} dash={[5, 8]} opacity={0.7} />
      </Group>
    );
  } else {
    shape = (
      <Group>
        <Circle x={point.x} y={point.y} radius={gridSize * 0.22} fill={fill} stroke={color} strokeWidth={2} dash={dash} />
        <Line points={[point.x - 8, point.y, point.x + 8, point.y]} stroke={color} strokeWidth={2} />
        <Line points={[point.x, point.y - 8, point.x, point.y + 8]} stroke={color} strokeWidth={2} />
      </Group>
    );
  }

  return (
    <Group listening={false}>
      {shape}
      {preview.visibleAffectedTokenIds.flatMap((tokenId) => {
        const token = tokens.find((candidate) => candidate.id === tokenId);
        if (!token) return [];
        const center = centerOf(token);
        return [<Circle key={`${tokenId}:affected`} x={center.x} y={center.y} radius={token.size * 0.58} stroke={color} strokeWidth={4} dash={[8, 4]} shadowColor={color} shadowBlur={8} />];
      })}
      {isInvalid ? (
        <Group>
          <Line points={[point.x - 9, point.y - 9, point.x + 9, point.y + 9]} stroke={color} strokeWidth={3} />
          <Line points={[point.x + 9, point.y - 9, point.x - 9, point.y + 9]} stroke={color} strokeWidth={3} />
        </Group>
      ) : null}
      <Group x={point.x + 14} y={point.y + 14}>
        <Rect width={labelWidth} height={27} fill="rgba(13, 18, 25, 0.9)" stroke={color} strokeWidth={1.5} cornerRadius={7} />
        <Text x={8} y={6} width={labelWidth - 16} text={`${isValid ? '✓' : isInvalid ? '×' : '•'} ${label}`} fill="#F7FAFC" fontSize={13} fontStyle="bold" />
      </Group>
    </Group>
  );
}
