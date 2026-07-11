import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  ActionQueueStatus as PrismaActionQueueStatus,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import { SessionDetailResponseDto, SessionSnapshotDto } from "@trpg/shared-types";
import {
  mapGameState,
  mapParticipant,
  mapScenarioSummary,
  mapSession,
  mapSessionCharacter,
  mapSessionScenario,
  mapUser,
} from "../../common/mappers/domain.mapper";
import type { PrismaQueryMetrics } from "../../database/prisma.service";
import { getRestApprovalCutoff, getRestApprovalExpiresAt } from "../actions/rest-approval-policy";
import type { SessionsService } from "./sessions.service";

type SessionSnapshotRuntime = ReturnType<SessionsService["createSessionSnapshotRuntime"]>;
type SnapshotRowCounts = Record<string, number>;

@Injectable()
export class SessionSnapshotService {
  private readonly logger = new Logger(SessionSnapshotService.name);

  async buildSnapshot(runtime: SessionSnapshotRuntime, sessionId: string): Promise<SessionSnapshotDto> {
    const startedAt = performance.now();
    let prismaOperationCount = 1;
    const sessionMeasurement = await runtime.prisma.measureQueries(() =>
      runtime.prisma.session.findFirst({
        where: {
          OR: [{ id: sessionId }, { publicId: sessionId }],
        },
        include: {
          participants: {
            where: { status: PrismaParticipantStatus.JOINED },
            include: {
              user: true,
              sessionCharacter: {
                select: {
                  id: true,
                  characterId: true,
                },
              },
            },
            orderBy: { joinedAt: "asc" },
          },
          sessionCharacters: {
            where: {
              status: PrismaSessionCharacterStatus.ACTIVE,
            },
            include: {
              character: true,
              resource: true,
              inventoryEntries: {
                include: { itemDefinition: true },
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          sessionScenarios: {
            include: {
              scenario: true,
              gameState: true,
            },
            orderBy: { sequence: "asc" },
          },
        },
      }),
    );
    const session = sessionMeasurement.result;
    let queryMetrics = sessionMeasurement.metrics;

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} was not found.`);
    }

    const resolvedSessionId = session.id;
    if (!session.publicId) prismaOperationCount += 1;
    const publicIdMeasurement = await runtime.prisma.measureQueries(() =>
      runtime.ensureSessionPublicId(session),
    );
    const ensuredSession = publicIdMeasurement.result;
    queryMetrics = this.mergeQueryMetrics(queryMetrics, publicIdMeasurement.metrics);
    const activeScenario = runtime.getActiveSessionScenario(session.sessionScenarios);
    if (!activeScenario?.gameState) {
      throw new NotFoundException(`Game state for session ${resolvedSessionId} was not found.`);
    }
    const pendingMeasurement = await runtime.prisma.measureQueries(() =>
      this.loadPendingRestApprovals(runtime, resolvedSessionId),
    );
    const pending = pendingMeasurement.result;
    prismaOperationCount += pending.prismaOperationCount;
    queryMetrics = this.mergeQueryMetrics(queryMetrics, pendingMeasurement.metrics);

    const snapshot = {
      session: mapSession(ensuredSession),
      sessionScenarios: ensuredSession.sessionScenarios.map(mapSessionScenario),
      participants: ensuredSession.participants.map(mapParticipant),
      sessionCharacters: ensuredSession.sessionCharacters.map(mapSessionCharacter),
      state: mapGameState(activeScenario.gameState, resolvedSessionId),
      pendingRestApprovals: pending.items,
    };
    this.logSnapshotMetrics(
      "snapshot",
      resolvedSessionId,
      startedAt,
      prismaOperationCount,
      queryMetrics,
      this.buildSnapshotRowCounts(ensuredSession, pending.rowCounts),
      snapshot,
    );
    return snapshot;
  }

  async buildPendingRestApprovals(runtime: SessionSnapshotRuntime, sessionId: string): Promise<NonNullable<SessionSnapshotDto["pendingRestApprovals"]>> {
    return (await this.loadPendingRestApprovals(runtime, sessionId)).items;
  }

  private async loadPendingRestApprovals(
    runtime: SessionSnapshotRuntime,
    sessionId: string,
  ): Promise<{
    items: NonNullable<SessionSnapshotDto["pendingRestApprovals"]>;
    prismaOperationCount: number;
    rowCounts: SnapshotRowCounts;
  }> {
    let prismaOperationCount = 1;
    const actions = await runtime.prisma.playerAction.findMany({
      where: {
        sessionId,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
        clientCreatedAt: { gt: getRestApprovalCutoff() },
      },
      orderBy: { clientCreatedAt: "asc" },
    });
    const requesterUserIds = Array.from(new Set(actions.map((action) => action.userId)));
    const sessionCharacterIds = Array.from(
      new Set(actions.flatMap((action) => (action.sessionCharacterId ? [action.sessionCharacterId] : []))),
    );
    if (requesterUserIds.length) prismaOperationCount += 1;
    if (sessionCharacterIds.length) prismaOperationCount += 1;
    const [requesters, sessionCharacters] = await Promise.all([
      requesterUserIds.length
        ? runtime.prisma.user.findMany({
            where: { id: { in: requesterUserIds } },
            select: { id: true, displayName: true },
          })
        : [],
      sessionCharacterIds.length
        ? runtime.prisma.sessionCharacter.findMany({
            where: { id: { in: sessionCharacterIds } },
            select: {
              id: true,
              character: {
                select: { name: true },
              },
            },
          })
        : [],
    ]);
    const requesterById = new Map(requesters.map((user) => [user.id, user]));
    const sessionCharacterById = new Map(sessionCharacters.map((sessionCharacter) => [sessionCharacter.id, sessionCharacter]));

    const items = actions
      .filter((action) => action.rawText.trim().toLowerCase().startsWith("/rest "))
      .map((action) => ({
        actionId: action.id,
        restType: this.resolveRestTypeFromRawText(runtime, action.rawText),
        hitDiceToSpend: this.resolveRestHitDiceFromRawText(runtime, action.rawText),
        requesterUserId: action.userId,
        requesterDisplayName: requesterById.get(action.userId)?.displayName ?? action.userId,
        sessionCharacterId: action.sessionCharacterId,
        characterName: action.sessionCharacterId ? (sessionCharacterById.get(action.sessionCharacterId)?.character.name ?? null) : null,
        requestedAt: action.clientCreatedAt.toISOString(),
        expiresAt: getRestApprovalExpiresAt(action.clientCreatedAt).toISOString(),
      }));
    return {
      items,
      prismaOperationCount,
      rowCounts: {
        pendingActionRows: actions.length,
        pendingRequesterRows: requesters.length,
        pendingSessionCharacterRows: sessionCharacters.length,
      },
    };
  }

  resolveRestTypeFromRawText(runtime: SessionSnapshotRuntime, rawText: string): "short" | "long" | null {
    const normalized = rawText.trim().toLowerCase();
    if (normalized.startsWith("/rest short")) {
      return "short";
    }
    if (normalized.startsWith("/rest long")) {
      return "long";
    }
    return null;
  }

  resolveRestHitDiceFromRawText(runtime: SessionSnapshotRuntime, rawText: string): number | null {
    const match = rawText
      .trim()
      .toLowerCase()
      .match(/^\/rest\s+short\s+(\d+)/);
    if (!match) {
      return null;
    }
    const value = Number.parseInt(match[1] ?? "", 10);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  async buildDetail(runtime: SessionSnapshotRuntime, sessionId: string): Promise<SessionDetailResponseDto> {
    const startedAt = performance.now();
    let prismaOperationCount = 1;
    const sessionMeasurement = await runtime.prisma.measureQueries(() =>
      runtime.prisma.session.findFirst({
        where: {
          OR: [{ id: sessionId }, { publicId: sessionId }],
        },
        include: {
          host: true,
          participants: {
            where: { status: PrismaParticipantStatus.JOINED },
            include: {
              user: true,
              sessionCharacter: {
                select: {
                  id: true,
                  characterId: true,
                },
              },
            },
            orderBy: { joinedAt: "asc" },
          },
          sessionCharacters: {
            where: {
              status: PrismaSessionCharacterStatus.ACTIVE,
            },
            include: {
              character: true,
              resource: true,
              inventoryEntries: {
                include: { itemDefinition: true },
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          sessionScenarios: {
            include: {
              scenario: true,
              gameState: true,
            },
            orderBy: { sequence: "asc" },
          },
        },
      }),
    );
    const session = sessionMeasurement.result;
    let queryMetrics = sessionMeasurement.metrics;

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} was not found.`);
    }

    const resolvedSessionId = session.id;
    if (!session.publicId) prismaOperationCount += 1;
    const publicIdMeasurement = await runtime.prisma.measureQueries(() =>
      runtime.ensureSessionPublicId(session),
    );
    const ensuredSession = publicIdMeasurement.result;
    queryMetrics = this.mergeQueryMetrics(queryMetrics, publicIdMeasurement.metrics);
    const activeScenario = runtime.getActiveSessionScenario(ensuredSession.sessionScenarios);
    if (!activeScenario?.gameState) {
      throw new NotFoundException(`Game state for session ${resolvedSessionId} was not found.`);
    }
    const pendingMeasurement = await runtime.prisma.measureQueries(() =>
      this.loadPendingRestApprovals(runtime, resolvedSessionId),
    );
    const pending = pendingMeasurement.result;
    prismaOperationCount += pending.prismaOperationCount;
    queryMetrics = this.mergeQueryMetrics(queryMetrics, pendingMeasurement.metrics);

    const detail = {
      session: mapSession(ensuredSession),
      sessionScenarios: ensuredSession.sessionScenarios.map(mapSessionScenario),
      participants: ensuredSession.participants.map(mapParticipant),
      sessionCharacters: ensuredSession.sessionCharacters.map(mapSessionCharacter),
      state: mapGameState(activeScenario.gameState, resolvedSessionId),
      scenario: mapScenarioSummary(activeScenario.scenario),
      host: mapUser(ensuredSession.host),
      owner: mapUser(ensuredSession.host),
      pendingRestApprovals: pending.items,
      captain: null,
    };
    this.logSnapshotMetrics(
      "detail",
      resolvedSessionId,
      startedAt,
      prismaOperationCount,
      queryMetrics,
      this.buildSnapshotRowCounts(ensuredSession, {
        ...pending.rowCounts,
        hostRows: 1,
      }),
      detail,
    );
    return detail;
  }

