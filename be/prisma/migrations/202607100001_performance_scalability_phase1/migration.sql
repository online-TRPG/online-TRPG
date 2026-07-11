ALTER TABLE "AiTrace"
ADD COLUMN IF NOT EXISTS "fallbackUsed" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "TurnLog"
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

UPDATE "AiTrace"
SET "fallbackUsed" = TRUE
WHERE LOWER("failureType") LIKE '%fallback%';

CREATE INDEX IF NOT EXISTS "Session_visibility_status_createdAt_idx"
ON "Session" ("visibility", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Session_hostUserId_updatedAt_idx"
ON "Session" ("hostUserId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Character_ownerUserId_createdAt_idx"
ON "Character" ("ownerUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "Scenario_createdByUserId_updatedAt_id_idx"
ON "Scenario" ("createdByUserId", "updatedAt" DESC, "id" ASC);

CREATE INDEX IF NOT EXISTS "Scenario_sourceType_createdAt_idx"
ON "Scenario" ("sourceType", "createdAt");

CREATE INDEX IF NOT EXISTS "Scenario_baseScenarioId_createdAt_idx"
ON "Scenario" ("baseScenarioId", "createdAt");

CREATE INDEX IF NOT EXISTS "Scenario_startLevel_recommendedEndLevel_id_idx"
ON "Scenario" ("startLevel", "recommendedEndLevel", "id");

CREATE INDEX IF NOT EXISTS "ScenarioNode_scenarioId_createdAt_idx"
ON "ScenarioNode" ("scenarioId", "createdAt");

CREATE INDEX IF NOT EXISTS "SessionScenario_scenarioId_id_sessionId_idx"
ON "SessionScenario" ("scenarioId", "id", "sessionId");

CREATE INDEX IF NOT EXISTS "SessionScenario_sessionId_status_idx"
ON "SessionScenario" ("sessionId", "status");

CREATE INDEX IF NOT EXISTS "TurnLog_playerActionId_createdAt_idx"
ON "TurnLog" ("playerActionId", "createdAt");

CREATE INDEX IF NOT EXISTS "AiTrace_sessionId_createdAt_id_idx"
ON "AiTrace" ("sessionId", "createdAt", "id");

DROP INDEX IF EXISTS "AiTrace_sessionId_createdAt_idx";

CREATE INDEX IF NOT EXISTS "AiTrace_sessionId_kind_status_createdAt_id_idx"
ON "AiTrace" ("sessionId", "kind", "status", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "SessionReveal_sessionScenarioId_contentKind_revealedAt_idx"
ON "SessionReveal" ("sessionScenarioId", "contentKind", "revealedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "TurnLog_idempotencyKey_key"
ON "TurnLog" ("idempotencyKey");

CREATE TABLE IF NOT EXISTS "ScenarioPublication" (
  "scenarioId" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'UNPUBLISHED',
  "moderationStatus" TEXT NOT NULL DEFAULT 'VISIBLE',
  "publishedAt" TIMESTAMP(3),
  "revisionNumber" INTEGER,
  "forkCount" INTEGER NOT NULL DEFAULT 0,
  "reportCount" INTEGER NOT NULL DEFAULT 0,
  "appealCount" INTEGER NOT NULL DEFAULT 0,
  "gmMode" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScenarioPublication_pkey" PRIMARY KEY ("scenarioId"),
  CONSTRAINT "ScenarioPublication_scenarioId_fkey"
    FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ScenarioCollaboratorGrant" (
  "scenarioId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScenarioCollaboratorGrant_pkey" PRIMARY KEY ("scenarioId", "userId"),
  CONSTRAINT "ScenarioCollaboratorGrant_scenarioId_fkey"
    FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScenarioCollaboratorGrant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ScenarioPublication_visibility_publishedAt_scenarioId_idx"
ON "ScenarioPublication" ("visibility", "publishedAt" DESC, "scenarioId" ASC);

CREATE INDEX IF NOT EXISTS "ScenarioPublication_moderationStatus_updatedAt_scenarioId_idx"
ON "ScenarioPublication" ("moderationStatus", "updatedAt" DESC, "scenarioId" ASC);

CREATE INDEX IF NOT EXISTS "ScenarioPublication_updatedAt_scenarioId_idx"
ON "ScenarioPublication" ("updatedAt" DESC, "scenarioId" ASC);

CREATE INDEX IF NOT EXISTS "ScenarioPublication_visibility_forkCount_publishedAt_scenarioId_idx"
ON "ScenarioPublication" ("visibility", "forkCount" DESC, "publishedAt" DESC, "scenarioId" ASC);

CREATE INDEX IF NOT EXISTS "ScenarioCollaboratorGrant_userId_scenarioId_idx"
ON "ScenarioCollaboratorGrant" ("userId", "scenarioId");
