import { Injectable } from "@nestjs/common";
import { CombatTurnState } from "@prisma/client";
import { badRequest } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";

type TurnStateKey = {
  combatId: string;
  combatParticipantId: string;
  roundNo: number;
  turnNo: number;
  sessionCharacterId?: string | null;
};

@Injectable()
export class ActionEconomyService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateTurnState(params: TurnStateKey): Promise<CombatTurnState> {
    return this.prisma.combatTurnState.upsert({
      where: {
        combatId_roundNo_turnNo_combatParticipantId: this.toUniqueKey(params),
      },
      create: {
        combatId: params.combatId,
        combatParticipantId: params.combatParticipantId,
        roundNo: params.roundNo,
        turnNo: params.turnNo,
        sessionCharacterId: params.sessionCharacterId ?? null,
      },
      update: {},
    });
  }

  async spendAction(params: TurnStateKey): Promise<CombatTurnState> {
    const state = await this.getOrCreateTurnState(params);

    if (!state.actionUsed) {
      return this.updateTurnState(params, { actionUsed: true });
    }

    if (state.additionalActionGranted) {
      // Action Surge로 받은 추가 action은 main action과 별도 칸으로 본다.
      // 사용 후에는 다시 false로 내려서 같은 턴에 여러 번 쓰지 못하게 한다.
      return this.updateTurnState(params, { additionalActionGranted: false });
    }

    throw badRequest("ACTION_400", "사용 가능한 action이 없습니다.", {
      reason: "ACTION_ALREADY_USED",
    });
  }

  async spendBonusAction(params: TurnStateKey): Promise<CombatTurnState> {
    const state = await this.getOrCreateTurnState(params);
    if (state.bonusActionUsed) {
      throw badRequest("ACTION_400", "사용 가능한 bonus action이 없습니다.", {
        reason: "BONUS_ACTION_ALREADY_USED",
      });
    }

    return this.updateTurnState(params, { bonusActionUsed: true });
  }

  async spendReaction(params: TurnStateKey): Promise<CombatTurnState> {
    const state = await this.getOrCreateTurnState(params);
    if (state.reactionUsed) {
      throw badRequest("ACTION_400", "사용 가능한 reaction이 없습니다.", {
        reason: "REACTION_ALREADY_USED",
      });
    }

    return this.updateTurnState(params, { reactionUsed: true });
  }

  async grantAdditionalAction(params: TurnStateKey): Promise<CombatTurnState> {
    await this.getOrCreateTurnState(params);
    return this.updateTurnState(params, { additionalActionGranted: true });
  }

  async spendSneakAttack(params: TurnStateKey): Promise<CombatTurnState> {
    const state = await this.getOrCreateTurnState(params);
    if (state.sneakAttackUsed) {
      throw badRequest("ACTION_400", "Sneak Attack은 한 턴에 한 번만 사용할 수 있습니다.", {
        reason: "SNEAK_ATTACK_ALREADY_USED",
      });
    }

    return this.updateTurnState(params, { sneakAttackUsed: true });
  }

  private updateTurnState(
    params: TurnStateKey,
    data: Partial<
      Pick<
        CombatTurnState,
        | "actionUsed"
        | "bonusActionUsed"
        | "reactionUsed"
        | "additionalActionGranted"
        | "sneakAttackUsed"
      >
    >,
  ): Promise<CombatTurnState> {
    return this.prisma.combatTurnState.update({
      where: {
        combatId_roundNo_turnNo_combatParticipantId: this.toUniqueKey(params),
      },
      data,
    });
  }

  private toUniqueKey(params: TurnStateKey): Pick<
    TurnStateKey,
    "combatId" | "roundNo" | "turnNo" | "combatParticipantId"
  > {
    return {
      combatId: params.combatId,
      roundNo: params.roundNo,
      turnNo: params.turnNo,
      combatParticipantId: params.combatParticipantId,
    };
  }
}
