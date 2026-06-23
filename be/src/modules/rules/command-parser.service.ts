import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/exceptions/domain-error";

export type ParsedCommand =
  | { type: "roll"; expression: string }
  | { type: "check"; checkName: string; dc: number }
  | {
      type: "save";
      target: string;
      ability: "str" | "dex" | "con" | "int" | "wis" | "cha";
      dc: number;
      condition: string | null;
    }
  | { type: "attack"; target: string | null; dc: number }
  | {
      type: "ready";
      trigger: {
        type:
          | "creature_enters_range"
          | "creature_leaves_range"
          | "ally_attacked"
          | "enemy_casts_spell"
          | "turn_start"
          | "turn_end"
          | "manual";
        targetParticipantId?: string | null;
        rangeFt?: number | null;
        tags?: string[];
      };
      heldAction: {
        type: "attack" | "cast_spell" | "move" | "interact" | "custom";
        spellId?: string | null;
        targetParticipantId?: string | null;
        targetPoint?: { x: number; y: number } | null;
        path?: Array<{ x: number; y: number }> | null;
        description?: string | null;
      };
    }
  | {
      type: "cast_spell";
      spellId: string;
      target: string;
      targetDistanceFt: number;
      slotLevel: number | null;
    }
  | {
      type: "cast_area_spell";
      spellId: string;
      saveDc: number;
      targetIds: string[];
      slotLevel: number | null;
    }
  | { type: "use_class_feature"; featureId: string; option: string | null }
  | { type: "rest"; restType: "short" | "long"; hitDiceToSpend?: number }
  | {
      type: "inventory";
      operation: "add" | "remove";
      itemId: string;
      quantity: number;
      containerEntryId?: string | null;
    }
  | {
      type: "item_interaction";
      operation: "drop" | "throw";
      itemId: string;
      quantity: number;
      point: { x: number; y: number };
    }
  | {
      type: "item_interaction";
      operation: "pickup";
      objectId: string;
      itemDefinitionId: string;
      quantity: number;
      point: { x: number; y: number };
    }
  | { type: "damage"; target: string; amount: number; damageType?: string }
  | { type: "heal"; target: string; amount: number }
  | { type: "condition"; operation: "add" | "remove"; target: string; condition: string }
  | { type: "unknown"; command: string };

@Injectable()
export class CommandParserService {
  parse(rawText: string): ParsedCommand {
    const trimmed = rawText.trim();
    if (!trimmed.startsWith("/")) {
      return { type: "unknown", command: "" };
    }

    const [commandToken, ...args] = trimmed.slice(1).split(/\s+/);
    const command = commandToken.toLowerCase();

    switch (command) {
      case "roll":
        return this.parseRoll(args);
      case "check":
        return this.parseCheck(args);
      case "save":
        return this.parseSave(args);
      case "attack":
        return this.parseAttack(args);
      case "ready":
        return this.parseReady(args);
      case "cast":
        return this.parseCastSpell(args);
      case "cast_area":
      case "castarea":
        return this.parseCastAreaSpell(args);
      case "feature":
        return this.parseClassFeature(args);
      case "rest":
        return this.parseRest(args);
      case "item":
      case "inventory":
        return this.parseInventory(args);
      case "damage":
        return this.parseAmountCommand("damage", args);
      case "heal":
        return this.parseAmountCommand("heal", args);
      case "condition":
        return this.parseCondition(args);
      default:
        return { type: "unknown", command };
    }
  }

