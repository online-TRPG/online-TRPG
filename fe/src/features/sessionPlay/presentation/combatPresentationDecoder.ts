import type { TurnLogResponseDto } from '@trpg/shared-types';
import { decodeCombatPresentationV1 } from '@trpg/shared-types/frontend';
import type { CombatPresentationEnvelope } from './combatEffectTypes';

export function decodeCombatPresentationEnvelope(
  turnLog: TurnLogResponseDto,
): CombatPresentationEnvelope | null {
  const candidate = turnLog.structuredAction?.presentationV1;
  if (!candidate) return null;
  try {
    return {
      turnLogId: turnLog.turnLogId,
      createdAt: turnLog.createdAt,
      narration: turnLog.narration ?? '전투 결과가 적용되었습니다.',
      presentation: decodeCombatPresentationV1(candidate),
    };
  } catch {
    return null;
  }
}
