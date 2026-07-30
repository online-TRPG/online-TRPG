import {
  BadRequestException,
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
  AiRoleUsageMetricsDto,
  AiSummaryRequestDto,
  AiSummaryResponseDto,
  AiTraceKind,
  AiTraceListQueryDto,
  AiTraceListResponseDto,
  AiTraceQualityMetricsResponseDto,
  AiTraceResponseDto,
  AiTraceStatus,
  HumanGmAiAssistSuggestionDto,
} from "@trpg/shared-types";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import { SessionGmRuntimeParticipantAccessService } from "../sessions/session-gm-runtime-participant-access.service";
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

type AiContextSource = "CLIENT_PROVIDED" | "SERVER_VALIDATED";

// NPC 대사 생성 실패가 캐릭터의 행동 선언처럼 보이지 않도록, 재입력을 부탁하는 중립 대사로 통일합니다.
const NPC_DIALOGUE_FALLBACK_DIALOGUE =
  "잠시만요. 다시 한 번 말해 줄래요?";
const DIRECTOR_QUESTION_MAX_LENGTH = 500;
const DIRECTOR_SCENE_SUMMARY_MAX_LENGTH = 1200;
const DIRECTOR_RECENT_LOG_LIMIT = 5;
const DIRECTOR_RECENT_LOG_MAX_LENGTH = 1000;
const DIRECTOR_PUBLIC_CLUE_LIMIT = 10;
const DIRECTOR_PUBLIC_CLUE_MAX_LENGTH = 500;
const DIRECTOR_TRIED_APPROACH_LIMIT = 10;
const DIRECTOR_TRIED_APPROACH_MAX_LENGTH = 500;
const CHECK_RESULT_INTENT_MAX_LENGTH = 80;
const CHECK_RESULT_ACTION_SUMMARY_MAX_LENGTH = 1000;
const CHECK_RESULT_TARGET_NAME_MAX_LENGTH = 120;
const CHECK_RESULT_TARGET_SUMMARY_MAX_LENGTH = 700;
const CHECK_RESULT_TARGET_DISPOSITION_MAX_LENGTH = 100;
const CHECK_RESULT_SCENE_SUMMARY_MAX_LENGTH = 1200;
const CHECK_RESULT_REWARD_FACT_LIMIT = 10;
const CHECK_RESULT_REWARD_FACT_MAX_LENGTH = 700;
const CHECK_RESULT_VISIBLE_ENTITY_LIMIT = 12;
const CHECK_RESULT_VISIBLE_ENTITY_MAX_LENGTH = 1000;
const CHECK_RESULT_INFORMATION_REWARD_INTENTS = new Set([
  "SOCIAL_PERSUADE",
  "SOCIAL_INTIMIDATE",
  "SOCIAL_DECEIVE",
  "READ_EMOTION",
]);
const CHECK_RESULT_NO_NEW_FACT_NARRATION =
  "판정에 성공했지만 새로운 사실은 드러나지 않습니다.";
const SUMMARY_LOG_LIMIT = 50;
const SUMMARY_FULL_SCAN_LIMIT = SUMMARY_LOG_LIMIT + 1;
const SUMMARY_LOG_MAX_LENGTH = 2000;
const NPC_ENTITY_ID_MAX_LENGTH = 100;
const NPC_NAME_MAX_LENGTH = 120;
const NPC_SUMMARY_MAX_LENGTH = 1000;
const NPC_DISPOSITION_MAX_LENGTH = 80;
const NPC_SCENE_SUMMARY_MAX_LENGTH = 1200;
const NPC_RECENT_CONTEXT_LIMIT = 8;
const NPC_RECENT_CONTEXT_MAX_LENGTH = 1000;
const NPC_DIALOGUE_INTENT_MAX_LENGTH = 300;

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

