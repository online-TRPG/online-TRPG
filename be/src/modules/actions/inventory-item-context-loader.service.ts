import { Injectable } from "@nestjs/common";
import { SessionCharacterStatus as PrismaSessionCharacterStatus } from "@prisma/client";
import { badRequest, forbidden } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { getExecutableItemDefinition } from "../rules/p3-item-manifest";
import { isBackendUsableInventoryItem } from "./inventory-item-policy";

@Injectable()
export class InventoryItemContextLoaderService {
  constructor(private readonly prisma: PrismaService) {}

  async loadUseContext(params: {
    sessionId: string;
    userId: string;
    itemId: string;
    targetSessionCharacterId?: string | null;
  }) {
    const sessionCharacter = await this.loadSessionCharacter({
      sessionId: params.sessionId,
      userId: params.userId,
    });
    const targetSessionCharacter =
      params.targetSessionCharacterId &&
      params.targetSessionCharacterId !== sessionCharacter.id
        ? await this.loadTargetSessionCharacter({
            sessionId: params.sessionId,
            targetSessionCharacterId: params.targetSessionCharacterId,
          })
        : sessionCharacter;
    const item = await this.loadInventoryItem({
      sessionCharacterId: sessionCharacter.id,
      itemId: params.itemId,
    });
    const executableItem = getExecutableItemDefinition(item.itemDefinitionId);
    if (!isBackendUsableInventoryItem(item.itemDefinition, executableItem)) {
      throw badRequest("INVENTORY_400", "현재 바로 사용할 수 없는 아이템입니다.", {
        reason: "ITEM_NOT_QUICK_USABLE",
      });
    }

    return {
      sessionCharacter,
      targetSessionCharacter,
      item,
      executableItem,
    };
  }

  private async loadSessionCharacter(params: {
    sessionId: string;
    userId: string;
  }) {
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.userId,
        },
      },
      include: { character: true },
    });

    if (
      !sessionCharacter ||
      sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE
    ) {
      throw forbidden("ACTION_403", "아이템을 사용할 캐릭터가 선택되지 않았습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }
    return sessionCharacter;
  }

  private async loadTargetSessionCharacter(params: {
    sessionId: string;
    targetSessionCharacterId: string;
  }) {
    const targetSessionCharacter = await this.prisma.sessionCharacter.findFirst({
      where: {
        id: params.targetSessionCharacterId,
        sessionId: params.sessionId,
        status: PrismaSessionCharacterStatus.ACTIVE,
      },
      include: { character: true },
    });
    if (!targetSessionCharacter) {
      throw badRequest("INVENTORY_400", "아이템 대상 캐릭터를 찾을 수 없습니다.", {
        reason: "ITEM_TARGET_NOT_FOUND",
      });
    }
    return targetSessionCharacter;
  }

  private async loadInventoryItem(params: {
    sessionCharacterId: string;
    itemId: string;
  }) {
    const item = await this.prisma.inventoryEntry.findFirst({
      where: {
        sessionCharacterId: params.sessionCharacterId,
        OR: [
          { id: params.itemId },
          { itemDefinitionId: params.itemId },
          {
            itemDefinition: {
              is: {
                OR: [
                  { id: params.itemId },
                  { name: { equals: params.itemId, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });

    if (!item || item.quantity < 1) {
      throw badRequest("INVENTORY_400", "사용할 아이템을 찾을 수 없습니다.", {
        reason: "INVENTORY_ITEM_NOT_FOUND",
      });
    }
    return item;
  }
}
