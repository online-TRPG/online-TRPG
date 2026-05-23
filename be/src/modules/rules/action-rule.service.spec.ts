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
): TestSessionCharacter => {
  const userId = overrides.userId ?? "user-1";
  const characterName = overrides.character?.name ?? "Hero";

  return {
    id: overrides.id ?? "session-character-1",
    userId,
    characterId: overrides.characterId ?? "character-1",
    currentHp: overrides.currentHp ?? 10,
    tempHp: overrides.tempHp ?? 0,
    conditionsJson: overrides.conditionsJson ?? "[]",
    inventorySnapshotJson: overrides.inventorySnapshotJson ?? null,
    inventoryEntries: overrides.inventoryEntries ?? [],
    user:
      overrides.user !== undefined
        ? overrides.user
        : {
            id: userId,
            displayName: `${characterName}User`,
            profile: null,
          },
    character: {
      id: overrides.character?.id ?? "character-1",
      name: characterName,
      className: overrides.character?.className ?? "fighter",
      level: overrides.character?.level ?? 1,
      maxHp: overrides.character?.maxHp ?? 10,
      abilitiesJson:
        overrides.character?.abilitiesJson ??
        JSON.stringify({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
      proficiencyBonus: overrides.character?.proficiencyBonus ?? 2,
      proficientSkillsJson: overrides.character?.proficientSkillsJson ?? "[]",
      armorClass: overrides.character?.armorClass ?? 10,
      speed: overrides.character?.speed ?? 30,
      inventoryJson: overrides.character?.inventoryJson ?? "[]",
      equippedWeaponId: overrides.character?.equippedWeaponId ?? null,
    },
  };
};

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

  it("resolves attack targets by participant display name", () => {
    const service = createService([
      createDiceResult([18], 2),
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
      userId: "actor-user",
      characterId: "actor-character",
    });
    const target = createCharacter({
      id: "target",
      userId: "target-user",
      characterId: "target-character",
      currentHp: 10,
      user: {
        id: "target-user",
        displayName: "B_user_변경",
        profile: null,
      },
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/attack B_user_변경", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      target: string;
      finalDamage: number;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.target).toBe("target");
    expect(structuredAction.finalDamage).toBe(3);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 7, markDead: false },
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

  it("projects structured condition tags into damage modifiers", () => {
    const service = createService([]);
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 10,
      conditionsJson: JSON.stringify([
        {
          conditionId: "elemental-ward",
          sourceId: "spell-1",
          duration: { type: "rounds", remaining: 2 },
          tags: ["resistance:fire"],
        },
      ]),
      character: { id: "target-character", name: "Target" },
    });

    const result = service.resolveAction("/damage target 9 fire", target, [target]);
    const structuredAction = result.structuredAction as {
      finalDamage: number;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(structuredAction.finalDamage).toBe(4);
    expect(structuredAction.ruleResults[0]).toMatchObject({
      hookId: RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
      produced: {
        appliedDamageModifiers: ["resistance:fire"],
      },
    });
  });

  it("resolves damage targets by profile nickname", () => {
    const service = createService([]);
    const target = createCharacter({
      id: "target",
      userId: "target-user",
      characterId: "target-character",
      currentHp: 10,
      user: {
        id: "target-user",
        displayName: "TargetUser",
        profile: { nickname: "B_user_변경" },
      },
      character: { id: "target-character", name: "Target" },
    });

    const result = service.resolveAction("/damage B_user_변경 2", target, [target]);
    const structuredAction = result.structuredAction as {
      target: string;
      finalDamage: number;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.target).toBe("target");
    expect(structuredAction.finalDamage).toBe(2);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 8, tempHp: 0, markDead: false },
    ]);
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

  it("does not apply sneak attack automatically on an advantaged finesse weapon hit", () => {
    const service = createService([
      createDiceResult([6, 18], 2, DiceAdvantageState.ADVANTAGE),
      {
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
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
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_ACTION" }]);
    expect(structuredAction.damageType).toBe("piercing");
    expect(structuredAction.finalDamage).toBe(4);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 16, markDead: false },
    ]);
    expect(structuredAction.ruleResults).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hookId: RULE_HOOK_IDS.APPLY_SNEAK_ATTACK }),
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
    expect(structuredAction.finalDamage).toBe(8);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 12, markDead: false },
    ]);
    expect(structuredAction.ruleResults).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hookId: RULE_HOOK_IDS.APPLY_SNEAK_ATTACK }),
      ]),
    );
  });

  it("grants attack advantage when an actor ally is within 5 feet of the target", () => {
    const service = createService([
      createDiceResult([18], 2),
      {
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
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
      advantageState: DiceAdvantageState;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_ACTION" }]);
    expect(structuredAction.advantageState).toBe(DiceAdvantageState.ADVANTAGE);
    expect(structuredAction.finalDamage).toBe(4);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 16, markDead: false },
    ]);
    expect(structuredAction.ruleResults).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hookId: RULE_HOOK_IDS.APPLY_SNEAK_ATTACK }),
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

  it("recovers short rest action surge from catalog feature ids", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        className: "warrior",
        level: 2,
        featuresJson: JSON.stringify(["class.fighter.feature.action_surge"]),
      },
    });

    const result = service.resolveAction("/rest short", actor, [actor]);

    expect(result.runtimeEffects).toEqual([
      {
        type: "RECOVER_SHORT_REST",
        actionSurgeUses: 1,
      },
    ]);
    expect(result.structuredAction).toMatchObject({
      recoveredResources: {
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

  it("recovers long rest rage uses from catalog feature ids", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      currentHp: 1,
      character: {
        className: "berserker",
        level: 3,
        maxHp: 30,
        featuresJson: JSON.stringify(["class.barbarian.feature.rage"]),
      },
    });

    const result = service.resolveAction("/rest long", actor, [actor]);

    expect(result.runtimeEffects).toEqual([
      {
        type: "RECOVER_LONG_REST",
        actionSurgeUses: 0,
        rageUses: 3,
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
