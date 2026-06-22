import type { CombatResponseDto } from '@trpg/shared-types';

type CombatParticipant = CombatResponseDto['participants'][number];

export interface CombatParticipantObservation {
  healthText: string;
  conditionText: string;
  conditionTexts: string[];
  hasVisibleConditions: boolean;
}

type ConditionRule = {
  keys: string[];
  phrase: string;
};

const conditionRules: ConditionRule[] = [
  {
    keys: ['sleep'],
    phrase: '깊은 잠에 빠져 움직이지 못한다',
  },
  {
    keys: ['unconscious', 'incapacitated'],
    phrase: '행동할 수 없는 상태로 보인다',
  },
  {
    keys: ['paralyzed', 'petrified', 'stunned'],
    phrase: '몸을 제대로 가누지 못한다',
  },
  {
    keys: ['restrained', 'grappled'],
    phrase: '움직임이 크게 제한돼 보인다',
  },
  {
    keys: ['prone'],
    phrase: '균형을 잃고 취약해 보인다',
  },
  {
    keys: ['poisoned', 'diseased', 'sickened'],
    phrase: '몸 상태가 악화되고 있어 보인다',
  },
  {
    keys: ['blinded', 'deafened'],
    phrase: '감각이 흐트러져 보인다',
  },
  {
    keys: ['frightened', 'charmed', 'confused'],
    phrase: '정신적으로 흔들리는 듯하다',
  },
  {
    keys: ['hidden'],
    phrase: '몸을 숨기고 기회를 엿보고 있다',
  },
  {
    keys: ['dodge'],
    phrase: '공격을 피하려는 자세를 취하고 있다',
  },
];

const stackableConditionKeys = ['exhaustion'];

export function describeCombatParticipantObservation(
  participant: Pick<
    CombatParticipant,
    'currentHp' | 'maxHp' | 'isAlive' | 'conditions' | 'concentration'
  >
): CombatParticipantObservation {
  const concentrationTexts = participant.concentration
    ? ['정신을 집중해 주문을 유지하고 있다']
    : [];
  const conditionTexts = [
    ...concentrationTexts,
    ...describeConditions(participant.conditions ?? []),
  ].slice(0, 3);
  return {
    healthText: describeHealth(participant.currentHp, participant.maxHp, participant.isAlive),
    conditionText: conditionTexts.length
      ? conditionTexts.join(' ')
      : '특별한 이상은 없어 보인다',
    conditionTexts,
    hasVisibleConditions: conditionTexts.length > 0,
  };
}

export function describeHealth(
  currentHp: number | null | undefined,
  maxHp: number | null | undefined,
  isAlive: boolean
) {
  if (!isAlive || (typeof currentHp === 'number' && currentHp <= 0)) {
    return '쓰러졌다';
  }
  if (typeof currentHp !== 'number' || typeof maxHp !== 'number' || maxHp <= 0) {
    return '상태를 가늠하기 어렵다';
  }
  if (currentHp >= maxHp) {
    return '멀쩡해 보인다';
  }

  const ratio = currentHp / maxHp;
  if (ratio > 0.9) return '거의 멀쩡해 보인다';
  if (ratio > 0.7) return '약간의 상처를 입었다';
  if (ratio > 0.4) return '눈에 띄게 지쳐 보인다';
  if (ratio > 0.1) return '심각한 부상을 입었다';
  return '죽기 직전이다';
}

function describeConditions(conditions: string[]) {
  const normalizedConditions = conditions.map(normalizeConditionToken).filter(Boolean);
  const stackTexts = describeStackableConditions(normalizedConditions);
  const stateTexts = conditionRules
    .filter((rule) =>
      rule.keys.some((key) =>
        normalizedConditions.some((condition) => conditionMatches(condition, key))
      )
    )
    .map((rule) => rule.phrase);

  return [...stackTexts, ...new Set(stateTexts)].slice(0, 3);
}

function describeStackableConditions(conditions: string[]) {
  return stackableConditionKeys.flatMap((key) => {
    const matchingConditions = conditions.filter((condition) => conditionMatches(condition, key));
    if (matchingConditions.length === 0) return [];

    const explicitStack = Math.max(0, ...matchingConditions.map(readConditionStack));
    const stack = Math.max(matchingConditions.length, explicitStack);
    return [describeStackableCondition(key, stack)];
  });
}

function describeStackableCondition(key: string, stack: number) {
  if (key === 'exhaustion') {
    if (stack <= 1) return '피로가 올라 움직임이 둔해 보인다';
    if (stack <= 3) return '피로가 겹쳐 움직임이 무거워 보인다';
    return '피로가 심하게 누적되어 거의 버티기 힘들어 보인다';
  }
  return '상태이상의 영향이 누적돼 보인다';
}

function normalizeConditionToken(condition: string) {
  return condition.trim().toLowerCase().replace(/_/g, '-');
}

function conditionMatches(condition: string, key: string) {
  return (
    condition === key ||
    condition.endsWith(`:${key}`) ||
    condition.endsWith(`.${key}`) ||
    condition.endsWith(`-${key}`) ||
    condition.includes(`:${key}:`) ||
    condition.includes(`.${key}.`) ||
    condition.includes(`-${key}-`)
  );
}

function readConditionStack(condition: string) {
  const match = condition.match(/(?:stack|level|rank)?[:.-](\d+)$/);
  return match ? Number(match[1]) : 0;
}
