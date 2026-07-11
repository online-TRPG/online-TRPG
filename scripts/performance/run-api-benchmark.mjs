import fs from "node:fs/promises";
import path from "node:path";

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function positiveInteger(name, fallback) {
  const value = Number(readArg(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function parseHeaders() {
  const headers = { accept: "application/json" };
  for (const arg of process.argv.filter((value) => value.startsWith("--header="))) {
    const raw = arg.slice("--header=".length);
    const separator = raw.indexOf(":");
    if (separator <= 0) throw new Error(`Invalid --header value: ${raw}`);
    headers[raw.slice(0, separator).trim()] = raw.slice(separator + 1).trim();
  }
  return headers;
}

async function runRequest(url, headers, timeoutMs) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.arrayBuffer();
    return {
      durationMs: performance.now() - startedAt,
      status: response.status,
      ok: response.ok,
      responseBytes: body.byteLength,
      error: null,
    };
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      status: null,
      ok: false,
      responseBytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function writeResult(output, serialized) {
  if (!output) return;
  const outputPath = path.resolve(output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, serialized, "utf8");
}

async function runPool(total, concurrency, task) {
  const results = new Array(total);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) return;
      results[index] = await task(index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(total, concurrency) }, worker));
  return results;
}

async function main() {
  const baseUrl = readArg("base-url");
  const route = readArg("route");
  if (!baseUrl || !route) {
    throw new Error("--base-url and --route are required.");
  }
  const requests = positiveInteger("requests", 100);
  const concurrency = positiveInteger("concurrency", 10);
  const warmup = positiveInteger("warmup", 5);
  const timeoutMs = positiveInteger("timeout-ms", 30000);
  const scale = positiveInteger("scale", 1);
  if (![1, 10, 100].includes(scale)) throw new Error("--scale must be 1, 10, or 100.");
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedRoute = route.startsWith("/") ? route.slice(1) : route;
  const url = new URL(normalizedRoute, normalizedBaseUrl).toString();
  const headers = parseHeaders();
  const shouldRun = process.argv.includes("--run");
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
  if (shouldRun && !isLocalhost && !process.argv.includes("--allow-remote")) {
    throw new Error("Remote API benchmark requires explicit --allow-remote.");
  }
  if (!shouldRun) {
    const dryRunResult = {
      schemaVersion: 1,
      benchmark: readArg("name", "api-request"),
      mode: "dry-run",
      scale,
      request: {
        url,
        requests,
        concurrency,
        warmup,
        timeoutMs,
        headerNames: Object.keys(headers).sort(),
      },
    };
    const serialized = `${JSON.stringify(dryRunResult, null, 2)}\n`;
    await writeResult(readArg("output"), serialized);
    process.stdout.write(serialized);
    return;
  }

  await runPool(warmup, Math.min(warmup, concurrency), () =>
    runRequest(url, headers, timeoutMs),
  );
  const startedAt = performance.now();
  const samples = await runPool(requests, concurrency, () =>
    runRequest(url, headers, timeoutMs),
  );
  const wallTimeMs = performance.now() - startedAt;
  const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const statusCounts = samples.reduce((counts, sample) => {
    const key = sample.status === null ? "network_error" : String(sample.status);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const result = {
    schemaVersion: 1,
    benchmark: readArg("name", "api-request"),
    mode: "run",
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    scale,
    request: {
      url,
      requests,
      concurrency,
      warmup,
      timeoutMs,
      headerNames: Object.keys(headers).sort(),
    },
    result: {
      wallTimeMs,
      throughputPerSecond: wallTimeMs > 0 ? requests / (wallTimeMs / 1000) : 0,
      errorRate: samples.filter((sample) => !sample.ok).length / requests,
      responseBytes: {
        min: Math.min(...samples.map((sample) => sample.responseBytes)),
        max: Math.max(...samples.map((sample) => sample.responseBytes)),
      },
      latencyMs: {
        min: durations[0] ?? 0,
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        p99: percentile(durations, 0.99),
        max: durations[durations.length - 1] ?? 0,
      },
      statusCounts,
      errors: [...new Set(samples.map((sample) => sample.error).filter(Boolean))],
    },
  };

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  await writeResult(readArg("output"), serialized);
  process.stdout.write(serialized);
  if (result.result.errorRate > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
