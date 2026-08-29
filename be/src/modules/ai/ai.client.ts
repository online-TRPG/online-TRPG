import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from "@nestjs/common";
import {
  isBoolean,
  isNumber,
  isRecord,
  isString,
  isStringArray,
  readNumber,
  readOptionalString,
  readRecord,
  readString,
} from "@trpg/shared-types";

export interface AiTraceSummary {
  role: string;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  providerLatencyMs?: number | null;
  attemptLatenciesMs?: number[];
  schemaValidationRetries?: number | null;
  attempts: number;
  failureType: string | null;
  finishReason: string | null;
  providerRequestId: string | null;
  promptTokenCount?: number | null;
  outputTokenCount?: number | null;
  cachedTokenCount?: number | null;
  totalTokenCount?: number | null;
}

interface BaseHarnessResponse<TParsed> {
  trace: AiTraceSummary;
  parsed: TParsed;
  fallback?: boolean;
  fallbackReason?: string | null;
}

export interface NarratorRequestPayload {
  rawInput?: string;
  action?: {
    type: string;
    actorCharacterId: string;
    targetId?: string;
    spellId?: string;
    featureId?: string;
    attackKind?: string;
    ability?: string;
    skill?: string;
    approach: string;
    confidence: number;
    requiresRoll: boolean;
    suggestedDifficulty?: string;
  };
  checkRequest?: {
    checkType: string;
    ability?: string;
    skill?: string;
    difficultyClass?: number;
    targetId?: string;
    reason: string;
  };
  diceResult?: {
    rollerId: string;
    formula: string;
    total: number;
    naturalD20?: number;
    success?: boolean;
  };
  stateDiffSummary?: {
    summary: string;
    changedFlags?: string[];
    hpChanges?: string[];
    inventoryChanges?: string[];
    conditionChanges?: string[];
    nodeChange?: string;
  };
  actionSummary?: string;
  diceSummary?: string;
  sceneTone?: string;
  scene?: {
    title?: string;
    summary: string;
    tone: string;
  };
  constraints?: {
    language: "ko";
    maxLength: number;
    noNewFacts: true;
  };
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface NarratorParsed {
  narration: string;
}

export type NarratorResponsePayload = BaseHarnessResponse<NarratorParsed>;

export interface DirectorRequestPayload {
  hintLevel?: "LIGHT" | "NORMAL" | "STRONG";
  question?: string;
  sceneSummary: string;
  recentLogs?: string[];
  publicClues?: string[];
  triedApproaches?: string[];
  responseMode?: "HINT" | "HUMAN_GM_ASSIST";
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface DirectorParsed {
  content: string;
  suggestions: string[];
}

export type DirectorResponsePayload = BaseHarnessResponse<DirectorParsed>;

export interface SummarizerRequestPayload {
  summaryType?: "player_visible" | "ai_context";
  rangeType?: "RECENT" | "FULL" | "SINCE_NODE";
  lastLogCount?: number;
  logs: string[];
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface SummarizerParsed {
  content: string;
}

export type SummarizerResponsePayload = BaseHarnessResponse<SummarizerParsed>;

export interface NpcDialogueRequestPayload {
  npcEntityId: string;
  npcName?: string;
  npcSummary: string;
  disposition?: string;
  sceneSummary: string;
  recentContext?: string[];
  dialogueIntent: string;
  maxLength?: number;
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface NpcDialogueParsed {
  dialogue: string;
}

export type NpcDialogueResponsePayload = BaseHarnessResponse<NpcDialogueParsed>;

export interface CheckResultRequestPayload {
  outcome: "SUCCESS" | "FAILURE";
  intent: string;
  actionSummary?: string;
  targetName?: string | null;
  targetSummary?: string | null;
  targetDisposition?: string | null;
  sceneSummary?: string;
  allowedRewardFacts?: string[];
  visibleEntities?: string[];
  outputMode?: "GM_NARRATION" | "NPC_REPLY" | "OBSERVATION";
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface CheckResultParsed {
  narration: string;
}

export type CheckResultResponsePayload = BaseHarnessResponse<CheckResultParsed>;

export interface InterpreterAvailableTargetDetail {
  id: string;
  name: string;
  kind?: string | null;
  summary?: string | null;
  disposition?: string | null;
}

export interface InterpreterRequestPayload {
  rawText: string;
  actorCharacterId: string;
  sceneSummary?: string;
  recentLogs?: string[];
  availableTargets?: string[];
  availableTargetDetails?: InterpreterAvailableTargetDetail[];
  requestIntent?: string;
  screenType?: string;
  targetId?: string | null;
  targetType?: string | null;
  itemId?: string | null;
  spellId?: string | null;
  mapPoint?: { x: number; y: number } | null;
  relatedIntent?: string | null;
  transitionCandidates?: InterpreterTransitionCandidate[];
  transitionEvidence?: InterpreterTransitionEvidence | null;
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface InterpreterTransitionCandidate {
  transitionId?: string | null;
  label?: string | null;
  condition?: string | null;
  note?: string | null;
  targetNodeId: string;
  targetTitle: string;
  nodeType?: string | null;
}

export interface InterpreterTransitionEvidence {
  recentLogs: string[];
  revealedClues: string[];
  unrevealedClues: string[];
  flags: Record<string, unknown>;
  currentNodeId?: string | null;
  combatResolvedForCurrentNode: boolean;
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
  requiredRuleCheckIds?: string[];
  sceneTransition?: InterpreterSceneTransitionContract | null;
}

export interface InterpreterSceneTransitionRequirement {
  type:
    | "ACTION_EVIDENCE"
    | "CLUE_REVEALED"
    | "CLUE_NOT_REVEALED"
    | "OBJECT_STATE"
    | "FLAG_SET"
    | "COMBAT_RESOLVED"
    | "GM_APPROVAL";
  text: string;
  polarity?: "MUST" | "MUST_NOT";
}

export interface InterpreterSceneTransitionCandidateContract {
  transitionId?: string | null;
  targetNodeId: string;
  logic: "ALL" | "ANY";
  requirements: InterpreterSceneTransitionRequirement[];
  confidence: number;
  rationale?: string | null;
}

export interface InterpreterSceneTransitionContract {
  selectedTargetNodeId?: string | null;
  candidates?: InterpreterSceneTransitionCandidateContract[];
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
}

export type ActorResponsePayload = BaseHarnessResponse<ActorParsed>;

export const INTERNAL_AI_RESPONSE_ENVELOPE_FIELDS = [
  "trace",
  "parsed",
  "fallback",
  "fallbackReason",
] as const;

export const INTERNAL_AI_TRACE_FIELDS = [
  "role",
  "provider",
  "model",
  "promptVersion",
  "latencyMs",
  "providerLatencyMs",
  "attemptLatenciesMs",
  "schemaValidationRetries",
  "attempts",
  "failureType",
  "finishReason",
  "providerRequestId",
  "promptTokenCount",
  "outputTokenCount",
  "cachedTokenCount",
  "totalTokenCount",
] as const;

export const INTERNAL_AI_TRACE_CONSTRAINTS = {
  maxAttempts: 2,
  maxInteger: 2_147_483_647,
  maxSchemaValidationRetries: 1,
  attemptLatenciesMustMatchAttemptsWhenProvided: true,
  schemaRetriesCannotExceedCompletedFollowUpAttempts: true,
} as const;

export const INTERNAL_AI_PARSED_FIELDS = {
  interpreter: [
    "action",
    "needsClarification",
    "clarificationQuestion",
    "mentionedSpellId",
    "mentionedItemId",
    "requiredRuleCheckIds",
    "sceneTransition",
  ],
  narrator: ["narration"],
  director: ["content", "suggestions"],
  summarizer: ["content"],
  actor: ["selectedActionId"],
  npc_dialogue: ["dialogue"],
  check_result: ["narration"],
} as const;

export const INTERNAL_AI_INTERPRETER_NESTED_FIELDS = {
  action: [
    "type",
    "actorCharacterId",
    "targetId",
    "spellId",
    "featureId",
    "attackKind",
    "ability",
    "skill",
    "approach",
    "confidence",
    "requiresRoll",
    "suggestedDifficulty",
  ],
  sceneTransition: ["selectedTargetNodeId", "candidates"],
  sceneTransitionCandidate: [
    "transitionId",
    "targetNodeId",
    "logic",
    "requirements",
    "confidence",
    "rationale",
  ],
  sceneTransitionRequirement: ["type", "text", "polarity"],
} as const;

export const INTERNAL_AI_INTERPRETER_CONSTRAINTS = {
  action: {
    types: [
      "TALK_TO_NPC",
      "SOCIAL_PERSUADE",
      "SOCIAL_INTIMIDATE",
      "SOCIAL_DECEIVE",
      "READ_EMOTION",
      "ASK_SCENE_INFO",
      "ASK_HINT",
      "ASK_SUMMARY",
      "REQUEST_SCENE_TRANSITION",
      "OBSERVE_AREA",
      "INSPECT_STORY_OBJECT",
      "INVESTIGATE_OBJECT",
      "LISTEN",
      "DETECT_DANGER",
      "SPECIAL_MOVE",
      "INTERACT_OBJECT",
      "USE_TOOL",
      "USE_ITEM_EXPLORE",
      "SPLIT_PARTY_TASK",
      "COMBAT_MANEUVER",
      "ENVIRONMENT_USE",
      "IMPROVISED_ATTACK",
      "CALLED_SHOT",
      "READY_ACTION",
      "REACTION_REQUEST",
      "COMBAT_TALK",
      "USE_ITEM_COMBAT",
      "USE_SPELL_CREATIVELY",
      "TACTIC_QUERY",
      "ASK_RULE",
      "MAP_MOVE",
      "MAP_ATTACK",
      "MAP_CAST_SPELL",
      "MAP_USE_CLASS_FEATURE",
      "MAP_END_TURN",
      "GM_ONLY_DAMAGE",
      "GM_ONLY_HEAL",
      "GM_ONLY_CONDITION",
      "GM_ONLY_INVENTORY_MUTATION",
      "GAME_META_QUESTION",
      "OUT_OF_SCOPE",
    ],
    attackKinds: [
      "weapon_attack",
      "melee_spell_attack",
      "ranged_spell_attack",
    ],
    suggestedDifficulties: ["easy", "medium", "hard"],
    maxLengths: {
      actorCharacterId: 100,
      targetId: 100,
      spellId: 100,
      featureId: 100,
      ability: 50,
      skill: 80,
      approach: 300,
    },
  },
  output: {
    maxLengths: {
      clarificationQuestion: 300,
      mentionedSpellId: 100,
      mentionedItemId: 100,
      requiredRuleCheckId: 100,
    },
  },
  sceneTransition: {
    requirementTypes: [
      "ACTION_EVIDENCE",
      "CLUE_REVEALED",
      "CLUE_NOT_REVEALED",
      "OBJECT_STATE",
      "FLAG_SET",
      "COMBAT_RESOLVED",
      "GM_APPROVAL",
    ],
    logics: ["ALL", "ANY"],
    polarities: ["MUST", "MUST_NOT"],
    maxLengths: {
      selectedTargetNodeId: 100,
      transitionId: 100,
      targetNodeId: 100,
      rationale: 300,
      requirementText: 200,
    },
  },
} as const;

// AI 서버의 30초 전체 deadline 뒤 fallback 응답을 전송할 수 있도록 transport 여유를 둔다.
const DEFAULT_TIMEOUT_MS = 35_000;
const MAX_DB_INT = INTERNAL_AI_TRACE_CONSTRAINTS.maxInteger;
const MAX_TRACE_ATTEMPTS = INTERNAL_AI_TRACE_CONSTRAINTS.maxAttempts;
type AiResponseDecoder<T> = (value: unknown) => T;

function readBoundedString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
  label = key,
): string {
  const value = readString(record, key, label);
  if (value.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }
  return value;
}

function readNonEmptyBoundedString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
  label = key,
): string {
  const value = readBoundedString(record, key, maxLength, label);
  if (!value.length) {
    throw new Error(`${label} must not be empty.`);
  }
  return value;
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
  label = key,
  maxLength?: number,
): string | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isString(value)) {
    throw new Error(`${label} must be a string or null.`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }
  return value;
}

function readNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  label = key,
  maxValue: number = MAX_DB_INT,
): number {
  const value = readNumber(record, key, label);
  if (!Number.isInteger(value) || value < 0 || value > maxValue) {
    throw new Error(`${label} must be an integer between 0 and ${maxValue}.`);
  }
  return value;
}

function readOptionalNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  label = key,
  maxValue: number = MAX_DB_INT,
): number | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isNumber(value) || !Number.isInteger(value) || value < 0 || value > maxValue) {
    throw new Error(`${label} must be an integer between 0 and ${maxValue} when provided.`);
  }
  return value;
}

