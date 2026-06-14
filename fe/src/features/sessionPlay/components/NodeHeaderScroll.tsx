import type { CSSProperties, ReactNode } from 'react';
import storyScrollImage from '../../../components/node-header-scroll-blue.webp';
import explorationScrollImage from '../../../components/node-header-scroll-green.webp';
import combatScrollImage from '../../../components/node-header-scroll-red.webp';
import './NodeHeaderScroll.css';

type NodeHeaderScrollVariant = 'story' | 'exploration' | 'combat';

interface NodeHeaderScrollProps {
  variant: NodeHeaderScrollVariant;
  className: string;
  ariaLabel?: string;
  children: ReactNode;
}

const scrollImageByVariant: Record<NodeHeaderScrollVariant, string> = {
  story: storyScrollImage,
  exploration: explorationScrollImage,
  combat: combatScrollImage,
};

export function NodeHeaderScroll({
  variant,
  className,
  ariaLabel,
  children,
}: NodeHeaderScrollProps) {
  const scrollStyle = {
    '--node-header-scroll-image': `url(${scrollImageByVariant[variant]})`,
  } as CSSProperties;

  return (
    <header
      className={`${className} node-header-scroll node-header-scroll--${variant}`}
      style={scrollStyle}
      aria-label={ariaLabel}
    >
      {children}
    </header>
  );
}
