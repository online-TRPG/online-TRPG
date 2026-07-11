-- Read-only verification after one moderation API call against a performance fixture.
-- Example:
--   psql "$DATABASE_URL" \
--     -v prefix='perf_10x_' \
--     -v action_id='scenario-action:replace-me' \
--     -f scripts/performance/verify-moderation-fanout.sql

\pset pager off
\set ON_ERROR_STOP on

\echo 'fixture_and_fanout_counts'
SELECT
  :'prefix' AS "prefix",
  (SELECT COUNT(*) FROM "Scenario" WHERE left("id", length(:'prefix')) = :'prefix') AS "scenarioCount",
  (SELECT COUNT(*) FROM "Session" WHERE left("id", length(:'prefix')) = :'prefix') AS "sessionCount",
  (
    SELECT COUNT(*)
    FROM "SessionScenario" AS ss
    JOIN "Session" AS s ON s."id" = ss."sessionId"
    WHERE ss."scenarioId" = :'prefix' || 'scenario-0'
      AND s."status" NOT IN ('COMPLETED', 'DISBANDED')
  ) AS "activeLinkedSessionScenarioCount";

\echo 'moderation_log_result'
SELECT
  :'action_id' AS "actionId",
  COUNT(*) AS "turnLogCount",
  COUNT(DISTINCT "idempotencyKey") AS "distinctIdempotencyKeyCount"
FROM "TurnLog"
WHERE left("idempotencyKey", length(:'action_id') + 1) = :'action_id' || ':';

\echo 'missing_linked_session_logs'
SELECT COUNT(*) AS "missingCount"
FROM "SessionScenario" AS ss
JOIN "Session" AS s ON s."id" = ss."sessionId"
LEFT JOIN "TurnLog" AS t
  ON t."idempotencyKey" = :'action_id' || ':' || ss."id"
WHERE ss."scenarioId" = :'prefix' || 'scenario-0'
  AND s."status" NOT IN ('COMPLETED', 'DISBANDED')
  AND t."id" IS NULL;

\echo 'duplicate_idempotency_keys'
SELECT "idempotencyKey", COUNT(*) AS "duplicateCount"
FROM "TurnLog"
WHERE left("idempotencyKey", length(:'action_id') + 1) = :'action_id' || ':'
GROUP BY "idempotencyKey"
HAVING COUNT(*) > 1;
