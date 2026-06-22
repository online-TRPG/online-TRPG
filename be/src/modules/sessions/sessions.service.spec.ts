import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  ApplyHumanGmCombatConditionDto,
  HumanGmMessageDto,
  RevealSessionContentDto,
  ScenarioNodeType,
} from "@trpg/shared-types";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { SessionsService } from "./sessions.service";
import { getRestApprovalExpiresAt } from "../actions/rest-approval-policy";

describe("SessionsService P3 revision snapshot metadata", () => {
  it("records the selected scenario revision metadata into session state flags", () => {
    const service = new SessionsService({} as never, {} as never, {} as never, {} as never);
    const flag = (service as never as {
      buildP3ScenarioRevisionSnapshotFlag: (scenario: {
        id: string;
        sourceType: string;
        baseScenarioId: string | null;
        attribution: string | null;
        updatedAt: Date;
      }) => Record<string, unknown>;
    }).buildP3ScenarioRevisionSnapshotFlag({
      id: "scenario_draft_rev_1",
      sourceType: "CLONED",
      baseScenarioId: "scenario_draft",
      attribution:
        'Original\nP3_REVISION_META:{"revisionNumber":1,"changelog":"Initial","publishedAt":"2026-06-22T00:00:00.000Z","publishedByUserId":"creator-1","status":"public"}',
      updatedAt: new Date("2026-06-22T01:00:00.000Z"),
    });

    expect(flag).toEqual(
      expect.objectContaining({
        scenarioId: "scenario_draft_rev_1",
        baseScenarioId: "scenario_draft",
        sourceType: "CLONED",
        revisionNumber: 1,
        publishStatus: "public",
        publishedAt: "2026-06-22T00:00:00.000Z",
        publishedByUserId: "creator-1",
        scenarioUpdatedAt: "2026-06-22T01:00:00.000Z",
      }),
    );
    expect(flag.snapshotCreatedAt).toEqual(expect.any(String));
  });
});

describe("HumanGmMessageDto validation", () => {
  it("keeps private GM notes through whitelist validation", async () => {
    const dto = plainToInstance(HumanGmMessageDto, {
      content: "The innkeeper lowers their voice.",
      privateNote: "The guard heard this.",
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    expect(errors).toEqual([]);
    expect(dto.privateNote).toBe("The guard heard this.");
  });
});

describe("RevealSessionContentDto validation", () => {
  it("rejects unsupported HUMAN GM reveal content kinds before audit logging", async () => {
    const dto = plainToInstance(RevealSessionContentDto, {
      contentId: "clue-1",
      contentKind: "unsupported",
      scope: "party",
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    expect(errors.some((error) => error.property === "contentKind")).toBe(true);
  });
});

describe("ApplyHumanGmCombatConditionDto validation", () => {
  it("rejects unsupported HUMAN GM condition operations", async () => {
    const dto = plainToInstance(ApplyHumanGmCombatConditionDto, {
      targetId: "token-1",
      conditionId: "condition.stunned",
      operation: "toggle",
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    expect(errors.some((error) => error.property === "operation")).toBe(true);
  });
});

describe("SessionsService pending rest approval projection", () => {
  it("projects HUMAN GM rest approval requests for reconnect snapshots", async () => {
    const shortRequestedAt = new Date();
    const longRequestedAt = new Date(shortRequestedAt.getTime() + 1000);
    const prisma = {
      playerAction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "action-short",
            rawText: "/rest short 2",
            userId: "player-1",
            sessionCharacterId: "session-character-1",
            clientCreatedAt: shortRequestedAt,
          },
          {
            id: "action-long",
            rawText: "/rest long",
            userId: "player-2",
            sessionCharacterId: null,
            clientCreatedAt: longRequestedAt,
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: "player-1", displayName: "Mira" },
          { id: "player-2", displayName: "Toma" },
        ]),
      },
      sessionCharacter: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "session-character-1",
            character: { name: "Mira the Bold" },
          },
        ]),
      },
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const projection = await (
      service as unknown as {
        buildPendingRestApprovals: (sessionId: string) => Promise<unknown[]>;
      }
    ).buildPendingRestApprovals("session-1");

    expect(prisma.playerAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionId: "session-1",
          failureReason: "REST_REQUIRES_GM_APPROVAL",
          clientCreatedAt: { gt: expect.any(Date) },
        }),
      }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["player-1", "player-2"] } },
      select: { id: true, displayName: true },
    });
    expect(prisma.sessionCharacter.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["session-character-1"] } },
      select: {
        id: true,
        character: {
          select: { name: true },
        },
      },
    });
    expect(projection).toEqual([
      {
        actionId: "action-short",
        restType: "short",
        hitDiceToSpend: 2,
        requesterUserId: "player-1",
        requesterDisplayName: "Mira",
        sessionCharacterId: "session-character-1",
        characterName: "Mira the Bold",
        requestedAt: shortRequestedAt.toISOString(),
        expiresAt: getRestApprovalExpiresAt(shortRequestedAt).toISOString(),
      },
      {
        actionId: "action-long",
        restType: "long",
        hitDiceToSpend: null,
        requesterUserId: "player-2",
        requesterDisplayName: "Toma",
        sessionCharacterId: null,
        characterName: null,
        requestedAt: longRequestedAt.toISOString(),
        expiresAt: getRestApprovalExpiresAt(longRequestedAt).toISOString(),
      },
    ]);
  });
});

describe("SessionsService HUMAN GM messages", () => {
  it("records the created GM message id in override metadata and state diff", async () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const tx = {
      gameState: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ version: 4 }),
      },
      session: {
        update: jest.fn().mockResolvedValue({}),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 2 }),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "turn-log-1",
          turnNumber: data.turnNumber,
          playerActionId: null,
          actorUserId: data.actorUserId,
          sessionCharacterId: null,
          rawInput: data.rawInput,
          structuredActionJson: data.structuredActionJson,
          stateDiffJson: data.stateDiffJson,
          outcome: data.outcome,
          narration: data.narration,
          createdAt: now,
        })),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getGameStateEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest.fn().mockResolvedValue({
      id: "session-1",
      status: "PLAYING",
    });
    serviceInternals.getGameStateEntityOrThrow = jest.fn().mockResolvedValue({
      sessionScenario: { id: "session-scenario-1", scenarioId: "scenario-1" },
      state: { version: 4, currentNodeId: "node-1", flagsJson: "{}" },
    });
    serviceInternals.buildSnapshot = jest.fn().mockResolvedValue({ session: { id: "session-1" } });

    await service.createHumanGmMessage("gm-user", "session-1", {
      content: "The hall falls silent.",
      privateNote: "The scout is listening.",
    });

    const flagsUpdate = tx.gameState.update.mock.calls[0]?.[0] as { data: { flagsJson: string } };
    const createdMessage = JSON.parse(flagsUpdate.data.flagsJson).gmMessages[0] as { id: string };
    const turnLogCreate = tx.turnLog.create.mock.calls[0]?.[0] as {
      data: { structuredActionJson: string; stateDiffJson: string };
    };
    const structuredAction = JSON.parse(turnLogCreate.data.structuredActionJson);
    const stateDiff = JSON.parse(turnLogCreate.data.stateDiffJson);

    expect(createdMessage.id).toEqual(expect.any(String));
    expect(structuredAction).toEqual(
      expect.objectContaining({
        type: "gm_override",
        kind: "scene_text",
        hasPrivateNote: true,
        metadata: expect.objectContaining({
          gmMessageId: createdMessage.id,
          messageType: "gm",
        }),
      }),
    );
    expect(stateDiff.diff).toEqual(
      expect.objectContaining({
        gmMessageCreated: true,
        gmMessageId: createdMessage.id,
      }),
    );
    expect(tx.stateDiff.create).toHaveBeenCalledWith({
      data: {
        sessionScenarioId: "session-scenario-1",
        turnLogId: "turn-log-1",
        baseVersion: 4,
        nextVersion: 5,
        reason: "gm_override:scene_text",
        diffJson: JSON.stringify(stateDiff.diff),
      },
    });
    expect(structuredAction.metadata).not.toHaveProperty("privateNote");
    expect(flagsUpdate.data.flagsJson).not.toContain("The scout is listening.");
    expect(turnLogCreate.data.structuredActionJson).not.toContain("The scout is listening.");
    expect(turnLogCreate.data.stateDiffJson).not.toContain("The scout is listening.");
    expect(tx.gameState.update).toHaveBeenCalledWith({
      where: { sessionScenarioId: "session-scenario-1" },
      data: expect.objectContaining({
        flagsJson: expect.stringContaining("The scout is listening."),
      }),
    });
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        structuredAction: expect.not.objectContaining({
          privateNote: "The scout is listening.",
        }),
        stateDiff: expect.not.objectContaining({
          privateNote: "The scout is listening.",
        }),
      }),
    );
  });
});

