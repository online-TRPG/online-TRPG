import { HumanGmAiAssistSuggestionDto } from "@trpg/shared-types";
import { SessionHumanGmAiAssistSuggestionStoreService } from "./session-human-gm-ai-assist-suggestion-store.service";

describe("SessionHumanGmAiAssistSuggestionStoreService", () => {
  const service = new SessionHumanGmAiAssistSuggestionStoreService();
  const createSuggestion = (id: string, overrides: Partial<HumanGmAiAssistSuggestionDto> = {}): HumanGmAiAssistSuggestionDto => ({
    id,
    assistType: "scene_text",
    content: "Suggestion",
    suggestedActionId: null,
    targetId: null,
    status: "PENDING",
    createdByUserId: "gm-1",
    acceptedByUserId: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    acceptedAt: null,
    ...overrides,
  });

  it("lists only valid suggestions from flags", () => {
    expect(
      service.list({
        humanGmAiAssistSuggestions: [
          createSuggestion("suggestion-1"),
          { id: "invalid", status: "BROKEN" },
          null,
        ],
      }),
    ).toEqual([createSuggestion("suggestion-1")]);
  });

  it("appends suggestions and keeps the latest 100", () => {
    const existing = Array.from({ length: 100 }, (_, index) => createSuggestion(`old-${index}`));
    const next = createSuggestion("new");

    const flags = service.append({ humanGmAiAssistSuggestions: existing }, next);

    const suggestions = flags.humanGmAiAssistSuggestions as HumanGmAiAssistSuggestionDto[];
    expect(suggestions).toHaveLength(100);
    expect(suggestions[0].id).toBe("old-1");
    expect(suggestions[99]).toEqual(next);
  });

  it("marks a matching suggestion accepted", () => {
    const flags = service.markAccepted(
      { humanGmAiAssistSuggestions: [createSuggestion("keep"), createSuggestion("accept-me")] },
      "accept-me",
      "gm-2",
    );

    expect(flags.humanGmAiAssistSuggestions).toEqual([
      createSuggestion("keep"),
      expect.objectContaining({
        id: "accept-me",
        status: "ACCEPTED",
        acceptedByUserId: "gm-2",
        acceptedAt: expect.any(String),
      }),
    ]);
  });
});
