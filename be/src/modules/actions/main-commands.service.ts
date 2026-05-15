import { Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  AiHintRequestDto,
  AiNpcDialogueRequestDto,
  AiSummaryRequestDto,
  MainCommandActionCandidateDto,
  MainCommandCheckOptionDto,
  MainCommandIntent,
  MainCommandResponseDto,
  MainCommandScreenType,
  MainCommandStatus,
  MainCommandTargetType,
  ResolveMainCommandCheckDto,
  ScenarioNodeType,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import {
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { badRequest, forbidden } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { AiService } from "../ai/ai.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";

type VisibleSceneEntity = {
  id: string;
  name: string;
  summary: string;
  disposition: string;
  kind: MainCommandTargetType;
};

type LoadedContext = {
  sessionId: string;
  sessionScenarioId: string;
  sessionCharacterId: string;
  actorCharacterId: string;
  inventoryItems: Array<{
    id: string;
    itemDefinitionId: string;
    name: string;
  }>;
  currentNodeId: string;
  currentNodeTitle: string;
  currentNodeSceneText: string;
  currentNodeTransitionsJson: string;
  currentNodeCluesJson: string;
  currentNodeNodeMetaJson: string | null;
  currentNodeFallbackNodeId: string | null;
};

type IntentRequirement = {
  requiresTargetTypes?: MainCommandTargetType[];
  allowsTargetTypes?: MainCommandTargetType[];
  requiresItem?: boolean;
  requiresSpell?: boolean;
  requiresMapPoint?: boolean;
  allowsMapPoint?: boolean;
};

type RuleFragmentSummary = {
  id: string;
  titleKo: string;
  summaryKo: string;
};

type TransitionCandidate = {
  transitionId: string | null;
  label: string | null;
  condition: string | null;
  note: string | null;
  nodeId: string;
  title: string;
  nodeType: ScenarioNodeType;
  isFallback: boolean;
};

type TransitionConditionEvaluation = {
  satisfied: boolean;
  needsReview: boolean;
  reason: string;
  matchedTerms: string[];
  missingTerms: string[];
};

type VttDoorCheckEffect = {
  type: "vttDoor";
  doorId: string;
  effect: "open" | "broken";
  nodeId: string;
  mapPoint: { x: number; y: number };
};

const AUTO_TRANSITION_CONDITIONS = new Set([
  "",
  "default",
  "always",
  "auto",
  "automatic",
  "true",
  "none",
  "무조건",
  "무조건 가능",
  "항상",
  "항상 가능",
  "자동",
  "기본",
  "없음",
]);

const TRANSITION_CONDITION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "by",
  "condition",
  "default",
  "for",
  "from",
  "if",
  "in",
  "is",
  "next",
  "node",
  "of",
  "on",
  "or",
  "scene",
  "the",
  "then",
  "to",
  "when",
  "with",
  "경우",
  "그리고",
  "기본",
  "노드",
  "다음",
  "때",
  "또는",
  "및",
  "상태",
  "시",
  "이후",
  "이동",
  "완료",
  "장면",
  "전",
  "전이",
  "조건",
  "후",
]);

const INTENT_REQUIREMENTS: Partial<Record<MainCommandIntent, IntentRequirement>> = {
  [MainCommandIntent.TALK_TO_NPC]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.SOCIAL_PERSUADE]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.SOCIAL_INTIMIDATE]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.SOCIAL_DECEIVE]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.READ_EMOTION]: {
    requiresTargetTypes: [MainCommandTargetType.NPC],
  },
  [MainCommandIntent.INSPECT_STORY_OBJECT]: {
    requiresTargetTypes: [MainCommandTargetType.OBJECT],
  },
  [MainCommandIntent.INVESTIGATE_OBJECT]: {
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.DETECT_DANGER]: {
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.SPECIAL_MOVE]: {
    requiresMapPoint: true,
  },
  [MainCommandIntent.INTERACT_OBJECT]: {
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.USE_TOOL]: {
    requiresItem: true,
    allowsTargetTypes: [
      MainCommandTargetType.OBJECT,
      MainCommandTargetType.AREA,
      MainCommandTargetType.NPC,
      MainCommandTargetType.POINT,
    ],
    allowsMapPoint: true,
  },
  [MainCommandIntent.USE_ITEM_EXPLORE]: {
    requiresItem: true,
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.NPC, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.ENVIRONMENT_USE]: {
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.IMPROVISED_ATTACK]: {
    requiresTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR, MainCommandTargetType.OBJECT],
  },
  [MainCommandIntent.CALLED_SHOT]: {
    requiresTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR],
  },
  [MainCommandIntent.COMBAT_TALK]: {
    requiresTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR],
  },
  [MainCommandIntent.USE_ITEM_COMBAT]: {
    requiresItem: true,
    allowsTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR, MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
  [MainCommandIntent.USE_SPELL_CREATIVELY]: {
    requiresSpell: true,
    allowsTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR, MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.POINT],
    allowsMapPoint: true,
  },
};

const APPROVAL_INTENTS = new Set<MainCommandIntent>([
  MainCommandIntent.DECLARE_RP_ACTION,
  MainCommandIntent.SPLIT_PARTY_TASK,
  MainCommandIntent.COMBAT_MANEUVER,
  MainCommandIntent.ENVIRONMENT_USE,
  MainCommandIntent.IMPROVISED_ATTACK,
  MainCommandIntent.CALLED_SHOT,
  MainCommandIntent.READY_ACTION,
  MainCommandIntent.REACTION_REQUEST,
  MainCommandIntent.USE_ITEM_EXPLORE,
  MainCommandIntent.USE_ITEM_COMBAT,
  MainCommandIntent.USE_SPELL_CREATIVELY,
]);

