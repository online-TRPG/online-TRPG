import { Injectable } from "@nestjs/common";
import {
  AiHintRequestDto,
  AiSummaryRequestDto,
  MainCommandResponseDto,
  MainCommandStatus,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { AiService } from "../ai/ai.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandHintContextService } from "./main-command-hint-context.service";

@Injectable()
export class MainCommandAiQueryService {
  constructor(
    private readonly aiService: AiService,
    private readonly mainCommandHintContext: MainCommandHintContextService,
  ) {}

  async handleHint(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    const eventHints = await this.mainCommandHintContext.loadUntriggeredVttEventHintSummaries(context);

    if (publicClues.length > 0 && eventHints.length === 0) {
      if (await this.mainCommandHintContext.areAllPublicCluesRevealed(context, publicClues)) {
        return {
          requestId,
          status: MainCommandStatus.MESSAGE,
          message: "이 장면의 단서를 모두 찾았습니다. 다음 장면으로 진행하세요.",
        };
      }
    }

    const result = await this.aiService.runHint(
      userId,
      context.sessionId,
      this.buildHintRequest(context, dto, recentLogs, [...publicClues, ...eventHints]),
      { emitSystemMessage: false },
    );

    return this.buildMessageResponse(requestId, result.parsed.content);
  }

  async handleSummary(
    requestId: string,
    userId: string,
    context: LoadedContext,
    _dto: SubmitMainCommandDto,
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const logs = recentLogs.length ? recentLogs : [`${context.currentNodeTitle}: ${context.currentNodeSceneText}`];
    const result = await this.aiService.runSummary(userId, context.sessionId, this.buildSummaryRequest(context, logs), {
      emitSystemMessage: false,
    });

    return this.buildMessageResponse(requestId, result.parsed.content);
  }

  async handleTacticQuery(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    const result = await this.aiService.runHint(userId, context.sessionId, this.buildHintRequest(context, dto, recentLogs, publicClues), {
      emitSystemMessage: false,
    });

    return this.buildMessageResponse(requestId, result.parsed.content);
  }

  private buildHintRequest(context: LoadedContext, dto: SubmitMainCommandDto, recentLogs: string[], publicClues: string[]): AiHintRequestDto {
    return {
      hintLevel: "NORMAL",
      question: dto.playerText,
      sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
      recentLogs: recentLogs.slice(0, 5),
      publicClues,
    };
  }

  private buildSummaryRequest(context: LoadedContext, logs: string[]): AiSummaryRequestDto {
    return {
      summaryType: "player_visible",
      rangeType: "RECENT",
      lastLogCount: Math.min(logs.length, 12),
      nodeId: context.currentNodeId,
      logs,
    };
  }

  private buildMessageResponse(requestId: string, message: string): MainCommandResponseDto {
    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message,
    };
  }
}
