import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
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

export interface CheckResultRequestPayload {
  outcome: "SUCCESS" | "FAILURE";
  intent: string;
  playerText: string;
  actionSummary: string;
  targetName?: string | null;
  targetSummary?: string | null;
  targetDisposition?: string | null;
  sceneSummary: string;
  publicClues?: string[];
  visibleEntities?: string[];
  outputMode?: "GM_NARRATION" | "NPC_REPLY" | "OBSERVATION";
  sessionId?: string;
  turnId?: string;
  model?: string;
}

export interface CheckResultParsed {
  narration: string;
  rewardInfo: string;
  safetyNotes?: string[];
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
  actorCharacterId?: string;
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
  mentionedConditionIds?: string[];
  requiredRuleCheckIds?: string[];
  rulesConfidence?: number | null;
  safetyNotes?: string[];
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
  reason: string;
  safetyNotes?: string[];
}

export type ActorResponsePayload = BaseHarnessResponse<ActorParsed>;

const DEFAULT_TIMEOUT_MS = 30_000;
type AiResponseDecoder<T> = (value: unknown) => T;

function readNullableString(record: Record<string, unknown>, key: string, label = key): string | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (!isString(value)) {
    throw new Error(`${label} must be a string or null.`);
  }
  return value;
}

function readNonNegativeNumber(record: Record<string, unknown>, key: string, label = key): number {
  const value = readNumber(record, key, label);
  if (value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
}

function readPositiveInteger(record: Record<string, unknown>, key: string, label = key): number {
  const value = readNumber(record, key, label);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
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

function readOptionalConfidence(record: Record<string, unknown>, key: string, label = key): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isNumber(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
  return value;
}

function readOptionalStringArray(record: Record<string, unknown>, key: string, label = key): string[] | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isStringArray(value)) {
    throw new Error(`${label} must be a string array.`);
  }
  return value;
}

function readStringRecordOrNull(value: unknown, label: string): Record<string, string> | null {
  if (value === undefined || value === null) {
    return null;
  }
  const record = readRecord(value, label);
  const result: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(record)) {
    if (!isString(entryValue)) {
      throw new Error(`${label} must have only string values.`);
    }
    result[entryKey] = entryValue;
  }
  return result;
}

function readLiteral<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const matched = isString(value) ? allowed.find((entry) => entry === value) : undefined;
  if (!matched) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return matched;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && readOptionalString(error, "name") === "AbortError";
}

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
    try {
      return await this.attemptPostJson<T>(path, body, decode);
    } catch (error) {
      if (error instanceof GatewayTimeoutException) {
        this.logger.warn(`AI request timed out, retrying once: path=${path}`);
        return await this.attemptPostJson<T>(path, body, decode);
      }
      throw error;
    }
  }

  private async attemptPostJson<T>(path: string, body: unknown, decode: AiResponseDecoder<T>): Promise<T> {
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
      if (isAbortError(error)) {
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

    try {
      const body: unknown = await response.json();
      return decode(body);
    } catch {
      throw new BadGatewayException("AI 서버 응답 형식이 올바르지 않습니다.");
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
  const trace = readRecord(record.trace, "AI response.trace");
  const fallback = record.fallback;
  if (fallback !== undefined && !isBoolean(fallback)) {
    throw new Error("AI response.fallback must be a boolean.");
  }
  const fallbackReason = readNullableString(record, "fallbackReason", "AI response.fallbackReason");

  return {
    provider: readString(record, "provider", "AI response.provider"),
    model: readString(record, "model", "AI response.model"),
    latencyMs: readNonNegativeNumber(record, "latencyMs", "AI response.latencyMs"),
    promptVersion: readString(record, "promptVersion", "AI response.promptVersion"),
    rawOutput: readString(record, "rawOutput", "AI response.rawOutput"),
    finishReason: readNullableString(record, "finishReason", "AI response.finishReason"),
    providerRequestId: readNullableString(record, "providerRequestId", "AI response.providerRequestId"),
    trace: {
      role: readString(trace, "role", "AI response.trace.role"),
      provider: readString(trace, "provider", "AI response.trace.provider"),
      model: readString(trace, "model", "AI response.trace.model"),
      promptVersion: readString(trace, "promptVersion", "AI response.trace.promptVersion"),
      latencyMs: readNonNegativeNumber(trace, "latencyMs", "AI response.trace.latencyMs"),
      attempts: readPositiveInteger(trace, "attempts", "AI response.trace.attempts"),
      failureType: readNullableString(trace, "failureType", "AI response.trace.failureType"),
      finishReason: readNullableString(trace, "finishReason", "AI response.trace.finishReason"),
      providerRequestId: readNullableString(trace, "providerRequestId", "AI response.trace.providerRequestId"),
    },
    logPaths: readStringRecordOrNull(record.logPaths, "AI response.logPaths"),
    parsed: decodeParsed(record.parsed),
    ...(fallback !== undefined ? { fallback } : {}),
    ...(fallbackReason !== null ? { fallbackReason } : {}),
  };
}

function decodeNarratorResponse(value: unknown): NarratorResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "narrator.parsed");
    return {
      narration: readString(record, "narration", "narrator.parsed.narration"),
      visibleSummary: readString(record, "visibleSummary", "narrator.parsed.visibleSummary"),
    };
  });
}

