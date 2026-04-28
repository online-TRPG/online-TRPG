import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from "@nestjs/common";

export interface NarratorRequestPayload {
  rawInput: string;
  actionSummary: string;
  diceSummary?: string;
  sceneTone?: string;
  model?: string;
}

export interface AiTraceSummary {
  role: string;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  attempts: number;
  failureType: string | null;
  finishReason: string | null;
  providerRequestId: string | null;
}

export interface NarratorParsed {
  narration: string;
  visibleSummary: string;
}

export interface NarratorResponsePayload {
  provider: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
  rawOutput: string;
  finishReason: string | null;
  providerRequestId: string | null;
  trace: AiTraceSummary;
  logPaths: Record<string, string> | null;
  parsed: NarratorParsed;
}

const DEFAULT_TIMEOUT_MS = 30_000;

@Injectable()
export class AiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    const url = process.env.AI_SERVICE_URL?.trim();
    if (!url) {
      throw new Error("AI_SERVICE_URL is not configured.");
    }
    this.baseUrl = url.replace(/\/+$/, "");
    const timeoutEnv = Number(process.env.AI_REQUEST_TIMEOUT_MS);
    this.timeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : DEFAULT_TIMEOUT_MS;
  }

  async runNarrator(payload: NarratorRequestPayload): Promise<NarratorResponsePayload> {
    return this.postJson<NarratorResponsePayload>("/api/harness/narrator", payload);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw new GatewayTimeoutException("AI 서버 응답 시간이 초과되었습니다.");
      }
      throw new BadGatewayException("AI 서버에 연결할 수 없습니다.");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await this.safeReadText(response);
      throw new BadGatewayException(
        `AI 서버 오류 (${response.status}): ${detail || response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }

  private async safeReadText(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.slice(0, 500);
    } catch {
      return "";
    }
  }
}
