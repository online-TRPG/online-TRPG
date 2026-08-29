import { BadGatewayException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AiClient,
  INTERNAL_AI_INTERPRETER_CONSTRAINTS,
  INTERNAL_AI_INTERPRETER_NESTED_FIELDS,
  INTERNAL_AI_PARSED_FIELDS,
  INTERNAL_AI_RESPONSE_ENVELOPE_FIELDS,
  INTERNAL_AI_TRACE_CONSTRAINTS,
  INTERNAL_AI_TRACE_FIELDS,
  type CheckResultRequestPayload,
  type InterpreterRequestPayload,
  type NarratorRequestPayload,
} from "./ai.client";

interface InternalAiContractManifest {
  contractVersion: string;
  internalResponse: {
    envelopeFields: string[];
    traceFields: string[];
    traceConstraints: unknown;
    parsedFieldsByRole: Record<string, string[]>;
    nestedFields: Record<string, string[]>;
    interpreterConstraints: unknown;
  };
}

const contractManifest = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../ai/contracts/internal_ai_contract_v1.json",
    ),
    "utf8",
  ),
) as InternalAiContractManifest;

const request: NarratorRequestPayload = {
  rawInput: "주변을 살핀다.",
  action: {
    type: "OBSERVE_AREA",
    actorCharacterId: "character-1",
    approach: "주변을 살핀다.",
    confidence: 1,
    requiresRoll: false,
  },
  scene: {
    summary: "석문 앞",
    tone: "mysterious",
  },
};

const checkResultRequest: CheckResultRequestPayload = {
  outcome: "SUCCESS",
  intent: "SOCIAL_PERSUADE",
  actionSummary: "경비병 설득 판정에 성공했다.",
  sceneSummary: "북문 앞",
  allowedRewardFacts: ["북문은 비어 있다."],
};

const interpreterRequest: InterpreterRequestPayload = {
  rawText: "석문을 조사한다.",
  actorCharacterId: "character-1",
};

function validResponse(): Record<string, unknown> {
  return {
    trace: {
      role: "narrator",
      provider: "google-ai-studio",
      model: "test-model",
      promptVersion: "narrator.v1.md",
      latencyMs: 20,
      providerLatencyMs: 15,
      attemptLatenciesMs: [15],
      schemaValidationRetries: 0,
      attempts: 1,
      failureType: null,
      finishReason: "STOP",
      providerRequestId: "provider-request-1",
      promptTokenCount: 20,
      outputTokenCount: 5,
      cachedTokenCount: 0,
      totalTokenCount: 25,
    },
    parsed: {
      narration: "석문 주변을 살폈다.",
    },
    fallback: false,
  };
}

function validInterpreterResponse(): Record<string, unknown> {
  const body = validResponse();
  (body.trace as Record<string, unknown>).role = "interpreter";
  body.parsed = {
    action: {
      type: "INVESTIGATE_OBJECT",
      actorCharacterId: "character-1",
      targetId: "stone-door",
      spellId: null,
      featureId: null,
      attackKind: null,
      ability: null,
      skill: "investigation",
      approach: "석문의 틈을 조사한다.",
      confidence: 0.9,
      requiresRoll: true,
      suggestedDifficulty: "medium",
    },
    needsClarification: false,
    clarificationQuestion: null,
    mentionedSpellId: null,
    mentionedItemId: null,
    requiredRuleCheckIds: [],
    sceneTransition: {
      selectedTargetNodeId: null,
      candidates: [
        {
          transitionId: "transition-1",
          targetNodeId: "node-2",
          logic: "ALL",
          requirements: [
            {
              type: "ACTION_EVIDENCE",
              text: "석문을 열었다.",
              polarity: "MUST",
            },
          ],
          confidence: 1,
          rationale: null,
        },
      ],
    },
  };
  return body;
}

function mockJsonResponse(body: unknown): void {
  jest.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
}