type RoleUsageMetricRow = {
  kind: PrismaAiTraceKind;
  promptVersion: string | null;
  model: string | null;
  traceCount: number;
  tokenSampleCount: number;
  promptTokenSampleCount: number;
  outputTokenSampleCount: number;
  totalTokenSampleCount: number;
  schemaSampleCount: number;
  promptTokenP50: number | null;
  promptTokenP95: number | null;
  outputTokenP50: number | null;
  outputTokenP95: number | null;
  totalTokenP50: number | null;
  totalTokenP95: number | null;
  providerLatencyP50Ms: number | null;
  providerLatencyP95Ms: number | null;
  schemaRetryRate: number | null;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly aiClient: AiClient,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly turnLogsService: TurnLogsService,
    private readonly gmRuntimeParticipantAccess: SessionGmRuntimeParticipantAccessService,
  ) {}

  async runNarration(
    userId: string,
    sessionId: string,
    dto: AiNarrationRequestDto,
  ): Promise<AiNarrationResponseDto> {
    await this.sessionsService.ensureMembership(userId, sessionId);
    await this.gmRuntimeParticipantAccess.ensureJoinedGmRuntimeParticipant(userId, sessionId);

    const requestPayload: NarratorRequestPayload = {
      action: dto.action,
      checkRequest: dto.checkRequest,
      diceResult: dto.diceResult,
      stateDiffSummary: dto.stateDiffSummary,
      scene: dto.scene,
      constraints: {
        language: "ko",
        maxLength: dto.maxLength ?? 500,
        noNewFacts: true,
      },
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
    const visibleSummarySource =
      dto.stateDiffSummary?.summary?.trim()
      || narrationText;
    const visibleSummaryWithoutTerminalPunctuation = visibleSummarySource
      .replace(/[.!?。！？]+$/u, "")
      .trim();
    const visibleSummary = (
      visibleSummaryWithoutTerminalPunctuation || visibleSummarySource
    ).slice(0, 300);
    await this.publishNarration(sessionId, narrationText, result.traceId);
    if (dto.turnId) {
      await this.updateTurnLogNarration(sessionId, dto.turnId, narrationText);
    }

    return {
      parsed: {
        narration: narrationText,
        visibleSummary,
      },
      model: result.response.trace.model,
      latencyMs: result.response.trace.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
      fallback: result.response.fallback ?? result.isBeFallback,
      fallbackReason: result.response.fallbackReason ?? null,
    };
  }

  async runHint(
    userId: string,
    sessionId: string,
    dto: AiHintRequestDto,
    options?: {
      emitSystemMessage?: boolean;
      trustedPublicClues?: string[];
      responseMode?: "HINT" | "HUMAN_GM_ASSIST";
      contextSource?: AiContextSource;
    },
  ): Promise<AiHintResponseDto> {
    await this.ensureAiContextAuthorization(
      userId,
      sessionId,
      options?.contextSource ?? "CLIENT_PROVIDED",
    );
    const trustedPublicClues = options?.trustedPublicClues
      ?? await this.sessionsService.getPublicClueSummariesForUser(userId, sessionId);
    const publicClues = trustedPublicClues
      .slice(-DIRECTOR_PUBLIC_CLUE_LIMIT)
      .map((clue) => clue.slice(0, DIRECTOR_PUBLIC_CLUE_MAX_LENGTH));

    const requestPayload: DirectorRequestPayload = {
      hintLevel: dto.hintLevel ?? "NORMAL",
      question: dto.question?.slice(0, DIRECTOR_QUESTION_MAX_LENGTH),
      sceneSummary: dto.sceneSummary.slice(0, DIRECTOR_SCENE_SUMMARY_MAX_LENGTH),
      recentLogs: dto.recentLogs
        ?.slice(-DIRECTOR_RECENT_LOG_LIMIT)
        .map((log) => log.slice(0, DIRECTOR_RECENT_LOG_MAX_LENGTH)),
      publicClues,
      triedApproaches: dto.triedApproaches
        ?.slice(-DIRECTOR_TRIED_APPROACH_LIMIT)
        .map((approach) => approach.slice(0, DIRECTOR_TRIED_APPROACH_MAX_LENGTH)),
      responseMode: options?.responseMode ?? "HINT",
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

    const parsed: AiHintResponseDto["parsed"] = {
      hintLevel: requestPayload.hintLevel ?? "NORMAL",
      content: result.response.parsed.content,
      sourceScope:
        !result.isBeFallback
        && (requestPayload.recentLogs?.length || requestPayload.publicClues?.length)
          ? "mixed"
          : "scene",
      spoilerLevel: result.isBeFallback ? "none" : "low",
      suggestions: result.response.parsed.suggestions,
      safetyNotes: [],
    };

    if (options?.emitSystemMessage !== false) {
      this.safeEmitSystemMessage(sessionId, "AI_HINT", parsed.content);
    }

    return {
      parsed,
      model: result.response.trace.model,
      latencyMs: result.response.trace.latencyMs ?? result.elapsedMs,
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
      { emitSystemMessage: false, responseMode: "HUMAN_GM_ASSIST" },
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
    options?: {
      emitSystemMessage?: boolean;
      /** Server-selected public logs from an internal call path. Never pass client input here. */
      trustedLogs?: string[];
      contextSource?: AiContextSource;
    },
  ): Promise<AiSummaryResponseDto> {
    await this.ensureAiContextAuthorization(
      userId,
      sessionId,
      options?.contextSource ?? "CLIENT_PROVIDED",
    );

    if (dto.includeHiddenContext) {
      throw new BadRequestException(
        "Hidden summary context is unavailable until logs carry server-verified visibility metadata.",
      );
    }
    if (dto.rangeType === "SINCE_NODE") {
      throw new BadRequestException(
        "SINCE_NODE summaries are unavailable until turn logs carry server-verified node metadata.",
      );
    }

    const rangeType = dto.rangeType ?? "RECENT";
    const lastLogCount = Math.min(
      Math.max(dto.lastLogCount ?? SUMMARY_LOG_LIMIT, 1),
      SUMMARY_LOG_LIMIT,
    );
    const trustedLogs = options?.trustedLogs
      ?? await this.turnLogsService.listConfirmedPublicNarrations(
        sessionId,
        rangeType === "FULL" ? SUMMARY_FULL_SCAN_LIMIT : lastLogCount,
      );
    if (rangeType === "FULL" && trustedLogs.length > SUMMARY_LOG_LIMIT) {
      throw new BadRequestException(
        "FULL summaries are limited to 50 confirmed logs until chunked summarization is available.",
      );
    }
    const appliedLogCount = rangeType === "FULL" ? trustedLogs.length : lastLogCount;
    const selectedLogs = trustedLogs
      .slice(-appliedLogCount)
      .map((log) => log.slice(0, SUMMARY_LOG_MAX_LENGTH));
    if (selectedLogs.length === 0) {
      throw new BadRequestException("No confirmed public logs are available to summarize.");
    }
    const requestPayload: SummarizerRequestPayload = {
      summaryType: dto.summaryType ?? "player_visible",
      rangeType,
      lastLogCount: appliedLogCount,
      logs: selectedLogs,
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

    const parsed: AiSummaryResponseDto["parsed"] = {
      summaryType: requestPayload.summaryType ?? "player_visible",
      coveredTurnRange: requestPayload.rangeType ?? "RECENT",
      content: result.response.parsed.content,
      keyFacts: [],
      safetyNotes: [],
    };

    if (options?.emitSystemMessage !== false) {
      this.safeEmitSystemMessage(sessionId, "AI_SUMMARY", parsed.content);
    }

    return {
      parsed,
      model: result.response.trace.model,
      latencyMs: result.response.trace.latencyMs ?? result.elapsedMs,
      traceId: result.traceId ?? "",
      fallback: result.response.fallback ?? result.isBeFallback,
      fallbackReason: result.response.fallbackReason ?? null,
    };
  }

  async runNpcDialogue(
    userId: string,
    sessionId: string,
    dto: AiNpcDialogueRequestDto,
    options?: {
      emitChatMessage?: boolean;
      contextSource?: AiContextSource;
    },
  ): Promise<AiNpcDialogueResponseDto> {
    await this.ensureAiContextAuthorization(
      userId,
      sessionId,
      options?.contextSource ?? "CLIENT_PROVIDED",
    );

    const requestPayload: NpcDialogueRequestPayload = {
      npcEntityId: dto.npcEntityId.slice(0, NPC_ENTITY_ID_MAX_LENGTH),
      npcName: dto.npcName?.slice(0, NPC_NAME_MAX_LENGTH),
      npcSummary: dto.npcSummary.slice(0, NPC_SUMMARY_MAX_LENGTH),
      disposition: (dto.disposition ?? "neutral").slice(0, NPC_DISPOSITION_MAX_LENGTH),
      sceneSummary: dto.sceneSummary.slice(0, NPC_SCENE_SUMMARY_MAX_LENGTH),
      recentContext: dto.recentContext
        ?.slice(-NPC_RECENT_CONTEXT_LIMIT)
        .map((entry) => entry.slice(0, NPC_RECENT_CONTEXT_MAX_LENGTH)),
      dialogueIntent: dto.dialogueIntent.slice(0, NPC_DIALOGUE_INTENT_MAX_LENGTH),
      maxLength: Math.min(Math.max(dto.maxLength ?? 160, 20), 500),
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
    const internalParsed = isFallback
      ? {
          ...result.response.parsed,
          dialogue: NPC_DIALOGUE_FALLBACK_DIALOGUE,
        }
      : result.response.parsed;
    const parsed: AiNpcDialogueResponseDto["parsed"] = {
      dialogue: internalParsed.dialogue,
      tone: requestPayload.disposition ?? "neutral",
      safetyNotes: [],
    };

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
      model: result.response.trace.model,
      latencyMs: result.response.trace.latencyMs ?? result.elapsedMs,
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
    const requestPayload: CheckResultRequestPayload = {
      outcome: payload.outcome,
      intent: payload.intent.slice(0, CHECK_RESULT_INTENT_MAX_LENGTH),
      actionSummary: payload.actionSummary?.slice(0, CHECK_RESULT_ACTION_SUMMARY_MAX_LENGTH),
      targetName: payload.targetName?.slice(0, CHECK_RESULT_TARGET_NAME_MAX_LENGTH),
      targetSummary: payload.targetSummary?.slice(0, CHECK_RESULT_TARGET_SUMMARY_MAX_LENGTH),
      targetDisposition: payload.targetDisposition?.slice(0, CHECK_RESULT_TARGET_DISPOSITION_MAX_LENGTH),
      sceneSummary: payload.sceneSummary?.slice(0, CHECK_RESULT_SCENE_SUMMARY_MAX_LENGTH),
      allowedRewardFacts: payload.allowedRewardFacts
        ?.slice(-CHECK_RESULT_REWARD_FACT_LIMIT)
        .map((fact) => fact.slice(0, CHECK_RESULT_REWARD_FACT_MAX_LENGTH)),
      visibleEntities: payload.visibleEntities
        ?.slice(-CHECK_RESULT_VISIBLE_ENTITY_LIMIT)
        .map((entity) => entity.slice(0, CHECK_RESULT_VISIBLE_ENTITY_MAX_LENGTH)),
      outputMode: payload.outputMode,
      turnId: payload.turnId,
      model: payload.model,
      sessionId,
    };
    const result = await this.invokeAi({
      sessionId,
      userId,
      kind: PrismaAiTraceKind.CHECK_RESULT,
      requestPayload,
      call: async () => this.validateCheckResultResponse(
        await this.aiClient.runCheckResult(requestPayload),
        requestPayload,
      ),
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
      defaultFactory: (reason) => this.defaultInterpreterResponse(reason, requestPayload),
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
      defaultFactory: (reason) => this.defaultActorResponse(reason, requestPayload),
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

    if (query.cursor) {
      const cursorExists = await this.prisma.aiTrace.findFirst({
        where: {
          ...where,
          id: query.cursor,
        },
        select: { id: true },
      });
      if (!cursorExists) {
        throw new BadRequestException("AI trace cursor is invalid for this session or filter.");
      }
    }

    const rows = await this.prisma.aiTrace.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: size + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNext = rows.length > size;
    const pageRows = rows.slice(0, size);

    const items: AiTraceResponseDto[] = pageRows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      kind: toSharedAiTraceKind(row.kind),
      status: toSharedAiTraceStatus(row.status),
      latencyMs: row.latencyMs,
      provider: row.provider,
      model: row.model,
      failureType: row.failureType,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    }));

    return {
      items,
      size,
      nextCursor: hasNext ? pageRows[pageRows.length - 1]?.id ?? null : null,
    };
  }

  async getQualityMetrics(
    userId: string,
    sessionId: string,
  ): Promise<AiTraceQualityMetricsResponseDto> {
    await this.sessionsService.ensureMembership(userId, sessionId);
    const [summary, groups, usageRows] = await Promise.all([
      this.prisma.aiTrace.aggregate({
        where: { sessionId },
        _count: { _all: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.aiTrace.groupBy({
        by: ["kind", "status", "fallbackUsed"],
        where: { sessionId },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<RoleUsageMetricRow[]>(Prisma.sql`
        SELECT
          "kind",
          "promptVersion",
          "model",
          COUNT(*)::int AS "traceCount",
          COUNT("totalTokenCount")::int AS "tokenSampleCount",
          COUNT("promptTokenCount")::int AS "promptTokenSampleCount",
          COUNT("outputTokenCount")::int AS "outputTokenSampleCount",
          COUNT("totalTokenCount")::int AS "totalTokenSampleCount",
          COUNT("schemaValidationRetries")::int AS "schemaSampleCount",
          ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "promptTokenCount"))::int AS "promptTokenP50",
          ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "promptTokenCount"))::int AS "promptTokenP95",
          ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "outputTokenCount"))::int AS "outputTokenP50",
          ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "outputTokenCount"))::int AS "outputTokenP95",
          ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "totalTokenCount"))::int AS "totalTokenP50",
          ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalTokenCount"))::int AS "totalTokenP95",
          ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "providerLatencyMs"))::int AS "providerLatencyP50Ms",
          ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "providerLatencyMs"))::int AS "providerLatencyP95Ms",
          ROUND(
            AVG(
              CASE
                WHEN "schemaValidationRetries" IS NULL THEN NULL
                WHEN "schemaValidationRetries" > 0 THEN 1.0
                ELSE 0.0
              END
            )::numeric,
            4
          )::float AS "schemaRetryRate"
        FROM "AiTrace"
        WHERE "sessionId" = ${sessionId}
        GROUP BY "kind", "promptVersion", "model"
        ORDER BY "kind", "promptVersion" NULLS LAST, "model" NULLS LAST
      `),
    ]);
    const rate = (count: number, total: number) =>
      total > 0 ? Number((count / total).toFixed(4)) : 0;
    const countGroups = (predicate: (group: (typeof groups)[number]) => boolean) =>
      groups.reduce(
        (count, group) => count + (predicate(group) ? group._count._all : 0),
        0,
      );
    const totalTraces = summary._count._all;
    const interpreterCount = countGroups(
      (group) => group.kind === PrismaAiTraceKind.INTERPRETER,
    );
    const narratorCount = countGroups(
      (group) => group.kind === PrismaAiTraceKind.NARRATION,
    );
    const fallbackCount = countGroups((group) => group.fallbackUsed);
    const interpreterTimeoutRate = rate(
      countGroups(
        (group) =>
          group.kind === PrismaAiTraceKind.INTERPRETER &&
          group.status === PrismaAiTraceStatus.TIMEOUT,
      ),
      interpreterCount,
    );
    const narratorTimeoutRate = rate(
      countGroups(
        (group) =>
          group.kind === PrismaAiTraceKind.NARRATION &&
          group.status === PrismaAiTraceStatus.TIMEOUT,
      ),
      narratorCount,
    );
    const fallbackRate = rate(fallbackCount, totalTraces);
    const roleUsage: AiRoleUsageMetricsDto[] = usageRows.map((row) => ({
      ...row,
      kind: toSharedAiTraceKind(row.kind),
    }));
    return {
      totalTraces,
      averageLatencyMs: Math.round(summary._avg.latencyMs ?? 0),
      interpreterTimeoutRate,
      narratorTimeoutRate,
      fallbackRate,
      interpreterTimeoutTargetMet:
        interpreterCount > 0 && interpreterTimeoutRate <= 0.1,
      narratorTimeoutTargetMet:
        narratorCount > 0 && narratorTimeoutRate <= 0.1,
      fallbackTargetMet: totalTraces > 0 && fallbackRate <= 0.15,
      roleUsage,
      offlineEvaluationRequired: [
        "interpreter_schema_pass_rate",
        "interpreter_intent_accuracy",
        "narrator_schema_pass_rate",
        "narrator_no_new_facts_violation_rate",
      ],
    };
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
      const aiFailureType = isAiFallback
        ? response.trace.failureType ?? "ai_template_fallback"
        : null;
      const traceStatus = !isAiFallback
        ? PrismaAiTraceStatus.SUCCESS
        : aiFailureType === "timeout"
          ? PrismaAiTraceStatus.TIMEOUT
          : PrismaAiTraceStatus.ERROR;
      const traceId = await this.persistTrace({
        sessionId: params.sessionId,
        userId: params.userId,
        kind: params.kind,
        status: traceStatus,
        latencyMs: elapsedMs,
        requestPayload: params.requestPayload,
        responsePayload: response,
        failureType: aiFailureType,
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
        const defaultResponse = params.defaultFactory(
          isTimeout ? "timeout" : "upstream_error",
        );
        defaultResponse.trace.latencyMs = elapsedMs;
        defaultResponse.trace.attemptLatenciesMs = [];
        defaultResponse.trace.failureType = isTimeout
          ? "timeout"
          : "be_default_fallback";
        const traceId = await this.persistTrace({
          sessionId: params.sessionId,
          userId: params.userId,
          kind: params.kind,
          status: isTimeout ? PrismaAiTraceStatus.TIMEOUT : PrismaAiTraceStatus.ERROR,
          latencyMs: elapsedMs,
          requestPayload: params.requestPayload,
          responsePayload: defaultResponse,
          errorMessage,
          failureType: isTimeout ? "timeout" : "be_default_fallback",
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
  } {
    const provider = "be-default-fallback";
    const model = "be-default-fallback";
    const promptVersion = `${role}.fallback.be.v1`;
    return {
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
    };
  }

  private defaultNarratorResponse(reason: string): NarratorResponsePayload {
    return {
      ...this.buildBeFallbackTrace("narrator"),
      parsed: {
        narration:
          "장면이 흐릿하게 이어집니다. (AI 응답을 가져오지 못해 임시 메시지로 대체했습니다.)",
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private buildHumanGmAssistPrompt(dto: AiHumanGmAssistSuggestionRequestDto): string {
    const typeLabel = dto.assistType.replace(/_/g, " ");
    return `[${typeLabel}] ${dto.prompt}`.slice(0, DIRECTOR_QUESTION_MAX_LENGTH);
  }

  private formatHumanGmAssistContent(content: string, suggestions?: string[]): string {
    const suggestionLines = (suggestions ?? [])
      .map((suggestion) => suggestion.trim())
      .flatMap((suggestion) => suggestion ? [suggestion] : [])
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
        content:
          "지금은 GM이 잠시 자리를 비웠습니다. 잠시 후 다시 시도해주세요.",
        suggestions: [],
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private defaultSummarizerResponse(reason: string): SummarizerResponsePayload {
    return {
      ...this.buildBeFallbackTrace("summarizer"),
      parsed: {
        content: "요약을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
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
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private defaultInterpreterResponse(
    reason: string,
    requestPayload: InterpreterRequestPayload,
  ): InterpreterResponsePayload {
    return {
      ...this.buildBeFallbackTrace("interpreter"),
      parsed: {
        action: {
          type: "OUT_OF_SCOPE",
          actorCharacterId: requestPayload.actorCharacterId,
          targetId: null,
          spellId: null,
          featureId: null,
          attackKind: null,
          ability: null,
          skill: null,
          approach: requestPayload.rawText,
          confidence: 0,
          requiresRoll: false,
          suggestedDifficulty: null,
        },
        needsClarification: true,
        clarificationQuestion: "AI 해석을 사용할 수 없습니다. 행동과 대상을 조금 더 구체적으로 입력해 주세요.",
        mentionedSpellId: null,
        mentionedItemId: null,
        requiredRuleCheckIds: [],
        sceneTransition: null,
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private defaultActorResponse(
    reason: string,
    requestPayload: ActorRequestPayload,
  ): ActorResponsePayload {
    const selected = requestPayload.allowedActions[0];
    if (!selected) {
      throw new Error("Actor fallback requires at least one allowed action.");
    }
    return {
      ...this.buildBeFallbackTrace("actor"),
      parsed: {
        selectedActionId: selected.id,
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
    const narration =
      requestPayload.outcome === "SUCCESS"
        ? requestPayload.allowedRewardFacts?.length
          ? requestPayload.allowedRewardFacts[0]
          : `판정에 성공했습니다. ${target}은(는) 시도에 반응하지만 새로운 사실은 드러나지 않습니다.`
        : `판정에 실패했습니다. ${target}의 반응은 확실한 정보로 이어지지 않습니다.`;
    return {
      ...this.buildBeFallbackTrace("check_result"),
      parsed: {
        narration,
      },
      fallback: true,
      fallbackReason: reason,
    };
  }

  private async persistTrace(params: PersistTraceParams): Promise<string | null> {
    const failureType = params.failureType ?? params.responsePayload?.trace?.failureType ?? null;
    const data: Prisma.AiTraceCreateInput = {
      session: { connect: { id: params.sessionId } },
      user: { connect: { id: params.userId } },
      kind: params.kind,
      status: params.status,
      latencyMs: params.latencyMs,
      providerLatencyMs: params.responsePayload?.trace?.providerLatencyMs ?? null,
      attemptLatencies: params.responsePayload?.trace?.attemptLatenciesMs ?? Prisma.JsonNull,
      schemaValidationRetries: params.responsePayload?.trace?.schemaValidationRetries ?? null,
      provider: params.responsePayload?.trace.provider ?? null,
      model: params.responsePayload?.trace.model ?? null,
      promptVersion: params.responsePayload?.trace?.promptVersion ?? null,
      attempts: params.responsePayload?.trace?.attempts ?? null,
      finishReason: params.responsePayload?.trace.finishReason ?? null,
      providerRequestId: params.responsePayload?.trace.providerRequestId ?? null,
      promptTokenCount: params.responsePayload?.trace?.promptTokenCount ?? null,
      outputTokenCount: params.responsePayload?.trace?.outputTokenCount ?? null,
      cachedTokenCount: params.responsePayload?.trace?.cachedTokenCount ?? null,
      totalTokenCount: params.responsePayload?.trace?.totalTokenCount ?? null,
      failureType,
      fallbackUsed:
        params.responsePayload?.fallback === true ||
        failureType?.toLowerCase().includes("fallback") === true,
      errorMessage: params.errorMessage ?? null,
      requestJson: JSON.stringify(this.buildTraceRequestReference(params.requestPayload)),
      responseJson: params.responsePayload
        ? JSON.stringify({
            parsed: params.responsePayload.parsed,
            fallback: params.responsePayload.fallback ?? false,
            fallbackReason: params.responsePayload.fallbackReason ?? null,
          })
        : null,
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

  private validateCheckResultResponse(
    response: CheckResultResponsePayload,
    requestPayload: CheckResultRequestPayload,
  ): CheckResultResponsePayload {
    if (
      requestPayload.outcome !== "SUCCESS"
      || !CHECK_RESULT_INFORMATION_REWARD_INTENTS.has(requestPayload.intent)
    ) {
      return response;
    }

    const allowedFacts = requestPayload.allowedRewardFacts ?? [];
    if (allowedFacts.length === 0) {
      if (response.parsed.narration !== CHECK_RESULT_NO_NEW_FACT_NARRATION) {
        throw new Error(
          "CheckResult sensitive success without allowed facts returned generated information",
        );
      }
      return response;
    }

    if (!allowedFacts.includes(response.parsed.narration)) {
      throw new Error(
        "CheckResult sensitive success narration is not an exact allowed fact",
      );
    }
    return response;
  }

  private buildTraceRequestReference(requestPayload: unknown): Record<string, unknown> {
    if (!requestPayload || typeof requestPayload !== "object" || Array.isArray(requestPayload)) {
      return {};
    }
    const payload = requestPayload as Record<string, unknown>;
    return Object.fromEntries(
      ["sessionId", "turnId", "actorCharacterId"]
        .filter((key) => payload[key] !== undefined && payload[key] !== null)
        .map((key) => [key, payload[key]]),
    );
  }

  private extractErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return (message || "Unknown error")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 1000);
  }

  private async ensureAiContextAuthorization(
    userId: string,
    sessionId: string,
    contextSource: AiContextSource,
  ): Promise<void> {
    await this.sessionsService.ensureMembership(userId, sessionId);
    if (contextSource === "CLIENT_PROVIDED") {
      await this.gmRuntimeParticipantAccess.ensureJoinedGmRuntimeParticipant(
        userId,
        sessionId,
      );
    }
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

function toSharedAiTraceKind(value: PrismaAiTraceKind): AiTraceKind {
  switch (value) {
    case PrismaAiTraceKind.NARRATION:
      return AiTraceKind.NARRATION;
    case PrismaAiTraceKind.CHECK_RESULT:
      return AiTraceKind.CHECK_RESULT;
    case PrismaAiTraceKind.HINT:
      return AiTraceKind.HINT;
    case PrismaAiTraceKind.SUMMARY:
      return AiTraceKind.SUMMARY;
    case PrismaAiTraceKind.NPC_DIALOGUE:
      return AiTraceKind.NPC_DIALOGUE;
    case PrismaAiTraceKind.INTERPRETER:
      return AiTraceKind.INTERPRETER;
    case PrismaAiTraceKind.ACTOR:
      return AiTraceKind.ACTOR;
  }
  throw new Error(`Unsupported AI trace kind: ${value}`);
}

function toSharedAiTraceStatus(value: PrismaAiTraceStatus): AiTraceStatus {
  switch (value) {
    case PrismaAiTraceStatus.SUCCESS:
      return AiTraceStatus.SUCCESS;
    case PrismaAiTraceStatus.TIMEOUT:
      return AiTraceStatus.TIMEOUT;
    case PrismaAiTraceStatus.ERROR:
      return AiTraceStatus.ERROR;
  }
  throw new Error(`Unsupported AI trace status: ${value}`);
}
