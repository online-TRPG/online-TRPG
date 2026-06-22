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
import type { AoeDirection } from "../rules/aoe-targeting.service";
import type { ConditionInstance } from "../rules/condition-runtime.service";
import type { SpellScalingResult } from "../rules/spell-scaling.service";
import type { SessionsService } from "../sessions/sessions.service";
import type { CombatService } from "./combat.service";
import type {
  PendingScorchingRayContinuation,
  PendingShieldContinuation,
} from "./combat-reaction.service";
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
      concentrationCheck.modifierRolls?.forEach((roll) =>
        runtime.realtimeEvents.emitDiceRolled(session.id, roll),
      );
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

  async castSpell(
    runtime: CombatActionRuntime,
    userId: string,
    sessionId: string,
    dto: CastCombatSpellDto,
    options: { skipCounterspellPrompt?: boolean } = {},
  ): Promise<CombatActionResultDto> {
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
    const isSpiritualWeaponRepeat =
      spellId === "spell.spiritual_weapon" &&
      runtime
        .parseConditions(caster.conditionsJson ?? "[]")
        .includes("summon:spiritual_weapon");
    if (
      !options.skipCounterspellPrompt &&
      spellId !== "spell.counterspell" &&
      !isSpiritualWeaponRepeat
    ) {
      const attemptedSpellLevel =
        runtime.combatSpells.resolveCombatSpellSlotLevel(
          spellId,
          dto.slotLevel,
        );
      const attemptedActionCost =
        spellDefinition?.cost.type === "bonus_action" ||
        spellDefinition?.cost.type === "reaction"
          ? spellDefinition.cost.type
          : "action";
      const casterTurnState = await runtime.actionEconomy.getOrCreateTurnState({
        combatId: combat.id,
        combatParticipantId: caster.id,
        roundNo: combat.roundNo,
        turnNo: combat.turnNo,
        sessionCharacterId: caster.sessionCharacterId,
      });
      if (
        (attemptedActionCost === "action" &&
          casterTurnState.actionUsed &&
          !casterTurnState.additionalActionGranted) ||
        (attemptedActionCost === "bonus_action" &&
          casterTurnState.bonusActionUsed) ||
        (attemptedActionCost === "reaction" && casterTurnState.reactionUsed)
      ) {
        throw conflict("COMBAT_409", "주문 시전에 필요한 행동 자원이 없습니다.", {
          reason: "SPELL_ACTION_COST_UNAVAILABLE",
          actionCost: attemptedActionCost,
        });
      }
      if (attemptedSpellLevel > 0) {
        await runtime.combatSpells.assertSpellSlotAvailable(
          session.id,
          caster.sessionCharacterId,
          attemptedSpellLevel,
          runtime.combatSpells.resolveSpellSlotMaximumForCharacter(
            casterSessionCharacter,
            attemptedSpellLevel,
          ),
        );
      }
      const counterspellPrompt = await this.tryPromptCounterspell(runtime, {
        sessionId: session.id,
        combat,
        caster,
        casterToken,
        casterUserId: userId,
        spellId,
        spellLevel: attemptedSpellLevel,
        actionCost: attemptedActionCost,
        castDto: dto,
        map,
      });
      if (counterspellPrompt) {
        return {
          combat: await runtime.mapCombat(combat),
          message: "Counterspell 반응을 기다리는 중입니다.",
          attackTotal: null,
          damageTotal: null,
          turnLogId: null,
          pendingReaction: counterspellPrompt,
          pendingReactions: [counterspellPrompt],
        };
      }
    }

    if (
      spellId === "spell.fire_bolt" ||
      spellId === "spell.chill_touch" ||
      spellId === "spell.ray_of_frost" ||
      spellId === "spell.shocking_grasp"
    ) {
      runtime.combatSpells.resolveCombatSpellSlotLevel(spellId, dto.slotLevel);
      const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantIds?.[0] ?? "");
      runtime.combatTargeting.assertSpellTargetInRange(
        map,
        casterToken,
        target,
        runtime.combatSpells.resolveCombatSpellRangeFt(
          spellDefinition,
          spellId === "spell.shocking_grasp" ? 5 : 120,
        ),
      );
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
          messagePrefix: this.resolveSpellDisplayName(spellId),
          spellId,
          damageType:
            runtime.combatSpells.resolveCombatSpellDamageType(
              spellDefinition,
              spellId === "spell.shocking_grasp"
                ? "lightning"
                : spellId === "spell.chill_touch"
                  ? "necrotic"
                  : spellId === "spell.ray_of_frost"
                    ? "cold"
                    : "fire",
            ),
          ...(spellId === "spell.ray_of_frost" || spellId === "spell.shocking_grasp"
            ? {
                onHitCondition: runtime.conditionRuntime.createCondition({
                  conditionId:
                    spellId === "spell.ray_of_frost"
                      ? "condition.spell.ray_of_frost"
                      : "condition.spell.shocking_grasp",
                  sourceId: spellId,
                  duration: { type: "rounds", remaining: 1 },
                  stackPolicy: "replace",
                  appliedAtRound: combat.roundNo,
                  tags:
                    spellId === "spell.ray_of_frost"
                      ? ["movement_speed_penalty:10"]
                      : ["reaction:block"],
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

    if (spellId === "spell.scorching_ray") {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(
        spellDefinition,
        slotLevel,
      );
      const requestedTargetIds = (dto.targetParticipantIds ?? []).filter(Boolean);
      if (!requestedTargetIds.length) {
        throw conflict("COMBAT_409", "Scorching Ray 대상이 필요합니다.", {
          reason: "SPELL_TARGET_REQUIRED",
        });
      }
      const rayCount = 3 + Math.max(0, slotLevel - 2);
      const rayTargetIds = Array.from(
        { length: rayCount },
        (_, index) =>
          requestedTargetIds[Math.min(index, requestedTargetIds.length - 1)],
      );
      for (const targetId of new Set(rayTargetIds)) {
        const target = runtime.findCombatParticipantOrThrow(combat, targetId);
        runtime.combatTargeting.assertSpellTargetInRange(
          map,
          casterToken,
          target,
          runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 120),
        );
        runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      }
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );

      const spellAttackBonus =
        runtime.combatSpells.resolveSpellAttackBonusForCharacter(casterSessionCharacter);
      const results: CombatActionResultDto[] = [];
      for (let index = 0; index < rayTargetIds.length; index += 1) {
        const currentCombat = await runtime.getActiveCombatEntity(session.id);
        const currentCaster = runtime.findCombatParticipantOrThrow(
          currentCombat,
          caster.id,
        );
        const target = currentCombat.participants.find(
          (participant) =>
            participant.id === rayTargetIds[index] && participant.isAlive,
        );
        if (!currentCaster.isAlive || !target) {
          continue;
        }
        const remainingTargetParticipantIds = rayTargetIds.slice(index + 1);
        const continuation: PendingScorchingRayContinuation | null =
          remainingTargetParticipantIds.length
            ? {
                type: "scorching_ray",
                userId,
                actorParticipantId: caster.id,
                remainingTargetParticipantIds,
                attackBonus: spellAttackBonus,
                damageDice: "2d6",
              }
            : null;
        const result = await runtime.resolveAttack(
          userId,
          session.id,
          {
            attackerParticipantId: caster.id,
            targetParticipantId: target.id,
            attackBonus: spellAttackBonus,
            damageDice: "2d6",
            damageBonus: 0,
          },
          {
            messagePrefix: `Scorching Ray ${index + 1}/${rayCount}`,
            spellId,
            actionCost: "none",
            shieldContinuation: continuation,
            auditMetadata: {
              baseSpellLevel: 2,
              slotLevel,
              rayIndex: index + 1,
              rayCount,
            },
          },
        );
        results.push(result);
        if (result.pendingReaction) {
          return {
            ...result,
            message: `${result.message} / 남은 광선 ${remainingTargetParticipantIds.length}개`,
          };
        }
        if (result.combat.status !== "ACTIVE") {
          break;
        }
      }

      const latest =
        results[results.length - 1] ??
        ({
          combat: await runtime.mapCombat(await runtime.getActiveCombatEntity(session.id)),
          message: "Scorching Ray: 유효한 대상이 없어 광선이 종료되었습니다.",
          attackTotal: null,
          damageTotal: 0,
        } satisfies CombatActionResultDto);
      return {
        ...latest,
        message: results.map((result) => result.message).join(" / ") || latest.message,
        damageTotal: results.reduce(
          (total, result) => total + (result.damageTotal ?? 0),
          0,
        ),
      };
    }

    if (
      spellId === "spell.guiding_bolt" ||
      spellId === "spell.inflict_wounds"
    ) {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantIds?.[0] ?? "");
      runtime.combatTargeting.assertSpellTargetInRange(
        map,
        casterToken,
        target,
        runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, spellId === "spell.inflict_wounds" ? 5 : 120),
      );
      runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      await runtime.combatSpells.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      return runtime.resolveAttack(
        userId,
        session.id,
        {
          attackerParticipantId: caster.id,
          targetParticipantId: target.id,
          attackBonus: runtime.combatSpells.resolveSpellAttackBonusForCharacter(casterSessionCharacter),
          damageDice:
            spellScaling.damageDice ??
            runtime.combatSpells.resolveCombatSpellBaseDamageDice(spellDefinition) ??
            (spellId === "spell.inflict_wounds" ? "3d10" : "4d6"),
          damageBonus: 0,
        },
        {
          messagePrefix: this.resolveSpellDisplayName(spellId),
          spellId,
          damageType: runtime.combatSpells.resolveCombatSpellDamageType(
            spellDefinition,
            spellId === "spell.inflict_wounds" ? "necrotic" : "radiant",
          ),
          actionCost: "none",
          auditMetadata: {
            baseSpellLevel: runtime.combatSpells.resolveCombatBaseSpellLevel(spellId),
            slotLevel,
          },
          ...(spellId === "spell.guiding_bolt"
            ? {
                onHitCondition: runtime.conditionRuntime.createCondition({
                  conditionId: "condition.spell.guiding_bolt",
                  sourceId: spellId,
                  duration: { type: "rounds", remaining: 1 },
                  stackPolicy: "replace",
                  appliedAtRound: combat.roundNo,
                  tags: ["next_attack_advantage"],
                }),
              }
            : {}),
        },
      );
    }

    if (spellId === "spell.spiritual_weapon") {
      spellScaling =
        runtime.combatSpells.resolveCombatSpellScalingFromCatalog(
          spellDefinition,
          slotLevel,
        );
      const target = runtime.findCombatParticipantOrThrow(
        combat,
        dto.targetParticipantIds?.[0] ?? "",
      );
      runtime.combatTargeting.assertSpellTargetInRange(
        map,
        casterToken,
        target,
        runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 60),
      );
      runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      const spiritualWeaponActive = runtime
        .parseConditions(caster.conditionsJson ?? "[]")
        .includes("summon:spiritual_weapon");
      if (!spiritualWeaponActive) {
        await runtime.combatSpells.assertSpellSlotAvailable(
          session.id,
          caster.sessionCharacterId,
          slotLevel,
          spellSlotMaximum,
        );
      }
      await runtime.spendCurrentBonusActionIfNeeded(combat, caster);
      if (!spiritualWeaponActive) {
        await runtime.combatSpells.spendSpellSlotWithMaximum(
          session.id,
          caster.sessionCharacterId,
          slotLevel,
          spellSlotMaximum,
        );
        await runtime.combatConditions.addCombatConditionInstance(
          caster,
          runtime.conditionRuntime.createCondition({
            conditionId: "condition.spell.spiritual_weapon",
            sourceId: spellId,
            duration: { type: "rounds", remaining: 10 },
            stackPolicy: "replace",
            appliedAtRound: combat.roundNo,
            tags: ["summon:spiritual_weapon"],
          }),
        );
      }
      const damageModifier =
        runtime.combatSpells.resolveSpellcastingAbilityModifierForCharacter(
          casterSessionCharacter,
        );
      return runtime.resolveAttack(
        userId,
        session.id,
        {
          attackerParticipantId: caster.id,
          targetParticipantId: target.id,
          attackBonus:
            runtime.combatSpells.resolveSpellAttackBonusForCharacter(
              casterSessionCharacter,
            ),
          damageDice:
            spellScaling.damageDice ??
            runtime.combatSpells.resolveCombatSpellBaseDamageDice(
              spellDefinition,
            ) ??
            "1d8",
          damageBonus: damageModifier,
        },
        {
          messagePrefix: "Spiritual Weapon",
          spellId,
          damageType: "force",
          actionCost: "none",
          auditMetadata: {
            baseSpellLevel: 2,
            slotLevel,
            repeatableWithBonusAction: true,
            spiritualWeaponActive,
          },
        },
      );
    }

    if (spellId === "spell.bless" || spellId === "spell.bane") {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(
        spellDefinition,
        slotLevel,
      );
      const maximumTargets = spellScaling.targetCount ?? 3;
      const targetIds = Array.from(new Set(dto.targetParticipantIds ?? []))
        .filter(Boolean)
        .slice(0, maximumTargets);
      if (!targetIds.length) {
        throw conflict("COMBAT_409", `${spellId === "spell.bless" ? "Bless" : "Bane"} 대상이 필요합니다.`, {
          reason: "SPELL_TARGET_REQUIRED",
        });
      }
      const targets = targetIds.map((targetId) =>
        runtime.findCombatParticipantOrThrow(combat, targetId),
      );
      targets.forEach((target) => {
        runtime.combatTargeting.assertSpellTargetInRange(
          map,
          casterToken,
          target,
          runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 30),
        );
        runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      });
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      const effectId = `${spellId}:${caster.id}:${Date.now()}`;
      const affected: string[] = [];
      for (const target of targets) {
        let saveSucceeded = false;
        if (spellId === "spell.bane") {
          const saveAbility = runtime.combatSpells.resolveCombatSpellSaveAbility(
            spellDefinition,
            "cha",
          );
          const saveTarget = await runtime.toCombatAoeDamageTarget(
            target,
            map,
            saveAbility,
          );
          const saveRoll = runtime.diceService.roll("1d20", DiceAdvantageState.NORMAL);
          const saveResult = runtime.ruleEngine.resolveSavingThrow({
            ability: saveAbility,
            naturalD20: runtime.selectNaturalD20(
              saveRoll.rolls,
              DiceAdvantageState.NORMAL,
            ),
            difficultyClass:
              runtime.combatSpells.resolveCombatSpellSaveDcForCharacter(
                casterSessionCharacter,
              ),
            abilityModifier: saveTarget.abilityModifiers[saveAbility] ?? 0,
            proficiencyBonus: saveTarget.proficiencyBonus,
            proficient: saveTarget.proficientSaves?.includes(saveAbility) ?? false,
            bonusModifiers: saveTarget.bonusModifiers,
          });
          diceResults.push(...(saveTarget.modifierRolls ?? []), saveRoll);
          saveSucceeded = saveResult.produced.success;
        }
        if (saveSucceeded) {
          continue;
        }
        await runtime.combatConditions.addCombatConditionInstance(
          target,
          runtime.conditionRuntime.createCondition({
            conditionId:
              spellId === "spell.bless"
                ? "condition.spell.bless"
                : "condition.spell.bane",
            sourceId: effectId,
            duration: { type: "rounds", remaining: 10 },
            stackPolicy: "replace",
            appliedAtRound: combat.roundNo,
            tags:
              spellId === "spell.bless"
                ? [
                    "roll_bonus:attack_roll:1d4",
                    "roll_bonus:saving_throw:1d4",
                  ]
                : [
                    "roll_penalty:attack_roll:1d4",
                    "roll_penalty:saving_throw:1d4",
                  ],
          }),
        );
        affected.push(target.nameSnapshot);
      }
      await runtime.startCombatConcentration(combat, caster, {
        spellId,
        targetIds: targets.map((target) => target.id),
        effectIds: [effectId],
        durationRounds: 10,
      });
      message = affected.length
        ? `${spellId === "spell.bless" ? "Bless" : "Bane"}: ${affected.join(", ")}에게 적용했습니다.`
        : "Bane: 모든 대상이 내성에 성공했습니다.";
    } else if (spellId === "spell.detect_magic") {
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.startCombatConcentration(combat, caster, {
        spellId,
        targetIds: [caster.id],
        effectIds: [],
        durationRounds: 100,
      });
      const withinDetectionRange = (x: number, y: number) =>
        Math.hypot(x - casterToken.x, y - casterToken.y) / map.gridSize * 5 <= 30;
      const detectedLightSources = (map.lightSources ?? []).filter((source) =>
        withinDetectionRange(source.x, source.y),
      );
      const detectedSpellTerrain = (map.terrainCells ?? []).filter(
        (cell) =>
          cell.id.startsWith("spell-") &&
          withinDetectionRange(cell.x, cell.y),
      );
      const detectedConditionEffects = combat.participants.filter((participant) =>
        runtime.parseConditions(participant.conditionsJson ?? "[]").some((tag) =>
          tag.startsWith("concentration:spell:") || tag.startsWith("condition.spell."),
        ),
      );
      const detectedCount =
        detectedLightSources.length +
        detectedSpellTerrain.length +
        detectedConditionEffects.length;
      message = detectedCount > 0
        ? `Detect Magic: 30ft 안에서 마법 효과 ${detectedCount}개를 감지했습니다.`
        : "Detect Magic: 30ft 안에서 감지된 마법 효과가 없습니다.";
    } else if (
      spellId === "spell.fog_cloud" ||
      spellId === "spell.darkness" ||
      spellId === "spell.grease"
    ) {
      spellScaling =
        runtime.combatSpells.resolveCombatSpellScalingFromCatalog(
          spellDefinition,
          slotLevel,
        );
      const point = dto.point ?? runtime.combatTargeting.requireTargetPoint(map, casterToken);
      runtime.combatTargeting.assertPointInRange(
        map,
        casterToken,
        point,
        runtime.combatSpells.resolveCombatSpellRangeFt(
          spellDefinition,
          spellId === "spell.fog_cloud" ? 120 : 60,
        ),
      );
      const areaTargeting = runtime.combatSpells.resolveCombatAreaTargeting(
        spellDefinition,
        spellId,
      );
      const areaSizeFt =
        spellId === "spell.fog_cloud"
          ? 20 + Math.max(0, slotLevel - 1) * 20
          : areaTargeting.sizeFt;
      const aoeOrigin = runtime.combatCover.toAoeGridCell(
        runtime.combatMovement.mapPointToGridPoint(map, point),
      );
      const targeting = runtime.aoeTargeting.resolveTargets({
        shape: areaTargeting.shape,
        origin: aoeOrigin,
        sizeFt: areaSizeFt,
        grid: {
          columns: Math.ceil(map.width / map.gridSize),
          rows: Math.ceil(map.height / map.gridSize),
        },
        tokens: map.tokens.map((token) => ({
          id: token.id,
          ...runtime.combatCover.toAoeGridCell(
            runtime.combatCover.toCoverGridPoint(map, token),
          ),
          hidden: token.hidden,
        })),
      });
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      const terrainCellId = `${spellId.replace(".", "-")}:${caster.id}:${Date.now()}`;
      const terrainSizePx = (areaSizeFt / 5) * map.gridSize;
      responseMap = await runtime.mapRuntimeService.saveSystemVttMap(session.id, {
        ...map,
        terrainCells: [
          ...(map.terrainCells ?? []),
          {
            id: terrainCellId,
            x: runtime.clampNumber(
              Math.floor(point.x - terrainSizePx / 2),
              0,
              Math.max(0, map.width - terrainSizePx),
            ),
            y: runtime.clampNumber(
              Math.floor(point.y - terrainSizePx / 2),
              0,
              Math.max(0, map.height - terrainSizePx),
            ),
            width: terrainSizePx,
            height: terrainSizePx,
            name: this.resolveSpellDisplayName(spellId),
            description: `${this.resolveSpellDisplayName(spellId)} 주문의 지속 지역`,
            terrainEffectId:
              spellId === "spell.grease"
                ? "terrain.slippery"
                : "terrain.obscurement",
          },
        ],
        updatedAt: new Date().toISOString(),
      });
      const affected: string[] = [];
      if (spellId === "spell.grease") {
        const saveAbility = runtime.combatSpells.resolveCombatSpellSaveAbility(
          spellDefinition,
          "dex",
        );
        const saveDc =
          runtime.combatSpells.resolveCombatSpellSaveDcForCharacter(
            casterSessionCharacter,
          );
        const targets = combat.participants.filter(
          (participant) =>
            participant.id !== caster.id &&
            participant.tokenId &&
            targeting.tokenIds.includes(participant.tokenId),
        );
        for (const target of targets) {
          const saveTarget = await runtime.toCombatAoeDamageTarget(
            target,
            map,
            saveAbility,
          );
          const saveRoll = runtime.diceService.roll(
            "1d20",
            DiceAdvantageState.NORMAL,
          );
          const saveResult = runtime.ruleEngine.resolveSavingThrow({
            ability: saveAbility,
            naturalD20: runtime.selectNaturalD20(
              saveRoll.rolls,
              DiceAdvantageState.NORMAL,
            ),
            difficultyClass: saveDc,
            abilityModifier: saveTarget.abilityModifiers[saveAbility] ?? 0,
            proficiencyBonus: saveTarget.proficiencyBonus,
            proficient:
              saveTarget.proficientSaves?.includes(saveAbility) ?? false,
            bonusModifiers: saveTarget.bonusModifiers,
          });
          diceResults.push(...(saveTarget.modifierRolls ?? []), saveRoll);
          if (!saveResult.produced.success) {
            await runtime.combatConditions.addCombatConditionInstance(
              target,
              runtime.conditionRuntime.createCondition({
                conditionId: "condition.prone",
                sourceId: terrainCellId,
                duration: { type: "rounds", remaining: 1 },
                stackPolicy: "replace",
                appliedAtRound: combat.roundNo,
                tags: ["condition:prone"],
              }),
            );
            affected.push(target.nameSnapshot);
          }
        }
      } else {
        await runtime.startCombatConcentration(combat, caster, {
          spellId,
          targetIds: [],
          effectIds: [terrainCellId],
          durationRounds: spellId === "spell.darkness" ? 100 : 600,
        });
      }
      message =
        spellId === "spell.grease"
          ? `Grease: 미끄러운 지역을 만들고 ${affected.length ? `${affected.join(", ")}을(를) 넘어뜨렸습니다.` : "즉시 넘어진 대상은 없습니다."}`
          : `${this.resolveSpellDisplayName(spellId)}: 시야를 가리는 지속 지역을 생성했습니다.`;
    } else if (
      spellId === "spell.minor_illusion" ||
      spellId === "spell.mage_hand"
    ) {
      const point = dto.point ?? runtime.combatTargeting.requireTargetPoint(map, casterToken);
      runtime.combatTargeting.assertPointInRange(
        map,
        casterToken,
        point,
        runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 30),
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatConditions.addCombatConditionInstance(
        caster,
        runtime.conditionRuntime.createCondition({
          conditionId: `condition.${spellId}`,
          sourceId: spellId,
          duration: { type: "rounds", remaining: 10 },
          stackPolicy: "replace",
          appliedAtRound: combat.roundNo,
          tags: [
            spellId === "spell.mage_hand"
              ? "utility:remote_object_interaction"
              : "utility:illusion",
            `effect_point:${Math.floor(point.x)}:${Math.floor(point.y)}`,
          ],
        }),
      );
      message = `${this.resolveSpellDisplayName(spellId)}: 선택한 위치에 효과를 생성했습니다.`;
    } else if (spellId === "spell.faerie_fire") {
      const point = dto.point ?? runtime.combatTargeting.requireTargetPoint(map, casterToken);
      runtime.combatTargeting.assertPointInRange(map, casterToken, point, 60);
      const areaTargeting = runtime.combatSpells.resolveCombatAreaTargeting(
        spellDefinition,
        spellId,
      );
      const aoeOrigin = runtime.combatCover.toAoeGridCell(
        runtime.combatMovement.mapPointToGridPoint(map, point),
      );
      const targeting = runtime.aoeTargeting.resolveTargets({
        shape: areaTargeting.shape,
        origin: aoeOrigin,
        sizeFt: areaTargeting.sizeFt,
        grid: {
          columns: Math.ceil(map.width / map.gridSize),
          rows: Math.ceil(map.height / map.gridSize),
        },
        tokens: map.tokens.map((token) => ({
          id: token.id,
          ...runtime.combatCover.toAoeGridCell(
            runtime.combatCover.toCoverGridPoint(map, token),
          ),
          hidden: token.hidden,
        })),
      });
      const targets = combat.participants.filter(
        (participant) =>
          participant.id !== caster.id &&
          participant.tokenId &&
          targeting.tokenIds.includes(participant.tokenId),
      );
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      const saveAbility = runtime.combatSpells.resolveCombatSpellSaveAbility(
        spellDefinition,
        "dex",
      );
      const saveDc =
        runtime.combatSpells.resolveCombatSpellSaveDcForCharacter(
          casterSessionCharacter,
        );
      const effectId = `${spellId}:${caster.id}:${Date.now()}`;
      const affected: string[] = [];
      for (const target of targets) {
        const saveTarget = await runtime.toCombatAoeDamageTarget(
          target,
          map,
          saveAbility,
        );
        const saveRoll = runtime.diceService.roll(
          "1d20",
          DiceAdvantageState.NORMAL,
        );
        const saveResult = runtime.ruleEngine.resolveSavingThrow({
          ability: saveAbility,
          naturalD20: runtime.selectNaturalD20(
            saveRoll.rolls,
            DiceAdvantageState.NORMAL,
          ),
          difficultyClass: saveDc,
          abilityModifier: saveTarget.abilityModifiers[saveAbility] ?? 0,
          proficiencyBonus: saveTarget.proficiencyBonus,
          proficient: saveTarget.proficientSaves?.includes(saveAbility) ?? false,
          bonusModifiers: saveTarget.bonusModifiers,
        });
        diceResults.push(...(saveTarget.modifierRolls ?? []), saveRoll);
        if (!saveResult.produced.success) {
          await runtime.combatConditions.addCombatConditionInstance(
            target,
            runtime.conditionRuntime.createCondition({
              conditionId: "condition.spell.faerie_fire",
              sourceId: effectId,
              duration: { type: "rounds", remaining: 10 },
              stackPolicy: "replace",
              appliedAtRound: combat.roundNo,
              tags: ["condition:faerie_fire", "advantage:incoming_attack"],
            }),
          );
          affected.push(target.nameSnapshot);
        }
      }
      await runtime.startCombatConcentration(combat, caster, {
        spellId,
        targetIds: targets.map((target) => target.id),
        effectIds: [effectId],
        durationRounds: 10,
      });
      message = affected.length
        ? `Faerie Fire: ${affected.join(", ")}에게 윤곽광을 적용했습니다.`
        : "Faerie Fire: 모든 대상이 내성에 성공했습니다.";
    } else if (spellId === "spell.entangle" || spellId === "spell.web") {
      const point = dto.point ?? runtime.combatTargeting.requireTargetPoint(map, casterToken);
      runtime.combatTargeting.assertPointInRange(
        map,
        casterToken,
        point,
        runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, spellId === "spell.web" ? 60 : 90),
      );
      const areaTargeting = runtime.combatSpells.resolveCombatAreaTargeting(spellDefinition, spellId);
      const aoeOrigin = runtime.combatCover.toAoeGridCell(
        runtime.combatMovement.mapPointToGridPoint(map, point),
      );
      const targeting = runtime.aoeTargeting.resolveTargets({
        shape: areaTargeting.shape,
        origin: aoeOrigin,
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
      });
      const targets = combat.participants.filter(
        (participant) =>
          participant.id !== caster.id &&
          participant.tokenId &&
          targeting.tokenIds.includes(participant.tokenId),
      );
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      const terrainCellId = `${spellId.replace(".", "-")}:${caster.id}:${Date.now()}`;
      const terrainX = Math.min(
        Math.max(0, aoeOrigin.column * map.gridSize),
        Math.max(0, map.width - areaTargeting.sizeFt / 5 * map.gridSize),
      );
      const terrainY = Math.min(
        Math.max(0, aoeOrigin.row * map.gridSize),
        Math.max(0, map.height - areaTargeting.sizeFt / 5 * map.gridSize),
      );
      responseMap = await runtime.mapRuntimeService.saveSystemVttMap(session.id, {
        ...map,
        terrainCells: [
          ...(map.terrainCells ?? []),
          {
            id: terrainCellId,
            x: terrainX,
            y: terrainY,
            width: areaTargeting.sizeFt / 5 * map.gridSize,
            height: areaTargeting.sizeFt / 5 * map.gridSize,
            name: this.resolveSpellDisplayName(spellId),
            description: `${this.resolveSpellDisplayName(spellId)} 주문으로 생성된 험지`,
            terrainEffectId: "terrain.difficult",
          },
        ],
        updatedAt: new Date().toISOString(),
      });
      const saveAbility = runtime.combatSpells.resolveCombatSpellSaveAbility(
        spellDefinition,
        spellId === "spell.web" ? "dex" : "str",
      );
      const saveDc = runtime.combatSpells.resolveCombatSpellSaveDcForCharacter(casterSessionCharacter);
      const restrained: string[] = [];
      for (const target of targets) {
        const saveTarget = await runtime.toCombatAoeDamageTarget(target, map, saveAbility);
        const saveRoll = runtime.diceService.roll("1d20", DiceAdvantageState.NORMAL);
        const saveResult = runtime.ruleEngine.resolveSavingThrow({
          ability: saveAbility,
          naturalD20: runtime.selectNaturalD20(saveRoll.rolls, DiceAdvantageState.NORMAL),
          difficultyClass: saveDc,
          abilityModifier: saveTarget.abilityModifiers[saveAbility] ?? 0,
          proficiencyBonus: saveTarget.proficiencyBonus,
          proficient: saveTarget.proficientSaves?.includes(saveAbility) ?? false,
          bonusModifiers: saveTarget.bonusModifiers,
        });
        diceResults.push(...(saveTarget.modifierRolls ?? []), saveRoll);
        if (!saveResult.produced.success) {
          await runtime.combatConditions.addCombatConditionInstance(
            target,
            runtime.conditionRuntime.createCondition({
              conditionId: "condition.restrained",
              sourceId: terrainCellId,
              duration: { type: "rounds", remaining: spellId === "spell.web" ? 600 : 10 },
              stackPolicy: "replace",
              appliedAtRound: combat.roundNo,
              tags: ["condition:restrained", "speed:zero", "advantage:incoming_attack"],
            }),
          );
          restrained.push(target.nameSnapshot);
        }
      }
      await runtime.startCombatConcentration(combat, caster, {
        spellId,
        targetIds: targets.map((target) => target.id),
        effectIds: [terrainCellId],
        durationRounds: spellId === "spell.web" ? 600 : 10,
      });
      message = restrained.length
        ? `${this.resolveSpellDisplayName(spellId)}: 험지를 생성하고 ${restrained.join(", ")}을(를) 구속했습니다.`
        : `${this.resolveSpellDisplayName(spellId)}: 험지를 생성했지만 구속된 대상은 없습니다.`;
    } else if (spellId === "spell.sacred_flame" || spellId === "spell.acid_splash") {
      const targets = Array.from(new Set(dto.targetParticipantIds ?? []))
        .filter(Boolean)
        .slice(0, spellId === "spell.acid_splash" ? 2 : 1)
        .map((targetId) => runtime.findCombatParticipantOrThrow(combat, targetId));
      if (!targets.length) {
        throw conflict("COMBAT_409", `${this.resolveSpellDisplayName(spellId)} 대상이 필요합니다.`, {
          reason: "SPELL_TARGET_REQUIRED",
        });
      }
      targets.forEach((target) => {
        runtime.combatTargeting.assertSpellTargetInRange(
          map,
          casterToken,
          target,
          runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 60),
        );
        runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      });
      const saveAbility = runtime.combatSpells.resolveCombatSpellSaveAbility(spellDefinition, "dex");
      const saveDc = runtime.combatSpells.resolveCombatSpellSaveDcForCharacter(casterSessionCharacter);
      const saveTargets = await Promise.all(
        targets.map((target) => runtime.toCombatAoeDamageTarget(target, map, saveAbility)),
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      const resolution = runtime.aoeDamage.resolveDamage({
        sourceId: spellId,
        damageDice: runtime.combatSpells.resolveCantripDamageDice(
          runtime.combatSpells.resolveCombatSpellBaseDamageDice(spellDefinition) ??
            (spellId === "spell.acid_splash" ? "1d6" : "1d8"),
          runtime.combatSpells.resolveCharacterLevelForCharacter(casterSessionCharacter),
        ),
        damageType: runtime.combatSpells.resolveCombatSpellDamageType(
          spellDefinition,
          spellId === "spell.acid_splash" ? "acid" : "radiant",
        ),
        save: {
          ability: saveAbility,
          dc: saveDc,
          halfDamageOnSuccess: false,
        },
        targets: saveTargets,
      });
      diceResults.push(
        resolution.damageRoll,
        ...resolution.targetResults.flatMap((targetResult) => [
          ...targetResult.modifierRolls,
          targetResult.saveRoll,
        ]),
      );
      const applied: string[] = [];
      for (const targetResult of resolution.targetResults) {
        const target = targets.find((candidate) => candidate.id === targetResult.targetId);
        if (!target) continue;
        const { concentrationCheck } = await runtime.finalizeCombatDamage(
          combat,
          target,
          targetResult.finalDamage,
        );
        if (concentrationCheck) {
          concentrationChecks.push({
            targetParticipantId: target.id,
            ...concentrationCheck,
          });
        }
        damageTotal = (damageTotal ?? 0) + targetResult.finalDamage;
        applied.push(
          targetResult.savingThrow.success
            ? `${target.nameSnapshot} 내성 성공`
            : `${target.nameSnapshot} ${targetResult.finalDamage}`,
        );
      }
      message = `${this.resolveSpellDisplayName(spellId)}: ${applied.join(", ")}`;
    } else if (spellId === "spell.magic_missile") {
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
    } else if (spellId === "spell.cure_wounds" || spellId === "spell.healing_word") {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantIds?.[0] ?? "");
      runtime.combatTargeting.assertSpellTargetInRange(
        map,
        casterToken,
        target,
        runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, spellId === "spell.healing_word" ? 60 : 5),
      );
      runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      await runtime.combatSpells.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      if (spellId === "spell.healing_word") {
        await runtime.spendCurrentBonusActionIfNeeded(combat, caster);
      } else {
        await runtime.spendCurrentActionIfNeeded(combat, caster);
      }
      await runtime.combatSpells.spendSpellSlotWithMaximum(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      const healingModifier = runtime.combatSpells.resolveSpellcastingAbilityModifierForCharacter(casterSessionCharacter);
      const healingBaseDice =
        spellScaling.damageDice ??
        runtime.combatSpells.resolveCombatSpellBaseDamageDice(spellDefinition) ??
        (spellId === "spell.healing_word" ? "1d4" : "1d8");
      const healingDice = `${healingBaseDice}${healingModifier >= 0 ? "+" : ""}${healingModifier}`;
      const healingRoll = runtime.diceService.roll(healingDice);
      diceResults.push(healingRoll);
      await runtime.applyHitPointDelta(combat, target, healingRoll.total);
      damageTotal = healingRoll.total;
      message = `${this.resolveSpellDisplayName(spellId)}: ${target.nameSnapshot} ${healingRoll.total} 회복`;
    } else if (spellId === "spell.revivify") {
      const target = runtime.findCombatParticipantOrThrow(
        combat,
        dto.targetParticipantIds?.[0] ?? "",
      );
      if (target.isAlive || (target.currentHp ?? 0) > 0) {
        throw conflict("COMBAT_409", "Revivify는 쓰러진 대상에게만 사용할 수 있습니다.", {
          reason: "REVIVIFY_TARGET_NOT_DEFEATED",
        });
      }
      runtime.combatTargeting.assertSpellTargetInRange(map, casterToken, target, 5);
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.applyHitPointDelta(combat, target, 1);
      const revivedTokenId = target.tokenId;
      if (revivedTokenId) {
        responseMap = await runtime.mapRuntimeService.saveSystemVttMap(session.id, {
          ...map,
          tokens: map.tokens.map((token) =>
            token.id === revivedTokenId ? { ...token, hidden: false } : token,
          ),
          updatedAt: new Date().toISOString(),
        });
      }
      message = `Revivify: ${target.nameSnapshot}이(가) HP 1로 전투에 복귀했습니다.`;
    } else if (spellId === "spell.feather_fall") {
      const targets = Array.from(new Set(dto.targetParticipantIds ?? []))
        .filter(Boolean)
        .slice(0, 5)
        .map((targetId) => runtime.findCombatParticipantOrThrow(combat, targetId));
      if (!targets.length) {
        throw conflict("COMBAT_409", "Feather Fall 대상이 필요합니다.", {
          reason: "SPELL_TARGET_REQUIRED",
        });
      }
      targets.forEach((target) => {
        runtime.combatTargeting.assertSpellTargetInRange(map, casterToken, target, 60);
        runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      });
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.actionEconomy.spendReaction({
        combatId: combat.id,
        combatParticipantId: caster.id,
        roundNo: combat.roundNo,
        turnNo: combat.turnNo,
        sessionCharacterId: caster.sessionCharacterId,
      });
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      for (const target of targets) {
        await runtime.combatConditions.addCombatConditionInstance(
          target,
          runtime.conditionRuntime.createCondition({
            conditionId: "condition.spell.feather_fall",
            sourceId: spellId,
            duration: { type: "rounds", remaining: 10 },
            stackPolicy: "replace",
            appliedAtRound: combat.roundNo,
            tags: ["falling_speed:60", "immunity:fall_damage"],
          }),
        );
      }
      message = `Feather Fall: ${targets.map((target) => target.nameSnapshot).join(", ")}의 추락 속도를 낮췄습니다.`;
    } else if (
      spellId === "spell.guidance" ||
      spellId === "spell.heroism" ||
      spellId === "spell.longstrider" ||
      spellId === "spell.invisibility" ||
      spellId === "spell.fly" ||
      spellId === "spell.haste"
    ) {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(
        spellDefinition,
        slotLevel,
      );
      const maximumTargets = spellScaling.targetCount ?? 1;
      const targets = Array.from(new Set(dto.targetParticipantIds ?? []))
        .filter(Boolean)
        .slice(0, maximumTargets)
        .map((targetId) => runtime.findCombatParticipantOrThrow(combat, targetId));
      if (!targets.length) {
        throw conflict("COMBAT_409", `${this.resolveSpellDisplayName(spellId)} 대상이 필요합니다.`, {
          reason: "SPELL_TARGET_REQUIRED",
        });
      }
      targets.forEach((target) => {
        runtime.combatTargeting.assertSpellTargetInRange(
          map,
          casterToken,
          target,
          runtime.combatSpells.resolveCombatSpellRangeFt(
            spellDefinition,
            spellId === "spell.haste" ? 30 : 5,
          ),
        );
        runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      });
      if (slotLevel > 0) {
        await runtime.combatSpells.assertSpellSlotAvailable(
          session.id,
          caster.sessionCharacterId,
          slotLevel,
          spellSlotMaximum,
        );
      }
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      if (slotLevel > 0) {
        await runtime.combatSpells.spendSpellSlotWithMaximum(
          session.id,
          caster.sessionCharacterId,
          slotLevel,
          spellSlotMaximum,
        );
      }
      const effectId = `${spellId}:${caster.id}:${Date.now()}`;
      const effect = this.resolveTargetBuffSpellEffect(
        spellId,
        runtime.combatSpells.resolveSpellcastingAbilityModifierForCharacter(
          casterSessionCharacter,
        ),
      );
      for (const target of targets) {
        await runtime.combatConditions.addCombatConditionInstance(
          target,
          runtime.conditionRuntime.createCondition({
            conditionId: `condition.${spellId}`,
            sourceId: effectId,
            duration: { type: "rounds", remaining: effect.durationRounds },
            stackPolicy: "replace",
            appliedAtRound: combat.roundNo,
            tags: effect.tags,
          }),
        );
      }
      if (effect.concentration) {
        await runtime.startCombatConcentration(combat, caster, {
          spellId,
          targetIds: targets.map((target) => target.id),
          effectIds: [effectId],
          durationRounds: effect.durationRounds,
        });
      }
      message = `${this.resolveSpellDisplayName(spellId)}: ${targets
        .map((target) => target.nameSnapshot)
        .join(", ")}에게 적용했습니다.`;
    } else if (spellId === "spell.hunters_mark") {
      const target = runtime.findCombatParticipantOrThrow(
        combat,
        dto.targetParticipantIds?.[0] ?? "",
      );
      runtime.combatTargeting.assertSpellTargetInRange(
        map,
        casterToken,
        target,
        runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 90),
      );
      runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentBonusActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      const effectId = `${spellId}:${caster.id}`;
      for (const participant of combat.participants) {
        const entries = await runtime.combatConditions.readCombatConditionEntries(participant);
        const next = entries.filter((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
          const candidate = entry as { conditionId?: unknown; sourceId?: unknown };
          return !(
            candidate.conditionId === "condition.spell.hunters_mark" &&
            candidate.sourceId === effectId
          );
        });
        if (next.length !== entries.length) {
          await runtime.combatConditions.writeCombatConditionEntries(participant, next);
        }
      }
      await runtime.combatConditions.addCombatConditionInstance(
        target,
        runtime.conditionRuntime.createCondition({
          conditionId: "condition.spell.hunters_mark",
          sourceId: effectId,
          duration: { type: "rounds", remaining: 600 },
          stackPolicy: "replace",
          appliedAtRound: combat.roundNo,
          tags: ["condition:hunters_mark", `marked_by:${caster.id}`],
        }),
      );
      await runtime.startCombatConcentration(combat, caster, {
        spellId,
        targetIds: [target.id],
        effectIds: [effectId],
        durationRounds: 600,
      });
      message = `Hunter's Mark: ${target.nameSnapshot}을(를) 추적 대상으로 지정했습니다.`;
    } else if (spellId === "spell.aid") {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(
        spellDefinition,
        slotLevel,
      );
      const hitPointBonus = Math.max(5, 5 + Math.max(0, slotLevel - 2) * 5);
      const targets = Array.from(new Set(dto.targetParticipantIds ?? []))
        .filter(Boolean)
        .slice(0, 3)
        .map((targetId) => runtime.findCombatParticipantOrThrow(combat, targetId));
      if (!targets.length) {
        throw conflict("COMBAT_409", "Aid 대상이 필요합니다.", {
          reason: "SPELL_TARGET_REQUIRED",
        });
      }
      targets.forEach((target) => {
        runtime.combatTargeting.assertSpellTargetInRange(map, casterToken, target, 30);
        runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      });
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      const effectId = `${spellId}:${caster.id}:${Date.now()}`;
      for (const target of targets) {
        await runtime.combatConditions.addCombatConditionInstance(
          target,
          runtime.conditionRuntime.createCondition({
            conditionId: "condition.spell.aid",
            sourceId: effectId,
            duration: { type: "rounds", remaining: 4800 },
            stackPolicy: "replace",
            appliedAtRound: combat.roundNo,
            tags: [`max_hp_bonus:${hitPointBonus}`],
          }),
        );
        await runtime.applyHitPointDelta(combat, target, hitPointBonus);
      }
      damageTotal = hitPointBonus * targets.length;
      message = `Aid: ${targets.map((target) => target.nameSnapshot).join(", ")}의 최대 HP와 현재 HP가 ${hitPointBonus} 증가했습니다.`;
    } else if (spellId === "spell.lesser_restoration") {
      const target = runtime.findCombatParticipantOrThrow(
        combat,
        dto.targetParticipantIds?.[0] ?? "",
      );
      runtime.combatTargeting.assertSpellTargetInRange(map, casterToken, target, 5);
      runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      await runtime.combatSpells.assertSpellSlotAvailable(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(
        session.id,
        caster.sessionCharacterId,
        slotLevel,
        spellSlotMaximum,
      );
      const removableTags = new Set([
        "condition:blinded",
        "condition:deafened",
        "condition:paralyzed",
        "condition:poisoned",
        "condition.blinded",
        "condition.deafened",
        "condition.paralyzed",
        "condition.poisoned",
      ]);
      const currentEntries = await runtime.combatConditions.readCombatConditionEntries(target);
      const removed = currentEntries.filter((entry) =>
        runtime.combatConditions.conditionEntryTags(entry).some((tag) =>
          removableTags.has(tag),
        ),
      );
      const removedSet = new Set(removed);
      await runtime.combatConditions.writeCombatConditionEntries(
        target,
        currentEntries.filter((entry) => !removedSet.has(entry)),
      );
      message = removed.length
        ? `Lesser Restoration: ${target.nameSnapshot}의 상태 ${removed.length}개를 제거했습니다.`
        : `Lesser Restoration: ${target.nameSnapshot}에게 제거할 상태가 없습니다.`;
    } else if (
      spellId === "spell.command" ||
      spellId === "spell.hold_person" ||
      spellId === "spell.charm_person" ||
      spellId === "spell.blindness_deafness"
    ) {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const maximumTargets = spellScaling.targetCount ?? 1;
      const targets = Array.from(new Set(dto.targetParticipantIds ?? []))
        .filter(Boolean)
        .slice(0, maximumTargets)
        .map((targetId) => runtime.findCombatParticipantOrThrow(combat, targetId));
      if (!targets.length) {
        throw conflict("COMBAT_409", `${this.resolveSpellDisplayName(spellId)} 대상이 필요합니다.`, {
          reason: "SPELL_TARGET_REQUIRED",
        });
      }
      targets.forEach((target) => {
        runtime.combatTargeting.assertSpellTargetInRange(
          map,
          casterToken,
          target,
          runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 60),
        );
        runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      });
      await runtime.combatSpells.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      const saveAbility = runtime.combatSpells.resolveCombatSpellSaveAbility(spellDefinition, "wis");
      const saveDc = runtime.combatSpells.resolveCombatSpellSaveDcForCharacter(casterSessionCharacter);
      const affected: string[] = [];
      for (const target of targets) {
        const saveTarget = await runtime.toCombatAoeDamageTarget(target, map, saveAbility);
        const saveRoll = runtime.diceService.roll("1d20", DiceAdvantageState.NORMAL);
        const saveResult = runtime.ruleEngine.resolveSavingThrow({
          ability: saveAbility,
          naturalD20: runtime.selectNaturalD20(saveRoll.rolls, DiceAdvantageState.NORMAL),
          difficultyClass: saveDc,
          abilityModifier: saveTarget.abilityModifiers[saveAbility] ?? 0,
          proficiencyBonus: saveTarget.proficiencyBonus,
          proficient: saveTarget.proficientSaves?.includes(saveAbility) ?? false,
          bonusModifiers: saveTarget.bonusModifiers,
        });
        diceResults.push(...(saveTarget.modifierRolls ?? []), saveRoll);
        if (saveResult.produced.success) {
          continue;
        }
        await runtime.combatConditions.addCombatConditionInstance(
          target,
          runtime.conditionRuntime.createCondition({
            conditionId:
              spellId === "spell.hold_person"
                ? "condition.spell.hold_person"
                : spellId === "spell.charm_person"
                  ? "condition.spell.charm_person"
                  : spellId === "spell.blindness_deafness"
                    ? "condition.spell.blindness_deafness"
                    : "condition.spell.command",
            sourceId: spellId,
            duration: {
              type: "rounds",
              remaining:
                spellId === "spell.charm_person"
                  ? 600
                  : spellId === "spell.hold_person" ||
                      spellId === "spell.blindness_deafness"
                    ? 10
                    : 1,
            },
            stackPolicy: "replace",
            appliedAtRound: combat.roundNo,
            tags:
              spellId === "spell.hold_person"
                ? ["condition:paralyzed", "condition:incapacitated"]
                : spellId === "spell.charm_person"
                  ? ["condition:charmed"]
                  : spellId === "spell.blindness_deafness"
                    ? ["condition:blinded"]
                    : ["condition:commanded", "action:limited_by_command"],
          }),
        );
        affected.push(target.nameSnapshot);
      }
      if (spellId === "spell.hold_person" && affected.length) {
        await runtime.startCombatConcentration(combat, caster, {
          spellId,
          targetIds: targets.map((target) => target.id),
          effectIds: [spellId],
          durationRounds: 10,
        });
      }
      message = affected.length
        ? `${this.resolveSpellDisplayName(spellId)}: ${affected.join(", ")}에게 적용했습니다.`
        : `${this.resolveSpellDisplayName(spellId)}: 모든 대상이 내성에 성공했습니다.`;
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
    } else if (
      spellId === "spell.fireball" ||
      spellId === "spell.burning_hands" ||
      spellId === "spell.thunderwave" ||
      spellId === "spell.lightning_bolt" ||
      spellId === "spell.moonbeam"
    ) {
      spellScaling = runtime.combatSpells.resolveCombatSpellScalingFromCatalog(spellDefinition, slotLevel);
      const areaTargeting = runtime.combatSpells.resolveCombatAreaTargeting(spellDefinition, spellId);
      const saveAbility = runtime.combatSpells.resolveCombatSpellSaveAbility(spellDefinition, "dex");
      const damageType = runtime.combatSpells.resolveCombatSpellDamageType(spellDefinition, "fire");
      const point = dto.point ?? runtime.combatTargeting.requireTargetPoint(map, casterToken);
      const spellRangeFt = runtime.combatSpells.resolveCombatSpellRangeFt(
        spellDefinition,
        spellId === "spell.fireball"
          ? 150
          : spellId === "spell.lightning_bolt"
            ? 100
            : spellId === "spell.moonbeam"
              ? 120
              : 15,
      );
      runtime.combatTargeting.assertPointInRange(map, casterToken, point, spellRangeFt);
      const aoeOrigin =
        spellId === "spell.burning_hands" ||
        spellId === "spell.lightning_bolt"
          ? runtime.combatCover.toAoeGridCell(runtime.combatCover.toCoverGridPoint(map, casterToken))
          : runtime.combatCover.toAoeGridCell(runtime.combatMovement.mapPointToGridPoint(map, point));
      const aoeDirection =
        spellId === "spell.burning_hands" ||
        spellId === "spell.lightning_bolt"
          ? this.resolveAoeDirection(casterToken, point)
          : undefined;
      const targetTokenIds = runtime.aoeTargeting.resolveTargets({
        shape: areaTargeting.shape,
        origin: aoeOrigin,
        sizeFt: areaTargeting.sizeFt,
        direction: aoeDirection,
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
          cover: runtime.combatCover.resolveAoeCover(
            map,
            spellId === "spell.fireball" || spellId === "spell.moonbeam"
              ? point
              : { x: casterToken.x, y: casterToken.y },
            runtime.combatTargeting.findParticipantToken(map, target),
            saveAbility === "dex",
          ),
        }))
        .filter(({ cover }) => cover.targetable);
      const targets = targetsWithCover.map(({ target }) => target);
      if (!targets.length) {
        throw conflict("COMBAT_409", `${this.resolveSpellDisplayName(spellId)} 범위 안에 대상이 없습니다.`, {
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
        damageDice:
          spellScaling.damageDice ??
          runtime.combatSpells.resolveCombatSpellBaseDamageDice(spellDefinition ?? null) ??
          (spellId === "spell.burning_hands"
            ? "3d6"
            : spellId === "spell.thunderwave"
              ? "2d8"
              : spellId === "spell.moonbeam"
                ? "2d10"
                : "8d6"),
        damageType,
        save: {
          ability: saveAbility,
          dc: saveDc,
          halfDamageOnSuccess: runtime.combatSpells.resolveCombatSpellHalfDamageOnSuccess(spellDefinition),
        },
        targets: aoeTargets,
      });
      diceResults.push(
        aoeResolution.damageRoll,
        ...aoeResolution.targetResults.flatMap((target) => [
          ...target.modifierRolls,
          target.saveRoll,
        ]),
      );
      const applied: string[] = [];
      let latestMovementMap = map;
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
        if (spellId === "spell.thunderwave" && !targetResult.savingThrow.success && target.isAlive) {
          const movement = await runtime.resolveForcedMovementEffect({
            sessionId: session.id,
            combat,
            target,
            map: latestMovementMap,
            mode: "push",
            origin: { x: casterToken.x, y: casterToken.y },
            distanceFt: 10,
          });
          latestMovementMap = movement.responseMap;
          responseMap = movement.responseMap;
          applied[applied.length - 1] += `, ${movement.resolution.distanceMovedFt}ft 밀려남`;
        }
      }
      if (spellId === "spell.moonbeam") {
        const terrainCellId = `${spellId.replace(".", "-")}:${caster.id}:${Date.now()}`;
        const terrainSizePx = Math.max(map.gridSize, (areaTargeting.sizeFt / 5) * map.gridSize);
        responseMap = await runtime.mapRuntimeService.saveSystemVttMap(session.id, {
          ...map,
          terrainCells: [
            ...(map.terrainCells ?? []),
            {
              id: terrainCellId,
              x: runtime.clampNumber(
                Math.floor(point.x - terrainSizePx / 2),
                0,
                Math.max(0, map.width - terrainSizePx),
              ),
              y: runtime.clampNumber(
                Math.floor(point.y - terrainSizePx / 2),
                0,
                Math.max(0, map.height - terrainSizePx),
              ),
              width: terrainSizePx,
              height: terrainSizePx,
              name: "Moonbeam",
              description: "Moonbeam의 지속 광휘 피해 지역",
              terrainEffectId: "terrain.moonbeam",
            },
          ],
          updatedAt: new Date().toISOString(),
        });
        await runtime.startCombatConcentration(combat, caster, {
          spellId,
          targetIds: targets.map((target) => target.id),
          effectIds: [terrainCellId],
          durationRounds: 10,
        });
      }
      message = `${this.resolveSpellDisplayName(spellId)}: ${applied.join(", ")} ${this.resolveDamageTypeLabel(damageType)} 피해`;
    } else if (spellId === "spell.misty_step") {
      const point = dto.point ?? runtime.combatTargeting.requireTargetPoint(map, casterToken);
      runtime.combatTargeting.assertPointInRange(
        map,
        casterToken,
        point,
        runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 30),
      );
      await runtime.combatSpells.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      await runtime.spendCurrentBonusActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      const destination = {
        x: runtime.clampNumber(Math.floor(point.x), 0, Math.max(0, map.width - map.gridSize)),
        y: runtime.clampNumber(Math.floor(point.y), 0, Math.max(0, map.height - map.gridSize)),
      };
      responseMap = await runtime.mapRuntimeService.saveSystemVttMap(session.id, {
        ...map,
        tokens: map.tokens.map((token) =>
          token.id === casterToken.id ? { ...token, ...destination } : token,
        ),
        updatedAt: new Date().toISOString(),
      });
      message = `Misty Step: ${caster.nameSnapshot}이(가) 30ft 안의 지점으로 순간이동했습니다.`;
    } else if (spellId === "spell.dispel_magic") {
      const target = runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantIds?.[0] ?? "");
      runtime.combatTargeting.assertSpellTargetInRange(
        map,
        casterToken,
        target,
        runtime.combatSpells.resolveCombatSpellRangeFt(spellDefinition, 120),
      );
      runtime.combatTargeting.assertSpellTargetLineOfEffect(map, casterToken, target);
      await runtime.combatSpells.assertSpellSlotAvailable(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      await runtime.spendCurrentActionIfNeeded(combat, caster);
      await runtime.combatSpells.spendSpellSlotWithMaximum(session.id, caster.sessionCharacterId, slotLevel, spellSlotMaximum);
      const currentConditionEntries = await runtime.combatConditions.readCombatConditionEntries(target);
      const removableConditionEntries = currentConditionEntries.filter((entry) =>
        runtime.combatConditions.conditionEntryTags(entry).some(
          (tag) =>
            tag.startsWith("condition.spell.") ||
            tag.startsWith("concentration:spell:") ||
            tag.startsWith("roll_bonus:") ||
            tag.startsWith("roll_penalty:"),
        ),
      );
      const removableSet = new Set(removableConditionEntries);
      await runtime.combatConditions.writeCombatConditionEntries(
        target,
        currentConditionEntries.filter((entry) => !removableSet.has(entry)),
      );
      message = removableConditionEntries.length
        ? `Dispel Magic: ${target.nameSnapshot}의 주문 효과 ${removableConditionEntries.length}개를 해제했습니다.`
        : `Dispel Magic: ${target.nameSnapshot}에게 해제할 주문 효과가 없습니다.`;
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

    if (
      spellId !== "spell.invisibility" &&
      runtime
        .parseConditions(caster.conditionsJson ?? "[]")
        .includes("condition:invisible")
    ) {
      await runtime.combatConditions.removeCombatCondition(
        caster,
        "condition.spell.invisibility",
      );
    }

    const updated = await runtime.getActiveCombatEntity(session.id);
    const readySpellCastTriggers = await runtime.resolveReadyActionsForParticipantEvent({
      sessionId: session.id,
      combat: updated,
      sourceParticipantId: caster.id,
      targetParticipantId: dto.targetParticipantIds?.[0] ?? null,
      type: "enemy_casts_spell",
    });
    const response = await runtime.completeCombatIfResolved(session.id, updated);
    const readyActionMessage = readySpellCastTriggers.count > 0 ? ` / 준비행동 ${readySpellCastTriggers.count}개가 발동 대기 중입니다.` : "";
    const turnLogDiceResult = diceResults[0] ? { ...diceResults[0] } : null;
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
          spellId === "spell.fireball" ||
          spellId === "spell.burning_hands" ||
          spellId === "spell.thunderwave" ||
          spellId === "spell.lightning_bolt" ||
          spellId === "spell.moonbeam" ||
          spellId === "spell.faerie_fire" ||
          spellId === "spell.grease"
            ? {
                shape: runtime.combatSpells.resolveCombatAreaTargeting(spellDefinition, spellId).shape,
                sizeFt: runtime.combatSpells.resolveCombatAreaTargeting(spellDefinition, spellId).sizeFt,
                saveAbility: runtime.combatSpells.resolveCombatSpellSaveAbility(spellDefinition, "dex"),
                damageType: runtime.combatSpells.resolveCombatSpellDamageType(spellDefinition, "fire"),
                direction:
                  (spellId === "spell.burning_hands" ||
                    spellId === "spell.lightning_bolt") &&
                  dto.point
                    ? this.resolveAoeDirection(casterToken, dto.point)
                    : null,
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
    concentrationChecks.forEach((check) => {
      check.modifierRolls?.forEach((roll) =>
        runtime.realtimeEvents.emitDiceRolled(session.id, roll),
      );
      runtime.realtimeEvents.emitDiceRolled(session.id, check.diceResult);
    });
    runtime.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(session.id, await runtime.sessionsService.buildSnapshot(session.id));
    return {
      combat: response,
      message: `${message}${readyActionMessage}`,
      attackTotal,
      damageTotal,
      turnLogId: turnLog.turnLogId,
      map: responseMap,
      pendingReaction: readySpellCastTriggers.prompts[0] ?? null,
      pendingReactions: readySpellCastTriggers.prompts,
    };
  }

  private resolveAoeDirection(
    origin: { x: number; y: number },
    point: { x: number; y: number },
  ): AoeDirection {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const horizontal = dx > 0 ? "east" : dx < 0 ? "west" : "";
    const vertical = dy > 0 ? "south" : dy < 0 ? "north" : "";
    if (horizontal && vertical) {
      return `${vertical}_${horizontal}` as AoeDirection;
    }
    return (horizontal || vertical || "east") as AoeDirection;
  }

  private async tryPromptCounterspell(
    runtime: CombatActionRuntime,
    params: {
      sessionId: string;
      combat: CombatWithParticipants;
      caster: CombatParticipantEntity;
      casterToken: NonNullable<
        ReturnType<CombatActionRuntime["combatTargeting"]["findParticipantToken"]>
      >;
      casterUserId: string;
      spellId: string;
      spellLevel: number;
      actionCost: "action" | "bonus_action" | "reaction";
      castDto: CastCombatSpellDto;
      map: VttMapStateDto;
    },
  ): Promise<{
    id: string;
    type: "counterspell";
    reactorParticipantId: string;
    reactorName: string;
    moverParticipantId: string;
    moverName: string;
    message: string;
  } | null> {
    for (const reactor of params.combat.participants) {
      if (
        reactor.id === params.caster.id ||
        reactor.isHostile === params.caster.isHostile ||
        !reactor.isAlive ||
        !reactor.sessionCharacterId ||
        runtime
          .parseConditions(reactor.conditionsJson ?? "[]")
          .some(
            (condition) =>
              condition === "condition:incapacitated" ||
              condition === "condition:stunned" ||
              condition === "reaction:block",
          )
      ) {
        continue;
      }
      const reactorToken = runtime.combatTargeting.findParticipantToken(
        params.map,
        reactor,
      );
      if (
        !reactorToken ||
        runtime.combatMovement.getTokenGridDistanceFt(
          params.map,
          reactorToken,
          params.casterToken,
        ) > 60
      ) {
        continue;
      }
      const reactorSessionCharacter =
        await runtime.combatSpells.getSessionCharacterForSpell(
          reactor.sessionCharacterId,
        );
      try {
        runtime.combatSpells.assertMvpSpellKnown(
          reactorSessionCharacter,
          "spell.counterspell",
        );
      } catch {
        continue;
      }
      const turnState = await runtime.actionEconomy.getOrCreateTurnState({
        combatId: params.combat.id,
        combatParticipantId: reactor.id,
        roundNo: params.combat.roundNo,
        turnNo: params.combat.turnNo,
        sessionCharacterId: reactor.sessionCharacterId,
      });
      if (
        turnState.reactionUsed ||
        (await runtime.combatSpells.getRemainingSpellSlots(
          params.sessionId,
          reactor.sessionCharacterId,
          3,
        )) <= 0
      ) {
        continue;
      }
      const reactorUserId =
        reactorSessionCharacter.userId ||
        reactorSessionCharacter.character.ownerUserId;
      if (!reactorUserId) {
        continue;
      }
      const pending = {
        id: `reaction:counterspell:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        type: "counterspell" as const,
        sessionId: params.sessionId,
        combatId: params.combat.id,
        roundNo: params.combat.roundNo,
        turnNo: params.combat.turnNo,
        reactorParticipantId: reactor.id,
        reactorUserId,
        casterParticipantId: params.caster.id,
        casterUserId: params.casterUserId,
        spellId: params.spellId,
        spellLevel: params.spellLevel,
        actionCost: params.actionCost,
        castDto: params.castDto,
        createdAt: new Date().toISOString(),
      };
      await runtime.combatReactions.storePendingCombatReaction(
        params.sessionId,
        pending,
      );
      const prompt = {
        id: pending.id,
        type: pending.type,
        reactorParticipantId: reactor.id,
        reactorName: reactor.nameSnapshot,
        moverParticipantId: params.caster.id,
        moverName: params.caster.nameSnapshot,
        message: `${params.caster.nameSnapshot}이(가) ${this.resolveSpellDisplayName(params.spellId)}을(를) 시전합니다. Counterspell로 무효화할까요?`,
      };
      runtime.realtimeEvents.emitCombatReactionPrompt(
        params.sessionId,
        reactorUserId,
        prompt,
      );
      return prompt;
    }
    return null;
  }

  private resolveTargetBuffSpellEffect(
    spellId: string,
    spellcastingAbilityModifier: number,
  ): {
    tags: string[];
    durationRounds: number;
    concentration: boolean;
  } {
    switch (spellId) {
      case "spell.guidance":
        return {
          tags: ["roll_bonus:ability_check:1d4"],
          durationRounds: 10,
          concentration: true,
        };
      case "spell.heroism":
        return {
          tags: [
            "immunity:frightened",
            `temporary_hp:turn_start:${Math.max(1, spellcastingAbilityModifier)}`,
          ],
          durationRounds: 10,
          concentration: true,
        };
      case "spell.longstrider":
        return {
          tags: ["movement_speed_bonus:10"],
          durationRounds: 600,
          concentration: false,
        };
      case "spell.invisibility":
        return {
          tags: ["condition:invisible", "ends_on_attack_or_spell"],
          durationRounds: 600,
          concentration: true,
        };
      case "spell.fly":
        return {
          tags: ["movement:flying_speed:60", "movement_speed_override:60"],
          durationRounds: 100,
          concentration: true,
        };
      case "spell.haste":
        return {
          tags: [
            "armor_class:+2",
            "advantage:save:dex",
            "movement_speed_multiplier:2",
            "grant:haste_action",
          ],
          durationRounds: 10,
          concentration: true,
        };
      default:
        return { tags: [], durationRounds: 1, concentration: false };
    }
  }

  private resolveSpellDisplayName(spellId: string): string {
    switch (spellId) {
      case "spell.acid_splash":
        return "Acid Splash";
      case "spell.guidance":
        return "Guidance";
      case "spell.mage_hand":
        return "Mage Hand";
      case "spell.minor_illusion":
        return "Minor Illusion";
      case "spell.shocking_grasp":
        return "Shocking Grasp";
      case "spell.chill_touch":
        return "Chill Touch";
      case "spell.fire_bolt":
        return "Fire Bolt";
      case "spell.ray_of_frost":
        return "Ray of Frost";
      case "spell.sacred_flame":
        return "Sacred Flame";
      case "spell.command":
        return "Command";
      case "spell.cure_wounds":
        return "Cure Wounds";
      case "spell.dispel_magic":
        return "Dispel Magic";
      case "spell.guiding_bolt":
        return "Guiding Bolt";
      case "spell.healing_word":
        return "Healing Word";
      case "spell.hold_person":
        return "Hold Person";
      case "spell.inflict_wounds":
        return "Inflict Wounds";
      case "spell.misty_step":
        return "Misty Step";
      case "spell.scorching_ray":
        return "Scorching Ray";
      case "spell.web":
        return "Web";
      case "spell.burning_hands":
        return "Burning Hands";
      case "spell.thunderwave":
        return "Thunderwave";
      case "spell.fireball":
        return "Fireball";
      case "spell.charm_person":
        return "Charm Person";
      case "spell.faerie_fire":
        return "Faerie Fire";
      case "spell.feather_fall":
        return "Feather Fall";
      case "spell.fog_cloud":
        return "Fog Cloud";
      case "spell.grease":
        return "Grease";
      case "spell.heroism":
        return "Heroism";
      case "spell.hunters_mark":
        return "Hunter's Mark";
      case "spell.longstrider":
        return "Longstrider";
      case "spell.aid":
        return "Aid";
      case "spell.blindness_deafness":
        return "Blindness/Deafness";
      case "spell.darkness":
        return "Darkness";
      case "spell.invisibility":
        return "Invisibility";
      case "spell.lesser_restoration":
        return "Lesser Restoration";
      case "spell.moonbeam":
        return "Moonbeam";
      case "spell.spiritual_weapon":
        return "Spiritual Weapon";
      case "spell.counterspell":
        return "Counterspell";
      case "spell.fly":
        return "Fly";
      case "spell.haste":
        return "Haste";
      case "spell.lightning_bolt":
        return "Lightning Bolt";
      case "spell.revivify":
        return "Revivify";
      default:
        return spellId;
    }
  }

  private resolveDamageTypeLabel(damageType: string): string {
    switch (damageType) {
      case "fire":
        return "화염";
      case "acid":
        return "산성";
      case "cold":
        return "냉기";
      case "force":
        return "역장";
      case "necrotic":
        return "사령";
      case "radiant":
        return "광휘";
      case "lightning":
        return "번개";
      case "thunder":
        return "천둥";
      default:
        return damageType;
    }
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
      auditMetadata?: Record<string, unknown>;
      shieldContinuation?: PendingShieldContinuation | null;
      spellId?: string | null;
      damageType?: string | null;
      skipActorPermissionCheck?: boolean;
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
    } else if (session.gmMode === PrismaGmMode.HUMAN && !options.skipActorPermissionCheck) {
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
    const conditionModifierRolls: Array<{
      source: "spell.bless" | "spell.bane" | "bardic_inspiration";
      roll: DiceRollResponseDto;
      value: number;
    }> = [];
    if (attackerConditions.includes("roll_bonus:attack_roll:1d4")) {
      const roll = runtime.diceService.roll("1d4");
      conditionModifierRolls.push({ source: "spell.bless", roll, value: roll.total });
    }
    if (attackerConditions.includes("roll_penalty:attack_roll:1d4")) {
      const roll = runtime.diceService.roll("1d4");
      conditionModifierRolls.push({ source: "spell.bane", roll, value: -roll.total });
    }
    const bardicInspirationDie = attackerConditions.includes(
      "bardic_inspiration:1d8",
    )
      ? "1d8"
      : attackerConditions.includes("bardic_inspiration:1d6")
        ? "1d6"
        : null;
    if (bardicInspirationDie) {
      const roll = runtime.diceService.roll(bardicInspirationDie);
      conditionModifierRolls.push({
        source: "bardic_inspiration",
        roll,
        value: roll.total,
      });
    }
    const conditionAttackModifier = conditionModifierRolls.reduce(
      (total, modifier) => total + modifier.value,
      0,
    );
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
      if (options.attackAction) {
        await runtime.spendCurrentAttackActionIfNeeded(combat, attacker);
      } else {
        await runtime.spendCurrentActionIfNeeded(combat, attacker);
      }
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

    const totalAttackBonus = attackBonus + conditionAttackModifier;
    const attackRoll = await runtime.rollCombatD20WithRacialLuck(
      attacker,
      `1d20${totalAttackBonus >= 0 ? "+" : ""}${totalAttackBonus}`,
      attackAdvantageState,
    );
    const naturalD20 = runtime.selectNaturalD20(attackRoll.rolls, attackAdvantageState);
    if (bardicInspirationDie) {
      await runtime.combatConditions.removeCombatCondition(
        attacker,
        `bardic_inspiration:${bardicInspirationDie}`,
      );
    }
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
        conditionRollModifiers: conditionModifierRolls.map((modifier) => ({
          source: modifier.source,
          value: modifier.value,
          roll: modifier.roll,
        })),
        targetArmorClass,
        cover: coverRuleResult.produced,
        damageDice: dto.damageDice,
        damageBonus: dto.damageBonus,
        spellId: options.spellId ?? null,
        continuation: options.shieldContinuation ?? null,
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
    const rolledDamageTotal = fixedDamageTotal ?? damageRoll?.total ?? null;
    const damageModifierResult =
      rolledDamageTotal !== null && options.damageType
        ? runtime.ruleEngine.applyDamageModifiers({
            baseDamage: rolledDamageTotal,
            damageType: options.damageType,
            targetImmunities: targetConditions
              .filter((condition) => condition.startsWith("immunity:"))
              .map((condition) => condition.slice("immunity:".length)),
            targetResistances: targetConditions
              .filter((condition) => condition.startsWith("resistance:"))
              .map((condition) => condition.slice("resistance:".length)),
            targetVulnerabilities: targetConditions
              .filter((condition) => condition.startsWith("vulnerability:"))
              .map((condition) => condition.slice("vulnerability:".length)),
          })
        : null;
    const baseDamageTotal =
      damageModifierResult?.produced.finalDamage ?? rolledDamageTotal;
    let damageTotal = baseDamageTotal;
    let huntersMarkDamage = 0;
    if (hit && damageTotal !== null && options.attackAction) {
      const targetConditionEntries =
        await runtime.combatConditions.readCombatConditionEntries(target);
      const markedByAttacker = targetConditionEntries.some((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return false;
        }
        const condition = entry as {
          conditionId?: unknown;
          sourceId?: unknown;
        };
        return (
          condition.conditionId === "condition.spell.hunters_mark" &&
          condition.sourceId === `spell.hunters_mark:${attacker.id}`
        );
      });
      if (markedByAttacker) {
        const huntersMarkRoll = runtime.diceService.roll(
          criticalHit ? "2d6" : "1d6",
        );
        huntersMarkDamage = huntersMarkRoll.total;
        damageTotal += huntersMarkDamage;
        runtime.realtimeEvents.emitDiceRolled(session.id, huntersMarkRoll);
      }
    }
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
        damageTotal =
          sneakAttackResult.produced.damagePacket.totalDamage +
          huntersMarkDamage;
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
    if (attackerConditions.includes("condition:invisible")) {
      await runtime.combatConditions.removeCombatCondition(
        attacker,
        "condition.spell.invisibility",
      );
    }

    const updated = await runtime.getActiveCombatEntity(session.id);
    const readySpellCastTriggers = options.spellId
      ? await runtime.resolveReadyActionsForParticipantEvent({
          sessionId: session.id,
          combat: updated,
          sourceParticipantId: attacker.id,
          targetParticipantId: target.id,
          type: "enemy_casts_spell",
        })
      : { count: 0, prompts: [] };
    const readyAttackTriggers = await runtime.resolveReadyActionsForParticipantEvent({
      sessionId: session.id,
      combat: await runtime.getActiveCombatEntity(session.id),
      sourceParticipantId: attacker.id,
      targetParticipantId: target.id,
      type: "ally_attacked",
    });
    const response = await runtime.completeCombatIfResolved(session.id, updated);
    const baseMessage = hit
      ? `${attacker.nameSnapshot} 공격 명중: ${target.nameSnapshot}에게 ${damageTotal ?? 0} 피해${huntersMarkDamage > 0 ? ` (Hunter's Mark +${huntersMarkDamage})` : ""}${sneakAttackDamage > 0 ? ` (암습 +${sneakAttackDamage})` : ""}`
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
        damageType: options.damageType ?? null,
        damageModifiers:
          damageModifierResult?.produced.appliedDamageModifiers ?? [],
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
        ...(options.auditMetadata ? { metadata: options.auditMetadata } : {}),
      },
      diceResult: { ...attackRoll },
      outcome: hit ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE,
      narration: message,
    });
    runtime.realtimeEvents.emitDiceRolled(session.id, attackRoll);
    conditionModifierRolls.forEach((modifier) =>
      runtime.realtimeEvents.emitDiceRolled(session.id, modifier.roll),
    );
    if (concentrationCheck) {
      concentrationCheck.modifierRolls?.forEach((roll) =>
        runtime.realtimeEvents.emitDiceRolled(session.id, roll),
      );
      runtime.realtimeEvents.emitDiceRolled(session.id, concentrationCheck.diceResult);
    }
    runtime.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(session.id, await runtime.sessionsService.buildSnapshot(session.id));

    const pendingReactions = [...readySpellCastTriggers.prompts, ...readyAttackTriggers.prompts];
    const readyActionMessage = pendingReactions.length > 0 ? ` / 준비행동 ${pendingReactions.length}개가 발동 대기 중입니다.` : "";
    return {
      combat: response,
      message: `${message}${readyActionMessage}`,
      attackTotal: attackRoll.total,
      damageTotal,
      turnLogId: turnLog.turnLogId,
      pendingReaction: pendingReactions[0] ?? null,
      pendingReactions,
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
    await runtime.spendCurrentActionIfNeeded(combat, actor, true);
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
    await runtime.spendCurrentActionIfNeeded(combat, actor, true);
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
