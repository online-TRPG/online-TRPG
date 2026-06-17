import {
  CharacterAvatarType as PrismaCharacterAvatarType,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { CharactersService } from "./characters.service";
import { LevelUpService } from "../rules/level-up.service";

const baseCharacter = {
  id: "character-1",
  ownerUserId: "user-1",
  scenarioId: null,
  name: "Aria",
  ancestry: "Human",
  className: "fighter",
  subclassName: null,
  level: 1,
  bio: null,
  abilitiesJson: JSON.stringify({ str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 10 }),
  proficiencyBonus: 2,
  proficientSkillsJson: JSON.stringify([]),
  featuresJson: JSON.stringify(["class.fighter.feature.fighting_style", "class.fighter.feature.second_wind"]),
  maxHp: 12,
  armorClass: 16,
  speed: 30,
  inventoryJson: JSON.stringify([]),
  spellsJson: null,
  equippedWeaponId: null,
  offhandWeaponId: null,
  avatarType: PrismaCharacterAvatarType.DEFAULT,
  avatarPresetId: null,
  avatarUrl: null,
  avatarUpdatedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

describe("CharactersService level up", () => {
  const createService = () => {
    const prisma = {
      character: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      sessionCharacter: {
        update: jest.fn(),
      },
      sessionParticipant: {
        update: jest.fn(),
      },
      user: {
        findUniqueOrThrow: jest.fn(),
      },
      scenario: {
        findUnique: jest.fn(),
      },
      item: {
        findUnique: jest.fn(),
      },
      race: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const sessionsService = {
      buildSnapshot: jest.fn().mockResolvedValue({ sessionId: "session-1" }),
    };
    const realtimeEvents = {
      emitSessionSnapshot: jest.fn(),
    };
    const catalogService = {
      findClassByKey: jest.fn().mockResolvedValue({
        hitDie: "d10",
        koName: "파이터",
        startingEquipmentJson: JSON.stringify({ slots: [] }),
        startingCantripCount: 0,
        startingSpellCount: 0,
        skillChoicesJson: JSON.stringify([]),
        skillChoiceCount: 0,
      }),
    };
    const racesService = {
      findByKey: jest.fn().mockResolvedValue(null),
    };
    const ruleCatalogService = {
      getCharacterFeatureSnapshot: jest.fn().mockReturnValue({
        featureIds: [
          "class.fighter.feature.fighting_style",
          "class.fighter.feature.second_wind",
          "class.fighter.feature.action_surge",
          "class.fighter.feature.martial_archetype",
          "subclass.fighter.champion.feature.improved_critical",
        ],
      }),
      listSubclassFeatures: jest.fn().mockReturnValue([
        { id: "subclass.fighter.champion.feature.improved_critical" },
      ]),
    };

    return {
      service: new CharactersService(
        prisma as never,
        sessionsService as never,
        realtimeEvents as never,
        racesService as never,
        catalogService as never,
        ruleCatalogService as never,
        new LevelUpService(),
      ),
      prisma,
      sessionsService,
      realtimeEvents,
      catalogService,
      ruleCatalogService,
    };
  };

  it("rejects blank starting spell selections after trimming", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d8",
      koName: "바드",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 2,
      startingSpellCount: 3,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });

    await expect(
      service.createCharacter("user-1", {
        name: "Blank Spell Bard",
        ancestry: "Unknown",
        className: "bard",
        level: 1,
        abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
        proficientSkills: [],
        startingEquipmentSelection: [],
        startingSpells: {
          cantrips: ["spell.fire_bolt", ""],
          spells: ["spell.magic_missile", " ", "spell.sleep"],
        },
      }),
    ).rejects.toThrow("시작 주문");

    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate starting spell selections after normalization", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d6",
      koName: "위저드",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 3,
      startingSpellCount: 3,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });

    await expect(
      service.createCharacter("user-1", {
        name: "Duplicate Spell Wizard",
        ancestry: "Unknown",
        className: "wizard",
        level: 1,
        abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 10 },
        proficientSkills: [],
        startingEquipmentSelection: [],
        startingSpells: {
          cantrips: ["spell.fire_bolt", "fire bolt", "spell.light"],
          spells: ["spell.magic_missile", "spell.shield", "spell.sleep"],
        },
      }),
    ).rejects.toThrow("시작 주문");

    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("rejects starting spell selections outside the executable MVP spell pool", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d6",
      koName: "위저드",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 3,
      startingSpellCount: 3,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });

    await expect(
      service.createCharacter("user-1", {
        name: "Unsupported Spell Wizard",
        ancestry: "Unknown",
        className: "wizard",
        level: 1,
        abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 10 },
        proficientSkills: [],
        startingEquipmentSelection: [],
        startingSpells: {
          cantrips: ["spell.fire_bolt", "spell.light", "spell.mending"],
          spells: ["spell.magic_missile", "spell.shield", "spell.detect_magic"],
        },
      }),
    ).rejects.toThrow("MVP");

    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("accepts executable higher-level MVP spells for higher-level starting casters", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d6",
      koName: "위저드",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 3,
      startingSpellCount: 3,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });
    prisma.character.create.mockResolvedValue({
      ...baseCharacter,
      className: "wizard",
      level: 5,
      maxHp: 32,
      proficiencyBonus: 3,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt", "spell.light", "spell.chill_touch"],
        spells: ["spell.magic_missile", "spell.shield", "spell.fireball"],
        preparedSpells: ["spell.fireball"],
      }),
      sessionCharacters: [],
    });

    const result = await service.createCharacter("user-1", {
      name: "Fireball Wizard",
      ancestry: "Unknown",
      className: "wizard",
      level: 5,
      abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 10 },
      proficientSkills: [],
      startingEquipmentSelection: [],
      startingSpells: {
        cantrips: ["spell.fire_bolt", "spell.light", "spell.chill_touch"],
        spells: ["spell.magic_missile", "spell.shield", "spell.fireball"],
        preparedSpells: ["spell.fireball"],
      },
    });

    expect(prisma.character.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: ["spell.fire_bolt", "spell.light", "spell.chill_touch"],
            spells: ["spell.magic_missile", "spell.shield", "spell.fireball"],
            preparedSpells: ["spell.fireball"],
          }),
        }),
      }),
    );
    expect(result.spells?.preparedSpells).toEqual(["spell.fireball"]);
  });

  it("levels up the character and explicitly updates active session snapshots", async () => {
    const { service, prisma, sessionsService, realtimeEvents, ruleCatalogService } = createService();
    const existing = {
      ...baseCharacter,
      sessionCharacters: [
        {
          id: "session-character-1",
          sessionId: "session-1",
          userId: "user-1",
          session: { id: "session-1", status: PrismaSessionStatus.PLAYING },
        },
      ],
    };
    const updated = {
      ...baseCharacter,
      level: 3,
      maxHp: 28,
      proficiencyBonus: 2,
      subclassName: "champion",
      featuresJson: JSON.stringify([
        "class.fighter.feature.fighting_style",
        "class.fighter.feature.second_wind",
        "class.fighter.feature.action_surge",
        "class.fighter.feature.martial_archetype",
        "subclass.fighter.champion.feature.improved_critical",
      ]),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
      sessionCharacters: existing.sessionCharacters,
    };

    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 3,
      hpMode: "average",
      applyToActiveSessions: true,
      subclassName: "champion",
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "character-1" },
        data: expect.objectContaining({
          level: 3,
          subclassName: "champion",
          maxHp: 28,
          proficiencyBonus: 2,
          featuresJson: JSON.stringify([
            "class.fighter.feature.fighting_style",
            "class.fighter.feature.second_wind",
            "class.fighter.feature.action_surge",
            "class.fighter.feature.martial_archetype",
            "subclass.fighter.champion.feature.improved_critical",
          ]),
        }),
      }),
    );
    expect(ruleCatalogService.getCharacterFeatureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ classKey: "fighter", subclassKey: "champion", classLevel: 3 }),
    );
    expect(prisma.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-1" },
      data: { currentHp: 28 },
    });
    expect(sessionsService.buildSnapshot).toHaveBeenCalledWith("session-1");
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", { sessionId: "session-1" });
    expect(result.level).toBe(3);
    expect(result.subclassName).toBe("champion");
    expect(result.maxHp).toBe(28);
  });

  it("requires a subclass choice when level up reaches the class choice level", async () => {
    const { service, prisma } = createService();
    prisma.character.findUnique.mockResolvedValue({
      ...baseCharacter,
      sessionCharacters: [],
    });

    await expect(
      service.levelUpCharacter("user-1", "character-1", {
        targetLevel: 3,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "LEVEL_UP_SUBCLASS_REQUIRED",
      }),
    });

    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("updates prepared spells as part of level up when requested", async () => {
    const { service, prisma } = createService();
    const existing = {
      ...baseCharacter,
      className: "wizard",
      subclassName: "evocation",
      level: 1,
      maxHp: 8,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile", "spell.shield"],
        preparedSpells: ["spell.shield"],
      }),
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 2,
      subclassName: "evocation",
      maxHp: 14,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile", "spell.shield"],
        preparedSpells: ["spell.magic_missile"],
      }),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    const dto = {
      targetLevel: 2,
      hpMode: "average" as const,
      preparedSpells: [" magic missile ", "spell.magic_missile"],
    };

    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", dto);

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: ["spell.fire_bolt"],
            spells: ["spell.magic_missile", "spell.shield"],
            preparedSpells: ["spell.magic_missile"],
          }),
        }),
      }),
    );
    expect(result.spells?.preparedSpells).toEqual(["spell.magic_missile"]);
  });

  it("learns new MVP slot spells as part of level up before preparing them", async () => {
    const { service, prisma } = createService();
    const existing = {
      ...baseCharacter,
      className: "wizard",
      subclassName: "evocation",
      level: 4,
      maxHp: 20,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile", "spell.shield"],
        preparedSpells: ["spell.shield"],
      }),
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 5,
      maxHp: 26,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile", "spell.shield", "spell.fireball"],
        preparedSpells: ["spell.fireball"],
      }),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };

    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 5,
      hpMode: "average",
      knownSpells: [" spell.fireball "],
      preparedSpells: ["spell.fireball"],
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: ["spell.fire_bolt"],
            spells: ["spell.magic_missile", "spell.shield", "spell.fireball"],
            preparedSpells: ["spell.fireball"],
          }),
        }),
      }),
    );
    expect(result.spells?.spells).toContain("spell.fireball");
    expect(result.spells?.preparedSpells).toEqual(["spell.fireball"]);
  });

  it("updates prepared spells during an active session and emits a fresh snapshot", async () => {
    const { service, prisma, sessionsService, realtimeEvents } = createService();
    const existing = {
      ...baseCharacter,
      className: "wizard",
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile", "spell.shield"],
        preparedSpells: ["spell.shield"],
      }),
      sessionCharacters: [
        {
          id: "session-character-1",
          sessionId: "session-1",
          userId: "user-1",
          session: { id: "session-1", status: PrismaSessionStatus.PLAYING },
        },
      ],
    };
    const updated = {
      ...existing,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile", "spell.shield"],
        preparedSpells: ["spell.magic_missile"],
      }),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };

    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.updatePreparedSpells("user-1", "character-1", {
      preparedSpells: [" spell.magic_missile ", "spell.magic_missile"],
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "character-1" },
        data: {
          spellsJson: JSON.stringify({
            cantrips: ["spell.fire_bolt"],
            spells: ["spell.magic_missile", "spell.shield"],
            preparedSpells: ["spell.magic_missile"],
          }),
        },
      }),
    );
    expect(sessionsService.buildSnapshot).toHaveBeenCalledWith("session-1");
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", { sessionId: "session-1" });
    expect(result.spells?.preparedSpells).toEqual(["spell.magic_missile"]);
  });

  it("rejects prepared spells that are not known by the character", async () => {
    const { service, prisma } = createService();
    prisma.character.findUnique.mockResolvedValue({
      ...baseCharacter,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile"],
      }),
      sessionCharacters: [],
    });

    await expect(
      service.updatePreparedSpells("user-1", "character-1", {
        preparedSpells: ["spell.fireball"],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "PREPARED_SPELL_NOT_KNOWN",
      }),
    });

    expect(prisma.character.update).not.toHaveBeenCalled();
  });
});
