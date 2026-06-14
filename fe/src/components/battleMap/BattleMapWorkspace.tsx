import type { ReactNode } from 'react';

interface BattleMapWorkspaceProps {
  hasInspector: boolean;
  children: ReactNode;
}

export function BattleMapWorkspace({ hasInspector, children }: BattleMapWorkspaceProps) {
  return <div className={`vtt-workspace${hasInspector ? ' with-inspector' : ''}`}>{children}</div>;
}
