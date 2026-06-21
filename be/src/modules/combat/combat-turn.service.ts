import { Injectable } from "@nestjs/common";
import { CombatEntityType as PrismaCombatEntityType, GmMode as PrismaGmMode } from "@prisma/client";
import {
  ActionOutcome,
  AutoMonsterTurnDto,
  CombatActionResultDto,
  CombatMonsterLifecycleEffectDto,
  CombatStatus,
  DiceAdvantageState,
  DiceRollResponseDto,
  TurnAdvanceResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import { conflict, unprocessable } from "../../common/exceptions/domain-error";
import type { AoeDirection } from "../rules/aoe-targeting.service";
import type { ConditionInstance } from "../rules/condition-runtime.service";
import type { SavingThrowAbility } from "../rules/rule-engine.types";
import type { TerrainEffectTrigger } from "../rules/terrain-effect.service";
import type { SessionsService } from "../sessions/sessions.service";
import type { EnteredTerrainEffect } from "./combat-movement.service";
import type { PendingMonsterMultiattackContinuation } from "./combat-reaction.service";
import type { CombatService } from "./combat.service";
import type { CombatTerrainEffectApplication } from "./combat-terrain.types";
import type { SrdEngineExecutableMonsterAction } from "./srd-engine.types";

type CombatTurnRuntime = ReturnType<CombatService["createCombatTurnRuntime"]>;
type CombatWithParticipants = Awaited<ReturnType<CombatTurnRuntime["getActiveCombatEntity"]>>;
type CombatParticipantEntity = NonNullable<CombatWithParticipants>["participants"][number];
type MonsterActionConditionRiderApplication = {
  saveRolls: DiceRollResponseDto[];
  appliedConditionTags: string[];
};

const COMBAT_CONDITION_DODGE = "combat:dodge";
const COMBAT_CONDITION_DISENGAGE = "combat:disengage";

@Injectable()
export class CombatTurnService {
  async advanceCurrentTurn(runtime: CombatTurnRuntime, sessionId: string, combat: NonNullable<CombatWithParticipants>): Promise<TurnAdvanceResponseDto> {
    const current = combat.participants.find((participant) => participant.id === combat.currentParticipantId);

    if (!current) {
      throw conflict("TURN_409", "이미 턴이 종료되었습니다.", {
        reason: "CURRENT_TURN_NOT_FOUND",
      });
    }

    const aliveParticipants = combat.participants.filter((participant) => participant.isAlive);
    const actionableParticipants = aliveParticipants.filter((participant) => !runtime.combatConditions.isCombatParticipantIncapacitated(participant));
    const turnParticipants = actionableParticipants.length > 0 ? actionableParticipants : aliveParticipants;
    const currentIndex = turnParticipants.findIndex((participant) => participant.id === current.id);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % turnParticipants.length : 0;
    const next = turnParticipants[nextIndex] ?? null;
    const wrappedRound = turnParticipants.length > 0 && nextIndex === 0;
    const nextRoundNo = wrappedRound ? combat.roundNo + 1 : combat.roundNo;
    const nextTurnNo = combat.turnNo + 1;

    const updated = await runtime.prisma.$transaction(async (tx) => {
      // S14P31A201-80: 동시 endTurn 호출 시 currentParticipantId 조건부 update 로
      // 한 번만 통과시킨다. 이미 다음 턴으로 넘어간 뒤 재호출되면 count=0 이므로
      // race 패배자에게 TURN_409 를 명시 반환한다 (앞단 NOT_YOUR_TURN 검증과 트랜잭션 사이의 윈도우 차단).
      const advanced = await tx.combat.updateMany({
        where: {
          id: combat.id,
          currentParticipantId: current.id,
        },
        data: {
          currentParticipantId: next?.id ?? null,
          turnNo: nextTurnNo,
          roundNo: nextRoundNo,
        },
      });

      if (advanced.count === 0) {
        throw conflict("TURN_409", "이미 턴이 종료되었습니다.", {
          reason: "TURN_ALREADY_ADVANCED",
        });
      }

      await tx.combatParticipant.update({
        where: { id: current.id },
        data: { turnEndedAt: new Date() },
      });

      return tx.combat.findUniqueOrThrow({
        where: { id: combat.id },
        include: { participants: { orderBy: { turnOrder: "asc" } } },
      });
    });

    if (next) {
      await runtime.combatConditions.removeCombatCondition(next, COMBAT_CONDITION_DODGE);
    }
    await runtime.combatConditions.removeCombatCondition(current, COMBAT_CONDITION_DISENGAGE);
    await Promise.all(
      updated.participants
        .filter((participant) => participant.isAlive)
        .map((participant) =>
          runtime.actionEconomy.getOrCreateTurnState({
            combatId: updated.id,
            combatParticipantId: participant.id,
            roundNo: updated.roundNo,
            turnNo: updated.turnNo,
            sessionCharacterId: participant.sessionCharacterId,
          }),
        ),
    );

    const turnEndReadyActions = await runtime.resolveReadyActionsForParticipantEvent({
      sessionId,
      combat: updated,
      sourceParticipantId: current.id,
      targetParticipantId: current.id,
      type: "turn_end",
      eventRoundNo: combat.roundNo,
      eventTurnNo: combat.turnNo,
    });
    const turnStartReadyActions = next
      ? await runtime.resolveReadyActionsForParticipantEvent({
          sessionId,
          combat: updated,
          sourceParticipantId: next.id,
          targetParticipantId: next.id,
          type: "turn_start",
        })
      : { count: 0, prompts: [] };
    const readyActionPrompts = [...turnEndReadyActions.prompts, ...turnStartReadyActions.prompts];
    const expiredRageCount = await runtime.endExpiredRagesForCombat(updated);
    const expiredReadyActionCount = await runtime.expireReadyActionsForTurn(sessionId, updated);
    const turnEndTerrainApplication = await runtime.applyTurnEndTerrainConditionEffects(updated, current);
    const expiredConcentrationEffectCount =
      await runtime.expireCombatConcentrationLinkedEffects(
        updated,
        current,
        updated.roundNo,
        updated.turnNo,
      );
    const expiredConditionCount = await runtime.combatConditions.resolveTurnEndConditions(current, updated.roundNo, updated.turnNo);
    const turnStartTerrainApplication = next
      ? await runtime.applyTurnStartTerrainEffects(sessionId, updated, next)
      : {
          damageRoll: null,
          damageRolls: [],
          damageTotal: 0,
          saveRolls: [],
          appliedConditionTags: [],
          removedConditionTags: [],
          concentrationCheck: null,
        };
    const monsterRecharge = next
      ? await runtime.combatMonsterResources.resolveMonsterRechargeActionsForTurnStart(sessionId, next)
      : { rechargedCount: 0, diceRolls: [] };
    const turnEndMonsterLifecycleEffects = await this.resolveMonsterLifecycleEffects(runtime, sessionId, current, "turn_end");
    const turnStartMonsterLifecycleEffects = next
      ? await this.resolveMonsterLifecycleEffects(runtime, sessionId, next, "turn_start")
      : [];
    const auraMonsterLifecycleEffects = next
      ? await this.resolveMonsterLifecycleEffects(runtime, sessionId, next, "aura")
      : [];
    const monsterLifecycleEffects = [
      ...turnEndMonsterLifecycleEffects,
      ...turnStartMonsterLifecycleEffects,
      ...auraMonsterLifecycleEffects,
    ];

    const turnMessage =
      [
        runtime.combatTerrain.describeLifecycle("턴 종료", turnEndTerrainApplication),
        runtime.combatTerrain.describeLifecycle("턴 시작", turnStartTerrainApplication),
        this.describeMonsterRecharge(monsterRecharge),
        this.describeMonsterLifecycleEffects(monsterLifecycleEffects),
        expiredConcentrationEffectCount > 0
          ? `집중 효과 ${expiredConcentrationEffectCount}개가 종료되었습니다.`
          : null,
        readyActionPrompts.length > 0 ? `준비행동 ${readyActionPrompts.length}개가 발동 대기 중입니다.` : null,
      ]
        .filter((message): message is string => Boolean(message))
        .join(" / ") || undefined;
    const turnStartTerrainEffects = runtime.combatTerrain.toResult("on_turn_start", turnStartTerrainApplication);
    const turnEndTerrainEffects = runtime.combatTerrain.toResult("on_turn_end", turnEndTerrainApplication);
    const response: TurnAdvanceResponseDto = {
      combatId: updated.id,
      endedEntityId: current.id,
      nextEntityId: next?.id ?? null,
      roundNo: updated.roundNo,
      turnNo: updated.turnNo,
      ...(turnMessage ? { message: turnMessage } : {}),
      ...(turnStartTerrainEffects ? { terrainEffects: turnStartTerrainEffects } : {}),
      ...(turnEndTerrainEffects ? { turnEndTerrainEffects } : {}),
      ...(monsterLifecycleEffects.length > 0 ? { monsterLifecycleEffects } : {}),
      ...(readyActionPrompts.length > 0 ? { pendingReactions: readyActionPrompts } : {}),
    };

    if (response.message) {
      const { sessionScenario } = await runtime.sessionsService.getGameStateEntityOrThrow(sessionId);
      const turnLog = await runtime.turnLogsService.createTurnLog({
        sessionId,
        sessionScenarioId: sessionScenario.id,
        actorUserId: null,
        sessionCharacterId: current.sessionCharacterId ?? null,
        rawInput: null,
        structuredAction: {
          type: "turn_terrain_lifecycle",
          endedEntityId: current.id,
          nextEntityId: next?.id ?? null,
          roundNo: updated.roundNo,
          turnNo: updated.turnNo,
          turnEndTerrainEffects: response.turnEndTerrainEffects ?? null,
          turnStartTerrainEffects: response.terrainEffects ?? null,
          monsterRecharge: {
            rechargedCount: monsterRecharge.rechargedCount,
            diceRolls: monsterRecharge.diceRolls,
          },
          monsterLifecycleEffects: response.monsterLifecycleEffects ?? [],
          readyActionTriggers: readyActionPrompts.map((prompt) => ({
            id: prompt.id,
            reactorParticipantId: prompt.reactorParticipantId,
            eventParticipantId: prompt.moverParticipantId,
          })),
        },
        diceResult: (turnEndTerrainApplication.damageRoll ?? turnStartTerrainApplication.damageRoll ?? monsterRecharge.diceRolls[0] ?? null) as unknown as Record<string, unknown> | null,
        stateDiff: null,
        outcome: ActionOutcome.NO_ROLL,
        narration: response.message,
      });
      runtime.realtimeEvents.emitTurnLogCreated(sessionId, turnLog);
    }

    runtime.realtimeEvents.emitTurnChanged(sessionId, response);
    for (const damage of turnEndTerrainApplication.damageRolls) {
      runtime.realtimeEvents.emitDiceRolled(sessionId, damage.roll);
    }
    if (turnEndTerrainApplication.concentrationCheck) {
      turnEndTerrainApplication.concentrationCheck.modifierRolls?.forEach((roll) =>
        runtime.realtimeEvents.emitDiceRolled(sessionId, roll),
      );
      runtime.realtimeEvents.emitDiceRolled(sessionId, turnEndTerrainApplication.concentrationCheck.diceResult);
    }
    for (const saveRoll of turnStartTerrainApplication.saveRolls) {
      runtime.realtimeEvents.emitDiceRolled(sessionId, saveRoll);
    }
    for (const damage of turnStartTerrainApplication.damageRolls) {
      runtime.realtimeEvents.emitDiceRolled(sessionId, damage.roll);
    }
    if (turnStartTerrainApplication.concentrationCheck) {
      turnStartTerrainApplication.concentrationCheck.modifierRolls?.forEach((roll) =>
        runtime.realtimeEvents.emitDiceRolled(sessionId, roll),
      );
      runtime.realtimeEvents.emitDiceRolled(sessionId, turnStartTerrainApplication.concentrationCheck.diceResult);
    }
    for (const rechargeRoll of monsterRecharge.diceRolls) {
      runtime.realtimeEvents.emitDiceRolled(sessionId, rechargeRoll);
    }
    const latestCombatAfterTerrainEffects = await runtime.getActiveCombatEntity(sessionId);
    const combatAfterTerrainEffects =
      turnEndTerrainApplication.damageTotal > 0 || turnStartTerrainApplication.damageTotal > 0
        ? await runtime.completeCombatIfResolved(sessionId, latestCombatAfterTerrainEffects)
        : await runtime.mapCombat(latestCombatAfterTerrainEffects);
    runtime.realtimeEvents.emitCombatUpdated(sessionId, combatAfterTerrainEffects);
    if (
      expiredRageCount > 0 ||
      expiredReadyActionCount > 0 ||
      readyActionPrompts.length > 0 ||
      expiredConditionCount > 0 ||
      monsterRecharge.rechargedCount > 0 ||
      monsterLifecycleEffects.length > 0 ||
      turnEndTerrainApplication.damageRoll ||
      turnStartTerrainApplication.damageRoll ||
      turnStartTerrainApplication.appliedConditionTags.length > 0
    ) {
      runtime.realtimeEvents.emitSessionSnapshot(sessionId, await runtime.sessionsService.buildSnapshot(sessionId));
    }
    if (
      combatAfterTerrainEffects.status === CombatStatus.ACTIVE &&
      readyActionPrompts.length === 0 &&
      !runtime.serverAutoMonsterTurnSessions.has(sessionId)
    ) {
      runtime.logAutoMonsterTurn("advanceCurrentTurn checking monster automation", {
        sessionId,
        combatId: updated.id,
        currentParticipantId: updated.currentParticipantId,
      });
      await runtime.runServerAutoMonsterTurns(sessionId);
    }
    return response;
  }

  private async resolveMonsterLifecycleEffects(
    runtime: CombatTurnRuntime,
    sessionId: string,
    participant: CombatParticipantEntity,
    hook: CombatMonsterLifecycleEffectDto["hook"],
  ): Promise<CombatMonsterLifecycleEffectDto[]> {
    if (participant.entityType !== PrismaCombatEntityType.MONSTER || !participant.isAlive) {
      return [];
    }

    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    const map = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(session), sessionId);
    const token = runtime.combatTargeting.findParticipantToken(map, participant);
    const actions = runtime.combatMonsterActions.listExecutableActionsForParticipant(participant, token);
    return runtime.combatMonsterResources.resolveMonsterLifecycleEffectsForTurnHook({
      actor: participant,
      hook,
      actions,
    });
  }

  private describeMonsterLifecycleEffects(effects: CombatMonsterLifecycleEffectDto[]): string | null {
    if (effects.length === 0) {
      return null;
    }
    const labels = Array.from(new Set(effects.map((effect) => `${effect.actorName} ${effect.label}`)));
    return `몬스터 지속 능력 확인: ${labels.join(", ")}`;
  }

  private describeMonsterRecharge(recharge: { rechargedCount: number; diceRolls: DiceRollResponseDto[] }): string | null {
    if (recharge.diceRolls.length === 0) {
      return null;
    }
    return recharge.rechargedCount > 0
      ? `몬스터 재충전 ${recharge.rechargedCount}개 성공`
      : "몬스터 재충전 없음";
  }

  async autoMonsterTurn(runtime: CombatTurnRuntime, userId: string, sessionId: string, dto: AutoMonsterTurnDto = {}): Promise<CombatActionResultDto> {
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    await runtime.sessionsService.ensureMembership(userId, session.id);
    if (session.gmMode === PrismaGmMode.HUMAN) {
      await runtime.ensureHost(userId, session.id);
    }

    return runtime.executeAutoMonsterTurn(userId, session, dto);
  }

  async executeAutoMonsterTurn(
    runtime: CombatTurnRuntime,
    userId: string,
    session: Awaited<ReturnType<CombatTurnRuntime["sessionsService"]["getSessionEntityOrThrow"]>>,
    dto: AutoMonsterTurnDto = {},
  ): Promise<CombatActionResultDto> {
    runtime.logAutoMonsterTurn("executeAutoMonsterTurn entered", {
      sessionId: session.id,
      userId,
      targetParticipantId: dto.targetParticipantId ?? null,
      actionId: dto.actionId ?? null,
      autoEndTurn: dto.autoEndTurn ?? null,
    });
    const combat = await runtime.getActiveCombatEntity(session.id);
    const attacker = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    if (
      !attacker ||
      attacker.entityType !== PrismaCombatEntityType.MONSTER ||
      !attacker.isHostile ||
      !attacker.isAlive ||
      runtime.combatConditions.isCombatParticipantIncapacitated(attacker)
    ) {
      runtime.logAutoMonsterTurn("executeAutoMonsterTurn rejected: current turn is not hostile monster", {
        sessionId: session.id,
        combatId: combat.id,
        currentParticipantId: combat.currentParticipantId,
        currentParticipant: attacker
          ? {
              id: attacker.id,
              name: attacker.nameSnapshot,
              entityType: attacker.entityType,
              isHostile: attacker.isHostile,
              isAlive: attacker.isAlive,
            }
          : null,
      });
      throw conflict("COMBAT_409", "현재 턴의 몬스터가 없습니다.", {
        reason: "CURRENT_TURN_IS_NOT_MONSTER",
      });
    }

    const map = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(session), session.id);
    const token = runtime.combatTargeting.findParticipantToken(map, attacker);
    const { state } = await runtime.sessionsService.getGameStateEntityOrThrow(session.id);
    let flags: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(state.flagsJson ?? "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        flags = parsed as Record<string, unknown>;
      }
    } catch {
      flags = {};
    }
    const action = runtime.combatMonsterActions.resolveMonsterActionForParticipant(
      attacker,
      token,
      dto.actionId,
      flags,
    );
    if (action.attackKind === "special") {
      return runtime.resolveMonsterSpecialAction({
        userId,
        session,
        combat,
        actor: attacker,
        action,
        targetParticipantId: dto.targetParticipantId ?? null,
        autoEndTurn: dto.autoEndTurn !== false,
      });
    }
    runtime.logAutoMonsterTurn("monster action selected", {
      sessionId: session.id,
      combatId: combat.id,
      attackerId: attacker.id,
      attackerName: attacker.nameSnapshot,
      tokenId: token?.id ?? attacker.tokenId,
      tokenFound: Boolean(token),
      tokenMonsterId: token?.monster?.id ?? null,
      inferredMonsterId: action.monsterId,
      actionId: action?.actionId ?? null,
      actionLabel: action?.label ?? null,
    });

    const target = dto.targetParticipantId
      ? runtime.findCombatParticipantOrThrow(combat, dto.targetParticipantId)
      : combat.participants.find((participant) => !participant.isHostile && participant.isAlive);
    runtime.logAutoMonsterTurn("monster target selected", {
      sessionId: session.id,
      combatId: combat.id,
      attackerId: attacker.id,
      targetId: target?.id ?? null,
      targetName: target?.nameSnapshot ?? null,
      targetIsHostile: target?.isHostile ?? null,
      targetIsAlive: target?.isAlive ?? null,
    });
    if (!target || target.isHostile || !target.isAlive) {
      throw unprocessable("COMBAT_422", "몬스터가 공격할 수 있는 대상이 없습니다.", {
        reason: "MONSTER_TARGET_NOT_FOUND",
      });
    }

    const targetToken = target.tokenId
      ? (map.tokens ?? []).find((candidate) => candidate.id === target.tokenId)
      : (map.tokens ?? []).find((candidate) => candidate.sessionCharacterId === target.sessionCharacterId);
    const movementTarget =
      token && targetToken
        ? runtime.combatMovement.calculateCombatTokenStepTowardTarget(map, {
            sourceTokenId: token.id,
            targetTokenId: targetToken.id,
            maxDistanceFt: attacker.speedFt ?? 30,
            stopWithinFt: action.reachFt ?? 5,
          })
        : null;
    const movementResult =
      movementTarget && token
        ? await runtime.resolveCombatMovement({
            session,
            userId,
            combat,
            mover: attacker,
            map,
            moverToken: token,
            to: movementTarget,
            path: movementTarget.path,
            movementMode: "normal",
            continuation: {
              type: "auto_monster_attack",
              userId,
              targetParticipantId: target.id,
              targetTokenId: targetToken?.id ?? null,
              autoEndTurn: dto.autoEndTurn !== false,
              action,
            },
          })
        : null;
    runtime.logAutoMonsterTurn("monster movement resolved", {
      sessionId: session.id,
      combatId: combat.id,
      attackerId: attacker.id,
      sourceTokenId: token?.id ?? attacker.tokenId,
      targetTokenId: targetToken?.id ?? null,
      targetTokenFound: Boolean(targetToken),
      moved: (movementResult?.movementDistanceFt ?? 0) > 0,
      distanceMovedFt: movementResult?.movementDistanceFt ?? 0,
    });

    const mapAfterMovement = movementResult?.map ?? map;
    if (movementResult?.pendingReaction) {
      return {
        combat: movementResult.combat,
        message: movementResult.message,
        attackTotal: null,
        damageTotal: null,
        map: movementResult.map,
        pendingReaction: movementResult.pendingReaction,
      };
    }
    if (movementResult && movementResult.combat.status !== CombatStatus.ACTIVE) {
      return {
        combat: movementResult.combat,
        message: movementResult.message,
        attackTotal: null,
        damageTotal: null,
        map: movementResult.map,
      };
    }
    const latestAfterMovement = await runtime.getActiveCombatEntity(session.id);
    const attackerAfterMovement = runtime.findCombatParticipantOrThrow(latestAfterMovement, attacker.id);
    if (!attackerAfterMovement.isAlive) {
      const response = await runtime.completeCombatIfResolved(session.id, latestAfterMovement);
      runtime.realtimeEvents.emitCombatUpdated(session.id, response);
      return {
        combat: response,
        message: movementResult?.message ?? `${attacker.nameSnapshot}은(는) 이동 중 쓰러졌습니다.`,
        attackTotal: null,
        damageTotal: null,
        map: mapAfterMovement,
      };
    }
    return runtime.resolveMonsterAttackAction({
      userId,
      session,
      combat: latestAfterMovement,
      attacker: attackerAfterMovement,
      target,
      action,
      map: mapAfterMovement,
      sourceTokenId: token?.id ?? attacker.tokenId ?? null,
      targetTokenId: targetToken?.id ?? null,
      movementDistanceFt: movementResult?.movementDistanceFt ?? 0,
      autoEndTurn: dto.autoEndTurn !== false,
      autoEndTurnWhenOutOfRange: true,
    });
  }

  scheduleServerAutoMonsterTurns(runtime: CombatTurnRuntime, sessionId: string): void {
    if (runtime.serverAutoMonsterTurnSessions.has(sessionId) || runtime.serverAutoMonsterTurnScheduledSessions.has(sessionId)) {
      runtime.logAutoMonsterTurn("schedule skipped: automation already running or scheduled", {
        sessionId,
        running: runtime.serverAutoMonsterTurnSessions.has(sessionId),
        scheduled: runtime.serverAutoMonsterTurnScheduledSessions.has(sessionId),
      });
      return;
    }

    runtime.logAutoMonsterTurn("schedule queued", { sessionId });
    runtime.serverAutoMonsterTurnScheduledSessions.add(sessionId);
    setTimeout(() => {
      runtime.serverAutoMonsterTurnScheduledSessions.delete(sessionId);
      runtime.logAutoMonsterTurn("scheduled run starting", { sessionId });
      void runtime.runServerAutoMonsterTurns(sessionId);
    }, 50);
  }

  isCurrentTurnAutoMonster(runtime: CombatTurnRuntime, combat: NonNullable<CombatWithParticipants>): boolean {
    const current = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
    return Boolean(
      current &&
      current.entityType === PrismaCombatEntityType.MONSTER &&
      current.isHostile &&
      current.isAlive &&
      !runtime.combatConditions.isCombatParticipantIncapacitated(current),
    );
  }

  async runServerAutoMonsterTurns(runtime: CombatTurnRuntime, sessionId: string): Promise<void> {
    if (runtime.serverAutoMonsterTurnSessions.has(sessionId)) {
      runtime.logAutoMonsterTurn("run skipped: automation already running", {
        sessionId,
      });
      return;
    }

    runtime.logAutoMonsterTurn("run started", { sessionId });
    runtime.serverAutoMonsterTurnSessions.add(sessionId);
    try {
      for (let step = 0; step < 20; step += 1) {
        const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
        runtime.logAutoMonsterTurn("run step session loaded", {
          sessionId: session.id,
          step,
          gmMode: session.gmMode,
        });
        if (session.gmMode === PrismaGmMode.HUMAN) {
          runtime.logAutoMonsterTurn("run stopped: HUMAN GM session", {
            sessionId: session.id,
            step,
          });
          return;
        }
        if (await runtime.hasPendingTriggeredReadyAction(session.id)) {
          runtime.logAutoMonsterTurn("run stopped: ready action response pending", {
            sessionId: session.id,
            step,
          });
          return;
        }

        let combat: NonNullable<CombatWithParticipants>;
        try {
          combat = await runtime.getActiveCombatEntity(session.id);
        } catch {
          runtime.logAutoMonsterTurn("run stopped: active combat not found", {
            sessionId: session.id,
            step,
          });
          return;
        }

        const current = combat.participants.find((participant) => participant.id === combat.currentParticipantId);
        runtime.logAutoMonsterTurn("run step combat loaded", {
          sessionId: session.id,
          step,
          combatId: combat.id,
          status: combat.status,
          roundNo: combat.roundNo,
          turnNo: combat.turnNo,
          currentParticipantId: combat.currentParticipantId,
          currentParticipant: current
            ? {
                id: current.id,
                name: current.nameSnapshot,
                entityType: current.entityType,
                isHostile: current.isHostile,
                isAlive: current.isAlive,
                tokenId: current.tokenId,
              }
            : null,
        });
        if (runtime.isCombatResolved(combat)) {
          runtime.logAutoMonsterTurn("run completing resolved combat", {
            sessionId: session.id,
            step,
            combatId: combat.id,
          });
          await runtime.completeCombat(session.id, combat.id);
          return;
        }
        if (
          current &&
          current.entityType === PrismaCombatEntityType.MONSTER &&
          current.isHostile &&
          current.isAlive &&
          runtime.combatConditions.isCombatParticipantIncapacitated(current)
        ) {
          runtime.logAutoMonsterTurn("run skipping incapacitated monster", {
            sessionId: session.id,
            step,
            currentParticipantId: current.id,
          });
          await runtime.advanceCurrentTurn(session.id, combat);
          continue;
        }
        if (
          !current ||
          current.entityType !== PrismaCombatEntityType.MONSTER ||
          !current.isHostile ||
          !current.isAlive ||
          runtime.combatConditions.isCombatParticipantIncapacitated(current)
        ) {
          runtime.logAutoMonsterTurn("run stopped: current participant is not actionable monster", {
            sessionId: session.id,
            step,
            currentParticipantId: combat.currentParticipantId,
          });
          return;
        }

        try {
          await runtime.executeAutoMonsterTurn(runtime.getGmRuntimeUserId(session), session, {});
          if (await runtime.combatReactions.hasPendingCombatReaction(session.id)) {
            runtime.logAutoMonsterTurn("run stopped: pending combat reaction", {
              sessionId: session.id,
              step,
            });
            return;
          }
        } catch (error) {
          const message = runtime.extractErrorMessage(error);
          runtime.logger.warn(`Auto monster turn failed session=${session.id} participant=${current.id}: ${message}`);
          runtime.realtimeEvents.emitSystemMessage(
            session.id,
            "AUTO_MONSTER_TURN_FAILED",
            `몬스터 자동 턴 실패: ${current.nameSnapshot} 행동을 처리하지 못했습니다. 원인: ${message}. 턴을 넘깁니다.`,
          );

          const latestCombat = await runtime.getActiveCombatEntity(session.id);
          if (latestCombat.currentParticipantId === current.id) {
            await runtime.advanceCurrentTurn(session.id, latestCombat);
          }
        }
      }
      runtime.logAutoMonsterTurn("run stopped: max step guard reached", {
        sessionId,
        maxSteps: 20,
      });
    } catch (error) {
      runtime.realtimeEvents.emitSystemMessage(
        sessionId,
        "AUTO_MONSTER_TURN_LOOP_FAILED",
        `몬스터 자동 턴 루프가 중단되었습니다. 원인: ${runtime.extractErrorMessage(error)}`,
      );
      runtime.logger.error(`Auto monster turn loop failed session=${sessionId}: ${runtime.extractErrorMessage(error)}`);
    } finally {
      runtime.serverAutoMonsterTurnSessions.delete(sessionId);
      runtime.logAutoMonsterTurn("run finished", { sessionId });
    }
  }

  logAutoMonsterTurn(runtime: CombatTurnRuntime, message: string, data: Record<string, unknown> = {}): void {
    const isTest = process.env.NODE_ENV === "test";
    const isAutoMonsterDebugEnabled = process.env.AUTO_MONSTER_DEBUG === "1";

    if (isTest && !isAutoMonsterDebugEnabled) {
      return;
    }

    const line = `[AUTO_MONSTER] ${message} ${JSON.stringify(data)}`;
    runtime.logger.log(line);
    // Nest Logger 설정/transport가 꺼져 있어도 전투 자동 진행 추적은 개발 콘솔에 반드시 남긴다.
    console.log(line);
  }

  extractErrorMessage(runtime: CombatTurnRuntime, error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (error && typeof error === "object" && "response" in error) {
      const response = (error as { response?: unknown }).response;
      if (response && typeof response === "object" && "message" in response) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) {
          return message;
        }
      }
    }
    return "알 수 없는 오류";
  }

  async resolveMonsterAttackAction(
    runtime: CombatTurnRuntime,
    params: {
      userId: string;
      session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
      combat: NonNullable<CombatWithParticipants>;
      attacker: CombatParticipantEntity;
      target: CombatParticipantEntity;
      action: SrdEngineExecutableMonsterAction;
      map: VttMapStateDto;
      sourceTokenId: string | null;
      targetTokenId: string | null;
      movementDistanceFt?: number;
      actionCost?: "action" | "none";
      autoEndTurn: boolean;
      autoEndTurnWhenOutOfRange: boolean;
      shieldContinuation?: PendingMonsterMultiattackContinuation | null;
    },
  ): Promise<CombatActionResultDto> {
    const rangeCheck = runtime.combatMonsterActions.getMonsterActionRangeCheck(params.map, {
      action: params.action,
      sourceTokenId: params.sourceTokenId,
      targetTokenId: params.targetTokenId,
    });
    if (!rangeCheck.inRange) {
      runtime.logAutoMonsterTurn("monster attack skipped: target out of range", {
        sessionId: params.session.id,
        combatId: params.combat.id,
        attackerId: params.attacker.id,
        sourceTokenId: params.sourceTokenId,
        targetTokenId: params.targetTokenId,
        actionId: params.action.actionId,
        actionLabel: params.action.label,
        distanceFt: rangeCheck.distanceFt,
        rangeFt: rangeCheck.rangeFt,
      });

      if (params.autoEndTurn && params.autoEndTurnWhenOutOfRange) {
        const latestCombat = await runtime.getActiveCombatEntity(params.session.id);
        if (latestCombat.currentParticipantId === params.attacker.id) {
          await runtime.advanceCurrentTurn(params.session.id, latestCombat);
        }
        return {
          combat: await runtime.mapCombat(await runtime.getActiveCombatEntity(params.session.id)),
          message: "",
          attackTotal: null,
          damageTotal: null,
        };
      }

      throw conflict("COMBAT_409", "대상이 몬스터 행동 사거리 밖에 있습니다.", {
        reason: "TARGET_OUT_OF_MONSTER_ACTION_RANGE",
        distanceFt: rangeCheck.distanceFt,
        rangeFt: rangeCheck.rangeFt,
      });
    }

    runtime.logAutoMonsterTurn("monster attack resolving", {
      sessionId: params.session.id,
      combatId: params.combat.id,
      attackerId: params.attacker.id,
      targetId: params.target.id,
      attackBonus: params.action.attackBonus,
      damageDice: params.action.damageDice,
    });
    await runtime.combatMonsterResources.assertMonsterRechargeActionAvailable(params.session.id, params.attacker, params.action);
    await runtime.combatMonsterResources.assertMonsterLimitedUseActionAvailable(params.session.id, params.attacker, params.action);
    await runtime.combatMonsterResources.recordMonsterRechargeActionExpended(params.session.id, params.combat, params.attacker, params.action);
    await runtime.combatMonsterResources.recordMonsterLimitedUseActionExpended(params.session.id, params.combat, params.attacker, params.action);
    const result = await runtime.resolveAttack(
      params.userId,
      params.session.id,
      {
        attackerParticipantId: params.attacker.id,
        targetParticipantId: params.target.id,
        attackBonus: params.action.attackBonus,
        damageDice: params.action.damageDice,
        damageBonus: 0,
      },
      {
        actionCost: params.actionCost ?? "action",
        forceDisadvantage: rangeCheck.longRangeDisadvantage,
        auditMetadata: {
          source: "monster_action",
          monsterAction: {
            monsterId: params.action.monsterId,
            actionId: params.action.actionId,
            label: params.action.label,
            attackKind: params.action.attackKind,
            costType: params.action.costType ?? "action",
            recharge: params.action.recharge ?? null,
            usage: params.action.usage ?? null,
            save: params.action.save ?? null,
            conditionRiders: params.action.conditionRiders ?? [],
            effectTags: params.action.effectTags ?? [],
            damageType: params.action.damageType ?? null,
          },
          resourceChecks: {
            rechargeChecked: runtime.combatMonsterResources.isRechargeMonsterAction(params.action),
            limitedUseLimit: runtime.combatMonsterResources.resolveMonsterLimitedUseLimit(params.action),
          },
        },
        shieldContinuation: params.shieldContinuation ?? null,
        skipActorPermissionCheck: params.actionCost === "none",
      },
    );
    runtime.logAutoMonsterTurn("monster attack resolved", {
      sessionId: params.session.id,
      combatId: result.combat.combatId,
      attackerId: params.attacker.id,
      targetId: params.target.id,
      attackTotal: result.attackTotal,
      damageTotal: result.damageTotal,
      combatStatus: result.combat.status,
    });
    const conditionRiders =
      result.damageTotal !== null
        ? await runtime.applyMonsterActionConditionRiders(params.session.id, params.combat, params.target, params.action)
        : { saveRolls: [], appliedConditionTags: [] };
    conditionRiders.saveRolls.forEach((roll) => runtime.realtimeEvents.emitDiceRolled(params.session.id, roll));
    let resultWithRiders = result;
    if (conditionRiders.appliedConditionTags.length > 0) {
      const latestCombat = await runtime.getActiveCombatEntity(params.session.id);
      const refreshedCombat = await runtime.mapCombat(latestCombat);
      runtime.realtimeEvents.emitCombatUpdated(params.session.id, refreshedCombat);
      runtime.realtimeEvents.emitSessionSnapshot(params.session.id, await runtime.sessionsService.buildSnapshot(params.session.id));
      resultWithRiders = { ...result, combat: refreshedCombat };
    }

    const movementMessage = (params.movementDistanceFt ?? 0) > 0 ? ` ${params.movementDistanceFt ?? 0}ft 이동 후` : "";
    const actionMessage = `${params.attacker.nameSnapshot}${movementMessage} ${params.action.label}`;
    const riderMessage = conditionRiders.appliedConditionTags.length ? ` / ${conditionRiders.appliedConditionTags.join(", ")} 적용` : "";
    if (await runtime.combatReactions.hasPendingCombatReaction(params.session.id)) {
      return {
        ...resultWithRiders,
        message: `${actionMessage}: ${resultWithRiders.message}${riderMessage}`,
      };
    }
    if (!params.autoEndTurn || resultWithRiders.combat.status !== CombatStatus.ACTIVE) {
      return {
        ...resultWithRiders,
        message: `${actionMessage}: ${resultWithRiders.message}${riderMessage}`,
      };
    }

    const updated = await runtime.getActiveCombatEntity(params.session.id);
    const combatToAdvance =
      updated.currentParticipantId === params.attacker.id
        ? updated
        : params.combat.currentParticipantId === params.attacker.id
          ? params.combat
          : null;
    if (combatToAdvance) {
      runtime.logAutoMonsterTurn("monster auto ending turn", {
        sessionId: params.session.id,
        combatId: combatToAdvance.id,
        attackerId: params.attacker.id,
      });
      await runtime.advanceCurrentTurn(params.session.id, combatToAdvance);
    }

    return {
      ...resultWithRiders,
      combat: await runtime.mapCombat(await runtime.getCombatEntityById(resultWithRiders.combat.combatId)),
      message: `${actionMessage}: ${resultWithRiders.message}${riderMessage} / 턴 종료`,
    };
  }

  async applyMonsterActionConditionRiders(
    runtime: CombatTurnRuntime,
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    target: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<MonsterActionConditionRiderApplication> {
    const conditionRiders = Array.isArray(action.conditionRiders) ? action.conditionRiders.filter(Boolean) : [];
    if (conditionRiders.length === 0) {
      return { saveRolls: [], appliedConditionTags: [] };
    }

    const saveResolution = await runtime.resolveMonsterActionRiderSave(target, action);
    if (saveResolution && saveResolution.success) {
      return {
        saveRolls: [
          ...(saveResolution.modifierRolls ?? []),
          ...(saveResolution.diceResult ? [saveResolution.diceResult] : []),
        ],
        appliedConditionTags: [],
      };
    }

    const appliedConditionTags: string[] = [];
    for (const conditionId of conditionRiders) {
      appliedConditionTags.push(conditionId);
      await runtime.combatConditions.addCombatConditionInstance(
        target,
        runtime.conditionRuntime.createCondition({
          conditionId,
          sourceId: action.actionId,
          saveEnds: runtime.resolveMonsterActionSaveEnds(action),
          appliedAtRound: combat.roundNo,
          tags: ["monster_action", `monster_action:${action.actionId}`],
        }),
      );
    }

    return {
      saveRolls: [
        ...(saveResolution?.modifierRolls ?? []),
        ...(saveResolution?.diceResult ? [saveResolution.diceResult] : []),
      ],
      appliedConditionTags: Array.from(new Set(appliedConditionTags)),
    };
  }

  async resolveMonsterActionRiderSave(
    runtime: CombatTurnRuntime,
    target: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<{
    diceResult: DiceRollResponseDto | null;
    modifierRolls?: DiceRollResponseDto[];
    success: boolean;
  } | null> {
    const saveEnds = runtime.resolveMonsterActionSaveEnds(action);
    if (!saveEnds) {
      return null;
    }
    const profile = await runtime.resolveParticipantSavingThrowProfile(target, saveEnds.ability);
    const diceResult = runtime.diceService.roll(`1d20${profile.saveModifier >= 0 ? "+" : ""}${profile.saveModifier}`);
    const result = runtime.ruleEngine.resolveSavingThrow({
      ability: saveEnds.ability,
      naturalD20: runtime.selectNaturalD20(diceResult.rolls, DiceAdvantageState.NORMAL),
      difficultyClass: saveEnds.dc,
      abilityModifier: profile.abilityModifier,
      proficiencyBonus: profile.proficiencyBonus,
      proficient: profile.proficient,
      advantageState: "normal",
      bonusModifiers: profile.conditionModifiers,
    });
    return {
      diceResult,
      modifierRolls: profile.modifierRolls,
      success: result.produced.success,
    };
  }

  resolveMonsterActionSaveEnds(runtime: CombatTurnRuntime, action: SrdEngineExecutableMonsterAction): ConditionInstance["saveEnds"] {
    const ability = runtime.toSavingThrowAbility(action.save?.ability);
    const dc = runtime.resolveMonsterActionSaveDc(action);
    if (!ability || dc === null) {
      return null;
    }
    return { ability, dc };
  }

  resolveMonsterActionSaveDc(runtime: CombatTurnRuntime, action: SrdEngineExecutableMonsterAction): number | null {
    if (typeof action.save?.fixedDc === "number" && Number.isInteger(action.save.fixedDc)) {
      return action.save.fixedDc;
    }
    const tagDc = (action.effectTags ?? []).map((tag) => /^save_dc:(\d+)$/.exec(tag)?.[1] ?? null).find((value): value is string => value !== null);
    if (!tagDc) {
      return null;
    }
    const dc = Number(tagDc);
    return Number.isInteger(dc) ? dc : null;
  }

  toSavingThrowAbility(runtime: CombatTurnRuntime, value: string | null | undefined): SavingThrowAbility | null {
    return value === "str" || value === "dex" || value === "con" || value === "int" || value === "wis" || value === "cha" ? value : null;
  }

  async resolveMonsterSpecialAction(
    runtime: CombatTurnRuntime,
    params: {
      userId: string;
      session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
      combat: NonNullable<CombatWithParticipants>;
      actor: CombatParticipantEntity;
      action: SrdEngineExecutableMonsterAction;
      targetParticipantId?: string | null;
      autoEndTurn: boolean;
    },
  ): Promise<CombatActionResultDto> {
    await runtime.ensureActorCanAct(params.userId, params.session.id, params.combat, params.actor);
    await runtime.combatMonsterResources.assertMonsterRechargeActionAvailable(
      params.session.id,
      params.actor,
      params.action,
    );
    await runtime.combatMonsterResources.assertMonsterLimitedUseActionAvailable(
      params.session.id,
      params.actor,
      params.action,
    );
    const costType = "costType" in params.action && typeof params.action.costType === "string" ? params.action.costType : "action";
    if (costType === "bonus_action") {
      await runtime.spendCurrentBonusActionIfNeeded(params.combat, params.actor);
    } else {
      await runtime.spendCurrentActionIfNeeded(params.combat, params.actor);
    }

    const effectTags = "effectTags" in params.action && Array.isArray(params.action.effectTags) ? params.action.effectTags : [];
    const specialType = "specialType" in params.action && typeof params.action.specialType === "string" ? params.action.specialType : null;
    if (specialType === "multiattack") {
      return runtime.resolveMonsterMultiattackAction({
        userId: params.userId,
        session: params.session,
        combat: params.combat,
        actor: params.actor,
        action: params.action,
        effectTags,
        targetParticipantId: params.targetParticipantId ?? null,
        autoEndTurn: params.autoEndTurn,
      });
    }
    if (specialType === "area_attack") {
      return this.resolveMonsterAreaSaveAction(runtime, {
        ...params,
        effectTags,
      });
    }
    const condition = specialType === "mobility" && effectTags.includes("disengage") ? COMBAT_CONDITION_DISENGAGE : null;
    if (!condition) {
      throw unprocessable("COMBAT_422", "지원하지 않는 몬스터 특수 행동입니다.", {
        reason: "MONSTER_SPECIAL_ACTION_UNSUPPORTED",
        actionId: params.action.actionId,
        specialType,
        effectTags,
      });
    }

    await runtime.combatMonsterResources.assertMonsterRechargeActionAvailable(params.session.id, params.actor, params.action);
    await runtime.combatMonsterResources.assertMonsterLimitedUseActionAvailable(params.session.id, params.actor, params.action);
    await runtime.combatMonsterResources.recordMonsterRechargeActionExpended(params.session.id, params.combat, params.actor, params.action);
    await runtime.combatMonsterResources.recordMonsterLimitedUseActionExpended(params.session.id, params.combat, params.actor, params.action);
    await runtime.combatConditions.addCombatCondition(params.actor, condition);
    const { sessionScenario } = await runtime.sessionsService.getGameStateEntityOrThrow(params.session.id);
    if (params.autoEndTurn) {
      const latestCombat = await runtime.getActiveCombatEntity(params.session.id);
      if (latestCombat.currentParticipantId === params.actor.id) {
        await runtime.advanceCurrentTurn(params.session.id, latestCombat);
      }
    }

    const updated = await runtime.getActiveCombatEntity(params.session.id);
    const response = await runtime.mapCombat(updated);
    const message = `${params.actor.nameSnapshot}은(는) ${params.action.label}로 교전에서 빠져나갈 틈을 만들었습니다.`;
    const turnLog = await runtime.turnLogsService.createTurnLog({
      sessionId: params.session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: params.userId,
      sessionCharacterId: params.actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "monster_special",
        actionId: params.action.actionId,
        monsterId: params.action.monsterId,
        label: params.action.label,
        specialType,
        condition,
        costType,
        recharge: params.action.recharge ?? null,
        usage: params.action.usage ?? null,
        save: params.action.save ?? null,
        conditionRiders: params.action.conditionRiders ?? [],
        effectTags,
        resourceChecks: {
          rechargeChecked: runtime.combatMonsterResources.isRechargeMonsterAction(params.action),
          limitedUseLimit: runtime.combatMonsterResources.resolveMonsterLimitedUseLimit(params.action),
        },
      },
      diceResult: null,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    runtime.realtimeEvents.emitTurnLogCreated(params.session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(params.session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(params.session.id, await runtime.sessionsService.buildSnapshot(params.session.id));

    return {
      combat: response,
      message: params.autoEndTurn ? `${message} / 턴 종료` : message,
      attackTotal: null,
      damageTotal: null,
      turnLogId: turnLog.turnLogId,
    };
  }

  private async resolveMonsterAreaSaveAction(
    runtime: CombatTurnRuntime,
    params: {
      userId: string;
      session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
      combat: NonNullable<CombatWithParticipants>;
      actor: CombatParticipantEntity;
      action: SrdEngineExecutableMonsterAction;
      targetParticipantId?: string | null;
      autoEndTurn: boolean;
      effectTags: string[];
    },
  ): Promise<CombatActionResultDto> {
    const saveAbility = runtime.toSavingThrowAbility(params.action.save?.ability);
    const saveDc = runtime.resolveMonsterActionSaveDc(params.action);
    const shape = params.effectTags.includes("area:cone")
      ? "cone"
      : params.effectTags.includes("area:line")
        ? "line"
        : params.effectTags.includes("area:sphere")
          ? "sphere"
          : params.effectTags.includes("area:cube")
            ? "cube"
            : null;
    const sizeFt =
      typeof params.action.rangeFt?.normal === "number" && params.action.rangeFt.normal > 0
        ? params.action.rangeFt.normal
        : typeof params.action.reachFt === "number" && params.action.reachFt > 0
          ? params.action.reachFt
          : 15;

    if (!saveAbility || saveDc === null || !params.action.damageDice || !shape) {
      throw unprocessable("COMBAT_422", "몬스터 범위 행동 구성이 올바르지 않습니다.", {
        reason: "MONSTER_AREA_ACTION_INVALID",
        actionId: params.action.actionId,
      });
    }

    const map = await runtime.sessionsService.getVttMapForUser(
      runtime.getGmRuntimeUserId(params.session),
      params.session.id,
    );
    const actorToken = runtime.combatTargeting.findParticipantToken(map, params.actor);
    const anchor =
      (params.targetParticipantId
        ? runtime.findCombatParticipantOrThrow(params.combat, params.targetParticipantId)
        : null) ??
      params.combat.participants.find(
        (participant) =>
          participant.isAlive && participant.isHostile !== params.actor.isHostile,
      );
    const anchorToken = anchor
      ? runtime.combatTargeting.findParticipantToken(map, anchor)
      : null;
    if (!actorToken || !anchor || !anchorToken) {
      throw unprocessable("COMBAT_422", "몬스터 범위 행동의 방향 기준 대상을 찾을 수 없습니다.", {
        reason: "MONSTER_AREA_TARGET_NOT_FOUND",
        actionId: params.action.actionId,
      });
    }

    const origin = runtime.combatCover.toAoeGridCell(
      runtime.combatCover.toCoverGridPoint(map, actorToken),
    );
    const direction = this.resolveAoeDirection(actorToken, anchorToken);
    const targeting = runtime.aoeTargeting.resolveTargets({
      shape,
      origin,
      sizeFt,
      direction,
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
    const affected = params.combat.participants.filter(
      (participant) =>
        participant.id !== params.actor.id &&
        participant.isAlive &&
        participant.isHostile !== params.actor.isHostile &&
        participant.tokenId &&
        targeting.tokenIds.includes(participant.tokenId),
    );
    if (!affected.length) {
      throw unprocessable("COMBAT_422", "몬스터 범위 행동 안에 유효한 대상이 없습니다.", {
        reason: "MONSTER_AREA_HAS_NO_TARGETS",
        actionId: params.action.actionId,
      });
    }

    await runtime.combatMonsterResources.assertMonsterRechargeActionAvailable(
      params.session.id,
      params.actor,
      params.action,
    );
    await runtime.combatMonsterResources.assertMonsterLimitedUseActionAvailable(
      params.session.id,
      params.actor,
      params.action,
    );
    await runtime.combatMonsterResources.recordMonsterRechargeActionExpended(
      params.session.id,
      params.combat,
      params.actor,
      params.action,
    );
    await runtime.combatMonsterResources.recordMonsterLimitedUseActionExpended(
      params.session.id,
      params.combat,
      params.actor,
      params.action,
    );

    const targets = await Promise.all(
      affected.map(async (participant) => {
        const targetToken = runtime.combatTargeting.findParticipantToken(map, participant);
        const cover = runtime.combatCover.resolveAoeCover(
          map,
          { x: actorToken.x, y: actorToken.y },
          targetToken,
          saveAbility === "dex",
        );
        return runtime.toCombatAoeDamageTarget(participant, map, saveAbility, cover);
      }),
    );
    const damageType = params.action.damageType ?? "untyped";
    const resolution = runtime.aoeDamage.resolveDamage({
      sourceId: params.action.actionId,
      damageDice: params.action.damageDice,
      damageType,
      save: {
        ability: saveAbility,
        dc: saveDc,
        halfDamageOnSuccess: params.effectTags.includes("half_damage_on_success"),
      },
      targets,
    });
    const applied: string[] = [];
    for (const targetResult of resolution.targetResults) {
      const target = affected.find(
        (participant) => participant.id === targetResult.targetId,
      );
      if (!target) {
        continue;
      }
      await runtime.finalizeCombatDamage(params.combat, target, targetResult.finalDamage);
      applied.push(`${target.nameSnapshot} ${targetResult.finalDamage}`);
    }

    const { sessionScenario } = await runtime.sessionsService.getGameStateEntityOrThrow(
      params.session.id,
    );
    let updated = await runtime.getActiveCombatEntity(params.session.id);
    const response = runtime.isCombatResolved(updated)
      ? await runtime.completeCombatIfResolved(params.session.id, updated)
      : await (async () => {
          if (
            params.autoEndTurn &&
            updated.status === CombatStatus.ACTIVE &&
            updated.currentParticipantId === params.actor.id
          ) {
            await runtime.advanceCurrentTurn(params.session.id, updated);
            updated = await runtime.getActiveCombatEntity(params.session.id);
          }
          return runtime.mapCombat(updated);
        })();
    const message = `${params.actor.nameSnapshot} ${params.action.label}: ${applied.join(", ")} ${damageType} 피해`;
    const turnLog = await runtime.turnLogsService.createTurnLog({
      sessionId: params.session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: params.userId,
      sessionCharacterId: params.actor.sessionCharacterId ?? null,
      rawInput: null,
      structuredAction: {
        type: "monster_area_attack",
        actionId: params.action.actionId,
        monsterId: params.action.monsterId,
        label: params.action.label,
        shape,
        sizeFt,
        direction,
        save: params.action.save ?? null,
        recharge: params.action.recharge ?? null,
        usage: params.action.usage ?? null,
        affectedTargetIds: affected.map((participant) => participant.id),
        targetResults: resolution.targetResults,
      },
      diceResult: { ...resolution.damageRoll },
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });
    runtime.realtimeEvents.emitDiceRolled(params.session.id, resolution.damageRoll);
    resolution.targetResults.forEach((target) => {
      target.modifierRolls.forEach((roll) =>
        runtime.realtimeEvents.emitDiceRolled(params.session.id, roll),
      );
      runtime.realtimeEvents.emitDiceRolled(params.session.id, target.saveRoll);
    });
    runtime.realtimeEvents.emitTurnLogCreated(params.session.id, turnLog);
    runtime.realtimeEvents.emitCombatUpdated(params.session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(
      params.session.id,
      await runtime.sessionsService.buildSnapshot(params.session.id),
    );

    return {
      combat: response,
      message: params.autoEndTurn ? `${message} / 턴 종료` : message,
      attackTotal: null,
      damageTotal: resolution.targetResults.reduce(
        (total, target) => total + target.finalDamage,
        0,
      ),
      turnLogId: turnLog.turnLogId,
    };
  }

  private resolveAoeDirection(
    source: VttMapStateDto["tokens"][number],
    target: VttMapStateDto["tokens"][number],
  ): AoeDirection {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const horizontal = dx > 0 ? "east" : dx < 0 ? "west" : "";
    const vertical = dy > 0 ? "south" : dy < 0 ? "north" : "";
    if (horizontal && vertical) {
      return `${vertical}_${horizontal}` as AoeDirection;
    }
    return (horizontal || vertical || "north") as AoeDirection;
  }

  async resolveMonsterMultiattackAction(
    runtime: CombatTurnRuntime,
    params: {
      userId: string;
      session: Awaited<ReturnType<SessionsService["getSessionEntityOrThrow"]>>;
      combat: NonNullable<CombatWithParticipants>;
      actor: CombatParticipantEntity;
      action: SrdEngineExecutableMonsterAction;
      effectTags: string[];
      targetParticipantId?: string | null;
      autoEndTurn: boolean;
    },
  ): Promise<CombatActionResultDto> {
    const attacks = runtime.parseMonsterMultiattackTags(params.effectTags);
    if (attacks.length === 0) {
      throw unprocessable("COMBAT_422", "몬스터 multiattack 구성이 비어 있습니다.", {
        reason: "MONSTER_MULTIATTACK_EMPTY",
        actionId: params.action.actionId,
      });
    }

    await runtime.combatMonsterResources.assertMonsterRechargeActionAvailable(params.session.id, params.actor, params.action);
    await runtime.combatMonsterResources.assertMonsterLimitedUseActionAvailable(params.session.id, params.actor, params.action);
    await runtime.combatMonsterResources.recordMonsterRechargeActionExpended(params.session.id, params.combat, params.actor, params.action);
    await runtime.combatMonsterResources.recordMonsterLimitedUseActionExpended(params.session.id, params.combat, params.actor, params.action);

    const map = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(params.session), params.session.id);
    const actorToken = runtime.combatTargeting.findParticipantToken(map, params.actor);
    const target = params.targetParticipantId
      ? runtime.findCombatParticipantOrThrow(params.combat, params.targetParticipantId)
      : params.combat.participants.find((participant) => !participant.isHostile && participant.isAlive);
    if (!target || target.isHostile || !target.isAlive) {
      throw unprocessable("COMBAT_422", "몬스터가 공격할 수 있는 대상이 없습니다.", {
        reason: "MONSTER_TARGET_NOT_FOUND",
      });
    }
    const targetToken = runtime.combatTargeting.findParticipantToken(map, target);
    const childActions = [
      ...runtime.monsterAbilities.listExecutableActions(params.action.monsterId),
      ...runtime.srdEngine.getExecutableMonsterActions(params.action.monsterId),
    ];

    const expandedChildActions: SrdEngineExecutableMonsterAction[] = [];
    for (const attack of attacks) {
      const childAction = childActions.find(
        (candidate) => candidate.actionId === attack.actionId || ("catalogEntryId" in candidate && candidate.catalogEntryId === attack.actionId),
      );
      if (!childAction || childAction.attackKind === "special") {
        throw unprocessable("COMBAT_422", "몬스터 multiattack 하위 공격을 찾을 수 없습니다.", {
          reason: "MONSTER_MULTIATTACK_CHILD_NOT_FOUND",
          actionId: params.action.actionId,
          childActionId: attack.actionId,
        });
      }
      for (let index = 0; index < attack.count; index += 1) {
        expandedChildActions.push(childAction);
      }
    }

    const results: CombatActionResultDto[] = [];
    for (let index = 0; index < expandedChildActions.length; index += 1) {
      const childAction = expandedChildActions[index];
      const remainingActions = expandedChildActions.slice(index + 1);
      const result = await runtime.resolveMonsterAttackAction({
        userId: params.userId,
        session: params.session,
        combat: params.combat,
        attacker: params.actor,
        target,
        action: childAction,
        map,
        sourceTokenId: actorToken?.id ?? params.actor.tokenId ?? null,
        targetTokenId: targetToken?.id ?? target.tokenId ?? null,
        movementDistanceFt: 0,
        actionCost: "none",
        autoEndTurn: false,
        autoEndTurnWhenOutOfRange: false,
        shieldContinuation: remainingActions.length
          ? {
              type: "monster_multiattack",
              userId: params.userId,
              actorParticipantId: params.actor.id,
              targetParticipantId: target.id,
              targetTokenId: targetToken?.id ?? target.tokenId ?? null,
              autoEndTurn: params.autoEndTurn,
              parentAction: params.action,
              remainingActions,
            }
          : null,
      });
      results.push(result);
      if (await runtime.combatReactions.hasPendingCombatReaction(params.session.id)) {
        return {
          ...result,
          message: `${params.actor.nameSnapshot} ${params.action.label}: ${result.message}`,
        };
      }
    }

    if (params.autoEndTurn) {
      const latestCombat = await runtime.getActiveCombatEntity(params.session.id);
      if (latestCombat.currentParticipantId === params.actor.id) {
        await runtime.advanceCurrentTurn(params.session.id, latestCombat);
      }
    }

    const updated = await runtime.getActiveCombatEntity(params.session.id);
    const response = await runtime.mapCombat(updated);
    const totalDamage = results.reduce((sum, result) => sum + (result.damageTotal ?? 0), 0);
    const lastAttackTotal = results.length ? results[results.length - 1].attackTotal : null;
    const message = `${params.actor.nameSnapshot} ${params.action.label}: ${results
      .map((result) => result.message)
      .join(" / ")}${params.autoEndTurn ? " / 턴 종료" : ""}`;

    runtime.realtimeEvents.emitCombatUpdated(params.session.id, response);
    runtime.realtimeEvents.emitSessionSnapshot(params.session.id, await runtime.sessionsService.buildSnapshot(params.session.id));

    return {
      combat: response,
      message,
      attackTotal: lastAttackTotal,
      damageTotal: totalDamage,
      turnLogId: results[results.length - 1]?.turnLogId,
    };
  }

  parseMonsterMultiattackTags(runtime: CombatTurnRuntime, effectTags: string[]): Array<{ actionId: string; count: number }> {
    return effectTags.flatMap((tag) => {
      const match = /^multiattack:([^:]+)(?::(\d+))?$/.exec(tag);
      if (!match) {
        return [];
      }
      const count = match[2] ? Number(match[2]) : 1;
      if (!Number.isInteger(count) || count <= 0) {
        return [];
      }
      return [{ actionId: match[1], count }];
    });
  }

  async applyEnteredTerrainEffects(
    runtime: CombatTurnRuntime,
    combat: NonNullable<CombatWithParticipants>,
    target: CombatParticipantEntity,
    enteredEffects: EnteredTerrainEffect[],
    trigger: TerrainEffectTrigger,
  ): Promise<CombatTerrainEffectApplication> {
    const triggeredEffects = Array.from(
      new Map(
        enteredEffects
          .filter((entered) => runtime.terrainEffects.supportsTrigger(entered.effect, trigger))
          .map((entered) => [entered.terrainEffectId, entered]),
      ).values(),
    );
    if (triggeredEffects.length === 0) {
      return {
        damageRoll: null,
        damageRolls: [],
        damageTotal: 0,
        saveRolls: [],
        appliedConditionTags: [],
        removedConditionTags: [],
        concentrationCheck: null,
      };
    }

    const saveRolls: DiceRollResponseDto[] = [];
    const failedOrUnavoidableEffects: EnteredTerrainEffect[] = [];
    for (const entered of triggeredEffects) {
      const saveEnds = runtime.combatTerrain.resolveSaveEnds(entered.effect);
      if (!saveEnds) {
        failedOrUnavoidableEffects.push(entered);
        continue;
      }
      const profile = await runtime.resolveParticipantSavingThrowProfile(target, saveEnds.ability);
      const diceResult = runtime.diceService.roll(`1d20${profile.saveModifier >= 0 ? "+" : ""}${profile.saveModifier}`);
      saveRolls.push(...profile.modifierRolls, diceResult);
      const result = runtime.ruleEngine.resolveSavingThrow({
        ability: saveEnds.ability,
        naturalD20: runtime.selectNaturalD20(diceResult.rolls, DiceAdvantageState.NORMAL),
        difficultyClass: saveEnds.dc,
        abilityModifier: profile.abilityModifier,
        proficiencyBonus: profile.proficiencyBonus,
        proficient: profile.proficient,
        advantageState: "normal",
        bonusModifiers: profile.conditionModifiers,
      });
      if (!result.produced.success) {
        failedOrUnavoidableEffects.push(entered);
      }
    }

    const effectiveCombinedEffect = failedOrUnavoidableEffects.length
      ? runtime.terrainEffects.resolveCombinedEffects(failedOrUnavoidableEffects.map((entered) => entered.terrainEffectId))
      : null;
    const damageRolls = (effectiveCombinedEffect?.damagePackets ?? []).map((packet) => ({
      sourceEffectId: packet.sourceEffectId,
      damageType: packet.type,
      roll: runtime.diceService.roll(packet.dice),
    }));
    const damageRoll = damageRolls[0]?.roll ?? null;
    const damageTotal = damageRolls.reduce((sum, damage) => sum + damage.roll.total, 0);
    const { concentrationCheck } = await runtime.finalizeCombatDamage(combat, target, damageTotal);

    const appliedConditionTags: string[] = [];
    for (const entered of failedOrUnavoidableEffects) {
      for (const condition of entered.effect.conditionTags) {
        appliedConditionTags.push(condition);
        await runtime.combatConditions.addCombatConditionInstance(
          target,
          runtime.conditionRuntime.createCondition({
            conditionId: condition,
            sourceId: entered.terrainEffectId,
            saveEnds: runtime.combatTerrain.resolveSaveEnds(entered.effect),
            appliedAtRound: combat.roundNo,
            tags: entered.effect.runtimeTags,
          }),
        );
      }
    }

    return {
      damageRoll,
      damageRolls,
      damageTotal,
      saveRolls,
      appliedConditionTags: Array.from(new Set(appliedConditionTags)),
      removedConditionTags: [],
      concentrationCheck,
    };
  }

  async applyTurnStartTerrainEffects(
    runtime: CombatTurnRuntime,
    sessionId: string,
    combat: NonNullable<CombatWithParticipants>,
    participant: CombatParticipantEntity,
  ): Promise<CombatTerrainEffectApplication> {
    if (!participant.isAlive || !participant.tokenId) {
      return {
        damageRoll: null,
        damageRolls: [],
        damageTotal: 0,
        saveRolls: [],
        appliedConditionTags: [],
        removedConditionTags: [],
        concentrationCheck: null,
      };
    }
    const session = await runtime.sessionsService.getSessionEntityOrThrow(sessionId);
    const map = await runtime.sessionsService.getVttMapForUser(runtime.getGmRuntimeUserId(session), sessionId);
    const token = runtime.combatTargeting.findParticipantToken(map, participant);
    if (!token) {
      return {
        damageRoll: null,
        damageRolls: [],
        damageTotal: 0,
        saveRolls: [],
        appliedConditionTags: [],
        removedConditionTags: [],
        concentrationCheck: null,
      };
    }

    const enteredEffects = runtime.combatMovement.resolveTerrainEffectsAtPoint(map, {
      x: token.x,
      y: token.y,
    });
    return runtime.applyEnteredTerrainEffects(combat, participant, enteredEffects, "on_turn_start");
  }

  async applyTurnEndTerrainConditionEffects(
    runtime: CombatTurnRuntime,
    combat: NonNullable<CombatWithParticipants>,
    participant: CombatParticipantEntity,
  ): Promise<CombatTerrainEffectApplication> {
    if (!participant.isAlive) {
      return runtime.combatTerrain.emptyApplication();
    }
    const conditions = runtime.conditionRuntime.parseConditionsJson(JSON.stringify(await runtime.combatConditions.readCombatConditionEntries(participant)));
    const packets = new Map<string, { sourceEffectId: string; damageType: string; expression: string }>();
    for (const condition of conditions) {
      if (!condition.sourceId?.startsWith("terrain.") || !condition.tags.includes("trigger:on_turn_end")) {
        continue;
      }
      const damageTag = condition.tags.find((tag) => tag.startsWith("damage_over_time:"));
      if (!damageTag) {
        continue;
      }
      const [, damageType = "untyped", expression = "1d6"] = damageTag.split(":");
      const key = `${condition.sourceId}:${damageType}:${expression}`;
      packets.set(key, {
        sourceEffectId: condition.sourceId,
        damageType,
        expression,
      });
    }
    if (packets.size === 0) {
      return runtime.combatTerrain.emptyApplication();
    }

    const damageRolls = Array.from(packets.values()).map((packet) => ({
      sourceEffectId: packet.sourceEffectId,
      damageType: packet.damageType,
      roll: runtime.diceService.roll(packet.expression),
    }));
    const damageTotal = damageRolls.reduce((total, damage) => total + damage.roll.total, 0);
    const { concentrationCheck } = await runtime.finalizeCombatDamage(combat, participant, damageTotal);
    return {
      ...runtime.combatTerrain.emptyApplication(),
      damageRoll: damageRolls[0]?.roll ?? null,
      damageRolls,
      damageTotal,
      concentrationCheck,
    };
  }

  async applyExitedTerrainEffects(
    runtime: CombatTurnRuntime,
    participant: CombatParticipantEntity,
    exitedEffects: EnteredTerrainEffect[],
  ): Promise<CombatTerrainEffectApplication> {
    const sourceIds = new Set(
      exitedEffects.filter((entered) => runtime.terrainEffects.supportsTrigger(entered.effect, "on_exit")).map((entered) => entered.terrainEffectId),
    );
    if (sourceIds.size === 0) {
      return runtime.combatTerrain.emptyApplication();
    }

    const current = await runtime.combatConditions.readCombatConditionEntries(participant);
    const removedConditionTags: string[] = [];
    const remaining = current.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return true;
      }
      const condition = entry as Partial<ConditionInstance>;
      if (!condition.sourceId || !sourceIds.has(condition.sourceId) || !condition.tags?.includes("condition_ends:on_exit")) {
        return true;
      }
      if (condition.conditionId) {
        removedConditionTags.push(condition.conditionId);
      }
      return false;
    });
    if (remaining.length !== current.length) {
      await runtime.combatConditions.writeCombatConditionEntries(participant, remaining);
    }

    return {
      ...runtime.combatTerrain.emptyApplication(),
      removedConditionTags: Array.from(new Set(removedConditionTags)),
    };
  }
}