function readOptionalNonNegativeIntegerArray(
  record: Record<string, unknown>,
  key: string,
  label = key,
  maxLength: number = MAX_TRACE_ATTEMPTS,
): number[] {
  const value = record[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.length > maxLength ||
    !value.every(
      (entry) =>
        isNumber(entry) &&
        Number.isInteger(entry) &&
        entry >= 0 &&
        entry <= MAX_DB_INT,
    )
  ) {
    throw new Error(
      `${label} must contain at most ${maxLength} non-negative 32-bit integers.`,
    );
  }
  return value;
}

function readConfidence(record: Record<string, unknown>, key: string, label = key): number {
  const value = readNumber(record, key, label);
  if (value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
  return value;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw new Error(`${label} contains unexpected fields: ${unexpected.join(", ")}.`);
  }
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
  label = key,
  maxItems = 100,
  maxItemLength = 2_000,
): string[] | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    !isStringArray(value)
    || value.length > maxItems
    || value.some((item) => !item.length || item.length > maxItemLength)
  ) {
    throw new Error(
      `${label} must contain at most ${maxItems} non-empty strings of at most ${maxItemLength} characters.`,
    );
  }
  return value;
}

function readLiteral<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const matched = isString(value) ? allowed.find((entry) => entry === value) : undefined;
  if (!matched) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return matched;
}

