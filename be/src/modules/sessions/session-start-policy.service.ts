import { ConflictException, Injectable } from "@nestjs/common";
import {
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { CampaignArchiveRuntimeService } from "./campaign-archive-runtime.service";

type SessionStartParticipant = {
  userId: string;
  role: PrismaParticipantRole;
  isReady: boolean;
  sessionCharacter?: {
    character: {
      name: string;
      level: number;
    };
  } | null;
};

type SessionStartScenario = {
  title?: string | null;
  startLevel?: number | null;
  recommendedEndLevel?: number | null;
};

@Injectable()
export class SessionStartPolicyService {
  constructor(private readonly campaignArchiveRuntime: CampaignArchiveRuntimeService) {}

  ensureCanStart(params: {
    session: {
      status: PrismaSessionStatus;
      hostUserId: string;
      gmMode: PrismaGmMode;
      gmUserId?: string | null;
    };
    participants: SessionStartParticipant[];
    scenario: SessionStartScenario;
  }): void {
    if (params.session.status !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Only recruiting sessions can be started.");
    }

    if (!params.participants.length) {
      throw new ConflictException("At least one participant is required to start the session.");
    }

    const playerParticipants = params.participants.filter((participant) => participant.role !== PrismaParticipantRole.GM);
    if (params.session.gmMode === PrismaGmMode.HUMAN) {
      const gmUserId = params.session.gmUserId ?? params.session.hostUserId;
      const gmParticipant = params.participants.find(
        (participant) => participant.userId === gmUserId && participant.role === PrismaParticipantRole.GM,
      );
      if (!gmParticipant) {
        throw new ConflictException("A HUMAN GM session requires a joined GM participant.");
      }
    }

    if (!playerParticipants.length) {
      throw new ConflictException("At least one player is required to start the session.");
    }

    const participantWithoutCharacter = playerParticipants.find((participant) => !participant.sessionCharacter);
    if (participantWithoutCharacter) {
      throw new ConflictException("All players must select a character before the session starts.");
    }

    for (const participant of playerParticipants) {
      const character = participant.sessionCharacter?.character;
      if (character) {
        this.campaignArchiveRuntime.ensureCharacterMatchesScenarioLevel({
          characterName: character.name,
          characterLevel: character.level,
          scenario: params.scenario,
        });
      }
    }

    const participantNotReady = playerParticipants.find((participant) => !participant.isReady);
    if (participantNotReady) {
      throw new ConflictException("All players must be ready before the session starts.");
    }
  }
}
