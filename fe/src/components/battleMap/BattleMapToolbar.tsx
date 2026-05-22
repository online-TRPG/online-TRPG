import type { ReactNode } from 'react';

interface BattleMapToolbarProps {
  title?: string;
  tokenCountLabel: string;
  controls?: ReactNode;
}

export function BattleMapToolbar({ title, tokenCountLabel, controls }: BattleMapToolbarProps) {
  return (
    <div className="vtt-toolbar">
      <div>
        <span className="eyebrow">{title}</span>
        <strong>{tokenCountLabel}</strong>
      </div>
      {controls}
    </div>
  );
}