describe("SessionsService HUMAN GM private notes", () => {
  it("returns stored private notes only through the GM endpoint projection", async () => {
    const prisma = {
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          flagsJson: JSON.stringify({
            gmPrivateNotes: [
              {
                id: "gm-note:2",
                turnLogId: "turn-log-2",
                kind: "set_dc",
                targetId: "trap:needle",
                note: "Needle trap DC is higher after alert.",
                gmUserId: "gm-user",
                createdAt: "2026-06-20T00:00:02.000Z",
              },
              {
                id: "gm-note:1",
                turnLogId: "turn-log-1",
                kind: "scene_text",
                targetId: null,
                note: "Scout is listening.",
                gmUserId: "gm-user",
                createdAt: "2026-06-20T00:00:01.000Z",
              },
              { id: "broken" },
            ],
          }),
        }),
      },
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1", status: "PLAYING" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest
      .fn()
      .mockResolvedValue({ id: "session-scenario-1" });

    await expect(service.listHumanGmPrivateNotes("gm-user", "session-1")).resolves.toEqual([
      {
        id: "gm-note:2",
        turnLogId: "turn-log-2",
        kind: "set_dc",
        targetId: "trap:needle",
        note: "Needle trap DC is higher after alert.",
        gmUserId: "gm-user",
        createdAt: "2026-06-20T00:00:02.000Z",
      },
      {
        id: "gm-note:1",
        turnLogId: "turn-log-1",
        kind: "scene_text",
        targetId: null,
        note: "Scout is listening.",
        gmUserId: "gm-user",
        createdAt: "2026-06-20T00:00:01.000Z",
      },
    ]);
    expect(serviceInternals.getHumanGmSessionForOperator).toHaveBeenCalledWith("gm-user", "session-1");
  });
});

describe("SessionsService HUMAN GM AI assist suggestions", () => {
  it("lists private suggestions for the authorized HUMAN GM in newest-first order", async () => {
    const prisma = {
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          flagsJson: JSON.stringify({
            humanGmAiAssistSuggestions: [
              {
                id: "ai-assist:older",
                assistType: "rules",
                content: "Older suggestion",
                suggestedActionId: null,
                targetId: null,
                status: "ACCEPTED",
                createdByUserId: "gm-user",
                acceptedByUserId: "gm-user",
                createdAt: "2026-06-20T00:00:01.000Z",
                acceptedAt: "2026-06-20T00:00:03.000Z",
              },
              {
                id: "ai-assist:newer",
                assistType: "scene_text",
                content: "Newer suggestion",
                suggestedActionId: null,
                targetId: "node-1",
                status: "PENDING",
                createdByUserId: "gm-user",
                acceptedByUserId: null,
                createdAt: "2026-06-20T00:00:02.000Z",
                acceptedAt: null,
              },
              { id: "broken" },
            ],
          }),
        }),
      },
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1", status: "PLAYING" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest
      .fn()
      .mockResolvedValue({ id: "session-scenario-1" });

    await expect(service.listHumanGmAiAssistSuggestions("gm-user", "session-1")).resolves.toEqual([
      expect.objectContaining({ id: "ai-assist:newer", status: "PENDING" }),
      expect.objectContaining({ id: "ai-assist:older", status: "ACCEPTED" }),
    ]);
    expect(serviceInternals.getHumanGmSessionForOperator).toHaveBeenCalledWith("gm-user", "session-1");
  });

  it("stores suggestions without creating public audit logs or state diffs", async () => {
    const prisma = {
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          flagsJson: JSON.stringify({ gmMessages: [] }),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      turnLog: {
        create: jest.fn(),
      },
      stateDiff: {
        create: jest.fn(),
      },
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1", status: "PLAYING" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest
      .fn()
      .mockResolvedValue({ id: "session-scenario-1" });

    const suggestion = await service.createHumanGmAiAssistSuggestion("gm-user", "session-1", {
      assistType: "scene_text",
      content: "Describe the room more ominously.",
      suggestedActionId: "scene-text",
      targetId: "node-1",
    });

    expect(suggestion).toMatchObject({
      assistType: "scene_text",
      content: "Describe the room more ominously.",
      suggestedActionId: "scene-text",
      targetId: "node-1",
      status: "PENDING",
      createdByUserId: "gm-user",
      acceptedByUserId: null,
      acceptedAt: null,
    });
    const flagsUpdate = prisma.gameState.update.mock.calls[0]?.[0] as { data: { flagsJson: string } };
    expect(JSON.parse(flagsUpdate.data.flagsJson)).toMatchObject({
      gmMessages: [],
      humanGmAiAssistSuggestions: [expect.objectContaining({ status: "PENDING" })],
    });
    expect(prisma.turnLog.create).not.toHaveBeenCalled();
    expect(prisma.stateDiff.create).not.toHaveBeenCalled();
  });

  it("accepts a pending suggestion through gm override audit without public state diff", async () => {
    const now = new Date("2026-06-20T00:00:00.000Z");
    const pendingSuggestion = {
      id: "ai-assist:1",
      assistType: "scene_text",
      content: "Describe the room more ominously.",
      suggestedActionId: "scene-text",
      targetId: "node-1",
      status: "PENDING",
      createdByUserId: "gm-user",
      acceptedByUserId: null,
      createdAt: now.toISOString(),
      acceptedAt: null,
    };
    const tx = {
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 4 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-ai-assist",
          turnNumber: 5,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:ai_assist_accept",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "ai_assist_accept",
            targetId: null,
            public: true,
            hasPrivateNote: false,
            metadata: {
              assistType: "scene_text",
              suggestionId: "ai-assist:1",
              suggestedActionId: "scene-text",
              targetId: "node-1",
            },
          }),
          stateDiffJson: null,
          outcome: "SUCCESS",
          narration: "GM이 AI assist 제안을 승인했습니다.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          flagsJson: JSON.stringify({ humanGmAiAssistSuggestions: [pendingSuggestion] }),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn(),
      },
    };
    const prisma = {
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          flagsJson: JSON.stringify({ humanGmAiAssistSuggestions: [pendingSuggestion] }),
        }),
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitSessionSnapshot: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1", status: "PLAYING" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest
      .fn()
      .mockResolvedValue({ id: "session-scenario-1" });
    serviceInternals.buildSnapshot = jest
      .fn()
      .mockResolvedValue({ session: { id: "session-1" } });

    await service.acceptHumanGmAiAssistSuggestion("gm-user", "session-1", {
      suggestionId: "ai-assist:1",
    });

    expect(tx.turnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawInput: "gm:ai_assist_accept",
          stateDiffJson: null,
        }),
      }),
    );
    expect(tx.stateDiff.create).not.toHaveBeenCalled();
    const flagsUpdate = tx.gameState.update.mock.calls[0]?.[0] as { data: { flagsJson: string } };
    expect(JSON.parse(flagsUpdate.data.flagsJson).humanGmAiAssistSuggestions[0]).toMatchObject({
      id: "ai-assist:1",
      status: "ACCEPTED",
      acceptedByUserId: "gm-user",
      acceptedAt: expect.any(String),
    });
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        rawInput: "gm:ai_assist_accept",
        stateDiff: null,
      }),
    );
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalled();
  });

  it("records an accepted suggestion application failure as a failure audit turn log", async () => {
    const now = new Date("2026-06-20T00:00:00.000Z");
    const acceptedSuggestion = {
      id: "ai-assist:1",
      assistType: "node_move",
      content: "Move to the next room.",
      suggestedActionId: "node-next",
      targetId: null,
      status: "ACCEPTED",
      createdByUserId: "gm-user",
      acceptedByUserId: "gm-user",
      createdAt: now.toISOString(),
      acceptedAt: now.toISOString(),
    };
    const prisma = {
      gameState: {
        findUnique: jest.fn().mockResolvedValue({
          flagsJson: JSON.stringify({ humanGmAiAssistSuggestions: [acceptedSuggestion] }),
        }),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 6 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-ai-assist-failure",
          turnNumber: 7,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:ai_assist_apply_failure",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "ai_assist_apply_failure",
            targetId: null,
            public: true,
            hasPrivateNote: false,
            metadata: {
              assistType: "node_move",
              suggestionId: "ai-assist:1",
              suggestedActionId: "node-next",
              targetId: null,
              failedOperation: "node_move",
              failureReason: "Node does not exist.",
            },
          }),
          stateDiffJson: null,
          outcome: "FAILURE",
          narration: "GM AI assist 제안 승인 후 적용에 실패했습니다.",
          createdAt: now,
        }),
      },
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitSessionSnapshot: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1", status: "PLAYING" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest
      .fn()
      .mockResolvedValue({ id: "session-scenario-1" });
    serviceInternals.buildSnapshot = jest
      .fn()
      .mockResolvedValue({ session: { id: "session-1" } });

    await service.reportHumanGmAiAssistApplicationFailure("gm-user", "session-1", {
      suggestionId: "ai-assist:1",
      failedOperation: "node_move",
      failureReason: "Node does not exist.",
    });

    expect(prisma.turnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawInput: "gm:ai_assist_apply_failure",
          stateDiffJson: null,
          outcome: "FAILURE",
          structuredActionJson: expect.stringContaining("ai_assist_apply_failure"),
        }),
      }),
    );
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        rawInput: "gm:ai_assist_apply_failure",
        outcome: "FAILURE",
        stateDiff: null,
      }),
    );
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalled();
  });
});

