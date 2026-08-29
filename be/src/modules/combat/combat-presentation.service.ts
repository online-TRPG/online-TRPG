import { Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  type CombatPresentationConditionChangeV1,
  type CombatPresentationDamageModifier,
  type CombatPresentationDelivery,
  type CombatPresentationImpactV1,
  type CombatPresentationOutcome,
  type CombatPresentationV1,
  decodeCombatPresentationV1,
  isRecord,
} from "@trpg/shared-types";

type PresentationContext = {
  outcome: ActionOutcome;
  diceResult?: unknown;
  sourceParticipantId?: string | null;
};

@Injectable()
export class CombatPresentationService {
  attachToStructuredAction(
    structuredAction: unknown,
    context: PresentationContext,
  ): unknown {
    if (!isRecord(structuredAction)) {
      return structuredAction;
    }

    if (structuredAction.presentationV1 !== undefined) {
      try {
        decodeCombatPresentationV1(structuredAction.presentationV1);
        const { presentationResults: _presentationResults, ...persisted } =
          structuredAction;
        return persisted;
      } catch {
        // Invalid presentation data must not prevent the authoritative TurnLog.
      }
    }

    const presentation = this.derivePresentation(structuredAction, context);
    const { presentationResults: _presentationResults, presentationV1: _presentationV1, ...persisted } =
      structuredAction;
    return presentation ? { ...persisted, presentationV1: presentation } : persisted;
  }

  private derivePresentation(
    action: Record<string, unknown>,
    context: PresentationContext,
  ): CombatPresentationV1 | null {
    const type = this.readString(action.type);
    if (type === "attack") {
      return this.deriveAttack(action, context);
    }
    if (type === "spell_cast") {
      return this.deriveSpell(action, context);
    }
    if (type === "monster_area_attack") {
      return this.deriveMonsterAreaAttack(action);
    }
    if (type === "monster_area_control") {
      return this.deriveMonsterAreaControl(action);
    }
    if (type === "use_class_feature") {
      return this.deriveClassFeature(action);
    }
    if (type === "combat_damage_adjustment") {
      return this.deriveDamageAdjustment(action);
    }
    if (type === "combat_dodge" || type === "combat_hide" || type === "monster_special") {
      return this.deriveConditionAction(action, context);
    }
    if (type === "gm_override") {
      return this.deriveGmOverride(action);
    }
    return null;
  }

  private deriveGmOverride(
    action: Record<string, unknown>,
  ): CombatPresentationV1 | null {
    const kind = this.readString(action.kind);
    const targetParticipantId = this.readString(action.targetId);
    const metadata = isRecord(action.metadata) ? action.metadata : {};
    if (!targetParticipantId) return null;

    if (kind === "adjust_hp") {
      const previousHp = this.readNonNegativeInteger(metadata.previousHp);
      const nextHp = this.readNonNegativeInteger(metadata.nextHp);
      if (previousHp === null || nextHp === null) return null;
      const healing = nextHp >= previousHp;
      const amount = Math.abs(nextHp - previousHp);
      return this.validate({
        schemaVersion: 1,
        sourceParticipantId: null,
        delivery: "aura",
        presetId: healing ? "gm.healing" : "gm.damage",
        impacts: [{
          targetParticipantId,
          outcome: "applied",
          damagePackets: healing
            ? []
            : [{
                damageType: "untyped",
                rolledAmount: amount,
                appliedAmount: amount,
                modifiers: [],
              }],
          healingPackets: healing
            ? [{ kind: "hp", rolledAmount: amount, appliedAmount: amount }]
            : [],
          conditionChanges: [],
        }],
      });
    }

    if (kind === "set_condition") {
      const conditionId = this.readString(metadata.conditionId);
      if (!conditionId) return null;
      return this.validate({
        schemaVersion: 1,
        sourceParticipantId: null,
        delivery: "aura",
        presetId: "gm.condition",
        impacts: [{
          targetParticipantId,
          outcome: "applied",
          damagePackets: [],
          healingPackets: [],
          conditionChanges: [{
            operation: metadata.operation === "remove" ? "removed" : "added",
            conditionId: this.normalizeConditionId(conditionId),
          }],
        }],
      });
    }
    return null;
  }

