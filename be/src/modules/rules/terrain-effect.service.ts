import { Injectable } from "@nestjs/common";

export type TerrainEffectDefinitionId =
  | "terrain.difficult"
  | "terrain.hazardous"
  | "terrain.obscurement"
  | "terrain.elevation"
  | "terrain.slippery"
  | "terrain.burning"
  | "terrain.poison_cloud"
  | "terrain.moonbeam";

export type TerrainEffectId = "terrain.combined" | TerrainEffectDefinitionId;
export type TerrainEffectTrigger = "on_enter" | "on_turn_start" | "on_turn_end" | "on_exit";

export type TerrainEffectResolution = {
  terrainEffectId: TerrainEffectId;
  movementCostMultiplier: number;
  blocksLineOfSight: boolean;
  lightlyObscured: boolean;
  heavilyObscured: boolean;
  elevationDeltaFt: number;
  saveDc: number | null;
  damage: {
    dice: string;
    type: string;
  } | null;
  damagePackets: Array<{
    sourceEffectId: TerrainEffectDefinitionId;
    dice: string;
    type: string;
  }>;
  conditionTags: string[];
  runtimeTags: string[];
};

const TERRAIN_EFFECTS: Record<TerrainEffectDefinitionId, TerrainEffectResolution> = {
  "terrain.difficult": {
    terrainEffectId: "terrain.difficult",
    movementCostMultiplier: 2,
    blocksLineOfSight: false,
    lightlyObscured: false,
    heavilyObscured: false,
    elevationDeltaFt: 0,
    saveDc: null,
    damage: null,
    damagePackets: [],
    conditionTags: [],
    runtimeTags: ["movement:difficult_terrain"],
  },
  "terrain.hazardous": {
    terrainEffectId: "terrain.hazardous",
    movementCostMultiplier: 1,
    blocksLineOfSight: false,
    lightlyObscured: false,
    heavilyObscured: false,
    elevationDeltaFt: 0,
    saveDc: 12,
    damage: { dice: "1d6", type: "piercing" },
    damagePackets: [
      { sourceEffectId: "terrain.hazardous", dice: "1d6", type: "piercing" },
    ],
    conditionTags: [],
    runtimeTags: ["trigger:on_enter", "damage:hazard"],
  },
  "terrain.obscurement": {
    terrainEffectId: "terrain.obscurement",
    movementCostMultiplier: 1,
    blocksLineOfSight: false,
    lightlyObscured: true,
    heavilyObscured: true,
    elevationDeltaFt: 0,
    saveDc: null,
    damage: null,
    damagePackets: [],
    conditionTags: [],
    runtimeTags: ["vision:obscured"],
  },
  "terrain.elevation": {
    terrainEffectId: "terrain.elevation",
    movementCostMultiplier: 1,
    blocksLineOfSight: false,
    lightlyObscured: false,
    heavilyObscured: false,
    elevationDeltaFt: 10,
    saveDc: null,
    damage: null,
    damagePackets: [],
    conditionTags: [],
    runtimeTags: ["position:elevated"],
  },
  "terrain.slippery": {
    terrainEffectId: "terrain.slippery",
    movementCostMultiplier: 1,
    blocksLineOfSight: false,
    lightlyObscured: false,
    heavilyObscured: false,
    elevationDeltaFt: 0,
    saveDc: 10,
    damage: null,
    damagePackets: [],
    conditionTags: ["condition.prone"],
    runtimeTags: ["trigger:on_enter", "save:dex", "condition:prone"],
  },
  "terrain.burning": {
    terrainEffectId: "terrain.burning",
    movementCostMultiplier: 1,
    blocksLineOfSight: false,
    lightlyObscured: true,
    heavilyObscured: false,
    elevationDeltaFt: 0,
    saveDc: 12,
    damage: { dice: "1d6", type: "fire" },
    damagePackets: [
      { sourceEffectId: "terrain.burning", dice: "1d6", type: "fire" },
    ],
    conditionTags: ["condition.burning"],
    runtimeTags: [
      "trigger:on_enter",
      "trigger:on_turn_start",
      "trigger:on_turn_end",
      "damage:fire",
      "damage_over_time:fire:1d6",
      "condition:burning",
    ],
  },
  "terrain.poison_cloud": {
    terrainEffectId: "terrain.poison_cloud",
    movementCostMultiplier: 1,
    blocksLineOfSight: false,
    lightlyObscured: true,
    heavilyObscured: true,
    elevationDeltaFt: 0,
    saveDc: 13,
    damage: { dice: "1d6", type: "poison" },
    damagePackets: [
      { sourceEffectId: "terrain.poison_cloud", dice: "1d6", type: "poison" },
    ],
    conditionTags: ["condition.poisoned"],
    runtimeTags: [
      "trigger:on_enter",
      "trigger:on_turn_start",
      "trigger:on_exit",
      "save:con",
      "damage:poison",
      "condition:poisoned",
      "condition_ends:on_exit",
    ],
  },
  "terrain.moonbeam": {
    terrainEffectId: "terrain.moonbeam",
    movementCostMultiplier: 1,
    blocksLineOfSight: false,
    lightlyObscured: false,
    heavilyObscured: false,
    elevationDeltaFt: 0,
    saveDc: 13,
    damage: { dice: "2d10", type: "radiant" },
    damagePackets: [
      { sourceEffectId: "terrain.moonbeam", dice: "2d10", type: "radiant" },
    ],
    conditionTags: [],
    runtimeTags: [
      "trigger:on_enter",
      "trigger:on_turn_start",
      "save:con",
      "damage:radiant",
      "half_damage_on_success",
    ],
  },
};