function readNullableLiteral<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  label: string,
): T | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  return readLiteral(value, allowed, label);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && readOptionalString(error, "name") === "AbortError";
}

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
    return this.postJson<NarratorResponsePayload>("/internal/ai/narrator", payload, decodeNarratorResponse);
  }

  async runDirector(payload: DirectorRequestPayload): Promise<DirectorResponsePayload> {
    return this.postJson<DirectorResponsePayload>("/internal/ai/director", payload, decodeDirectorResponse);
  }

  async runSummarizer(payload: SummarizerRequestPayload): Promise<SummarizerResponsePayload> {
    return this.postJson<SummarizerResponsePayload>("/internal/ai/summarizer", payload, decodeSummarizerResponse);
  }

  async runNpcDialogue(payload: NpcDialogueRequestPayload): Promise<NpcDialogueResponsePayload> {
    return this.postJson<NpcDialogueResponsePayload>("/internal/ai/npc-dialogue", payload, decodeNpcDialogueResponse);
  }

  async runCheckResult(payload: CheckResultRequestPayload): Promise<CheckResultResponsePayload> {
    return this.postJson<CheckResultResponsePayload>("/internal/ai/check-result", payload, decodeCheckResultResponse);
  }

  async runInterpreter(payload: InterpreterRequestPayload): Promise<InterpreterResponsePayload> {
    return this.postJson<InterpreterResponsePayload>("/internal/ai/interpreter", payload, decodeInterpreterResponse);
  }

  async runActor(payload: ActorRequestPayload): Promise<ActorResponsePayload> {
    return this.postJson<ActorResponsePayload>("/internal/ai/actor", payload, decodeActorResponse);
  }

  private async postJson<T>(path: string, body: unknown, decode: AiResponseDecoder<T>): Promise<T> {
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
      clearTimeout(timer);
      if (isAbortError(error)) {
        throw new GatewayTimeoutException("AI 서버 응답 시간이 초과되었습니다.");
      }
      throw new BadGatewayException("AI 서버에 연결할 수 없습니다.");
    }

    if (!response.ok) {
      const detail = await this.safeReadText(response);
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new GatewayTimeoutException("AI 서버 응답 시간이 초과되었습니다.");
      }
      throw new BadGatewayException(
        `AI 서버 오류 (${response.status}): ${detail || response.statusText}`,
      );
    }

    try {
      const body: unknown = await response.json();
      return decode(body);
    } catch {
      if (controller.signal.aborted) {
        throw new GatewayTimeoutException("AI 서버 응답 시간이 초과되었습니다.");
      }
      throw new BadGatewayException("AI 서버 응답 형식이 올바르지 않습니다.");
    } finally {
      clearTimeout(timer);
    }
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

