import type {
  CombatEffectPlayback,
  CombatTokenVisualEffect,
} from './combatEffectTypes';

function readTargetResponse(
  effect: CombatEffectPlayback,
  impactIndex: number,
): CombatTokenVisualEffect['response'] {
  const impact = effect.envelope?.presentation.impacts[impactIndex];
  if (!impact) return 'none';
  const firstPacket = impact.damagePackets[0];
  if (impact.outcome === 'miss' || firstPacket?.modifiers.includes('immune')) return 'none';
  if (impact.outcome === 'critical') return 'critical';
  if (firstPacket?.modifiers.includes('vulnerable')) return 'vulnerable';
  if (
    impact.outcome === 'saved' ||
    firstPacket?.modifiers.includes('saved_half') ||
    firstPacket?.modifiers.includes('resisted')
  ) {
    return 'guarded';
  }
  if (impact.healingPackets.length) return 'healing';
  if (impact.damagePackets.length) return 'hit';
  return impact.conditionChanges.length ? 'applied' : 'none';
}

export function projectCombatTokenVisualEffects(params: {
  effects: CombatEffectPlayback[];
  participantTokenIdById: Record<string, string>;
  visibleTokenIds: ReadonlySet<string>;
}): Record<string, CombatTokenVisualEffect> {
  const result: Record<string, CombatTokenVisualEffect> = {};

  for (const effect of params.effects) {
    const presentation = effect.envelope?.presentation;
    if (!presentation) continue;

    if (presentation.sourceParticipantId) {
      const sourceTokenId = params.participantTokenIdById[presentation.sourceParticipantId];
      if (sourceTokenId && params.visibleTokenIds.has(sourceTokenId)) {
        result[sourceTokenId] = {
          id: `${effect.id}:source`,
          startedAt: effect.startedAt,
          durationMs: effect.durationMs,
          response: 'source',
          damageType: presentation.impacts[0]?.damagePackets[0]?.damageType ?? 'untyped',
        };
      }
    }

    presentation.impacts.slice(0, 24).forEach((impact, impactIndex) => {
      if (!impact.targetParticipantId) return;
      const tokenId = params.participantTokenIdById[impact.targetParticipantId];
      if (!tokenId || !params.visibleTokenIds.has(tokenId)) return;
      result[tokenId] = {
        id: `${effect.id}:target:${impactIndex}`,
        startedAt: effect.startedAt + Math.min(impactIndex, 8) * 75,
        durationMs: effect.durationMs,
        response: readTargetResponse(effect, impactIndex),
        damageType: impact.damagePackets[0]?.damageType ?? 'untyped',
      };
    });
  }

  return result;
}
