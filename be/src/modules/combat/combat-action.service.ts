import { Injectable } from "@nestjs/common";
import { CombatEntityType as PrismaCombatEntityType, GmMode as PrismaGmMode } from "@prisma/client";
import {
  ActionOutcome,
  ApplyCombatDamageDto,
  CastCombatSpellDto,
  CombatActorActionDto,
  CombatActionResultDto,
  CombatBasicActionDto,
  DiceAdvantageState,
  DiceRollResponseDto,
  EquippedWeaponAttackDto,
  ResolveCombatAttackDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import { conflict, notFound, unprocessable } from "../../common/exceptions/domain-error";
import type { ConditionInstance } from "../rules/condition-runtime.service";
import type { SpellScalingResult } from "../rules/spell-scaling.service";
import type { SessionsService } from "../sessions/sessions.service";
import type { CombatService } from "./combat.service";
import type { CombatConcentrationCheckResult } from "./combat-terrain.types";

type CombatActionRuntime = ReturnType<CombatService["createCombatActionRuntime"]>;
type CombatWithParticipants = Awaited<ReturnType<CombatActionRuntime["getActiveCombatEntity"]>>;
type CombatParticipantEntity = NonNullable<CombatWithParticipants>["participants"][number];

const COMBAT_CONDITION_HIDDEN = "combat:hidden";
const COMBAT_CONDITION_DODGE = "combat:dodge";
const COMBAT_CONDITION_SLEEP = "combat:sleep";
const COMBAT_CONDITION_UNCONSCIOUS = "condition:unconscious";
const COMBAT_HIDE_DC = 12;
const DEFAULT_MELEE_ATTACK_DISTANCE_FT = 5;
const SECOND_WIND_EXPENDED_TAG = "resource:second_wind_expended";

@Injectable()
export class CombatActionService {
  async applyDamage(runtime: CombatActionRuntime, userId: string, sessionId: string, dto: ApplyCombatDamageDto): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    await runtime.ensureHost(userId, session.id);

    const combat = await runtime.getActiveCombatEntity(session.id);
    const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantId);
    const amount = Math.max(0, Math.floor(dto.amount));
    const healing = dto.healing === true;

    let concentrationCheck: CombatConcentrationCheckResult | null = null;
    if (healing) {
      await runtime.applyHitPointDelta(combat, target, amount);
    } else {
      concentrationCheck = (await runtime.finalizeCombatDamage(combat, target, amount)).concentrationCheck;
    }
    const updated = await runtime.getActiveCombatEntity(session.id);
    const response = await runtime.completeCombatIfResolved(session.id, updated);
    if (concentrationCheck) {
      runtime.realtimeEvents.emitDiceRolled(session.id, concentrationCheck.diceResult);
    }
    runtime.realtimeEvents.emitCombatUpdated(session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(session.id, await runtime.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message: `${target.nameSnapshot} ${healing ? "회복" : "피해"} ${amount}`,
      attackTotal: null,
      damageTotal: amount,
    };
  }

  async castSpell(runtime: CombatActionRuntime, userId: string, sessionId: string, dto: CastCombatSpellDto): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const { sessionScenario } = await runtime.sessionsService.getGameStateEntityOrThrow(session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const caster = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    if (!caster) {
      throw conflict("COMBAT_409", "현재 턴 전투 참여자를 찾을 수 없습니다.", {
        reason: "CURRENT_COMBATANT_NOT_FOUND",
      });
    }
    if (!caster.sessionCharacterId) {
      throw conflict("COMBAT_409", "몬스터 주문 시전은 아직 지원하지 않습니다.", { reason: "MONSTER_SPELL_UNSUPPORTED" });
    }
    if (runtime.combatConditions.isCombatParticipantIncapacitated(caster)) {
      throw conflict("COMBAT_409", "행동할 수 없는 상태입니다.", {
        reason: "COMBATANT_INCAPACITATED",
        conditions: runtime.parseConditions(caster.conditionsJson ?? "[]"),
      });
    }
    const casterSessionCharacter = await runtime.combatSpells.getSessionCharacterForSpell(caster.sessionCharacterId);
    if (casterSessionCharacter.userId !== userId && casterSessionCharacter.character.ownerUserId !== userId) {
      await runtime.ensureHost(userId, session.id);
    }
    const spellId = runtime.combatSpells.normalizeSpellId(dto.spellId);
    const spellDefinition = runtime.combatSpells.resolveCombatSpellDefinition(spellId);
    runtime.combatSpells.assertMvpSpellKnown(casterSessionCharacter, spellId);

    const map = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(session), session.id);
    const casterToken = runtime.combatTargeting.findParticipantToken(map, caster);
    if (!casterToken) {
      throw conflict("COMBAT_409", "시전자 토큰을 찾을 수 없습니다.", {
        reason: "CASTER_TOKEN_NOT_FOUND",
      });
    }

    if (spellId === "spell.fire_bolt" || spellId === "spell.chill_touch" || spellId === "spell.ray_of_frost") {
      runtime.combatSpells.resolveCombatSpellSlotLevel(spellId, dto.slotLevel);
      const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantIds?.[0] ?? "");
      runtime.combatTargeting.assertSpellTargetInRange(map, casterToken, target, runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 120));
      const spellAttackBonus = runtime.combatSpells.resolveSpellAttackBonusForCharacter(casterSessionCharacter);
      return runtime.resolveAttack(
        userId,
        session.id,
        {
          attackerParticipantId: caster.id,
          targetParticipantId: target.id,
          attackBonus: spellAttackBonus,
          damageDice: runtime.combatSpells.resolveCantripDamageDice(
            runtime.combatSpells.resolveCombatSpellBaseDamageDice(spellDefinition) ?? "1d10",
            runtime.combatSpells.resolveCharacterLevelForCharacter(casterSessionCharacter),
          ),
          damageBonus: 0,
        },
        {
          messagePrefix: spellId === "spell.chill_touch" ? "Chill Touch" : spellId === "spell.ray_of_frost" ? "Ray of Frost" : "Fire Bolt",
          ...(spellId === "spell.ray_of_frost"
            ? {
                onHitCondition: runtime.conditionRuntime.createCondition({
                  conditionId: "condition.spell.ray_of_frost",
                  sourceId: spellId,
                  duration: { type: "rounds", remaining: 1 },
                  stackPolicy: "replace",
                  appliedAtRound: combat.roundNo,
                  tags: ["movement_speed_penalty:10"],
                }),
              }
            : {}),
        },
      );
    }

    const slotLevel = runtime.combatSpells.resolveCombatSpellSlotLevel(spellId, dto.slotLevel);
    const spellSlotMaximum = slotLevel > 0 ? runtime.combatSpells.resolveSpellSlotMaximumForCharacter(casterSessionCharacter, slotLevel) : 0;
    let message = "";
    let attackTotal: number | null = null;
    let damageTotal: number | null = null;
    let responseMap: VttMapStateDto | null = null;
    let spellScaling: SpellScalingResult | null = null;
    const diceResults: DiceRollResponseDto[] = [];
    const concentrationChecks: Array<CombatConcentrationCheckResult & { targetParticipantId: string }> = [];

    if (spellId === "spell.magic_missile") {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const targets = (dto.targetParticipantIds?.length ? dto.targetParticipantIds : [dto.targetParticipantIds?.[0]])
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .slice(0, spellScaling.targetCount ?? 3)
        .map((id) => runtime.findCombatParticipantOrThrow(combat, id));
      if (!targets.length) {
        throw conflict("COMBAT_409", "Magic Missile 대상이 필요합니다.", {
          reason: "SPELL_TARGET_REQUIRED",
        });
      }
      targets.forEach((target) =>
        runtime.combatTargeting.assertSpellTargetInRange(map, casterToken, target, runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 120)),
      );
      targets.forEach((target) => runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target));
      await runtime.combatSpells.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      const missileDamageDice = runtime.combatSpells.resolveMagicMissileDamageDice(spellDefinition, spellScaling.targetCount ?? 3);
      const applied: string[] = [];
      for (let index = 0; index < (spellScaling.targetCount ?? 3); index += 1) {
        const target = targets[Math.min(index, targets.length - 1)];
        const roll = runtime.diceService.roll(missileDamageDice);
        diceResults.push(roll);
        const { concentrationCheck } = await runtime.finalizeCombatDamage(combat, target, roll.total);
        if (concentrationCheck) {
          concentrationChecks.push({
            targetParticipantId: target.id,
            ...concentrationCheck,
          });
        }
        applied.push(`${target.nameSnapshot} ${roll.total}`);
        damageTotal = (damageTotal ?? 0) + roll.total;
      }
      message = `Magic Missile: ${applied.join(", ")} 역장 피해`;
    } else if (spellId === "spell.cure_wounds") {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantIds?.[0] ?? "");
      runtime.combatTargeting.assertSpellTargetInRange(map, casterToken, target, runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 5));
      runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      await runtime.combatSpells.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      const healingModifier = runtime.combatSpells.resolveSpellcastingAbilityModifierForCharacter(casterSessionCharacter);
      const healingBaseDice = spellScaling.damageDice ?? runtime.combatSpells.resolveCombatSpellBaseDamageDice(spellDefinition) ?? "1d8";
      const healingDice = `${healingBaseDice}${healingModifier >= 0 ? "+" : ""}${healingModifier}`;
      const healingRoll = runtime.diceService.roll(healingDice);
      diceResults.push(healingRoll);
      await runtime.applyHitPointDelta(combat, target, healingRoll.total);
      damageTotal = healingRoll.total;
      message = `Cure Wounds: ${target.nameSnapshot} ${healingRoll.total} 회복`;
    } else if (spellId === "spell.sleep") {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const point = dto.point ?? runtime.combatTargeting.requireTargetPoint(map, casterToken);
      runtime.combatTargeting.assertPointInRange(map, casterToken, point, runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 90));
      await runtime.combatSpells.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      const poolRoll = runtime.diceService.roll(spellScaling.damageDice ?? "5d8");
      diceResults.push(poolRoll);
      let remaining = poolRoll.total;
      const targets = combat.participants
        .filter((participant) => participant.isAlive && participant.id !== caster.id && (participant.currentHp ?? 0) > 0)
        .filter((participant) => {
          const token = runtime.combatTargeting.findParticipantToken(map, participant);
          return token
            ? runtime.combatTargeting.getGridPointDistanceFt(map, point, token) <= 20 &&
                runtime.combatCover.resolveAoeCover(map, point, token, false).targetable
            : false;
        })
        .sort((left, right) => (left.currentHp ?? 0) - (right.currentHp ?? 0));
      const slept: string[] = [];
      for (const target of targets) {
        const hp = target.currentHp ?? 0;
        if (hp <= 0 || hp > remaining) continue;
        remaining -= hp;
        await runtime.combatConditions.addCombatConditionInstance(
          target,
          runtime.conditionRuntime.createCondition({
            conditionId: COMBAT_CONDITION_SLEEP,
            sourceId: spellId,
            duration: { type: "rounds", remaining: 10 },
            stackPolicy: "replace",
            appliedAtRound: combat.roundNo,
            tags: [COMBAT_CONDITION_UNCONSCIOUS, "condition:incapacitated"],
          }),
        );
        slept.push(target.nameSnapshot);
      }
      damageTotal = poolRoll.total;
      message = slept.length ? `Sleep: ${poolRoll.total} HP 분량으로 ${slept.join(", ")} 수면` : `Sleep: ${poolRoll.total} HP 분량, 잠든 대상 없음`;
    } else if (spellId === "spell.fireball") {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const areaTargeting = runtime.combatSpells.resolveCombatAreaTargeting(spellDefinition, spellId);
      const saveAbility = runtime.combatSpells.resolveCombatSpellSaveAbility(spellDefinition, "dex");
      const damageType = runtime.combatSpells.resolveCombatSpellDamageType(spellDefinition, "fire");
      const point = dto.point ?? runtime.combatTargeting.requireTargetPoint(map, casterToken);
      runtime.combatTargeting.assertPointInRange(map, casterToken, point, runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 150));
      const targetTokenIds = runtime.aoeTargeting.resolveTargets({
        shape: areaTargeting.shape,
        origin: runtime.combatCover.toAoeGridCell(runtime.combatMovement.mapPointToGridPoint(map, point)),
        sizeFt: areaTargeting.sizeFt,
        grid: {
          columns: Math.ceil(map.width / map.gridSize),
          rows: Math.ceil(map.height / map.gridSize),
        },
        tokens: map.tokens.map((token) => ({
          id: token.id,
          ...runtime.combatCover.toAoeGridCell(runtime.combatCover.toCoverGridPoint(map, token)),
          hidden: token.hidden,
        })),
      }).tokenIds;
      const possibleTargets = combat.participants.filter(
        (participant) => participant.id !== caster.id && participant.tokenId && targetTokenIds.includes(participant.tokenId),
      );
      const targetsWithCover = possibleTargets
        .map((target) => ({
          target,
          cover: runtime.combatCover.resolveAoeCover(map, point, runtime.combatTargeting.findParticipantToken(map, target), saveAbility === "dex"),
        }))
        .filter(({ cover }) => cover.targetable);
      const targets = targetsWithCover.map(({ target }) => target);
      if (!targets.length) {
        throw conflict("COMBAT_409", "Fireball 범위 안에 대상이 없습니다.", {
          reason: "SPELL_TARGET_REQUIRED",
        });
      }
      const saveDc = runtime.combatSpells.resolveCombatSpellSaveDcForCharacter(casterSessionCharacter);
      const aoeTargets = await Promise.all(targetsWithCover.map(({ target, cover }) => runtime.toCombatAoeDamageTarget(target, map, saveAbility, cover)));
      await runtime.combatSpells.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      const aoeResolution = runtime.aoeDamage.resolveDamage({
        sourceId: spellId,
        damageDice: spellScaling.damageDice ?? runtime.combatSpells.resolveCombatSpellBaseDamageDice(spellDefinition ?? null) ?? "8d6",
        damageType,
        save: {
          ability: saveAbility,
          dc: saveDc,
          halfDamageOnSuccess: runtime.combatSpells.resolveCombatSpellHalfDamageOnSuccess(spellDefinition),
        },
        targets: aoeTargets,
      });
      diceResults.push(aoeResolution.damageRoll, ...aoeResolution.targetResults.map((target) => target.saveRoll));
      const applied: string[] = [];
      for (const targetResult of aoeResolution.targetResults) {
        const target = targets.find((candidate) => candidate.id === targetResult.targetId);
        if (!target) {
          continue;
        }
        const { concentrationCheck } = await runtime.finalizeCombatDamage(combat, target, targetResult.finalDamage);
        if (concentrationCheck) {
          concentrationChecks.push({
            targetParticipantId: target.id,
            ...concentrationCheck,
          });
        }
        applied.push(`${target.nameSnapshot} ${targetResult.finalDamage}`);
        damageTotal = (damageTotal ?? 0) + targetResult.finalDamage;
      }
      message = `Fireball: ${applied.join(", ")} 화염 피해`;
    } else if (spellId === "spell.light") {
      const point = dto.point ?? runtime.combatTargeting.requireTargetPoint(map, casterToken);
      runtime.combatTargeting.assertPointInRange(map, casterToken, point, runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 5));
      runtime.combatTargeting.assertLightPointAllowed(map, point);
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      const lightSource = {
        id: `light:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        x: runtime.clampNumber(Math.floor(point.x), 0, Math.max(0, map.width - map.gridSize)),
        y: runtime.clampNumber(Math.floor(point.y), 0, Math.max(0, map.height - map.gridSize)),
        rangeFt: runtime.combatSpells.resolveCombatLightRadiusFt(spellDefinition),
        label: "Light",
        createdBySessionCharacterId: caster.sessionCharacterId,
      };
      responseMap = await runtime.mapRuntimeService.saveSystemVttMap(session.id, {
        ...map,
        lightSources: [...(map.lightSources ?? []), lightSource].slice(-40),
        updatedAt: new Date().toISOString(),
      });
      message = `Light: 선택한 타일 기준 ${lightSource.rangeFt}ft 파티 시야를 제공합니다.`;
    } else {
      throw conflict("COMBAT_409", "지원하지 않는 주문입니다.", {
        reason: "UNSUPPORTED_SPELL",
        spellId,
      });
    }

    const updated = await runtime.getActiveCombatEntity(session.id);
    const response = await runtime.completeCombatIfResolved(session.id, updated);
    const turnLogDiceResult =
      (spellId === "spell.cure_wounds" || spellId === "spell.sleep" || spellId === "spell.fireball") && diceResults[0] ? { ...diceResults[0] } : null;
    const turnLog = await runtime.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: caster.sessionCharacterId,
      rawInput: null,
      structuredAction: {
        type: "spell_cast",
        spellId,
        baseSpellLevel: runtime.combatSpells.resolveCombatBaseSpellLevel(spellId),
        slotLevel,
        spellScaling,
        targetParticipantIds: dto.targetParticipantIds ?? [],
        point: dto.point ?? null,
        aoe:
          spellId === "spell.fireball"
            ? {
                shape: runtime.combatSpells.resolveCombatAreaTargeting(spellDefinition, spellId).shape,
                sizeFt: runtime.combatSpells.resolveCombatAreaTargeting(spellDefinition, spellId).sizeFt,
                saveAbility: runtime.combatSpells.resolveCombatSpellSaveAbility(spellDefinition, "dex"),
                damageType: runtime.combatSpells.resolveCombatSpellDamageType(spellDefinition, "fire"),
              }
            : null,
        concentrationChecks: concentrationChecks.map((check) => ({
          targetParticipantId: check.targetParticipantId,
          concentrationMaintained: check.concentrationMaintained,
          removedConditions: check.removedConditions,
          concentrationState: check.concentrationState,
        })),
      },
      diceResult: turnLogDiceResult,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    diceResults.forEach((roll) => runtime.realtimeEvents.emitDiceRolled(session.id, roll));
    concentrationChecks.forEach((check) => runtime.realtimeEvents.emitDiceRolled(session.id, check.diceResult));
    runtime.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(session.id, await runtime.sessionsService.buildSnapshot(session.id));
    return {
      combat: response,
      message,
      attackTotal,
      damageTotal,
      turnLogId: turnLog.turnLogId,
      map: responseMap,
    };
  }

  async resolveAttack(
    runtime: CombatActionRuntime,
    userId: string,
    sessionId: string,
    dto: ResolveCombatAttackDto,
    options: {
      messagePrefix?: string;
      fixedDamageTotal?: number;
      actionCost?: "action" | "bonus_action" | "reaction" | "none";
      attackAction?: { weaponId?: string | null; weaponIsLightMelee: boolean };
      reactionUserId?: string;
      forceDisadvantage?: boolean;
      sneakAttack?: {
        rogueLevel: number;
        weaponProperties: string[];
        attackKind: "melee_weapon_attack" | "ranged_weapon_attack";
      };
      onHitCondition?: ConditionInstance;
    } = {},
  ): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const { sessionScenario } = await runtime.sessionsService.getGameStateEntityOrThrow(session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const attacker = runtime.findCombatParticipantOrThrow(combat, dto.attackerParticipantId);
    const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantId);

    if (options.reactionUserId) {
      await runtime.ensureReactionActorCanAct(options.reactionUserId, session.id, attacker);
    } else if (session.gmMode === PrismaGmMode.HUMAN) {
      await runtime.ensureActorCanAct(userId, session.id, combat, attacker);
    }
    if (!options.reactionUserId && options.actionCost !== "reaction" && combat.currentParticipantId !== attacker.id) {
      throw conflict("COMBAT_409", "현재 턴의 전투 참여자만 공격할 수 있습니다.", {
        reason: "NOT_CURRENT_COMBATANT",
        currentParticipantId: combat.currentParticipantId,
        attackerParticipantId: attacker.id,
      });
    }

    if (!attacker.isAlive || !target.isAlive) {
      throw conflict("COMBAT_409", "행동할 수 없는 전투 참여자입니다.", {
        reason: "COMBATANT_DEFEATED",
      });
    }

    const attackerConditions = runtime.parseConditions(attacker.conditionsJson ?? "[]");
    const targetConditions = runtime.parseConditions(target.conditionsJson ?? "[]");
    const vttMap = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(session), session.id);
    const targetHeavilyObscured = runtime.isParticipantInHeavilyObscuredTerrain(vttMap, target);
    const attackAdvantageState = runtime.resolveAttackAdvantageState({
      attackerConditions,
      targetConditions,
      targetHeavilyObscured,
      allyWithin5FtOfTarget: runtime.hasAllyWithinFeetOfTarget(vttMap, combat, attacker, target, DEFAULT_MELEE_ATTACK_DISTANCE_FT),
      forceDisadvantage: options.forceDisadvantage === true,
    });
    const attackBonus = Math.floor(dto.attackBonus ?? 0);
    const baseTargetArmorClass = runtime.resolveParticipantArmorClass(target);
    const coverResolution = runtime.combatCover.resolveAttackCover(
      vttMap,
      runtime.combatTargeting.findParticipantToken(vttMap, attacker),
      runtime.combatTargeting.findParticipantToken(vttMap, target),
    );
    const coverRuleResult = runtime.ruleEngine.resolveCoverModifiers({
      coverLevel: coverResolution.coverLevel,
      appliesToAttackRoll: true,
      appliesToDexteritySave: false,
    });
    if (!coverRuleResult.produced.targetable) {
      throw conflict("COMBAT_409", "완전 엄폐 대상은 공격할 수 없습니다.", {
        reason: "TARGET_HAS_FULL_COVER",
        coverLevel: coverRuleResult.produced.coverLevel,
      });
    }
    const targetArmorClass = baseTargetArmorClass + coverRuleResult.produced.armorClassBonus;

    if (options.actionCost === "reaction") {
      await runtime.actionEconomy.spendReaction({
        combatId: combat.id,
        combatParticipantId: attacker.id,
        roundNo: combat.roundNo,
        turnNo: combat.turnNo,
        sessionCharacterId: attacker.sessionCharacterId,
      });
    } else if (options.actionCost === "bonus_action") {
      await runtime.spendCurrentBonusActionIfNeeded(combat, attacker);
    } else if (options.actionCost === "none") {
      // Multiattack pays the action cost once before resolving child attacks.
    } else {
      await runtime.spendCurrentActionIfNeeded(combat, attacker);
      if (options.attackAction && combat.currentParticipantId === attacker.id) {
        await runtime.actionEconomy.recordAttackAction({
          combatId: combat.id,
          combatParticipantId: attacker.id,
          roundNo: combat.roundNo,
          turnNo: combat.turnNo,
          sessionCharacterId: attacker.sessionCharacterId,
          weaponId: options.attackAction.weaponId,
          weaponIsLightMelee: options.attackAction.weaponIsLightMelee,
        });
      }
    }

    const attackRoll = runtime.diceService.roll(`1d20+${attackBonus}`, attackAdvantageState);
    const naturalD20 = runtime.selectNaturalD20(attackRoll.rolls, attackAdvantageState);
    const criticalHit = naturalD20 === 20;
    const criticalMiss = naturalD20 === 1;
    const hit = criticalHit || (!criticalMiss && attackRoll.total >= targetArmorClass);
    if (hit && !criticalHit && !options.reactionUserId && (await runtime.canPromptShieldReaction(session.id, combat, target))) {
      const pending = await runtime.storePendingShieldReaction({
        sessionId: session.id,
        combat,
        attacker,
        target,
        attackTotal: attackRoll.total,
        targetArmorClass,
        cover: coverRuleResult.produced,
        damageDice: dto.damageDice,
        damageBonus: dto.damageBonus,
      });
      const prompt = {
        id: pending.id,
        type: "shield",
        reactorParticipantId: target.id,
        reactorName: target.nameSnapshot,
        moverParticipantId: attacker.id,
        moverName: attacker.nameSnapshot,
        message: `${target.nameSnapshot}이(가) 공격에 맞았습니다. Shield를 사용해 AC +5를 적용할까요?`,
      } as const;
      runtime.realtimeEvents.emitCombatReactionPrompt(session.id, pending.reactorUserId, prompt);
      return {
        combat: await runtime.mapCombat(combat),
        message: "Shield 반응을 기다리는 중입니다.",
        attackTotal: attackRoll.total,
        damageTotal: null,
        turnLogId: null,
        pendingReaction: prompt,
      };
    }
    const fixedDamageTotal = hit && options.fixedDamageTotal !== undefined ? Math.max(0, Math.floor(options.fixedDamageTotal)) : null;
    const damageRoll =
      hit && fixedDamageTotal === null ? runtime.diceService.roll(runtime.buildDamageExpression(dto.damageDice, dto.damageBonus, criticalHit)) : null;
    const baseDamageTotal = fixedDamageTotal ?? damageRoll?.total ?? null;
    let damageTotal = baseDamageTotal;
    let sneakAttackDamage = 0;
    if (hit && baseDamageTotal !== null && options.sneakAttack) {
      const sneakAttackRoll = runtime.diceService.roll(`${Math.max(Math.ceil(options.sneakAttack.rogueLevel / 2), 1)}d6`);
      const sneakAttackResult = runtime.ruleEngine.applySneakAttack({
        rogueLevel: options.sneakAttack.rogueLevel,
        attackKind: options.sneakAttack.attackKind,
        weaponProperties: options.sneakAttack.weaponProperties,
        hasAdvantage: attackAdvantageState === DiceAdvantageState.ADVANTAGE,
        hasDisadvantage: attackAdvantageState === DiceAdvantageState.DISADVANTAGE,
        sneakAttackAvailableThisTurn: true,
        baseDamage: baseDamageTotal,
        sneakAttackDamageRollTotal: sneakAttackRoll.total,
      });
      if (sneakAttackResult.accepted && sneakAttackResult.produced.damagePacket) {
        sneakAttackDamage = sneakAttackResult.produced.sneakAttackDamage;
        damageTotal = sneakAttackResult.produced.damagePacket.totalDamage;
        runtime.realtimeEvents.emitDiceRolled(session.id, sneakAttackRoll);
      }
    }

    const { concentrationCheck } = await runtime.finalizeCombatDamage(combat, target, damageTotal ?? 0);
    if (hit && options.onHitCondition) {
      await runtime.combatConditions.addCombatConditionInstance(target, options.onHitCondition);
    }
    if (hit && options.sneakAttack) {
      await runtime.actionEconomy.spendSneakAttack({
        combatId: combat.id,
        combatParticipantId: attacker.id,
        roundNo: combat.roundNo,
        turnNo: combat.turnNo,
        sessionCharacterId: attacker.sessionCharacterId,
      });
    }
    if (attackerConditions.includes(COMBAT_CONDITION_HIDDEN)) {
      await runtime.combatConditions.removeCombatCondition(attacker, COMBAT_CONDITION_HIDDEN);
    }

    const updated = await runtime.getActiveCombatEntity(session.id);
    const response = await runtime.completeCombatIfResolved(session.id, updated);
    const baseMessage = hit
      ? `${attacker.nameSnapshot} 공격 명중: ${target.nameSnapshot}에게 ${damageTotal ?? 0} 피해${sneakAttackDamage > 0 ? ` (암습 +${sneakAttackDamage})` : ""}`
      : `${attacker.nameSnapshot} 공격 빗나감: ${attackRoll.total} vs AC ${targetArmorClass}`;
    const message = options.messagePrefix ? `${options.messagePrefix}: ${baseMessage}` : baseMessage;
    const turnLog = await runtime.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: attacker.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "attack",
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        baseTargetArmorClass,
        targetArmorClass,
        cover: coverRuleResult.produced,
        attackTotal: attackRoll.total,
        hit,
        criticalHit,
        criticalMiss,
        advantageState: attackAdvantageState,
        damageTotal,
        appliedCondition: hit && options.onHitCondition ? options.onHitCondition : null,
        concentrationCheck: concentrationCheck
          ? {
              concentrationMaintained: concentrationCheck.concentrationMaintained,
              removedConditions: concentrationCheck.removedConditions,
              concentrationState: concentrationCheck.concentrationState,
            }
          : null,
        ...(options.sneakAttack
          ? {
              sneakAttackApplied: sneakAttackDamage > 0,
              sneakAttackDamage,
            }
          : {}),
      },
      diceResult: { ...attackRoll },
      outcome: hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: message,
    });
    runtime.realtimeEvents.emitDiceRolled(session.id, attackRoll);
    if (concentrationCheck) {
      runtime.realtimeEvents.emitDiceRolled(session.id, concentrationCheck.diceResult);
    }
    runtime.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(session.id, await runtime.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message,
      attackTotal: attackRoll.total,
      damageTotal,
      turnLogId: turnLog.turnLogId,
    };
  }

  async resolveEquippedWeaponAttack(
    runtime: CombatActionRuntime,
    userId: string,
    sessionId: string,
    dto: EquippedWeaponAttackDto,
  ): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const attacker = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    if (!attacker || attacker.isHostile || !attacker.sessionCharacterId) {
      throw conflict("COMBAT_409", "현재 플레이어 캐릭터 턴이 아닙니다.", {
        reason: "CURRENT_TURN_IS_NOT_PLAYER_CHARACTER",
      });
    }
    await runtime.ensureActorCanAct(userId, session.id, combat, attacker);

    const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantId);
    if (!target.isHostile || !target.isAlive) {
      throw conflict("COMBAT_409", "공격할 수 있는 대상이 아닙니다.", {
        reason: "INVALID_ATTACK_TARGET",
      });
    }

    const weapon = await runtime.resolveEquippedWeaponProfile(attacker.sessionCharacterId);
    const map = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(session), session.id);
    const attackerToken = attacker.tokenId
      ? map.tokens.find((token) => token.id === attacker.tokenId && token.hidden !== true)
      : map.tokens.find((token) => token.sessionCharacterId === attacker.sessionCharacterId && token.hidden !== true);
    const targetToken = target.tokenId
      ? map.tokens.find((token) => token.id === target.tokenId && token.hidden !== true)
      : map.tokens.find((token) => token.sessionCharacterId === target.sessionCharacterId && token.hidden !== true);

    if (!attackerToken || !targetToken) {
      throw conflict("COMBAT_409", "공격 거리 판정에 필요한 토큰을 찾을 수 없습니다.", {
        reason: "ATTACK_TOKEN_NOT_FOUND",
      });
    }

    const distanceFt = runtime.combatMovement.getTokenGridDistanceFt(map, attackerToken, targetToken);
    if (distanceFt > weapon.rangeFt) {
      throw conflict("COMBAT_409", "대상이 무기 사거리 밖에 있습니다.", {
        reason: "TARGET_OUT_OF_WEAPON_RANGE",
        distanceFt,
        rangeFt: weapon.rangeFt,
      });
    }

    return runtime.resolveAttack(
      userId,
      session.id,
      {
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        attackBonus: weapon.attackBonus,
        damageDice: weapon.damageDice,
        damageBonus: weapon.damageBonus,
      },
      {
        messagePrefix: weapon.isBasicAttack ? `${attacker.nameSnapshot} 기본 공격 처리` : `${attacker.nameSnapshot} ${weapon.name}`,
        fixedDamageTotal: weapon.fixedDamageTotal,
        attackAction: {
          weaponId: weapon.weaponId,
          weaponIsLightMelee: Boolean(weapon.isLightMeleeWeapon),
        },
      },
    );
  }

  async resolveSneakAttack(runtime: CombatActionRuntime, userId: string, sessionId: string, dto: EquippedWeaponAttackDto): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const attacker = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    if (!attacker || attacker.isHostile || !attacker.sessionCharacterId) {
      throw conflict("COMBAT_409", "현재 플레이어 캐릭터 턴이 아닙니다.", {
        reason: "CURRENT_TURN_IS_NOT_PLAYER_CHARACTER",
      });
    }
    await runtime.ensureActorCanAct(userId, session.id, combat, attacker);

    const sessionCharacter = await runtime.prisma.sessionCharacter.findUnique({
      where: { id: attacker.sessionCharacterId },
      include: { character: true },
    });
    if (!sessionCharacter || !sessionCharacter.character.className.toLowerCase().includes("rogue")) {
      throw conflict("COMBAT_409", "암습은 로그만 사용할 수 있습니다.", {
        reason: "SNEAK_ATTACK_REQUIRES_ROGUE",
      });
    }

    const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantId);
    if (!target.isHostile || !target.isAlive) {
      throw conflict("COMBAT_409", "암습할 수 있는 대상이 아닙니다.", {
        reason: "INVALID_SNEAK_ATTACK_TARGET",
      });
    }

    const turnState = await runtime.actionEconomy.getOrCreateTurnState({
      combatId: combat.id,
      combatParticipantId: attacker.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: attacker.sessionCharacterId,
    });
    if (turnState.actionUsed && !turnState.additionalActionGranted) {
      throw conflict("COMBAT_409", "암습 공격에 사용할 action이 없습니다.", {
        reason: "ACTION_ALREADY_USED",
      });
    }
    if (turnState.sneakAttackUsed) {
      throw conflict("COMBAT_409", "암습은 한 턴에 한 번만 사용할 수 있습니다.", {
        reason: "SNEAK_ATTACK_ALREADY_USED",
      });
    }

    const weapon = await runtime.resolveEquippedWeaponProfile(attacker.sessionCharacterId);
    if (!runtime.isSneakAttackWeaponProfile(weapon)) {
      throw conflict("COMBAT_409", "암습은 finesse 또는 원거리 무기로만 사용할 수 있습니다.", {
        reason: "SNEAK_ATTACK_REQUIRES_FINESSE_OR_RANGED_WEAPON",
      });
    }

    const map = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(session), session.id);
    const attackerToken = runtime.combatTargeting.findParticipantToken(map, attacker);
    const targetToken = runtime.combatTargeting.findParticipantToken(map, target);
    if (!attackerToken || !targetToken) {
      throw conflict("COMBAT_409", "암습 거리 판정에 필요한 토큰을 찾을 수 없습니다.", {
        reason: "ATTACK_TOKEN_NOT_FOUND",
      });
    }

    const distanceFt = runtime.combatMovement.getTokenGridDistanceFt(map, attackerToken, targetToken);
    if (distanceFt > weapon.rangeFt) {
      throw conflict("COMBAT_409", "대상이 무기 사거리 밖에 있습니다.", {
        reason: "TARGET_OUT_OF_WEAPON_RANGE",
        distanceFt,
        rangeFt: weapon.rangeFt,
      });
    }

    const attackAdvantageState = runtime.resolveAttackAdvantageState({
      attackerConditions: runtime.parseConditions(attacker.conditionsJson ?? "[]"),
      targetConditions: runtime.parseConditions(target.conditionsJson ?? "[]"),
      allyWithin5FtOfTarget: runtime.hasAllyWithinFeetOfTarget(map, combat, attacker, target, DEFAULT_MELEE_ATTACK_DISTANCE_FT),
    });
    if (attackAdvantageState !== DiceAdvantageState.ADVANTAGE) {
      throw conflict("COMBAT_409", "암습은 공격에 이점이 있어야 사용할 수 있습니다.", {
        reason: "SNEAK_ATTACK_REQUIRES_ADVANTAGE",
      });
    }

    return runtime.resolveAttack(
      userId,
      session.id,
      {
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        attackBonus: weapon.attackBonus,
        damageDice: weapon.damageDice,
        damageBonus: weapon.damageBonus,
      },
      {
        messagePrefix: `${attacker.nameSnapshot} 암습(${weapon.name})`,
        attackAction: {
          weaponId: weapon.weaponId,
          weaponIsLightMelee: Boolean(weapon.isLightMeleeWeapon),
        },
        sneakAttack: {
          rogueLevel: sessionCharacter.character.level,
          weaponProperties: weapon.properties ?? [],
          attackKind: weapon.attackKind ?? "melee_weapon_attack",
        },
      },
    );
  }

  async resolveOffhandWeaponAttack(
    runtime: CombatActionRuntime,
    userId: string,
    sessionId: string,
    dto: EquippedWeaponAttackDto,
  ): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const attacker = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    if (!attacker || attacker.isHostile || !attacker.sessionCharacterId) {
      throw conflict("COMBAT_409", "현재 플레이어 캐릭터 턴이 아닙니다.", {
        reason: "CURRENT_TURN_IS_NOT_PLAYER_CHARACTER",
      });
    }
    await runtime.ensureActorCanAct(userId, session.id, combat, attacker);

    const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantId);
    if (!target.isHostile || !target.isAlive) {
      throw conflict("COMBAT_409", "공격할 수 있는 대상이 아닙니다.", {
        reason: "INVALID_ATTACK_TARGET",
      });
    }
    const turnState = await runtime.actionEconomy.getOrCreateTurnState({
      combatId: combat.id,
      combatParticipantId: attacker.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: attacker.sessionCharacterId,
    });
    if (turnState.bonusActionUsed) {
      throw conflict("COMBAT_409", "사용 가능한 bonus action이 없습니다.", {
        reason: "BONUS_ACTION_ALREADY_USED",
      });
    }
    if (!turnState.attackActionWeaponIsLightMelee) {
      throw conflict("COMBAT_409", "쌍수 보조 공격은 이번 턴에 Attack action으로 light 근접 무기 공격을 한 뒤에만 할 수 있습니다.", {
        reason: "TWO_WEAPON_ATTACK_ACTION_REQUIRED",
      });
    }

    const weapon = await runtime.resolveEquippedWeaponProfile(attacker.sessionCharacterId, "offhand");
    if (!weapon.isLightMeleeWeapon) {
      throw conflict("COMBAT_409", "쌍수 보조 공격은 light 속성의 근접 무기로만 할 수 있습니다.", {
        reason: "OFFHAND_WEAPON_MUST_BE_LIGHT_MELEE",
      });
    }
    if (turnState.attackActionWeaponId && turnState.attackActionWeaponId === weapon.weaponId && (weapon.quantity ?? 1) < 2) {
      throw conflict("COMBAT_409", "쌍수 보조 공격은 다른 손에 든 다른 무기로 해야 합니다.", {
        reason: "OFFHAND_WEAPON_MUST_BE_DIFFERENT",
      });
    }
    const map = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(session), session.id);
    const attackerToken = attacker.tokenId
      ? map.tokens.find((token) => token.id === attacker.tokenId && token.hidden !== true)
      : map.tokens.find((token) => token.sessionCharacterId === attacker.sessionCharacterId && token.hidden !== true);
    const targetToken = target.tokenId
      ? map.tokens.find((token) => token.id === target.tokenId && token.hidden !== true)
      : map.tokens.find((token) => token.sessionCharacterId === target.sessionCharacterId && token.hidden !== true);

    if (!attackerToken || !targetToken) {
      throw conflict("COMBAT_409", "공격 거리 판정에 필요한 토큰을 찾을 수 없습니다.", {
        reason: "ATTACK_TOKEN_NOT_FOUND",
      });
    }

    const distanceFt = runtime.combatMovement.getTokenGridDistanceFt(map, attackerToken, targetToken);
    if (distanceFt > weapon.rangeFt) {
      throw conflict("COMBAT_409", "대상이 무기 사거리 밖에 있습니다.", {
        reason: "TARGET_OUT_OF_WEAPON_RANGE",
        distanceFt,
        rangeFt: weapon.rangeFt,
      });
    }

    return runtime.resolveAttack(
      userId,
      session.id,
      {
        attackerParticipantId: attacker.id,
        targetParticipantId: target.id,
        attackBonus: weapon.attackBonus,
        damageDice: weapon.damageDice,
        damageBonus: weapon.damageBonus,
      },
      {
        messagePrefix: `${attacker.nameSnapshot} 보조 공격(${weapon.name})`,
        fixedDamageTotal: weapon.fixedDamageTotal,
        actionCost: "bonus_action",
      },
    );
  }

  async useSecondWind(runtime: CombatActionRuntime, userId: string, sessionId: string, _dto: CombatBasicActionDto = {}): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const { sessionScenario } = await runtime.sessionsService.getGameStateEntityOrThrow(session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const actor = runtime.getCurrentPlayerParticipantOrThrow(combat);
    await runtime.ensureActorCanAct(userId, session.id, combat, actor);
    if (!actor.sessionCharacterId) {
      throw conflict("COMBAT_409", "Second Wind를 사용할 캐릭터를 찾을 수 없습니다.", {
        reason: "SESSION_CHARACTER_NOT_FOUND",
      });
    }

    const sessionCharacter = await runtime.prisma.sessionCharacter.findUnique({
      where: { id: actor.sessionCharacterId },
      include: { character: true },
    });
    if (!sessionCharacter) {
      throw notFound("COMBAT_404", "캐릭터 전투 참여자를 찾을 수 없습니다.", {
        reason: "SESSION_CHARACTER_NOT_FOUND",
      });
    }
    if (!sessionCharacter.character.className.toLowerCase().includes("fighter")) {
      throw conflict("COMBAT_409", "Second Wind는 Fighter만 사용할 수 있습니다.", {
        reason: "SECOND_WIND_REQUIRES_FIGHTER",
      });
    }

    const turnState = await runtime.actionEconomy.getOrCreateTurnState({
      combatId: combat.id,
      combatParticipantId: actor.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: actor.sessionCharacterId,
    });
    if (turnState.bonusActionUsed) {
      throw conflict("COMBAT_409", "사용 가능한 bonus action이 없습니다.", {
        reason: "BONUS_ACTION_ALREADY_USED",
      });
    }

    const resource = await runtime.characterResources.getOrCreateResource(actor.sessionCharacterId, {
      secondWindAvailable: true,
    });
    if (!resource.secondWindAvailable) {
      throw conflict("COMBAT_409", "Second Wind를 이미 사용했습니다.", {
        reason: "SECOND_WIND_UNAVAILABLE",
      });
    }

    const roll = runtime.diceService.roll("1d10");
    const healingAmount = roll.total + sessionCharacter.character.level;
    await runtime.spendCurrentBonusActionIfNeeded(combat, actor);
    await runtime.characterResources.spendSecondWind(actor.sessionCharacterId);
    await runtime.combatConditions.addCombatCondition(actor, SECOND_WIND_EXPENDED_TAG);
    await runtime.applyHitPointDelta(combat, actor, healingAmount);

    const updated = await runtime.getActiveCombatEntity(session.id);
    const response = await runtime.mapCombat(updated);
    const healedActor = response.participants.find((participant) => participant.sessionEntityId === actor.id);
    const message = `${actor.nameSnapshot}은(는) Second Wind로 HP를 ${healedActor?.currentHp ?? "-"}까지 회복했습니다.`;
    const turnLog = await runtime.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: actor.sessionCharacterId,
      rawInput: null,
      structuredAction: {
        type: "use_class_feature",
        featureId: "class.fighter.feature.second_wind",
        healingAmount,
      },
      diceResult: { ...roll },
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    runtime.realtimeEvents.emitDiceRolled(session.id, roll);
    runtime.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(session.id, await runtime.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message,
      attackTotal: null,
      damageTotal: healingAmount,
      turnLogId: turnLog.turnLogId,
    };
  }

  async dash(runtime: CombatActionRuntime, userId: string, sessionId: string, _dto: CombatBasicActionDto = {}): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const actor = runtime.getCurrentPlayerParticipantOrThrow(combat);
    return runtime.resolveActorDashAction(userId, session, combat, actor);
  }

  async dodge(runtime: CombatActionRuntime, userId: string, sessionId: string, _dto: CombatBasicActionDto = {}): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const actor = runtime.getCurrentPlayerParticipantOrThrow(combat);
    return runtime.resolveActorDodgeAction(userId, session, combat, actor);
  }

  async hide(runtime: CombatActionRuntime, userId: string, sessionId: string, _dto: CombatBasicActionDto = {}): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const actor = runtime.getCurrentPlayerParticipantOrThrow(combat);
    return runtime.resolveActorHideAction(userId, session, combat, actor);
  }

  async resolveActorDashAction(
    runtime: CombatActionRuntime,
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
  ): Promise<CombatActionResultDto> {
    await runtime.ensureActorCanAct(userId, session.id, combat, actor);
    await runtime.spendCurrentActionIfNeeded(combat, actor);
    const speedFt = await runtime.resolveParticipantSpeedFt(actor);
    await runtime.actionEconomy.grantMovement({
      combatId: combat.id,
      combatParticipantId: actor.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: actor.sessionCharacterId,
      amountFt: speedFt,
    });

    const { sessionScenario } = await runtime.sessionsService.getGameStateEntityOrThrow(session.id);
    const updated = await runtime.getActiveCombatEntity(session.id);
    const response = await runtime.mapCombat(updated);
    const message = `${actor.nameSnapshot}은(는) 전력으로 움직일 준비를 마쳤습니다. 이번 턴 이동 가능 거리가 ${speedFt}ft 증가합니다.`;
    const turnLog = await runtime.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: { type: "combat_dash", movementBonusFt: speedFt },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    runtime.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(session.id, await runtime.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message,
      attackTotal: null,
      damageTotal: null,
      turnLogId: turnLog.turnLogId,
    };
  }

  async resolveActorDodgeAction(
    runtime: CombatActionRuntime,
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
  ): Promise<CombatActionResultDto> {
    await runtime.ensureActorCanAct(userId, session.id, combat, actor);
    await runtime.spendCurrentActionIfNeeded(combat, actor);
    await runtime.combatConditions.addCombatCondition(actor, COMBAT_CONDITION_DODGE);

    const { sessionScenario } = await runtime.sessionsService.getGameStateEntityOrThrow(session.id);
    const updated = await runtime.getActiveCombatEntity(session.id);
    const response = await runtime.mapCombat(updated);
    const message = `${actor.nameSnapshot}은(는) 방어 자세를 취했습니다. 다음 자기 턴 시작 전까지 자신을 향한 공격 굴림에 불리점이 적용됩니다.`;
    const turnLog = await runtime.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "combat_dodge",
        condition: COMBAT_CONDITION_DODGE,
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    runtime.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(session.id, await runtime.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message,
      attackTotal: null,
      damageTotal: null,
      turnLogId: turnLog.turnLogId,
    };
  }

  async resolveActorHideAction(
    runtime: CombatActionRuntime,
    userId: string,
    session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>,
    combat: NonNullable<CombatWithParticipants>,
    actor: CombatParticipantEntity,
  ): Promise<CombatActionResultDto> {
    await runtime.ensureActorCanAct(userId, session.id, combat, actor);
    await runtime.spendCurrentActionIfNeeded(combat, actor);
    const stealthModifier = await runtime.resolveStealthModifier(actor);
    const expression = stealthModifier >= 0 ? `1d20+${stealthModifier}` : `1d20${stealthModifier}`;
    const diceResult = runtime.diceService.roll(expression);
    const success = diceResult.total >= COMBAT_HIDE_DC;
    if (success) {
      await runtime.combatConditions.addCombatCondition(actor, COMBAT_CONDITION_HIDDEN);
    }

    const { sessionScenario } = await runtime.sessionsService.getGameStateEntityOrThrow(session.id);
    const updated = await runtime.getActiveCombatEntity(session.id);
    const response = await runtime.mapCombat(updated);
    const message = success
      ? `${actor.nameSnapshot}은(는) 몸을 낮추고 시야의 빈틈으로 숨어듭니다. 다음 공격 굴림에 이점이 적용됩니다.`
      : `${actor.nameSnapshot}은(는) 숨을 곳을 찾으려 했지만 적의 시선을 완전히 피하지 못했습니다.`;
    const turnLog = await runtime.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "combat_hide",
        checkName: "dexterity_stealth",
        dc: COMBAT_HIDE_DC,
        success,
        condition: success ? COMBAT_CONDITION_HIDDEN : null,
      },
      diceResult: { ...diceResult },
      outcome: success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: message,
    });
    runtime.realtimeEvents.emitDiceRolled(session.id, diceResult);
    runtime.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(session.id, await runtime.sessionsService.buildSnapshot(session.id));

    return {
      combat: response,
      message,
      attackTotal: diceResult.total,
      damageTotal: null,
      turnLogId: turnLog.turnLogId,
    };
  }

  async resolveActorAction(runtime: CombatActionRuntime, userId: string, sessionId: string, dto: CombatActorActionDto = {}): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    const combat = await runtime.getActiveCombatEntity(session.id);
    const actor = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    if (!actor) {
      throw conflict("COMBAT_409", "현재 턴 전투 참여자를 찾을 수 없습니다.", {
        reason: "CURRENT_COMBATANT_NOT_FOUND",
      });
    }
    const actionType = dto.actionType ?? "attack";

    if (actionType === "dash") {
      return runtime.resolveActorDashAction(userId, session, combat, actor);
    }
    if (actionType === "dodge") {
      return runtime.resolveActorDodgeAction(userId, session, combat, actor);
    }
    if (actionType === "hide") {
      return runtime.resolveActorHideAction(userId, session, combat, actor);
    }

    if (
      actionType === "attack" &&
      actor.entityType === PrismaCombatEntityType.MONSTER &&
      actor.isHostile &&
      actor.isAlive &&
      !runtime.combatConditions.isCombatParticipantIncapacitated(actor)
    ) {
      await runtime.ensureActorCanAct(userId, session.id, combat, actor);
      const map = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(session), session.id);
      const actorToken = runtime.combatTargeting.findParticipantToken(map, actor);
      const monsterAction = runtime.combatMonsterActions.resolveMonsterActionForParticipant(actor, actorToken, dto.actionId);
      if (monsterAction.attackKind === "special") {
        return runtime.resolveMonsterSpecialAction({
          userId,
          session,
          combat,
          actor,
          action: monsterAction,
          targetParticipantId: dto.targetParticipantId ?? null,
          autoEndTurn: dto.autoEndTurn === true,
        });
      }
      const target = dto.targetParticipantId
        ? runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantId)
        : combat.participants.find((participant) => !participant.isHostile && participant.isAlive);
      if (!target || target.isHostile || !target.isAlive) {
        throw unprocessable("COMBAT_422", "몬스터가 공격할 수 있는 대상이 없습니다.", {
          reason: "MONSTER_TARGET_NOT_FOUND",
        });
      }
      const targetToken = runtime.combatTargeting.findParticipantToken(map, target);
      return runtime.resolveMonsterAttackAction({
        userId,
        session,
        combat,
        attacker: actor,
        target,
        action: monsterAction,
        map,
        sourceTokenId: actorToken?.id ?? actor.tokenId ?? null,
        targetTokenId: targetToken?.id ?? target.tokenId ?? null,
        movementDistanceFt: 0,
        autoEndTurn: dto.autoEndTurn === true,
        autoEndTurnWhenOutOfRange: false,
      });
    }

    throw conflict("COMBAT_409", "현재 액터의 공통 행동은 아직 지원하지 않습니다.", {
      reason: "ACTOR_ACTION_UNSUPPORTED",
      actorParticipantId: actor.id,
      entityType: actor.entityType,
    });
  }
}