function decodeBaseHarnessResponse<TParsed>(value: unknown, decodeParsed: AiResponseDecoder<TParsed>): BaseHarnessResponse<TParsed> {
  const record = readRecord(value, "AI response");
  assertOnlyKeys(
    record,
    INTERNAL_AI_RESPONSE_ENVELOPE_FIELDS,
    "AI response",
  );
  const trace = readRecord(record.trace, "AI response.trace");
  assertOnlyKeys(
    trace,
    INTERNAL_AI_TRACE_FIELDS,
    "AI response.trace",
  );
  const fallback = record.fallback;
  if (fallback !== undefined && !isBoolean(fallback)) {
    throw new Error("AI response.fallback must be a boolean.");
  }
  const fallbackReason = readNullableString(
    record,
    "fallbackReason",
    "AI response.fallbackReason",
    100,
  );
  const attempts = readNonNegativeInteger(
    trace,
    "attempts",
    "AI response.trace.attempts",
    MAX_TRACE_ATTEMPTS,
  );
  const attemptLatenciesWereProvided =
    trace.attemptLatenciesMs !== undefined
    && trace.attemptLatenciesMs !== null;
  const attemptLatenciesMs = readOptionalNonNegativeIntegerArray(
    trace,
    "attemptLatenciesMs",
    "AI response.trace.attemptLatenciesMs",
  );
  if (attemptLatenciesWereProvided && attemptLatenciesMs.length !== attempts) {
    throw new Error(
      "AI response.trace.attemptLatenciesMs length must equal attempts when provided.",
    );
  }
  const schemaValidationRetries = readOptionalNonNegativeInteger(
    trace,
    "schemaValidationRetries",
    "AI response.trace.schemaValidationRetries",
    INTERNAL_AI_TRACE_CONSTRAINTS.maxSchemaValidationRetries,
  );
  if (
    schemaValidationRetries !== null
    && schemaValidationRetries > Math.max(0, attempts - 1)
  ) {
    throw new Error(
      "AI response.trace.schemaValidationRetries cannot exceed completed follow-up attempts.",
    );
  }

  return {
    trace: {
      role: readBoundedString(trace, "role", 50, "AI response.trace.role"),
      provider: readBoundedString(trace, "provider", 100, "AI response.trace.provider"),
      model: readBoundedString(trace, "model", 200, "AI response.trace.model"),
      promptVersion: readBoundedString(
        trace,
        "promptVersion",
        200,
        "AI response.trace.promptVersion",
      ),
      latencyMs: readNonNegativeInteger(trace, "latencyMs", "AI response.trace.latencyMs"),
      providerLatencyMs: readOptionalNonNegativeInteger(
        trace,
        "providerLatencyMs",
        "AI response.trace.providerLatencyMs",
      ),
      attemptLatenciesMs,
      schemaValidationRetries,
      attempts,
      failureType: readNullableString(
        trace,
        "failureType",
        "AI response.trace.failureType",
        100,
      ),
      finishReason: readNullableString(
        trace,
        "finishReason",
        "AI response.trace.finishReason",
        100,
      ),
      providerRequestId: readNullableString(
        trace,
        "providerRequestId",
        "AI response.trace.providerRequestId",
        500,
      ),
      promptTokenCount: readOptionalNonNegativeInteger(
        trace,
        "promptTokenCount",
        "AI response.trace.promptTokenCount",
      ),
      outputTokenCount: readOptionalNonNegativeInteger(
        trace,
        "outputTokenCount",
        "AI response.trace.outputTokenCount",
      ),
      cachedTokenCount: readOptionalNonNegativeInteger(
        trace,
        "cachedTokenCount",
        "AI response.trace.cachedTokenCount",
      ),
      totalTokenCount: readOptionalNonNegativeInteger(
        trace,
        "totalTokenCount",
        "AI response.trace.totalTokenCount",
      ),
    },
    parsed: decodeParsed(record.parsed),
    ...(fallback !== undefined ? { fallback } : {}),
    ...(fallbackReason !== null ? { fallbackReason } : {}),
  };
}

