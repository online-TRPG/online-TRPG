import { RuleCatalogService } from "./rule-catalog.service";
import { P3_EXECUTABLE_ITEM_IDS } from "./p3-item-manifest";

export const P3_CONTENT_TARGETS = {
  executableSpells: 100,
  executableMonsters: 50,
  executableItems: 50,
} as const;

export const P4_CONTENT_TARGETS = {
  executableSpells: 150,
  executableMonsters: 100,
  executableItemsMinimum: 50,
} as const;

export const P2_EXECUTABLE_SPELL_IDS = [
  "spell.chill_touch",
  "spell.fire_bolt",
  "spell.light",
  "spell.ray_of_frost",
  "spell.sacred_flame",
  "spell.bane",
  "spell.bless",
  "spell.burning_hands",
  "spell.command",
  "spell.cure_wounds",
  "spell.detect_magic",
  "spell.entangle",
  "spell.guiding_bolt",
  "spell.healing_word",
  "spell.inflict_wounds",
  "spell.magic_missile",
  "spell.shield",
  "spell.sleep",
  "spell.thunderwave",
  "spell.hold_person",
  "spell.misty_step",
  "spell.scorching_ray",
  "spell.web",
  "spell.dispel_magic",
  "spell.fireball",
  "spell.acid_splash",
  "spell.guidance",
  "spell.mage_hand",
  "spell.minor_illusion",
  "spell.shocking_grasp",
  "spell.charm_person",
  "spell.faerie_fire",
  "spell.feather_fall",
  "spell.fog_cloud",
  "spell.grease",
  "spell.heroism",
  "spell.hunters_mark",
  "spell.longstrider",
  "spell.aid",
  "spell.blindness_deafness",
  "spell.darkness",
  "spell.invisibility",
  "spell.lesser_restoration",
  "spell.moonbeam",
  "spell.spiritual_weapon",
  "spell.counterspell",
  "spell.fly",
  "spell.haste",
  "spell.lightning_bolt",
  "spell.revivify",
] as const;

export const P2_EXECUTABLE_MONSTER_IDS = [
  "monster.goblin",
  "monster.orc",
  "monster.wolf",
  "monster.skeleton",
  "monster.zombie",
  "monster.giant_spider",
  "monster.brown_bear",
  "monster.dragon_whelp",
  "monster.cultist",
  "monster.ogre",
  "monster.kobold",
  "monster.bandit",
  "monster.bugbear",
  "monster.hobgoblin",
  "monster.dire_wolf",
  "monster.ghoul",
  "monster.wight",
  "monster.mimic",
  "monster.gelatinous_cube",
  "monster.swarm_of_rats",
  "monster.animated_armor",
  "monster.gargoyle",
  "monster.harpy",
  "monster.giant_scorpion",
  "monster.young_red_dragon",
] as const;

export type ExecutableContentManifest = {
  spellIds: string[];
  monsterIds: string[];
  itemIds: string[];
};

export function buildExecutableContentManifest(
  catalog: RuleCatalogService,
  executableItemIds: Iterable<string> = P3_EXECUTABLE_ITEM_IDS,
): ExecutableContentManifest {
  const spellIds = catalog
    .listEntries("spell_definitions")
    .filter((entry) => entry.runtimeEffect.type !== "resolver_pending")
    .map((entry) => entry.id)
    .sort();
  const monsterIds = Array.from(
    new Set(
      catalog
        .listEntries("monster_abilities")
        .filter(
          (entry) =>
            entry.runtimeEffect.type !== "resolver_pending" &&
            entry.levelRequirement.monsterId,
        )
        .map((entry) => entry.levelRequirement.monsterId as string),
    ),
  ).sort();
  const itemIds = Array.from(
    new Set(
      Array.from(executableItemIds)
        .map((itemId) => itemId.trim())
        .filter(Boolean),
    ),
  ).sort();

  return { spellIds, monsterIds, itemIds };
}
