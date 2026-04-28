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
  AiNarrationRequestDto,
  AiNarrationResponseDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { SessionsService } from "../sessions/sessions.service";
import {
  AiClient,
  NarratorRequestPayload,
  NarratorResponsePayload,
} from "./ai.client";

interface PersistTraceParams {
  sessionId: string;
  userId: string;
  kind: PrismaAiTraceKind;
  status: PrismaAiTraceStatus;
  latencyMs: number;
  requestPayload: unknown;
  responsePayload?: NarratorResponsePayload | null;
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
    };

    const startedAt = Date.now();

    try {
      const result = await this.aiClient.runNarrator(requestPayload);
      const elapsed = Date.now() - startedAt;
      const traceId = await this.persistTrace({
        sessionId,
        userId,
        kind: PrismaAiTraceKind.NARRATION,
        status: PrismaAiTraceStatus.SUCCESS,
        latencyMs: result.latencyMs ?? elapsed,
        requestPayload,
        responsePayload: result,
      });

      return {
        parsed: result.parsed,
        model: result.model,
        latencyMs: result.latencyMs ?? elapsed,
        traceId: traceId ?? "",
      };
    } catch (error) {
      const elapsed = Date.now() - startedAt;
      const isTimeout = error instanceof GatewayTimeoutException;
      await this.persistTrace({
        sessionId,
        userId,
        kind: PrismaAiTraceKind.NARRATION,
        status: isTimeout ? PrismaAiTraceStatus.TIMEOUT : PrismaAiTraceStatus.ERROR,
        latencyMs: elapsed,
        requestPayload,
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
