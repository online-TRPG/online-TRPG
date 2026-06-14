import { Arc, Circle, Group, Image as KonvaImage, Text } from 'react-konva';
import type { SessionTokenColor } from '../../utils/sessionTokenColors';

export type TokenHealthFrame = {
  currentHp: number | null;
  maxHp: number | null;
  isAlive?: boolean;
};

interface TokenFrameProps {
  image: HTMLImageElement | null;
  label: string;
  size: number;
  color: SessionTokenColor;
  isSelected: boolean;
  isHidden: boolean;
  health?: TokenHealthFrame;
}

function getHealthRatio(health: TokenHealthFrame | undefined) {
  if (!health || health.currentHp === null || health.maxHp === null || health.maxHp <= 0) {
    return null;
  }
  return Math.max(0, Math.min(1, health.currentHp / health.maxHp));
}

export function TokenFrame({ image, label, size, color, isSelected, isHidden, health }: TokenFrameProps) {
  const center = size / 2;
  const frameRadius = Math.max(8, center - 4);
  const frameColor = isHidden ? '#cbd6e2' : color.frame;
  const frameWidth = Math.max(4, Math.round(size * 0.08));
  const portraitRadius = Math.max(6, frameRadius - frameWidth / 2);
  const portraitSize = portraitRadius * 2;
  const labelFontSize = Math.max(10, Math.min(18, Math.round(size * 0.3)));
  const imageWidth = image?.naturalWidth || image?.width || 1;
  const imageHeight = image?.naturalHeight || image?.height || 1;
  const coverScale = image ? Math.max(portraitSize / imageWidth, portraitSize / imageHeight) : 1;
  const coverWidth = imageWidth * coverScale;
  const coverHeight = imageHeight * coverScale;
  const coverX = center - coverWidth / 2;
  const coverY = center - coverHeight / 2;
  const healthRatio = getHealthRatio(health);
  const hasHealthFrame = healthRatio !== null;
  const isDefeated = hasHealthFrame && (healthRatio <= 0 || health?.isAlive === false);
  const depletedAngle = hasHealthFrame ? (1 - healthRatio) * 360 : 0;
  const depletedFrameColor = isDefeated ? '#4b463f' : '#686159';
  const portraitToneOverlay = isDefeated ? 'rgba(7, 7, 7, 0.48)' : null;

  return (
    <>
      {isSelected ? (
        <Circle
          x={center}
          y={center}
          radius={frameRadius + 5}
          fill="rgba(255, 248, 221, 0.16)"
          stroke="#fff8dd"
          strokeWidth={3}
          shadowColor="#ffe7a3"
          shadowBlur={12}
          shadowOpacity={0.45}
          listening={false}
        />
      ) : null}

      <Circle
        x={center}
        y={center}
        radius={frameRadius}
        fill={color.background}
        stroke={frameColor}
        strokeWidth={frameWidth}
        shadowColor="black"
        shadowBlur={14}
        shadowOpacity={0.35}
      />

      {/* 원본 비율을 유지하면서 프레임 안쪽 끝까지 채워, 이미지 주변에 밝은 선이 남지 않게 합니다. */}
      {image ? (
        <Group
          clipFunc={(ctx) => {
            ctx.beginPath();
            ctx.arc(center, center, portraitRadius, 0, Math.PI * 2);
            ctx.closePath();
          }}
        >
          <KonvaImage
            image={image}
            x={coverX}
            y={coverY}
            width={coverWidth}
            height={coverHeight}
            opacity={isDefeated ? 0.58 : 1}
          />
          {portraitToneOverlay ? (
            <Circle
              x={center}
              y={center}
              radius={portraitRadius}
              fill={portraitToneOverlay}
              listening={false}
            />
          ) : null}
        </Group>
      ) : (
        <Text
          text={label}
          width={size}
          y={center - labelFontSize / 2}
          align="center"
          fill={isDefeated ? '#8f887d' : color.text}
          fontSize={labelFontSize}
          fontStyle="bold"
        />
      )}

      {hasHealthFrame ? (
        <>
          <Circle
            x={center}
            y={center}
            radius={frameRadius}
            fill="rgba(0, 0, 0, 0)"
            stroke={isDefeated ? depletedFrameColor : frameColor}
            strokeWidth={frameWidth}
            listening={false}
          />
          {depletedAngle > 0 && !isDefeated ? (
            <Arc
              x={center}
              y={center}
              innerRadius={Math.max(1, frameRadius - frameWidth / 2)}
              outerRadius={frameRadius + frameWidth / 2}
              angle={depletedAngle}
              rotation={-90}
              fill={depletedFrameColor}
              listening={false}
            />
          ) : null}
        </>
      ) : (
        <Circle
          x={center}
          y={center}
          radius={frameRadius}
          fill="rgba(0, 0, 0, 0)"
          stroke={frameColor}
          strokeWidth={frameWidth}
          listening={false}
        />
      )}
    </>
  );
}
