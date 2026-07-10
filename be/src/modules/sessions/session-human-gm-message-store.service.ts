import { Injectable } from "@nestjs/common";
import { isRecord } from "@trpg/shared-types";

export type HumanGmStoredMessage = {
  id: string;
  type: "gm" | "npc";
  speakerName: string | null;
  content: string;
  createdAt: string;
  authorUserId: string;
};

const GM_MESSAGES_FLAG = "gmMessages";

@Injectable()
export class SessionHumanGmMessageStoreService {
  createMessage(params: HumanGmStoredMessage): HumanGmStoredMessage {
    return {
      id: params.id,
      type: params.type,
      speakerName: params.speakerName,
      content: params.content,
      createdAt: params.createdAt,
      authorUserId: params.authorUserId,
    };
  }

  list(flags: unknown): HumanGmStoredMessage[] {
    if (!isRecord(flags)) {
      return [];
    }
    const gmMessages = Array.isArray(flags[GM_MESSAGES_FLAG]) ? flags[GM_MESSAGES_FLAG] : [];
    return gmMessages.flatMap((message) => this.decodeMessageOrEmpty(message));
  }

  append(flags: Record<string, unknown>, message: HumanGmStoredMessage): Record<string, unknown> {
    return {
      ...flags,
      [GM_MESSAGES_FLAG]: [...this.list(flags), message].slice(-50),
    };
  }

  private decodeMessageOrEmpty(value: unknown): HumanGmStoredMessage[] {
    const message = decodeHumanGmStoredMessage(value);
    return message ? [message] : [];
  }
}

function decodeHumanGmStoredMessage(value: unknown): HumanGmStoredMessage | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    (value.type !== "gm" && value.type !== "npc") ||
    (value.speakerName !== null && typeof value.speakerName !== "string") ||
    typeof value.content !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.authorUserId !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    type: value.type,
    speakerName: value.speakerName,
    content: value.content,
    createdAt: value.createdAt,
    authorUserId: value.authorUserId,
  };
}
