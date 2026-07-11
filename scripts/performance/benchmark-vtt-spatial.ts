import fs from "node:fs/promises";
import path from "node:path";
import {
  VttMapSpatialIndex,
  type VttSpatialRect,
} from "../../be/src/modules/sessions/vtt-map-spatial-index";

function readArg(name: string, fallback: string | null = null): string | null {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function percentile(sorted: number[], ratio: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    minMs: sorted[0] ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

function buildEntries(count: number): VttSpatialRect[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `object-${index}`,
    x: (index % 100) * 50,
    y: Math.floor(index / 100) * 50,
    width: index % 17 === 0 ? 100 : 50,
    height: index % 23 === 0 ? 100 : 50,
  }));
}

function rectsOverlap(left: VttSpatialRect, right: Omit<VttSpatialRect, "id">): boolean {
  return (
    left.x < right.x + Math.max(right.width, 1) &&
    left.x + Math.max(left.width, 1) > right.x &&
    left.y < right.y + Math.max(right.height, 1) &&
    left.y + Math.max(left.height, 1) > right.y
  );
}

function assertNoFalseNegatives(
  entries: VttSpatialRect[],
  query: Omit<VttSpatialRect, "id">,
  candidates: VttSpatialRect[],
  scale: number,
  kind: string,
): void {
  const candidateIds = new Set(candidates.map((entry) => entry.id));
  const missing = entries.filter((entry) => rectsOverlap(entry, query) && !candidateIds.has(entry.id));
  if (missing.length) {
    throw new Error(`${kind} spatial query omitted ${missing.length} entries at scale ${scale}.`);
  }
}

function benchmarkQuery(
  index: VttMapSpatialIndex<VttSpatialRect>,
  entries: VttSpatialRect[],
  query: Omit<VttSpatialRect, "id">,
  iterations: number,
  scale: number,
  kind: string,
) {
  const indexedDurations: number[] = [];
  const fullScanDurations: number[] = [];
  let candidates: VttSpatialRect[] = [];
  let fullScanMatches: VttSpatialRect[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const indexedStartedAt = performance.now();
    candidates = index.query(query);
    indexedDurations.push(performance.now() - indexedStartedAt);

    const fullScanStartedAt = performance.now();
    fullScanMatches = entries.filter((entry) => rectsOverlap(entry, query));
    fullScanDurations.push(performance.now() - fullScanStartedAt);
  }
  assertNoFalseNegatives(entries, query, candidates, scale, kind);
  return {
    candidateCount: candidates.length,
    exactMatchCount: fullScanMatches.length,
    falseNegativeCount: 0,
    falsePositiveCount: Math.max(0, candidates.length - fullScanMatches.length),
    reductionRatio: entries.length ? 1 - candidates.length / entries.length : 0,
    indexed: summarize(indexedDurations),
    fullScan: summarize(fullScanDurations),
  };
}

function benchmarkScale(scale: number, iterations: number) {
  const entries = buildEntries(scale * 100);
  const buildIterations = Math.min(iterations, 20);
  const buildDurations: number[] = [];
  for (let iteration = 0; iteration < buildIterations; iteration += 1) {
    const startedAt = performance.now();
    new VttMapSpatialIndex(50, entries);
    buildDurations.push(performance.now() - startedAt);
  }

  const index = new VttMapSpatialIndex(50, entries);
  const middleRow = Math.floor(entries.length / 200);
  const localQuery = { x: 2450, y: middleRow * 50, width: 150, height: 150 };
  const wideQuery = {
    x: -5000,
    y: -5000,
    width: 15000,
    height: Math.max(15000, Math.ceil(entries.length / 100) * 50 + 10000),
  };
  const local = benchmarkQuery(index, entries, localQuery, iterations, scale, "local");
  const wide = benchmarkQuery(index, entries, wideQuery, iterations, scale, "wide");

  return {
    scale,
    entryCount: entries.length,
    iterations,
    buildIterations,
    construction: summarize(buildDurations),
    local,
    wide,
    queryStrategies: index.getQueryStats(),
  };
}

async function main() {
  const iterations = Number(readArg("iterations", "100"));
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error("--iterations must be a positive integer.");
  }
  const result = {
    schemaVersion: 1,
    benchmark: "vtt-spatial-index",
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    scales: [1, 10, 100].map((scale) => benchmarkScale(scale, iterations)),
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  const output = readArg("output");
  if (output) {
    const outputPath = path.resolve(output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
