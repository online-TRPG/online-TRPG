import { Injectable } from "@nestjs/common";
import {
  HumanGmPrivateNoteDto,
  decodeHumanGmPrivateNote,
  isRecord,
} from "@trpg/shared-types";

const GM_PRIVATE_NOTES_FLAG = "gmPrivateNotes";

@Injectable()
export class SessionHumanGmPrivateNoteStoreService {
  list(flags: unknown): HumanGmPrivateNoteDto[] {
    if (!isRecord(flags)) {
      return [];
    }
    const notes = Array.isArray(flags[GM_PRIVATE_NOTES_FLAG]) ? flags[GM_PRIVATE_NOTES_FLAG] : [];
    return notes.flatMap((note) => this.decodeNoteOrEmpty(note));
  }

  listNewestFirst(flags: unknown): HumanGmPrivateNoteDto[] {
    return this.list(flags).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  append(flags: Record<string, unknown>, note: HumanGmPrivateNoteDto): Record<string, unknown> {
    return {
      ...flags,
      [GM_PRIVATE_NOTES_FLAG]: [...this.list(flags), note].slice(-100),
    };
  }

  private decodeNoteOrEmpty(value: unknown): HumanGmPrivateNoteDto[] {
    try {
      return [decodeHumanGmPrivateNote(value)];
    } catch {
      return [];
    }
  }
}
