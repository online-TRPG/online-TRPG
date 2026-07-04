import { Injectable } from "@nestjs/common";
import { SubmitMainCommandDto } from "@trpg/shared-types";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandSceneEntityService } from "./main-command-scene-entity.service";
import type { VisibleSceneEntity } from "./main-command-scene-entity.service";

@Injectable()
export class MainCommandInterpreterPayloadService {
  constructor(private readonly mainCommandSceneEntity: MainCommandSceneEntityService) {}

  buildInterpreterPayload(context: LoadedContext, dto: SubmitMainCommandDto, visibleEntities: VisibleSceneEntity[], recentLogs?: string[]) {
    const resolvedTarget = dto.targetId ? this.mainCommandSceneEntity.resolveEntity(dto, visibleEntities, dto.targetType) : null;

    return {
      rawText: dto.playerText,
      actorCharacterId: context.actorCharacterId,
      sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
      recentLogs,
      availableTargets: visibleEntities.map((entity) => entity.id),
      availableTargetDetails: visibleEntities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        summary: entity.summary,
        disposition: entity.disposition,
      })),
      requestIntent: dto.intent,
      screenType: dto.screenType,
      targetId: dto.targetId ?? null,
      targetType: dto.targetType ?? resolvedTarget?.kind ?? null,
      itemId: dto.itemId ?? null,
      spellId: dto.spellId ?? null,
      mapPoint: dto.mapPoint ?? null,
      relatedIntent: dto.relatedIntent ?? null,
    };
  }
}
