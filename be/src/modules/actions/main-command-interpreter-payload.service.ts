import { Injectable } from "@nestjs/common";
import { SubmitMainCommandDto } from "@trpg/shared-types";
import type { InterpreterRequestPayload } from "../ai/ai.client";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandSceneEntityService } from "./main-command-scene-entity.service";
import type { VisibleSceneEntity } from "./main-command-scene-entity.service";

@Injectable()
export class MainCommandInterpreterPayloadService {
  constructor(private readonly mainCommandSceneEntity: MainCommandSceneEntityService) {}

  buildInterpreterPayload(
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs?: string[],
  ): InterpreterRequestPayload {
    const resolvedTarget = dto.targetId ? this.mainCommandSceneEntity.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const prioritizedEntities = resolvedTarget
      ? [resolvedTarget, ...visibleEntities.filter((entity) => entity.id !== resolvedTarget.id)]
      : visibleEntities;

    return {
      rawText: dto.playerText.slice(0, 4000),
      actorCharacterId: context.actorCharacterId.slice(0, 100),
      sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`.slice(0, 1000),
      recentLogs: recentLogs?.slice(-6).map((log) => log.slice(0, 1000)),
      availableTargets: prioritizedEntities.slice(0, 50).map((entity) => entity.id.slice(0, 120)),
      availableTargetDetails: prioritizedEntities.slice(0, 12).map((entity) => ({
        id: entity.id.slice(0, 120),
        name: entity.name.slice(0, 120),
        kind: entity.kind?.slice(0, 40),
        summary: entity.summary?.slice(0, 500),
        disposition: entity.disposition?.slice(0, 80),
      })),
      requestIntent: dto.intent?.slice(0, 80),
      screenType: dto.screenType?.slice(0, 40),
      targetId: dto.targetId?.slice(0, 120) ?? null,
      targetType: (dto.targetType ?? resolvedTarget?.kind)?.slice(0, 40) ?? null,
      itemId: dto.itemId?.slice(0, 120) ?? null,
      spellId: dto.spellId?.slice(0, 120) ?? null,
      mapPoint: dto.mapPoint ?? null,
      relatedIntent: dto.relatedIntent?.slice(0, 80) ?? null,
    };
  }
}
