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
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { SessionsService } from "../sessions/sessions.service";
import {
  ActorRequestPayload,
  ActorResponsePayload,
  AiClient,
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
  | ActorResponsePayload;

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
    };

    const result = await this.invokeAi({
      sessionId,
      userId,
      kind: PrismaAiTraceKind.NARRATION,
      requestPayload,
      call: () => this.aiClient.runNarrator(requestPayload),
    });

    return {
      parsed: result.response.parsed,
      model: result.response.model,
      latencyMs: result.response.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
    };
  }

  async runHint(
    userId: string,
    sessionId: string,
    dto: AiHintRequestDto,
  ): Promise<AiHintResponseDto> {
    await this.sessionsService.ensureMembership(userId, sessionId);

    const requestPayload: DirectorRequestPayload = {
      hintLevel: dto.hintLevel ?? "NORMAL",
      question: dto.question,
      sceneSummary: dto.sceneSummary,
      recentLogs: dto.recentLogs,
      publicClues: dto.publicClues,
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
    });

    return {
      parsed: result.response.parsed,
      model: result.response.model,
      latencyMs: result.response.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
    };
  }

  async runSummary(
    userId: string,
    sessionId: string,
    dto: AiSummaryRequestDto,
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
    });

    return {
      parsed: result.response.parsed,
      model: result.response.model,
      latencyMs: result.response.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
    };
  }

  async runNpcDialogue(
    userId: string,
    sessionId: string,
    dto: AiNpcDialogueRequestDto,
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
    });

    return {
      parsed: result.response.parsed,
      model: result.response.model,
      latencyMs: result.response.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
    };
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
  }): Promise<{ response: T; traceId: string | null; elapsedMs: number }> {
    const startedAt = Date.now();
    try {
      const response = await params.call();
      const elapsedMs = Date.now() - startedAt;
      const traceId = await this.persistTrace({
        sessionId: params.sessionId,
        userId: params.userId,
        kind: params.kind,
        status: PrismaAiTraceStatus.SUCCESS,
        latencyMs: response.latencyMs ?? elapsedMs,
        requestPayload: params.requestPayload,
        responsePayload: response,
      });
      return { response, traceId, elapsedMs };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const isTimeout = error instanceof GatewayTimeoutException;
      await this.persistTrace({
        sessionId: params.sessionId,
        userId: params.userId,
        kind: params.kind,
        status: isTimeout ? PrismaAiTraceStatus.TIMEOUT : PrismaAiTraceStatus.ERROR,
        latencyMs: elapsedMs,
        requestPayload: params.requestPayload,
        errorMessage: this.extractErrorMessage(error),
        failureType: isTimeout ? "timeout" : "upstream_error",
      });
      throw error;
    }
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
}
