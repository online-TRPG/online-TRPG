import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function getBackendWorkspaceDir(): string {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, "prisma", "schema.prisma"))) {
    return cwd;
  }

  const nestedBackendDir = resolve(cwd, "be");
  if (existsSync(resolve(nestedBackendDir, "prisma", "schema.prisma"))) {
    return nestedBackendDir;
  }

  return cwd;
}

function isRunningInsideDocker(): boolean {
  return existsSync("/.dockerenv");
}

export function getRuntimeEnvFilePaths(): string[] {
  const backendDir = getBackendWorkspaceDir();
  const repoRootDir = resolve(backendDir, "..");

  if (isRunningInsideDocker()) {
    return [resolve(repoRootDir, ".env.backend")];
  }

  return [
    resolve(repoRootDir, ".env.backend"),
    resolve(repoRootDir, ".env"),
    resolve(repoRootDir, ".env.local"),
    resolve(backendDir, ".env"),
    resolve(backendDir, ".env.local"),
  ];
}

export function loadRuntimeEnv(): void {
  const envFilePaths = getRuntimeEnvFilePaths();

  for (const envPath of envFilePaths) {
    if (!existsSync(envPath)) continue;

    const contents = readFileSync(envPath, "utf-8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      if (!key) continue;

      let value = line.slice(separatorIndex + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }

  if (!isRunningInsideDocker()) {
    const localDatabaseUrl = process.env.SERVER_DATABASE_URL?.trim();
    if (localDatabaseUrl) {
      process.env.DATABASE_URL = localDatabaseUrl;
    }

    const localAiServiceUrl = process.env.SERVER_AI_SERVICE_URL?.trim();
    if (localAiServiceUrl) {
      process.env.AI_SERVICE_URL = localAiServiceUrl;
    }
  }
}
