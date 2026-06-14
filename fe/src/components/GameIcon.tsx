import { Icon as IconifyIcon } from '@iconify/react';
import type { CSSProperties } from 'react';

const gameIconAliases = {
  inventory: 'game-icons:swap-bag',
} as const;

export type GameIconName = keyof typeof gameIconAliases | `game-icons:${string}`;

type GameIconProps = {
  name: GameIconName;
  size?: number | string;
  className?: string;
  title?: string;
  style?: CSSProperties;
};

export function GameIcon({
  name,
  size = 20,
  className,
  title,
  style,
}: GameIconProps) {
  // 버튼별 아이콘 교체가 쉬워지도록, 자주 쓰는 RPG 아이콘은 짧은 별칭으로 한 번 더 감쌉니다.
  const icon = name in gameIconAliases ? gameIconAliases[name as keyof typeof gameIconAliases] : name;
  const accessibilityProps = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': true };

  return (
    <IconifyIcon
      icon={icon}
      width={size}
      height={size}
      className={className}
      style={style}
      {...accessibilityProps}
    />
  );
}
