import {
  ActionOutcome,
  DiceAdvantageState,
  DiceRollResponseDto,
} from "@trpg/shared-types";
import { ActionRuleService } from "./action-rule.service";
import { CommandParserService } from "./command-parser.service";
import { DiceService } from "./dice.service";
import { MapPositionService } from "./map-position.service";
import { RuleEngineService } from "./rule-engine.service";
import { RULE_HOOK_IDS } from "./rule-engine.types";

type TestSessionCharacter = Parameters<ActionRuleService["resolveAction"]>[1];
type TestSessionCharacterOverrides = Omit<Partial<TestSessionCharacter>, "character"> & {
  character?: Partial<TestSessionCharacter["character"]>;
};

const createDiceResult = (
  rolls: number[],
  modifier: number,
  advantageState: DiceAdvantageState = DiceAdvantageState.NORMAL,
): DiceRollResponseDto => ({
  expression: `1d20${modifier >= 0 ? "+" : ""}${modifier}`,
  rolls,
  modifier,
  total: selectedTotal(rolls, modifier, advantageState),
  advantageState,
});

const selectedTotal = (
  rolls: number[],
  modifier: number,
  advantageState: DiceAdvantageState,
): number => {
  if (advantageState === DiceAdvantageState.ADVANTAGE) {
    return Math.max(...rolls) + modifier;
  }
  if (advantageState === DiceAdvantageState.DISADVANTAGE) {
    return Math.min(...rolls) + modifier;
  }
  return rolls.reduce((sum, value) => sum + value, 0) + modifier;
};