  private logSnapshotMetrics(
    kind: "snapshot" | "detail",
    sessionId: string,
    startedAt: number,
    prismaOperationCount: number,
    queryMetrics: PrismaQueryMetrics | null,
    rowCounts: SnapshotRowCounts,
    payload: SessionSnapshotDto | SessionDetailResponseDto,
  ): void {
    if (process.env.PERFORMANCE_DIAGNOSTICS !== "1") return;
    this.logger.debug({
      event: "session_snapshot_built",
      kind,
      sessionId,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
      prismaOperationCount,
      dbQueryCount: queryMetrics?.count ?? null,
      dbDurationMs: queryMetrics?.durationMs ?? null,
      jsonBytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
      participantCount: payload.participants.length,
      characterCount: payload.sessionCharacters.length,
      scenarioCount: payload.sessionScenarios.length,
      pendingRestApprovalCount: payload.pendingRestApprovals?.length ?? 0,
      returnedModelRowCount: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
      rowCounts,
    });
  }

  private mergeQueryMetrics(
    current: PrismaQueryMetrics | null,
    next: PrismaQueryMetrics | null,
  ): PrismaQueryMetrics | null {
    if (!current && !next) return null;
    return {
      count: (current?.count ?? 0) + (next?.count ?? 0),
      durationMs: Number(((current?.durationMs ?? 0) + (next?.durationMs ?? 0)).toFixed(3)),
    };
  }

