import {
  buildExecutableContentManifest,
  P2_EXECUTABLE_MONSTER_IDS,
  P3_CONTENT_TARGETS,
  P4_CONTENT_TARGETS,
} from "./content-manifest";
import { RuleCatalogService } from "./rule-catalog.service";
import { P3_EXECUTABLE_MONSTER_IDS } from "./p3-monster-definitions";

describe("executable content manifest", () => {
  const manifest = buildExecutableContentManifest(new RuleCatalogService());

  it("keeps the P2 baseline while enforcing the P3 executable spell target", () => {
    expect(manifest.spellIds).toHaveLength(P3_CONTENT_TARGETS.executableSpells);
    expect(manifest.spellIds).toEqual(
      expect.arrayContaining([
        "spell.acid_splash",
        "spell.fireball",
        "spell.revivify",
        "spell.eldritch_blast",
        "spell.dimension_door",
        "spell.wall_of_fire",
      ]),
    );
    expect(manifest.monsterIds).toEqual(
      expect.arrayContaining([...P2_EXECUTABLE_MONSTER_IDS]),
    );
    expect(manifest.monsterIds.length).toBeGreaterThanOrEqual(
      P2_EXECUTABLE_MONSTER_IDS.length,
    );
    expect(manifest.monsterIds).toHaveLength(
      P3_CONTENT_TARGETS.executableMonsters,
    );
    expect(manifest.monsterIds).toEqual(
      expect.arrayContaining([...P3_EXECUTABLE_MONSTER_IDS]),
    );
  });

  it("declares the fixed P3 completion counts", () => {
    expect(P3_CONTENT_TARGETS).toEqual({
      executableSpells: 100,
      executableMonsters: 50,
      executableItems: 50,
    });
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
