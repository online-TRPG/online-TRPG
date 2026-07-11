import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function parseScale() {
  const scale = Number(readArg("scale"));
  if (![1, 10, 100].includes(scale)) {
    throw new Error("--scale must be 1, 10, or 100.");
  }
  return scale;
}

function validatePrefix(value) {
  if (!/^[a-z0-9_-]{3,40}$/i.test(value)) {
    throw new Error("--prefix must contain only 3-40 letters, digits, underscores, or hyphens.");
  }
  return value;
}

async function createManyInBatches(delegate, rows, batchSize = 1000) {
  let created = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const result = await delegate.createMany({
      data: rows.slice(offset, offset + batchSize),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
}

function buildPlan(scale, prefix) {
  const moderationLinkedSessions = scale === 1 ? 1 : scale === 10 ? 100 : 10000;
  const snapshotParticipants = 4 * scale;
  const progressEvidenceRows = 100 * scale;
  return {
    scale,
    prefix,
    counts: {
      users: 2 + snapshotParticipants,
      scenarios: 100 * scale,
      scenarioCollaboratorGrants: 10 * scale,
      scenarioNodes: 1000 * scale,
      sessions: 100 * scale,
      sessionScenarios: 100 * scale,
      sessionScenarioNodes: progressEvidenceRows,
      gameStates: 100 * scale,
      sessionParticipants: snapshotParticipants,
      characters: snapshotParticipants,
      sessionCharacters: snapshotParticipants,
      sessionCharacterResources: snapshotParticipants,
      itemDefinitions: 5,
      inventoryEntries: snapshotParticipants * 5,
      sessionReveals: progressEvidenceRows,
      sessionNodeVisits: progressEvidenceRows,
      playerActions: 1000 * scale,
      turnLogs: 1000 * scale,
      stateDiffs: 1000 * scale,
      aiTraces: 1000 * scale,
      moderationLinkedSessions,
    },
  };
}

function buildPublicScenarioAttribution({ scale, index, userId, publishedAt }) {
  const isReported = index % 20 === 0;
  const revision = {
    revisionNumber: 1,
    publishedAt: publishedAt.toISOString(),
    publishedByUserId: userId,
    status: "public",
  };
  const publicMetadata = {
    tags: ["performance", `${scale}x`],
    estimatedMinutes: 120,
    gmMode: "AI",
    contentWarnings: [],
    ratings: [],
    forkCount: index % 100,
    forkAllowed: true,
    rightsDeclaration: {
      confirmed: true,
      confirmedByUserId: userId,
      confirmedAt: publishedAt.toISOString(),
    },
    moderationStatus: isReported ? "reported" : "visible",
    reports: isReported
      ? [
          {
            reportId: `performance-report-${scale}-${index}`,
            reportedByUserId: userId,
            reason: "other",
            comment: null,
            createdAt: publishedAt.toISOString(),
          },
        ]
      : [],
    appeals: [],
    moderationActions: [],
    lineage: {
      sourceScenarioId: null,
      sourceRevisionId: null,
      forkedFromScenarioId: null,
      forkedAt: null,
      forkedByUserId: null,
    },
  };
  return [
    "PERFORMANCE_FIXTURE",
    `P3_REVISION_META:${JSON.stringify(revision)}`,
    `P5_PUBLIC_META:${JSON.stringify(publicMetadata)}`,
  ].join("\n");
}

async function cleanup(prefix) {
  const sessions = await prisma.session.deleteMany({
    where: { id: { startsWith: prefix } },
  });
  const scenarios = await prisma.scenario.deleteMany({
    where: { id: { startsWith: prefix } },
  });
  const itemDefinitions = await prisma.itemDefinition.deleteMany({
    where: { id: { startsWith: prefix } },
  });
  const users = await prisma.user.deleteMany({
    where: { id: { startsWith: prefix } },
  });
  return {
    sessions: sessions.count,
    scenarios: scenarios.count,
    itemDefinitions: itemDefinitions.count,
    users: users.count,
  };
}

async function assertPrefixIsEmpty(prefix) {
  const [sessions, scenarios, users, itemDefinitions] = await Promise.all([
    prisma.session.count({ where: { id: { startsWith: prefix } } }),
    prisma.scenario.count({ where: { id: { startsWith: prefix } } }),
    prisma.user.count({ where: { id: { startsWith: prefix } } }),
    prisma.itemDefinition.count({ where: { id: { startsWith: prefix } } }),
  ]);
  if (sessions + scenarios + users + itemDefinitions > 0) {
    throw new Error(
      `Fixture prefix ${prefix} already exists. Run --scale=${readArg("scale")} --prefix=${prefix} --cleanup --apply first.`,
    );
  }
}

async function applyPlan(plan) {
  const { prefix, scale } = plan;
  const userId = `${prefix}user`;
  const moderatorUserId = `${prefix}moderator`;
  const snapshotUsers = Array.from(
    { length: plan.counts.sessionParticipants },
    (_, index) => ({
      id: `${prefix}snapshot-user-${index}`,
      publicId: `${prefix}public-snapshot-user-${index}`,
      displayName: `Snapshot User ${scale}x ${index}`,
      role: "USER",
    }),
  );
  const scenarios = Array.from({ length: plan.counts.scenarios }, (_, index) => {
    const publishedAt = new Date(1_735_689_600_000 + index * 1000);
    return {
      id: `${prefix}scenario-${index}`,
      title: `Performance Scenario ${scale}x ${index}`,
      description: "Deterministic scalability fixture",
      createdByUserId: userId,
      sourceType: "CLONED",
      baseScenarioId: index === 0 ? null : `${prefix}scenario-0`,
      ruleSetId: "dnd5e",
      difficulty: "normal",
      startLevel: 1,
      recommendedEndLevel: 5,
      license: "ORIGINAL",
      attribution: buildPublicScenarioAttribution({ scale, index, userId, publishedAt }),
      startNodeId: `${prefix}scenario-${index}-node-0`,
      npcsJson: "[]",
    };
  });
  const nodesPerScenario = plan.counts.scenarioNodes / plan.counts.scenarios;
  const scenarioNodes = scenarios.flatMap((scenario) =>
    Array.from({ length: nodesPerScenario }, (_, nodeIndex) => ({
      id: `${scenario.id}-node-${nodeIndex}`,
      scenarioId: scenario.id,
      nodeType: nodeIndex % 5 === 0 ? "combat" : "story",
      title: `Node ${nodeIndex}`,
      sceneText: `Performance fixture node ${nodeIndex}`,
      checkOptionsJson: "[]",
      transitionsJson:
        nodeIndex + 1 < nodesPerScenario
          ? JSON.stringify([{ condition: "default", nextNodeId: `${scenario.id}-node-${nodeIndex + 1}` }])
          : "[]",
      cluesJson: JSON.stringify([
        { id: `${scenario.id}-clue-${nodeIndex}`, title: `Clue ${nodeIndex}`, text: "Fixture clue" },
      ]),
    })),
  );
  const sessions = Array.from({ length: plan.counts.sessions }, (_, index) => ({
    id: `${prefix}session-${index}`,
    publicId: `${prefix}public-session-${index}`,
    title: `Performance Session ${scale}x ${index}`,
    description: "Deterministic scalability fixture",
    hostUserId: userId,
    inviteCode: `${prefix}invite-${index}`,
    status: index % 3 === 0 ? "PLAYING" : "RECRUITING",
    visibility: "PUBLIC",
    maxParticipants: index === 0 ? plan.counts.sessionParticipants : 4,
    ruleSetId: "dnd5e",
    gmMode: "AI",
  }));
  const sessionScenarios = sessions.map((session, index) => ({
    id: `${prefix}session-scenario-${index}`,
    sessionId: session.id,
    scenarioId:
      index < plan.counts.moderationLinkedSessions
        ? scenarios[0].id
        : scenarios[1 + ((index - plan.counts.moderationLinkedSessions) % (scenarios.length - 1))].id,
    sequence: 0,
    status: "ACTIVE",
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
  }));
  const gameStates = sessionScenarios.map((sessionScenario) => ({
    sessionScenarioId: sessionScenario.id,
    version:
      sessionScenario.id === `${prefix}session-scenario-0`
        ? plan.counts.stateDiffs + 1
        : 1,
    currentNodeId:
      sessionScenario.id === `${prefix}session-scenario-0`
        ? `${prefix}progress-node-0`
        : `${sessionScenario.scenarioId}-node-0`,
    phase: "EXPLORATION",
    flagsJson: "{}",
  }));
  const historySession = sessions[0];
  const historySessionScenario = sessionScenarios[0];
  const snapshotParticipants = snapshotUsers.map((user, index) => ({
    id: `${prefix}snapshot-participant-${index}`,
    sessionId: historySession.id,
    userId: user.id,
    role: "PLAYER",
    status: "JOINED",
    connectionStatus: index % 2 === 0 ? "ONLINE" : "OFFLINE",
    isReady: true,
    readyAt: new Date("2026-01-01T00:00:00.000Z"),
    joinedAt: new Date(1_735_689_600_000 + index * 1000),
  }));
  const snapshotCharacters = snapshotUsers.map((_user, index) => ({
    id: `${prefix}snapshot-character-${index}`,
    ownerUserId: userId,
    name: `Snapshot Character ${index}`,
    ancestry: "Human",
    className: index % 2 === 0 ? "Fighter" : "Wizard",
    level: 5,
    abilitiesJson: JSON.stringify({ str: 14, dex: 12, con: 14, int: 12, wis: 10, cha: 10 }),
    proficiencyBonus: 3,
    proficientSkillsJson: "[]",
    maxHp: 30,
    armorClass: 15,
    speed: 30,
    inventoryJson: "[]",
  }));
  const snapshotSessionCharacters = snapshotCharacters.map((character, index) => ({
    id: `${prefix}snapshot-session-character-${index}`,
    sessionId: historySession.id,
    userId: snapshotUsers[index].id,
    characterId: character.id,
    status: "ACTIVE",
    currentHp: 30 - (index % 10),
    tempHp: index % 3,
    conditionsJson: index % 7 === 0 ? JSON.stringify(["poisoned"]) : "[]",
    inventorySnapshotJson: "[]",
  }));
  const snapshotResources = snapshotSessionCharacters.map((sessionCharacter, index) => ({
    sessionCharacterId: sessionCharacter.id,
    secondWindAvailable: index % 2 === 0,
    actionSurgeUses: index % 3,
    rageUses: 0,
    rageActive: false,
    frenzyActive: false,
    exhaustionLevel: 0,
    hitDiceSpent: index % 5,
  }));
  const itemDefinitions = Array.from({ length: plan.counts.itemDefinitions }, (_, index) => ({
    id: `${prefix}item-${index}`,
    name: `Snapshot Item ${index}`,
    itemType: index === 0 ? "weapon" : "gear",
    description: "Deterministic snapshot fixture item",
  }));
  const inventoryEntries = snapshotSessionCharacters.flatMap((sessionCharacter, characterIndex) =>
    itemDefinitions.map((itemDefinition, itemIndex) => ({
      id: `${prefix}inventory-${characterIndex}-${itemIndex}`,
      sessionCharacterId: sessionCharacter.id,
      itemDefinitionId: itemDefinition.id,
      quantity: 1 + ((characterIndex + itemIndex) % 3),
    })),
  );
  const sessionScenarioNodes = Array.from(
    { length: plan.counts.sessionScenarioNodes },
    (_, index) => ({
      id: `${prefix}progress-session-node-${index}`,
      sessionScenarioId: historySessionScenario.id,
      nodeId: `${prefix}progress-node-${index}`,
      nodeType: index % 5 === 0 ? "combat" : "story",
      title: `Progress Node ${index}`,
      sceneText: `Progress fixture scene ${index}`,
      checkOptionsJson: "[]",
      transitionsJson:
        index + 1 < plan.counts.sessionScenarioNodes
          ? JSON.stringify([
              {
                condition: "default",
                nextNodeId: `${prefix}progress-node-${index + 1}`,
              },
            ])
          : "[]",
      cluesJson: JSON.stringify([
        {
          id: `${prefix}progress-clue-${index}`,
          title: `Progress Clue ${index}`,
          handoutText: `Progress evidence ${index}`,
        },
      ]),
    }),
  );
  const sessionReveals = sessionScenarioNodes.map((node, index) => ({
    id: `${prefix}progress-reveal-${index}`,
    sessionScenarioId: historySessionScenario.id,
    contentId: `${prefix}progress-clue-${index}`,
    contentKind: "clue",
    scope: "party",
    recipientKey: "party",
    revealedAt: new Date(1_735_689_600_000 + index * 1000),
    revealedBy: "system",
    reason: "performance_fixture",
    snapshotJson: JSON.stringify({
      title: `Progress Clue ${index}`,
      handoutText: `Progress evidence ${index}`,
    }),
  }));
  const sessionNodeVisits = sessionScenarioNodes.map((node, index) => ({
    id: `${prefix}progress-visit-${index}`,
    sessionScenarioId: historySessionScenario.id,
    sessionScenarioNodeId: node.id,
    nodeId: node.nodeId,
    firstVisitedAt: new Date(1_735_689_600_000 + index * 1000),
    lastVisitedAt: new Date(1_735_689_600_000 + index * 1000),
    visitCount: 1,
  }));
  const playerActions = Array.from({ length: plan.counts.playerActions }, (_, index) => ({
    id: `${prefix}player-action-${index}`,
    sessionId: historySession.id,
    userId,
    rawText: `fixture action ${index}`,
    inputType: "TEXT",
    actionScope: "PARTY_SHARED",
    queueStatus: "COMPLETED",
    baseStateVersion: index + 1,
    clientCreatedAt: new Date(1_735_689_600_000 + index * 1000),
    processedAt: new Date(1_735_689_600_100 + index * 1000),
    createdAt: new Date(1_735_689_600_000 + index * 1000),
  }));
  const turnLogs = Array.from({ length: plan.counts.turnLogs }, (_, index) => ({
    id: `${prefix}turn-log-${index}`,
    sessionId: historySession.id,
    sessionScenarioId: historySessionScenario.id,
    playerActionId: playerActions[index].id,
    actorUserId: userId,
    turnNumber: index + 1,
    rawInput: `fixture action ${index}`,
    structuredActionJson: JSON.stringify({ type: "fixture", index }),
    outcome: index % 10 === 0 ? "FAILURE" : "SUCCESS",
    narration: `Fixture turn ${index}`,
    createdAt: new Date(1_735_689_600_000 + index * 1000),
  }));
  const stateDiffs = turnLogs.map((turnLog, index) => ({
    id: `${prefix}state-diff-${index}`,
    sessionScenarioId: historySessionScenario.id,
    turnLogId: turnLog.id,
    baseVersion: index + 1,
    nextVersion: index + 2,
    diffJson: JSON.stringify({ fixture: true, index }),
    reason: "performance_fixture",
    createdAt: new Date(1_735_689_600_200 + index * 1000),
  }));
  const aiTraces = Array.from({ length: plan.counts.aiTraces }, (_, index) => ({
    id: `${prefix}ai-trace-${index}`,
    sessionId: historySession.id,
    userId,
    kind: index % 5 === 0 ? "INTERPRETER" : "NARRATION",
    status: index % 50 === 0 ? "TIMEOUT" : "SUCCESS",
    latencyMs: 50 + (index % 500),
    provider: "fixture",
    model: "fixture",
    promptVersion: "performance-v1",
    attempts: 1,
    fallbackUsed: index % 25 === 0,
    requestJson: JSON.stringify({ index }),
    responseJson: JSON.stringify({ ok: true, index }),
    createdAt: new Date(1_735_689_600_000 + index * 1000),
  }));
  const collaboratorGrants = scenarios
    .filter((_scenario, index) => index % 10 === 0)
    .map((scenario) => ({
      scenarioId: scenario.id,
      userId: moderatorUserId,
      role: "viewer",
    }));

  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      publicId: `${prefix}public-user`,
      displayName: `Performance ${scale}x`,
      role: "USER",
    },
    update: { displayName: `Performance ${scale}x`, role: "USER" },
  });
  await prisma.user.upsert({
    where: { id: moderatorUserId },
    create: {
      id: moderatorUserId,
      publicId: `${prefix}public-moderator`,
      displayName: `Performance Moderator ${scale}x`,
      role: "MODERATOR",
    },
    update: { displayName: `Performance Moderator ${scale}x`, role: "MODERATOR" },
  });
  const result = {};
  result.snapshotUsers = await createManyInBatches(prisma.user, snapshotUsers);
  result.scenarios = await createManyInBatches(prisma.scenario, scenarios);
  result.publications = await createManyInBatches(
    prisma.scenarioPublication,
    scenarios.map((scenario, index) => ({
      scenarioId: scenario.id,
      visibility: "PUBLIC",
      moderationStatus: index % 20 === 0 ? "REPORTED" : "VISIBLE",
      publishedAt: new Date(1_735_689_600_000 + index * 1000),
      revisionNumber: 1,
      forkCount: index % 100,
      reportCount: index % 20 === 0 ? 1 : 0,
      gmMode: "AI",
      tags: ["performance", `${scale}x`],
    })),
  );
  result.collaboratorGrants = await createManyInBatches(
    prisma.scenarioCollaboratorGrant,
    collaboratorGrants,
  );
  result.scenarioNodes = await createManyInBatches(prisma.scenarioNode, scenarioNodes);
  result.sessions = await createManyInBatches(prisma.session, sessions);
  result.snapshotParticipants = await createManyInBatches(
    prisma.sessionParticipant,
    snapshotParticipants,
  );
  result.snapshotCharacters = await createManyInBatches(prisma.character, snapshotCharacters);
  result.snapshotSessionCharacters = await createManyInBatches(
    prisma.sessionCharacter,
    snapshotSessionCharacters,
  );
  result.snapshotResources = await createManyInBatches(
    prisma.sessionCharacterResource,
    snapshotResources,
  );
  result.itemDefinitions = await createManyInBatches(prisma.itemDefinition, itemDefinitions);
  result.inventoryEntries = await createManyInBatches(prisma.inventoryEntry, inventoryEntries);
  result.sessionScenarios = await createManyInBatches(prisma.sessionScenario, sessionScenarios);
  result.sessionScenarioNodes = await createManyInBatches(
    prisma.sessionScenarioNode,
    sessionScenarioNodes,
  );
  result.gameStates = await createManyInBatches(prisma.gameState, gameStates);
  result.sessionReveals = await createManyInBatches(prisma.sessionReveal, sessionReveals);
  result.sessionNodeVisits = await createManyInBatches(
    prisma.sessionNodeVisit,
    sessionNodeVisits,
  );
  result.playerActions = await createManyInBatches(prisma.playerAction, playerActions);
  result.turnLogs = await createManyInBatches(prisma.turnLog, turnLogs);
  result.stateDiffs = await createManyInBatches(prisma.stateDiff, stateDiffs);
  result.aiTraces = await createManyInBatches(prisma.aiTrace, aiTraces);
  return result;
}

async function main() {
  const scale = parseScale();
  const prefix = validatePrefix(readArg("prefix", `perf_${scale}x_`));
  const apply = process.argv.includes("--apply");
  const shouldCleanup = process.argv.includes("--cleanup");
  const plan = buildPlan(scale, prefix);

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", operation: shouldCleanup ? "cleanup" : "seed", ...plan }, null, 2));
    return;
  }
  if (shouldCleanup) {
    console.log(JSON.stringify({ mode: "apply", operation: "cleanup", prefix, deleted: await cleanup(prefix) }, null, 2));
    return;
  }
  await assertPrefixIsEmpty(prefix);
  console.log(JSON.stringify({ mode: "apply", operation: "seed", ...plan, created: await applyPlan(plan) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
