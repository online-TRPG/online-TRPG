import { Injectable } from "@nestjs/common";
import {
  AiNpcDialogueRequestDto,
  MainCommandResponseDto,
  MainCommandStatus,
  MainCommandTargetType,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { AiService } from "../ai/ai.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandSceneEntityService } from "./main-command-scene-entity.service";
import type { VisibleSceneEntity } from "./main-command-scene-entity.service";

@Injectable()
export class MainCommandNpcDialogueService {
  constructor(
    private readonly aiService: AiService,
    private readonly mainCommandSceneEntity: MainCommandSceneEntityService,
  ) {}

  async handleNpcDialogue(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const npc = this.mainCommandSceneEntity.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC,
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "대화할 NPC를 지정하지 않았습니다. 화면에 보이는 NPC를 분명히 적어주세요.",
      };
    }

    const aiRequest: AiNpcDialogueRequestDto = {
      npcEntityId: npc.id,
      npcName: npc.name,
      npcSummary: npc.summary,
      disposition: npc.disposition,
      sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
      recentContext: recentLogs.slice(0, 6),
      dialogueIntent: dto.playerText,
      audienceIds: [context.actorCharacterId],
    };

    const result = await this.aiService.runNpcDialogue(userId, context.sessionId, aiRequest, {
      emitChatMessage: false,
    });

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${npc.name}: ${result.parsed.dialogue}`,
      data: {
        npcDialogue: {
          npcId: npc.id,
          speakerName: npc.name,
        },
      },
    };
  }
}
