import { normalizeClassValue, type ClassOptionValue } from '../../services/staticSrd';

export const POINT_BUY_TOTAL = 27;
export const POINT_BUY_MIN_BASE = 8;
export const POINT_BUY_MAX_BASE = 15;
export const POINT_BUY_COST: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
type ScalingAbilityKey = 'str' | 'dex' | 'int';
type ClassName = ClassOptionValue;

type AbilityScores = Record<AbilityKey, number>;
type PointBuyCosts = Record<AbilityKey, number | null>;

const defaultAbilityScores: AbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

const zeroAbilityIncreases: AbilityScores = {
  str: 0,
  dex: 0,
  con: 0,
  int: 0,
  wis: 0,
  cha: 0,
};

export type PointBuyState = {
  bases: AbilityScores;
  costs: PointBuyCosts;
  totalCost: number;
  remaining: number;
  isValid: boolean;
  enforced: boolean;
};

export type PointBuyAdjustment = {
  canDec: boolean;
  canInc: boolean;
  nextStepCost: number | null;
  refundStepCost: number | null;
};

export type AdjustPointBuyAbilityInput = {
  abilities: AbilityScores | undefined;
  abilityIncreases: AbilityScores | null | undefined;
  ability: AbilityKey;
  delta: 1 | -1;
};

export type HitDie = 'd6' | 'd8' | 'd10' | 'd12';

export type DerivedLevelStats = {
  proficiencyBonus: number;
  maxHp: number;
  hpBonus: number;
};

export type CreateStatSummaryCard = {
  key: 'hp' | 'armorClass' | 'speed' | 'proficiencyBonus';
  label: string;
  value: string;
  help: string;
};

const hitDieAverages: Record<HitDie, { max: number; avg: number }> = {
  d6: { max: 6, avg: 4 },
  d8: { max: 8, avg: 5 },
  d10: { max: 10, avg: 6 },
  d12: { max: 12, avg: 7 },
};

interface ClassStatProfile {
  base: {
    maxHp: number;
    armorClass: number;
    speed: number;
    abilities: Record<ScalingAbilityKey, number>;
  };
  growth: {
    maxHp: number;
    armorClass: number;
    abilities: Record<ScalingAbilityKey, number>;
  };
}

export const abilityDisplayLabels: Record<AbilityKey, string> = {
  str: '근력',
  dex: '민첩',
  con: '건강',
  int: '지능',
  wis: '지혜',
  cha: '매력',
};