describe("SessionsService HUMAN GM reveal", () => {
  it("rejects unsupported reveal content kinds before writing audit data", async () => {
    const prisma = {
      $transaction: jest.fn(() => {
        throw new Error("transaction should not run");
      }),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      ensureSessionScenarioNodeSnapshotForScenario: jest.Mock;
      findSessionScenarioRevealable: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-scenario-1",
      scenarioId: "scenario-1",
    });
    serviceInternals.ensureSessionScenarioNodeSnapshotForScenario = jest.fn().mockResolvedValue(undefined);
    serviceInternals.findSessionScenarioRevealable = jest.fn().mockResolvedValue({
      id: "clue-1",
      title: "Clue",
    });

    await expect(
      service.revealSessionContent("gm-user", "session-1", {
        contentId: "clue-1",
        contentKind: "unsupported",
        scope: "party",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(serviceInternals.findSessionScenarioRevealable).not.toHaveBeenCalled();
  });

  it("links a HUMAN GM handout reveal to the generated override turn log", async () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const createdReveal = {
      id: "reveal-1",
      sessionScenarioId: "session-scenario-1",
      contentId: "clue-1",
      contentKind: "clue",
      scope: "party",
      recipientId: null,
      revealedAt: now,
      revealedBy: "human_gm",
      reason: "Reveal the inscription.",
      snapshotJson: JSON.stringify({ id: "clue-1", title: "Inscription" }),
      turnLogId: null,
    };
    const tx = {
      sessionReveal: {
        upsert: jest.fn().mockResolvedValue(createdReveal),
        update: jest.fn().mockResolvedValue({ ...createdReveal, turnLogId: "turn-log-1" }),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 7 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-1",
          turnNumber: 8,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:reveal_handout",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "reveal_handout",
            targetId: "clue-1",
            public: true,
            hasPrivateNote: false,
            metadata: { reason: "Reveal the inscription." },
          }),
          stateDiffJson: JSON.stringify({
            baseVersion: 3,
            nextVersion: 4,
            reason: "gm_override:reveal_handout",
            diff: { revealId: "reveal-1" },
          }),
          outcome: "SUCCESS",
          narration: "Reveal the inscription.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ version: 3 }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitCombatUpdated: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      ensureSessionScenarioNodeSnapshotForScenario: jest.Mock;
      findSessionScenarioRevealable: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-scenario-1",
      scenarioId: "scenario-1",
    });
    serviceInternals.ensureSessionScenarioNodeSnapshotForScenario = jest.fn().mockResolvedValue(undefined);
    serviceInternals.findSessionScenarioRevealable = jest.fn().mockResolvedValue({
      id: "clue-1",
      title: "Inscription",
      handoutText: "The mark means danger.",
    });
    serviceInternals.buildSnapshot = jest.fn().mockResolvedValue({ session: { id: "session-1" } });

    await expect(
      service.revealSessionContent("gm-user", "session-1", {
        contentId: "clue-1",
        contentKind: "clue",
        scope: "party",
        reason: "Reveal the inscription.",
      }),
    ).resolves.toMatchObject({
      id: "reveal-1",
      contentId: "clue-1",
      revealedBy: "human_gm",
    });

    expect(tx.sessionReveal.update).toHaveBeenCalledWith({
      where: { id: "reveal-1" },
      data: { turnLogId: "turn-log-1" },
    });
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ turnLogId: "turn-log-1" }),
    );
  });
});

describe("SessionsService HUMAN GM combat conditions", () => {
  it("updates a combat participant condition and writes a GM override log", async () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const tx = {
      combatParticipant: {
        update: jest.fn().mockResolvedValue({}),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 4 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-1",
          turnNumber: 5,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:set_condition",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "set_condition",
            targetId: "participant-goblin",
            public: true,
            hasPrivateNote: false,
            metadata: {
              operation: "add",
              conditionId: "condition.stunned",
              tokenId: "token-goblin",
              targetName: "Smoke Goblin",
            },
          }),
          stateDiffJson: JSON.stringify({
            baseVersion: 2,
            nextVersion: 3,
            reason: "gm_override:set_condition",
            diff: {
              combatParticipants: [
                {
                  combatParticipantId: "participant-goblin",
                  tokenId: "token-goblin",
                  conditions: ["condition.stunned"],
                },
              ],
            },
          }),
          outcome: "SUCCESS",
          narration: "GM이 Smoke Goblin에게 기절 상태를 적용했습니다.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ version: 2 }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      combat: {
        findFirst: jest.fn().mockResolvedValue({
          id: "combat-1",
          sessionId: "session-1",
          status: "ACTIVE",
          participants: [
            {
              id: "participant-goblin",
              tokenId: "token-goblin",
              nameSnapshot: "Smoke Goblin",
              conditionsJson: "[]",
            },
          ],
        }),
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitCombatUpdated: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-scenario-1",
      scenarioId: "scenario-1",
    });
    serviceInternals.buildSnapshot = jest.fn().mockResolvedValue({ session: { id: "session-1" } });

    await expect(
      service.applyHumanGmCombatCondition("gm-user", "session-1", {
        targetId: "token-goblin",
        conditionId: "condition.stunned",
        operation: "add",
      }),
    ).resolves.toMatchObject({ session: { id: "session-1" } });

    expect(tx.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-goblin" },
      data: { conditionsJson: JSON.stringify(["condition.stunned"]) },
    });
    expect(tx.turnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawInput: "gm:set_condition",
          narration: "GM이 Smoke Goblin에게 기절 상태를 적용했습니다.",
        }),
      }),
    );
    expect(realtimeEvents.emitTurnLogCreated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ turnLogId: "turn-log-1" }),
    );
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        combatId: "combat-1",
        participants: [
          expect.objectContaining({
            sessionEntityId: "participant-goblin",
            tokenId: "token-goblin",
            conditions: ["condition.stunned"],
            concentration: null,
          }),
        ],
      }),
    );
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalled();
  });

  it("removes a combat participant condition through the GM override path", async () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const tx = {
      combatParticipant: {
        update: jest.fn().mockResolvedValue({}),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 5 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-remove",
          turnNumber: 6,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:set_condition",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "set_condition",
            targetId: "participant-goblin",
            public: true,
            hasPrivateNote: false,
            metadata: {
              operation: "remove",
              conditionId: "condition.stunned",
              tokenId: "token-goblin",
              targetName: "Smoke Goblin",
            },
          }),
          stateDiffJson: JSON.stringify({
            baseVersion: 3,
            nextVersion: 4,
            reason: "gm_override:set_condition",
            diff: {
              combatParticipants: [
                {
                  combatParticipantId: "participant-goblin",
                  tokenId: "token-goblin",
                  conditions: ["condition.poisoned"],
                },
              ],
            },
          }),
          outcome: "SUCCESS",
          narration: "GM이 Smoke Goblin에게서 기절 상태를 제거했습니다.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ version: 3 }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      combat: {
        findFirst: jest.fn().mockResolvedValue({
          id: "combat-1",
          sessionId: "session-1",
          status: "ACTIVE",
          roundNo: 1,
          turnNo: 1,
          currentParticipantId: "participant-goblin",
          participants: [
            {
              id: "participant-goblin",
              entityType: "MONSTER",
              sessionCharacterId: null,
              tokenId: "token-goblin",
              nameSnapshot: "Smoke Goblin",
              currentHp: 7,
              maxHp: 7,
              armorClass: 15,
              initiative: 12,
              turnOrder: 1,
              isAlive: true,
              isHostile: true,
              conditionsJson: JSON.stringify(["condition.stunned", "condition.poisoned"]),
            },
          ],
        }),
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitCombatUpdated: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-scenario-1",
      scenarioId: "scenario-1",
    });
    serviceInternals.buildSnapshot = jest.fn().mockResolvedValue({ session: { id: "session-1" } });

    await service.applyHumanGmCombatCondition("gm-user", "session-1", {
      targetId: "participant-goblin",
      conditionId: "condition.stunned",
      operation: "remove",
    });

    expect(tx.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: "participant-goblin" },
      data: { conditionsJson: JSON.stringify(["condition.poisoned"]) },
    });
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        participants: [
          expect.objectContaining({
            sessionEntityId: "participant-goblin",
            conditions: ["condition.poisoned"],
            concentration: null,
          }),
        ],
      }),
    );
  });
});

