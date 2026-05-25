import { Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  AvailableActionDto,
  DiceAdvantageState,
  DiceRollResponseDto,
  GamePhase,
} from "@trpg/shared-types";
import { forbidden } from "../../common/exceptions/domain-error";
import { AoeDamageService, AoeDamageTarget } from "./aoe-damage.service";
import { CommandParserService, ParsedCommand } from "./command-parser.service";
import { ConcentrationRuntimeService } from "./concentration-runtime.service";
import { ConditionRuntimeService } from "./condition-runtime.service";
import { DiceService } from "./dice.service";
import {
  ItemInteractionEntry,
  ItemInteractionPoint,
  ItemInteractionService,
} from "./item-interaction.service";
import { RestResolution, RestResolutionService } from "./rest-resolution.service";
import { RuleCatalogService } from "./rule-catalog.service";
import { RuleCatalogEntry } from "./rule-catalog.types";
import { RuleEngineService } from "./rule-engine.service";
import {
  SpellScalingResult,
  SpellScalingRule,
  SpellScalingService,
} from "./spell-scaling.service";
import {
  CriticalThresholdModifierProduced,
  RuleAdvantageState,
  RuleHookResult,
  SavingThrowAbility,
} from "./rule-engine.types";
import {
  MapPositionService,
  RuleMapRuntimeContext,
  RuleMapRuntimeObjectCell,
} from "./map-position.service";
import { ReadyActionService } from "./ready-action.service";
import type { PendingReadyAction } from "./ready-action.service";

const DEFAULT_MELEE_ATTACK_DISTANCE_FT = 5;
const DEFAULT_WEAPON_DAMAGE_TYPE = "slashing";
const DEFAULT_DIRECT_DAMAGE_TYPE = "untyped";
const CHILL_TOUCH_SPELL_ID = "spell.chill_touch";
const FIRE_BOLT_SPELL_ID = "spell.fire_bolt";
const MAGIC_MISSILE_SPELL_ID = "spell.magic_missile";
const SECOND_WIND_FEATURE_ID = "class.fighter.feature.second_wind";
const ACTION_SURGE_FEATURE_ID = "class.fighter.feature.action_surge";
const FIGHTING_STYLE_FEATURE_ID = "class.fighter.feature.fighting_style";
const RAGE_FEATURE_ID = "class.barbarian.feature.rage";
const SNEAK_ATTACK_FEATURE_ID = "class.rogue.feature.sneak_attack";
const EXPERTISE_FEATURE_ID = "class.rogue.feature.expertise";
const FAVORED_ENEMY_FEATURE_ID = "class.ranger.feature.favored_enemy";
const CUNNING_ACTION_FEATURE_ID = "class.rogue.feature.cunning_action";
const FRENZY_FEATURE_ID = "class.barbarian.subclass_feature.frenzy";
const FIGHTING_STYLE_DATA_FEATURE_ID = "feature.fighter.fighting_style";
const SNEAK_ATTACK_DATA_FEATURE_ID = "feature.rogue.sneak_attack";
const EXPERTISE_DATA_FEATURE_ID = "feature.rogue.expertise";
const FAVORED_ENEMY_DATA_FEATURE_ID = "feature.ranger.favored_enemy";
const SECOND_WIND_EXPENDED_TAG = "resource:second_wind_expended";
const ACTION_SURGE_EXPENDED_TAG = "resource:action_surge_expended";
const ACTION_SURGE_GRANTED_TAG = "action_surge:additional_action_granted";
const FIGHTING_STYLE_TAG_PREFIX = "fighting_style:";
const EXPERTISE_TAG_PREFIX = "expertise:";
const FAVORED_ENEMY_TAG_PREFIX = "favored_enemy:";
const FAVORED_ENEMY_HUMANOID_TAG_PREFIX = "favored_enemy_humanoid:";
const RAGE_EXPENDED_TAG = "resource:rage_expended";
const RAGE_ACTIVE_TAG = "rage";
const RAGE_RESISTANCE_TAGS = [
  "resistance:bludgeoning",
  "resistance:piercing",
  "resistance:slashing",
];
type SessionCharacterForRules = {
  id: string;
  userId: string;
  characterId: string;
  currentHp: number;
  tempHp: number;
  conditionsJson: string;
  inventorySnapshotJson?: string | null;
  inventoryEntries?: InventoryEntryForRules[];
  character: {
    id: string;
    name: string;
    className: string;
    subclassName?: string | null;
    level: number;
    maxHp: number;
    abilitiesJson: string;
    proficiencyBonus: number;
    featuresJson?: string | null;
    proficientSkillsJson: string;
    armorClass: number;
    speed: number;
    inventoryJson?: string | null;
    equippedWeaponId?: string | null;
  };
  user?: {
    id: string;
    displayName: string;
    profile?: {
      nickname: string;
    } | null;
  } | null;
};

type InventoryEntryForRules = {
  id: string;
  itemDefinitionId: string;
  itemDefinition: {
    id: string;
    itemType: string;
    damageDice?: string | null;
    damageType?: string | null;
    propertiesJson?: string | null;
  };
};

type InventoryItemForRules = {
  id: string;
  itemDefinitionId?: string;
  name?: string;
  quantity?: number;
  damageDice?: string;
  damageType?: string;
  properties?: string[];
};

type EquippedWeaponProfile = {
  damageDice: string;
  damageType: string;
  properties: string[];
  attackKind: "melee_weapon_attack" | "ranged_weapon_attack";
};

export type CharacterStatePatch = {
  sessionCharacterId: string;
  currentHp?: number;
  tempHp?: number;
  conditions?: unknown[];
  markDead?: boolean;
};

export type RuleRuntimeContext = {
  hasActiveCombat?: boolean;
  map?: RuleMapRuntimeContext | null;
  resource?: {
    secondWindAvailable: boolean;
    actionSurgeUses: number;
    rageUses: number;
    rageActive: boolean;
    frenzyActive: boolean;
    exhaustionLevel: number;
  } | null;
  turnState?: {
    actionUsed: boolean;
    bonusActionUsed: boolean;
    reactionUsed: boolean;
    additionalActionGranted: boolean;
    sneakAttackUsed: boolean;
  } | null;
  combat?: {
    combatId: string;
    roundNo: number;
    turnNo: number;
    actorParticipantId?: string | null;
  } | null;
};

export type ActionRuntimeEffect =
  | { type: "SPEND_ACTION" }
  | { type: "SPEND_BONUS_ACTION" }
  | { type: "SPEND_REACTION" }
  | { type: "GRANT_ADDITIONAL_ACTION" }
  | { type: "SPEND_SNEAK_ATTACK" }
  | { type: "SPEND_SECOND_WIND" }
  | { type: "SPEND_ACTION_SURGE_USE" }
  | { type: "SPEND_SPELL_SLOT"; slotLevel: number }
  | { type: "STORE_READY_ACTION"; pending: PendingReadyAction }
  | { type: "START_RAGE" }
  | { type: "START_FRENZY" }
  | { type: "RECOVER_SHORT_REST"; actionSurgeUses: number }
  | {
      type: "RECOVER_LONG_REST";
      actionSurgeUses: number;
      rageUses: number;
      reduceExhaustionBy: number;
    }
  | {
      type: "ADD_ITEM";
      itemDefinitionId: string;
      quantity: number;
      containerEntryId?: string | null;
    }
  | { type: "REMOVE_ITEM"; itemId: string; quantity: number }
  | {
      type: "CREATE_MAP_OBJECT";
      objectId: string;
      itemDefinitionId: string;
      name: string;
      quantity: number;
      point: ItemInteractionPoint;
    }
  | {
      type: "UPDATE_MAP_OBJECT_QUANTITY";
      objectId: string;
      itemDefinitionId: string;
      quantity: number;
    }
  | { type: "REMOVE_MAP_OBJECT"; objectId: string };

export type ActionResolution = {
  structuredAction: Record<string, unknown>;
  diceResult: DiceRollResponseDto | null;
  outcome: ActionOutcome;
  narration: string;
  stateChanges: CharacterStatePatch[];
  runtimeEffects?: ActionRuntimeEffect[];
};

@Injectable()
export class ActionRuleService {
  constructor(
    private readonly commandParser: CommandParserService,
    private readonly diceService: DiceService,
    private readonly ruleEngine: RuleEngineService,
    private readonly mapPositions: MapPositionService,
    private readonly conditionRuntime: ConditionRuntimeService = new ConditionRuntimeService(),
    private readonly aoeDamage: AoeDamageService = new AoeDamageService(diceService, ruleEngine),
    private readonly itemInteractions: ItemInteractionService = new ItemInteractionService(),
    private readonly restResolution: RestResolutionService = new RestResolutionService(),
    private readonly ruleCatalog: RuleCatalogService = new RuleCatalogService(),
    private readonly spellScaling: SpellScalingService = new SpellScalingService(),
    private readonly readyActions: ReadyActionService = new ReadyActionService(),
    private readonly concentrationRuntime: ConcentrationRuntimeService = new ConcentrationRuntimeService(),
  ) {}

  getAvailableActions(params: {
    phase: GamePhase;
    isCurrentTurn: boolean;
    hasActiveCombat: boolean;
    isAlive: boolean;
  }): AvailableActionDto[] {
    if (!params.isAlive) {
      return [
        {
          code: "NO_ACTION",
          label: "행동 불가",
          enabled: false,
          reason: "캐릭터가 행동할 수 없는 상태입니다.",
        },
      ];
    }

    if (params.phase === GamePhase.COMBAT || params.hasActiveCombat) {
      return [
        {
          code: "MOVE",
          label: "이동",
          enabled: params.isCurrentTurn,
          reason: params.isCurrentTurn ? null : "현재 턴이 아닙니다.",
        },
        {
          code: "ATTACK",
          label: "공격",
          enabled: params.isCurrentTurn,
          reason: params.isCurrentTurn ? null : "현재 턴이 아닙니다.",
        },
        {
          code: "CHECK",
          label: "판정",
          enabled: params.isCurrentTurn,
          reason: params.isCurrentTurn ? null : "현재 턴이 아닙니다.",
        },
        {
          code: "READY",
          label: "준비행동",
          enabled: params.isCurrentTurn,
          reason: params.isCurrentTurn ? null : "현재 턴이 아닙니다.",
        },
        {
          code: "END_TURN",
          label: "턴 종료",
          enabled: params.isCurrentTurn,
          reason: params.isCurrentTurn ? null : "현재 턴이 아닙니다.",
        },
      ];
    }

    return [
      { code: "EXPLORE", label: "탐색", enabled: true, reason: null },
      { code: "TALK", label: "대화", enabled: true, reason: null },
      { code: "CHECK", label: "판정", enabled: true, reason: null },
    ];
  }

  resolveAction(
    rawText: string,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext = {},
  ): ActionResolution {
    if (!rawText.trim().startsWith("/")) {
      return {
        structuredAction: { type: "free_text", content: rawText.trim() },
        diceResult: null,
        outcome: ActionOutcome.NO_ROLL,
        narration: "행동을 기록했습니다.",
        stateChanges: [],
      };
    }

    const command = this.commandParser.parse(rawText);
    switch (command.type) {
      case "roll":
        return this.resolveRoll(command);
      case "check":
        return this.resolveCheck(command, actor, runtimeContext);
      case "save":
        return this.resolveSave(command, sessionCharacters);
      case "attack":
        return this.resolveAttack(command, actor, sessionCharacters, runtimeContext);
      case "ready":
        return this.resolveReadyAction(command, actor, runtimeContext);
      case "cast_spell":
        return this.resolveCastSpell(command, actor, sessionCharacters, runtimeContext);
      case "cast_area_spell":
        return this.resolveCastAreaSpell(command, actor, sessionCharacters, runtimeContext);
      case "use_class_feature":
        return this.resolveClassFeature(command, actor, runtimeContext);
      case "rest":
        return this.resolveRest(command, actor, runtimeContext);
      case "inventory":
        return this.resolveInventory(command);
      case "item_interaction":
        return this.resolveItemInteraction(command, actor, runtimeContext);
      case "damage":
        return this.resolveDamage(command, sessionCharacters);
      case "heal":
        return this.resolveHeal(command, sessionCharacters);
      case "condition":
        return this.resolveCondition(command, sessionCharacters);
      case "unknown":
      default:
        throw forbidden("ACTION_403", "실행할 수 없는 명령입니다.", {
          reason: "UNKNOWN_COMMAND",
        });
    }
  }

