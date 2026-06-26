import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildP6ExecutableContentManifest,
  P2_EXECUTABLE_SPELL_IDS,
  P3_BASELINE_MONSTER_IDS,
  P5_CONTENT_TARGETS,
  P6_CONTENT_TARGETS,
} from "./content-manifest";
import { P3_EXECUTABLE_MONSTER_IDS } from "./p3-monster-definitions";
import { P3_SPELL_DEFINITIONS } from "./p3-spell-definitions";
import { P4_EXECUTABLE_MONSTER_IDS } from "./p4-monster-definitions";
import { P4_SPELL_DEFINITIONS } from "./p4-spell-definitions";
import { P5_EXECUTABLE_MONSTER_IDS } from "./p5-monster-definitions";
import { P5_SPELL_DEFINITIONS } from "./p5-spell-definitions";
import {
  P6_EXECUTABLE_MONSTER_IDS,
  P6_MONSTER_ABILITY_DEFINITIONS,
} from "./p6-monster-definitions";
import {
  P6_EXECUTABLE_SPELL_IDS,
  P6_SPELL_DEFINITIONS,
} from "./p6-spell-definitions";
import { RuleCatalogService } from "./rule-catalog.service";

type SrdIndexRecord = {
  id: string;
  level?: number;
};

function resolveGeneratedSrdPath(fileName: string): string {
  const fromRepoRoot = join(process.cwd(), "srd-data", "generated", "srd", fileName);
  if (existsSync(fromRepoRoot)) {
    return fromRepoRoot;
  }
  return join(process.cwd(), "..", "srd-data", "generated", "srd", fileName);
}

function readSrdIds(fileName: string): string[] {
  return readFileSync(resolveGeneratedSrdPath(fileName), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SrdIndexRecord)
    .map((entry) => entry.id)
    .sort();
}

