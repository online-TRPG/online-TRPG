import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");

const scanHistory = process.argv.slice(2).includes("--history");
const gitArguments = scanHistory
  ? ["log", "--all", "--name-only", "--pretty=format:"]
  : ["ls-files", "-z"];

const gitOutput = execFileSync("git", gitArguments, {
  cwd: repositoryRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

const inspectedFiles = gitOutput
  .split(scanHistory ? /\r?\n/ : "\0")
  .map((file) => file.trim())
  .filter(Boolean)
  .map((file) => file.replaceAll("\\", "/"));

const forbiddenRules = [
  {
    reason: "database dump under exec/dump",
    matches: (file) =>
      file.startsWith("exec/dump/") && file !== "exec/dump/.gitkeep",
  },
  {
    reason: "runtime payload log",
    matches: (file) =>
      file.startsWith("runtime_logs/") && file !== "runtime_logs/.gitkeep",
  },
  {
    reason: "historical AI credential example",
    matches: (file) => file === "ai/.env.example",
  },
  {
    reason: "temporary database dump",
    matches: (file) =>
      file.startsWith("tmp/") && /\.(?:dump|sql)$/i.test(file),
  },
  {
    reason: "runtime environment file",
    matches: (file) => {
      const baseName = path.posix.basename(file);
      return /^\.env(?:\..+)?$/i.test(baseName) && baseName !== ".env.example";
    },
  },
  {
    reason: "private key or credential container",
    matches: (file) =>
      /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|credentials|service-account)[^/]*$/i.test(
        file,
      ) || /\.(?:key|p12|pfx|jks)$/i.test(file),
  },
];

const violations = [...new Set(inspectedFiles)].flatMap((file) =>
  forbiddenRules
    .filter((rule) => rule.matches(file))
    .map((rule) => ({ file, reason: rule.reason })),
);

if (violations.length > 0) {
  console.error(
    scanHistory
      ? "Sensitive or runtime-only files exist in Git history:"
      : "Sensitive or runtime-only files are tracked by Git:",
  );
  for (const violation of violations) {
    console.error(`- ${violation.file} (${violation.reason})`);
  }
  process.exitCode = 1;
} else {
  console.log(
    scanHistory
      ? `Sensitive history-path check passed (${new Set(inspectedFiles).size} historical paths inspected).`
      : `Sensitive tracked-path check passed (${inspectedFiles.length} tracked files inspected).`,
  );
}
