-- Clean up stale active combats that conflict with an already-exploration game state.
UPDATE "Combat" AS c
SET
  "status" = 'ENDED',
  "endedAt" = COALESCE(c."endedAt", NOW()),
  "currentParticipantId" = NULL
FROM "SessionScenario" AS ss
JOIN "GameState" AS gs ON gs."sessionScenarioId" = ss."id"
WHERE
  c."sessionScenarioId" = ss."id"
  AND c."status" = 'ACTIVE'
  AND gs."phase" <> 'COMBAT'
  AND gs."currentNodeId" IS NOT NULL
  AND (COALESCE(gs."flagsJson", '{}')::jsonb -> 'completedCombatNodeIds') ? gs."currentNodeId";

-- If older data still has more than one active combat in a combat phase, keep only the
-- newest active combat and close the rest so the unique index can be created.
WITH ranked_active_combats AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "sessionId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS active_rank
  FROM "Combat"
  WHERE "status" = 'ACTIVE'
)
UPDATE "Combat" AS c
SET
  "status" = 'ENDED',
  "endedAt" = COALESCE(c."endedAt", NOW()),
  "currentParticipantId" = NULL
FROM ranked_active_combats AS ranked
WHERE c."id" = ranked."id" AND ranked.active_rank > 1;

-- A session can have at most one active combat. Prisma cannot express partial unique
-- indexes, so keep this invariant as SQL migration.
CREATE UNIQUE INDEX IF NOT EXISTS "combat_one_active_per_session"
ON "Combat" ("sessionId")
WHERE "status" = 'ACTIVE';
