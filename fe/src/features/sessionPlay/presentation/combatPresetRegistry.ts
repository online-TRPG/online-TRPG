import type { CombatPresentationDelivery } from '@trpg/shared-types';

export const SIGNATURE_COMBAT_PRESET_IDS = [
  'spell.magic_missile',
  'spell.fireball',
  'spell.lightning_bolt',
  'spell.thunderwave',
  'spell.moonbeam',
] as const;

export type SignatureCombatPresetId = (typeof SIGNATURE_COMBAT_PRESET_IDS)[number];

export type ResolvedCombatPreset =
  | { kind: 'signature'; id: SignatureCombatPresetId }
  | { kind: 'family'; id: string }
  | { kind: 'generic'; id: string };

export function resolveCombatPreset(params: {
  presetId: string;
  delivery: CombatPresentationDelivery;
  damageType?: string | null;
  hasHealing?: boolean;
}): ResolvedCombatPreset {
  const exact = SIGNATURE_COMBAT_PRESET_IDS.find((id) => params.presetId === id);
  if (exact) return { kind: 'signature', id: exact };

  const family = SIGNATURE_COMBAT_PRESET_IDS.find((id) =>
    params.presetId.startsWith(`${id}.`),
  );
  if (family) return { kind: 'family', id: family };

  if (params.damageType) {
    return { kind: 'generic', id: `${params.delivery}.${params.damageType}` };
  }
  return {
    kind: 'generic',
    id: params.hasHealing ? `${params.delivery}.healing` : `${params.delivery}.neutral`,
  };
}

export function isSignatureCombatPreset(
  preset: ResolvedCombatPreset,
): preset is Extract<ResolvedCombatPreset, { kind: 'signature' }> {
  return preset.kind === 'signature';
}
