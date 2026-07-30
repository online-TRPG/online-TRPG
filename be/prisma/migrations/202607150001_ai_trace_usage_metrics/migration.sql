ALTER TYPE "AiTraceKind" ADD VALUE IF NOT EXISTS 'CHECK_RESULT';

ALTER TABLE "AiTrace"
ADD COLUMN "providerLatencyMs" INTEGER,
ADD COLUMN "attemptLatencies" JSONB,
ADD COLUMN "schemaValidationRetries" INTEGER,
ADD COLUMN "promptTokenCount" INTEGER,
ADD COLUMN "outputTokenCount" INTEGER,
ADD COLUMN "cachedTokenCount" INTEGER,
ADD COLUMN "totalTokenCount" INTEGER;

CREATE INDEX "AiTrace_sessionId_kind_promptVersion_model_idx"
ON "AiTrace"("sessionId", "kind", "promptVersion", "model");
