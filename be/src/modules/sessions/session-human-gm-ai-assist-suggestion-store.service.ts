import { Injectable } from "@nestjs/common";
import { HumanGmAiAssistSuggestionDto } from "@trpg/shared-types";

@Injectable()
export class SessionHumanGmAiAssistSuggestionStoreService {
  list(flags: Record<string, unknown>): HumanGmAiAssistSuggestionDto[] {
    const suggestions = Array.isArray(flags.humanGmAiAssistSuggestions) ? flags.humanGmAiAssistSuggestions : [];
    return suggestions.filter((suggestion): suggestion is HumanGmAiAssistSuggestionDto => this.isSuggestion(suggestion));
  }

  append(flags: Record<string, unknown>, suggestion: HumanGmAiAssistSuggestionDto): Record<string, unknown> {
    return {
      ...flags,
      humanGmAiAssistSuggestions: [...this.list(flags), suggestion].slice(-100),
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
      humanGmAiAssistSuggestions: suggestions,
    };
  }

  private isSuggestion(value: unknown): value is HumanGmAiAssistSuggestionDto {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.assistType === "string" &&
      typeof candidate.content === "string" &&
      (candidate.suggestedActionId === null || typeof candidate.suggestedActionId === "string") &&
      (candidate.targetId === null || typeof candidate.targetId === "string") &&
      (candidate.status === "PENDING" || candidate.status === "ACCEPTED") &&
      typeof candidate.createdByUserId === "string" &&
      (candidate.acceptedByUserId === null || typeof candidate.acceptedByUserId === "string") &&
      typeof candidate.createdAt === "string" &&
      (candidate.acceptedAt === null || typeof candidate.acceptedAt === "string")
    );
  }
}
