import { Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  type DiceRollResponseDto,
  type SessionCharacterResponseDto,
  type TurnLogResponseDto,
} from "@trpg/shared-types";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { type ExecutableItemDefinition } from "../rules/p3-item-manifest";
import { InventoryItemCharacterReaderService } from "./inventory-item-character-reader.service";
import { type InventoryItemEffectResolution } from "./inventory-item-effect-application.service";
import {
  buildInventoryItemUseLogModel,
  type P3ItemRuntimeFlags,
} from "./inventory-item-policy";

@Injectable()
export class InventoryItemUseResultRuntimeService {
  constructor(
    private readonly inventoryItemCharacterReader: InventoryItemCharacterReaderService,
    private readonly turnLogsService: TurnLogsService,
  ) {}

  async createUseResult(params: {
    sessionId: string;
    sessionScenarioId: string;
    actorUserId: string;
    actorSessionCharacterId: string;
    targetSessionCharacterId: string;
    itemEntryId: string;
    itemDefinitionId: string;
    itemName: string;
    healedHp: number | null;
    effectResolution: InventoryItemEffectResolution | null;
    executableItem: Pick<
      ExecutableItemDefinition,
      "consumeOnUse" | "actionCost" | "effect" | "maxCharges"
    > | null;
    itemRuntime: P3ItemRuntimeFlags;
  }): Promise<{
    message: string;
    responseCharacter: SessionCharacterResponseDto;
    updatedCharacters: SessionCharacterResponseDto[];
    diceResults: DiceRollResponseDto[];
    turnLog: TurnLogResponseDto;
  }> {
    const targetCharacter =
      await this.inventoryItemCharacterReader.getMappedSessionCharacter(
        params.targetSessionCharacterId,
      );
    const actorCharacter =
      params.targetSessionCharacterId === params.actorSessionCharacterId
        ? targetCharacter
        : await this.inventoryItemCharacterReader.getMappedSessionCharacter(
            params.actorSessionCharacterId,
          );
    const logModel = buildInventoryItemUseLogModel({
      itemEntryId: params.itemEntryId,
      itemDefinitionId: params.itemDefinitionId,
      itemName: params.itemName,
      characterName: targetCharacter.name,
      healedHp: params.healedHp,
      effectMessage: params.effectResolution?.message ?? null,
      consumeOnUse: params.executableItem?.consumeOnUse ?? true,
      actionCost: params.executableItem?.actionCost ?? "action",
      effect: params.executableItem?.effect ?? null,
      remainingCharges:
        params.executableItem?.maxCharges
          ? params.itemRuntime.chargesByItemEntryId[params.itemEntryId]
          : null,
    });
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      actorUserId: params.actorUserId,
      sessionCharacterId: params.actorSessionCharacterId,
      rawInput: null,
      structuredAction: logModel.structuredAction,
      diceResult: params.effectResolution?.diceResult
        ? { ...params.effectResolution.diceResult }
        : null,
      stateDiff: null,
      outcome: ActionOutcome.SUCCESS,
      narration: logModel.message,
    });

    return {
      message: logModel.message,
      responseCharacter: actorCharacter,
      updatedCharacters: [targetCharacter, actorCharacter],
      diceResults: params.effectResolution?.diceResult
        ? [params.effectResolution.diceResult]
        : [],
      turnLog,
    };
  }
}
