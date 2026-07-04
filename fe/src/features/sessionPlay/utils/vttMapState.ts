import type { VttMapStateDto } from '@trpg/shared-types';

export type PendingOptimisticTokenMove = {
  tokenId: string;
  optimisticUpdatedAt: string;
  previousMap: VttMapStateDto;
};

export function applyOptimisticTokenMove(
  map: VttMapStateDto | null,
  tokenId: string,
  to: { x: number; y: number },
  optimisticUpdatedAt: string
) {
  if (!map || !map.tokens.some((candidate) => candidate.id === tokenId)) return null;
  return {
    ...map,
    tokens: map.tokens.map((candidate) =>
      candidate.id === tokenId
        ? {
            ...candidate,
            x: to.x,
            y: to.y,
          }
        : candidate
    ),
    updatedAt: optimisticUpdatedAt,
  };
}
