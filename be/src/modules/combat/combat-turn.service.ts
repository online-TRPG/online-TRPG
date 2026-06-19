import { Injectable } from "@nestjs/common";
import { CombatEntityType as PrismaCombatEntityType, GmMode as PrismaGmMode } from "@prisma/client";
import {
  ActionOutcome,
  AutoMonsterTurnDto,
  CombatActionResultDto,
  CombatStatus,
  DiceAdvantageState,
  DiceRollResponseDto,
  TurnAdvanceResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import { conflict, unprocessable } from "../../common/exceptions/domain-error";
import type { ConditionInstance } from "../rules/condition-runtime.service";
import type { SavingThrowAbility } from "../rules/rule-engine.types";
import type { TerrainEffectTrigger } from "../rules/terrain-effect.service";
import type { SessionsService } from "../sessions/sessions.service";
import type { EnteredTerrainEffect } from "./combat-movement.service";
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

    const expiredRageCount = await runtime.endExpiredRagesForCombat(updated);
    const expiredReadyActionCount = await runtime.expireReadyActionsForTurn(sessionId, updated);
    const turnEndTerrainApplication = await runtime.applyTurnEndTerrainConditionEffects(updated, current);
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

    const turnMessage =
      [
        runtime.combatTerrain.describeLifecycle("턴 종료", turnEndTerrainApplication),
        runtime.combatTerrain.describeLifecycle("턴 시작", turnStartTerrainApplication),
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
        },
        diceResult: (turnEndTerrainApplication.damageRoll ?? turnStartTerrainApplication.damageRoll ?? null) as unknown as Record<string, unknown> | null,
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
      runtime.realtimeEvents.emitDiceRolled(sessionId, turnEndTerrainApplication.concentrationCheck.diceResult);
    }
    for (const saveRoll of turnStartTerrainApplication.saveRolls) {
      runtime.realtimeEvents.emitDiceRolled(sessionId, saveRoll);
    }
    for (const damage of turnStartTerrainApplication.damageRolls) {
      runtime.realtimeEvents.emitDiceRolled(sessionId, damage.roll);
    }
    if (turnStartTerrainApplication.concentrationCheck) {
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
      expiredConditionCount > 0 ||
      monsterRecharge.rechargedCount > 0 ||
      turnEndTerrainApplication.damageRoll ||
      turnStartTerrainApplication.damageRoll ||
      turnStartTerrainApplication.appliedConditionTags.length > 0
    ) {
      runtime.realtimeEvents.emitSessionSnapshot(sessionId, await runtime.sessionsService.buildSnapshot(sessionId));
    }
    if (combatAfterTerrainEffects.status === CombatStatus.ACTIVE && !runtime.serverAutoMonsterTurnSessions.has(sessionId)) {
      runtime.logAutoMonsterTurn("advanceCurrentTurn checking monster automation", {
        sessionId,
        combatId: updated.id,
        currentParticipantId: updated.currentParticipantId,
      });
      await runtime.runServerAutoMonsterTurns(sessionId);
    }
    return response;
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
    const action = runtime.combatMonsterActions.resolveMonsterActionForParticipant(attacker, token, dto.actionId);
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
    if (updated.currentParticipantId === params.attacker.id) {
      runtime.logAutoMonsterTurn("monster auto ending turn", {
        sessionId: params.session.id,
        combatId: updated.id,
        attackerId: params.attacker.id,
      });
      await runtime.advanceCurrentTurn(params.session.id, updated);
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
        saveRolls: saveResolution.diceResult ? [saveResolution.diceResult] : [],
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
      saveRolls: saveResolution?.diceResult ? [saveResolution.diceResult] : [],
      appliedConditionTags: Array.from(new Set(appliedConditionTags)),
    };
  }

  async resolveMonsterActionRiderSave(
    runtime: CombatTurnRuntime,
    target: CombatParticipantEntity,
    action: SrdEngineExecutableMonsterAction,
  ): Promise<{
    diceResult: DiceRollResponseDto | null;
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
    });
    return { diceResult, success: result.produced.success };
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
        specialType,
        condition,
        effectTags,
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

    const results: CombatActionResultDto[] = [];
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
        });
        results.push(result);
        if (await runtime.combatReactions.hasPendingCombatReaction(params.session.id)) {
          return {
            ...result,
            message: `${params.actor.nameSnapshot} ${params.action.label}: ${result.message}`,
          };
        }
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
      saveRolls.push(diceResult);
      const result = runtime.ruleEngine.resolveSavingThrow({
        ability: saveEnds.ability,
        naturalD20: runtime.selectNaturalD20(diceResult.rolls, DiceAdvantageState.NORMAL),
        difficultyClass: saveEnds.dc,
        abilityModifier: profile.abilityModifier,
        proficiencyBonus: profile.proficiencyBonus,
        proficient: profile.proficient,
        advantageState: "normal",
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
