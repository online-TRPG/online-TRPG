import { Injectable } from "@nestjs/common";
import {
  isRecord,
  parseJsonWithDecoder,
} from "@trpg/shared-types";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SrdEngineDamageEntry,
  SrdEngineExecutableMonsterAction,
  SrdEngineMonsterCombatStats,
  SrdEngineMonsterAction,
  SrdEngineMonsterProfile,
  SrdEngineActionConfidence,
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
      const profile = parseJsonWithDecoder(trimmed, decodeSrdEngineMonsterProfile, "srd engine monster profile");
      if (profile) {
        profiles.set(profile.id, profile);
      }
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

function decodeSrdEngineMonsterProfile(value: unknown): SrdEngineMonsterProfile | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.type !== "monster" || typeof value.schemaVersion !== "string") {
    return null;
  }
  const name = decodeMonsterName(value.name);
  if (!name) {
    return null;
  }
  const statBlock = decodeMonsterStatBlock(value.statBlock);
  const features = decodeMonsterFeatures(value.features);
  return {
    id: value.id,
    type: "monster",
    schemaVersion: value.schemaVersion,
    name,
    ...(statBlock ? { statBlock } : {}),
    ...(features ? { features } : {}),
  };
}

function decodeMonsterName(value: unknown): SrdEngineMonsterProfile["name"] | null {
  if (!isRecord(value) || typeof value.en !== "string") {
    return null;
  }
  const aliases = Array.isArray(value.aliases) ? decodeStringArray(value.aliases) : undefined;
  return {
    en: value.en,
    ...(typeof value.ko === "string" || value.ko === null ? { ko: value.ko } : {}),
    ...(aliases ? { aliases } : {}),
  };
}

function decodeMonsterStatBlock(value: unknown): SrdEngineMonsterProfile["statBlock"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const armorClass = decodeArmorClass(value.armorClass);
  const hitPoints = decodeHitPoints(value.hitPoints);
  const speed = decodeMonsterSpeed(value.speed);
  return {
    ...(armorClass ? { armorClass } : {}),
    ...(hitPoints ? { hitPoints } : {}),
    ...(speed ? { speed } : {}),
  };
}

function decodeArmorClass(value: unknown): NonNullable<NonNullable<SrdEngineMonsterProfile["statBlock"]>["armorClass"]> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const armorClassValue = readPositiveInteger(value.value);
  const decoded = {
    ...(armorClassValue !== undefined ? { value: armorClassValue } : {}),
    ...(typeof value.raw === "string" ? { raw: value.raw } : {}),
  };
  return Object.keys(decoded).length ? decoded : undefined;
}

function decodeHitPoints(value: unknown): NonNullable<NonNullable<SrdEngineMonsterProfile["statBlock"]>["hitPoints"]> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const average = readPositiveInteger(value.average);
  const decoded = {
    ...(average !== undefined ? { average } : {}),
    ...(typeof value.formula === "string" ? { formula: value.formula } : {}),
    ...(typeof value.raw === "string" ? { raw: value.raw } : {}),
  };
  return Object.keys(decoded).length ? decoded : undefined;
}

function decodeMonsterSpeed(value: unknown): NonNullable<SrdEngineMonsterProfile["statBlock"]>["speed"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const modes = isRecord(value.modes)
    ? Object.fromEntries(
        Object.entries(value.modes).flatMap(([key, mode]) => {
          if (!isRecord(mode)) {
            return [];
          }
          const ft = readPositiveInteger(mode.ft);
          return ft !== undefined ? [[key, { ft }] as const] : [];
        }),
      )
    : undefined;
  return {
    ...(modes && Object.keys(modes).length ? { modes } : {}),
    ...(typeof value.raw === "string" ? { raw: value.raw } : {}),
  };
}

function decodeMonsterFeatures(value: unknown): SrdEngineMonsterProfile["features"] | undefined {
  if (!isRecord(value) || !Array.isArray(value.actions)) {
    return undefined;
  }
  return {
    actions: value.actions.flatMap((action) => {
      const decoded = decodeMonsterAction(action);
      return decoded ? [decoded] : [];
    }),
  };
}

function decodeMonsterAction(value: unknown): SrdEngineMonsterAction | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }
  const combatParsed = decodeCombatParsedAction(value.combatParsed);
  return {
    id: value.id,
    ...(typeof value.nameEn === "string" ? { nameEn: value.nameEn } : {}),
    ...(typeof value.rawName === "string" ? { rawName: value.rawName } : {}),
    ...(typeof value.rawText === "string" ? { rawText: value.rawText } : {}),
    ...(combatParsed ? { combatParsed } : {}),
  };
}

function decodeCombatParsedAction(value: unknown): SrdEngineMonsterAction["combatParsed"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const confidence = isActionConfidence(value.confidence)
    ? value.confidence
    : undefined;
  return {
    ...(typeof value.isAttack === "boolean" ? { isAttack: value.isAttack } : {}),
    ...(typeof value.attackKind === "string" || value.attackKind === null ? { attackKind: value.attackKind } : {}),
    ...(isRecord(value.attackRoll) ? { attackRoll: decodeAttackRoll(value.attackRoll) } : {}),
    ...(isRecord(value.range) ? { range: decodeActionRange(value.range) } : {}),
    ...(Array.isArray(value.damage) ? { damage: value.damage.flatMap(decodeDamageEntryEntry) } : {}),
    ...(confidence ? { confidence } : {}),
  };
}

function isActionConfidence(value: unknown): value is SrdEngineActionConfidence {
  return value === "high" || value === "medium" || value === "low" || value === "none";
}

function decodeAttackRoll(value: Record<string, unknown>): NonNullable<NonNullable<SrdEngineMonsterAction["combatParsed"]>["attackRoll"]> {
  const toHit = readFiniteInteger(value.toHit);
  return {
    ...(toHit !== undefined ? { toHit } : {}),
    ...(typeof value.raw === "string" ? { raw: value.raw } : {}),
  };
}

function decodeActionRange(value: Record<string, unknown>): NonNullable<NonNullable<SrdEngineMonsterAction["combatParsed"]>["range"]> {
  const normalRangeFt = isRecord(value.rangeFt) ? readNonNegativeInteger(value.rangeFt.normal) : undefined;
  const longRangeFt = isRecord(value.rangeFt) ? readNonNegativeInteger(value.rangeFt.long) : undefined;
  const reachFt = readNonNegativeInteger(value.reachFt);
  const rangeFt = isRecord(value.rangeFt)
    ? {
        ...(normalRangeFt !== undefined ? { normal: normalRangeFt } : {}),
        ...(longRangeFt !== undefined ? { long: longRangeFt } : {}),
      }
    : undefined;
  return {
    ...(reachFt !== undefined ? { reachFt } : {}),
    ...(rangeFt ? { rangeFt } : {}),
  };
}

function decodeDamageEntry(value: unknown): SrdEngineDamageEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const average = readNonNegativeFiniteNumber(value.average);
  return {
    ...(average !== undefined ? { average } : {}),
    ...(typeof value.dice === "string" ? { dice: value.dice } : {}),
    ...(typeof value.type === "string" ? { type: value.type } : {}),
    ...(typeof value.raw === "string" ? { raw: value.raw } : {}),
  };
}

function decodeDamageEntryEntry(value: unknown): SrdEngineDamageEntry[] {
  const decoded = decodeDamageEntry(value);
  return decoded ? [decoded] : [];
}

function decodeStringArray(value: readonly unknown[]): string[] {
  return value.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
}

function readNonNegativeFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readFiniteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
