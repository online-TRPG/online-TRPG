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

    service.emitActionAccepted("session-1", {
      playerActionId: "action-1",
      actorUserId: "user-1",
      rawText: "I open the door.",
      clientCreatedAt: "2026-05-08T08:00:00.000Z",
    });

    expect(to).toHaveBeenCalledWith("session:session-1");
    expect(emit).toHaveBeenCalledWith("action.accepted", {
      sessionId: "session-1",
      playerActionId: "action-1",
      actorUserId: "user-1",
      rawText: "I open the door.",
      clientCreatedAt: "2026-05-08T08:00:00.000Z",
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

  it("emits system.message with the failed action id when provided", () => {
    const { service, emit } = createBoundService();

    service.emitSystemMessage("session-1", "ACTION_FAILED", "행동 처리 실패: 대상을 찾을 수 없습니다.", {
      playerActionId: "action-1",
    });

    expect(emit).toHaveBeenCalledWith("system.message", {
      sessionId: "session-1",
      code: "ACTION_FAILED",
      message: "행동 처리 실패: 대상을 찾을 수 없습니다.",
      playerActionId: "action-1",
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

  it("emits chat.message with the volatile chat message", () => {
    const { service, emit, to } = createBoundService();
    const message = {
      id: "message-1",
      sessionId: "session-1",
      senderUserId: "user-1",
      senderDisplayName: "테스터",
      content: "안녕하세요",
      createdAt: "2026-05-07T05:00:00.000Z",
    };

    service.emitChatMessage("session-1", message);

    expect(to).toHaveBeenCalledWith("session:session-1");
    expect(emit).toHaveBeenCalledWith("chat.message", {
      sessionId: "session-1",
      message,
    });
  });

  it("sends map deltas to v2 rooms while preserving legacy full-map events", () => {
    const calls: Array<{
      rooms: string[];
      excluded: string[];
      event: string;
      payload: unknown;
    }> = [];
    const createOperator = (rooms: string[], excluded: string[] = []): any => ({
      except: jest.fn((room: string) => createOperator(rooms, [...excluded, room])),
      emit: jest.fn((event: string, payload: unknown) => {
        calls.push({ rooms, excluded, event, payload });
      }),
    });
    const server = {
      to: jest.fn((room: string) => createOperator([room])),
    };
    const service = new RealtimeEventsService();
    service.bindServer(server as never);
    const previousMap = {
      id: "map-1",
      gridType: "square",
      gridSize: 40,
      width: 800,
      height: 600,
      tokens: [{ id: "token-1", name: "Hero", x: 0, y: 0, size: 40 }],
      fogRects: [],
      updatedAt: "2026-07-10T00:00:00.000Z",
    };
    const nextMap = {
      ...previousMap,
      tokens: [{ ...previousMap.tokens[0], x: 40 }],
      updatedAt: "2026-07-10T00:00:01.000Z",
    };

    service.emitVttMapUpdated("session-1", {
      hostUserId: "host-1",
      previousHostMap: previousMap as never,
      previousPlayerMap: previousMap as never,
      hostMap: nextMap as never,
      playerMap: nextMap as never,
    });

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rooms: ["session:session-1"],
          excluded: [
            "session:session-1:user:host-1",
            "session:session-1:vtt-delta-v2",
          ],
          event: "vtt.map.updated",
        }),
        expect.objectContaining({
          rooms: ["session:session-1:vtt-delta-v2"],
          excluded: ["session:session-1:user:host-1"],
          event: "vtt.map.delta.v2",
        }),
        expect.objectContaining({
          rooms: ["session:session-1:user:host-1:vtt-delta-v2"],
          event: "vtt.map.delta.v2",
        }),
      ]),
    );
  });
});
