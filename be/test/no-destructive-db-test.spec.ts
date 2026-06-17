import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const repoRoot = join(__dirname, "..", "..");
const backendRoot = join(repoRoot, "be");

const destructivePatterns = [
  /prisma\s+db\s+push\b[^\n"]*--force-reset/i,
  /prisma\s+migrate\s+reset\b/i,
  /\bTRUNCATE\b/i,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\.deleteMany\(\s*\)/,
];

function collectFiles(dir: string, predicate: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return collectFiles(path, predicate);
    }

    return predicate(path) ? [path] : [];
  });
}

describe("database safety guards", () => {
  it("keeps test scripts and specs free of destructive database resets", () => {
    const files = [
      join(backendRoot, "package.json"),
      ...collectFiles(
        join(backendRoot, "test"),
        (path) => /\.spec\.ts$/.test(path) && path !== __filename,
      ),
    ];

    const violations = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");

      return destructivePatterns
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${relative(repoRoot, file)} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it("runs the e2e database safety guard before schema push or tests", () => {
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const e2eScript = packageJson.scripts?.["test:e2e"] ?? "";
    const guardIndex = e2eScript.indexOf("test/e2e-db-safety.ts");
    const schemaPushIndex = e2eScript.indexOf("prisma db push");
    const jestIndex = e2eScript.indexOf("jest --config ./test/jest-e2e.json");

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(schemaPushIndex).toBeGreaterThanOrEqual(0);
    expect(jestIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(schemaPushIndex);
    expect(guardIndex).toBeLessThan(jestIndex);
  });
});
