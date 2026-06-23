import { Injectable } from "@nestjs/common";
import { ActionOutcome, AvailableActionDto, DiceAdvantageState, DiceRollResponseDto, GamePhase } from "@trpg/shared-types";
import { forbidden } from "../../common/exceptions/domain-error";
import { AoeDamageService, AoeDamageTarget } from "./aoe-damage.service";
import {
  AoeTargetingService,
  type AoeDirection,
} from "./aoe-targeting.service";
import { CommandParserService, ParsedCommand } from "./command-parser.service";
import { ConcentrationRuntimeService } from "./concentration-runtime.service";
import { ConditionRuntimeService } from "./condition-runtime.service";
import { DiceService } from "./dice.service";
import { ItemInteractionEntry, ItemInteractionPoint, ItemInteractionService } from "./item-interaction.service";
import { RestResolution, RestResolutionService } from "./rest-resolution.service";
import { RuleCatalogService } from "./rule-catalog.service";
import { RuleCatalogEntry } from "./rule-catalog.types";
import { RuleEngineService } from "./rule-engine.service";
import { SpellScalingResult, SpellScalingRule, SpellScalingService } from "./spell-scaling.service";
import { ActionSpellRuleService } from "./action-spell-rule.service";
import { CriticalThresholdModifierProduced, RuleAdvantageState, RuleHookResult, SavingThrowAbility } from "./rule-engine.types";
import { MapPositionService, RuleMapRuntimeContext, RuleMapRuntimeObjectCell } from "./map-position.service";
import { ReadyActionService } from "./ready-action.service";
import type { PendingReadyAction } from "./ready-action.service";

const DEFAULT_MELEE_ATTACK_DISTANCE_FT = 5;
const DEFAULT_WEAPON_DAMAGE_TYPE = "slashing";
const DEFAULT_DIRECT_DAMAGE_TYPE = "untyped";
const CHILL_TOUCH_SPELL_ID = "spell.chill_touch";
const FIRE_BOLT_SPELL_ID = "spell.fire_bolt";
const RAY_OF_FROST_SPELL_ID = "spell.ray_of_frost";
const MAGIC_MISSILE_SPELL_ID = "spell.magic_missile";
const CURE_WOUNDS_SPELL_ID = "spell.cure_wounds";
const SLEEP_SPELL_ID = "spell.sleep";
const LIGHT_SPELL_ID = "spell.light";
const SECOND_WIND_FEATURE_ID = "class.fighter.feature.second_wind";
const ACTION_SURGE_FEATURE_ID = "class.fighter.feature.action_surge";
const FIGHTING_STYLE_FEATURE_ID = "class.fighter.feature.fighting_style";
const RAGE_FEATURE_ID = "class.barbarian.feature.rage";
const SNEAK_ATTACK_FEATURE_ID = "class.rogue.feature.sneak_attack";
const EXPERTISE_FEATURE_ID = "class.rogue.feature.expertise";
const FAVORED_ENEMY_FEATURE_ID = "class.ranger.feature.favored_enemy";
const CUNNING_ACTION_FEATURE_ID = "class.rogue.feature.cunning_action";
const FRENZY_FEATURE_ID = "class.barbarian.subclass_feature.frenzy";
const DIVINE_SENSE_FEATURE_ID = "class.paladin.feature.divine_sense";
const LAY_ON_HANDS_FEATURE_ID = "class.paladin.feature.lay_on_hands";
const PRIMEVAL_AWARENESS_FEATURE_ID = "class.ranger.feature.primeval_awareness";
const KI_FEATURE_ID = "class.monk.feature.ki";
const CHANNEL_DIVINITY_FEATURE_ID = "class.cleric.feature.channel_divinity";
const BARDIC_INSPIRATION_FEATURE_ID = "class.bard.feature.bardic_inspiration";
const FONT_OF_MAGIC_FEATURE_ID = "class.sorcerer.feature.font_of_magic";
const WILD_SHAPE_FEATURE_ID = "class.druid.feature.wild_shape";
const STILLNESS_OF_MIND_FEATURE_ID = "class.monk.feature.stillness_of_mind";
const WHOLENESS_OF_BODY_FEATURE_ID =
  "subclass.monk.open_hand.feature.wholeness_of_body";
const WHOLENESS_OF_BODY_EXPENDED_TAG =
  "resource:wholeness_of_body_expended";
const COUNTERCHARM_FEATURE_ID = "class.bard.feature.countercharm";
const DARK_ONES_OWN_LUCK_FEATURE_ID =
  "subclass.warlock.fiend.feature.dark_ones_own_luck";
const DARK_ONES_OWN_LUCK_EXPENDED_TAG =
  "resource:dark_ones_own_luck_expended";
const DARK_ONES_OWN_LUCK_PENDING_TAG = "dark_ones_own_luck:1d10";
const DRAGONBORN_BREATH_FEATURE_ID = "race.dragonborn.trait.base_traits";
const DRAGONBORN_BREATH_EXPENDED_TAG = "resource:dragonborn_breath_expended";
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
const RAGE_RESISTANCE_TAGS = ["resistance:bludgeoning", "resistance:piercing", "resistance:slashing"];
const DIVINE_SENSE_EXPENDED_TAG = "resource:divine_sense_expended";
const LAY_ON_HANDS_EXPENDED_TAG = "resource:lay_on_hands_expended";
const CHANNEL_DIVINITY_EXPENDED_TAG = "resource:channel_divinity_expended";
const CHANNEL_DIVINITY_SPENT_PREFIX = "resource:channel_divinity_spent:";
const HIT_DIE_AVERAGE_BY_CLASS: Readonly<Record<string, number>> = {
  barbarian: 7,
  bard: 5,
  cleric: 5,
  druid: 5,
  fighter: 6,
  monk: 5,
  paladin: 6,
  ranger: 6,
  rogue: 5,
  sorcerer: 4,
  warlock: 5,
  wizard: 4,
};
export type SessionCharacterForRules = {
  id: string;
  userId: string;
  characterId: string;
  tokenId?: string | null;
  combatParticipantId?: string | null;
  isCombatParticipantOnly?: boolean;
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
    spellsJson?: string | null;
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
  sessionCharacterId?: string;
  combatParticipantId?: string;
  currentHp?: number;
  tempHp?: number;
  conditions?: unknown[];
  markDead?: boolean;
};