describe("P6 final executable content manifest", () => {
  const finalSrdSpellIds = readSrdIds("spells.jsonl");
  const finalSrdMonsterIds = readSrdIds("monsters.jsonl");
  const manifest = buildP6ExecutableContentManifest(
    new RuleCatalogService(),
    finalSrdSpellIds,
    finalSrdMonsterIds,
  );

  it("declares the final P6 executable content targets without weakening P5", () => {
    expect(P5_CONTENT_TARGETS).toEqual({
      executableSpells: 220,
      executableMonsters: 180,
      executableItemsMinimum: 50,
    });
    expect(P6_CONTENT_TARGETS).toEqual({
      executableSpells: 319,
      executableMonsters: 317,
      executableItemsMinimum: 50,
    });
  });

  it("locks the generated SRD spell and monster source counts", () => {
    expect(finalSrdSpellIds).toHaveLength(P6_CONTENT_TARGETS.executableSpells);
    expect(finalSrdMonsterIds).toHaveLength(P6_CONTENT_TARGETS.executableMonsters);
    expect(new Set(finalSrdSpellIds).size).toBe(finalSrdSpellIds.length);
    expect(new Set(finalSrdMonsterIds).size).toBe(finalSrdMonsterIds.length);
  });

  it("adds the P6 gap definitions that close the final generated SRD manifest", () => {
    expect(P6_SPELL_DEFINITIONS).toHaveLength(109);
    expect(P6_EXECUTABLE_SPELL_IDS).toEqual(
      expect.arrayContaining([
        "spell.wish",
        "spell.true_resurrection",
        "spell.meteor_swarm",
        "spell.power_word_kill",
        "spell.shapechange",
        "spell.time_stop",
      ]),
    );
    expect(P6_EXECUTABLE_MONSTER_IDS).toHaveLength(163);
    expect(P6_MONSTER_ABILITY_DEFINITIONS).toHaveLength(
      P6_EXECUTABLE_MONSTER_IDS.length * 2,
    );
    expect(P6_EXECUTABLE_MONSTER_IDS).toEqual(
      expect.arrayContaining([
        "monster.ancient_gold_dragon",
        "monster.mummy_lord",
        "monster.guardian_naga",
        "monster.will_o_wisp",
        "monster.young_gold_dragon",
      ]),
    );
  });

  it("locks the P6 additions as the actual generated SRD gap after prior compatibility ids", () => {
    const preP6SpellIds = new Set<string>([
      ...P2_EXECUTABLE_SPELL_IDS,
      ...P3_SPELL_DEFINITIONS.map((entry) => entry.id),
      ...P4_SPELL_DEFINITIONS.map((entry) => entry.id),
      ...P5_SPELL_DEFINITIONS.map((entry) => entry.id),
    ]);
    const preP6MonsterIds = new Set<string>([
      ...P3_BASELINE_MONSTER_IDS,
      ...P3_EXECUTABLE_MONSTER_IDS,
      ...P4_EXECUTABLE_MONSTER_IDS,
      ...P5_EXECUTABLE_MONSTER_IDS,
    ]);
    const uniqueP6SpellIds = P6_EXECUTABLE_SPELL_IDS.filter(
      (spellId) => finalSrdSpellIds.includes(spellId) && !preP6SpellIds.has(spellId),
    );
    const uniqueP6MonsterIds = P6_EXECUTABLE_MONSTER_IDS.filter(
      (monsterId) => finalSrdMonsterIds.includes(monsterId) && !preP6MonsterIds.has(monsterId),
    );
    const preP6FinalSrdSpellIds = finalSrdSpellIds.filter((spellId) =>
      preP6SpellIds.has(spellId),
    );
    const preP6FinalSrdMonsterIds = finalSrdMonsterIds.filter((monsterId) =>
      preP6MonsterIds.has(monsterId),
    );

    expect(new Set([...preP6SpellIds, ...uniqueP6SpellIds]).size).toBe(
      preP6SpellIds.size + uniqueP6SpellIds.length,
    );
    expect(new Set([...preP6MonsterIds, ...uniqueP6MonsterIds]).size).toBe(
      preP6MonsterIds.size + uniqueP6MonsterIds.length,
    );
    expect(preP6FinalSrdSpellIds).toHaveLength(210);
    expect(uniqueP6SpellIds).toHaveLength(
      P6_CONTENT_TARGETS.executableSpells - preP6FinalSrdSpellIds.length,
    );
    expect(preP6FinalSrdMonsterIds).toHaveLength(154);
    expect(uniqueP6MonsterIds).toHaveLength(
      P6_CONTENT_TARGETS.executableMonsters - preP6FinalSrdMonsterIds.length,
    );
    expect(uniqueP6SpellIds).toEqual(
      expect.arrayContaining([
        "spell.wish",
        "spell.true_resurrection",
        "spell.astral_projection",
        "spell.gate",
        "spell.shapechange",
        "spell.foresight",
        "spell.meteor_swarm",
        "spell.power_word_kill",
      ]),
    );
    expect(uniqueP6MonsterIds).toEqual(
      expect.arrayContaining([
        "monster.ancient_gold_dragon",
        "monster.ancient_silver_dragon",
        "monster.mummy_lord",
        "monster.guardian_naga",
      ]),
    );
  });

  it("builds the exact final P6 SRD manifest", () => {
    expect(manifest.spellIds).toHaveLength(P6_CONTENT_TARGETS.executableSpells);
    expect(manifest.monsterIds).toHaveLength(P6_CONTENT_TARGETS.executableMonsters);
    expect(manifest.spellIds).toEqual(finalSrdSpellIds);
    expect(manifest.monsterIds).toEqual(finalSrdMonsterIds);
    expect(manifest.itemIds.length).toBeGreaterThanOrEqual(
      P6_CONTENT_TARGETS.executableItemsMinimum,
    );
  });

  it("keeps every P6 spell definition executable with audit, target, cost, and hook metadata", () => {
    for (const spell of P6_SPELL_DEFINITIONS) {
      expect(spell.kind).toBe("spell_definitions");
      expect(spell.runtimeEffect.type).toBe("spell");
      expect(spell.runtimeEffect.hookId).toMatch(/^hook\.spell\.p6_/);
      expect(spell.runtimeEffect.tags).toEqual(
        expect.arrayContaining([
          "p6_content",
          "final_srd_spell_manifest",
          "audit:turn_log_state_diff",
        ]),
      );
      expect(spell.cost.type).toMatch(/^(action|reaction)$/);
      expect(spell.targeting.type).toMatch(/^(self|creature|area)$/);
      expect(typeof spell.concentration).toBe("boolean");
      expect(spell.duration).not.toBeUndefined();
    }
  });

  it("marks P6 high-impact 9th-level spells with cost, GM approval, campaign state, and audit semantics", () => {
    const byId = new Map(P6_SPELL_DEFINITIONS.map((spell) => [spell.id, spell]));

    expect(byId.get("spell.wish")?.runtimeEffect.tags).toEqual(
      expect.arrayContaining([
        "wish:mvp_option:replicate_spell_level_8_or_lower",
        "gm_approval_required:non_replication_wish",
        "audit:gm_override_required_for_broad_effect",
      ]),
    );
    expect(byId.get("spell.true_resurrection")?.runtimeEffect.tags).toEqual(
      expect.arrayContaining([
        "material_cost:diamond:25000gp:consumed",
        "campaign_state:death_resurrection_history",
        "archive:major_reward_or_reversal",
      ]),
    );
    expect(byId.get("spell.gate")?.runtimeEffect.tags).toEqual(
      expect.arrayContaining([
        "campaign_location:planar_travel",
        "timeline:location_transition",
      ]),
    );
    expect(byId.get("spell.foresight")?.duration).toEqual({ unit: "hour", amount: 8 });
    expect(byId.get("spell.meteor_swarm")?.runtimeEffect.tags).toEqual(
      expect.arrayContaining([
        "area:four_points",
        "damage:fire",
        "damage:bludgeoning",
        "partial_success:half_damage",
      ]),
    );
    expect(byId.get("spell.shapechange")?.runtimeEffect.tags).toEqual(
      expect.arrayContaining([
        "form_replacement:stat_block",
        "concentration_lifecycle:form_reverts",
      ]),
    );
  });

  it("keeps every P6 monster executable through common action ids, hooks, and audit metadata", () => {
    const activeAbilities = P6_MONSTER_ABILITY_DEFINITIONS.filter((entry) => entry.trigger === "action");
    expect(activeAbilities).toHaveLength(P6_EXECUTABLE_MONSTER_IDS.length);

    for (const monsterId of P6_EXECUTABLE_MONSTER_IDS) {
      const abilities = P6_MONSTER_ABILITY_DEFINITIONS.filter(
        (entry) => entry.levelRequirement.monsterId === monsterId,
      );
      expect(abilities).toHaveLength(2);
      expect(abilities.some((entry) => entry.trigger === "action")).toBe(true);
      expect(abilities.some((entry) => entry.trigger === "always")).toBe(true);
    }

    for (const ability of activeAbilities) {
      expect(ability.runtimeEffect.type).toBe("monster_ability");
      expect(ability.runtimeEffect.hookId).toMatch(/^hook\.monster\./);
      expect(ability.runtimeEffect.tags).toEqual(
        expect.arrayContaining([
          "p6_content",
          "final_srd_monster_manifest",
          "audit:turn_log_state_diff",
        ]),
      );
      expect(ability.runtimeEffect.tags.some((tag) => tag.startsWith("srd_action_id:action."))).toBe(true);
      expect(ability.cost.type).toBe("action");
      expect(ability.targeting.type).toMatch(/^(creature|area)$/);
    }
  });

  it("marks representative P6 ancient dragon bosses as legendary/lair candidates", () => {
    const ancientBossAbilities = P6_MONSTER_ABILITY_DEFINITIONS.filter(
      (entry) =>
        entry.trigger === "action" &&
        typeof entry.levelRequirement.monsterId === "string" &&
        entry.levelRequirement.monsterId.includes("ancient_"),
    );
    expect(ancientBossAbilities.length).toBeGreaterThanOrEqual(5);
    expect(ancientBossAbilities.every((entry) => entry.runtimeEffect.tags.includes("legendary_or_lair_candidate"))).toBe(true);
    expect(ancientBossAbilities.every((entry) => entry.runtimeEffect.tags.some((tag) => tag.startsWith("legendary_like:")))).toBe(true);
    expect(ancientBossAbilities.every((entry) => entry.runtimeEffect.tags.some((tag) => tag.startsWith("lair:")))).toBe(true);
    expect(ancientBossAbilities.every((entry) => entry.runtimeEffect.tags.some((tag) => tag.startsWith("phase:")))).toBe(true);
  });

  it("marks three P6 final validation boss families with legendary, lair, and phase semantics", () => {
    for (const monsterId of [
      "monster.ancient_gold_dragon",
      "monster.mummy_lord",
      "monster.guardian_naga",
    ]) {
      const action = P6_MONSTER_ABILITY_DEFINITIONS.find(
        (entry) => entry.trigger === "action" && entry.levelRequirement.monsterId === monsterId,
      );
      expect(action?.runtimeEffect.tags).toEqual(
        expect.arrayContaining(["legendary_or_lair_candidate"]),
      );
      expect(action?.runtimeEffect.tags.some((tag) => tag.startsWith("legendary_like:"))).toBe(true);
      expect(action?.runtimeEffect.tags.some((tag) => tag.startsWith("lair:"))).toBe(true);
      expect(action?.runtimeEffect.tags.some((tag) => tag.startsWith("phase:"))).toBe(true);
    }
  });
});
