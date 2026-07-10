import { Injectable } from "@nestjs/common";
import type {
  CampaignArchiveResponseDto,
  CompleteCampaignDto,
} from "@trpg/shared-types";
import { randomUUID } from "crypto";
import { CampaignArchiveRuntimeService } from "./campaign-archive-runtime.service";

type CampaignArchiveSessionCharacter = {
  id: string;
  characterId: string;
  userId: string;
  status: string;
  inventorySnapshotJson?: string | null;
  character: {
    name: string;
    className: string;
    subclassName?: string | null;
    level: number;
    inventoryJson?: string | null;
  };
};

@Injectable()
export class SessionCampaignArchiveBuilderService {
  constructor(private readonly campaignArchiveRuntime: CampaignArchiveRuntimeService) {}

  buildArchive(params: {
    session: {
      id: string;
      title: string;
    };
    activeScenario: {
      scenarioId: string;
      scenario?: {
        title?: string | null;
        attribution?: string | null;
      } | null;
    };
    state: {
      version: number;
      currentNodeId?: string | null;
    };
    flags: Record<string, unknown>;
    dto: CompleteCampaignDto;
    completedByUserId: string;
    sessionCharacters: CampaignArchiveSessionCharacter[];
    turnLogCount: number;
    combatCount: number;
    nodeVisitCount: number;
    createId?: () => string;
    now?: () => Date;
  }): CampaignArchiveResponseDto {
    const createId = params.createId ?? randomUUID;
    const now = params.now ?? (() => new Date());
    const completedAt = now().toISOString();

    return {
      archiveId: `campaign-archive:${createId()}`,
      sessionId: params.session.id,
      sessionTitle: params.session.title,
      scenarioId: params.activeScenario.scenarioId,
      scenarioTitle: params.activeScenario.scenario?.title ?? null,
      completedAt,
      completedByUserId: params.completedByUserId,
      epilogue: params.dto.epilogue.trim(),
      shareScope: params.dto.shareScope ?? "party",
      allowCharacterTransfer: params.dto.allowCharacterTransfer ?? true,
      finalNodeId: params.dto.finalNodeId?.trim() || params.state.currentNodeId || null,
      finalRewardIds: this.normalizeRewardIds(params.dto.finalRewardIds),
      characters: params.sessionCharacters.map((entry) => ({
        sessionCharacterId: entry.id,
        characterId: entry.characterId,
        userId: entry.userId,
        name: entry.character.name,
        className: entry.character.className,
        subclassName: entry.character.subclassName ?? null,
        level: entry.character.level,
        status: entry.status,
      })),
      analytics: {
        turnLogCount: params.turnLogCount,
        combatCount: params.combatCount,
        completedDowntimeTaskCount: this.campaignArchiveRuntime.countCompletedDowntimeTasks(params.flags),
        nodeVisitCount: params.nodeVisitCount,
        sessionCharacterCount: params.sessionCharacters.length,
      },
      snapshot: this.campaignArchiveRuntime.buildCampaignArchiveSnapshot({
        flags: params.flags,
        stateVersion: params.state.version,
        currentNodeId: params.state.currentNodeId ?? null,
        sessionCharacters: params.sessionCharacters,
        turnLogCount: params.turnLogCount,
        combatCount: params.combatCount,
        nodeVisitCount: params.nodeVisitCount,
        scenarioAttribution: params.activeScenario.scenario?.attribution ?? null,
      }),
    };
  }

  private normalizeRewardIds(rewardIds: string[] | undefined): string[] {
    return Array.from(
      new Set((rewardIds ?? []).flatMap((id) => {
        const trimmed = id.trim();
        return trimmed ? [trimmed] : [];
      })),
    ).slice(0, 20);
  }
}
