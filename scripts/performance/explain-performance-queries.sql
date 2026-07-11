-- Read-only PostgreSQL execution-plan checks for the 1x/10x/100x fixtures.
-- Run with psql variables that point at rows inside the selected fixture scale:
--   psql "$DATABASE_URL" \
--     -v session_id='perf_1x_session-0' \
--     -v user_id='perf_1x_user' \
--     -v collaborator_user_id='perf_1x_moderator' \
--     -v prefix='perf_1x_' \
--     -f scripts/performance/explain-performance-queries.sql \
--     > doc/dev-notes/explain-performance-1x.txt
-- Repeat with representative 10x and 100x IDs. ANALYZE executes these SELECTs.

\pset pager off
\set ON_ERROR_STOP on

\echo 'public_scenario_list'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT
  s."id",
  s."title",
  s."startLevel",
  s."recommendedEndLevel",
  p."publishedAt"
FROM "Scenario" AS s
JOIN "ScenarioPublication" AS p ON p."scenarioId" = s."id"
WHERE p."visibility" = 'PUBLIC'
  AND p."moderationStatus" NOT IN ('HIDDEN', 'REMOVED')
ORDER BY p."publishedAt" DESC, s."id" ASC
LIMIT 100;

\echo 'public_scenario_recommended_list'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT s."id", s."title", p."forkCount", p."publishedAt"
FROM "Scenario" AS s
JOIN "ScenarioPublication" AS p ON p."scenarioId" = s."id"
WHERE p."visibility" = 'PUBLIC'
  AND p."moderationStatus" NOT IN ('HIDDEN', 'REMOVED')
ORDER BY p."forkCount" DESC, p."publishedAt" DESC, s."id" ASC
LIMIT 100;

\echo 'public_scenario_level_list'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT
  s."id",
  s."title",
  s."startLevel",
  s."recommendedEndLevel"
FROM "Scenario" AS s
JOIN "ScenarioPublication" AS p ON p."scenarioId" = s."id"
WHERE p."visibility" = 'PUBLIC'
  AND p."moderationStatus" NOT IN ('HIDDEN', 'REMOVED')
  AND s."startLevel" <= 10
  AND (
    s."recommendedEndLevel" >= 3
    OR (s."recommendedEndLevel" IS NULL AND s."startLevel" >= 3)
  )
ORDER BY s."startLevel" ASC, s."recommendedEndLevel" ASC, s."id" ASC
LIMIT 100;

\echo 'scenario_moderation_queue'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT s."id", s."title", p."moderationStatus", p."updatedAt"
FROM "Scenario" AS s
JOIN "ScenarioPublication" AS p ON p."scenarioId" = s."id"
WHERE p."moderationStatus" <> 'VISIBLE'
   OR p."reportCount" > 0
   OR p."appealCount" > 0
ORDER BY p."updatedAt" DESC, s."id" ASC
LIMIT 100;

\echo 'my_scenario_list'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT s."id", s."title", s."updatedAt"
FROM "Scenario" AS s
WHERE s."createdByUserId" = :'collaborator_user_id'
   OR EXISTS (
     SELECT 1
     FROM "ScenarioCollaboratorGrant" AS g
     WHERE g."scenarioId" = s."id"
       AND g."userId" = :'collaborator_user_id'
   )
ORDER BY s."updatedAt" DESC, s."id" ASC
LIMIT 100;

\echo 'scenario_collaborator_grants'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT g."scenarioId", g."role"
FROM "ScenarioCollaboratorGrant" AS g
WHERE g."userId" = :'collaborator_user_id'
ORDER BY g."scenarioId" ASC
LIMIT 100;

\echo 'public_session_list'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT s."id", s."publicId", s."title", s."createdAt"
FROM "Session" AS s
WHERE s."visibility" = 'PUBLIC'
  AND s."status" = 'RECRUITING'
ORDER BY s."createdAt" DESC
LIMIT 20;

\echo 'hosted_session_list'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT s."id", s."title", s."updatedAt"
FROM "Session" AS s
WHERE s."hostUserId" = :'user_id'
ORDER BY s."updatedAt" DESC
LIMIT 100;