  private resolveRoll(command: Extract<ParsedCommand, { type: "roll" }>): ActionResolution {
    const diceResult = this.diceService.roll(command.expression);
    return {
      structuredAction: { type: "roll", expression: command.expression },
      diceResult,
      outcome: ActionOutcome.NO_ROLL,
      narration: `주사위 결과는 ${diceResult.total}입니다.`,
      stateChanges: [],
    };
  }

  private resolveCheck(
    command: Extract<ParsedCommand, { type: "check" }>,
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    if (!this.hasActionAvailable(runtimeContext)) {
      return this.createActionUnavailableResolution("skill_check", {
        checkName: command.checkName,
        dc: command.dc,
      });
    }

    const modifier = this.getCheckModifier(actor, command.checkName);
    const expression = modifier >= 0 ? `1d20+${modifier}` : `1d20${modifier}`;
    const diceResult = this.diceService.roll(expression, DiceAdvantageState.NORMAL);
    const success = diceResult.total >= command.dc;

    return {
      structuredAction: {
        type: "skill_check",
        checkName: command.checkName,
        dc: command.dc,
      },
      diceResult,
      outcome: success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: success ? "판정에 성공했습니다." : "판정에 실패했습니다.",
      stateChanges: [],
      runtimeEffects: [{ type: "SPEND_ACTION" }],
    };
  }

  private resolveSave(
    command: Extract<ParsedCommand, { type: "save" }>,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const saveProficient = this.resolveSaveProficiencies(target).includes(command.ability);
    const abilityModifier = this.resolveAbilityModifier(target, command.ability);
    const saveModifier = abilityModifier + (saveProficient ? target.character.proficiencyBonus : 0);
    const diceResult = this.diceService.roll(
      `1d20${saveModifier >= 0 ? "+" : ""}${saveModifier}`,
      DiceAdvantageState.NORMAL,
    );
    const ruleResult = this.ruleEngine.resolveSavingThrow({
      ability: command.ability,
      naturalD20: this.selectNaturalD20(diceResult),
      difficultyClass: command.dc,
      abilityModifier,
      proficiencyBonus: target.character.proficiencyBonus,
      proficient: saveProficient,
    });
    const stateChanges: CharacterStatePatch[] = [];
    let expiredConditions: unknown[] = [];

    if (command.condition) {
      const currentConditionEntries = this.parseJson<unknown[]>(target.conditionsJson, []);
      const parsedConditions = this.conditionRuntime.parseConditionsJson(target.conditionsJson);
      const saveEndResolution = this.conditionRuntime.resolveSaveEnd(parsedConditions, {
        conditionId: command.condition,
        saveSucceeded: ruleResult.produced.success,
      });
      expiredConditions = saveEndResolution.expiredConditions;

      if (expiredConditions.length > 0) {
        stateChanges.push({
          sessionCharacterId: target.id,
          conditions: this.mergeConditionResolutionEntries(
            currentConditionEntries,
            parsedConditions,
            saveEndResolution.conditions,
          ),
        });
      }
    }

    return {
      structuredAction: {
        type: "saving_throw",
        target: target.id,
        ability: command.ability,
        dc: command.dc,
        condition: command.condition,
        expiredConditions,
        ruleResults: [ruleResult],
      },
      diceResult,
      outcome: ruleResult.produced.success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: ruleResult.produced.success ? "내성 굴림에 성공했습니다." : "내성 굴림에 실패했습니다.",
      stateChanges,
    };
  }

