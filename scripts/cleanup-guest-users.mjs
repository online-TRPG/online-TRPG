import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;

  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 0) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    apply: false,
    days: 7,
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg.startsWith('--days=')) {
      const value = Number.parseInt(arg.slice('--days='.length), 10);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error('--days must be a positive integer.');
      }
      args.days = value;
    }
  }

  return args;
}

const repoRoot = process.cwd();
loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(repoRoot, '.env.backend'));
loadEnvFile(path.join(repoRoot, 'be', '.env'));

const args = parseArgs(process.argv.slice(2));
const prisma = new PrismaClient();

try {
  const cutoff = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);
  const guests = await prisma.user.findMany({
    where: {
      authProvider: 'GUEST',
      createdAt: { lt: cutoff },
    },
    select: { id: true },
  });
  const guestIds = guests.map((guest) => guest.id);

  const [hostedSessions, participants, characters, scenarios] = guestIds.length
    ? await Promise.all([
        prisma.session.count({ where: { hostUserId: { in: guestIds } } }),
        prisma.sessionParticipant.count({ where: { userId: { in: guestIds } } }),
        prisma.character.count({ where: { ownerUserId: { in: guestIds } } }),
        prisma.scenario.count({ where: { createdByUserId: { in: guestIds } } }),
      ])
    : [0, 0, 0, 0];

  const summary = {
    mode: args.apply ? 'apply' : 'dry-run',
    retentionDays: args.days,
    cutoff: cutoff.toISOString(),
    guestUsers: guestIds.length,
    hostedSessions,
    participants,
    characters,
    scenariosWithCreatorSetNull: scenarios,
  };

  if (!args.apply || guestIds.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
    if (!args.apply) {
      console.log('Dry run only. Re-run with --apply to delete old guest data.');
    }
    process.exit(0);
  }

  const result = await prisma.$transaction(async (tx) => {
    const deletedHostedSessions = await tx.session.deleteMany({
      where: { hostUserId: { in: guestIds } },
    });
    const deletedGuests = await tx.user.deleteMany({
      where: { id: { in: guestIds } },
    });
    return {
      deletedHostedSessions: deletedHostedSessions.count,
      deletedGuestUsers: deletedGuests.count,
    };
  });

  const remaining = await prisma.user.count({
    where: {
      authProvider: 'GUEST',
      createdAt: { lt: cutoff },
    },
  });

  console.log(JSON.stringify({ ...summary, ...result, remainingOldGuestUsers: remaining }, null, 2));
} finally {
  await prisma.$disconnect();
}