function decodeDirectorResponse(value: unknown): DirectorResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "director.parsed");
    const suggestions = record.suggestions;
    if (!isStringArray(suggestions)) {
      throw new Error("director.parsed.suggestions must be a string array.");
    }
    const safetyNotes = readOptionalStringArray(record, "safetyNotes", "director.parsed.safetyNotes");
    return {
      hintLevel: readString(record, "hintLevel", "director.parsed.hintLevel"),
      content: readString(record, "content", "director.parsed.content"),
      sourceScope: readString(record, "sourceScope", "director.parsed.sourceScope"),
      spoilerLevel: readString(record, "spoilerLevel", "director.parsed.spoilerLevel"),
      suggestions,
      ...(safetyNotes ? { safetyNotes } : {}),
    };
  });
}

function decodeSummarizerResponse(value: unknown): SummarizerResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "summarizer.parsed");
    const keyFacts = record.keyFacts;
    if (!isStringArray(keyFacts)) {
      throw new Error("summarizer.parsed.keyFacts must be a string array.");
    }
    const safetyNotes = readOptionalStringArray(record, "safetyNotes", "summarizer.parsed.safetyNotes");
    return {
      summaryType: readString(record, "summaryType", "summarizer.parsed.summaryType"),
      coveredTurnRange: readString(record, "coveredTurnRange", "summarizer.parsed.coveredTurnRange"),
      content: readString(record, "content", "summarizer.parsed.content"),
      keyFacts,
      ...(safetyNotes ? { safetyNotes } : {}),
    };
  });
}

function decodeNpcDialogueResponse(value: unknown): NpcDialogueResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "npcDialogue.parsed");
    const safetyNotes = readOptionalStringArray(record, "safetyNotes", "npcDialogue.parsed.safetyNotes");
    return {
      dialogue: readString(record, "dialogue", "npcDialogue.parsed.dialogue"),
      tone: readString(record, "tone", "npcDialogue.parsed.tone"),
      ...(safetyNotes ? { safetyNotes } : {}),
    };
  });
}

function decodeCheckResultResponse(value: unknown): CheckResultResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "checkResult.parsed");
    const safetyNotes = readOptionalStringArray(record, "safetyNotes", "checkResult.parsed.safetyNotes");
    return {
      narration: readString(record, "narration", "checkResult.parsed.narration"),
      rewardInfo: readString(record, "rewardInfo", "checkResult.parsed.rewardInfo"),
      ...(safetyNotes ? { safetyNotes } : {}),
    };
  });
}

function decodeInterpreterResponse(value: unknown): InterpreterResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "interpreter.parsed");
    const action = readRecord(record.action, "interpreter.parsed.action");
    const requiresRoll = action.requiresRoll;
    const needsClarification = record.needsClarification;
    if (!isBoolean(requiresRoll)) {
      throw new Error("interpreter.parsed.action.requiresRoll must be a boolean.");
    }
    if (!isBoolean(needsClarification)) {
      throw new Error("interpreter.parsed.needsClarification must be a boolean.");
    }
    const mentionedConditionIds = readOptionalStringArray(record, "mentionedConditionIds", "interpreter.parsed.mentionedConditionIds");
    const requiredRuleCheckIds = readOptionalStringArray(record, "requiredRuleCheckIds", "interpreter.parsed.requiredRuleCheckIds");
    const safetyNotes = readOptionalStringArray(record, "safetyNotes", "interpreter.parsed.safetyNotes");
    return {
      action: {
        type: readString(action, "type", "interpreter.parsed.action.type"),
        actorCharacterId: readString(action, "actorCharacterId", "interpreter.parsed.action.actorCharacterId"),
        targetId: readNullableString(action, "targetId", "interpreter.parsed.action.targetId"),
        spellId: readNullableString(action, "spellId", "interpreter.parsed.action.spellId"),
        featureId: readNullableString(action, "featureId", "interpreter.parsed.action.featureId"),
        attackKind: readNullableString(action, "attackKind", "interpreter.parsed.action.attackKind"),
        ability: readNullableString(action, "ability", "interpreter.parsed.action.ability"),
        skill: readNullableString(action, "skill", "interpreter.parsed.action.skill"),
        approach: readString(action, "approach", "interpreter.parsed.action.approach"),
        confidence: readConfidence(action, "confidence", "interpreter.parsed.action.confidence"),
        requiresRoll,
        suggestedDifficulty: readNullableString(action, "suggestedDifficulty", "interpreter.parsed.action.suggestedDifficulty"),
      },
      needsClarification,
      clarificationQuestion: readNullableString(record, "clarificationQuestion", "interpreter.parsed.clarificationQuestion"),
      mentionedSpellId: readNullableString(record, "mentionedSpellId", "interpreter.parsed.mentionedSpellId"),
      mentionedItemId: readNullableString(record, "mentionedItemId", "interpreter.parsed.mentionedItemId"),
      ...(mentionedConditionIds ? { mentionedConditionIds } : {}),
      ...(requiredRuleCheckIds ? { requiredRuleCheckIds } : {}),
      rulesConfidence: readOptionalConfidence(record, "rulesConfidence", "interpreter.parsed.rulesConfidence") ?? null,
      ...(safetyNotes ? { safetyNotes } : {}),
      sceneTransition: decodeInterpreterSceneTransition(record.sceneTransition),
    };
  });
}

