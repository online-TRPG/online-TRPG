import { Injectable } from "@nestjs/common";
import { MainCommandCheckOptionDto, MainCommandStatus } from "@trpg/shared-types";
import { SessionsService } from "./sessions.service";

type MapPoint = { x: number; y: number };

@Injectable()
export class VttMapObjectRuntimeService {
  constructor(private readonly sessionsService: SessionsService) {}

  async investigateAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: MapPoint;
    actorSessionCharacterId: string | null;
  }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
  }> {
    const description = await this.sessionsService.describeVttObjectAtPoint({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      nodeId: params.nodeId,
      mapPoint: params.mapPoint,
    });
    if (description?.checkOptions?.length) {
      return {
        status: MainCommandStatus.CHECK_REQUIRED,
        message: description.message,
        checkOptions: description.checkOptions,
      };
    }

    const reveal = (await this.sessionsService.revealVttObjectContentsAtPoint({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      nodeId: params.nodeId,
      mapPoint: params.mapPoint,
      sessionCharacterId: params.actorSessionCharacterId,
      revealedBy: "player",
    })) as {
      count: number;
      revealedClues: Array<{ title: string }>;
      revealedItems: Array<{ name: string; description?: string | null }>;
    };
    const revealSummary = [
      reveal.revealedClues.length ? `단서 ${reveal.revealedClues.map((clue) => clue.title).join(", ")}` : null,
      reveal.revealedItems.length
        ? `인벤토리에 추가된 아이템 ${reveal.revealedItems
            .map((item) => (item.description?.trim() ? `${item.name} (${item.description.trim()})` : item.name))
            .join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join(" / ");

    return {
      status: MainCommandStatus.RESOLVED,
      message:
        reveal.count > 0
          ? `${description?.message ?? "오브젝트를 조사했습니다."}\n${revealSummary}을 발견했습니다.`
          : (description?.message ?? "여기에는 더 숨겨진 것이 없습니다."),
    };
  }

  async detectObservableInPartyVision(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
  }): Promise<{ status: MainCommandStatus; message: string }> {
    const observed = await this.sessionsService.revealObservableVttObjectsInPartyVision(params);
    return {
      status: observed.count > 0 ? MainCommandStatus.RESOLVED : MainCommandStatus.MESSAGE,
      message: observed.count > 0 ? `시야 안에서 수상한 오브젝트를 발견했습니다: ${observed.objectNames.join(", ")}.` : "새로 발견한 위험 요소는 없습니다.",
    };
  }

  triggerEventAtPoint(params: { sessionId: string; sessionScenarioId: string; nodeId: string; mapPoint: MapPoint; includeHiddenObject?: boolean }): Promise<{
    status: MainCommandStatus;
    message: string;
  }> {
    return this.sessionsService.triggerVttObjectEventAtPoint(params);
  }
}