function decodeNarratorResponse(value: unknown): NarratorResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "narrator.parsed");
    assertOnlyKeys(record, INTERNAL_AI_PARSED_FIELDS.narrator, "narrator.parsed");
    return {
      narration: readNonEmptyBoundedString(
        record,
        "narration",
        1_200,
        "narrator.parsed.narration",
      ),
    };
  });
}

function decodeDirectorResponse(value: unknown): DirectorResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "director.parsed");
    assertOnlyKeys(record, INTERNAL_AI_PARSED_FIELDS.director, "director.parsed");
    const suggestions = record.suggestions;
    if (
      !isStringArray(suggestions)
      || suggestions.length > 3
      || suggestions.some((item) => !item.length || item.length > 300)
    ) {
      throw new Error(
        "director.parsed.suggestions must contain at most 3 non-empty strings of at most 300 characters.",
      );
    }
    return {
      content: readNonEmptyBoundedString(
        record,
        "content",
        700,
        "director.parsed.content",
      ),
      suggestions,
    };
  });
}

function decodeSummarizerResponse(value: unknown): SummarizerResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "summarizer.parsed");
    assertOnlyKeys(record, INTERNAL_AI_PARSED_FIELDS.summarizer, "summarizer.parsed");
    return {
      content: readNonEmptyBoundedString(
        record,
        "content",
        1_200,
        "summarizer.parsed.content",
      ),
    };
  });
}

