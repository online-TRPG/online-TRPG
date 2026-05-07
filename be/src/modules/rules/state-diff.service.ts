import { Injectable } from "@nestjs/common";
import {
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import { StateDiffResponseDto } from "@trpg/shared-types";
import { conflict } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { CharacterStatePatch } from "./action-rule.service";

@Injectable()
export class StateDiffService {
  constructor(private readonly prisma: PrismaService) {}

  async applyCharacterChanges(params: {
    sessionScenarioId: string;
    baseVersion: number;
    turnLogId: string;
    reason: string;
    changes: CharacterStatePatch[];
  }): Promise<StateDiffResponseDto | null> {
    if (!params.changes.length) {
      return null;
    }

    const state = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
    });

    if (!state || state.version !== params.baseVersion) {
      throw conflict("STATE_409", "세션 상태가 이미 변경되었습니다.", {
        reason: "STATE_VERSION_CONFLICT",
      });
    }

    const nextVersion = params.baseVersion + 1;
    const diff = {
      characters: params.changes.filter((change) => change.sessionCharacterId),
      combatParticipants: params.changes.filter((change) => change.combatParticipantId),
    };

    await this.prisma.$transaction(async (tx) => {
      for (const change of params.changes) {
        if (change.sessionCharacterId) {
          await tx.sessionCharacter.update({
            where: { id: change.sessionCharacterId },
            data: {
              currentHp: change.currentHp,
              tempHp: change.tempHp,
              conditionsJson: change.conditions ? JSON.stringify(change.conditions) : undefined,
              status: change.markDead ? PrismaSessionCharacterStatus.DEAD : undefined,
            },
          });
        }

        if (change.combatParticipantId) {
          await tx.combatParticipant.update({
            where: { id: change.combatParticipantId },
            data: {
              currentHp: change.currentHp,
              tempHp: change.tempHp,
              conditionsJson: change.conditions ? JSON.stringify(change.conditions) : undefined,
              isAlive: change.markDead === undefined ? undefined : !change.markDead,
            },
          });
        }
      }

      // 상태 version은 클라이언트가 오래된 화면으로 상태를 덮어쓰지 못하게 하는 기준점이다.
      await tx.gameState.update({
        where: { sessionScenarioId: params.sessionScenarioId },
        data: { version: nextVersion },
      });

      await tx.stateDiff.create({
        data: {
          sessionScenarioId: params.sessionScenarioId,
          turnLogId: params.turnLogId,
          baseVersion: params.baseVersion,
          nextVersion,
          reason: params.reason,
          diffJson: JSON.stringify(diff),
        },
      });
    });

    return {
      baseVersion: params.baseVersion,
      nextVersion,
      reason: params.reason,
      diff,
    };
  }
}
