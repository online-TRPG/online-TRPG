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