describe("SessionsService HUMAN GM combat HP override", () => {
  it("updates combat HP and writes adjust_hp audit state", async () => {
    const now = new Date("2026-06-19T00:00:00.000Z");
    const target = {
      id: "participant-ogre",
      entityType: "MONSTER",
      sessionCharacterId: null,
      tokenId: "token-ogre",
      nameSnapshot: "Ogre",
      currentHp: 30,
      maxHp: 40,
      armorClass: 11,
      initiative: 8,
      turnOrder: 1,
      isAlive: true,
      isHostile: true,
      conditionsJson: "[]",
    };
    const combat = {
      id: "combat-1",
      sessionId: "session-1",
      status: "ACTIVE",
      roundNo: 1,
      turnNo: 1,
      currentParticipantId: target.id,
      participants: [target],
    };
    const tx = {
      combatParticipant: {
        update: jest.fn().mockResolvedValue({}),
      },
      sessionCharacter: {
        update: jest.fn().mockResolvedValue({}),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 7 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-hp",
          turnNumber: 8,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:adjust_hp",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "adjust_hp",
            targetId: target.id,
            public: true,
            hasPrivateNote: false,
            metadata: {
              previousHp: 30,
              nextHp: 14,
              maximumHp: 40,
              tokenId: "token-ogre",
              targetName: "Ogre",
            },
          }),
          stateDiffJson: JSON.stringify({
            baseVersion: 4,
            nextVersion: 5,
            reason: "gm_override:adjust_hp",
            diff: {
              combatParticipants: [
                {
                  combatParticipantId: target.id,
                  tokenId: "token-ogre",
                  previousHp: 30,
                  currentHp: 14,
                  isAlive: true,
                },
              ],
            },
          }),
          outcome: "SUCCESS",
          narration: "GM이 Ogre의 HP를 30에서 14(으)로 조정했습니다.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ version: 4 }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      combat: {
        findFirst: jest.fn().mockResolvedValue(combat),
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitCombatUpdated: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest
      .fn()
      .mockResolvedValue({ id: "session-scenario-1" });
    serviceInternals.buildSnapshot = jest
      .fn()
      .mockResolvedValue({ session: { id: "session-1" } });

    await service.adjustHumanGmCombatHp("gm-user", "session-1", {
      targetId: "token-ogre",
      currentHp: 14,
    });

    expect(tx.combatParticipant.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { currentHp: 14, isAlive: true },
    });
    expect(tx.sessionCharacter.update).not.toHaveBeenCalled();
    expect(tx.turnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawInput: "gm:adjust_hp",
          narration: "GM이 Ogre의 HP를 30에서 14(으)로 조정했습니다.",
        }),
      }),
    );
    expect(realtimeEvents.emitCombatUpdated).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        participants: [
          expect.objectContaining({
            sessionEntityId: target.id,
            currentHp: 14,
            isAlive: true,
          }),
        ],
      }),
    );
  });
});

describe("SessionsService HUMAN GM inventory removal", () => {
  it("removes inventory quantity and writes adjust_item audit state", async () => {
    const now = new Date("2026-06-20T00:00:00.000Z");
    const targetCharacter = {
      id: "session-character-1",
      sessionId: "session-1",
      status: "ACTIVE",
      currentHp: 10,
      tempHp: 0,
      conditionsJson: "[]",
      inventorySnapshotJson: null,
      characterId: "character-1",
      participant: { role: "PLAYER" },
      character: {
        id: "character-1",
        name: "Hero",
        ownerUserId: "player-user",
        className: "fighter",
        level: 1,
        maxHp: 10,
        armorClass: 14,
        speed: 30,
        abilitiesJson: "{}",
        featuresJson: null,
        spellsJson: null,
        inventoryJson: "[]",
        equippedWeaponId: null,
        offhandEquipmentId: null,
      },
    };
    const itemDefinition = {
      id: "equipment.rope",
      name: "Rope",
      itemType: "GEAR",
      weightLb: 10,
      volumeCuFt: null,
      damageDice: null,
      damageType: null,
      armorClassBase: null,
      armorClassBonus: null,
      armorStrengthRequirement: null,
      armorStealthDisadvantage: null,
      useEffect: null,
      propertiesJson: null,
      packContentsJson: null,
    };
    const inventoryEntry = {
      id: "entry-rope",
      sessionCharacterId: "session-character-1",
      itemDefinitionId: "equipment.rope",
      quantity: 3,
      containerEntryId: null,
      itemDefinition,
    };
    const tx = {
      inventoryEntry: {
        findFirst: jest.fn().mockResolvedValue(inventoryEntry),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ ...inventoryEntry, quantity: 1 }]),
      },
      sessionCharacter: {
        update: jest.fn().mockResolvedValue({}),
      },
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 3 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-remove-item",
          turnNumber: 4,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:adjust_item",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "adjust_item",
            targetId: "session-character-1",
            public: true,
            hasPrivateNote: false,
            metadata: {
              operation: "remove",
              itemName: "Rope",
              itemType: "GEAR",
              quantity: 2,
            },
          }),
          stateDiffJson: JSON.stringify({
            baseVersion: 6,
            nextVersion: 7,
            reason: "gm_override:adjust_item",
            diff: {
              inventory: {
                sessionCharacterId: "session-character-1",
                itemDefinitionId: "equipment.rope",
                quantityDelta: -2,
              },
            },
          }),
          outcome: "SUCCESS",
          narration: "GM이 Hero에게서 Rope x2을(를) 회수했습니다.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ version: 6 }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      sessionCharacter: {
        findUnique: jest.fn().mockResolvedValue(targetCharacter),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...targetCharacter,
          inventoryEntries: [{ ...inventoryEntry, quantity: 1 }],
        }),
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
      emitCharacterUpdated: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1", status: "PLAYING" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest
      .fn()
      .mockResolvedValue({ id: "session-scenario-1" });
    serviceInternals.buildSnapshot = jest
      .fn()
      .mockResolvedValue({ session: { id: "session-1" } });

    await service.removeHumanGmInventoryItem("gm-user", "session-1", {
      sessionCharacterId: "session-character-1",
      itemId: "entry-rope",
      quantity: 2,
    });

    expect(tx.inventoryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-rope" },
      data: { quantity: { decrement: 2 } },
    });
    expect(tx.inventoryEntry.delete).not.toHaveBeenCalled();
    expect(tx.sessionCharacter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-character-1" },
      }),
    );
    expect(tx.turnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawInput: "gm:adjust_item",
          narration: "GM이 Hero에게서 Rope x2을(를) 회수했습니다.",
        }),
      }),
    );
    expect(realtimeEvents.emitStateDiffApplied).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        reason: "gm_override:adjust_item",
        diff: {
          inventory: {
            sessionCharacterId: "session-character-1",
            itemDefinitionId: "equipment.rope",
            quantityDelta: -2,
          },
        },
      }),
    );
    expect(realtimeEvents.emitCharacterUpdated).toHaveBeenCalled();
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalled();
  });

  it("clears the inventory snapshot when no entries remain", async () => {
    const client = {
      inventoryEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      sessionCharacter: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new SessionsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const serviceInternals = service as unknown as {
      refreshSessionInventorySnapshot: (sessionCharacterId: string, client: unknown) => Promise<void>;
    };

    await serviceInternals.refreshSessionInventorySnapshot("session-character-1", client);

    expect(client.sessionCharacter.update).toHaveBeenCalledWith({
      where: { id: "session-character-1" },
      data: { inventorySnapshotJson: "[]" },
    });
  });
});

