import type { VttMapStateDto } from '@trpg/shared-types';
import { BattleToken } from './BattleToken';
import type { TokenHealthFrame } from './TokenFrame';
import type { Character } from '../../types/session';
import type { SessionTokenColor } from '../../utils/sessionTokenColors';

type VttToken = VttMapStateDto['tokens'][number];

interface BattleMapTokenLayerProps {
  tokens: VttToken[];
  characters: Character[];
  selectedTokenId: string | null;
  isFogMode: boolean;
  isPanMode: boolean;
  isMeasureMode: boolean;
  isPingMode: boolean;
  tokenHealthByTokenId?: Record<string, TokenHealthFrame>;
  getTokenColor: (token: VttToken, characters: Character[]) => SessionTokenColor;
  canControlToken: (token: VttToken) => boolean;
  onSelectToken: (token: VttToken) => void;
  onTokenDragStart: (token: VttToken) => void;
  onTokenDragMove: (token: VttToken, x: number, y: number, shiftKey: boolean) => void;
  onTokenDragEnd: (token: VttToken, x: number, y: number, shiftKey: boolean) => boolean | Promise<boolean>;
}

export function BattleMapTokenLayer({
  tokens,
  characters,
  selectedTokenId,
  isFogMode,
  isPanMode,
  isMeasureMode,
  isPingMode,
  tokenHealthByTokenId,
  getTokenColor,
  canControlToken,
  onSelectToken,
  onTokenDragStart,
  onTokenDragMove,
  onTokenDragEnd,
}: BattleMapTokenLayerProps) {
  return (
    <>
      {tokens.map((token) => (
        <BattleToken
          key={token.id}
          token={token}
          color={getTokenColor(token, characters)}
          isSelected={token.id === selectedTokenId}
          opacity={token.hidden ? 0.45 : 1}
          canControl={canControlToken(token)}
          isFogMode={isFogMode}
          isPanMode={isPanMode}
          isMeasureMode={isMeasureMode}
          isPingMode={isPingMode}
          health={tokenHealthByTokenId?.[token.id]}
          onSelect={() => onSelectToken(token)}
          onDragStart={() => onTokenDragStart(token)}
          onDragMove={(x, y, shiftKey) => onTokenDragMove(token, x, y, shiftKey)}
          onDragEnd={(x, y, shiftKey) => onTokenDragEnd(token, x, y, shiftKey)}
        />
      ))}
    </>
  );
}
