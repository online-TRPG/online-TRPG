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
        response = await this.handleSceneTransition(requestId, userId, context, dto);
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
      throw badRequest("MAIN_COMMAND_400", "AI GM ?몄뀡?먯꽌留?硫붿씤 紐낅졊???ъ슜?????덉뒿?덈떎.", {
        reason: "AI_GM_ONLY",
      });
    }

    if (session.status !== PrismaSessionStatus.PLAYING) {
      throw forbidden("MAIN_COMMAND_403", "?몄뀡??吏꾪뻾 以묒씪 ?뚮쭔 硫붿씤 紐낅졊???ъ슜?????덉뒿?덈떎.", {
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
      throw forbidden("MAIN_COMMAND_403", "?꾩옱 ?몄뀡 李멸??먮쭔 硫붿씤 紐낅졊???ъ슜?????덉뒿?덈떎.", {
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
      throw forbidden("MAIN_COMMAND_403", "罹먮┃?곕? ?좏깮????硫붿씤 紐낅졊???ъ슜?댁＜?몄슂.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (![sessionCharacter.id, sessionCharacter.characterId].includes(dto.actorId)) {
      throw forbidden("MAIN_COMMAND_403", "?좏깮??罹먮┃?곗? ?붿껌 actorId媛 ?쇱튂?섏? ?딆뒿?덈떎.", {
        reason: "ACTOR_MISMATCH",
      });
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    if (!state.currentNodeId) {
      throw badRequest("MAIN_COMMAND_400", "?꾩옱 吏꾪뻾 以묒씤 ?몃뱶媛 ?놁뒿?덈떎.", {
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
      throw badRequest("MAIN_COMMAND_400", "?꾩옱 ?몃뱶 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.", {
        reason: "CURRENT_NODE_NOT_FOUND",
      });
    }

    const expectedScreenType = this.toMainScreenType(currentNode.nodeType);
    if (dto.screenType !== expectedScreenType) {
      throw badRequest("MAIN_COMMAND_400", "?꾩옱 ?몃뱶 ?붾㈃ ??낃낵 ?붿껌 screenType???쇱튂?섏? ?딆뒿?덈떎.", {
        reason: "SCREEN_TYPE_MISMATCH",
      });
    }

    if (dto.nodeId && dto.nodeId !== currentNode.nodeId) {
      throw badRequest("MAIN_COMMAND_400", "?붿껌 nodeId媛 ?꾩옱 吏꾪뻾 以묒씤 ?몃뱶? ?ㅻ쫭?덈떎.", {
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
      throw badRequest("MAIN_COMMAND_400", "?대떦 ?꾩씠?쒖? ?꾩옱 罹먮┃?곌? 蹂댁쑀?섍퀬 ?덉? ?딆뒿?덈떎.", {
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
      throw badRequest("MAIN_COMMAND_400", "??紐낅졊? ?ъ슜???꾩씠?쒖쓣 ?④퍡 吏?뺥빐???⑸땲??", {
        reason: "ITEM_ID_REQUIRED",
        intent: dto.intent,
      });
    }

    if (requirement.requiresSpell && !dto.spellId) {
      throw badRequest("MAIN_COMMAND_400", "??紐낅졊? ?ъ슜??二쇰Ц???④퍡 吏?뺥빐???⑸땲??", {
        reason: "SPELL_ID_REQUIRED",
        intent: dto.intent,
      });
    }

    if (requirement.requiresMapPoint && !dto.mapPoint) {
      throw badRequest("MAIN_COMMAND_400", "??紐낅졊? 吏??醫뚰몴瑜??④퍡 吏?뺥빐???⑸땲??", {
        reason: "MAP_POINT_REQUIRED",
        intent: dto.intent,
      });
    }

    if (dto.targetType) {
      const allowedTargetTypes = requirement.requiresTargetTypes ?? requirement.allowsTargetTypes ?? [];
      if (allowedTargetTypes.length && !allowedTargetTypes.includes(dto.targetType)) {
        throw badRequest("MAIN_COMMAND_400", "??紐낅졊??留욎? ?딅뒗 ???醫낅쪟?낅땲??", {
          reason: "TARGET_TYPE_INVALID",
          intent: dto.intent,
          targetType: dto.targetType,
        });
      }
    }

    if (requirement.requiresTargetTypes && !dto.targetId) {
      throw badRequest("MAIN_COMMAND_400", "??紐낅졊? ??곸쓣 ?④퍡 吏?뺥빐???⑸땲??", {
        reason: "TARGET_ID_REQUIRED",
        intent: dto.intent,
      });
    }

    if (
      (dto.intent === MainCommandIntent.INVESTIGATE_OBJECT || dto.intent === MainCommandIntent.ENVIRONMENT_USE) &&
      !dto.targetId &&
      !dto.mapPoint
    ) {
      throw badRequest("MAIN_COMMAND_400", "??紐낅졊? 議곗궗 ????먮뒗 吏??醫뚰몴媛 ?꾩슂?⑸땲??", {
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
        throw badRequest("MAIN_COMMAND_400", "?꾩옱 ?λ㈃?먯꽌 蹂댁씠????곷쭔 吏?뺥븷 ???덉뒿?덈떎.", {
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
        message: "??뷀븷 NPC瑜??뱀젙?????놁뒿?덈떎. ?λ㈃??蹂댁씠??NPC瑜???遺꾨챸???곸뼱二쇱꽭??",
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
          "?꾧뎄?먭쾶 ?대뼡 ?앹쑝濡?留먯쓣 嫄곕뒗吏 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??",
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
        message: `${actionSummary}???먯젙???꾩슂?⑸땲??`,
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    if (APPROVAL_INTENTS.has(dto.intent)) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${actionSummary}?(?? ?곹솴 ?뱀씤 ?먮뒗 異붽? 寃利앹씠 ?꾩슂?⑸땲??`,
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
        message: "?ㅻ뱷??NPC瑜??뱀젙?????놁뒿?덈떎. 怨듦컻?????以??꾧뎄瑜??ㅻ뱷?섎뒗吏 怨⑤씪二쇱꽭??",
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
          `${npc.name}??瑜? ?대뼡 洹쇨굅濡??ㅻ뱷?섎젮?붿? 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??`,
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
        message: `${npc.name} ?ㅻ뱷?먮뒗 ?먯젙???꾩슂?⑸땲??`,
        checkOptions: this.buildPersuasionCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (normalizedDisposition === "hostile" && confidence < 0.65) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${npc.name}?(?? ?꾩옱 ?곷??곸씠?????ㅻ뱷? 諛붾줈 諛쏆븘?ㅼ뿬吏湲??대졄?듬땲?? ??媛뺥븳 洹쇨굅, ?媛, ?먮뒗 ?곹솴 蹂?붽? ?꾩슂?⑸땲??`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${npc.name} ?ㅻ뱷? ?곹솴 ?먮떒?????꾩슂?⑸땲?? ?쒖떆??洹쇨굅? ?꾩옱 遺꾩쐞湲곕? 蹂닿퀬 GM ?뱀씤 ?먮뒗 異붽? ?먯젙??寃곗젙?⑸땲??`,
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
        message: "?묐컯??NPC瑜??뱀젙?????놁뒿?덈떎. 怨듦컻?????以??꾧뎄瑜??뺣컯?섎뒗吏 怨⑤씪二쇱꽭??",
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
          `${npc.name}?먭쾶 ?대뼡 ?꾪삊?대굹 ?뺣컯??媛?섎뒗吏 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??`,
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
        message: `${npc.name} ?묐컯?먮뒗 ?먯젙???꾩슂?⑸땲??`,
        checkOptions: this.buildIntimidationCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (confidence < 0.45) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${npc.name}?먭쾶 ?듯븷 留뚰븳 ?꾪삊 洹쇨굅媛 遺議깊빀?덈떎. ??吏곸젒?곸씤 ?뺣컯 ?섎떒?대굹 ?꾪뿕 ?붿냼瑜??쒖떆?댁빞 ?⑸땲??`,
        actionCandidate,
      };
    }

    if (normalizedDisposition === "friendly" && confidence < 0.7) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${npc.name}?(?? ?꾩옱 ?고샇?곸씠???대윴 ?묐컯? 留λ씫???깅┰?섍린 ?대졄?듬땲?? ?ㅻⅨ 諛⑹떇???묎렐???꾩슂?⑸땲??`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${npc.name} ?묐컯? ?곹솴 諛섎컻怨??꾩냽 寃곌낵 ?먮떒???꾩슂?⑸땲?? ?꾪삊??癒뱁엳?붿?? 遺?묒슜? GM ?뱀씤 ?먮뒗 異붽? ?먯젙?쇰줈 寃곗젙?⑸땲??`,
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
        message: "?띿씪 NPC瑜??뱀젙?????놁뒿?덈떎. 怨듦컻?????以??꾧뎄瑜??띿씠?ㅻ뒗吏 怨⑤씪二쇱꽭??",
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
          `${npc.name}?먭쾶 ?대뼡 嫄곗쭞 ?뺣낫???좊텇???쒖떆?섎뒗吏 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??`,
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
        message: `${npc.name} ?띿씠湲곗뿉???먯젙???꾩슂?⑸땲??`,
        checkOptions: this.buildDeceptionCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (confidence < 0.45) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${npc.name}?먭쾶 ?듯븷 留뚰븳 嫄곗쭞 洹쇨굅媛 遺議깊빀?덈떎. ?좊텇, 利앷굅, ?곹솴 ?ㅻ챸?????ㅻ뱷???덇쾶 ?쒖떆?댁빞 ?⑸땲??`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${npc.name} ?띿씠湲곕뒗 吏꾩닠??媛쒖뿰?깃낵 ?몄텧 ?꾪뿕 ?먮떒?????꾩슂?⑸땲?? GM ?뱀씤 ?먮뒗 異붽? ?먯젙?쇰줈 寃곗젙?⑸땲??`,
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
        message: "?댄렣蹂?NPC瑜??뱀젙?????놁뒿?덈떎. 怨듦컻?????以??꾧뎄??諛섏쓳???쎌쑝?ㅻ뒗吏 怨⑤씪二쇱꽭??",
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
          `${npc.name}???대뼡 媛먯젙?대굹 諛섏쓳???쎄퀬 ?띠?吏 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;

    return {
      requestId,
      status: MainCommandStatus.CHECK_REQUIRED,
      message: `${npc.name}??媛먯젙怨??띾궡瑜??쎌쑝?ㅻ㈃ ?먯젙???꾩슂?⑸땲??`,
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
        message: "?댄렣蹂??ㅻ툕?앺듃瑜??뱀젙?????놁뒿?덈떎. 怨듦컻??臾쇨굔?대굹 ?⑥꽌 以??섎굹瑜?怨⑤씪二쇱꽭??",
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
          `${objectTarget.name}???대뼡 遺遺꾩쓣 ?댄렣蹂대뒗吏 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??`,
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${objectTarget.name}??瑜? ?먯꽭??議곗궗?섎젮硫??먯젙???꾩슂?⑸땲??`,
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
          "?대뼡 RP ?됰룞???대뼡 遺꾩쐞湲곕줈 ?섎젮?붿? 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??",
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
        message: `${actionSummary}?(?? ?⑥닚 臾섏궗瑜??섏뼱 異붽? ?먯젙?대굹 ?곹솴 ?뱀씤???꾩슂?????덉뒿?덈떎.`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${actionSummary} RP ?좎뼵??湲곕줉?덉뒿?덈떎.`,
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
          "?대뒓 諛⑺뼢?대굹 ?대뼡 踰붿쐞瑜??댄뵾?붿? 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;

    if (interpreter.parsed.action.requiresRoll) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "二쇰????몃??섍쾶 ?댄뵾?ㅻ㈃ ?먯젙???꾩슂?⑸땲??",
        checkOptions: this.buildPerceptionCheckOptions(interpreter.parsed.action),
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    const visibleSummary = visibleEntities.length
      ? `蹂댁씠????? ${visibleEntities.map((entity) => entity.name).join(", ")}.`
      : "?덉뿉 ?꾨뒗 ??곸? ?꾩쭅 ?놁뒿?덈떎.";
    const clueSummary = publicClues.length
      ? ` 怨듦컻 ?⑥꽌: ${publicClues.join(" / ")}`
      : "";
    const pointSummary = dto.mapPoint
      ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 二쇰???湲곗??쇰줈 ?댄룉?듬땲??`
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
          "臾댁뾿???대뼸寃?議곗궗?섎뒗吏 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??",
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.requiresRoll) {
      const label = target?.name ?? "?대떦 ?꾩튂";
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${label}??瑜? ?먯꽭??議곗궗?섎젮硫??먯젙???꾩슂?⑸땲??`,
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
        message: `(${dto.mapPoint.x}, ${dto.mapPoint.y}) ?꾩튂 議곗궗???꾩옣 ?먯젙?대굹 異붽? ?뺤씤???꾩슂?⑸땲??`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.IMPOSSIBLE,
      message: "議곗궗????곸씠???꾩튂瑜??뱀젙?????놁뒿?덈떎.",
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
          "?대뒓 履쎌씠???대뼡 吏?먯쓣 ?ν빐 洹瑜?湲곗슱?대뒗吏 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??",
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
        message: "誘몄꽭???뚮━??湲곗쿃???≪븘?대젮硫??먯젙???꾩슂?⑸땲??",
        checkOptions: this.buildPerceptionCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const pointSummary = dto.mapPoint
      ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 遺洹쇱뿉 洹瑜?湲곗슱??듬땲??`
      : "";
    const targetSummary = target
      ? ` ${target.name} 履쎌뿉??怨듦컻?곸쑝濡??ㅼ쓣 ???덈뒗 ?댁긽???뚮━???놁뒿?덈떎.`
      : " 怨듦컻??踰붿쐞?먯꽌???댁긽???뚮━??湲곗쿃??諛붾줈 ?쒕윭?섏? ?딆뒿?덈떎.";

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
          "?대뒓 ?꾩튂???대뼡 ?꾪뿕??寃쎄퀎?섎뒗吏 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??",
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
        message: "?⑥? ?꾪뿕?대굹 留ㅻ났??媛먯??섎젮硫??먯젙???꾩슂?⑸땲??",
        checkOptions: this.buildDangerDetectionCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const targetSummary = target
      ? ` ${target.name} 遺洹쇱뿉??利됱떆 ?쒕윭???꾪뿕? 蹂댁씠吏 ?딆뒿?덈떎.`
      : " 利됱떆 ?쒕윭???꾪뿕 ?좏샇??蹂댁씠吏 ?딆뒿?덈떎.";
    const pointSummary = dto.mapPoint
      ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 二쇰???寃쎄퀎?덉뒿?덈떎.`
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
          "?대뒓 ?꾩튂濡??대뼡 諛⑹떇?쇰줈 ?대룞?섎젮?붿? 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??",
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
        message: "?뱀닔 ?대룞???쒕룄?섎젮硫??먯젙???꾩슂?⑸땲??",
        checkOptions: this.buildSpecialMoveCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const itemSummary = dto.itemId ? ` ?꾧뎄 ${dto.itemId} ?ъ슜???④퍡 怨좊젮?⑸땲??` : "";

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `(${dto.mapPoint?.x}, ${dto.mapPoint?.y}) 諛⑺뼢 ?뱀닔 ?대룞???쒕룄?????덉뒿?덈떎.${itemSummary}`,
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
    const objectTarget = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.OBJECT),
      MainCommandTargetType.OBJECT,
    );

    if (!objectTarget) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "議곗옉???ㅻ툕?앺듃瑜??뱀젙?????놁뒿?덈떎. 怨듦컻??臾? ?곸옄, ?μ튂 以??섎굹瑜?怨⑤씪二쇱꽭??",
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
          `${objectTarget.name}??瑜? ?대뼡 諛⑹떇?쇰줈 議곗옉?섎뒗吏 議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??`,
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
        message: `${objectTarget.name}??瑜? 議곗옉?섎젮硫??먯젙???꾩슂?⑸땲??`,
        checkOptions: this.buildObjectInteractionCheckOptions(interpreter.parsed.action, objectTarget.name),
        actionCandidate,
      };
    }

    if (interpreter.parsed.action.confidence < 0.6) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${objectTarget.name} 議곗옉? 異붽? ?곹깭 ?뺤씤?대굹 ?곹솴 ?뱀씤???꾩슂?⑸땲??`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.ACTION_READY,
      message: `${objectTarget.name}??${actionSummary}??瑜? ?쒕룄?????덉뒿?덈떎.`,
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

    const clueText = publicClues.length ? ` 怨듦컻 ?⑥꽌: ${publicClues.join(" / ")}` : "";
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
        message: "?꾩옱 ?λ㈃?먯꽌 ?대룞 媛?ν븳 ?ㅼ쓬 ?몃뱶媛 ?놁뒿?덈떎.",
      };
    }

    const matched = this.matchTransitionCandidate(candidates, dto);
    if (!matched && candidates.length > 1) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `?대룞 ?꾨낫瑜???遺꾨챸??吏?뺥빐二쇱꽭?? 媛?ν븳 紐⑹쟻吏: ${candidates.map((item) => item.title).join(", ")}`,
      };
    }

    const target = matched ?? candidates[0];
    await this.applySceneTransition(context, target.nodeId);

    const snapshot = await this.sessionsService.buildSnapshot(context.sessionId);
    this.realtimeEvents.emitSessionSnapshot(context.sessionId, snapshot);

    return {
      requestId,
      status: MainCommandStatus.RESOLVED,
      message: `${target.title} ?λ㈃?쇰줈 ?대룞?덉뒿?덈떎.`,
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
          "吏湲?吏덈Ц?먯꽌 諛붾줈 ?곌껐??洹쒖튃 議곌컖??李얠? 紐삵뻽?듬땲?? ?됰룞, ??? 二쇰Ц ?대쫫??議곌툑 ??援ъ껜?곸쑝濡??곸뼱二쇱꽭??",
      };
    }

    const relatedIntentText = dto.relatedIntent ? `愿??紐낅졊: ${dto.relatedIntent}. ` : "";
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
          ? `${action.approach} (?쒖씠???쒖븞: ${action.suggestedDifficulty})`
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
          ? `${npcName} ?ㅻ뱷 (?쒖씠???쒖븞: ${action.suggestedDifficulty})`
          : `${npcName} ?ㅻ뱷`,
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
          ? `${npcName} ?묐컯 (?쒖씠???쒖븞: ${action.suggestedDifficulty})`
          : `${npcName} ?묐컯`,
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
          ? `${npcName} ?띿씠湲?(?쒖씠???쒖븞: ${action.suggestedDifficulty})`
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
          ? `${npcName} 媛먯젙 ?쎄린 (?쒖씠???쒖븞: ${action.suggestedDifficulty})`
          : `${npcName} 媛먯젙 ?쎄린`,
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
          ? `${objectName} 議곗궗 (?쒖씠???쒖븞: ${action.suggestedDifficulty})`
          : `${objectName} 議곗궗`,
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
          ? `二쇰? 愿李?(?쒖씠???쒖븞: ${action.suggestedDifficulty})`
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
          ? `?꾪뿕 媛먯? (?쒖씠???쒖븞: ${action.suggestedDifficulty})`
          : "?꾪뿕 媛먯?",
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
          ? `?뱀닔 ?대룞 (?쒖씠???쒖븞: ${action.suggestedDifficulty})`
          : "?뱀닔 ?대룞",
      },
      {
        ability: "dex",
        skill: "acrobatics",
        reason: action.suggestedDifficulty
          ? `?뱀닔 ?대룞 ???(?쒖씠???쒖븞: ${action.suggestedDifficulty})`
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
          ? `${objectName} 議곗옉 (?쒖씠???쒖븞: ${action.suggestedDifficulty})`
          : `${objectName} 議곗옉`,
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
          ? `${toolName}${reasonTarget} ?ъ슜 (?쒖씠???쒖븞: ${action.suggestedDifficulty})`
          : `${toolName}${reasonTarget} ?ъ슜`,
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
      return "?꾧뎄";
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
      throw badRequest("MAIN_COMMAND_400", "?대룞 ????몃뱶瑜?李얠쓣 ???놁뒿?덈떎.", {
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