@Injectable()
export class MainCommandsService {
  private ruleFragmentsCache: RuleFragmentSummary[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly aiService: AiService,
    private readonly turnLogsService: TurnLogsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async submitMainCommand(
    userId: string,
    sessionId: string,
    dto: SubmitMainCommandDto,
  ): Promise<MainCommandResponseDto> {
    const context = await this.loadContext(userId, sessionId, dto);
    const requestId = randomUUID();
    const visibleEntities = this.extractVisibleSceneEntities(context.currentNodeNodeMetaJson);
    const recentLogs = await this.loadRecentLogLines(context.sessionId);
    const publicClues = this.extractPublicClueSummaries(context.currentNodeCluesJson);
    this.validateIntentPayload(dto, visibleEntities);

    let response: MainCommandResponseDto;
    switch (dto.intent) {
      case MainCommandIntent.TALK_TO_NPC:
        response = await this.handleNpcDialogue(requestId, userId, context, dto, visibleEntities, recentLogs);
        break;
      case MainCommandIntent.SOCIAL_PERSUADE:
        response = await this.handleSocialPersuade(requestId, userId, context, dto, visibleEntities);
        break;
      case MainCommandIntent.SOCIAL_INTIMIDATE:
        response = await this.handleSocialIntimidate(requestId, userId, context, dto, visibleEntities);
        break;
      case MainCommandIntent.SOCIAL_DECEIVE:
        response = await this.handleSocialDeceive(requestId, userId, context, dto, visibleEntities);
        break;
      case MainCommandIntent.READ_EMOTION:
        response = await this.handleReadEmotion(requestId, userId, context, dto, visibleEntities, recentLogs);
        break;
      case MainCommandIntent.INSPECT_STORY_OBJECT:
        response = await this.handleInspectStoryObject(requestId, userId, context, dto, visibleEntities);
        break;
      case MainCommandIntent.DECLARE_RP_ACTION:
        response = await this.handleDeclareRpAction(requestId, userId, context, dto, visibleEntities, recentLogs);
        break;
      case MainCommandIntent.OBSERVE_AREA:
        response = await this.handleObserveArea(requestId, userId, context, dto, visibleEntities, publicClues);
        break;
      case MainCommandIntent.INVESTIGATE_OBJECT:
        response = await this.handleInvestigateObject(requestId, userId, context, dto, visibleEntities);
        break;
      case MainCommandIntent.LISTEN:
        response = await this.handleListen(requestId, userId, context, dto, visibleEntities, recentLogs);
        break;
      case MainCommandIntent.DETECT_DANGER:
        response = await this.handleDetectDanger(requestId, userId, context, dto, visibleEntities, recentLogs);
        break;
      case MainCommandIntent.SPECIAL_MOVE:
        response = await this.handleSpecialMove(requestId, userId, context, dto, visibleEntities);
        break;
      case MainCommandIntent.INTERACT_OBJECT:
        response = await this.handleInteractObject(requestId, userId, context, dto, visibleEntities);
        break;
      case MainCommandIntent.USE_TOOL:
        response = await this.handleUseTool(requestId, userId, context, dto, visibleEntities);
        break;
      case MainCommandIntent.USE_ITEM_EXPLORE:
        response = await this.handleUseItemExplore(requestId, userId, context, dto, visibleEntities);
        break;
      case MainCommandIntent.SPLIT_PARTY_TASK:
        response = await this.handleSplitPartyTask(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs,
        );
        break;
      case MainCommandIntent.COMBAT_MANEUVER:
        response = await this.handleCombatManeuver(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs,
        );
        break;
      case MainCommandIntent.ENVIRONMENT_USE:
        response = await this.handleEnvironmentUse(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs,
        );
        break;
      case MainCommandIntent.IMPROVISED_ATTACK:
        response = await this.handleImprovisedAttack(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs,
        );
        break;
      case MainCommandIntent.CALLED_SHOT:
        response = await this.handleCalledShot(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs,
        );
        break;
      case MainCommandIntent.READY_ACTION:
        response = await this.handleReadyAction(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs,
        );
        break;
      case MainCommandIntent.REACTION_REQUEST:
        response = await this.handleReactionRequest(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs,
        );
        break;
      case MainCommandIntent.USE_ITEM_COMBAT:
        response = await this.handleUseItemCombat(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs,
        );
        break;
      case MainCommandIntent.USE_SPELL_CREATIVELY:
        response = await this.handleUseSpellCreatively(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs,
        );
        break;
      case MainCommandIntent.COMBAT_TALK:
        response = await this.handleCombatTalk(requestId, userId, context, dto, visibleEntities, recentLogs);
        break;
      case MainCommandIntent.ASK_HINT:
        response = await this.handleHint(requestId, userId, context, dto, recentLogs, publicClues);
        break;
      case MainCommandIntent.ASK_SUMMARY:
        response = await this.handleSummary(requestId, userId, context, dto, recentLogs);
        break;
      case MainCommandIntent.ASK_SCENE_INFO:
        response = this.handleSceneInfo(requestId, context, dto, visibleEntities, publicClues);
        break;
      case MainCommandIntent.REQUEST_SCENE_TRANSITION:
        response = await this.handleSceneTransition(requestId, userId, context, dto, recentLogs, publicClues);
        break;
      case MainCommandIntent.TACTIC_QUERY:
        response = await this.handleTacticQuery(requestId, userId, context, dto, recentLogs, publicClues);
        break;
      case MainCommandIntent.ASK_RULE:
        response = await this.handleRuleQuery(requestId, userId, context, dto, visibleEntities);
        break;
      default:
        response = {
          requestId,
          status: MainCommandStatus.IMPOSSIBLE,
          message: "아직 처리되지 않은 메인 명령입니다.",
        };
        break;
    }

    const turnLog = await this.persistResult(userId, context, dto, response);
    const objectRevealCount =
      dto.intent === MainCommandIntent.INVESTIGATE_OBJECT && dto.mapPoint
        ? await this.sessionsService.revealVttObjectContentsAtPoint({
            sessionId: context.sessionId,
            sessionScenarioId: context.sessionScenarioId,
            nodeId: context.currentNodeId,
            mapPoint: dto.mapPoint,
            turnLogId: turnLog.turnLogId,
            revealedBy: "system",
          })
        : 0;
    const revealCount = await this.sessionsService.revealCurrentNodeCluesAfterAction({
      sessionScenarioId: context.sessionScenarioId,
      nodeId: context.currentNodeId,
      actionText: dto.playerText,
      outcome: this.toActionOutcome(response),
      policyModes: ["PLAYER_ACTION"],
      turnLogId: turnLog.turnLogId,
      revealedBy: "system",
    });
    if (revealCount + objectRevealCount > 0) {
      this.realtimeEvents.emitSessionSnapshot(
        context.sessionId,
        await this.sessionsService.buildSnapshot(context.sessionId),
      );
    }
    return response;
  }

  async resolveMainCommandCheck(
    userId: string,
    sessionId: string,
    dto: ResolveMainCommandCheckDto,
  ): Promise<MainCommandResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const effect = this.parseVttDoorCheckEffect(dto.effect);

    if (!effect) {
      return {
        requestId: dto.requestId ?? randomUUID(),
        status: MainCommandStatus.IMPOSSIBLE,
        message: "처리할 수 없는 판정 후속 효과입니다.",
      };
    }
    if (state.currentNodeId && effect.nodeId !== state.currentNodeId) {
      return {
        requestId: dto.requestId ?? randomUUID(),
        status: MainCommandStatus.IMPOSSIBLE,
        message: "현재 노드와 다른 문 판정 결과는 반영할 수 없습니다.",
      };
    }

    const result =
      dto.outcome === ActionOutcome.SUCCESS
        ? await this.sessionsService.applyVttDoorCheckSuccess({
            sessionId: session.id,
            sessionScenarioId: sessionScenario.id,
            doorId: effect.doorId,
            nodeId: effect.nodeId,
            effect: effect.effect,
          })
        : {
            status: MainCommandStatus.MESSAGE,
            message:
              effect.effect === "open"
                ? "판정에 실패해 문은 아직 잠겨 있습니다."
                : "판정에 실패해 문은 부서지지 않았습니다.",
          };

    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: dto.actorId ?? null,
      rawInput: result.message,
      structuredAction: {
        type: "main_command_check_result",
        requestId: dto.requestId ?? null,
        outcome: dto.outcome,
        effect,
      },
      outcome: dto.outcome,
      narration: result.message,
    });
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);

    return {
      requestId: dto.requestId ?? randomUUID(),
      status: result.status,
      message: result.message,
      data: { effect },
    };
  }

  private async loadContext(
    userId: string,
    sessionId: string,
    dto: SubmitMainCommandDto,
  ): Promise<LoadedContext> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);

    if (session.gmMode !== PrismaGmMode.AI) {
      throw badRequest("MAIN_COMMAND_400", "AI GM 세션에서만 메인 명령을 사용할 수 있습니다.", {
        reason: "AI_GM_ONLY",
      });
    }

    if (session.status !== PrismaSessionStatus.PLAYING) {
      throw forbidden("MAIN_COMMAND_403", "세션이 진행 중일 때만 메인 명령을 사용할 수 있습니다.", {
        reason: "SESSION_NOT_PLAYING",
      });
    }

    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw forbidden("MAIN_COMMAND_403", "현재 세션 참가자만 메인 명령을 사용할 수 있습니다.", {
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
      include: {
        character: true,
        inventoryEntries: {
          include: {
            itemDefinition: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("MAIN_COMMAND_403", "캐릭터를 선택한 뒤 메인 명령을 사용해주세요.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (![sessionCharacter.id, sessionCharacter.characterId].includes(dto.actorId)) {
      throw forbidden("MAIN_COMMAND_403", "선택한 캐릭터와 요청 actorId가 일치하지 않습니다.", {
        reason: "ACTOR_MISMATCH",
      });
    }

    // S14P31A201-80: sessionId+userId 복합키로 본인 sessionCharacter 만 얻지만,
    // 캐릭터 이양/공유 등 향후 기능 대비해 Character.ownerUserId 도 명시 검증한다.
    // (기존 actions.service.ts S14P31A201-71 패턴과 동일)
    if (sessionCharacter.character.ownerUserId !== userId) {
      throw forbidden("MAIN_COMMAND_403", "다른 유저의 캐릭터로 메인 명령을 사용할 수 없습니다.", {
        reason: "CHARACTER_OWNERSHIP_MISMATCH",
      });
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    if (!state.currentNodeId) {
      throw badRequest("MAIN_COMMAND_400", "현재 진행 중인 노드가 없습니다.", {
        reason: "CURRENT_NODE_REQUIRED",
      });
    }

    const currentNode = await this.prisma.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: sessionScenario.id,
          nodeId: state.currentNodeId,
        },
      },
    });

    if (!currentNode) {
      throw badRequest("MAIN_COMMAND_400", "현재 노드 정보를 찾을 수 없습니다.", {
        reason: "CURRENT_NODE_NOT_FOUND",
      });
    }

    const expectedScreenType = this.toMainScreenType(currentNode.nodeType);
    if (dto.screenType !== expectedScreenType) {
      throw badRequest("MAIN_COMMAND_400", "현재 노드 화면 타입과 요청 screenType이 일치하지 않습니다.", {
        reason: "SCREEN_TYPE_MISMATCH",
      });
    }

    if (dto.nodeId && dto.nodeId !== currentNode.nodeId) {
      throw badRequest("MAIN_COMMAND_400", "요청 nodeId가 현재 진행 중인 노드와 다릅니다.", {
        reason: "NODE_ID_MISMATCH",
      });
    }

    this.ensureItemOwnership(dto, sessionCharacter.inventoryEntries);

    return {
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      sessionCharacterId: sessionCharacter.id,
      actorCharacterId: sessionCharacter.character.id,
      inventoryItems: sessionCharacter.inventoryEntries.map((entry) => ({
        id: entry.id,
        itemDefinitionId: entry.itemDefinitionId,
        name: entry.itemDefinition.name,
      })),
      currentNodeId: currentNode.nodeId,
      currentNodeTitle: currentNode.title,
      currentNodeSceneText: currentNode.sceneText,
      currentNodeTransitionsJson: currentNode.transitionsJson,
      currentNodeCluesJson: currentNode.cluesJson,
      currentNodeNodeMetaJson: currentNode.nodeMetaJson,
      currentNodeFallbackNodeId: currentNode.fallbackNodeId,
    };
  }

  private ensureItemOwnership(
    dto: SubmitMainCommandDto,
    inventoryEntries: Array<{
      id: string;
      itemDefinitionId: string;
      itemDefinition: { id: string; name: string };
    }>,
  ): void {
    if (!dto.itemId) {
      return;
    }

    const normalized = dto.itemId.trim().toLowerCase();
    const hasItem = inventoryEntries.some((entry) =>
      [entry.id, entry.itemDefinitionId, entry.itemDefinition.id, entry.itemDefinition.name]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase())
        .includes(normalized),
    );

    if (!hasItem) {
      throw badRequest("MAIN_COMMAND_400", "해당 아이템은 현재 캐릭터가 보유하고 있지 않습니다.", {
        reason: "ITEM_NOT_OWNED",
      });
    }
  }

  private validateIntentPayload(dto: SubmitMainCommandDto, visibleEntities: VisibleSceneEntity[]): void {
    const requirement = INTENT_REQUIREMENTS[dto.intent];
    if (!requirement) {
      return;
    }

    if (requirement.requiresItem && !dto.itemId) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 사용할 아이템을 함께 지정해야 합니다.", {
        reason: "ITEM_ID_REQUIRED",
        intent: dto.intent,
      });
    }

    if (requirement.requiresSpell && !dto.spellId) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 사용할 주문을 함께 지정해야 합니다.", {
        reason: "SPELL_ID_REQUIRED",
        intent: dto.intent,
      });
    }

    if (requirement.requiresMapPoint && !dto.mapPoint) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 지도 좌표를 함께 지정해야 합니다.", {
        reason: "MAP_POINT_REQUIRED",
        intent: dto.intent,
      });
    }

    if (dto.targetType) {
      const allowedTargetTypes = requirement.requiresTargetTypes ?? requirement.allowsTargetTypes ?? [];
      if (allowedTargetTypes.length && !allowedTargetTypes.includes(dto.targetType)) {
        throw badRequest("MAIN_COMMAND_400", "이 명령에 맞지 않는 대상 종류입니다.", {
          reason: "TARGET_TYPE_INVALID",
          intent: dto.intent,
          targetType: dto.targetType,
        });
      }
    }

    if (requirement.requiresTargetTypes && !dto.targetId) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 대상을 함께 지정해야 합니다.", {
        reason: "TARGET_ID_REQUIRED",
        intent: dto.intent,
      });
    }

    if (
      (dto.intent === MainCommandIntent.INVESTIGATE_OBJECT ||
        dto.intent === MainCommandIntent.INTERACT_OBJECT ||
        dto.intent === MainCommandIntent.ENVIRONMENT_USE) &&
      !dto.targetId &&
      !dto.mapPoint
    ) {
      throw badRequest("MAIN_COMMAND_400", "이 명령은 조사 대상 또는 지도 좌표가 필요합니다.", {
        reason: "TARGET_OR_POINT_REQUIRED",
        intent: dto.intent,
      });
    }

    if (dto.targetId) {
      if (
        dto.targetType === MainCommandTargetType.ACTOR ||
        dto.targetType === MainCommandTargetType.POINT ||
        dto.targetType === MainCommandTargetType.SELF
      ) {
        return;
      }

      const allowedTargetTypes = requirement.requiresTargetTypes ?? requirement.allowsTargetTypes;
      const entity = this.resolveEntity(
        dto,
        allowedTargetTypes?.length
          ? visibleEntities.filter((item) => allowedTargetTypes.includes(item.kind))
          : visibleEntities,
        dto.targetType,
      );
      if (!entity) {
        throw badRequest("MAIN_COMMAND_400", "현재 화면에서 보이는 대상만 지정할 수 있습니다.", {
          reason: "TARGET_NOT_VISIBLE",
          intent: dto.intent,
          targetId: dto.targetId,
        });
      }
    }
  }

  private async handleNpcDialogue(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC,
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "대화할 NPC를 지정하지 않았습니다. 화면에 보이는 NPC를 분명히 적어주세요.",
      };
    }

    const aiRequest: AiNpcDialogueRequestDto = {
      npcEntityId: npc.id,
      npcName: npc.name,
      npcSummary: npc.summary,
      disposition: npc.disposition,
      sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
      recentContext: recentLogs.slice(0, 6),
      dialogueIntent: dto.playerText,
      audienceIds: [context.actorCharacterId],
    };

    const result = await this.aiService.runNpcDialogue(userId, context.sessionId, aiRequest, {
      emitChatMessage: false,
    });

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${npc.name}: ${result.parsed.dialogue}`,
    };
  }

  private async handleCombatTalk(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "누구에게 어떤 말투와 의도로 말하는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      interpreter.parsed.action.type ||
      dto.playerText;
    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${actionSummary}에는 판정이 필요합니다.`,
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    if (APPROVAL_INTENTS.has(dto.intent)) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${actionSummary}은(는) 상황 확인 또는 추가 검증이 필요합니다.`,
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    return this.handleNpcDialogue(requestId, userId, context, dto, visibleEntities, recentLogs);
  }

  private async handleSocialPersuade(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC,
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "설득할 NPC를 지정하지 않았습니다. 공개된 대상 중 누구를 설득하는지 골라주세요.",
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${npc.name}을(를) 어떤 근거로 설득하려는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const normalizedDisposition = npc.disposition.trim().toLowerCase();
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${npc.name} 설득에는 판정이 필요합니다.`,
        checkOptions: this.buildPersuasionCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (normalizedDisposition === "hostile" && confidence < 0.65) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${npc.name}은(는) 현재 적대적이어서 설득이 바로 받아들여지기 어렵습니다. 더 강한 근거, 대가, 또는 상황 변화가 필요합니다.`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${npc.name} 설득은 상황 판단이 필요합니다. 제시한 근거와 현재 분위기를 보고 GM 승인 또는 추가 판정으로 결정합니다.`,
      actionCandidate,
    };
  }

  private async handleSocialIntimidate(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC,
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "압박할 NPC를 지정하지 않았습니다. 공개된 대상 중 누구를 압박하는지 골라주세요.",
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${npc.name}에게 어떤 위협이나 압박을 가하는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const normalizedDisposition = npc.disposition.trim().toLowerCase();
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${npc.name} 압박에는 판정이 필요합니다.`,
        checkOptions: this.buildIntimidationCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (confidence < 0.45) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${npc.name}에게 통할 만한 위협 근거가 부족합니다. 더 직접적인 압박 수단이나 위험 요소를 제시해야 합니다.`,
        actionCandidate,
      };
    }

    if (normalizedDisposition === "friendly" && confidence < 0.7) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${npc.name}은(는) 현재 우호적이어서 이런 압박은 관계를 악화시키기 쉽습니다. 다른 방식의 접근이 필요합니다.`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${npc.name} 압박은 상황 반발과 후속 결과 판단이 필요합니다. 위협의 설득력과 부작용은 GM 승인 또는 추가 판정으로 결정합니다.`,
      actionCandidate,
    };
  }

  private async handleSocialDeceive(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC,
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "속일 NPC를 지정하지 않았습니다. 공개된 대상 중 누구를 속이는지 골라주세요.",
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${npc.name}에게 어떤 거짓 정보나 신분을 제시하는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${npc.name} 속이기에는 판정이 필요합니다.`,
        checkOptions: this.buildDeceptionCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (confidence < 0.45) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${npc.name}에게 통할 만한 거짓 근거가 부족합니다. 신분, 증거, 상황 설명을 더 그럴듯하게 제시해야 합니다.`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${npc.name} 속이기는 진술의 개연성과 노출 위험 판단이 필요합니다. GM 승인 또는 추가 판정으로 결정합니다.`,
      actionCandidate,
    };
  }

  private async handleReadEmotion(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC,
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "읽어볼 NPC를 지정하지 않았습니다. 공개된 대상 중 누구의 반응을 읽을지 골라주세요.",
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 6)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${npc.name}의 어떤 감정이나 반응을 읽고 싶은지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;

    return {
      requestId,
      status: MainCommandStatus.CHECK_REQUIRED,
      message: `${npc.name}의 감정과 속내를 읽으려면 판정이 필요합니다.`,
      checkOptions: this.buildInsightCheckOptions(interpreter.parsed.action, npc.name),
      actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
    };
  }

  private async handleInspectStoryObject(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const objectTarget = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.OBJECT),
      MainCommandTargetType.OBJECT,
    );

    if (!objectTarget) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "살펴볼 오브젝트를 지정하지 않았습니다. 공개된 물건이나 단서 중 하나를 골라주세요.",
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${objectTarget.name}의 어떤 부분을 살펴보는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${objectTarget.name}을(를) 자세히 조사하려면 판정이 필요합니다.`,
        checkOptions: this.buildInvestigationCheckOptions(interpreter.parsed.action, objectTarget.name),
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${objectTarget.name}: ${objectTarget.summary}`,
      actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
    };
  }

  private async handleDeclareRpAction(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "어떤 RP 행동을 어떤 분위기로 하려는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (interpreter.parsed.action.requiresRoll || confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${actionSummary}은(는) 단순 묘사를 넘어 추가 판정이나 상황 확인이 필요할 수 있습니다.`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${actionSummary} RP 선언을 기록했습니다.`,
      actionCandidate,
    };
  }

  private async handleObserveArea(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "어느 방향이나 어떤 범위를 살펴보는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "주변을 면밀하게 살피려면 판정이 필요합니다.",
        checkOptions: this.buildPerceptionCheckOptions(interpreter.parsed.action),
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    const visibleSummary = visibleEntities.length
      ? `보이는 대상: ${visibleEntities.map((entity) => entity.name).join(", ")}.`
      : "눈에 띄는 대상은 아직 없습니다.";
    const clueSummary = publicClues.length
      ? ` 공개 단서: ${publicClues.join(" / ")}`
      : "";
    const pointSummary = dto.mapPoint
      ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 주변을 기준으로 살펴봅니다.`
      : "";

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${context.currentNodeSceneText}${pointSummary} ${visibleSummary}${clueSummary}`.trim(),
      actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
    };
  }

  private async handleInvestigateObject(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    if (dto.mapPoint) {
      const objectResult = await this.sessionsService.describeVttObjectAtPoint({
        sessionId: context.sessionId,
        sessionScenarioId: context.sessionScenarioId,
        nodeId: context.currentNodeId,
        mapPoint: dto.mapPoint,
      });

      if (objectResult) {
        return {
          requestId,
          status: MainCommandStatus.MESSAGE,
          message: objectResult.message,
          actionCandidate: this.buildActionCandidate(context, dto, dto.playerText),
        };
      }
    }

    const investigationTargets = visibleEntities.filter(
      (entity) =>
        entity.kind === MainCommandTargetType.OBJECT ||
        entity.kind === MainCommandTargetType.AREA,
    );
    const target = dto.targetId
      ? this.resolveEntity(dto, investigationTargets, dto.targetType)
      : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "무엇을 어떻게 조사하는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      const label = target?.name ?? "해당 위치";
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${label}을(를) 자세히 조사하려면 판정이 필요합니다.`,
        checkOptions: this.buildInvestigationCheckOptions(interpreter.parsed.action, label),
        actionCandidate,
      };
    }

    if (target) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: `${target.name}: ${target.summary}`,
        actionCandidate,
      };
    }

    if (dto.mapPoint) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 위치 조사는 현장 판정이나 추가 확인이 필요합니다.`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.IMPOSSIBLE,
      message: "조사할 대상이나 위치를 지정하지 않았습니다.",
      actionCandidate,
    };
  }

  private async handleListen(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const listenTargets = visibleEntities.filter(
      (entity) =>
        entity.kind === MainCommandTargetType.OBJECT ||
        entity.kind === MainCommandTargetType.AREA,
    );
    const target = dto.targetId
      ? this.resolveEntity(dto, listenTargets, dto.targetType)
      : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "어느 쪽이나 어떤 지점을 향해 귀를 기울이는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "미세한 소리나 기척을 알아내려면 판정이 필요합니다.",
        checkOptions: this.buildPerceptionCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const pointSummary = dto.mapPoint
      ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 부근에 귀를 기울였습니다.`
      : "";
    const targetSummary = target
      ? ` ${target.name} 쪽에서 공개적으로 들을 수 있는 이상한 소리는 없습니다.`
      : " 공개된 범위에서는 이상한 소리나 기척이 바로 드러나지 않습니다.";

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${context.currentNodeTitle}.${pointSummary}${targetSummary}`.trim(),
      actionCandidate,
    };
  }

  private async handleDetectDanger(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const dangerTargets = visibleEntities.filter(
      (entity) =>
        entity.kind === MainCommandTargetType.OBJECT ||
        entity.kind === MainCommandTargetType.AREA,
    );
    const target = dto.targetId
      ? this.resolveEntity(dto, dangerTargets, dto.targetType)
      : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "어느 위치의 어떤 위험을 경계하는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "숨은 위험이나 매복을 감지하려면 판정이 필요합니다.",
        checkOptions: this.buildDangerDetectionCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const targetSummary = target
      ? ` ${target.name} 부근에서 즉시 드러난 위험은 보이지 않습니다.`
      : " 즉시 드러난 위험 신호는 보이지 않습니다.";
    const pointSummary = dto.mapPoint
      ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 주변을 경계했습니다.`
      : "";

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${context.currentNodeTitle}.${pointSummary}${targetSummary}`.trim(),
      actionCandidate,
    };
  }

  private async handleSpecialMove(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "어느 위치로 어떤 방식으로 이동하려는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll || interpreter.parsed.action.confidence < 0.8) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "특수 이동을 시도하려면 판정이 필요합니다.",
        checkOptions: this.buildSpecialMoveCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const itemSummary = dto.itemId ? ` 도구 ${dto.itemId} 사용을 함께 고려합니다.` : "";

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `(${dto.mapPoint?.x}, ${dto.mapPoint?.y}) 방향 특수 이동을 시도할 수 있습니다.${itemSummary}`,
      actionCandidate,
    };
  }

  private async handleInteractObject(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    if (dto.mapPoint) {
      const doorResult = await this.sessionsService.openVttDoorAtPoint({
        sessionId: context.sessionId,
        sessionScenarioId: context.sessionScenarioId,
        nodeId: context.currentNodeId,
        mapPoint: dto.mapPoint,
        itemId: dto.itemId,
      });

      if (doorResult) {
        return {
          requestId,
          status: doorResult.status,
          message: doorResult.message,
          checkOptions: doorResult.checkOptions,
          data: doorResult.checkEffect ? { checkEffect: doorResult.checkEffect } : null,
          actionCandidate: this.buildActionCandidate(context, dto, dto.playerText),
        };
      }
    }

    const objectTarget = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.OBJECT),
      MainCommandTargetType.OBJECT,
    );

    if (!objectTarget) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "조작할 오브젝트를 지정하지 않았습니다. 공개된 문, 상자, 장치 중 하나를 골라주세요.",
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${objectTarget.name}을(를) 어떤 방식으로 조작하는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${objectTarget.name}을(를) 조작하려면 판정이 필요합니다.`,
        checkOptions: this.buildObjectInteractionCheckOptions(interpreter.parsed.action, objectTarget.name),
        actionCandidate,
      };
    }

    if (interpreter.parsed.action.confidence < 0.6) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${objectTarget.name} 조작은 추가 상태 확인이나 상황 승인이 필요합니다.`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.ACTION_READY,
      message: `${objectTarget.name}에 ${actionSummary}을(를) 시도할 수 있습니다.`,
      actionCandidate,
    };
  }

  private async handleUseTool(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const toolName = this.resolveOwnedItemName(context, dto.itemId);
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      const targetLabel = target?.name ?? locationLabel ?? "어디에";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${toolName}을(를) ${targetLabel} 어떤 방식으로 사용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${toolName} 사용에는 판정이 필요합니다.`,
        checkOptions: this.buildToolUseCheckOptions(interpreter.parsed.action, toolName, target?.name),
        actionCandidate,
      };
    }

    if (interpreter.parsed.action.confidence < 0.6) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${toolName} 사용은 현재 상황 확인이나 추가 승인이 필요합니다.`,
        actionCandidate,
      };
    }

    const targetLabel = target?.name ?? locationLabel;
    return {
      requestId,
      status: MainCommandStatus.ACTION_READY,
      message: targetLabel
        ? `${toolName}을(를) ${targetLabel}에 사용해볼 수 있습니다.`
        : `${toolName}을(를) 사용해볼 수 있습니다.`,
      actionCandidate,
    };
  }

  private async handleUseItemExplore(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const itemName = this.resolveOwnedItemName(context, dto.itemId);
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );

    if (interpreter.parsed.needsClarification) {
      const targetLabel = target?.name ?? locationLabel ?? "어디에";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${itemName}을(를) ${targetLabel} 어떤 방식으로 활용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${itemName}의 창의적 활용에는 판정이 필요합니다.`,
        checkOptions: this.buildItemExploreCheckOptions(interpreter.parsed.action, itemName, target?.name),
        actionCandidate,
      };
    }

    const targetLabel = target?.name ?? locationLabel;
    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: targetLabel
        ? `${itemName}을(를) ${targetLabel}에 그렇게 활용할 수 있는지 GM 승인이 필요합니다.`
        : `${itemName}을(를) 그렇게 활용할 수 있는지 GM 승인이 필요합니다.`,
      actionCandidate,
    };
  }

  private async handleSplitPartyTask(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 6)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "누가 무엇을 맡을지 조금 더 분명하게 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: "분담 계획은 이해했지만 역할 구분이 아직 모호합니다. 각 인원이 맡을 일을 더 구체적으로 적어주세요.",
        actionCandidate,
      };
    }

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: "이 분담 계획은 판정과 순서 조율이 함께 필요해 GM 승인이 필요합니다.",
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: "파티 분담 계획을 적용하려면 GM 승인이 필요합니다.",
      actionCandidate,
    };
  }

  private async handleCombatManeuver(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "어떤 전투 기동을 시도할지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "이 전투 기동에는 판정이 필요합니다.",
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: "이 전투 기동을 적용하려면 상황 판정과 GM 승인이 필요합니다.",
      actionCandidate,
    };
  }

  private async handleEnvironmentUse(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    if (dto.mapPoint) {
      const doorResult = await this.sessionsService.breakVttDoorAtPoint({
        sessionId: context.sessionId,
        sessionScenarioId: context.sessionScenarioId,
        nodeId: context.currentNodeId,
        mapPoint: dto.mapPoint,
      });

      if (doorResult) {
        return {
          requestId,
          status: doorResult.status,
          message: doorResult.message,
          checkOptions: doorResult.checkOptions,
          data: doorResult.checkEffect ? { checkEffect: doorResult.checkEffect } : null,
          actionCandidate: this.buildActionCandidate(context, dto, dto.playerText),
        };
      }
    }

    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      const targetLabel = target?.name ?? locationLabel ?? "주변 환경";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${targetLabel}을(를) 전투에 어떻게 활용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "환경 활용 시도에는 판정이 필요합니다.",
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const targetLabel = target?.name ?? locationLabel ?? "주변 환경";
    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${targetLabel} 활용은 전장 상태 판정과 GM 승인이 필요합니다.`,
      actionCandidate,
    };
  }

  private async handleImprovisedAttack(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const target = this.resolveEntity(dto, visibleEntities, dto.targetType);
    if (!target) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "즉석 공격 대상을 특정할 수 없습니다. 공개된 적이나 오브젝트를 골라주세요.",
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${target.name}을(를) 어떤 식으로 즉석 공격할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "즉석 공격에는 판정이 필요합니다.",
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${target.name}에 대한 즉석 공격은 상황 판정과 GM 승인이 필요합니다.`,
      actionCandidate,
    };
  }

  private async handleCalledShot(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const target = this.resolveEntity(dto, visibleEntities, dto.targetType);
    if (!target) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "정밀 사격 대상을 특정할 수 없습니다. 공개된 적을 골라주세요.",
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${target.name}의 어느 부위를 어떻게 노릴지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "정밀 사격에는 추가 판정이 필요합니다.",
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${target.name}에 대한 정밀 사격은 상황 판정과 GM 승인이 필요합니다.`,
      actionCandidate,
    };
  }

  private async handleReadyAction(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "어떤 상황이 오면 무엇을 할지 더 분명하게 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: "준비 행동의 발동 조건이 아직 모호합니다. 트리거와 실행 행동을 더 구체적으로 적어주세요.",
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: "준비 행동은 발동 조건과 실행 순서를 함께 확인해야 해서 GM 승인이 필요합니다.",
      checkOptions: interpreter.parsed.action.requiresRoll
        ? this.buildCheckOptions(interpreter.parsed.action)
        : undefined,
      actionCandidate,
    };
  }

  private async handleReactionRequest(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          "어떤 상황에 반응하려는지와 어떤 반응을 하려는지 더 분명하게 적어주세요.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: "반응 조건이나 대응 방식이 아직 모호합니다. 어떤 트리거에 어떤 반응을 하려는지 더 구체적으로 적어주세요.",
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: "반응 행동은 현재 트리거 성립 여부와 실행 순서를 함께 확인해야 해서 GM 승인이 필요합니다.",
      checkOptions: interpreter.parsed.action.requiresRoll
        ? this.buildCheckOptions(interpreter.parsed.action)
        : undefined,
      actionCandidate,
    };
  }

  private async handleUseItemCombat(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const itemName = this.resolveOwnedItemName(context, dto.itemId);
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      const targetLabel = target?.name ?? locationLabel ?? "어디에";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${itemName}을(를) ${targetLabel} 어떻게 전투에 사용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: "전투 아이템 사용 방식이 아직 모호합니다. 대상과 사용 방식을 더 구체적으로 적어주세요.",
        actionCandidate,
      };
    }

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${itemName} 사용에는 전투 판정이 필요합니다.`,
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const targetLabel = target?.name ?? locationLabel;
    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: targetLabel
        ? `${itemName}을(를) ${targetLabel}에 사용하는 것은 전장 상태 확인과 GM 승인이 필요합니다.`
        : `${itemName} 사용은 전장 상태 확인과 GM 승인이 필요합니다.`,
      actionCandidate,
    };
  }

  private async handleUseSpellCreatively(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const spellName = dto.spellId?.trim() || "주문";
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4)),
    );

    if (interpreter.parsed.needsClarification) {
      const targetLabel = target?.name ?? locationLabel ?? "어디에";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${spellName}을(를) ${targetLabel} 어떻게 창의적으로 사용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: "주문 활용 방식이 아직 모호합니다. 대상과 의도를 더 구체적으로 적어주세요.",
        actionCandidate,
      };
    }

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${spellName}의 창의적 사용에는 판정이 필요합니다.`,
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const targetLabel = target?.name ?? locationLabel;
    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: targetLabel
        ? `${spellName}을(를) ${targetLabel}에 그렇게 사용하는 것은 규칙 확인과 GM 승인이 필요합니다.`
        : `${spellName}의 창의적 사용은 규칙 확인과 GM 승인이 필요합니다.`,
      actionCandidate,
    };
  }

  private async handleHint(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    const result = await this.aiService.runHint(
      userId,
      context.sessionId,
      {
        hintLevel: "NORMAL",
        question: dto.playerText,
        sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
        recentLogs: recentLogs.slice(0, 5),
        publicClues,
      },
      { emitSystemMessage: false },
    );

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: result.parsed.content,
    };
  }

  private async handleSummary(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const logs = recentLogs.length ? recentLogs : [`${context.currentNodeTitle}: ${context.currentNodeSceneText}`];
    const result = await this.aiService.runSummary(
      userId,
      context.sessionId,
      {
        summaryType: "player_visible",
        rangeType: "RECENT",
        lastLogCount: Math.min(logs.length, 12),
        nodeId: context.currentNodeId,
        logs,
      },
      { emitSystemMessage: false },
    );

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: result.parsed.content,
    };
  }

  private handleSceneInfo(
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    publicClues: string[],
  ): MainCommandResponseDto {
    const entity = this.resolveEntity(dto, visibleEntities, dto.targetType);
    if (entity) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: `${entity.name}: ${entity.summary}`,
      };
    }

    const clueText = publicClues.length ? ` 공개 단서: ${publicClues.join(" / ")}` : "";
    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${context.currentNodeSceneText}${clueText}`,
    };
  }

  private async handleSceneTransition(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    const candidates = await this.loadTransitionCandidates(context);
    if (!candidates.length) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "현재 화면에서 이동 가능한 다음 노드가 없습니다.",
      };
    }

    const matched = this.matchTransitionCandidate(candidates, dto);
    if (!matched && candidates.length > 1) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `이동 후보를 더 분명히 지정해주세요. 가능한 목적지: ${candidates.map((item) => item.title).join(", ")}`,
      };
    }

    const target = matched ?? candidates[0];
    const conditionResult = this.evaluateTransitionCondition(target, dto, recentLogs, publicClues);
    if (!conditionResult.satisfied) {
      return {
        requestId,
        status: conditionResult.needsReview
          ? MainCommandStatus.GM_APPROVAL_REQUIRED
          : MainCommandStatus.IMPOSSIBLE,
        message: conditionResult.reason,
        data: {
          transitionCondition: target.condition ?? null,
          matchedTerms: conditionResult.matchedTerms,
          missingTerms: conditionResult.missingTerms,
        },
      };
    }

    await this.applySceneTransition(context, target.nodeId);

    const snapshot = await this.sessionsService.buildSnapshot(context.sessionId);
    this.realtimeEvents.emitSessionSnapshot(context.sessionId, snapshot);

    return {
      requestId,
      status: MainCommandStatus.RESOLVED,
      message: `${target.title} 화면으로 이동했습니다.`,
      data: {
        transitionCondition: target.condition ?? null,
        transitionLabel: target.label ?? null,
        conditionMatchedTerms: conditionResult.matchedTerms,
      },
      statePatch: {
        currentNodeId: target.nodeId,
        nodeType: target.nodeType,
        phase: this.toPhaseForNodeType(target.nodeType),
      },
    };
  }

  private async handleTacticQuery(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    const result = await this.aiService.runHint(
      userId,
      context.sessionId,
      {
        hintLevel: "NORMAL",
        question: dto.playerText,
        sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
        recentLogs: recentLogs.slice(0, 5),
        publicClues,
      },
      { emitSystemMessage: false },
    );

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: result.parsed.content,
    };
  }

  private async handleRuleQuery(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities),
    );
    const matchingRules = this.loadRuleFragments().filter((fragment) =>
      interpreter.parsed.requiredRuleCheckIds?.includes(fragment.id),
    );

    if (!matchingRules.length) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          "지금 질문에서 바로 연결할 규칙 조각을 찾지 못했습니다. 행동, 대상, 주문 이름을 조금 더 구체적으로 적어주세요.",
      };
    }

    const relatedIntentText = dto.relatedIntent ? `관련 명령: ${dto.relatedIntent}. ` : "";
    const lines = matchingRules
      .slice(0, 3)
      .map((fragment) => `${fragment.titleKo}: ${fragment.summaryKo}`);

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${relatedIntentText}${lines.join(" / ")}`,
    };
  }

  private buildInterpreterPayload(
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs?: string[],
  ) {
    const resolvedTarget = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;

    return {
      rawText: dto.playerText,
      actorCharacterId: context.actorCharacterId,
      sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
      recentLogs,
      availableTargets: visibleEntities.map((entity) => entity.id),
      availableTargetDetails: visibleEntities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        summary: entity.summary,
        disposition: entity.disposition,
      })),
      requestIntent: dto.intent,
      screenType: dto.screenType,
      targetId: dto.targetId ?? null,
      targetType: dto.targetType ?? resolvedTarget?.kind ?? null,
      itemId: dto.itemId ?? null,
      spellId: dto.spellId ?? null,
      mapPoint: dto.mapPoint ?? null,
      relatedIntent: dto.relatedIntent ?? null,
    };
  }

  private loadRuleFragments(): RuleFragmentSummary[] {
    if (this.ruleFragmentsCache) {
      return this.ruleFragmentsCache;
    }

    const candidatePaths = [
      join(process.cwd(), "ai", "generated", "srd", "rule_fragments.jsonl"),
      join(process.cwd(), "..", "ai", "generated", "srd", "rule_fragments.jsonl"),
    ];
    const ruleFragmentsPath = candidatePaths.find((candidate) => existsSync(candidate));
    if (!ruleFragmentsPath) {
      this.ruleFragmentsCache = [];
      return this.ruleFragmentsCache;
    }

    const content = readFileSync(ruleFragmentsPath, "utf8");
    this.ruleFragmentsCache = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => Boolean(line))
      .map((line) => {
        const parsed = this.parseJson<Record<string, unknown> | null>(line, null);
        const id = parsed ? this.readString(parsed.id) : null;
        const titleKo = parsed ? this.readString(parsed.titleKo) : null;
        const summaryKo = parsed ? this.readString(parsed.summaryKo) : null;
        if (!id || !titleKo || !summaryKo) {
          return null;
        }
        return {
          id,
          titleKo,
          summaryKo,
        };
      })
      .filter((item): item is RuleFragmentSummary => Boolean(item));

    return this.ruleFragmentsCache;
  }

  private buildCheckOptions(action: {
    ability?: string | null;
    skill?: string | null;
    approach: string;
    suggestedDifficulty?: string | null;
  }): MainCommandCheckOptionDto[] {
    if (!action.ability && !action.skill) {
      return [
        {
          reason: action.approach,
        },
      ];
    }

    return [
      {
        ...(action.ability ? { ability: action.ability } : {}),
        ...(action.skill ? { skill: action.skill } : {}),
        reason: action.suggestedDifficulty
          ? `${action.approach} (난이도 제안: ${action.suggestedDifficulty})`
          : action.approach,
      },
    ];
  }

  private buildPersuasionCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
    npcName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "cha",
        skill: "persuasion",
        reason: action.suggestedDifficulty
          ? `${npcName} 설득 (난이도 제안: ${action.suggestedDifficulty})`
          : `${npcName} 설득`,
      },
    ];
  }

  private buildIntimidationCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
    npcName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "cha",
        skill: "intimidation",
        reason: action.suggestedDifficulty
          ? `${npcName} 압박 (난이도 제안: ${action.suggestedDifficulty})`
          : `${npcName} 압박`,
      },
    ];
  }

  private buildDeceptionCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
    npcName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "cha",
        skill: "deception",
        reason: action.suggestedDifficulty
          ? `${npcName} 속이기(난이도 제안: ${action.suggestedDifficulty})`
          : `${npcName} 속이기`,
      },
    ];
  }

  private buildInsightCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
    npcName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "wis",
        skill: "insight",
        reason: action.suggestedDifficulty
          ? `${npcName} 감정 읽기 (난이도 제안: ${action.suggestedDifficulty})`
          : `${npcName} 감정 읽기`,
      },
    ];
  }

  private buildInvestigationCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
    objectName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "int",
        skill: "investigation",
        reason: action.suggestedDifficulty
          ? `${objectName} 조사 (난이도 제안: ${action.suggestedDifficulty})`
          : `${objectName} 조사`,
      },
    ];
  }

  private buildPerceptionCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "wis",
        skill: "perception",
        reason: action.suggestedDifficulty
          ? `주변 관찰 (난이도 제안: ${action.suggestedDifficulty})`
          : "주변 관찰",
      },
    ];
  }

  private buildDangerDetectionCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "wis",
        skill: "perception",
        reason: action.suggestedDifficulty
          ? `위험 감지 (난이도 제안: ${action.suggestedDifficulty})`
          : "위험 감지",
      },
    ];
  }

  private buildSpecialMoveCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "str",
        skill: "athletics",
        reason: action.suggestedDifficulty
          ? `특수 이동 (난이도 제안: ${action.suggestedDifficulty})`
          : "특수 이동",
      },
      {
        ability: "dex",
        skill: "acrobatics",
        reason: action.suggestedDifficulty
          ? `특수 이동 대안(난이도 제안: ${action.suggestedDifficulty})`
          : "특수 이동 대안",
      },
    ];
  }

  private buildObjectInteractionCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
    objectName: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: "dex",
        skill: "sleight_of_hand",
        reason: action.suggestedDifficulty
          ? `${objectName} 조작 (난이도 제안: ${action.suggestedDifficulty})`
          : `${objectName} 조작`,
      },
    ];
  }

  private buildToolUseCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
    toolName: string,
    targetName?: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    const reasonTarget = targetName ? ` ${targetName}에` : "";

    return [
      {
        ability: "dex",
        skill: "sleight_of_hand",
        reason: action.suggestedDifficulty
          ? `${toolName}${reasonTarget} 사용 (난이도 제안: ${action.suggestedDifficulty})`
          : `${toolName}${reasonTarget} 사용`,
      },
    ];
  }

  private buildItemExploreCheckOptions(
    action: {
      ability?: string | null;
      skill?: string | null;
      approach: string;
      suggestedDifficulty?: string | null;
    },
    itemName: string,
    targetName?: string,
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    const reasonTarget = targetName ? ` ${targetName}에` : "";

    return [
      {
        ability: "dex",
        skill: "sleight_of_hand",
        reason: action.suggestedDifficulty
          ? `${itemName}${reasonTarget} 창의적 활용 (난이도 제안: ${action.suggestedDifficulty})`
          : `${itemName}${reasonTarget} 창의적 활용`,
      },
    ];
  }

  private resolveOwnedItemName(context: LoadedContext, itemId?: string | null): string {
    if (!itemId) {
      return "도구";
    }

    const normalized = itemId.trim().toLowerCase();
    const matched = context.inventoryItems.find((item) =>
      [item.id, item.itemDefinitionId, item.name]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase())
        .includes(normalized),
    );

    return matched?.name ?? itemId;
  }

  private buildActionCandidate(
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    actionSummary: string,
  ): MainCommandActionCandidateDto {
    return {
      actorId: context.actorCharacterId,
      targetId: dto.targetId ?? null,
      actionSummary,
      declaredMethod: dto.playerText,
    };
  }

  private async persistResult(
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    response: MainCommandResponseDto,
  ) {
    const outcome = this.toActionOutcome(response);
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: context.sessionId,
      sessionScenarioId: context.sessionScenarioId,
      actorUserId: userId,
      sessionCharacterId: context.sessionCharacterId,
      rawInput: dto.playerText.trim(),
      structuredAction: {
        type: "main_command",
        commandId: dto.commandId,
        category: dto.category,
        intent: dto.intent,
        screenType: dto.screenType,
        targetId: dto.targetId ?? null,
        targetType: dto.targetType ?? null,
        itemId: dto.itemId ?? null,
        spellId: dto.spellId ?? null,
        status: response.status,
        checkOptions: response.checkOptions ?? [],
        actionCandidate: response.actionCandidate ?? null,
        data: response.data ?? null,
      },
      outcome,
      narration: response.message,
      stateDiff: response.statePatch ?? null,
    });

    this.realtimeEvents.emitTurnLogCreated(context.sessionId, turnLog);
    return turnLog;
  }

  private toActionOutcome(response: MainCommandResponseDto): ActionOutcome {
    return response.status === MainCommandStatus.IMPOSSIBLE
      ? ActionOutcome.IMPOSSIBLE
      : response.status === MainCommandStatus.RESOLVED
        ? ActionOutcome.SUCCESS
        : ActionOutcome.NO_ROLL;
  }

  private parseVttDoorCheckEffect(value: Record<string, unknown>): VttDoorCheckEffect | null {
    const type = value.type;
    const doorId = value.doorId;
    const effect = value.effect;
    const nodeId = value.nodeId;
    const mapPoint = value.mapPoint;
    if (
      type !== "vttDoor" ||
      typeof doorId !== "string" ||
      typeof nodeId !== "string" ||
      (effect !== "open" && effect !== "broken") ||
      !mapPoint ||
      typeof mapPoint !== "object"
    ) {
      return null;
    }
    const point = mapPoint as Record<string, unknown>;
    if (typeof point.x !== "number" || typeof point.y !== "number") {
      return null;
    }
    return {
      type,
      doorId,
      effect,
      nodeId,
      mapPoint: { x: point.x, y: point.y },
    };
  }

  private extractVisibleSceneEntities(nodeMetaJson: string | null): VisibleSceneEntity[] {
    const nodeMeta = this.parseJson<Record<string, unknown> | null>(nodeMetaJson, null);
    if (!nodeMeta) {
      return [];
    }

    return [
      ...this.normalizeEntities(nodeMeta.npcs, MainCommandTargetType.NPC),
      ...this.normalizeEntities(nodeMeta.objects, MainCommandTargetType.OBJECT),
      ...this.normalizeEntities(nodeMeta.items, MainCommandTargetType.OBJECT),
      ...this.normalizeEntities(nodeMeta.areas, MainCommandTargetType.AREA),
    ];
  }

  private normalizeEntities(value: unknown, kind: MainCommandTargetType): VisibleSceneEntity[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const id = this.readString(record.id);
        const name = this.readString(record.name) ?? this.readString(record.title);
        const isVisible = record.isVisible !== false;
        if (!id || !name || !isVisible) {
          return null;
        }

        return {
          id,
          name,
          summary:
            this.readString(record.shortDescription) ??
            this.readString(record.description) ??
            this.readString(record.summary) ??
            name,
          disposition: this.readString(record.disposition) ?? "neutral",
          kind,
        };
      })
      .filter((entry): entry is VisibleSceneEntity => Boolean(entry));
  }

  private resolveEntity(
    dto: SubmitMainCommandDto,
    entities: VisibleSceneEntity[],
    preferredType?: MainCommandTargetType,
  ): VisibleSceneEntity | null {
    const filtered =
      preferredType && preferredType !== MainCommandTargetType.POINT && preferredType !== MainCommandTargetType.SELF
        ? entities.filter((entity) => entity.kind === preferredType)
        : entities;

    if (!filtered.length) {
      return null;
    }

    if (dto.targetId) {
      const normalizedTargetId = dto.targetId.trim().toLowerCase();
      const matchedById = filtered.find((entity) => entity.id.trim().toLowerCase() === normalizedTargetId);
      if (matchedById) {
        return matchedById;
      }
    }

    const normalizedText = dto.playerText.trim().toLowerCase();
    const matchedByText = filtered.find((entity) => normalizedText.includes(entity.name.trim().toLowerCase()));
    if (matchedByText) {
      return matchedByText;
    }

    return filtered.length === 1 ? filtered[0] : null;
  }

  private extractPublicClueSummaries(cluesJson: string): string[] {
    const clues = this.parseJson<Record<string, unknown>[]>(cluesJson, []);
    return clues
      .map((clue) => {
        const title = this.readString(clue.title);
        const text = this.readString(clue.handoutText) ?? this.readString(clue.playerText);
        if (!title || !text) {
          return null;
        }
        return `${title}: ${text}`;
      })
      .filter((entry): entry is string => Boolean(entry));
  }

  private async loadRecentLogLines(sessionId: string): Promise<string[]> {
    const rows = await this.prisma.turnLog.findMany({
      where: { sessionId },
      orderBy: { turnNumber: "desc" },
      take: 12,
    });

    return rows
      .slice()
      .reverse()
      .map((row) => {
        const parts = [row.rawInput, row.narration].filter((value): value is string => Boolean(value));
        return parts.join(" => ").trim();
      })
      .filter((line) => Boolean(line));
  }

  private async loadTransitionCandidates(context: LoadedContext): Promise<TransitionCandidate[]> {
    const transitions = this.parseJson<Record<string, unknown>[]>(context.currentNodeTransitionsJson, []);
    const candidateStubs: Array<Omit<TransitionCandidate, "title" | "nodeType">> = [];
    for (const transition of transitions) {
      const nextNodeId = this.readString(transition.nextNodeId);
      if (nextNodeId) {
        candidateStubs.push({
          transitionId: this.readString(transition.id),
          label: this.readString(transition.label),
          condition: this.readString(transition.condition),
          note: this.readString(transition.note),
          nodeId: nextNodeId,
          isFallback: false,
        });
      }
    }
    const hasFallbackTarget = candidateStubs.some((candidate) => candidate.nodeId === context.currentNodeFallbackNodeId);
    if (context.currentNodeFallbackNodeId && !hasFallbackTarget) {
      candidateStubs.push({
        transitionId: null,
        label: "기본 이동",
        condition: "default",
        note: null,
        nodeId: context.currentNodeFallbackNodeId,
        isFallback: true,
      });
    }

    if (!candidateStubs.length) {
      return [];
    }

    const nodes = await this.prisma.sessionScenarioNode.findMany({
      where: {
        sessionScenarioId: context.sessionScenarioId,
        nodeId: { in: Array.from(new Set(candidateStubs.map((candidate) => candidate.nodeId))) },
      },
      select: {
        nodeId: true,
        title: true,
        nodeType: true,
      },
    });

    const nodeByNodeId = new Map(nodes.map((node) => [node.nodeId, node]));
    return candidateStubs
      .map((candidate) => {
        const node = nodeByNodeId.get(candidate.nodeId);
        if (!node) {
          return null;
        }
        return {
          ...candidate,
          title: node.title,
          nodeType: this.toScenarioNodeType(node.nodeType),
        };
      })
      .filter((candidate): candidate is TransitionCandidate => Boolean(candidate));
  }

  private matchTransitionCandidate(
    candidates: TransitionCandidate[],
    dto: SubmitMainCommandDto,
  ): TransitionCandidate | null {
    if (dto.targetId) {
      const normalizedTargetId = dto.targetId.trim().toLowerCase();
      const direct = candidates.find((candidate) =>
        [candidate.nodeId, candidate.transitionId, candidate.label]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.trim().toLowerCase() === normalizedTargetId),
      );
      if (direct) {
        return direct;
      }
    }

    const normalizedText = dto.playerText.trim().toLowerCase();
    return (
      candidates.find((candidate) =>
        [candidate.title, candidate.label, candidate.condition]
          .filter((value): value is string => Boolean(value))
          .some((value) => normalizedText.includes(value.trim().toLowerCase())),
      ) ??
      null
    );
  }

  private evaluateTransitionCondition(
    candidate: TransitionCandidate,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ): TransitionConditionEvaluation {
    const condition = candidate.condition?.trim() ?? "";
    if (this.isAutoTransitionCondition(condition)) {
      return {
        satisfied: true,
        needsReview: false,
        reason: "조건 없이 이동 가능한 연결입니다.",
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const normalizedCondition = this.normalizeTransitionConditionText(condition);
    const evidenceText = this.normalizeTransitionConditionText(
      [
        dto.playerText,
        ...recentLogs.slice(-8),
        ...publicClues,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" "),
    );

    if (normalizedCondition && evidenceText.includes(normalizedCondition)) {
      return {
        satisfied: true,
        needsReview: false,
        reason: "장면 진행 조건을 만족했습니다.",
        matchedTerms: [condition],
        missingTerms: [],
      };
    }

    const conditionTerms = this.extractTransitionConditionTerms(condition);
    if (!conditionTerms.length) {
      return {
        satisfied: false,
        needsReview: true,
        reason: `장면 이동 조건 "${condition}"을 자동으로 판정하기 어렵습니다. GM 확인이 필요합니다.`,
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const matchedTerms = conditionTerms.filter((term) => evidenceText.includes(term));
    const missingTerms = conditionTerms.filter((term) => !evidenceText.includes(term));
    const requiredMatchCount =
      conditionTerms.length <= 3 ? conditionTerms.length : Math.ceil(conditionTerms.length * 0.7);

    if (matchedTerms.length >= requiredMatchCount) {
      return {
        satisfied: true,
        needsReview: false,
        reason: "장면 진행 조건을 만족했습니다.",
        matchedTerms,
        missingTerms,
      };
    }

    if (matchedTerms.length > 0) {
      return {
        satisfied: false,
        needsReview: true,
        reason: `장면 이동 조건 "${condition}"을 일부만 확인했습니다. 부족한 단서: ${missingTerms.join(", ")}`,
        matchedTerms,
        missingTerms,
      };
    }

    return {
      satisfied: false,
      needsReview: false,
      reason: `아직 장면 이동 조건을 만족하지 못했습니다. 필요한 조건: ${condition}`,
      matchedTerms,
      missingTerms,
    };
  }

  private isAutoTransitionCondition(condition: string): boolean {
    return AUTO_TRANSITION_CONDITIONS.has(this.normalizeTransitionConditionText(condition));
  }

  private normalizeTransitionConditionText(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractTransitionConditionTerms(condition: string): string[] {
    const seen = new Set<string>();
    return this.normalizeTransitionConditionText(condition)
      .split(" ")
      .map((term) => this.stripKoreanCaseMarker(term))
      .filter((term) => term.length >= 2)
      .filter((term) => !TRANSITION_CONDITION_STOP_WORDS.has(term))
      .filter((term) => {
        if (seen.has(term)) {
          return false;
        }
        seen.add(term);
        return true;
      });
  }

  private stripKoreanCaseMarker(term: string): string {
    return term
      .replace(/(했으면|했을|했다|한다|했고|하고|하기|되었으면|되었을|되었다|되면|었으면|았으면|었을|았을|었다|았다|으면)$/u, "")
      .replace(/(으로는|으로서|으로써|에서|에게|부터|까지|처럼|보다|으로|로|은|는|이|가|을|를|에|의|도|만|와|과)$/u, "");
  }

  private async applySceneTransition(context: LoadedContext, targetNodeId: string): Promise<void> {
    const targetNode = await this.prisma.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: context.sessionScenarioId,
          nodeId: targetNodeId,
        },
      },
      select: {
        id: true,
        nodeId: true,
        nodeType: true,
        checkOptionsJson: true,
      },
    });

    if (!targetNode) {
      throw badRequest("MAIN_COMMAND_400", "이동 대상 노드를 찾을 수 없습니다.", {
        reason: "TRANSITION_TARGET_NOT_FOUND",
      });
    }

    const currentState = await this.prisma.gameState.findUnique({
      where: { sessionScenarioId: context.sessionScenarioId },
      select: { flagsJson: true },
    });
    const flags = this.parseJson<Record<string, unknown>>(currentState?.flagsJson, {});
    const targetDefaultMap = this.extractVttMapFromCheckOptions(targetNode.checkOptionsJson);

    await this.prisma.$transaction(async (tx) => {
      await tx.gameState.update({
        where: { sessionScenarioId: context.sessionScenarioId },
        data: {
          version: { increment: 1 },
          currentNodeId: targetNode.nodeId,
          phase: this.toPhaseForNodeType(this.toScenarioNodeType(targetNode.nodeType)),
          flagsJson: JSON.stringify({
            ...flags,
            ...(targetDefaultMap ? { vttMap: targetDefaultMap } : {}),
          }),
        },
      });

      await tx.sessionNodeVisit.upsert({
        where: {
          sessionScenarioId_nodeId: {
            sessionScenarioId: context.sessionScenarioId,
            nodeId: targetNode.nodeId,
          },
        },
        create: {
          sessionScenarioId: context.sessionScenarioId,
          sessionScenarioNodeId: targetNode.id,
          nodeId: targetNode.nodeId,
        },
        update: {
          sessionScenarioNodeId: targetNode.id,
          visitCount: { increment: 1 },
        },
      });
    });
  }

  private extractVttMapFromCheckOptions(value: string): Record<string, unknown> | null {
    const parsed = this.parseJson<unknown>(value, []);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return null;
    }

    const vttMap = (parsed as Record<string, unknown>).vttMap;
    if (!vttMap || typeof vttMap !== "object" || Array.isArray(vttMap)) {
      return null;
    }

    return vttMap as Record<string, unknown>;
  }

  private toMainScreenType(nodeType: string): MainCommandScreenType {
    switch (this.toScenarioNodeType(nodeType)) {
      case ScenarioNodeType.EXPLORATION:
        return MainCommandScreenType.EXPLORATION;
      case ScenarioNodeType.COMBAT:
        return MainCommandScreenType.COMBAT;
      case ScenarioNodeType.STORY:
      default:
        return MainCommandScreenType.STORY;
    }
  }

  private toScenarioNodeType(nodeType: string): ScenarioNodeType {
    switch (nodeType) {
      case ScenarioNodeType.EXPLORATION:
        return ScenarioNodeType.EXPLORATION;
      case ScenarioNodeType.COMBAT:
        return ScenarioNodeType.COMBAT;
      case ScenarioNodeType.STORY:
      default:
        return ScenarioNodeType.STORY;
    }
  }

  private toPhaseForNodeType(nodeType: ScenarioNodeType): PrismaGamePhase {
    switch (nodeType) {
      case ScenarioNodeType.EXPLORATION:
        return PrismaGamePhase.EXPLORATION;
      case ScenarioNodeType.COMBAT:
        return PrismaGamePhase.COMBAT;
      case ScenarioNodeType.STORY:
      default:
        return PrismaGamePhase.DIALOGUE;
    }
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
