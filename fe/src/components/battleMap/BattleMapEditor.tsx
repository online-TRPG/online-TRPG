import { BattleMap } from './BattleMapCore';
import type { BattleMapProps } from './BattleMapCore';

type BattleMapEditorProps = Omit<BattleMapProps, 'interactionMode'>;

export function BattleMapEditor(props: BattleMapEditorProps) {
  return <BattleMap {...props} interactionMode="editor" />;
}