  private parseRoll(args: string[]): ParsedCommand {
    const expression = args[0];
    if (!expression) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "ROLL_EXPRESSION_REQUIRED",
      });
    }

    return { type: "roll", expression };
  }

  private parseCheck(args: string[]): ParsedCommand {
    const checkName = args[0];
    if (!checkName) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "CHECK_NAME_REQUIRED",
      });
    }

    return {
      type: "check",
      checkName,
      dc: this.parseDc(args[1], 10),
    };
  }

  private parseAttack(args: string[]): ParsedCommand {
    return {
      type: "attack",
      target: args[0] ?? null,
      dc: this.parseDc(args[1], 10),
    };
  }

  private parseSave(args: string[]): ParsedCommand {
    const target = args[0];
    const ability = args[1]?.toLowerCase();
    const dc = this.parseDc(args[2], 0);
    if (!target || !this.isSavingThrowAbility(ability) || dc < 1) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "SAVE_TARGET_ABILITY_AND_DC_REQUIRED",
      });
    }

    return {
      type: "save",
      target,
      ability,
      dc,
      condition: args[3] ?? null,
    };
  }

  private parseReady(args: string[]): ParsedCommand {
    const triggerToken = args[0];
    const heldActionToken = args[1];
    if (!triggerToken || !heldActionToken) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "READY_TRIGGER_AND_ACTION_REQUIRED",
      });
    }

    const heldActionType = this.normalizeReadyHeldActionType(heldActionToken);
    const rangeFt = this.parseTrailingRange(args);
    const targetToken =
      heldActionType !== "move" && args[2] && Number.isNaN(Number(args[2]))
        ? args[2]
        : null;

    return {
      type: "ready",
      trigger: {
        type: this.normalizeReadyTriggerType(triggerToken),
        targetParticipantId: targetToken,
        rangeFt,
        tags: targetToken ? ["targeted"] : [],
      },
      heldAction: this.buildReadyHeldAction(heldActionType, args.slice(2)),
    };
  }

  private parseCastSpell(args: string[]): ParsedCommand {
    const spellToken = args[0];
    const spellId = spellToken ? this.normalizeSpellId(spellToken) : null;
    const selfTargeted = spellId === "spell.detect_magic";
    const target = args[1] ?? (selfTargeted ? "self" : null);

    if (!spellId || !target) {
      throw badRequest("ACTION_400", "잘못된 명령입니다.", {
        reason: "CAST_SPELL_AND_TARGET_REQUIRED",
      });
    }

    return {
      type: "cast_spell",
      spellId,
      target,
      targetDistanceFt: this.parseOptionalPositiveInteger(
        args[2],
        selfTargeted ? 0 : 90,
        "INVALID_TARGET_DISTANCE",
      ),
      slotLevel: args[3]
        ? this.parseOptionalPositiveInteger(args[3], 0, "INVALID_SPELL_SLOT_LEVEL")
        : null,
    };
  }

  private parseCastAreaSpell(args: string[]): ParsedCommand {
    const spellToken = args[0];
    const saveDcToken = args[1];
    const targetToken = args[2];

    if (!spellToken || !saveDcToken || !targetToken) {
      throw badRequest("ACTION_400", "잘못된 명령입니다.", {
        reason: "CAST_AREA_SPELL_DC_AND_TARGETS_REQUIRED",
      });
    }

    const targetIds = targetToken
      .split(",")
      .map((targetId) => targetId.trim())
      .filter(Boolean);
    if (targetIds.length === 0) {
      throw badRequest("ACTION_400", "잘못된 명령입니다.", {
        reason: "CAST_AREA_TARGETS_REQUIRED",
      });
    }

    const saveDc = this.parseOptionalPositiveInteger(saveDcToken, 0, "INVALID_SPELL_SAVE_DC");
    if (saveDc < 1) {
      throw badRequest("ACTION_400", "잘못된 명령입니다.", {
        reason: "INVALID_SPELL_SAVE_DC",
      });
    }

    return {
      type: "cast_area_spell",
      spellId: this.normalizeSpellId(spellToken),
      saveDc,
      targetIds,
      slotLevel: args[3]
        ? this.parseOptionalPositiveInteger(args[3], 0, "INVALID_SPELL_SLOT_LEVEL")
        : null,
    };
  }

  private parseClassFeature(args: string[]): ParsedCommand {
    const featureToken = args[0];
    if (!featureToken) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "CLASS_FEATURE_REQUIRED",
      });
    }

    return {
      type: "use_class_feature",
      featureId: this.normalizeClassFeatureId(featureToken),
      option: args.slice(1).join(" ").trim() || null,
    };
  }

  private parseRest(args: string[]): ParsedCommand {
    const restType = args[0]?.toLowerCase().replace(/-/g, "_");
    if (restType === "short" || restType === "short_rest") {
      const hitDiceToSpend = this.parseOptionalPositiveInteger(
        args[1],
        0,
        "INVALID_HIT_DICE_TO_SPEND",
      );
      return hitDiceToSpend > 0
        ? { type: "rest", restType: "short", hitDiceToSpend }
        : { type: "rest", restType: "short" };
    }

    if (restType === "long" || restType === "long_rest") {
      return { type: "rest", restType: "long" };
    }

    throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
      reason: "INVALID_REST_TYPE",
    });
  }

  private parseInventory(args: string[]): ParsedCommand {
    const operationToken = args[0]?.toLowerCase();
    const itemId = args[1];

    if (operationToken === "drop" || operationToken === "throw" || operationToken === "pickup") {
      return this.parseItemInteraction(operationToken, args);
    }

    if (!["add", "gain", "remove", "lose"].includes(operationToken ?? "") || !itemId) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "INVENTORY_OPERATION_AND_ITEM_REQUIRED",
      });
    }

    return {
      type: "inventory",
      operation: operationToken === "add" || operationToken === "gain" ? "add" : "remove",
      itemId,
      quantity: this.parseOptionalPositiveInteger(
        args[2],
        1,
        "INVALID_INVENTORY_QUANTITY",
      ),
      containerEntryId: args[3] ?? null,
    };
  }

  private parseItemInteraction(
    operation: "drop" | "throw" | "pickup",
    args: string[],
  ): ParsedCommand {
    if (operation === "pickup") {
      const objectId = args[1];
      const itemDefinitionId = args[2];
      const quantity = this.parseOptionalPositiveInteger(args[3], 1, "INVALID_ITEM_QUANTITY");
      const x = Number(args[4]);
      const y = Number(args[5]);
      if (!objectId || !itemDefinitionId || !Number.isInteger(x) || !Number.isInteger(y)) {
        throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
          reason: "ITEM_PICKUP_OBJECT_ITEM_QUANTITY_AND_POINT_REQUIRED",
        });
      }

      return {
        type: "item_interaction",
        operation,
        objectId,
        itemDefinitionId,
        quantity,
        point: { x, y },
      };
    }

    const itemId = args[1];
    const quantity = this.parseOptionalPositiveInteger(args[2], 1, "INVALID_ITEM_QUANTITY");
    const x = Number(args[3]);
    const y = Number(args[4]);
    if (!itemId || !Number.isInteger(x) || !Number.isInteger(y)) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "ITEM_INTERACTION_ITEM_QUANTITY_AND_POINT_REQUIRED",
      });
    }

    return {
      type: "item_interaction",
      operation,
      itemId,
      quantity,
      point: { x, y },
    };
  }

  private parseAmountCommand(type: "damage" | "heal", args: string[]): ParsedCommand {
    const target = args[0];
    const amount = Number(args[1]);

    if (!target || !Number.isInteger(amount) || amount < 1) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: `${type.toUpperCase()}_TARGET_AND_AMOUNT_REQUIRED`,
      });
    }

    if (type === "damage") {
      return {
        type,
        target,
        amount,
        ...(args[2] ? { damageType: args[2] } : {}),
      };
    }

    return { type, target, amount };
  }

  private parseCondition(args: string[]): ParsedCommand {
    const operation = args[0] as "add" | "remove";
    const target = args[1];
    const condition = args[2];

    if (!["add", "remove"].includes(operation) || !target || !condition) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "CONDITION_OPERATION_TARGET_AND_NAME_REQUIRED",
      });
    }

    return { type: "condition", operation, target, condition };
  }

  private parseDc(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }

    const normalized = value.toLowerCase().startsWith("dc=")
      ? value.slice("dc=".length)
      : value;
    const dc = Number(normalized);
    if (!Number.isInteger(dc) || dc < 1) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "INVALID_DC",
      });
    }

    return dc;
  }

  private parseOptionalPositiveInteger(
    value: string | undefined,
    fallback: number,
    reason: string,
  ): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw badRequest("ACTION_400", "잘못된 명령입니다.", { reason });
    }

    return parsed;
  }

  private isSavingThrowAbility(value: string | undefined): value is "str" | "dex" | "con" | "int" | "wis" | "cha" {
    return value === "str" ||
      value === "dex" ||
      value === "con" ||
      value === "int" ||
      value === "wis" ||
      value === "cha";
  }

  private parseTrailingRange(args: string[]): number | null {
    const last = args[args.length - 1];
    if (!last || Number.isNaN(Number(last))) {
      return null;
    }
    return this.parseOptionalPositiveInteger(last, 0, "INVALID_READY_RANGE");
  }

  private normalizeReadyTriggerType(
    value: string,
  ): Extract<ParsedCommand, { type: "ready" }>["trigger"]["type"] {
    const normalized = value.toLowerCase().replace(/-/g, "_");
    const aliases: Record<string, Extract<ParsedCommand, { type: "ready" }>["trigger"]["type"]> = {
      enter: "creature_enters_range",
      enters: "creature_enters_range",
      creature_enters: "creature_enters_range",
      creature_enters_range: "creature_enters_range",
      leave: "creature_leaves_range",
      leaves: "creature_leaves_range",
      creature_leaves: "creature_leaves_range",
      creature_leaves_range: "creature_leaves_range",
      ally_attacked: "ally_attacked",
      ally_hit: "ally_attacked",
      enemy_casts: "enemy_casts_spell",
      enemy_casts_spell: "enemy_casts_spell",
      spell: "enemy_casts_spell",
      start: "turn_start",
      turn_start: "turn_start",
      starts_turn: "turn_start",
      end: "turn_end",
      turn_end: "turn_end",
      ends_turn: "turn_end",
      manual: "manual",
    };
    const triggerType = aliases[normalized];
    if (!triggerType) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "INVALID_READY_TRIGGER",
      });
    }
    return triggerType;
  }

  private normalizeReadyHeldActionType(
    value: string,
  ): "attack" | "cast_spell" | "move" | "interact" | "custom" {
    const normalized = value.toLowerCase().replace(/-/g, "_");
    const aliases: Record<string, "attack" | "cast_spell" | "move" | "interact" | "custom"> = {
      attack: "attack",
      cast: "cast_spell",
      cast_spell: "cast_spell",
      spell: "cast_spell",
      move: "move",
      interact: "interact",
      item: "interact",
      custom: "custom",
    };
    const actionType = aliases[normalized];
    if (!actionType) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "INVALID_READY_HELD_ACTION",
      });
    }
    return actionType;
  }

  private buildReadyHeldAction(
    actionType: "attack" | "cast_spell" | "move" | "interact" | "custom",
    args: string[],
  ): Extract<ParsedCommand, { type: "ready" }>["heldAction"] {
    if (actionType === "cast_spell") {
      const spellToken = args[0];
      if (!spellToken) {
        throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
          reason: "READY_SPELL_REQUIRED",
        });
      }
      return { type: "cast_spell", spellId: this.normalizeSpellId(spellToken) };
    }
    if (actionType === "custom") {
      const description = args.join(" ").trim();
      return { type: "custom", description: description || null };
    }
    if (actionType === "move") {
      return {
        type: "move",
        targetPoint: this.parseReadyMovePoint(args),
      };
    }
    return {
      type: actionType,
      targetParticipantId: args[0] && Number.isNaN(Number(args[0])) ? args[0] : null,
    };
  }

  private parseReadyMovePoint(args: string[]): { x: number; y: number } {
    const xToken = args.find((arg) => arg.toLowerCase().startsWith("x="));
    const yToken = args.find((arg) => arg.toLowerCase().startsWith("y="));
    const x = this.parseReadyCoordinate(xToken?.slice(2), "READY_MOVE_X_REQUIRED");
    const y = this.parseReadyCoordinate(yToken?.slice(2), "READY_MOVE_Y_REQUIRED");
    return { x, y };
  }

  private parseReadyCoordinate(value: string | undefined, reason: string): number {
    if (!value) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", { reason });
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", { reason });
    }
    return parsed;
  }

  private normalizeSpellId(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/-/g, "_");
    if (normalized === "chill_touch" || normalized === "chilltouch") {
      return "spell.chill_touch";
    }

    return normalized.startsWith("spell.") ? normalized : `spell.${normalized}`;
  }

  private normalizeClassFeatureId(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/-/g, "_");
    const featureIds: Record<string, string> = {
      second_wind: "class.fighter.feature.second_wind",
      secondwind: "class.fighter.feature.second_wind",
      action_surge: "class.fighter.feature.action_surge",
      actionsurge: "class.fighter.feature.action_surge",
      fighting_style: "class.fighter.feature.fighting_style",
      fightingstyle: "class.fighter.feature.fighting_style",
      style: "class.fighter.feature.fighting_style",
      rage: "class.barbarian.feature.rage",
      sneak_attack: "class.rogue.feature.sneak_attack",
      sneakattack: "class.rogue.feature.sneak_attack",
      expertise: "class.rogue.feature.expertise",
      favored_enemy: "class.ranger.feature.favored_enemy",
      favoredenemy: "class.ranger.feature.favored_enemy",
      cunning_action: "class.rogue.feature.cunning_action",
      cunningaction: "class.rogue.feature.cunning_action",
      frenzy: "class.barbarian.subclass_feature.frenzy",
      divine_sense: "class.paladin.feature.divine_sense",
      divinesense: "class.paladin.feature.divine_sense",
      lay_on_hands: "class.paladin.feature.lay_on_hands",
      layonhands: "class.paladin.feature.lay_on_hands",
      primeval_awareness: "class.ranger.feature.primeval_awareness",
      primevalawareness: "class.ranger.feature.primeval_awareness",
      ki: "class.monk.feature.ki",
      channel_divinity: "class.cleric.feature.channel_divinity",
      channeldivinity: "class.cleric.feature.channel_divinity",
      bardic_inspiration: "class.bard.feature.bardic_inspiration",
      bardicinspiration: "class.bard.feature.bardic_inspiration",
      font_of_magic: "class.sorcerer.feature.font_of_magic",
      fontofmagic: "class.sorcerer.feature.font_of_magic",
      wild_shape: "class.druid.feature.wild_shape",
      wildshape: "class.druid.feature.wild_shape",
      stillness_of_mind: "class.monk.feature.stillness_of_mind",
      stillnessofmind: "class.monk.feature.stillness_of_mind",
      wholeness_of_body: "subclass.monk.open_hand.feature.wholeness_of_body",
      wholenessofbody: "subclass.monk.open_hand.feature.wholeness_of_body",
      countercharm: "class.bard.feature.countercharm",
      dark_ones_own_luck: "subclass.warlock.fiend.feature.dark_ones_own_luck",
      darkonesownluck: "subclass.warlock.fiend.feature.dark_ones_own_luck",
      breath_weapon: "race.dragonborn.trait.base_traits",
      breathweapon: "race.dragonborn.trait.base_traits",
      dragon_breath: "race.dragonborn.trait.base_traits",
      dragonbreath: "race.dragonborn.trait.base_traits",
    };

    return featureIds[normalized] ?? normalized;
  }
}