export const abilityKeys: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const classStatProfiles: Record<ClassName, ClassStatProfile> = {
  Barbarian: {
    base: {
      maxHp: 14,
      armorClass: 14,
      speed: 30,
      abilities: {
        str: 15,
        dex: 12,
        int: 8,
      },
    },
    growth: {
      maxHp: 7,
      armorClass: 0,
      abilities: {
        str: 0.3,
        dex: 0,
        int: 0,
      },
    },
  },
  Bard: {
    base: {
      maxHp: 10,
      armorClass: 13,
      speed: 30,
      abilities: {
        str: 8,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.2,
        int: 0,
      },
    },
  },
  Cleric: {
    base: {
      maxHp: 10,
      armorClass: 16,
      speed: 30,
      abilities: {
        str: 12,
        dex: 10,
        int: 8,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0,
        int: 0,
      },
    },
  },
  Druid: {
    base: {
      maxHp: 10,
      armorClass: 13,
      speed: 30,
      abilities: {
        str: 8,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.2,
        int: 0,
      },
    },
  },
  Fighter: {
    base: {
      maxHp: 20,
      armorClass: 18,
      speed: 28,
      abilities: {
        str: 14,
        dex: 10,
        int: 8,
      },
    },
    growth: {
      maxHp: 2,
      armorClass: 0.5,
      abilities: {
        str: 0.5,
        dex: 0,
        int: 0,
      },
    },
  },
  Monk: {
    base: {
      maxHp: 10,
      armorClass: 15,
      speed: 30,
      abilities: {
        str: 10,
        dex: 15,
        int: 8,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.4,
        int: 0,
      },
    },
  },
  Paladin: {
    base: {
      maxHp: 12,
      armorClass: 18,
      speed: 30,
      abilities: {
        str: 15,
        dex: 8,
        int: 8,
      },
    },
    growth: {
      maxHp: 6,
      armorClass: 0,
      abilities: {
        str: 0.3,
        dex: 0,
        int: 0,
      },
    },
  },
  Ranger: {
    base: {
      maxHp: 16,
      armorClass: 16,
      speed: 32,
      abilities: {
        str: 10,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 1.5,
      armorClass: 0.35,
      abilities: {
        str: 0,
        dex: 0.5,
        int: 0,
      },
    },
  },
  Rogue: {
    base: {
      maxHp: 14,
      armorClass: 14,
      speed: 36,
      abilities: {
        str: 9,
        dex: 15,
        int: 11,
      },
    },
    growth: {
      maxHp: 1.2,
      armorClass: 0.25,
      abilities: {
        str: 0,
        dex: 0.4,
        int: 0.2,
      },
    },
  },
  Sorcerer: {
    base: {
      maxHp: 8,
      armorClass: 12,
      speed: 30,
      abilities: {
        str: 8,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 4,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.2,
        int: 0,
      },
    },
  },
  Warlock: {
    base: {
      maxHp: 10,
      armorClass: 13,
      speed: 30,
      abilities: {
        str: 8,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.2,
        int: 0,
      },
    },
  },
  Wizard: {
    base: {
      maxHp: 12,
      armorClass: 12,
      speed: 30,
      abilities: {
        str: 8,
        dex: 10,
        int: 15,
      },
    },
    growth: {
      maxHp: 1,
      armorClass: 0.1,
      abilities: {
        str: 0,
        dex: 0,
        int: 0.5,
      },
    },
  },
};

export function calcModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(score: number) {
  const modifier = calcModifier(score);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

export function getAbilityModifierTooltip(ability: AbilityKey, score: number) {
  const label = abilityDisplayLabels[ability];
  const modifier = formatModifier(score);
  return `실제 ${label} 관련 액션을 할 때 ${modifier} 값만큼 보정됩니다.`;
}

function roundStat(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeComputedStat(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeIntegerValue(value: number, min = 0) {
  return Math.max(min, Math.round(Number(value) || 0));
}

export function clampAbilitiesToPointBuyRange(
  abilities: AbilityScores,
  abilityIncreases: AbilityScores
) {
  const clampBase = (ability: AbilityKey) =>
    Math.min(
      POINT_BUY_MAX_BASE,
      Math.max(POINT_BUY_MIN_BASE, abilities[ability] - abilityIncreases[ability])
    ) + abilityIncreases[ability];

  return {
    str: clampBase('str'),
    dex: clampBase('dex'),
    con: clampBase('con'),
    int: clampBase('int'),
    wis: clampBase('wis'),
    cha: clampBase('cha'),
  };
}

export function buildPointBuyState(
  abilities: AbilityScores | undefined,
  abilityIncreases: AbilityScores | null | undefined
): PointBuyState {
  const finals = abilities ?? defaultAbilityScores;
  const increases = abilityIncreases ?? zeroAbilityIncreases;
  const bases = {
    str: finals.str - increases.str,
    dex: finals.dex - increases.dex,
    con: finals.con - increases.con,
    int: finals.int - increases.int,
    wis: finals.wis - increases.wis,
    cha: finals.cha - increases.cha,
  };
  const costs = {
    str: POINT_BUY_COST[bases.str] ?? null,
    dex: POINT_BUY_COST[bases.dex] ?? null,
    con: POINT_BUY_COST[bases.con] ?? null,
    int: POINT_BUY_COST[bases.int] ?? null,
    wis: POINT_BUY_COST[bases.wis] ?? null,
    cha: POINT_BUY_COST[bases.cha] ?? null,
  };
  const totalCost = (Object.values(costs) as Array<number | null>).reduce<number>(
    (sum, cost) => sum + (cost ?? 0),
    0
  );
  const hasInvalid = Object.values(costs).some((cost) => cost === null);
  const remaining = POINT_BUY_TOTAL - totalCost;

  return {
    bases,
    costs,
    totalCost,
    remaining,
    isValid: !hasInvalid && remaining === 0,
    enforced: Boolean(abilityIncreases),
  };
}

export function getPointBuyAdjustment(
  state: PointBuyState,
  ability: AbilityKey
): PointBuyAdjustment {
  const base = state.bases[ability];
  const cost = state.costs[ability];
  const canDec = state.enforced && base > POINT_BUY_MIN_BASE;
  const nextBaseCost =
    state.enforced && base < POINT_BUY_MAX_BASE
      ? (POINT_BUY_COST[base + 1] ?? cost ?? 0)
      : null;
  const previousBaseCost = canDec
    ? (POINT_BUY_COST[base - 1] ?? cost ?? 0)
    : null;
  const nextStepCost =
    cost !== null && nextBaseCost !== null ? nextBaseCost - cost : null;
  const refundStepCost =
    canDec && cost !== null && previousBaseCost !== null
      ? cost - previousBaseCost
      : null;
  const canInc =
    state.enforced &&
    base < POINT_BUY_MAX_BASE &&
    nextStepCost !== null &&
    nextStepCost <= state.remaining;

  return {
    canDec,
    canInc,
    nextStepCost,
    refundStepCost,
  };
}

export function adjustPointBuyAbility({
  abilities,
  abilityIncreases,
  ability,
  delta,
}: AdjustPointBuyAbilityInput): AbilityScores | null {
  if (!abilityIncreases) return null;

  const currentAbilities = abilities ?? defaultAbilityScores;
  const state = buildPointBuyState(currentAbilities, abilityIncreases);
  const adjustment = getPointBuyAdjustment(state, ability);

  if ((delta < 0 && !adjustment.canDec) || (delta > 0 && !adjustment.canInc)) {
    return null;
  }

  return {
    ...currentAbilities,
    [ability]: state.bases[ability] + delta + abilityIncreases[ability],
  };
}

export function setAbilityScore(
  abilities: AbilityScores | undefined,
  ability: AbilityKey,
  value: number
): AbilityScores {
  return {
    ...(abilities ?? defaultAbilityScores),
    [ability]: value,
  };
}

export function syncDerivedLevelStats<T extends { proficiencyBonus?: number; maxHp?: number }>(
  current: T,
  derivedLevelStats: DerivedLevelStats | null
): T {
  if (!derivedLevelStats) return current;
  if (
    current.proficiencyBonus === derivedLevelStats.proficiencyBonus &&
    current.maxHp === derivedLevelStats.maxHp
  ) {
    return current;
  }

  return {
    ...current,
    proficiencyBonus: derivedLevelStats.proficiencyBonus,
    maxHp: derivedLevelStats.maxHp,
  };
}

export function applyPointBuyAbilityAdjustment<T extends { abilities?: AbilityScores }>(
  current: T,
  params: {
    abilityIncreases: AbilityScores | null | undefined;
    ability: AbilityKey;
    delta: 1 | -1;
  }
): T {
  const abilities = adjustPointBuyAbility({
    abilities: current.abilities,
    abilityIncreases: params.abilityIncreases,
    ability: params.ability,
    delta: params.delta,
  });
  if (!abilities) return current;

  return {
    ...current,
    abilities,
  };
}

export function formatStat(value: number) {
  return Number.isInteger(value) ? `${value}` : `${roundStat(value).toFixed(1)}`;
}

export function normalizeLevel(value: number) {
  return Math.max(1, Number(value) || 1);
}

export function getProficiencyBonusForLevel(level: number) {
  const normalizedLevel = normalizeLevel(level);
  if (normalizedLevel >= 17) return 6;
  if (normalizedLevel >= 13) return 5;
  if (normalizedLevel >= 9) return 4;
  if (normalizedLevel >= 5) return 3;
  return 2;
}

export function getHitDieAverage(hitDie: string | null | undefined) {
  return hitDieAverages[hitDie as HitDie] ?? null;
}

export function deriveLevelStats(params: {
  hitDie: string | null | undefined;
  classKey: string | null | undefined;
  raceKey?: string | null;
  subclassName?: string | null;
  level?: number | null;
  conScore?: number | null;
}): DerivedLevelStats | null {
  const hitDie = getHitDieAverage(params.hitDie);
  if (!hitDie) return null;

  const level = params.level ?? 1;
  const con = params.conScore ?? 10;
  const conMod = calcModifier(con);
  const proficiencyBonus = getProficiencyBonusForLevel(level);
  const hpBonus =
    (params.raceKey === 'hill-dwarf' ? level : 0) +
    (params.classKey === 'sorcerer' && params.subclassName === 'draconic_bloodline'
      ? level
      : 0);
  const maxHp = hitDie.max + conMod + (level - 1) * Math.max(hitDie.avg + conMod, 1) + hpBonus;

  return { proficiencyBonus, maxHp, hpBonus };
}

export function buildCreateStatSummaryCards(params: {
  maxHp?: number | null;
  armorClass?: number | null;
  speed?: number | null;
  proficiencyBonus?: number | null;
  level?: number | null;
  conScore?: number | null;
  hitDie?: string | null;
  derivedLevelStats?: DerivedLevelStats | null;
}): CreateStatSummaryCard[] {
  const level = params.level ?? 1;
  const hitDie = getHitDieAverage(params.hitDie);
  const hpHelp =
    params.derivedLevelStats && params.hitDie && hitDie
      ? buildCreateHpSummaryHelp({
          hitDie: params.hitDie,
          hitDieMax: hitDie.max,
          hitDieAverage: hitDie.avg,
          level,
          conScore: params.conScore,
          hpBonus: params.derivedLevelStats.hpBonus,
        })
      : '레벨과 건강 기반 자동 계산';

  return [
    {
      key: 'hp',
      label: 'HP',
      value: `${params.maxHp ?? 12}`,
      help: hpHelp,
    },
    {
      key: 'armorClass',
      label: '방어도',
      value: `${params.armorClass ?? 10}`,
      help: '장비와 민첩 보정 반영',
    },
    {
      key: 'speed',
      label: '이동속도',
      value: `${params.speed ?? 30}`,
      help: '종족/직업 보정 포함',
    },
    {
      key: 'proficiencyBonus',
      label: '숙련도',
      value: `${params.proficiencyBonus ?? 2}`,
      help: params.derivedLevelStats ? `레벨 ${level} 기준 자동` : '레벨에 따라 자동 상승',
    },
  ];
}

function buildCreateHpSummaryHelp(params: {
  hitDie: string;
  hitDieMax: number;
  hitDieAverage: number;
  level: number;
  conScore?: number | null;
  hpBonus: number;
}) {
  const conMod = calcModifier(params.conScore ?? 10);
  const modText = conMod >= 0 ? `+${conMod}` : `${conMod}`;
  const levelGain = Math.max(params.hitDieAverage + conMod, 1);
  const bonusText = params.hpBonus > 0 ? ` + 보정 ${params.hpBonus}` : '';

  return params.level === 1
    ? `${params.hitDie}(max ${params.hitDieMax}) + Con(${modText})${bonusText}`
    : `${params.hitDie}(max ${params.hitDieMax}) + ${params.level - 1}x(${levelGain})${bonusText}`;
}

function getClassStatProfile(className: string): ClassStatProfile {
  return classStatProfiles[normalizeClassValue(className)];
}

export function getRecommendedStats(className: string, level: number) {
  const normalizedLevel = normalizeLevel(level);
  const profile = getClassStatProfile(className);
  const growthSteps = normalizedLevel - 1;

  return {
    maxHp: normalizeIntegerValue(
      normalizeComputedStat(profile.base.maxHp + profile.growth.maxHp * growthSteps),
      1
    ),
    armorClass: normalizeIntegerValue(
      normalizeComputedStat(profile.base.armorClass + profile.growth.armorClass * growthSteps),
      1
    ),
    speed: normalizeIntegerValue(profile.base.speed, 0),
    proficiencyBonus: getProficiencyBonusForLevel(normalizedLevel),
  };
}

export function getRecommendedAbilities(
  className: string,
  level: number,
  currentAbilities?: AbilityScores
) {
  const normalizedLevel = normalizeLevel(level);
  const profile = getClassStatProfile(className);
  const growthSteps = normalizedLevel - 1;

  return {
    str: normalizeIntegerValue(
      normalizeComputedStat(
        profile.base.abilities.str + profile.growth.abilities.str * growthSteps
      ),
      1
    ),
    dex: normalizeIntegerValue(
      normalizeComputedStat(
        profile.base.abilities.dex + profile.growth.abilities.dex * growthSteps
      ),
      1
    ),
    con: normalizeIntegerValue(currentAbilities?.con ?? 10, 1),
    int: normalizeIntegerValue(
      normalizeComputedStat(
        profile.base.abilities.int + profile.growth.abilities.int * growthSteps
      ),
      1
    ),
    wis: normalizeIntegerValue(currentAbilities?.wis ?? 10, 1),
    cha: normalizeIntegerValue(currentAbilities?.cha ?? 10, 1),
  };
}

export function applyLevelDeltaStats(
  current: {
    className: string;
    maxHp?: number;
    armorClass?: number;
    proficiencyBonus?: number;
  },
  levelDelta: number,
  nextLevel: number
) {
  const profile = getClassStatProfile(current.className);

  return {
    maxHp: normalizeIntegerValue(
      normalizeComputedStat(
        (current.maxHp ?? profile.base.maxHp) + profile.growth.maxHp * levelDelta
      ),
      1
    ),
    armorClass: normalizeIntegerValue(
      normalizeComputedStat(
        (current.armorClass ?? profile.base.armorClass) + profile.growth.armorClass * levelDelta
      ),
      1
    ),
    proficiencyBonus: getProficiencyBonusForLevel(nextLevel),
  };
}

export function applyLevelDeltaAbilities(
  current: {
    className: string;
    abilities?: AbilityScores;
  },
  levelDelta: number
) {
  const profile = getClassStatProfile(current.className);
  const abilities = current.abilities ?? {
    str: profile.base.abilities.str,
    dex: profile.base.abilities.dex,
    con: 10,
    int: profile.base.abilities.int,
    wis: 10,
    cha: 10,
  };

  return {
    ...abilities,
    str: normalizeIntegerValue(
      normalizeComputedStat(abilities.str + profile.growth.abilities.str * levelDelta),
      1
    ),
    dex: normalizeIntegerValue(
      normalizeComputedStat(abilities.dex + profile.growth.abilities.dex * levelDelta),
      1
    ),
    int: normalizeIntegerValue(
      normalizeComputedStat(abilities.int + profile.growth.abilities.int * levelDelta),
      1
    ),
    con: normalizeIntegerValue(abilities.con, 1),
    wis: normalizeIntegerValue(abilities.wis, 1),
    cha: normalizeIntegerValue(abilities.cha, 1),
  };
}
