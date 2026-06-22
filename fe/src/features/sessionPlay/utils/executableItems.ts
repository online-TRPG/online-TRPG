const directlyUsableP3ItemIds = new Set([
  'equipment.thieves__tools',
  'equipment.rope__hempen__50_feet',
  'equipment.backpack',
  'equipment.crowbar',
  'equipment.healer_s_kit',
  'equipment.torch',
  'equipment.antitoxin__vial',
  'equipment.ball_bearings__bag_of_1_000',
  'equipment.caltrops__bag_of_20',
  'equipment.potion_of_healing',
  'equipment.poison__basic__vial',
  'equipment.화살',
  'equipment.볼트',
  'equipment.슬링_탄환',
  'magic_item.bag_of_holding',
  'magic_item.boots_of_speed',
  'magic_item.cloak_of_protection',
  'magic_item.ring_of_protection',
  'magic_item.wand_of_magic_missiles',
  'magic_item.wand_of_fireballs',
  'magic_item.wand_of_web',
  'magic_item.necklace_of_fireballs',
  'magic_item.gauntlets_of_ogre_power',
  'magic_item.goggles_of_night',
  'magic_item.immovable_rod',
  'magic_item.rope_of_climbing',
  'magic_item.potion_of_flying',
  'magic_item.potion_of_invisibility',
  'magic_item.potion_of_healing',
]);

export function isDirectlyUsableP3Item(
  itemDefinitionId: string | null | undefined
) {
  return Boolean(itemDefinitionId && directlyUsableP3ItemIds.has(itemDefinitionId));
}
