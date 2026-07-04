import { Injectable } from "@nestjs/common";
import { MainCommandResponseDto, MainCommandStatus } from "@trpg/shared-types";
import { SessionsService } from "../sessions/sessions.service";
import type { LoadedContext } from "./main-commands.service";

@Injectable()
export class MainCommandEndingNodeService {
  constructor(private readonly sessionsService: SessionsService) {}

  async completeIfEndingNode(requestId: string, context: LoadedContext): Promise<MainCommandResponseDto | null> {
    if (!this.isEndingNode(context.currentNodeNodeMetaJson)) {
      return null;
    }

    await this.sessionsService.completeSessionFromEndingNode({
      sessionId: context.sessionId,
      sessionScenarioId: context.sessionScenarioId,
      nodeId: context.currentNodeId,
      reason: "ending_node",
    });

    return {
      requestId,
      status: MainCommandStatus.RESOLVED,
      message: `${context.currentNodeTitle}에서 이야기가 마무리되었습니다. 세션이 완료되었습니다.`,
      data: {
        completedNodeId: context.currentNodeId,
        completionReason: "ending_node",
      },
    };
  }

  private isEndingNode(nodeMetaJson: string | null): boolean {
    const nodeMeta = this.parseJson<Record<string, unknown> | null>(nodeMetaJson, null);
    if (!nodeMeta) {
      return false;
    }

    return nodeMeta.isEndingNode === true || nodeMeta.endBehavior === "SESSION_COMPLETE";
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
