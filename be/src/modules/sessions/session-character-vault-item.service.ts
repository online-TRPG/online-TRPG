import { Injectable } from "@nestjs/common";
import {
  SessionScenarioStatus as PrismaSessionScenarioStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import type { CharacterVaultItemDto } from "@trpg/shared-types";
import { CampaignArchiveRuntimeService } from "./campaign-archive-runtime.service";

type CharacterVaultAssignment = {
  id: string;
  sessionId: string;
  characterId: string;
  status: PrismaSessionCharacterStatus;
  character: {
    name: string;
    className: string;
    subclassName?: string | null;
    level: number;
  };
  session: {
    title: string;
    sessionScenarios: Array<{
      status: PrismaSessionScenarioStatus;
      gameState?: { flagsJson?: string | null } | null;
    }>;
  };
};

@Injectable()
export class SessionCharacterVaultItemService {
  constructor(private readonly campaignArchiveRuntime: CampaignArchiveRuntimeService) {}

  buildMany(assignments: CharacterVaultAssignment[]): CharacterVaultItemDto[] {
    return assignments.flatMap((assignment) => {
      const scenario = this.selectActiveScenario(assignment.session.sessionScenarios);
      const archive = this.campaignArchiveRuntime.parseCampaignArchive(
        this.parseJson<Record<string, unknown>>(scenario?.gameState?.flagsJson, {}),
      );
      if (!archive) {
        return [];
      }
      return [{
        sourceSessionCharacterId: assignment.id,
        sourceSessionId: assignment.sessionId,
        sourceSessionTitle: assignment.session.title,
        archiveId: archive.archiveId,
        archivedAt: archive.completedAt,
        characterId: assignment.characterId,
        name: assignment.character.name,
        className: assignment.character.className,
        subclassName: assignment.character.subclassName ?? null,
        level: assignment.character.level,
        status: assignment.status,
        transferable: archive.allowCharacterTransfer,
      }];
    });
  }

  private selectActiveScenario<T extends { status: PrismaSessionScenarioStatus }>(sessionScenarios: T[]): T | null {
    return sessionScenarios.find((candidate) => candidate.status === PrismaSessionScenarioStatus.ACTIVE) ?? sessionScenarios[0] ?? null;
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
  }
}
