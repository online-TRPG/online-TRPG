import {
  CharacterAvatarType as PrismaCharacterAvatarType,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import { SessionCharacterTransferClonePayloadService } from "./session-character-transfer-clone-payload.service";

describe("SessionCharacterTransferClonePayloadService", () => {
  const service = new SessionCharacterTransferClonePayloadService();
  const avatarUpdatedAt = new Date("2026-07-02T00:00:00.000Z");
  const sourceCharacter = {
    name: "Mira",
    ancestry: "human",
    className: "fighter",
    subclassName: "champion",
    level: 5,
    bio: "Storm vault veteran",
    abilitiesJson: "{\"str\":16}",
    proficiencyBonus: 3,
    featuresJson: "[\"second_wind\"]",
    proficientSkillsJson: "[\"athletics\"]",
    maxHp: 44,
    armorClass: 18,
    speed: 30,
    spellsJson: "[]",
    equippedWeaponId: "longsword",
    offhandWeaponId: "shield",
    avatarType: PrismaCharacterAvatarType.PRESET,
    avatarPresetId: "fighter-1",
    avatarUrl: "https://example.test/avatar.png",
    avatarUpdatedAt,
  };

  it("builds a cloned character create payload from the source character", () => {
    expect(
      service.buildCharacterCreateData({
        requestedByUserId: "player-1",
        targetScenarioId: "scenario-target",
        sourceCharacter,
        transferableInventoryJson: "[{\"itemId\":\"potion\"}]",
        createId: () => "fixed-id",
      }),
    ).toEqual({
      id: "character-transfer-fixed-id",
      ownerUserId: "player-1",
      scenarioId: "scenario-target",
      name: "Mira",
      ancestry: "human",
      className: "fighter",
      subclassName: "champion",
      level: 5,
      bio: "Storm vault veteran",
      abilitiesJson: "{\"str\":16}",
      proficiencyBonus: 3,
      featuresJson: "[\"second_wind\"]",
      proficientSkillsJson: "[\"athletics\"]",
      maxHp: 44,
      armorClass: 18,
      speed: 30,
      inventoryJson: "[{\"itemId\":\"potion\"}]",
      spellsJson: "[]",
      equippedWeaponId: "longsword",
      offhandWeaponId: "shield",
      avatarType: PrismaCharacterAvatarType.PRESET,
      avatarPresetId: "fighter-1",
      avatarUrl: "https://example.test/avatar.png",
      avatarUpdatedAt,
    });
  });

  it("builds an active target session character payload for the cloned character", () => {
    expect(
      service.buildSessionCharacterCreateData({
        targetSessionId: "target-session",
        requestedByUserId: "player-1",
        clonedCharacter: {
          id: "character-transfer-fixed-id",
          maxHp: 44,
          inventoryJson: "[{\"itemId\":\"potion\"}]",
        },
      }),
    ).toEqual({
      sessionId: "target-session",
      userId: "player-1",
      characterId: "character-transfer-fixed-id",
      status: PrismaSessionCharacterStatus.ACTIVE,
      currentHp: 44,
      tempHp: 0,
      conditionsJson: "[]",
      inventorySnapshotJson: "[{\"itemId\":\"potion\"}]",
    });
  });
});
