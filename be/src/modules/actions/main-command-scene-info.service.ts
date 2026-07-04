import { Injectable } from "@nestjs/common";
import {
  MainCommandResponseDto,
  MainCommandStatus,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandSceneEntityService } from "./main-command-scene-entity.service";
import type { VisibleSceneEntity } from "./main-command-scene-entity.service";

@Injectable()
export class MainCommandSceneInfoService {
  constructor(private readonly mainCommandSceneEntity: MainCommandSceneEntityService) {}

  handleSceneInfo(
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): MainCommandResponseDto {
    const entity = this.mainCommandSceneEntity.resolveEntity(dto, visibleEntities, dto.targetType);
    if (entity) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: `${entity.name}: ${entity.summary}`,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: context.currentNodeSceneText,
    };
  }
}
