import { Injectable } from "@nestjs/common";
import type { CampaignArchiveResponseDto } from "@trpg/shared-types";
import { P6_CAMPAIGN_ARCHIVE_FLAG } from "./campaign-archive-runtime.service";

@Injectable()
export class SessionCampaignArchiveFlagStoreService {
  buildCompletionFlags(
    flags: Record<string, unknown>,
    archive: CampaignArchiveResponseDto,
  ): Record<string, unknown> {
    return {
      ...flags,
      sessionCompletedAt: archive.completedAt,
      completedNodeId: archive.finalNodeId,
      completionReason: "p6_long_campaign_archive",
      [P6_CAMPAIGN_ARCHIVE_FLAG]: archive,
    };
  }
}
