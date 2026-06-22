import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const safeNamePattern = /(test|e2e|ci)/i;
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DEFAULT_E2E_SCHEMA = "e2e_test";

function describeDatabaseTarget(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "(default)"}/${parsed.pathname.replace(/^\//, "")}?schema=${parsed.searchParams.get("schema") ?? "(none)"}`;
}

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

export function loadCandidateEnv(): Record<string, string | undefined> {
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

export function resolveSafeE2eDatabaseUrl(
  env: Record<string, string | undefined>,
): string {
  const explicitE2eDatabaseUrl = env.E2E_DATABASE_URL?.trim();
  const baseDatabaseUrl = env.DATABASE_URL?.trim();
  const databaseUrl = explicitE2eDatabaseUrl || baseDatabaseUrl;
  const serverDatabaseUrl = env.SERVER_DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("test:e2e requires DATABASE_URL to point at an isolated local test database.");
  }

  if (explicitE2eDatabaseUrl && serverDatabaseUrl && databaseUrl === serverDatabaseUrl) {
    throw new Error("test:e2e refused to run because DATABASE_URL equals SERVER_DATABASE_URL.");
  }

  const parsed = new URL(databaseUrl);
  if (!explicitE2eDatabaseUrl && !parsed.searchParams.get("schema")) {
    parsed.searchParams.set("schema", DEFAULT_E2E_SCHEMA);
  }
  if (
    !explicitE2eDatabaseUrl &&
    parsed.searchParams.get("schema") === "public"
  ) {
    parsed.searchParams.set("schema", DEFAULT_E2E_SCHEMA);
  }
  const safeDatabaseUrl = parsed.toString();
  const databaseName = parsed.pathname.replace(/^\//, "");
  const schemaName = parsed.searchParams.get("schema") ?? "";

  if (!localHosts.has(parsed.hostname)) {
    throw new Error("test:e2e requires a localhost DATABASE_URL.");
  }

  if (!safeNamePattern.test(databaseName) && !safeNamePattern.test(schemaName)) {
    throw new Error(
      [
        "test:e2e DATABASE_URL must include test, e2e, or ci in the database name or schema.",
        `Current target: ${describeDatabaseTarget(safeDatabaseUrl)}`,
        'Either set E2E_DATABASE_URL explicitly, or use a local DATABASE_URL and let test:e2e derive schema=e2e_test automatically.',
      ].join("\n"),
    );
  }

  return safeDatabaseUrl;
}

if (require.main === module) {
  try {
    resolveSafeE2eDatabaseUrl(loadCandidateEnv());
    console.info("E2E database safety check passed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