\echo 'character_owner_list'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT c."id", c."name", c."createdAt"
FROM "Character" AS c
WHERE c."ownerUserId" = :'user_id'
ORDER BY c."createdAt" DESC
LIMIT 100;

\echo 'scenario_source_list'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT s."id", s."title", s."createdAt"
FROM "Scenario" AS s
WHERE s."sourceType" = 'CLONED'
ORDER BY s."createdAt" DESC
LIMIT 100;

\echo 'scenario_base_forks'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT s."id", s."createdAt"
FROM "Scenario" AS s
WHERE s."baseScenarioId" = :'prefix' || 'scenario-0'
ORDER BY s."createdAt" DESC
LIMIT 100;

\echo 'scenario_nodes'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT n."id", n."nodeType", n."createdAt"
FROM "ScenarioNode" AS n
WHERE n."scenarioId" = :'prefix' || 'scenario-0'
ORDER BY n."createdAt" ASC;

\echo 'active_session_scenarios'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT ss."id", ss."scenarioId"
FROM "SessionScenario" AS ss
WHERE ss."sessionId" = :'session_id'
  AND ss."status" = 'ACTIVE'
ORDER BY ss."id" ASC;

\echo 'turn_log_cursor_page'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT t."id", t."turnNumber", t."outcome", t."createdAt"
FROM "TurnLog" AS t
WHERE t."sessionId" = :'session_id'
  AND t."turnNumber" < 2147483647
ORDER BY t."turnNumber" DESC
LIMIT 101;

\echo 'turn_log_by_player_action'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT t."id", t."turnNumber", t."createdAt"
FROM "TurnLog" AS t
WHERE t."playerActionId" = :'prefix' || 'player-action-0'
ORDER BY t."createdAt" ASC;

\echo 'turn_log_idempotency_lookup'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT t."id"
FROM "TurnLog" AS t
WHERE t."idempotencyKey" = 'missing-performance-probe';

\echo 'ai_trace_cursor_page'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT a."id", a."kind", a."status", a."latencyMs", a."createdAt"
FROM "AiTrace" AS a
WHERE a."sessionId" = :'session_id'
ORDER BY a."createdAt" DESC, a."id" DESC
LIMIT 101;

\echo 'ai_trace_quality_aggregate'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT
  a."kind",
  a."status",
  a."fallbackUsed",
  COUNT(*) AS "traceCount",
  AVG(a."latencyMs") AS "averageLatencyMs"
FROM "AiTrace" AS a
WHERE a."sessionId" = :'session_id'
GROUP BY a."kind", a."status", a."fallbackUsed";

\echo 'recent_revealed_clues'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT r."contentId", r."snapshotJson", r."revealedAt"
FROM "SessionReveal" AS r
WHERE r."sessionScenarioId" = :'prefix' || 'session-scenario-0'
  AND r."contentKind" = 'clue'
ORDER BY r."revealedAt" DESC
LIMIT 50;

\echo 'exact_revealed_clue'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT r."contentId", r."snapshotJson"
FROM "SessionReveal" AS r
WHERE r."sessionScenarioId" = :'prefix' || 'session-scenario-0'
  AND r."contentKind" = 'clue'
  AND r."contentId" = :'prefix' || 'progress-clue-0';

\echo 'exact_node_visit'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT v."nodeId"
FROM "SessionNodeVisit" AS v
WHERE v."sessionScenarioId" = :'prefix' || 'session-scenario-0'
  AND v."nodeId" = :'prefix' || 'progress-node-0';

\echo 'scenario_moderation_linked_sessions'
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT ss."id", ss."sessionId"
FROM "SessionScenario" AS ss
JOIN "Session" AS s ON s."id" = ss."sessionId"
WHERE ss."scenarioId" = (
  SELECT ss2."scenarioId"
  FROM "SessionScenario" AS ss2
  WHERE ss2."sessionId" = :'session_id'
  ORDER BY ss2."sequence" ASC
  LIMIT 1
)
  AND s."status" NOT IN ('COMPLETED', 'DISBANDED')
ORDER BY ss."id" ASC
LIMIT 500;
