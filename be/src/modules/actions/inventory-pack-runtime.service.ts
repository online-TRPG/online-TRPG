import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { InventoryRuntimeService } from "../rules/inventory-runtime.service";
import {
  findSrdEquipmentById,
  toItemDefinitionData,
  type SrdEquipmentRecord,
} from "./srd-equipment-policy";

@Injectable()
export class InventoryPackRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRuntime: InventoryRuntimeService,
  ) {}

  async unpackInventoryPack(params: {
    sessionCharacterId: string;
    packEntryId: string;
    pack: SrdEquipmentRecord;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const packEntry = await tx.inventoryEntry.findUnique({
        where: { id: params.packEntryId },
        include: { itemDefinition: true },
      });
      if (
        !packEntry ||
        packEntry.sessionCharacterId !== params.sessionCharacterId ||
        packEntry.quantity < 1
      ) {
        throw badRequest("INVENTORY_400", "사용할 꾸러미를 찾을 수 없습니다.", {
          reason: "INVENTORY_PACK_NOT_FOUND",
        });
      }

      for (const content of params.pack.contents ?? []) {
        const contentRecord = findSrdEquipmentById(content.itemId);
        if (!contentRecord) {
          throw badRequest("INVENTORY_400", "꾸러미 내용물 정의를 찾을 수 없습니다.", {
            reason: "PACK_CONTENT_DEFINITION_NOT_FOUND",
            itemId: content.itemId,
          });
        }
        const quantity =
          Number.isInteger(content.quantity) && content.quantity > 0
            ? content.quantity
            : 1;
        await tx.itemDefinition.upsert({
          where: { id: contentRecord.id },
          update: toItemDefinitionData(contentRecord),
          create: {
            id: contentRecord.id,
            ...toItemDefinitionData(contentRecord),
          },
        });
        await tx.inventoryEntry.create({
          data: {
            sessionCharacterId: params.sessionCharacterId,
            itemDefinitionId: contentRecord.id,
            quantity,
          },
        });
      }

      if (packEntry.quantity > 1) {
        await tx.inventoryEntry.update({
          where: { id: packEntry.id },
          data: { quantity: { decrement: 1 } },
        });
      } else {
        await tx.inventoryEntry.delete({ where: { id: packEntry.id } });
      }
    });

    await this.inventoryRuntime.syncSessionInventorySnapshot(
      params.sessionCharacterId,
    );
  }
}
