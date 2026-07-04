import {
  normalizeSrdCharacterClassKey,
  resolveAvailableAbilityScoreImprovementLevels,
} from '@trpg/srd-data/rules';

export type QuickCreateAbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

const QUICK_CREATE_POINT_BUY_BY_CLASS_KEY: Readonly<
  Record<string, QuickCreateAbilityScores>
> = {
  barbarian: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  bard: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
  cleric: { str: 10, dex: 13, con: 14, int: 8, wis: 15, cha: 10 },
  druid: { str: 8, dex: 14, con: 13, int: 10, wis: 15, cha: 10 },
  fighter: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  monk: { str: 10, dex: 15, con: 13, int: 8, wis: 14, cha: 10 },
  paladin: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 },
  ranger: { str: 10, dex: 15, con: 13, int: 10, wis: 14, cha: 10 },
  rogue: { str: 10, dex: 15, con: 13, int: 12, wis: 14, cha: 8 },
  sorcerer: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
  warlock: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
  wizard: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
};

const QUICK_CREATE_ASI_PRIORITY_BY_CLASS_KEY: Readonly<
  Record<string, ReadonlyArray<keyof QuickCreateAbilityScores>>
> = {
  barbarian: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  bard: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
  cleric: ['wis', 'con', 'str', 'dex', 'cha', 'int'],
  druid: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
  fighter: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  monk: ['dex', 'wis', 'con', 'str', 'cha', 'int'],
  paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
  ranger: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  rogue: ['dex', 'con', 'int', 'wis', 'cha', 'str'],
  sorcerer: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  warlock: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  wizard: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
};

export function getQuickCreatePointBuyBase(classKey: string): QuickCreateAbilityScores {
  return (
    QUICK_CREATE_POINT_BUY_BY_CLASS_KEY[classKey] ?? {
      str: 10,
      dex: 14,
      con: 13,
      int: 10,
      wis: 12,
      cha: 15,
    }
  );
}

export function applyRaceBonuses(
  base: QuickCreateAbilityScores,
  race: { abilityIncreases?: Partial<QuickCreateAbilityScores> | null } | null
): QuickCreateAbilityScores {
  const increases = race?.abilityIncreases;
  return {
    str: base.str + (increases?.str ?? 0),
    dex: base.dex + (increases?.dex ?? 0),
    con: base.con + (increases?.con ?? 0),
    int: base.int + (increases?.int ?? 0),
    wis: base.wis + (increases?.wis ?? 0),
    cha: base.cha + (increases?.cha ?? 0),
  };
}

export function getQuickCreateAsiLevels(classKey: string, level: number): number[] {
  return resolveAvailableAbilityScoreImprovementLevels(classKey, level);
}

export function buildQuickCreateAsiChoices(
  classKey: string,
  level: number,
  abilities: QuickCreateAbilityScores
): Array<keyof QuickCreateAbilityScores> {
  const priority =
    QUICK_CREATE_ASI_PRIORITY_BY_CLASS_KEY[normalizeSrdCharacterClassKey(classKey)] ??
    QUICK_CREATE_ASI_PRIORITY_BY_CLASS_KEY.wizard;
  const working = { ...abilities };
  const selected = new Set<keyof QuickCreateAbilityScores>();
  const choices: Array<keyof QuickCreateAbilityScores> = [];
  for (const _asiLevel of getQuickCreateAsiLevels(classKey, level)) {
    const selectedAbility =
      priority.find((ability) => !selected.has(ability) && working[ability] <= 18) ??
      priority.find((ability) => !selected.has(ability));
    if (!selectedAbility) break;
    selected.add(selectedAbility);
    working[selectedAbility] += 2;
    choices.push(selectedAbility);
  }
  return choices;
}

export function applyQuickCreateAsiChoices(
  abilities: QuickCreateAbilityScores,
  asiChoices: Array<keyof QuickCreateAbilityScores>
): QuickCreateAbilityScores {
  const next = { ...abilities };
  for (const ability of asiChoices) {
    next[ability] += 2;
  }
  return next;
}

export function getDefaultQuickCreateFeatureSelections(params: {
  classKey: string;
  raceKey: string | null | undefined;
  level: number;
  proficientSkills: string[];
  asiChoices: Array<keyof QuickCreateAbilityScores>;
}): string[] {
  const classKey = normalizeSrdCharacterClassKey(params.classKey);
  const features: string[] = [];

  if ((params.raceKey ?? '').trim().toLowerCase() === 'dragonborn') {
    features.push('draconic_ancestry:red');
  }

  if (classKey === 'fighter') {
    features.push('fighting_style:defense');
  } else if (classKey === 'paladin' && params.level >= 2) {
    features.push('fighting_style:defense');
  } else if (classKey === 'ranger') {
    features.push('favored_enemy:beasts');
    if (params.level >= 2) {
      features.push('fighting_style:archery');
    }
  } else if (classKey === 'rogue') {
    const expertiseTargets = [
      ...params.proficientSkills.slice(0, 2),
      'thieves_tools',
    ].slice(0, 2);
    features.push(...expertiseTargets.map((target) => `expertise:${target}`));
  }

  features.push(...params.asiChoices.map((ability) => `asi:${ability}`));
  const requiredAsiOrFeatChoiceCount = getQuickCreateAsiLevels(params.classKey, params.level).length;
  if (features.filter((feature) => feature.startsWith('asi:')).length < requiredAsiOrFeatChoiceCount) {
    features.push('feat.alert');
  }

  return features;
}
