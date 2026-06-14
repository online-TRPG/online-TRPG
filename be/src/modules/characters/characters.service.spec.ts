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
      findClassByKey: jest.fn().mockResolvedValue({ hitDie: "d10", koName: "파이터" }),
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
      ruleCatalogService,
    };
  };

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
