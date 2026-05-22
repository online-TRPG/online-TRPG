import { Injectable } from "@nestjs/common";
import {
  MainCommandCheckOptionDto,
  MainCommandStatus,
} from "@trpg/shared-types";
import { SessionsService } from "./sessions.service";

type MapPoint = { x: number; y: number };

@Injectable()
export class VttMapHazardRuntimeService {
  constructor(private readonly sessionsService: SessionsService) {}

  disarmAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: MapPoint;
  }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    return this.sessionsService.disarmVttHazardAtPoint(params);
  }
}
