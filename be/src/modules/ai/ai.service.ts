import {
  GatewayTimeoutException,
  Injectable,
  Logger,
} from "@nestjs/common";
import {
  AiTraceKind as PrismaAiTraceKind,
  AiTraceStatus as PrismaAiTraceStatus,
  Prisma,
} from "@prisma/client";
import {
  AiHintRequestDto,
  AiHintResponseDto,
  AiHumanGmAssistSuggestionRequestDto,
  AiNarrationRequestDto,
  AiNarrationResponseDto,
  AiNpcDialogueRequestDto,
  AiNpcDialogueResponseDto,
  AiSummaryRequestDto,
  AiSummaryResponseDto,
  AiTraceKind,
  AiTraceListQueryDto,
  AiTraceListResponseDto,
  AiTraceResponseDto,
  AiTraceStatus,
  HumanGmAiAssistSuggestionDto,
} from "@trpg/shared-types";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import {
  ActorRequestPayload,
  ActorResponsePayload,
  AiClient,
  CheckResultRequestPayload,
  CheckResultResponsePayload,
  DirectorRequestPayload,
  DirectorResponsePayload,
  InterpreterRequestPayload,
  InterpreterResponsePayload,
  NarratorRequestPayload,
  NarratorResponsePayload,
  NpcDialogueRequestPayload,
  NpcDialogueResponsePayload,
  SummarizerRequestPayload,
  SummarizerResponsePayload,
} from "./ai.client";

type HarnessResponse =
  | NarratorResponsePayload
  | DirectorResponsePayload
  | SummarizerResponsePayload
  | NpcDialogueResponsePayload
  | InterpreterResponsePayload
  | ActorResponsePayload
  | CheckResultResponsePayload;

// NPC 대사 생성 실패가 캐릭터의 행동 선언처럼 보이지 않도록, 재입력을 부탁하는 중립 대사로 통일합니다.
const NPC_DIALOGUE_FALLBACK_DIALOGUE =
  "잠시만요. 다시 한 번 말해 줄래요?";