export type RuleRuntimeContext = {
  hasActiveCombat?: boolean;
  map?: RuleMapRuntimeContext | null;
  spellSlots?: Record<string, number>;
  spellSlotMaximums?: Record<string, number>;
  resource?: {
    secondWindAvailable: boolean;
    actionSurgeUses: number;
    rageUses: number;
    rageActive: boolean;
    frenzyActive: boolean;
    exhaustionLevel: number;
    hitDiceSpent?: number;
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
  | { type: "RESTORE_SPELL_SLOT"; slotLevel: number; amount: number }
  | { type: "STORE_READY_ACTION"; pending: PendingReadyAction }
  | { type: "START_RAGE" }
  | { type: "START_FRENZY" }
  | {
      type: "RECOVER_SHORT_REST";
      secondWindAvailable: boolean;
      actionSurgeUses: number;
      hitDiceSpent?: number;
      recoverSpellSlotLevel?: number;
      spellRecoveryFeatureId?: string;
    }
  | {
      type: "RECOVER_LONG_REST";
      secondWindAvailable: boolean;
      actionSurgeUses: number;
      rageUses: number;
      reduceExhaustionBy: number;
      hitDiceSpent?: number;
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
    private readonly actionSpellRules: ActionSpellRuleService = new ActionSpellRuleService(diceService, ruleEngine),
    private readonly aoeTargeting: AoeTargetingService = new AoeTargetingService(),
  ) {}

  private createActionSpellRuleRuntime() {
    return {
      createActionUnavailableResolution: this.createActionUnavailableResolution.bind(this),
      createTargetStatePatch: this.createTargetStatePatch.bind(this),
      hasActionAvailable: this.hasActionAvailable.bind(this),
      hasCondition: this.hasCondition.bind(this),
      normalizeRuleToken: this.normalizeRuleToken.bind(this),
      parseJson: this.parseJson.bind(this),
      requireTarget: this.requireTarget.bind(this),
      resolveConcentrationDamageCheck: this.resolveConcentrationDamageCheck.bind(this),
      resolveDamageProfile: this.resolveDamageProfile.bind(this),
      resolveSpellTargetList: this.resolveSpellTargetList.bind(this),
      selectNaturalD20: this.selectNaturalD20.bind(this),
      toAoeDamageTarget: this.toAoeDamageTarget.bind(this),
    };
  }

  getAvailableActions(params: { phase: GamePhase; isCurrentTurn: boolean; hasActiveCombat: boolean; isAlive: boolean }): AvailableActionDto[] {
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
        return this.resolveSave(
          command,
          sessionCharacters,
          runtimeContext,
        );
      case "attack":
        return this.resolveAttack(command, actor, sessionCharacters, runtimeContext);
      case "ready":
        return this.resolveReadyAction(command, actor, runtimeContext);
      case "cast_spell":
        return this.resolveCastSpell(command, actor, sessionCharacters, runtimeContext);
      case "cast_area_spell":
        return this.resolveCastAreaSpell(command, actor, sessionCharacters, runtimeContext);
      case "use_class_feature":
        return this.resolveClassFeature(
          command,
          actor,
          sessionCharacters,
          runtimeContext,
        );
      case "rest":
        return this.resolveRest(command, actor, runtimeContext);
      case "inventory":
        return this.resolveInventory(command);
      case "item_interaction":
        return this.resolveItemInteraction(command, actor, sessionCharacters, runtimeContext);
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
    const diceResult = this.rollD20WithRacialLuck(
      actor,
      expression,
      DiceAdvantageState.NORMAL,
    );
    const hasGuidance = this.getFeatureTags(actor).includes(
      "roll_bonus:ability_check:1d4",
    );
    const guidanceRoll = hasGuidance ? this.diceService.roll("1d4") : null;
    const hasDarkOnesOwnLuck = this.hasCondition(
      actor,
      DARK_ONES_OWN_LUCK_PENDING_TAG,
    );
    const darkOnesOwnLuckRoll = hasDarkOnesOwnLuck
      ? this.diceService.roll("1d10")
      : null;
    const bonusTotal =
      (guidanceRoll?.total ?? 0) + (darkOnesOwnLuckRoll?.total ?? 0);
    const bonusExpression = [
      ...(guidanceRoll ? ["1d4"] : []),
      ...(darkOnesOwnLuckRoll ? ["1d10"] : []),
    ].join("+");
    const resolvedDiceResult = bonusTotal
      ? {
          ...diceResult,
          expression: `${diceResult.expression}+${bonusExpression}`,
          total: diceResult.total + bonusTotal,
        }
      : diceResult;
    const success = resolvedDiceResult.total >= command.dc;
    const stateChanges = hasGuidance || hasDarkOnesOwnLuck
      ? [
          this.createTargetStatePatch(actor, {
            conditions: this.parseJson<unknown[]>(
              actor.conditionsJson,
              [],
            ).filter(
              (entry) => {
                const tags = this.conditionRuntime.toConditionTags(
                  JSON.stringify([entry]),
                );
                return (
                  !tags.includes("roll_bonus:ability_check:1d4") &&
                  !tags.includes(DARK_ONES_OWN_LUCK_PENDING_TAG) &&
                  !(
                    typeof entry === "string" &&
                    this.normalizeRuleToken(entry) ===
                      DARK_ONES_OWN_LUCK_PENDING_TAG
                  )
                );
              },
            ),
          }),
        ]
      : [];

    return {
      structuredAction: {
        type: "skill_check",
        checkName: command.checkName,
        dc: command.dc,
        guidanceBonus: guidanceRoll?.total ?? 0,
        darkOnesOwnLuckBonus: darkOnesOwnLuckRoll?.total ?? 0,
      },
      diceResult: resolvedDiceResult,
      outcome: success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: success ? "판정에 성공했습니다." : "판정에 실패했습니다.",
      stateChanges,
      runtimeEffects: [{ type: "SPEND_ACTION" }],
    };
  }

  private resolveSave(
    command: Extract<ParsedCommand, { type: "save" }>,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const target = this.requireTarget(command.target, sessionCharacters);
    const saveProficient = this.resolveSaveProficiencies(target).includes(command.ability);
    const abilityModifier = this.resolveAbilityModifier(target, command.ability);
    const auraBonus = this.resolveAuraOfProtectionBonus(
      target,
      sessionCharacters,
      runtimeContext,
    );
    const hasDarkOnesOwnLuck = this.hasCondition(
      target,
      DARK_ONES_OWN_LUCK_PENDING_TAG,
    );
    const darkOnesOwnLuckRoll = hasDarkOnesOwnLuck
      ? this.diceService.roll("1d10")
      : null;
    const saveModifier =
      abilityModifier +
      (saveProficient ? target.character.proficiencyBonus : 0) +
      auraBonus;
    const normalizedCondition = command.condition
      ? this.normalizeRuleToken(command.condition).replace(/^condition[.:]/, "")
      : null;
    const hasConditionAdvantage =
      normalizedCondition !== null &&
      this.getFeatureTags(target).includes(
        `advantage:save:${normalizedCondition}`,
      );
    const advantageState = hasConditionAdvantage
      ? DiceAdvantageState.ADVANTAGE
      : this.resolveRacialSaveAdvantage(
          target,
          command.ability,
          command.condition,
        );
    const diceResult = this.rollD20WithRacialLuck(
      target,
      `1d20${saveModifier >= 0 ? "+" : ""}${saveModifier}`,
      advantageState,
    );
    const resolvedDiceResult = darkOnesOwnLuckRoll
      ? {
          ...diceResult,
          expression: `${diceResult.expression}+1d10`,
          total: diceResult.total + darkOnesOwnLuckRoll.total,
        }
      : diceResult;
    const bonusModifiers = [
      ...(auraBonus > 0
        ? [
            {
              source: "class.paladin.feature.aura_of_protection",
              value: auraBonus,
            },
          ]
        : []),
      ...(darkOnesOwnLuckRoll
        ? [
            {
              source: DARK_ONES_OWN_LUCK_FEATURE_ID,
              value: darkOnesOwnLuckRoll.total,
            },
          ]
        : []),
    ];
    const ruleResult = this.ruleEngine.resolveSavingThrow({
      ability: command.ability,
      naturalD20: this.selectNaturalD20(diceResult),
      difficultyClass: command.dc,
      abilityModifier,
      proficiencyBonus: target.character.proficiencyBonus,
      proficient: saveProficient,
      advantageState:
        advantageState === DiceAdvantageState.ADVANTAGE
          ? "advantage"
          : advantageState === DiceAdvantageState.DISADVANTAGE
            ? "disadvantage"
            : "normal",
      bonusModifiers,
    });
    const stateChanges: CharacterStatePatch[] = [];
    let expiredConditions: unknown[] = [];
    const currentConditionEntries = this.parseJson<unknown[]>(
      target.conditionsJson,
      [],
    );
    let nextConditionEntries = currentConditionEntries;

    if (command.condition) {
      const parsedConditions = this.conditionRuntime.parseConditionsJson(target.conditionsJson);
      const saveEndResolution = this.conditionRuntime.resolveSaveEnd(parsedConditions, {
        conditionId: command.condition,
        saveSucceeded: ruleResult.produced.success,
      });
      expiredConditions = saveEndResolution.expiredConditions;
      nextConditionEntries = this.mergeConditionResolutionEntries(
        currentConditionEntries,
        parsedConditions,
        saveEndResolution.conditions,
      );
    }
    if (hasDarkOnesOwnLuck) {
      nextConditionEntries = nextConditionEntries.filter(
        (entry) =>
          !(
            typeof entry === "string" &&
            this.normalizeRuleToken(entry) ===
              DARK_ONES_OWN_LUCK_PENDING_TAG
          ),
      );
    }
    if (
      JSON.stringify(nextConditionEntries) !==
      JSON.stringify(currentConditionEntries)
    ) {
      stateChanges.push({
        sessionCharacterId: target.id,
        conditions: nextConditionEntries,
      });
    }

    return {
      structuredAction: {
        type: "saving_throw",
        target: target.id,
        ability: command.ability,
        dc: command.dc,
        condition: command.condition,
        auraOfProtectionBonus: auraBonus,
        darkOnesOwnLuckBonus: darkOnesOwnLuckRoll?.total ?? 0,
        expiredConditions,
        ruleResults: [ruleResult],
      },
      diceResult: resolvedDiceResult,
      outcome: ruleResult.produced.success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: ruleResult.produced.success ? "내성 굴림에 성공했습니다." : "내성 굴림에 실패했습니다.",
      stateChanges,
    };
  }

  private resolveAuraOfProtectionBonus(
    target: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): number {
    const targetToken = runtimeContext.map?.tokens.find(
      (token) => token.sessionCharacterId === target.id,
    );
    return sessionCharacters
      .filter(
        (candidate) =>
          this.isClass(candidate, "paladin") &&
          candidate.character.level >= 6 &&
          this.hasFeatureTag(candidate, "saving_throw_bonus:cha_mod"),
      )
      .filter((candidate) => {
        if (candidate.id === target.id) {
          return true;
        }
        if (!runtimeContext.map || !targetToken) {
          return false;
        }
        const candidateToken = runtimeContext.map.tokens.find(
          (token) => token.sessionCharacterId === candidate.id,
        );
        return Boolean(
          candidateToken &&
            !candidateToken.hidden &&
            candidateToken.isHostile === targetToken.isHostile &&
            this.mapPositions.isWithinFeet(
              runtimeContext.map,
              candidateToken,
              targetToken,
              10,
            ),
        );
      })
      .map((candidate) =>
        Math.max(this.resolveAbilityModifier(candidate, "cha"), 0),
      )
      .reduce((maximum, bonus) => Math.max(maximum, bonus), 0);
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
      : (sessionCharacters.find((candidate) => candidate.id !== actor.id) ?? null);
    const weaponProfile = this.resolveEquippedWeaponProfile(actor);
    const modifier = actor.character.proficiencyBonus + this.resolveFightingStyleAttackBonus(actor, weaponProfile);
    const targetArmorClass = target?.character.armorClass ?? command.dc;
    const proneRuleContext = this.resolveAttackProneContext(actor, target, runtimeContext);
    const attackAdvantageState = this.toDiceAdvantageState(proneRuleContext.advantageState);
    const attackRoll = this.rollD20WithRacialLuck(
      actor,
      `1d20+${modifier}`,
      attackAdvantageState,
    );
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
      const baseWeaponDamage = damageRoll.total + this.resolveFightingStyleDamageBonus(actor, weaponProfile);
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
      runtimeEffects: [{ type: "SPEND_ACTION" }, { type: "STORE_READY_ACTION", pending: resolution.pending }],
    };
  }

  private resolveCastSpell(
    command: Extract<ParsedCommand, { type: "cast_spell" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    return this.actionSpellRules.resolveCastSpell(this.createActionSpellRuleRuntime(), command, actor, sessionCharacters, runtimeContext);
  }

  private resolveCastAreaSpell(
    command: Extract<ParsedCommand, { type: "cast_area_spell" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    return this.actionSpellRules.resolveCastAreaSpell(this.createActionSpellRuleRuntime(), command, actor, sessionCharacters, runtimeContext);
  }

  private resolveClassFeature(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
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
      case DIVINE_SENSE_FEATURE_ID:
        return this.resolveDivineSense(actor, runtimeContext);
      case LAY_ON_HANDS_FEATURE_ID:
        return this.resolveLayOnHands(actor, runtimeContext);
      case PRIMEVAL_AWARENESS_FEATURE_ID:
        return this.resolvePrimevalAwareness(actor, runtimeContext);
      case KI_FEATURE_ID:
        return this.resolveKi(command, actor, runtimeContext);
      case CHANNEL_DIVINITY_FEATURE_ID:
        return this.resolveChannelDivinity(actor, runtimeContext);
      case BARDIC_INSPIRATION_FEATURE_ID:
        return this.resolveBardicInspiration(
          command,
          actor,
          sessionCharacters,
          runtimeContext,
        );
      case FONT_OF_MAGIC_FEATURE_ID:
        return this.resolveFontOfMagic(actor, runtimeContext);
      case WILD_SHAPE_FEATURE_ID:
        return this.resolveWildShape(command, actor, runtimeContext);
      case STILLNESS_OF_MIND_FEATURE_ID:
        return this.resolveStillnessOfMind(actor, runtimeContext);
      case WHOLENESS_OF_BODY_FEATURE_ID:
        return this.resolveWholenessOfBody(actor, runtimeContext);
      case COUNTERCHARM_FEATURE_ID:
        return this.resolveCountercharm(
          actor,
          sessionCharacters,
          runtimeContext,
        );
      case DARK_ONES_OWN_LUCK_FEATURE_ID:
        return this.resolveDarkOnesOwnLuck(actor);
      case DRAGONBORN_BREATH_FEATURE_ID:
        return this.resolveDragonbornBreath(
          command,
          actor,
          sessionCharacters,
          runtimeContext,
        );
      default:
        throw forbidden("ACTION_403", "실행할 수 없는 직업 기능입니다.", {
          reason: "UNSUPPORTED_CLASS_FEATURE",
          featureId: command.featureId,
        });
    }
  }

  private resolveDragonbornBreath(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    if (!this.hasFeatureTag(actor, "action:breath_weapon")) {
      throw forbidden("ACTION_403", "드래곤본만 브레스 무기를 사용할 수 있습니다.", {
        reason: "DRAGONBORN_BREATH_NOT_AVAILABLE",
      });
    }
    if (!this.hasActionAvailable(runtimeContext)) {
      return this.createActionUnavailableResolution("race_feature", {
        featureId: DRAGONBORN_BREATH_FEATURE_ID,
      });
    }
    if (this.hasCondition(actor, DRAGONBORN_BREATH_EXPENDED_TAG)) {
      return {
        structuredAction: {
          type: "use_race_feature",
          featureId: DRAGONBORN_BREATH_FEATURE_ID,
          rejectedReason: "BREATH_WEAPON_EXPENDED",
        },
        diceResult: null,
        outcome: ActionOutcome.IMPOSSIBLE,
        narration: "브레스 무기는 휴식 전까지 다시 사용할 수 없습니다.",
        stateChanges: [],
      };
    }

    const optionTokens = (command.option ?? "")
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const damageTypes = new Set([
      "acid",
      "cold",
      "fire",
      "lightning",
      "poison",
    ]);
    const requestedDamageType = optionTokens.find((token) =>
      damageTypes.has(this.normalizeRuleToken(token)),
    );
    const damageType =
      this.resolveDraconicAncestryDamageType(actor) ??
      (requestedDamageType
        ? this.normalizeRuleToken(requestedDamageType)
        : "fire");
    const targetTokens = optionTokens.filter((token) => token !== requestedDamageType);
    const selectedTargets = targetTokens
      .map((token) => this.findTarget(token, sessionCharacters))
      .filter(
        (target): target is SessionCharacterForRules =>
          Boolean(target && target.id !== actor.id),
      );
    const uniqueSelectedTargets = Array.from(
      new Map(selectedTargets.map((target) => [target.id, target])).values(),
    );
    if (!uniqueSelectedTargets.length) {
      throw forbidden("ACTION_403", "브레스 무기의 대상을 한 명 이상 지정해야 합니다.", {
        reason: "DRAGONBORN_BREATH_TARGET_REQUIRED",
      });
    }
    const uniqueTargets = this.resolveDragonbornBreathTargets(
      actor,
      uniqueSelectedTargets[0],
      sessionCharacters,
      runtimeContext.map,
    );

    const constitutionModifier = this.resolveAbilityModifier(actor, "con");
    const saveDc = 8 + actor.character.proficiencyBonus + constitutionModifier;
    const damageDice =
      actor.character.level >= 16
        ? "5d6"
        : actor.character.level >= 11
          ? "4d6"
          : actor.character.level >= 6
            ? "3d6"
            : "2d6";
    const resolution = this.aoeDamage.resolveDamage({
      sourceId: DRAGONBORN_BREATH_FEATURE_ID,
      damageDice,
      damageType,
      save: {
        ability: "dex",
        dc: saveDc,
        halfDamageOnSuccess: true,
      },
      targets: uniqueTargets.map((target) => this.toAoeDamageTarget(target, "dex")),
    });
    const actorConditions = this.addConditionEntry(
      this.parseJson<unknown[]>(actor.conditionsJson, []),
      DRAGONBORN_BREATH_EXPENDED_TAG,
    );

    return {
      structuredAction: {
        type: "use_race_feature",
        featureId: DRAGONBORN_BREATH_FEATURE_ID,
        damageType,
        damageDice,
        saveDc,
        targetIds: uniqueTargets.map((target) => target.id),
        targetResults: resolution.targetResults,
      },
      diceResult: resolution.damageRoll,
      outcome: ActionOutcome.SUCCESS,
      narration: `${actor.character.name}이(가) ${damageType} 브레스를 내뿜었습니다.`,
      stateChanges: [
        this.createTargetStatePatch(actor, { conditions: actorConditions }),
        ...resolution.stateChanges,
      ],
      runtimeEffects: [{ type: "SPEND_ACTION" }],
    };
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
      narration: command.operation === "add" ? "아이템을 인벤토리에 추가했습니다." : "아이템을 인벤토리에서 제거했습니다.",
      stateChanges: [],
      runtimeEffects: [effect],
    };
  }

  private resolveItemInteraction(
    command: Extract<ParsedCommand, { type: "item_interaction" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
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
      if (!this.hasActionAvailable(runtimeContext)) {
        return this.createActionUnavailableResolution("item_interaction", {
          operation: "pickup",
          objectId: command.objectId,
          itemDefinitionId: command.itemDefinitionId,
          quantity: command.quantity,
        });
      }
      const remainingQuantity = pickupObject.quantity !== null ? pickupObject.quantity - result.quantity : 0;

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
          { type: "SPEND_ACTION" },
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
      if (!this.hasActionAvailable(runtimeContext)) {
        return this.createActionUnavailableResolution("item_interaction", {
          operation: "drop",
          itemId: command.itemId,
          quantity: command.quantity,
        });
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
          { type: "SPEND_ACTION" },
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
    if (!this.hasActionAvailable(runtimeContext)) {
      return this.createActionUnavailableResolution("item_interaction", {
        operation: "throw",
        itemId: command.itemId,
        quantity: command.quantity,
      });
    }
    const thrownTarget = this.findTargetAtGridPoint(command.point, actor.id, sessionCharacters, runtimeContext.map);
    if (thrownTarget) {
      const attackAdvantageState = result.attack.inNormalRange ? DiceAdvantageState.NORMAL : DiceAdvantageState.DISADVANTAGE;
      const attackRoll = this.diceService.roll(`1d20${result.attack.attackBonus >= 0 ? "+" : ""}${result.attack.attackBonus}`, attackAdvantageState);
      const attackRuleResult = this.ruleEngine.resolveAttackRoll({
        naturalD20: this.selectNaturalD20(attackRoll),
        attackBonus: result.attack.attackBonus,
        targetArmorClass: thrownTarget.character.armorClass,
        advantageState: result.attack.inNormalRange ? "normal" : "disadvantage",
      });
      const runtimeEffects: ActionRuntimeEffect[] = [
        {
          type: "REMOVE_ITEM",
          itemId: result.entryId,
          quantity: result.removeQuantity,
        },
      ];
      const stateChanges: CharacterStatePatch[] = [];
      let damageRoll: DiceRollResponseDto | null = null;
      let finalDamage = 0;
      const ruleResults: RuleHookResult<unknown>[] = [attackRuleResult];
      let landingPoint: ItemInteractionPoint | null = null;

      if (attackRuleResult.produced.hit) {
        damageRoll = this.diceService.roll(result.attack.damageDice);
        const damageRuleResult = this.ruleEngine.applyDamageModifiers({
          baseDamage: damageRoll.total,
          damageType: result.attack.damageType,
          ...this.resolveDamageProfile(thrownTarget),
        });
        ruleResults.push(damageRuleResult);
        finalDamage = damageRuleResult.produced.finalDamage;
        const nextHp = Math.max(thrownTarget.currentHp - finalDamage, 0);
        stateChanges.push({
          sessionCharacterId: thrownTarget.id,
          currentHp: nextHp,
          markDead: nextHp <= 0,
        });
      } else {
        landingPoint = this.resolveThrownMissLandingPoint(command.point, attackRoll);
        runtimeEffects.push({
          type: "CREATE_MAP_OBJECT",
          objectId: this.createThrownItemObjectId(result.entryId, landingPoint),
          itemDefinitionId: result.missObject.itemDefinitionId,
          name: result.missObject.name,
          quantity: result.missObject.quantity,
          point: landingPoint,
        });
      }
      runtimeEffects.push({ type: "SPEND_ACTION" });

      return {
        structuredAction: {
          type: "item_interaction",
          operation: "throw",
          itemId: command.itemId,
          quantity: command.quantity,
          actorPoint,
          target: thrownTarget.id,
          targetArmorClass: thrownTarget.character.armorClass,
          damageType: result.attack.damageType,
          damageRoll: damageRoll ? { ...damageRoll } : null,
          finalDamage,
          landingPoint,
          result,
          ruleResults,
        },
        diceResult: attackRoll,
        outcome: attackRuleResult.produced.hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
        narration: attackRuleResult.produced.hit ? `${item.name}이(가) 명중했습니다.` : `${item.name}이(가) 빗나갔습니다.`,
        stateChanges,
        runtimeEffects,
      };
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

  private resolveSecondWind(actor: SessionCharacterForRules, runtimeContext: RuleRuntimeContext): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const secondWindAvailable = runtimeContext.resource?.secondWindAvailable ?? !this.hasCondition(actor, SECOND_WIND_EXPENDED_TAG);
    const bonusActionAvailable = this.hasBonusActionAvailable(runtimeContext);
    const canRollHealing = this.isClass(actor, "fighter") && secondWindAvailable && bonusActionAvailable;
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

  private resolveActionSurge(actor: SessionCharacterForRules, runtimeContext: RuleRuntimeContext): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const actionSurgeAvailableUses = runtimeContext.resource?.actionSurgeUses ?? (this.hasCondition(actor, ACTION_SURGE_EXPENDED_TAG) ? 0 : 1);
    const ruleResult = this.ruleEngine.applyActionSurge({
      fighterLevel: this.isClass(actor, "fighter") ? actor.character.level : 0,
      actionSurgeAvailableUses,
      turnActionState: {
        actionSurgeUsedThisTurn: runtimeContext.turnState?.additionalActionGranted ?? this.hasCondition(actor, ACTION_SURGE_GRANTED_TAG),
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
      narration: ruleResult.accepted ? "Action Surge로 추가 행동을 얻었습니다." : this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
      stateChanges: ruleResult.accepted
        ? [
            {
              sessionCharacterId: actor.id,
              conditions: this.addConditions(currentConditions, [ACTION_SURGE_EXPENDED_TAG, ACTION_SURGE_GRANTED_TAG]),
            },
          ]
        : [],
      runtimeEffects: ruleResult.accepted ? [{ type: "SPEND_ACTION_SURGE_USE" }, { type: "GRANT_ADDITIONAL_ACTION" }] : [],
    };
  }

  private resolveFightingStyle(command: Extract<ParsedCommand, { type: "use_class_feature" }>, actor: SessionCharacterForRules): ActionResolution {
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
              conditions: this.addConditions(currentConditions, [`${FIGHTING_STYLE_TAG_PREFIX}${ruleResult.produced.selectedStyle}`]),
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

  private resolveExpertise(command: Extract<ParsedCommand, { type: "use_class_feature" }>, actor: SessionCharacterForRules): ActionResolution {
    const selections = this.parseFeatureOptionTokens(command.option);
    const currentConditions = this.getConditions(actor);
    const proficientSkills = this.parseJson<string[]>(actor.character.proficientSkillsJson, []);
    const ruleResult = this.ruleEngine.applyExpertise({
      rogueLevel: this.isClass(actor, "rogue") ? actor.character.level : 0,
      selections,
      proficientSkills,
      hasThievesToolsProficiency: this.isClass(actor, "rogue") || this.hasFeatureTag(actor, "tool:thieves_tools"),
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
                ruleResult.produced.expertiseSelections.map((selection) => `${EXPERTISE_TAG_PREFIX}${selection}`),
              ),
            },
          ]
        : [],
    };
  }

  private resolveFavoredEnemy(command: Extract<ParsedCommand, { type: "use_class_feature" }>, actor: SessionCharacterForRules): ActionResolution {
    const [selectedEnemy = "", ...humanoidRaceSelections] = this.parseFeatureOptionTokens(command.option);
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
                ...ruleResult.produced.humanoidRaceSelections.map((race) => `${FAVORED_ENEMY_HUMANOID_TAG_PREFIX}${race}`),
              ]),
            },
          ]
        : [],
    };
  }

  private resolveRage(actor: SessionCharacterForRules, runtimeContext: RuleRuntimeContext): ActionResolution {
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
    const mindlessRageRemovalTags = this.hasFeatureTag(
      actor,
      "rage:immunity:charmed",
    )
      ? [
          "charmed",
          "condition.charmed",
          "condition:charmed",
          "frightened",
          "condition.frightened",
          "condition:frightened",
        ]
      : [];
    const nextConditions = this.removeConditions(
      this.addConditions(currentConditions, [RAGE_EXPENDED_TAG, RAGE_ACTIVE_TAG, ...rageTags]),
      [
        ...(ruleResult.produced.concentrationEnded
          ? ["concentration", "condition.concentration"]
          : []),
        ...mindlessRageRemovalTags,
      ],
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

  private resolveFrenzy(actor: SessionCharacterForRules, runtimeContext: RuleRuntimeContext): ActionResolution {
    const rageActive = runtimeContext.resource?.rageActive ?? this.hasCondition(actor, RAGE_ACTIVE_TAG);
    const currentConditions = this.getConditions(actor);
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
      narration: ruleResult.accepted ? "Frenzy 상태가 적용되었습니다." : this.createClassFeatureRejectedNarration(ruleResult.rejectedReason),
      stateChanges: ruleResult.accepted
        ? [
            {
              sessionCharacterId: actor.id,
              conditions: this.addConditions(currentConditions, ["frenzy"]),
            },
          ]
        : [],
      runtimeEffects: ruleResult.accepted ? [{ type: "START_FRENZY" }] : [],
    };
  }

  private resolveDivineSense(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const available =
      this.isClass(actor, "paladin") &&
      actor.character.level >= 1 &&
      this.hasActionAvailable(runtimeContext) &&
      !this.hasCondition(actor, DIVINE_SENSE_EXPENDED_TAG);
    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: DIVINE_SENSE_FEATURE_ID,
        rangeFt: 60,
        detectedCreatureTypes: ["celestial", "fiend", "undead"],
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? "Divine Sense를 사용했습니다. 60ft 안의 celestial, fiend, undead 존재를 감지합니다."
        : "Divine Sense를 사용할 수 없습니다.",
      stateChanges: available
        ? [
            {
              sessionCharacterId: actor.id,
              conditions: this.addConditions(currentConditions, [
                DIVINE_SENSE_EXPENDED_TAG,
                "sense:divine:60",
              ]),
            },
          ]
        : [],
      runtimeEffects: available ? [{ type: "SPEND_ACTION" }] : [],
    };
  }

  private resolveLayOnHands(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const healingPool = Math.max(actor.character.level * 5, 0);
    const healing = Math.min(
      healingPool,
      Math.max(actor.character.maxHp - actor.currentHp, 0),
    );
    const available =
      this.isClass(actor, "paladin") &&
      actor.character.level >= 1 &&
      this.hasActionAvailable(runtimeContext) &&
      !this.hasCondition(actor, LAY_ON_HANDS_EXPENDED_TAG) &&
      healing > 0;
    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: LAY_ON_HANDS_FEATURE_ID,
        healingPool,
        healingApplied: available ? healing : 0,
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? `Lay on Hands로 자신을 ${healing} 회복했습니다.`
        : "Lay on Hands를 사용할 수 없거나 회복할 HP가 없습니다.",
      stateChanges: available
        ? [
            {
              sessionCharacterId: actor.id,
              currentHp: actor.currentHp + healing,
              conditions: this.addConditions(currentConditions, [
                LAY_ON_HANDS_EXPENDED_TAG,
              ]),
            },
          ]
        : [],
      runtimeEffects: available ? [{ type: "SPEND_ACTION" }] : [],
    };
  }

  private resolvePrimevalAwareness(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const hasSlot = (runtimeContext.spellSlots?.["1"] ?? 0) > 0;
    const available =
      this.isClass(actor, "ranger") &&
      actor.character.level >= 3 &&
      this.hasActionAvailable(runtimeContext) &&
      hasSlot;
    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: PRIMEVAL_AWARENESS_FEATURE_ID,
        slotLevel: 1,
        detectedCreatureTypes: [
          "aberration",
          "celestial",
          "dragon",
          "elemental",
          "fey",
          "fiend",
          "undead",
        ],
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? "Primeval Awareness를 사용했습니다. 주변에 특정 초자연 생물 유형이 존재하는지 감지합니다."
        : "Primeval Awareness를 사용하려면 행동과 1레벨 주문 슬롯이 필요합니다.",
      stateChanges: [],
      runtimeEffects: available
        ? [{ type: "SPEND_ACTION" }, { type: "SPEND_SPELL_SLOT", slotLevel: 1 }]
        : [],
    };
  }

  private resolveKi(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const option = this.normalizeRuleToken(command.option ?? "");
    const currentConditions = this.getConditions(actor);
    const spent = currentConditions
      .map((condition) => /^resource:ki_spent:(\d+)$/.exec(condition)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number)
      .reduce((maximum, value) => Math.max(maximum, value), 0);
    const available =
      this.isClass(actor, "monk") &&
      actor.character.level >= 2 &&
      spent < actor.character.level &&
      this.hasBonusActionAvailable(runtimeContext) &&
      ["patient_defense", "step_of_the_wind"].includes(option);
    const nextConditions = this.addConditions(
      currentConditions.filter(
        (condition) => !condition.startsWith("resource:ki_spent:"),
      ),
      [
        `resource:ki_spent:${spent + 1}`,
        ...(option === "patient_defense"
          ? ["combat:dodge"]
          : ["combat:disengage"]),
      ],
    );
    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: KI_FEATURE_ID,
        option,
        kiSpent: available ? spent + 1 : spent,
        kiMaximum: actor.character.level,
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? `Ki를 사용해 ${option === "patient_defense" ? "Patient Defense" : "Step of the Wind"}를 적용했습니다.`
        : "Ki를 사용할 수 없습니다.",
      stateChanges: available
        ? [{ sessionCharacterId: actor.id, conditions: nextConditions }]
        : [],
      runtimeEffects: available ? [{ type: "SPEND_BONUS_ACTION" }] : [],
    };
  }

  private resolveChannelDivinity(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const subclass = this.normalizeRuleToken(actor.character.subclassName ?? "");
    const maximumAfterHealing = Math.floor(actor.character.maxHp / 2);
    const healingPool = Math.max(actor.character.level * 5, 0);
    const healing = Math.min(
      healingPool,
      Math.max(maximumAfterHealing - actor.currentHp, 0),
    );
    const maximumUses = actor.character.level >= 6 ? 2 : 1;
    const spentUses = Math.max(
      ...currentConditions
        .map(
          (condition) =>
            new RegExp(`^${CHANNEL_DIVINITY_SPENT_PREFIX}(\\d+)$`).exec(
              condition,
            )?.[1],
        )
        .filter((value): value is string => Boolean(value))
        .map(Number),
      this.hasCondition(actor, CHANNEL_DIVINITY_EXPENDED_TAG) ? 1 : 0,
    );
    const available =
      this.isClass(actor, "cleric") &&
      actor.character.level >= 2 &&
      subclass === "life" &&
      this.hasActionAvailable(runtimeContext) &&
      spentUses < maximumUses &&
      healing > 0;
    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: CHANNEL_DIVINITY_FEATURE_ID,
        option: "preserve_life",
        healingPool,
        healingApplied: available ? healing : 0,
        maximumAfterHealing,
        usesSpent: available ? spentUses + 1 : spentUses,
        maximumUses,
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? `Channel Divinity: Preserve Life로 자신을 ${healing} 회복했습니다.`
        : "Preserve Life를 사용할 수 없거나 현재 HP가 절반 이상입니다.",
      stateChanges: available
        ? [
            {
              sessionCharacterId: actor.id,
              currentHp: actor.currentHp + healing,
              conditions:
                maximumUses === 1
                  ? this.addConditions(currentConditions, [
                      CHANNEL_DIVINITY_EXPENDED_TAG,
                    ])
                  : this.addConditions(
                      currentConditions.filter(
                        (condition) =>
                          condition !== CHANNEL_DIVINITY_EXPENDED_TAG &&
                          !condition.startsWith(
                            CHANNEL_DIVINITY_SPENT_PREFIX,
                          ),
                      ),
                      [
                        `${CHANNEL_DIVINITY_SPENT_PREFIX}${spentUses + 1}`,
                      ],
                    ),
            },
          ]
        : [],
      runtimeEffects: available ? [{ type: "SPEND_ACTION" }] : [],
    };
  }

  private resolveBardicInspiration(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const targetId = command.option?.trim() ?? "";
    const target = sessionCharacters.find(
      (candidate) =>
        candidate.id === targetId ||
        candidate.combatParticipantId === targetId ||
        candidate.tokenId === targetId,
    );
    const currentConditions = this.getConditions(actor);
    const spent = currentConditions
      .map(
        (condition) =>
          /^resource:bardic_inspiration_spent:(\d+)$/.exec(condition)?.[1],
      )
      .filter((value): value is string => Boolean(value))
      .map(Number)
      .reduce((maximum, value) => Math.max(maximum, value), 0);
    const maximumUses = Math.max(this.resolveAbilityModifier(actor, "cha"), 1);
    const inspirationDie = actor.character.level >= 5 ? "1d8" : "1d6";
    const available =
      this.isClass(actor, "bard") &&
      actor.character.level >= 1 &&
      Boolean(target && target.id !== actor.id) &&
      spent < maximumUses &&
      this.hasBonusActionAvailable(runtimeContext);
    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: BARDIC_INSPIRATION_FEATURE_ID,
        targetId: target?.id ?? targetId,
        die: inspirationDie,
        usesSpent: available ? spent + 1 : spent,
        maximumUses,
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? `${target?.character.name ?? "대상"}에게 Bardic Inspiration ${inspirationDie}를 부여했습니다.`
        : "Bardic Inspiration을 사용할 수 없거나 유효한 아군 대상이 없습니다.",
      stateChanges:
        available && target
          ? [
              {
                sessionCharacterId: actor.id,
                conditions: this.addConditions(
                  currentConditions.filter(
                    (condition) =>
                      !condition.startsWith(
                        "resource:bardic_inspiration_spent:",
                      ),
                  ),
                  [`resource:bardic_inspiration_spent:${spent + 1}`],
                ),
              },
              {
                sessionCharacterId: target.id,
                conditions: this.addConditions(this.getConditions(target), [
                  `bardic_inspiration:${inspirationDie}`,
                ]),
              },
            ]
          : [],
      runtimeEffects: available ? [{ type: "SPEND_BONUS_ACTION" }] : [],
    };
  }

  private resolveFontOfMagic(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const spent = currentConditions
      .map(
        (condition) =>
          /^resource:sorcery_points_spent:(\d+)$/.exec(condition)?.[1],
      )
      .filter((value): value is string => Boolean(value))
      .map(Number)
      .reduce((maximum, value) => Math.max(maximum, value), 0);
    const maximumPoints = Math.max(actor.character.level, 0);
    const slotCurrent = runtimeContext.spellSlots?.["1"] ?? 0;
    const slotMaximum = runtimeContext.spellSlotMaximums?.["1"] ?? 0;
    const available =
      this.isClass(actor, "sorcerer") &&
      actor.character.level >= 2 &&
      spent + 2 <= maximumPoints &&
      slotCurrent < slotMaximum &&
      this.hasBonusActionAvailable(runtimeContext);
    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: FONT_OF_MAGIC_FEATURE_ID,
        option: "create_level_1_spell_slot",
        sorceryPointsSpent: available ? spent + 2 : spent,
        sorceryPointsMaximum: maximumPoints,
        restoredSlotLevel: 1,
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? "Font of Magic으로 소서리 포인트 2점을 소모해 1레벨 주문 슬롯 하나를 회복했습니다."
        : "Font of Magic을 사용할 수 없거나 회복할 1레벨 슬롯이 없습니다.",
      stateChanges: available
        ? [
            {
              sessionCharacterId: actor.id,
              conditions: this.addConditions(
                currentConditions.filter(
                  (condition) =>
                    !condition.startsWith("resource:sorcery_points_spent:"),
                ),
                [`resource:sorcery_points_spent:${spent + 2}`],
              ),
            },
          ]
        : [],
      runtimeEffects: available
        ? [
            { type: "SPEND_BONUS_ACTION" },
            { type: "RESTORE_SPELL_SLOT", slotLevel: 1, amount: 1 },
          ]
        : [],
    };
  }

  private resolveWildShape(
    command: Extract<ParsedCommand, { type: "use_class_feature" }>,
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const spent = currentConditions
      .map(
        (condition) =>
          /^resource:wild_shape_spent:(\d+)$/.exec(condition)?.[1],
      )
      .filter((value): value is string => Boolean(value))
      .map(Number)
      .reduce((maximum, value) => Math.max(maximum, value), 0);
    const requestedForm = this.normalizeRuleToken(command.option ?? "wolf");
    const formProfiles: Record<
      string,
      { minimumLevel: number; hitPoints: number; speedFt: number; label: string }
    > = {
      wolf: {
        minimumLevel: 2,
        hitPoints: 11,
        speedFt: 40,
        label: "늑대",
      },
      brown_bear: {
        minimumLevel: 8,
        hitPoints: 34,
        speedFt: 40,
        label: "갈색곰",
      },
      giant_octopus: {
        minimumLevel: 8,
        hitPoints: 52,
        speedFt: 10,
        label: "거대 문어",
      },
    };
    const form = formProfiles[requestedForm];
    const available =
      this.isClass(actor, "druid") &&
      actor.character.level >= 2 &&
      Boolean(form && actor.character.level >= form.minimumLevel) &&
      spent < 2 &&
      !currentConditions.some((condition) =>
        condition.startsWith("wild_shape:"),
      ) &&
      this.hasActionAvailable(runtimeContext);
    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: WILD_SHAPE_FEATURE_ID,
        form: requestedForm,
        formHitPoints: form?.hitPoints ?? null,
        usesSpent: available ? spent + 1 : spent,
        maximumUses: 2,
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? `Wild Shape로 ${form?.label} 형태가 되었습니다. 형태 HP ${form?.hitPoints}, 이동 ${form?.speedFt}ft를 사용합니다.`
        : "해당 Wild Shape 형태를 현재 레벨에서 사용할 수 없습니다.",
      stateChanges: available
        ? [
            {
              sessionCharacterId: actor.id,
              tempHp: Math.max(actor.tempHp, form?.hitPoints ?? 0),
              conditions: this.addConditions(
                currentConditions.filter(
                  (condition) =>
                    !condition.startsWith("resource:wild_shape_spent:") &&
                    !condition.startsWith("wild_shape:") &&
                    !condition.startsWith("movement_speed_override:"),
                ),
                [
                  `resource:wild_shape_spent:${spent + 1}`,
                  `wild_shape:${requestedForm}`,
                  `movement_speed_override:${form?.speedFt ?? 30}`,
                  ...(requestedForm === "giant_octopus"
                    ? ["movement_mode:swim:60"]
                    : []),
                ],
              ),
            },
          ]
        : [],
      runtimeEffects: available ? [{ type: "SPEND_ACTION" }] : [],
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
        secondWindAvailable: this.hasFighterSecondWind(actor),
        actionSurgeUses: this.resolveActionSurgeUses(actor),
        rageUses: this.resolveRageUses(actor),
      },
      hitDiceToSpend: command.hitDiceToSpend,
      totalHitDice: actor.character.level,
      hitDiceSpent: runtimeContext.resource?.hitDiceSpent,
      hitDieAverage: this.resolveHitDieAverage(actor),
      constitutionModifier: this.resolveAbilityModifier(actor, "con"),
      spellSlots: runtimeContext.spellSlots,
      spellSlotMaximums: runtimeContext.spellSlotMaximums,
      recoverBardicInspirationOnShortRest:
        this.isClass(actor, "bard") && actor.character.level >= 5,
    });

    if (command.restType === "short") {
      return this.resolveShortRest(actor, restResolution, runtimeContext);
    }

    return this.resolveLongRest(actor, restResolution, runtimeContext);
  }

  private resolveShortRest(actor: SessionCharacterForRules, rest: RestResolution, runtimeContext: RuleRuntimeContext): ActionResolution {
    const spellRecovery = this.resolveShortRestSpellRecovery(actor, runtimeContext);
    const nextConditions = spellRecovery
      ? this.addConditions(rest.conditions as string[], [spellRecovery.expendedTag])
      : rest.conditions;
    return {
      structuredAction: {
        type: "rest",
        restType: "short",
        restResult: this.buildRestResult(actor, rest, runtimeContext),
        recoveredResources: {
          secondWindAvailable: rest.resource.secondWindAvailable,
          actionSurgeUses: rest.resource.actionSurgeUses,
          hitDiceSpent: rest.resource.hitDiceSpent,
          spellRecovery,
        },
        recoveredTags: rest.recoveredTags,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: "짧은 휴식을 마치고 일부 자원을 회복했습니다.",
      stateChanges: [
        {
          sessionCharacterId: actor.id,
          ...(rest.hp.currentHp === actor.currentHp ? {} : { currentHp: rest.hp.currentHp }),
          conditions: nextConditions,
        },
      ],
      runtimeEffects: [
        {
          type: "RECOVER_SHORT_REST",
          secondWindAvailable: rest.resource.secondWindAvailable,
          actionSurgeUses: rest.resource.actionSurgeUses,
          ...(rest.recoveredTags.some((tag) => tag.startsWith("hit_dice:spent:")) ? { hitDiceSpent: rest.resource.hitDiceSpent } : {}),
          ...(spellRecovery
            ? {
                recoverSpellSlotLevel: spellRecovery.slotLevel,
                spellRecoveryFeatureId: spellRecovery.featureId,
              }
            : {}),
        },
      ],
    };
  }

  private resolveShortRestSpellRecovery(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): {
    featureId: string;
    expendedTag: string;
    slotLevel: number;
  } | null {
    const isWizard = this.isClass(actor, "wizard");
    const isLandDruid =
      this.isClass(actor, "druid") &&
      this.normalizeRuleToken(actor.character.subclassName ?? "") === "land";
    if (!isWizard && !isLandDruid) {
      return null;
    }
    const featureId = isWizard
      ? "class.wizard.feature.arcane_recovery"
      : "subclass.druid.land.feature.natural_recovery";
    const expendedTag = isWizard
      ? "resource:arcane_recovery_expended"
      : "resource:natural_recovery_expended";
    if (this.hasCondition(actor, expendedTag)) {
      return null;
    }
    const recoveryBudget = Math.max(Math.ceil(actor.character.level / 2), 1);
    const current = runtimeContext.spellSlots ?? {};
    const maximums = runtimeContext.spellSlotMaximums ?? {};
    const slotLevel = Object.keys(maximums)
      .map(Number)
      .filter(
        (level) =>
          Number.isInteger(level) &&
          level > 0 &&
          level <= recoveryBudget &&
          (current[String(level)] ?? maximums[String(level)] ?? 0) <
            (maximums[String(level)] ?? 0),
      )
      .sort((left, right) => right - left)[0];
    return slotLevel
      ? {
          featureId,
          expendedTag,
          slotLevel,
        }
      : null;
  }

  private resolveLongRest(actor: SessionCharacterForRules, rest: RestResolution, runtimeContext: RuleRuntimeContext): ActionResolution {
    const currentExhaustionLevel = runtimeContext.resource?.exhaustionLevel ?? 0;
    return {
      structuredAction: {
        type: "rest",
        restType: "long",
        restResult: this.buildRestResult(actor, rest, runtimeContext),
        recoveredResources: {
          secondWindAvailable: rest.resource.secondWindAvailable,
          actionSurgeUses: rest.resource.actionSurgeUses,
          rageUses: rest.resource.rageUses,
          reduceExhaustionBy: Math.max(currentExhaustionLevel - rest.resource.exhaustionLevel, 0),
          hitDiceSpent: rest.resource.hitDiceSpent,
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
          secondWindAvailable: rest.resource.secondWindAvailable,
          actionSurgeUses: rest.resource.actionSurgeUses,
          rageUses: rest.resource.rageUses,
          reduceExhaustionBy: Math.max(currentExhaustionLevel - rest.resource.exhaustionLevel, 0),
          ...(rest.recoveredTags.some((tag) => tag.startsWith("hit_dice:recovered:")) ? { hitDiceSpent: rest.resource.hitDiceSpent } : {}),
        },
      ],
    };
  }

  private buildRestResult(actor: SessionCharacterForRules, rest: RestResolution, runtimeContext: RuleRuntimeContext): Record<string, unknown> {
    const beforeConditions = this.getConditions(actor);
    const beforeResource = runtimeContext.resource ?? {
      secondWindAvailable: this.hasFighterSecondWind(actor),
      actionSurgeUses: 0,
      rageUses: 0,
      rageActive: false,
      frenzyActive: false,
      exhaustionLevel: 0,
      hitDiceSpent: 0,
    };

    return {
      hp: {
        before: actor.currentHp,
        after: rest.hp.currentHp,
        recovered: Math.max(rest.hp.currentHp - actor.currentHp, 0),
      },
      tempHp: {
        before: actor.tempHp ?? 0,
        after: rest.hp.tempHp,
      },
      conditions: {
        beforeCount: beforeConditions.length,
        afterCount: rest.conditions.length,
        removed: this.describeRemovedConditions(beforeConditions, rest.conditions),
      },
      resources: {
        before: beforeResource,
        after: rest.resource,
      },
      spellSlots: {
        before: runtimeContext.spellSlots ?? {},
        after: rest.spellSlots,
      },
      recoveredTags: rest.recoveredTags,
    };
  }

  private describeRemovedConditions(before: unknown[], after: unknown[]): string[] {
    const remaining = new Map<string, number>();
    for (const condition of after) {
      const key = JSON.stringify(condition);
      remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }

    const removed: string[] = [];
    for (const condition of before) {
      const key = JSON.stringify(condition);
      const count = remaining.get(key) ?? 0;
      if (count > 0) {
        remaining.set(key, count - 1);
        continue;
      }
      if (typeof condition === "string") {
        removed.push(condition);
        continue;
      }
      if (condition && typeof condition === "object") {
        const record = condition as Record<string, unknown>;
        removed.push(String(record.conditionId ?? record.sourceId ?? "condition"));
      }
    }
    return removed;
  }

  private resolveHitDieAverage(actor: SessionCharacterForRules): number {
    const normalizedClassName = actor.character.className.trim().toLowerCase();
    return HIT_DIE_AVERAGE_BY_CLASS[normalizedClassName] ?? 4;
  }

  private resolveDamage(command: Extract<ParsedCommand, { type: "damage" }>, sessionCharacters: SessionCharacterForRules[]): ActionResolution {
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
    let nextHp = Math.max(target.currentHp - overflowDamage, 0);
    let relentlessEnduranceConditions: unknown[] | null = null;
    const relentlessEnduranceTriggered =
      nextHp === 0 &&
      target.currentHp > 0 &&
      this.hasFeatureTag(target, "feature:relentless_endurance") &&
      !this.hasCondition(target, "resource:relentless_endurance_expended");
    if (relentlessEnduranceTriggered) {
      nextHp = 1;
      relentlessEnduranceConditions = this.addConditionEntry(
        this.parseJson<unknown[]>(target.conditionsJson, []),
        "resource:relentless_endurance_expended",
      );
    }
    const concentrationCheck = finalDamage > 0 ? this.resolveConcentrationDamageCheck(target, finalDamage) : null;
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
      stateChange.conditions = relentlessEnduranceTriggered
        ? this.addConditionEntry(
            concentrationCheck.conditions,
            "resource:relentless_endurance_expended",
          )
        : concentrationCheck.conditions;
    } else if (relentlessEnduranceConditions) {
      stateChange.conditions = relentlessEnduranceConditions;
    }

    return {
      structuredAction: {
        type: "damage",
        target: target.id,
        amount: command.amount,
        damageType,
        finalDamage,
        relentlessEnduranceTriggered,
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
      narration: relentlessEnduranceTriggered
        ? `${target.character.name}에게 ${finalDamage} 피해를 적용했지만 끈질긴 인내로 HP 1을 유지했습니다.`
        : `${target.character.name}에게 ${finalDamage} 피해를 적용했습니다.`,
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
    const hasConcentration = conditions.some((condition) => condition.conditionId === "condition.concentration" || condition.tags.includes("concentration"));
    if (!hasConcentration) {
      return null;
    }

    const saveProficient = this.resolveSaveProficiencies(target).includes("con");
    const saveModifier = this.resolveAbilityModifier(target, "con") + (saveProficient ? target.character.proficiencyBonus : 0);
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

  private resolveHeal(command: Extract<ParsedCommand, { type: "heal" }>, sessionCharacters: SessionCharacterForRules[]): ActionResolution {
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

  private resolveCondition(command: Extract<ParsedCommand, { type: "condition" }>, sessionCharacters: SessionCharacterForRules[]): ActionResolution {
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
      stateChanges: [this.createTargetStatePatch(target, { conditions: nextConditions })],
    };
  }

  private getCheckModifier(actor: SessionCharacterForRules, checkName: string): number {
    const abilities = this.parseJson<Record<string, number>>(actor.character.abilitiesJson, {});
    const proficientSkills = this.parseJson<string[]>(actor.character.proficientSkillsJson, []);
    const normalizedCheckName = this.normalizeRuleToken(checkName);
    const abilityKey = this.resolveAbilityKey(checkName);
    const abilityScore = abilities[abilityKey] ?? 10;
    const abilityModifier = Math.floor((abilityScore - 10) / 2);
    const hasProficiency = proficientSkills.map((skill) => this.normalizeRuleToken(skill)).includes(normalizedCheckName);
    const hasExpertise = this.hasFeatureTag(actor, `${EXPERTISE_TAG_PREFIX}${normalizedCheckName}`);
    const proficiency = hasProficiency ? actor.character.proficiencyBonus * (hasExpertise ? 2 : 1) : 0;
    const remarkableAthleteBonus =
      !hasProficiency &&
      ["str", "dex", "con"].includes(abilityKey) &&
      this.hasFeatureTag(
        actor,
        `ability_check:half_proficiency:untrained:${abilityKey}`,
      )
        ? Math.ceil(actor.character.proficiencyBonus / 2)
        : 0;
    return abilityModifier + proficiency + remarkableAthleteBonus;
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

  private createActionUnavailableResolution(type: string, payload: Record<string, unknown>): ActionResolution {
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

  private requireTarget(targetToken: string, sessionCharacters: SessionCharacterForRules[]): SessionCharacterForRules {
    const target = this.findTarget(targetToken, sessionCharacters);
    if (!target) {
      throw forbidden("ACTION_403", "대상을 찾을 수 없습니다.", {
        reason: "TARGET_NOT_FOUND",
      });
    }

    return target;
  }

  private resolveSpellTargetList(targetToken: string, sessionCharacters: SessionCharacterForRules[]): SessionCharacterForRules[] {
    const targets = targetToken
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => this.requireTarget(token, sessionCharacters));
    return Array.from(new Map(targets.map((target) => [target.id, target])).values());
  }

  private findTarget(targetToken: string, sessionCharacters: SessionCharacterForRules[]): SessionCharacterForRules | null {
    const normalized = this.normalizeTargetToken(targetToken);
    return sessionCharacters.find((candidate) => this.getTargetAliases(candidate).some((alias) => this.normalizeTargetToken(alias) === normalized)) ?? null;
  }

  private getTargetAliases(candidate: SessionCharacterForRules): string[] {
    return [
      candidate.id,
      candidate.userId,
      candidate.characterId,
      candidate.character.id,
      candidate.character.name,
      candidate.tokenId,
      candidate.combatParticipantId,
      candidate.user?.id,
      candidate.user?.displayName,
      candidate.user?.profile?.nickname,
    ].filter((alias): alias is string => Boolean(alias?.trim()));
  }

  private createTargetStatePatch(
    target: SessionCharacterForRules,
    change: Omit<CharacterStatePatch, "sessionCharacterId" | "combatParticipantId">,
  ): CharacterStatePatch {
    return {
      ...change,
      sessionCharacterId: target.isCombatParticipantOnly ? undefined : target.id,
      combatParticipantId: target.combatParticipantId ?? undefined,
    };
  }

  private normalizeTargetToken(value: string): string {
    return value.trim().toLowerCase();
  }

  private resolveChampionCriticalThreshold(actor: SessionCharacterForRules, naturalD20: number): RuleHookResult<CriticalThresholdModifierProduced> | null {
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
    const conditions = this.getConditions(actor).map((condition) => this.normalizeRuleToken(condition));
    const className = this.normalizeRuleToken(actor.character.className);
    const subclassName = this.normalizeRuleToken(actor.character.subclassName ?? "");
    const characterFeatures = this.parseJson<string[]>(actor.character.featuresJson, []).map((feature) => this.normalizeRuleToken(feature));
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
    const normalizedEntryWeapon = this.resolveInventoryEntryWeaponProfile(actor.inventoryEntries ?? [], equippedWeaponId);
    if (normalizedEntryWeapon) {
      return normalizedEntryWeapon;
    }

    const inventory = this.parseJson<InventoryItemForRules[]>(actor.inventorySnapshotJson ?? actor.character.inventoryJson, []);
    const equippedWeapon = equippedWeaponId ? inventory.find((item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId) : null;
    const properties = equippedWeapon?.properties ?? [];
    const normalizedProperties = properties.map((property) => this.normalizeRuleToken(property));

    return {
      damageDice: equippedWeapon?.damageDice ?? "1d6",
      damageType: equippedWeapon?.damageType ?? DEFAULT_WEAPON_DAMAGE_TYPE,
      properties,
      attackKind: normalizedProperties.includes("ranged") ? "ranged_weapon_attack" : "melee_weapon_attack",
    };
  }

  private resolveFightingStyleAttackBonus(actor: SessionCharacterForRules, weaponProfile: EquippedWeaponProfile): number {
    if (weaponProfile.attackKind === "ranged_weapon_attack" && this.hasFeatureTag(actor, `${FIGHTING_STYLE_TAG_PREFIX}archery`)) {
      return 2;
    }

    return 0;
  }

  private resolveFightingStyleDamageBonus(actor: SessionCharacterForRules, weaponProfile: EquippedWeaponProfile): number {
    if (weaponProfile.attackKind === "melee_weapon_attack" && this.hasFeatureTag(actor, `${FIGHTING_STYLE_TAG_PREFIX}dueling`)) {
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

    const equippedEntry = inventoryEntries.find((entry) => entry.id === equippedWeaponId || entry.itemDefinitionId === equippedWeaponId) ?? null;
    if (!equippedEntry || !this.isWeaponItemDefinition(equippedEntry.itemDefinition)) {
      return null;
    }

    const properties = this.parseStringArrayJson(equippedEntry.itemDefinition.propertiesJson);
    const normalizedProperties = properties.map((property) => this.normalizeRuleToken(property));

    return {
      damageDice: equippedEntry.itemDefinition.damageDice ?? "1d6",
      damageType: equippedEntry.itemDefinition.damageType ?? DEFAULT_WEAPON_DAMAGE_TYPE,
      properties,
      attackKind: normalizedProperties.includes("ranged") ? "ranged_weapon_attack" : "melee_weapon_attack",
    };
  }

  private requireInventoryItemForInteraction(actor: SessionCharacterForRules, itemId: string): ItemInteractionEntry {
    const normalizedItemId = this.normalizeRuleToken(itemId);
    const inventory = this.parseJson<InventoryItemForRules[]>(actor.inventorySnapshotJson ?? actor.character.inventoryJson, []);
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

  private resolveActorGridPoint(actor: SessionCharacterForRules, runtimeContext: RuleRuntimeContext): ItemInteractionPoint | null {
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

  private findTargetAtGridPoint(
    point: ItemInteractionPoint,
    actorSessionCharacterId: string,
    sessionCharacters: SessionCharacterForRules[],
    map: RuleMapRuntimeContext | null | undefined,
  ): SessionCharacterForRules | null {
    if (!map) {
      return null;
    }

    const token = map.tokens.find((candidate) => {
      if (!candidate.sessionCharacterId || candidate.sessionCharacterId === actorSessionCharacterId || candidate.hidden) {
        return false;
      }
      return Math.floor(candidate.x / map.gridSize) === point.x && Math.floor(candidate.y / map.gridSize) === point.y;
    });
    if (!token?.sessionCharacterId) {
      return null;
    }

    return sessionCharacters.find((candidate) => candidate.id === token.sessionCharacterId) ?? null;
  }

  private createDroppedItemObjectId(entryId: string, point: ItemInteractionPoint): string {
    return `object:item:${entryId}:${point.x}:${point.y}`;
  }

  private createThrownItemObjectId(entryId: string, point: ItemInteractionPoint): string {
    return `object:thrown:${entryId}:${point.x}:${point.y}`;
  }

  private resolveThrownMissLandingPoint(
    targetPoint: ItemInteractionPoint,
    attackRoll: DiceRollResponseDto,
  ): ItemInteractionPoint {
    const naturalD20 = this.selectNaturalD20(attackRoll);
    const missOffsets = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
    ];
    const offset = missOffsets[(naturalD20 - 1) % missOffsets.length] ?? { x: 1, y: 0 };
    return {
      x: targetPoint.x + offset.x,
      y: targetPoint.y + offset.y,
    };
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

    if (objectCell.hiddenItemIds.length > 0 && !objectCell.hiddenItemIds.includes(command.itemDefinitionId)) {
      return { objectCell, quantity: null, rejectedReason: "map_object_item_mismatch" };
    }

    const objectPoint = {
      x: Math.floor(objectCell.x / map.gridSize),
      y: Math.floor(objectCell.y / map.gridSize),
    };
    if (objectPoint.x !== command.point.x || objectPoint.y !== command.point.y) {
      return { objectCell, quantity: null, rejectedReason: "map_object_position_mismatch" };
    }

    const quantity = this.resolveMapObjectQuantity(objectCell, command.itemDefinitionId) ?? 1;
    if (command.quantity > quantity) {
      return { objectCell, quantity, rejectedReason: "insufficient_map_object_quantity" };
    }

    return { objectCell, quantity, rejectedReason: null };
  }

  private resolveMapObjectQuantity(objectCell: RuleMapRuntimeObjectCell, itemDefinitionId: string): number | null {
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
    return this.normalizeRuleToken(itemDefinition.itemType) === "weapon" || Boolean(itemDefinition.damageDice);
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
    const featureIds = this.parseJson<string[]>(actor.character.featuresJson, []);
    return [
      ...this.getConditions(actor),
      ...featureIds,
      ...this.ruleCatalog.resolveRuntimeTags(featureIds),
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

  private hasFighterSecondWind(actor: SessionCharacterForRules): boolean {
    return this.hasFeatureTag(actor, SECOND_WIND_FEATURE_ID) || this.isClass(actor, "fighter");
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
    const normalizedRemoved = new Set(removedConditions.map((condition) => this.normalizeRuleToken(condition)));
    return currentConditions.filter((condition) => !normalizedRemoved.has(this.normalizeRuleToken(condition)));
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
    const conditions = this.getFeatureTags(target);

    return {
      // DB 스키마를 늘리지 않는 MVP 단계라서 임시 룰 태그를 conditionsJson에서 읽는다.
      // 예: resistance:slashing, immunity:necrotic, vulnerability:bludgeoning
      targetImmunities: this.getDamageTypesByPrefix(conditions, "immunity"),
      targetResistances: this.getDamageTypesByPrefix(conditions, "resistance"),
      targetVulnerabilities: this.getDamageTypesByPrefix(conditions, "vulnerability"),
    };
  }

  private toAoeDamageTarget(target: SessionCharacterForRules, saveAbility: SavingThrowAbility): AoeDamageTarget {
    const damageProfile = this.resolveDamageProfile(target);
    const saveProficiencies = this.resolveSaveProficiencies(target);
    const runtimeTags = this.getFeatureTags(target);

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
      runtimeTags,
    };
  }

  private resolveStillnessOfMind(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.parseJson<unknown[]>(
      actor.conditionsJson,
      [],
    );
    const removableConditions = [
      "charmed",
      "condition.charmed",
      "condition:charmed",
      "frightened",
      "condition.frightened",
      "condition:frightened",
    ];
    const nextConditions = removableConditions.reduce(
      (conditions, condition) =>
        this.removeConditionEntry(conditions, condition),
      currentConditions,
    );
    const removed = nextConditions.length < currentConditions.length;
    const available =
      this.isClass(actor, "monk") &&
      actor.character.level >= 7 &&
      this.hasActionAvailable(runtimeContext) &&
      removed;

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: STILLNESS_OF_MIND_FEATURE_ID,
        removedConditions: available
          ? ["charmed", "frightened"].filter((condition) =>
              this.hasCondition(actor, condition),
            )
          : [],
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? "Stillness of Mind로 매혹과 공포 효과를 끝냈습니다."
        : "Stillness of Mind로 끝낼 매혹 또는 공포 효과가 없거나 행동을 사용할 수 없습니다.",
      stateChanges: available
        ? [{ sessionCharacterId: actor.id, conditions: nextConditions }]
        : [],
      runtimeEffects: available ? [{ type: "SPEND_ACTION" }] : [],
    };
  }

  private resolveCountercharm(
    actor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const actorToken = runtimeContext.map?.tokens.find(
      (token) => token.sessionCharacterId === actor.id,
    );
    const targets = sessionCharacters.filter((candidate) => {
      if (candidate.id === actor.id) {
        return true;
      }
      if (!runtimeContext.map || !actorToken) {
        return false;
      }
      const candidateToken = runtimeContext.map.tokens.find(
        (token) => token.sessionCharacterId === candidate.id,
      );
      return Boolean(
        candidateToken &&
          !candidateToken.hidden &&
          candidateToken.isHostile === actorToken.isHostile &&
          this.mapPositions.isWithinFeet(
            runtimeContext.map,
            actorToken,
            candidateToken,
            30,
          ),
      );
    });
    const available =
      this.isClass(actor, "bard") &&
      actor.character.level >= 6 &&
      this.hasActionAvailable(runtimeContext);

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: COUNTERCHARM_FEATURE_ID,
        targetIds: available ? targets.map((target) => target.id) : [],
        rangeFt: 30,
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? `Countercharm으로 ${targets.length}명의 매혹·공포 내성을 강화했습니다.`
        : "Countercharm을 사용할 수 없습니다.",
      stateChanges: available
        ? targets.map((target) => ({
            sessionCharacterId: target.id,
            conditions: this.conditionRuntime.applyCondition(
              this.conditionRuntime.parseConditionsJson(
                target.conditionsJson,
              ),
              this.conditionRuntime.createCondition({
                conditionId: "condition.class.countercharm",
                sourceId: COUNTERCHARM_FEATURE_ID,
                duration: { type: "rounds", remaining: 1 },
                stackPolicy: "replace",
                tags: [
                  "advantage:save:charmed",
                  "advantage:save:frightened",
                ],
              }),
            ),
          }))
        : [],
      runtimeEffects: available ? [{ type: "SPEND_ACTION" }] : [],
    };
  }

  private resolveDarkOnesOwnLuck(
    actor: SessionCharacterForRules,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const available =
      this.isClass(actor, "warlock") &&
      this.normalizeRuleToken(actor.character.subclassName ?? "") ===
        "fiend" &&
      actor.character.level >= 6 &&
      !this.hasCondition(actor, DARK_ONES_OWN_LUCK_EXPENDED_TAG) &&
      !this.hasCondition(actor, DARK_ONES_OWN_LUCK_PENDING_TAG);

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: DARK_ONES_OWN_LUCK_FEATURE_ID,
        die: "1d10",
        appliesTo: ["ability_check", "saving_throw"],
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? "Dark One's Own Luck을 준비했습니다. 다음 능력 판정이나 내성 굴림에 1d10을 더합니다."
        : "Dark One's Own Luck을 사용할 수 없습니다.",
      stateChanges: available
        ? [
            {
              sessionCharacterId: actor.id,
              conditions: this.addConditions(currentConditions, [
                DARK_ONES_OWN_LUCK_EXPENDED_TAG,
                DARK_ONES_OWN_LUCK_PENDING_TAG,
              ]),
            },
          ]
        : [],
      runtimeEffects: [],
    };
  }

  private resolveWholenessOfBody(
    actor: SessionCharacterForRules,
    runtimeContext: RuleRuntimeContext,
  ): ActionResolution {
    const currentConditions = this.getConditions(actor);
    const healing = Math.min(
      actor.character.level * 3,
      Math.max(actor.character.maxHp - actor.currentHp, 0),
    );
    const available =
      this.isClass(actor, "monk") &&
      this.normalizeRuleToken(actor.character.subclassName ?? "") ===
        "open_hand" &&
      actor.character.level >= 6 &&
      this.hasActionAvailable(runtimeContext) &&
      !this.hasCondition(actor, WHOLENESS_OF_BODY_EXPENDED_TAG) &&
      healing > 0;

    return {
      structuredAction: {
        type: "use_class_feature",
        featureId: WHOLENESS_OF_BODY_FEATURE_ID,
        healingMaximum: actor.character.level * 3,
        healingApplied: available ? healing : 0,
      },
      diceResult: null,
      outcome: available ? ActionOutcome.SUCCESS : ActionOutcome.IMPOSSIBLE,
      narration: available
        ? `Wholeness of Body로 자신을 ${healing} 회복했습니다.`
        : "Wholeness of Body를 사용할 수 없거나 회복할 HP가 없습니다.",
      stateChanges: available
        ? [
            {
              sessionCharacterId: actor.id,
              currentHp: actor.currentHp + healing,
              conditions: this.addConditions(currentConditions, [
                WHOLENESS_OF_BODY_EXPENDED_TAG,
              ]),
            },
          ]
        : [],
      runtimeEffects: available ? [{ type: "SPEND_ACTION" }] : [],
    };
  }

  private resolveAbilityModifier(character: SessionCharacterForRules, ability: SavingThrowAbility): number {
    const abilities = this.parseJson<Record<string, number>>(character.character.abilitiesJson, {});
    const score = abilities[ability] ?? 10;
    return this.abilityModifierFromScore(score);
  }

  private abilityModifierFromScore(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  private rollD20WithRacialLuck(
    actor: SessionCharacterForRules,
    expression: string,
    advantageState: DiceAdvantageState,
  ): DiceRollResponseDto {
    const firstRoll = this.diceService.roll(expression, advantageState);
    if (
      this.selectNaturalD20(firstRoll) !== 1 ||
      !this.hasFeatureTag(actor, "reroll:d20:natural_1")
    ) {
      return firstRoll;
    }
    return this.diceService.roll(expression, advantageState);
  }

  private resolveDraconicAncestryDamageType(
    actor: SessionCharacterForRules,
  ): string | null {
    const ancestry = this.parseJson<string[]>(
      actor.character.featuresJson,
      [],
    )
      .map((feature) => this.normalizeRuleToken(feature))
      .find((feature) => feature.startsWith("draconic_ancestry:"))
      ?.slice("draconic_ancestry:".length);
    if (!ancestry) {
      return null;
    }
    const damageTypes: Record<string, string> = {
      black: "acid",
      blue: "lightning",
      brass: "fire",
      bronze: "lightning",
      copper: "acid",
      gold: "fire",
      green: "poison",
      red: "fire",
      silver: "cold",
      white: "cold",
    };
    return damageTypes[ancestry] ?? null;
  }

  private resolveDragonbornBreathTargets(
    actor: SessionCharacterForRules,
    anchor: SessionCharacterForRules,
    sessionCharacters: SessionCharacterForRules[],
    map: RuleMapRuntimeContext | null | undefined,
  ): SessionCharacterForRules[] {
    if (!map || map.gridType !== "square") {
      return [anchor];
    }
    const actorToken = map.tokens.find(
      (token) => token.sessionCharacterId === actor.id,
    );
    const anchorToken = map.tokens.find(
      (token) => token.sessionCharacterId === anchor.id,
    );
    if (!actorToken || !anchorToken) {
      return [anchor];
    }
    const toCell = (token: typeof actorToken) => ({
      column: Math.floor(token.x / map.gridSize),
      row: Math.floor(token.y / map.gridSize),
    });
    const actorCell = toCell(actorToken);
    const anchorCell = toCell(anchorToken);
    const direction = this.resolveAoeDirection(
      anchorCell.column - actorCell.column,
      anchorCell.row - actorCell.row,
    );
    const tokenCells = map.tokens
      .filter((token) => token.sessionCharacterId)
      .map((token) => ({
        id: token.sessionCharacterId as string,
        ...toCell(token),
        hidden: token.hidden,
      }));
    const columns =
      Math.max(actorCell.column, ...tokenCells.map((token) => token.column)) + 2;
    const rows =
      Math.max(actorCell.row, ...tokenCells.map((token) => token.row)) + 2;
    const affectedIds = new Set(
      this.aoeTargeting.resolveTargets({
        shape: "cone",
        origin: actorCell,
        sizeFt: 15,
        grid: { columns, rows },
        direction,
        tokens: tokenCells,
      }).tokenIds,
    );
    return sessionCharacters.filter((candidate) => {
      if (candidate.id === actor.id || !affectedIds.has(candidate.id)) {
        return false;
      }
      const token = map.tokens.find(
        (entry) => entry.sessionCharacterId === candidate.id,
      );
      return Boolean(token && token.isHostile !== actorToken.isHostile);
    });
  }

  private resolveAoeDirection(dx: number, dy: number): AoeDirection {
    const horizontal = Math.sign(dx);
    const vertical = Math.sign(dy);
    if (horizontal > 0 && vertical < 0) return "north_east";
    if (horizontal > 0 && vertical > 0) return "south_east";
    if (horizontal < 0 && vertical < 0) return "north_west";
    if (horizontal < 0 && vertical > 0) return "south_west";
    if (horizontal > 0) return "east";
    if (horizontal < 0) return "west";
    if (vertical < 0) return "north";
    return "south";
  }

  private resolveSaveProficiencies(character: SessionCharacterForRules): SavingThrowAbility[] {
    const conditions = this.getFeatureTags(character);
    const saveAbilities = new Set<SavingThrowAbility>();
    for (const condition of conditions) {
      const normalized = this.normalizeRuleToken(condition);
      const ability = normalized.startsWith("save_proficiency:") ? normalized.slice("save_proficiency:".length) : null;
      if (this.isSavingThrowAbility(ability)) {
        saveAbilities.add(ability);
      }
    }
    return Array.from(saveAbilities);
  }

  private resolveRacialSaveAdvantage(
    character: SessionCharacterForRules,
    ability: SavingThrowAbility,
    condition?: string | null,
  ): DiceAdvantageState {
    const tags = new Set(this.getFeatureTags(character));
    const normalizedCondition = this.normalizeRuleToken(condition ?? "")
      .replace(/^condition[.:]/, "");
    if (
      (normalizedCondition === "poison" || normalizedCondition === "poisoned") &&
      tags.has("advantage:save:poison")
    ) {
      return DiceAdvantageState.ADVANTAGE;
    }
    if (
      (normalizedCondition === "charm" || normalizedCondition === "charmed") &&
      tags.has("advantage:save:charmed")
    ) {
      return DiceAdvantageState.ADVANTAGE;
    }
    if (
      (normalizedCondition === "fear" || normalizedCondition === "frightened") &&
      tags.has("advantage:save:frightened")
    ) {
      return DiceAdvantageState.ADVANTAGE;
    }
    if (
      normalizedCondition.includes("magic") &&
      tags.has(`advantage:save:${ability}_magic`)
    ) {
      return DiceAdvantageState.ADVANTAGE;
    }
    return DiceAdvantageState.NORMAL;
  }

  private isSavingThrowAbility(value: string | null): value is SavingThrowAbility {
    return value === "str" || value === "dex" || value === "con" || value === "int" || value === "wis" || value === "cha";
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
      return normalizedCondition === normalizedName || normalizedCondition === `condition.${normalizedName}`;
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
    if (currentEntries.some((entry) => typeof entry === "string" && this.normalizeRuleToken(entry) === normalized)) {
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
      remainingConditions
        .filter(
          (
            condition,
          ): condition is {
            conditionId: string;
            sourceId: string | null;
            appliedAtRound: number | null;
          } =>
            Boolean(condition) &&
            typeof condition === "object" &&
            !Array.isArray(condition) &&
            typeof (condition as { conditionId?: unknown }).conditionId === "string",
        )
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
      return [entry];
    });
  }

  private conditionEntryKey(condition: { conditionId: string; sourceId: string | null; appliedAtRound: number | null }): string {
    return `${condition.conditionId}:${condition.sourceId ?? ""}:${condition.appliedAtRound ?? ""}`;
  }

  private conditionNameMatches(conditionId: string, normalizedConditionName: string): boolean {
    const normalizedConditionId = this.normalizeRuleToken(conditionId);
    return normalizedConditionId === normalizedConditionName || normalizedConditionId === `condition.${normalizedConditionName}`;
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

  private createAttackNarration(result: { hit: boolean; criticalHit: boolean; criticalMiss: boolean }): string {
    if (result.criticalHit) {
      return "공격이 치명타로 명중했습니다.";
    }
    if (result.criticalMiss) {
      return "공격이 대실패했습니다.";
    }
    return result.hit ? "공격이 명중했습니다." : "공격이 빗나갔습니다.";
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