@Injectable()
export class TerrainEffectService {
  listEffects(): TerrainEffectResolution[] {
    return Object.values(TERRAIN_EFFECTS).map((effect) => ({ ...effect }));
  }

  resolveEffect(terrainEffectId: string): TerrainEffectResolution | null {
    const normalized = this.tryNormalizeTerrainEffectId(terrainEffectId);
    if (!normalized) {
      return null;
    }
    const effect = TERRAIN_EFFECTS[normalized];
    return effect ? { ...effect } : null;
  }

  supportsTrigger(
    effect: TerrainEffectResolution,
    trigger: TerrainEffectTrigger,
  ): boolean {
    return effect.runtimeTags.includes(`trigger:${trigger}`);
  }

  resolveCombinedEffects(terrainEffectIds: string[]): TerrainEffectResolution {
    const effects = terrainEffectIds
      .map((id) => this.resolveEffect(id))
      .filter((effect): effect is TerrainEffectResolution => effect !== null);

    return {
      terrainEffectId: "terrain.combined",
      movementCostMultiplier: Math.max(1, ...effects.map((effect) => effect.movementCostMultiplier)),
      blocksLineOfSight: effects.some((effect) => effect.blocksLineOfSight),
      lightlyObscured: effects.some((effect) => effect.lightlyObscured),
      heavilyObscured: effects.some((effect) => effect.heavilyObscured),
      elevationDeltaFt: effects.reduce((sum, effect) => sum + effect.elevationDeltaFt, 0),
      saveDc: this.maxNullable(effects.map((effect) => effect.saveDc)),
      damage: this.pickLargestDamage(effects),
      damagePackets: this.collectDamagePackets(effects),
      conditionTags: Array.from(new Set(effects.flatMap((effect) => effect.conditionTags))),
      runtimeTags: Array.from(new Set(effects.flatMap((effect) => effect.runtimeTags))),
    };
  }

  private normalizeTerrainEffectId(value: string): TerrainEffectDefinitionId {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const withPrefix = normalized.startsWith("terrain.") ? normalized : `terrain.${normalized}`;
    if (!(withPrefix in TERRAIN_EFFECTS)) {
      throw new Error(`Unsupported terrainEffectId: ${value}`);
    }
    return withPrefix as TerrainEffectDefinitionId;
  }

  private tryNormalizeTerrainEffectId(value: string): TerrainEffectDefinitionId | null {
    try {
      return this.normalizeTerrainEffectId(value);
    } catch {
      return null;
    }
  }

  private maxNullable(values: Array<number | null>): number | null {
    const numbers = values.filter((value): value is number => typeof value === "number");
    return numbers.length ? Math.max(...numbers) : null;
  }

  private pickLargestDamage(effects: TerrainEffectResolution[]): TerrainEffectResolution["damage"] {
    const packet = this.collectDamagePackets(effects)[0];
    return packet ? { dice: packet.dice, type: packet.type } : null;
  }

  private collectDamagePackets(
    effects: TerrainEffectResolution[],
  ): TerrainEffectResolution["damagePackets"] {
    const bySource = new Map<
      TerrainEffectDefinitionId,
      TerrainEffectResolution["damagePackets"][number]
    >();
    for (const effect of effects) {
      for (const packet of effect.damagePackets) {
        if (!bySource.has(packet.sourceEffectId)) {
          bySource.set(packet.sourceEffectId, { ...packet });
        }
      }
    }
    return Array.from(bySource.values()).sort((left, right) =>
      left.sourceEffectId.localeCompare(right.sourceEffectId),
    );
  }
}
