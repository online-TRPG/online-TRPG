import { Injectable } from "@nestjs/common";
import {
  ParticipantRole as PrismaParticipantRole,
  Prisma,
  SessionScenarioStatus as PrismaSessionScenarioStatus,
} from "@prisma/client";
import { ParticipantRole, SessionListItemResponseDto } from "@trpg/shared-types";
import {
  mapScenarioSummary,
  mapSession,
  mapUser,
} from "../../common/mappers/domain.mapper";

const participantRoleToApi: Record<PrismaParticipantRole, ParticipantRole> = {
  [PrismaParticipantRole.HOST]: ParticipantRole.HOST,
  [PrismaParticipantRole.GM]: ParticipantRole.GM,
  [PrismaParticipantRole.PLAYER]: ParticipantRole.PLAYER,
  [PrismaParticipantRole.SPECTATOR]: ParticipantRole.SPECTATOR,
};

type SessionListSource = Prisma.SessionGetPayload<{
  include: {
    host: true;
    participants: true;
    sessionScenarios: {
      include: {
        scenario: { include: { publication: true } };
        gameState: true;
      };
    };
  };
}> & { publicId: string };

@Injectable()
export class SessionListItemService {
  build(
    session: SessionListSource,
    requesterUserId?: string,
    currentSceneTitleBySessionId: ReadonlyMap<string, string> = new Map(),
  ): SessionListItemResponseDto | null {
    const activeScenario = this.getActiveSessionScenario(session.sessionScenarios);
    if (!activeScenario) {
      return null;
    }

    return {
      session: mapSession(session),
      scenario: mapScenarioSummary(activeScenario.scenario),
      host: mapUser(session.host),
      owner: mapUser(session.host),
      participantCount: session.participants.length,
      availableSlots: Math.max(session.maxParticipants - session.participants.length, 0),
      role: this.getParticipantRoleForUser(session.participants, requesterUserId),
      currentSceneTitle: currentSceneTitleBySessionId.get(session.id) ?? null,
      lastActivityAt: session.updatedAt.toISOString(),
    };
  }

  buildMany(
    sessions: SessionListSource[],
    requesterUserId?: string,
    currentSceneTitleBySessionId: ReadonlyMap<string, string> = new Map(),
  ): SessionListItemResponseDto[] {
    return sessions
      .flatMap((session) => {
        const item = this.build(session, requesterUserId, currentSceneTitleBySessionId);
        return item ? [item] : [];
      });
  }

  private getActiveSessionScenario<T extends { status: PrismaSessionScenarioStatus }>(
    sessionScenarios: T[],
  ): T | null {
    return sessionScenarios.find((candidate) => candidate.status === PrismaSessionScenarioStatus.ACTIVE) ?? sessionScenarios[0] ?? null;
  }

  private getParticipantRoleForUser(
    participants: Array<{ userId: string; role: PrismaParticipantRole }>,
    userId: string | undefined,
  ): ParticipantRole | undefined {
    if (!userId) {
      return undefined;
    }

    const participant = participants.find((candidate) => candidate.userId === userId);
    return participant ? participantRoleToApi[participant.role] : undefined;
  }
}