function decodeActorResponse(value: unknown): ActorResponsePayload {
  return decodeBaseHarnessResponse(value, (parsed) => {
    const record = readRecord(parsed, "actor.parsed");
    const safetyNotes = readOptionalStringArray(record, "safetyNotes", "actor.parsed.safetyNotes");
    return {
      selectedActionId: readString(record, "selectedActionId", "actor.parsed.selectedActionId"),
      reason: readString(record, "reason", "actor.parsed.reason"),
      ...(safetyNotes ? { safetyNotes } : {}),
    };
  });
}

function decodeInterpreterSceneTransition(value: unknown): InterpreterSceneTransitionContract | null {
  if (value === undefined || value === null) {
    return null;
  }
  const record = readRecord(value, "interpreter.parsed.sceneTransition");
  const candidatesValue = record.candidates;
  return {
    selectedTargetNodeId: readNullableString(record, "selectedTargetNodeId", "interpreter.parsed.sceneTransition.selectedTargetNodeId"),
    ...(candidatesValue === undefined || candidatesValue === null
      ? {}
      : { candidates: decodeInterpreterTransitionCandidates(candidatesValue) }),
  };
}

function decodeInterpreterTransitionCandidates(value: unknown): InterpreterSceneTransitionCandidateContract[] {
  if (!Array.isArray(value)) {
    throw new Error("interpreter.parsed.sceneTransition.candidates must be an array.");
  }
  return value.map((candidate, index) => {
    const record = readRecord(candidate, `interpreter.parsed.sceneTransition.candidates[${index}]`);
    const requirementsValue = record.requirements;
    if (!Array.isArray(requirementsValue)) {
      throw new Error(`interpreter.parsed.sceneTransition.candidates[${index}].requirements must be an array.`);
    }
    return {
      transitionId: readNullableString(record, "transitionId", `interpreter.parsed.sceneTransition.candidates[${index}].transitionId`),
      targetNodeId: readString(record, "targetNodeId", `interpreter.parsed.sceneTransition.candidates[${index}].targetNodeId`),
      logic: readLiteral(record.logic, ["ALL", "ANY"], `interpreter.parsed.sceneTransition.candidates[${index}].logic`),
      requirements: requirementsValue.map((requirement, requirementIndex) =>
        decodeInterpreterTransitionRequirement(requirement, `interpreter.parsed.sceneTransition.candidates[${index}].requirements[${requirementIndex}]`),
      ),
      confidence: readConfidence(record, "confidence", `interpreter.parsed.sceneTransition.candidates[${index}].confidence`),
      rationale: readNullableString(record, "rationale", `interpreter.parsed.sceneTransition.candidates[${index}].rationale`),
    };
  });
}

function decodeInterpreterTransitionRequirement(value: unknown, label: string): InterpreterSceneTransitionRequirement {
  const record = readRecord(value, label);
  const polarity = record.polarity === undefined || record.polarity === null
    ? undefined
    : readLiteral(record.polarity, ["MUST", "MUST_NOT"], `${label}.polarity`);
  return {
    type: readLiteral(
      record.type,
      ["ACTION_EVIDENCE", "CLUE_REVEALED", "CLUE_NOT_REVEALED", "OBJECT_STATE", "FLAG_SET", "COMBAT_RESOLVED", "GM_APPROVAL"],
      `${label}.type`,
    ),
    text: readString(record, "text", `${label}.text`),
    ...(polarity ? { polarity } : {}),
  };
}
