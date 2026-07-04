import {
  CharacterAvatarType as PrismaCharacterAvatarType,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import { InventoryItemCharacterReaderService } from "./inventory-item-character-reader.service";

describe("InventoryItemCharacterReaderService", () => {
  const prisma = {
    sessionCharacter: {
      findUniqueOrThrow: jest.fn(),
    },
  };
  const service = new InventoryItemCharacterReaderService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sessionCharacter.findUniqueOrThrow.mockResolvedValue({
      id: "session-character-1",
      sessionId: "session-1",
      userId: "user-1",
      characterId: "character-1",
      status: PrismaSessionCharacterStatus.ACTIVE,
      currentHp: 7,
      tempHp: 0,
      hitDiceSpent: 0,
      conditionsJson: "[]",
      inventorySnapshotJson: "[]",
      createdAt: new Date("2026-07-02T00:00:00.000Z"),
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
      character: {
        id: "character-1",
        ownerUserId: "user-1",
        name: "Asha",
        ancestry: "Human",
        className: "Fighter",
        subclassName: null,
        level: 1,
        bio: null,
        abilitiesJson: "{}",
        proficientSkillsJson: "[]",
        featuresJson: "[]",
        spellsJson: null,
        proficiencyBonus: 2,
        maxHp: 12,
        armorClass: 14,
        speed: 30,
        equippedWeaponId: null,
        offhandWeaponId: null,
        avatarType: PrismaCharacterAvatarType.PRESET,
        avatarPresetId: null,
        avatarUrl: null,
        inventoryJson: "[]",
      },
      inventoryEntries: [
        {
          id: "entry-1",
          quantity: 1,
          itemDefinitionId: "equipment.dagger",
          containerEntryId: null,
          itemDefinition: {
            id: "equipment.dagger",
            name: "Dagger",
            itemType: "weapon",
            description: null,
            weightLb: null,
            volumeCuFt: null,
            damageDice: null,
            damageType: null,
            armorClassBase: null,
            armorClassBonus: null,
            armorStrengthRequirement: null,
            armorStealthDisadvantage: null,
            useEffect: null,
            packContentsJson: null,
            propertiesJson: "[]",
          },
        },
      ],
    });
  });

  it("loads a session character with inventory entries and maps it", async () => {
    const result = await service.getMappedSessionCharacter("session-character-1");

    expect(prisma.sessionCharacter.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "session-character-1" },
      include: {
        character: true,
        inventoryEntries: {
          include: { itemDefinition: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    expect(result).toMatchObject({
      id: "session-character-1",
      name: "Asha",
      inventory: [
        expect.objectContaining({
          id: "entry-1",
          itemDefinitionId: "equipment.dagger",
        }),
      ],
    });
  });
});
