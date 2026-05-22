import type { ReactNode } from 'react';

interface BattleMapSubtoolbarProps {
  zoomControls: ReactNode;
  mapSettings?: ReactNode;
  measureControl?: ReactNode;
  tokenSnapControl?: ReactNode;
  fogTools?: ReactNode;
}

export function BattleMapSubtoolbar({
  zoomControls,
  mapSettings,
  measureControl,
  tokenSnapControl,
  fogTools,
}: BattleMapSubtoolbarProps) {
  return (
    <div className="vtt-subtoolbar">
      {zoomControls}
      {mapSettings}
      {measureControl}
      {tokenSnapControl}
      {fogTools}
    </div>
  );
}