describe("SessionsService HUMAN GM DC override", () => {
  it("writes a set_dc audit state without exposing the private note in public diff", async () => {
    const now = new Date("2026-06-20T00:00:00.000Z");
    const tx = {
      turnLog: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 9 }),
        create: jest.fn().mockResolvedValue({
          id: "turn-log-set-dc",
          turnNumber: 10,
          playerActionId: null,
          actorUserId: "gm-user",
          sessionCharacterId: null,
          rawInput: "gm:set_dc",
          structuredActionJson: JSON.stringify({
            type: "gm_override",
            kind: "set_dc",
            targetId: "trap:needle",
            public: true,
            hasPrivateNote: true,
            metadata: {
              targetId: "trap:needle",
              label: "Needle Trap",
              ability: "dexterity",
              dc: 16,
            },
          }),
          stateDiffJson: JSON.stringify({
            baseVersion: 2,
            nextVersion: 3,
            reason: "gm_override:set_dc",
            diff: {
              difficultyClassOverride: {
                targetId: "trap:needle",
                label: "Needle Trap",
                ability: "dexterity",
                dc: 16,
              },
            },
          }),
          outcome: "SUCCESS",
          narration: "GM이 Needle Trap의 dexterity DC를 16(으)로 설정했습니다.",
          createdAt: now,
        }),
      },
      gameState: {
        findUnique: jest.fn().mockResolvedValue({ version: 2 }),
        update: jest.fn().mockResolvedValue({}),
      },
      stateDiff: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const realtimeEvents = {
      emitTurnLogCreated: jest.fn(),
      emitStateDiffApplied: jest.fn(),
      emitSessionSnapshot: jest.fn(),
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      realtimeEvents as never,
    );
    const serviceInternals = service as unknown as {
      getHumanGmSessionForOperator: jest.Mock;
      getActiveSessionScenarioEntityOrThrow: jest.Mock;
      buildSnapshot: jest.Mock;
    };
    serviceInternals.getHumanGmSessionForOperator = jest
      .fn()
      .mockResolvedValue({ id: "session-1", status: "PLAYING" });
    serviceInternals.getActiveSessionScenarioEntityOrThrow = jest
      .fn()
      .mockResolvedValue({ id: "session-scenario-1" });
    serviceInternals.buildSnapshot = jest
      .fn()
      .mockResolvedValue({ session: { id: "session-1" } });

    await service.setHumanGmDifficultyClass("gm-user", "session-1", {
      targetId: "trap:needle",
      label: "Needle Trap",
      ability: "dexterity",
      dc: 16,
      privateNote: "hidden trap math",
    });

    expect(tx.turnLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawInput: "gm:set_dc",
          narration: "GM이 Needle Trap의 dexterity DC를 16(으)로 설정했습니다.",
          structuredActionJson: expect.stringContaining('"hasPrivateNote":true'),
        }),
      }),
    );
    const turnLogCreate = tx.turnLog.create.mock.calls[0]?.[0]?.data;
    expect(turnLogCreate.structuredActionJson).not.toContain("hidden trap math");
    expect(turnLogCreate.stateDiffJson).not.toContain("hidden trap math");
    expect(realtimeEvents.emitStateDiffApplied).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        reason: "gm_override:set_dc",
        diff: {
          difficultyClassOverride: {
            targetId: "trap:needle",
            label: "Needle Trap",
            ability: "dexterity",
            dc: 16,
          },
        },
      }),
    );
    expect(realtimeEvents.emitSessionSnapshot).toHaveBeenCalled();
  });
});

describe("SessionsService HUMAN GM runtime permissions", () => {
  function createPermissionService(participant: unknown) {
    const prisma = {
      sessionParticipant: {
        findUnique: jest.fn().mockResolvedValue(participant),
      },
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      getHumanGmSessionForOperator: (userId: string, sessionId: string) => Promise<unknown>;
      getSessionEntityOrThrow: jest.Mock;
    };
    return { prisma, service };
  }

  it("rejects HUMAN GM override controls in AI GM sessions before participant checks", async () => {
    const { prisma, service } = createPermissionService({
      status: "JOINED",
      role: "HOST",
    });
    service.getSessionEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: "AI",
      gmUserId: null,
    });

    await expect(
      service.getHumanGmSessionForOperator("host-user", "session-1"),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.sessionParticipant.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a joined GM participant when they are not the assigned HUMAN GM operator", async () => {
    const { prisma, service } = createPermissionService({
      status: "JOINED",
      role: "GM",
    });
    service.getSessionEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: "HUMAN",
      gmUserId: "assigned-gm",
    });

    await expect(
      service.getHumanGmSessionForOperator("other-gm", "session-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.sessionParticipant.findUnique).not.toHaveBeenCalled();
  });

  it("allows the assigned HUMAN GM only when they are still a joined GM participant", async () => {
    const { prisma, service } = createPermissionService({
      status: "JOINED",
      role: "GM",
    });
    service.getSessionEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: "HUMAN",
      gmUserId: "gm-user",
    });

    await expect(
      service.getHumanGmSessionForOperator("gm-user", "session-1"),
    ).resolves.toMatchObject({
      id: "session-1",
      gmMode: "HUMAN",
      gmUserId: "gm-user",
    });

    expect(prisma.sessionParticipant.findUnique).toHaveBeenCalledWith({
      where: {
        sessionId_userId: {
          sessionId: "session-1",
          userId: "gm-user",
        },
      },
      select: {
        role: true,
        status: true,
      },
    });
  });

  it("rejects a stale gmUserId when the user is not a joined GM participant", async () => {
    const { prisma, service } = createPermissionService({
      status: "LEFT",
      role: "PLAYER",
    });
    service.getSessionEntityOrThrow = jest.fn().mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: "HUMAN",
      gmUserId: "gm-user",
    });

    await expect(
      service.getHumanGmSessionForOperator("gm-user", "session-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.sessionParticipant.findUnique).toHaveBeenCalledWith({
      where: {
        sessionId_userId: {
          sessionId: "session-1",
          userId: "gm-user",
        },
      },
      select: {
        role: true,
        status: true,
      },
    });
  });
});