  private deriveAttack(
    action: Record<string, unknown>,
    context: PresentationContext,
  ): CombatPresentationV1 | null {
    const sourceParticipantId = this.readString(action.attackerParticipantId);
    const targetParticipantId = this.readString(action.targetParticipantId);
    if (!sourceParticipantId || !targetParticipantId) {
      return null;
    }

    const hit = typeof action.hit === "boolean"
      ? action.hit
      : context.outcome === ActionOutcome.SUCCESS;
    const critical = action.criticalHit === true;
    const appliedAmount = this.readNonNegativeInteger(action.damageTotal) ??
      (action.attackTotal === undefined
        ? this.readDiceTotal(context.diceResult)
        : 0) ??
      0;
    const rolledAmount = this.readNonNegativeInteger(action.rolledDamageTotal) ?? appliedAmount;
    const damageType = this.normalizeDamageType(action.damageType);
    const conditionChanges = this.readAppliedCondition(action.appliedCondition);
    const modifiers = this.readDamageModifiers(action.damageModifiers);
    const spellId = this.readString(action.spellId);
    const delivery = spellId
      ? this.resolveSpellDelivery(spellId, action)
      : this.readDelivery(action.delivery) ?? "melee";

    return this.validate({
      schemaVersion: 1,
      sourceParticipantId,
      delivery,
      presetId: spellId ?? `${delivery}.${damageType}`,
      impacts: [{
        targetParticipantId,
        outcome: critical ? "critical" : hit ? "hit" : "miss",
        damagePackets: hit && appliedAmount >= 0
          ? [{ damageType, rolledAmount, appliedAmount, modifiers }]
          : [],
        healingPackets: [],
        conditionChanges: hit ? conditionChanges : [],
      }],
    });
  }

  private deriveSpell(
    action: Record<string, unknown>,
    context: PresentationContext,
  ): CombatPresentationV1 | null {
    const spellId = this.readString(action.spellId) ?? "spell.unknown";
    const sourceParticipantId = this.readString(action.casterParticipantId) ??
      this.readString(action.sourceParticipantId);
    const explicitResults = Array.isArray(action.presentationResults)
      ? action.presentationResults.flatMap((entry) => {
          const impact = this.readPresentationResult(entry);
          return impact ? [impact] : [];
        })
      : [];
    const targetIds = this.readStringArray(action.targetParticipantIds);
    const fallbackTargetId = this.readString(action.targetParticipantId);
    const resolvedTargetIds = targetIds.length
      ? targetIds
      : fallbackTargetId
        ? [fallbackTargetId]
        : [];
    const damageType = this.normalizeDamageType(
      action.damageType ?? (isRecord(action.aoe) ? action.aoe.damageType : undefined),
    );
    const damageTotal = this.readNonNegativeInteger(action.damageTotal);
    const healingKind = this.resolveHealingKind(spellId, action);
    const fallbackImpacts = resolvedTargetIds.map((targetParticipantId, index) => {
      const isFirst = index === 0;
      const damageAmount = isFirst ? damageTotal ?? 0 : 0;
      return {
        targetParticipantId,
        outcome: context.outcome === ActionOutcome.FAILURE ? "miss" : "applied",
        damagePackets: !healingKind && damageTotal !== null
          ? [{
              damageType,
              rolledAmount: damageAmount,
              appliedAmount: damageAmount,
              modifiers: [],
            }]
          : [],
        healingPackets: healingKind
          ? [{
              kind: healingKind,
              rolledAmount:
                this.readNonNegativeInteger(action.healingAmount) ??
                this.readNonNegativeInteger(action.healingRolledAmount),
              appliedAmount:
                this.readNonNegativeInteger(action.healingAppliedAmount) ??
                this.readNonNegativeInteger(action.healingAmount) ??
                (healingKind === "revive" ? 1 : 0),
            }]
          : [],
        conditionChanges: this.readConditionChanges(action.conditionChanges),
      } satisfies CombatPresentationImpactV1;
    });
    const impacts = explicitResults.length ? explicitResults : fallbackImpacts;
    const publicPoint = this.readPoint(action.point);
    if (!impacts.length && !publicPoint) {
      return null;
    }

    return this.validate({
      schemaVersion: 1,
      sourceParticipantId,
      delivery: this.resolveSpellDelivery(spellId, action),
      presetId: spellId,
      ...(publicPoint ? { publicPoint } : {}),
      impacts,
    });
  }