function decodeNpcDialogueResponse(value: unknown): NpcDialogueResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "npcDialogue.parsed");
    assertOnlyKeys(record, INTERNAL_AI_PARSED_FIELDS.npc_dialogue, "npcDialogue.parsed");
    return {
      dialogue: readNonEmptyBoundedString(
        record,
        "dialogue",
        500,
        "npcDialogue.parsed.dialogue",
      ),
    };
  });
}

function decodeCheckResultResponse(value: unknown): CheckResultResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "checkResult.parsed");
    assertOnlyKeys(record, INTERNAL_AI_PARSED_FIELDS.check_result, "checkResult.parsed");
    return {
      narration: readNonEmptyBoundedString(
        record,
        "narration",
        700,
        "checkResult.parsed.narration",
      ),
    };
  });
}

function decodeInterpreterResponse(value: unknown): InterpreterResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "interpreter.parsed");
    assertOnlyKeys(
      record,
      INTERNAL_AI_PARSED_FIELDS.interpreter,
      "interpreter.parsed",
    );
    const action = readRecord(record.action, "interpreter.parsed.action");
    assertOnlyKeys(
      action,
      INTERNAL_AI_INTERPRETER_NESTED_FIELDS.action,
      "interpreter.parsed.action",
    );
    const requiresRoll = action.requiresRoll;
    const needsClarification = record.needsClarification;
    if (!isBoolean(requiresRoll)) {
      throw new Error("interpreter.parsed.action.requiresRoll must be a boolean.");
    }
    if (!isBoolean(needsClarification)) {
      throw new Error("interpreter.parsed.needsClarification must be a boolean.");
    }
    const requiredRuleCheckIds = readOptionalStringArray(
      record,
      "requiredRuleCheckIds",
      "interpreter.parsed.requiredRuleCheckIds",
      10,
      INTERNAL_AI_INTERPRETER_CONSTRAINTS.output.maxLengths.requiredRuleCheckId,
    );
    return {
      action: {
        type: readLiteral(
          action.type,
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.types,
          "interpreter.parsed.action.type",
        ),
        actorCharacterId: readNonEmptyBoundedString(
          action,
          "actorCharacterId",
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.maxLengths.actorCharacterId,
          "interpreter.parsed.action.actorCharacterId",
        ),
        targetId: readNullableString(
          action,
          "targetId",
          "interpreter.parsed.action.targetId",
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.maxLengths.targetId,
        ),
        spellId: readNullableString(
          action,
          "spellId",
          "interpreter.parsed.action.spellId",
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.maxLengths.spellId,
        ),
        featureId: readNullableString(
          action,
          "featureId",
          "interpreter.parsed.action.featureId",
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.maxLengths.featureId,
        ),
        attackKind: readNullableLiteral(
          action,
          "attackKind",
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.attackKinds,
          "interpreter.parsed.action.attackKind",
        ),
        ability: readNullableString(
          action,
          "ability",
          "interpreter.parsed.action.ability",
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.maxLengths.ability,
        ),
        skill: readNullableString(
          action,
          "skill",
          "interpreter.parsed.action.skill",
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.maxLengths.skill,
        ),
        approach: readNonEmptyBoundedString(
          action,
          "approach",
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.maxLengths.approach,
          "interpreter.parsed.action.approach",
        ),
        confidence: readConfidence(action, "confidence", "interpreter.parsed.action.confidence"),
        requiresRoll,
        suggestedDifficulty: readNullableLiteral(
          action,
          "suggestedDifficulty",
          INTERNAL_AI_INTERPRETER_CONSTRAINTS.action.suggestedDifficulties,
          "interpreter.parsed.action.suggestedDifficulty",
        ),
      },
      needsClarification,
      clarificationQuestion: readNullableString(
        record,
        "clarificationQuestion",
        "interpreter.parsed.clarificationQuestion",
        INTERNAL_AI_INTERPRETER_CONSTRAINTS.output.maxLengths.clarificationQuestion,
      ),
      mentionedSpellId: readNullableString(
        record,
        "mentionedSpellId",
        "interpreter.parsed.mentionedSpellId",
        INTERNAL_AI_INTERPRETER_CONSTRAINTS.output.maxLengths.mentionedSpellId,
      ),
      mentionedItemId: readNullableString(
        record,
        "mentionedItemId",
        "interpreter.parsed.mentionedItemId",
        INTERNAL_AI_INTERPRETER_CONSTRAINTS.output.maxLengths.mentionedItemId,
      ),
      ...(requiredRuleCheckIds ? { requiredRuleCheckIds } : {}),
      sceneTransition: decodeInterpreterSceneTransition(record.sceneTransition),
    };
  });
}