  private resolveAttack(
    command: Extract<ParsedCommand, { type: "attack" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    if (!this.hasActionAvailable(runtimeContext)) {
      return this.createActionUnavailableResolution("attack", {
        target: command.target,
        dc: command.dc,
      });
    }

    const target = command.target
      ? this.findTarget(command.target, sessionCharacters)
      : sessionCharacters.find((candidate) => candidate.id !== actor.id) ?? null;
    const weaponProfile = this.resolveEquippedWeaponProfile(actor);
    const modifier =
      actor.character.proficiencyBonus +
      this.resolveFightingStyleAttackBonus(actor, weaponProfile);
    const targetArmorClass = target?.character.armorClass ?? command.dc;
    const proneRuleContext = this.resolveAttackProneContext(actor, target, runtimeContext);
    const attackAdvantageState = this.toDiceAdvantageState(proneRuleContext.advantageState);
    const attackRoll = this.diceService.roll(`1d20+${modifier}`, attackAdvantageState);
    const naturalD20 = this.selectNaturalD20(attackRoll);
    const criticalThresholdRuleResult = this.resolveChampionCriticalThreshold(actor, naturalD20);
    const attackRuleResult = this.ruleEngine.resolveAttackRoll({
      naturalD20,
      attackBonus: modifier,
      targetArmorClass,
      advantageState: proneRuleContext.advantageState,
      criticalHitThreshold: criticalThresholdRuleResult?.produced.criticalThreshold,
    });
    const success = attackRuleResult.produced.hit;
    const ruleResults: RuleHookResult<unknown>[] = [
      ...proneRuleContext.ruleResults,
      ...(criticalThresholdRuleResult ? [criticalThresholdRuleResult] : []),
      attackRuleResult,
    ];
    const stateChanges: CharacterStatePatch[] = [];
    let damageRoll: DiceRollResponseDto | null = null;
    let finalDamage = 0;
    const runtimeEffects: ActionRuntimeEffect[] = [{ type: "SPEND_ACTION" }];

    if (success && target) {
      damageRoll = this.diceService.roll(weaponProfile.damageDice);
      const baseWeaponDamage =
        damageRoll.total + this.resolveFightingStyleDamageBonus(actor, weaponProfile);
      const damageRuleResult = this.ruleEngine.applyDamageModifiers({
        baseDamage: baseWeaponDamage,
        damageType: weaponProfile.damageType,
        ...this.resolveDamageProfile(target),
      });
      ruleResults.push(damageRuleResult);
      finalDamage = damageRuleResult.produced.finalDamage;
      const nextHp = Math.max(target.currentHp - finalDamage, 0);
      stateChanges.push({
        sessionCharacterId: target.id,
        currentHp: nextHp,
        markDead: nextHp <= 0,
      });
    }

    return {
      structuredAction: {
        type: "attack",
        target: target?.id ?? command.target,
        dc: command.dc,
        targetArmorClass,
        advantageState: attackAdvantageState,
        damageType: weaponProfile.damageType,
        damageRoll: damageRoll ? { ...damageRoll } : null,
        finalDamage,
        ruleResults,
      },
      diceResult: attackRoll,
      outcome: success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: this.createAttackNarration(attackRuleResult.produced),
      stateChanges,
      runtimeEffects,
    };
  }

  private resolveReadyAction(
    command: Extract<ParsedCommand, { type: "ready" }>,
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    if (!this.hasActionAvailable(runtimeContext)) {
      return this.createActionUnavailableResolution("ready_action", {
        trigger: command.trigger,
        heldAction: command.heldAction,
      });
    }

    if (!runtimeContext.hasActiveCombat || !runtimeContext.combat) {
      return {
        structuredAction: {
          type: "ready_action",
          trigger: command.trigger,
          heldAction: command.heldAction,
          ruleResults: [{ rejectedReason: "combat_context_required" }],
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: "준비행동은 전투 중에만 사용할 수 있습니다.",
        stateChanges: [],
        runtimeEffects: [],
      };
    }

    if (!runtimeContext.turnState) {
      return {
        structuredAction: {
          type: "ready_action",
          trigger: command.trigger,
          heldAction: command.heldAction,
          ruleResults: [{ rejectedReason: "current_turn_required" }],
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: "준비행동은 자신의 전투 턴에만 설정할 수 있습니다.",
        stateChanges: [],
        runtimeEffects: [],
      };
    }

    const resolution = this.readyActions.createPendingReadyAction({
      actorParticipantId: runtimeContext.combat.actorParticipantId ?? actor.id,
      actorUserId: actor.userId,
      combatId: runtimeContext.combat.combatId,
      roundNo: runtimeContext.combat.roundNo,
      turnNo: runtimeContext.combat.turnNo,
      trigger: command.trigger,
      heldAction: command.heldAction,
      reactionAvailable: !runtimeContext.turnState?.reactionUsed,
    });

    if (!resolution.accepted) {
      return {
        structuredAction: {
          type: "ready_action",
          trigger: command.trigger,
          heldAction: command.heldAction,
          ruleResults: [{ rejectedReason: resolution.rejectedReason }],
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createReadyActionRejectedNarration(resolution.rejectedReason),
        stateChanges: [],
        runtimeEffects: [],
      };
    }

    return {
      structuredAction: {
        type: "ready_action",
        pendingReadyAction: resolution.pending,
        trigger: resolution.pending.trigger,
        heldAction: resolution.pending.heldAction,
      },
      diceResult: null,
      outcome: ActionOutcome.NO_ROLL,
      narration: "준비행동을 설정했습니다.",
      stateChanges: [],
      runtimeEffects: [
        { type: "SPEND_ACTION" },
        { type: "STORE_READY_ACTION", pending: resolution.pending },
      ],
    };
  }

  private resolveCastSpell(
    command: Extract<ParsedCommand, { type: "cast_spell" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    if (!this.hasActionAvailable(runtimeContext)) {
      return this.createActionUnavailableResolution("cast_spell", {
        spellId: command.spellId,
        target: command.target,
        targetDistanceFt: command.targetDistanceFt,
      });
    }

    const spellDefinition = this.resolveSpellDefinition(command.spellId);
    const spellDamageType = spellDefinition?.damage?.type ?? "untyped";
    const spellDamageDice = this.resolveSpellDamageDice(spellDefinition, actor.character.level);
    const spellLevel = spellDefinition ? this.resolveSpellLevel(spellDefinition) : 0;
    const slotLevel = command.slotLevel ?? spellLevel;
    let spellScaling: SpellScalingResult | null = null;
    try {
      if (command.slotLevel !== null && spellLevel === 0 && command.slotLevel !== 0) {
        throw new Error("Cantrips do not use spell slot upcasting.");
      }
      spellScaling = this.resolveSpellScaling(spellDefinition, slotLevel);
    } catch (error) {
      return {
        structuredAction: {
          type: "cast_spell",
          spellId: command.spellId,
          slotLevel,
          target: command.target,
          targetDistanceFt: command.targetDistanceFt,
          spellScaling: null,
          rejectedReason: "invalid_spell_slot_level",
          errorMessage: error instanceof Error ? error.message : "Invalid spell slot level.",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("invalid_spell_slot_level"),
        stateChanges: [],
      };
    }
    const target = this.requireTarget(command.target, sessionCharacters);
    const targetArmorClass = target.character.armorClass;

    if (command.spellId === MAGIC_MISSILE_SPELL_ID) {
      return this.resolveMagicMissile({
        command,
        target,
        spellDefinition,
        spellLevel,
        slotLevel,
        spellScaling,
        spellDamageType,
      });
    }

    if (command.spellId === FIRE_BOLT_SPELL_ID) {
      return this.resolveSpellAttackDamage({
        command,
        actor,
        target,
        targetArmorClass,
        spellDefinition,
        spellLevel,
        slotLevel,
        spellScaling,
        spellDamageType,
        spellDamageDice,
      });
    }

    const precheckResult = this.ruleEngine.resolveChillTouch({
      spellChillTouch: command.spellId === CHILL_TOUCH_SPELL_ID,
      casterKnownCantrips: this.resolveKnownCantrips(command.spellId),
      actionAvailable: true,
      targetDistanceFt: command.targetDistanceFt,
      componentAvailability: this.resolveDefaultComponentAvailability(),
      spellAttackRollResult: null,
      targetIsUndead: this.hasCondition(target, "undead"),
    });

    if (!precheckResult.accepted && precheckResult.rejectedReason !== "spell_attack_roll_required") {
      return {
        structuredAction: {
          type: "cast_spell",
          spellId: command.spellId,
          slotLevel,
          target: target.id,
          targetDistanceFt: command.targetDistanceFt,
          targetArmorClass,
          spellScaling,
          ruleResults: [precheckResult],
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration(precheckResult.rejectedReason),
        stateChanges: [],
      };
    }

    const modifier = actor.character.proficiencyBonus;
    const attackRoll = this.diceService.roll(`1d20+${modifier}`, DiceAdvantageState.NORMAL);
    const attackRuleResult = this.ruleEngine.resolveAttackRoll({
      naturalD20: this.selectNaturalD20(attackRoll),
      attackBonus: modifier,
      targetArmorClass,
      advantageState: "normal",
    });
    const spellRuleResult = this.ruleEngine.resolveChillTouch({
      spellChillTouch: command.spellId === CHILL_TOUCH_SPELL_ID,
      casterKnownCantrips: this.resolveKnownCantrips(command.spellId),
      actionAvailable: true,
      targetDistanceFt: command.targetDistanceFt,
      componentAvailability: this.resolveDefaultComponentAvailability(),
      spellAttackRollResult: attackRuleResult.produced,
      targetIsUndead: this.hasCondition(target, "undead"),
    });
    const ruleResults: RuleHookResult<unknown>[] = [attackRuleResult, spellRuleResult];
    const stateChanges: CharacterStatePatch[] = [];
    let damageRoll: DiceRollResponseDto | null = null;
    let finalDamage = 0;

    if (spellRuleResult.accepted && spellRuleResult.produced["damagePacket.necrotic"]) {
      damageRoll = this.diceService.roll(spellDamageDice ?? "1d8");
      const damageRuleResult = this.ruleEngine.applyDamageModifiers({
        baseDamage: damageRoll.total,
        damageType: spellDamageType,
        ...this.resolveDamageProfile(target),
      });
      ruleResults.push(damageRuleResult);
      finalDamage = damageRuleResult.produced.finalDamage;
      const nextHp = Math.max(target.currentHp - finalDamage, 0);
      stateChanges.push({
        sessionCharacterId: target.id,
        currentHp: nextHp,
        markDead: nextHp <= 0,
      });
    }

    return {
      structuredAction: {
        type: "cast_spell",
        spellId: command.spellId,
        slotLevel,
        target: target.id,
        targetDistanceFt: command.targetDistanceFt,
        targetArmorClass,
        spellDefinition: spellDefinition
          ? {
              id: spellDefinition.id,
              level: spellLevel,
              damage: spellDefinition.damage,
              targeting: spellDefinition.targeting,
              scaling: spellDefinition.scaling,
            }
          : null,
        spellScaling,
        damageType: spellDamageType,
        damageDice: spellDamageDice,
        damageRoll: damageRoll ? { ...damageRoll } : null,
        finalDamage,
        ruleResults,
      },
      diceResult: attackRoll,
      outcome: this.resolveSpellOutcome(spellRuleResult.accepted, attackRuleResult.produced.hit),
      narration: this.createChillTouchNarration(spellRuleResult.accepted, attackRuleResult.produced.hit),
      stateChanges,
      runtimeEffects: spellRuleResult.accepted ? this.spellRuntimeEffects(slotLevel) : [],
    };
  }

  private resolveCastAreaSpell(
    command: Extract<ParsedCommand, { type: "cast_area_spell" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    if (!this.hasActionAvailable(runtimeContext)) {
      return this.createActionUnavailableResolution("cast_area_spell", {
        spellId: command.spellId,
        targetIds: command.targetIds,
      });
    }

    const spellDefinition = this.resolveSpellDefinition(command.spellId);
    if (
      !spellDefinition ||
      spellDefinition.targeting.type !== "area" ||
      !spellDefinition.damage ||
      !spellDefinition.save
    ) {
      return {
        structuredAction: {
          type: "cast_area_spell",
          spellId: command.spellId,
          targetIds: command.targetIds,
          rejectedReason: "unsupported_area_spell",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("unsupported_spell"),
        stateChanges: [],
      };
    }

    const spellLevel = this.resolveSpellLevel(spellDefinition);
    const slotLevel = command.slotLevel ?? spellLevel;
    let spellScaling: SpellScalingResult | null = null;
    try {
      spellScaling = this.resolveSpellScaling(spellDefinition, slotLevel);
    } catch (error) {
      return {
        structuredAction: {
          type: "cast_area_spell",
          spellId: command.spellId,
          slotLevel,
          targetIds: command.targetIds,
          spellScaling: null,
          rejectedReason: "invalid_spell_slot_level",
          errorMessage: error instanceof Error ? error.message : "Invalid spell slot level.",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("invalid_spell_slot_level"),
        stateChanges: [],
      };
    }

    const targets = command.targetIds.map((targetId) =>
      this.requireTarget(targetId, sessionCharacters),
    );
    const saveAbility = spellDefinition.save.ability;
    const aoeInput = this.aoeDamage.createInputFromSpell({
      spellDefinition,
      saveDc: command.saveDc,
      damageDice: spellScaling?.damageDice ?? spellDefinition.damage.dice,
      targets: targets.map((target) => this.toAoeDamageTarget(target, saveAbility)),
    });
    const aoeResolution = this.aoeDamage.resolveDamage(aoeInput);

    return {
      structuredAction: {
        type: "cast_area_spell",
        spellId: command.spellId,
        slotLevel,
        saveDc: command.saveDc,
        targetIds: command.targetIds,
        spellDefinition: this.toStructuredSpellDefinition(spellDefinition, spellLevel),
        spellScaling,
        targeting: spellDefinition.targeting,
        aoe: {
          sourceId: aoeResolution.sourceId,
          damageDice: aoeResolution.damageDice,
          damageType: aoeResolution.damageType,
          targetResults: aoeResolution.targetResults,
        },
      },
      diceResult: aoeResolution.damageRoll,
      outcome: ActionOutcome.SUCCESS,
      narration: `${command.spellId} 광역 주문을 처리했습니다.`,
      stateChanges: aoeResolution.stateChanges,
      runtimeEffects: this.spellRuntimeEffects(slotLevel),
    };
  }

  private resolveSpellAttackDamage(params: {
    command: Extract<ParsedCommand, { type: "cast_spell" }>;
    actor: SessionCharacterForRules;
    target: SessionCharacterForRules;
    targetArmorClass: number;
    spellDefinition: RuleCatalogEntry | null;
    spellLevel: number;
    slotLevel: number;
    spellScaling: SpellScalingResult | null;
    spellDamageType: string;
    spellDamageDice: string | null;
  }): ActionResolution {
    const maxRangeFt = this.resolveSpellRangeFt(params.spellDefinition);
    if (maxRangeFt !== null && params.command.targetDistanceFt > maxRangeFt) {
      return {
        structuredAction: {
          type: "cast_spell",
          spellId: params.command.spellId,
          slotLevel: params.slotLevel,
          target: params.target.id,
          targetDistanceFt: params.command.targetDistanceFt,
          targetArmorClass: params.targetArmorClass,
          spellDefinition: this.toStructuredSpellDefinition(params.spellDefinition, params.spellLevel),
          spellScaling: params.spellScaling,
          rejectedReason: "target_out_of_range",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createSpellRejectedNarration("target_out_of_range"),
        stateChanges: [],
      };
    }

    const modifier = params.actor.character.proficiencyBonus;
    const attackRoll = this.diceService.roll(`1d20+${modifier}`, DiceAdvantageState.NORMAL);
    const attackRuleResult = this.ruleEngine.resolveAttackRoll({
      naturalD20: this.selectNaturalD20(attackRoll),
      attackBonus: modifier,
      targetArmorClass: params.targetArmorClass,
      advantageState: "normal",
    });
    const ruleResults: RuleHookResult<unknown>[] = [attackRuleResult];
    const stateChanges: CharacterStatePatch[] = [];
    let damageRoll: DiceRollResponseDto | null = null;
    let finalDamage = 0;

    if (attackRuleResult.produced.hit && params.spellDamageDice) {
      damageRoll = this.diceService.roll(params.spellDamageDice);
      const damageRuleResult = this.ruleEngine.applyDamageModifiers({
        baseDamage: damageRoll.total,
        damageType: params.spellDamageType,
        ...this.resolveDamageProfile(params.target),
      });
      ruleResults.push(damageRuleResult);
      finalDamage = damageRuleResult.produced.finalDamage;
      const nextHp = Math.max(params.target.currentHp - finalDamage, 0);
      stateChanges.push({
        sessionCharacterId: params.target.id,
        currentHp: nextHp,
        markDead: nextHp <= 0,
      });
    }

    return {
      structuredAction: {
        type: "cast_spell",
        spellId: params.command.spellId,
        slotLevel: params.slotLevel,
        target: params.target.id,
        targetDistanceFt: params.command.targetDistanceFt,
        targetArmorClass: params.targetArmorClass,
        spellDefinition: this.toStructuredSpellDefinition(params.spellDefinition, params.spellLevel),
        spellScaling: params.spellScaling,
        damageType: params.spellDamageType,
        damageDice: params.spellDamageDice,
        damageRoll: damageRoll ? { ...damageRoll } : null,
        finalDamage,
        ruleResults,
      },
      diceResult: attackRoll,
      outcome: attackRuleResult.produced.hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: this.createSpellAttackNarration(params.command.spellId, attackRuleResult.produced.hit),
      stateChanges,
      runtimeEffects: this.spellRuntimeEffects(params.slotLevel),
    };
  }

  private resolveMagicMissile(params: {
    command: Extract<ParsedCommand, { type: "cast_spell" }>;
    target: SessionCharacterForRules;
    spellDefinition: RuleCatalogEntry | null;
    spellLevel: number;
    slotLevel: number;
    spellScaling: SpellScalingResult | null;
    spellDamageType: string;
  }): ActionResolution {
    const missileCount = params.spellScaling?.targetCount ?? 3;
    const damageDice = `${missileCount}d4+${missileCount}`;
    const damageRoll = this.diceService.roll(damageDice);
    const damageRuleResult = this.ruleEngine.applyDamageModifiers({
      baseDamage: damageRoll.total,
      damageType: params.spellDamageType,
      ...this.resolveDamageProfile(params.target),
    });
    const finalDamage = damageRuleResult.produced.finalDamage;
    const nextHp = Math.max(params.target.currentHp - finalDamage, 0);

    return {
      structuredAction: {
        type: "cast_spell",
        spellId: params.command.spellId,
        slotLevel: params.slotLevel,
        target: params.target.id,
        targetDistanceFt: params.command.targetDistanceFt,
        spellDefinition: params.spellDefinition
          ? {
              id: params.spellDefinition.id,
              level: params.spellLevel,
              damage: params.spellDefinition.damage,
              targeting: params.spellDefinition.targeting,
              scaling: params.spellDefinition.scaling,
            }
          : null,
        spellScaling: params.spellScaling,
        missileCount,
        damageType: params.spellDamageType,
        damageDice,
        damageRoll: { ...damageRoll },
        finalDamage,
        ruleResults: [damageRuleResult],
      },
      diceResult: damageRoll,
      outcome: ActionOutcome.SUCCESS,
      narration: "Magic Missile이 자동으로 명중했습니다.",
      stateChanges: [
        {
          sessionCharacterId: params.target.id,
          currentHp: nextHp,
          markDead: nextHp <= 0,
        },
      ],
      runtimeEffects: this.spellRuntimeEffects(params.slotLevel),
    };
  }

  private spellRuntimeEffects(slotLevel: number): ActionRuntimeEffect[] {
    return [
      { type: "SPEND_ACTION" },
      ...(slotLevel > 0 ? [{ type: "SPEND_SPELL_SLOT", slotLevel } as const] : []),
    ];
  }

  private resolveClassFeature(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    switch (command.featureId) {
      case SECOND_WIND_FEATURE_ID:
        return this.resolveSecondWind(actor, runtimeContext);
      case ACTION_SURGE_FEATURE_ID:
        return this.resolveActionSurge(actor, runtimeContext);
      case FIGHTING_STYLE_FEATURE_ID:
      case FIGHTING_STYLE_DATA_FEATURE_ID:
        return this.resolveFightingStyle(command, actor);
      case RAGE_FEATURE_ID:
        return this.resolveRage(actor, runtimeContext);
      case SNEAK_ATTACK_FEATURE_ID:
      case SNEAK_ATTACK_DATA_FEATURE_ID:
        return this.resolveSneakAttackCommand();
      case EXPERTISE_FEATURE_ID:
      case EXPERTISE_DATA_FEATURE_ID:
        return this.resolveExpertise(command, actor);
      case FAVORED_ENEMY_FEATURE_ID:
      case FAVORED_ENEMY_DATA_FEATURE_ID:
        return this.resolveFavoredEnemy(command, actor);
      case CUNNING_ACTION_FEATURE_ID:
        return this.resolveCunningAction(command, actor, runtimeContext);
      case FRENZY_FEATURE_ID:
        return this.resolveFrenzy(actor, runtimeContext);
      default:
        throw forbidden("ACTION_403", "실행할 수 없는 직업 기능입니다.", {
          reason: "UNSUPPORTED_CLASS_FEATURE",
          featureId: command.featureId,
        });
    }
  }

  private resolveInventory(command: Extract<ParsedCommand, { type: "inventory" }>): ActionResolution {
    const effect: ActionRuntimeEffect =
      command.operation === "add"
        ? {
            type: "ADD_ITEM",
            itemDefinitionId: command.itemId,
            quantity: command.quantity,
            containerEntryId: command.containerEntryId ?? null,
          }
        : {
            type: "REMOVE_ITEM",
            itemId: command.itemId,
            quantity: command.quantity,
          };

    return {
      structuredAction: {
        type: "inventory",
        operation: command.operation,
        itemId: command.itemId,
        quantity: command.quantity,
        ...(command.containerEntryId ? { containerEntryId: command.containerEntryId } : {}),
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration:
        command.operation === "add"
          ? "아이템을 인벤토리에 추가했습니다."
          : "아이템을 인벤토리에서 제거했습니다.",
      stateChanges: [],
      runtimeEffects: [effect],
    };
  }

  private resolveItemInteraction(
    command: Extract<ParsedCommand, { type: "item_interaction" }>,
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const actorPoint = this.resolveActorGridPoint(actor, runtimeContext);
    if (!actorPoint) {
      return this.createItemInteractionRejectedResolution(command, "actor_position_not_found");
    }

    if (command.operation === "pickup") {
      const pickupObject = this.resolvePickupMapObject(command, runtimeContext.map);
      if (pickupObject.rejectedReason) {
        return this.createItemInteractionRejectedResolution(command, pickupObject.rejectedReason);
      }

      const result = this.itemInteractions.resolvePickup({
        objectId: command.objectId,
        itemDefinitionId: command.itemDefinitionId,
        quantity: command.quantity,
        actorPoint,
        objectPoint: command.point,
      });
      if (!result.accepted) {
        return this.createItemInteractionRejectedResolution(command, result.rejectedReason, result.distanceFt);
      }
      if (result.type !== "pickup") {
        throw new Error("Unexpected pickup item interaction resolution.");
      }
      const remainingQuantity =
        pickupObject.quantity !== null ? pickupObject.quantity - result.quantity : 0;

      return {
        structuredAction: {
          type: "item_interaction",
          operation: "pickup",
          objectId: command.objectId,
          itemDefinitionId: command.itemDefinitionId,
          quantity: command.quantity,
          actorPoint,
          result,
        },
        diceResult: null,
        outcome: ActionOutcome.SUCCESS,
        narration: "아이템을 주웠습니다.",
        stateChanges: [],
        runtimeEffects: [
          {
            type: "ADD_ITEM",
            itemDefinitionId: result.itemDefinitionId,
            quantity: result.quantity,
          },
          remainingQuantity > 0
            ? {
                type: "UPDATE_MAP_OBJECT_QUANTITY",
                objectId: result.objectId,
                itemDefinitionId: result.itemDefinitionId,
                quantity: remainingQuantity,
              }
            : {
                type: "REMOVE_MAP_OBJECT",
                objectId: result.objectId,
              },
        ],
      };
    }

    const item = this.requireInventoryItemForInteraction(actor, command.itemId);
    if (command.operation === "drop") {
      const result = this.itemInteractions.resolveDrop({
        item,
        quantity: command.quantity,
        actorPoint,
        dropPoint: command.point,
      });
      if (!result.accepted) {
        return this.createItemInteractionRejectedResolution(command, result.rejectedReason, result.distanceFt);
      }
      if (result.type !== "drop") {
        throw new Error("Unexpected drop item interaction resolution.");
      }

      return {
        structuredAction: {
          type: "item_interaction",
          operation: "drop",
          itemId: command.itemId,
          quantity: command.quantity,
          actorPoint,
          result,
        },
        diceResult: null,
        outcome: ActionOutcome.SUCCESS,
        narration: `${item.name}을(를) 바닥에 내려놓았습니다.`,
        stateChanges: [],
        runtimeEffects: [
          {
            type: "REMOVE_ITEM",
            itemId: result.entryId,
            quantity: result.removeQuantity,
          },
          {
            type: "CREATE_MAP_OBJECT",
            objectId: this.createDroppedItemObjectId(result.entryId, result.createObject.point),
            itemDefinitionId: result.createObject.itemDefinitionId,
            name: result.createObject.name,
            quantity: result.createObject.quantity,
            point: result.createObject.point,
          },
        ],
      };
    }

    const abilities = this.parseJson<Record<string, number>>(actor.character.abilitiesJson, {});
    const result = this.itemInteractions.resolveThrow({
      item,
      quantity: command.quantity,
      actorPoint,
      targetPoint: command.point,
      strengthModifier: this.abilityModifierFromScore(abilities.str ?? 10),
      dexterityModifier: this.abilityModifierFromScore(abilities.dex ?? 10),
      proficiencyBonus: actor.character.proficiencyBonus,
      proficient: item.properties?.some((property) => this.normalizeRuleToken(property) === "proficient"),
    });
    if (!result.accepted) {
      return this.createItemInteractionRejectedResolution(command, result.rejectedReason, result.distanceFt);
    }
    if (result.type !== "throw") {
      throw new Error("Unexpected throw item interaction resolution.");
    }

    return {
      structuredAction: {
        type: "item_interaction",
        operation: "throw",
        itemId: command.itemId,
        quantity: command.quantity,
        actorPoint,
        result,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: `${item.name}을(를) 던졌습니다.`,
      stateChanges: [],
      runtimeEffects: [
        {
          type: "REMOVE_ITEM",
          itemId: result.entryId,
          quantity: result.removeQuantity,
        },
        {
          type: "CREATE_MAP_OBJECT",
          objectId: this.createThrownItemObjectId(result.entryId, result.missObject.point),
          itemDefinitionId: result.missObject.itemDefinitionId,
          name: result.missObject.name,
          quantity: result.missObject.quantity,
          point: result.missObject.point,
        },
        { type: "SPEND_ACTION" },
      ],
    };
  }

  private resolveSecondWind(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const secondWindAvailable =
      runtimeContext.resource?.secondWindAvailable ??
      !this.hasCondition(actor, SECOND_WIND_EXPENDED_TAG);
    const bonusActionAvailable = this.hasBonusActionAvailable(runtimeContext);
    const canRollHealing =
      this.isClass(actor, "fighter") && secondWindAvailable && bonusActionAvailable;
    const healingRoll = canRollHealing ? this.diceService.roll("1d10") : null;
    const ruleResult = this.ruleEngine.applySecondWind({
      fighterLevel: this.isClass(actor, "fighter") ? actor.character.level : 0,
      bonusActionAvailable,
      secondWindAvailable,
      // 실패하는 경우에는 실제 회복이 일어나지 않으므로 임시 최소값을 넘겨 훅 결과만 만든다.
      healingRollD10: healingRoll ? this.selectSingleDie(healingRoll) : 1,
      currentHitPoints: actor.currentHp,
      maxHitPoints: actor.character.maxHp,
    });

    if (!ruleResult.accepted) {
      return {
        structuredAction: {
          type: "use_class_feature",
          featureId: SECOND_WIND_FEATURE_ID,
          ruleResults: [ruleResult],
        },
        diceResult: healingRoll ? { ...healingRoll } : null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
        stateChanges: [],
      };
    }

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: SECOND_WIND_FEATURE_ID,
        healingRoll: healingRoll ? { ...healingRoll } : null,
        ruleResults: [ruleResult],
      },
      diceResult: healingRoll ? { ...healingRoll } : null,
      outcome: ActionOutcome.SUCCESS,
      narration: `Second Wind로 HP를 ${ruleResult.produced.newHitPoints}까지 회복했습니다.`,
      stateChanges: [
        {
          sessionCharacterId: actor.id,
          currentHp: ruleResult.produced.newHitPoints,
          conditions: this.addConditions(currentConditions, [SECOND_WIND_EXPENDED_TAG]),
        },
      ],
      runtimeEffects: [{ type: "SPEND_SECOND_WIND" }, { type: "SPEND_BONUS_ACTION" }],
    };
  }

  private resolveActionSurge(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const actionSurgeAvailableUses =
      runtimeContext.resource?.actionSurgeUses ??
      (this.hasCondition(actor, ACTION_SURGE_EXPENDED_TAG) ? 0 : 1);
    const ruleResult = this.ruleEngine.applyActionSurge({
      fighterLevel: this.isClass(actor, "fighter") ? actor.character.level : 0,
      actionSurgeAvailableUses,
      turnActionState: {
        actionSurgeUsedThisTurn:
          runtimeContext.turnState?.additionalActionGranted ??
          this.hasCondition(actor, ACTION_SURGE_GRANTED_TAG),
      },
    });

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: ACTION_SURGE_FEATURE_ID,
        ruleResults: [ruleResult],
      },
      diceResult: null,
      outcome: ruleResult.accepted ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: ruleResult.accepted
        ? "Action Surge로 추가 행동을 얻었습니다."
        : this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
      stateChanges: ruleResult.accepted
        ? [
            {
              sessionCharacterId: actor.id,
              conditions: this.addConditions(currentConditions, [
                ACTION_SURGE_EXPENDED_TAG,
                ACTION_SURGE_GRANTED_TAG,
              ]),
            },
          ]
        : [],
      runtimeEffects: ruleResult.accepted
        ? [{ type: "SPEND_ACTION_SURGE_USE" }, { type: "GRANT_ADDITIONAL_ACTION" }]
        : [],
    };
  }

  private resolveFightingStyle(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
  ): ActionResolution {
    const selectedStyle = command.option ?? "";
    const currentConditions = this.getConditions(actor);
    const ruleResult = this.ruleEngine.applyFightingStyle({
      fighterLevel: this.isClass(actor, "fighter") ? actor.character.level : 0,
      selectedStyle,
    });

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: FIGHTING_STYLE_FEATURE_ID,
        option: selectedStyle || null,
        ruleResults: [ruleResult],
      },
      diceResult: null,
      outcome: ruleResult.accepted ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: ruleResult.accepted
        ? `Fighting Style(${ruleResult.produced.selectedStyle})을 적용했습니다.`
        : this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
      stateChanges: ruleResult.accepted
        ? [
            {
              sessionCharacterId: actor.id,
              conditions: this.addConditions(currentConditions, [
                `${FIGHTING_STYLE_TAG_PREFIX}${ruleResult.produced.selectedStyle}`,
              ]),
            },
          ]
        : [],
    };
  }

  private resolveSneakAttackCommand(): ActionResolution {
    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: SNEAK_ATTACK_FEATURE_ID,
        ruleResults: [],
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: "Sneak Attack은 조건을 만족한 무기 공격 명중 시 자동 적용됩니다.",
      stateChanges: [],
    };
  }

  private resolveExpertise(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
  ): ActionResolution {
    const selections = this.parseFeatureOptionTokens(command.option);
    const currentConditions = this.getConditions(actor);
    const proficientSkills = this.parseJson<string[]>(actor.character.proficientSkillsJson, []);
    const ruleResult = this.ruleEngine.applyExpertise({
      rogueLevel: this.isClass(actor, "rogue") ? actor.character.level : 0,
      selections,
      proficientSkills,
      hasThievesToolsProficiency:
        this.isClass(actor, "rogue") || this.hasFeatureTag(actor, "tool:thieves_tools"),
    });

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: EXPERTISE_FEATURE_ID,
        option: command.option,
        ruleResults: [ruleResult],
      },
      diceResult: null,
      outcome: ruleResult.accepted ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: ruleResult.accepted
        ? `Expertise(${ruleResult.produced.expertiseSelections.join(", ")})를 적용했습니다.`
        : this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
      stateChanges: ruleResult.accepted
        ? [
            {
              sessionCharacterId: actor.id,
              conditions: this.addConditions(
                currentConditions,
                ruleResult.produced.expertiseSelections.map(
                  (selection) => `${EXPERTISE_TAG_PREFIX}${selection}`,
                ),
              ),
            },
          ]
        : [],
    };
  }

  private resolveFavoredEnemy(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
  ): ActionResolution {
    const [selectedEnemy = "", ...humanoidRaceSelections] = this.parseFeatureOptionTokens(
      command.option,
    );
    const currentConditions = this.getConditions(actor);
    const ruleResult = this.ruleEngine.applyFavoredEnemy({
      rangerLevel: this.isClass(actor, "ranger") ? actor.character.level : 0,
      selectedEnemy,
      humanoidRaceSelections,
    });

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: FAVORED_ENEMY_FEATURE_ID,
        option: command.option,
        ruleResults: [ruleResult],
      },
      diceResult: null,
      outcome: ruleResult.accepted ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: ruleResult.accepted
        ? `Favored Enemy(${ruleResult.produced.selectedEnemy})를 적용했습니다.`
        : this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
      stateChanges: ruleResult.accepted
        ? [
            {
              sessionCharacterId: actor.id,
              conditions: this.addConditions(currentConditions, [
                `${FAVORED_ENEMY_TAG_PREFIX}${ruleResult.produced.selectedEnemy}`,
                ...ruleResult.produced.humanoidRaceSelections.map(
                  (race) => `${FAVORED_ENEMY_HUMANOID_TAG_PREFIX}${race}`,
                ),
              ]),
            },
          ]
        : [],
    };
  }

  private resolveRage(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const rageAvailableUses = runtimeContext.resource
      ? runtimeContext.resource.rageActive
        ? 0
        : runtimeContext.resource.rageUses
      : this.hasCondition(actor, RAGE_EXPENDED_TAG)
        ? 0
        : 1;
    const ruleResult = this.ruleEngine.applyRage({
      barbarianLevel: this.isClass(actor, "barbarian") ? actor.character.level : 0,
      bonusActionAvailable: this.hasBonusActionAvailable(runtimeContext),
      rageAvailableUses,
      armorCategory: this.resolveArmorCategory(actor),
      strengthAttackDamagePacket: true,
      currentConcentrationState: this.hasCondition(actor, "concentration") ? "active" : "none",
    });

    if (!ruleResult.accepted) {
      return {
        structuredAction: {
          type: "use_class_feature",
          featureId: RAGE_FEATURE_ID,
          ruleResults: [ruleResult],
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
        stateChanges: [],
      };
    }

    const rageTags = ruleResult.produced.bludgeoningResistance ? RAGE_RESISTANCE_TAGS : [];
    const nextConditions = this.removeConditions(
      this.addConditions(currentConditions, [RAGE_EXPENDED_TAG, RAGE_ACTIVE_TAG, ...rageTags]),
      ruleResult.produced.concentrationEnded ? ["concentration", "condition.concentration"] : [],
    );

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: RAGE_FEATURE_ID,
        ruleResults: [ruleResult],
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: "Rage 상태가 적용되었습니다.",
      stateChanges: [
        {
          sessionCharacterId: actor.id,
          conditions: nextConditions,
        },
      ],
      runtimeEffects: [{ type: "START_RAGE" }, { type: "SPEND_BONUS_ACTION" }],
    };
  }

  private resolveCunningAction(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const declaredCunningAction = command.option ?? "";
    const ruleResult = this.ruleEngine.applyCunningAction({
      rogueLevel: this.isClass(actor, "rogue") ? actor.character.level : 0,
      bonusActionAvailable: this.hasBonusActionAvailable(runtimeContext),
      declaredCunningAction,
    });

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: CUNNING_ACTION_FEATURE_ID,
        option: declaredCunningAction || null,
        ruleResults: [ruleResult],
      },
      diceResult: null,
      outcome: ruleResult.accepted ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: ruleResult.accepted
        ? `Cunning Action으로 ${ruleResult.produced.grantedActionType} 행동을 수행했습니다.`
        : this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
      stateChanges: [],
      runtimeEffects: ruleResult.accepted ? [{ type: "SPEND_BONUS_ACTION" }] : [],
    };
  }

