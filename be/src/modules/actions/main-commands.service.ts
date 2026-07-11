import { Injectable } from "@nestjs/common";
import {
  ActionOutcome,
  MainCommandActionCandidateDto,
  MainCommandCheckOptionDto,
  MainCommandIntent,
  MainCommandResponseDto,
  MainCommandScreenType,
  MainCommandStatus,
  ResolveMainCommandCheckDto,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { AiService } from "../ai/ai.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import { TurnLogsService } from "../turn-logs/turn-logs.service";
import { MainCommandAiQueryService } from "./main-command-ai-query.service";
import { MainCommandCheckBuilderService } from "./main-command-check-builder.service";
import { MainCommandCheckEffectAttachmentService } from "./main-command-check-effect-attachment.service";
import { MainCommandCheckEffectParserService } from "./main-command-check-effect-parser.service";
import { MainCommandCheckMovementService } from "./main-command-check-movement.service";
import { MainCommandCheckRevealService } from "./main-command-check-reveal.service";
import { MainCommandCheckRevealSyncService } from "./main-command-check-reveal-sync.service";
import { MainCommandCheckResultLogService } from "./main-command-check-result-log.service";
import { MainCommandCheckResultNarrationService } from "./main-command-check-result-narration.service";
import { MainCommandCheckResolutionService } from "./main-command-check-resolution.service";
import { MainCommandContextLoaderService } from "./main-command-context-loader.service";
import { MainCommandEndingNodeService } from "./main-command-ending-node.service";
import { MainCommandHintContextService } from "./main-command-hint-context.service";
import { MainCommandInterpreterPayloadService } from "./main-command-interpreter-payload.service";
import { MainCommandInterpreterRouteResponseService } from "./main-command-interpreter-route-response.service";
import { MainCommandInterpreterRouterService } from "./main-command-interpreter-router.service";
import { MainCommandInventoryLabelService } from "./main-command-inventory-label.service";
import type { ResolvedInterpreterActionRoute } from "./main-command-interpreter-router.service";
import {
  MainCommandIntentHandlersService,
  type MainCommandIntentHandlersRuntime,
} from "./main-command-intent-handlers.service";
import { MainCommandNpcDialogueService } from "./main-command-npc-dialogue.service";
import { MainCommandPersistenceService } from "./main-command-persistence.service";
import { MAIN_COMMAND_CONFIDENCE } from "./main-command-policy.constants";
import { MainCommandPostActionRevealService } from "./main-command-post-action-reveal.service";
import { MainCommandProgressEvidenceService } from "./main-command-progress-evidence.service";
import type { RevealedClueState } from "./main-command-progress-evidence.service";
import { MainCommandRuleFragmentService } from "./main-command-rule-fragment.service";
import { MainCommandRuleQueryService } from "./main-command-rule-query.service";
import { MainCommandSceneEntityService } from "./main-command-scene-entity.service";
import type { VisibleSceneEntity } from "./main-command-scene-entity.service";
import { MainCommandSceneInfoService } from "./main-command-scene-info.service";
import { MainCommandSceneTransitionResponseService } from "./main-command-scene-transition-response.service";
import { MainCommandSceneTransitionResolutionService } from "./main-command-scene-transition-resolution.service";
import { MainCommandSceneTransitionStateService } from "./main-command-scene-transition-state.service";
import { MainCommandTransitionCandidateService } from "./main-command-transition-candidate.service";
import { MainCommandTransitionEvaluatorService } from "./main-command-transition-evaluator.service";
import type {
  EvaluatedTransitionCandidate,
  TransitionCandidate,
  TransitionConditionCandidateContract,
  TransitionConditionEvaluation,
  TransitionEvidence,
} from "./main-command-transition-evaluator.service";
import { MainCommandValidatorService } from "./main-command-validator.service";
import { MainCommandVttCheckResultService } from "./main-command-vtt-check-result.service";

export type { VisibleSceneEntity } from "./main-command-scene-entity.service";

export type LoadedContext = {
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
  flagsJson: string | null;
};

type InterpreterActionForRouting = {
  type: string;
  targetId?: string | null;
  spellId?: string | null;
  approach: string;
  ability?: string | null;
  skill?: string | null;
  suggestedDifficulty?: string | null;
  confidence: number;
  requiresRoll: boolean;
};

export type InterpreterParsedForRouting = {
  action: InterpreterActionForRouting;
  needsClarification: boolean;
  clarificationQuestion?: string | null;
  mentionedItemId?: string | null;
  mentionedSpellId?: string | null;
  sceneTransition?: {
    selectedTargetNodeId?: string | null;
    candidates?: TransitionConditionCandidateContract[];
  } | null;
};

type MainCommandDispatchOptions = {
  interpreted?: InterpreterParsedForRouting;
};

const APPROVAL_INTENTS = new Set<MainCommandIntent>([
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly aiService: AiService,
    private readonly turnLogsService: TurnLogsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly mainCommandCheckEffectParser: MainCommandCheckEffectParserService,
    private readonly mainCommandContextLoader: MainCommandContextLoaderService,
    private readonly mainCommandIntentHandlers: MainCommandIntentHandlersService,
    private readonly mainCommandCheckBuilder: MainCommandCheckBuilderService,
    private readonly mainCommandCheckEffectAttachment: MainCommandCheckEffectAttachmentService,
    private readonly mainCommandCheckMovement: MainCommandCheckMovementService,
    private readonly mainCommandCheckReveal: MainCommandCheckRevealService,
    private readonly mainCommandCheckResultLog: MainCommandCheckResultLogService,
    private readonly mainCommandCheckResultNarration: MainCommandCheckResultNarrationService,
    private readonly mainCommandCheckResolution: MainCommandCheckResolutionService,
    private readonly mainCommandSceneEntity: MainCommandSceneEntityService,
    private readonly mainCommandValidator: MainCommandValidatorService,
    private readonly mainCommandTransitionEvaluator: MainCommandTransitionEvaluatorService,
    private readonly mainCommandHintContext: MainCommandHintContextService,
    private readonly mainCommandAiQuery: MainCommandAiQueryService,
    private readonly mainCommandInterpreterPayload: MainCommandInterpreterPayloadService,
    private readonly mainCommandInterpreterRouter: MainCommandInterpreterRouterService,
    private readonly mainCommandInventoryLabel: MainCommandInventoryLabelService,
    private readonly mainCommandNpcDialogue: MainCommandNpcDialogueService,
    private readonly mainCommandPersistence: MainCommandPersistenceService,
    private readonly mainCommandInterpreterRouteResponse: MainCommandInterpreterRouteResponseService,
    private readonly mainCommandCheckRevealSync: MainCommandCheckRevealSyncService,
    private readonly mainCommandPostActionReveal: MainCommandPostActionRevealService,
    private readonly mainCommandRuleFragments: MainCommandRuleFragmentService,
    private readonly mainCommandRuleQuery: MainCommandRuleQueryService,
    private readonly mainCommandProgressEvidence: MainCommandProgressEvidenceService,
    private readonly mainCommandSceneInfo: MainCommandSceneInfoService,
    private readonly mainCommandTransitionCandidates: MainCommandTransitionCandidateService,
    private readonly mainCommandSceneTransitionState: MainCommandSceneTransitionStateService,
    private readonly mainCommandSceneTransitionResponse: MainCommandSceneTransitionResponseService,
    private readonly mainCommandSceneTransitionResolution: MainCommandSceneTransitionResolutionService,
    private readonly mainCommandEndingNode: MainCommandEndingNodeService,
    private readonly mainCommandVttCheckResult: MainCommandVttCheckResultService,
  ) {}

  private createMainCommandIntentHandlersRuntime(): MainCommandIntentHandlersRuntime {
    return {
      aiService: this.aiService,
      sessionsService: this.sessionsService,
      buildActionCandidate: this.buildActionCandidate.bind(this),
      buildCheckOptions: this.mainCommandCheckBuilder.buildCheckOptions.bind(this.mainCommandCheckBuilder),
      buildDangerDetectionCheckOptions: this.mainCommandCheckBuilder.buildDangerDetectionCheckOptions.bind(this.mainCommandCheckBuilder),
      buildDeceptionCheckOptions: this.mainCommandCheckBuilder.buildDeceptionCheckOptions.bind(this.mainCommandCheckBuilder),
      buildInsightCheckOptions: this.mainCommandCheckBuilder.buildInsightCheckOptions.bind(this.mainCommandCheckBuilder),
      buildInterpreterPayload: this.buildInterpreterPayload.bind(this),
      buildIntimidationCheckOptions: this.mainCommandCheckBuilder.buildIntimidationCheckOptions.bind(this.mainCommandCheckBuilder),
      buildInvestigationCheckOptions: this.mainCommandCheckBuilder.buildInvestigationCheckOptions.bind(this.mainCommandCheckBuilder),
      buildItemExploreCheckOptions: this.mainCommandCheckBuilder.buildItemExploreCheckOptions.bind(this.mainCommandCheckBuilder),
      buildObjectInteractionCheckOptions: this.mainCommandCheckBuilder.buildObjectInteractionCheckOptions.bind(this.mainCommandCheckBuilder),
      buildPerceptionCheckOptions: this.mainCommandCheckBuilder.buildPerceptionCheckOptions.bind(this.mainCommandCheckBuilder),
      buildPersuasionCheckOptions: this.mainCommandCheckBuilder.buildPersuasionCheckOptions.bind(this.mainCommandCheckBuilder),
      buildSpecialMoveCheckOptions: this.mainCommandCheckBuilder.buildSpecialMoveCheckOptions.bind(this.mainCommandCheckBuilder),
      buildToolUseCheckOptions: this.mainCommandCheckBuilder.buildToolUseCheckOptions.bind(this.mainCommandCheckBuilder),
      canUseExplicitPlayerText: this.mainCommandValidator.canUseExplicitPlayerText.bind(this.mainCommandValidator),
      handleNpcDialogue: this.handleNpcDialogue.bind(this),
      handleRuleQuery: this.handleRuleQuery.bind(this),
      handleSceneInfo: this.handleSceneInfo.bind(this),
      handleSceneTransition: this.handleSceneTransition.bind(this),
      handleSummary: this.handleSummary.bind(this),
      handleTacticQuery: this.handleTacticQuery.bind(this),
      resolveEntity: this.mainCommandSceneEntity.resolveEntity.bind(this.mainCommandSceneEntity),
      resolveOwnedItemName: this.resolveOwnedItemName.bind(this),
      shouldRequireMainCommandCheck: this.mainCommandValidator.shouldRequireMainCommandCheck.bind(this.mainCommandValidator),
    };
  }

  async submitMainCommand(userId: string, sessionId: string, dto: SubmitMainCommandDto): Promise<MainCommandResponseDto> {
    const context = await this.loadContext(userId, sessionId, dto);
    const requestId = randomUUID();
    const visibleEntities = this.mainCommandSceneEntity.extractVisibleSceneEntities(context.currentNodeNodeMetaJson);
    const recentLogs = await this.loadRecentLogLines(context.sessionId);
    const publicClues = this.extractPublicClueSummaries(context.currentNodeCluesJson);
    this.mainCommandValidator.validateIntentPayload(dto, visibleEntities);

    let response =
      dto.intent === MainCommandIntent.GENERAL_GM_REQUEST
        ? await this.handleGeneralGmRequest(requestId, userId, context, dto, visibleEntities, recentLogs, publicClues)
        : await this.dispatchMainCommandIntent(requestId, userId, context, dto, visibleEntities, recentLogs, publicClues);
    response = this.attachMainCommandCheckEffect(response, requestId, context, dto, visibleEntities, publicClues);

    const objectReveal = await this.mainCommandCheckReveal.applyImmediateObjectInvestigation({
      intent: dto.intent,
      mapPoint: dto.mapPoint,
      response,
      sessionId: context.sessionId,
      sessionScenarioId: context.sessionScenarioId,
      nodeId: context.currentNodeId,
      sessionCharacterId: context.sessionCharacterId,
    });
    response = objectReveal.response;

    const turnLog = await this.mainCommandPersistence.persistResult(userId, context, dto, response);
    await this.mainCommandPostActionReveal.revealAfterPersistedMainCommand({
      context,
      dto,
      response,
      turnLogId: turnLog.turnLogId,
      objectReveal,
    });
    return response;
  }

  async resolveMainCommandCheck(userId: string, sessionId: string, dto: ResolveMainCommandCheckDto): Promise<MainCommandResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const vttCheckResponse = await this.mainCommandVttCheckResult.resolveVttCheckResult({
      userId,
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      dto,
    });
    if (vttCheckResponse) {
      return vttCheckResponse;
    }

    const mainCommandCheck = await this.mainCommandCheckResolution.prepareMainCommandCheckResult({
      userId,
      sessionId: session.id,
      currentNodeId: state.currentNodeId,
      dto,
    });
    if (mainCommandCheck.response) {
      return mainCommandCheck.response;
    }

    const mainCommandEffect = mainCommandCheck.prepared.effect;
    const checkDiceResult = mainCommandCheck.prepared.checkDiceResult;
    const checkRollSummary = mainCommandCheck.prepared.checkRollSummary;
    let result = mainCommandCheck.prepared.result;
    const movementResult = await this.mainCommandCheckMovement.applySpecialMoveCheck({
      sessionId: session.id,
      effect: mainCommandEffect,
      outcome: dto.outcome,
      result,
    });
    result = movementResult.result;
    const turnLogOutcome = movementResult.turnLogOutcome;

    let revealCounts = {
      actionRevealCount: 0,
      objectRevealCount: 0,
      observedObjectCount: 0,
    };
    if (dto.outcome === ActionOutcome.SUCCESS) {
      const revealResult = await this.mainCommandCheckReveal.applySuccessfulCheckReveals({
        requestId: dto.requestId ?? randomUUID(),
        sessionId: session.id,
        sessionScenarioId: sessionScenario.id,
        effect: mainCommandEffect,
        result,
      });
      result = revealResult.result;
      revealCounts = revealResult.counts;
    }

    const narration = this.mainCommandCheckResultNarration.withRollSummary(result.message, checkRollSummary);
    await this.mainCommandCheckResultLog.createAndPublishMainCommandCheckResult({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      dto,
      effect: mainCommandEffect,
      diceResult: checkDiceResult,
      outcome: turnLogOutcome,
      narration,
    });

    await this.mainCommandCheckRevealSync.syncSuccessfulCheckReveals({
      outcome: dto.outcome,
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      revealCounts,
    });

    return {
      requestId: dto.requestId ?? randomUUID(),
      status: result.status,
      message: narration,
      data: { effect: mainCommandEffect },
    };
  }

  private async loadContext(userId: string, sessionId: string, dto: SubmitMainCommandDto): Promise<LoadedContext> {
    return this.mainCommandContextLoader.loadContext(userId, sessionId, dto);
  }

  private async handleNpcDialogue(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    return this.mainCommandNpcDialogue.handleNpcDialogue(requestId, userId, context, dto, visibleEntities, recentLogs);
  }

  private async handleGeneralGmRequest(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 6)),
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.mainCommandValidator.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return this.mainCommandInterpreterRouteResponse.buildClarificationResponse(requestId, interpreter.parsed.clarificationQuestion);
    }

    const fallbackRoute = this.mainCommandInterpreterRouter.resolveTextFallbackRoute(dto, interpreter.parsed);
    if (fallbackRoute) {
      return await this.handleInterpreterActionTypeRoute(
        requestId,
        userId,
        context,
        dto,
        visibleEntities,
        recentLogs,
        publicClues,
        fallbackRoute.route,
        fallbackRoute.parsed,
      );
    }

    const actionTypeRoute = this.mainCommandInterpreterRouter.resolveInterpreterActionTypeRoute(interpreter.parsed.action.type);
    if (actionTypeRoute) {
      return await this.handleInterpreterActionTypeRoute(
        requestId,
        userId,
        context,
        dto,
        visibleEntities,
        recentLogs,
        publicClues,
        actionTypeRoute,
        interpreter.parsed,
      );
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || interpreter.parsed.action.type || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.mainCommandValidator.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
      return this.mainCommandInterpreterRouteResponse.buildCheckRequiredResponse(
        requestId,
        actionSummary,
        this.mainCommandCheckBuilder.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      );
    }

    if ((interpreter.parsed.action.confidence ?? 0) < MAIN_COMMAND_CONFIDENCE.DEFAULT_GM_REVIEW_THRESHOLD) {
      return this.mainCommandInterpreterRouteResponse.buildLowConfidenceApprovalResponse(requestId, actionSummary, actionCandidate);
    }

    return this.mainCommandInterpreterRouteResponse.buildRecordedCandidateResponse(requestId, actionSummary, actionCandidate);
  }

  private async handleInterpreterActionTypeRoute(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
    publicClues: string[],
    route: ResolvedInterpreterActionRoute,
    parsed: InterpreterParsedForRouting,
  ): Promise<MainCommandResponseDto> {
    if (route.config.route === "MAIN_COMMAND") {
      return await this.handleInterpreterMainCommandRoute(requestId, userId, context, dto, visibleEntities, recentLogs, publicClues, route, parsed);
    }

    return this.mainCommandInterpreterRouteResponse.buildNonMainCommandRouteResponse(requestId, route) ?? {
      requestId,
      status: MainCommandStatus.IMPOSSIBLE,
      message: "처리할 수 없는 요청입니다.",
    };
  }

  private async handleInterpreterMainCommandRoute(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
    publicClues: string[],
    route: ResolvedInterpreterActionRoute,
    parsed: InterpreterParsedForRouting,
  ): Promise<MainCommandResponseDto> {
    if (route.config.route !== "MAIN_COMMAND") {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "처리할 수 없는 요청입니다.",
      };
    }

    const routedDto = this.mainCommandInterpreterRouter.buildInterpreterRoutedMainCommandDto(dto, route.config.intent, visibleEntities, parsed);
    const missingRequirementMessage = this.mainCommandValidator.getMissingInterpreterRouteRequirementMessage(routedDto);
    if (missingRequirementMessage) {
      return this.mainCommandInterpreterRouteResponse.buildMissingRequirementResponse(requestId, missingRequirementMessage, route);
    }

    // 여기부터는 기존 슬래시 명령어 handler와 같은 검증을 통과시켜서,
    // 자연어 입력도 실제 구현된 메인 명령 체계 안에서만 실행되도록 맞춘다.
    this.mainCommandValidator.validateIntentPayload(routedDto, visibleEntities);
    const response = await this.dispatchMainCommandIntent(requestId, userId, context, routedDto, visibleEntities, recentLogs, publicClues, {
      interpreted: parsed,
    });

    return this.mainCommandInterpreterRouteResponse.withRoutedMainCommandData(response, routedDto, route);
  }

  private async dispatchMainCommandIntent(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
    publicClues: string[],
    options: MainCommandDispatchOptions = {},
  ): Promise<MainCommandResponseDto> {
    const intentHandlers = this.mainCommandIntentHandlers.create(this.createMainCommandIntentHandlersRuntime());
    switch (dto.intent) {
      case MainCommandIntent.TALK_TO_NPC:
        return await this.handleNpcDialogue(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.SOCIAL_PERSUADE:
        return await intentHandlers.handleSocialPersuade(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.SOCIAL_INTIMIDATE:
        return await intentHandlers.handleSocialIntimidate(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.SOCIAL_DECEIVE:
        return await intentHandlers.handleSocialDeceive(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.READ_EMOTION:
        return await intentHandlers.handleReadEmotion(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.INSPECT_STORY_OBJECT:
        return await intentHandlers.handleInspectStoryObject(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.DECLARE_RP_ACTION:
        return intentHandlers.handleDeclareRpAction(requestId, context, dto);
      case MainCommandIntent.ASK_SCENE_INFO:
        return this.handleSceneInfo(requestId, context, dto, visibleEntities);
      case MainCommandIntent.ASK_HINT:
        return await this.handleHint(requestId, userId, context, dto, recentLogs, publicClues);
      case MainCommandIntent.ASK_SUMMARY:
        return await this.handleSummary(requestId, userId, context, dto, recentLogs);
      case MainCommandIntent.REQUEST_SCENE_TRANSITION:
        return await this.handleSceneTransition(requestId, context, dto, recentLogs);
      case MainCommandIntent.OBSERVE_AREA:
        return intentHandlers.handleObserveArea(requestId, context, dto);
      case MainCommandIntent.INVESTIGATE_OBJECT:
        return await intentHandlers.handleInvestigateObject(requestId, userId, context, dto, visibleEntities, options.interpreted);
      case MainCommandIntent.LISTEN:
        return await intentHandlers.handleListen(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.DETECT_DANGER:
        return await intentHandlers.handleDetectDanger(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.SPECIAL_MOVE:
        return await intentHandlers.handleSpecialMove(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.INTERACT_OBJECT:
        return await intentHandlers.handleInteractObject(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.USE_TOOL:
        return await intentHandlers.handleUseTool(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.USE_ITEM_EXPLORE:
        return await intentHandlers.handleUseItemExplore(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.SPLIT_PARTY_TASK:
        return await intentHandlers.handleSplitPartyTask(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.COMBAT_MANEUVER:
        return await intentHandlers.handleCombatManeuver(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.ENVIRONMENT_USE:
        return await intentHandlers.handleEnvironmentUse(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.IMPROVISED_ATTACK:
        return await intentHandlers.handleImprovisedAttack(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.CALLED_SHOT:
        return await intentHandlers.handleCalledShot(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.READY_ACTION:
        return await intentHandlers.handleReadyAction(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.REACTION_REQUEST:
        return await intentHandlers.handleReactionRequest(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.COMBAT_TALK:
        return await intentHandlers.handleCombatTalk(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.USE_ITEM_COMBAT:
        return await intentHandlers.handleUseItemCombat(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.USE_SPELL_CREATIVELY:
        return await intentHandlers.handleUseSpellCreatively(requestId, userId, context, dto, visibleEntities, recentLogs);
      case MainCommandIntent.TACTIC_QUERY:
        return await this.handleTacticQuery(requestId, userId, context, dto, recentLogs, publicClues);
      case MainCommandIntent.ASK_RULE:
        return await this.handleRuleQuery(requestId, userId, context, dto, visibleEntities);
      default:
        return {
          requestId,
          status: MainCommandStatus.IMPOSSIBLE,
          message: "처리할 수 없는 요청입니다.",
        };
    }
  }

  private async handleHint(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    return this.mainCommandAiQuery.handleHint(requestId, userId, context, dto, recentLogs, publicClues);
  }

  private async handleSummary(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    return this.mainCommandAiQuery.handleSummary(requestId, userId, context, dto, recentLogs);
  }

  private handleSceneInfo(requestId: string, context: LoadedContext, dto: SubmitMainCommandDto, visibleEntities: VisibleSceneEntity[]): MainCommandResponseDto {
    return this.mainCommandSceneInfo.handleSceneInfo(requestId, context, dto, visibleEntities);
  }

  private async handleSceneTransition(
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const endingResponse = await this.mainCommandEndingNode.completeIfEndingNode(requestId, context);
    if (endingResponse) {
      return endingResponse;
    }

    const candidates = await this.loadTransitionCandidates(context);
    if (!candidates.length) {
      return this.mainCommandSceneTransitionResponse.buildNoCandidatesResponse(requestId);
    }

    const matched = this.matchTransitionCandidate(candidates, dto);
    if (matched) {
      const conditionResult = await this.evaluateTransitionConditionWithEvidence(context, matched, dto, recentLogs);
      return await this.resolveSceneTransition(requestId, context, matched, conditionResult);
    }

    if (candidates.length === 1) {
      const target = candidates[0];
      const conditionResult = await this.evaluateTransitionConditionWithEvidence(context, target, dto, recentLogs);
      return await this.resolveSceneTransition(requestId, context, target, conditionResult);
    }

    const evaluatedCandidates = await this.evaluateTransitionCandidatesWithRevealedClues(context, candidates, dto, recentLogs);
    const satisfiedCandidates = evaluatedCandidates.filter((candidate) => candidate.conditionResult.satisfied);
    if (satisfiedCandidates.length === 1) {
      const candidate = satisfiedCandidates[0];
      return await this.resolveSceneTransition(requestId, context, candidate.target, candidate.conditionResult);
    }

    if (satisfiedCandidates.length > 1) {
      return this.mainCommandSceneTransitionResponse.buildAmbiguousDestinationResponse(requestId, satisfiedCandidates);
    }

    const reviewCandidate = evaluatedCandidates.find((candidate) => candidate.conditionResult.needsReview);
    if (reviewCandidate) {
      return this.buildBlockedSceneTransitionResponse(requestId, reviewCandidate.target, reviewCandidate.conditionResult);
    }

    return this.mainCommandSceneTransitionResponse.buildNoSatisfiedTransitionResponse(requestId, evaluatedCandidates);
  }

  private async resolveSceneTransition(
    requestId: string,
    context: LoadedContext,
    target: TransitionCandidate,
    conditionResult: TransitionConditionEvaluation,
  ): Promise<MainCommandResponseDto> {
    return this.mainCommandSceneTransitionResolution.resolveSceneTransition(requestId, context, target, conditionResult);
  }

  private buildBlockedSceneTransitionResponse(
    requestId: string,
    target: TransitionCandidate,
    conditionResult: TransitionConditionEvaluation,
  ): MainCommandResponseDto {
    return this.mainCommandSceneTransitionResolution.buildBlockedSceneTransitionResponse(requestId, target, conditionResult);
  }

  private async handleTacticQuery(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    return this.mainCommandAiQuery.handleTacticQuery(requestId, userId, context, dto, recentLogs, publicClues);
  }

  private async handleRuleQuery(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    return this.mainCommandRuleQuery.handleRuleQuery(requestId, userId, context, dto, visibleEntities);
  }

  private buildInterpreterPayload(context: LoadedContext, dto: SubmitMainCommandDto, visibleEntities: VisibleSceneEntity[], recentLogs?: string[]) {
    return this.mainCommandInterpreterPayload.buildInterpreterPayload(context, dto, visibleEntities, recentLogs);
  }

  private async buildTransitionEvidence(
    context: LoadedContext,
    recentLogs: string[],
    candidates: TransitionCandidate[],
  ): Promise<TransitionEvidence> {
    return this.mainCommandProgressEvidence.buildTransitionEvidence(context, recentLogs, candidates);
  }

  private async loadRevealedClueSummaries(sessionScenarioId: string): Promise<string[]> {
    return this.mainCommandProgressEvidence.loadRevealedClueSummaries(sessionScenarioId);
  }

  private async loadRevealedClueState(sessionScenarioId: string): Promise<RevealedClueState> {
    return this.mainCommandProgressEvidence.loadRevealedClueState(sessionScenarioId);
  }

  private resolveOwnedItemName(context: LoadedContext, itemId?: string | null): string {
    return this.mainCommandInventoryLabel.resolveOwnedItemName(context, itemId);
  }

  private buildActionCandidate(context: LoadedContext, dto: SubmitMainCommandDto, actionSummary: string): MainCommandActionCandidateDto {
    return this.mainCommandCheckEffectAttachment.buildActionCandidate(context, dto, actionSummary);
  }

  private attachMainCommandCheckEffect(
    response: MainCommandResponseDto,
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    publicClues: string[],
  ): MainCommandResponseDto {
    return this.mainCommandCheckEffectAttachment.attachMainCommandCheckEffect(response, requestId, context, dto, visibleEntities, publicClues);
  }

  private extractPublicClueSummaries(cluesJson: string): string[] {
    return this.mainCommandProgressEvidence.extractPublicClueSummaries(cluesJson);
  }

  private async loadRecentLogLines(sessionId: string): Promise<string[]> {
    return this.mainCommandProgressEvidence.loadRecentLogLines(sessionId);
  }

  private async loadTransitionCandidates(context: LoadedContext): Promise<TransitionCandidate[]> {
    return this.mainCommandTransitionCandidates.loadTransitionCandidates(context);
  }

  private matchTransitionCandidate(candidates: TransitionCandidate[], dto: SubmitMainCommandDto): TransitionCandidate | null {
    return this.mainCommandTransitionEvaluator.matchTransitionCandidate(candidates, dto);
  }

  private evaluateTransitionCondition(
    candidate: TransitionCandidate,
    _dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
    evidence?: TransitionEvidence,
  ): TransitionConditionEvaluation {
    return this.mainCommandTransitionEvaluator.evaluateTransitionCondition(candidate, recentLogs, publicClues, evidence);
  }

  private async evaluateTransitionConditionWithRevealedClues(
    context: LoadedContext,
    candidate: TransitionCandidate,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    _publicClues: string[],
  ): Promise<TransitionConditionEvaluation> {
    const revealedClues = await this.loadRevealedClueSummaries(context.sessionScenarioId);
    return this.evaluateTransitionCondition(candidate, dto, recentLogs, revealedClues);
  }

  private async evaluateTransitionConditionWithEvidence(
    context: LoadedContext,
    candidate: TransitionCandidate,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
  ): Promise<TransitionConditionEvaluation> {
    const evidence = await this.buildTransitionEvidence(context, recentLogs, [candidate]);
    return this.evaluateTransitionCondition(candidate, dto, recentLogs, evidence.revealedClues, evidence);
  }

  private async evaluateTransitionCandidatesWithRevealedClues(
    context: LoadedContext,
    candidates: TransitionCandidate[],
    dto: SubmitMainCommandDto,
    recentLogs: string[],
  ): Promise<EvaluatedTransitionCandidate[]> {
    const evidence = await this.buildTransitionEvidence(context, recentLogs, candidates);
    return candidates.map((candidate) => ({
      target: candidate,
      conditionResult: this.evaluateTransitionCondition(candidate, dto, recentLogs, evidence.revealedClues, evidence),
    }));
  }

  private async applySceneTransition(context: LoadedContext, targetNodeId: string): Promise<void> {
    return this.mainCommandSceneTransitionState.applySceneTransition(context, targetNodeId);
  }

}
