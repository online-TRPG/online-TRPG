import { Circle, Group, Image as KonvaImage, Text } from 'react-konva';
import type { SessionTokenColor } from '../../utils/sessionTokenColors';

interface TokenFrameProps {
  image: HTMLImageElement | null;
  label: string;
  size: number;
  color: SessionTokenColor;
  isSelected: boolean;
  isHidden: boolean;
}

export function TokenFrame({ image, label, size, color, isSelected, isHidden }: TokenFrameProps) {
  const center = size / 2;
  const frameRadius = Math.max(8, center - 4);
  const portraitRadius = Math.max(6, center - 9);
  const frameColor = isHidden ? '#cbd6e2' : color.frame;
  const frameWidth = Math.max(4, Math.round(size * 0.08));

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

      {/* 프레임 색이 항상 보이도록 초상 이미지는 안쪽 원으로만 잘라서 올립니다. */}
      {image ? (
        <Group
          clipFunc={(ctx) => {
            ctx.beginPath();
            ctx.arc(center, center, portraitRadius, 0, Math.PI * 2);
            ctx.closePath();
          }}
        >
          <KonvaImage image={image} width={size} height={size} />
        </Group>
      ) : (
        <Text
          text={label}
          width={size}
          y={center - 9}
          align="center"
          fill={color.text}
          fontSize={18}
          fontStyle="bold"
        />
      )}

      <Circle
        x={center}
        y={center}
        radius={frameRadius}
        fill="rgba(0, 0, 0, 0)"
        stroke={frameColor}
        strokeWidth={frameWidth}
        listening={false}
      />
    </>
  );
}
