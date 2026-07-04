import { Injectable } from "@nestjs/common";
import {
  MAIN_COMMAND_CHECK_EFFECT_TYPES,
  getPrimaryMainCommandCheckOption,
  MainCommandActionCandidateDto,
  MainCommandNarrativeCheckEffectDto,
  MainCommandResponseDto,
  MainCommandStatus,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import type { LoadedContext } from "./main-commands.service";
import type { VisibleSceneEntity } from "./main-command-scene-entity.service";

@Injectable()
export class MainCommandCheckEffectAttachmentService {
  buildActionCandidate(context: LoadedContext, dto: SubmitMainCommandDto, actionSummary: string): MainCommandActionCandidateDto {
    return {
      actorId: context.actorCharacterId,
      targetId: dto.targetId ?? null,
      actionSummary,
      declaredMethod: dto.playerText,
    };
  }

  attachMainCommandCheckEffect(
    response: MainCommandResponseDto,
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    publicClues: string[],
  ): MainCommandResponseDto {
    if (response.status !== MainCommandStatus.CHECK_REQUIRED) {
      return response;
    }

    const data = response.data ?? {};
    if (data.checkEffect) {
      return response;
    }

    const target = dto.targetId ? visibleEntities.find((entity) => entity.id === dto.targetId) : null;
    const item = dto.itemId ? context.inventoryItems.find((entry) => entry.id === dto.itemId) : null;
    const effect: MainCommandNarrativeCheckEffectDto = {
      type: MAIN_COMMAND_CHECK_EFFECT_TYPES.MAIN_COMMAND_CHECK,
      requestId,
      nodeId: context.currentNodeId,
      sessionCharacterId: context.sessionCharacterId,
      intent: dto.intent,
      screenType: dto.screenType,
      playerText: dto.playerText,
      actionSummary: response.actionCandidate?.actionSummary ?? dto.playerText,
      targetId: dto.targetId ?? null,
      targetName: target?.name ?? null,
      targetSummary: target?.summary ?? null,
      targetDisposition: target?.disposition ?? null,
      itemId: dto.itemId ?? null,
      itemName: item?.name ?? null,
      mapPoint: dto.mapPoint ?? null,
      checkOption: getPrimaryMainCommandCheckOption(response),
      visibleEntityNames: visibleEntities.map((entity) => entity.name),
      publicClues,
      sceneText: context.currentNodeSceneText,
      actionCandidate: response.actionCandidate ?? null,
    };

    return {
      ...response,
      data: {
        ...data,
        checkEffect: effect,
      },
    };
  }
}
