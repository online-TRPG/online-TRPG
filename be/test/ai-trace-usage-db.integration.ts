import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  AiTraceKind,
  AiTraceStatus,
  PrismaClient,
} from "@prisma/client";
import type { AiNarrationRequestDto } from "@trpg/shared-types";
import { AiService } from "../src/modules/ai/ai.service";

const databaseUrl = process.env.AI_TRACE_DB_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "AI_TRACE_DB_TEST_DATABASE_URL is required. Use an isolated schema whose name starts with ai_usage_audit_.",
  );
}

const parsedDatabaseUrl = new URL(databaseUrl);
const schema = parsedDatabaseUrl.searchParams.get("schema");
if (!schema?.startsWith("ai_usage_audit_")) {
  throw new Error(
    `Refusing AI trace DB integration test outside an isolated ai_usage_audit_* schema (received ${schema ?? "none"}).`,
  );
}

process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient();
const rollbackMarker = Symbol("ai-trace-db-test-rollback");

type VerificationReport = {
  schema: string;
  trace: {
    status: string;
    latencyMs: number;
    providerLatencyMs: number | null;
    promptTokenCount: number | null;
    outputTokenCount: number | null;
    totalTokenCount: number | null;
  };
  metrics: {
    totalTraces: number;
    averageLatencyMs: number;
    promptTokenP50: number | null;
    outputTokenP50: number | null;
    totalTokenP50: number | null;
    tokenSampleCount: number;
  };
  rolledBack: true;
};

class RollbackVerification extends Error {
  constructor(readonly report: VerificationReport) {
    super("Rollback verified AI trace integration transaction");
  }
}

async function main(): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        const suffix = randomUUID();
        const userId = `ai-trace-audit-user-${suffix}`;
        const sessionId = `ai-trace-audit-session-${suffix}`;

        await tx.user.create({
          data: {
            id: userId,
            displayName: "AI trace integration audit",
          },
        });
        await tx.session.create({
          data: {
            id: sessionId,
            title: "AI trace integration audit",
            hostUserId: userId,
            inviteCode: `AI${suffix.replaceAll("-", "").slice(0, 18)}`,
          },
        });

        const providerLatencyMs = 37;
        const promptTokenCount = 410;
        const outputTokenCount = 23;
        const totalTokenCount = 433;
        const aiClient = {
          runNarrator: async () => {
            await new Promise((resolve) => setTimeout(resolve, 60));
            return {
              parsed: {
                narration: "석문이 천천히 열리며 확인된 통로가 드러납니다.",
              },
              fallback: false,
              fallbackReason: null,
              trace: {
                role: "narrator",
                provider: "google-ai-studio",
                model: "integration-model",
                promptVersion: "narrator.integration.v1",
                latencyMs: 51,
                providerLatencyMs,
                attemptLatenciesMs: [providerLatencyMs],
                schemaValidationRetries: 0,
                attempts: 1,
                failureType: null,
                finishReason: "STOP",
                providerRequestId: "integration-request-1",
                promptTokenCount,
                outputTokenCount,
                cachedTokenCount: null,
                totalTokenCount,
              },
            };
          },
        };
        const sessionsService = {
          ensureMembership: async () => undefined,
        };
        const realtimeEvents = {
          emitChatMessage: () => undefined,
        };
        const gmRuntimeParticipantAccess = {
          ensureJoinedGmRuntimeParticipant: async () => undefined,
        };
        const service = new AiService(
          tx as never,
          sessionsService as never,
          aiClient as never,
          realtimeEvents as never,
          {} as never,
          gmRuntimeParticipantAccess as never,
        );

        const request = {
          action: {
            type: "INTERACT_OBJECT",
            actorCharacterId: "character-1",
            targetId: "stone-door",
            approach: "석문을 연다",
            confidence: 1,
            requiresRoll: false,
          },
          scene: {
            summary: "석문 앞",
            tone: "tense",
          },
          maxLength: 500,
        } as AiNarrationRequestDto;

        const response = await service.runNarration(userId, sessionId, request);
        assert.equal(response.fallback, false);

        const trace = await tx.aiTrace.findFirstOrThrow({
          where: { sessionId },
        });
        assert.equal(trace.kind, AiTraceKind.NARRATION);
        assert.equal(trace.status, AiTraceStatus.SUCCESS);
        assert.ok(
          trace.latencyMs >= 50,
          `backend wall-clock latency must include the delayed AI call; received ${trace.latencyMs}ms`,
        );
        assert.equal(trace.providerLatencyMs, providerLatencyMs);
        assert.equal(trace.promptTokenCount, promptTokenCount);
        assert.equal(trace.outputTokenCount, outputTokenCount);
        assert.equal(trace.totalTokenCount, totalTokenCount);
        assert.deepEqual(trace.attemptLatencies, [providerLatencyMs]);
        assert.equal(trace.schemaValidationRetries, 0);

        const requestReference = JSON.parse(trace.requestJson) as Record<string, unknown>;
        const responseReference = JSON.parse(trace.responseJson ?? "{}") as Record<string, unknown>;
        assert.deepEqual(requestReference, { sessionId });
        assert.deepEqual(Object.keys(responseReference).sort(), [
          "fallback",
          "fallbackReason",
          "parsed",
        ]);

        const metrics = await service.getQualityMetrics(userId, sessionId);
        assert.equal(metrics.totalTraces, 1);
        assert.equal(metrics.averageLatencyMs, trace.latencyMs);
        assert.equal(metrics.roleUsage.length, 1);
        const usage = metrics.roleUsage[0];
        assert.equal(usage.kind, AiTraceKind.NARRATION);
        assert.equal(usage.traceCount, 1);
        assert.equal(usage.promptTokenSampleCount, 1);
        assert.equal(usage.outputTokenSampleCount, 1);
        assert.equal(usage.totalTokenSampleCount, 1);
        assert.equal(usage.promptTokenP50, promptTokenCount);
        assert.equal(usage.outputTokenP50, outputTokenCount);
        assert.equal(usage.totalTokenP50, totalTokenCount);
        assert.equal(usage.providerLatencyP50Ms, providerLatencyMs);
        assert.equal(usage.schemaRetryRate, 0);

        throw new RollbackVerification({
          schema,
          trace: {
            status: trace.status,
            latencyMs: trace.latencyMs,
            providerLatencyMs: trace.providerLatencyMs,
            promptTokenCount: trace.promptTokenCount,
            outputTokenCount: trace.outputTokenCount,
            totalTokenCount: trace.totalTokenCount,
          },
          metrics: {
            totalTraces: metrics.totalTraces,
            averageLatencyMs: metrics.averageLatencyMs,
            promptTokenP50: usage.promptTokenP50,
            outputTokenP50: usage.outputTokenP50,
            totalTokenP50: usage.totalTokenP50,
            tokenSampleCount: usage.totalTokenSampleCount,
          },
          rolledBack: true,
        });
      },
      {
        maxWait: 5_000,
        timeout: 10_000,
      },
    );
    assert.fail(rollbackMarker);
  } catch (error) {
    if (!(error instanceof RollbackVerification)) {
      throw error;
    }
    console.log(JSON.stringify(error.report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
