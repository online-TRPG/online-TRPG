import { InventoryRuntimeService } from "./inventory-runtime.service";
import { RuleEngineService } from "./rule-engine.service";

const now = new Date("2026-05-06T00:00:00.000Z");

type ItemDefinitionRow = {
  id: string;
  name: string;
  itemType: string;
  weightLb: number | null;
  volumeCuFt: number | null;
  damageDice: string | null;
  damageType: string | null;
  propertiesJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type InventoryEntryRow = {
  id: string;
  sessionCharacterId: string;
  itemDefinitionId: string;
  quantity: number;
  containerEntryId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ContainerStateRow = {
  inventoryEntryId: string;
  currentWeightLb: number;
  currentVolumeCuFt: number;
  maxWeightLb: number;
  maxVolumeCuFt: number;
  integrity: string;
  createdAt: Date;
  updatedAt: Date;
};

const createItemDefinition = (
  overrides: Partial<ItemDefinitionRow>,
): ItemDefinitionRow => ({
  id: overrides.id ?? "item.potion",
  name: overrides.name ?? "Potion",
  itemType: overrides.itemType ?? "consumable",
  weightLb: overrides.weightLb ?? 1,
  volumeCuFt: overrides.volumeCuFt ?? 0.1,
  damageDice: overrides.damageDice ?? null,
  damageType: overrides.damageType ?? null,
  propertiesJson: overrides.propertiesJson ?? null,
  createdAt: now,
  updatedAt: now,
});

const createEntry = (overrides: Partial<InventoryEntryRow>): InventoryEntryRow => ({
  id: overrides.id ?? "entry-1",
  sessionCharacterId: overrides.sessionCharacterId ?? "session-character-1",
  itemDefinitionId: overrides.itemDefinitionId ?? "item.potion",
  quantity: overrides.quantity ?? 1,
  containerEntryId: overrides.containerEntryId ?? null,
  createdAt: now,
  updatedAt: now,
});

const createContainerState = (
  overrides: Partial<ContainerStateRow>,
): ContainerStateRow => ({
  inventoryEntryId: overrides.inventoryEntryId ?? "bag-entry",
  currentWeightLb: overrides.currentWeightLb ?? 0,
  currentVolumeCuFt: overrides.currentVolumeCuFt ?? 0,
  maxWeightLb: overrides.maxWeightLb ?? 500,
  maxVolumeCuFt: overrides.maxVolumeCuFt ?? 64,
  integrity: overrides.integrity ?? "INTACT",
  createdAt: now,
  updatedAt: now,
});

describe("InventoryRuntimeService", () => {
  const createService = () => {
    const itemDefinitions = new Map<string, ItemDefinitionRow>([
      ["item.potion", createItemDefinition({ id: "item.potion", weightLb: 1, volumeCuFt: 0.1 })],
      ["item.rock", createItemDefinition({ id: "item.rock", weightLb: 5, volumeCuFt: 1 })],
      [
        "item.boulder",
        createItemDefinition({ id: "item.boulder", weightLb: 501, volumeCuFt: 1 }),
      ],
      [
        "item.bag_of_holding",
        createItemDefinition({
          id: "item.bag_of_holding",
          name: "Bag of Holding",
          itemType: "container",
          weightLb: 15,
          volumeCuFt: 4,
        }),
      ],
    ]);
    const entries = new Map<string, InventoryEntryRow>([
      [
        "bag-entry",
        createEntry({
          id: "bag-entry",
          itemDefinitionId: "item.bag_of_holding",
        }),
      ],
    ]);
    const containerStates = new Map<string, ContainerStateRow>([
      ["bag-entry", createContainerState({ inventoryEntryId: "bag-entry" })],
    ]);
    let createCount = 0;

    const attachIncludes = (
      entry: InventoryEntryRow | null,
      include?: Record<string, unknown>,
    ) => {
      if (!entry) {
        return null;
      }

      return {
        ...entry,
        ...(include?.itemDefinition
          ? { itemDefinition: itemDefinitions.get(entry.itemDefinitionId) }
          : {}),
        ...(include?.containerState
          ? { containerState: containerStates.get(entry.id) ?? null }
          : {}),
      };
    };
    const prisma: {
      $transaction?: jest.Mock;
      itemDefinition?: Record<string, jest.Mock>;
      inventoryEntry?: Record<string, jest.Mock>;
      containerState?: Record<string, jest.Mock>;
      sessionCharacter?: Record<string, jest.Mock>;
    } = {};

    Object.assign(prisma, {
      $transaction: jest.fn(async (callback: (client: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
      itemDefinition: {
        findFirst: jest.fn(({ where }: { where: { OR: Array<Record<string, unknown>> } }) => {
          const id = where.OR
            .map((condition) => (condition as { id?: string }).id)
            .find(Boolean);
          const name = where.OR
            .map((condition) => (condition as { name?: { equals?: string } }).name?.equals)
            .find(Boolean);
          const found =
            (id ? itemDefinitions.get(id) : null) ??
            Array.from(itemDefinitions.values()).find(
              (definition) => name && definition.name.toLowerCase() === name.toLowerCase(),
            ) ??
            null;
          return Promise.resolve(found);
        }),
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(itemDefinitions.get(where.id) ?? null),
        ),
      },
      inventoryEntry: {
        findUnique: jest.fn(
          ({ where, include }: { where: { id: string }; include?: Record<string, unknown> }) =>
            Promise.resolve(attachIncludes(entries.get(where.id) ?? null, include)),
        ),
        findMany: jest.fn(
          ({
            where,
            include,
          }: {
            where: { containerEntryId?: string; sessionCharacterId?: string };
            include?: Record<string, unknown>;
          }) =>
            Promise.resolve(
              Array.from(entries.values())
                .filter((entry) =>
                  where.containerEntryId !== undefined
                    ? entry.containerEntryId === where.containerEntryId
                    : entry.sessionCharacterId === where.sessionCharacterId,
                )
                .map((entry) => attachIncludes(entry, include)),
            ),
        ),
        count: jest.fn(({ where }: { where: { containerEntryId: string } }) =>
          Promise.resolve(
            Array.from(entries.values()).filter(
              (entry) => entry.containerEntryId === where.containerEntryId,
            ).length,
          ),
        ),
        create: jest.fn(({ data }: { data: Omit<InventoryEntryRow, "id" | "createdAt" | "updatedAt"> }) => {
          const entry = createEntry({ ...data, id: `created-entry-${++createCount}` });
          entries.set(entry.id, entry);
          return Promise.resolve(entry);
        }),
        update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const current = entries.get(where.id);
          if (!current) {
            throw new Error(`Entry ${where.id} was not found.`);
          }

          const quantityPatch = data.quantity as { decrement?: number } | undefined;
          const next = {
            ...current,
            ...(data.containerEntryId !== undefined
              ? { containerEntryId: data.containerEntryId as string | null }
              : {}),
            ...(quantityPatch?.decrement
              ? { quantity: current.quantity - quantityPatch.decrement }
              : {}),
          };
          entries.set(next.id, next);
          return Promise.resolve(next);
        }),
        delete: jest.fn(({ where }: { where: { id: string } }) => {
          const current = entries.get(where.id);
          entries.delete(where.id);
          return Promise.resolve(current);
        }),
      },
      containerState: {
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { inventoryEntryId: string };
            data: Partial<ContainerStateRow>;
          }) => {
            const current = containerStates.get(where.inventoryEntryId);
            if (!current) {
              throw new Error(`ContainerState ${where.inventoryEntryId} was not found.`);
            }

            const next = { ...current, ...data };
            containerStates.set(where.inventoryEntryId, next);
            return Promise.resolve(next);
          },
        ),
      },
      sessionCharacter: {
        update: jest.fn().mockResolvedValue({}),
      },
    });

    return {
      service: new InventoryRuntimeService(prisma as never, new RuleEngineService()),
      entries,
      containerStates,
    };
  };

  it("adds an item into a container and recalculates capacity state", async () => {
    const { service, entries, containerStates } = createService();

    const entry = await service.addItem({
      sessionCharacterId: "session-character-1",
      itemDefinitionId: "item.potion",
      quantity: 3,
      containerEntryId: "bag-entry",
    });

    expect(entry.containerEntryId).toBe("bag-entry");
    expect(entries.get(entry.id)?.quantity).toBe(3);
    expect(containerStates.get("bag-entry")).toMatchObject({
      currentWeightLb: 3,
      currentVolumeCuFt: 0.30000000000000004,
      integrity: "INTACT",
    });
  });

  it("moves an existing item into a container and recalculates capacity state", async () => {
    const { service, entries, containerStates } = createService();
    entries.set(
      "rock-entry",
      createEntry({
        id: "rock-entry",
        itemDefinitionId: "item.rock",
        quantity: 2,
      }),
    );

    const moved = await service.moveItem({
      entryId: "rock-entry",
      containerEntryId: "bag-entry",
    });

    expect(moved.containerEntryId).toBe("bag-entry");
    expect(containerStates.get("bag-entry")).toMatchObject({
      currentWeightLb: 10,
      currentVolumeCuFt: 2,
    });
  });

  it("marks Bag of Holding as overloaded and rejects the mutation when capacity is exceeded", async () => {
    const { service, entries, containerStates } = createService();

    await expect(
      service.addItem({
        sessionCharacterId: "session-character-1",
        itemDefinitionId: "item.boulder",
        quantity: 1,
        containerEntryId: "bag-entry",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "INVENTORY_400",
        data: {
          reason: "bag_of_holding_capacity_exceeded",
          capacityViolation: "weight",
          containerDestroyed: true,
        },
      },
    });

    expect(containerStates.get("bag-entry")?.integrity).toBe("OVERLOADED");
    expect(Array.from(entries.values()).some((entry) => entry.itemDefinitionId === "item.boulder"))
      .toBe(false);
  });

  it("removes part of a stack and recalculates the source container", async () => {
    const { service, entries, containerStates } = createService();
    entries.set(
      "potion-stack",
      createEntry({
        id: "potion-stack",
        itemDefinitionId: "item.potion",
        quantity: 3,
        containerEntryId: "bag-entry",
      }),
    );
    await service.recalculateContainerState("bag-entry");

    const remaining = await service.removeItem({ entryId: "potion-stack", quantity: 1 });

    expect(remaining).toMatchObject({ id: "potion-stack", quantity: 2 });
    expect(containerStates.get("bag-entry")).toMatchObject({
      currentWeightLb: 2,
      currentVolumeCuFt: 0.2,
    });
  });
});