function decodeActorResponse(value: unknown): ActorResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "actor.parsed");
    assertOnlyKeys(record, INTERNAL_AI_PARSED_FIELDS.actor, "actor.parsed");
    return {
      selectedActionId: readNonEmptyBoundedString(
        record,
        "selectedActionId",
        100,
        "actor.parsed.selectedActionId",
      ),
    };
  });
}

function decodeInterpreterSceneTransition(value: unknown): InterpreterSceneTransitionContract | null {
  if (value === undefined || value === null) {
    return null;
  }
  const record = readRecord(value, "interpreter.parsed.sceneTransition");
  assertOnlyKeys(
    record,
    INTERNAL_AI_INTERPRETER_NESTED_FIELDS.sceneTransition,
    "interpreter.parsed.sceneTransition",
  );
  const candidatesValue = record.candidates;
  return {
    selectedTargetNodeId: readNullableString(
      record,
      "selectedTargetNodeId",
      "interpreter.parsed.sceneTransition.selectedTargetNodeId",
      INTERNAL_AI_INTERPRETER_CONSTRAINTS.sceneTransition.maxLengths.selectedTargetNodeId,
    ),
    ...(candidatesValue === undefined || candidatesValue === null
      ? {}
      : { candidates: decodeInterpreterTransitionCandidates(candidatesValue) }),
  };
}