const createCharacter = (
  overrides: TestSessionCharacterOverrides = {},
): TestSessionCharacter => ({
  id: overrides.id ?? "session-character-1",
  characterId: overrides.characterId ?? "character-1",
  combatParticipantId: overrides.combatParticipantId ?? null,
  currentHp: overrides.currentHp ?? 10,
  tempHp: overrides.tempHp ?? 0,
  conditionsJson: overrides.conditionsJson ?? "[]",
  inventorySnapshotJson: overrides.inventorySnapshotJson ?? null,
  inventoryEntries: overrides.inventoryEntries ?? [],
  character: {
    id: overrides.character?.id ?? "character-1",
    name: overrides.character?.name ?? "Hero",
    className: overrides.character?.className ?? "fighter",
    subclassName: overrides.character?.subclassName ?? null,
    level: overrides.character?.level ?? 1,
    maxHp: overrides.character?.maxHp ?? 10,
    abilitiesJson:
      overrides.character?.abilitiesJson ??
      JSON.stringify({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
    proficiencyBonus: overrides.character?.proficiencyBonus ?? 2,
    featuresJson: overrides.character?.featuresJson ?? "[]",
    proficientSkillsJson: overrides.character?.proficientSkillsJson ?? "[]",
    armorClass: overrides.character?.armorClass ?? 10,
    speed: overrides.character?.speed ?? 30,
    inventoryJson: overrides.character?.inventoryJson ?? "[]",
    equippedWeaponId: overrides.character?.equippedWeaponId ?? null,
  },
});

describe("ActionRuleService", () => {
  const createService = (rolls: DiceRollResponseDto[]): ActionRuleService => {
    const diceService = {
      roll: jest.fn(() => {
        const result = rolls.shift();
        if (!result) {
          throw new Error("No mocked dice result remained.");
        }
        return result;
      }),
    } as unknown as DiceService;

    return new ActionRuleService(
      new CommandParserService(),
      diceService,
      new RuleEngineService(),
      new MapPositionService(),
    );
  };

  it("uses the P0 attack hook so natural 20 hits even against high AC", () => {
    const service = createService([
      createDiceResult([20], 2),
      {
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({ id: "actor", characterId: "actor-character" });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 10,
      character: { id: "target-character", name: "Target", armorClass: 30 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      targetArmorClass: number;
      finalDamage: number;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.targetArmorClass).toBe(30);
    expect(structuredAction.finalDamage).toBe(4);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 6, markDead: false },
    ]);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL,
      produced: { criticalHit: true, hit: true },
    });
    expect(structuredAction.ruleResults[1]).toMatchObject({
      hookId: RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
      produced: { finalDamage: 4 },
    });
  });

  it("returns combat participant patches when attacking a hostile combat target", () => {
    const service = createService([
      createDiceResult([15], 2),
      {
        expression: "1d6",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({ id: "actor", characterId: "actor-character" });
    const target = createCharacter({
      id: "combat-goblin",
      characterId: "combat-goblin",
      combatParticipantId: "combat-goblin",
      currentHp: 7,
      character: {
        id: "combat-goblin",
        name: "Goblin",
        className: "monster",
        armorClass: 12,
        maxHp: 7,
      },
    });

    const result = service.resolveAction("/attack Goblin", actor, [actor, target]);

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      { combatParticipantId: "combat-goblin", currentHp: 2, markDead: false },
    ]);
  });

  it("uses the P0 attack hook so natural 1 misses even with a high total", () => {
    const service = createService([createDiceResult([1], 12)]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { proficiencyBonus: 12 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      ruleResults: Array<{ produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.FAILURE);
    expect(result.stateChanges).toEqual([]);
    expect(structuredAction.ruleResults[0].produced).toMatchObject({
      criticalMiss: true,
      hit: false,
    });
  });

  it("applies prone modifiers before resolving an attack", () => {
    const service = createService([
      createDiceResult([3, 18], 2, DiceAdvantageState.ADVANTAGE),
      {
        expression: "1d6",
        rolls: [2],
        modifier: 0,
        total: 2,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({ id: "actor", characterId: "actor-character" });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      conditionsJson: JSON.stringify(["prone"]),
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      advantageState: DiceAdvantageState;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.diceResult?.advantageState).toBe(DiceAdvantageState.ADVANTAGE);
    expect(structuredAction.advantageState).toBe(DiceAdvantageState.ADVANTAGE);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.APPLY_PRONE_MODIFIERS,
      produced: { incomingAttackAdvantageState: "advantage" },
    });
    expect(structuredAction.ruleResults[1]).toMatchObject({
      hookId: RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL,
    });
  });

  it("automatically applies rogue sneak attack to a qualifying hit", () => {
    const service = createService([
      createDiceResult([16], 2),
      {
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "1d6",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "rogue", level: 2 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 12,
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      finalDamage: number;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.finalDamage).toBe(9);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "actor",
        conditions: ["resource:sneak_attack_expended"],
      },
      { sessionCharacterId: "target", currentHp: 3, markDead: false },
    ]);
    expect(structuredAction.ruleResults.map((ruleResult) => ruleResult.hookId)).toEqual([
      RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL,
      RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
      RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
    ]);
  });

  it("connects ranger archery fighting style to attack resolution", () => {
    const service = createService([
      createDiceResult([13], 4),
      {
        expression: "1d6",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "ranger", level: 2, proficiencyBonus: 2 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 10,
      character: { id: "target-character", name: "Target", armorClass: 16 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.ruleResults.map((ruleResult) => ruleResult.hookId)).toEqual([
      RULE_HOOK_IDS.APPLY_RANGER_ARCHERY_FIGHTING_STYLE,
      RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL,
      RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
    ]);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      produced: { attackBonusDelta: 2, finalAttackBonus: 4, fightingStyleApplied: true },
    });
    expect(structuredAction.ruleResults[1]).toMatchObject({
      produced: { attackRollTotal: 17, hit: true },
    });
  });

  it("connects ranger natural explorer to survival checks", () => {
    const service = createService([createDiceResult([8], 7)]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        className: "ranger",
        level: 2,
        abilitiesJson: JSON.stringify({ str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 }),
        proficiencyBonus: 2,
        proficientSkillsJson: JSON.stringify(["survival"]),
      },
    });

    const result = service.resolveAction("/check survival 15", actor, [actor]);
    const structuredAction = result.structuredAction as {
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.APPLY_RANGER_NATURAL_EXPLORER_CHECK,
      produced: { checkModifierDelta: 2, finalCheckModifier: 7, naturalExplorerApplied: true },
    });
  });

  it("connects rogue cunning action to the class feature flow", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "rogue", level: 2 },
    });

    const result = service.resolveAction("/feature cunning_action hide", actor, [actor]);
    const structuredAction = result.structuredAction as {
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "actor",
        conditions: ["cunning_action:hide"],
      },
    ]);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.APPLY_CUNNING_ACTION,
      produced: { grantedActionType: "hide", bonusActionSpent: true },
    });
  });

  it("applies damage modifiers before HP changes", () => {
    const service = createService([]);
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 10,
      conditionsJson: JSON.stringify(["resistance:fire"]),
      character: { id: "target-character", name: "Target" },
    });

    const result = service.resolveAction("/damage target 9 fire", target, [target]);
    const structuredAction = result.structuredAction as {
      damageType: string;
      finalDamage: number;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.damageType).toBe("fire");
    expect(structuredAction.finalDamage).toBe(4);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 6, tempHp: 0, markDead: false },
    ]);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
      produced: {
        finalDamage: 4,
        appliedDamageModifiers: ["resistance:fire"],
      },
    });
  });

  it("connects chill touch spell casting to attack, spell, and damage hooks", () => {
    const service = createService([
      createDiceResult([18], 2),
      {
        expression: "1d8",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard" },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 10,
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/cast chill_touch target 90", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      spellId: string;
      damageType: string;
      finalDamage: number;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.spellId).toBe("spell.chill_touch");
    expect(structuredAction.damageType).toBe("necrotic");
    expect(structuredAction.finalDamage).toBe(5);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 5, markDead: false },
    ]);
    expect(structuredAction.ruleResults.map((ruleResult) => ruleResult.hookId)).toEqual([
      RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL,
      RULE_HOOK_IDS.CAST_CHILL_TOUCH,
      RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
    ]);
  });

  it("rejects chill touch before rolling when the target is out of range", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard" },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/cast chill_touch target 125", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      ruleResults: Array<{ hookId: string; rejectedReason: string | null }>;
    };

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.diceResult).toBeNull();
    expect(result.stateChanges).toEqual([]);
    expect(structuredAction.ruleResults).toEqual([
      {
        hookId: RULE_HOOK_IDS.CAST_CHILL_TOUCH,
        accepted: false,
        produced: {
          validatedSpellCast: false,
          "damagePacket.necrotic": null,
          healingBlockedUntil: null,
          undeadAttackDisadvantage: false,
        },
        statePatch: [],
        turnLogEvents: [{ type: "spell_cast_rejected", public: true }],
        rejectedReason: "target_out_of_range",
      },
    ]);
  });

  it("connects fire bolt to attack, spell, and damage hooks", () => {
    const service = createService([
      createDiceResult([18], 2),
      {
        expression: "1d10",
        rolls: [7],
        modifier: 0,
        total: 7,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard" },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 10,
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/cast fire_bolt target 90", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      spellId: string;
      damageType: string;
      finalDamage: number;
      ruleResults: Array<{ hookId: string }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.spellId).toBe("spell.fire_bolt");
    expect(structuredAction.damageType).toBe("fire");
    expect(structuredAction.finalDamage).toBe(7);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 3, markDead: false },
    ]);
    expect(structuredAction.ruleResults.map((ruleResult) => ruleResult.hookId)).toEqual([
      RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL,
      RULE_HOOK_IDS.CAST_FIRE_BOLT,
      RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
    ]);
  });

  it("connects magic missile to automatic force damage", () => {
    const service = createService([
      {
        expression: "1d4+1",
        rolls: [2],
        modifier: 1,
        total: 3,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "1d4+1",
        rolls: [3],
        modifier: 1,
        total: 4,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "1d4+1",
        rolls: [4],
        modifier: 1,
        total: 5,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({ id: "actor", characterId: "actor-character" });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 15,
      character: { id: "target-character", name: "Target" },
    });

    const result = service.resolveAction("/cast magic_missile target", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      finalDamage: number;
      ruleResults: Array<{ hookId: string }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.finalDamage).toBe(12);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 3, markDead: false },
    ]);
    expect(structuredAction.ruleResults.map((ruleResult) => ruleResult.hookId)).toEqual([
      RULE_HOOK_IDS.CAST_MAGIC_MISSILE,
      RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
    ]);
  });

  it("connects cure wounds to capped healing", () => {
    const service = createService([
      {
        expression: "1d8+2",
        rolls: [6],
        modifier: 2,
        total: 8,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({ id: "actor", characterId: "actor-character" });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 5,
      character: { id: "target-character", name: "Target", maxHp: 10 },
    });

    const result = service.resolveAction("/cast cure_wounds target 5", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([{ sessionCharacterId: "target", currentHp: 10 }]);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.CAST_CURE_WOUNDS,
      produced: { hitPointsRestored: 5, newHitPoints: 10 },
    });
  });

  it("connects potion of healing to item healing", () => {
    const service = createService([
      {
        expression: "2d4+2",
        rolls: [3, 4],
        modifier: 2,
        total: 9,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      currentHp: 2,
      character: { maxHp: 8 },
    });

    const result = service.resolveAction("/item potion actor", actor, [actor]);
    const structuredAction = result.structuredAction as {
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([{ sessionCharacterId: "actor", currentHp: 8 }]);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.USE_POTION_OF_HEALING,
      produced: { hitPointsRestored: 6, newHitPoints: 8, itemConsumed: true },
    });
  });

  it("connects champion critical threshold to attack resolution", () => {
    const service = createService([
      createDiceResult([19], 2),
      {
        expression: "1d6",
        rolls: [3],
        modifier: 0,
        total: 3,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "fighter champion", level: 3 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 10,
      character: { id: "target-character", name: "Target", armorClass: 30 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.APPLY_CRITICAL_THRESHOLD_MODIFIER,
      produced: { criticalThreshold: 19, criticalHit: true },
    });
    expect(structuredAction.ruleResults[1]).toMatchObject({
      hookId: RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL,
      produced: { criticalHit: true, hit: true },
    });
  });

  it("connects second wind to class feature action flow", () => {
    const service = createService([
      {
        expression: "1d10",
        rolls: [7],
        modifier: 0,
        total: 7,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      currentHp: 5,
      character: { className: "fighter", level: 5, maxHp: 20 },
    });

    const result = service.resolveAction("/feature second_wind", actor, [actor]);
    const structuredAction = result.structuredAction as {
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "actor",
        currentHp: 17,
        conditions: ["resource:second_wind_expended"],
      },
    ]);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_SECOND_WIND" },
      { type: "SPEND_BONUS_ACTION" },
    ]);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.APPLY_SECOND_WIND,
      produced: { hitPointsRestored: 12, newHitPoints: 17 },
    });
  });

  it("uses runtime resource state to reject second wind before rolling", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      currentHp: 5,
      character: { className: "fighter", level: 5, maxHp: 20 },
    });

    const result = service.resolveAction("/feature second_wind", actor, [actor], {
      resource: {
        secondWindAvailable: false,
        actionSurgeUses: 1,
        rageUses: 0,
        rageActive: false,
        frenzyActive: false,
        exhaustionLevel: 0,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.diceResult).toBeNull();
    expect(result.runtimeEffects).toBeUndefined();
  });

  it("uses runtime turn state to reject bonus-action class features", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      currentHp: 5,
      character: { className: "fighter", level: 5, maxHp: 20 },
    });

    const result = service.resolveAction("/feature second_wind", actor, [actor], {
      resource: {
        secondWindAvailable: true,
        actionSurgeUses: 1,
        rageUses: 0,
        rageActive: false,
        frenzyActive: false,
        exhaustionLevel: 0,
      },
      turnState: {
        actionUsed: false,
        bonusActionUsed: true,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.narration).toBe("사용 가능한 bonus action이 없습니다.");
  });

  it("connects rage to condition tags consumed by damage modifiers", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      conditionsJson: JSON.stringify(["armor:medium", "concentration"]),
      character: { className: "barbarian", level: 3 },
    });

    const result = service.resolveAction("/feature rage", actor, [actor]);

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.runtimeEffects).toEqual([
      { type: "START_RAGE" },
      { type: "SPEND_BONUS_ACTION" },
    ]);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "actor",
        conditions: [
          "armor:medium",
          "resource:rage_expended",
          "rage",
          "resistance:bludgeoning",
          "resistance:piercing",
          "resistance:slashing",
        ],
      },
    ]);
  });

  it("connects cunning action to the runtime bonus action effect", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "rogue", level: 2 },
    });

    const result = service.resolveAction("/feature cunning_action hide", actor, [actor], {
      turnState: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });
    const structuredAction = result.structuredAction as {
      option: string;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([]);
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_BONUS_ACTION" }]);
    expect(structuredAction.option).toBe("hide");
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.APPLY_CUNNING_ACTION,
      produced: { grantedActionType: "hide" },
    });
  });

  it("applies sneak attack on an advantaged finesse weapon hit", () => {
    const service = createService([
      createDiceResult([6, 18], 2, DiceAdvantageState.ADVANTAGE),
      {
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "2d6",
        rolls: [3, 4],
        modifier: 0,
        total: 7,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        className: "rogue",
        level: 3,
        equippedWeaponId: "rapier-1",
        inventoryJson: JSON.stringify([
          {
            id: "rapier-1",
            name: "Rapier",
            quantity: 1,
            damageDice: "1d6",
            damageType: "piercing",
            properties: ["finesse"],
          },
        ]),
      },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 20,
      conditionsJson: JSON.stringify(["prone"]),
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target], {
      turnState: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });
    const structuredAction = result.structuredAction as {
      damageType: string;
      finalDamage: number;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "SPEND_SNEAK_ATTACK" },
    ]);
    expect(structuredAction.damageType).toBe("piercing");
    expect(structuredAction.finalDamage).toBe(11);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 9, markDead: false },
    ]);
    expect(structuredAction.ruleResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hookId: RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
          produced: expect.objectContaining({
            sneakAttackDamage: 7,
            sneakAttackExpendedThisTurn: true,
          }),
        }),
      ]),
    );
  });

  it("uses InventoryEntry and ItemDefinition when resolving an equipped weapon", () => {
    const service = createService([
      createDiceResult([8, 18], 2, DiceAdvantageState.ADVANTAGE),
      {
        expression: "1d8",
        rolls: [8],
        modifier: 0,
        total: 8,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "2d6",
        rolls: [3, 4],
        modifier: 0,
        total: 7,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      inventoryEntries: [
        {
          id: "inventory-entry-rapier",
          itemDefinitionId: "item.rapier",
          itemDefinition: {
            id: "item.rapier",
            itemType: "weapon",
            damageDice: "1d8",
            damageType: "piercing",
            propertiesJson: JSON.stringify(["finesse"]),
          },
        },
      ],
      character: {
        className: "rogue",
        level: 3,
        equippedWeaponId: "item.rapier",
        inventoryJson: "[]",
      },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 20,
      conditionsJson: JSON.stringify(["prone"]),
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target], {
      turnState: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });
    const structuredAction = result.structuredAction as {
      damageType: string;
      damageRoll: DiceRollResponseDto;
      finalDamage: number;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.damageType).toBe("piercing");
    expect(structuredAction.damageRoll.expression).toBe("1d8");
    expect(structuredAction.finalDamage).toBe(15);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 5, markDead: false },
    ]);
    expect(structuredAction.ruleResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hookId: RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
          accepted: true,
        }),
      ]),
    );
  });

  it("applies sneak attack when an actor ally is within 5 feet of the target", () => {
    const service = createService([
      createDiceResult([18], 2),
      {
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "2d6",
        rolls: [2, 3],
        modifier: 0,
        total: 5,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        className: "rogue",
        level: 3,
        equippedWeaponId: "rapier-1",
        inventoryJson: JSON.stringify([
          {
            id: "rapier-1",
            name: "Rapier",
            quantity: 1,
            damageDice: "1d6",
            damageType: "piercing",
            properties: ["finesse"],
          },
        ]),
      },
    });
    const ally = createCharacter({
      id: "ally",
      characterId: "ally-character",
      character: { id: "ally-character", name: "Ally" },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 20,
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, ally, target], {
      map: {
        gridType: "square",
        gridSize: 64,
        tokens: [
          {
            sessionCharacterId: "actor",
            x: 0,
            y: 0,
            size: 64,
            hidden: false,
            isHostile: false,
          },
          {
            sessionCharacterId: "ally",
            x: 64,
            y: 0,
            size: 64,
            hidden: false,
            isHostile: false,
          },
          {
            sessionCharacterId: "target",
            x: 128,
            y: 0,
            size: 64,
            hidden: false,
            isHostile: true,
          },
        ],
      },
      turnState: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });
    const structuredAction = result.structuredAction as {
      finalDamage: number;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "SPEND_SNEAK_ATTACK" },
    ]);
    expect(structuredAction.finalDamage).toBe(9);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 11, markDead: false },
    ]);
    expect(structuredAction.ruleResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hookId: RULE_HOOK_IDS.APPLY_SNEAK_ATTACK,
          accepted: true,
          produced: expect.objectContaining({
            sneakAttackDamage: 5,
            sneakAttackExpendedThisTurn: true,
          }),
        }),
      ]),
    );
  });

  it("connects frenzy to the runtime character resource effect", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "barbarian berserker", level: 3 },
    });

    const result = service.resolveAction("/feature frenzy", actor, [actor], {
      resource: {
        secondWindAvailable: true,
        actionSurgeUses: 0,
        rageUses: 1,
        rageActive: true,
        frenzyActive: false,
        exhaustionLevel: 0,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.runtimeEffects).toEqual([{ type: "START_FRENZY" }]);
    expect(result.structuredAction).toMatchObject({
      featureId: "class.barbarian.subclass_feature.frenzy",
    });
  });

  it("rejects frenzy when rage is not active", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "barbarian berserker", level: 3 },
    });

    const result = service.resolveAction("/feature frenzy", actor, [actor], {
      resource: {
        secondWindAvailable: true,
        actionSurgeUses: 0,
        rageUses: 1,
        rageActive: false,
        frenzyActive: false,
        exhaustionLevel: 0,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.runtimeEffects).toEqual([]);
    expect(result.narration).toBe("Frenzy는 Rage 상태에서만 사용할 수 있습니다.");
  });

  it("recovers short rest resources without changing HP", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      currentHp: 5,
      conditionsJson: JSON.stringify([
        "resource:second_wind_expended",
        "action_surge:additional_action_granted",
        "blessed",
      ]),
      character: { className: "fighter", level: 5, maxHp: 20 },
    });

    const result = service.resolveAction("/rest short", actor, [actor]);

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "actor",
        conditions: ["blessed"],
      },
    ]);
    expect(result.runtimeEffects).toEqual([
      {
        type: "RECOVER_SHORT_REST",
        actionSurgeUses: 1,
      },
    ]);
    expect(result.structuredAction).toMatchObject({
      type: "rest",
      restType: "short",
      recoveredResources: {
        secondWindAvailable: true,
        actionSurgeUses: 1,
      },
    });
  });

  it("recovers long rest HP, class resources, and clears Rage tags", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      currentHp: 3,
      tempHp: 4,
      conditionsJson: JSON.stringify([
        "resource:rage_expended",
        "rage",
        "resistance:slashing",
        "poisoned",
      ]),
      character: { className: "barbarian", level: 6, maxHp: 50 },
    });

    const result = service.resolveAction("/rest long", actor, [actor]);

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "actor",
        currentHp: 50,
        tempHp: 0,
        conditions: ["poisoned"],
        markDead: false,
      },
    ]);
    expect(result.runtimeEffects).toEqual([
      {
        type: "RECOVER_LONG_REST",
        actionSurgeUses: 0,
        rageUses: 4,
        reduceExhaustionBy: 1,
      },
    ]);
  });

  it("rejects rest while combat is active", () => {
    const service = createService([]);
    const actor = createCharacter({ id: "actor", characterId: "actor-character" });

    const result = service.resolveAction("/rest long", actor, [actor], {
      hasActiveCombat: true,
    });

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.stateChanges).toEqual([]);
    expect(result.runtimeEffects).toEqual([]);
    expect(result.narration).toBe("전투 중에는 휴식을 진행할 수 없습니다.");
  });

  it("rejects attack when the runtime turn state has no available action", () => {
    const service = createService([]);
    const actor = createCharacter({ id: "actor", characterId: "actor-character" });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target], {
      turnState: {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.diceResult).toBeNull();
    expect(result.narration).toBe("사용 가능한 action이 없습니다.");
  });
});
