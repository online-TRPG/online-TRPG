import {
  buildExecutableContentManifest,
  P2_EXECUTABLE_MONSTER_IDS,
  P2_EXECUTABLE_SPELL_IDS,
  P3_BASELINE_MONSTER_IDS,
  P3_CONTENT_TARGETS,
  P4_CONTENT_TARGETS,
  P5_CONTENT_TARGETS,
} from "./content-manifest";
import { RuleCatalogService } from "./rule-catalog.service";
import { P3_EXECUTABLE_MONSTER_IDS } from "./p3-monster-definitions";
import { P4_EXECUTABLE_MONSTER_IDS } from "./p4-monster-definitions";
import { P5_EXECUTABLE_MONSTER_IDS } from "./p5-monster-definitions";
import { P5_SPELL_DEFINITIONS } from "./p5-spell-definitions";

describe("executable content manifest", () => {
  const manifest = buildExecutableContentManifest(new RuleCatalogService());

  it("keeps the P2/P3/P4/P5 baseline while allowing the P6 executable catalog superset", () => {
    expect(manifest.spellIds.length).toBeGreaterThanOrEqual(P5_CONTENT_TARGETS.executableSpells);
    expect(P2_EXECUTABLE_SPELL_IDS).toHaveLength(50);
    expect(new Set(P2_EXECUTABLE_SPELL_IDS).size).toBe(P2_EXECUTABLE_SPELL_IDS.length);
    expect(P5_SPELL_DEFINITIONS).toHaveLength(
      P5_CONTENT_TARGETS.executableSpells - P4_CONTENT_TARGETS.executableSpells,
    );
    expect(manifest.spellIds).toEqual(
      expect.arrayContaining([...P2_EXECUTABLE_SPELL_IDS]),
    );
    expect(manifest.spellIds).toEqual(
      expect.arrayContaining(P5_SPELL_DEFINITIONS.map((entry) => entry.id)),
    );
    expect(manifest.spellIds).toEqual(
      expect.arrayContaining([
        "spell.acid_splash",
        "spell.fireball",
        "spell.revivify",
        "spell.eldritch_blast",
        "spell.dimension_door",
        "spell.wall_of_fire",
        "spell.banishment",
        "spell.cone_of_cold",
        "spell.disintegrate",
        "spell.heal",
        "spell.teleport",
        "spell.antimagic_field",
        "spell.dominate_monster",
        "spell.sunburst",
      ]),
    );
    expect(manifest.monsterIds).toEqual(
      expect.arrayContaining([...P2_EXECUTABLE_MONSTER_IDS]),
    );
    expect(manifest.monsterIds.length).toBeGreaterThanOrEqual(
      P2_EXECUTABLE_MONSTER_IDS.length,
    );
    expect(manifest.monsterIds.length).toBeGreaterThanOrEqual(P5_CONTENT_TARGETS.executableMonsters);
    expect(manifest.monsterIds).toEqual(
      expect.arrayContaining([...P3_EXECUTABLE_MONSTER_IDS]),
    );
    expect(manifest.monsterIds).toEqual(
      expect.arrayContaining([...P4_EXECUTABLE_MONSTER_IDS]),
    );
    expect(manifest.monsterIds).toEqual(
      expect.arrayContaining([...P5_EXECUTABLE_MONSTER_IDS]),
    );
  });

  it("declares the fixed P3 completion counts", () => {
    expect(P3_CONTENT_TARGETS).toEqual({
      executableSpells: 100,
      executableMonsters: 50,
      executableItems: 50,
    });
  });

  it("locks the P3 executable monster milestone at 50 cumulative ids", () => {
    const p3MonsterIds = [
      ...P3_BASELINE_MONSTER_IDS,
      ...P3_EXECUTABLE_MONSTER_IDS,
    ];

    expect(P3_BASELINE_MONSTER_IDS).toHaveLength(26);
    expect(P3_EXECUTABLE_MONSTER_IDS).toHaveLength(
      P3_CONTENT_TARGETS.executableMonsters - P3_BASELINE_MONSTER_IDS.length,
    );
    expect(new Set(p3MonsterIds).size).toBe(P3_CONTENT_TARGETS.executableMonsters);
    expect(manifest.monsterIds).toEqual(expect.arrayContaining(p3MonsterIds));
  });

  it("declares the P4 executable content targets without weakening the P3 baseline", () => {
    expect(P4_CONTENT_TARGETS).toEqual({
      executableSpells: 150,
      executableMonsters: 100,
      executableItemsMinimum: 50,
    });
    expect(P4_CONTENT_TARGETS.executableSpells).toBeGreaterThan(
      P3_CONTENT_TARGETS.executableSpells,
    );
    expect(P4_CONTENT_TARGETS.executableMonsters).toBeGreaterThan(
      P3_CONTENT_TARGETS.executableMonsters,
    );
    expect(P4_CONTENT_TARGETS.executableItemsMinimum).toBeGreaterThanOrEqual(
      P3_CONTENT_TARGETS.executableItems,
    );
  });

  it("declares the P5 executable content targets without weakening the P4 baseline", () => {
    expect(P5_CONTENT_TARGETS).toEqual({
      executableSpells: 220,
      executableMonsters: 180,
      executableItemsMinimum: 50,
    });
    expect(P5_CONTENT_TARGETS.executableSpells).toBeGreaterThan(
      P4_CONTENT_TARGETS.executableSpells,
    );
    expect(P5_CONTENT_TARGETS.executableMonsters).toBeGreaterThan(
      P4_CONTENT_TARGETS.executableMonsters,
    );
    expect(P5_CONTENT_TARGETS.executableItemsMinimum).toBeGreaterThanOrEqual(
      P4_CONTENT_TARGETS.executableItemsMinimum,
    );
  });

  it("locks exactly 50 additional P4 executable monster ids", () => {
    expect(P4_EXECUTABLE_MONSTER_IDS).toHaveLength(
      P4_CONTENT_TARGETS.executableMonsters - P3_CONTENT_TARGETS.executableMonsters,
    );
    expect(new Set(P4_EXECUTABLE_MONSTER_IDS).size).toBe(P4_EXECUTABLE_MONSTER_IDS.length);
    expect(P4_EXECUTABLE_MONSTER_IDS).toEqual(
      expect.arrayContaining([
        "monster.chimera",
        "monster.lich",
        "monster.young_black_dragon",
        "monster.purple_worm",
        "monster.archmage",
      ]),
    );
  });

  it("locks exactly 80 additional P5 executable monster ids", () => {
    expect(P5_EXECUTABLE_MONSTER_IDS).toHaveLength(
      P5_CONTENT_TARGETS.executableMonsters - P4_CONTENT_TARGETS.executableMonsters,
    );
    expect(new Set(P5_EXECUTABLE_MONSTER_IDS).size).toBe(P5_EXECUTABLE_MONSTER_IDS.length);
    expect(P5_EXECUTABLE_MONSTER_IDS).toEqual(
      expect.arrayContaining([
        "monster.adult_red_dragon",
        "monster.ancient_red_dragon",
        "monster.kraken",
        "monster.pit_fiend",
        "monster.solar",
        "monster.beholder",
        "monster.tarrasque",
      ]),
    );
  });

  it("deduplicates the executable item ids supplied by the item runtime manifest", () => {
    expect(
      buildExecutableContentManifest(new RuleCatalogService(), [
        "item.potion_of_healing",
        "item.potion_of_healing",
        "item.longbow",
      ]).itemIds,
    ).toEqual(["item.longbow", "item.potion_of_healing"]);
  });

  it("locks exactly 50 executable P3 item ids in the default manifest", () => {
    expect(manifest.itemIds).toHaveLength(P3_CONTENT_TARGETS.executableItems);
    expect(manifest.itemIds).toEqual(
      expect.arrayContaining([
        "equipment.단검",
        "equipment.potion_of_healing",
        "magic_item.bag_of_holding",
        "magic_item.wand_of_fireballs",
        "magic_item.potion_of_invisibility",
      ]),
    );
  });
});
