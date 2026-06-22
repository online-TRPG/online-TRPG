import { CharacterResourceService } from "./character-resource.service";

const sessionCharacterId = "session-character-1";

const createResource = (overrides: Record<string, unknown> = {}) => ({
  sessionCharacterId,
  secondWindAvailable: true,
  actionSurgeUses: 1,
  rageUses: 2,
  rageActive: false,
  rageEndsAtRound: null,
  rageEndsAtTurn: null,
  frenzyActive: false,
  exhaustionLevel: 0,
  hitDiceSpent: 0,
  createdAt: new Date("2026-05-06T00:00:00.000Z"),
  updatedAt: new Date("2026-05-06T00:00:00.000Z"),
  ...overrides,
});

describe("CharacterResourceService", () => {
  const createService = () => {
    const prisma = {
      sessionCharacterResource: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    return {
      service: new CharacterResourceService(prisma as never),
      prisma,
    };
  };

  it("gets or creates a session character resource row", async () => {
    const { service, prisma } = createService();
    const resource = createResource();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(resource);

    await expect(
      service.getOrCreateResource(sessionCharacterId, {
        actionSurgeUses: 1,
        rageUses: 2,
      }),
    ).resolves.toBe(resource);
    expect(prisma.sessionCharacterResource.upsert).toHaveBeenCalledWith({
      where: { sessionCharacterId },
      create: {
        sessionCharacterId,
        actionSurgeUses: 1,
        rageUses: 2,
      },
      update: {},
    });
  });

  it("spends Second Wind once", async () => {
    const { service, prisma } = createService();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(createResource());
    prisma.sessionCharacterResource.update.mockResolvedValue(
      createResource({ secondWindAvailable: false }),
    );

    await expect(service.spendSecondWind(sessionCharacterId)).resolves.toMatchObject({
      secondWindAvailable: false,
    });
    expect(prisma.sessionCharacterResource.update).toHaveBeenCalledWith({
      where: { sessionCharacterId },
      data: { secondWindAvailable: false },
    });
  });

  it("rejects Second Wind when it is already spent", async () => {
    const { service, prisma } = createService();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(
      createResource({ secondWindAvailable: false }),
    );

    await expect(service.spendSecondWind(sessionCharacterId)).rejects.toMatchObject({
      response: {
        code: "ACTION_400",
        data: { reason: "SECOND_WIND_UNAVAILABLE" },
      },
    });
  });

  it("spends one Action Surge use", async () => {
    const { service, prisma } = createService();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(createResource({ actionSurgeUses: 1 }));
    prisma.sessionCharacterResource.update.mockResolvedValue(createResource({ actionSurgeUses: 0 }));

    await expect(service.spendActionSurgeUse(sessionCharacterId)).resolves.toMatchObject({
      actionSurgeUses: 0,
    });
    expect(prisma.sessionCharacterResource.update).toHaveBeenCalledWith({
      where: { sessionCharacterId },
      data: { actionSurgeUses: { decrement: 1 } },
    });
  });

  it("starts Rage by spending one use and setting the end turn marker", async () => {
    const { service, prisma } = createService();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(createResource({ rageUses: 2 }));
    prisma.sessionCharacterResource.update.mockResolvedValue(
      createResource({ rageUses: 1, rageActive: true, rageEndsAtRound: 3, rageEndsAtTurn: 4 }),
    );

    await expect(
      service.startRage({
        sessionCharacterId,
        rageEndsAtRound: 3,
        rageEndsAtTurn: 4,
      }),
    ).resolves.toMatchObject({
      rageUses: 1,
      rageActive: true,
    });
    expect(prisma.sessionCharacterResource.update).toHaveBeenCalledWith({
      where: { sessionCharacterId },
      data: {
        rageUses: { decrement: 1 },
        rageActive: true,
        rageEndsAtRound: 3,
        rageEndsAtTurn: 4,
      },
    });
  });

  it("ends Frenzy Rage and increases exhaustion once", async () => {
    const { service, prisma } = createService();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(
      createResource({ rageActive: true, frenzyActive: true, exhaustionLevel: 1 }),
    );
    prisma.sessionCharacterResource.update.mockResolvedValue(
      createResource({ rageActive: false, frenzyActive: false, exhaustionLevel: 2 }),
    );

    await expect(service.endRage(sessionCharacterId)).resolves.toMatchObject({
      rageActive: false,
      frenzyActive: false,
      exhaustionLevel: 2,
    });
  });

  it("recovers class resources on long rest with caller-provided maximum counts", async () => {
    const { service, prisma } = createService();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(
      createResource({ secondWindAvailable: false, exhaustionLevel: 2 }),
    );
    prisma.sessionCharacterResource.update.mockResolvedValue(
      createResource({
        secondWindAvailable: true,
        actionSurgeUses: 1,
        rageUses: 3,
        exhaustionLevel: 1,
      }),
    );

    await expect(
      service.recoverLongRest({
        sessionCharacterId,
        secondWindAvailable: true,
        actionSurgeUses: 1,
        rageUses: 3,
      }),
    ).resolves.toMatchObject({
      secondWindAvailable: true,
      actionSurgeUses: 1,
      rageUses: 3,
      exhaustionLevel: 1,
    });
  });

  it("stores spent hit dice on short rest", async () => {
    const { service, prisma } = createService();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(createResource({ hitDiceSpent: 1 }));
    prisma.sessionCharacterResource.update.mockResolvedValue(createResource({ hitDiceSpent: 3 }));

    await expect(
      service.recoverShortRest({
        sessionCharacterId,
        secondWindAvailable: true,
        hitDiceSpent: 3,
      }),
    ).resolves.toMatchObject({
      hitDiceSpent: 3,
    });
    expect(prisma.sessionCharacterResource.update).toHaveBeenCalledWith({
      where: { sessionCharacterId },
      data: {
        secondWindAvailable: true,
        hitDiceSpent: 3,
      },
    });
  });

  it("does not change Second Wind availability when the caller omits that resource", async () => {
    const { service, prisma } = createService();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(
      createResource({ secondWindAvailable: false }),
    );
    prisma.sessionCharacterResource.update.mockResolvedValue(
      createResource({ secondWindAvailable: false, hitDiceSpent: 1 }),
    );

    await service.recoverShortRest({
      sessionCharacterId,
      hitDiceSpent: 1,
    });

    expect(prisma.sessionCharacterResource.update).toHaveBeenCalledWith({
      where: { sessionCharacterId },
      data: {
        hitDiceSpent: 1,
      },
    });
  });

  it("stores recovered hit dice on long rest", async () => {
    const { service, prisma } = createService();
    prisma.sessionCharacterResource.upsert.mockResolvedValue(createResource({ hitDiceSpent: 4 }));
    prisma.sessionCharacterResource.update.mockResolvedValue(createResource({ hitDiceSpent: 2 }));

    await expect(
      service.recoverLongRest({
        sessionCharacterId,
        hitDiceSpent: 2,
      }),
    ).resolves.toMatchObject({
      hitDiceSpent: 2,
    });
    expect(prisma.sessionCharacterResource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hitDiceSpent: 2,
        }),
      }),
    );
  });
});
