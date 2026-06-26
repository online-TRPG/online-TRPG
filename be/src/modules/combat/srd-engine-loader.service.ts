import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SrdEngineExecutableMonsterAction,
  SrdEngineMonsterCombatStats,
  SrdEngineMonsterProfile,
} from "./srd-engine.types";

const MVP_MONSTER_ACTION_PREFERENCES: Record<string, string[]> = {
  "monster.giant_rat": ["action.bite"],
  "monster.giant_spider": ["action.web", "action.bite"],
  "monster.goblin": ["action.scimitar"],
  "monster.orc": ["action.greataxe", "action.javelin"],
  "monster.wolf": ["action.bite"],
  "monster.skeleton": ["action.shortbow", "action.shortsword"],
  "monster.zombie": ["action.slam"],
  "monster.brown_bear": ["action.multiattack", "action.claws", "action.bite"],
  "monster.red_dragon_wyrmling": ["action.fire_breath", "action.bite"],
  "monster.cultist": ["action.scimitar"],
  "monster.ogre": ["action.greatclub", "action.javelin"],
  "monster.kobold": ["action.dagger", "action.sling"],
  "monster.bandit": ["action.scimitar", "action.light_crossbow"],
  "monster.bugbear": ["action.morningstar", "action.javelin"],
  "monster.hobgoblin": ["action.longsword", "action.longbow"],
  "monster.dire_wolf": ["action.bite"],
  "monster.ghoul": ["action.claws", "action.bite"],
  "monster.wight": ["action.life_drain", "action.longsword", "action.longbow"],
  "monster.mimic": ["action.pseudopod", "action.bite"],
  "monster.gelatinous_cube": ["action.pseudopod"],
  "monster.swarm_of_rats": ["action.bites"],
  "monster.animated_armor": ["action.slam"],
  "monster.gargoyle": ["action.bite", "action.claws"],
  "monster.harpy": ["action.claws", "action.club"],
  "monster.giant_scorpion": ["action.claw", "action.sting"],
  "monster.young_red_dragon": ["action.fire_breath", "action.bite", "action.claw"],
};

@Injectable()
export class SrdEngineLoaderService {
  private monsterProfiles: Map<string, SrdEngineMonsterProfile> | null = null;

  getMonsterProfile(monsterId: string | null | undefined): SrdEngineMonsterProfile | null {
    if (!monsterId) {
      return null;
    }
    return this.getMonsterProfiles().get(monsterId) ?? null;
  }

  getMonsterCombatStats(monsterId: string | null | undefined): SrdEngineMonsterCombatStats | null {
    const profile = this.getMonsterProfile(monsterId);
    if (!profile) {
      return null;
    }

    const maxHp = this.asPositiveInteger(profile.statBlock?.hitPoints?.average);
    const armorClass = this.asPositiveInteger(profile.statBlock?.armorClass?.value);
    const speedFt = this.asPositiveInteger(profile.statBlock?.speed?.modes?.walk?.ft);
    if (!maxHp || !armorClass || !speedFt) {
      return null;
    }

    return { currentHp: maxHp, maxHp, armorClass, speedFt };
  }

  getExecutableMonsterActions(monsterId: string | null | undefined): SrdEngineExecutableMonsterAction[] {
    const profile = this.getMonsterProfile(monsterId);
    if (!profile) {
      return [];
    }

    const executableActions: SrdEngineExecutableMonsterAction[] = [];
    for (const action of profile.features?.actions ?? []) {
      const parsed = action.combatParsed;
      const firstDamage = parsed?.damage?.[0];
      const attackBonus = parsed?.attackRoll?.toHit;
      const damageDice = firstDamage?.dice?.trim();
      if (
        parsed?.isAttack !== true ||
        parsed.confidence !== "high" ||
        typeof attackBonus !== "number" ||
        !parsed.attackKind ||
        !damageDice
      ) {
        continue;
      }

      executableActions.push({
        monsterId: profile.id,
        actionId: action.id,
        label: action.rawName ?? action.nameEn ?? action.id,
        attackKind: parsed.attackKind,
        attackBonus,
        damageDice,
        damageType: firstDamage?.type ?? null,
        reachFt: parsed.range?.reachFt ?? null,
        rangeFt: parsed.range?.rangeFt
          ? {
              normal: parsed.range.rangeFt.normal ?? null,
              long: parsed.range.rangeFt.long ?? null,
            }
          : null,
        confidence: parsed.confidence,
      });
    }

    return executableActions;
  }

  chooseMvpMonsterAction(
    monsterId: string | null | undefined,
    preferredActionId?: string | null,
  ): SrdEngineExecutableMonsterAction | null {
    const actions = this.getExecutableMonsterActions(monsterId);
    if (!actions.length) {
      return null;
    }

    if (preferredActionId) {
      const preferred = actions.find((action) => action.actionId === preferredActionId);
      if (preferred) {
        return preferred;
      }
    }

    for (const actionId of MVP_MONSTER_ACTION_PREFERENCES[monsterId ?? ""] ?? []) {
      const action = actions.find((candidate) => candidate.actionId === actionId);
      if (action) {
        return action;
      }
    }

    return actions[0] ?? null;
  }

  private getMonsterProfiles(): Map<string, SrdEngineMonsterProfile> {
    if (this.monsterProfiles) {
      return this.monsterProfiles;
    }

    const filePath = this.resolveMonsterFilePath();
    if (!filePath) {
      this.monsterProfiles = new Map();
      return this.monsterProfiles;
    }

    const profiles = new Map<string, SrdEngineMonsterProfile>();
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const profile = JSON.parse(trimmed) as SrdEngineMonsterProfile;
      profiles.set(profile.id, profile);
    }

    this.monsterProfiles = profiles;
    return profiles;
  }

  private resolveMonsterFilePath(): string | null {
    const candidatePaths = [
      join(process.cwd(), "srd-data", "generated", "srd-engine", "monsters.jsonl"),
      join(process.cwd(), "..", "srd-data", "generated", "srd-engine", "monsters.jsonl"),
      join(process.cwd(), "..", "..", "srd-data", "generated", "srd-engine", "monsters.jsonl"),
    ];
    return candidatePaths.find((candidate) => existsSync(candidate)) ?? null;
  }

  private asPositiveInteger(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
  }
}
