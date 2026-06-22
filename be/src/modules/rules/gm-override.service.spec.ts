import { GmOverrideService } from "./gm-override.service";

describe("GmOverrideService", () => {
  const service = new GmOverrideService();

  it("normalizes a public GM scene message into a turn log payload", () => {
    const resolution = service.resolveOverride({
      kind: "scene_text",
      sessionId: "session-1",
      sessionScenarioId: "scenario-1",
      gmUserId: "gm-1",
      publicNarration: "The door opens.",
      privateNote: "The guard heard this.",
    });

    expect(resolution).toMatchObject({
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
          metadata: {},
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

    expect(resolution.accepted && resolution.turnLog.structuredAction.metadata).not.toHaveProperty(
      "privateNote",
    );
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

  it("requires target and state patch for DC overrides", () => {
    expect(
      service.resolveOverride({
        kind: "set_dc",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        publicNarration: "The trap DC is set.",
        statePatch: { difficultyClassOverride: { dc: 16 } },
      }),
    ).toEqual({ accepted: false, rejectedReason: "missing_target" });

    expect(
      service.resolveOverride({
        kind: "set_dc",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        targetId: "trap:needle",
        publicNarration: "The trap DC is set.",
      }),
    ).toEqual({ accepted: false, rejectedReason: "missing_state_patch" });

    expect(
      service.resolveOverride({
        kind: "set_dc",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        targetId: "trap:needle",
        publicNarration: "The trap DC is set.",
        statePatch: { difficultyClassOverride: { targetId: "trap:needle", dc: 16 } },
      }),
    ).toMatchObject({
      accepted: true,
      turnLog: {
        rawInput: "gm:set_dc",
        structuredAction: {
          kind: "set_dc",
          targetId: "trap:needle",
        },
      },
      stateDiff: {
        reason: "gm_override:set_dc",
        diff: { difficultyClassOverride: { targetId: "trap:needle", dc: 16 } },
      },
    });
  });

  it("requires state patch but no target for combat start overrides", () => {
    expect(
      service.resolveOverride({
        kind: "combat_start",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        publicNarration: "Combat begins.",
      }),
    ).toEqual({ accepted: false, rejectedReason: "missing_state_patch" });

    expect(
      service.resolveOverride({
        kind: "combat_start",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        publicNarration: "Combat begins.",
        statePatch: { phase: "COMBAT" },
      }),
    ).toMatchObject({
      accepted: true,
      turnLog: {
        rawInput: "gm:combat_start",
        structuredAction: {
          kind: "combat_start",
          targetId: null,
        },
      },
      stateDiff: {
        reason: "gm_override:combat_start",
        diff: { phase: "COMBAT" },
      },
    });
  });

  it("requires target and state patch for reveal handouts", () => {
    expect(
      service.resolveOverride({
        kind: "reveal_handout",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        publicNarration: "A handout is revealed.",
        statePatch: { contentId: "clue-1" },
      }),
    ).toEqual({ accepted: false, rejectedReason: "missing_target" });

    expect(
      service.resolveOverride({
        kind: "reveal_handout",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        publicNarration: "A handout is revealed.",
        targetId: "clue-1",
        statePatch: { contentId: "clue-1", scope: "party" },
      }),
    ).toMatchObject({
      accepted: true,
      turnLog: {
        rawInput: "gm:reveal_handout",
        structuredAction: {
          kind: "reveal_handout",
          targetId: "clue-1",
        },
      },
      stateDiff: {
        reason: "gm_override:reveal_handout",
        diff: {
          contentId: "clue-1",
          scope: "party",
        },
      },
    });
  });

  it("records accepted AI assist as GM-approved metadata without forcing a state patch", () => {
    expect(
      service.resolveOverride({
        kind: "ai_assist_accept",
        sessionId: "session-1",
        sessionScenarioId: "scenario-1",
        gmUserId: "gm-1",
        publicNarration: "The suggested line is used.",
        metadata: {
          assistType: "npc_dialogue",
          suggestionId: "suggestion-1",
        },
      }),
    ).toMatchObject({
      accepted: true,
      turnLog: {
        rawInput: "gm:ai_assist_accept",
        structuredAction: {
          kind: "ai_assist_accept",
          targetId: null,
          metadata: {
            assistType: "npc_dialogue",
            suggestionId: "suggestion-1",
          },
        },
      },
      stateDiff: null,
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
