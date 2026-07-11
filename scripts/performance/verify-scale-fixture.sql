-- Read-only cardinality and integrity checks for seed-scale.mjs fixtures.
-- Example:
--   psql "$DATABASE_URL" -v scale=10 -v prefix='perf_10x_' \
--     -f scripts/performance/verify-scale-fixture.sql

\pset pager off
\set ON_ERROR_STOP on

WITH expected AS (
  SELECT
    :scale::bigint AS scale,
    CASE :scale::integer WHEN 1 THEN 1 WHEN 10 THEN 100 WHEN 100 THEN 10000 END::bigint
      AS moderation_links
), fixture_counts AS (
  SELECT 'users' AS metric, count(*)::bigint AS actual, 2 + 4 * e.scale AS expected
  FROM "User", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'scenarios', count(*)::bigint, 100 * e.scale
  FROM "Scenario", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'scenario_publications', count(*)::bigint, 100 * e.scale
  FROM "ScenarioPublication", expected e WHERE left("scenarioId", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'scenario_collaborator_grants', count(*)::bigint, 10 * e.scale
  FROM "ScenarioCollaboratorGrant", expected e WHERE left("scenarioId", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'scenario_nodes', count(*)::bigint, 1000 * e.scale
  FROM "ScenarioNode", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'sessions', count(*)::bigint, 100 * e.scale
  FROM "Session", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'session_scenarios', count(*)::bigint, 100 * e.scale
  FROM "SessionScenario", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'session_scenario_nodes', count(*)::bigint, 100 * e.scale
  FROM "SessionScenarioNode", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'game_states', count(*)::bigint, 100 * e.scale
  FROM "GameState", expected e WHERE left("sessionScenarioId", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'session_participants', count(*)::bigint, 4 * e.scale
  FROM "SessionParticipant", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'characters', count(*)::bigint, 4 * e.scale
  FROM "Character", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'session_characters', count(*)::bigint, 4 * e.scale
  FROM "SessionCharacter", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'session_character_resources', count(*)::bigint, 4 * e.scale
  FROM "SessionCharacterResource", expected e
  WHERE left("sessionCharacterId", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'item_definitions', count(*)::bigint, 5::bigint
  FROM "ItemDefinition", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'inventory_entries', count(*)::bigint, 20 * e.scale
  FROM "InventoryEntry", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'session_reveals', count(*)::bigint, 100 * e.scale
  FROM "SessionReveal", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'session_node_visits', count(*)::bigint, 100 * e.scale
  FROM "SessionNodeVisit", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'player_actions', count(*)::bigint, 1000 * e.scale
  FROM "PlayerAction", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'turn_logs', count(*)::bigint, 1000 * e.scale
  FROM "TurnLog", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'state_diffs', count(*)::bigint, 1000 * e.scale
  FROM "StateDiff", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'ai_traces', count(*)::bigint, 1000 * e.scale
  FROM "AiTrace", expected e WHERE left("id", length(:'prefix')) = :'prefix'
  GROUP BY e.scale
  UNION ALL
  SELECT 'moderation_linked_sessions', count(*)::bigint, e.moderation_links
  FROM "SessionScenario" ss, expected e
  WHERE ss."scenarioId" = :'prefix' || 'scenario-0'
  GROUP BY e.moderation_links
)
SELECT metric, actual, expected, actual = expected AS pass
FROM fixture_counts
ORDER BY metric;

\echo 'fixture_integrity'
SELECT
  count(*) FILTER (WHERE s."sourceType" <> 'CLONED') AS non_cloned_scenarios,
  count(*) FILTER (
    WHERE p."scenarioId" IS NULL
       OR p."visibility" <> 'PUBLIC'
       OR p."moderationStatus" NOT IN ('VISIBLE', 'REPORTED')
  ) AS invalid_publications,
  count(*) FILTER (WHERE s."attribution" NOT LIKE '%P3_REVISION_META:%') AS missing_revision_markers,
  count(*) FILTER (WHERE s."attribution" NOT LIKE '%P5_PUBLIC_META:%') AS missing_public_markers
FROM "Scenario" s
LEFT JOIN "ScenarioPublication" p ON p."scenarioId" = s."id"
WHERE left(s."id", length(:'prefix')) = :'prefix';

\echo 'fixture_relationship_orphans'
SELECT
  (SELECT count(*)
   FROM "SessionCharacter" sc
   LEFT JOIN "SessionParticipant" sp
     ON sp."sessionId" = sc."sessionId" AND sp."userId" = sc."userId"
   WHERE left(sc."id", length(:'prefix')) = :'prefix' AND sp."id" IS NULL) AS session_character_without_participant,
  (SELECT count(*)
   FROM "InventoryEntry" ie
   LEFT JOIN "ItemDefinition" i ON i."id" = ie."itemDefinitionId"
   WHERE left(ie."id", length(:'prefix')) = :'prefix' AND i."id" IS NULL) AS inventory_without_definition,
  (SELECT count(*)
   FROM "StateDiff" d
   LEFT JOIN "TurnLog" t ON t."id" = d."turnLogId"
   WHERE left(d."id", length(:'prefix')) = :'prefix' AND t."id" IS NULL) AS state_diff_without_turn_log;
