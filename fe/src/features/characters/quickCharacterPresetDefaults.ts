import { resolveSubclassChoiceLevel } from '@trpg/srd-data/rules';

const QUICK_CREATE_CLASS_PRESET_BY_KEY = new Map<string, string>([
  ['barbarian', 'preset_warrior'],
  ['bard', 'preset_wizard'],
  ['cleric', 'preset_warrior'],
  ['druid', 'preset_archer'],
  ['fighter', 'preset_warrior'],
  ['monk', 'preset_rogue'],
  ['paladin', 'preset_warrior'],
  ['ranger', 'preset_archer'],
  ['rogue', 'preset_rogue'],
  ['sorcerer', 'preset_wizard'],
  ['warlock', 'preset_wizard'],
  ['wizard', 'preset_wizard'],
]);

const QUICK_CREATE_SUBCLASS_BY_CLASS_KEY: Readonly<
  Record<string, { subclassName: string }>
> = {
  barbarian: { subclassName: 'berserker' },
  bard: { subclassName: 'lore' },
  cleric: { subclassName: 'life' },
  druid: { subclassName: 'land' },
  fighter: { subclassName: 'champion' },
  monk: { subclassName: 'open_hand' },
  paladin: { subclassName: 'devotion' },
  ranger: { subclassName: 'hunter' },
  rogue: { subclassName: 'thief' },
  sorcerer: { subclassName: 'draconic_bloodline' },
  warlock: { subclassName: 'fiend' },
  wizard: { subclassName: 'evocation' },
};

export function getQuickCreateAvatarPresetId(classKey: string): string | null {
  return QUICK_CREATE_CLASS_PRESET_BY_KEY.get(classKey) ?? null;
}

export function getQuickCreateSubclassName(classKey: string, level: number): string | null {
  const subclassChoiceLevel = resolveSubclassChoiceLevel(classKey) ?? Number.POSITIVE_INFINITY;
  if (level < subclassChoiceLevel) return null;
  return QUICK_CREATE_SUBCLASS_BY_CLASS_KEY[classKey]?.subclassName ?? null;
}
