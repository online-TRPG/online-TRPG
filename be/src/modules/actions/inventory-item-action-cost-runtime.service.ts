import { Injectable } from "@nestjs/common";
import { CombatStatus as PrismaCombatStatus } from "@prisma/client";
import { forbidden } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { ActionEconomyService } from "../rules/action-economy.service";

@Injectable()
export class InventoryItemActionCostRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionEconomy: ActionEconomyService,
  ) {}

  async spendActionCost(params: {
    sessionId: string;
    sessionCharacterId: string;
    actionCost: "action" | "bonus_action";
  }): Promise<void> {
    const combat = await this.prisma.combat.findFirst({
      where: {
        sessionId: params.sessionId,
        status: PrismaCombatStatus.ACTIVE,
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });
    if (!combat) {
      return;
    }
    const actor = combat.participants.find(
      (participant) =>
        participant.sessionCharacterId === params.sessionCharacterId,
    );
    if (!actor || combat.currentParticipantId !== actor.id) {
      throw forbidden("ACTION_403", "현재 전투 턴에는 아이템을 사용할 수 없습니다.", {
        reason: "ITEM_USE_REQUIRES_CURRENT_TURN",
      });
    }
    const key = {
      combatId: combat.id,
      combatParticipantId: actor.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId: params.sessionCharacterId,
    };
    if (params.actionCost === "bonus_action") {
      await this.actionEconomy.spendBonusAction(key);
      return;
    }
    await this.actionEconomy.spendAction(key);
  }
}
