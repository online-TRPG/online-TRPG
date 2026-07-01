import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, "..");
const beDir = path.join(rootDir, "be");
const logPath = path.join(rootDir, "test.log");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const log = createWriteStream(logPath, { flags: "w" });

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        AUTO_MONSTER_DEBUG: "1",
        TEST_LOG_VERBOSE: "1",
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

console.log(`Writing full test log to ${logPath}`);

const buildCode = await run(
  npmCommand,
  ["run", "--silent", "build:test-deps"],
  beDir,
);

let exitCode = buildCode;

if (buildCode === 0) {
  exitCode = await run(
    npmCommand,
    ["exec", "--", "jest", "--config", "jest.config.ts"],
    beDir,
  );
}

await new Promise((resolve) => log.end(resolve));

if (exitCode === 0) {
  console.log(`PASS full log saved to ${logPath}`);
} else {
  console.error(`FAIL full log saved to ${logPath}`);
}

process.exit(exitCode);