  private buildSnapshotRowCounts(
    session: {
      participants: Array<{ sessionCharacter: unknown | null }>;
      sessionCharacters: Array<{
        character: unknown;
        resource: unknown | null;
        inventoryEntries: Array<{ itemDefinition: unknown }>;
      }>;
      sessionScenarios: Array<{ scenario: unknown; gameState: unknown | null }>;
    },
    pendingRowCounts: SnapshotRowCounts,
  ): SnapshotRowCounts {
    const inventoryEntryRows = session.sessionCharacters.reduce(
      (count, character) => count + character.inventoryEntries.length,
      0,
    );
    return {
      sessionRows: 1,
      participantRows: session.participants.length,
      participantUserRows: session.participants.length,
      participantAssignmentRows: session.participants.filter(
        (participant) => participant.sessionCharacter,
      ).length,
      sessionCharacterRows: session.sessionCharacters.length,
      characterRows: session.sessionCharacters.length,
      resourceRows: session.sessionCharacters.filter((character) => character.resource).length,
      inventoryEntryRows,
      itemDefinitionRows: inventoryEntryRows,
      sessionScenarioRows: session.sessionScenarios.length,
      scenarioRows: session.sessionScenarios.length,
      gameStateRows: session.sessionScenarios.filter((scenario) => scenario.gameState).length,
      ...pendingRowCounts,
    };
  }
}
