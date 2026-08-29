import type { CombatPresentationDamageType } from '@trpg/shared-types';

export type CombatDamagePresentation = {
  label: string;
  color: string;
  iconUrl: string;
  motif: CombatImpactMotif;
};

export type CombatImpactMotif =
  | 'droplets'
  | 'dust'
  | 'shards'
  | 'embers'
  | 'compression'
  | 'arcs'
  | 'implosion'
  | 'needles'
  | 'bubbles'
  | 'distortion'
  | 'rays'
  | 'slashes'
  | 'shockwaves'
  | 'pulse';

export const COMBAT_DAMAGE_PRESENTATION = {
  acid: { label: '산성', color: '#B7D64A', iconUrl: '/assets/combat-icons/damage/acid.svg', motif: 'droplets' },
  bludgeoning: { label: '타격', color: '#B58B62', iconUrl: '/assets/combat-icons/damage/bludgeoning.svg', motif: 'dust' },
  cold: { label: '냉기', color: '#67D7F5', iconUrl: '/assets/combat-icons/damage/cold.svg', motif: 'shards' },
  fire: { label: '화염', color: '#FF5A36', iconUrl: '/assets/combat-icons/damage/fire.svg', motif: 'embers' },
  force: { label: '역장', color: '#B06CFF', iconUrl: '/assets/combat-icons/damage/force.svg', motif: 'compression' },
  lightning: { label: '번개', color: '#FFE04A', iconUrl: '/assets/combat-icons/damage/lightning.svg', motif: 'arcs' },
  necrotic: { label: '사령', color: '#77559A', iconUrl: '/assets/combat-icons/damage/necrotic.svg', motif: 'implosion' },
  piercing: { label: '관통', color: '#D7DCE2', iconUrl: '/assets/combat-icons/damage/piercing.svg', motif: 'needles' },
  poison: { label: '독', color: '#57C86B', iconUrl: '/assets/combat-icons/damage/poison.svg', motif: 'bubbles' },
  psychic: { label: '정신', color: '#F05AE0', iconUrl: '/assets/combat-icons/damage/psychic.svg', motif: 'distortion' },
  radiant: { label: '광휘', color: '#FFF0A6', iconUrl: '/assets/combat-icons/damage/radiant.svg', motif: 'rays' },
  slashing: { label: '참격', color: '#E06B6B', iconUrl: '/assets/combat-icons/damage/slashing.svg', motif: 'slashes' },
  thunder: { label: '천둥', color: '#4E8CFF', iconUrl: '/assets/combat-icons/damage/thunder.svg', motif: 'shockwaves' },
  untyped: { label: '피해', color: '#A4A8B3', iconUrl: '/assets/combat-icons/damage/untyped.svg', motif: 'pulse' },
} as const satisfies Record<CombatPresentationDamageType, CombatDamagePresentation>;

export function getCombatDamagePresentation(
  damageType: string,
): CombatDamagePresentation {
  return COMBAT_DAMAGE_PRESENTATION[
    damageType as CombatPresentationDamageType
  ] ?? COMBAT_DAMAGE_PRESENTATION.untyped;
}