describe("SessionsService session listing", () => {
  const now = new Date("2026-05-08T00:00:00.000Z");

  function createPublicSessionFixture() {
    const host = {
      id: "host-user",
      publicId: "12345678",
      displayName: "테스트 호스트",
      email: null,
      passwordHash: null,
      authProvider: "GUEST",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    return {
      id: "session-1",
      publicId: "87654321",
      title: "테스트 공개 세션",
      description: "",
      hostUserId: host.id,
      inviteCode: "ABC123",
      status: "RECRUITING",
      visibility: "PUBLIC",
      maxParticipants: 4,
      ruleSetId: "dnd5e",
      gmMode: "AI",
      nextSessionAt: null,
      createdAt: now,
      updatedAt: now,
      host,
      participants: [
        {
          id: "participant-1",
          sessionId: "session-1",
          userId: "requester-user",
          role: "PLAYER",
          status: "JOINED",
          connectionStatus: "ONLINE",
          isReady: false,
          readyAt: null,
          joinedAt: now,
          leftAt: null,
        },
      ],
      sessionScenarios: [
        {
          id: "session-scenario-1",
          sessionId: "session-1",
          scenarioId: "scenario-1",
          sequence: 1,
          status: "ACTIVE",
          startedAt: null,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
          scenario: {
            id: "scenario-1",
            title: "테스트 시나리오",
            description: "테스트용 시나리오입니다.",
            createdByUserId: null,
            sourceType: "SYSTEM",
            baseScenarioId: null,
            thumbnailUrl: null,
            ruleSetId: "dnd5e",
            difficulty: "easy",
            license: "ORIGINAL",
            attribution: "test",
            startNodeId: "node-start",
            createdAt: now,
            updatedAt: now,
          },
          gameState: {
            sessionScenarioId: "session-scenario-1",
            version: 1,
            currentNodeId: "node-start",
            phase: "LOBBY",
            flagsJson: "{}",
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
    };
  }

  function createServiceWithSession(session: ReturnType<typeof createPublicSessionFixture>) {
    const prisma = {
      $transaction: jest.fn((queries: Array<Promise<unknown>>) => Promise.all(queries)),
      session: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([session]),
        update: jest.fn(),
      },
    };
    const usersService = {
      getUserEntityOrThrow: jest.fn().mockRejectedValue(new Error("host를 다시 조회하면 안 됩니다.")),
    };

    return {
      service: new SessionsService(prisma as never, usersService as never, {} as never, {} as never),
      prisma,
      usersService,
    };
  }

  it("excludes public sessions whose host was deleted before building the list", async () => {
    const session = createPublicSessionFixture();
    const { service, prisma, usersService } = createServiceWithSession(session);

    const result = await service.listAvailableSessions({ requesterUserId: "requester-user" });

    // 운영 DB에 soft delete된 host 세션이 남아도, 공개 목록 쿼리 단계에서 제외해야 전체 목록 404를 막을 수 있다.
    expect(prisma.session.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        visibility: "PUBLIC",
        status: "RECRUITING",
        host: {
          is: {
            deletedAt: null,
          },
        },
      }),
    });
    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          host: {
            is: {
              deletedAt: null,
            },
          },
        }),
        include: expect.objectContaining({
          host: true,
        }),
      }),
    );
    expect(usersService.getUserEntityOrThrow).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      session: { id: "session-1" },
      host: { id: "host-user" },
      participantCount: 1,
      role: "PLAYER",
    });
  });
});

describe("SessionsService player scenario mapping", () => {
  const service = Object.create(SessionsService.prototype) as {
    mapPlayerScenarioNode: (
      node: {
        id: string;
        nodeType: string;
        title: string;
        sceneText: string;
        imageUrl: string | null;
        checkOptionsJson: string;
        cluesJson: string;
        nodeMetaJson?: string | null;
      },
      revealedClueSnapshots: Map<string, Record<string, unknown>>,
    ) => {
      checkOptions: Array<Record<string, unknown>>;
      nodeType: ScenarioNodeType;
    };
  };

  it("projects check options to player-safe fields", () => {
    const node = service.mapPlayerScenarioNode(
      {
        id: "node-1",
        nodeType: ScenarioNodeType.EXPLORATION,
        title: "Locked Door",
        sceneText: "A locked door bars the way.",
        imageUrl: null,
        checkOptionsJson: JSON.stringify([
          {
            id: "pick_lock",
            type: "skill_check",
            skill: "sleight_of_hand",
            label: "Pick the lock",
            dc: 17,
            note: "Only reveal the trap after a failed roll.",
            hiddenTarget: "trap_trigger",
            revealTrigger: "failure",
          },
          {
            dc: 20,
            note: "GM-only option without a player label",
          },
        ]),
        cluesJson: JSON.stringify([]),
        nodeMetaJson: null,
      },
      new Map(),
    );

    expect(node.checkOptions).toEqual([
      {
        id: "pick_lock",
        type: "skill_check",
        skill: "sleight_of_hand",
        label: "Pick the lock",
      },
    ]);
  });

  it("prefers explicit player labels over GM labels", () => {
    const node = service.mapPlayerScenarioNode(
      {
        id: "node-1",
        nodeType: ScenarioNodeType.EXPLORATION,
        title: "Library",
        sceneText: "Dusty shelves surround you.",
        imageUrl: null,
        checkOptionsJson: JSON.stringify([
          {
            id: "inspect_shelf",
            skill: "investigation",
            label: "GM label",
            playerLabel: "Search the shelves",
          },
        ]),
        cluesJson: JSON.stringify([]),
        nodeMetaJson: null,
      },
      new Map(),
    );

    expect(node.checkOptions[0]).toMatchObject({ label: "Search the shelves" });
  });
});