describe("AiClient trace contract", () => {
  beforeEach(() => {
    process.env.AI_SERVICE_URL = "http://ai.test";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.AI_SERVICE_URL;
  });

  it("accepts bounded integer trace metadata", async () => {
    mockJsonResponse(validResponse());

    const response = await new AiClient().runNarrator(request);

    expect(response.trace.attempts).toBe(1);
    expect(response.trace.totalTokenCount).toBe(25);
  });

  it("keeps the BE decoder field allowlists aligned with the shared manifest", () => {
    const contract = contractManifest.internalResponse;

    expect(contractManifest.contractVersion).toBe("internal-ai-contract-v1");
    expect(INTERNAL_AI_RESPONSE_ENVELOPE_FIELDS).toEqual(
      contract.envelopeFields,
    );
    expect(INTERNAL_AI_TRACE_FIELDS).toEqual(contract.traceFields);
    expect(INTERNAL_AI_TRACE_CONSTRAINTS).toEqual(contract.traceConstraints);
    expect(INTERNAL_AI_PARSED_FIELDS).toEqual(contract.parsedFieldsByRole);
    expect(INTERNAL_AI_INTERPRETER_NESTED_FIELDS).toEqual({
      action: contract.nestedFields.interpreterAction,
      sceneTransition: contract.nestedFields.interpreterSceneTransition,
      sceneTransitionCandidate:
        contract.nestedFields.interpreterSceneTransitionCandidate,
      sceneTransitionRequirement:
        contract.nestedFields.interpreterSceneTransitionRequirement,
    });
    expect(INTERNAL_AI_INTERPRETER_CONSTRAINTS).toEqual(
      contract.interpreterConstraints,
    );
  });

  it("accepts Check Result narration without the removed rewardInfo echo", async () => {
    const body = validResponse();
    (body.trace as Record<string, unknown>).role = "check_result";
    body.parsed = {
      narration: "경비병은 북문이 비어 있다고 털어놓았다.",
    };
    mockJsonResponse(body);

    const response = await new AiClient().runCheckResult(checkResultRequest);

    expect(response.parsed).toEqual({
      narration: "경비병은 북문이 비어 있다고 털어놓았다.",
    });
  });

  it("rejects removed server-derived parsed fields", async () => {
    const body = validResponse();
    (body.parsed as Record<string, unknown>).visibleSummary = "obsolete echo";
    mockJsonResponse(body);

    await expect(new AiClient().runNarrator(request)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it("rejects removed duplicate top-level metadata", async () => {
    const body = validResponse();
    body.model = "obsolete-top-level-model";
    mockJsonResponse(body);

    await expect(new AiClient().runNarrator(request)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it("rejects empty model-generated text that Pydantic marks non-empty", async () => {
    const body = validResponse();
    body.parsed = { narration: "" };
    mockJsonResponse(body);

    await expect(new AiClient().runNarrator(request)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it.each([
    [
      "unknown action type",
      (body: Record<string, unknown>) => {
        const parsed = body.parsed as Record<string, unknown>;
        (parsed.action as Record<string, unknown>).type = "UNCONTRACTED_ACTION";
      },
    ],
    [
      "oversized action approach",
      (body: Record<string, unknown>) => {
        const parsed = body.parsed as Record<string, unknown>;
        (parsed.action as Record<string, unknown>).approach = "x".repeat(301);
      },
    ],
    [
      "unknown suggested difficulty",
      (body: Record<string, unknown>) => {
        const parsed = body.parsed as Record<string, unknown>;
        (parsed.action as Record<string, unknown>).suggestedDifficulty = "extreme";
      },
    ],
    [
      "oversized transition requirement text",
      (body: Record<string, unknown>) => {
        const parsed = body.parsed as Record<string, unknown>;
        const transition = parsed.sceneTransition as Record<string, unknown>;
        const candidate = (transition.candidates as Array<Record<string, unknown>>)[0];
        const requirement = (
          candidate.requirements as Array<Record<string, unknown>>
        )[0];
        requirement.text = "x".repeat(201);
      },
    ],
  ])("rejects Interpreter %s", async (_caseName, mutate) => {
    const body = validInterpreterResponse();
    mutate(body);
    mockJsonResponse(body);

    await expect(
      new AiClient().runInterpreter(interpreterRequest),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it.each([
    ["attempts", 3],
    ["attemptLatenciesMs", [1, 2, 3]],
    ["attemptLatenciesMs", []],
    ["schemaValidationRetries", 2],
    ["schemaValidationRetries", 1],
    ["promptTokenCount", 1.5],
    ["totalTokenCount", 2_147_483_648],
    ["providerRequestId", "x".repeat(501)],
  ])("rejects out-of-contract trace.%s", async (field, value) => {
    const body = validResponse();
    (body.trace as Record<string, unknown>)[field] = value;
    mockJsonResponse(body);

    await expect(new AiClient().runNarrator(request)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
