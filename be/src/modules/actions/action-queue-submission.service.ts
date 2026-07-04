import { Injectable } from "@nestjs/common";
import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
} from "@prisma/client";
import { ActionQueueStatus } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { ActionProcessorService } from "./action-processor.service";

@Injectable()
export class ActionQueueSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionProcessor: ActionProcessorService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async submitPendingAction(params: {
    sessionId: string;
    userId: string;
    sessionCharacterId: string;
    rawText: string;
    inputType: PrismaActionInputType;
    actionScope: PrismaActionScope;
    baseStateVersion: number;
    clientCreatedAt: Date;
  }) {
    const action = await this.prisma.playerAction.create({
      data: {
        sessionId: params.sessionId,
        userId: params.userId,
        sessionCharacterId: params.sessionCharacterId,
        rawText: params.rawText,
        inputType: params.inputType,
        actionScope: params.actionScope,
        queueStatus: PrismaActionQueueStatus.PENDING,
        baseStateVersion: params.baseStateVersion,
        clientCreatedAt: params.clientCreatedAt,
      },
    });

    this.realtimeEvents.emitActionAccepted(params.sessionId, {
      playerActionId: action.id,
      actorUserId: action.userId,
      rawText: action.rawText,
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });

    await this.actionProcessor.processNext(params.sessionId);

    return {
      playerActionId: action.id,
      sessionId: params.sessionId,
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: params.baseStateVersion,
    };
  }
}
