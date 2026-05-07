import { ActionProcessorService } from "./action-processor.service";
import { InterpreterResponsePayload } from "../ai/ai.client";

const createService = (): ActionProcessorService =>
  new ActionProcessorService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

const createInterpreterResponse = (
  action: Partial<InterpreterResponsePayload["parsed"]["action"]>,
  parsedOverrides: Partial<InterpreterResponsePayload["parsed"]> = {},
): InterpreterResponsePayload =>
  ({
    provider: "test",
    model: "test",
    latencyMs: 1,
    promptVersion: "test",
    rawOutput: "{}",
    finishReason: null,
    providerRequestId: null,
    trace: {
      role: "interpreter",
      provider: "test",
      model: "test",
      promptVersion: "test",
      latencyMs: 1,
      attempts: 1,
      failureType: null,
      finishReason: null,
      providerRequestId: null,
    },
    logPaths: null,
    parsed: {
      action: {
        type: "attack",
        actorCharacterId: "actor",
        targetId: "Target",
        spellId: null,
        featureId: null,
        attackKind: null,
        ability: null,
        skill: null,
        approach: "test",
        confidence: 0.9,
        requiresRoll: true,
        suggestedDifficulty: null,
        ...action,
      },
      needsClarification: false,
      clarificationQuestion: null,
      mentionedSpellId: null,
      mentionedItemId: null,
      mentionedConditionIds: [],
      requiredRuleCheckIds: [],
      rulesConfidence: 0.9,
      safetyNotes: [],
      ...parsedOverrides,
    },
  }) as InterpreterResponsePayload;

describe("ActionProcessorService rule input conversion", () => {
  it("keeps explicit slash commands as authoritative input", () => {
    const service = createService() as unknown as {
      toRuleInput: (rawText: string, response: InterpreterResponsePayload | null) => string;
    };

    expect(
      service.toRuleInput("/attack Target", createInterpreterResponse({ type: "cast_spell" })),
    ).toBe("/attack Target");
  });

  it("turns interpreted spell actions into cast commands", () => {
    const service = createService() as unknown as {
      toRuleInput: (rawText: string, response: InterpreterResponsePayload | null) => string;
    };

    expect(
      service.toRuleInput(
        "고블린에게 파이어 볼트를 쏜다",
        createInterpreterResponse({
          type: "cast_spell",
          targetId: "Goblin",
          spellId: "spell.fire_bolt",
        }),
      ),
    ).toBe("/cast spell.fire_bolt Goblin 90");
  });

  it("turns interpreted checks into check commands with SRD-like default DCs", () => {
    const service = createService() as unknown as {
      toRuleInput: (rawText: string, response: InterpreterResponsePayload | null) => string;
    };

    expect(
      service.toRuleInput(
        "주변을 살핀다",
        createInterpreterResponse({
          type: "skill_check",
          targetId: null,
          skill: "perception",
          suggestedDifficulty: "hard",
        }),
      ),
    ).toBe("/check perception 20");
  });

  it("falls back to raw text when clarification is required", () => {
    const service = createService() as unknown as {
      toRuleInput: (rawText: string, response: InterpreterResponsePayload | null) => string;
    };

    expect(
      service.toRuleInput(
        "그걸 한다",
        createInterpreterResponse({}, { needsClarification: true }),
      ),
    ).toBe("그걸 한다");
  });
});