function decodeInterpreterTransitionCandidates(value: unknown): InterpreterSceneTransitionCandidateContract[] {
  if (!Array.isArray(value)) {
    throw new Error("interpreter.parsed.sceneTransition.candidates must be an array.");
  }
  if (value.length > 8) {
    throw new Error("interpreter.parsed.sceneTransition.candidates must contain at most 8 items.");
  }
  return value.map((candidate, index) => {
    const record = readRecord(candidate, `interpreter.parsed.sceneTransition.candidates[${index}]`);
    assertOnlyKeys(
      record,
      INTERNAL_AI_INTERPRETER_NESTED_FIELDS.sceneTransitionCandidate,
      `interpreter.parsed.sceneTransition.candidates[${index}]`,
    );
    const requirementsValue = record.requirements;
    if (!Array.isArray(requirementsValue)) {
      throw new Error(`interpreter.parsed.sceneTransition.candidates[${index}].requirements must be an array.`);
    }
    if (requirementsValue.length > 10) {
      throw new Error(`interpreter.parsed.sceneTransition.candidates[${index}].requirements must contain at most 10 items.`);
    }
    return {
      transitionId: readNullableString(
        record,
        "transitionId",
        `interpreter.parsed.sceneTransition.candidates[${index}].transitionId`,
        INTERNAL_AI_INTERPRETER_CONSTRAINTS.sceneTransition.maxLengths.transitionId,
      ),
      targetNodeId: readNonEmptyBoundedString(
        record,
        "targetNodeId",
        INTERNAL_AI_INTERPRETER_CONSTRAINTS.sceneTransition.maxLengths.targetNodeId,
        `interpreter.parsed.sceneTransition.candidates[${index}].targetNodeId`,
      ),
      logic: readLiteral(
        record.logic,
        INTERNAL_AI_INTERPRETER_CONSTRAINTS.sceneTransition.logics,
        `interpreter.parsed.sceneTransition.candidates[${index}].logic`,
      ),
      requirements: requirementsValue.map((requirement, requirementIndex) =>
        decodeInterpreterTransitionRequirement(requirement, `interpreter.parsed.sceneTransition.candidates[${index}].requirements[${requirementIndex}]`),
      ),
      confidence: readConfidence(record, "confidence", `interpreter.parsed.sceneTransition.candidates[${index}].confidence`),
      rationale: readNullableString(
        record,
        "rationale",
        `interpreter.parsed.sceneTransition.candidates[${index}].rationale`,
        INTERNAL_AI_INTERPRETER_CONSTRAINTS.sceneTransition.maxLengths.rationale,
      ),
    };
  });
}

function decodeInterpreterTransitionRequirement(value: unknown, label: string): InterpreterSceneTransitionRequirement {
  const record = readRecord(value, label);
  assertOnlyKeys(
    record,
    INTERNAL_AI_INTERPRETER_NESTED_FIELDS.sceneTransitionRequirement,
    label,
  );
  const polarity = record.polarity === undefined || record.polarity === null
    ? undefined
    : readLiteral(
        record.polarity,
        INTERNAL_AI_INTERPRETER_CONSTRAINTS.sceneTransition.polarities,
        `${label}.polarity`,
      );
  return {
    type: readLiteral(
      record.type,
      INTERNAL_AI_INTERPRETER_CONSTRAINTS.sceneTransition.requirementTypes,
      `${label}.type`,
    ),
    text: readNonEmptyBoundedString(
      record,
      "text",
      INTERNAL_AI_INTERPRETER_CONSTRAINTS.sceneTransition.maxLengths.requirementText,
      `${label}.text`,
    ),
    ...(polarity ? { polarity } : {}),
  };
}
