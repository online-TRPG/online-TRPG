import { HumanGmPrivateNoteDto } from "@trpg/shared-types";
import { SessionHumanGmPrivateNoteStoreService } from "./session-human-gm-private-note-store.service";

describe("SessionHumanGmPrivateNoteStoreService", () => {
  const service = new SessionHumanGmPrivateNoteStoreService();
  const createNote = (id: string, createdAt: string, overrides: Partial<HumanGmPrivateNoteDto> = {}): HumanGmPrivateNoteDto => ({
    id,
    turnLogId: `turn-log-${id}`,
    kind: "scene_text",
    targetId: null,
    note: "Private GM note",
    gmUserId: "gm-1",
    createdAt,
    ...overrides,
  });

  it("lists only valid private notes from flags", () => {
    const note = createNote("note-1", "2026-07-02T00:00:00.000Z");

    expect(
      service.list({
        gmPrivateNotes: [
          note,
          { id: "invalid", kind: "scene_text" },
          null,
        ],
      }),
    ).toEqual([note]);
  });

  it("returns notes in newest-first order", () => {
    const older = createNote("older", "2026-07-02T00:00:00.000Z");
    const newer = createNote("newer", "2026-07-02T00:00:01.000Z");

    expect(service.listNewestFirst({ gmPrivateNotes: [older, newer] })).toEqual([newer, older]);
  });

  it("appends notes and keeps the latest 100", () => {
    const existing = Array.from({ length: 100 }, (_, index) =>
      createNote(`old-${index}`, "2026-07-02T00:00:00.000Z"),
    );
    const next = createNote("new", "2026-07-02T02:00:00.000Z");

    const flags = service.append({ gmPrivateNotes: existing }, next);

    const notes = flags.gmPrivateNotes as HumanGmPrivateNoteDto[];
    expect(notes).toHaveLength(100);
    expect(notes[0].id).toBe("old-1");
    expect(notes[99]).toEqual(next);
  });
});
