import { GmOverrideService } from "./gm-override.service";

describe("GmOverrideService", () => {
  const service = new GmOverrideService();

  it("normalizes a public GM scene message into a turn log payload", () => {
    expect(
      service.resolveOverride({
        kind: "scene_text",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        publicNarration: "The door opens.",
        privateNote: "The guard heard this.",
      }),
    ).toMatchObject({
      accepted: true,
      turnLog: {
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        actorUserId: "gm-1",
        rawInput: "gm:scene_text",
        structuredAction: {
          type: "gm_override",
          kind: "scene_text",
          targetId: null,
          public: true,
          hasPrivateNote: true,
          metadata: {
            privateNote: "The guard heard this.",
          },
        },
        outcome: "SUCCESS",
        narration: "The door opens.",
      },
      stateDiff: null,
      audit: {
        actorUserId: "gm-1",
        kind: "scene_text",
        targetId: null,
        publicNarration: "The door opens.",
        privateNote: "The guard heard this.",
      },
    });
  });

  it("requires target and state patch for state-changing overrides", () => {
    expect(
      service.resolveOverride({
        kind: "adjust_hp",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        publicNarration: "Damage adjusted.",
      }),
    ).toEqual({ accepted: false, rejectedReason: "missing_target" });

    expect(
      service.resolveOverride({
        kind: "adjust_hp",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        targetId: "participant-1",
        publicNarration: "Damage adjusted.",
      }),
    ).toEqual({ accepted: false, rejectedReason: "missing_state_patch" });
  });

  it("emits state diff reason and audit data for HP overrides", () => {
    expect(
      service.resolveOverride({
        kind: "adjust_hp",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        targetId: "participant-1",
        publicNarration: "The ogre is bloodied.",
        statePatch: {
          combatParticipantId: "participant-1",
          currentHp: 14,
        },
        metadata: {
          previousHp: 30,
          nextHp: 14,
        },
      }),
    ).toMatchObject({
      accepted: true,
      turnLog: {
        rawInput: "gm:adjust_hp",
        structuredAction: {
          kind: "adjust_hp",
          targetId: "participant-1",
          metadata: {
            previousHp: 30,
            nextHp: 14,
          },
        },
        narration: "The ogre is bloodied.",
      },
      stateDiff: {
        reason: "gm_override:adjust_hp",
        diff: {
          combatParticipantId: "participant-1",
          currentHp: 14,
        },
      },
    });
  });

  it("rejects empty public narration", () => {
    expect(
      service.resolveOverride({
        kind: "npc_dialogue",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        publicNarration: "   ",
      }),
    ).toEqual({ accepted: false, rejectedReason: "missing_public_narration" });
  });
});
