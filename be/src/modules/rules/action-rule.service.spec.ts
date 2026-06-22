import {
  ActionOutcome,
  DiceAdvantageState,
  DiceRollResponseDto,
  GamePhase,
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
      subclassName: overrides.character?.subclassName ?? null,
      level: overrides.character?.level ?? 1,
      maxHp: overrides.character?.maxHp ?? 10,
      abilitiesJson:
        overrides.character?.abilitiesJson ??
        JSON.stringify({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
      proficiencyBonus: overrides.character?.proficiencyBonus ?? 2,
      featuresJson: overrides.character?.featuresJson ?? null,
      proficientSkillsJson: overrides.character?.proficientSkillsJson ?? "[]",
      armorClass: overrides.character?.armorClass ?? 10,
      speed: overrides.character?.speed ?? 30,
      spellsJson: overrides.character?.spellsJson ?? null,
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

  it("exposes ready action in combat action availability", () => {
    const service = createService([]);

    expect(
      service.getAvailableActions({
        phase: GamePhase.COMBAT,
        isCurrentTurn: true,
        hasActiveCombat: true,
        isAlive: true,
      }).map((action) => action.code),
    ).toEqual(["MOVE", "ATTACK", "CHECK", "READY", "END_TURN"]);
  });

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

  it("adds Guidance to the next ability check and consumes the effect", () => {
    const service = createService([
      createDiceResult([10], 0),
      {
        expression: "1d4",
        rolls: [3],
        modifier: 0,
        total: 3,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      conditionsJson: JSON.stringify([
        {
          conditionId: "condition.spell.guidance",
          sourceId: "spell.guidance:caster",
          duration: { type: "rounds", remaining: 10 },
          saveEnds: null,
          stackPolicy: "replace",
          appliedAtRound: 1,
          expiresAtTurn: null,
          tags: ["roll_bonus:ability_check:1d4"],
        },
      ]),
    });

    const result = service.resolveAction(
      "/check perception 12",
      actor,
      [actor],
      { turnState: { actionUsed: false, bonusActionUsed: false, reactionUsed: false, additionalActionGranted: false, sneakAttackUsed: false } },
    );

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.diceResult).toMatchObject({
      expression: "1d20+0+1d4",
      total: 13,
    });
    expect(result.structuredAction).toMatchObject({ guidanceBonus: 3 });
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: actor.id, conditions: [] },
    ]);
  });

  it("rerolls a selected natural 1 for a halfling attack", () => {
    const service = createService([
      createDiceResult([1], 2),
      createDiceResult([15], 2),
      {
        expression: "1d6",
        rolls: [4],
        modifier: 0,
        total: 4,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "halfling",
      character: {
        id: "halfling-character",
        featuresJson: JSON.stringify(["race.halfling.trait.base_traits"]),
      },
    });
    const target = createCharacter({
      id: "target",
      currentHp: 10,
      character: { id: "target-character", name: "Target", armorClass: 12 },
    });

    const result = service.resolveAction("/attack target", actor, [actor, target]);

    expect(result.diceResult).toMatchObject({ rolls: [15], total: 17 });
    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 6, markDead: false },
    ]);
  });

  it("resolves condition command targets by VTT token id aliases", () => {
    const service = createService([]);
    const actor = createCharacter({ id: "actor", characterId: "actor-character" });
    const target = {
      ...createCharacter({
        id: "target",
        characterId: "target-character",
        conditionsJson: "[]",
        character: { id: "target-character", name: "Smoke Goblin" },
      }),
      tokenId: "token_node_rule_smoke_condition_goblin",
    } as TestSessionCharacter & { tokenId: string };

    const result = service.resolveAction(
      "/condition add token_node_rule_smoke_condition_goblin stunned",
      actor,
      [actor, target],
    );

    expect(result.structuredAction).toMatchObject({
      type: "condition",
      operation: "add",
      target: "target",
      condition: "stunned",
    });
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", conditions: ["stunned"] },
    ]);
  });

  it("resolves condition command targets to combat participant state patches", () => {
    const service = createService([]);
    const actor = createCharacter({ id: "actor", characterId: "actor-character" });
    const target = {
      ...createCharacter({
        id: "combat-participant:monster-participant-1",
        userId: "combat-participant:monster-participant-1",
        characterId: "combat-participant:monster-participant-1",
        conditionsJson: "[]",
        character: {
          id: "combat-participant:monster-participant-1",
          name: "Smoke Goblin",
          className: "monster",
        },
        user: null,
      }),
      tokenId: "token_node_rule_smoke_condition_goblin",
      combatParticipantId: "monster-participant-1",
      isCombatParticipantOnly: true,
    } as TestSessionCharacter & {
      tokenId: string;
      combatParticipantId: string;
      isCombatParticipantOnly: boolean;
    };

    const result = service.resolveAction(
      "/condition add token_node_rule_smoke_condition_goblin stunned",
      actor,
      [actor, target],
    );

    expect(result.structuredAction).toMatchObject({
      type: "condition",
      target: "combat-participant:monster-participant-1",
      condition: "stunned",
    });
    expect(result.stateChanges).toEqual([
      { combatParticipantId: "monster-participant-1", conditions: ["stunned"] },
    ]);
  });

  it("creates a pending ready action from command actions", () => {
    const service = createService([]);
    const actor = createCharacter({ id: "actor", userId: "user-1" });

    const result = service.resolveAction("/ready enter attack monster-1 30", actor, [actor], {
      hasActiveCombat: true,
      combat: {
        combatId: "combat-1",
        roundNo: 2,
        turnNo: 3,
        actorParticipantId: "participant-1",
      },
      turnState: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });

    expect(result).toMatchObject({
      diceResult: null,
      outcome: ActionOutcome.NO_ROLL,
      narration: "준비행동을 설정했습니다.",
      stateChanges: [],
    });
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      {
        type: "STORE_READY_ACTION",
        pending: expect.objectContaining({
          id: "reaction:ready:participant-1:2:3",
          actorParticipantId: "participant-1",
        }),
      },
    ]);
    expect(result.structuredAction).toMatchObject({
      type: "ready_action",
      pendingReadyAction: {
        id: "reaction:ready:participant-1:2:3",
        actorParticipantId: "participant-1",
        actorUserId: "user-1",
        combatId: "combat-1",
        trigger: {
          type: "creature_enters_range",
          targetParticipantId: "monster-1",
          rangeFt: 30,
        },
        heldAction: {
          type: "attack",
          targetParticipantId: "monster-1",
        },
      },
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

  it("applies racial damage resistance from catalog feature ids", () => {
    const service = createService([]);
    const target = createCharacter({
      id: "tiefling",
      currentHp: 10,
      character: {
        id: "tiefling-character",
        name: "Tiefling",
        featuresJson: JSON.stringify(["race.tiefling.trait.base_traits"]),
      },
    });

    const result = service.resolveAction("/damage tiefling 9 fire", target, [target]);

    expect(result.structuredAction).toMatchObject({
      finalDamage: 4,
      ruleResults: [
        expect.objectContaining({
          produced: expect.objectContaining({
            appliedDamageModifiers: ["resistance:fire"],
          }),
        }),
      ],
    });
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "tiefling", currentHp: 6, tempHp: 0, markDead: false },
    ]);
  });

  it("keeps a half-orc at 1 HP with Relentless Endurance once per long rest", () => {
    const service = createService([]);
    const target = createCharacter({
      id: "half-orc",
      currentHp: 8,
      character: {
        id: "half-orc-character",
        name: "Half-Orc",
        featuresJson: JSON.stringify(["race.half-orc.trait.base_traits"]),
      },
    });

    const result = service.resolveAction("/damage half-orc 20 force", target, [target]);

    expect(result.structuredAction).toMatchObject({
      finalDamage: 20,
      relentlessEnduranceTriggered: true,
    });
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "half-orc",
        currentHp: 1,
        tempHp: 0,
        markDead: false,
        conditions: ["resource:relentless_endurance_expended"],
      },
    ]);
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

  it("rolls concentration checks on direct damage and removes linked effects on failure", () => {
    const service = createService([createDiceResult([7], 2)]);
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 20,
      conditionsJson: JSON.stringify([
        {
          conditionId: "condition.concentration",
          sourceId: "spell.hold_person",
          tags: [
            "concentration",
            "concentration:spell:spell.hold_person",
            "concentration:target:enemy-1",
            "concentration:effect:effect-hold-1",
          ],
        },
        {
          conditionId: "condition.paralyzed",
          sourceId: "effect-hold-1",
        },
        {
          conditionId: "condition.poisoned",
          sourceId: "trap-1",
        },
      ]),
      character: {
        id: "target-character",
        name: "Target",
        abilitiesJson: JSON.stringify({ con: 14 }),
      },
    });

    const result = service.resolveAction("/damage target 30 force", target, [target]);
    const structuredAction = result.structuredAction as {
      concentrationCheck: {
        concentrationMaintained: boolean;
        removedConditions: Array<{ conditionId: string }>;
      };
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.diceResult).toMatchObject({ total: 9 });
    expect(structuredAction.ruleResults[1]).toMatchObject({
      hookId: RULE_HOOK_IDS.RESOLVE_CONCENTRATION_CHECK,
      produced: {
        difficultyClass: 15,
        concentrationMaintained: false,
      },
    });
    expect(structuredAction.concentrationCheck).toMatchObject({
      concentrationMaintained: false,
      removedConditions: [
        { conditionId: "condition.concentration" },
        { conditionId: "condition.paralyzed" },
      ],
    });
    expect(result.stateChanges).toEqual([
      expect.objectContaining({
        sessionCharacterId: "target",
        currentHp: 0,
        tempHp: 0,
        markDead: true,
        conditions: [
          expect.objectContaining({
            conditionId: "condition.poisoned",
            sourceId: "trap-1",
          }),
        ],
      }),
    ]);
  });

  it("resolves saving throws and removes matching save-end structured conditions on success", () => {
    const service = createService([createDiceResult([12], 2)]);
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      conditionsJson: JSON.stringify([
        "combat:hidden",
        {
          conditionId: "condition.poisoned",
          sourceId: "trap-1",
          duration: { type: "permanent" },
          saveEnds: { ability: "con", dc: 13 },
        },
        {
          conditionId: "condition.frightened",
          sourceId: "dragon-1",
          duration: { type: "permanent" },
          saveEnds: { ability: "wis", dc: 15 },
        },
      ]),
      character: {
        id: "target-character",
        name: "Target",
        abilitiesJson: JSON.stringify({ con: 14, wis: 8 }),
      },
    });

    const result = service.resolveAction("/save target con 13 poisoned", target, [target]);

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.diceResult).toMatchObject({ total: 14 });
    expect(result.structuredAction).toMatchObject({
      type: "saving_throw",
      target: "target",
      ability: "con",
      dc: 13,
      condition: "poisoned",
      expiredConditions: [
        expect.objectContaining({
          conditionId: "condition.poisoned",
          sourceId: "trap-1",
        }),
      ],
    });
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "target",
        conditions: [
          "combat:hidden",
          expect.objectContaining({
            conditionId: "condition.frightened",
            sourceId: "dragon-1",
            saveEnds: { ability: "wis", dc: 15 },
          }),
        ],
      },
    ]);
  });

  it("uses dwarf poison save advantage from the race catalog", () => {
    const service = createService([
      createDiceResult([5, 15], 2, DiceAdvantageState.ADVANTAGE),
    ]);
    const target = createCharacter({
      id: "dwarf",
      character: {
        id: "dwarf-character",
        name: "Dwarf",
        abilitiesJson: JSON.stringify({ con: 14 }),
        featuresJson: JSON.stringify(["race.dwarf.trait.base_traits"]),
      },
    });

    const result = service.resolveAction("/save dwarf con 13 poisoned", target, [target]);

    expect(result.diceResult).toMatchObject({
      advantageState: DiceAdvantageState.ADVANTAGE,
      rolls: [5, 15],
      total: 17,
    });
    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
  });

  it.each([
    ["elf", "race.elf.trait.base_traits", "wis", "charmed"],
    ["half-elf", "race.half-elf.trait.base_traits", "wis", "charmed"],
    ["gnome", "race.gnome.trait.base_traits", "wis", "magic"],
  ])(
    "uses %s racial save advantage from catalog runtime tags",
    (id, featureId, ability, condition) => {
      const service = createService([
        createDiceResult([4, 14], 0, DiceAdvantageState.ADVANTAGE),
      ]);
      const target = createCharacter({
        id,
        character: {
          id: `${id}-character`,
          name: id,
          abilitiesJson: JSON.stringify({ [ability]: 10 }),
          featuresJson: JSON.stringify([featureId]),
        },
      });

      const result = service.resolveAction(
        `/save ${id} ${ability} 12 ${condition}`,
        target,
        [target],
      );

      expect(result.diceResult).toMatchObject({
        advantageState: DiceAdvantageState.ADVANTAGE,
        total: 14,
      });
      expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    },
  );

  it("resolves dragonborn breath as a save-based area race feature", () => {
    const service = createService([
      {
        expression: "2d6",
        rolls: [3, 4],
        modifier: 0,
        total: 7,
        advantageState: DiceAdvantageState.NORMAL,
      },
      createDiceResult([5], 0),
      createDiceResult([6], 0),
    ]);
    const actor = createCharacter({
      id: "dragonborn",
      character: {
        id: "dragonborn-character",
        name: "Dragonborn",
        abilitiesJson: JSON.stringify({ con: 14 }),
        proficiencyBonus: 2,
        featuresJson: JSON.stringify([
          "race.dragonborn.trait.base_traits",
          "draconic_ancestry:red",
        ]),
      },
    });
    const target = createCharacter({
      id: "target",
      currentHp: 10,
      character: {
        id: "target-character",
        name: "Target",
        abilitiesJson: JSON.stringify({ dex: 10 }),
      },
    });
    const secondTarget = createCharacter({
      id: "target-two",
      currentHp: 10,
      character: {
        id: "target-two-character",
        name: "Target Two",
        abilitiesJson: JSON.stringify({ dex: 10 }),
      },
    });

    const result = service.resolveAction(
      "/feature breath_weapon target",
      actor,
      [actor, target, secondTarget],
      {
        map: {
          gridType: "square",
          gridSize: 50,
          tokens: [
            {
              sessionCharacterId: "dragonborn",
              x: 0,
              y: 0,
              size: 50,
              hidden: false,
              isHostile: false,
            },
            {
              sessionCharacterId: "target",
              x: 50,
              y: 0,
              size: 50,
              hidden: false,
              isHostile: true,
            },
            {
              sessionCharacterId: "target-two",
              x: 100,
              y: 50,
              size: 50,
              hidden: false,
              isHostile: true,
            },
          ],
        },
      },
    );

    expect(result.structuredAction).toMatchObject({
      type: "use_race_feature",
      featureId: "race.dragonborn.trait.base_traits",
      damageType: "fire",
      damageDice: "2d6",
      saveDc: 12,
      targetIds: ["target", "target-two"],
    });
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "dragonborn",
        conditions: ["resource:dragonborn_breath_expended"],
      },
      {
        sessionCharacterId: "target",
        currentHp: 3,
        markDead: false,
      },
      {
        sessionCharacterId: "target-two",
        currentHp: 3,
        markDead: false,
      },
    ]);
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_ACTION" }]);
  });

  it("keeps save-end conditions when the saving throw fails", () => {
    const service = createService([createDiceResult([4], 2)]);
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      conditionsJson: JSON.stringify([
        {
          conditionId: "condition.poisoned",
          sourceId: "trap-1",
          duration: { type: "permanent" },
          saveEnds: { ability: "con", dc: 13 },
        },
      ]),
      character: {
        id: "target-character",
        name: "Target",
        abilitiesJson: JSON.stringify({ con: 14 }),
      },
    });

    const result = service.resolveAction("/save target con 13 poisoned", target, [target]);

    expect(result.outcome).toBe(ActionOutcome.FAILURE);
    expect(result.stateChanges).toEqual([]);
    expect(result.structuredAction).toMatchObject({
      type: "saving_throw",
      expiredConditions: [],
    });
  });

  it("resolves item drop commands into inventory removal and map object metadata", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        inventoryJson: JSON.stringify([
          {
            id: "entry-dagger",
            itemDefinitionId: "equipment.dagger",
            name: "Dagger",
            quantity: 2,
            damageDice: "1d4",
            damageType: "piercing",
            properties: ["finesse", "light", "thrown"],
          },
        ]),
      },
    });

    const result = service.resolveAction("/item drop entry-dagger 1 1 0", actor, [actor], {
      map: {
        gridType: "square",
        gridSize: 50,
        tokens: [
          { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
        ],
      },
    });
    const structuredAction = result.structuredAction as {
      result: {
        createObject: {
          itemDefinitionId: string;
          name: string;
          quantity: number;
          point: { x: number; y: number };
        };
        distanceFt: number;
      };
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.result.createObject).toEqual({
      itemDefinitionId: "equipment.dagger",
      name: "Dagger",
      quantity: 1,
      point: { x: 1, y: 0 },
    });
    expect(structuredAction.result.distanceFt).toBe(5);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "REMOVE_ITEM", itemId: "entry-dagger", quantity: 1 },
      {
        type: "CREATE_MAP_OBJECT",
        objectId: "object:item:entry-dagger:1:0",
        itemDefinitionId: "equipment.dagger",
        name: "Dagger",
        quantity: 1,
        point: { x: 1, y: 0 },
      },
    ]);
  });

  it("rejects item drop commands when no action is available", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        inventoryJson: JSON.stringify([
          {
            id: "entry-dagger",
            itemDefinitionId: "equipment.dagger",
            name: "Dagger",
            quantity: 2,
          },
        ]),
      },
    });

    const result = service.resolveAction("/item drop entry-dagger 1 1 0", actor, [actor], {
      map: {
        gridType: "square",
        gridSize: 50,
        tokens: [
          { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
        ],
      },
      turnState: {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.structuredAction).toMatchObject({
      type: "item_interaction",
      operation: "drop",
      itemId: "entry-dagger",
    });
    expect(result.runtimeEffects).toEqual([]);
  });

  it("resolves item pickup commands into inventory addition and map object removal metadata", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
    });

    const result = service.resolveAction(
      "/item pickup object-rope equipment.rope 1 1 0",
      actor,
      [actor],
      {
        map: {
          gridType: "square",
          gridSize: 50,
          tokens: [
            { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
          ],
          objectCells: [
            {
              id: "object-rope",
              x: 50,
              y: 0,
              width: 50,
              height: 50,
              description: "equipment.rope x1",
              hiddenItemIds: ["equipment.rope"],
            },
          ],
        },
      },
    );
    const structuredAction = result.structuredAction as {
      result: {
        objectId: string;
        itemDefinitionId: string;
        quantity: number;
        removeObject: boolean;
        distanceFt: number;
      };
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.result).toMatchObject({
      objectId: "object-rope",
      itemDefinitionId: "equipment.rope",
      quantity: 1,
      removeObject: true,
      distanceFt: 5,
    });
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "ADD_ITEM", itemDefinitionId: "equipment.rope", quantity: 1 },
      { type: "REMOVE_MAP_OBJECT", objectId: "object-rope" },
    ]);
  });

  it("rejects item pickup commands when no action is available", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
    });

    const result = service.resolveAction(
      "/item pickup object-rope equipment.rope 1 1 0",
      actor,
      [actor],
      {
        map: {
          gridType: "square",
          gridSize: 50,
          tokens: [
            { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
          ],
          objectCells: [
            {
              id: "object-rope",
              x: 50,
              y: 0,
              width: 50,
              height: 50,
              description: "equipment.rope x1",
              hiddenItemIds: ["equipment.rope"],
            },
          ],
        },
        turnState: {
          actionUsed: true,
          bonusActionUsed: false,
          reactionUsed: false,
          additionalActionGranted: false,
          sneakAttackUsed: false,
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.structuredAction).toMatchObject({
      type: "item_interaction",
      operation: "pickup",
      itemDefinitionId: "equipment.rope",
    });
    expect(result.runtimeEffects).toEqual([]);
  });

  it("rejects item pickup when the VTT map object is missing", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
    });

    const result = service.resolveAction(
      "/item pickup object-rope equipment.rope 1 1 0",
      actor,
      [actor],
      {
        map: {
          gridType: "square",
          gridSize: 50,
          tokens: [
            { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
          ],
          objectCells: [],
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.structuredAction).toMatchObject({
      type: "item_interaction",
      operation: "pickup",
      rejectedReason: "map_object_not_found",
    });
    expect(result.runtimeEffects).toEqual([]);
  });

  it("reduces the VTT map object quantity when pickup takes part of a stack", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
    });

    const result = service.resolveAction(
      "/item pickup object-rope equipment.rope 2 1 0",
      actor,
      [actor],
      {
        map: {
          gridType: "square",
          gridSize: 50,
          tokens: [
            { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
          ],
          objectCells: [
            {
              id: "object-rope",
              x: 50,
              y: 0,
              width: 50,
              height: 50,
              description: "equipment.rope x5",
              hiddenItemIds: ["equipment.rope"],
            },
          ],
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "ADD_ITEM", itemDefinitionId: "equipment.rope", quantity: 2 },
      {
        type: "UPDATE_MAP_OBJECT_QUANTITY",
        objectId: "object-rope",
        itemDefinitionId: "equipment.rope",
        quantity: 3,
      },
    ]);
  });

  it("rejects item pickup when requested quantity exceeds the VTT map object stack", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
    });

    const result = service.resolveAction(
      "/item pickup object-rope equipment.rope 6 1 0",
      actor,
      [actor],
      {
        map: {
          gridType: "square",
          gridSize: 50,
          tokens: [
            { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
          ],
          objectCells: [
            {
              id: "object-rope",
              x: 50,
              y: 0,
              width: 50,
              height: 50,
              description: "equipment.rope x5",
              hiddenItemIds: ["equipment.rope"],
            },
          ],
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.structuredAction).toMatchObject({
      type: "item_interaction",
      operation: "pickup",
      rejectedReason: "insufficient_map_object_quantity",
    });
    expect(result.runtimeEffects).toEqual([]);
  });

  it("treats item map objects without an explicit stack quantity as a single item", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
    });

    const result = service.resolveAction(
      "/item pickup object-rope equipment.rope 2 1 0",
      actor,
      [actor],
      {
        map: {
          gridType: "square",
          gridSize: 50,
          tokens: [
            { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
          ],
          objectCells: [
            {
              id: "object-rope",
              x: 50,
              y: 0,
              width: 50,
              height: 50,
              description: "Coiled rope",
              hiddenItemIds: ["equipment.rope"],
            },
          ],
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.structuredAction).toMatchObject({
      type: "item_interaction",
      operation: "pickup",
      rejectedReason: "insufficient_map_object_quantity",
    });
    expect(result.runtimeEffects).toEqual([]);
  });

  it("resolves item throw commands into thrown attack metadata", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        abilitiesJson: JSON.stringify({ str: 12, dex: 16 }),
        proficiencyBonus: 2,
        inventoryJson: JSON.stringify([
          {
            id: "entry-dagger",
            itemDefinitionId: "equipment.dagger",
            name: "Dagger",
            quantity: 1,
            damageDice: "1d4",
            damageType: "piercing",
            properties: ["finesse", "light", "thrown", "proficient"],
          },
        ]),
      },
    });

    const result = service.resolveAction("/item throw entry-dagger 1 4 0", actor, [actor], {
      map: {
        gridType: "square",
        gridSize: 50,
        tokens: [
          { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
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
      result: {
        attack: { kind: string; ability: string; attackBonus: number; damageDice: string };
        distanceFt: number;
      };
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.result.attack).toMatchObject({
      kind: "thrown_weapon",
      ability: "dex",
      attackBonus: 5,
      damageDice: "1d4",
    });
    expect(structuredAction.result.distanceFt).toBe(20);
    expect(result.runtimeEffects).toEqual([
      { type: "REMOVE_ITEM", itemId: "entry-dagger", quantity: 1 },
      {
        type: "CREATE_MAP_OBJECT",
        objectId: "object:thrown:entry-dagger:4:0",
        itemDefinitionId: "equipment.dagger",
        name: "Dagger",
        quantity: 1,
        point: { x: 4, y: 0 },
      },
      { type: "SPEND_ACTION" },
    ]);
  });

  it("rejects item throw commands when no action is available", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        abilitiesJson: JSON.stringify({ str: 12, dex: 16 }),
        proficiencyBonus: 2,
        inventoryJson: JSON.stringify([
          {
            id: "entry-dagger",
            itemDefinitionId: "equipment.dagger",
            name: "Dagger",
            quantity: 1,
            damageDice: "1d4",
            damageType: "piercing",
            properties: ["finesse", "light", "thrown", "proficient"],
          },
        ]),
      },
    });

    const result = service.resolveAction("/item throw entry-dagger 1 4 0", actor, [actor], {
      map: {
        gridType: "square",
        gridSize: 50,
        tokens: [
          { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
        ],
      },
      turnState: {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.structuredAction).toMatchObject({
      type: "item_interaction",
      operation: "throw",
      itemId: "entry-dagger",
    });
    expect(result.runtimeEffects).toEqual([]);
  });

  it("resolves thrown item hits into attack damage without creating a miss object", () => {
    const service = createService([
      createDiceResult([14], 5),
      {
        expression: "1d4",
        rolls: [3],
        modifier: 0,
        total: 3,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        abilitiesJson: JSON.stringify({ str: 12, dex: 16 }),
        proficiencyBonus: 2,
        inventoryJson: JSON.stringify([
          {
            id: "entry-dagger",
            itemDefinitionId: "equipment.dagger",
            name: "Dagger",
            quantity: 1,
            damageDice: "1d4",
            damageType: "piercing",
            properties: ["finesse", "light", "thrown", "proficient"],
          },
        ]),
      },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 10,
      character: { id: "target-character", name: "Target", armorClass: 12 },
    });

    const result = service.resolveAction("/item throw entry-dagger 1 4 0", actor, [actor, target], {
      map: {
        gridType: "square",
        gridSize: 50,
        tokens: [
          { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
          { sessionCharacterId: "target", x: 200, y: 0, size: 50, hidden: false, isHostile: true },
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
      target: string;
      targetArmorClass: number;
      finalDamage: number;
      damageRoll: DiceRollResponseDto | null;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.diceResult).toMatchObject({ total: 19 });
    expect(structuredAction).toMatchObject({
      target: "target",
      targetArmorClass: 12,
      finalDamage: 3,
      damageRoll: expect.objectContaining({ expression: "1d4", total: 3 }),
    });
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 7, markDead: false },
    ]);
    expect(result.runtimeEffects).toEqual([
      { type: "REMOVE_ITEM", itemId: "entry-dagger", quantity: 1 },
      { type: "SPEND_ACTION" },
    ]);
  });

  it("creates a thrown item miss object near the target when the attack misses a token", () => {
    const service = createService([createDiceResult([3], 5)]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        abilitiesJson: JSON.stringify({ str: 12, dex: 16 }),
        proficiencyBonus: 2,
        inventoryJson: JSON.stringify([
          {
            id: "entry-dagger",
            itemDefinitionId: "equipment.dagger",
            name: "Dagger",
            quantity: 1,
            damageDice: "1d4",
            damageType: "piercing",
            properties: ["finesse", "light", "thrown", "proficient"],
          },
        ]),
      },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 10,
      character: { id: "target-character", name: "Target", armorClass: 16 },
    });

    const result = service.resolveAction("/item throw entry-dagger 1 4 0", actor, [actor, target], {
      map: {
        gridType: "square",
        gridSize: 50,
        tokens: [
          { sessionCharacterId: "actor", x: 0, y: 0, size: 50, hidden: false, isHostile: false },
          { sessionCharacterId: "target", x: 200, y: 0, size: 50, hidden: false, isHostile: true },
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

    expect(result.outcome).toBe(ActionOutcome.FAILURE);
    expect(result.stateChanges).toEqual([]);
    expect(result.structuredAction).toMatchObject({
      type: "item_interaction",
      operation: "throw",
      target: "target",
      landingPoint: { x: 4, y: 1 },
    });
    expect(result.runtimeEffects).toEqual([
      { type: "REMOVE_ITEM", itemId: "entry-dagger", quantity: 1 },
      {
        type: "CREATE_MAP_OBJECT",
        objectId: "object:thrown:entry-dagger:4:1",
        itemDefinitionId: "equipment.dagger",
        name: "Dagger",
        quantity: 1,
        point: { x: 4, y: 1 },
      },
      { type: "SPEND_ACTION" },
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
      damageDice: string;
      spellDefinition: {
        id: string;
        level: number;
        damage: { dice: string; type: string };
      };
      finalDamage: number;
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.spellId).toBe("spell.chill_touch");
    expect(structuredAction.spellDefinition).toMatchObject({
      id: "spell.chill_touch",
      level: 0,
      damage: { dice: "1d8", type: "necrotic" },
    });
    expect(structuredAction.damageType).toBe("necrotic");
    expect(structuredAction.damageDice).toBe("1d8");
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

  it("uses catalog character-level spell scaling for chill touch damage dice", () => {
    const service = createService([
      createDiceResult([18], 2),
      {
        expression: "2d8",
        rolls: [5, 6],
        modifier: 0,
        total: 11,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard", level: 5 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 20,
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/cast chill_touch target 90", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      damageDice: string;
      finalDamage: number;
    };

    expect(structuredAction.damageDice).toBe("2d8");
    expect(structuredAction.finalDamage).toBe(11);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 9, markDead: false },
    ]);
  });

  it("executes fire bolt through catalog attack spell data", () => {
    const service = createService([
      createDiceResult([18], 3),
      {
        expression: "2d10",
        rolls: [7, 6],
        modifier: 0,
        total: 13,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard", level: 5, proficiencyBonus: 3 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 20,
      conditionsJson: JSON.stringify(["vulnerability:fire"]),
      character: { id: "target-character", name: "Target", armorClass: 12 },
    });

    const result = service.resolveAction("/cast fire_bolt target 120", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      spellId: string;
      damageType: string;
      damageDice: string;
      finalDamage: number;
      spellDefinition: {
        id: string;
        level: number;
        targeting: { type: string; rangeFt: number };
      };
      ruleResults: Array<{ hookId: string; produced: Record<string, unknown> }>;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.spellId).toBe("spell.fire_bolt");
    expect(structuredAction.spellDefinition).toMatchObject({
      id: "spell.fire_bolt",
      level: 0,
      targeting: { type: "creature", rangeFt: 120 },
    });
    expect(structuredAction.damageType).toBe("fire");
    expect(structuredAction.damageDice).toBe("2d10");
    expect(structuredAction.finalDamage).toBe(26);
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 0, markDead: true },
    ]);
    expect(structuredAction.ruleResults.map((ruleResult) => ruleResult.hookId)).toEqual([
      RULE_HOOK_IDS.RESOLVE_ATTACK_ROLL,
      RULE_HOOK_IDS.APPLY_DAMAGE_MODIFIERS,
    ]);
  });

  it("applies Ray of Frost movement penalty through catalog attack spell data", () => {
    const service = createService([
      createDiceResult([18], 3),
      {
        expression: "2d8",
        rolls: [6, 5],
        modifier: 0,
        total: 11,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        className: "wizard",
        level: 5,
        proficiencyBonus: 3,
        spellsJson: JSON.stringify({ cantrips: ["spell.ray_of_frost"] }),
      },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 20,
      character: { id: "target-character", name: "Target", armorClass: 12 },
    });

    const result = service.resolveAction("/cast ray_of_frost target 60", actor, [actor, target]);

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.structuredAction).toMatchObject({
      spellId: "spell.ray_of_frost",
      damageType: "cold",
      damageDice: "2d8",
      finalDamage: 11,
    });
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "target",
        currentHp: 9,
        markDead: false,
        conditions: [
          expect.objectContaining({
            conditionId: "condition.spell.ray_of_frost",
            sourceId: "spell.ray_of_frost",
            duration: { type: "rounds", remaining: 1 },
            tags: ["movement_speed_penalty:10"],
          }),
        ],
      },
    ]);
  });

  it("rejects catalog attack spells when the target is out of range", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard", level: 5 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      character: { id: "target-character", name: "Target", armorClass: 12 },
    });

    const result = service.resolveAction("/cast fire_bolt target 125", actor, [actor, target]);

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.narration).toBe("대상이 주문 사거리 밖에 있습니다.");
    expect(result.structuredAction).toMatchObject({
      type: "cast_spell",
      spellId: "spell.fire_bolt",
      target: "target",
      targetDistanceFt: 125,
      rejectedReason: "target_out_of_range",
    });
  });

  it("executes fireball as an area spell with individual saves and damage", () => {
    const service = createService([
      {
        expression: "9d6",
        rolls: [6, 5, 4, 4, 3, 3, 2, 2, 1],
        modifier: 0,
        total: 30,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "1d20",
        rolls: [16],
        modifier: 0,
        total: 16,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "1d20",
        rolls: [8],
        modifier: 0,
        total: 8,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard", level: 5 },
    });
    const rogue = createCharacter({
      id: "rogue",
      characterId: "rogue-character",
      currentHp: 30,
      conditionsJson: JSON.stringify(["resistance:fire", "save_proficiency:dex"]),
      character: {
        id: "rogue-character",
        name: "Rogue",
        abilitiesJson: JSON.stringify({ dex: 14 }),
        proficiencyBonus: 2,
      },
    });
    const zombie = createCharacter({
      id: "zombie",
      characterId: "zombie-character",
      currentHp: 20,
      conditionsJson: JSON.stringify(["vulnerability:fire"]),
      character: {
        id: "zombie-character",
        name: "Zombie",
        abilitiesJson: JSON.stringify({ dex: 8 }),
      },
    });

    const result = service.resolveAction(
      "/cast_area fireball 15 rogue,zombie 4",
      actor,
      [actor, rogue, zombie],
    );
    const structuredAction = result.structuredAction as {
      spellId: string;
      slotLevel: number;
      spellScaling: { damageDice: string };
      aoe: {
        damageDice: string;
        damageType: string;
        targetResults: Array<{
          targetId: string;
          baseDamage: number;
          finalDamage: number;
          nextHp: number;
          savingThrow: { success: boolean; savingThrowTotal: number };
        }>;
      };
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.spellId).toBe("spell.fireball");
    expect(structuredAction.slotLevel).toBe(4);
    expect(structuredAction.spellScaling.damageDice).toBe("9d6");
    expect(structuredAction.aoe).toMatchObject({
      damageDice: "9d6",
      damageType: "fire",
      targetResults: [
        {
          targetId: "rogue",
          baseDamage: 15,
          finalDamage: 7,
          nextHp: 23,
          savingThrow: { success: true, savingThrowTotal: 20 },
        },
        {
          targetId: "zombie",
          baseDamage: 30,
          finalDamage: 60,
          nextHp: 0,
          savingThrow: { success: false, savingThrowTotal: 7 },
        },
      ],
    });
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "rogue", currentHp: 23, markDead: false },
      { sessionCharacterId: "zombie", currentHp: 0, markDead: true },
    ]);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "SPEND_SPELL_SLOT", slotLevel: 4 },
    ]);
  });

  it("rejects area spells that are known but not prepared", () => {
    const service = createService([
      {
        expression: "8d6",
        rolls: [6, 5, 4, 4, 3, 3, 2, 2],
        modifier: 0,
        total: 29,
        advantageState: DiceAdvantageState.NORMAL,
      },
      createDiceResult([8], 1),
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        className: "wizard",
        level: 5,
        spellsJson: JSON.stringify({
          cantrips: [],
          spells: ["spell.fireball"],
          preparedSpells: [],
        }),
      },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 20,
      character: {
        id: "target-character",
        name: "Target",
        abilitiesJson: JSON.stringify({ dex: 12 }),
      },
    });

    const result = service.resolveAction("/cast_area fireball 15 target", actor, [actor, target]);

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.diceResult).toBeNull();
    expect(result.stateChanges).toEqual([]);
    expect(result.runtimeEffects).toEqual([]);
    expect(result.structuredAction).toMatchObject({
      type: "cast_area_spell",
      spellId: "spell.fireball",
      targetIds: ["target"],
      rejectedReason: "spell_not_prepared",
    });
  });

  it("resolves concentration checks for area spell damage", () => {
    const service = createService([
      {
        expression: "8d6",
        rolls: [6, 6, 5, 4, 3, 3, 2, 1],
        modifier: 0,
        total: 30,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "1d20",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: DiceAdvantageState.NORMAL,
      },
      {
        expression: "1d20+0",
        rolls: [5],
        modifier: 0,
        total: 5,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const concentration = {
      conditionId: "condition.concentration",
      sourceId: "spell.hold_person",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "replace",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [
        "concentration",
        "concentration:spell:spell.hold_person",
        "concentration:target:target-1",
        "concentration:effect:effect-hold-1",
      ],
    };
    const linked = {
      conditionId: "condition.paralyzed",
      sourceId: "effect-hold-1",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const unrelated = {
      conditionId: "condition.poisoned",
      sourceId: "terrain.poison_cloud",
      duration: { type: "permanent" },
      saveEnds: null,
      stackPolicy: "ignore_duplicate",
      appliedAtRound: null,
      expiresAtTurn: null,
      tags: [],
    };
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard", level: 5 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 40,
      conditionsJson: JSON.stringify([concentration, linked, unrelated]),
      character: {
        id: "target-character",
        name: "Target",
        abilitiesJson: JSON.stringify({ dex: 8, con: 10 }),
      },
    });

    const result = service.resolveAction("/cast_area fireball 15 target", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      aoe: {
        concentrationChecks: Array<{
          targetId: string;
          diceResult: DiceRollResponseDto;
          concentrationMaintained: boolean;
          removedConditions: unknown[];
          concentrationState: {
            casterId: string;
            spellId: string | null;
            targetIds: string[];
            effectIds: string[];
            startedAtRound: number;
            endsAtRound: number | null;
            endsAtTurn: number | null;
          };
        }>;
      };
    };

    expect(structuredAction.aoe.concentrationChecks).toEqual([
      {
        targetId: "target",
        diceResult: {
          expression: "1d20+0",
          rolls: [5],
          modifier: 0,
          total: 5,
          advantageState: DiceAdvantageState.NORMAL,
        },
        concentrationMaintained: false,
        removedConditions: [
          { ...concentration, appliedAtRound: 0 },
          { ...linked, appliedAtRound: 0 },
        ],
        concentrationState: {
          casterId: "",
          spellId: "spell.hold_person",
          targetIds: ["target-1"],
          effectIds: ["effect-hold-1"],
          startedAtRound: 0,
          endsAtRound: null,
          endsAtTurn: null,
        },
      },
    ]);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "target",
        currentHp: 10,
        markDead: false,
        conditions: [{ ...unrelated, appliedAtRound: 0 }],
      },
    ]);
  });

  it("executes magic missile as catalog-driven auto-hit force damage", () => {
    const service = createService([
      {
        expression: "5d4+5",
        rolls: [1, 2, 3, 4, 1],
        modifier: 5,
        total: 16,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard", level: 5 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 30,
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/cast magic_missile target 120 3", actor, [actor, target]);
    const structuredAction = result.structuredAction as {
      slotLevel: number;
      spellScaling: {
        baseSpellLevel: number;
        slotLevel: number;
        targetCount: number;
        appliedScaling: Array<{ mode: string; steps: number; value: number }>;
      };
      missileCount: number;
      damageType: string;
      damageDice: string;
      finalDamage: number;
    };

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(structuredAction.slotLevel).toBe(3);
    expect(structuredAction.spellScaling).toMatchObject({
      baseSpellLevel: 1,
      slotLevel: 3,
      targetCount: 5,
      appliedScaling: [{ mode: "target_count", steps: 2, value: 5 }],
    });
    expect(structuredAction.missileCount).toBe(5);
    expect(structuredAction.damageType).toBe("force");
    expect(structuredAction.damageDice).toBe("5d4+5");
    expect(structuredAction.finalDamage).toBe(16);
    expect(result.diceResult).toMatchObject({ expression: "5d4+5", total: 16 });
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 14, markDead: false },
    ]);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "SPEND_SPELL_SLOT", slotLevel: 3 },
    ]);
  });

  it("executes cure wounds as a catalog-driven touch healing spell", () => {
    const service = createService([
      {
        expression: "2d8+3",
        rolls: [6, 5],
        modifier: 3,
        total: 14,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        className: "cleric",
        level: 3,
        abilitiesJson: JSON.stringify({ wis: 16 }),
        spellsJson: JSON.stringify({
          spells: ["spell.cure_wounds"],
          preparedSpells: ["spell.cure_wounds"],
        }),
      },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 4,
      character: { id: "target-character", name: "Target", maxHp: 18, armorClass: 10 },
    });

    const result = service.resolveAction("/cast cure_wounds target 5 2", actor, [actor, target]);

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.diceResult).toMatchObject({ expression: "2d8+3", total: 14 });
    expect(result.structuredAction).toMatchObject({
      type: "cast_spell",
      spellId: "spell.cure_wounds",
      slotLevel: 2,
      target: "target",
      spellDefinition: {
        id: "spell.cure_wounds",
        level: 1,
      },
      spellScaling: {
        baseSpellLevel: 1,
        slotLevel: 2,
        damageDice: "2d8",
      },
      healingDice: "2d8+3",
      finalHealing: 14,
    });
    expect(result.stateChanges).toEqual([
      { sessionCharacterId: "target", currentHp: 18 },
    ]);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "SPEND_SPELL_SLOT", slotLevel: 2 },
    ]);
  });

  it("rejects a known leveled spell that is not prepared", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: {
        className: "wizard",
        level: 5,
        spellsJson: JSON.stringify({
          cantrips: ["spell.fire_bolt"],
          spells: ["spell.magic_missile", "spell.sleep"],
          preparedSpells: ["spell.sleep"],
        }),
      },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      currentHp: 30,
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/cast magic_missile target 120 1", actor, [actor, target]);

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.diceResult).toBeNull();
    expect(result.stateChanges).toEqual([]);
    expect(result.runtimeEffects).toEqual([]);
    expect(result.structuredAction).toMatchObject({
      type: "cast_spell",
      spellId: "spell.magic_missile",
      rejectedReason: "spell_not_prepared",
    });
  });

  it("executes sleep as a catalog-driven hit point pool condition spell", () => {
    const service = createService([
      {
        expression: "9d8",
        rolls: [4, 4, 4, 4, 4, 4, 4, 4, 3],
        modifier: 0,
        total: 35,
        advantageState: DiceAdvantageState.NORMAL,
      },
    ]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard", level: 5 },
    });
    const weakerTarget = createCharacter({
      id: "weaker",
      characterId: "weaker-character",
      currentHp: 12,
      character: { id: "weaker-character", name: "Weaker", armorClass: 10 },
    });
    const strongerTarget = createCharacter({
      id: "stronger",
      characterId: "stronger-character",
      currentHp: 28,
      character: { id: "stronger-character", name: "Stronger", armorClass: 10 },
    });

    const result = service.resolveAction(
      "/cast sleep weaker,stronger 90 3",
      actor,
      [actor, strongerTarget, weakerTarget],
    );

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.diceResult).toMatchObject({ expression: "9d8", total: 35 });
    expect(result.structuredAction).toMatchObject({
      type: "cast_spell",
      spellId: "spell.sleep",
      slotLevel: 3,
      spellScaling: {
        baseSpellLevel: 1,
        slotLevel: 3,
        damageDice: "9d8",
      },
      sleepPoolTotal: 35,
      sleptTargetIds: ["weaker"],
    });
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "weaker",
        conditions: [
          expect.objectContaining({
            conditionId: "combat:sleep",
            sourceId: "spell.sleep",
            tags: expect.arrayContaining(["combat:unconscious", "condition:incapacitated"]),
          }),
        ],
      },
    ]);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "SPEND_SPELL_SLOT", slotLevel: 3 },
    ]);
  });

  it("executes light as a catalog-driven utility condition spell", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      conditionsJson: "[]",
      character: { className: "wizard", level: 5 },
    });

    const result = service.resolveAction("/cast light actor 5 0", actor, [actor]);

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.diceResult).toBeNull();
    expect(result.structuredAction).toMatchObject({
      type: "cast_spell",
      spellId: "spell.light",
      slotLevel: 0,
      target: "actor",
      spellDefinition: {
        id: "spell.light",
        level: 0,
      },
      lightRadiusFt: 40,
    });
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "actor",
        conditions: [
          expect.objectContaining({
            conditionId: "condition.spell.light",
            sourceId: "spell.light",
            duration: { type: "permanent" },
            tags: expect.arrayContaining(["effect:bright_light", "utility:illumination", "light_radius:40"]),
          }),
        ],
      },
    ]);
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_ACTION" }]);
  });

  it("rejects invalid spell slot levels without throwing", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      character: { className: "wizard", level: 5 },
    });
    const target = createCharacter({
      id: "target",
      characterId: "target-character",
      character: { id: "target-character", name: "Target", armorClass: 10 },
    });

    const result = service.resolveAction("/cast magic_missile target 120 0", actor, [actor, target]);

    expect(result.outcome).toBe(ActionOutcome.IMPOSSIBLE);
    expect(result.narration).toBe("주문 슬롯 레벨이 유효하지 않습니다.");
    expect(result.structuredAction).toMatchObject({
      type: "cast_spell",
      spellId: "spell.magic_missile",
      slotLevel: 0,
      rejectedReason: "invalid_spell_slot_level",
      spellScaling: null,
    });
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

  it("uses Lay on Hands as a self heal and records its long-rest resource", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "paladin",
      characterId: "paladin-character",
      currentHp: 4,
      character: { className: "paladin", level: 3, maxHp: 20 },
    });

    const result = service.resolveAction("/feature lay_on_hands", actor, [actor], {
      turnState: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "paladin",
        currentHp: 19,
        conditions: ["resource:lay_on_hands_expended"],
      },
    ]);
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_ACTION" }]);
  });

  it("spends a level 1 slot for Primeval Awareness", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "ranger",
      characterId: "ranger-character",
      character: { className: "ranger", level: 3 },
    });

    const result = service.resolveAction(
      "/feature primeval_awareness",
      actor,
      [actor],
      {
        spellSlots: { "1": 2 },
        turnState: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          additionalActionGranted: false,
          sneakAttackUsed: false,
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_ACTION" },
      { type: "SPEND_SPELL_SLOT", slotLevel: 1 },
    ]);
  });

  it("spends monk Ki on Patient Defense and records the spent point", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "monk",
      characterId: "monk-character",
      character: { className: "monk", level: 2 },
    });

    const result = service.resolveAction(
      "/feature ki patient_defense",
      actor,
      [actor],
      {
        turnState: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          additionalActionGranted: false,
          sneakAttackUsed: false,
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "monk",
        conditions: ["resource:ki_spent:1", "combat:dodge"],
      },
    ]);
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_BONUS_ACTION" }]);
  });

  it("uses Life Cleric Channel Divinity to heal up to half HP", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "cleric",
      characterId: "cleric-character",
      currentHp: 2,
      character: {
        className: "cleric",
        subclassName: "life",
        level: 2,
        maxHp: 18,
      },
    });

    const result = service.resolveAction(
      "/feature channel_divinity",
      actor,
      [actor],
      {
        turnState: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          additionalActionGranted: false,
          sneakAttackUsed: false,
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "cleric",
        currentHp: 9,
        conditions: ["resource:channel_divinity_expended"],
      },
    ]);
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_ACTION" }]);
  });

  it("grants Bardic Inspiration to an ally and spends one use", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "bard",
      characterId: "bard-character",
      character: {
        className: "bard",
        level: 2,
        abilitiesJson: JSON.stringify({ cha: 16 }),
      },
    });
    const ally = createCharacter({
      id: "ally",
      characterId: "ally-character",
      character: { className: "fighter", level: 2 },
    });

    const result = service.resolveAction(
      "/feature bardic_inspiration ally",
      actor,
      [actor, ally],
      {
        turnState: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          additionalActionGranted: false,
          sneakAttackUsed: false,
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "bard",
        conditions: ["resource:bardic_inspiration_spent:1"],
      },
      {
        sessionCharacterId: "ally",
        conditions: ["bardic_inspiration:1d6"],
      },
    ]);
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_BONUS_ACTION" }]);
  });

  it("upgrades Bardic Inspiration to d8 at level 5", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "bard",
      character: {
        className: "bard",
        level: 5,
        abilitiesJson: JSON.stringify({ cha: 16 }),
      },
    });
    const ally = createCharacter({
      id: "ally",
      character: { className: "fighter", level: 5 },
    });

    const result = service.resolveAction(
      "/feature bardic_inspiration ally",
      actor,
      [actor, ally],
    );

    expect(result.structuredAction).toMatchObject({ die: "1d8" });
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "bard",
        conditions: ["resource:bardic_inspiration_spent:1"],
      },
      {
        sessionCharacterId: "ally",
        conditions: ["bardic_inspiration:1d8"],
      },
    ]);
  });

  it("converts sorcery points into a level 1 spell slot", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "sorcerer",
      characterId: "sorcerer-character",
      character: { className: "sorcerer", level: 2 },
    });

    const result = service.resolveAction(
      "/feature font_of_magic",
      actor,
      [actor],
      {
        spellSlots: { "1": 1 },
        spellSlotMaximums: { "1": 3 },
        turnState: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          additionalActionGranted: false,
          sneakAttackUsed: false,
        },
      },
    );

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "sorcerer",
        conditions: ["resource:sorcery_points_spent:2"],
      },
    ]);
    expect(result.runtimeEffects).toEqual([
      { type: "SPEND_BONUS_ACTION" },
      { type: "RESTORE_SPELL_SLOT", slotLevel: 1, amount: 1 },
    ]);
  });

  it("uses Wild Shape to enter wolf form with form HP", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "druid",
      characterId: "druid-character",
      character: { className: "druid", level: 2 },
    });

    const result = service.resolveAction("/feature wild_shape", actor, [actor], {
      turnState: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        additionalActionGranted: false,
        sneakAttackUsed: false,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "druid",
        tempHp: 11,
        conditions: [
          "resource:wild_shape_spent:1",
          "wild_shape:wolf",
          "movement_speed_override:40",
        ],
      },
    ]);
    expect(result.runtimeEffects).toEqual([{ type: "SPEND_ACTION" }]);
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
        secondWindAvailable: true,
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
      recoveredTags: [
        "resource:second_wind_expended",
        "resource:action_surge_expended",
        "action_surge:additional_action_granted",
      ],
    });
  });

  it("spends hit dice to heal during short rest", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "actor",
      characterId: "actor-character",
      currentHp: 5,
      character: {
        className: "fighter",
        level: 4,
        maxHp: 24,
        abilitiesJson: JSON.stringify({ con: 14 }),
      },
    });

    const result = service.resolveAction("/rest short 2", actor, [actor], {
      spellSlots: { "1": 1 },
      spellSlotMaximums: { "1": 4 },
      resource: {
        secondWindAvailable: false,
        actionSurgeUses: 0,
        rageUses: 0,
        rageActive: false,
        frenzyActive: false,
        exhaustionLevel: 0,
        hitDiceSpent: 1,
      },
    });

    expect(result.outcome).toBe(ActionOutcome.SUCCESS);
    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "actor",
        currentHp: 21,
        conditions: [],
      },
    ]);
    expect(result.runtimeEffects).toEqual([
      {
        type: "RECOVER_SHORT_REST",
        secondWindAvailable: true,
        actionSurgeUses: 1,
        hitDiceSpent: 3,
      },
    ]);
    expect(result.structuredAction).toMatchObject({
      type: "rest",
      restType: "short",
      recoveredResources: {
        hitDiceSpent: 3,
      },
      restResult: {
        hp: {
          before: 5,
          after: 21,
          recovered: 16,
        },
        resources: {
          before: expect.objectContaining({
            secondWindAvailable: false,
            hitDiceSpent: 1,
          }),
          after: expect.objectContaining({
            secondWindAvailable: true,
            hitDiceSpent: 3,
          }),
        },
        spellSlots: {
          before: { "1": 1 },
          after: { "1": 1 },
        },
      },
      recoveredTags: expect.arrayContaining(["hit_dice:spent:2"]),
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
        secondWindAvailable: false,
        actionSurgeUses: 1,
      },
    ]);
    expect(result.structuredAction).toMatchObject({
      recoveredResources: {
        actionSurgeUses: 1,
      },
    });
  });

  it("uses Arcane Recovery once to restore the highest affordable slot", () => {
    const service = createService([]);
    const actor = createCharacter({
      id: "wizard",
      characterId: "wizard-character",
      character: {
        className: "wizard",
        level: 3,
      },
    });

    const result = service.resolveAction("/rest short", actor, [actor], {
      spellSlots: { "1": 2, "2": 0 },
      spellSlotMaximums: { "1": 4, "2": 2 },
    });

    expect(result.stateChanges).toEqual([
      {
        sessionCharacterId: "wizard",
        conditions: ["resource:arcane_recovery_expended"],
      },
    ]);
    expect(result.runtimeEffects).toEqual([
      expect.objectContaining({
        type: "RECOVER_SHORT_REST",
        recoverSpellSlotLevel: 2,
        spellRecoveryFeatureId: "class.wizard.feature.arcane_recovery",
      }),
    ]);
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

    const result = service.resolveAction("/rest long", actor, [actor], {
      spellSlots: { "1": 0, "2": 1 },
      spellSlotMaximums: { "1": 4, "2": 3 },
      resource: {
        secondWindAvailable: true,
        actionSurgeUses: 0,
        rageUses: 1,
        rageActive: true,
        frenzyActive: false,
        exhaustionLevel: 1,
        hitDiceSpent: 2,
      },
    });

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
        secondWindAvailable: false,
        actionSurgeUses: 0,
        hitDiceSpent: 0,
        rageUses: 4,
        reduceExhaustionBy: 1,
      },
    ]);
    expect(result.structuredAction).toMatchObject({
      type: "rest",
      restType: "long",
      restResult: {
        hp: {
          before: 3,
          after: 50,
          recovered: 47,
        },
        tempHp: {
          before: 4,
          after: 0,
        },
        conditions: {
          beforeCount: 4,
          afterCount: 1,
          removed: [
            "resource:rage_expended",
            "rage",
            "resistance:slashing",
          ],
        },
        resources: {
          before: expect.objectContaining({
            rageUses: 1,
            rageActive: true,
            exhaustionLevel: 1,
            hitDiceSpent: 2,
          }),
          after: expect.objectContaining({
            rageUses: 4,
            rageActive: false,
            exhaustionLevel: 0,
            hitDiceSpent: 0,
          }),
        },
        spellSlots: {
          before: { "1": 0, "2": 1 },
          after: { "1": 4, "2": 3 },
        },
      },
      recoveredTags: expect.arrayContaining([
        "resource:rage_expended",
        "rage",
        "resistance:slashing",
        "spell_slots:all",
      ]),
    });
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
        secondWindAvailable: false,
        actionSurgeUses: 0,
        rageUses: 3,
        reduceExhaustionBy: 0,
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
