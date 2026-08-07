import type { CombatConditionPolarity } from '@trpg/shared-types';

export type CombatConditionPresentation = {
  label: string;
  iconUrl: string;
  defaultPolarity: CombatConditionPolarity;
};

export const COMBAT_CONDITION_PRESENTATION = {
  'condition.blinded': { label: '실명', iconUrl: '/assets/combat-icons/condition/blinded.svg', defaultPolarity: 'harmful' },
  'condition.charmed': { label: '매혹', iconUrl: '/assets/combat-icons/condition/charmed.svg', defaultPolarity: 'harmful' },
  'condition.deafened': { label: '귀머거리', iconUrl: '/assets/combat-icons/condition/deafened.svg', defaultPolarity: 'harmful' },
  'condition.exhaustion': { label: '탈진', iconUrl: '/assets/combat-icons/condition/exhaustion.svg', defaultPolarity: 'harmful' },
  'condition.frightened': { label: '공포', iconUrl: '/assets/combat-icons/condition/frightened.svg', defaultPolarity: 'harmful' },
  'condition.grappled': { label: '붙잡힘', iconUrl: '/assets/combat-icons/condition/grappled.svg', defaultPolarity: 'harmful' },
  'condition.incapacitated': { label: '행동불능', iconUrl: '/assets/combat-icons/condition/incapacitated.svg', defaultPolarity: 'harmful' },
  'condition.invisible': { label: '투명', iconUrl: '/assets/combat-icons/condition/invisible.svg', defaultPolarity: 'beneficial' },
  'condition.paralyzed': { label: '마비', iconUrl: '/assets/combat-icons/condition/paralyzed.svg', defaultPolarity: 'harmful' },
  'condition.petrified': { label: '석화', iconUrl: '/assets/combat-icons/condition/petrified.svg', defaultPolarity: 'harmful' },
  'condition.poisoned': { label: '중독', iconUrl: '/assets/combat-icons/condition/poisoned.svg', defaultPolarity: 'harmful' },
  'condition.prone': { label: '넘어짐', iconUrl: '/assets/combat-icons/condition/prone.svg', defaultPolarity: 'harmful' },
  'condition.restrained': { label: '구속', iconUrl: '/assets/combat-icons/condition/restrained.svg', defaultPolarity: 'harmful' },
  'condition.stunned': { label: '기절', iconUrl: '/assets/combat-icons/condition/stunned.svg', defaultPolarity: 'harmful' },
  'condition.unconscious': { label: '의식불명', iconUrl: '/assets/combat-icons/condition/unconscious.svg', defaultPolarity: 'harmful' },
  'condition.dodge': { label: '회피', iconUrl: '/assets/combat-icons/condition/dodge.svg', defaultPolarity: 'beneficial' },
  'condition.disengage': { label: '이탈', iconUrl: '/assets/combat-icons/condition/disengage.svg', defaultPolarity: 'beneficial' },
  'condition.hidden': { label: '은신', iconUrl: '/assets/combat-icons/condition/hidden.svg', defaultPolarity: 'beneficial' },
  'condition.sleep': { label: '수면', iconUrl: '/assets/combat-icons/condition/sleep.svg', defaultPolarity: 'harmful' },
  'condition.burning': { label: '화상', iconUrl: '/assets/combat-icons/condition/burning.svg', defaultPolarity: 'harmful' },
  'condition.concentration': { label: '집중', iconUrl: '/assets/combat-icons/condition/concentration.svg', defaultPolarity: 'beneficial' },
  'condition.rage': { label: '격노', iconUrl: '/assets/combat-icons/condition/rage.svg', defaultPolarity: 'beneficial' },
} as const satisfies Record<string, CombatConditionPresentation>;

const fallbackCondition: CombatConditionPresentation = {
  label: '상태 효과',
  iconUrl: '/assets/combat-icons/condition/fallback.svg',
  defaultPolarity: 'neutral',
};

export function normalizeCombatConditionPresentationId(conditionId: string) {
  const normalized = conditionId.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'combat:dodge': 'condition.dodge',
    'combat:disengage': 'condition.disengage',
    'combat:hidden': 'condition.hidden',
    'combat:sleep': 'condition.sleep',
    'condition:unconscious': 'condition.unconscious',
  };
  return aliases[normalized] ?? normalized;
}

export function getCombatConditionPresentation(
  conditionId: string,
): CombatConditionPresentation {
  return COMBAT_CONDITION_PRESENTATION[
    normalizeCombatConditionPresentationId(conditionId) as keyof typeof COMBAT_CONDITION_PRESENTATION
  ] ?? fallbackCondition;
}
