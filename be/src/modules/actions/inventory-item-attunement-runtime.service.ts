import { Injectable } from "@nestjs/common";
import { ActionOutcome } from "@trpg/shared-types";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { InventoryItemCharacterReaderService } from "./inventory-item-character-reader.service";
import {
  buildItemAttunementLogModel,
  type P3ItemRuntimeFlags,
} from "./inventory-item-policy";
import { InventoryItemRuntimeFlagsService } from "./inventory-item-runtime-flags.service";

@Injectable()
export class InventoryItemAttunementRuntimeService {
  constructor(
    private readonly inventoryItemCharacterReader: InventoryItemCharacterReaderService,
    private readonly inventoryItemRuntimeFlags: InventoryItemRuntimeFlagsService,
    private readonly turnLogsService: TurnLogsService,
  ) {}

  async attuneItem(params: {
    sessionId: string;
    sessionScenarioId: string;
    actorUserId: string;
    sessionCharacterId: string;
    itemEntryId: string;
    itemDefinitionId: string;
    itemName: string;
    attunedCount: number;
    flags: Record<string, unknown>;
    itemRuntime: P3ItemRuntimeFlags;
  }) {
    await this.inventoryItemRuntimeFlags.writeP3ItemRuntimeFlags({
      sessionScenarioId: params.sessionScenarioId,
      flags: params.flags,
      itemRuntime: params.itemRuntime,
    });
    const responseCharacter =
      await this.inventoryItemCharacterReader.getMappedSessionCharacter(
        params.sessionCharacterId,
      );
    const logModel = buildItemAttunementLogModel({
      itemEntryId: params.itemEntryId,
      itemDefinitionId: params.itemDefinitionId,
      itemName: params.itemName,
      characterName: responseCharacter.name,
      attunedCount: params.attunedCount,
    });
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      actorUserId: params.actorUserId,
      sessionCharacterId: params.sessionCharacterId,
      rawInput: null,
      structuredAction: logModel.structuredAction,
      diceResult: null,
      stateDiff: null,
      outcome: ActionOutcome.SUCCESS,
      narration: logModel.message,
    });

    return {
      message: logModel.message,
      responseCharacter,
      turnLog,
    };
  }
}
