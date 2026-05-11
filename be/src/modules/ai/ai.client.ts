import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from "@nestjs/common";

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

interface BaseHarnessResponse<TParsed> {
  provider: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
  rawOutput: string;
  finishReason: string | null;
  providerRequestId: string | null;
  trace: AiTraceSummary;
  logPaths: Record<string, string> | null;
  parsed: TParsed;
  fallback?: boolean;
  fallbackReason?: string | null;
}

export interface NarratorRequestPayload {
  rawInput: string;
  actionSummary: string;
  diceSummary?: string;
  sceneTone?: string;
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface NarratorParsed {
  narration: string;
  visibleSummary: string;
}

export type NarratorResponsePayload = BaseHarnessResponse<NarratorParsed>;

export interface DirectorRequestPayload {
  hintLevel?: "LIGHT" | "NORMAL" | "STRONG";
  question?: string;
  sceneSummary: string;
  recentLogs?: string[];
  publicClues?: string[];
  triedApproaches?: string[];
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface DirectorParsed {
  hintLevel: string;
  content: string;
  sourceScope: string;
  spoilerLevel: string;
  suggestions: string[];
  safetyNotes?: string[];
}

export type DirectorResponsePayload = BaseHarnessResponse<DirectorParsed>;

export interface SummarizerRequestPayload {
  summaryType?: "player_visible" | "ai_context";
  rangeType?: "RECENT" | "FULL" | "SINCE_NODE";
  lastLogCount?: number;
  nodeId?: string;
  logs: string[];
  includeHiddenContext?: boolean;
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface SummarizerParsed {
  summaryType: string;
  coveredTurnRange: string;
  content: string;
  keyFacts: string[];
  safetyNotes?: string[];
}

export type SummarizerResponsePayload = BaseHarnessResponse<SummarizerParsed>;

export interface NpcDialogueRequestPayload {
  npcEntityId: string;
  npcName?: string;
  npcSummary: string;
  disposition?: string;
  sceneSummary: string;
  recentContext?: string[];
  selectedActionId?: string;
  dialogueIntent: string;
  audienceIds?: string[];
  maxLength?: number;
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface NpcDialogueParsed {
  dialogue: string;
  tone: string;
  safetyNotes?: string[];
}

export type NpcDialogueResponsePayload = BaseHarnessResponse<NpcDialogueParsed>;

export interface InterpreterRequestPayload {
  rawText: string;
  actorCharacterId?: string;
  sceneSummary?: string;
  availableTargets?: string[];
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface InterpreterStructuredAction {
  type: string;
  actorCharacterId: string;
  targetId?: string | null;
  spellId?: string | null;
  featureId?: string | null;
  attackKind?: string | null;
  ability?: string | null;
  skill?: string | null;
  approach: string;
  confidence: number;
  requiresRoll: boolean;
  suggestedDifficulty?: string | null;
}

export interface InterpreterParsed {
  action: InterpreterStructuredAction;
  needsClarification: boolean;
  clarificationQuestion?: string | null;
  mentionedSpellId?: string | null;
  mentionedItemId?: string | null;
  mentionedConditionIds?: string[];
  requiredRuleCheckIds?: string[];
  rulesConfidence?: number | null;
  safetyNotes?: string[];
}

export type InterpreterResponsePayload = BaseHarnessResponse<InterpreterParsed>;

export interface ActorAllowedAction {
  id: string;
  label: string;
  actionType: string;
}

export interface ActorRequestPayload {
  npcEntityId: string;
  npcSummary: string;
  disposition?: string;
  hpStatus?: string;
  conditions?: string[];
  sceneSummary: string;
  allowedActions: ActorAllowedAction[];
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface ActorParsed {
  selectedActionId: string;
  reason: string;
  safetyNotes?: string[];
}

export type ActorResponsePayload = BaseHarnessResponse<ActorParsed>;

const DEFAULT_TIMEOUT_MS = 30_000;

@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);
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
    return this.postJson<NarratorResponsePayload>("/internal/ai/narrator", payload);
  }

  async runDirector(payload: DirectorRequestPayload): Promise<DirectorResponsePayload> {
    return this.postJson<DirectorResponsePayload>("/internal/ai/director", payload);
  }

  async runSummarizer(payload: SummarizerRequestPayload): Promise<SummarizerResponsePayload> {
    return this.postJson<SummarizerResponsePayload>("/internal/ai/summarizer", payload);
  }

  async runNpcDialogue(payload: NpcDialogueRequestPayload): Promise<NpcDialogueResponsePayload> {
    return this.postJson<NpcDialogueResponsePayload>("/internal/ai/npc-dialogue", payload);
  }

  async runInterpreter(payload: InterpreterRequestPayload): Promise<InterpreterResponsePayload> {
    return this.postJson<InterpreterResponsePayload>("/internal/ai/interpreter", payload);
  }

  async runActor(payload: ActorRequestPayload): Promise<ActorResponsePayload> {
    return this.postJson<ActorResponsePayload>("/internal/ai/actor", payload);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    try {
      return await this.attemptPostJson<T>(path, body);
    } catch (error) {
      if (error instanceof GatewayTimeoutException) {
        this.logger.warn(`AI request timed out, retrying once: path=${path}`);
        return await this.attemptPostJson<T>(path, body);
      }
      throw error;
    }
  }

  private async attemptPostJson<T>(path: string, body: unknown): Promise<T> {
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
