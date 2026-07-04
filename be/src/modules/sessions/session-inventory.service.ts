import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { InventoryItemDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async replaceSessionInventoryEntries(
    sessionCharacterId: string,
    inventory: InventoryItemDto[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryEntry.deleteMany({ where: { sessionCharacterId } });

      const itemDefinitionIds = inventory
        .map((item) => item.itemDefinitionId)
        .filter((value): value is string => Boolean(value));
      if (!itemDefinitionIds.length) {
        return;
      }

      const existingDefinitions = await tx.itemDefinition.findMany({
        where: { id: { in: itemDefinitionIds } },
        select: { id: true },
      });
      const existingDefinitionIds = new Set(existingDefinitions.map((item) => item.id));
      const entries = inventory
        .filter((item) => item.itemDefinitionId && existingDefinitionIds.has(item.itemDefinitionId))
        .map((item) => ({
          sessionCharacterId,
          itemDefinitionId: item.itemDefinitionId!,
          quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
        }));

      if (entries.length) {
        await tx.inventoryEntry.createMany({ data: entries });
      }
    });

    await this.refreshSessionInventorySnapshot(sessionCharacterId);
  }

  async grantSessionInventoryItem(
    tx: Prisma.TransactionClient,
    params: {
      sessionCharacterId: string;
      itemDefinitionId: string;
      quantity: number;
    },
  ): Promise<void> {
    const existingEntry = await tx.inventoryEntry.findFirst({
      where: {
        sessionCharacterId: params.sessionCharacterId,
        itemDefinitionId: params.itemDefinitionId,
        containerEntryId: null,
      },
      orderBy: { createdAt: "asc" },
    });

    if (existingEntry) {
      await tx.inventoryEntry.update({
        where: { id: existingEntry.id },
        data: { quantity: { increment: params.quantity } },
      });
      return;
    }

    await tx.inventoryEntry.create({
      data: {
        sessionCharacterId: params.sessionCharacterId,
        itemDefinitionId: params.itemDefinitionId,
        quantity: params.quantity,
      },
    });
  }

  async removeSessionInventoryItem(
    tx: Prisma.TransactionClient,
    params: {
      sessionCharacterId: string;
      itemId: string;
      quantity: number;
    },
  ): Promise<{
    itemDefinitionId: string;
    itemName: string;
    itemType: string;
    removedQuantity: number;
  }> {
    const entry = await tx.inventoryEntry.findFirst({
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
    if (!entry) {
      throw new NotFoundException("회수할 인벤토리 아이템을 찾을 수 없습니다.");
    }

    const removedQuantity = Math.min(params.quantity, entry.quantity);
    if (removedQuantity >= entry.quantity) {
      await tx.inventoryEntry.delete({ where: { id: entry.id } });
    } else {
      await tx.inventoryEntry.update({
        where: { id: entry.id },
        data: { quantity: { decrement: removedQuantity } },
      });
    }

    return {
      itemDefinitionId: entry.itemDefinitionId,
      itemName: entry.itemDefinition.name,
      itemType: entry.itemDefinition.itemType,
      removedQuantity,
    };
  }

  async refreshSessionInventorySnapshot(
    sessionCharacterId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const entries = await client.inventoryEntry.findMany({
      where: { sessionCharacterId },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });

    await client.sessionCharacter.update({
      where: { id: sessionCharacterId },
      data: {
        inventorySnapshotJson: JSON.stringify(
          entries.map((entry) => {
            const properties = this.parseJson<string[] | undefined>(
              entry.itemDefinition.propertiesJson,
              undefined,
            );
            return {
              id: entry.id,
              name: entry.itemDefinition.name,
              quantity: entry.quantity,
              itemDefinitionId: entry.itemDefinitionId,
              itemType: entry.itemDefinition.itemType,
              weightLb: entry.itemDefinition.weightLb ?? undefined,
              volumeCuFt: entry.itemDefinition.volumeCuFt ?? undefined,
              damageDice: entry.itemDefinition.damageDice ?? undefined,
              damageType: entry.itemDefinition.damageType ?? undefined,
              rangeFt: this.readRangeProperty(properties, "range:") ?? undefined,
              longRangeFt: this.readRangeProperty(properties, "range_long:") ?? undefined,
              properties,
              containerId: entry.containerEntryId ?? undefined,
            };
          }),
        ),
      },
    });
  }

  private readRangeProperty(properties: string[] | undefined, prefix: "range:" | "range_long:"): number | null {
    const value = properties?.find((property) => property.toLowerCase().startsWith(prefix))?.slice(prefix.length);
    const rangeFt = Number(value);
    return Number.isInteger(rangeFt) && rangeFt >= 0 ? rangeFt : null;
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
  }
}
