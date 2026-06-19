import {
  CharacterAvatarType as PrismaCharacterAvatarType,
  GamePhase as PrismaGamePhase,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import { mapGameState, mapSessionCharacter } from "./domain.mapper";

describe("mapSessionCharacter", () => {
  const now = new Date("2026-06-14T00:00:00.000Z");

  const createSessionCharacter = (overrides: Record<string, unknown> = {}) => ({
    id: "session-character-1",
    sessionId: "session-1",
    userId: "user-1",
    characterId: "character-1",
    status: PrismaSessionCharacterStatus.ACTIVE,
    currentHp: 9,
    tempHp: 0,
    conditionsJson: "[]",
    createdAt: now,
    updatedAt: now,
    character: {
      id: "character-1",
      ownerUserId: "user-1",
      name: "Mira",
      ancestry: "human",
      className: "fighter",
      subclassName: null,
      level: 4,
      bio: null,
      abilitiesJson: JSON.stringify({ str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }),
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
      avatarType: PrismaCharacterAvatarType.PRESET,
      avatarPresetId: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    inventoryEntries: [],
    ...overrides,
  });

  it("maps hit dice totals from character level and spent resource state", () => {
    expect(
      mapSessionCharacter(
        createSessionCharacter({
          resource: {
            sessionCharacterId: "session-character-1",
            hitDiceSpent: 2,
          },
        }) as never,
      ),
    ).toMatchObject({
      hitDiceTotal: 4,
      hitDiceSpent: 2,
      hitDiceRemaining: 2,
    });
  });
});

describe("mapGameState", () => {
  it("strips GM private notes from public state projection", () => {
    const updatedAt = new Date("2026-06-14T00:00:00.000Z");
    const mapped = mapGameState(
      {
        sessionScenarioId: "session-scenario-1",
        version: 3,
        currentNodeId: "node-1",
        phase: PrismaGamePhase.EXPLORATION,
        flagsJson: JSON.stringify({
          gmPrivateNotes: [{ note: "hidden" }],
          humanGmAiAssistSuggestions: [{ content: "hidden suggestion" }],
          gmMessages: [{ id: "message-1", content: "public" }],
        }),
        updatedAt,
      } as never,
      "session-1",
    );

    expect(mapped.flags).toEqual({
      gmMessages: [{ id: "message-1", content: "public" }],
    });
    expect(mapped.state).not.toHaveProperty("gmPrivateNotes");
    expect(mapped.state).not.toHaveProperty("humanGmAiAssistSuggestions");
  });
});
