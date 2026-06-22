import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  ActionInputType as PrismaActionInputType,
  ActionQueueStatus as PrismaActionQueueStatus,
  ActionScope as PrismaActionScope,
  CombatStatus as PrismaCombatStatus,
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import {
  ActionAcceptedResponseDto,
  ActionOutcome,
  ActionInputType,
  ActionQueueStatus,
  ActionScope,
  RestActionDto,
  SubmitActionDto,
  UseInventoryItemDto,
  UseInventoryItemResponseDto,
} from "@trpg/shared-types";
import { badRequest, forbidden } from "../../common/exceptions/domain-error";
import { mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { CommandParserService } from "../rules/command-parser.service";
import { ActionEconomyService } from "../rules/action-economy.service";
import { ConditionRuntimeService } from "../rules/condition-runtime.service";
import { DiceService } from "../rules/dice.service";
import { InventoryRuntimeService } from "../rules/inventory-runtime.service";
import {
  ExecutableItemDefinition,
  getExecutableItemDefinition,
} from "../rules/p3-item-manifest";
import { SessionsService } from "../sessions/sessions.service";
import { MapRuntimeService } from "../sessions/map-runtime.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { ActionProcessorService } from "./action-processor.service";
import {
  getRestApprovalExpiresAt,
  isRestApprovalExpired,
} from "./rest-approval-policy";

type SrdEquipmentContent = {
  itemId: string;
  quantity: number;
};

const P3_ITEM_RUNTIME_FLAGS_KEY = "p3ItemRuntime";
type P3ItemRuntimeFlags = {
  attunedItemEntryIdsByCharacter: Record<string, string[]>;
  chargesByItemEntryId: Record<string, number>;
};

type SrdEquipmentRecord = {
  id: string;
  name?: {
    en?: string;
    ko?: string;
    aliases?: string[];
  };
  category?: {
    kind?: string;
    equipmentCategory?: string;
  };
  economy?: {
    weight?: {
      lb?: number;
    } | null;
  };
  weapon?: {
    rangeRaw?: string;
    damage?: {
      dice?: string;
    };
    damageType?: string;
    properties?: Array<{ id?: string; raw?: string }>;
  };
  armor?: {
    category?: string;
    armorClass?: {
      base?: number;
      bonus?: number;
      raw?: string;
    };
    strengthRequirement?:
      | number
      | {
          minimum?: number;
        }
      | null;
    stealthDisadvantage?: boolean;
  };
  use?: {
    damage?: {
      dice?: string;
      raw?: string;
    };
    damageType?: string;
  };
  contents?: SrdEquipmentContent[];
};

@Injectable()
export class ActionsService {
  private srdEquipmentCache: SrdEquipmentRecord[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly actionProcessor: ActionProcessorService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly commandParser: CommandParserService,
    private readonly inventoryRuntime: InventoryRuntimeService,
    private readonly turnLogsService: TurnLogsService,
    private readonly diceService: DiceService,
    private readonly conditionRuntime: ConditionRuntimeService,
    private readonly mapRuntimeService: MapRuntimeService,
    private readonly actionEconomy: ActionEconomyService,
  ) {}

  async submitAction(
    userId: string,
    sessionId: string,
    dto: SubmitActionDto,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw forbidden("SESSION_403", "해당 세션에 접근할 수 없습니다.", {
        reason: "NOT_A_SESSION_PARTICIPANT",
      });
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      include: { character: true },
    });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (![sessionCharacter.id, sessionCharacter.characterId].includes(dto.characterId)) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_MISMATCH",
      });
    }

    // S14P31A201-71: sessionId+userId 복합키 조회로 본인 sessionCharacter 만 얻지만,
    // 캐릭터 이양/공유 등 향후 기능 대비해 Character.ownerUserId 도 명시 검증.
    if (sessionCharacter.character.ownerUserId !== userId) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_OWNERSHIP_MISMATCH",
      });
    }

    const { state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const actionScope = this.resolveActionScope(dto.actionScope, state.phase);
    this.ensureCommandSyntax(dto.rawText);

    await this.ensureScopeAllowed({
      sessionId: session.id,
      userId,
      participantRole: participant.role,
      sessionCharacterId: sessionCharacter.id,
      sessionCharacterCurrentHp: sessionCharacter.currentHp,
      phase: state.phase,
      actionScope,
    });

    const action = await this.prisma.playerAction.create({
      data: {
        sessionId: session.id,
        userId,
        sessionCharacterId: sessionCharacter.id,
        rawText: dto.rawText.trim(),
        inputType: this.resolveInputType(dto),
        actionScope,
        queueStatus: PrismaActionQueueStatus.PENDING,
        baseStateVersion: state.version,
        clientCreatedAt: new Date(dto.clientCreatedAt),
      },
    });

    this.realtimeEvents.emitActionAccepted(session.id, {
      playerActionId: action.id,
      actorUserId: action.userId,
      rawText: action.rawText,
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });

    // MVP에서는 별도 큐 인프라 없이 요청 직후 한 건을 처리한다.
    // DB에는 큐 상태가 남기 때문에 나중에 BullMQ 같은 작업 큐로 옮겨도 API 계약을 유지할 수 있다.
    await this.actionProcessor.processNext(session.id);

    return {
      playerActionId: action.id,
      sessionId: session.id,
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: state.version,
    };
  }

  async submitRestAction(
    userId: string,
    sessionId: string,
    dto: RestActionDto,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const requester = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });

    if (!requester || requester.status !== PrismaParticipantStatus.JOINED) {
      throw forbidden("SESSION_403", "해당 세션에 접근할 수 없습니다.", {
        reason: "NOT_A_SESSION_PARTICIPANT",
      });
    }

    const isGmOperator =
      requester.role === PrismaParticipantRole.HOST ||
      requester.role === PrismaParticipantRole.GM;

    const sessionCharacter = isGmOperator
      ? await this.prisma.sessionCharacter.findFirst({
          where: {
            sessionId: session.id,
            status: PrismaSessionCharacterStatus.ACTIVE,
            OR: [
              { id: dto.characterId },
              { characterId: dto.characterId },
            ],
          },
          include: { character: true },
        })
      : await this.prisma.sessionCharacter.findUnique({
          where: {
            sessionId_userId: {
              sessionId: session.id,
              userId,
            },
          },
          include: { character: true },
        });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("ACTION_403", "휴식할 캐릭터가 선택되지 않았습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (!isGmOperator) {
      if (![sessionCharacter.id, sessionCharacter.characterId].includes(dto.characterId)) {
        throw forbidden("ACTION_403", "휴식할 캐릭터를 확인할 수 없습니다.", {
          reason: "CHARACTER_MISMATCH",
        });
      }
      if (sessionCharacter.character.ownerUserId !== userId) {
        throw forbidden("ACTION_403", "휴식할 캐릭터를 확인할 수 없습니다.", {
          reason: "CHARACTER_OWNERSHIP_MISMATCH",
        });
      }
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(
      session.id,
    );
    if (state.phase === PrismaGamePhase.COMBAT) {
      throw forbidden("ACTION_403", "전투 중에는 휴식을 진행할 수 없습니다.", {
        reason: "REST_BLOCKED_IN_COMBAT",
      });
    }

    const rawText =
      dto.restType === "short" && dto.hitDiceToSpend
        ? `/rest short ${dto.hitDiceToSpend}`
        : `/rest ${dto.restType}`;
    if (session.gmMode === PrismaGmMode.HUMAN && !isGmOperator) {
      return this.recordHumanGmRestApprovalRequest({
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

    const action = await this.prisma.playerAction.create({
      data: {
        sessionId: session.id,
        userId: sessionCharacter.userId,
        sessionCharacterId: sessionCharacter.id,
        rawText,
        inputType: PrismaActionInputType.COMMAND,
        actionScope: PrismaActionScope.PARTY_SHARED,
        queueStatus: PrismaActionQueueStatus.PENDING,
        baseStateVersion: state.version,
        clientCreatedAt: new Date(),
      },
    });

    this.realtimeEvents.emitActionAccepted(session.id, {
      playerActionId: action.id,
      actorUserId: action.userId,
      rawText: action.rawText,
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });

    await this.actionProcessor.processNext(session.id);

    return {
      playerActionId: action.id,
      sessionId: session.id,
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: state.version,
    };
  }

  private async recordHumanGmRestApprovalRequest(params: {
    sessionId: string;
    sessionScenarioId: string;
    stateVersion: number;
    sessionCharacterId: string;
    userId: string;
    restType: "short" | "long";
    hitDiceToSpend?: number;
    rawText: string;
  }): Promise<ActionAcceptedResponseDto> {
    const clientCreatedAt = new Date();
    const action = await this.prisma.playerAction.create({
      data: {
        sessionId: params.sessionId,
        userId: params.userId,
        sessionCharacterId: params.sessionCharacterId,
        rawText: params.rawText,
        inputType: PrismaActionInputType.COMMAND,
        actionScope: PrismaActionScope.PARTY_SHARED,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
        baseStateVersion: params.stateVersion,
        clientCreatedAt,
      },
    });

    this.realtimeEvents.emitActionAccepted(params.sessionId, {
      playerActionId: action.id,
      actorUserId: action.userId,
      rawText: action.rawText,
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });

    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: params.sessionId,
      sessionScenarioId: params.sessionScenarioId,
      playerActionId: action.id,
      actorUserId: params.userId,
      sessionCharacterId: params.sessionCharacterId,
      rawInput: params.rawText,
      structuredAction: {
        type: "rest",
        restType: params.restType,
        approvalStatus: "gm_required",
        approvalExpiresAt: getRestApprovalExpiresAt(clientCreatedAt).toISOString(),
        ...(params.restType === "short" && params.hitDiceToSpend
          ? { hitDiceToSpend: params.hitDiceToSpend }
          : {}),
      },
      diceResult: null,
      stateDiff: null,
      outcome: ActionOutcome.NO_ROLL,
      narration: "휴식 요청이 GM 승인 대기 상태로 기록되었습니다.",
    });
    this.realtimeEvents.emitTurnLogCreated(params.sessionId, turnLog);

    return {
      playerActionId: action.id,
      sessionId: params.sessionId,
      queueStatus: ActionQueueStatus.REJECTED,
      baseStateVersion: params.stateVersion,
      restApproval: {
        actionId: action.id,
        restType: params.restType,
        status: "gm_required",
        hitDiceToSpend:
          params.restType === "short" ? params.hitDiceToSpend ?? null : null,
        expiresAt: getRestApprovalExpiresAt(action.clientCreatedAt).toISOString(),
      },
    };
  }

  async approveRestAction(
    userId: string,
    sessionId: string,
    actionId: string,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    if (session.gmMode !== PrismaGmMode.HUMAN) {
      throw badRequest("ACTION_400", "HUMAN GM 세션의 휴식 요청만 승인할 수 있습니다.", {
        reason: "HUMAN_GM_ONLY",
      });
    }

    const requester = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });
    const isGmOperator =
      requester?.status === PrismaParticipantStatus.JOINED &&
      (requester.role === PrismaParticipantRole.HOST ||
        requester.role === PrismaParticipantRole.GM);
    if (!isGmOperator) {
      throw forbidden("ACTION_403", "휴식 요청 승인에는 GM 권한이 필요합니다.", {
        reason: "GM_PERMISSION_REQUIRED",
      });
    }

    const action = await this.prisma.playerAction.findUnique({
      where: { id: actionId },
    });
    if (!action || action.sessionId !== session.id) {
      throw badRequest("ACTION_400", "승인할 휴식 요청을 찾을 수 없습니다.", {
        reason: "REST_APPROVAL_REQUEST_NOT_FOUND",
      });
    }
    if (
      action.queueStatus !== PrismaActionQueueStatus.REJECTED ||
      action.failureReason !== "REST_REQUIRES_GM_APPROVAL" ||
      !action.rawText.startsWith("/rest ")
    ) {
      throw badRequest("ACTION_400", "승인 가능한 휴식 요청이 아닙니다.", {
        reason: "INVALID_REST_APPROVAL_REQUEST",
      });
    }
    if (isRestApprovalExpired(action.clientCreatedAt)) {
      await this.expireRestApprovalRequest(session.id, action);
      throw badRequest("ACTION_400", "휴식 승인 요청이 만료되었습니다.", {
        reason: "REST_APPROVAL_EXPIRED",
      });
    }

    const gameState = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    if (gameState?.state?.phase === PrismaGamePhase.COMBAT) {
      throw forbidden("ACTION_403", "전투 중에는 휴식을 진행할 수 없습니다.", {
        reason: "REST_BLOCKED_IN_COMBAT",
      });
    }

    const approvalClaim = await this.prisma.playerAction.updateMany({
      where: {
        id: action.id,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.PENDING,
        failureReason: null,
        processedAt: null,
      },
    });
    if (approvalClaim.count !== 1) {
      throw badRequest("ACTION_400", "이미 처리 중이거나 처리된 휴식 요청입니다.", {
        reason: "REST_APPROVAL_ALREADY_CLAIMED",
      });
    }

    this.realtimeEvents.emitActionAccepted(session.id, {
      playerActionId: action.id,
      actorUserId: action.userId,
      rawText: action.rawText,
      clientCreatedAt: action.clientCreatedAt.toISOString(),
    });

    await this.actionProcessor.processNext(session.id);

    return {
      playerActionId: action.id,
      sessionId: session.id,
      queueStatus: ActionQueueStatus.PENDING,
      baseStateVersion: action.baseStateVersion,
      restApproval: {
        actionId: action.id,
        restType: this.resolveRestTypeFromRawText(action.rawText),
        status: "approved",
        hitDiceToSpend: this.resolveRestHitDiceFromRawText(action.rawText),
        expiresAt: getRestApprovalExpiresAt(action.clientCreatedAt).toISOString(),
      },
    };
  }

  async rejectRestAction(
    userId: string,
    sessionId: string,
    actionId: string,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    if (session.gmMode !== PrismaGmMode.HUMAN) {
      throw badRequest("ACTION_400", "HUMAN GM 세션의 휴식 요청만 거절할 수 있습니다.", {
        reason: "HUMAN_GM_ONLY",
      });
    }

    const requester = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });
    const isGmOperator =
      requester?.status === PrismaParticipantStatus.JOINED &&
      (requester.role === PrismaParticipantRole.HOST ||
        requester.role === PrismaParticipantRole.GM);
    if (!isGmOperator) {
      throw forbidden("ACTION_403", "휴식 요청 거절에는 GM 권한이 필요합니다.", {
        reason: "GM_PERMISSION_REQUIRED",
      });
    }

    const action = await this.prisma.playerAction.findUnique({
      where: { id: actionId },
    });
    if (!action || action.sessionId !== session.id) {
      throw badRequest("ACTION_400", "거절할 휴식 요청을 찾을 수 없습니다.", {
        reason: "REST_APPROVAL_REQUEST_NOT_FOUND",
      });
    }
    if (
      action.queueStatus !== PrismaActionQueueStatus.REJECTED ||
      action.failureReason !== "REST_REQUIRES_GM_APPROVAL" ||
      !action.rawText.startsWith("/rest ")
    ) {
      throw badRequest("ACTION_400", "거절 가능한 휴식 요청이 아닙니다.", {
        reason: "INVALID_REST_APPROVAL_REQUEST",
      });
    }
    if (isRestApprovalExpired(action.clientCreatedAt)) {
      await this.expireRestApprovalRequest(session.id, action);
      throw badRequest("ACTION_400", "휴식 승인 요청이 만료되었습니다.", {
        reason: "REST_APPROVAL_EXPIRED",
      });
    }

    const rejectionClaim = await this.prisma.playerAction.updateMany({
      where: {
        id: action.id,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.FAILED,
        failureReason: "REST_REJECTED_BY_GM",
        processedAt: new Date(),
      },
    });
    if (rejectionClaim.count !== 1) {
      throw badRequest("ACTION_400", "이미 처리 중이거나 처리된 휴식 요청입니다.", {
        reason: "REST_APPROVAL_ALREADY_CLAIMED",
      });
    }

    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const restType = this.resolveRestTypeFromRawText(action.rawText);
    const hitDiceToSpend = this.resolveRestHitDiceFromRawText(action.rawText);
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      playerActionId: action.id,
      actorUserId: userId,
      sessionCharacterId: action.sessionCharacterId,
      rawInput: null,
      structuredAction: {
        type: "rest_approval",
        requestActionId: action.id,
        restType,
        approvalStatus: "rejected",
        ...(hitDiceToSpend ? { hitDiceToSpend } : {}),
      },
      diceResult: null,
      stateDiff: null,
      outcome: ActionOutcome.NO_ROLL,
      narration: "GM이 휴식 요청을 거절했습니다.",
    });
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);

    return {
      playerActionId: action.id,
      sessionId: session.id,
      queueStatus: ActionQueueStatus.FAILED,
      baseStateVersion: action.baseStateVersion,
      restApproval: {
        actionId: action.id,
        restType,
        status: "rejected",
        hitDiceToSpend,
        expiresAt: getRestApprovalExpiresAt(action.clientCreatedAt).toISOString(),
      },
    };
  }

  async cancelRestAction(
    userId: string,
    sessionId: string,
    actionId: string,
  ): Promise<ActionAcceptedResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    if (session.gmMode !== PrismaGmMode.HUMAN) {
      throw badRequest("ACTION_400", "HUMAN GM 세션의 휴식 요청만 취소할 수 있습니다.", {
        reason: "HUMAN_GM_ONLY",
      });
    }

    const action = await this.prisma.playerAction.findUnique({
      where: { id: actionId },
    });
    if (!action || action.sessionId !== session.id) {
      throw badRequest("ACTION_400", "취소할 휴식 요청을 찾을 수 없습니다.", {
        reason: "REST_APPROVAL_REQUEST_NOT_FOUND",
      });
    }
    if (action.userId !== userId) {
      throw forbidden("ACTION_403", "휴식 요청을 만든 사용자만 취소할 수 있습니다.", {
        reason: "REST_REQUESTER_REQUIRED",
      });
    }
    if (
      action.queueStatus !== PrismaActionQueueStatus.REJECTED ||
      action.failureReason !== "REST_REQUIRES_GM_APPROVAL" ||
      !action.rawText.startsWith("/rest ")
    ) {
      throw badRequest("ACTION_400", "취소 가능한 휴식 요청이 아닙니다.", {
        reason: "INVALID_REST_APPROVAL_REQUEST",
      });
    }
    if (isRestApprovalExpired(action.clientCreatedAt)) {
      await this.expireRestApprovalRequest(session.id, action);
      throw badRequest("ACTION_400", "휴식 승인 요청이 만료되었습니다.", {
        reason: "REST_APPROVAL_EXPIRED",
      });
    }

    const cancellationClaim = await this.prisma.playerAction.updateMany({
      where: {
        id: action.id,
        userId,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.FAILED,
        failureReason: "REST_CANCELLED_BY_REQUESTER",
        processedAt: new Date(),
      },
    });
    if (cancellationClaim.count !== 1) {
      throw badRequest("ACTION_400", "이미 처리 중이거나 처리된 휴식 요청입니다.", {
        reason: "REST_APPROVAL_ALREADY_CLAIMED",
      });
    }

    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const restType = this.resolveRestTypeFromRawText(action.rawText);
    const hitDiceToSpend = this.resolveRestHitDiceFromRawText(action.rawText);
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      playerActionId: action.id,
      actorUserId: userId,
      sessionCharacterId: action.sessionCharacterId,
      rawInput: null,
      structuredAction: {
        type: "rest_approval",
        requestActionId: action.id,
        restType,
        approvalStatus: "cancelled",
        ...(hitDiceToSpend ? { hitDiceToSpend } : {}),
      },
      diceResult: null,
      stateDiff: null,
      outcome: ActionOutcome.NO_ROLL,
      narration: "요청자가 휴식 요청을 취소했습니다.",
    });
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);

    return {
      playerActionId: action.id,
      sessionId: session.id,
      queueStatus: ActionQueueStatus.FAILED,
      baseStateVersion: action.baseStateVersion,
      restApproval: {
        actionId: action.id,
        restType,
        status: "cancelled",
        hitDiceToSpend,
        expiresAt: getRestApprovalExpiresAt(action.clientCreatedAt).toISOString(),
      },
    };
  }

  private async expireRestApprovalRequest(
    sessionId: string,
    action: {
      id: string;
      sessionCharacterId: string | null;
      rawText: string;
      clientCreatedAt: Date;
    },
  ): Promise<void> {
    const expirationClaim = await this.prisma.playerAction.updateMany({
      where: {
        id: action.id,
        queueStatus: PrismaActionQueueStatus.REJECTED,
        failureReason: "REST_REQUIRES_GM_APPROVAL",
      },
      data: {
        queueStatus: PrismaActionQueueStatus.FAILED,
        failureReason: "REST_APPROVAL_EXPIRED",
        processedAt: new Date(),
      },
    });
    if (expirationClaim.count !== 1) {
      return;
    }

    const { sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const restType = this.resolveRestTypeFromRawText(action.rawText);
    const hitDiceToSpend = this.resolveRestHitDiceFromRawText(action.rawText);
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId,
      sessionScenarioId: sessionScenario.id,
      playerActionId: action.id,
      actorUserId: null,
      sessionCharacterId: action.sessionCharacterId,
      rawInput: null,
      structuredAction: {
        type: "rest_approval",
        requestActionId: action.id,
        restType,
        approvalStatus: "expired",
        approvalExpiresAt: getRestApprovalExpiresAt(action.clientCreatedAt).toISOString(),
        ...(hitDiceToSpend ? { hitDiceToSpend } : {}),
      },
      diceResult: null,
      stateDiff: null,
      outcome: ActionOutcome.NO_ROLL,
      narration: "휴식 승인 요청이 만료되었습니다.",
    });
    this.realtimeEvents.emitTurnLogCreated(sessionId, turnLog);
  }

  private resolveRestTypeFromRawText(rawText: string): "short" | "long" | null {
    const normalized = rawText.trim().toLowerCase();
    if (normalized.startsWith("/rest short")) {
      return "short";
    }
    if (normalized.startsWith("/rest long")) {
      return "long";
    }
    return null;
  }

  private resolveRestHitDiceFromRawText(rawText: string): number | null {
    const match = rawText.trim().toLowerCase().match(/^\/rest\s+short\s+(\d+)/);
    if (!match) {
      return null;
    }
    const value = Number.parseInt(match[1] ?? "", 10);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  async useInventoryItem(
    userId: string,
    sessionId: string,
    dto: UseInventoryItemDto,
  ): Promise<UseInventoryItemResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    this.ensurePlaying(session.status);

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      include: { character: true },
    });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("ACTION_403", "아이템을 사용할 캐릭터가 선택되지 않았습니다.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    const targetSessionCharacter =
      dto.targetSessionCharacterId &&
      dto.targetSessionCharacterId !== sessionCharacter.id
        ? await this.prisma.sessionCharacter.findFirst({
            where: {
              id: dto.targetSessionCharacterId,
              sessionId: session.id,
              status: PrismaSessionCharacterStatus.ACTIVE,
            },
            include: { character: true },
          })
        : sessionCharacter;
    if (!targetSessionCharacter) {
      throw badRequest("INVENTORY_400", "아이템 대상 캐릭터를 찾을 수 없습니다.", {
        reason: "ITEM_TARGET_NOT_FOUND",
      });
    }

    const item = await this.prisma.inventoryEntry.findFirst({
      where: {
        sessionCharacterId: sessionCharacter.id,
        OR: [
          { id: dto.itemId },
          { itemDefinitionId: dto.itemId },
          {
            itemDefinition: {
              is: {
                OR: [
                  { id: dto.itemId },
                  { name: { equals: dto.itemId, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
      include: { itemDefinition: true },
      orderBy: { createdAt: "asc" },
    });

    if (!item || item.quantity < 1) {
      throw badRequest("INVENTORY_400", "사용할 아이템을 찾을 수 없습니다.", {
        reason: "INVENTORY_ITEM_NOT_FOUND",
      });
    }

    const executableItem = getExecutableItemDefinition(
      item.itemDefinitionId,
    );
    if (
      !this.isBackendUsableInventoryItem(
        item.itemDefinition,
        executableItem,
      )
    ) {
      throw badRequest("INVENTORY_400", "현재 바로 사용할 수 없는 아이템입니다.", {
        reason: "ITEM_NOT_QUICK_USABLE",
      });
    }

    const { sessionScenario, state } =
      await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const flags = this.parseJson<Record<string, unknown>>(
      state.flagsJson,
      {},
    );
    const itemRuntime = this.parseP3ItemRuntimeFlags(
      flags[P3_ITEM_RUNTIME_FLAGS_KEY],
    );
    const attunedEntryIds =
      itemRuntime.attunedItemEntryIdsByCharacter[sessionCharacter.id] ?? [];
    if (
      executableItem?.requiresAttunement &&
      !attunedEntryIds.includes(item.id)
    ) {
      if (attunedEntryIds.length >= 3) {
        throw badRequest("INVENTORY_400", "조율 슬롯이 가득 찼습니다.", {
          reason: "ATTUNEMENT_SLOTS_FULL",
          maximum: 3,
        });
      }
      const nextRuntime: P3ItemRuntimeFlags = {
        ...itemRuntime,
        attunedItemEntryIdsByCharacter: {
          ...itemRuntime.attunedItemEntryIdsByCharacter,
          [sessionCharacter.id]: [...attunedEntryIds, item.id],
        },
      };
      await this.writeP3ItemRuntimeFlags(
        state.sessionScenarioId,
        flags,
        nextRuntime,
      );
      const mappedCharacter = await this.getMappedSessionCharacter(
        sessionCharacter.id,
      );
      const message = `${mappedCharacter.name}이(가) ${item.itemDefinition.name}에 조율했습니다. 다시 사용하면 효과가 발동합니다.`;
      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: session.id,
        sessionScenarioId: sessionScenario.id,
        actorUserId: userId,
        sessionCharacterId: sessionCharacter.id,
        rawInput: null,
        structuredAction: {
          type: "item_attunement",
          itemEntryId: item.id,
          itemDefinitionId: item.itemDefinitionId,
          attunedCount: attunedEntryIds.length + 1,
        },
        diceResult: null,
        stateDiff: null,
        outcome: ActionOutcome.SUCCESS,
        narration: message,
      });
      this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
      this.realtimeEvents.emitSessionSnapshot(
        session.id,
        await this.sessionsService.buildSnapshot(session.id),
      );
      return {
        sessionId: session.id,
        itemId: item.id,
        itemName: item.itemDefinition.name,
        consumedQuantity: 0,
        healedHp: null,
        message,
        character: mappedCharacter,
      };
    }

    if (executableItem?.maxCharges) {
      const remainingCharges =
        itemRuntime.chargesByItemEntryId[item.id] ??
        executableItem.maxCharges;
      if (remainingCharges < 1) {
        throw badRequest("INVENTORY_400", "아이템 충전이 남아 있지 않습니다.", {
          reason: "ITEM_CHARGES_EXPENDED",
          itemEntryId: item.id,
        });
      }
      itemRuntime.chargesByItemEntryId[item.id] = remainingCharges - 1;
    }
    if (
      executableItem &&
      executableItem.actionCost !== "none"
    ) {
      await this.spendInventoryItemActionCost(
        session.id,
        sessionCharacter.id,
        executableItem.actionCost,
      );
    }
    if (executableItem && targetSessionCharacter.id !== sessionCharacter.id) {
      await this.assertInventoryItemTargetInRange({
        userId,
        sessionId: session.id,
        actorSessionCharacterId: sessionCharacter.id,
        targetSessionCharacterId: targetSessionCharacter.id,
        rangeFt: Math.max(executableItem.rangeFt, 5),
      });
    }

    const catalogItem = await this.prisma.item.findUnique({
      where: { id: item.itemDefinitionId },
    });
    const pack = this.resolveSrdPackRecord(item.itemDefinition, catalogItem?.key ?? null);
    if (pack?.contents?.length) {
      await this.unpackInventoryPack(sessionCharacter.id, item.id, pack);
      const updatedCharacter = await this.prisma.sessionCharacter.findUniqueOrThrow({
        where: { id: sessionCharacter.id },
        include: {
          character: true,
          inventoryEntries: {
            include: { itemDefinition: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      const mappedCharacter = mapSessionCharacter(updatedCharacter);
      const addedSummary = pack.contents
        .map((content) => {
          const contentRecord = this.findSrdEquipmentById(content.itemId);
          return `${this.getSrdEquipmentName(contentRecord, content.itemId)} x${content.quantity}`;
        })
        .join(", ");
      const message = `${mappedCharacter.name}이(가) ${item.itemDefinition.name}을(를) 풀어 내용물을 획득했습니다: ${addedSummary}`;

      this.realtimeEvents.emitCharacterUpdated(session.id, mappedCharacter);
      this.realtimeEvents.emitSessionSnapshot(
        session.id,
        await this.sessionsService.buildSnapshot(session.id),
      );

      return {
        sessionId: session.id,
        itemId: item.id,
        itemName: item.itemDefinition.name,
        consumedQuantity: 1,
        healedHp: null,
        message,
        character: mappedCharacter,
      };
    }
    if (this.isPackLikeInventoryItem(item.itemDefinition)) {
      throw badRequest("INVENTORY_400", "꾸러미 내용물 데이터를 찾을 수 없습니다.", {
        reason: "PACK_CONTENTS_NOT_FOUND",
      });
    }

    const executableItemSpellEffect =
      executableItem?.effect.type === "spell"
        ? executableItem.effect
        : null;
    if (executableItem && executableItemSpellEffect) {
      const spellItemResolution = await this.resolveExecutableItemSpellEffect({
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

      if (executableItem.consumeOnUse) {
        await this.inventoryRuntime.removeItem({ entryId: item.id, quantity: 1 });
      }
      if (executableItem.maxCharges) {
        await this.writeP3ItemRuntimeFlags(
          state.sessionScenarioId,
          flags,
          itemRuntime,
        );
      }
      const actorCharacter = await this.getMappedSessionCharacter(
        sessionCharacter.id,
      );
      this.realtimeEvents.emitCharacterUpdated(session.id, actorCharacter);
      for (const roll of spellItemResolution.diceResults) {
        this.realtimeEvents.emitDiceRolled(session.id, roll);
      }
      this.realtimeEvents.emitTurnLogCreated(
        session.id,
        spellItemResolution.turnLog,
      );
      this.realtimeEvents.emitSessionSnapshot(
        session.id,
        await this.sessionsService.buildSnapshot(session.id),
      );
      return {
        sessionId: session.id,
        itemId: item.id,
        itemName: item.itemDefinition.name,
        consumedQuantity: executableItem.consumeOnUse ? 1 : 0,
        healedHp: null,
        message: spellItemResolution.message,
        character: actorCharacter,
      };
    }

    const effectResolution = executableItem
      ? this.resolveExecutableItemEffect(
          executableItem,
          targetSessionCharacter,
        )
      : null;
    if (executableItem?.effect.type === "terrain") {
      await this.deployItemTerrainEffect({
        userId,
        sessionId: session.id,
        sessionCharacterId: sessionCharacter.id,
        itemEntryId: item.id,
        itemName: item.itemDefinition.name,
        terrainEffectId: executableItem.effect.terrainEffectId,
        sizeFt: executableItem.effect.sizeFt,
      });
    }
    const healingAmount =
      effectResolution?.healingAmount ??
      this.resolveHealingAmount(item.itemDefinition);
    const healedHp = healingAmount
      ? Math.max(
          0,
          Math.min(
            targetSessionCharacter.character.maxHp,
            targetSessionCharacter.currentHp + healingAmount,
          ) - targetSessionCharacter.currentHp,
        )
      : null;

    if (
      healingAmount ||
      effectResolution?.tempHp !== null ||
      effectResolution?.conditionsJson
    ) {
      await this.prisma.sessionCharacter.update({
        where: { id: targetSessionCharacter.id },
        data: {
          ...(healingAmount
            ? { currentHp: { increment: healedHp ?? 0 } }
            : {}),
          ...(effectResolution?.tempHp !== null &&
          effectResolution?.tempHp !== undefined
            ? { tempHp: effectResolution.tempHp }
            : {}),
          ...(effectResolution?.conditionsJson
            ? { conditionsJson: effectResolution.conditionsJson }
            : {}),
        },
      });
    }

    if (!executableItem || executableItem.consumeOnUse) {
      await this.inventoryRuntime.removeItem({ entryId: item.id, quantity: 1 });
    }
    if (executableItem?.maxCharges) {
      await this.writeP3ItemRuntimeFlags(
        state.sessionScenarioId,
        flags,
        itemRuntime,
      );
    }

    const updatedCharacter = await this.prisma.sessionCharacter.findUniqueOrThrow({
      where: { id: targetSessionCharacter.id },
      include: {
        character: true,
        inventoryEntries: {
          include: { itemDefinition: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const mappedCharacter = mapSessionCharacter(updatedCharacter);
    const actorCharacter =
      targetSessionCharacter.id === sessionCharacter.id
        ? mappedCharacter
        : await this.getMappedSessionCharacter(sessionCharacter.id);
    const message =
      healedHp && healedHp > 0
        ? `${mappedCharacter.name}이(가) ${item.itemDefinition.name}을(를) 사용해 HP를 ${healedHp} 회복했습니다.`
        : effectResolution?.message
          ? `${mappedCharacter.name}이(가) ${item.itemDefinition.name}을(를) 사용했습니다. ${effectResolution.message}`
          : `${mappedCharacter.name}이(가) ${item.itemDefinition.name}을(를) 사용했습니다.`;

    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: sessionCharacter.id,
      rawInput: null,
      structuredAction: {
        type: "item_use",
        itemEntryId: item.id,
        itemDefinitionId: item.itemDefinitionId,
        consumeOnUse: executableItem?.consumeOnUse ?? true,
        actionCost: executableItem?.actionCost ?? "action",
        effect: executableItem?.effect ?? null,
        remainingCharges:
          executableItem?.maxCharges
            ? itemRuntime.chargesByItemEntryId[item.id]
            : null,
      },
      diceResult: effectResolution?.diceResult
        ? { ...effectResolution.diceResult }
        : null,
      stateDiff: null,
      outcome: ActionOutcome.SUCCESS,
      narration: message,
    });

    this.realtimeEvents.emitCharacterUpdated(session.id, mappedCharacter);
    if (actorCharacter.id !== mappedCharacter.id) {
      this.realtimeEvents.emitCharacterUpdated(session.id, actorCharacter);
    }
    if (effectResolution?.diceResult) {
      this.realtimeEvents.emitDiceRolled(
        session.id,
        effectResolution.diceResult,
      );
    }
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);
    this.realtimeEvents.emitSessionSnapshot(
      session.id,
      await this.sessionsService.buildSnapshot(session.id),
    );

    return {
      sessionId: session.id,
      itemId: item.id,
      itemName: item.itemDefinition.name,
      consumedQuantity:
        !executableItem || executableItem.consumeOnUse ? 1 : 0,
      healedHp,
      message,
      character: actorCharacter,
    };
  }

  private ensurePlaying(status: PrismaSessionStatus): void {
    if (status !== PrismaSessionStatus.PLAYING) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "SESSION_NOT_PLAYING",
      });
    }
  }

  private isBackendUsableInventoryItem(item: {
    id: string;
    name: string;
    itemType: string;
    propertiesJson: string | null;
  }, executableItem: ExecutableItemDefinition | null): boolean {
    if (
      executableItem &&
      (executableItem.interaction === "use" ||
        executableItem.interaction === "tool")
    ) {
      return true;
    }
    const key = this.buildItemSearchKey(item);
    return (
      key.includes("consumable") ||
      key.includes("potion") ||
      key.includes("포션") ||
      key.includes("healing") ||
      this.isPackLikeInventoryItem(item)
    );
  }

  private resolveExecutableItemEffect(
    item: ExecutableItemDefinition,
    sessionCharacter: {
      id: string;
      currentHp: number;
      tempHp: number;
      conditionsJson: string;
      character: { maxHp: number };
    },
  ): {
    healingAmount: number | null;
    tempHp: number | null;
    conditionsJson: string | null;
    diceResult: ReturnType<DiceService["roll"]> | null;
    message: string | null;
  } {
    const effect = item.effect;
    if (effect.type === "healing") {
      const diceResult = this.diceService.roll(effect.dice);
      return {
        healingAmount: diceResult.total,
        tempHp: null,
        conditionsJson: null,
        diceResult,
        message: null,
      };
    }
    if (effect.type === "temporary_hp") {
      return {
        healingAmount: null,
        tempHp: Math.max(sessionCharacter.tempHp, effect.amount),
        conditionsJson: null,
        diceResult: null,
        message: `임시 HP ${effect.amount}을 얻었습니다.`,
      };
    }
    if (
      effect.type === "condition" ||
      effect.type === "utility" ||
      effect.type === "tool" ||
      effect.type === "spell"
    ) {
      const tags =
        effect.type === "condition"
          ? effect.tags
          : effect.type === "utility"
            ? effect.tags
            : effect.type === "tool"
              ? [effect.checkTag]
              : [
                  `item_spell:${effect.spellId}`,
                  `item_spell_slot_level:${effect.slotLevel}`,
                ];
      const durationRounds =
        effect.type === "condition" ? effect.durationRounds : 10;
      const conditions = this.conditionRuntime.applyCondition(
        this.conditionRuntime.parseConditionsJson(
          sessionCharacter.conditionsJson,
        ),
        this.conditionRuntime.createCondition({
          conditionId: `condition.item.${item.id}`,
          sourceId: item.id,
          duration: { type: "rounds", remaining: durationRounds },
          stackPolicy: "replace",
          tags,
        }),
      );
      return {
        healingAmount: null,
        tempHp: null,
        conditionsJson: JSON.stringify(conditions),
        diceResult: null,
        message:
          effect.type === "spell"
            ? `${effect.spellId} 효과가 발동했습니다.`
            : "아이템 효과가 적용되었습니다.",
      };
    }
    if (effect.type === "terrain") {
      return {
        healingAmount: null,
        tempHp: null,
        conditionsJson: null,
        diceResult: null,
        message: `${effect.sizeFt}ft 범위에 ${effect.terrainEffectId} 지형을 배치했습니다.`,
      };
    }
    throw badRequest("INVENTORY_400", "이 아이템은 해당 방식으로 사용할 수 없습니다.", {
      reason: "ITEM_INTERACTION_MODE_MISMATCH",
      interaction: item.interaction,
      effectType: effect.type,
    });
  }

  private parseP3ItemRuntimeFlags(value: unknown): P3ItemRuntimeFlags {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        attunedItemEntryIdsByCharacter: {},
        chargesByItemEntryId: {},
      };
    }
    const record = value as Record<string, unknown>;
    const attuned =
      record.attunedItemEntryIdsByCharacter &&
      typeof record.attunedItemEntryIdsByCharacter === "object" &&
      !Array.isArray(record.attunedItemEntryIdsByCharacter)
        ? Object.fromEntries(
            Object.entries(
              record.attunedItemEntryIdsByCharacter as Record<
                string,
                unknown
              >,
            ).map(([characterId, entryIds]) => [
              characterId,
              Array.isArray(entryIds)
                ? entryIds.filter(
                    (entryId): entryId is string =>
                      typeof entryId === "string",
                  )
                : [],
            ]),
          )
        : {};
    const charges =
      record.chargesByItemEntryId &&
      typeof record.chargesByItemEntryId === "object" &&
      !Array.isArray(record.chargesByItemEntryId)
        ? Object.fromEntries(
            Object.entries(
              record.chargesByItemEntryId as Record<string, unknown>,
            ).flatMap(([entryId, charge]) =>
              typeof charge === "number" &&
              Number.isInteger(charge) &&
              charge >= 0
                ? [[entryId, charge]]
                : [],
            ),
          )
        : {};
    return {
      attunedItemEntryIdsByCharacter: attuned,
      chargesByItemEntryId: charges,
    };
  }

  private async resolveExecutableItemSpellEffect(params: {
    userId: string;
    sessionId: string;
    sessionScenarioId: string;
    actorUserId: string;
    actorSessionCharacterId: string;
    itemEntryId: string;
    itemDefinitionId: string;
    itemName: string;
    executableItem: ExecutableItemDefinition;
    spellEffect: { type: "spell"; spellId: string; slotLevel: number };
    targetParticipantId: string | null;
    point: { x: number; y: number } | null;
    remainingCharges: number | null;
  }): Promise<{
    message: string;
    diceResults: ReturnType<DiceService["roll"]>[];
    turnLog: Awaited<ReturnType<TurnLogsService["createTurnLog"]>>;
  }> {
    const combat = await this.prisma.combat.findFirst({
      where: {
        sessionId: params.sessionId,
        status: PrismaCombatStatus.ACTIVE,
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });
    if (!combat) {
      throw badRequest("INVENTORY_400", "전투 중에만 이 마법 아이템을 사용할 수 있습니다.", {
        reason: "ITEM_SPELL_REQUIRES_ACTIVE_COMBAT",
        spellId: params.spellEffect.spellId,
      });
    }
    const actor = combat.participants.find(
      (participant) =>
        participant.sessionCharacterId === params.actorSessionCharacterId,
    );
    if (!actor) {
      throw badRequest("INVENTORY_400", "아이템 사용자 전투 참가자를 찾을 수 없습니다.", {
        reason: "ITEM_ACTOR_PARTICIPANT_NOT_FOUND",
      });
    }
    const map = await this.sessionsService.getVttMapForUser(
      params.userId,
      params.sessionId,
    );
    const actorToken = map.tokens.find(
      (token) =>
        token.id === actor.tokenId ||
        token.sessionCharacterId === params.actorSessionCharacterId,
    );
    if (!actorToken) {
      throw badRequest("INVENTORY_400", "아이템 사용자 토큰을 찾을 수 없습니다.", {
        reason: "ITEM_ACTOR_TOKEN_NOT_FOUND",
      });
    }

    const spellId = params.spellEffect.spellId;
    if (spellId === "spell.magic_missile") {
      if (!params.targetParticipantId) {
        throw badRequest("INVENTORY_400", "마법 미사일을 맞힐 대상을 선택하세요.", {
          reason: "ITEM_SPELL_TARGET_REQUIRED",
          spellId,
        });
      }
      const target = combat.participants.find(
        (participant) =>
          participant.id === params.targetParticipantId &&
          participant.isAlive,
      );
      if (!target) {
        throw badRequest("INVENTORY_400", "아이템 주문 대상을 찾을 수 없습니다.", {
          reason: "ITEM_SPELL_TARGET_NOT_FOUND",
          targetParticipantId: params.targetParticipantId,
        });
      }
      this.assertParticipantTargetInRange({
        map,
        actorToken,
        target,
        rangeFt: params.executableItem.rangeFt,
      });
      const damageRoll = this.diceService.roll("3d4+3");
      await this.applyParticipantDamage(target, damageRoll.total);
      const message = `${actor.nameSnapshot}이(가) ${params.itemName}으로 ${target.nameSnapshot}에게 마법 미사일을 발사해 ${damageRoll.total} 피해를 줬습니다.`;
      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        actorUserId: params.actorUserId,
        sessionCharacterId: params.actorSessionCharacterId,
        rawInput: null,
        structuredAction: {
          type: "item_spell",
          itemEntryId: params.itemEntryId,
          itemDefinitionId: params.itemDefinitionId,
          spellId,
          targetParticipantIds: [target.id],
          remainingCharges: params.remainingCharges,
        },
        diceResult: { ...damageRoll },
        stateDiff: {
          damagedParticipants: [
            {
              participantId: target.id,
              damage: damageRoll.total,
            },
          ],
        },
        outcome: ActionOutcome.SUCCESS,
        narration: message,
      });
      return { message, diceResults: [damageRoll], turnLog };
    }

    if (spellId === "spell.fireball") {
      const point = params.point;
      if (!point) {
        throw badRequest("INVENTORY_400", "화염구가 폭발할 지점을 선택하세요.", {
          reason: "ITEM_SPELL_POINT_REQUIRED",
          spellId,
        });
      }
      this.assertPointTargetInRange({
        map,
        actorToken,
        point,
        rangeFt: params.executableItem.rangeFt,
      });
      const targets = this.findParticipantsInRadius({
        map,
        combatParticipants: combat.participants,
        point,
        radiusFt: 20,
      });
      const damageRoll = this.diceService.roll("8d6");
      for (const target of targets) {
        await this.applyParticipantDamage(target, damageRoll.total);
      }
      const message =
        targets.length > 0
          ? `${actor.nameSnapshot}이(가) ${params.itemName}으로 화염구를 폭발시켜 ${targets.length}명에게 ${damageRoll.total} 화염 피해를 줬습니다.`
          : `${actor.nameSnapshot}이(가) ${params.itemName}으로 화염구를 폭발시켰지만 범위 안의 대상은 없었습니다.`;
      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        actorUserId: params.actorUserId,
        sessionCharacterId: params.actorSessionCharacterId,
        rawInput: null,
        structuredAction: {
          type: "item_spell",
          itemEntryId: params.itemEntryId,
          itemDefinitionId: params.itemDefinitionId,
          spellId,
          point,
          targetParticipantIds: targets.map((target) => target.id),
          remainingCharges: params.remainingCharges,
        },
        diceResult: { ...damageRoll },
        stateDiff: {
          damagedParticipants: targets.map((target) => ({
            participantId: target.id,
            damage: damageRoll.total,
          })),
        },
        outcome: ActionOutcome.SUCCESS,
        narration: message,
      });
      return { message, diceResults: [damageRoll], turnLog };
    }

    if (spellId === "spell.web") {
      const point = params.point;
      if (!point) {
        throw badRequest("INVENTORY_400", "거미줄을 펼칠 지점을 선택하세요.", {
          reason: "ITEM_SPELL_POINT_REQUIRED",
          spellId,
        });
      }
      this.assertPointTargetInRange({
        map,
        actorToken,
        point,
        rangeFt: params.executableItem.rangeFt,
      });
      await this.deployPointTerrainEffect({
        sessionId: params.sessionId,
        map,
        point,
        itemEntryId: params.itemEntryId,
        itemName: params.itemName,
        terrainEffectId: "terrain.difficult",
        sizeFt: 20,
      });
      const message = `${actor.nameSnapshot}이(가) ${params.itemName}으로 선택한 지점에 거미줄 영역을 펼쳤습니다.`;
      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: params.sessionId,
        sessionScenarioId: params.sessionScenarioId,
        actorUserId: params.actorUserId,
        sessionCharacterId: params.actorSessionCharacterId,
        rawInput: null,
        structuredAction: {
          type: "item_spell",
          itemEntryId: params.itemEntryId,
          itemDefinitionId: params.itemDefinitionId,
          spellId,
          point,
          terrainEffectId: "terrain.difficult",
          remainingCharges: params.remainingCharges,
        },
        diceResult: null,
        stateDiff: {
          terrainEffectId: "terrain.difficult",
          point,
          sizeFt: 20,
        },
        outcome: ActionOutcome.SUCCESS,
        narration: message,
      });
      return { message, diceResults: [], turnLog };
    }

    throw badRequest("INVENTORY_400", "이 마법 아이템 주문은 아직 직접 실행할 수 없습니다.", {
      reason: "ITEM_SPELL_NOT_EXECUTABLE",
      spellId,
    });
  }

  private assertParticipantTargetInRange(params: {
    map: {
      gridSize: number;
      tokens: Array<{
        id: string;
        sessionCharacterId?: string | null;
        x: number;
        y: number;
      }>;
    };
    actorToken: { x: number; y: number };
    target: {
      id: string;
      tokenId: string | null;
      sessionCharacterId: string | null;
    };
    rangeFt: number;
  }): void {
    const targetToken = params.map.tokens.find(
      (token) =>
        token.id === params.target.tokenId ||
        token.sessionCharacterId === params.target.sessionCharacterId,
    );
    if (!targetToken) {
      throw badRequest("INVENTORY_400", "아이템 주문 대상 토큰을 찾을 수 없습니다.", {
        reason: "ITEM_SPELL_TARGET_TOKEN_NOT_FOUND",
        targetParticipantId: params.target.id,
      });
    }
    const distanceFt = this.resolveMapDistanceFt(
      params.map.gridSize,
      params.actorToken,
      targetToken,
    );
    if (distanceFt > params.rangeFt) {
      throw badRequest("INVENTORY_400", "아이템 주문 대상이 사거리 밖에 있습니다.", {
        reason: "ITEM_SPELL_TARGET_OUT_OF_RANGE",
        targetParticipantId: params.target.id,
        distanceFt,
        rangeFt: params.rangeFt,
      });
    }
  }

  private assertPointTargetInRange(params: {
    map: { gridSize: number };
    actorToken: { x: number; y: number };
    point: { x: number; y: number };
    rangeFt: number;
  }): void {
    const distanceFt = this.resolveMapDistanceFt(
      params.map.gridSize,
      params.actorToken,
      params.point,
    );
    if (distanceFt > params.rangeFt) {
      throw badRequest("INVENTORY_400", "아이템 주문 지점이 사거리 밖에 있습니다.", {
        reason: "ITEM_SPELL_POINT_OUT_OF_RANGE",
        distanceFt,
        rangeFt: params.rangeFt,
      });
    }
  }

  private findParticipantsInRadius(params: {
    map: {
      gridSize: number;
      tokens: Array<{
        id: string;
        sessionCharacterId?: string | null;
        x: number;
        y: number;
      }>;
    };
    combatParticipants: Array<{
      id: string;
      tokenId: string | null;
      sessionCharacterId: string | null;
      currentHp: number | null;
      isAlive: boolean;
    }>;
    point: { x: number; y: number };
    radiusFt: number;
  }) {
    return params.combatParticipants.filter((participant) => {
      if (!participant.isAlive || (participant.currentHp ?? 0) <= 0) {
        return false;
      }
      const token = params.map.tokens.find(
        (candidate) =>
          candidate.id === participant.tokenId ||
          (Boolean(candidate.sessionCharacterId) &&
            candidate.sessionCharacterId === participant.sessionCharacterId),
      );
      if (!token) {
        return false;
      }
      return (
        this.resolveMapDistanceFt(
          params.map.gridSize,
          params.point,
          token,
        ) <= params.radiusFt
      );
    });
  }

  private resolveMapDistanceFt(
    gridSize: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): number {
    const dx = Math.abs(from.x - to.x) / gridSize;
    const dy = Math.abs(from.y - to.y) / gridSize;
    return Math.max(dx, dy) * 5;
  }

  private async applyParticipantDamage(
    participant: {
      id: string;
      sessionCharacterId: string | null;
      currentHp: number | null;
      isAlive: boolean;
    },
    damage: number,
  ): Promise<void> {
    const nextHp = Math.max(0, (participant.currentHp ?? 0) - damage);
    await this.prisma.combatParticipant.update({
      where: { id: participant.id },
      data: { currentHp: nextHp, isAlive: nextHp > 0 },
    });
    participant.currentHp = nextHp;
    participant.isAlive = nextHp > 0;
    if (participant.sessionCharacterId) {
      await this.prisma.sessionCharacter.update({
        where: { id: participant.sessionCharacterId },
        data: { currentHp: nextHp },
      });
    }
  }

  private async deployPointTerrainEffect(params: {
    sessionId: string;
    map: Awaited<ReturnType<SessionsService["getVttMapForUser"]>>;
    point: { x: number; y: number };
    itemEntryId: string;
    itemName: string;
    terrainEffectId: string;
    sizeFt: number;
  }): Promise<void> {
    const sizePx = Math.max(
      params.map.gridSize,
      (params.sizeFt / 5) * params.map.gridSize,
    );
    await this.mapRuntimeService.saveSystemVttMap(params.sessionId, {
      ...params.map,
      terrainCells: [
        ...(params.map.terrainCells ?? []),
        {
          id: `item-spell-terrain:${params.itemEntryId}:${Date.now()}`,
          x: Math.max(
            0,
            Math.min(
              params.map.width - sizePx,
              Math.floor(params.point.x - sizePx / 2),
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              params.map.height - sizePx,
              Math.floor(params.point.y - sizePx / 2),
            ),
          ),
          width: sizePx,
          height: sizePx,
          name: params.itemName,
          description: `${params.itemName}으로 생성된 주문 지형 효과`,
          terrainEffectId: params.terrainEffectId,
        },
      ],
      updatedAt: new Date().toISOString(),
    });
  }

  private async writeP3ItemRuntimeFlags(
    sessionScenarioId: string,
    flags: Record<string, unknown>,
    itemRuntime: P3ItemRuntimeFlags,
  ): Promise<void> {
    await this.prisma.gameState.update({
      where: { sessionScenarioId },
      data: {
        flagsJson: JSON.stringify({
          ...flags,
          [P3_ITEM_RUNTIME_FLAGS_KEY]: itemRuntime,
        }),
      },
    });
  }

  private async getMappedSessionCharacter(sessionCharacterId: string) {
    return mapSessionCharacter(
      await this.prisma.sessionCharacter.findUniqueOrThrow({
        where: { id: sessionCharacterId },
        include: {
          character: true,
          inventoryEntries: {
            include: { itemDefinition: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    );
  }

  private async deployItemTerrainEffect(params: {
    userId: string;
    sessionId: string;
    sessionCharacterId: string;
    itemEntryId: string;
    itemName: string;
    terrainEffectId: string;
    sizeFt: number;
  }): Promise<void> {
    const map = await this.sessionsService.getVttMapForUser(
      params.userId,
      params.sessionId,
    );
    const token = map.tokens.find(
      (candidate) =>
        candidate.sessionCharacterId === params.sessionCharacterId,
    );
    if (!token) {
      throw badRequest("INVENTORY_400", "아이템을 배치할 캐릭터 토큰이 없습니다.", {
        reason: "ITEM_USER_TOKEN_NOT_FOUND",
      });
    }
    const sizePx = Math.max(
      map.gridSize,
      (params.sizeFt / 5) * map.gridSize,
    );
    await this.mapRuntimeService.saveSystemVttMap(params.sessionId, {
      ...map,
      terrainCells: [
        ...(map.terrainCells ?? []),
        {
          id: `item-terrain:${params.itemEntryId}:${Date.now()}`,
          x: Math.max(
            0,
            Math.min(
              map.width - sizePx,
              Math.floor(token.x - (sizePx - token.size) / 2),
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              map.height - sizePx,
              Math.floor(token.y - (sizePx - token.size) / 2),
            ),
          ),
          width: sizePx,
          height: sizePx,
          name: params.itemName,
          description: `${params.itemName}으로 생성된 지형 효과`,
          terrainEffectId: params.terrainEffectId,
        },
      ],
      updatedAt: new Date().toISOString(),
    });
  }

  private async spendInventoryItemActionCost(
    sessionId: string,
    sessionCharacterId: string,
    actionCost: "action" | "bonus_action",
  ): Promise<void> {
    const combat = await this.prisma.combat.findFirst({
      where: {
        sessionId,
        status: PrismaCombatStatus.ACTIVE,
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });
    if (!combat) {
      return;
    }
    const actor = combat.participants.find(
      (participant) =>
        participant.sessionCharacterId === sessionCharacterId,
    );
    if (!actor || combat.currentParticipantId !== actor.id) {
      throw forbidden("ACTION_403", "현재 전투 턴에는 아이템을 사용할 수 없습니다.", {
        reason: "ITEM_USE_REQUIRES_CURRENT_TURN",
      });
    }
    const key = {
      combatId: combat.id,
      combatParticipantId: actor.id,
      roundNo: combat.roundNo,
      turnNo: combat.turnNo,
      sessionCharacterId,
    };
    if (actionCost === "bonus_action") {
      await this.actionEconomy.spendBonusAction(key);
      return;
    }
    await this.actionEconomy.spendAction(key);
  }

  private async assertInventoryItemTargetInRange(params: {
    userId: string;
    sessionId: string;
    actorSessionCharacterId: string;
    targetSessionCharacterId: string;
    rangeFt: number;
  }): Promise<void> {
    const map = await this.sessionsService.getVttMapForUser(
      params.userId,
      params.sessionId,
    );
    const actorToken = map.tokens.find(
      (token) =>
        token.sessionCharacterId === params.actorSessionCharacterId,
    );
    const targetToken = map.tokens.find(
      (token) =>
        token.sessionCharacterId === params.targetSessionCharacterId,
    );
    if (!actorToken || !targetToken) {
      throw badRequest("INVENTORY_400", "아이템 대상의 맵 토큰을 찾을 수 없습니다.", {
        reason: "ITEM_TARGET_TOKEN_NOT_FOUND",
      });
    }
    const dx = Math.abs(actorToken.x - targetToken.x) / map.gridSize;
    const dy = Math.abs(actorToken.y - targetToken.y) / map.gridSize;
    const distanceFt = Math.max(dx, dy) * 5;
    if (distanceFt > params.rangeFt) {
      throw badRequest("INVENTORY_400", "아이템 대상이 사거리 밖에 있습니다.", {
        reason: "ITEM_TARGET_OUT_OF_RANGE",
        distanceFt,
        rangeFt: params.rangeFt,
      });
    }
  }

  private parseJson<T>(
    value: string | null | undefined,
    fallback: T,
  ): T {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private isPackLikeInventoryItem(item: {
    id: string;
    name: string;
    itemType: string;
    propertiesJson: string | null;
  }): boolean {
    const key = this.buildItemSearchKey(item);
    return item.itemType === "pack" || key.includes("꾸러미");
  }

  private resolveHealingAmount(item: {
    id: string;
    name: string;
    itemType: string;
    propertiesJson: string | null;
  }): number | null {
    const key = this.buildItemSearchKey(item);
    return key.includes("healing") || key.includes("치유") ? 7 : null;
  }

  private buildItemSearchKey(item: {
    id: string;
    name: string;
    itemType: string;
    propertiesJson: string | null;
  }): string {
    const properties = this.parseStringArrayJson(item.propertiesJson);
    return [item.id, item.name, item.itemType, ...properties]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  private async unpackInventoryPack(
    sessionCharacterId: string,
    packEntryId: string,
    pack: SrdEquipmentRecord,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const packEntry = await tx.inventoryEntry.findUnique({
        where: { id: packEntryId },
        include: { itemDefinition: true },
      });
      if (!packEntry || packEntry.sessionCharacterId !== sessionCharacterId || packEntry.quantity < 1) {
        throw badRequest("INVENTORY_400", "사용할 꾸러미를 찾을 수 없습니다.", {
          reason: "INVENTORY_PACK_NOT_FOUND",
        });
      }

      for (const content of pack.contents ?? []) {
        const contentRecord = this.findSrdEquipmentById(content.itemId);
        if (!contentRecord) {
          throw badRequest("INVENTORY_400", "꾸러미 내용물 정의를 찾을 수 없습니다.", {
            reason: "PACK_CONTENT_DEFINITION_NOT_FOUND",
            itemId: content.itemId,
          });
        }
        const quantity = Number.isInteger(content.quantity) && content.quantity > 0 ? content.quantity : 1;
        await tx.itemDefinition.upsert({
          where: { id: contentRecord.id },
          update: this.toItemDefinitionData(contentRecord),
          create: {
            id: contentRecord.id,
            ...this.toItemDefinitionData(contentRecord),
          },
        });
        await tx.inventoryEntry.create({
          data: {
            sessionCharacterId,
            itemDefinitionId: contentRecord.id,
            quantity,
          },
        });
      }

      if (packEntry.quantity > 1) {
        await tx.inventoryEntry.update({
          where: { id: packEntry.id },
          data: { quantity: { decrement: 1 } },
        });
      } else {
        await tx.inventoryEntry.delete({ where: { id: packEntry.id } });
      }
    });

    await this.inventoryRuntime.syncSessionInventorySnapshot(sessionCharacterId);
  }

  private toItemDefinitionData(record: SrdEquipmentRecord): {
    name: string;
    itemType: string;
    weightLb: number | null;
    description: string | null;
    damageDice: string | null;
    damageType: string | null;
    armorClassBase: number | null;
    armorClassBonus: number | null;
    armorStrengthRequirement: number | null;
    armorStealthDisadvantage: boolean | null;
    useEffect: string | null;
    packContentsJson: string | null;
    propertiesJson: string;
  } {
    const properties = [
      "srd-engine",
      record.category?.equipmentCategory,
      ...(record.weapon?.properties ?? []).map((property) => property.id ?? property.raw),
    ].filter((property): property is string => Boolean(property));
    return {
      name: this.getSrdEquipmentName(record, record.id),
      itemType: record.category?.kind ?? "gear",
      weightLb: typeof record.economy?.weight?.lb === "number" ? record.economy.weight.lb : null,
      description: this.buildSrdEquipmentDescription(record),
      damageDice: record.weapon?.damage?.dice ?? null,
      damageType: record.weapon?.damageType ?? null,
      armorClassBase: record.armor?.armorClass?.base ?? null,
      armorClassBonus: record.armor?.armorClass?.bonus ?? null,
      armorStrengthRequirement: this.readArmorStrengthRequirement(record),
      armorStealthDisadvantage: record.armor?.stealthDisadvantage ?? null,
      useEffect: this.buildSrdEquipmentUseEffect(record),
      packContentsJson: this.buildSrdPackContentsJson(record),
      propertiesJson: JSON.stringify([...new Set(properties)]),
    };
  }

  private buildSrdEquipmentDescription(record: SrdEquipmentRecord): string {
    const name = this.getSrdEquipmentName(record, record.id);
    if (record.contents?.length) {
      return `${name}입니다. 사용하면 꾸러미를 풀어 포함된 장비들을 인벤토리에 추가합니다.`;
    }
    if (record.weapon) {
      const damage = record.weapon.damage?.dice
        ? `${record.weapon.damage.dice}${record.weapon.damageType ? ` ${record.weapon.damageType}` : ""} 피해`
        : "무기 피해";
      const range = record.weapon.rangeRaw ? ` 사거리 ${record.weapon.rangeRaw}.` : "";
      return `${name} 무기입니다. 명중 시 ${damage}를 줍니다.${range}`;
    }
    if (record.armor) {
      const armorClass = record.armor.armorClass?.raw
        ? `AC ${record.armor.armorClass.raw}`
        : record.armor.armorClass?.base
          ? `기본 AC ${record.armor.armorClass.base}`
          : record.armor.armorClass?.bonus
            ? `AC +${record.armor.armorClass.bonus}`
            : "AC 보너스";
      return `${name} 방어구입니다. 장착하면 ${armorClass}를 적용합니다.`;
    }
    const useEffect = this.buildSrdEquipmentUseEffect(record);
    if (useEffect) {
      return useEffect;
    }
    return `${name}입니다. 세션 중 보유하거나 상황에 따라 사용할 수 있는 SRD 장비입니다.`;
  }

  private readArmorStrengthRequirement(record: SrdEquipmentRecord): number | null {
    const requirement = record.armor?.strengthRequirement;
    if (typeof requirement === "number") {
      return requirement;
    }
    if (requirement && typeof requirement.minimum === "number") {
      return requirement.minimum;
    }
    return null;
  }

  private buildSrdEquipmentUseEffect(record: SrdEquipmentRecord): string | null {
    const key = this.normalizeEquipmentLookupKey(
      [record.id, record.name?.en, record.name?.ko, record.category?.equipmentCategory]
        .filter(Boolean)
        .join(" "),
    );
    if (key.includes("potionofhealing") || key.includes("치유물약")) {
      return "사용하면 HP를 평균 7점 회복합니다.";
    }
    if (record.use?.damage?.dice) {
      return `사용하면 ${record.use.damage.dice}${record.use.damageType ? ` ${record.use.damageType}` : ""} 피해 효과를 적용합니다.`;
    }
    return null;
  }

  private buildSrdPackContentsJson(record: SrdEquipmentRecord): string | null {
    if (!record.contents?.length) {
      return null;
    }
    return JSON.stringify(
      record.contents.map((content) => {
        const contentRecord = this.findSrdEquipmentById(content.itemId);
        return {
          itemId: content.itemId,
          name: this.getSrdEquipmentName(contentRecord, content.itemId),
          quantity: content.quantity,
        };
      }),
    );
  }

  private resolveSrdPackRecord(
    item: { id: string; name: string; itemType: string; propertiesJson: string | null },
    catalogKey: string | null,
  ): SrdEquipmentRecord | null {
    const keyCandidates = [
      item.id,
      item.name,
      catalogKey,
      catalogKey ? catalogKey.replace(/-/g, " ") : null,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => this.normalizeEquipmentLookupKey(value));
    return (
      this.loadSrdEquipment().find((record) => {
        if (!record.contents?.length) return false;
        const recordCandidates = [
          record.id,
          record.name?.en,
          record.name?.ko,
          ...(record.name?.aliases ?? []),
        ].map((value) => this.normalizeEquipmentLookupKey(value ?? ""));
        return keyCandidates.some((candidate) => recordCandidates.includes(candidate));
      }) ?? null
    );
  }

  private findSrdEquipmentById(itemId: string): SrdEquipmentRecord | null {
    return this.loadSrdEquipment().find((record) => record.id === itemId) ?? null;
  }

  private loadSrdEquipment(): SrdEquipmentRecord[] {
    if (this.srdEquipmentCache) {
      return this.srdEquipmentCache;
    }

    const candidates = [
      join(process.cwd(), "srd-data", "generated", "srd-engine", "equipment.jsonl"),
      join(process.cwd(), "..", "srd-data", "generated", "srd-engine", "equipment.jsonl"),
      join(process.cwd(), "..", "..", "srd-data", "generated", "srd-engine", "equipment.jsonl"),
    ];
    const filePath = candidates.find((candidate) => existsSync(candidate));
    if (!filePath) {
      this.srdEquipmentCache = [];
      return this.srdEquipmentCache;
    }

    this.srdEquipmentCache = readFileSync(filePath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as SrdEquipmentRecord;
        } catch {
          return null;
        }
      })
      .filter((record): record is SrdEquipmentRecord => Boolean(record?.id));
    return this.srdEquipmentCache;
  }

  private getSrdEquipmentName(record: SrdEquipmentRecord | null | undefined, fallback: string): string {
    return record?.name?.ko?.trim() || record?.name?.en?.trim() || fallback;
  }

  private normalizeEquipmentLookupKey(value: string): string {
    return value
      .toLowerCase()
      .replace(/equipment[._-]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9가-힣]+/g, "")
      .replace(/s(?=pack$)/g, "");
  }

  private parseStringArrayJson(value: string | null): string[] {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  private resolveActionScope(
    requested: ActionScope | undefined,
    phase: PrismaGamePhase,
  ): PrismaActionScope {
    if (requested) {
      return requested === ActionScope.INDIVIDUAL_TURN
        ? PrismaActionScope.INDIVIDUAL_TURN
        : PrismaActionScope.PARTY_SHARED;
    }

    return phase === PrismaGamePhase.COMBAT
      ? PrismaActionScope.INDIVIDUAL_TURN
      : PrismaActionScope.PARTY_SHARED;
  }

  private resolveInputType(dto: SubmitActionDto): PrismaActionInputType {
    if (dto.inputType === ActionInputType.SELECT) {
      return PrismaActionInputType.SELECT;
    }

    return dto.rawText.trim().startsWith("/")
      ? PrismaActionInputType.COMMAND
      : PrismaActionInputType.TEXT;
  }

  private ensureCommandSyntax(rawText: string): void {
    if (!rawText.trim().startsWith("/")) {
      return;
    }

    const parsed = this.commandParser.parse(rawText);
    if (parsed.type === "unknown") {
      throw badRequest("ACTION_400", "잘못된 명령어입니다.", {
        reason: "UNKNOWN_COMMAND",
      });
    }
  }

  private async ensureScopeAllowed(params: {
    sessionId: string;
    userId: string;
    participantRole: PrismaParticipantRole;
    sessionCharacterId: string;
    sessionCharacterCurrentHp: number;
    phase: PrismaGamePhase;
    actionScope: PrismaActionScope;
  }): Promise<void> {
    if (params.actionScope === PrismaActionScope.PARTY_SHARED) {
      if (params.phase === PrismaGamePhase.COMBAT) {
        throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
          reason: "PARTY_ACTION_BLOCKED_IN_COMBAT",
        });
      }

      const participantCount = await this.prisma.sessionParticipant.count({
        where: {
          sessionId: params.sessionId,
          status: PrismaParticipantStatus.JOINED,
        },
      });

      if (participantCount > 1 && params.participantRole !== PrismaParticipantRole.HOST) {
        throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
          reason: "NOT_PARTY_REPRESENTATIVE",
        });
      }

      return;
    }

    if (params.phase !== PrismaGamePhase.COMBAT) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "INDIVIDUAL_TURN_REQUIRES_COMBAT",
      });
    }

    const combat = await this.prisma.combat.findFirst({
      where: {
        sessionId: params.sessionId,
        status: "ACTIVE",
      },
      include: { participants: true },
      orderBy: { createdAt: "desc" },
    });

    const current = combat?.participants.find(
      (participant) => participant.id === combat.currentParticipantId,
    );

    if (!combat || current?.sessionCharacterId !== params.sessionCharacterId) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "NOT_YOUR_TURN",
      });
    }

    // S14P31A201-80: 전투 중 HP 0 (기절/사망) 상태 캐릭터의 행동을 차단한다.
    // 비전투 시 narrative 자유도를 위해 검사하지 않는다 — UI 의 isAlive 플래그도
    // 전투 액션(MOVE/ATTACK/CHECK/READY/END_TURN)에 한해 사용된다 (action-rule.service.ts 참고).
    if (params.sessionCharacterCurrentHp <= 0) {
      throw forbidden("ACTION_403", "행동을 입력할 수 없습니다.", {
        reason: "CHARACTER_INCAPACITATED",
      });
    }
  }
}
