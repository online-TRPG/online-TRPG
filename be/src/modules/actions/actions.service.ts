import { Injectable } from "@nestjs/common";
import {
  ActionInputType as PrismaActionInputType,
  ActionScope as PrismaActionScope,
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  ActionAcceptedResponseDto,
  ActionOutcome,
  ActionInputType,
  RestActionDto,
  SubmitActionDto,
  UseInventoryItemDto,
  UseInventoryItemResponseDto,
} from "@trpg/shared-types";
import { forbidden } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { ActionQueueSubmissionService } from "./action-queue-submission.service";
import { ActionSubmissionContextLoaderService } from "./action-submission-context-loader.service";
import { InventoryItemActionCostRuntimeService } from "./inventory-item-action-cost-runtime.service";
import { InventoryItemAttunementRuntimeService } from "./inventory-item-attunement-runtime.service";
import { InventoryItemCharacterReaderService } from "./inventory-item-character-reader.service";
import { InventoryItemConsumptionRuntimeService } from "./inventory-item-consumption-runtime.service";
import { InventoryItemContextLoaderService } from "./inventory-item-context-loader.service";
import { InventoryItemEffectApplicationService } from "./inventory-item-effect-application.service";
import { InventoryItemEffectRuntimeService } from "./inventory-item-effect-runtime.service";
import { InventoryItemMapRuntimeService } from "./inventory-item-map-runtime.service";
import { InventoryItemResultPublisherService } from "./inventory-item-result-publisher.service";
import { InventoryItemRuntimeStateService } from "./inventory-item-runtime-state.service";
import { InventoryItemSpellRuntimeService } from "./inventory-item-spell-runtime.service";
import { InventoryItemUseResultRuntimeService } from "./inventory-item-use-result-runtime.service";
import { InventoryPackUseRuntimeService } from "./inventory-pack-use-runtime.service";
import { RestApprovalGuardService } from "./rest-approval-guard.service";
import { RestApprovalRequestRecorderService } from "./rest-approval-request-recorder.service";
import { RestApprovalResolutionService } from "./rest-approval-resolution.service";
import {
  P3_ITEM_RUNTIME_FLAGS_KEY,
  parseJson,
  parseP3ItemRuntimeFlags,
} from "./inventory-item-policy";
import {
  buildRestActionRawText,
} from "./rest-approval-policy";

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly turnLogsService: TurnLogsService,
    private readonly actionQueueSubmission: ActionQueueSubmissionService,
    private readonly actionSubmissionContextLoader: ActionSubmissionContextLoaderService,
    private readonly inventoryItemActionCostRuntime: InventoryItemActionCostRuntimeService,
    private readonly inventoryItemAttunementRuntime: InventoryItemAttunementRuntimeService,
    private readonly inventoryItemCharacterReader: InventoryItemCharacterReaderService,
    private readonly inventoryItemConsumptionRuntime: InventoryItemConsumptionRuntimeService,
    private readonly inventoryItemContextLoader: InventoryItemContextLoaderService,
    private readonly inventoryItemEffectApplication: InventoryItemEffectApplicationService,
    private readonly inventoryItemEffectRuntime: InventoryItemEffectRuntimeService,
    private readonly inventoryItemMapRuntime: InventoryItemMapRuntimeService,
    private readonly inventoryItemResultPublisher: InventoryItemResultPublisherService,
    private readonly inventoryItemRuntimeState: InventoryItemRuntimeStateService,
    private readonly inventoryItemSpellRuntime: InventoryItemSpellRuntimeService,
    private readonly inventoryItemUseResultRuntime: InventoryItemUseResultRuntimeService,
    private readonly inventoryPackUseRuntime: InventoryPackUseRuntimeService,
    private readonly restApprovalGuard: RestApprovalGuardService,
    private readonly restApprovalRequestRecorder: RestApprovalRequestRecorderService,
    private readonly restApprovalResolution: RestApprovalResolutionService,
  ) {}

  async submitAction(
    userId: string,
    sessionId: string,
    dto: SubmitActionDto,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const { state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const { sessionCharacter, actionScope } =
      await this.actionSubmissionContextLoader.loadSubmitActionContext({
        sessionId: session.id,
        userId,
        dto,
        phase: state.phase,
      });

    return this.actionQueueSubmission.submitPendingAction({
      sessionId: session.id,
      userId,
      sessionCharacterId: sessionCharacter.id,
      rawText: dto.rawText.trim(),
      inputType: this.resolveInputType(dto),
      actionScope,
      baseStateVersion: state.version,
      clientCreatedAt: new Date(dto.clientCreatedAt),
    });
  }

  async submitRestAction(
    userId: string,
    sessionId: string,
    dto: RestActionDto,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const { sessionCharacter, isGmOperator } =
      await this.actionSubmissionContextLoader.loadRestActionContext({
        sessionId: session.id,
        userId,
        characterId: dto.characterId,
      });

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(
      session.id,
    );
    if (state.phase === PrismaGamePhase.COMBAT) {
      throw forbidden("ACTION_403", "전투 중에는 휴식을 진행할 수 없습니다.", {
        reason: "REST_BLOCKED_IN_COMBAT",
      });
    }

    const rawText = buildRestActionRawText({
      restType: dto.restType,
      hitDiceToSpend: dto.hitDiceToSpend,
    });
    if (session.gmMode === PrismaGmMode.HUMAN && !isGmOperator) {
      return this.restApprovalRequestRecorder.recordHumanGmRequest({
        sessionId: session.id,
        sessionScenarioId: sessionScenario.id,
        stateVersion: state.version,
        sessionCharacterId: sessionCharacter.id,
        userId: sessionCharacter.userId,
        restType: dto.restType,
        hitDiceToSpend: dto.hitDiceToSpend,
        rawText,
      });
    }

    return this.actionQueueSubmission.submitPendingAction({
      sessionId: session.id,
      userId: sessionCharacter.userId,
      sessionCharacterId: sessionCharacter.id,
      rawText,
      inputType: PrismaActionInputType.COMMAND,
      actionScope: PrismaActionScope.PARTY_SHARED,
      baseStateVersion: state.version,
      clientCreatedAt: new Date(),
    });
  }

  async approveRestAction(
    userId: string,
    sessionId: string,
    actionId: string,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    this.restApprovalGuard.ensureHumanGmSession(session.gmMode, "승인");
    await this.restApprovalGuard.ensureGmOperator({
      sessionId: session.id,
      userId,
      actionLabel: "승인",
    });
    const action = await this.restApprovalGuard.getApprovalAction({
      sessionId: session.id,
      actionId,
      actionLabel: "승인",
    });
    await this.restApprovalGuard.rejectIfExpired({
      sessionId: session.id,
      action,
    });

    const gameState = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    if (gameState?.state?.phase === PrismaGamePhase.COMBAT) {
      throw forbidden("ACTION_403", "전투 중에는 휴식을 진행할 수 없습니다.", {
        reason: "REST_BLOCKED_IN_COMBAT",
      });
    }

    return this.restApprovalResolution.approve({
      sessionId: session.id,
      action,
    });
  }

  async rejectRestAction(
    userId: string,
    sessionId: string,
    actionId: string,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    this.restApprovalGuard.ensureHumanGmSession(session.gmMode, "거절");
    await this.restApprovalGuard.ensureGmOperator({
      sessionId: session.id,
      userId,
      actionLabel: "거절",
    });
    const action = await this.restApprovalGuard.getApprovalAction({
      sessionId: session.id,
      actionId,
      actionLabel: "거절",
    });
    await this.restApprovalGuard.rejectIfExpired({
      sessionId: session.id,
      action,
    });

    return this.restApprovalResolution.rejectOrCancel({
      sessionId: session.id,
      actorUserId: userId,
      action,
      status: "rejected",
      failureReason: "REST_REJECTED_BY_GM",
      narration: "GM이 휴식 요청을 거절했습니다.",
    });
  }

  async cancelRestAction(
    userId: string,
    sessionId: string,
    actionId: string,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    this.restApprovalGuard.ensureHumanGmSession(session.gmMode, "취소");
    const action = await this.restApprovalGuard.getApprovalAction({
      sessionId: session.id,
      actionId,
      actionLabel: "취소",
    });
    this.restApprovalGuard.ensureRequester({
      actionUserId: action.userId,
      userId,
    });
    await this.restApprovalGuard.rejectIfExpired({
      sessionId: session.id,
      action,
    });

    return this.restApprovalResolution.rejectOrCancel({
      sessionId: session.id,
      actorUserId: userId,
      action,
      status: "cancelled",
      failureReason: "REST_CANCELLED_BY_REQUESTER",
      narration: "요청자가 휴식 요청을 취소했습니다.",
      requesterUserId: userId,
    });
  }

  async useInventoryItem(
    userId: string,
    sessionId: string,
    dto: UseInventoryItemDto,
  ): Promise<UseInventoryItemResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const {
      sessionCharacter,
      targetSessionCharacter,
      item,
      executableItem,
    } = await this.inventoryItemContextLoader.loadUseContext({
      sessionId: session.id,
      userId,
      itemId: dto.itemId,
      targetSessionCharacterId: dto.targetSessionCharacterId ?? null,
    });

    const { sessionScenario, state } =
      await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const flags = parseJson<Record<string, unknown>>(
      state.flagsJson,
      {},
    );
    let itemRuntime = parseP3ItemRuntimeFlags(
      flags[P3_ITEM_RUNTIME_FLAGS_KEY],
    );
    const attunement = this.inventoryItemRuntimeState.resolveAttunement({
      executableItem,
      itemRuntime,
      sessionCharacterId: sessionCharacter.id,
      itemEntryId: item.id,
    });
    if (attunement.requiresNewAttunement) {
      const attunementResult =
        await this.inventoryItemAttunementRuntime.attuneItem({
          sessionId: session.id,
          sessionScenarioId: state.sessionScenarioId,
          actorUserId: userId,
          sessionCharacterId: sessionCharacter.id,
          itemEntryId: item.id,
          itemDefinitionId: item.itemDefinitionId,
          itemName: item.itemDefinition.name,
          attunedCount: attunement.attunedCount,
          flags,
          itemRuntime: attunement.itemRuntime,
        });
      return this.inventoryItemResultPublisher.publishUseResult({
        sessionId: session.id,
        itemId: item.id,
        itemName: item.itemDefinition.name,
        consumedQuantity: 0,
        healedHp: null,
        message: attunementResult.message,
        responseCharacter: attunementResult.responseCharacter,
        turnLog: attunementResult.turnLog,
      });
    }

    itemRuntime = this.inventoryItemRuntimeState.spendCharge({
      executableItem,
      itemRuntime,
      itemEntryId: item.id,
    });
    if (
      executableItem &&
      executableItem.actionCost !== "none"
    ) {
      await this.inventoryItemActionCostRuntime.spendActionCost({
        sessionId: session.id,
        sessionCharacterId: sessionCharacter.id,
        actionCost: executableItem.actionCost,
      });
    }
    if (executableItem && targetSessionCharacter.id !== sessionCharacter.id) {
      await this.inventoryItemMapRuntime.assertTargetInRange({
        userId,
        sessionId: session.id,
        actorSessionCharacterId: sessionCharacter.id,
        targetSessionCharacterId: targetSessionCharacter.id,
        rangeFt: Math.max(executableItem.rangeFt, 5),
      });
    }

    const packUseResult = await this.inventoryPackUseRuntime.tryUsePack({
      sessionCharacterId: sessionCharacter.id,
      itemEntryId: item.id,
      itemDefinition: item.itemDefinition,
    });
    if (packUseResult) {
      return this.inventoryItemResultPublisher.publishUseResult({
        sessionId: session.id,
        itemId: item.id,
        itemName: item.itemDefinition.name,
        consumedQuantity: 1,
        healedHp: null,
        message: packUseResult.message,
        responseCharacter: packUseResult.responseCharacter,
        updatedCharacters: [packUseResult.responseCharacter],
      });
    }

    const executableItemSpellEffect =
      executableItem?.effect.type === "spell"
        ? executableItem.effect
        : null;
    if (executableItem && executableItemSpellEffect) {
      const spellItemResolution =
        await this.inventoryItemSpellRuntime.resolveExecutableItemSpellEffect({
          userId,
          sessionId: session.id,
          sessionScenarioId: sessionScenario.id,
          actorUserId: userId,
          actorSessionCharacterId: sessionCharacter.id,
          itemEntryId: item.id,
          itemDefinitionId: item.itemDefinitionId,
          itemName: item.itemDefinition.name,
          executableItem,
          spellEffect: executableItemSpellEffect,
          targetParticipantId: dto.targetParticipantId ?? null,
          point: dto.point ?? null,
          remainingCharges: executableItem.maxCharges
            ? itemRuntime.chargesByItemEntryId[item.id] ?? null
            : null,
        });

      const useCost =
        await this.inventoryItemConsumptionRuntime.persistUseCost({
          itemEntryId: item.id,
          executableItem,
          sessionScenarioId: state.sessionScenarioId,
          flags,
          itemRuntime,
        });
      const actorCharacter = await this.inventoryItemCharacterReader.getMappedSessionCharacter(
        sessionCharacter.id,
      );
      return this.inventoryItemResultPublisher.publishUseResult({
        sessionId: session.id,
        itemId: item.id,
        itemName: item.itemDefinition.name,
        consumedQuantity: useCost.consumedQuantity,
        healedHp: null,
        message: spellItemResolution.message,
        responseCharacter: actorCharacter,
        updatedCharacters: [actorCharacter],
        diceResults: spellItemResolution.diceResults,
        turnLog: spellItemResolution.turnLog,
      });
    }

    const effectResolution = executableItem
      ? this.inventoryItemEffectRuntime.resolveExecutableItemEffect(
          executableItem,
          targetSessionCharacter,
        )
      : null;
    if (executableItem?.effect.type === "terrain") {
      await this.inventoryItemMapRuntime.deployTerrainEffect({
        userId,
        sessionId: session.id,
        sessionCharacterId: sessionCharacter.id,
        itemEntryId: item.id,
        itemName: item.itemDefinition.name,
        terrainEffectId: executableItem.effect.terrainEffectId,
        sizeFt: executableItem.effect.sizeFt,
      });
    }
    const { healedHp } =
      await this.inventoryItemEffectApplication.applyCharacterEffect({
        targetSessionCharacter,
        itemDefinition: item.itemDefinition,
        effectResolution,
      });

    const useCost = await this.inventoryItemConsumptionRuntime.persistUseCost({
      itemEntryId: item.id,
      executableItem,
      sessionScenarioId: state.sessionScenarioId,
      flags,
      itemRuntime,
    });

    const useResult = await this.inventoryItemUseResultRuntime.createUseResult({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      actorSessionCharacterId: sessionCharacter.id,
      targetSessionCharacterId: targetSessionCharacter.id,
      itemEntryId: item.id,
      itemDefinitionId: item.itemDefinitionId,
      itemName: item.itemDefinition.name,
      healedHp,
      effectResolution,
      executableItem,
      itemRuntime,
    });

    return this.inventoryItemResultPublisher.publishUseResult({
      sessionId: session.id,
      itemId: item.id,
      itemName: item.itemDefinition.name,
      consumedQuantity: useCost.consumedQuantity,
      healedHp,
      message: useResult.message,
      responseCharacter: useResult.responseCharacter,
      updatedCharacters: useResult.updatedCharacters,
      diceResults: useResult.diceResults,
      turnLog: useResult.turnLog,
    });
  }

  private ensurePlaying(status: PrismaSessionStatus): void {
    if (status !== PrismaSessionStatus.PLAYING) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "SESSION_NOT_PLAYING",
      });
    }
  }

  private resolveInputType(dto: SubmitActionDto): PrismaActionInputType {
    if (dto.inputType === ActionInputType.SELECT) {
      return PrismaActionInputType.SELECT;
    }

    return dto.rawText.trim().startsWith("/")
      ? PrismaActionInputType.COMMAND
      : PrismaActionInputType.TEXT;
  }
}