interface PersistTraceParams {
  sessionId: string;
  userId: string;
  kind: PrismaAiTraceKind;
  status: PrismaAiTraceStatus;
  latencyMs: number;
  requestPayload: unknown;
  responsePayload?: HarnessResponse | null;
  errorMessage?: string | null;
  failureType?: string | null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly aiClient: AiClient,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly turnLogsService: TurnLogsService,
  ) {}

  async runNarration(
    userId: string,
    sessionId: string,
    dto: AiNarrationRequestDto,
  ): Promise<AiNarrationResponseDto> {
    await this.sessionsService.ensureMembership(userId, sessionId);

    const requestPayload: NarratorRequestPayload = {
      rawInput: dto.rawInput,
      actionSummary: dto.actionSummary,
      diceSummary: dto.diceSummary,
      sceneTone: dto.sceneTone ?? "mysterious",
      sessionId,
      turnId: dto.turnId,
    };

    const result = await this.invokeAi({
      sessionId,
      userId,
      kind: PrismaAiTraceKind.NARRATION,
      requestPayload,
      call: () => this.aiClient.runNarrator(requestPayload),
      defaultFactory: (reason) => this.defaultNarratorResponse(reason),
    });

    const narrationText = result.response.parsed.narration;
    await this.publishNarration(sessionId, narrationText, result.traceId);
    if (dto.turnId) {
      await this.updateTurnLogNarration(sessionId, dto.turnId, narrationText);
    }

    return {
      parsed: result.response.parsed,
      model: result.response.model,
      latencyMs: result.response.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
      fallback: result.response.fallback ?? result.isBeFallback,
      fallbackReason: result.response.fallbackReason ?? null,
    };
  }

  async runHint(
    userId: string,
    sessionId: string,
    dto: AiHintRequestDto,
    options?: { emitSystemMessage?: boolean },
  ): Promise<AiHintResponseDto> {
    await this.sessionsService.ensureMembership(userId, sessionId);
    const publicClues = await this.sessionsService.getPublicClueSummariesForUser(userId, sessionId);

    const requestPayload: DirectorRequestPayload = {
      hintLevel: dto.hintLevel ?? "NORMAL",
      question: dto.question,
      sceneSummary: dto.sceneSummary,
      recentLogs: dto.recentLogs,
      publicClues,
      triedApproaches: dto.triedApproaches,
      sessionId,
      turnId: dto.turnId,
    };

    const result = await this.invokeAi({
      sessionId,
      userId,
      kind: PrismaAiTraceKind.HINT,
      requestPayload,
      call: () => this.aiClient.runDirector(requestPayload),
      defaultFactory: (reason) => this.defaultDirectorResponse(reason),
    });

    if (options?.emitSystemMessage !== false) {
      this.safeEmitSystemMessage(sessionId, "AI_HINT", result.response.parsed.content);
    }

    return {
      parsed: result.response.parsed,
      model: result.response.model,
      latencyMs: result.response.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
      fallback: result.response.fallback ?? result.isBeFallback,
      fallbackReason: result.response.fallbackReason ?? null,
    };
  }

  async generateHumanGmAssistSuggestion(
    userId: string,
    sessionId: string,
    dto: AiHumanGmAssistSuggestionRequestDto,
  ): Promise<HumanGmAiAssistSuggestionDto> {
    const question = this.buildHumanGmAssistPrompt(dto);
    const result = await this.runHint(
      userId,
      sessionId,
      {
        hintLevel: "NORMAL",
        question,
        sceneSummary: dto.sceneSummary,
        recentLogs: dto.recentLogs,
      },
      { emitSystemMessage: false },
    );
    const content = this.formatHumanGmAssistContent(result.parsed.content, result.parsed.suggestions);

    return this.sessionsService.createHumanGmAiAssistSuggestion(userId, sessionId, {
      assistType: dto.assistType,
      content,
      suggestedActionId: dto.suggestedActionId,
      targetId: dto.targetId,
    });
  }

  async runSummary(
    userId: string,
    sessionId: string,
    dto: AiSummaryRequestDto,
    options?: { emitSystemMessage?: boolean },
  ): Promise<AiSummaryResponseDto> {
    await this.sessionsService.ensureMembership(userId, sessionId);

    const requestPayload: SummarizerRequestPayload = {
      summaryType: dto.summaryType ?? "player_visible",
      rangeType: dto.rangeType ?? "RECENT",
      lastLogCount: dto.lastLogCount,
      nodeId: dto.nodeId,
      logs: dto.logs,
      includeHiddenContext: dto.includeHiddenContext ?? false,
      sessionId,
      turnId: dto.turnId,
    };

    const result = await this.invokeAi({
      sessionId,
      userId,
      kind: PrismaAiTraceKind.SUMMARY,
      requestPayload,
      call: () => this.aiClient.runSummarizer(requestPayload),
      defaultFactory: (reason) => this.defaultSummarizerResponse(reason),
    });

    if (options?.emitSystemMessage !== false) {
      this.safeEmitSystemMessage(sessionId, "AI_SUMMARY", result.response.parsed.content);
    }

    return {
      parsed: result.response.parsed,
      model: result.response.model,
      latencyMs: result.response.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
      fallback: result.response.fallback ?? result.isBeFallback,
      fallbackReason: result.response.fallbackReason ?? null,
    };
  }

  async runNpcDialogue(
    userId: string,
    sessionId: string,
    dto: AiNpcDialogueRequestDto,
    options?: { emitChatMessage?: boolean },
  ): Promise<AiNpcDialogueResponseDto> {
    await this.sessionsService.ensureMembership(userId, sessionId);

    const requestPayload: NpcDialogueRequestPayload = {
      npcEntityId: dto.npcEntityId,
      npcName: dto.npcName,
      npcSummary: dto.npcSummary,
      disposition: dto.disposition ?? "neutral",
      sceneSummary: dto.sceneSummary,
      recentContext: dto.recentContext,
      selectedActionId: dto.selectedActionId,
      dialogueIntent: dto.dialogueIntent,
      audienceIds: dto.audienceIds,
      maxLength: dto.maxLength ?? 160,
      sessionId,
      turnId: dto.turnId,
    };

    const result = await this.invokeAi({
      sessionId,
      userId,
      kind: PrismaAiTraceKind.NPC_DIALOGUE,
      requestPayload,
      call: () => this.aiClient.runNpcDialogue(requestPayload),
      defaultFactory: (reason) => this.defaultNpcDialogueResponse(reason),
    });

    const isFallback = result.response.fallback === true || result.isBeFallback;
    const parsed = isFallback
      ? {
          ...result.response.parsed,
          dialogue: NPC_DIALOGUE_FALLBACK_DIALOGUE,
        }
      : result.response.parsed;

    if (options?.emitChatMessage !== false) {
      const speakerName = dto.npcName ?? "NPC";
      const speakerUserId = `ai:npc:${dto.npcEntityId}`;
      this.safeEmitChatMessage(
        sessionId,
        speakerUserId,
        speakerName,
        parsed.dialogue,
        result.traceId,
      );
    }

    return {
      parsed,
      model: result.response.model,
      latencyMs: result.response.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
      fallback: result.response.fallback ?? result.isBeFallback,
      fallbackReason: result.response.fallbackReason ?? null,
    };
  }

  async runCheckResult(
    sessionId: string,
    userId: string,
    payload: CheckResultRequestPayload,
  ): Promise<CheckResultResponsePayload> {
    await this.sessionsService.ensureMembership(userId, sessionId);
    const requestPayload: CheckResultRequestPayload = { ...payload, sessionId };
    const result = await this.invokeAi({
      sessionId,
      userId,
      kind: PrismaAiTraceKind.NARRATION,
      requestPayload,
      call: () => this.aiClient.runCheckResult(requestPayload),
      defaultFactory: (reason) => this.defaultCheckResultResponse(reason, requestPayload),
    });
    return result.response;
  }

  async runInterpreter(
    sessionId: string,
    userId: string,
    payload: InterpreterRequestPayload,
  ): Promise<InterpreterResponsePayload> {
    const requestPayload: InterpreterRequestPayload = { ...payload, sessionId };
    const result = await this.invokeAi({
      sessionId,
      userId,
      kind: PrismaAiTraceKind.INTERPRETER,
      requestPayload,
      call: () => this.aiClient.runInterpreter(requestPayload),
    });
    return result.response;
  }

  async runActor(
    sessionId: string,
    userId: string,
    payload: ActorRequestPayload,
  ): Promise<ActorResponsePayload> {
    const requestPayload: ActorRequestPayload = { ...payload, sessionId };
    const result = await this.invokeAi({
      sessionId,
      userId,
      kind: PrismaAiTraceKind.ACTOR,
      requestPayload,
      call: () => this.aiClient.runActor(requestPayload),
    });
    return result.response;
  }

  async listTraces(
    userId: string,
    sessionId: string,
    query: AiTraceListQueryDto,
  ): Promise<AiTraceListResponseDto> {
    await this.sessionsService.ensureMembership(userId, sessionId);

    const size = query.size ?? 20;
    const where: Prisma.AiTraceWhereInput = { sessionId };
    if (query.kind) where.kind = query.kind;
    if (query.status) where.status = query.status;

    const rows = await this.prisma.aiTrace.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: size,
    });

    const items: AiTraceResponseDto[] = rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      kind: row.kind as AiTraceKind,
      status: row.status as AiTraceStatus,
      latencyMs: row.latencyMs,
      provider: row.provider,
      model: row.model,
      failureType: row.failureType,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, size };
  }

  private async invokeAi<T extends HarnessResponse>(params: {
    sessionId: string;
    userId: string;
    kind: PrismaAiTraceKind;
    requestPayload: unknown;
    call: () => Promise<T>;
    defaultFactory?: (reason: string) => T;
  }): Promise<{ response: T; traceId: string | null; elapsedMs: number; isBeFallback: boolean }> {
    const startedAt = Date.now();
    try {
      const response = await params.call();
      const elapsedMs = Date.now() - startedAt;
      const isAiFallback = response.fallback === true;
      const traceId = await this.persistTrace({
        sessionId: params.sessionId,
        userId: params.userId,
        kind: params.kind,
        status: PrismaAiTraceStatus.SUCCESS,
        latencyMs: response.latencyMs ?? elapsedMs,
        requestPayload: params.requestPayload,
        responsePayload: response,
        failureType: isAiFallback ? "ai_template_fallback" : null,
      });
      if (isAiFallback) {
        this.logger.warn(
          `AI returned template fallback: session=${params.sessionId} kind=${params.kind} reason=${response.fallbackReason ?? "n/a"}`,
        );
      }
      return { response, traceId, elapsedMs, isBeFallback: false };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const isTimeout = error instanceof GatewayTimeoutException;
      const errorMessage = this.extractErrorMessage(error);

      if (params.defaultFactory) {
        const defaultResponse = params.defaultFactory(errorMessage);
        const traceId = await this.persistTrace({
          sessionId: params.sessionId,
          userId: params.userId,
          kind: params.kind,
          status: PrismaAiTraceStatus.ERROR,
          latencyMs: elapsedMs,
          requestPayload: params.requestPayload,
          responsePayload: defaultResponse,
          errorMessage,
          failureType: "be_default_fallback",
        });
        this.logger.warn(
          `AI call failed (${isTimeout ? "timeout" : "upstream_error"}), returning BE default fallback: session=${params.sessionId} kind=${params.kind} msg=${errorMessage}`,
        );
        return { response: defaultResponse, traceId, elapsedMs, isBeFallback: true };
      }

      await this.persistTrace({
        sessionId: params.sessionId,
        userId: params.userId,
        kind: params.kind,
        status: isTimeout ? PrismaAiTraceStatus.TIMEOUT : PrismaAiTraceStatus.ERROR,
        latencyMs: elapsedMs,
        requestPayload: params.requestPayload,
        errorMessage,
        failureType: isTimeout ? "timeout" : "upstream_error",
      });
      throw error;
    }
  }

  private buildBeFallbackTrace(role: string): {
    provider: string;
    model: string;
    latencyMs: number;
    promptVersion: string;
    rawOutput: string;
    finishReason: string | null;
    providerRequestId: string | null;
    trace: {
      role: string;
      provider: string;
      model: string;
      promptVersion: string;
      latencyMs: number;
      attempts: number;
      failureType: string;
      finishReason: string | null;
      providerRequestId: string | null;
    };
    logPaths: null;
  } {
    const provider = "be-default-fallback";
    const model = "be-default-fallback";
    const promptVersion = `${role}.fallback.be.v1`;
    return {
      provider,
      model,
      latencyMs: 0,
      promptVersion,
      rawOutput: "",
      finishReason: null,
      providerRequestId: null,
      trace: {
        role,
        provider,
        model,
        promptVersion,
        latencyMs: 0,
        attempts: 0,
        failureType: "be_default_fallback",
        finishReason: null,
        providerRequestId: null,
      },
      logPaths: null,
    };
  }

  private defaultNarratorResponse(reason: string): NarratorResponsePayload {
    return {
      ...this.buildBeFallbackTrace("narrator"),
      parsed: {
        narration:
          "장면이 흐릿하게 이어집니다. (AI 응답을 가져오지 못해 임시 메시지로 대체했습니다.)",
        visibleSummary: "장면 묘사 보류",
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private buildHumanGmAssistPrompt(dto: AiHumanGmAssistSuggestionRequestDto): string {
    const typeLabel = dto.assistType.replace(/_/g, " ");
    return [
      `HUMAN GM assist type: ${typeLabel}.`,
      `GM request: ${dto.prompt}`,
      dto.targetId ? `Target id/name: ${dto.targetId}` : null,
      dto.suggestedActionId ? `Suggested action id: ${dto.suggestedActionId}` : null,
      "Return a concise Korean suggestion that the GM can review before applying. Do not reveal hidden facts or mutate state.",
    ].filter(Boolean).join("\n");
  }

  private formatHumanGmAssistContent(content: string, suggestions?: string[]): string {
    const suggestionLines = (suggestions ?? [])
      .map((suggestion) => suggestion.trim())
      .filter(Boolean)
      .slice(0, 3);
    const trimmedContent = content.trim();
    if (!suggestionLines.length) {
      return trimmedContent.slice(0, 2000);
    }
    return [trimmedContent, ...suggestionLines.map((suggestion) => `- ${suggestion}`)]
      .join("\n")
      .slice(0, 2000);
  }

  private defaultDirectorResponse(reason: string): DirectorResponsePayload {
    return {
      ...this.buildBeFallbackTrace("director"),
      parsed: {
        hintLevel: "NORMAL",
        content:
          "지금은 GM이 잠시 자리를 비웠습니다. 잠시 후 다시 시도해주세요.",
        sourceScope: "scene",
        spoilerLevel: "none",
        suggestions: [],
        safetyNotes: [],
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private defaultSummarizerResponse(reason: string): SummarizerResponsePayload {
    return {
      ...this.buildBeFallbackTrace("summarizer"),
      parsed: {
        summaryType: "player_visible",
        coveredTurnRange: "",
        content: "요약을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
        keyFacts: [],
        safetyNotes: [],
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private defaultNpcDialogueResponse(reason: string): NpcDialogueResponsePayload {
    return {
      ...this.buildBeFallbackTrace("npc_dialogue"),
      parsed: {
        dialogue: NPC_DIALOGUE_FALLBACK_DIALOGUE,
        tone: "neutral",
        safetyNotes: [],
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private defaultCheckResultResponse(
    reason: string,
    requestPayload: CheckResultRequestPayload,
  ): CheckResultResponsePayload {
    const target = requestPayload.targetName ?? "대상";
    const rewardInfo =
      requestPayload.targetSummary ??
      requestPayload.targetDisposition ??
      requestPayload.publicClues?.[0] ??
      requestPayload.actionSummary;
    const narration =
      requestPayload.outcome === "SUCCESS"
        ? `판정에 성공했습니다. ${target}에게서 의미 있는 정보를 얻습니다. ${rewardInfo}`
        : `판정에 실패했습니다. ${target}의 반응은 확실한 정보로 이어지지 않습니다.`;
    return {
      ...this.buildBeFallbackTrace("check_result"),
      parsed: {
        narration,
        rewardInfo: requestPayload.outcome === "SUCCESS" ? rewardInfo : "정보 보상 없음",
        safetyNotes: [],
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private async persistTrace(params: PersistTraceParams): Promise<string | null> {
    const data: Prisma.AiTraceCreateInput = {
      session: { connect: { id: params.sessionId } },
      user: { connect: { id: params.userId } },
      kind: params.kind,
      status: params.status,
      latencyMs: params.latencyMs,
      provider: params.responsePayload?.provider ?? null,
      model: params.responsePayload?.model ?? null,
      promptVersion: params.responsePayload?.trace?.promptVersion ?? null,
      attempts: params.responsePayload?.trace?.attempts ?? null,
      finishReason: params.responsePayload?.finishReason ?? null,
      providerRequestId: params.responsePayload?.providerRequestId ?? null,
      failureType: params.failureType ?? params.responsePayload?.trace?.failureType ?? null,
      errorMessage: params.errorMessage ?? null,
      requestJson: JSON.stringify(params.requestPayload),
      responseJson: params.responsePayload ? JSON.stringify(params.responsePayload) : null,
    };

    try {
      const trace = await this.prisma.aiTrace.create({ data, select: { id: true } });
      return trace.id;
    } catch (error) {
      this.logger.error(
        `Failed to persist AiTrace for session=${params.sessionId} user=${params.userId}: ${this.extractErrorMessage(error)}`,
      );
      return null;
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private async publishNarration(
    sessionId: string,
    narration: string,
    traceId: string | null,
  ): Promise<void> {
    this.safeEmitChatMessage(sessionId, "ai:narrator", "Narrator", narration, traceId);
  }

  private async updateTurnLogNarration(
    sessionId: string,
    turnLogId: string,
    narration: string,
  ): Promise<void> {
    try {
      const updated = await this.turnLogsService.attachNarration(turnLogId, narration);
      if (updated) {
        this.realtimeEvents.emitTurnLogCreated(sessionId, updated);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to attach narration to turnLog=${turnLogId}: ${this.extractErrorMessage(error)}`,
      );
    }
  }

  private safeEmitChatMessage(
    sessionId: string,
    senderUserId: string,
    senderDisplayName: string,
    content: string,
    traceId: string | null,
  ): void {
    try {
      this.realtimeEvents.emitChatMessage(sessionId, {
        id: traceId ?? randomUUID(),
        sessionId,
        senderUserId,
        senderDisplayName,
        content,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to emit chat.message for session=${sessionId}: ${this.extractErrorMessage(error)}`,
      );
    }
  }

  private safeEmitSystemMessage(sessionId: string, code: string, message: string): void {
    try {
      this.realtimeEvents.emitSystemMessage(sessionId, code, message);
    } catch (error) {
      this.logger.warn(
        `Failed to emit system.message(${code}) for session=${sessionId}: ${this.extractErrorMessage(error)}`,
      );
    }
  }
}
