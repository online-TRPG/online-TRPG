import { Injectable } from "@nestjs/common";
import {
  DiceRollResponseDto,
  SessionCharacterResponseDto,
  TurnLogResponseDto,
  UseInventoryItemResponseDto,
} from "@trpg/shared-types";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";

@Injectable()
export class InventoryItemResultPublisherService {
  constructor(
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly sessionsService: SessionsService,
  ) {}

  async publishUseResult(params: {
    sessionId: string;
    itemId: string;
    itemName: string;
    consumedQuantity: number;
    healedHp: number | null;
    message: string;
    responseCharacter: SessionCharacterResponseDto;
    updatedCharacters?: SessionCharacterResponseDto[];
    diceResults?: DiceRollResponseDto[];
    turnLog?: TurnLogResponseDto | null;
  }): Promise<UseInventoryItemResponseDto> {
    for (const character of dedupeCharacters(params.updatedCharacters ?? [])) {
      this.realtimeEvents.emitCharacterUpdated(params.sessionId, character);
    }
    for (const roll of params.diceResults ?? []) {
      this.realtimeEvents.emitDiceRolled(params.sessionId, roll);
    }
    if (params.turnLog) {
      this.realtimeEvents.emitTurnLogCreated(params.sessionId, params.turnLog);
    }
    this.realtimeEvents.emitSessionSnapshot(
      params.sessionId,
      await this.sessionsService.buildSnapshot(params.sessionId),
    );

    return {
      sessionId: params.sessionId,
      itemId: params.itemId,
      itemName: params.itemName,
      consumedQuantity: params.consumedQuantity,
      healedHp: params.healedHp,
      message: params.message,
      character: params.responseCharacter,
    };
  }
}

function dedupeCharacters(
  characters: SessionCharacterResponseDto[],
): SessionCharacterResponseDto[] {
  const seen = new Set<string>();
  return characters.filter((character) => {
    if (seen.has(character.id)) {
      return false;
    }
    seen.add(character.id);
    return true;
  });
}
