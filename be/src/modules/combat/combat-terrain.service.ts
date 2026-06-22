import { Injectable } from "@nestjs/common";
import type { CombatTerrainEffectResultDto } from "@trpg/shared-types";
import type { ConditionInstance } from "../rules/condition-runtime.service";
import type {
  TerrainEffectResolution,
  TerrainEffectTrigger,
} from "../rules/terrain-effect.service";
import type { CombatTerrainEffectApplication } from "./combat-terrain.types";

@Injectable()
export class CombatTerrainService {
  mergeApplications(
    ...applications: CombatTerrainEffectApplication[]
  ): CombatTerrainEffectApplication {
    const damageRolls = applications.flatMap((application) => application.damageRolls);
    return {
      damageRoll: damageRolls[0]?.roll ?? null,
      damageRolls,
      damageTotal: applications.reduce(
        (total, application) => total + application.damageTotal,
        0,
      ),
      saveRolls: applications.flatMap((application) => application.saveRolls),
      appliedConditionTags: Array.from(
        new Set(applications.flatMap((application) => application.appliedConditionTags)),
      ),
      removedConditionTags: Array.from(
        new Set(applications.flatMap((application) => application.removedConditionTags)),
      ),
      concentrationCheck:
        applications.find((application) => application.concentrationCheck)
          ?.concentrationCheck ?? null,
    };
  }

  emptyApplication(): CombatTerrainEffectApplication {
    return {
      damageRoll: null,
      damageRolls: [],
      damageTotal: 0,
      saveRolls: [],
      appliedConditionTags: [],
      removedConditionTags: [],
      concentrationCheck: null,
    };
  }

  toResult(
    trigger: TerrainEffectTrigger,
    application: CombatTerrainEffectApplication,
  ): CombatTerrainEffectResultDto | null {
    if (
      application.damageRolls.length === 0 &&
      application.appliedConditionTags.length === 0 &&
      application.removedConditionTags.length === 0
    ) {
      return null;
    }
    return {
      trigger,
      damageTotal: application.damageTotal,
      damagePackets: application.damageRolls.map((damage) => ({
        sourceEffectId: damage.sourceEffectId,
        damageType: damage.damageType,
        expression: damage.roll.expression,
        total: damage.roll.total,
      })),
      appliedConditionTags: application.appliedConditionTags,
      removedConditionTags: application.removedConditionTags,
      concentrationMaintained:
        application.concentrationCheck?.concentrationMaintained ?? null,
    };
  }

  resolveMovementResultTrigger(
    application: CombatTerrainEffectApplication,
  ): TerrainEffectTrigger {
    return application.removedConditionTags.length > 0 &&
      application.damageRolls.length === 0 &&
      application.appliedConditionTags.length === 0
      ? "on_exit"
      : "on_enter";
  }

  describeDamage(application: CombatTerrainEffectApplication): string | null {
    if (application.damageRolls.length === 0) {
      return null;
    }
    const packetSummary =
      application.damageRolls.length > 1
        ? ` (${application.damageRolls
            .map((damage) => `${damage.damageType} ${damage.roll.total}`)
            .join(", ")})`
        : "";
    return `지형 피해 ${application.damageTotal}${packetSummary}`;
  }

  describeConditions(application: CombatTerrainEffectApplication): string | null {
    const messages = [
      application.appliedConditionTags.length > 0
        ? `지형 상태 ${application.appliedConditionTags.join(", ")}`
        : null,
      application.removedConditionTags.length > 0
        ? `지형 이탈 해제 ${application.removedConditionTags.join(", ")}`
        : null,
    ];
    return messages.filter((message): message is string => Boolean(message)).join(" / ") || null;
  }

  describeLifecycle(
    label: string,
    application: CombatTerrainEffectApplication,
  ): string | null {
    const summary = [
      this.describeDamage(application),
      this.describeConditions(application),
    ]
      .filter((message): message is string => Boolean(message))
      .join(" / ");
    return summary ? `${label}: ${summary}` : null;
  }

  resolveSaveEnds(
    effect: TerrainEffectResolution,
  ): ConditionInstance["saveEnds"] {
    if (effect.saveDc === null) {
      return null;
    }
    const saveTag = effect.runtimeTags.find((tag) => tag.startsWith("save:"));
    const ability = saveTag?.slice("save:".length);
    if (
      ability !== "str" &&
      ability !== "dex" &&
      ability !== "con" &&
      ability !== "int" &&
      ability !== "wis" &&
      ability !== "cha"
    ) {
      return null;
    }
    return { ability, dc: effect.saveDc };
  }
}