describe("SessionsService VTT map structures", () => {
  const service = Object.create(SessionsService.prototype) as {
    redactVttMapForPlayer: (map: Record<string, unknown>) => Record<string, unknown>;
    normalizeVttMap: (map: Record<string, unknown>, scenarioNodeId: string | null) => Record<string, unknown>;
    ensurePlayerMapShellUnchanged: (
      baseline: Record<string, unknown>,
      requested: Record<string, unknown>,
      allowFullMapShell?: boolean,
    ) => void;
    applyPlayerVttMapUpdate: (
      userId: string,
      sessionId: string,
      sessionScenarioId: string,
      state: { currentNodeId: string | null; flagsJson: string | null },
      requestedMap: Record<string, unknown>,
      allowFullMapShell?: boolean,
    ) => Promise<Record<string, unknown>>;
    getVttMapBaseline: jest.Mock;
    getControlledSessionCharacterIds: jest.Mock;
    spendCombatMovement: jest.Mock;
    prisma: {
      combat: {
        findFirst: jest.Mock;
      };
    };
    logger: {
      debug: jest.Mock;
      warn: jest.Mock;
    };
    ensureTokenPathIsReachable: (
      map: Record<string, unknown>,
      fromToken: Record<string, unknown>,
      toToken: Record<string, unknown>,
    ) => void;
    rectsOverlap: (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) => boolean;
    getGridLineCells: (
      fromToken: Record<string, unknown>,
      toToken: Record<string, unknown>,
      map: Record<string, unknown>,
    ) => Array<{ x: number; y: number }>;
    getGridIndex: (value: number, gridSize: number, maxSize: number) => number;
  };

  it("redacts player-hidden structure details from VTT maps", () => {
    const redacted = service.redactVttMapForPlayer({
      id: "map-1",
      width: 192,
      height: 64,
      gridSize: 64,
      tokens: [
        { id: "visible-token", name: "Visible", x: 0, y: 0, size: 64, hidden: false },
        { id: "hidden-token", name: "Hidden", x: 64, y: 0, size: 64, hidden: true },
      ],
      startingPositions: [{ id: "start-1", label: "P1", x: 0, y: 0 }],
      doorCells: [
        {
          id: "door-1",
          x: 64,
          y: 0,
          width: 64,
          height: 64,
          state: "locked",
          keyItemId: "silver-key",
        },
      ],
      objectCells: [
        {
          id: "object-visible",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: ["clue-1"],
          hiddenItemIds: ["item-1"],
          hiddenEventIds: ["event-1"],
        },
        {
          id: "object-hidden",
          x: 128,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: false,
          hiddenClueIds: ["clue-2"],
        },
      ],
    });

    expect(redacted.tokens).toEqual([
      expect.objectContaining({ id: "visible-token", hidden: false }),
    ]);
    expect(redacted.startingPositions).toEqual([]);
    expect(redacted.doorCells).toEqual([
      expect.objectContaining({ id: "door-1", keyItemId: null }),
    ]);
    expect(redacted.objectCells).toEqual([
      expect.objectContaining({
        id: "object-visible",
        hiddenClueIds: [],
        hiddenItemIds: [],
        hiddenEventIds: [],
      }),
    ]);
  });

  it("preserves no-check clue reveal settings while normalizing object cells", () => {
    const normalized = service.normalizeVttMap(
      {
        id: "map-1",
        width: 640,
        height: 480,
        gridSize: 64,
        tokens: [],
        fogRects: [],
        objectCells: [
          {
            id: "object-1",
            x: 0,
            y: 0,
            width: 64,
            height: 64,
            hiddenClueIds: ["clue-1"],
            revealChecks: [
              {
                contentId: "clue-1",
                requiresCheck: false,
                ability: "int",
                skill: "investigation",
                dc: 15,
              },
            ],
          },
        ],
      },
      "node-1",
    );

    expect(normalized.objectCells).toEqual([
      expect.objectContaining({
        id: "object-1",
        revealChecks: [
          expect.objectContaining({
            contentId: "clue-1",
            requiresCheck: false,
          }),
        ],
      }),
    ]);
  });

  it("preserves terrain effect ids while normalizing terrain cells", () => {
    const normalized = service.normalizeVttMap(
      {
        id: "map-1",
        width: 640,
        height: 480,
        gridSize: 64,
        tokens: [],
        fogRects: [],
        terrainCells: [
          {
            id: "terrain-cell-1",
            terrainEffectId: "terrain.poison_cloud",
            x: 64,
            y: 0,
            width: 64,
            height: 64,
          },
        ],
      },
      "node-1",
    );

    expect(normalized.terrainCells).toEqual([
      expect.objectContaining({
        id: "terrain-cell-1",
        terrainEffectId: "terrain.poison_cloud",
      }),
    ]);
  });

  it("lets non-host players move tokens on maps with a detected hazard", () => {
    // Regression: a detected trap made the player-redacted hazard carry
    // detectionRadiusCells/detectionDc of 0. When the non-host client echoed
    // that map back, normalizeVttMap's `Number(x) || default` revived those
    // zeros as defaults, so ensurePlayerMapShellUnchanged saw a mismatched
    // shell and rejected every move with ForbiddenException.
    const baseline = service.normalizeVttMap(
      {
        id: "map-1",
        scenarioNodeId: "node-2",
        width: 640,
        height: 480,
        gridSize: 64,
        tokens: [],
        fogRects: [],
        objectCells: [
          {
            id: "trap-1",
            x: 128,
            y: 64,
            width: 64,
            height: 64,
            visibleToPlayers: false,
            hazard: {
              kind: "TRAP",
              armed: true,
              detectionRadiusCells: 3,
              detectionDc: 14,
              detectedBySessionCharacterIds: ["session-character-1"],
            },
          },
        ],
      },
      "node-2",
    );

    // The non-host client receives the redacted player map and echoes it
    // back through normalizeVttMap when it submits a token move.
    const playerMap = service.redactVttMapForPlayer(baseline);
    const echoedByClient = service.normalizeVttMap(playerMap, "node-2");

    expect(() =>
      service.ensurePlayerMapShellUnchanged(baseline, echoedByClient, false),
    ).not.toThrow();
  });

  it("keeps stale uncontrolled token positions from blocking another player move", async () => {
    const baseline = service.normalizeVttMap(
      {
        id: "map-1",
        scenarioNodeId: "node-2",
        width: 640,
        height: 480,
        gridSize: 64,
        tokens: [
          {
            id: "token-a",
            sessionCharacterId: "session-character-a",
            name: "A",
            x: 64,
            y: 0,
            size: 64,
          },
          {
            id: "token-b",
            sessionCharacterId: "session-character-b",
            name: "B",
            x: 0,
            y: 64,
            size: 64,
          },
        ],
        fogRects: [],
      },
      "node-2",
    );
    const requested = service.normalizeVttMap(
      {
        ...baseline,
        tokens: [
          {
            ...(baseline.tokens as Array<Record<string, unknown>>)[0],
            x: 0,
            y: 0,
          },
          {
            ...(baseline.tokens as Array<Record<string, unknown>>)[1],
            x: 64,
            y: 64,
          },
        ],
      },
      "node-2",
    );
    service.getVttMapBaseline = jest.fn().mockResolvedValue(baseline);
    service.getControlledSessionCharacterIds = jest
      .fn()
      .mockResolvedValue(new Set(["session-character-b"]));
    service.spendCombatMovement = jest.fn().mockResolvedValue(undefined);
    service.prisma = {
      combat: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    service.logger = {
      debug: jest.fn(),
      warn: jest.fn(),
    };

    const result = await service.applyPlayerVttMapUpdate(
      "user-b",
      "session-1",
      "session-scenario-1",
      { currentNodeId: "node-2", flagsJson: "{}" },
      requested,
      false,
    );

    expect(result.tokens).toEqual([
      expect.objectContaining({ id: "token-a", x: 64, y: 0 }),
      expect.objectContaining({ id: "token-b", x: 64, y: 64 }),
    ]);
  });

  it("adds newly revealed hidden object items to the investigating character inventory", async () => {
    const tx = {
      sessionScenarioNode: {
        findUnique: jest.fn().mockResolvedValue({ cluesJson: "[]" }),
      },
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "item.rope", name: "Rope", description: "50 feet of hempen rope." }]),
      },
      sessionReveal: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      inventoryEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const runtimeService = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      revealVttObjectContentsAtPoint: SessionsService["revealVttObjectContentsAtPoint"];
      getVttMapForSessionScenario: jest.Mock;
      refreshSessionInventorySnapshot: jest.Mock;
    };
    runtimeService.getVttMapForSessionScenario = jest.fn().mockResolvedValue({
      id: "map-1",
      scenarioNodeId: "node-1",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 480,
      tokens: [],
      fogRects: [],
      objectCells: [
        {
          id: "object-1",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: [],
          hiddenItemIds: ["item.rope"],
          hiddenEventIds: [],
        },
      ],
      updatedAt: "2026-05-19T00:00:00.000Z",
    });
    runtimeService.refreshSessionInventorySnapshot = jest.fn().mockResolvedValue(undefined);

    const result = await runtimeService.revealVttObjectContentsAtPoint({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      nodeId: "node-1",
      mapPoint: { x: 12, y: 12 },
      sessionCharacterId: "session-character-1",
    });

    expect(tx.inventoryEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          sessionCharacterId: "session-character-1",
          itemDefinitionId: "item.rope",
          quantity: 1,
        },
      ],
    });
    expect(runtimeService.refreshSessionInventorySnapshot).toHaveBeenCalledWith("session-character-1");
    expect(result.revealedItems).toEqual([
      { id: "item.rope", name: "Rope", quantity: 1, description: "50 feet of hempen rope." },
    ]);
  });

  it("grants hidden object items when a previous reveal exists without party inventory", async () => {
    const tx = {
      sessionScenarioNode: {
        findUnique: jest.fn().mockResolvedValue({ cluesJson: "[]" }),
      },
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "item.rope", name: "Rope", description: "50 feet of hempen rope." }]),
      },
      sessionReveal: {
        findMany: jest.fn().mockResolvedValue([{ contentId: "item.rope", contentKind: "item" }]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      inventoryEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const runtimeService = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      revealVttObjectContentsAtPoint: SessionsService["revealVttObjectContentsAtPoint"];
      getVttMapForSessionScenario: jest.Mock;
      refreshSessionInventorySnapshot: jest.Mock;
    };
    runtimeService.getVttMapForSessionScenario = jest.fn().mockResolvedValue({
      id: "map-1",
      scenarioNodeId: "node-1",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 480,
      tokens: [],
      fogRects: [],
      objectCells: [
        {
          id: "object-1",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: [],
          hiddenItemIds: ["item.rope"],
          hiddenEventIds: [],
        },
      ],
      updatedAt: "2026-05-19T00:00:00.000Z",
    });
    runtimeService.refreshSessionInventorySnapshot = jest.fn().mockResolvedValue(undefined);

    const result = await runtimeService.revealVttObjectContentsAtPoint({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      nodeId: "node-1",
      mapPoint: { x: 12, y: 12 },
      sessionCharacterId: "session-character-1",
    });

    expect(tx.sessionReveal.upsert).not.toHaveBeenCalled();
    expect(tx.inventoryEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          sessionCharacterId: "session-character-1",
          itemDefinitionId: "item.rope",
          quantity: 1,
        },
      ],
    });
    expect(result.count).toBe(1);
    expect(result.revealedItems).toEqual([
      { id: "item.rope", name: "Rope", quantity: 1, description: "50 feet of hempen rope." },
    ]);
  });

  it("does not require another investigation check after an object's hidden contents are exhausted", async () => {
    const prisma = {
      sessionReveal: {
        findMany: jest.fn().mockResolvedValue([
          { contentId: "clue-1", contentKind: "clue" },
          { contentId: "item.rope", contentKind: "item" },
        ]),
      },
      itemDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "item.rope" }]),
      },
      inventoryEntry: {
        findMany: jest.fn().mockResolvedValue([{ itemDefinitionId: "item.rope" }]),
      },
    };
    const runtimeService = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      describeVttObjectAtPoint: SessionsService["describeVttObjectAtPoint"];
      getVttMapForSessionScenario: jest.Mock;
    };
    runtimeService.getVttMapForSessionScenario = jest.fn().mockResolvedValue({
      id: "map-1",
      scenarioNodeId: "node-1",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 480,
      tokens: [],
      fogRects: [],
      objectCells: [
        {
          id: "object-1",
          name: "낡은 책상",
          description: "먼지가 쌓인 책상입니다.",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: ["clue-1"],
          hiddenItemIds: ["item.rope"],
          hiddenEventIds: [],
          revealChecks: [
            {
              contentId: "clue-1",
              requiresCheck: true,
              ability: "int",
              skill: "investigation",
              dc: 15,
            },
          ],
        },
      ],
      updatedAt: "2026-05-19T00:00:00.000Z",
    });

    const result = await runtimeService.describeVttObjectAtPoint({
      sessionId: "session-1",
      sessionScenarioId: "session-scenario-1",
      nodeId: "node-1",
      mapPoint: { x: 12, y: 12 },
    });

    expect(result).toEqual({ message: "여기에는 더 숨겨진 것이 없습니다." });
    expect(result?.checkOptions).toBeUndefined();
    expect(prisma.sessionReveal.findMany).toHaveBeenCalledWith({
      where: {
        sessionScenarioId: "session-scenario-1",
        scope: "party",
        recipientKey: "party",
        OR: [
          { contentId: "clue-1", contentKind: "clue" },
          { contentId: "item.rope", contentKind: "item" },
        ],
      },
      select: {
        contentId: true,
        contentKind: true,
      },
    });
  });

  it("blocks player token paths through terrain, walls, and closed doors", () => {
    const map = {
      width: 256,
      height: 64,
      gridSize: 64,
      terrainCells: [{ id: "rock", x: 64, y: 0, width: 64, height: 64 }],
      wallCells: [{ id: "wall", x: 128, y: 0, width: 64, height: 64 }],
      doorCells: [{ id: "door", x: 192, y: 0, width: 64, height: 64, state: "closed" }],
    };
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const toToken = { ...fromToken, x: 192 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).toThrow(
      ForbiddenException,
    );
  });

  it("allows player token paths through terrain effect cells", () => {
    const map = {
      width: 192,
      height: 64,
      gridSize: 64,
      terrainCells: [
        {
          id: "terrain-cell-1",
          terrainEffectId: "terrain.difficult",
          x: 64,
          y: 0,
          width: 64,
          height: 64,
        },
      ],
      wallCells: [],
      doorCells: [],
    };
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const toToken = { ...fromToken, x: 128 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).not.toThrow();
  });

  it("allows player token paths through open and broken doors", () => {
    const map = {
      width: 256,
      height: 64,
      gridSize: 64,
      terrainCells: [],
      wallCells: [],
      doorCells: [
        { id: "open-door", x: 64, y: 0, width: 64, height: 64, state: "open" },
        { id: "broken-door", x: 128, y: 0, width: 64, height: 64, state: "broken" },
      ],
    };
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const toToken = { ...fromToken, x: 192 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).not.toThrow();
  });

  it("lets a player token path past another token blocking the way", () => {
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const map = {
      width: 192,
      height: 64,
      gridSize: 64,
      terrainCells: [],
      wallCells: [],
      doorCells: [],
      // An ally token parked in the only corridor must not block the path.
      tokens: [fromToken, { id: "ally", x: 64, y: 0, size: 64, hidden: false }],
    };
    const toToken = { ...fromToken, x: 128 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).not.toThrow();
  });

  it("lets a player token move diagonally between blocked orthogonal cells", () => {
    const fromToken = { id: "token-1", x: 0, y: 0, size: 64 };
    const map = {
      width: 128,
      height: 128,
      gridSize: 64,
      terrainCells: [],
      // Both orthogonal neighbours are walled, leaving only the diagonal step.
      wallCells: [
        { id: "wall-right", x: 64, y: 0, width: 64, height: 64 },
        { id: "wall-down", x: 0, y: 64, width: 64, height: 64 },
      ],
      doorCells: [],
      tokens: [fromToken],
    };
    const toToken = { ...fromToken, x: 64, y: 64 };

    expect(() => service.ensureTokenPathIsReachable(map, fromToken, toToken)).not.toThrow();
  });
});

