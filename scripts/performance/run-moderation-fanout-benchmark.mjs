import fs from "node:fs/promises";
import path from "node:path";

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function parseScale() {
  const scale = Number(readArg("scale"));
  if (![1, 10, 100].includes(scale)) {
    throw new Error("--scale must be 1, 10, or 100.");
  }
  return scale;
}

function validatePrefix(value) {
  if (!/^[a-z0-9_-]{3,40}$/i.test(value)) {
    throw new Error("--prefix must contain only 3-40 letters, digits, underscores, or hyphens.");
  }
  return value;
}

function positiveInteger(name, fallback) {
  const value = Number(readArg(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}

function buildUrl(baseUrl, route) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedRoute = route.startsWith("/") ? route.slice(1) : route;
  return new URL(normalizedRoute, normalizedBaseUrl).toString();
}

function unwrapApiResponse(body) {
  if (body && typeof body === "object" && !Array.isArray(body) && "data" in body) {
    return body.data;
  }
  return body;
}

async function writeResult(output, serialized) {
  if (!output) return;
  const outputPath = path.resolve(output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, serialized, "utf8");
}

async function main() {
  const scale = parseScale();
  const prefix = validatePrefix(readArg("prefix", `perf_${scale}x_`));
  const baseUrl = readArg("base-url");
  if (!baseUrl) throw new Error("--base-url is required.");
  const timeoutMs = positiveInteger("timeout-ms", 300000);
  const scenarioId = `${prefix}scenario-0`;
  const operatorUserId = `${prefix}moderator`;
  const requestBody = {
    action: "warning",
    reason: "performance fixture fan-out verification",
  };
  const url = buildUrl(baseUrl, `/scenarios/${scenarioId}/moderation/actions`);
  const apply = process.argv.includes("--apply");
  const hostname = new URL(url).hostname;
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  if (apply && !isLocalhost && !process.argv.includes("--allow-remote")) {
    throw new Error("Remote moderation benchmark requires explicit --allow-remote.");
  }
  if (!apply) {
    const dryRunResult = {
      schemaVersion: 1,
      benchmark: "scenario-moderation-fanout",
      mode: "dry-run",
      scale,
      request: {
        url,
        method: "POST",
        timeoutMs,
        requestBodyBytes: Buffer.byteLength(JSON.stringify(requestBody), "utf8"),
      },
    };
    const serialized = `${JSON.stringify(dryRunResult, null, 2)}\n`;
    await writeResult(readArg("output"), serialized);
    process.stdout.write(serialized);
    return;
  }
  const startedAt = performance.now();
  let status = null;
  let responseBytes = 0;
  let responseBody = null;
  let error = null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-user-id": operatorUserId,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = response.status;
    const rawBody = await response.arrayBuffer();
    responseBytes = rawBody.byteLength;
    if (responseBytes) {
      try {
        responseBody = JSON.parse(new TextDecoder().decode(rawBody));
      } catch {
        error = "Response was not valid JSON.";
      }
    }
    if (!response.ok && !error) {
      error = `Moderation API returned HTTP ${response.status}.`;
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const data = unwrapApiResponse(responseBody);
  const actionId =
    data && typeof data === "object" && !Array.isArray(data) && typeof data.actionId === "string"
      ? data.actionId
      : null;
  if (!error && !actionId) error = "Moderation response did not contain actionId.";
  if (!error && data.scenarioId !== scenarioId) error = "Moderation response scenarioId mismatch.";
  if (!error && data.action !== "warning") error = "Moderation response action mismatch.";

  const result = {
    schemaVersion: 1,
    benchmark: "scenario-moderation-fanout",
    mode: "apply",
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    scale,
    request: {
      url,
      method: "POST",
      timeoutMs,
      requestBodyBytes: Buffer.byteLength(JSON.stringify(requestBody), "utf8"),
    },
    result: {
      status,
      ok: !error,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
      responseBytes,
      actionId,
      scenarioId: data && typeof data === "object" ? (data.scenarioId ?? null) : null,
      action: data && typeof data === "object" ? (data.action ?? null) : null,
      moderationStatus:
        data && typeof data === "object" ? (data.moderationStatus ?? null) : null,
      processingStatus:
        data && typeof data === "object" ? (data.processingStatus ?? null) : null,
      creatorNoticeStatus:
        data && typeof data === "object" ? (data.creatorNoticeStatus ?? null) : null,
      error,
    },
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  await writeResult(readArg("output"), serialized);
  process.stdout.write(serialized);
  if (error) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
