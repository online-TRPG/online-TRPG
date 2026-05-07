export type MvpAutomationStatus = "SUPPORTED" | "GM_ASSIST" | "DEFERRED";

export type MvpSpell = {
  id: string;
  name: string;
  level: number;
  classes: string[];
  automationStatus: MvpAutomationStatus;
  primaryUse: "attack" | "defense" | "healing" | "utility" | "control";
};

export const MVP_SPELLS: MvpSpell[] = [
  { id: "spell.fire_bolt", name: "Fire Bolt", level: 0, classes: ["Wizard"], automationStatus: "SUPPORTED", primaryUse: "attack" },
  { id: "spell.chill_touch", name: "Chill Touch", level: 0, classes: ["Wizard"], automationStatus: "SUPPORTED", primaryUse: "attack" },
  { id: "spell.magic_missile", name: "Magic Missile", level: 1, classes: ["Wizard"], automationStatus: "SUPPORTED", primaryUse: "attack" },
  { id: "spell.cure_wounds", name: "Cure Wounds", level: 1, classes: ["Ranger"], automationStatus: "SUPPORTED", primaryUse: "healing" },
  { id: "spell.acid_splash", name: "Acid Splash", level: 0, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "attack" },
  { id: "spell.light", name: "Light", level: 0, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "spell.mage_hand", name: "Mage Hand", level: 0, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "spell.prestidigitation", name: "Prestidigitation", level: 0, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "spell.ray_of_frost", name: "Ray of Frost", level: 0, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "attack" },
  { id: "spell.shocking_grasp", name: "Shocking Grasp", level: 0, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "attack" },
  { id: "spell.mage_armor", name: "Mage Armor", level: 1, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "defense" },
  { id: "spell.detect_magic", name: "Detect Magic", level: 1, classes: ["Ranger", "Wizard"], automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "spell.identify", name: "Identify", level: 1, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "spell.burning_hands", name: "Burning Hands", level: 1, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "attack" },
  { id: "spell.thunderwave", name: "Thunderwave", level: 1, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "attack" },
  { id: "spell.chromatic_orb", name: "Chromatic Orb", level: 1, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "attack" },
  { id: "spell.jump", name: "Jump", level: 1, classes: ["Ranger", "Wizard"], automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "spell.longstrider", name: "Longstrider", level: 1, classes: ["Ranger", "Wizard"], automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "spell.comprehend_languages", name: "Comprehend Languages", level: 1, classes: ["Wizard"], automationStatus: "GM_ASSIST", primaryUse: "utility" },
] as const;

export type MvpMagicItem = {
  id: string;
  name: string;
  automationStatus: MvpAutomationStatus;
  primaryUse: "healing" | "attack" | "defense" | "utility" | "storage";
};

export const MVP_MAGIC_ITEMS: MvpMagicItem[] = [
  { id: "magic_item.potion_of_healing", name: "Potion of Healing", automationStatus: "SUPPORTED", primaryUse: "healing" },
  { id: "magic_item.weapon_1_2_or_3", name: "Weapon, +1", automationStatus: "SUPPORTED", primaryUse: "attack" },
  { id: "magic_item.armor_1_2_or_3", name: "Armor, +1", automationStatus: "SUPPORTED", primaryUse: "defense" },
  { id: "magic_item.shield_1_2_or_3", name: "Shield, +1", automationStatus: "SUPPORTED", primaryUse: "defense" },
  { id: "magic_item.bag_of_holding", name: "Bag of Holding", automationStatus: "SUPPORTED", primaryUse: "storage" },
  { id: "magic_item.spell_scroll", name: "Spell Scroll", automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "magic_item.wand_of_magic_missiles", name: "Wand of Magic Missiles", automationStatus: "GM_ASSIST", primaryUse: "attack" },
  { id: "magic_item.wand_of_secrets", name: "Wand of Secrets", automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "magic_item.cloak_of_protection", name: "Cloak of Protection", automationStatus: "GM_ASSIST", primaryUse: "defense" },
  { id: "magic_item.ring_of_protection", name: "Ring of Protection", automationStatus: "GM_ASSIST", primaryUse: "defense" },
  { id: "magic_item.boots_of_elvenkind", name: "Boots of Elvenkind", automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "magic_item.goggles_of_night", name: "Goggles of Night", automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "magic_item.immovable_rod", name: "Immovable Rod", automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "magic_item.rope_of_climbing", name: "Rope of Climbing", automationStatus: "GM_ASSIST", primaryUse: "utility" },
  { id: "magic_item.sending_stones", name: "Sending Stones", automationStatus: "GM_ASSIST", primaryUse: "utility" },
] as const;