  private deriveMonsterAreaAttack(
    action: Record<string, unknown>,
  ): CombatPresentationV1 | null {
    const sourceParticipantId = this.readString(action.actorParticipantId);
    const damageType = this.normalizeDamageType(action.damageType);
    const targetResults = Array.isArray(action.targetResults)
      ? action.targetResults
      : [];
    const impacts = targetResults.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }
      const targetParticipantId = this.readString(entry.targetId);
      if (!targetParticipantId) {
        return [];
      }
      const saved = isRecord(entry.savingThrow) && entry.savingThrow.success === true;
      const appliedAmount = this.readNonNegativeInteger(entry.finalDamage) ?? 0;
      const rolledAmount = this.readNonNegativeInteger(entry.baseDamage) ?? appliedAmount;
      return [{
        targetParticipantId,
        outcome: saved ? "saved" : "failed_save",
        damagePackets: [{
          damageType,
          rolledAmount,
          appliedAmount,
          modifiers: [
            ...(saved && appliedAmount > 0 ? ["saved_half" as const] : []),
            ...this.readRuleResultDamageModifiers(entry.ruleResults),
          ],
        }],
        healingPackets: [],
        conditionChanges: [],
      } satisfies CombatPresentationImpactV1];
    });
    if (!impacts.length) {
      return null;
    }
    return this.validate({
      schemaVersion: 1,
      sourceParticipantId,
      delivery: this.resolveAreaDelivery(action.shape),
      presetId: this.readString(action.actionId) ?? "monster.area_attack",
      impacts,
    });
  }

  private deriveMonsterAreaControl(
    action: Record<string, unknown>,
  ): CombatPresentationV1 | null {
    const targetIds = this.readStringArray(action.affectedTargetIds);
    const conditions = this.readStringArray(action.conditionRiders)
      .map((conditionId) => ({
        operation: "added" as const,
        conditionId: this.normalizeConditionId(conditionId),
      }));
    if (!targetIds.length || !conditions.length) {
      return null;
    }
    return this.validate({
      schemaVersion: 1,
      sourceParticipantId: this.readString(action.actorParticipantId),
      delivery: "burst",
      presetId: this.readString(action.actionId) ?? "monster.area_control",
      impacts: targetIds.map((targetParticipantId) => ({
        targetParticipantId,
        outcome: "applied",
        damagePackets: [],
        healingPackets: [],
        conditionChanges: conditions,
      })),
    });
  }

  private deriveClassFeature(
    action: Record<string, unknown>,
  ): CombatPresentationV1 | null {
    const featureId = this.readString(action.featureId);
    const sourceParticipantId = this.readString(action.actorParticipantId);
    if (featureId !== "class.fighter.feature.second_wind" || !sourceParticipantId) {
      return null;
    }
    const rolledAmount = this.readNonNegativeInteger(action.healingAmount) ?? 0;
    const appliedAmount = this.readNonNegativeInteger(action.healingAppliedAmount) ?? rolledAmount;
    return this.validate({
      schemaVersion: 1,
      sourceParticipantId,
      delivery: "aura",
      presetId: featureId,
      impacts: [{
        targetParticipantId: sourceParticipantId,
        outcome: "applied",
        damagePackets: [],
        healingPackets: [{ kind: "hp", rolledAmount, appliedAmount }],
        conditionChanges: [],
      }],
    });
  }

  private deriveDamageAdjustment(
    action: Record<string, unknown>,
  ): CombatPresentationV1 | null {
    const targetParticipantId = this.readString(action.targetParticipantId);
    if (!targetParticipantId) {
      return null;
    }
    const amount = this.readNonNegativeInteger(action.amount) ?? 0;
    const healing = action.healing === true;
    return this.validate({
      schemaVersion: 1,
      sourceParticipantId: this.readString(action.sourceParticipantId),
      delivery: "aura",
      presetId: healing ? "gm.healing" : "gm.damage",
      impacts: [{
        targetParticipantId,
        outcome: "applied",
        damagePackets: healing
          ? []
          : [{
              damageType: this.normalizeDamageType(action.damageType),
              rolledAmount: amount,
              appliedAmount: amount,
              modifiers: [],
            }],
        healingPackets: healing
          ? [{
              kind: "hp",
              rolledAmount: amount,
              appliedAmount: this.readNonNegativeInteger(action.appliedAmount) ?? amount,
            }]
          : [],
        conditionChanges: [],
      }],
    });
  }

  private deriveConditionAction(
    action: Record<string, unknown>,
    context: PresentationContext,
  ): CombatPresentationV1 | null {
    const participantId = this.readString(action.actorParticipantId) ??
      this.readString(action.targetParticipantId) ??
      this.readString(context.sourceParticipantId);
    const condition = this.readString(action.condition);
    if (!participantId || !condition || context.outcome === ActionOutcome.FAILURE) {
      return null;
    }
    return this.validate({
      schemaVersion: 1,
      sourceParticipantId: participantId,
      delivery: "aura",
      presetId: this.readString(action.type) ?? "condition",
      impacts: [{
        targetParticipantId: participantId,
        outcome: "applied",
        damagePackets: [],
        healingPackets: [],
        conditionChanges: [{
          operation: "added",
          conditionId: this.normalizeConditionId(condition),
        }],
      }],
    });
  }

  private readPresentationResult(value: unknown): CombatPresentationImpactV1 | null {
    if (!isRecord(value)) {
      return null;
    }
    const targetParticipantId = this.readString(value.targetParticipantId);
    const damageType = this.normalizeDamageType(value.damageType);
    const rolledAmount = this.readNonNegativeInteger(value.rolledAmount);
    const appliedAmount = this.readNonNegativeInteger(value.appliedAmount);
    const healingKind = this.readHealingKind(value.healingKind);
    const outcome = this.readOutcome(value.outcome) ?? "applied";
    return {
      targetParticipantId,
      outcome,
      damagePackets: rolledAmount !== null || appliedAmount !== null
        ? [{
            damageType,
            rolledAmount: rolledAmount ?? appliedAmount ?? 0,
            appliedAmount: appliedAmount ?? rolledAmount ?? 0,
            modifiers: this.readDamageModifiers(value.damageModifiers),
          }]
        : [],
      healingPackets: healingKind
        ? [{
            kind: healingKind,
            rolledAmount: this.readNonNegativeInteger(value.healingRolledAmount),
            appliedAmount: this.readNonNegativeInteger(value.healingAppliedAmount) ?? 0,
          }]
        : [],
      conditionChanges: this.readConditionChanges(value.conditionChanges),
    };
  }

  private readAppliedCondition(value: unknown): CombatPresentationConditionChangeV1[] {
    if (!isRecord(value)) {
      return [];
    }
    const conditionId = this.readString(value.conditionId);
    return conditionId
      ? [{ operation: "added", conditionId: this.normalizeConditionId(conditionId) }]
      : [];
  }

  private readConditionChanges(value: unknown): CombatPresentationConditionChangeV1[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }
      const conditionId = this.readString(entry.conditionId);
      const operation = entry.operation === "removed" ? "removed" : "added";
      return conditionId
        ? [{ operation, conditionId: this.normalizeConditionId(conditionId) }]
        : [];
    });
  }

  private readDamageModifiers(value: unknown): CombatPresentationDamageModifier[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const modifiers = value.flatMap((entry) => {
      if (typeof entry !== "string") {
        return [];
      }
      const normalized = entry.toLowerCase();
      if (normalized.startsWith("resistance:")) return ["resisted" as const];
      if (normalized.startsWith("immunity:")) return ["immune" as const];
      if (normalized.startsWith("vulnerability:")) return ["vulnerable" as const];
      if (normalized === "saved_half") return ["saved_half" as const];
      return [];
    });
    return Array.from(new Set(modifiers));
  }

  private readRuleResultDamageModifiers(value: unknown): CombatPresentationDamageModifier[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return this.readDamageModifiers(
      value.flatMap((entry) => {
        if (!isRecord(entry) || !isRecord(entry.produced)) {
          return [];
        }
        return Array.isArray(entry.produced.appliedDamageModifiers)
          ? entry.produced.appliedDamageModifiers
          : [];
      }),
    );
  }

  private resolveHealingKind(
    spellId: string,
    action: Record<string, unknown>,
  ): "hp" | "temporary_hp" | "revive" | null {
    const explicit = this.readHealingKind(action.healingKind);
    if (explicit) return explicit;
    if (spellId === "spell.revivify") return "revive";
    if (spellId === "spell.cure_wounds" || spellId === "spell.healing_word") return "hp";
    if (this.readNonNegativeInteger(action.temporaryHpAmount) !== null) return "temporary_hp";
    return null;
  }

  private resolveSpellDelivery(
    spellId: string,
    action: Record<string, unknown>,
  ): CombatPresentationDelivery {
    const area = isRecord(action.aoe) ? action.aoe : null;
    const shape = area?.shape ?? action.shape;
    if (shape !== undefined) {
      return this.resolveAreaDelivery(shape);
    }
    if (["spell.burning_hands"].includes(spellId)) return "cone";
    if (["spell.lightning_bolt"].includes(spellId)) return "line";
    if (["spell.fireball", "spell.thunderwave"].includes(spellId)) return "burst";
    if (["spell.moonbeam", "spell.web", "spell.grease"].includes(spellId)) return "ground";
    if (["spell.cure_wounds", "spell.revivify", "spell.shocking_grasp", "spell.inflict_wounds"].includes(spellId)) return "melee";
    if (["spell.healing_word", "spell.guiding_bolt"].includes(spellId)) return "beam";
    if (["spell.magic_missile", "spell.scorching_ray", "spell.fire_bolt", "spell.ray_of_frost"].includes(spellId)) return "projectile";
    return "aura";
  }

  private resolveAreaDelivery(value: unknown): CombatPresentationDelivery {
    if (value === "cone") return "cone";
    if (value === "line") return "line";
    if (value === "sphere" || value === "circle" || value === "cube") return "burst";
    return "ground";
  }

  private readDelivery(value: unknown): CombatPresentationDelivery | null {
    return ["melee", "projectile", "bolt", "beam", "burst", "cone", "line", "aura", "ground"]
      .includes(value as string)
      ? value as CombatPresentationDelivery
      : null;
  }

  private readOutcome(value: unknown): CombatPresentationOutcome | null {
    return ["hit", "miss", "critical", "saved", "failed_save", "applied"]
      .includes(value as string)
      ? value as CombatPresentationOutcome
      : null;
  }

  private readHealingKind(value: unknown): "hp" | "temporary_hp" | "revive" | null {
    return value === "hp" || value === "temporary_hp" || value === "revive"
      ? value
      : null;
  }

  private normalizeDamageType(value: unknown): string {
    const normalized = this.readString(value)?.toLowerCase().replace(/^damage[.:]/, "");
    return normalized || "untyped";
  }

  private normalizeConditionId(value: string): string {
    const normalized = value.trim().toLowerCase();
    const runtimeMap: Record<string, string> = {
      "combat:dodge": "condition.dodge",
      "combat:disengage": "condition.disengage",
      "combat:hidden": "condition.hidden",
      "combat:sleep": "condition.sleep",
      "condition:unconscious": "condition.unconscious",
    };
    if (runtimeMap[normalized]) return runtimeMap[normalized];
    if (normalized.startsWith("condition.")) return normalized;
    if (normalized.startsWith("condition:")) return `condition.${normalized.slice("condition:".length)}`;
    return `condition.${normalized.replace(/[.:]/g, "_")}`;
  }

  private readPoint(value: unknown): { x: number; y: number } | null {
    if (!isRecord(value) || typeof value.x !== "number" || typeof value.y !== "number") {
      return null;
    }
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
      return null;
    }
    return { x: value.x, y: value.y };
  }

  private readDiceTotal(value: unknown): number | null {
    return isRecord(value) ? this.readNonNegativeInteger(value.total) : null;
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.flatMap((entry) => {
          const text = this.readString(entry);
          return text ? [text] : [];
        })
      : [];
  }

  private readNonNegativeInteger(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : null;
  }

  private validate(value: CombatPresentationV1): CombatPresentationV1 | null {
    try {
      return decodeCombatPresentationV1(value);
    } catch {
      return null;
    }
  }
}
