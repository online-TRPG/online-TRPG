import { Injectable } from "@nestjs/common";
import { HumanGmPrivateNoteDto } from "@trpg/shared-types";

@Injectable()
export class SessionHumanGmPrivateNoteStoreService {
  list(flags: Record<string, unknown>): HumanGmPrivateNoteDto[] {
    const notes = Array.isArray(flags.gmPrivateNotes) ? flags.gmPrivateNotes : [];
    return notes.filter((note): note is HumanGmPrivateNoteDto => this.isNote(note));
  }

  listNewestFirst(flags: Record<string, unknown>): HumanGmPrivateNoteDto[] {
    return this.list(flags).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  append(flags: Record<string, unknown>, note: HumanGmPrivateNoteDto): Record<string, unknown> {
    return {
      ...flags,
      gmPrivateNotes: [...this.list(flags), note].slice(-100),
    };
  }

  private isNote(value: unknown): value is HumanGmPrivateNoteDto {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.turnLogId === "string" &&
      typeof candidate.kind === "string" &&
      (candidate.targetId === null || typeof candidate.targetId === "string") &&
      typeof candidate.note === "string" &&
      typeof candidate.gmUserId === "string" &&
      typeof candidate.createdAt === "string"
    );
  }
}
