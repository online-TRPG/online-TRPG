import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/exceptions/domain-error";
import { MapRuntimeService } from "../sessions/map-runtime.service";
import { SessionsService } from "../sessions/sessions.service";
import {
  buildTokenItemTerrainCell,
  findSessionCharacterMapToken,
  resolveMapDistanceFt,
} from "./inventory-item-policy";

@Injectable()
export class InventoryItemMapRuntimeService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly mapRuntimeService: MapRuntimeService,
  ) {}

  async deployTerrainEffect(params: {
    userId: string;
    sessionId: string;
    sessionCharacterId: string;
    itemEntryId: string;
    itemName: string;
    terrainEffectId: string;
    sizeFt: number;
  }): Promise<void> {
    const map = await this.sessionsService.getAuthoritativeVttMap(
      params.sessionId,
    );
    const token = findSessionCharacterMapToken(
      map.tokens,
      params.sessionCharacterId,
    );
    if (!token) {
      throw badRequest("INVENTORY_400", "아이템을 배치할 캐릭터 토큰이 없습니다.", {
        reason: "ITEM_USER_TOKEN_NOT_FOUND",
      });
    }
    await this.mapRuntimeService.saveSystemVttMap(params.sessionId, {
      ...map,
      terrainCells: [
        ...(map.terrainCells ?? []),
        buildTokenItemTerrainCell({
          map,
          token: {
            ...token,
            size: token.size ?? map.gridSize,
          },
          itemEntryId: params.itemEntryId,
          itemName: params.itemName,
          terrainEffectId: params.terrainEffectId,
          sizeFt: params.sizeFt,
        }),
      ],
      updatedAt: new Date().toISOString(),
    });
  }

  async assertTargetInRange(params: {
    userId: string;
    sessionId: string;
    actorSessionCharacterId: string;
    targetSessionCharacterId: string;
    rangeFt: number;
  }): Promise<void> {
    const map = await this.sessionsService.getAuthoritativeVttMap(
      params.sessionId,
    );
    const actorToken = findSessionCharacterMapToken(
      map.tokens,
      params.actorSessionCharacterId,
    );
    const targetToken = findSessionCharacterMapToken(
      map.tokens,
      params.targetSessionCharacterId,
    );
    if (!actorToken || !targetToken) {
      throw badRequest("INVENTORY_400", "아이템 대상의 맵 토큰을 찾을 수 없습니다.", {
        reason: "ITEM_TARGET_TOKEN_NOT_FOUND",
      });
    }
    const distanceFt = resolveMapDistanceFt(
      map.gridSize,
      actorToken,
      targetToken,
    );
    if (distanceFt > params.rangeFt) {
      throw badRequest("INVENTORY_400", "아이템 대상이 사거리 밖에 있습니다.", {
        reason: "ITEM_TARGET_OUT_OF_RANGE",
        distanceFt,
        rangeFt: params.rangeFt,
      });
    }
  }
}
