import { Injectable } from "@nestjs/common";

export type HumanGmStoredMessage = {
  id: string;
  type: "gm" | "npc";
  speakerName: string | null;
  content: string;
  createdAt: string;
  authorUserId: string;
};

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

  append(flags: Record<string, unknown>, message: HumanGmStoredMessage): Record<string, unknown> {
    const gmMessages = Array.isArray(flags.gmMessages) ? [...flags.gmMessages] : [];
    return {
      ...flags,
      gmMessages: [...gmMessages, message].slice(-50),
    };
  }
}