  private resolveFrenzy(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const rageActive =
      runtimeContext.resource?.rageActive ?? this.hasCondition(actor, RAGE_ACTIVE_TAG);
    const ruleResult = this.ruleEngine.applyFrenzy({
      rageActivationAccepted: rageActive,
      bonusActionAvailableOnFollowingTurns: true,
      frenzyDeclared: true,
      exhaustionState: runtimeContext.resource?.exhaustionLevel ?? 0,
    });

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: FRENZY_FEATURE_ID,
        ruleResults: [ruleResult],
      },
      diceResult: null,
      outcome: ruleResult.accepted ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: ruleResult.accepted
        ? "Frenzy 상태가 적용되었습니다."
        : this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
      stateChanges: [],
      runtimeEffects: ruleResult.accepted ? [{ type: "START_FRENZY" }] : [],
    };
  }

  private resolveRest(
    command: Extract<ParsedCommand, { type: "rest" }>,
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    if (runtimeContext.hasActiveCombat) {
      return {
        structuredAction: {
          type: "rest",
          restType: command.restType,
          ruleResults: [],
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: "전투 중에는 휴식을 진행할 수 없습니다.",
        stateChanges: [],
        runtimeEffects: [],
      };
    }

    const restResolution = this.restResolution.resolveRest({
      restType: command.restType,
      currentHp: actor.currentHp,
      maxHp: actor.character.maxHp,
      tempHp: actor.tempHp,
      conditions: this.getConditions(actor),
      resource: runtimeContext.resource,
      resourceMaximums: {
        actionSurgeUses: this.resolveActionSurgeUses(actor),
        rageUses: this.resolveRageUses(actor),
      },
    });

    if (command.restType === "short") {
      return this.resolveShortRest(actor, restResolution);
    }

    return this.resolveLongRest(actor, restResolution, runtimeContext);
  }

  private resolveShortRest(
    actor: SessionCharacterForRules,
    rest: RestResolution,
  ): ActionResolution {
    return {
      structuredAction: {
        type: "rest",
        restType: "short",
        recoveredResources: {
          secondWindAvailable: rest.resource.secondWindAvailable,
          actionSurgeUses: rest.resource.actionSurgeUses,
        },
        recoveredTags: rest.recoveredTags,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: "짧은 휴식을 마치고 일부 자원을 회복했습니다.",
      stateChanges: [
        {
          sessionCharacterId: actor.id,
          conditions: rest.conditions,
        },
      ],
      runtimeEffects: [
        {
          type: "RECOVER_SHORT_REST",
          actionSurgeUses: rest.resource.actionSurgeUses,
        },
      ],
    };
  }

  private resolveLongRest(
    actor: SessionCharacterForRules,
    rest: RestResolution,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentExhaustionLevel = runtimeContext.resource?.exhaustionLevel ?? 1;
    return {
      structuredAction: {
        type: "rest",
        restType: "long",
        recoveredResources: {
          secondWindAvailable: rest.resource.secondWindAvailable,
          actionSurgeUses: rest.resource.actionSurgeUses,
          rageUses: rest.resource.rageUses,
          reduceExhaustionBy: Math.max(currentExhaustionLevel - rest.resource.exhaustionLevel, 0),
        },
        recoveredTags: rest.recoveredTags,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: "긴 휴식을 마치고 HP와 자원을 회복했습니다.",
      stateChanges: [
        {
          sessionCharacterId: actor.id,
          currentHp: rest.hp.currentHp,
          tempHp: rest.hp.tempHp,
          conditions: rest.conditions,
          markDead: false,
        },
      ],
      runtimeEffects: [
        {
          type: "RECOVER_LONG_REST",
          actionSurgeUses: rest.resource.actionSurgeUses,
          rageUses: rest.resource.rageUses,
          reduceExhaustionBy: Math.max(currentExhaustionLevel - rest.resource.exhaustionLevel, 0),
        },
      ],
    };
  }

  private resolveDamage(
    command: Extract<ParsedCommand, { type: "damage" }>,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const damageType = command.damageType ?? DEFAULT_DIRECT_DAMAGE_TYPE;
    const damageRuleResult = this.ruleEngine.applyDamageModifiers({
      baseDamage: command.amount,
      damageType,
      ...this.resolveDamageProfile(target),
    });
    const finalDamage = damageRuleResult.produced.finalDamage;
    const remainingTempHp = Math.max(target.tempHp - finalDamage, 0);
    const overflowDamage = Math.max(finalDamage - target.tempHp, 0);
    const nextHp = Math.max(target.currentHp - overflowDamage, 0);
    const concentrationCheck =
      finalDamage > 0 ? this.resolveConcentrationDamageCheck(target, finalDamage) : null;
    const ruleResults: RuleHookResult<unknown>[] = [damageRuleResult];
    if (concentrationCheck?.ruleResult) {
      ruleResults.push(concentrationCheck.ruleResult);
    }
    const stateChange: CharacterStatePatch = {
      sessionCharacterId: target.id,
      currentHp: nextHp,
      tempHp: remainingTempHp,
      markDead: nextHp <= 0,
    };
    if (concentrationCheck && !concentrationCheck.concentrationMaintained) {
      stateChange.conditions = concentrationCheck.conditions;
    }

    return {
      structuredAction: {
        type: "damage",
        target: target.id,
        amount: command.amount,
        damageType,
        finalDamage,
        concentrationCheck: concentrationCheck
          ? {
              concentrationMaintained: concentrationCheck.concentrationMaintained,
              removedConditions: concentrationCheck.removedConditions,
              concentrationState: concentrationCheck.concentrationState,
            }
          : null,
        ruleResults,
      },
      diceResult: concentrationCheck?.diceResult ?? null,
      outcome: ActionOutcome.SUCCESS,
      narration: `${target.character.name}에게 ${finalDamage} 피해를 적용했습니다.`,
      stateChanges: [stateChange],
    };
  }

  private resolveConcentrationDamageCheck(
    target: SessionCharacterForRules,
    finalDamage: number,
  ): {
    diceResult: DiceRollResponseDto;
    ruleResult: RuleHookResult<unknown> | null;
    conditions: unknown[];
    removedConditions: unknown[];
    concentrationState: unknown;
    concentrationMaintained: boolean;
  } | null {
    const conditions = this.conditionRuntime.parseConditionsJson(target.conditionsJson);
    const hasConcentration = conditions.some(
      (condition) =>
        condition.conditionId === "condition.concentration" ||
        condition.tags.includes("concentration"),
    );
    if (!hasConcentration) {
      return null;
    }

    const saveProficient = this.resolveSaveProficiencies(target).includes("con");
    const saveModifier =
      this.resolveAbilityModifier(target, "con") +
      (saveProficient ? target.character.proficiencyBonus : 0);
    const diceResult = this.diceService.roll(`1d20${saveModifier >= 0 ? "+" : ""}${saveModifier}`);
    const result = this.concentrationRuntime.resolveDamageCheck({
      conditions,
      damageTaken: finalDamage,
      naturalD20: this.selectNaturalD20(diceResult),
      constitutionModifier: this.resolveAbilityModifier(target, "con"),
      proficiencyBonus: target.character.proficiencyBonus,
      proficient: saveProficient,
    });

    return {
      diceResult,
      ruleResult: result.ruleResult,
      conditions: result.conditions,
      removedConditions: result.removedConditions,
      concentrationState: result.concentrationState,
      concentrationMaintained: result.concentrationMaintained,
    };
  }

  private resolveHeal(
    command: Extract<ParsedCommand, { type: "heal" }>,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const nextHp = Math.min(target.currentHp + command.amount, target.character.maxHp);

    return {
      structuredAction: { type: "heal", target: target.id, amount: command.amount },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: `${target.character.name}의 HP를 ${nextHp}로 회복했습니다.`,
      stateChanges: [{ sessionCharacterId: target.id, currentHp: nextHp }],
    };
  }

  private resolveCondition(
    command: Extract<ParsedCommand, { type: "condition" }>,
    sessionCharacters: SessionCharacterForRules[],
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const currentConditionEntries = this.parseJson<unknown[]>(target.conditionsJson, []);
    const nextConditions =
      command.operation === "add"
        ? this.addConditionEntry(currentConditionEntries, command.condition)
        : this.removeConditionEntry(currentConditionEntries, command.condition);

    return {
      structuredAction: {
        type: "condition",
        operation: command.operation,
        target: target.id,
        condition: command.condition,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: `${target.character.name}의 상태를 갱신했습니다.`,
      stateChanges: [{ sessionCharacterId: target.id, conditions: nextConditions }],
    };
  }

  private getCheckModifier(actor: SessionCharacterForRules, checkName: string): number {
    const abilities = this.parseJson<Record<string, number>>(actor.character.abilitiesJson, {});
    const proficientSkills = this.parseJson<string[]>(actor.character.proficientSkillsJson, []);
    const normalizedCheckName = this.normalizeRuleToken(checkName);
    const abilityKey = this.resolveAbilityKey(checkName);
    const abilityScore = abilities[abilityKey] ?? 10;
    const abilityModifier = Math.floor((abilityScore - 10) / 2);
    const hasProficiency = proficientSkills
      .map((skill) => this.normalizeRuleToken(skill))
      .includes(normalizedCheckName);
    const hasExpertise = this.hasFeatureTag(actor, `${EXPERTISE_TAG_PREFIX}${normalizedCheckName}`);
    const proficiency = hasProficiency
      ? actor.character.proficiencyBonus * (hasExpertise ? 2 : 1)
      : 0;
    return abilityModifier + proficiency;
  }

  private hasActionAvailable(runtimeContext: RuleRuntimeContext): boolean {
    const turnState = runtimeContext.turnState;
    if (!turnState) {
      return true;
    }

    return !turnState.actionUsed || turnState.additionalActionGranted;
  }

  private hasBonusActionAvailable(runtimeContext: RuleRuntimeContext): boolean {
    return !runtimeContext.turnState?.bonusActionUsed;
  }

  private createActionUnavailableResolution(
    type: string,
    payload: Record<string, unknown>,
  ): ActionResolution {
    return {
      structuredAction: {
        type,
        ...payload,
        ruleResults: [],
      },
      diceResult: null,
      outcome: ActionOutcome.IMPOSSIBLE,
      narration: "사용 가능한 action이 없습니다.",
      stateChanges: [],
      runtimeEffects: [],
    };
  }

  private resolveAbilityKey(checkName: string): string {
    const normalized = checkName.toLowerCase();
    const skillToAbility: Record<string, string> = {
      athletics: "str",
      acrobatics: "dex",
      stealth: "dex",
      arcana: "int",
      investigation: "int",
      perception: "wis",
      survival: "wis",
      persuasion: "cha",
      intimidation: "cha",
      deception: "cha",
    };

    return skillToAbility[normalized] ?? normalized.slice(0, 3);
  }

  private requireTarget(
    targetToken: string,
    sessionCharacters: SessionCharacterForRules[],
  ): SessionCharacterForRules {
    const target = this.findTarget(targetToken, sessionCharacters);
    if (!target) {
      throw forbidden("ACTION_403", "대상을 찾을 수 없습니다.", {
        reason: "TARGET_NOT_FOUND",
      });
    }

    return target;
  }

  private findTarget(
    targetToken: string,
    sessionCharacters: SessionCharacterForRules[],
  ): SessionCharacterForRules | null {
    const normalized = this.normalizeTargetToken(targetToken);
    return (
      sessionCharacters.find((candidate) =>
        this.getTargetAliases(candidate).some(
          (alias) => this.normalizeTargetToken(alias) === normalized,
        ),
      ) ?? null
    );
  }

  private getTargetAliases(candidate: SessionCharacterForRules): string[] {
    return [
      candidate.id,
      candidate.userId,
      candidate.characterId,
      candidate.character.id,
      candidate.character.name,
      candidate.user?.id,
      candidate.user?.displayName,
      candidate.user?.profile?.nickname,
    ].filter((alias): alias is string => Boolean(alias?.trim()));
  }

  private normalizeTargetToken(value: string): string {
    return value.trim().toLowerCase();
  }

  private resolveChampionCriticalThreshold(
    actor: SessionCharacterForRules,
    naturalD20: number,
  ): RuleHookResult<CriticalThresholdModifierProduced> | null {
    const subclassFeatureIds = this.resolveChampionSubclassFeatureIds(actor);
    if (!subclassFeatureIds.length) {
      return null;
    }

    return this.ruleEngine.applyCriticalThresholdModifier({
      naturalD20,
      attackKind: "weapon_attack",
      fighterLevel: this.isClass(actor, "fighter") ? actor.character.level : 0,
      subclassFeatureIds,
    });
  }

  private resolveChampionSubclassFeatureIds(actor: SessionCharacterForRules): string[] {
    const conditions = this.getConditions(actor).map((condition) =>
      this.normalizeRuleToken(condition),
    );
    const className = this.normalizeRuleToken(actor.character.className);
    const subclassName = this.normalizeRuleToken(actor.character.subclassName ?? "");
    const characterFeatures = this.parseJson<string[]>(actor.character.featuresJson, []).map(
      (feature) => this.normalizeRuleToken(feature),
    );
    const featureIds: string[] = [];

    if (
      className.includes("champion") ||
      subclassName.includes("champion") ||
      characterFeatures.includes("champion_improved_critical") ||
      conditions.includes("feature:champion_improved_critical") ||
      conditions.includes("champion_improved_critical")
    ) {
      featureIds.push("champion_improved_critical");
    }

    if (
      actor.character.level >= 15 &&
      (className.includes("champion") ||
        subclassName.includes("champion") ||
        characterFeatures.includes("champion_superior_critical") ||
        conditions.includes("feature:champion_superior_critical") ||
        conditions.includes("champion_superior_critical"))
    ) {
      featureIds.push("champion_superior_critical");
    }

    return featureIds;
  }

  private resolveEquippedWeaponProfile(actor: SessionCharacterForRules): EquippedWeaponProfile {
    const equippedWeaponId = actor.character.equippedWeaponId;
    // 새 InventoryEntry 테이블을 우선 사용하되, 기존 JSON 인벤토리 데이터도 계속 동작하게 fallback을 둔다.
    const normalizedEntryWeapon = this.resolveInventoryEntryWeaponProfile(
      actor.inventoryEntries ?? [],
      equippedWeaponId,
    );
    if (normalizedEntryWeapon) {
      return normalizedEntryWeapon;
    }

    const inventory = this.parseJson<InventoryItemForRules[]>(
      actor.inventorySnapshotJson ?? actor.character.inventoryJson,
      [],
    );
    const equippedWeapon = equippedWeaponId
      ? inventory.find(
          (item) =>
            item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
        )
      : null;
    const properties = equippedWeapon?.properties ?? [];
    const normalizedProperties = properties.map((property) => this.normalizeRuleToken(property));

    return {
      damageDice: equippedWeapon?.damageDice ?? "1d6",
      damageType: equippedWeapon?.damageType ?? DEFAULT_WEAPON_DAMAGE_TYPE,
      properties,
      attackKind: normalizedProperties.includes("ranged")
        ? "ranged_weapon_attack"
        : "melee_weapon_attack",
    };
  }

  private resolveFightingStyleAttackBonus(
    actor: SessionCharacterForRules,
    weaponProfile: EquippedWeaponProfile,
  ): number {
    if (
      weaponProfile.attackKind === "ranged_weapon_attack" &&
      this.hasFeatureTag(actor, `${FIGHTING_STYLE_TAG_PREFIX}archery`)
    ) {
      return 2;
    }

    return 0;
  }

  private resolveFightingStyleDamageBonus(
    actor: SessionCharacterForRules,
    weaponProfile: EquippedWeaponProfile,
  ): number {
    if (
      weaponProfile.attackKind === "melee_weapon_attack" &&
      this.hasFeatureTag(actor, `${FIGHTING_STYLE_TAG_PREFIX}dueling`)
    ) {
      return 2;
    }

    return 0;
  }

  private resolveInventoryEntryWeaponProfile(
    inventoryEntries: InventoryEntryForRules[],
    equippedWeaponId: string | null | undefined,
  ): EquippedWeaponProfile | null {
    if (!equippedWeaponId) {
      return null;
    }

    const equippedEntry =
      inventoryEntries.find(
        (entry) =>
          entry.id === equippedWeaponId || entry.itemDefinitionId === equippedWeaponId,
      ) ?? null;
    if (!equippedEntry || !this.isWeaponItemDefinition(equippedEntry.itemDefinition)) {
      return null;
    }

    const properties = this.parseStringArrayJson(equippedEntry.itemDefinition.propertiesJson);
    const normalizedProperties = properties.map((property) => this.normalizeRuleToken(property));

    return {
      damageDice: equippedEntry.itemDefinition.damageDice ?? "1d6",
      damageType: equippedEntry.itemDefinition.damageType ?? DEFAULT_WEAPON_DAMAGE_TYPE,
      properties,
      attackKind: normalizedProperties.includes("ranged")
        ? "ranged_weapon_attack"
        : "melee_weapon_attack",
    };
  }

  private requireInventoryItemForInteraction(
    actor: SessionCharacterForRules,
    itemId: string,
  ): ItemInteractionEntry {
    const normalizedItemId = this.normalizeRuleToken(itemId);
    const inventory = this.parseJson<InventoryItemForRules[]>(
      actor.inventorySnapshotJson ?? actor.character.inventoryJson,
      [],
    );
    const item = inventory.find((candidate) =>
      [candidate.id, candidate.itemDefinitionId]
        .filter((value): value is string => Boolean(value))
        .map((value) => this.normalizeRuleToken(value))
        .includes(normalizedItemId),
    );

    if (!item) {
      throw forbidden("ACTION_403", "아이템을 찾을 수 없습니다.", {
        reason: "ITEM_NOT_FOUND",
        itemId,
      });
    }

    return {
      entryId: item.id,
      itemDefinitionId: item.itemDefinitionId ?? item.id,
      name: item.name ?? item.itemDefinitionId ?? item.id,
      quantity: item.quantity ?? 1,
      damageDice: item.damageDice ?? null,
      damageType: item.damageType ?? null,
      properties: item.properties ?? [],
    };
  }

  private resolveActorGridPoint(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ItemInteractionPoint | null {
    const map = runtimeContext.map;
    if (!map) {
      return null;
    }

    const token = map.tokens.find((candidate) => candidate.sessionCharacterId === actor.id);
    if (!token) {
      return null;
    }

    return {
      x: Math.floor(token.x / map.gridSize),
      y: Math.floor(token.y / map.gridSize),
    };
  }

  private createDroppedItemObjectId(entryId: string, point: ItemInteractionPoint): string {
    return `object:item:${entryId}:${point.x}:${point.y}`;
  }

  private createThrownItemObjectId(entryId: string, point: ItemInteractionPoint): string {
    return `object:thrown:${entryId}:${point.x}:${point.y}`;
  }

  private resolvePickupMapObject(
    command: Extract<ParsedCommand, { type: "item_interaction"; operation: "pickup" }>,
    map: RuleMapRuntimeContext | null | undefined,
  ): {
    objectCell: RuleMapRuntimeObjectCell | null;
    quantity: number | null;
    rejectedReason: string | null;
  } {
    if (!map || !Array.isArray(map.objectCells)) {
      return { objectCell: null, quantity: null, rejectedReason: null };
    }

    const objectCell = map.objectCells.find((cell) => cell.id === command.objectId) ?? null;
    if (!objectCell) {
      return { objectCell: null, quantity: null, rejectedReason: "map_object_not_found" };
    }

    if (
      objectCell.hiddenItemIds.length > 0 &&
      !objectCell.hiddenItemIds.includes(command.itemDefinitionId)
    ) {
      return { objectCell, quantity: null, rejectedReason: "map_object_item_mismatch" };
    }

    const objectPoint = {
      x: Math.floor(objectCell.x / map.gridSize),
      y: Math.floor(objectCell.y / map.gridSize),
    };
    if (objectPoint.x !== command.point.x || objectPoint.y !== command.point.y) {
      return { objectCell, quantity: null, rejectedReason: "map_object_position_mismatch" };
    }

    const quantity = this.resolveMapObjectQuantity(objectCell, command.itemDefinitionId);
    if (quantity !== null && command.quantity > quantity) {
      return { objectCell, quantity, rejectedReason: "insufficient_map_object_quantity" };
    }

    return { objectCell, quantity, rejectedReason: null };
  }

  private resolveMapObjectQuantity(
    objectCell: RuleMapRuntimeObjectCell,
    itemDefinitionId: string,
  ): number | null {
    const description = objectCell.description?.trim();
    if (!description) {
      return null;
    }

    const escapedItemDefinitionId = itemDefinitionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = description.match(new RegExp(`(?:^|\\s)${escapedItemDefinitionId}\\s+x(\\d+)(?:\\s|$)`));
    if (!match) {
      return null;
    }

    const quantity = Number(match[1]);
    return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
  }

  private createItemInteractionRejectedResolution(
    command: Extract<ParsedCommand, { type: "item_interaction" }>,
    reason: string,
    distanceFt?: number,
  ): ActionResolution {
    return {
      structuredAction: {
        type: "item_interaction",
        operation: command.operation,
        ...(command.operation === "pickup"
          ? {
              objectId: command.objectId,
              itemDefinitionId: command.itemDefinitionId,
            }
          : { itemId: command.itemId }),
        quantity: command.quantity,
        point: command.point,
        rejectedReason: reason,
        ...(distanceFt !== undefined ? { distanceFt } : {}),
      },
      diceResult: null,
      outcome: ActionOutcome.IMPOSSIBLE,
      narration: "아이템 상호작용을 처리할 수 없습니다.",
      stateChanges: [],
      runtimeEffects: [],
    };
  }

  private isWeaponItemDefinition(itemDefinition: InventoryEntryForRules["itemDefinition"]): boolean {
    return (
      this.normalizeRuleToken(itemDefinition.itemType) === "weapon" ||
      Boolean(itemDefinition.damageDice)
    );
  }

  private isClass(actor: SessionCharacterForRules, className: string): boolean {
    return this.normalizeRuleToken(actor.character.className).includes(className);
  }

  private parseFeatureOptionTokens(option: string | null): string[] {
    return (option ?? "")
      .split(/[\s,]+/)
      .map((token) => this.normalizeRuleToken(token).replace(/-/g, "_"))
      .filter(Boolean);
  }

  private hasFeatureTag(actor: SessionCharacterForRules, tag: string): boolean {
    const normalizedTag = this.normalizeRuleToken(tag);
    return this.getFeatureTags(actor).some((featureTag) => featureTag === normalizedTag);
  }

  private getFeatureTags(actor: SessionCharacterForRules): string[] {
    return [
      ...this.getConditions(actor),
      ...this.parseJson<string[]>(actor.character.featuresJson, []),
    ].map((tag) => this.normalizeRuleToken(tag));
  }

  private resolveActionSurgeUses(actor: SessionCharacterForRules): number {
    if (!this.hasFighterActionSurge(actor)) {
      return 0;
    }

    return actor.character.level >= 17 ? 2 : actor.character.level >= 2 ? 1 : 0;
  }

  private resolveRageUses(actor: SessionCharacterForRules): number {
    if (!this.hasBarbarianRage(actor)) {
      return 0;
    }

    const level = actor.character.level;
    if (level >= 20) {
      return 6;
    }
    if (level >= 17) {
      return 6;
    }
    if (level >= 12) {
      return 5;
    }
    if (level >= 6) {
      return 4;
    }
    if (level >= 3) {
      return 3;
    }
    if (level >= 1) {
      return 2;
    }
    return 0;
  }

  private hasFighterActionSurge(actor: SessionCharacterForRules): boolean {
    return this.hasFeatureTag(actor, ACTION_SURGE_FEATURE_ID) || this.isClass(actor, "fighter");
  }

  private hasBarbarianRage(actor: SessionCharacterForRules): boolean {
    return this.hasFeatureTag(actor, RAGE_FEATURE_ID) || this.isClass(actor, "barbarian");
  }

  private selectSingleDie(diceResult: DiceRollResponseDto): number {
    return diceResult.rolls[0] ?? diceResult.total - diceResult.modifier;
  }

  private addConditions(currentConditions: string[], addedConditions: string[]): string[] {
    return Array.from(new Set([...currentConditions, ...addedConditions]));
  }

  private removeConditions(currentConditions: string[], removedConditions: string[]): string[] {
    const normalizedRemoved = new Set(
      removedConditions.map((condition) => this.normalizeRuleToken(condition)),
    );
    return currentConditions.filter(
      (condition) => !normalizedRemoved.has(this.normalizeRuleToken(condition)),
    );
  }

  private resolveArmorCategory(actor: SessionCharacterForRules): "none" | "light" | "medium" | "heavy" {
    const armorTag = this.getConditions(actor)
      .map((condition) => this.normalizeRuleToken(condition))
      .find((condition) => condition.startsWith("armor:"));

    switch (armorTag) {
      case "armor:light":
        return "light";
      case "armor:medium":
        return "medium";
      case "armor:heavy":
        return "heavy";
      default:
        return "none";
    }
  }

  private createClassFeatureRejectedNarration(reason: string | null): string {
    switch (reason) {
      case "fighter_level_required":
      case "fighter_level_too_low":
        return "파이터 레벨 조건을 만족하지 못했습니다.";
      case "barbarian_level_required":
        return "바바리안 레벨 조건을 만족하지 못했습니다.";
      case "second_wind_unavailable":
        return "Second Wind를 이미 사용했습니다.";
      case "action_surge_unavailable":
      case "action_surge_already_used_this_turn":
        return "Action Surge를 사용할 수 없습니다.";
      case "invalid_fighting_style":
        return "선택할 수 없는 Fighting Style입니다.";
      case "rage_unavailable":
        return "Rage를 이미 사용했습니다.";
      case "bonus_action_unavailable":
        return "사용 가능한 bonus action이 없습니다.";
      case "rogue_level_required":
      case "rogue_level_too_low":
        return "Rogue 레벨 조건을 만족하지 못했습니다.";
      case "sneak_attack_requires_advantage":
        return "Sneak Attack은 공격에 이점이 있어야 사용할 수 있습니다.";
      case "expertise_requires_two_selections":
        return "Expertise는 숙련 2개를 선택해야 합니다.";
      case "expertise_requires_thieves_tools_proficiency":
        return "Thieves' tools 숙련이 없어 Expertise를 적용할 수 없습니다.";
      case "expertise_requires_skill_proficiency":
        return "숙련된 기술에만 Expertise를 적용할 수 있습니다.";
      case "ranger_level_required":
        return "Ranger 레벨 조건을 만족하지 못했습니다.";
      case "favored_enemy_requires_two_humanoid_races":
        return "Humanoid Favored Enemy는 인간형 종족 2개를 선택해야 합니다.";
      case "invalid_favored_enemy":
        return "선택할 수 없는 Favored Enemy입니다.";
      case "invalid_cunning_action":
        return "Cunning Action으로 선택할 수 없는 행동입니다.";
      case "rage_activation_required":
        return "Frenzy는 Rage 상태에서만 사용할 수 있습니다.";
      case "frenzy_not_declared":
        return "Frenzy 선언이 필요합니다.";
      default:
        return "직업 기능을 사용할 수 없습니다.";
    }
  }

  private createReadyActionRejectedNarration(reason: string | null): string {
    switch (reason) {
      case "reaction_unavailable":
        return "사용 가능한 reaction이 없어 준비행동을 설정할 수 없습니다.";
      case "invalid_trigger":
        return "준비행동 trigger가 올바르지 않습니다.";
      case "invalid_held_action":
        return "준비할 행동이 올바르지 않습니다.";
      default:
        return "준비행동을 설정할 수 없습니다.";
    }
  }

  private resolveAttackProneContext(
    actor: SessionCharacterForRules,
    target: SessionCharacterForRules | null,
    runtimeContext: RuleRuntimeContext,
  ): {
    advantageState: RuleAdvantageState;
    ruleResults: RuleHookResult<unknown>[];
  } {
    const ruleResults: RuleHookResult<unknown>[] = [];
    const advantageStates: RuleAdvantageState[] = [];

    if (this.hasCondition(actor, "prone")) {
      const actorProneResult = this.ruleEngine.applyProneModifiers({
        isProne: true,
        attackerDistanceFt: 0,
        remainingMovementFt: actor.character.speed,
        baseSpeedFt: actor.character.speed,
      });
      ruleResults.push(actorProneResult);
      if (actorProneResult.produced.selfAttackDisadvantage) {
        advantageStates.push("disadvantage");
      }
    }

    if (target && this.hasCondition(target, "prone")) {
      const targetProneResult = this.ruleEngine.applyProneModifiers({
        isProne: true,
        // 현재 command에는 거리 입력이 없으므로 MVP 기본 공격은 5ft 근접 공격으로 본다.
        // 나중에 이동/사거리 모델이 생기면 이 값을 action 입력에서 받아오면 된다.
        attackerDistanceFt: DEFAULT_MELEE_ATTACK_DISTANCE_FT,
        remainingMovementFt: target.character.speed,
        baseSpeedFt: target.character.speed,
      });
      ruleResults.push(targetProneResult);
      advantageStates.push(targetProneResult.produced.incomingAttackAdvantageState);
    }

    if (
      target &&
      this.mapPositions.hasActorAllyWithinFeetOfTarget({
        map: runtimeContext.map,
        actorSessionCharacterId: actor.id,
        targetSessionCharacterId: target.id,
        feet: DEFAULT_MELEE_ATTACK_DISTANCE_FT,
      })
    ) {
      advantageStates.push("advantage");
    }

    return {
      advantageState: this.mergeAdvantageStates(advantageStates),
      ruleResults,
    };
  }

  private resolveDamageProfile(target: SessionCharacterForRules): {
    targetImmunities: string[];
    targetResistances: string[];
    targetVulnerabilities: string[];
  } {
    const conditions = this.getConditions(target);

    return {
      // DB 스키마를 늘리지 않는 MVP 단계라서 임시 룰 태그를 conditionsJson에서 읽는다.
      // 예: resistance:slashing, immunity:necrotic, vulnerability:bludgeoning
      targetImmunities: this.getDamageTypesByPrefix(conditions, "immunity"),
      targetResistances: this.getDamageTypesByPrefix(conditions, "resistance"),
      targetVulnerabilities: this.getDamageTypesByPrefix(conditions, "vulnerability"),
    };
  }

  private toAoeDamageTarget(
    target: SessionCharacterForRules,
    saveAbility: SavingThrowAbility,
  ): AoeDamageTarget {
    const damageProfile = this.resolveDamageProfile(target);
    const saveProficiencies = this.resolveSaveProficiencies(target);

    return {
      id: target.id,
      currentHp: target.currentHp,
      abilityModifiers: {
        [saveAbility]: this.resolveAbilityModifier(target, saveAbility),
      },
      proficiencyBonus: target.character.proficiencyBonus,
      proficientSaves: saveProficiencies,
      immunities: damageProfile.targetImmunities,
      resistances: damageProfile.targetResistances,
      vulnerabilities: damageProfile.targetVulnerabilities,
    };
  }

  private resolveAbilityModifier(
    character: SessionCharacterForRules,
    ability: SavingThrowAbility,
  ): number {
    const abilities = this.parseJson<Record<string, number>>(character.character.abilitiesJson, {});
    const score = abilities[ability] ?? 10;
    return this.abilityModifierFromScore(score);
  }

  private abilityModifierFromScore(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  private resolveSaveProficiencies(character: SessionCharacterForRules): SavingThrowAbility[] {
    const conditions = this.getConditions(character);
    const saveAbilities = new Set<SavingThrowAbility>();
    for (const condition of conditions) {
      const normalized = this.normalizeRuleToken(condition);
      const ability = normalized.startsWith("save_proficiency:")
        ? normalized.slice("save_proficiency:".length)
        : null;
      if (this.isSavingThrowAbility(ability)) {
        saveAbilities.add(ability);
      }
    }
    return Array.from(saveAbilities);
  }

  private isSavingThrowAbility(value: string | null): value is SavingThrowAbility {
    return (
      value === "str" ||
      value === "dex" ||
      value === "con" ||
      value === "int" ||
      value === "wis" ||
      value === "cha"
    );
  }

  private getDamageTypesByPrefix(conditions: string[], prefix: string): string[] {
    const normalizedPrefix = `${prefix}:`;
    return conditions
      .map((condition) => this.normalizeRuleToken(condition))
      .filter((condition) => condition.startsWith(normalizedPrefix))
      .map((condition) => condition.slice(normalizedPrefix.length))
      .filter(Boolean);
  }

  private hasCondition(character: SessionCharacterForRules, conditionName: string): boolean {
    const normalizedName = this.normalizeRuleToken(conditionName);
    return this.getConditions(character).some((condition) => {
      const normalizedCondition = this.normalizeRuleToken(condition);
      return (
        normalizedCondition === normalizedName ||
        normalizedCondition === `condition.${normalizedName}`
      );
    });
  }

  private getConditions(character: SessionCharacterForRules): string[] {
    const entries = this.parseJson<unknown[]>(character.conditionsJson, []);
    const tags = entries.flatMap((entry) => {
      if (typeof entry === "string") {
        return [entry];
      }
      const [condition] = this.conditionRuntime.parseConditionsJson(JSON.stringify([entry]));
      return condition ? [condition.conditionId, ...condition.tags] : [];
    });
    return Array.from(new Set(tags));
  }

  private addConditionEntry(currentEntries: unknown[], condition: string): unknown[] {
    const normalized = this.normalizeRuleToken(condition);
    if (
      currentEntries.some((entry) =>
        typeof entry === "string" && this.normalizeRuleToken(entry) === normalized,
      )
    ) {
      return currentEntries;
    }
    return [...currentEntries, condition];
  }

  private removeConditionEntry(currentEntries: unknown[], condition: string): unknown[] {
    const normalized = this.normalizeRuleToken(condition);
    return currentEntries.filter((entry) => {
      if (typeof entry === "string") {
        return this.normalizeRuleToken(entry) !== normalized;
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry) && "conditionId" in entry) {
        const conditionId = (entry as { conditionId?: unknown }).conditionId;
        return typeof conditionId !== "string" || !this.conditionNameMatches(conditionId, normalized);
      }
      return true;
    });
  }

  private mergeConditionResolutionEntries(
    currentEntries: unknown[],
    parsedConditions: Array<{ conditionId: string; sourceId: string | null; appliedAtRound: number | null }>,
    remainingConditions: unknown[],
  ): unknown[] {
    const remainingByKey = new Map(
      this.conditionRuntime
        .parseConditionsJson(JSON.stringify(remainingConditions))
        .map((condition) => [this.conditionEntryKey(condition), condition]),
    );

    return currentEntries.flatMap((entry, index) => {
      const parsedCondition = parsedConditions[index];
      if (!parsedCondition) {
        return [];
      }
      const remaining = remainingByKey.get(this.conditionEntryKey(parsedCondition));
      if (!remaining) {
        return [];
      }
      return [typeof entry === "string" ? entry : remaining];
    });
  }

  private conditionEntryKey(condition: {
    conditionId: string;
    sourceId: string | null;
    appliedAtRound: number | null;
  }): string {
    return `${condition.conditionId}:${condition.sourceId ?? ""}:${condition.appliedAtRound ?? ""}`;
  }

  private conditionNameMatches(conditionId: string, normalizedConditionName: string): boolean {
    const normalizedConditionId = this.normalizeRuleToken(conditionId);
    return (
      normalizedConditionId === normalizedConditionName ||
      normalizedConditionId === `condition.${normalizedConditionName}`
    );
  }

  private selectNaturalD20(diceResult: DiceRollResponseDto): number {
    if (diceResult.advantageState === DiceAdvantageState.ADVANTAGE) {
      return Math.max(...diceResult.rolls);
    }
    if (diceResult.advantageState === DiceAdvantageState.DISADVANTAGE) {
      return Math.min(...diceResult.rolls);
    }
    return diceResult.rolls[0] ?? diceResult.total - diceResult.modifier;
  }

  private mergeAdvantageStates(states: RuleAdvantageState[]): RuleAdvantageState {
    const hasAdvantage = states.includes("advantage");
    const hasDisadvantage = states.includes("disadvantage");

    if (hasAdvantage && !hasDisadvantage) {
      return "advantage";
    }
    if (hasDisadvantage && !hasAdvantage) {
      return "disadvantage";
    }
    return "normal";
  }

  private toDiceAdvantageState(value: RuleAdvantageState): DiceAdvantageState {
    switch (value) {
      case "advantage":
        return DiceAdvantageState.ADVANTAGE;
      case "disadvantage":
        return DiceAdvantageState.DISADVANTAGE;
      case "normal":
      default:
        return DiceAdvantageState.NORMAL;
    }
  }

  private normalizeRuleToken(value: string): string {
    return value.trim().toLowerCase();
  }

  private createAttackNarration(result: {
    hit: boolean;
    criticalHit: boolean;
    criticalMiss: boolean;
  }): string {
    if (result.criticalHit) {
      return "공격이 치명타로 명중했습니다.";
    }
    if (result.criticalMiss) {
      return "공격이 대실패했습니다.";
    }
    return result.hit ? "공격이 명중했습니다." : "공격이 빗나갔습니다.";
  }

  private resolveKnownCantrips(spellId: string): string[] {
    // 아직 캐릭터별 주문 목록 모델이 없어서, MVP에서는 실행 경로가 붙은 cantrip만
    // "시전자가 알고 있는 cantrip"으로 간주한다. 주문 목록 테이블이 생기면 여기만 바꾸면 된다.
    return [CHILL_TOUCH_SPELL_ID, FIRE_BOLT_SPELL_ID].includes(spellId) ? [spellId] : [];
  }

  private resolveSpellDefinition(spellId: string): RuleCatalogEntry | null {
    const entry = this.ruleCatalog.getEntry(spellId);
    return entry?.kind === "spell_definitions" ? entry : null;
  }

  private toStructuredSpellDefinition(
    spellDefinition: RuleCatalogEntry | null,
    spellLevel: number,
  ): {
    id: string;
    level: number;
    damage: RuleCatalogEntry["damage"];
    targeting: RuleCatalogEntry["targeting"];
    scaling: RuleCatalogEntry["scaling"];
  } | null {
    return spellDefinition
      ? {
          id: spellDefinition.id,
          level: spellLevel,
          damage: spellDefinition.damage,
          targeting: spellDefinition.targeting,
          scaling: spellDefinition.scaling,
        }
      : null;
  }

  private resolveSpellRangeFt(spellDefinition: RuleCatalogEntry | null): number | null {
    if (!spellDefinition || spellDefinition.targeting.type !== "creature") {
      return null;
    }
    return spellDefinition.targeting.rangeFt;
  }

  private resolveSpellLevel(spellDefinition: RuleCatalogEntry): number {
    const tag = spellDefinition.runtimeEffect.tags.find((value) => value.startsWith("spell_level:"));
    const level = Number(tag?.slice("spell_level:".length));
    return Number.isInteger(level) && level >= 0 ? level : 0;
  }

  private resolveSpellDamageDice(
    spellDefinition: RuleCatalogEntry | null,
    characterLevel: number,
  ): string | null {
    if (!spellDefinition?.damage) {
      return null;
    }
    if (spellDefinition.scaling?.mode !== "character_level") {
      return spellDefinition.damage.dice;
    }

    const table = spellDefinition.scaling.table ?? {};
    const matchingThreshold = Object.keys(table)
      .map((key) => Number(key))
      .filter((level) => Number.isInteger(level) && level <= characterLevel)
      .sort((left, right) => right - left)[0];
    const scaledDice =
      matchingThreshold === undefined ? null : table[String(matchingThreshold)];
    return typeof scaledDice === "string" ? scaledDice : spellDefinition.damage.dice;
  }

  private resolveSpellScaling(
    spellDefinition: RuleCatalogEntry | null,
    slotLevel: number,
  ): SpellScalingResult | null {
    if (!spellDefinition) {
      return null;
    }

    const baseSpellLevel = this.resolveSpellLevel(spellDefinition);
    if (spellDefinition.scaling?.mode !== "slot_level") {
      return this.spellScaling.resolveUpcast({
        spellId: spellDefinition.id,
        baseSpellLevel,
        slotLevel: baseSpellLevel,
        baseDamageDice: spellDefinition.damage?.dice ?? null,
      });
    }

    return this.spellScaling.resolveUpcast({
      spellId: spellDefinition.id,
      baseSpellLevel,
      slotLevel,
      baseDamageDice: spellDefinition.damage?.dice ?? null,
      baseTargetCount: this.resolveBaseTargetCount(spellDefinition),
      scalingRules: this.toSpellScalingRules(spellDefinition),
    });
  }

  private resolveBaseTargetCount(spellDefinition: RuleCatalogEntry): number | null {
    const missileTag = spellDefinition.runtimeEffect.tags.find((tag) => tag.startsWith("missile_count:"));
    const missileCount = Number(missileTag?.slice("missile_count:".length));
    if (Number.isInteger(missileCount) && missileCount > 0) {
      return missileCount;
    }

    return spellDefinition.targeting.type === "creature" ? 1 : null;
  }

  private toSpellScalingRules(spellDefinition: RuleCatalogEntry): SpellScalingRule[] {
    const table = spellDefinition.scaling?.table;
    if (!table || typeof table !== "object" || Array.isArray(table)) {
      return [];
    }

    const mode = table.mode;
    switch (mode) {
      case "damage_dice":
        return typeof table.dice === "string"
          ? [{ mode, dice: table.dice, perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove) }]
          : [];
      case "target_count":
      case "summon_count":
        return typeof table.count === "number"
          ? [{ mode, count: table.count, perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove) }]
          : [];
      case "duration":
        return typeof table.unit === "string" && typeof table.amountPerSlotAbove === "number"
          ? [{
              mode,
              unit: table.unit as "round" | "minute" | "hour" | "day",
              amountPerSlotAbove: table.amountPerSlotAbove,
              perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove),
            }]
          : [];
      default:
        return [];
    }
  }

  private toOptionalPositiveInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private resolveDefaultComponentAvailability(): {
    verbal: boolean;
    somatic: boolean;
    material: boolean | null;
  } {
    // 침묵, 구속, 양손 점유 같은 component 차단 상태는 아직 모델링되어 있지 않다.
    // 그래서 현재 action 흐름에서는 기본적으로 V/S component가 가능하다고 보고 훅 검증에 넘긴다.
    return { verbal: true, somatic: true, material: null };
  }

  private resolveSpellOutcome(accepted: boolean, hit: boolean): ActionOutcome {
    if (!accepted) {
      return ActionOutcome.IMPOSSIBLE;
    }
    return hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE;
  }

  private createChillTouchNarration(accepted: boolean, hit: boolean): string {
    if (!accepted) {
      return "주문을 시전할 수 없습니다.";
    }
    return hit ? "Chill Touch가 명중했습니다." : "Chill Touch가 빗나갔습니다.";
  }

  private createSpellAttackNarration(spellId: string, hit: boolean): string {
    const spellName = spellId === FIRE_BOLT_SPELL_ID ? "Fire Bolt" : spellId;
    return hit ? `${spellName}가 명중했습니다.` : `${spellName}가 빗나갔습니다.`;
  }

  private createSpellRejectedNarration(reason: string | null): string {
    switch (reason) {
      case "target_out_of_range":
        return "대상이 주문 사거리 밖에 있습니다.";
      case "unsupported_spell":
        return "지원하지 않는 주문입니다.";
      case "invalid_spell_slot_level":
        return "주문 슬롯 레벨이 유효하지 않습니다.";
      case "cantrip_not_known":
        return "시전자가 알지 못하는 cantrip입니다.";
      case "action_unavailable":
        return "이번 턴에 주문 시전에 사용할 행동이 없습니다.";
      case "missing_verbal_component":
      case "missing_somatic_component":
        return "주문 구성요소 조건을 만족하지 못했습니다.";
      default:
        return "주문을 시전할 수 없습니다.";
    }
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
  }

  private parseStringArrayJson(value: string | null | undefined): string[] {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((entry): entry is string => typeof entry === "string");
    } catch {
      return [];
    }
  }
}
