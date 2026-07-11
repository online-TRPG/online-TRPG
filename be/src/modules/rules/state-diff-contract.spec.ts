import { parseCharacterStateDiff } from "@trpg/shared-types";

describe("state diff realtime contract", () => {
  it("parses the character and combat participant patch used by realtime consumers", () => {
    expect(
      parseCharacterStateDiff({
        diff: {
          characters: [
            {
              sessionCharacterId: "session-character-1",
              combatParticipantId: "combat-participant-1",
              currentHp: 7,
              tempHp: 2,
              conditions: ["condition.poisoned"],
              markDead: false,
            },
          ],
        },
      }),
    ).toEqual([
      {
        sessionCharacterId: "session-character-1",
        combatParticipantId: "combat-participant-1",
        currentHp: 7,
        tempHp: 2,
        conditions: ["condition.poisoned"],
        markDead: false,
      },
    ]);
  });

  it("rejects unknown or malformed diff shapes so the client can resync", () => {
    expect(parseCharacterStateDiff({ diff: { economy: { gold: 10 } } })).toBeNull();
    expect(
      parseCharacterStateDiff({
        diff: {
          characters: [{ sessionCharacterId: "session-character-1", currentHp: "7" }],
        },
      }),
    ).toBeNull();
  });

  it("normalizes the existing Human GM session/combat patch contract", () => {
    expect(
      parseCharacterStateDiff({
        diff: {
          sessionCharacters: [
            {
              sessionCharacterId: "session-character-1",
              previousHp: 10,
              currentHp: 4,
            },
          ],
          combatParticipants: [
            {
              combatParticipantId: "combat-participant-1",
              currentHp: 4,
              conditions: ["condition.stunned"],
              isAlive: true,
            },
          ],
        },
      }),
    ).toEqual([
      {
        sessionCharacterId: "session-character-1",
        combatParticipantId: null,
        currentHp: 4,
      },
      {
        sessionCharacterId: null,
        combatParticipantId: "combat-participant-1",
        currentHp: 4,
        conditions: ["condition.stunned"],
        markDead: false,
      },
    ]);
  });

  it("rejects malformed Human GM patch identifiers and life-state conflicts", () => {
    expect(
      parseCharacterStateDiff({
        diff: { sessionCharacters: [{ combatParticipantId: "combat-participant-1" }] },
      }),
    ).toBeNull();
    expect(
      parseCharacterStateDiff({
        diff: {
          combatParticipants: [
            { combatParticipantId: "combat-participant-1", markDead: true, isAlive: true },
          ],
        },
      }),
    ).toBeNull();
  });
});
