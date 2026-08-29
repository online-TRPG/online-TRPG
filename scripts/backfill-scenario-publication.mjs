import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const requireReady = process.argv.includes('--require-ready');
const pageSize = 200;
const failureSampleLimit = 100;
const activeAppealStatuses = new Set(['submitted', 'under_review']);
const providedScenarioIds = new Set([
  'scenario_goblin_cave',
  'scenario_p1_ember_ruins',
  'scenario_p2_storm_vault',
  'scenario_p3_skybreaker_archive',
  'scenario_p4_storm_crown_campaign',
  'scenario_p5_astral_seal_campaign',
  'scenario_p6_eternal_storm_citadel',
]);

function parseMarker(attribution, marker) {
  if (!attribution) return { value: null, invalid: false };
  const lines = attribution.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith(marker)) continue;
    try {
      const parsed = JSON.parse(lines[index].slice(marker.length));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { value: parsed, invalid: false }
        : { value: null, invalid: true };
    } catch {
      return { value: null, invalid: true };
    }
  }
  return { value: null, invalid: false };
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim())
    : [];
}

function countAppeals(value, predicate = () => true) {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === 'object' && predicate(entry)).length
    : 0;
}

function sameDate(left, right) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function publicationMatches(current, expected) {
  return Boolean(
    current &&
      current.visibility === expected.visibility &&
      current.moderationStatus === expected.moderationStatus &&
      sameDate(current.publishedAt, expected.publishedAt) &&
      current.revisionNumber === expected.revisionNumber &&
      current.forkCount === expected.forkCount &&
      current.reportCount === expected.reportCount &&
      current.appealCount === expected.appealCount &&
      current.gmMode === expected.gmMode &&
      sameStringArray(current.tags, expected.tags) &&
      current.estimatedMinutes === expected.estimatedMinutes &&
      current.recommendedPlayersMin === expected.recommendedPlayersMin &&
      current.recommendedPlayersMax === expected.recommendedPlayersMax,
  );
}

function buildProjection(scenario) {
  const revisionMarker = parseMarker(scenario.attribution, 'P3_REVISION_META:');
  const publicMarker = parseMarker(scenario.attribution, 'P5_PUBLIC_META:');
  const collaborationMarker = parseMarker(scenario.attribution, 'P4_COLLAB_META:');
  const revision = revisionMarker.value ?? {};
  const publicMetadata = publicMarker.value ?? {};
  const collaboration = collaborationMarker.value ?? {};
  const failures = [];
  if (revisionMarker.invalid) failures.push('invalid_revision_marker');
  if (publicMarker.invalid) failures.push('invalid_public_marker');
  if (collaborationMarker.invalid) failures.push('invalid_collaboration_marker');
  if (
    revision.status !== undefined &&
    !['draft', 'public', 'link', 'private', 'unpublished'].includes(revision.status)
  ) {
    failures.push('unknown_revision_status');
  }
  if (
    publicMetadata.moderationStatus !== undefined &&
    !['visible', 'reported', 'hidden', 'removed'].includes(publicMetadata.moderationStatus)
  ) {
    failures.push('unknown_moderation_status');
  }
  if (
    collaboration.collaborators !== undefined &&
    !Array.isArray(collaboration.collaborators)
  ) {
    failures.push('invalid_collaborator_list');
  }
  const publicationFailedClosed = failures.some((failure) =>
    [
      'invalid_revision_marker',
      'invalid_public_marker',
      'unknown_revision_status',
      'unknown_moderation_status',
    ].includes(failure),
  );
  const rawVisibility = publicationFailedClosed
    ? 'UNPUBLISHED'
    : providedScenarioIds.has(scenario.id)
      ? 'PUBLIC'
      : revision.status === 'public'
        ? 'PUBLIC'
        : revision.status === 'link'
          ? 'LINK'
          : 'UNPUBLISHED';
  const moderationStatus = publicationFailedClosed
    ? 'HIDDEN'
    : ['hidden', 'removed', 'reported'].includes(publicMetadata.moderationStatus)
      ? publicMetadata.moderationStatus.toUpperCase()
      : 'VISIBLE';
  const rawCollaborators = Array.isArray(collaboration.collaborators)
    ? collaboration.collaborators
    : [];
  const validCollaborators = rawCollaborators.filter(
        (entry) =>
          entry &&
          typeof entry.userId === 'string' &&
          ['editor', 'reviewer', 'viewer'].includes(entry.role),
      );
  if (validCollaborators.length !== rawCollaborators.length) {
    failures.push('invalid_collaborator_entry');
  }
  const collaborators = Array.from(
    new Map(validCollaborators.map((entry) => [entry.userId, entry])).values(),
  );
  const totalAppealCount = countAppeals(publicMetadata.appeals);
  const activeAppealCount = countAppeals(
    publicMetadata.appeals,
    (appeal) => activeAppealStatuses.has(appeal.status),
  );

  return {
    publication: {
      visibility: rawVisibility,
      moderationStatus,
      publishedAt:
        typeof revision.publishedAt === 'string' && !Number.isNaN(Date.parse(revision.publishedAt))
          ? new Date(revision.publishedAt)
          : null,
      revisionNumber: Number.isInteger(revision.revisionNumber) ? revision.revisionNumber : null,
      forkCount: Number.isInteger(publicMetadata.forkCount) ? publicMetadata.forkCount : 0,
      reportCount: Array.isArray(publicMetadata.reports) ? publicMetadata.reports.length : 0,
      appealCount: activeAppealCount,
      gmMode:
        scenario.publication?.gmMode ??
        (['AI', 'HUMAN', 'BOTH'].includes(publicMetadata.gmMode) ? publicMetadata.gmMode : null),
      tags: scenario.publication
        ? scenario.publication.tags
        : asStringArray(publicMetadata.tags).map((tag) => tag.toLowerCase()),
      estimatedMinutes:
        scenario.publication?.estimatedMinutes ??
        (Number.isInteger(publicMetadata.estimatedMinutes) && publicMetadata.estimatedMinutes > 0
          ? publicMetadata.estimatedMinutes
          : null),
      recommendedPlayersMin:
        scenario.publication?.recommendedPlayersMin ??
        (Number.isInteger(publicMetadata.recommendedPlayersMin) && publicMetadata.recommendedPlayersMin > 0
          ? publicMetadata.recommendedPlayersMin
          : null),
      recommendedPlayersMax:
        scenario.publication?.recommendedPlayersMax ??
        (Number.isInteger(publicMetadata.recommendedPlayersMax) && publicMetadata.recommendedPlayersMax > 0
          ? publicMetadata.recommendedPlayersMax
          : null),
    },
    collaborators,
    failures,
    publicationFailedClosed,
    totalAppealCount,
    activeAppealCount,
  };
}

