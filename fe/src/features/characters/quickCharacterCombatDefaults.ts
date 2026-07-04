export type QuickCreateCombatAbilities = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

const HIT_DIE_AVERAGE_BY_KEY: Readonly<Record<string, number>> = {
  d6: 4,
  d8: 5,
  d10: 6,
  d12: 7,
};

const QUICK_CREATE_CLASS_COMBAT_DEFAULTS: Readonly<
  Record<string, { armorClass: number; speed: number }>
> = {
  fighter: { armorClass: 18, speed: 28 },
  ranger: { armorClass: 16, speed: 32 },
  rogue: { armorClass: 14, speed: 36 },
  wizard: { armorClass: 12, speed: 30 },
};

export function getProficiencyBonusForLevel(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

export function getExpectedMaxHp(
  hitDie: string | undefined,
  level: number,
  constitution: number
): number {
  const normalizedHitDie = hitDie?.toLowerCase() ?? 'd6';
  const hitDieMax = Number(normalizedHitDie.replace('d', '')) || 6;
  const hitDieAverage = HIT_DIE_AVERAGE_BY_KEY[normalizedHitDie] ?? Math.ceil(hitDieMax / 2);
  const constitutionModifier = Math.floor((constitution - 10) / 2);

  return hitDieMax + constitutionModifier + (level - 1) * (hitDieAverage + constitutionModifier);
}

export function getQuickCreateArmorClass(
  classKey: string,
  abilities: QuickCreateCombatAbilities
): number {
  const dexterityModifier = Math.floor((abilities.dex - 10) / 2);
  switch (classKey) {
    case 'fighter':
    case 'paladin':
      return 18;
    case 'cleric':
      return 14 + Math.min(dexterityModifier, 2) + 2;
    case 'ranger':
      return 14 + Math.min(dexterityModifier, 2);
    case 'rogue':
    case 'bard':
    case 'warlock':
      return 11 + dexterityModifier;
    case 'druid':
      return 11 + dexterityModifier + 2;
    case 'barbarian':
      return 10 + dexterityModifier + Math.floor((abilities.con - 10) / 2);
    case 'monk':
      return 10 + dexterityModifier + Math.floor((abilities.wis - 10) / 2);
    case 'wizard':
    case 'sorcerer':
      return 10 + dexterityModifier;
    default:
      return Math.max(10, 10 + dexterityModifier);
  }
}

export function getQuickCreateSpeed(
  classKey: string,
  race: { baseSpeed?: number | null } | null
): number {
  return QUICK_CREATE_CLASS_COMBAT_DEFAULTS[classKey]?.speed ?? race?.baseSpeed ?? 30;
}
