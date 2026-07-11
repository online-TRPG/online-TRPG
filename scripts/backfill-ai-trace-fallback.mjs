import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const requireReady = process.argv.includes("--require-ready");
const pageSize = 500;
const parseFailureSampleLimit = 100;

function readFailureType(value) {
  return typeof value === "string" && value.toLowerCase().includes("fallback");
}

function inspectTrace(row) {
  if (row.fallbackUsed) {
    return { fallbackUsed: true, source: "existing", parseFailed: false };
  }
  if (readFailureType(row.failureType)) {
    return { fallbackUsed: true, source: "failureType", parseFailed: false };
  }
  if (!row.responseJson) {
    return { fallbackUsed: false, source: "responseAbsent", parseFailed: false };
  }

  let response;
  try {
    response = JSON.parse(row.responseJson);
  } catch {
    return { fallbackUsed: false, source: "invalidJson", parseFailed: true };
  }
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return { fallbackUsed: false, source: "invalidResponseShape", parseFailed: true };
  }
  if (response.fallback === true) {
    return { fallbackUsed: true, source: "response", parseFailed: false };
  }
  if (
    response.trace &&
    typeof response.trace === "object" &&
    !Array.isArray(response.trace) &&
    readFailureType(response.trace.failureType)
  ) {
    return { fallbackUsed: true, source: "responseTrace", parseFailed: false };
  }
  return { fallbackUsed: false, source: "nonFallbackResponse", parseFailed: false };
}

async function main() {
  if (apply && requireReady) {
    throw new Error("--apply and --require-ready cannot be used together.");
  }
  let lastId;
  const stats = {
    mode: apply ? "apply" : "dry-run",
    scanned: 0,
    alreadyTrue: 0,
    matchedByFailureType: 0,
    matchedByResponse: 0,
    matchedByResponseTrace: 0,
    responseAbsentCount: 0,
    nonFallbackResponseCount: 0,
    invalidJsonCount: 0,
    invalidResponseShapeCount: 0,
    classifiedCount: 0,
    wouldUpdate: 0,
    updated: 0,
    parseFailureCount: 0,
    parseFailureIds: [],
  };

  while (true) {
    const rows = await prisma.aiTrace.findMany({
      where: lastId ? { id: { gt: lastId } } : undefined,
      orderBy: { id: "asc" },
      take: pageSize,
      select: {
        id: true,
        fallbackUsed: true,
        failureType: true,
        responseJson: true,
      },
    });
    if (!rows.length) break;

    const idsToUpdate = [];
    for (const row of rows) {
      stats.scanned += 1;
      const inspection = inspectTrace(row);
      if (inspection.source === "existing") stats.alreadyTrue += 1;
      if (inspection.source === "failureType") stats.matchedByFailureType += 1;
      if (inspection.source === "response") stats.matchedByResponse += 1;
      if (inspection.source === "responseTrace") stats.matchedByResponseTrace += 1;
      if (inspection.source === "responseAbsent") stats.responseAbsentCount += 1;
      if (inspection.source === "nonFallbackResponse") stats.nonFallbackResponseCount += 1;
      if (inspection.source === "invalidJson") stats.invalidJsonCount += 1;
      if (inspection.source === "invalidResponseShape") stats.invalidResponseShapeCount += 1;
      if (inspection.parseFailed) {
        stats.parseFailureCount += 1;
        if (stats.parseFailureIds.length < parseFailureSampleLimit) {
          stats.parseFailureIds.push(row.id);
        }
      }
      if (inspection.fallbackUsed && !row.fallbackUsed) {
        idsToUpdate.push(row.id);
      }
    }

    stats.wouldUpdate += idsToUpdate.length;
    if (apply && idsToUpdate.length) {
      const result = await prisma.aiTrace.updateMany({
        where: { id: { in: idsToUpdate }, fallbackUsed: false },
        data: { fallbackUsed: true },
      });
      stats.updated += result.count;
    }

    lastId = rows[rows.length - 1].id;
    if (rows.length < pageSize) break;
  }

  stats.classifiedCount =
    stats.alreadyTrue +
    stats.matchedByFailureType +
    stats.matchedByResponse +
    stats.matchedByResponseTrace +
    stats.responseAbsentCount +
    stats.nonFallbackResponseCount +
    stats.invalidJsonCount +
    stats.invalidResponseShapeCount;
  if (stats.classifiedCount !== stats.scanned) {
    throw new Error(
      `Fallback backfill classification mismatch: scanned=${stats.scanned} classified=${stats.classifiedCount}`,
    );
  }
  process.stdout.write(`${JSON.stringify(stats)}\n`);
  if (requireReady && (stats.wouldUpdate > 0 || stats.parseFailureCount > 0)) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
