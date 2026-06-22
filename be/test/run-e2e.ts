import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { loadCandidateEnv, resolveSafeE2eDatabaseUrl } from "./e2e-db-safety";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const normalizedEnv = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: normalizedEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function resolveSchemaToCreate(databaseUrl: string): string | null {
  const schemaName = new URL(databaseUrl).searchParams.get("schema")?.trim();
  if (!schemaName || schemaName === "public") {
    return null;
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaName)) {
    throw new Error(
      "test:e2e schema name must be a simple PostgreSQL identifier when auto-creating it.",
    );
  }
  return schemaName;
}

const candidateEnv = loadCandidateEnv();
const databaseUrl = resolveSafeE2eDatabaseUrl(candidateEnv);
const childEnv: NodeJS.ProcessEnv = {
  ...candidateEnv,
  ...process.env,
  DATABASE_URL: databaseUrl,
  E2E_DATABASE_URL: databaseUrl,
  TRPG_E2E: "1",
  NODE_ENV: "test",
};

delete childEnv.SERVER_DATABASE_URL;

const npmCommand = "npm";
const schemaToCreate = resolveSchemaToCreate(databaseUrl);

async function ensureSchemaExists(schemaName: string): Promise<void> {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  try {
    await prisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS ${quotePostgresIdentifier(schemaName)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  console.info("E2E database safety check passed. Running against the isolated database.");
  if (schemaToCreate) {
    console.info(`Ensuring isolated E2E schema exists: ${schemaToCreate}`);
    await ensureSchemaExists(schemaToCreate);
  }
  run(
    npmCommand,
    [
      "exec",
      "--",
      "prisma",
      "db",
      "push",
      "--schema",
      "prisma/schema.prisma",
      "--skip-generate",
    ],
    childEnv,
  );
  run(
    npmCommand,
    [
      "exec",
      "--",
      "jest",
      "--config",
      "./test/jest-e2e.json",
      "--runInBand",
    ],
    childEnv,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
