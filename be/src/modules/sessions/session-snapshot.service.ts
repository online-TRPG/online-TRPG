import { Injectable, NotFoundException } from "@nestjs/common";
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
import { getRestApprovalCutoff, getRestApprovalExpiresAt } from "../actions/rest-approval-policy";
import type { SessionsService } from "./sessions.service";

type SessionSnapshotRuntime = ReturnType<SessionsService["createSessionSnapshotRuntime"]>;

@Injectable()
export class SessionSnapshotService {
  async buildSnapshot(runtime: SessionSnapshotRuntime, sessionId: string): Promise<SessionSnapshotDto> {
    const resolvedSessionId = (await runtime.getSessionEntityOrThrow(sessionId)).id;
    const session = await runtime.prisma.session.findUnique({
      where: { id: resolvedSessionId },
      include: {
        participants: {
          where: { status: PrismaParticipantStatus.JOINED },
          include: {
            user: true,
            sessionCharacter: {
              include: {
                character: true,
                resource: true,
                inventoryEntries: {
                  include: { itemDefinition: true },
                  orderBy: { createdAt: "asc" },
                },
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
    });

    if (!session) {
      throw new NotFoundException(`Session ${resolvedSessionId} was not found.`);
    }

    const ensuredSession = await runtime.ensureSessionPublicId(session);
    const activeScenario = runtime.getActiveSessionScenario(session.sessionScenarios);
    if (!activeScenario?.gameState) {
      throw new NotFoundException(`Game state for session ${resolvedSessionId} was not found.`);
    }
    const pendingRestApprovals = await this.buildPendingRestApprovals(runtime, resolvedSessionId);

    return {
      session: mapSession(ensuredSession),
      sessionScenarios: ensuredSession.sessionScenarios.map(mapSessionScenario),
      participants: ensuredSession.participants.map(mapParticipant),
      sessionCharacters: ensuredSession.sessionCharacters.map(mapSessionCharacter),
      state: mapGameState(activeScenario.gameState, resolvedSessionId),
      pendingRestApprovals,
    };
  }

  async buildPendingRestApprovals(runtime: SessionSnapshotRuntime, sessionId: string): Promise<NonNullable<SessionSnapshotDto["pendingRestApprovals"]>> {
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
    const sessionCharacterIds = Array.from(new Set(actions.map((action) => action.sessionCharacterId).filter((id): id is string => Boolean(id))));
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

    return actions
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
    const resolvedSessionId = (await runtime.getSessionEntityOrThrow(sessionId)).id;
    const session = await runtime.prisma.session.findUnique({
      where: { id: resolvedSessionId },
      include: {
        host: true,
        participants: {
          where: { status: PrismaParticipantStatus.JOINED },
          include: {
            user: true,
            sessionCharacter: {
              include: {
                character: true,
                resource: true,
                inventoryEntries: {
                  include: { itemDefinition: true },
                  orderBy: { createdAt: "asc" },
                },
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
    });

    if (!session) {
      throw new NotFoundException(`Session ${resolvedSessionId} was not found.`);
    }

    const ensuredSession = await runtime.ensureSessionPublicId(session);
    const ensuredHost = await runtime.usersService.getUserEntityOrThrow(session.hostUserId);
    const activeScenario = runtime.getActiveSessionScenario(ensuredSession.sessionScenarios);
    if (!activeScenario?.gameState) {
      throw new NotFoundException(`Game state for session ${resolvedSessionId} was not found.`);
    }
    const pendingRestApprovals = await this.buildPendingRestApprovals(runtime, resolvedSessionId);

    return {
      session: mapSession(ensuredSession),
      sessionScenarios: ensuredSession.sessionScenarios.map(mapSessionScenario),
      participants: ensuredSession.participants.map(mapParticipant),
      sessionCharacters: ensuredSession.sessionCharacters.map(mapSessionCharacter),
      state: mapGameState(activeScenario.gameState, resolvedSessionId),
      scenario: mapScenarioSummary(activeScenario.scenario),
      host: mapUser(ensuredHost),
      owner: mapUser(ensuredHost),
      pendingRestApprovals,
      captain: null,
    };
  }
}
