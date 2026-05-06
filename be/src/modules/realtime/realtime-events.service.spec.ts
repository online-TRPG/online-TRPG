import { RealtimeEventsService } from "./realtime-events.service";

describe("RealtimeEventsService", () => {
  const createBoundService = () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const service = new RealtimeEventsService();

    service.bindServer({ to } as never);

    return { service, emit, to };
  };

  it("emits action.accepted to the session room", () => {
    const { service, emit, to } = createBoundService();

    service.emitActionAccepted("session-1", "action-1");

    expect(to).toHaveBeenCalledWith("session:session-1");
    expect(emit).toHaveBeenCalledWith("action.accepted", {
      sessionId: "session-1",
      playerActionId: "action-1",
    });
  });

  it("emits turn.log.created with the created turn log", () => {
    const { service, emit } = createBoundService();
    const turnLog = {
      turnLogId: "turn-log-1",
      turnNumber: 1,
      rawInput: "/roll 1d20",
      structuredAction: null,
      diceResult: null,
      stateDiff: null,
      outcome: "NO_ROLL",
      narration: "주사위 결과입니다.",
      createdAt: "2026-05-06T00:00:00.000Z",
    };

    service.emitTurnLogCreated("session-1", turnLog as never);

    expect(emit).toHaveBeenCalledWith("turn.log.created", {
      sessionId: "session-1",
      turnLog,
    });
  });

  it("emits dice.rolled with the dice result", () => {
    const { service, emit } = createBoundService();
    const diceResult = {
      expression: "1d20+3",
      rolls: [14],
      modifier: 3,
      total: 17,
      advantageState: "NORMAL",
    };

    service.emitDiceRolled("session-1", diceResult as never);

    expect(emit).toHaveBeenCalledWith("dice.rolled", {
      sessionId: "session-1",
      diceResult,
    });
  });

  it("emits state.diff.applied with the applied diff", () => {
    const { service, emit } = createBoundService();
    const stateDiff = {
      baseVersion: 1,
      nextVersion: 2,
      reason: "damage",
      diff: { characters: [{ id: "character-1", currentHp: 7 }] },
    };

    service.emitStateDiffApplied("session-1", stateDiff);

    expect(emit).toHaveBeenCalledWith("state.diff.applied", {
      sessionId: "session-1",
      stateDiff,
    });
  });

  it("emits combat.updated and turn.changed for combat runtime updates", () => {
    const { service, emit } = createBoundService();
    const combat = {
      combatId: "combat-1",
      sessionId: "session-1",
      status: "ACTIVE",
      roundNo: 1,
      turnNo: 1,
      currentEntityId: "entity-1",
      participants: [],
    };
    const turn = {
      combatId: "combat-1",
      endedEntityId: "entity-0",
      nextEntityId: "entity-1",
      roundNo: 1,
      turnNo: 2,
    };

    service.emitCombatUpdated("session-1", combat as never);
    service.emitTurnChanged("session-1", turn);

    expect(emit).toHaveBeenCalledWith("combat.updated", {
      sessionId: "session-1",
      combat,
    });
    expect(emit).toHaveBeenCalledWith("turn.changed", {
      sessionId: "session-1",
      turn,
    });
  });
});
