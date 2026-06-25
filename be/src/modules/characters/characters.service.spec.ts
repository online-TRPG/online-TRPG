import {
  CharacterAvatarType as PrismaCharacterAvatarType,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { CharactersService } from "./characters.service";
import { LevelUpService } from "../rules/level-up.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";

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

const wizardLevel1StartingSpells = [
  "spell.detect_magic",
  "spell.magic_missile",
  "spell.shield",
  "spell.sleep",
  "spell.burning_hands",
  "spell.thunderwave",
];

const wizardLevel5StartingSpells = [
  "spell.bless",
  "spell.bane",
  "spell.detect_magic",
  "spell.magic_missile",
  "spell.cure_wounds",
  "spell.guiding_bolt",
  "spell.inflict_wounds",
  "spell.healing_word",
  "spell.command",
  "spell.shield",
  "spell.sleep",
  "spell.burning_hands",
  "spell.thunderwave",
  "spell.fireball",
];

const wizardLevel16StartingSpells = [
  "spell.bless",
  "spell.bane",
  "spell.detect_magic",
  "spell.magic_missile",
  "spell.cure_wounds",
  "spell.guiding_bolt",
  "spell.inflict_wounds",
  "spell.healing_word",
  "spell.command",
  "spell.shield",
  "spell.sleep",
  "spell.burning_hands",
  "spell.thunderwave",
  "spell.entangle",
  "spell.charm_person",
  "spell.faerie_fire",
  "spell.feather_fall",
  "spell.fog_cloud",
  "spell.grease",
  "spell.heroism",
  "spell.hunters_mark",
  "spell.longstrider",
  "spell.hold_person",
  "spell.web",
  "spell.misty_step",
  "spell.scorching_ray",
  "spell.aid",
  "spell.blindness_deafness",
  "spell.darkness",
  "spell.invisibility",
  "spell.lesser_restoration",
  "spell.moonbeam",
  "spell.spiritual_weapon",
  "spell.fireball",
  "spell.dispel_magic",
  "spell.counterspell",
];

describe("CharactersService level up", () => {
  const createService = () => {
    const actualRuleCatalogService = new RuleCatalogService();
    const prisma = {
      character: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      sessionCharacter: {
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
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
      emitCharacterUpdated: jest.fn(),
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
      getSubclassChoiceLevel: jest.fn((className: string) => {
        const choiceLevels: Record<string, number> = {
          cleric: 1,
          sorcerer: 1,
          warlock: 1,
          druid: 2,
          wizard: 2,
          barbarian: 3,
          bard: 3,
          fighter: 3,
          monk: 3,
          paladin: 3,
          ranger: 3,
          rogue: 3,
        };
        return choiceLevels[className.trim().toLowerCase()] ?? null;
      }),
      getCharacterFeatureSnapshot: jest.fn((params: Parameters<RuleCatalogService["getCharacterFeatureSnapshot"]>[0]) => {
        try {
          return actualRuleCatalogService.getCharacterFeatureSnapshot(params);
        } catch {
          return {
            featureIds: [
              "class.fighter.feature.fighting_style",
              "class.fighter.feature.second_wind",
              "class.fighter.feature.action_surge",
              "class.fighter.feature.martial_archetype",
              "subclass.fighter.champion.feature.improved_critical",
            ],
          };
        }
      }),
      resolveRuntimeTags: jest.fn((featureIds: Iterable<string>) =>
        actualRuleCatalogService.resolveRuntimeTags(featureIds),
      ),
      listSubclassFeatures: jest.fn((
        classKey: string,
        subclassKey: string,
        classLevel?: number,
      ) => actualRuleCatalogService.listSubclassFeatures(classKey, subclassKey, classLevel)),
      listClassFeaturesForLevel: jest.fn((classKey: string, classLevel?: number) =>
        actualRuleCatalogService.listClassFeaturesForLevel(classKey, classLevel),
      ),
      listEntries: jest.fn((kind?: Parameters<RuleCatalogService["listEntries"]>[0]) =>
        actualRuleCatalogService.listEntries(kind),
      ),
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
      racesService,
      ruleCatalogService,
    };
  };

  it("uses seeded race speed and hill dwarf HP bonus during creation", async () => {
    const { service, prisma, racesService } = createService();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });
    racesService.findByKey.mockResolvedValue({
      id: "race-hill-dwarf",
      key: "hill-dwarf",
      koName: "언덕 드워프",
      size: "Medium",
      baseSpeed: 25,
      abilityIncreasesJson: JSON.stringify({
        str: 0,
        dex: 0,
        con: 2,
        int: 0,
        wis: 1,
        cha: 0,
      }),
      languagesJson: JSON.stringify(["Common", "Dwarvish"]),
      parentRaceId: "race-dwarf",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    prisma.character.create.mockResolvedValue({
      ...baseCharacter,
      ancestry: "hill-dwarf",
      abilitiesJson: JSON.stringify({
        str: 15,
        dex: 14,
        con: 15,
        int: 12,
        wis: 11,
        cha: 8,
      }),
      maxHp: 13,
      speed: 25,
      sessionCharacters: [],
    });

    await service.createCharacter("user-1", {
      name: "Hill Dwarf Fighter",
      ancestry: "hill-dwarf",
      className: "fighter",
      abilities: {
        str: 15,
        dex: 14,
        con: 15,
        int: 12,
        wis: 11,
        cha: 8,
      },
      proficientSkills: [],
      startingEquipmentSelection: [],
    });

    expect(prisma.character.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maxHp: 13,
          speed: 25,
        }),
      }),
    );
  });

  it("requires a valid draconic ancestry selection for dragonborn creation", async () => {
    const { service, prisma, racesService } = createService();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });
    racesService.findByKey.mockResolvedValue({
      id: "race-dragonborn",
      key: "dragonborn",
      koName: "드래곤본",
      size: "Medium",
      baseSpeed: 30,
      abilityIncreasesJson: JSON.stringify({
        str: 2,
        dex: 0,
        con: 0,
        int: 0,
        wis: 0,
        cha: 1,
      }),
      languagesJson: JSON.stringify(["Common", "Draconic"]),
      parentRaceId: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    await expect(
      service.createCharacter("user-1", {
        name: "Dragonborn Fighter",
        ancestry: "dragonborn",
        className: "fighter",
        abilities: {
          str: 17,
          dex: 14,
          con: 13,
          int: 12,
          wis: 10,
          cha: 9,
        },
        proficientSkills: [],
        startingEquipmentSelection: [],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "CHARACTER_DRACONIC_ANCESTRY_REQUIRED",
      }),
    });
  });

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
          spells: ["spell.magic_missile", " ", "spell.sleep", "spell.cure_wounds"],
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
          spells: [
            "spell.magic_missile",
            "spell.shield",
            "spell.sleep",
            "spell.cure_wounds",
            "spell.detect_magic",
            "spell.burning_hands",
          ],
        },
      }),
    ).rejects.toThrow("시작 주문");

    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("rejects starting spell selections outside the executable spell catalog", async () => {
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
          spells: [
            "spell.magic_missile",
            "spell.shield",
            "spell.detect_magic",
            "spell.sleep",
            "spell.burning_hands",
            "spell.wish",
          ],
        },
      }),
    ).rejects.toThrow("실행 주문 카탈로그");

    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("rejects starting prepared spells that exceed the prepared caster limit", async () => {
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
        name: "Overprepared Wizard",
        ancestry: "Unknown",
        className: "wizard",
        level: 1,
        abilities: { str: 8, dex: 14, con: 14, int: 12, wis: 10, cha: 10 },
        proficientSkills: [],
        startingEquipmentSelection: [],
        startingSpells: {
          cantrips: ["spell.fire_bolt", "spell.light", "spell.chill_touch"],
          spells: wizardLevel1StartingSpells,
          preparedSpells: ["spell.magic_missile", "spell.shield", "spell.sleep"],
        },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "PREPARED_SPELL_LIMIT_EXCEEDED",
      }),
    });

    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("rejects prepared spell selections for known-spell casters", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d6",
      koName: "소서러",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 2,
      startingSpellCount: 2,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });

    await expect(
      service.createCharacter("user-1", {
        name: "Prepared Sorcerer",
        ancestry: "Unknown",
        className: "sorcerer",
        level: 1,
        abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
        proficientSkills: [],
        startingEquipmentSelection: [],
        startingSpells: {
          cantrips: [
            "spell.fire_bolt",
            "spell.ray_of_frost",
            "spell.light",
            "spell.chill_touch",
          ],
          spells: ["spell.magic_missile", "spell.shield"],
          preparedSpells: ["spell.magic_missile"],
        },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "PREPARED_SPELLS_NOT_SUPPORTED",
      }),
    });

    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("accepts executable higher-level catalog spells for higher-level starting casters", async () => {
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
        cantrips: [
          "spell.fire_bolt",
          "spell.light",
          "spell.chill_touch",
          "spell.ray_of_frost",
        ],
        spells: wizardLevel5StartingSpells,
        preparedSpells: ["spell.fireball"],
      }),
      sessionCharacters: [],
    });

    const result = await service.createCharacter("user-1", {
      name: "Fireball Wizard",
      ancestry: "Unknown",
      className: "wizard",
      subclassName: "evocation",
      level: 5,
      abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 10 },
      proficientSkills: [],
      startingEquipmentSelection: [],
      startingSpells: {
        cantrips: [
          "spell.fire_bolt",
          "spell.light",
          "spell.chill_touch",
          "spell.ray_of_frost",
        ],
        spells: wizardLevel5StartingSpells,
        preparedSpells: ["spell.fireball"],
      },
    });

    expect(prisma.character.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: [
              "spell.fire_bolt",
              "spell.light",
              "spell.chill_touch",
              "spell.ray_of_frost",
            ],
            spells: wizardLevel5StartingSpells,
            preparedSpells: ["spell.fireball"],
          }),
        }),
      }),
    );
    expect(result.spells?.preparedSpells).toEqual(["spell.fireball"]);
  });

  it("uses the official wizard spellbook count for level 16 starting casters", async () => {
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
      level: 16,
      maxHp: 98,
      proficiencyBonus: 5,
      spellsJson: JSON.stringify({
        cantrips: [
          "spell.fire_bolt",
          "spell.light",
          "spell.chill_touch",
          "spell.ray_of_frost",
          "spell.acid_splash",
        ],
        spells: wizardLevel16StartingSpells,
        preparedSpells: ["spell.fireball", "spell.counterspell"],
      }),
      sessionCharacters: [],
    });

    const result = await service.createCharacter("user-1", {
      name: "Astral Seal Wizard",
      ancestry: "Unknown",
      className: "wizard",
      subclassName: "evocation",
      level: 16,
      abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 10, cha: 10 },
      proficientSkills: [],
      startingEquipmentSelection: [],
      startingSpells: {
        cantrips: [
          "spell.fire_bolt",
          "spell.light",
          "spell.chill_touch",
          "spell.ray_of_frost",
          "spell.acid_splash",
        ],
        spells: wizardLevel16StartingSpells,
        preparedSpells: ["spell.fireball", "spell.counterspell"],
      },
    });

    expect(prisma.character.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: [
              "spell.fire_bolt",
              "spell.light",
              "spell.chill_touch",
              "spell.ray_of_frost",
              "spell.acid_splash",
            ],
            spells: wizardLevel16StartingSpells,
            preparedSpells: ["spell.fireball", "spell.counterspell"],
          }),
        }),
      }),
    );
    expect(result.spells?.spells).toEqual(wizardLevel16StartingSpells);
  });

  it("accepts Cure Wounds as an executable starting prepared spell", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d8",
      koName: "클레릭",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 3,
      startingSpellCount: 3,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });
    prisma.character.create.mockResolvedValue({
      ...baseCharacter,
      className: "cleric",
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt", "spell.light", "spell.chill_touch"],
        spells: [
          "spell.magic_missile",
          "spell.cure_wounds",
          "spell.shield",
          "spell.sleep",
        ],
        preparedSpells: ["spell.cure_wounds"],
      }),
      sessionCharacters: [],
    });

    const result = await service.createCharacter("user-1", {
      name: "Healing Cleric",
      ancestry: "Unknown",
      className: "cleric",
      subclassName: "life",
      level: 1,
      abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 },
      proficientSkills: [],
      startingEquipmentSelection: [],
      startingSpells: {
        cantrips: ["spell.fire_bolt", "spell.light", "spell.chill_touch"],
        spells: [
          "spell.magic_missile",
          "spell.cure_wounds",
          "spell.shield",
          "spell.sleep",
        ],
        preparedSpells: ["spell.cure_wounds"],
      },
    });

    expect(prisma.character.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: ["spell.fire_bolt", "spell.light", "spell.chill_touch"],
            spells: [
              "spell.magic_missile",
              "spell.cure_wounds",
              "spell.shield",
              "spell.sleep",
            ],
            preparedSpells: ["spell.cure_wounds"],
          }),
        }),
      }),
    );
    expect(result.spells?.preparedSpells).toEqual(["spell.cure_wounds"]);
  });

  it("requires a subclass when character creation starts at or above the class choice level", async () => {
    const { service, prisma } = createService();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });

    await expect(
      service.createCharacter("user-1", {
        name: "Subclassless Fighter",
        ancestry: "Unknown",
        className: "fighter",
        level: 3,
        abilities: { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
        proficientSkills: [],
        startingEquipmentSelection: [],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "CHARACTER_SUBCLASS_REQUIRED",
        levels: [3],
      }),
    });

    expect(prisma.character.create).not.toHaveBeenCalled();
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
    prisma.sessionCharacter.findUniqueOrThrow.mockResolvedValue({
      ...existing.sessionCharacters[0],
      currentHp: 28,
      tempHp: 0,
      status: "ACTIVE",
      character: updated,
      resource: { hitDiceSpent: 0 },
      inventoryEntries: [],
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    });

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
          armorClass: 16,
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
    expect(realtimeEvents.emitCharacterUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        id: "session-character-1",
        level: 3,
        maxHp: 28,
        currentHp: 28,
        subclassName: "champion",
        features: expect.arrayContaining([
          "subclass.fighter.champion.feature.improved_critical",
        ]),
      }),
    );
    expect(sessionsService.buildSnapshot).toHaveBeenCalledWith("session-1");
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalledWith("session-1", { sessionId: "session-1" });
    expect(result.level).toBe(3);
    expect(result.subclassName).toBe("champion");
    expect(result.maxHp).toBe(28);
  });

  it("exposes P6 level-up preview context for active downtime, archive transfer, equipment, spells, and concentration", async () => {
    const { service, prisma } = createService();
    prisma.character.findUnique.mockResolvedValue({
      ...baseCharacter,
      level: 20,
      equippedWeaponId: "item.staff_of_power",
      offhandWeaponId: "item.shield",
      inventoryJson: JSON.stringify([
        { id: "item-1", name: "Staff of Power", quantity: 1 },
        { id: "item-2", name: "Potion", quantity: 3 },
      ]),
      spellsJson: JSON.stringify({
        cantrips: ["spell.ray_of_frost"],
        spells: ["spell.wish", "spell.meteor_swarm"],
        preparedSpells: ["spell.wish"],
      }),
      sessionCharacters: [
        {
          id: "session-character-active",
          sessionId: "session-active",
          userId: "user-1",
          conditionsJson: JSON.stringify([
            { conditionId: "condition.concentration", tags: ["concentration:spell:spell.wish"] },
          ]),
          session: {
            id: "session-active",
            status: PrismaSessionStatus.PLAYING,
            sessionScenarios: [
              {
                id: "session-scenario-active",
                status: "ACTIVE",
                sequence: 1,
                gameState: {
                  currentNodeId: "node-p6-boss",
                  flagsJson: JSON.stringify({
                    economy: { partyStash: [], walletsBySessionCharacterId: {} },
                    campaignCalendar: {
                      downtimeTasks: [
                        { id: "dt-1", status: "active" },
                        { id: "dt-2", status: "completed" },
                      ],
                    },
                  }),
                },
              },
            ],
          },
        },
        {
          id: "session-character-archived",
          sessionId: "session-completed",
          userId: "user-1",
          conditionsJson: "[]",
          session: {
            id: "session-completed",
            status: PrismaSessionStatus.COMPLETED,
            sessionScenarios: [
              {
                id: "session-scenario-archive",
                status: "ACTIVE",
                sequence: 1,
                gameState: {
                  currentNodeId: "node-p6-archive",
                  flagsJson: JSON.stringify({
                    p6CampaignArchive: {
                      archiveId: "campaign-archive:1",
                      allowCharacterTransfer: true,
                    },
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const result = await service.getCharacter("user-1", "character-1");

    expect(result.levelUpPreviewContext).toEqual(
        expect.objectContaining({
          activeSessionId: "session-active",
        activeSessionStatus: "playing",
        currentNodeId: "node-p6-boss",
        campaignArchiveAvailable: true,
        campaignArchiveAllowsTransfer: true,
        transferEligibility: "transfer_allowed",
        activeDowntimeTaskCount: 1,
        completedDowntimeTaskCount: 1,
        hasEconomyState: true,
        inventoryItemCount: 4,
        equippedWeaponId: "item.staff_of_power",
        offhandWeaponId: "item.shield",
        knownSpellCount: 3,
        preparedSpellCount: 1,
        activeConditionCount: 2,
        hasActiveConcentration: true,
      }),
    );
  });

  it("applies Draconic Resilience HP bonus during sorcerer creation", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d6",
      koName: "소서러",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 0,
      startingSpellCount: 0,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" });
    prisma.character.create.mockResolvedValue({
      ...baseCharacter,
      className: "sorcerer",
      subclassName: "draconic_bloodline",
      level: 5,
      abilitiesJson: JSON.stringify({ str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 }),
      maxHp: 37,
      proficiencyBonus: 3,
      featuresJson: JSON.stringify([
        "class.sorcerer.feature.spellcasting",
        "subclass.sorcerer.draconic_bloodline.feature.draconic_resilience",
      ]),
      sessionCharacters: [],
    });

    await service.createCharacter("user-1", {
      name: "Draconic Sorcerer",
      ancestry: "Unknown",
      className: "sorcerer",
      subclassName: "draconic_bloodline",
      level: 5,
      abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
      proficientSkills: [],
      startingEquipmentSelection: [],
    });

    expect(prisma.character.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maxHp: 37,
        }),
      }),
    );
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

  it("requires a missing level-one subclass on the next level up for legacy characters", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d8",
      koName: "클레릭",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 3,
      startingSpellCount: 3,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    prisma.character.findUnique.mockResolvedValue({
      ...baseCharacter,
      className: "cleric",
      spellsJson: JSON.stringify({
        cantrips: ["spell.light"],
        spells: ["spell.cure_wounds"],
        preparedSpells: ["spell.cure_wounds"],
      }),
      sessionCharacters: [],
    });

    await expect(
      service.levelUpCharacter("user-1", "character-1", {
        targetLevel: 2,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "LEVEL_UP_SUBCLASS_REQUIRED",
        levels: [1],
      }),
    });

    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("requires all ASI points when level up crosses an ability score improvement level", async () => {
    const { service, prisma } = createService();
    prisma.character.findUnique.mockResolvedValue({
      ...baseCharacter,
      level: 3,
      subclassName: "champion",
      maxHp: 28,
      sessionCharacters: [],
    });

    await expect(
      service.levelUpCharacter("user-1", "character-1", {
        targetLevel: 4,
        abilityScoreIncreases: { str: 1 },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "LEVEL_UP_ASI_REQUIRED",
        requiredPoints: 2,
        allocatedPoints: 1,
      }),
    });

    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("requires four ASI points when P5 level up crosses both level 14 and 16 ASI hooks", async () => {
    const { service, prisma } = createService();
    prisma.character.findUnique.mockResolvedValue({
      ...baseCharacter,
      level: 12,
      subclassName: "champion",
      maxHp: 100,
      sessionCharacters: [],
    });

    await expect(
      service.levelUpCharacter("user-1", "character-1", {
        targetLevel: 16,
        abilityScoreIncreases: { str: 2 },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "LEVEL_UP_ASI_REQUIRED",
        requiredPoints: 4,
        allocatedPoints: 2,
        levels: [14, 16],
      }),
    });

    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("applies ASI, recalculates derived stats, and carries the max HP gain into active sessions", async () => {
    const { service, prisma, realtimeEvents } = createService();
    const existing = {
      ...baseCharacter,
      level: 3,
      subclassName: "champion",
      maxHp: 28,
      armorClass: 11,
      inventoryJson: JSON.stringify([]),
      sessionCharacters: [
        {
          id: "session-character-1",
          sessionId: "session-1",
          userId: "user-1",
          currentHp: 20,
          session: { id: "session-1", status: PrismaSessionStatus.PLAYING },
        },
      ],
    };
    const updated = {
      ...existing,
      level: 8,
      abilitiesJson: JSON.stringify({ str: 17, dex: 14, con: 16, int: 10, wis: 10, cha: 10 }),
      maxHp: 76,
      armorClass: 12,
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);
    prisma.sessionCharacter.findUniqueOrThrow.mockResolvedValue({
      ...existing.sessionCharacters[0],
      currentHp: 68,
      tempHp: 0,
      status: "ACTIVE",
      character: updated,
      resource: { hitDiceSpent: 0 },
      inventoryEntries: [],
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    });

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 8,
      applyToActiveSessions: true,
      abilityScoreIncreases: { str: 2, dex: 2, con: 2 },
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          abilitiesJson: JSON.stringify({
            str: 17,
            dex: 14,
            con: 16,
            int: 10,
            wis: 10,
            cha: 10,
          }),
          maxHp: 76,
          armorClass: 12,
        }),
      }),
    );
    expect(prisma.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-1" },
      data: { currentHp: 68 },
    });
    expect(realtimeEvents.emitCharacterUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        abilities: expect.objectContaining({ dex: 14, con: 16 }),
        maxHp: 76,
        armorClass: 12,
        currentHp: 68,
      }),
    );
    expect(result.abilities).toMatchObject({ dex: 14, con: 16 });
    expect(result.maxHp).toBe(76);
    expect(result.armorClass).toBe(12);
  });

  it("applies the P6 barbarian Primal Champion capstone to STR, CON, and max HP", async () => {
    const { service, prisma, catalogService, ruleCatalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d12",
      koName: "바바리안",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 0,
      startingSpellCount: 0,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    ruleCatalogService.getCharacterFeatureSnapshot.mockReturnValue({
      featureIds: [
        "class.barbarian.feature.rage",
        "class.barbarian.feature.unarmored_defense",
        "class.barbarian.feature.primal_champion",
      ],
    });
    const existing = {
      ...baseCharacter,
      className: "barbarian",
      subclassName: "berserker",
      level: 19,
      abilitiesJson: JSON.stringify({ str: 20, dex: 12, con: 18, int: 10, wis: 10, cha: 10 }),
      maxHp: 214,
      armorClass: 15,
      featuresJson: JSON.stringify([
        "class.barbarian.feature.rage",
        "class.barbarian.feature.unarmored_defense",
      ]),
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 20,
      abilitiesJson: JSON.stringify({ str: 24, dex: 12, con: 22, int: 10, wis: 10, cha: 10 }),
      maxHp: 265,
      armorClass: 17,
      featuresJson: JSON.stringify([
        "class.barbarian.feature.rage",
        "class.barbarian.feature.unarmored_defense",
        "class.barbarian.feature.primal_champion",
      ]),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };

    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 20,
      hpMode: "average",
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 20,
          abilitiesJson: JSON.stringify({
            str: 24,
            dex: 12,
            con: 22,
            int: 10,
            wis: 10,
            cha: 10,
          }),
          maxHp: 265,
          armorClass: 17,
          featuresJson: JSON.stringify([
            "class.barbarian.feature.rage",
            "class.barbarian.feature.unarmored_defense",
            "class.barbarian.feature.primal_champion",
          ]),
        }),
      }),
    );
    expect(result.abilities).toMatchObject({ str: 24, con: 22 });
    expect(result.maxHp).toBe(265);
    expect(result.features).toContain("class.barbarian.feature.primal_champion");
  });

  it("adds only the newly gained Draconic Resilience HP bonus during level up", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d6",
      koName: "소서러",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 0,
      startingSpellCount: 0,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    const existing = {
      ...baseCharacter,
      className: "sorcerer",
      subclassName: "draconic_bloodline",
      level: 1,
      abilitiesJson: JSON.stringify({ str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 }),
      maxHp: 9,
      featuresJson: JSON.stringify([
        "class.sorcerer.feature.spellcasting",
        "subclass.sorcerer.draconic_bloodline.feature.draconic_resilience",
      ]),
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 2,
      maxHp: 16,
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 2,
      hpMode: "average",
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maxHp: 16,
        }),
      }),
    );
    expect(result.maxHp).toBe(16);
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

  it("allows P6 full casters to learn and prepare 9th-level spells at level 17", async () => {
    const { service, prisma } = createService();
    const existing = {
      ...baseCharacter,
      className: "wizard",
      subclassName: "evocation",
      level: 16,
      maxHp: 92,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt", "spell.light", "spell.ray_of_frost", "spell.mage_hand"],
        spells: ["spell.magic_missile", "spell.shield", "spell.fireball"],
        preparedSpells: ["spell.shield"],
      }),
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 17,
      maxHp: 98,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt", "spell.light", "spell.ray_of_frost", "spell.mage_hand"],
        spells: [
          "spell.magic_missile",
          "spell.shield",
          "spell.fireball",
          "spell.wish",
          "spell.meteor_swarm",
        ],
        preparedSpells: ["spell.wish", "spell.meteor_swarm"],
      }),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };

    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 17,
      hpMode: "average",
      knownSpells: ["spell.wish", "spell.meteor_swarm"],
      preparedSpells: ["spell.wish", "spell.meteor_swarm"],
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: ["spell.fire_bolt", "spell.light", "spell.ray_of_frost", "spell.mage_hand"],
            spells: [
              "spell.magic_missile",
              "spell.shield",
              "spell.fireball",
              "spell.wish",
              "spell.meteor_swarm",
            ],
            preparedSpells: ["spell.wish", "spell.meteor_swarm"],
          }),
        }),
      }),
    );
    expect(result.spells?.spells).toEqual(expect.arrayContaining(["spell.wish", "spell.meteor_swarm"]));
  });

  it("allows P6 half casters to learn 5th-level spells at level 17", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d10",
      koName: "팔라딘",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 0,
      startingSpellCount: 0,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    const existing = {
      ...baseCharacter,
      className: "paladin",
      subclassName: "devotion",
      level: 16,
      maxHp: 132,
      spellsJson: JSON.stringify({
        cantrips: [],
        spells: ["spell.cure_wounds", "spell.lesser_restoration"],
        preparedSpells: ["spell.cure_wounds"],
      }),
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 17,
      maxHp: 140,
      spellsJson: JSON.stringify({
        cantrips: [],
        spells: ["spell.cure_wounds", "spell.lesser_restoration", "spell.flame_strike"],
        preparedSpells: ["spell.flame_strike"],
      }),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };

    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 17,
      hpMode: "average",
      knownSpells: ["spell.flame_strike"],
      preparedSpells: ["spell.flame_strike"],
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: [],
            spells: ["spell.cure_wounds", "spell.lesser_restoration", "spell.flame_strike"],
            preparedSpells: ["spell.flame_strike"],
          }),
        }),
      }),
    );
    expect(result.spells?.spells).toContain("spell.flame_strike");
  });

  it("initializes spell state when a level-up grants ranger spellcasting", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d10",
      koName: "레인저",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 0,
      startingSpellCount: 0,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    const existing = {
      ...baseCharacter,
      className: "ranger",
      subclassName: null,
      level: 1,
      spellsJson: null,
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 3,
      subclassName: "hunter",
      maxHp: 28,
      spellsJson: JSON.stringify({
        cantrips: [],
        spells: ["spell.cure_wounds", "spell.entangle"],
      }),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };

    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 3,
      subclassName: "hunter",
      knownSpells: ["spell.cure_wounds", "spell.entangle"],
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 3,
          subclassName: "hunter",
          spellsJson: JSON.stringify({
            cantrips: [],
            spells: ["spell.cure_wounds", "spell.entangle"],
          }),
        }),
      }),
    );
    expect(result.spells?.spells).toEqual(["spell.cure_wounds", "spell.entangle"]);
  });

  it("does not create an empty prepared-spell list when a known caster learns a spell", async () => {
    const { service, prisma } = createService();
    const existing = {
      ...baseCharacter,
      className: "sorcerer",
      subclassName: "draconic_bloodline",
      level: 4,
      maxHp: 20,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile"],
      }),
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 5,
      maxHp: 26,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile", "spell.fireball"],
      }),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };

    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 5,
      hpMode: "average",
      knownSpells: ["spell.fireball"],
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: ["spell.fire_bolt"],
            spells: ["spell.magic_missile", "spell.fireball"],
          }),
        }),
      }),
    );
    expect(result.spells?.preparedSpells).toBeUndefined();
  });

  it("rejects known caster spell additions beyond the SRD progression increase", async () => {
    const { service, prisma } = createService();
    prisma.character.findUnique.mockResolvedValue({
      ...baseCharacter,
      className: "sorcerer",
      subclassName: "draconic_bloodline",
      level: 4,
      spellsJson: JSON.stringify({
        cantrips: [
          "spell.fire_bolt",
          "spell.light",
          "spell.ray_of_frost",
          "spell.chill_touch",
        ],
        spells: ["spell.magic_missile", "spell.shield", "spell.sleep"],
      }),
      sessionCharacters: [],
    });

    await expect(
      service.levelUpCharacter("user-1", "character-1", {
        targetLevel: 5,
        knownSpells: ["spell.cure_wounds", "spell.fireball"],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "LEVEL_UP_SPELL_LEARN_LIMIT_EXCEEDED",
        learnLimit: 1,
      }),
    });

    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("replaces one known caster spell while preserving the target spell count", async () => {
    const { service, prisma } = createService();
    const existing = {
      ...baseCharacter,
      className: "warlock",
      subclassName: "fiend",
      level: 9,
      maxHp: 60,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt", "spell.light", "spell.ray_of_frost"],
        spells: ["spell.magic_missile"],
      }),
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 10,
      maxHp: 67,
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt", "spell.light", "spell.ray_of_frost"],
        spells: ["spell.shield"],
      }),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 10,
      knownSpells: ["spell.shield"],
      forgottenSpells: ["spell.magic_missile"],
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: JSON.stringify({
            cantrips: ["spell.fire_bolt", "spell.light", "spell.ray_of_frost"],
            spells: ["spell.shield"],
          }),
        }),
      }),
    );
    expect(result.spells?.spells).toEqual(["spell.shield"]);
  });

  it("adds a cantrip only when the target level progression grants one", async () => {
    const { service, prisma, catalogService } = createService();
    catalogService.findClassByKey.mockResolvedValue({
      hitDie: "d8",
      koName: "클레릭",
      startingEquipmentJson: JSON.stringify({ slots: [] }),
      startingCantripCount: 3,
      startingSpellCount: 0,
      skillChoicesJson: JSON.stringify([]),
      skillChoiceCount: 0,
    });
    const existing = {
      ...baseCharacter,
      className: "cleric",
      subclassName: "life",
      level: 3,
      maxHp: 24,
      abilitiesJson: JSON.stringify({ str: 10, dex: 10, con: 14, int: 10, wis: 14, cha: 10 }),
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt", "spell.light", "spell.ray_of_frost"],
        spells: ["spell.cure_wounds"],
        preparedSpells: ["spell.cure_wounds"],
      }),
      sessionCharacters: [],
    };
    const updated = {
      ...existing,
      level: 4,
      maxHp: 32,
      abilitiesJson: JSON.stringify({ str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 }),
      spellsJson: JSON.stringify({
        cantrips: [
          "spell.fire_bolt",
          "spell.light",
          "spell.ray_of_frost",
          "spell.chill_touch",
        ],
        spells: ["spell.cure_wounds"],
        preparedSpells: ["spell.cure_wounds"],
      }),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    prisma.character.findUnique.mockResolvedValue(existing);
    prisma.character.update.mockResolvedValue(updated);

    const result = await service.levelUpCharacter("user-1", "character-1", {
      targetLevel: 4,
      abilityScoreIncreases: { wis: 2 },
      cantrips: ["spell.chill_touch"],
    });

    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          spellsJson: updated.spellsJson,
        }),
      }),
    );
    expect(result.spells?.cantrips).toContain("spell.chill_touch");
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
    prisma.sessionCharacter.findUniqueOrThrow.mockResolvedValue({
      ...existing.sessionCharacters[0],
      currentHp: 8,
      tempHp: 0,
      status: "ACTIVE",
      character: updated,
      resource: { hitDiceSpent: 0 },
      inventoryEntries: [],
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    });

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
    expect(realtimeEvents.emitCharacterUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        id: "session-character-1",
        spells: expect.objectContaining({
          preparedSpells: ["spell.magic_missile"],
        }),
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

  it("rejects prepared spell updates that exceed the prepared caster limit", async () => {
    const { service, prisma } = createService();
    prisma.character.findUnique.mockResolvedValue({
      ...baseCharacter,
      className: "wizard",
      level: 1,
      abilitiesJson: JSON.stringify({ str: 8, dex: 12, con: 14, int: 12, wis: 10, cha: 10 }),
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile", "spell.shield", "spell.sleep"],
        preparedSpells: ["spell.magic_missile"],
      }),
      sessionCharacters: [],
    });

    await expect(
      service.updatePreparedSpells("user-1", "character-1", {
        preparedSpells: ["spell.magic_missile", "spell.shield", "spell.sleep"],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "PREPARED_SPELL_LIMIT_EXCEEDED",
      }),
    });

    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it("rejects prepared spell updates for known-spell casters", async () => {
    const { service, prisma } = createService();
    prisma.character.findUnique.mockResolvedValue({
      ...baseCharacter,
      className: "warlock",
      spellsJson: JSON.stringify({
        cantrips: ["spell.fire_bolt"],
        spells: ["spell.magic_missile", "spell.shield"],
      }),
      sessionCharacters: [],
    });

    await expect(
      service.updatePreparedSpells("user-1", "character-1", {
        preparedSpells: ["spell.magic_missile"],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "PREPARED_SPELLS_NOT_SUPPORTED",
      }),
    });

    expect(prisma.character.update).not.toHaveBeenCalled();
  });
});
