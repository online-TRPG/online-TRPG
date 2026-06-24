import { ActionOutcome as PrismaActionOutcome } from "@prisma/client";
import {
  CAMPAIGN_CALENDAR_FLAGS_KEY,
  CampaignCalendarRuntimeService,
} from "./campaign-calendar-runtime.service";

describe("CampaignCalendarRuntimeService P5 campaign calendar and downtime", () => {
  const fixedNow = new Date("2026-06-24T03:00:00.000Z");

  const createPrisma = () => {
    const tx = {
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          version: 21,
          flagsJson: JSON.stringify({
            scene: "between-sessions",
            economy: {
              partyStash: [],
              walletsBySessionCharacterId: { "sc-1": { gp: 300 } },
              shopStatesById: {},
              craftingProgressById: {},
            },
          }),
        }),
        update: jest.fn(),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 30 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-calendar-1",
          turnNumber: 31,
          playerActionId: null,
          actorUserId: "gm-1",
          sessionCharacterId: null,
          rawInput: "/campaign propose_schedule",
          structuredActionJson: JSON.stringify({
            type: "campaign_calendar",
            campaignAction: "propose_schedule",
          }),
          diceResultJson: null,
          stateDiffJson: JSON.stringify({
            baseVersion: 21,
            nextVersion: 22,
            reason: "campaign_calendar:propose_schedule",
            diff: { campaignCalendar: { auditEvent: { type: "propose_schedule" } } },
          }),
          outcome: PrismaActionOutcome.SUCCESS,
          narration: "캠페인 일정 처리 완료",
          createdAt: fixedNow,
        }),
      },
      stateDiff: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    return { prisma, tx };
  };

  it("proposes, responds to, and confirms a real-world schedule separately from game time", () => {
    const service = new CampaignCalendarRuntimeService({} as never);
    const proposed = service.resolveAction({
      state: service.createInitialState(),
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "propose_schedule",
        scheduleId: "schedule-1",
        title: "16레벨 원정 1회차",
        startsAt: "2026-07-01T11:00:00+09:00",
        durationMinutes: 180,
        timeZone: "Asia/Seoul",
        inGameDate: "1492-07-01",
        idempotencyKey: "calendar-1",
      },
    });
    expect(proposed.state.scheduleProposals).toEqual([
      expect.objectContaining({
        id: "schedule-1",
        startsAt: "2026-07-01T02:00:00.000Z",
        durationMinutes: 180,
        timeZone: "Asia/Seoul",
        status: "proposed",
      }),
    ]);
    expect(proposed.state.timeline).toEqual([
      expect.objectContaining({
        type: "schedule_proposed",
        inGameDate: "1492-07-01",
        elapsedDays: 0,
      }),
    ]);

    const responded = service.resolveAction({
      state: proposed.state,
      actorUserId: "player-1",
      now: fixedNow,
      dto: {
        actionType: "respond_schedule",
        scheduleId: "schedule-1",
        availability: "available",
        responseId: "response-1",
      },
    });
    expect(responded.state.scheduleProposals[0].responses).toEqual([
      expect.objectContaining({
        id: "response-1",
        userId: "player-1",
        availability: "available",
      }),
    ]);

    const confirmed = service.resolveAction({
      state: responded.state,
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "confirm_schedule",
        scheduleId: "schedule-1",
      },
    });
    expect(confirmed.state.scheduleProposals[0]).toMatchObject({
      status: "confirmed",
      confirmedByUserId: "gm-1",
    });
  });

  it("advances in-game time and runs downtime lifecycle with tool requirements", () => {
    const service = new CampaignCalendarRuntimeService({} as never);
    const advanced = service.resolveAction({
      state: service.createInitialState(),
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "advance_game_time",
        inGameDate: "1492-07-10",
        elapsedDays: 7,
      },
    });
    expect(advanced.state).toMatchObject({
      inGameDate: "1492-07-10",
      elapsedDays: 7,
    });

    const started = service.resolveAction({
      state: advanced.state,
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "start_downtime",
        downtimeTaskId: "dt-1",
        sessionCharacterId: "sc-1",
        downtimeType: "crafting",
        title: "태양검 수리",
        costGp: 250,
        workDaysRequired: 5,
        requiredTools: ["smith_tools"],
        availableTools: ["smith_tools"],
      },
    });
    expect(started.state.downtimeTasks).toEqual([
      expect.objectContaining({
        id: "dt-1",
        type: "crafting",
        status: "active",
        costGp: 250,
        workDaysRequired: 5,
      }),
    ]);

    const paused = service.resolveAction({
      state: started.state,
      actorUserId: "gm-1",
      now: fixedNow,
      dto: { actionType: "pause_downtime", downtimeTaskId: "dt-1" },
    });
    expect(paused.state.downtimeTasks[0].status).toBe("paused");

    const resumed = service.resolveAction({
      state: paused.state,
      actorUserId: "gm-1",
      now: fixedNow,
      dto: { actionType: "resume_downtime", downtimeTaskId: "dt-1" },
    });
    expect(resumed.state.downtimeTasks[0].status).toBe("active");

    const completed = service.resolveAction({
      state: resumed.state,
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "complete_downtime",
        downtimeTaskId: "dt-1",
        workDaysDelta: 5,
      },
    });
    expect(completed.state.downtimeTasks[0]).toMatchObject({
      status: "completed",
      workDaysCompleted: 5,
      completedAt: fixedNow.toISOString(),
    });
  });

  it("rejects duplicate idempotency keys, duplicate responses, missing tools, and duplicate completion", () => {
    const service = new CampaignCalendarRuntimeService({} as never);
    const proposed = service.resolveAction({
      state: service.createInitialState(),
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "propose_schedule",
        scheduleId: "schedule-1",
        startsAt: "2026-07-01T00:00:00.000Z",
        durationMinutes: 120,
        idempotencyKey: "same-key",
      },
    });

    expect(() =>
      service.resolveAction({
        state: proposed.state,
        actorUserId: "gm-1",
        now: fixedNow,
        dto: {
          actionType: "propose_schedule",
          scheduleId: "schedule-2",
          startsAt: "2026-07-02T00:00:00.000Z",
          durationMinutes: 120,
          idempotencyKey: "same-key",
        },
      }),
    ).toThrow("Duplicate campaign calendar action");

    const responded = service.resolveAction({
      state: proposed.state,
      actorUserId: "player-1",
      now: fixedNow,
      dto: {
        actionType: "respond_schedule",
        scheduleId: "schedule-1",
        availability: "tentative",
      },
    });
    expect(() =>
      service.resolveAction({
        state: responded.state,
        actorUserId: "player-1",
        now: fixedNow,
        dto: {
          actionType: "respond_schedule",
          scheduleId: "schedule-1",
          availability: "available",
        },
      }),
    ).toThrow("Duplicate schedule response");

    expect(() =>
      service.resolveAction({
        state: service.createInitialState(),
        actorUserId: "gm-1",
        now: fixedNow,
        dto: {
          actionType: "start_downtime",
          downtimeTaskId: "dt-1",
          sessionCharacterId: "sc-1",
          requiredTools: ["alchemy_supplies"],
          availableTools: ["smith_tools"],
        },
      }),
    ).toThrow("Required downtime tool missing");
  });

  it("stores campaign calendar state in GameState flags and writes auditable turn/state diffs", async () => {
    const { prisma, tx } = createPrisma();
    const service = new CampaignCalendarRuntimeService(prisma as never);
    const resolution = service.resolveAction({
      state: service.createInitialState(),
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "propose_schedule",
        scheduleId: "schedule-1",
        startsAt: "2026-07-01T00:00:00.000Z",
        durationMinutes: 120,
      },
    });

    const result = await service.applyResolution({
      sessionId: "session-1",
      sessionScenarioId: "ss-1",
      resolution,
    });

    expect(JSON.parse(tx.gameState.update.mock.calls[0][0].data.flagsJson)).toMatchObject({
      scene: "between-sessions",
      [CAMPAIGN_CALENDAR_FLAGS_KEY]: {
        scheduleProposals: [
          expect.objectContaining({
            id: "schedule-1",
            status: "proposed",
          }),
        ],
      },
    });
    expect(tx.turnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "session-1",
          sessionScenarioId: "ss-1",
          actorUserId: "gm-1",
          turnNumber: 31,
          outcome: PrismaActionOutcome.SUCCESS,
        }),
      }),
    );
    expect(tx.stateDiff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionScenarioId: "ss-1",
        turnLogId: "turn-calendar-1",
        baseVersion: 21,
        nextVersion: 22,
        reason: "campaign_calendar:propose_schedule",
      }),
    });
    expect(result).toMatchObject({
      campaignCalendar: {
        scheduleProposals: [
          expect.objectContaining({
            id: "schedule-1",
          }),
        ],
      },
      stateDiff: {
        baseVersion: 21,
        nextVersion: 22,
      },
      turnLog: {
        turnLogId: "turn-calendar-1",
        outcome: "SUCCESS",
      },
    });
  });

  it("records completed downtime effects in the server-authoritative economy ledger", async () => {
    const { prisma, tx } = createPrisma();
    const service = new CampaignCalendarRuntimeService(prisma as never);
    const started = service.resolveAction({
      state: service.createInitialState(),
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "start_downtime",
        downtimeTaskId: "dt-craft",
        sessionCharacterId: "sc-1",
        downtimeType: "crafting",
        title: "성좌 나침반 제작",
        costGp: 125,
        workDaysRequired: 5,
      },
    });
    const resolution = service.resolveAction({
      state: started.state,
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "complete_downtime",
        downtimeTaskId: "dt-craft",
        workDaysDelta: 5,
      },
    });

    await service.applyResolution({
      sessionId: "session-1",
      sessionScenarioId: "ss-1",
      resolution,
    });

    const flags = JSON.parse(tx.gameState.update.mock.calls[0][0].data.flagsJson);
    expect(flags.economy.walletsBySessionCharacterId["sc-1"]).toMatchObject({ gp: 175 });
    expect(flags.economy.downtimeCompletionsById["dt-craft"]).toMatchObject({
      downtimeTaskId: "dt-craft",
      downtimeType: "crafting",
      sessionCharacterId: "sc-1",
      costGp: 125,
      inventoryEffects: [
        expect.objectContaining({ type: "crafted_output_pending_gm_claim" }),
      ],
    });
    expect(JSON.parse(tx.stateDiff.create.mock.calls[0][0].data.diffJson)).toMatchObject({
      economy: {
        auditEvent: {
          type: "downtime_completed",
          downtimeTaskId: "dt-craft",
          sessionCharacterId: "sc-1",
        },
      },
    });
  });

  it("rejects completed downtime when the authoritative economy wallet cannot pay the cost", async () => {
    const { prisma } = createPrisma();
    const service = new CampaignCalendarRuntimeService(prisma as never);
    const started = service.resolveAction({
      state: service.createInitialState(),
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "start_downtime",
        downtimeTaskId: "dt-expensive",
        sessionCharacterId: "sc-1",
        downtimeType: "research",
        title: "성좌 진명 연구",
        costGp: 500,
        workDaysRequired: 1,
      },
    });
    const resolution = service.resolveAction({
      state: started.state,
      actorUserId: "gm-1",
      now: fixedNow,
      dto: {
        actionType: "complete_downtime",
        downtimeTaskId: "dt-expensive",
        workDaysDelta: 1,
      },
    });

    await expect(
      service.applyResolution({
        sessionId: "session-1",
        sessionScenarioId: "ss-1",
        resolution,
      }),
    ).rejects.toThrow("Insufficient downtime funds.");
  });
});
