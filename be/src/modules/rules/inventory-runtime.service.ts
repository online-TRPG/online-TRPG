import { Injectable } from "@nestjs/common";
import {
  ContainerState,
  InventoryEntry,
  ItemDefinition,
  Prisma,
} from "@prisma/client";
import { InventoryItemDto, normalizeInventoryItemDisplay } from "@trpg/shared-types";
import { badRequest, notFound } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { RuleEngineService } from "./rule-engine.service";
import { BagOfHoldingIntegrity } from "./rule-engine.types";
import { getExecutableItemDefinition } from "./p3-item-manifest";

type InventoryDbClient = Pick<
  Prisma.TransactionClient,
  "containerState" | "inventoryEntry" | "itemDefinition"
>;

type EntryWithDefinition = InventoryEntry & {
  itemDefinition: ItemDefinition;
};

type ContainerEntry = EntryWithDefinition & {
  containerState: ContainerState | null;
};

@Injectable()
export class InventoryRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  async addItem(params: {
    sessionCharacterId: string;
    itemDefinitionId: string;
    quantity?: number;
    containerEntryId?: string | null;
  }): Promise<InventoryEntry> {
    const quantity = this.normalizeQuantity(params.quantity);
    const itemDefinition = await this.getItemDefinitionOrThrow(params.itemDefinitionId);

    if (params.containerEntryId) {
      await this.validateContainerMutationOrThrow({
        containerEntryId: params.containerEntryId,
        sessionCharacterId: params.sessionCharacterId,
        addedWeightLb: this.calculateItemWeight(itemDefinition, quantity),
        addedVolumeCuFt: this.calculateItemVolume(itemDefinition, quantity),
      });
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      const data = {
        sessionCharacterId: params.sessionCharacterId,
        itemDefinitionId: itemDefinition.id,
        quantity,
        containerEntryId: params.containerEntryId ?? null,
      };
      const existingEntry = await tx.inventoryEntry.findFirst({
        where: {
          sessionCharacterId: data.sessionCharacterId,
          itemDefinitionId: data.itemDefinitionId,
          containerEntryId: data.containerEntryId,
        },
      });
      const entry = existingEntry
        ? await tx.inventoryEntry.update({
            where: { id: existingEntry.id },
            data: { quantity: { increment: quantity } },
          })
        : await tx.inventoryEntry.create({ data });

      const containerCapacity = this.resolveContainerCapacity(
        itemDefinition.id,
      );
      if (containerCapacity) {
        await tx.containerState.upsert({
          where: { inventoryEntryId: entry.id },
          update: {
            maxWeightLb: containerCapacity.maxWeightLb,
            maxVolumeCuFt: containerCapacity.maxVolumeCuFt,
          },
          create: {
            inventoryEntryId: entry.id,
            maxWeightLb: containerCapacity.maxWeightLb,
            maxVolumeCuFt: containerCapacity.maxVolumeCuFt,
          },
        });
      }

      if (params.containerEntryId) {
        await this.recalculateContainerStateWithClient(tx, params.containerEntryId);
      }

      return entry;
    });

    await this.updateSessionInventorySnapshot(params.sessionCharacterId);
    return entry;
  }

  async moveItem(params: {
    entryId: string;
    containerEntryId: string | null;
  }): Promise<InventoryEntry> {
    const entry = await this.getEntryWithDefinitionOrThrow(params.entryId);
    const previousContainerEntryId = entry.containerEntryId;

    if (params.containerEntryId === entry.id) {
      throw badRequest("INVENTORY_400", "아이템을 자기 자신 안으로 이동할 수 없습니다.", {
        reason: "CANNOT_MOVE_ITEM_INTO_ITSELF",
      });
    }

    if (params.containerEntryId === previousContainerEntryId) {
      return entry;
    }

    if (params.containerEntryId) {
      await this.validateContainerMutationOrThrow({
        containerEntryId: params.containerEntryId,
        sessionCharacterId: entry.sessionCharacterId,
        addedWeightLb: this.calculateEntryWeight(entry),
        addedVolumeCuFt: this.calculateEntryVolume(entry),
      });
    }

    const moved = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.inventoryEntry.update({
        where: { id: entry.id },
        data: { containerEntryId: params.containerEntryId },
      });

      if (previousContainerEntryId) {
        await this.recalculateContainerStateWithClient(tx, previousContainerEntryId);
      }
      if (params.containerEntryId) {
        await this.recalculateContainerStateWithClient(tx, params.containerEntryId);
      }

      return moved;
    });

    await this.updateSessionInventorySnapshot(entry.sessionCharacterId);
    return moved;
  }

  async removeItem(params: {
    entryId: string;
    quantity?: number;
  }): Promise<InventoryEntry | null> {
    const entry = await this.getEntryWithDefinitionOrThrow(params.entryId);
    const removeQuantity = params.quantity ?? entry.quantity;

    if (!Number.isInteger(removeQuantity) || removeQuantity < 1) {
      throw badRequest("INVENTORY_400", "삭제할 아이템 수량이 올바르지 않습니다.", {
        reason: "INVALID_REMOVE_QUANTITY",
      });
    }

    if (removeQuantity >= entry.quantity) {
      await this.ensureContainerIsEmpty(entry.id);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const result =
        removeQuantity >= entry.quantity
          ? await tx.inventoryEntry.delete({ where: { id: entry.id } })
          : await tx.inventoryEntry.update({
              where: { id: entry.id },
              data: { quantity: { decrement: removeQuantity } },
            });

      if (entry.containerEntryId) {
        await this.recalculateContainerStateWithClient(tx, entry.containerEntryId);
      }

      return removeQuantity >= entry.quantity ? null : result;
    });

    await this.updateSessionInventorySnapshot(entry.sessionCharacterId);
    return result;
  }

  async removeItemFromCharacter(params: {
    sessionCharacterId: string;
    itemId: string;
    quantity?: number;
  }): Promise<InventoryEntry | null> {
    const normalized = params.itemId.trim().toLowerCase();
    const entry = await this.prisma.inventoryEntry.findFirst({
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
      throw notFound("INVENTORY_404", "인벤토리 아이템을 찾을 수 없습니다.", {
        reason: "INVENTORY_ENTRY_NOT_FOUND",
        itemId: normalized,
      });
    }

    return this.removeItem({ entryId: entry.id, quantity: params.quantity });
  }

  async listInventoryItems(sessionCharacterId: string): Promise<InventoryItemDto[]> {
    const entries = await this.prisma.inventoryEntry.findMany({
      where: { sessionCharacterId },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });

    return entries.map((entry) => this.mapEntryToInventoryItem(entry));
  }

  async syncSessionInventorySnapshot(sessionCharacterId: string): Promise<void> {
    await this.updateSessionInventorySnapshot(sessionCharacterId);
  }

  async recalculateContainerState(containerEntryId: string): Promise<ContainerState> {
    return this.prisma.$transaction((tx) =>
      this.recalculateContainerStateWithClient(tx, containerEntryId),
    );
  }

  private async validateContainerMutationOrThrow(params: {
    containerEntryId: string;
    sessionCharacterId: string;
    addedWeightLb: number;
    addedVolumeCuFt: number;
  }): Promise<void> {
    const container = await this.getContainerEntryOrThrow(params.containerEntryId);
    if (container.sessionCharacterId !== params.sessionCharacterId) {
      throw badRequest("INVENTORY_400", "다른 캐릭터의 컨테이너로 아이템을 이동할 수 없습니다.", {
        reason: "CONTAINER_OWNER_MISMATCH",
      });
    }
    if (!container.containerState) {
      throw badRequest("INVENTORY_400", "컨테이너 상태 정보가 없습니다.", {
        reason: "CONTAINER_STATE_NOT_FOUND",
      });
    }

    const ruleResult = this.ruleEngine.validateBagOfHoldingCapacity({
      itemCurrentWeightLb: container.containerState.currentWeightLb,
      itemCurrentVolumeCuFt: container.containerState.currentVolumeCuFt,
      addedWeightLb: params.addedWeightLb,
      addedVolumeCuFt: params.addedVolumeCuFt,
      containerIntegrity: this.toRuleIntegrity(container.containerState.integrity),
    });

    if (!ruleResult.accepted) {
      // Bag of Holding 사고는 이후 이동을 막아야 하므로 컨테이너 상태에도 파손을 남긴다.
      await this.prisma.containerState.update({
        where: { inventoryEntryId: params.containerEntryId },
        data: { integrity: "OVERLOADED" },
      });
      throw badRequest("INVENTORY_400", "컨테이너 용량을 초과했습니다.", {
        reason: ruleResult.rejectedReason ?? "BAG_OF_HOLDING_CAPACITY_REJECTED",
        capacityViolation: ruleResult.produced.capacityViolation,
        containerDestroyed: ruleResult.produced.containerDestroyed,
      });
    }
  }

  private async recalculateContainerStateWithClient(
    client: InventoryDbClient,
    containerEntryId: string,
  ): Promise<ContainerState> {
    const container = await client.inventoryEntry.findUnique({
      where: { id: containerEntryId },
      include: { containerState: true, itemDefinition: true },
    });
    if (!container) {
      throw notFound("INVENTORY_404", "컨테이너를 찾을 수 없습니다.", {
        reason: "CONTAINER_NOT_FOUND",
      });
    }
    if (!container.containerState) {
      throw badRequest("INVENTORY_400", "컨테이너 상태 정보가 없습니다.", {
        reason: "CONTAINER_STATE_NOT_FOUND",
      });
    }

    const containedEntries = await client.inventoryEntry.findMany({
      where: { containerEntryId },
      include: { itemDefinition: true },
    });
    const currentWeightLb = containedEntries.reduce(
      (sum, entry) => sum + this.calculateEntryWeight(entry),
      0,
    );
    const currentVolumeCuFt = containedEntries.reduce(
      (sum, entry) => sum + this.calculateEntryVolume(entry),
      0,
    );

    return client.containerState.update({
      where: { inventoryEntryId: containerEntryId },
      data: {
        currentWeightLb,
        currentVolumeCuFt,
      },
    });
  }

  private async getItemDefinitionOrThrow(itemDefinitionId: string): Promise<ItemDefinition> {
    const itemDefinition = await this.prisma.itemDefinition.findFirst({
      where: {
        OR: [
          { id: itemDefinitionId },
          { name: { equals: itemDefinitionId, mode: "insensitive" } },
        ],
      },
    });
    if (!itemDefinition) {
      throw notFound("INVENTORY_404", "아이템 정의를 찾을 수 없습니다.", {
        reason: "ITEM_DEFINITION_NOT_FOUND",
      });
    }

    return itemDefinition;
  }

  private async getEntryWithDefinitionOrThrow(entryId: string): Promise<EntryWithDefinition> {
    const entry = await this.prisma.inventoryEntry.findUnique({
      where: { id: entryId },
      include: { itemDefinition: true },
    });
    if (!entry) {
      throw notFound("INVENTORY_404", "인벤토리 아이템을 찾을 수 없습니다.", {
        reason: "INVENTORY_ENTRY_NOT_FOUND",
      });
    }

    return entry;
  }

  private async getContainerEntryOrThrow(containerEntryId: string): Promise<ContainerEntry> {
    const container = await this.prisma.inventoryEntry.findUnique({
      where: { id: containerEntryId },
      include: { containerState: true, itemDefinition: true },
    });
    if (!container) {
      throw notFound("INVENTORY_404", "컨테이너를 찾을 수 없습니다.", {
        reason: "CONTAINER_NOT_FOUND",
      });
    }

    return container;
  }

  private async ensureContainerIsEmpty(entryId: string): Promise<void> {
    const containedCount = await this.prisma.inventoryEntry.count({
      where: { containerEntryId: entryId },
    });
    if (containedCount > 0) {
      throw badRequest("INVENTORY_400", "내용물이 있는 컨테이너는 삭제할 수 없습니다.", {
        reason: "CONTAINER_NOT_EMPTY",
      });
    }
  }

  private normalizeQuantity(quantity: number | undefined): number {
    const normalized = quantity ?? 1;
    if (!Number.isInteger(normalized) || normalized < 1) {
      throw badRequest("INVENTORY_400", "아이템 수량이 올바르지 않습니다.", {
        reason: "INVALID_ITEM_QUANTITY",
      });
    }

    return normalized;
  }

  private calculateEntryWeight(entry: EntryWithDefinition): number {
    return this.calculateItemWeight(entry.itemDefinition, entry.quantity);
  }

  private calculateEntryVolume(entry: EntryWithDefinition): number {
    return this.calculateItemVolume(entry.itemDefinition, entry.quantity);
  }

  private calculateItemWeight(itemDefinition: ItemDefinition, quantity: number): number {
    return (itemDefinition.weightLb ?? 0) * quantity;
  }

  private calculateItemVolume(itemDefinition: ItemDefinition, quantity: number): number {
    return (itemDefinition.volumeCuFt ?? 0) * quantity;
  }

  private resolveContainerCapacity(
    itemDefinitionId: string,
  ): { maxWeightLb: number; maxVolumeCuFt: number } | null {
    const definition = getExecutableItemDefinition(itemDefinitionId);
    if (definition?.effect.type !== "utility") {
      return null;
    }
    const weight = Number(
      definition.effect.tags
        .find((tag) => tag.startsWith("container:max_weight_lb:"))
        ?.slice("container:max_weight_lb:".length) ??
        definition.effect.tags
          .find((tag) => tag.startsWith("capacity_lb:"))
          ?.slice("capacity_lb:".length),
    );
    const volume = Number(
      definition.effect.tags
        .find((tag) => tag.startsWith("container:max_volume_cuft:"))
        ?.slice("container:max_volume_cuft:".length),
    );
    if (!Number.isFinite(weight) || weight <= 0) {
      return null;
    }
    return {
      maxWeightLb: weight,
      maxVolumeCuFt:
        Number.isFinite(volume) && volume > 0
          ? volume
          : Math.max(weight / 10, 1),
    };
  }

  private async updateSessionInventorySnapshot(sessionCharacterId: string): Promise<void> {
    const inventory = await this.listInventoryItems(sessionCharacterId);
    await this.prisma.sessionCharacter.update({
      where: { id: sessionCharacterId },
      data: { inventorySnapshotJson: JSON.stringify(inventory) },
    });
  }

  private mapEntryToInventoryItem(entry: EntryWithDefinition): InventoryItemDto {
    return normalizeInventoryItemDisplay({
      id: entry.id,
      name: entry.itemDefinition.name,
      quantity: entry.quantity,
      itemDefinitionId: entry.itemDefinitionId,
      itemType: entry.itemDefinition.itemType,
      description: entry.itemDefinition.description ?? undefined,
      weightLb: entry.itemDefinition.weightLb ?? undefined,
      volumeCuFt: entry.itemDefinition.volumeCuFt ?? undefined,
      damageDice: entry.itemDefinition.damageDice ?? undefined,
      damageType: entry.itemDefinition.damageType ?? undefined,
      armorClassBase: entry.itemDefinition.armorClassBase ?? undefined,
      armorClassBonus: entry.itemDefinition.armorClassBonus ?? undefined,
      armorStrengthRequirement: entry.itemDefinition.armorStrengthRequirement ?? undefined,
      armorStealthDisadvantage: entry.itemDefinition.armorStealthDisadvantage ?? undefined,
      useEffect: entry.itemDefinition.useEffect ?? undefined,
      packContents: this.parsePackContentsJson(entry.itemDefinition.packContentsJson),
      properties: this.parseStringArrayJson(entry.itemDefinition.propertiesJson),
      containerId: entry.containerEntryId ?? undefined,
    });
  }

  private parsePackContentsJson(value: string | null | undefined): InventoryItemDto["packContents"] {
    if (!value) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        return undefined;
      }
      return parsed
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const record = item as Record<string, unknown>;
          const itemId = typeof record.itemId === "string" ? record.itemId : "";
          const name = typeof record.name === "string" ? record.name : "";
          const quantity = typeof record.quantity === "number" ? record.quantity : 0;
          if (!itemId || !name || !Number.isInteger(quantity) || quantity < 1) {
            return null;
          }
          return { itemId, name, quantity };
        })
        .filter((item): item is NonNullable<InventoryItemDto["packContents"]>[number] =>
          Boolean(item),
        );
    } catch {
      return undefined;
    }
  }

  private parseStringArrayJson(value: string | null | undefined): string[] | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        return undefined;
      }
      const strings = parsed.filter((entry): entry is string => typeof entry === "string");
      return strings.length ? strings : undefined;
    } catch {
      return undefined;
    }
  }

  private toRuleIntegrity(value: string): BagOfHoldingIntegrity {
    const normalized = value.trim().toLowerCase();
    return ["intact", "pierced", "torn", "overloaded"].includes(normalized)
      ? (normalized as BagOfHoldingIntegrity)
      : "intact";
  }
}
