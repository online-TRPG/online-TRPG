import {
  AuthProvider as PrismaAuthProvider,
  CharacterAvatarType as PrismaCharacterAvatarType,
  ConnectionStatus as PrismaConnectionStatus,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
  UserRole as PrismaUserRole,
} from "@prisma/client";
import { SessionCharacterSelectionService } from "./session-character-selection.service";

describe("SessionCharacterSelectionService", () => {
  const prisma = {
    sessionParticipant: {
      findUnique: jest.fn(),
    },
    sessionCharacter: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    character: {
      findUnique: jest.fn(),
    },
    inventoryEntry: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const realtimeEvents = {
    emitCharacterUpdated: jest.fn(),
  };
  const campaignArchiveRuntime = {
    ensureCharacterMatchesScenarioLevel: jest.fn(),
  };
  const sessionInventory = {
    replaceSessionInventoryEntries: jest.fn(),
  };
  const sessionParticipantStatus = {
    clearReadyState: jest.fn(),
  };
  const service = new SessionCharacterSelectionService(
    prisma as never,
    realtimeEvents as never,
    campaignArchiveRuntime as never,
    sessionInventory as never,
    sessionParticipantStatus as never,
  );

  const participant = {
    id: "participant-1",
    sessionId: "session-1",
    userId: "user-1",
    role: PrismaParticipantRole.PLAYER,
    status: PrismaParticipantStatus.JOINED,
    connectionStatus: PrismaConnectionStatus.ONLINE,
    isReady: true,
    readyAt: new Date("2026-05-14T01:00:00.000Z"),
    joinedAt: new Date("2026-05-14T00:30:00.000Z"),
    leftAt: null,
    user: {
      id: "user-1",
      publicId: "public-user-1",
      email: "user@example.com",
      displayName: "User",
      nickname: "User",
      authProvider: PrismaAuthProvider.LOCAL,
      role: PrismaUserRole.USER,
      profileImageUrl: null,
      createdAt: new Date("2026-05-14T00:00:00.000Z"),
    },
    sessionCharacter: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (handler) =>
      handler({
        inventoryEntry: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
        },
        itemDefinition: {
          findMany: jest.fn().mockResolvedValue([{ id: "item-1" }]),
        },
      }),
    );
    sessionParticipantStatus.clearReadyState.mockResolvedValue({
      userId: "user-1",
      isReady: false,
    });
    sessionInventory.replaceSessionInventoryEntries.mockResolvedValue(undefined);
  });

  it("clears the selected character and participant ready state", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue(participant);

    await expect(
      service.selectCharacter({
        sessionId: "session-1",
        userId: "user-1",
        sessionStatus: PrismaSessionStatus.RECRUITING,
        characterId: null,
        getScenarioForSelectionValidation: jest.fn(),
      }),
    ).resolves.toEqual({
      userId: "user-1",
      isReady: false,
    });

    expect(prisma.sessionCharacter.deleteMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        userId: "user-1",
      },
    });
    expect(sessionInventory.replaceSessionInventoryEntries).toHaveBeenCalledWith(
      "session-character-1",
      [{ itemDefinitionId: "item-1", quantity: 2 }],
    );
    expect(sessionParticipantStatus.clearReadyState).toHaveBeenCalledWith({
      sessionId: "session-1",
      participantId: "participant-1",
    });
  });

  it("selects a character, syncs inventory entries, and emits character update", async () => {
    prisma.sessionParticipant.findUnique.mockResolvedValue(participant);
    prisma.character.findUnique.mockResolvedValue({
      id: "character-1",
      ownerUserId: "user-1",
      name: "Hero",
      level: 3,
      maxHp: 24,
      inventoryJson: JSON.stringify([
        { itemDefinitionId: "item-1", quantity: 2 },
      ]),
      sessionCharacters: [],
    });
    prisma.sessionCharacter.upsert.mockResolvedValue({
      id: "session-character-1",
    });
    prisma.inventoryEntry.findMany.mockResolvedValue([
      {
        id: "entry-1",
        itemDefinitionId: "item-1",
        quantity: 2,
        containerEntryId: null,
        itemDefinition: {
          name: "Rope",
          itemType: "gear",
          weightLb: null,
          volumeCuFt: null,
          damageDice: null,
          damageType: null,
          propertiesJson: null,
        },
      },
    ]);
    prisma.sessionCharacter.findUniqueOrThrow.mockResolvedValue({
      id: "session-character-1",
      sessionId: "session-1",
      userId: "user-1",
      characterId: "character-1",
      status: PrismaSessionCharacterStatus.ACTIVE,
      currentHp: 24,
      tempHp: 0,
      conditionsJson: "[]",
      inventorySnapshotJson: "[]",
      createdAt: new Date("2026-05-14T00:30:00.000Z"),
      updatedAt: new Date("2026-05-14T01:00:00.000Z"),
      character: {
        id: "character-1",
        ownerUserId: "user-1",
        name: "Hero",
        ancestry: "human",
        className: "fighter",
        subclassName: null,
        level: 3,
        bio: null,
        abilitiesJson: "{}",
        proficiencyBonus: 2,
        proficientSkillsJson: "[]",
        featuresJson: "[]",
        maxHp: 24,
        armorClass: 16,
        speed: 30,
        inventoryJson: "[]",
        spellsJson: null,
        equippedWeaponId: null,
        offhandWeaponId: null,
        avatarType: PrismaCharacterAvatarType.DEFAULT,
        avatarPresetId: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
      },
      inventoryEntries: [],
    });

    await service.selectCharacter({
      sessionId: "session-1",
      userId: "user-1",
      sessionStatus: PrismaSessionStatus.RECRUITING,
      characterId: "character-1",
      getScenarioForSelectionValidation: jest.fn(async () => ({
        scenario: {
          title: "Scenario",
          startLevel: 1,
          recommendedEndLevel: 5,
        },
      })),
    });

    expect(campaignArchiveRuntime.ensureCharacterMatchesScenarioLevel).toHaveBeenCalledWith({
      characterName: "Hero",
      characterLevel: 3,
      scenario: {
        title: "Scenario",
        startLevel: 1,
        recommendedEndLevel: 5,
      },
    });
    expect(prisma.sessionCharacter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_userId: {
            sessionId: "session-1",
            userId: "user-1",
          },
        },
      }),
    );
    expect(sessionParticipantStatus.clearReadyState).toHaveBeenCalledWith({
      sessionId: "session-1",
      participantId: "participant-1",
    });
    expect(realtimeEvents.emitCharacterUpdated).toHaveBeenCalled();
  });
});
