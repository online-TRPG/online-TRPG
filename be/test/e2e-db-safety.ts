import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const safeNamePattern = /(test|e2e|ci)/i;
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const entries: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

function loadCandidateEnv(): Record<string, string | undefined> {
  const repoRoot = resolve(__dirname, "..", "..");
  const backendRoot = resolve(repoRoot, "be");
  const fileEnv = [
    resolve(repoRoot, ".env.backend"),
    resolve(repoRoot, ".env"),
    resolve(repoRoot, ".env.local"),
    resolve(backendRoot, ".env"),
    resolve(backendRoot, ".env.local"),
  ].reduce<Record<string, string>>(
    (merged, envPath) => ({
      ...merged,
      ...readEnvFile(envPath),
    }),
    {},
  );

  return {
    ...fileEnv,
    ...process.env,
  };
}

function assertSafeDatabaseUrl(env: Record<string, string | undefined>): void {
  const databaseUrl = env.DATABASE_URL?.trim();
  const serverDatabaseUrl = env.SERVER_DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("test:e2e requires DATABASE_URL to point at an isolated local test database.");
  }

  if (serverDatabaseUrl && databaseUrl === serverDatabaseUrl) {
    throw new Error("test:e2e refused to run because DATABASE_URL equals SERVER_DATABASE_URL.");
  }

  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");
  const schemaName = parsed.searchParams.get("schema") ?? "";

  if (!localHosts.has(parsed.hostname)) {
    throw new Error("test:e2e requires a localhost DATABASE_URL.");
  }

  if (!safeNamePattern.test(databaseName) && !safeNamePattern.test(schemaName)) {
    throw new Error("test:e2e DATABASE_URL must include test, e2e, or ci in the database name or schema.");
  }
}

try {
  assertSafeDatabaseUrl(loadCandidateEnv());
  console.info("E2E database safety check passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
