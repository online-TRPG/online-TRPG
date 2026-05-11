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

const INTERPRETER_INTENTS = new Set<MainCommandIntent>([
  MainCommandIntent.SOCIAL_PERSUADE,
  MainCommandIntent.SOCIAL_INTIMIDATE,
  MainCommandIntent.SOCIAL_DECEIVE,
  MainCommandIntent.READ_EMOTION,
  MainCommandIntent.INSPECT_STORY_OBJECT,
  MainCommandIntent.DECLARE_RP_ACTION,
  MainCommandIntent.OBSERVE_AREA,
  MainCommandIntent.INVESTIGATE_OBJECT,
  MainCommandIntent.LISTEN,
  MainCommandIntent.DETECT_DANGER,
  MainCommandIntent.SPECIAL_MOVE,
  MainCommandIntent.INTERACT_OBJECT,
  MainCommandIntent.USE_TOOL,
  MainCommandIntent.USE_ITEM_EXPLORE,
  MainCommandIntent.SPLIT_PARTY_TASK,
  MainCommandIntent.COMBAT_MANEUVER,
  MainCommandIntent.ENVIRONMENT_USE,
  MainCommandIntent.IMPROVISED_ATTACK,
  MainCommandIntent.CALLED_SHOT,
  MainCommandIntent.READY_ACTION,
  MainCommandIntent.REACTION_REQUEST,
  MainCommandIntent.USE_ITEM_COMBAT,
  MainCommandIntent.USE_SPELL_CREATIVELY,
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
    requiresTargetTypes: [MainCommandTargetType.OBJECT],
  },
  [MainCommandIntent.USE_TOOL]: {
    requiresItem: true,
    allowsTargetTypes: [MainCommandTargetType.OBJECT, MainCommandTargetType.AREA, MainCommandTargetType.POINT],
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
        response = await this.handleSceneTransition(requestId, userId, context, dto);
        break;
      case MainCommandIntent.TACTIC_QUERY:
        response = await this.handleTacticQuery(requestId, userId, context, dto, recentLogs, publicClues);
        break;
      case MainCommandIntent.ASK_RULE:
        response = await this.handleRuleQuery(requestId, userId, context, dto, visibleEntities);
        break;
      default:
        if (INTERPRETER_INTENTS.has(dto.intent)) {
          response = await this.handleInterpreterCommand(
            requestId,
            userId,
            context,
            dto,
            visibleEntities,
          );
          break;
        }
        response = {
          requestId,
          status: MainCommandStatus.IMPOSSIBLE,
          message: "아직 처리되지 않은 메인 명령입니다.",
        };
        break;
    }

    await this.persistResult(userId, context, dto, response);
    return response;
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
      (dto.intent === MainCommandIntent.INVESTIGATE_OBJECT || dto.intent === MainCommandIntent.ENVIRONMENT_USE) &&
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
        throw badRequest("MAIN_COMMAND_400", "현재 장면에서 보이는 대상만 지정할 수 있습니다.", {
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
        message: "대화할 NPC를 특정할 수 없습니다. 장면에 보이는 NPC를 더 분명히 적어주세요.",
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
          "누구에게 어떤 식으로 말을 거는지 조금 더 구체적으로 적어주세요.",
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
        message: `${actionSummary}에 판정이 필요합니다.`,
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    if (APPROVAL_INTENTS.has(dto.intent)) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${actionSummary}은(는) 상황 승인 또는 추가 검증이 필요합니다.`,
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    return this.handleNpcDialogue(requestId, userId, context, dto, visibleEntities, recentLogs);
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
  ): Promise<MainCommandResponseDto> {
    const candidates = await this.loadTransitionCandidates(context);
    if (!candidates.length) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "현재 장면에서 이동 가능한 다음 노드가 없습니다.",
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
    await this.applySceneTransition(context, target.nodeId);

    const snapshot = await this.sessionsService.buildSnapshot(context.sessionId);
    this.realtimeEvents.emitSessionSnapshot(context.sessionId, snapshot);

    return {
      requestId,
      status: MainCommandStatus.RESOLVED,
      message: `${target.title} 장면으로 이동했습니다.`,
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

  private async handleInterpreterCommand(
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
          "대상을 조금 더 분명히 적어주시면 처리할 수 있습니다.",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      interpreter.parsed.action.type ||
      dto.playerText;
    const checkOptions = this.buildCheckOptions(interpreter.parsed.action);

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${actionSummary}에 판정이 필요합니다.`,
        checkOptions,
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    if (APPROVAL_INTENTS.has(dto.intent)) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${actionSummary}은(는) 상황 승인 또는 추가 검증이 필요합니다.`,
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    if (dto.intent === MainCommandIntent.INTERACT_OBJECT || dto.intent === MainCommandIntent.USE_TOOL) {
      return {
        requestId,
        status: MainCommandStatus.ACTION_READY,
        message: `${actionSummary}을(를) 시도할 수 있습니다.`,
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${actionSummary} 요청을 기록했습니다.`,
      actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
    };
  }

  private buildInterpreterPayload(
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ) {
    const resolvedTarget = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;

    return {
      rawText: dto.playerText,
      actorCharacterId: context.actorCharacterId,
      sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
      availableTargets: visibleEntities.map((entity) => entity.id),
      availableTargetDetails: visibleEntities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        summary: entity.summary,
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
  ): Promise<void> {
    const outcome =
      response.status === MainCommandStatus.IMPOSSIBLE
        ? ActionOutcome.IMPOSSIBLE
        : response.status === MainCommandStatus.RESOLVED
          ? ActionOutcome.SUCCESS
          : ActionOutcome.NO_ROLL;

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
      },
      outcome,
      narration: response.message,
      stateDiff: response.statePatch ?? null,
    });

    this.realtimeEvents.emitTurnLogCreated(context.sessionId, turnLog);
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

  private async loadTransitionCandidates(context: LoadedContext): Promise<
    Array<{ nodeId: string; title: string; nodeType: ScenarioNodeType }>
  > {
    const transitions = this.parseJson<Record<string, unknown>[]>(context.currentNodeTransitionsJson, []);
    const candidateNodeIds = new Set<string>();
    for (const transition of transitions) {
      const nextNodeId = this.readString(transition.nextNodeId);
      if (nextNodeId) {
        candidateNodeIds.add(nextNodeId);
      }
    }
    if (context.currentNodeFallbackNodeId) {
      candidateNodeIds.add(context.currentNodeFallbackNodeId);
    }

    if (!candidateNodeIds.size) {
      return [];
    }

    const nodes = await this.prisma.sessionScenarioNode.findMany({
      where: {
        sessionScenarioId: context.sessionScenarioId,
        nodeId: { in: Array.from(candidateNodeIds) },
      },
      select: {
        nodeId: true,
        title: true,
        nodeType: true,
      },
    });

    return nodes.map((node) => ({
      nodeId: node.nodeId,
      title: node.title,
      nodeType: this.toScenarioNodeType(node.nodeType),
    }));
  }

  private matchTransitionCandidate(
    candidates: Array<{ nodeId: string; title: string; nodeType: ScenarioNodeType }>,
    dto: SubmitMainCommandDto,
  ): { nodeId: string; title: string; nodeType: ScenarioNodeType } | null {
    if (dto.targetId) {
      const normalizedTargetId = dto.targetId.trim().toLowerCase();
      const direct = candidates.find((candidate) => candidate.nodeId.trim().toLowerCase() === normalizedTargetId);
      if (direct) {
        return direct;
      }
    }

    const normalizedText = dto.playerText.trim().toLowerCase();
    return (
      candidates.find((candidate) => normalizedText.includes(candidate.title.trim().toLowerCase())) ??
      null
    );
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
