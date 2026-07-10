import { Injectable } from "@nestjs/common";
import {
  HumanGmAiAssistSuggestionDto,
  decodeHumanGmAiAssistSuggestion,
  isRecord,
} from "@trpg/shared-types";

const HUMAN_GM_AI_ASSIST_SUGGESTIONS_FLAG = "humanGmAiAssistSuggestions";

@Injectable()
export class SessionHumanGmAiAssistSuggestionStoreService {
  list(flags: unknown): HumanGmAiAssistSuggestionDto[] {
    if (!isRecord(flags)) {
      return [];
    }
    const suggestions = Array.isArray(flags[HUMAN_GM_AI_ASSIST_SUGGESTIONS_FLAG])
      ? flags[HUMAN_GM_AI_ASSIST_SUGGESTIONS_FLAG]
      : [];
    return suggestions.flatMap((suggestion) => this.decodeSuggestionOrEmpty(suggestion));
  }

  findById(flags: unknown, suggestionId: string): HumanGmAiAssistSuggestionDto | null {
    return this.list(flags).find((suggestion) => suggestion.id === suggestionId) ?? null;
  }

  append(flags: Record<string, unknown>, suggestion: HumanGmAiAssistSuggestionDto): Record<string, unknown> {
    return {
      ...flags,
      [HUMAN_GM_AI_ASSIST_SUGGESTIONS_FLAG]: [...this.list(flags), suggestion].slice(-100),
    };
  }

  markAccepted(flags: Record<string, unknown>, suggestionId: string, acceptedByUserId: string): Record<string, unknown> {
    const acceptedAt = new Date().toISOString();
    const suggestions = this.list(flags).map((suggestion) =>
      suggestion.id === suggestionId
        ? {
            ...suggestion,
            status: "ACCEPTED" as const,
            acceptedByUserId,
            acceptedAt,
          }
        : suggestion,
    );
    return {
      ...flags,
      [HUMAN_GM_AI_ASSIST_SUGGESTIONS_FLAG]: suggestions,
    };
  }

  private decodeSuggestionOrEmpty(value: unknown): HumanGmAiAssistSuggestionDto[] {
    try {
      return [decodeHumanGmAiAssistSuggestion(value)];
    } catch {
      return [];
    }
  }
}
