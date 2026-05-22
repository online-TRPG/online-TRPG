import { Injectable } from "@nestjs/common";
import {
  MainCommandCheckOptionDto,
  MainCommandStatus,
} from "@trpg/shared-types";
import { SessionsService } from "./sessions.service";

type MapPoint = { x: number; y: number };

@Injectable()
export class VttMapDoorRuntimeService {
  constructor(private readonly sessionsService: SessionsService) {}

  openAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: MapPoint;
    itemId?: string | null;
  }): Promise<{
    status: MainCommandStatus;
    message: string;
    checkOptions?: MainCommandCheckOptionDto[];
    checkEffect?: Record<string, unknown>;
  } | null> {
    return this.sessionsService.openVttDoorAtPoint(params);
  }

  closeAtPoint(params: {
    sessionId: string;
    sessionScenarioId: string;
    nodeId: string;
    mapPoint: MapPoint;
  }): Promise<{
    status: MainCommandStatus;
    message: string;
  } | null> {
    return this.sessionsService.closeVttDoorAtPoint(params);
  }

  breakAtPoint(params: {
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
    return this.sessionsService.breakVttDoorAtPoint(params);
  }
}
