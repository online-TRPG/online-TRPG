import { Injectable } from "@nestjs/common";
import { CombatStatus as PrismaCombatStatus } from "@prisma/client";
import { ActionOutcome } from "@trpg/shared-types";
import { badRequest } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { DiceService } from "../rules/dice.service";
import { ExecutableItemDefinition } from "../rules/p3-item-manifest";
import { MapRuntimeService } from "../sessions/map-runtime.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import {
  buildFireballItemSpellLogModel,
  buildMagicMissileItemSpellLogModel,
  buildPointItemTerrainCell,
  buildWebItemSpellLogModel,
  findParticipantMapToken,
  findParticipantsInItemRadius,
  resolveMapDistanceFt,
} from "./inventory-item-policy";

@Injectable()
export class InventoryItemSpellRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly mapRuntimeService: MapRuntimeService,
    private readonly turnLogsService: TurnLogsService,
    private readonly diceService: DiceService,
  ) {}

  async resolveExecutableItemSpellEffect(params: {
    userId: string;
    sessionId: string;
    sessionScenarioId: string;
    actorUserId: string;
    actorSessionCharacterId: string;
    itemEntryId: string;
    itemDefinitionId: string;
    itemName: string;
    executableItem: ExecutableItemDefinition;
    spellEffect: { type: "spell"; spellId: string; slotLevel: number };
    targetParticipantId: string | null;
    point: { x: number; y: number } | null;
    remainingCharges: number | null;
  }): Promise<{
    message: string;
    diceResults: ReturnType<DiceService["roll"]>[];
    turnLog: Awaited<ReturnType<TurnLogsService["createTurnLog"]>>;
  }> {
    const combat = await this.prisma.combat.findFirst({
      where: {
        sessionId: params.sessionId,
        status: PrismaCombatStatus.ACTIVE,
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });
    if (!combat) {
      throw badRequest("INVENTORY_400", "전투 중에만 이 마법 아이템을 사용할 수 있습니다.", {
        reason: "ITEM_SPELL_REQUIRES_ACTIVE_COMBAT",
        spellId: params.spellEffect.spellId,
      });
    }
    const actor = combat.participants.find(
      (participant) =>
        participant.sessionCharacterId === params.actorSessionCharacterId,
    );
    if (!actor) {
      throw badRequest("INVENTORY_400", "아이템 사용자 전투 참가자를 찾을 수 없습니다.", {
        reason: "ITEM_ACTOR_PARTICIPANT_NOT_FOUND",
      });
    }
    const map = await this.sessionsService.getVttMapForUser(
      params.userId,
      params.sessionId,
    );
    const actorToken = map.tokens.find(
      (token) =>
        token.id === actor.tokenId ||
        token.sessionCharacterId === params.actorSessionCharacterId,
    );
    if (!actorToken) {
      throw badRequest("INVENTORY_400", "아이템 사용자 토큰을 찾을 수 없습니다.", {
        reason: "ITEM_ACTOR_TOKEN_NOT_FOUND",
      });
    }

    const spellId = params.spellEffect.spellId;
    if (spellId === "spell.magic_missile") {
      if (!params.targetParticipantId) {
        throw badRequest("INVENTORY_400", "마법 미사일을 맞힐 대상을 선택하세요.", {
          reason: "ITEM_SPELL_TARGET_REQUIRED",
          spellId,
        });
      }
      const target = combat.participants.find(
        (participant) =>
          participant.id === params.targetParticipantId &&
          participant.isAlive,
      );
      if (!target) {
        throw badRequest("INVENTORY_400", "아이템 주문 대상을 찾을 수 없습니다.", {
          reason: "ITEM_SPELL_TARGET_NOT_FOUND",
          targetParticipantId: params.targetParticipantId,
        });
      }
      this.assertParticipantTargetInRange({
        map,
        actorToken,
        target,
        rangeFt: params.executableItem.rangeFt,
      });
      const damageRoll = this.diceService.roll("3d4+3");
      await this.applyParticipantDamage(target, damageRoll.total);
      const logModel = buildMagicMissileItemSpellLogModel({
        itemEntryId: params.itemEntryId,
        itemDefinitionId: params.itemDefinitionId,
        spellId,
        remainingCharges: params.remainingCharges,
        actorName: actor.nameSnapshot,
        itemName: params.itemName,
        targetId: target.id,
        targetName: target.nameSnapshot,
        damage: damageRoll.total,
      });
      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        actorUserId: params.actorUserId,
        sessionCharacterId: params.actorSessionCharacterId,
        rawInput: null,
        structuredAction: logModel.structuredAction,
        diceResult: { ...damageRoll },
        stateDiff: logModel.stateDiff,
        outcome: ActionOutcome.SUCCESS,
        narration: logModel.message,
      });
      return { message: logModel.message, diceResults: [damageRoll], turnLog };
    }

    if (spellId === "spell.fireball") {
      const point = params.point;
      if (!point) {
        throw badRequest("INVENTORY_400", "화염구가 폭발할 지점을 선택하세요.", {
          reason: "ITEM_SPELL_POINT_REQUIRED",
          spellId,
        });
      }
      this.assertPointTargetInRange({
        map,
        actorToken,
        point,
        rangeFt: params.executableItem.rangeFt,
      });
      const targets = findParticipantsInItemRadius({
        map,
        combatParticipants: combat.participants,
        point,
        radiusFt: 20,
      });
      const damageRoll = this.diceService.roll("8d6");
      for (const target of targets) {
        await this.applyParticipantDamage(target, damageRoll.total);
      }
      const logModel = buildFireballItemSpellLogModel({
        itemEntryId: params.itemEntryId,
        itemDefinitionId: params.itemDefinitionId,
        spellId,
        remainingCharges: params.remainingCharges,
        actorName: actor.nameSnapshot,
        itemName: params.itemName,
        point,
        targetIds: targets.map((target) => target.id),
        damage: damageRoll.total,
      });
      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        actorUserId: params.actorUserId,
        sessionCharacterId: params.actorSessionCharacterId,
        rawInput: null,
        structuredAction: logModel.structuredAction,
        diceResult: { ...damageRoll },
        stateDiff: logModel.stateDiff,
        outcome: ActionOutcome.SUCCESS,
        narration: logModel.message,
      });
      return { message: logModel.message, diceResults: [damageRoll], turnLog };
    }

    if (spellId === "spell.web") {
      const point = params.point;
      if (!point) {
        throw badRequest("INVENTORY_400", "거미줄을 펼칠 지점을 선택하세요.", {
          reason: "ITEM_SPELL_POINT_REQUIRED",
          spellId,
        });
      }
      this.assertPointTargetInRange({
        map,
        actorToken,
        point,
        rangeFt: params.executableItem.rangeFt,
      });
      await this.deployPointTerrainEffect({
        sessionId: params.sessionId,
        map,
        point,
        itemEntryId: params.itemEntryId,
        itemName: params.itemName,
        terrainEffectId: "terrain.difficult",
        sizeFt: 20,
      });
      const logModel = buildWebItemSpellLogModel({
        itemEntryId: params.itemEntryId,
        itemDefinitionId: params.itemDefinitionId,
        spellId,
        remainingCharges: params.remainingCharges,
        actorName: actor.nameSnapshot,
        itemName: params.itemName,
        point,
        terrainEffectId: "terrain.difficult",
        sizeFt: 20,
      });
      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        actorUserId: params.actorUserId,
        sessionCharacterId: params.actorSessionCharacterId,
        rawInput: null,
        structuredAction: logModel.structuredAction,
        diceResult: null,
        stateDiff: logModel.stateDiff,
        outcome: ActionOutcome.SUCCESS,
        narration: logModel.message,
      });
      return { message: logModel.message, diceResults: [], turnLog };
    }

    throw badRequest("INVENTORY_400", "이 마법 아이템 주문은 아직 직접 실행할 수 없습니다.", {
      reason: "ITEM_SPELL_NOT_EXECUTABLE",
      spellId,
    });
  }

  private assertParticipantTargetInRange(params: {
    map: {
      gridSize: number;
      tokens: Array<{
        id: string;
        sessionCharacterId?: string | null;
        x: number;
        y: number;
      }>;
    };
    actorToken: { x: number; y: number };
    target: {
      id: string;
      tokenId: string | null;
      sessionCharacterId: string | null;
    };
    rangeFt: number;
  }): void {
    const targetToken = findParticipantMapToken(
      params.map.tokens,
      params.target,
      { allowEmptySessionCharacterMatch: true },
    );
    if (!targetToken) {
      throw badRequest("INVENTORY_400", "아이템 주문 대상 토큰을 찾을 수 없습니다.", {
        reason: "ITEM_SPELL_TARGET_TOKEN_NOT_FOUND",
        targetParticipantId: params.target.id,
      });
    }
    const distanceFt = resolveMapDistanceFt(
      params.map.gridSize,
      params.actorToken,
      targetToken,
    );
    if (distanceFt > params.rangeFt) {
      throw badRequest("INVENTORY_400", "아이템 주문 대상이 사거리 밖에 있습니다.", {
        reason: "ITEM_SPELL_TARGET_OUT_OF_RANGE",
        targetParticipantId: params.target.id,
        distanceFt,
        rangeFt: params.rangeFt,
      });
    }
  }

  private assertPointTargetInRange(params: {
    map: { gridSize: number };
    actorToken: { x: number; y: number };
    point: { x: number; y: number };
    rangeFt: number;
  }): void {
    const distanceFt = resolveMapDistanceFt(
      params.map.gridSize,
      params.actorToken,
      params.point,
    );
    if (distanceFt > params.rangeFt) {
      throw badRequest("INVENTORY_400", "아이템 주문 지점이 사거리 밖에 있습니다.", {
        reason: "ITEM_SPELL_POINT_OUT_OF_RANGE",
        distanceFt,
        rangeFt: params.rangeFt,
      });
    }
  }

  private async applyParticipantDamage(
    participant: {
      id: string;
      sessionCharacterId: string | null;
      currentHp: number | null;
      isAlive: boolean;
    },
    damage: number,
  ): Promise<void> {
    const nextHp = Math.max(0, (participant.currentHp ?? 0) - damage);
    await this.prisma.combatParticipant.update({
      where: { id: participant.id },
      data: { currentHp: nextHp, isAlive: nextHp > 0 },
    });
    participant.currentHp = nextHp;
    participant.isAlive = nextHp > 0;
    if (participant.sessionCharacterId) {
      await this.prisma.sessionCharacter.update({
        where: { id: participant.sessionCharacterId },
        data: { currentHp: nextHp },
      });
    }
  }

  private async deployPointTerrainEffect(params: {
    sessionId: string;
    map: Awaited<ReturnType<SessionsService["getVttMapForUser"]>>;
    point: { x: number; y: number };
    itemEntryId: string;
    itemName: string;
    terrainEffectId: string;
    sizeFt: number;
  }): Promise<void> {
    await this.mapRuntimeService.saveSystemVttMap(params.sessionId, {
      ...params.map,
      terrainCells: [
        ...(params.map.terrainCells ?? []),
        buildPointItemTerrainCell({
          map: params.map,
          point: params.point,
          itemEntryId: params.itemEntryId,
          itemName: params.itemName,
          terrainEffectId: params.terrainEffectId,
          sizeFt: params.sizeFt,
        }),
      ],
      updatedAt: new Date().toISOString(),
    });
  }
}
