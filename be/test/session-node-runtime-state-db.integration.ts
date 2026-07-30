import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const missingRuntimeRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM "SessionScenario" ss
    JOIN "Session" s ON s.id = ss."sessionId"
    JOIN "GameState" gs ON gs."sessionScenarioId" = ss.id
    LEFT JOIN "SessionScenarioNodeRuntimeState" runtime
      ON runtime."sessionScenarioId" = ss.id
     AND runtime."nodeId" = gs."currentNodeId"
    WHERE s.status = 'PLAYING'
      AND gs."currentNodeId" IS NOT NULL
      AND runtime."sessionScenarioId" IS NULL
  `;
  const nodeMismatchRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM "SessionScenarioNodeRuntimeState"
    WHERE ("vttMapJson"::jsonb ->> 'scenarioNodeId') IS DISTINCT FROM "nodeId"
  `;
  const orphanPlayingSessionRows = await prisma.$queryRaw<
    Array<{ count: bigint }>
  >`
    SELECT COUNT(*) AS count
    FROM "Session" s
    LEFT JOIN "SessionScenario" ss ON ss."sessionId" = s.id
    WHERE s.status = 'PLAYING'
      AND ss.id IS NULL
  `;

  const result = {
    missingRuntime: Number(missingRuntimeRows[0]?.count ?? 0),
    nodeMismatch: Number(nodeMismatchRows[0]?.count ?? 0),
    orphanPlayingSessions: Number(
      orphanPlayingSessionRows[0]?.count ?? 0,
    ),
  };
  console.log(JSON.stringify(result, null, 2));
  if (Object.values(result).some((count) => count > 0)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
