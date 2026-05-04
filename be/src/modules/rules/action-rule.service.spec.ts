import {
  ActionOutcome,
  DiceAdvantageState,
  DiceRollResponseDto,
} from "@trpg/shared-types";
import { ActionRuleService } from "./action-rule.service";
import { CommandParserService } from "./command-parser.service";
import { DiceService } from "./dice.service";
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
  currentHp: overrides.currentHp ?? 10,
  tempHp: overrides.tempHp ?? 0,
  conditionsJson: overrides.conditionsJson ?? "[]",
  character: {
    id: overrides.character?.id ?? "character-1",
    name: overrides.character?.name ?? "Hero",
    className: overrides.character?.className ?? "fighter",
    maxHp: overrides.character?.maxHp ?? 10,
    abilitiesJson:
      overrides.character?.abilitiesJson ??
      JSON.stringify({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
    proficiencyBonus: overrides.character?.proficiencyBonus ?? 2,
    proficientSkillsJson: overrides.character?.proficientSkillsJson ?? "[]",
    armorClass: overrides.character?.armorClass ?? 10,
    speed: overrides.character?.speed ?? 30,
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
});
