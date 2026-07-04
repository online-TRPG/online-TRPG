import { SessionHumanGmMessageStoreService } from "./session-human-gm-message-store.service";
import type { HumanGmStoredMessage } from "./session-human-gm-message-store.service";

describe("SessionHumanGmMessageStoreService", () => {
  const service = new SessionHumanGmMessageStoreService();
  const createMessage = (id: string): HumanGmStoredMessage => ({
    id,
    type: "gm",
    speakerName: null,
    content: "The hall falls silent.",
    createdAt: "2026-07-02T00:00:00.000Z",
    authorUserId: "gm-1",
  });

  it("creates a stored GM message record", () => {
    expect(
      service.createMessage({
        id: "message-1",
        type: "npc",
        speakerName: "Innkeeper",
        content: "Welcome.",
        createdAt: "2026-07-02T00:00:00.000Z",
        authorUserId: "gm-1",
      }),
    ).toEqual({
      id: "message-1",
      type: "npc",
      speakerName: "Innkeeper",
      content: "Welcome.",
      createdAt: "2026-07-02T00:00:00.000Z",
      authorUserId: "gm-1",
    });
  });

  it("appends messages and keeps the latest 50", () => {
    const existing = Array.from({ length: 50 }, (_, index) => createMessage(`old-${index}`));
    const next = createMessage("new");

    const flags = service.append({ gmMessages: existing }, next);

    const messages = flags.gmMessages as HumanGmStoredMessage[];
    expect(messages).toHaveLength(50);
    expect(messages[0].id).toBe("old-1");
    expect(messages[49]).toEqual(next);
  });

  it("preserves unrelated flags and legacy message entries", () => {
    const legacyMessage = { id: "legacy", content: "Legacy payload" };
    const next = createMessage("new");

    expect(service.append({ gmMessages: [legacyMessage], otherFlag: true }, next)).toEqual({
      gmMessages: [legacyMessage, next],
      otherFlag: true,
    });
  });
});
