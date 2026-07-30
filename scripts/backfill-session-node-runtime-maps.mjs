import { PrismaClient } from "@prisma/client";
import { decodeVttMapState } from "@trpg/shared-types";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const requireReady = process.argv.includes("--require-ready");

const stats = {
  mode: apply ? "apply" : "dry-run",
  scanned: 0,
  ready: 0,
  applied: 0,
  currentNodeMissing: 0,
  flagsInvalid: 0,
  mapInvalid: 0,
  nodeIdMismatch: 0,
  nodeSnapshotMissing: 0,
  runtimeAlreadyExists: 0,
  orphanSessions: 0,
  orphanSessionsByStatus: {},
  orphanSessionDetails: [],
  blockingExcluded: [],
  blockingPlayingOrphans: [],
  excluded: [],
};

function exclude(sessionScenarioId, reason, sessionStatus) {
  stats.excluded.push({ sessionScenarioId, reason, sessionStatus });
  stats[reason] += 1;
}

function readFlags(value) {
  if (!value) return null;
  const parsed = JSON.parse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : null;
}

async function main() {
  const orphanSessions = await prisma.session.findMany({
    where: { sessionScenarios: { none: {} } },
    select: { id: true, status: true },
    orderBy: { id: "asc" },
  });
  stats.orphanSessions = orphanSessions.length;
  stats.orphanSessionDetails = orphanSessions.map((session) => ({
    sessionId: session.id,
    status: session.status,
  }));
  for (const session of orphanSessions) {
    stats.orphanSessionsByStatus[session.status] =
      (stats.orphanSessionsByStatus[session.status] ?? 0) + 1;
  }
  const links = await prisma.sessionScenario.findMany({
    select: {
      id: true,
      session: {
        select: {
          status: true,
        },
      },
      gameState: {
        select: {
          currentNodeId: true,
          flagsJson: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  for (const link of links) {
    stats.scanned += 1;
    const nodeId = link.gameState?.currentNodeId;
    if (!nodeId) {
      exclude(link.id, "currentNodeMissing", link.session.status);
      continue;
    }
    const existing = await prisma.sessionScenarioNodeRuntimeState.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: link.id,
          nodeId,
        },
      },
      select: { sessionScenarioId: true },
    });
    if (existing) {
      exclude(link.id, "runtimeAlreadyExists", link.session.status);
      continue;
    }
    const node = await prisma.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: link.id,
          nodeId,
        },
      },
      select: { nodeId: true },
    });
    if (!node) {
      exclude(link.id, "nodeSnapshotMissing", link.session.status);
      continue;
    }

    let flags;
    try {
      flags = readFlags(link.gameState?.flagsJson);
    } catch {
      exclude(link.id, "flagsInvalid", link.session.status);
      continue;
    }
    if (!flags || !flags.vttMap) {
      exclude(link.id, "mapInvalid", link.session.status);
      continue;
    }

    let map;
    try {
      map = decodeVttMapState(flags.vttMap);
    } catch {
      exclude(link.id, "mapInvalid", link.session.status);
      continue;
    }
    if (map.scenarioNodeId && map.scenarioNodeId !== nodeId) {
      exclude(link.id, "nodeIdMismatch", link.session.status);
      continue;
    }

    const normalizedMap = {
      ...map,
      scenarioNodeId: nodeId,
    };
    stats.ready += 1;
    if (apply) {
      await prisma.sessionScenarioNodeRuntimeState.create({
        data: {
          sessionScenarioId: link.id,
          nodeId,
          vttMapJson: JSON.stringify(normalizedMap),
        },
      });
      stats.applied += 1;
    }
  }

  stats.blockingExcluded = stats.excluded.filter(
    (entry) =>
      entry.reason !== "runtimeAlreadyExists" &&
      !(
        entry.reason === "currentNodeMissing" &&
        entry.sessionStatus !== "PLAYING"
      ),
  );
  stats.blockingPlayingOrphans = stats.orphanSessionDetails.filter(
    (session) => session.status === "PLAYING",
  );
  console.log(JSON.stringify(stats, null, 2));
  if (
    requireReady &&
    (stats.ready > 0 ||
      stats.blockingExcluded.length > 0 ||
      stats.blockingPlayingOrphans.length > 0)
  ) {
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