describe("SessionsService legacy VTT map updates", () => {
  it("redacts GM-only map data for the host in AI GM sessions", async () => {
    const prisma = {
      gameState: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new SessionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const gmMap = {
      id: "map-1",
      scenarioNodeId: "node-exploration",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 640,
      tokens: [
        { id: "visible-token", name: "Visible", x: 0, y: 0, size: 64, hidden: false },
        { id: "hidden-token", name: "Hidden", x: 64, y: 0, size: 64, hidden: true },
      ],
      fogRects: [],
      objectCells: [
        {
          id: "visible-object",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: true,
          hiddenClueIds: ["clue-1"],
          hiddenItemIds: ["item-1"],
          hiddenEventIds: ["event-1"],
        },
        {
          id: "hidden-object",
          x: 128,
          y: 0,
          width: 64,
          height: 64,
          visibleToPlayers: false,
          hiddenClueIds: ["clue-2"],
        },
      ],
      updatedAt: "2026-05-22T00:00:00.000Z",
    };

    jest.spyOn(service, "getSessionEntityOrThrow").mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
      gmMode: "AI",
      gmUserId: null,
    } as never);
    jest.spyOn(service, "ensureMembership").mockResolvedValue(undefined);
    jest.spyOn(service, "getGameStateEntityOrThrow").mockResolvedValue({
      state: {
        currentNodeId: "node-exploration",
        flagsJson: JSON.stringify({ vttMap: gmMap }),
      },
      sessionScenario: { id: "session-scenario-1" },
    } as never);
    (
      service as unknown as {
        applyScenarioStartingPositions: jest.Mock;
      }
    ).applyScenarioStartingPositions = jest.fn().mockResolvedValue(gmMap);

    const result = await service.getVttMapForUser("host-user", "session-1");

    expect(result.tokens).toEqual([
      expect.objectContaining({ id: "visible-token", hidden: false }),
    ]);
    expect(result.objectCells).toEqual([
      expect.objectContaining({
        id: "visible-object",
        hiddenClueIds: [],
        hiddenItemIds: [],
        hiddenEventIds: [],
      }),
    ]);
  });

  it("ignores non-host whole-map writes and returns the canonical player map", async () => {
    const service = new SessionsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const canonicalPlayerMap = {
      id: "canonical-map",
      scenarioNodeId: "node-exploration",
      imageUrl: null,
      gridType: "square",
      gridSize: 64,
      width: 640,
      height: 640,
      tokens: [],
      fogRects: [],
      objectCells: [],
      updatedAt: "2026-05-22T00:00:00.000Z",
    };

    jest.spyOn(service, "getSessionEntityOrThrow").mockResolvedValue({
      id: "session-1",
      hostUserId: "host-user",
    } as never);
    jest.spyOn(service, "ensureMembership").mockResolvedValue(undefined);
    jest.spyOn(service, "getGameStateEntityOrThrow").mockResolvedValue({
      state: {
        currentNodeId: "node-exploration",
        flagsJson: "{}",
      },
      sessionScenario: { id: "session-scenario-1" },
    } as never);
    jest.spyOn(service, "getVttMapForUser").mockResolvedValue(canonicalPlayerMap as never);

    await expect(
      service.updateVttMap("player-user", "session-1", {
        map: {
          ...canonicalPlayerMap,
          id: "stale-client-map",
          tokens: [{ id: "someone-else", x: 0, y: 0, size: 64 }],
        } as never,
      }),
    ).resolves.toBe(canonicalPlayerMap);
  });
});
