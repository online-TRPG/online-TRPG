import fs from "node:fs/promises";
import path from "node:path";
import sharedTypes from "@trpg/shared-types";

const { applyVttMapDelta, buildVttMapDelta } = sharedTypes;

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    minMs: sorted[0] ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function buildMap(scale) {
  const tokenCount = scale * 100;
  const objectCount = scale * 100;
  return {
    id: `benchmark-map-${scale}`,
    scenarioNodeId: "benchmark-node",
    gridType: "square",
    gridSize: 50,
    width: 5000,
    height: 5000,
    tokens: Array.from({ length: tokenCount }, (_, index) => ({
      id: `token-${index}`,
      name: `Token ${index}`,
      x: (index % 100) * 50,
      y: Math.floor(index / 100) * 50,
      size: 50,
      sessionCharacterId: index % 5 === 0 ? `character-${index}` : null,
    })),
    objectCells: Array.from({ length: objectCount }, (_, index) => ({
      id: `object-${index}`,
      x: (index % 100) * 50,
      y: Math.floor(index / 100) * 50,
      width: 50,
      height: 50,
      visibleToPlayers: index % 7 !== 0,
    })),
    fogRects: [],
    terrainCells: [],
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
}

function benchmarkScale(scale, iterations) {
  const previous = buildMap(scale);
  const next = {
    ...previous,
    tokens: previous.tokens.map((token, index) =>
      index === Math.floor(previous.tokens.length / 2)
        ? { ...token, x: token.x + previous.gridSize }
        : token,
    ),
    updatedAt: "2026-07-10T00:00:01.000Z",
  };
  const buildDurations = [];
  const applyDurations = [];
  let delta = null;

  for (let index = 0; index < iterations; index += 1) {
    const buildStartedAt = performance.now();
    delta = buildVttMapDelta(previous, next);
    buildDurations.push(performance.now() - buildStartedAt);
    if (!delta) throw new Error(`Delta construction failed at scale ${scale}.`);

    const applyStartedAt = performance.now();
    const applied = applyVttMapDelta(previous, delta);
    applyDurations.push(performance.now() - applyStartedAt);
    if (applied.status !== "applied" || JSON.stringify(applied.map) !== JSON.stringify(next)) {
      throw new Error(`Delta round-trip mismatch at scale ${scale}.`);
    }
  }

  const fullBytes = jsonBytes({ sessionId: "benchmark-session", map: next });
  const deltaBytes = jsonBytes({ sessionId: "benchmark-session", delta });
  return {
    scale,
    tokenCount: previous.tokens.length,
    objectCellCount: previous.objectCells.length,
    iterations,
    payload: {
      fullBytes,
      deltaBytes,
      reductionRatio: fullBytes ? 1 - deltaBytes / fullBytes : 0,
      changedTokenCount: delta.changedTokens.length,
      changedObjectCellCount: delta.changedObjectCells.length,
    },
    construction: summarize(buildDurations),
    application: summarize(applyDurations),
  };
}

async function main() {
  const iterations = Number(readArg("iterations", "100"));
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error("--iterations must be a positive integer.");
  }
  const output = readArg("output");
  const result = {
    schemaVersion: 1,
    benchmark: "vtt-map-single-token-delta",
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    scales: [1, 10, 100].map((scale) => benchmarkScale(scale, iterations)),
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
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