async function main() {
  if (apply && requireReady) {
    throw new Error('--apply and --require-ready cannot be used together.');
  }
  let cursor;
  let scanned = 0;
  let publicationCount = 0;
  let collaboratorCount = 0;
  let existingPublicationCount = 0;
  let existingCollaboratorGrantCount = 0;
  let totalAppealCount = 0;
  let activeAppealCount = 0;
  let missingPublicationCount = 0;
  let wouldCreatePublication = 0;
  let wouldUpdatePublication = 0;
  let wouldCreateGrant = 0;
  let wouldUpdateGrant = 0;
  let wouldDeleteGrant = 0;
  let createdPublication = 0;
  let updatedPublication = 0;
  let createdGrant = 0;
  let updatedGrant = 0;
  let deletedGrant = 0;
  let metadataFailureCount = 0;
  let publicationFailClosedCount = 0;
  let estimatedMinutesBackfillCount = 0;
  let recommendedPlayersBackfillCount = 0;
  let missingCollaboratorUserCount = 0;
  const metadataFailures = [];
  const missingCollaboratorUsers = [];

  while (true) {
    const scenarios = await prisma.scenario.findMany({
      orderBy: { id: 'asc' },
      take: pageSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        attribution: true,
        publication: {
          select: {
            visibility: true,
            moderationStatus: true,
            publishedAt: true,
            revisionNumber: true,
            forkCount: true,
            reportCount: true,
            appealCount: true,
            gmMode: true,
            tags: true,
            estimatedMinutes: true,
            recommendedPlayersMin: true,
            recommendedPlayersMax: true,
          },
        },
        collaboratorGrants: {
          select: { userId: true, role: true },
          orderBy: { userId: 'asc' },
        },
      },
    });
    if (!scenarios.length) break;

    const projections = scenarios.map((scenario) => ({ scenario, projection: buildProjection(scenario) }));
    const collaboratorUserIds = Array.from(
      new Set(
        projections.flatMap(({ projection }) =>
          projection.collaborators.map((collaborator) => collaborator.userId),
        ),
      ),
    );
    const existingUsers = collaboratorUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: collaboratorUserIds } },
          select: { id: true },
        })
      : [];
    const existingUserIds = new Set(existingUsers.map((user) => user.id));

    for (const { scenario, projection } of projections) {
      const collaborators = projection.collaborators.filter((entry) => {
        if (existingUserIds.has(entry.userId)) return true;
        missingCollaboratorUserCount += 1;
        if (missingCollaboratorUsers.length < failureSampleLimit) {
          missingCollaboratorUsers.push({ scenarioId: scenario.id, userId: entry.userId });
        }
        return false;
      });
      scanned += 1;
      publicationCount += 1;
      collaboratorCount += collaborators.length;
      totalAppealCount += projection.totalAppealCount;
      activeAppealCount += projection.activeAppealCount;
      if (scenario.publication) {
        existingPublicationCount += 1;
      } else {
        missingPublicationCount += 1;
        wouldCreatePublication += 1;
      }
      if (scenario.publication && !publicationMatches(scenario.publication, projection.publication)) {
        wouldUpdatePublication += 1;
      }
      if (
        scenario.publication?.estimatedMinutes == null &&
        projection.publication.estimatedMinutes != null
      ) {
        estimatedMinutesBackfillCount += 1;
      }
      if (
        (scenario.publication?.recommendedPlayersMin == null ||
          scenario.publication?.recommendedPlayersMax == null) &&
        (projection.publication.recommendedPlayersMin != null ||
          projection.publication.recommendedPlayersMax != null)
      ) {
        recommendedPlayersBackfillCount += 1;
      }
      existingCollaboratorGrantCount += scenario.collaboratorGrants.length;

      const expectedGrantByUserId = new Map(
        collaborators.map((entry) => [entry.userId, entry]),
      );
      const currentGrantByUserId = new Map(
        scenario.collaboratorGrants.map((entry) => [entry.userId, entry]),
      );
      const grantsToCreate = collaborators.filter(
        (entry) => !currentGrantByUserId.has(entry.userId),
      );
      const grantsToUpdate = collaborators.filter((entry) => {
        const current = currentGrantByUserId.get(entry.userId);
        return Boolean(current && current.role !== entry.role);
      });
      const grantUserIdsToDelete = scenario.collaboratorGrants
        .filter((entry) => !expectedGrantByUserId.has(entry.userId))
        .map((entry) => entry.userId);
      wouldCreateGrant += grantsToCreate.length;
      wouldUpdateGrant += grantsToUpdate.length;
      wouldDeleteGrant += grantUserIdsToDelete.length;
      metadataFailureCount += projection.failures.length;
      if (projection.publicationFailedClosed) publicationFailClosedCount += 1;
      if (projection.failures.length && metadataFailures.length < failureSampleLimit) {
        metadataFailures.push({ scenarioId: scenario.id, reasons: projection.failures });
      }
      if (!apply) continue;

      const operations = [];
      if (!scenario.publication) {
        operations.push(
          prisma.scenarioPublication.create({
            data: { scenarioId: scenario.id, ...projection.publication },
          }),
        );
        createdPublication += 1;
      } else if (!publicationMatches(scenario.publication, projection.publication)) {
        operations.push(
          prisma.scenarioPublication.update({
            where: { scenarioId: scenario.id },
            data: projection.publication,
          }),
        );
        updatedPublication += 1;
      }
      if (grantUserIdsToDelete.length) {
        operations.push(
          prisma.scenarioCollaboratorGrant.deleteMany({
            where: {
              scenarioId: scenario.id,
              userId: { in: grantUserIdsToDelete },
            },
          }),
        );
        deletedGrant += grantUserIdsToDelete.length;
      }
      for (const entry of grantsToUpdate) {
        operations.push(
          prisma.scenarioCollaboratorGrant.update({
            where: {
              scenarioId_userId: {
                scenarioId: scenario.id,
                userId: entry.userId,
              },
            },
            data: { role: entry.role },
          }),
        );
        updatedGrant += 1;
      }
      if (grantsToCreate.length) {
        operations.push(
          prisma.scenarioCollaboratorGrant.createMany({
            data: grantsToCreate.map((entry) => ({
              scenarioId: scenario.id,
              userId: entry.userId,
              role: entry.role,
            })),
            skipDuplicates: true,
          }),
        );
        createdGrant += grantsToCreate.length;
      }
      if (operations.length) {
        await prisma.$transaction(operations);
      }
    }

    cursor = scenarios[scenarios.length - 1].id;
    if (scenarios.length < pageSize) break;
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    scanned,
    scenarioCount: scanned,
    publicationCount,
    existingPublicationCount,
    missingPublicationCount,
    collaboratorCount,
    expectedCollaboratorGrantCount: collaboratorCount,
    existingCollaboratorGrantCount,
    totalAppealCount,
    activeAppealCount,
    wouldCreatePublication,
    wouldUpdatePublication,
    wouldCreateGrant,
    wouldUpdateGrant,
    wouldDeleteGrant,
    createdPublication,
    updatedPublication,
    createdGrant,
    updatedGrant,
    deletedGrant,
    metadataFailureCount,
    publicationFailClosedCount,
    estimatedMinutesBackfillCount,
    recommendedPlayersBackfillCount,
    metadataFailures,
    missingCollaboratorUserCount,
    missingCollaboratorUsers,
  };
  if (
    publicationCount !== scanned ||
    existingPublicationCount + missingPublicationCount !== scanned ||
    wouldCreatePublication !== missingPublicationCount
  ) {
    throw new Error(
      `Scenario projection coverage mismatch: scanned=${scanned} existing=${existingPublicationCount} missing=${missingPublicationCount} expected=${publicationCount}`,
    );
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (
    requireReady &&
    (wouldCreatePublication > 0 ||
      wouldUpdatePublication > 0 ||
      wouldCreateGrant > 0 ||
      wouldUpdateGrant > 0 ||
      wouldDeleteGrant > 0 ||
      metadataFailureCount > 0 ||
      missingCollaboratorUserCount > 0)
  ) {
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
