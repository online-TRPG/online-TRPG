import { Injectable } from '@nestjs/common';
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
  VttMapStateDto,
} from '@trpg/shared-types';
import {
  GamePhase as PrismaGamePhase,
  GmMode as PrismaGmMode,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { badRequest, forbidden } from '../../common/exceptions/domain-error';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { SessionsService } from '../sessions/sessions.service';
import { TurnLogsService } from '../turn-logs/turn-logs.service';

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
  flagsJson: string | null;
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
  conditionRule: TransitionConditionRule | null;
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

type EvaluatedTransitionCandidate = {
  target: TransitionCandidate;
  conditionResult: TransitionConditionEvaluation;
};

type TransitionConditionRequirementType =
  | 'ALWAYS'
  | 'CLUE_REVEALED'
  | 'COMBAT_RESOLVED'
  | 'NODE_VISITED'
  | 'FLAG_SET'
  | 'GM_APPROVAL';

type TransitionConditionRequirement = {
  type: TransitionConditionRequirementType;
  targetId?: string | null;
  flagKey?: string | null;
  flagValue?: string | null;
};

type TransitionConditionRule = {
  logic: 'ALL' | 'ANY';
  requirements: TransitionConditionRequirement[];
};

type TransitionConditionContractRequirement = {
  type:
    | 'ACTION_EVIDENCE'
    | 'CLUE_REVEALED'
    | 'CLUE_NOT_REVEALED'
    | 'OBJECT_STATE'
    | 'FLAG_SET'
    | 'COMBAT_RESOLVED'
    | 'GM_APPROVAL';
  text: string;
  polarity?: 'MUST' | 'MUST_NOT';
};

type TransitionConditionCandidateContract = {
  transitionId?: string | null;
  targetNodeId: string;
  logic: 'ALL' | 'ANY';
  requirements: TransitionConditionContractRequirement[];
  confidence: number;
  rationale?: string | null;
};

type TransitionEvidence = {
  recentLogs: string[];
  revealedClues: string[];
  revealedClueIds: string[];
  unrevealedClues: string[];
  visitedNodeIds: string[];
  flags: Record<string, unknown>;
  currentNodeId: string;
  combatResolvedForCurrentNode: boolean;
};

type VttObjectEventHint = {
  objectName: string;
  eventName: string | null;
  distanceFeet: number;
  revealRadiusFeet: number;
};

type VttDoorCheckEffect = {
  type: 'vttDoor';
  doorId: string;
  effect: 'open' | 'broken';
  nodeId: string;
  mapPoint: { x: number; y: number };
};

type VttHazardCheckEffect = {
  type: 'vttHazard';
  hazardId: string;
  effect: 'disarm';
  nodeId: string;
  mapPoint: { x: number; y: number };
};

type MainCommandCheckEffect = {
  type: 'mainCommandCheck';
  requestId: string;
  nodeId: string;
  sessionCharacterId: string;
  intent: MainCommandIntent;
  screenType: MainCommandScreenType;
  playerText: string;
  actionSummary: string;
  targetId: string | null;
  targetName: string | null;
  targetSummary: string | null;
  targetDisposition: string | null;
  itemId: string | null;
  itemName: string | null;
  mapPoint: { x: number; y: number } | null;
  checkOption: MainCommandCheckOptionDto | null;
  visibleEntityNames: string[];
  publicClues: string[];
  sceneText: string;
  actionCandidate: MainCommandActionCandidateDto | null;
};

type InterpreterActionRoute =
  | {
      route: 'MAIN_COMMAND';
      intent: MainCommandIntent;
    }
  | {
      route: 'MAP_CONTROL_ACTION';
      message: string;
    }
  | {
      route: 'GAME_META_QUESTION';
    }
  | {
      route: 'OUT_OF_SCOPE';
      message: string;
    };

type ResolvedInterpreterActionRoute = {
  actionType: string;
  config: InterpreterActionRoute;
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

type InterpreterParsedForRouting = {
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

type EffectiveMainCommandData = {
  commandId: SubmitMainCommandDto['commandId'];
  category: SubmitMainCommandDto['category'];
  intent: SubmitMainCommandDto['intent'];
  screenType: SubmitMainCommandDto['screenType'];
  targetId: string | null;
  targetType: SubmitMainCommandDto['targetType'] | null;
  itemId: string | null;
  spellId: string | null;
};

const AUTO_TRANSITION_CONDITIONS = new Set([
  '',
  'default',
  'always',
  'auto',
  'automatic',
  'true',
  'none',
  '무조건',
  '무조건 가능',
  '항상',
  '항상 가능',
  '자동',
  '기본',
  '없음',
]);

const TRANSITION_CONDITION_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'be',
  'by',
  'condition',
  'default',
  'for',
  'from',
  'if',
  'in',
  'is',
  'next',
  'node',
  'of',
  'on',
  'or',
  'scene',
  'the',
  'then',
  'to',
  'when',
  'with',
  '경우',
  '그리고',
  '기본',
  '노드',
  '가능',
  '가능한',
  '가능해야',
  '다음',
  '때',
  '또는',
  '및',
  '밝혀야',
  '밝히기',
  '성공',
  '상태',
  '시',
  '이후',
  '이동',
  '이동가능',
  '완료',
  '하거나',
  '오브젝트',
  '요구',
  '필요',
  '필요함',
  '장면',
  '전',
  '전이',
  '조건',
  '후',
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
    allowsTargetTypes: [
      MainCommandTargetType.OBJECT,
      MainCommandTargetType.AREA,
      MainCommandTargetType.POINT,
    ],
    allowsMapPoint: true,
  },
  [MainCommandIntent.DETECT_DANGER]: {
    allowsTargetTypes: [
      MainCommandTargetType.OBJECT,
      MainCommandTargetType.AREA,
      MainCommandTargetType.POINT,
    ],
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
    allowsTargetTypes: [
      MainCommandTargetType.OBJECT,
      MainCommandTargetType.AREA,
      MainCommandTargetType.NPC,
      MainCommandTargetType.POINT,
    ],
    allowsMapPoint: true,
  },
  [MainCommandIntent.ENVIRONMENT_USE]: {
    allowsTargetTypes: [
      MainCommandTargetType.OBJECT,
      MainCommandTargetType.AREA,
      MainCommandTargetType.POINT,
    ],
    allowsMapPoint: true,
  },
  [MainCommandIntent.IMPROVISED_ATTACK]: {
    requiresTargetTypes: [
      MainCommandTargetType.NPC,
      MainCommandTargetType.ACTOR,
      MainCommandTargetType.OBJECT,
    ],
  },
  [MainCommandIntent.CALLED_SHOT]: {
    requiresTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR],
  },
  [MainCommandIntent.COMBAT_TALK]: {
    requiresTargetTypes: [MainCommandTargetType.NPC, MainCommandTargetType.ACTOR],
  },
  [MainCommandIntent.USE_ITEM_COMBAT]: {
    requiresItem: true,
    allowsTargetTypes: [
      MainCommandTargetType.NPC,
      MainCommandTargetType.ACTOR,
      MainCommandTargetType.OBJECT,
      MainCommandTargetType.AREA,
      MainCommandTargetType.POINT,
    ],
    allowsMapPoint: true,
  },
  [MainCommandIntent.USE_SPELL_CREATIVELY]: {
    requiresSpell: true,
    allowsTargetTypes: [
      MainCommandTargetType.NPC,
      MainCommandTargetType.ACTOR,
      MainCommandTargetType.OBJECT,
      MainCommandTargetType.AREA,
      MainCommandTargetType.POINT,
    ],
    allowsMapPoint: true,
  },
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

const INTERPRETER_ACTION_TYPE_ROUTES: Record<string, InterpreterActionRoute> = {
  TALK_TO_NPC: { route: 'MAIN_COMMAND', intent: MainCommandIntent.TALK_TO_NPC },
  SOCIAL_PERSUADE: { route: 'MAIN_COMMAND', intent: MainCommandIntent.SOCIAL_PERSUADE },
  SOCIAL_INTIMIDATE: { route: 'MAIN_COMMAND', intent: MainCommandIntent.SOCIAL_INTIMIDATE },
  SOCIAL_DECEIVE: { route: 'MAIN_COMMAND', intent: MainCommandIntent.SOCIAL_DECEIVE },
  READ_EMOTION: { route: 'MAIN_COMMAND', intent: MainCommandIntent.READ_EMOTION },
  ASK_SCENE_INFO: { route: 'MAIN_COMMAND', intent: MainCommandIntent.ASK_SCENE_INFO },
  ASK_HINT: { route: 'MAIN_COMMAND', intent: MainCommandIntent.ASK_HINT },
  ASK_SUMMARY: { route: 'MAIN_COMMAND', intent: MainCommandIntent.ASK_SUMMARY },
  REQUEST_SCENE_TRANSITION: {
    route: 'MAIN_COMMAND',
    intent: MainCommandIntent.REQUEST_SCENE_TRANSITION,
  },
  OBSERVE_AREA: { route: 'MAIN_COMMAND', intent: MainCommandIntent.OBSERVE_AREA },
  INSPECT_STORY_OBJECT: { route: 'MAIN_COMMAND', intent: MainCommandIntent.INSPECT_STORY_OBJECT },
  INVESTIGATE_OBJECT: { route: 'MAIN_COMMAND', intent: MainCommandIntent.INVESTIGATE_OBJECT },
  LISTEN: { route: 'MAIN_COMMAND', intent: MainCommandIntent.LISTEN },
  DETECT_DANGER: { route: 'MAIN_COMMAND', intent: MainCommandIntent.DETECT_DANGER },
  SPECIAL_MOVE: { route: 'MAIN_COMMAND', intent: MainCommandIntent.SPECIAL_MOVE },
  INTERACT_OBJECT: { route: 'MAIN_COMMAND', intent: MainCommandIntent.INTERACT_OBJECT },
  USE_TOOL: { route: 'MAIN_COMMAND', intent: MainCommandIntent.USE_TOOL },
  USE_ITEM_EXPLORE: { route: 'MAIN_COMMAND', intent: MainCommandIntent.USE_ITEM_EXPLORE },
  SPLIT_PARTY_TASK: { route: 'MAIN_COMMAND', intent: MainCommandIntent.SPLIT_PARTY_TASK },
  COMBAT_MANEUVER: { route: 'MAIN_COMMAND', intent: MainCommandIntent.COMBAT_MANEUVER },
  ENVIRONMENT_USE: { route: 'MAIN_COMMAND', intent: MainCommandIntent.ENVIRONMENT_USE },
  IMPROVISED_ATTACK: { route: 'MAIN_COMMAND', intent: MainCommandIntent.IMPROVISED_ATTACK },
  CALLED_SHOT: { route: 'MAIN_COMMAND', intent: MainCommandIntent.CALLED_SHOT },
  READY_ACTION: { route: 'MAIN_COMMAND', intent: MainCommandIntent.READY_ACTION },
  REACTION_REQUEST: { route: 'MAIN_COMMAND', intent: MainCommandIntent.REACTION_REQUEST },
  COMBAT_TALK: { route: 'MAIN_COMMAND', intent: MainCommandIntent.COMBAT_TALK },
  USE_ITEM_COMBAT: { route: 'MAIN_COMMAND', intent: MainCommandIntent.USE_ITEM_COMBAT },
  USE_SPELL_CREATIVELY: { route: 'MAIN_COMMAND', intent: MainCommandIntent.USE_SPELL_CREATIVELY },
  TACTIC_QUERY: { route: 'MAIN_COMMAND', intent: MainCommandIntent.TACTIC_QUERY },
  ASK_RULE: { route: 'MAIN_COMMAND', intent: MainCommandIntent.ASK_RULE },
  MAP_MOVE: {
    route: 'MAP_CONTROL_ACTION',
    message: '이동은 메인탭에서 처리할 수 없습니다. 맵 하단의 이동 버튼으로 조작해주세요.',
  },
  MAP_ATTACK: {
    route: 'MAP_CONTROL_ACTION',
    message: '공격은 메인탭에서 처리할 수 없습니다. 맵 하단의 공격 버튼으로 조작해주세요.',
  },
  MAP_CAST_SPELL: {
    route: 'MAP_CONTROL_ACTION',
    message:
      '전투 주문 사용은 메인탭에서 처리할 수 없습니다. 맵 하단의 행동 버튼으로 조작해주세요.',
  },
  MAP_USE_CLASS_FEATURE: {
    route: 'MAP_CONTROL_ACTION',
    message:
      '전투 특성 사용은 메인탭에서 처리할 수 없습니다. 맵 하단의 행동 버튼으로 조작해주세요.',
  },
  MAP_END_TURN: {
    route: 'MAP_CONTROL_ACTION',
    message: '턴 종료는 메인탭에서 처리할 수 없습니다. 맵 하단의 턴 종료 버튼으로 조작해주세요.',
  },
  GM_ONLY_DAMAGE: { route: 'OUT_OF_SCOPE', message: '처리할 수 없는 요청입니다.' },
  GM_ONLY_HEAL: { route: 'OUT_OF_SCOPE', message: '처리할 수 없는 요청입니다.' },
  GM_ONLY_CONDITION: { route: 'OUT_OF_SCOPE', message: '처리할 수 없는 요청입니다.' },
  GM_ONLY_INVENTORY_MUTATION: { route: 'OUT_OF_SCOPE', message: '처리할 수 없는 요청입니다.' },
  OUT_OF_SCOPE: { route: 'OUT_OF_SCOPE', message: '처리할 수 없는 요청입니다.' },
  GAME_META_QUESTION: { route: 'GAME_META_QUESTION' },
};

@Injectable()
export class MainCommandsService {
  private ruleFragmentsCache: RuleFragmentSummary[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly aiService: AiService,
    private readonly turnLogsService: TurnLogsService,
    private readonly realtimeEvents: RealtimeEventsService
  ) {}

  async submitMainCommand(
    userId: string,
    sessionId: string,
    dto: SubmitMainCommandDto
  ): Promise<MainCommandResponseDto> {
    const context = await this.loadContext(userId, sessionId, dto);
    const requestId = randomUUID();
    const visibleEntities = this.extractVisibleSceneEntities(context.currentNodeNodeMetaJson);
    const recentLogs = await this.loadRecentLogLines(context.sessionId);
    const publicClues = this.extractPublicClueSummaries(context.currentNodeCluesJson);
    this.validateIntentPayload(dto, visibleEntities);

    let response =
      dto.intent === MainCommandIntent.GENERAL_GM_REQUEST
        ? await this.handleGeneralGmRequest(
            requestId,
            userId,
            context,
            dto,
            visibleEntities,
            recentLogs,
            publicClues
          )
        : await this.dispatchMainCommandIntent(
            requestId,
            userId,
            context,
            dto,
            visibleEntities,
            recentLogs,
            publicClues
          );
    response = this.attachMainCommandCheckEffect(
      response,
      requestId,
      context,
      dto,
      visibleEntities,
      publicClues
    );

    const objectRevealResult =
      dto.intent === MainCommandIntent.INVESTIGATE_OBJECT &&
      dto.mapPoint &&
      response.status !== MainCommandStatus.CHECK_REQUIRED
        ? await this.sessionsService.revealVttObjectContentsAtPoint({
            sessionId: context.sessionId,
            sessionScenarioId: context.sessionScenarioId,
            nodeId: context.currentNodeId,
            mapPoint: dto.mapPoint,
            sessionCharacterId: context.sessionCharacterId,
            revealedBy: 'system',
          })
        : { count: 0, revealedClues: [], revealedItems: [] };
    const handledObjectInvestigation = dto.intent === MainCommandIntent.INVESTIGATE_OBJECT && Boolean(dto.mapPoint);
    if (objectRevealResult.count > 0) {
      response = this.withRevealedObjectContents(
        response,
        objectRevealResult.revealedClues,
        objectRevealResult.revealedItems
      );
    }

    const turnLog = await this.persistResult(userId, context, dto, response);
    // 실제 행동 후보가 있는 응답만 단서 공개를 시도합니다. 질문/불가/RP 기록은 상태를 바꾸지 않습니다.
    const revealCount =
      dto.intent === MainCommandIntent.DECLARE_RP_ACTION ||
      response.status === MainCommandStatus.IMPOSSIBLE ||
      response.status === MainCommandStatus.GM_APPROVAL_REQUIRED ||
      response.status === MainCommandStatus.CHECK_REQUIRED ||
      handledObjectInvestigation ||
      !response.actionCandidate
        ? 0
        : await this.sessionsService.revealCurrentNodeCluesAfterAction({
            sessionScenarioId: context.sessionScenarioId,
            nodeId: context.currentNodeId,
            actionText: dto.playerText,
            outcome: this.toActionOutcome(response),
            policyModes: ['PLAYER_ACTION'],
            turnLogId: turnLog.turnLogId,
            revealedBy: 'system',
          });
    if (revealCount + objectRevealResult.count > 0) {
      await this.markScenarioStateChanged(context.sessionScenarioId);
      this.realtimeEvents.emitSessionSnapshot(
        context.sessionId,
        await this.sessionsService.buildSnapshot(context.sessionId)
      );
    }
    return response;
  }

  async resolveMainCommandCheck(
    userId: string,
    sessionId: string,
    dto: ResolveMainCommandCheckDto
  ): Promise<MainCommandResponseDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(
      session.id
    );
    const effect = this.parseVttDoorCheckEffect(dto.effect);
    const hazardEffect = this.parseVttHazardCheckEffect(dto.effect);

    if (effect) {
      if (state.currentNodeId && effect.nodeId !== state.currentNodeId) {
        return {
          requestId: dto.requestId ?? randomUUID(),
          status: MainCommandStatus.IMPOSSIBLE,
          message: '현재 노드와 다른 문 판정 결과는 반영할 수 없습니다.',
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
                effect.effect === 'open'
                  ? '판정에 실패해 문은 아직 잠겨 있습니다.'
                  : '판정에 실패해 문은 부서지지 않았습니다.',
            };

      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: session.id,
        sessionScenarioId: sessionScenario.id,
        actorUserId: userId,
        sessionCharacterId: dto.actorId ?? null,
        rawInput: null,
        structuredAction: {
          type: 'main_command_check_result',
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

    if (hazardEffect) {
      if (state.currentNodeId && hazardEffect.nodeId !== state.currentNodeId) {
        return {
          requestId: dto.requestId ?? randomUUID(),
          status: MainCommandStatus.IMPOSSIBLE,
          message: '현재 노드와 다른 함정 판정 결과는 반영할 수 없습니다.',
        };
      }

      const result =
        dto.outcome === ActionOutcome.SUCCESS
          ? await this.sessionsService.applyVttHazardDisarmSuccess({
              sessionId: session.id,
              sessionScenarioId: sessionScenario.id,
              nodeId: hazardEffect.nodeId,
              hazardId: hazardEffect.hazardId,
            })
          : {
              status: MainCommandStatus.MESSAGE,
              message: '판정에 실패해 함정은 아직 작동 가능한 상태입니다.',
            };

      const turnLog = await this.turnLogsService.createTurnLog({
        sessionId: session.id,
        sessionScenarioId: sessionScenario.id,
        actorUserId: userId,
        sessionCharacterId: dto.actorId ?? null,
        rawInput: null,
        structuredAction: {
          type: 'main_command_check_result',
          requestId: dto.requestId ?? null,
          outcome: dto.outcome,
          effect: hazardEffect,
        },
        outcome: dto.outcome,
        narration: result.message,
      });
      this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);

      return {
        requestId: dto.requestId ?? randomUUID(),
        status: result.status,
        message: result.message,
        data: { effect: hazardEffect },
      };
    }

    const mainCommandEffect = this.parseMainCommandCheckEffect(dto.effect);
    if (!mainCommandEffect) {
      return {
        requestId: dto.requestId ?? randomUUID(),
        status: MainCommandStatus.IMPOSSIBLE,
        message: '처리할 수 없는 판정 후속 효과입니다.',
      };
    }
    if (state.currentNodeId && mainCommandEffect.nodeId !== state.currentNodeId) {
      return {
        requestId: dto.requestId ?? randomUUID(),
        status: MainCommandStatus.IMPOSSIBLE,
        message: '현재 노드와 다른 판정 결과는 반영할 수 없습니다.',
      };
    }

    const resultMessage = await this.buildMainCommandCheckResultMessageForOutcome(
      userId,
      session.id,
      mainCommandEffect,
      dto.outcome
    );
    let result = {
      status:
        dto.outcome === ActionOutcome.SUCCESS
          ? MainCommandStatus.RESOLVED
          : MainCommandStatus.MESSAGE,
      message: resultMessage,
    };
    let turnLogOutcome = dto.outcome;

    let objectRevealResult: {
      count: number;
      revealedClues: Array<{ id: string; title: string; text: string | null }>;
      revealedItems: Array<{ id: string; name: string; quantity: number; description: string | null }>;
    } = { count: 0, revealedClues: [], revealedItems: [] };
    let observedObjectResult: { count: number; objectNames: string[] } = {
      count: 0,
      objectNames: [],
    };
    if (
      dto.outcome === ActionOutcome.SUCCESS &&
      mainCommandEffect.intent === MainCommandIntent.INVESTIGATE_OBJECT &&
      mainCommandEffect.mapPoint
    ) {
      objectRevealResult = await this.sessionsService.revealVttObjectContentsAtPoint({
        sessionId: session.id,
        sessionScenarioId: sessionScenario.id,
        nodeId: mainCommandEffect.nodeId,
        mapPoint: mainCommandEffect.mapPoint,
        sessionCharacterId: mainCommandEffect.sessionCharacterId,
        revealedBy: 'system',
        checkOption: mainCommandEffect.checkOption,
      });
      if (objectRevealResult.count > 0) {
        const augmented = this.withRevealedObjectContents(
          {
            requestId: dto.requestId ?? randomUUID(),
            status: result.status,
            message: result.message,
          },
          objectRevealResult.revealedClues,
          objectRevealResult.revealedItems
        );
        result = {
          status: augmented.status,
          message: augmented.message,
        };
      }
    }
    if (
      dto.outcome === ActionOutcome.SUCCESS &&
      mainCommandEffect.intent === MainCommandIntent.OBSERVE_AREA
    ) {
      observedObjectResult = await this.sessionsService.revealObservableVttObjectsInPartyVision({
        sessionId: session.id,
        sessionScenarioId: sessionScenario.id,
        nodeId: mainCommandEffect.nodeId,
      });
      if (observedObjectResult.count > 0) {
        result = {
          ...result,
          message: `${result.message}\n\n시야 안에서 수상한 오브젝트를 발견했습니다: ${observedObjectResult.objectNames.join(', ')}. 맵에 표시됩니다.`,
        };
      }
    }
    if (
      dto.outcome === ActionOutcome.SUCCESS &&
      mainCommandEffect.intent === MainCommandIntent.SPECIAL_MOVE &&
      mainCommandEffect.mapPoint
    ) {
      const moveResult = await this.sessionsService.moveSessionCharacterTokenToMapPoint({
        sessionId: session.id,
        sessionCharacterId: mainCommandEffect.sessionCharacterId,
        mapPoint: mainCommandEffect.mapPoint,
      });
      result = {
        status: moveResult.status,
        message:
          moveResult.status === MainCommandStatus.RESOLVED
            ? `${result.message}\n\n${moveResult.message}`
            : moveResult.message,
      };
      if (moveResult.status === MainCommandStatus.IMPOSSIBLE) {
        turnLogOutcome = ActionOutcome.IMPOSSIBLE;
      }
    }

    let actionRevealCount = 0;
    if (dto.outcome === ActionOutcome.SUCCESS) {
      const revealedActionClues =
        mainCommandEffect.actionCandidate &&
        result.status !== MainCommandStatus.IMPOSSIBLE &&
        mainCommandEffect.intent !== MainCommandIntent.OBSERVE_AREA &&
        !(
          mainCommandEffect.intent === MainCommandIntent.INVESTIGATE_OBJECT &&
          mainCommandEffect.mapPoint
        )
          ? await this.sessionsService.revealCurrentNodeCluesAfterActionWithDetails({
              sessionScenarioId: sessionScenario.id,
              nodeId: mainCommandEffect.nodeId,
              actionText: mainCommandEffect.playerText,
              outcome: ActionOutcome.SUCCESS,
              policyModes: ['PLAYER_ACTION'],
              turnLogId: null,
              revealedBy: 'system',
            })
          : [];
      actionRevealCount = revealedActionClues.length;
      if (revealedActionClues.length > 0) {
        const augmented = this.withRevealedObjectContents(
          {
            requestId: dto.requestId ?? randomUUID(),
            status: result.status,
            message: result.message,
          },
          revealedActionClues
        );
        result = {
          status: augmented.status,
          message: augmented.message,
        };
      }
    }

    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      actorUserId: userId,
      sessionCharacterId: dto.actorId ?? null,
      rawInput: null,
      structuredAction: {
        type: 'main_command_check_result',
        requestId: dto.requestId ?? null,
        outcome: dto.outcome,
        effect: mainCommandEffect,
      },
      outcome: turnLogOutcome,
      narration: result.message,
    });
    this.realtimeEvents.emitTurnLogCreated(session.id, turnLog);

    if (dto.outcome === ActionOutcome.SUCCESS) {
      if (actionRevealCount + objectRevealResult.count + observedObjectResult.count > 0) {
        await this.markScenarioStateChanged(sessionScenario.id);
        this.realtimeEvents.emitSessionSnapshot(
          session.id,
          await this.sessionsService.buildSnapshot(session.id)
        );
      }
    }

    return {
      requestId: dto.requestId ?? randomUUID(),
      status: result.status,
      message: result.message,
      data: { effect: mainCommandEffect },
    };
  }

  private async loadContext(
    userId: string,
    sessionId: string,
    dto: SubmitMainCommandDto
  ): Promise<LoadedContext> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);

    if (session.gmMode !== PrismaGmMode.AI) {
      throw badRequest('MAIN_COMMAND_400', 'AI GM 세션에서만 메인 명령을 사용할 수 있습니다.', {
        reason: 'AI_GM_ONLY',
      });
    }

    if (session.status !== PrismaSessionStatus.PLAYING) {
      throw forbidden('MAIN_COMMAND_403', '세션이 진행 중일 때만 메인 명령을 사용할 수 있습니다.', {
        reason: 'SESSION_NOT_PLAYING',
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
      throw forbidden('MAIN_COMMAND_403', '현재 세션 참가자만 메인 명령을 사용할 수 있습니다.', {
        reason: 'NOT_A_SESSION_PARTICIPANT',
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
      throw forbidden('MAIN_COMMAND_403', '캐릭터를 선택한 뒤 메인 명령을 사용해주세요.', {
        reason: 'CHARACTER_NOT_SELECTED',
      });
    }

    if (![sessionCharacter.id, sessionCharacter.characterId].includes(dto.actorId)) {
      throw forbidden('MAIN_COMMAND_403', '선택한 캐릭터와 요청 actorId가 일치하지 않습니다.', {
        reason: 'ACTOR_MISMATCH',
      });
    }

    // S14P31A201-80: sessionId+userId 복합키로 본인 sessionCharacter 만 얻지만,
    // 캐릭터 이양/공유 등 향후 기능 대비해 Character.ownerUserId 도 명시 검증한다.
    // (기존 actions.service.ts S14P31A201-71 패턴과 동일)
    if (sessionCharacter.character.ownerUserId !== userId) {
      throw forbidden('MAIN_COMMAND_403', '다른 유저의 캐릭터로 메인 명령을 사용할 수 없습니다.', {
        reason: 'CHARACTER_OWNERSHIP_MISMATCH',
      });
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(
      session.id
    );
    if (!state.currentNodeId) {
      throw badRequest('MAIN_COMMAND_400', '현재 진행 중인 노드가 없습니다.', {
        reason: 'CURRENT_NODE_REQUIRED',
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
      throw badRequest('MAIN_COMMAND_400', '현재 노드 정보를 찾을 수 없습니다.', {
        reason: 'CURRENT_NODE_NOT_FOUND',
      });
    }

    const expectedScreenType = this.toExpectedMainScreenType(
      currentNode.nodeType,
      state.flagsJson,
      currentNode.nodeId
    );
    if (dto.screenType !== expectedScreenType) {
      throw badRequest(
        'MAIN_COMMAND_400',
        '현재 노드 화면 타입과 요청 screenType이 일치하지 않습니다.',
        {
          reason: 'SCREEN_TYPE_MISMATCH',
        }
      );
    }

    if (dto.nodeId && dto.nodeId !== currentNode.nodeId) {
      throw badRequest('MAIN_COMMAND_400', '요청 nodeId가 현재 진행 중인 노드와 다릅니다.', {
        reason: 'NODE_ID_MISMATCH',
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
      flagsJson: state.flagsJson,
    };
  }

  private ensureItemOwnership(
    dto: SubmitMainCommandDto,
    inventoryEntries: Array<{
      id: string;
      itemDefinitionId: string;
      itemDefinition: { id: string; name: string };
    }>
  ): void {
    if (!dto.itemId) {
      return;
    }

    const normalized = dto.itemId.trim().toLowerCase();
    const hasItem = inventoryEntries.some((entry) =>
      [entry.id, entry.itemDefinitionId, entry.itemDefinition.id, entry.itemDefinition.name]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase())
        .includes(normalized)
    );

    if (!hasItem) {
      throw badRequest('MAIN_COMMAND_400', '해당 아이템은 현재 캐릭터가 보유하고 있지 않습니다.', {
        reason: 'ITEM_NOT_OWNED',
      });
    }
  }

  private validateIntentPayload(
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[]
  ): void {
    const requirement = INTENT_REQUIREMENTS[dto.intent];
    if (!requirement) {
      return;
    }

    if (requirement.requiresItem && !dto.itemId) {
      throw badRequest('MAIN_COMMAND_400', '이 명령은 사용할 아이템을 함께 지정해야 합니다.', {
        reason: 'ITEM_ID_REQUIRED',
        intent: dto.intent,
      });
    }

    if (requirement.requiresSpell && !dto.spellId) {
      throw badRequest('MAIN_COMMAND_400', '이 명령은 사용할 주문을 함께 지정해야 합니다.', {
        reason: 'SPELL_ID_REQUIRED',
        intent: dto.intent,
      });
    }

    if (requirement.requiresMapPoint && !dto.mapPoint) {
      throw badRequest('MAIN_COMMAND_400', '이 명령은 지도 좌표를 함께 지정해야 합니다.', {
        reason: 'MAP_POINT_REQUIRED',
        intent: dto.intent,
      });
    }

    if (dto.targetType) {
      const allowedTargetTypes =
        requirement.requiresTargetTypes ?? requirement.allowsTargetTypes ?? [];
      if (allowedTargetTypes.length && !allowedTargetTypes.includes(dto.targetType)) {
        throw badRequest('MAIN_COMMAND_400', '이 명령에 맞지 않는 대상 종류입니다.', {
          reason: 'TARGET_TYPE_INVALID',
          intent: dto.intent,
          targetType: dto.targetType,
        });
      }
    }

    if (requirement.requiresTargetTypes && !dto.targetId) {
      throw badRequest('MAIN_COMMAND_400', '이 명령은 대상을 함께 지정해야 합니다.', {
        reason: 'TARGET_ID_REQUIRED',
        intent: dto.intent,
      });
    }

    const hasNaturalLanguageTarget = dto.playerText.trim().length > 0;
    if (
      (dto.intent === MainCommandIntent.INVESTIGATE_OBJECT ||
        dto.intent === MainCommandIntent.INTERACT_OBJECT ||
        dto.intent === MainCommandIntent.ENVIRONMENT_USE) &&
      !dto.targetId &&
      !dto.mapPoint &&
      !hasNaturalLanguageTarget
    ) {
      throw badRequest('MAIN_COMMAND_400', '이 명령은 조사 대상 또는 지도 좌표가 필요합니다.', {
        reason: 'TARGET_OR_POINT_REQUIRED',
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
        dto.targetType
      );
      if (!entity) {
        throw badRequest('MAIN_COMMAND_400', '현재 화면에서 보이는 대상만 지정할 수 있습니다.', {
          reason: 'TARGET_NOT_VISIBLE',
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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: '대화할 NPC를 지정하지 않았습니다. 화면에 보이는 NPC를 분명히 적어주세요.',
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
      data: {
        npcDialogue: {
          npcId: npc.id,
          speakerName: npc.name,
        },
      },
    };
  }

  private async handleGeneralGmRequest(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
    publicClues: string[]
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 6))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '어떤 행동이나 요청을 하려는지 조금 더 구체적으로 적어주세요.',
      };
    }

    const fallbackMainCommandIntent = this.resolveTextFallbackMainCommandIntent(dto, interpreter.parsed.action.type);
    if (fallbackMainCommandIntent) {
      const fallbackRoute: ResolvedInterpreterActionRoute = {
        actionType: fallbackMainCommandIntent,
        config: { route: "MAIN_COMMAND", intent: fallbackMainCommandIntent },
      };
      return await this.handleInterpreterActionTypeRoute(
        requestId,
        userId,
        context,
        dto,
        visibleEntities,
        recentLogs,
        publicClues,
        fallbackRoute,
        this.buildTextFallbackInterpretedCommand(dto, interpreter.parsed, fallbackMainCommandIntent),
      );
    }

    const actionTypeRoute = this.resolveInterpreterActionTypeRoute(interpreter.parsed.action.type);
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
        interpreter.parsed
      );
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      interpreter.parsed.action.type ||
      dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${actionSummary}에는 판정이 필요합니다.`,
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    if ((interpreter.parsed.action.confidence ?? 0) < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${actionSummary}은(는) 상황 확인 또는 추가 검증이 필요합니다.`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `행동 후보로 기록했습니다: ${actionSummary}. 결과는 아직 확정되지 않았습니다.`,
      actionCandidate,
    };
  }

  private resolveTextFallbackMainCommandIntent(
    dto: SubmitMainCommandDto,
    actionType?: string | null,
  ): MainCommandIntent | null {
    if (actionType?.trim().toUpperCase() !== "OUT_OF_SCOPE") {
      return null;
    }

    const text = dto.playerText.trim();
    if (!text) {
      return null;
    }

    if (/(조사|살피|살펴|찾|뒤지|확인)/.test(text)) {
      return MainCommandIntent.INVESTIGATE_OBJECT;
    }

    return null;
  }

  private buildTextFallbackInterpretedCommand(
    dto: SubmitMainCommandDto,
    parsed: InterpreterParsedForRouting,
    intent: MainCommandIntent,
  ): InterpreterParsedForRouting {
    const actionSummary = dto.playerText.trim() || parsed.action.approach || intent;
    return {
      ...parsed,
      needsClarification: false,
      clarificationQuestion: null,
      action: {
        ...parsed.action,
        type: intent,
        approach: actionSummary,
        confidence: Math.max(parsed.action.confidence ?? 0, 0.55),
        requiresRoll: true,
        suggestedDifficulty: parsed.action.suggestedDifficulty ?? "medium",
      },
    };
  }

  private resolveInterpreterActionTypeRoute(actionType?: string | null): ResolvedInterpreterActionRoute | null {
    const normalizedActionType = actionType?.trim().toUpperCase();
    if (!normalizedActionType) {
      return null;
    }

    const config = INTERPRETER_ACTION_TYPE_ROUTES[normalizedActionType];
    return config ? { actionType: normalizedActionType, config } : null;
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
    parsed: InterpreterParsedForRouting
  ): Promise<MainCommandResponseDto> {
    if (route.config.route === 'MAIN_COMMAND') {
      return await this.handleInterpreterMainCommandRoute(
        requestId,
        userId,
        context,
        dto,
        visibleEntities,
        recentLogs,
        publicClues,
        route,
        parsed
      );
    }

    if (route.config.route === 'GAME_META_QUESTION') {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          'TRPG는 플레이어가 캐릭터의 말과 행동을 선언하면 GM이 장면과 결과를 이어가는 역할극 게임입니다. ' +
          '이 화면에서는 자유롭게 행동을 적거나 `/명령어`를 붙여 더 빠르게 요청할 수 있습니다.',
        data: {
          interpreterRoute: this.buildInterpreterRouteData(route),
        },
      };
    }

    return {
      requestId,
      status: MainCommandStatus.IMPOSSIBLE,
      message: route.config.message,
      data: {
        interpreterRoute: this.buildInterpreterRouteData(route),
      },
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
    parsed: InterpreterParsedForRouting
  ): Promise<MainCommandResponseDto> {
    if (route.config.route !== 'MAIN_COMMAND') {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: '처리할 수 없는 요청입니다.',
      };
    }

    const routedDto = this.buildInterpreterRoutedMainCommandDto(
      dto,
      route.config.intent,
      visibleEntities,
      parsed
    );
    const missingRequirementMessage = this.getMissingInterpreterRouteRequirementMessage(routedDto);
    if (missingRequirementMessage) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: missingRequirementMessage,
        data: {
          interpreterRoute: this.buildInterpreterRouteData(route),
        },
      };
    }

    // 여기부터는 기존 슬래시 명령어 handler와 같은 검증을 통과시켜서,
    // 자연어 입력도 실제 구현된 메인 명령 체계 안에서만 실행되도록 맞춘다.
    this.validateIntentPayload(routedDto, visibleEntities);
    const response = await this.dispatchMainCommandIntent(
      requestId,
      userId,
      context,
      routedDto,
      visibleEntities,
      recentLogs,
      publicClues,
      { interpreted: parsed },
    );

    return {
      ...response,
      data: {
        ...(response.data ?? {}),
        // 자유입력은 원본 DTO가 GENERAL_GM_REQUEST라서, 로그에는 실제 라우팅된 명령 정보를 함께 남긴다.
        effectiveMainCommand: this.buildEffectiveMainCommandData(routedDto),
        interpreterRoute: this.buildInterpreterRouteData(route),
      },
    };
  }

  private buildInterpreterRoutedMainCommandDto(
    dto: SubmitMainCommandDto,
    intent: MainCommandIntent,
    visibleEntities: VisibleSceneEntity[],
    parsed: InterpreterParsedForRouting
  ): SubmitMainCommandDto {
    const target = this.resolveInterpreterRouteTarget(
      dto,
      intent,
      visibleEntities,
      parsed.action.targetId
    );
    return {
      ...dto,
      commandId: intent,
      intent,
      targetId: dto.targetId ?? target?.id,
      targetType: dto.targetType ?? target?.kind,
      itemId: dto.itemId ?? parsed.mentionedItemId ?? undefined,
      spellId: dto.spellId ?? parsed.action.spellId ?? parsed.mentionedSpellId ?? undefined,
    };
  }

  private resolveInterpreterRouteTarget(
    dto: SubmitMainCommandDto,
    intent: MainCommandIntent,
    visibleEntities: VisibleSceneEntity[],
    interpreterTargetId?: string | null
  ): VisibleSceneEntity | null {
    const requirement = INTENT_REQUIREMENTS[intent];
    const allowedTargetTypes = requirement?.requiresTargetTypes ?? requirement?.allowsTargetTypes;
    const candidates = allowedTargetTypes?.length
      ? visibleEntities.filter((entity) => allowedTargetTypes.includes(entity.kind))
      : visibleEntities;
    if (dto.targetId) {
      const normalizedTargetId = dto.targetId.trim().toLowerCase();
      return (
        candidates.find((entity) => entity.id.trim().toLowerCase() === normalizedTargetId) ?? null
      );
    }

    const matchedByText = this.resolveEntityMentionedInText(dto.playerText, candidates);
    if (matchedByText) {
      return matchedByText;
    }

    // 자유 입력에서 대상 후보가 여럿이면 AI가 임의로 고른 targetId를 믿지 않는다.
    // 사용자가 이름을 쓰거나 대상 선택 버튼으로 지정한 경우에만 특정 대상으로 진행한다.
    if (candidates.length > 1 && requirement?.requiresTargetTypes) {
      return null;
    }

    if (interpreterTargetId) {
      const normalizedTargetId = interpreterTargetId.trim().toLowerCase();
      const matchedByInterpreter = candidates.find(
        (entity) => entity.id.trim().toLowerCase() === normalizedTargetId
      );
      if (matchedByInterpreter) {
        return matchedByInterpreter;
      }
    }

    const routedDto: SubmitMainCommandDto = {
      ...dto,
    };

    return this.resolveEntity(routedDto, candidates, dto.targetType);
  }

  private getMissingInterpreterRouteRequirementMessage(dto: SubmitMainCommandDto): string | null {
    const requirement = INTENT_REQUIREMENTS[dto.intent];
    if (!requirement) {
      return null;
    }

    if (requirement.requiresItem && !dto.itemId) {
      return '이 요청은 아이템 선택이 필요합니다. 아이템 선택 버튼에서 사용할 아이템을 고른 뒤 다시 입력해주세요.';
    }

    if (requirement.requiresSpell && !dto.spellId) {
      return '이 요청은 주문 선택이 필요합니다. 주문 선택 버튼에서 사용할 주문을 고른 뒤 다시 입력해주세요.';
    }

    if (requirement.requiresMapPoint && !dto.mapPoint) {
      return '이 요청은 지도 좌표 선택이 필요합니다. 좌표 선택 버튼에서 지점을 고른 뒤 다시 입력해주세요.';
    }

    if (requirement.requiresTargetTypes && !dto.targetId) {
      return '이 요청은 대상 선택이 필요합니다. 대상 선택 버튼에서 대상을 고른 뒤 다시 입력해주세요.';
    }

    return null;
  }

  private buildInterpreterRouteData(
    route: ResolvedInterpreterActionRoute
  ): Record<string, unknown> {
    return route.config.route === 'MAIN_COMMAND'
      ? {
          actionType: route.actionType,
          route: route.config.route,
          intent: route.config.intent,
        }
      : {
          actionType: route.actionType,
          route: route.config.route,
        };
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
    switch (dto.intent) {
      case MainCommandIntent.TALK_TO_NPC:
        return await this.handleNpcDialogue(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.SOCIAL_PERSUADE:
        return await this.handleSocialPersuade(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.SOCIAL_INTIMIDATE:
        return await this.handleSocialIntimidate(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.SOCIAL_DECEIVE:
        return await this.handleSocialDeceive(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.READ_EMOTION:
        return await this.handleReadEmotion(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.INSPECT_STORY_OBJECT:
        return await this.handleInspectStoryObject(
          requestId,
          userId,
          context,
          dto,
          visibleEntities
        );
      case MainCommandIntent.DECLARE_RP_ACTION:
        return this.handleDeclareRpAction(requestId, context, dto);
      case MainCommandIntent.ASK_SCENE_INFO:
        return this.handleSceneInfo(requestId, context, dto, visibleEntities);
      case MainCommandIntent.ASK_HINT:
        return await this.handleHint(requestId, userId, context, dto, recentLogs, publicClues);
      case MainCommandIntent.ASK_SUMMARY:
        return await this.handleSummary(requestId, userId, context, dto, recentLogs);
      case MainCommandIntent.REQUEST_SCENE_TRANSITION:
        return await this.handleSceneTransition(requestId, context, dto, recentLogs);
      case MainCommandIntent.OBSERVE_AREA:
        return this.handleObserveArea(requestId, context, dto);
      case MainCommandIntent.INVESTIGATE_OBJECT:
        return await this.handleInvestigateObject(requestId, userId, context, dto, visibleEntities, options.interpreted);
      case MainCommandIntent.LISTEN:
        return await this.handleListen(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.DETECT_DANGER:
        return await this.handleDetectDanger(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.SPECIAL_MOVE:
        return await this.handleSpecialMove(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.INTERACT_OBJECT:
        return await this.handleInteractObject(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.USE_TOOL:
        return await this.handleUseTool(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.USE_ITEM_EXPLORE:
        return await this.handleUseItemExplore(requestId, userId, context, dto, visibleEntities);
      case MainCommandIntent.SPLIT_PARTY_TASK:
        return await this.handleSplitPartyTask(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.COMBAT_MANEUVER:
        return await this.handleCombatManeuver(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.ENVIRONMENT_USE:
        return await this.handleEnvironmentUse(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.IMPROVISED_ATTACK:
        return await this.handleImprovisedAttack(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.CALLED_SHOT:
        return await this.handleCalledShot(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.READY_ACTION:
        return await this.handleReadyAction(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.REACTION_REQUEST:
        return await this.handleReactionRequest(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.COMBAT_TALK:
        return await this.handleCombatTalk(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.USE_ITEM_COMBAT:
        return await this.handleUseItemCombat(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.USE_SPELL_CREATIVELY:
        return await this.handleUseSpellCreatively(
          requestId,
          userId,
          context,
          dto,
          visibleEntities,
          recentLogs
        );
      case MainCommandIntent.TACTIC_QUERY:
        return await this.handleTacticQuery(
          requestId,
          userId,
          context,
          dto,
          recentLogs,
          publicClues
        );
      case MainCommandIntent.ASK_RULE:
        return await this.handleRuleQuery(requestId, userId, context, dto, visibleEntities);
      default:
        return {
          requestId,
          status: MainCommandStatus.IMPOSSIBLE,
          message: '처리할 수 없는 요청입니다.',
        };
    }
  }

  private async handleCombatTalk(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '누구에게 어떤 말투와 의도로 말하는지 조금 더 구체적으로 적어주세요.',
      };
    }

    const actionSummary =
      interpreter.parsed.action.approach?.trim() ||
      interpreter.parsed.action.type ||
      dto.playerText;
    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
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
    visibleEntities: VisibleSceneEntity[]
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: '설득할 NPC를 지정하지 않았습니다. 공개된 대상 중 누구를 설득하는지 골라주세요.',
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${npc.name}을(를) 어떤 근거로 설득하려는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const normalizedDisposition = npc.disposition.trim().toLowerCase();
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${npc.name} 설득에는 판정이 필요합니다.`,
        checkOptions: this.buildPersuasionCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (normalizedDisposition === 'hostile' && confidence < 0.65) {
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
    visibleEntities: VisibleSceneEntity[]
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: '압박할 NPC를 지정하지 않았습니다. 공개된 대상 중 누구를 압박하는지 골라주세요.',
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );

    const bypassClarification = this.canUseExplicitPlayerText(dto, {
      acceptsTarget: true,
    });
    if (interpreter.parsed.needsClarification && !bypassClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${npc.name}에게 어떤 위협이나 압박을 가하는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const normalizedDisposition = npc.disposition.trim().toLowerCase();
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
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

    if (normalizedDisposition === 'friendly' && confidence < 0.7) {
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
    visibleEntities: VisibleSceneEntity[]
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: '속일 NPC를 지정하지 않았습니다. 공개된 대상 중 누구를 속이는지 골라주세요.',
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${npc.name}에게 어떤 거짓 정보나 신분을 제시하는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const npc = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.NPC),
      MainCommandTargetType.NPC
    );

    if (!npc) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message:
          '읽어볼 NPC를 지정하지 않았습니다. 공개된 대상 중 누구의 반응을 읽을지 골라주세요.',
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 6))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${npc.name}의 어떤 감정이나 반응을 읽고 싶은지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;

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
    visibleEntities: VisibleSceneEntity[]
  ): Promise<MainCommandResponseDto> {
    const objectTarget = this.resolveEntity(
      dto,
      visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.OBJECT),
      MainCommandTargetType.OBJECT
    );

    if (!objectTarget) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message:
          '살펴볼 오브젝트를 지정하지 않았습니다. 공개된 물건이나 단서 중 하나를 골라주세요.',
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${objectTarget.name}의 어떤 부분을 살펴보는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${objectTarget.name}을(를) 자세히 조사하려면 판정이 필요합니다.`,
        checkOptions: this.buildInvestigationCheckOptions(
          interpreter.parsed.action,
          objectTarget.name
        ),
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

  private handleDeclareRpAction(
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto
  ): MainCommandResponseDto {
    const actionSummary = dto.playerText.trim();

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: 'RP 행동을 기록했습니다.',
      actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
    };
  }

  private async handleObserveArea(
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto
  ): Promise<MainCommandResponseDto> {
    const actionSummary = dto.playerText.trim() || '주변을 살핀다';

    return {
      requestId,
      status: MainCommandStatus.CHECK_REQUIRED,
      message: '주변을 면밀하게 살피려면 판정이 필요합니다.',
      checkOptions: this.buildPerceptionCheckOptions({
        ability: 'wis',
        skill: 'perception',
        approach: actionSummary,
        suggestedDifficulty: 'medium',
      }),
      actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
    };
  }

  private async handleInvestigateObject(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    interpreted?: InterpreterParsedForRouting,
  ): Promise<MainCommandResponseDto> {
    if (dto.mapPoint) {
      const objectResult = await this.sessionsService.describeVttObjectAtPoint({
        sessionId: context.sessionId,
        sessionScenarioId: context.sessionScenarioId,
        nodeId: context.currentNodeId,
        mapPoint: dto.mapPoint,
      });

      if (objectResult) {
        if (objectResult.checkOptions?.length) {
          return {
            requestId,
            status: MainCommandStatus.CHECK_REQUIRED,
            message: objectResult.message,
            checkOptions: objectResult.checkOptions,
            actionCandidate: this.buildActionCandidate(context, dto, dto.playerText),
          };
        }
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
        entity.kind === MainCommandTargetType.OBJECT || entity.kind === MainCommandTargetType.AREA
    );
    const target = dto.targetId
      ? this.resolveEntity(dto, investigationTargets, dto.targetType)
      : null;

    const interpreter = interpreted
      ? { parsed: interpreted }
      : await this.aiService.runInterpreter(
          context.sessionId,
          userId,
          this.buildInterpreterPayload(context, dto, visibleEntities),
        );

    const bypassClarification = this.canUseExplicitPlayerText(dto, {
      acceptsMapPoint: true,
      acceptsTarget: Boolean(target),
    });
    if (interpreter.parsed.needsClarification && !bypassClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '무엇을 어떻게 조사하는지 조금 더 구체적으로 적어주세요.',
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      const label = target?.name ?? '해당 위치';
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

    if (dto.playerText.trim()) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${actionSummary} 조사는 대상 확인이나 현장 판정이 필요합니다.`,
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.IMPOSSIBLE,
      message: '조사할 대상이나 위치를 지정하지 않았습니다.',
      actionCandidate,
    };
  }

  private async handleListen(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const listenTargets = visibleEntities.filter(
      (entity) =>
        entity.kind === MainCommandTargetType.OBJECT || entity.kind === MainCommandTargetType.AREA
    );
    const target = dto.targetId ? this.resolveEntity(dto, listenTargets, dto.targetType) : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '어느 쪽이나 어떤 지점을 향해 귀를 기울이는지 조금 더 구체적으로 적어주세요.',
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: '미세한 소리나 기척을 알아내려면 판정이 필요합니다.',
        checkOptions: this.buildPerceptionCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const pointSummary = dto.mapPoint
      ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 부근에 귀를 기울였습니다.`
      : '';
    const targetSummary = target
      ? ` ${target.name} 쪽에서 공개적으로 들을 수 있는 이상한 소리는 없습니다.`
      : ' 공개된 범위에서는 이상한 소리나 기척이 바로 드러나지 않습니다.';

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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const dangerTargets = visibleEntities.filter(
      (entity) =>
        entity.kind === MainCommandTargetType.OBJECT || entity.kind === MainCommandTargetType.AREA
    );
    const target = dto.targetId ? this.resolveEntity(dto, dangerTargets, dto.targetType) : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '어느 위치의 어떤 위험을 경계하는지 조금 더 구체적으로 적어주세요.',
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: '숨은 위험이나 매복을 감지하려면 판정이 필요합니다.',
        checkOptions: this.buildDangerDetectionCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const targetSummary = target
      ? ` ${target.name} 부근에서 즉시 드러난 위험은 보이지 않습니다.`
      : ' 즉시 드러난 위험 신호는 보이지 않습니다.';
    const pointSummary = dto.mapPoint
      ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 주변을 경계했습니다.`
      : '';

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
    visibleEntities: VisibleSceneEntity[]
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '어느 위치로 어떤 방식으로 이동하려는지 조금 더 구체적으로 적어주세요.',
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      ) ||
      interpreter.parsed.action.confidence < 0.8
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: '특수 이동을 시도하려면 판정이 필요합니다.',
        checkOptions: this.buildSpecialMoveCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const itemSummary = dto.itemId ? ` 도구 ${dto.itemId} 사용을 함께 고려합니다.` : '';
    const moveResult = await this.sessionsService.moveSessionCharacterTokenToMapPoint({
      sessionId: context.sessionId,
      sessionCharacterId: context.sessionCharacterId,
      mapPoint: dto.mapPoint!,
    });

    return {
      requestId,
      status: moveResult.status,
      message:
        moveResult.status === MainCommandStatus.RESOLVED
          ? `(${dto.mapPoint?.x}, ${dto.mapPoint?.y}) 방향 특수 이동에 성공했습니다.${itemSummary}\n\n${moveResult.message}`
          : moveResult.message,
      actionCandidate,
    };
  }

  private async handleInteractObject(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[]
  ): Promise<MainCommandResponseDto> {
    if (dto.mapPoint) {
      if (this.isHazardDisarmInteraction(dto.playerText)) {
        const hazardResult = await this.sessionsService.disarmVttHazardAtPoint({
          sessionId: context.sessionId,
          sessionScenarioId: context.sessionScenarioId,
          nodeId: context.currentNodeId,
          mapPoint: dto.mapPoint,
        });

        if (hazardResult) {
          return {
            requestId,
            status: hazardResult.status,
            message: hazardResult.message,
            checkOptions: hazardResult.checkOptions,
            data: hazardResult.checkEffect ? { checkEffect: hazardResult.checkEffect } : null,
            actionCandidate: this.buildActionCandidate(context, dto, dto.playerText),
          };
        }
      }

      const doorResult = this.isDoorBreakInteraction(dto.playerText)
        ? await this.sessionsService.breakVttDoorAtPoint({
            sessionId: context.sessionId,
            sessionScenarioId: context.sessionScenarioId,
            nodeId: context.currentNodeId,
            mapPoint: dto.mapPoint,
          })
        : await this.sessionsService.openVttDoorAtPoint({
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
      MainCommandTargetType.OBJECT
    );

    if (!objectTarget) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message:
          '조작할 오브젝트를 지정하지 않았습니다. 공개된 문, 상자, 장치 중 하나를 골라주세요.',
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${objectTarget.name}을(를) 어떤 방식으로 조작하는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${objectTarget.name}을(를) 조작하려면 판정이 필요합니다.`,
        checkOptions: this.buildObjectInteractionCheckOptions(
          interpreter.parsed.action,
          objectTarget.name
        ),
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

  private isDoorBreakInteraction(text: string): boolean {
    return /부수|부숴|부쉈|파괴|깨뜨|깨부|박살|강제로\s*열|힘으로/.test(text);
  }

  private isHazardDisarmInteraction(text: string): boolean {
    return /(함정|덫|트랩|위험|장치).*(해제|무력화|분해|제거)|(해제|무력화|분해|제거).*(함정|덫|트랩|위험|장치)/.test(
      text
    );
  }

  private async handleUseTool(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[]
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const toolName = this.resolveOwnedItemName(context, dto.itemId);
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? '어디에';
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${toolName}을(를) ${targetLabel} 어떤 방식으로 사용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${toolName} 사용에는 판정이 필요합니다.`,
        checkOptions: this.buildToolUseCheckOptions(
          interpreter.parsed.action,
          toolName,
          target?.name
        ),
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
    visibleEntities: VisibleSceneEntity[]
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const itemName = this.resolveOwnedItemName(context, dto.itemId);
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? '어디에';
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${itemName}을(를) ${targetLabel} 어떤 방식으로 활용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${itemName}의 창의적 활용에는 판정이 필요합니다.`,
        checkOptions: this.buildItemExploreCheckOptions(
          interpreter.parsed.action,
          itemName,
          target?.name
        ),
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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 6))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '누가 무엇을 맡을지 조금 더 분명하게 적어주세요.',
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          '분담 계획은 이해했지만 역할 구분이 아직 모호합니다. 각 인원이 맡을 일을 더 구체적으로 적어주세요.',
        actionCandidate,
      };
    }

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: '이 분담 계획은 판정과 순서 조율이 함께 필요해 GM 승인이 필요합니다.',
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: '파티 분담 계획을 적용하려면 GM 승인이 필요합니다.',
      actionCandidate,
    };
  }

  private async handleCombatManeuver(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '어떤 전투 기동을 시도할지 조금 더 구체적으로 적어주세요.',
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: '이 전투 기동에는 판정이 필요합니다.',
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: '이 전투 기동을 적용하려면 상황 판정과 GM 승인이 필요합니다.',
      actionCandidate,
    };
  }

  private async handleEnvironmentUse(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[]
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? '주변 환경';
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${targetLabel}을(를) 전투에 어떻게 활용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: '환경 활용 시도에는 판정이 필요합니다.',
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const targetLabel = target?.name ?? locationLabel ?? '주변 환경';
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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const target = this.resolveEntity(dto, visibleEntities, dto.targetType);
    if (!target) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: '즉석 공격 대상을 특정할 수 없습니다. 공개된 적이나 오브젝트를 골라주세요.',
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${target.name}을(를) 어떤 식으로 즉석 공격할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: '즉석 공격에는 판정이 필요합니다.',
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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const target = this.resolveEntity(dto, visibleEntities, dto.targetType);
    if (!target) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: '정밀 사격 대상을 특정할 수 없습니다. 공개된 적을 골라주세요.',
      };
    }

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${target.name}의 어느 부위를 어떻게 노릴지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: '정밀 사격에는 추가 판정이 필요합니다.',
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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '어떤 상황이 오면 무엇을 할지 더 분명하게 적어주세요.',
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          '준비 행동의 발동 조건이 아직 모호합니다. 트리거와 실행 행동을 더 구체적으로 적어주세요.',
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: '준비 행동은 발동 조건과 실행 순서를 함께 확인해야 해서 GM 승인이 필요합니다.',
      checkOptions: this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          '어떤 상황에 반응하려는지와 어떤 반응을 하려는지 더 분명하게 적어주세요.',
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          '반응 조건이나 대응 방식이 아직 모호합니다. 어떤 트리거에 어떤 반응을 하려는지 더 구체적으로 적어주세요.',
        actionCandidate,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message:
        '반응 행동은 현재 트리거 성립 여부와 실행 순서를 함께 확인해야 해서 GM 승인이 필요합니다.',
      checkOptions: this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const itemName = this.resolveOwnedItemName(context, dto.itemId);
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? '어디에';
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${itemName}을(를) ${targetLabel} 어떻게 전투에 사용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          '전투 아이템 사용 방식이 아직 모호합니다. 대상과 사용 방식을 더 구체적으로 적어주세요.',
        actionCandidate,
      };
    }

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
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
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const spellName = dto.spellId?.trim() || '주문';
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(0, 4))
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? '어디에';
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          interpreter.parsed.clarificationQuestion ??
          `${spellName}을(를) ${targetLabel} 어떻게 창의적으로 사용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < 0.55) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: '주문 활용 방식이 아직 모호합니다. 대상과 의도를 더 구체적으로 적어주세요.',
        actionCandidate,
      };
    }

    if (
      this.shouldRequireMainCommandCheck(
        interpreter.parsed.action,
        dto,
        interpreter.parsed.needsClarification
      )
    ) {
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
    publicClues: string[]
  ): Promise<MainCommandResponseDto> {
    const eventHints = await this.loadUntriggeredVttEventHintSummaries(context);

    if (publicClues.length > 0 && eventHints.length === 0) {
      const revealedClues = await this.loadRevealedClueSummaries(context.sessionScenarioId);
      const revealedClueText = this.normalizeTransitionConditionText(revealedClues.join(' '));
      const unrevealedClues = publicClues.filter(
        (clue) => !this.textEvidenceMatches(clue, revealedClueText)
      );
      if (unrevealedClues.length === 0) {
        return {
          requestId,
          status: MainCommandStatus.MESSAGE,
          message: '이 장면의 단서를 모두 찾았습니다. 다음 장면으로 진행하세요.',
        };
      }
    }

    const result = await this.aiService.runHint(
      userId,
      context.sessionId,
      {
        hintLevel: 'NORMAL',
        question: dto.playerText,
        sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
        recentLogs: recentLogs.slice(0, 5),
        publicClues: [...publicClues, ...eventHints],
      },
      { emitSystemMessage: false }
    );

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: result.parsed.content,
    };
  }

  private async loadUntriggeredVttEventHintSummaries(context: LoadedContext): Promise<string[]> {
    const map = await this.sessionsService
      .getVttMapForSessionScenario(context.sessionId, context.sessionScenarioId)
      .catch(() => null);
    if (!map) {
      return [];
    }

    const eventEntries = this.extractUntriggeredVttObjectEventHints(map);
    if (!eventEntries.length) {
      return [];
    }

    const onceEventIds = eventEntries.map((entry) => entry.eventId);
    const revealedEventIds = new Set(
      (
        await this.prisma.sessionReveal.findMany({
          where: {
            sessionScenarioId: context.sessionScenarioId,
            contentKind: 'event',
            contentId: { in: onceEventIds },
          },
          select: { contentId: true },
        })
      ).map((reveal) => reveal.contentId)
    );

    return eventEntries
      .filter((entry) => !revealedEventIds.has(entry.eventId))
      .slice(0, 5)
      .map(({ hint }) => this.formatVttObjectEventHint(hint));
  }

  private extractUntriggeredVttObjectEventHints(
    map: VttMapStateDto
  ): Array<{ eventId: string; hint: VttObjectEventHint }> {
    return (map.objectCells ?? []).flatMap((objectCell) => {
      if (objectCell.visibleToPlayers === false) {
        return [];
      }

      const objectName =
        objectCell.name?.trim() || objectCell.description?.trim().slice(0, 80) || '지도 오브젝트';

      return (objectCell.events ?? [])
        .filter(
          (event) => event.type === 'REVEAL_FOG_ON_PROXIMITY' && event.trigger?.once !== false
        )
        .map((event) => ({
          eventId: event.id,
          hint: {
            objectName,
            eventName: event.name?.trim() || null,
            distanceFeet: this.clampHintNumber(event.trigger?.distanceFeet, 0, 500, 15),
            revealRadiusFeet: this.clampHintNumber(event.effect?.revealRadiusFeet, 5, 500, 30),
          },
        }));
    });
  }

  private formatVttObjectEventHint(hint: VttObjectEventHint): string {
    const eventLabel = hint.eventName ? ` (${hint.eventName})` : '';
    return [
      `아직 발동하지 않은 지도 이벤트: ${hint.objectName}${eventLabel}`,
      `${hint.distanceFeet}ft 이내로 접근하면 숨겨진 공간이나 안개가 드러날 수 있습니다.`,
      `드러나는 범위: ${hint.revealRadiusFeet}ft.`,
    ].join(' ');
  }

  private async handleSummary(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    const logs = recentLogs.length
      ? recentLogs
      : [`${context.currentNodeTitle}: ${context.currentNodeSceneText}`];
    const result = await this.aiService.runSummary(
      userId,
      context.sessionId,
      {
        summaryType: 'player_visible',
        rangeType: 'RECENT',
        lastLogCount: Math.min(logs.length, 12),
        nodeId: context.currentNodeId,
        logs,
      },
      { emitSystemMessage: false }
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
    visibleEntities: VisibleSceneEntity[]
  ): MainCommandResponseDto {
    const entity = this.resolveEntity(dto, visibleEntities, dto.targetType);
    if (entity) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: `${entity.name}: ${entity.summary}`,
      };
    }

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: context.currentNodeSceneText,
    };
  }

  private async handleSceneTransition(
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[]
  ): Promise<MainCommandResponseDto> {
    if (this.isEndingNode(context.currentNodeNodeMetaJson)) {
      await this.sessionsService.completeSessionFromEndingNode({
        sessionId: context.sessionId,
        sessionScenarioId: context.sessionScenarioId,
        nodeId: context.currentNodeId,
        reason: 'ending_node',
      });

      return {
        requestId,
        status: MainCommandStatus.RESOLVED,
        message: `${context.currentNodeTitle}에서 이야기가 마무리되었습니다. 세션이 완료되었습니다.`,
        data: {
          completedNodeId: context.currentNodeId,
          completionReason: 'ending_node',
        },
      };
    }

    const candidates = await this.loadTransitionCandidates(context);
    if (!candidates.length) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: '현재 화면에서 이동 가능한 다음 노드가 없습니다.',
      };
    }

    const matched = this.matchTransitionCandidate(candidates, dto);
    if (matched) {
      const conditionResult = await this.evaluateTransitionConditionWithEvidence(
        context,
        matched,
        dto,
        recentLogs
      );
      return await this.resolveSceneTransition(requestId, context, matched, conditionResult);
    }

    if (candidates.length === 1) {
      const target = candidates[0];
      const conditionResult = await this.evaluateTransitionConditionWithEvidence(
        context,
        target,
        dto,
        recentLogs
      );
      return await this.resolveSceneTransition(requestId, context, target, conditionResult);
    }

    const evaluatedCandidates = await this.evaluateTransitionCandidatesWithRevealedClues(
      context,
      candidates,
      dto,
      recentLogs
    );
    const satisfiedCandidates = evaluatedCandidates.filter(
      (candidate) => candidate.conditionResult.satisfied
    );
    if (satisfiedCandidates.length === 1) {
      const candidate = satisfiedCandidates[0];
      return await this.resolveSceneTransition(
        requestId,
        context,
        candidate.target,
        candidate.conditionResult
      );
    }

    if (satisfiedCandidates.length > 1) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `이동 가능한 분기가 여러 개입니다. 목적지를 지정해주세요. 가능한 목적지: ${satisfiedCandidates
          .map((item) => item.target.title)
          .join(', ')}`,
      };
    }

    const reviewCandidate = evaluatedCandidates.find(
      (candidate) => candidate.conditionResult.needsReview
    );
    if (reviewCandidate) {
      return this.buildBlockedSceneTransitionResponse(
        requestId,
        reviewCandidate.target,
        reviewCandidate.conditionResult
      );
    }

    const blockedCandidates = evaluatedCandidates.filter(
      (candidate) => candidate.conditionResult.missingTerms.length
    );
    return {
      requestId,
      status: MainCommandStatus.IMPOSSIBLE,
      message: '아직 앞으로 나아갈 길을 찾지 못했습니다.',
      data: {
        transitionConditions: blockedCandidates.map((candidate) => ({
          targetNodeId: candidate.target.nodeId,
          targetTitle: candidate.target.title,
          transitionCondition: candidate.target.condition ?? null,
          missingTerms: candidate.conditionResult.missingTerms,
        })),
      },
    };
  }

  private isEndingNode(nodeMetaJson: string | null): boolean {
    const nodeMeta = this.parseJson<Record<string, unknown> | null>(nodeMetaJson, null);
    if (!nodeMeta) {
      return false;
    }

    return nodeMeta.isEndingNode === true || nodeMeta.endBehavior === 'SESSION_COMPLETE';
  }

  private async resolveSceneTransition(
    requestId: string,
    context: LoadedContext,
    target: TransitionCandidate,
    conditionResult: TransitionConditionEvaluation
  ): Promise<MainCommandResponseDto> {
    if (!conditionResult.satisfied) {
      return this.buildBlockedSceneTransitionResponse(requestId, target, conditionResult);
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

  private buildBlockedSceneTransitionResponse(
    requestId: string,
    target: TransitionCandidate,
    conditionResult: TransitionConditionEvaluation
  ): MainCommandResponseDto {
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

  private async handleTacticQuery(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[]
  ): Promise<MainCommandResponseDto> {
    const result = await this.aiService.runHint(
      userId,
      context.sessionId,
      {
        hintLevel: 'NORMAL',
        question: dto.playerText,
        sceneSummary: `${context.currentNodeTitle}: ${context.currentNodeSceneText}`,
        recentLogs: recentLogs.slice(0, 5),
        publicClues,
      },
      { emitSystemMessage: false }
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
    visibleEntities: VisibleSceneEntity[]
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities)
    );
    const matchingRules = this.loadRuleFragments().filter((fragment) =>
      interpreter.parsed.requiredRuleCheckIds?.includes(fragment.id)
    );

    if (!matchingRules.length) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          '지금 질문에서 바로 연결할 규칙 조각을 찾지 못했습니다. 행동, 대상, 주문 이름을 조금 더 구체적으로 적어주세요.',
      };
    }

    const relatedIntentText = dto.relatedIntent ? `관련 명령: ${dto.relatedIntent}. ` : '';
    const lines = matchingRules
      .slice(0, 3)
      .map((fragment) => `${fragment.titleKo}: ${fragment.summaryKo}`);

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${relatedIntentText}${lines.join(' / ')}`,
    };
  }

  private buildInterpreterPayload(
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs?: string[]
  ) {
    const resolvedTarget = dto.targetId
      ? this.resolveEntity(dto, visibleEntities, dto.targetType)
      : null;

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

  private async buildTransitionEvidence(
    context: LoadedContext,
    recentLogs: string[]
  ): Promise<TransitionEvidence> {
    const flags = this.parseJson<Record<string, unknown>>(context.flagsJson, {});
    const completedCombatNodeIds = Array.isArray(flags.completedCombatNodeIds)
      ? flags.completedCombatNodeIds.filter((value): value is string => typeof value === 'string')
      : [];
    const revealedClueState = await this.loadRevealedClueState(context.sessionScenarioId);
    const revealedClues = revealedClueState.summaries;
    const revealedClueText = this.normalizeTransitionConditionText(revealedClues.join(' '));
    const unrevealedClues = this.extractPublicClueSummaries(context.currentNodeCluesJson).filter(
      (clue) => !this.textEvidenceMatches(clue, revealedClueText)
    );
    const visitedNodeIds = await this.loadVisitedNodeIds(context.sessionScenarioId);

    return {
      recentLogs,
      revealedClues,
      revealedClueIds: revealedClueState.ids,
      unrevealedClues,
      visitedNodeIds,
      flags,
      currentNodeId: context.currentNodeId,
      combatResolvedForCurrentNode: completedCombatNodeIds.includes(context.currentNodeId),
    };
  }

  private async loadRevealedClueSummaries(sessionScenarioId: string): Promise<string[]> {
    return (await this.loadRevealedClueState(sessionScenarioId)).summaries;
  }

  private async loadRevealedClueState(
    sessionScenarioId: string
  ): Promise<{ ids: string[]; summaries: string[] }> {
    const reveals = await this.prisma.sessionReveal.findMany({
      where: {
        sessionScenarioId,
        contentKind: 'clue',
      },
      orderBy: { revealedAt: 'asc' },
    });

    return {
      ids: reveals.map((reveal) => reveal.contentId),
      summaries: reveals
        .map((reveal) => {
          const snapshot = this.parseJson<Record<string, unknown>>(reveal.snapshotJson, {});
          const title = this.readString(snapshot.title) ?? reveal.contentId;
          const text =
            this.readString(snapshot.handoutText) ??
            this.readString(snapshot.playerText) ??
            this.readString(snapshot.text) ??
            this.readString(snapshot.revelation);
          return [title, text].filter((value): value is string => Boolean(value)).join(': ');
        })
        .filter(Boolean),
    };
  }

  private async loadVisitedNodeIds(sessionScenarioId: string): Promise<string[]> {
    const visits = await this.prisma.sessionNodeVisit.findMany({
      where: { sessionScenarioId },
      select: { nodeId: true },
    });
    return visits.map((visit) => visit.nodeId);
  }

  private loadRuleFragments(): RuleFragmentSummary[] {
    if (this.ruleFragmentsCache) {
      return this.ruleFragmentsCache;
    }

    const candidatePaths = [
      join(process.cwd(), 'srd-data', 'generated', 'srd', 'rule_fragments.jsonl'),
      join(process.cwd(), '..', 'srd-data', 'generated', 'srd', 'rule_fragments.jsonl'),
      join(process.cwd(), 'ai', 'generated', 'srd', 'rule_fragments.jsonl'),
      join(process.cwd(), '..', 'ai', 'generated', 'srd', 'rule_fragments.jsonl'),
    ];
    const ruleFragmentsPath = candidatePaths.find((candidate) => existsSync(candidate));
    if (!ruleFragmentsPath) {
      this.ruleFragmentsCache = [];
      return this.ruleFragmentsCache;
    }

    const content = readFileSync(ruleFragmentsPath, 'utf8');
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
    const dc = this.resolveCheckDc(action.suggestedDifficulty);
    if (!action.ability && !action.skill) {
      return [
        {
          dc,
          reason: action.approach,
        },
      ];
    }

    return [
      {
        ...(action.ability ? { ability: action.ability } : {}),
        ...(action.skill ? { skill: action.skill } : {}),
        dc,
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
    npcName: string
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: 'cha',
        skill: 'persuasion',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
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
    npcName: string
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: 'cha',
        skill: 'intimidation',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
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
    npcName: string
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: 'cha',
        skill: 'deception',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
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
    npcName: string
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: 'wis',
        skill: 'insight',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
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
    objectName: string
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: 'int',
        skill: 'investigation',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty
          ? `${objectName} 조사 (난이도 제안: ${action.suggestedDifficulty})`
          : `${objectName} 조사`,
      },
    ];
  }

  private buildPerceptionCheckOptions(action: {
    ability?: string | null;
    skill?: string | null;
    approach: string;
    suggestedDifficulty?: string | null;
  }): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: 'wis',
        skill: 'perception',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty
          ? `주변 관찰 (난이도 제안: ${action.suggestedDifficulty})`
          : '주변 관찰',
      },
    ];
  }

  private buildDangerDetectionCheckOptions(action: {
    ability?: string | null;
    skill?: string | null;
    approach: string;
    suggestedDifficulty?: string | null;
  }): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: 'wis',
        skill: 'perception',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty
          ? `위험 감지 (난이도 제안: ${action.suggestedDifficulty})`
          : '위험 감지',
      },
    ];
  }

  private buildSpecialMoveCheckOptions(action: {
    ability?: string | null;
    skill?: string | null;
    approach: string;
    suggestedDifficulty?: string | null;
  }): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: 'str',
        skill: 'athletics',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty
          ? `특수 이동 (난이도 제안: ${action.suggestedDifficulty})`
          : '특수 이동',
      },
      {
        ability: 'dex',
        skill: 'acrobatics',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty
          ? `특수 이동 대안(난이도 제안: ${action.suggestedDifficulty})`
          : '특수 이동 대안',
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
    objectName: string
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    return [
      {
        ability: 'dex',
        skill: 'sleight_of_hand',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
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
    targetName?: string
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    const reasonTarget = targetName ? ` ${targetName}에` : '';

    return [
      {
        ability: 'dex',
        skill: 'sleight_of_hand',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
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
    targetName?: string
  ): MainCommandCheckOptionDto[] {
    if (action.ability || action.skill) {
      return this.buildCheckOptions(action);
    }

    const reasonTarget = targetName ? ` ${targetName}에` : '';

    return [
      {
        ability: 'dex',
        skill: 'sleight_of_hand',
        dc: this.resolveCheckDc(action.suggestedDifficulty),
        reason: action.suggestedDifficulty
          ? `${itemName}${reasonTarget} 창의적 활용 (난이도 제안: ${action.suggestedDifficulty})`
          : `${itemName}${reasonTarget} 창의적 활용`,
      },
    ];
  }

  private resolveCheckDc(suggestedDifficulty?: string | null): number {
    const normalized = suggestedDifficulty?.trim().toLowerCase() ?? '';
    const explicitDc = normalized.match(/\b(?:dc\s*)?([1-3]?\d)\b/);
    if (explicitDc) {
      const dc = Number(explicitDc[1]);
      if (Number.isInteger(dc) && dc >= 5 && dc <= 30) {
        return dc;
      }
    }

    const compact = normalized.replace(/[\s_-]+/g, '');
    if (
      compact.includes('trivial') ||
      compact.includes('veryeasy') ||
      compact.includes('매우쉬움')
    ) {
      return 5;
    }
    if (compact.includes('easy') || compact.includes('쉬움') || compact.includes('낮음')) {
      return 10;
    }
    if (
      compact.includes('hard') ||
      compact.includes('difficult') ||
      compact.includes('어려움') ||
      compact.includes('높음')
    ) {
      return compact.includes('very') || compact.includes('매우') ? 25 : 20;
    }
    if (
      compact.includes('nearlyimpossible') ||
      compact.includes('impossible') ||
      compact.includes('거의불가능')
    ) {
      return 30;
    }

    return 8;
  }

  private resolveOwnedItemName(context: LoadedContext, itemId?: string | null): string {
    if (!itemId) {
      return '도구';
    }

    const normalized = itemId.trim().toLowerCase();
    const matched = context.inventoryItems.find((item) =>
      [item.id, item.itemDefinitionId, item.name]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase())
        .includes(normalized)
    );

    return matched?.name ?? itemId;
  }

  private buildActionCandidate(
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    actionSummary: string
  ): MainCommandActionCandidateDto {
    return {
      actorId: context.actorCharacterId,
      targetId: dto.targetId ?? null,
      actionSummary,
      declaredMethod: dto.playerText,
    };
  }

  private attachMainCommandCheckEffect(
    response: MainCommandResponseDto,
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    publicClues: string[]
  ): MainCommandResponseDto {
    if (response.status !== MainCommandStatus.CHECK_REQUIRED) {
      return response;
    }

    const data: Record<string, unknown> = response.data ?? {};
    if (data.checkEffect) {
      return response;
    }

    const target = dto.targetId
      ? visibleEntities.find((entity) => entity.id === dto.targetId)
      : null;
    const item = dto.itemId
      ? context.inventoryItems.find((entry) => entry.id === dto.itemId)
      : null;
    const effect: MainCommandCheckEffect = {
      type: 'mainCommandCheck',
      requestId,
      nodeId: context.currentNodeId,
      sessionCharacterId: context.sessionCharacterId,
      intent: dto.intent,
      screenType: dto.screenType,
      playerText: dto.playerText,
      actionSummary: response.actionCandidate?.actionSummary ?? dto.playerText,
      targetId: dto.targetId ?? null,
      targetName: target?.name ?? null,
      targetSummary: target?.summary ?? null,
      targetDisposition: target?.disposition ?? null,
      itemId: dto.itemId ?? null,
      itemName: item?.name ?? null,
      mapPoint: dto.mapPoint ?? null,
      checkOption: response.checkOptions?.[0] ?? null,
      visibleEntityNames: visibleEntities.map((entity) => entity.name),
      publicClues,
      sceneText: context.currentNodeSceneText,
      actionCandidate: response.actionCandidate ?? null,
    };

    return {
      ...response,
      data: {
        ...data,
        checkEffect: effect,
      },
    };
  }

  private buildMainCommandCheckResultMessage(
    effect: MainCommandCheckEffect,
    outcome: ActionOutcome
  ): string {
    const pointLabel = effect.mapPoint ? ` (${effect.mapPoint.x}, ${effect.mapPoint.y}) 주변` : '';
    const targetLabel = effect.targetName ?? this.inferTargetLabel(effect);
    const itemLabel = effect.itemName ?? '준비한 물건';

    if (outcome !== ActionOutcome.SUCCESS) {
      return this.buildFailedCheckNarration(effect, targetLabel, itemLabel, pointLabel);
    }

    const visibleSummary = effect.visibleEntityNames.length
      ? ` 눈에 띄는 대상: ${effect.visibleEntityNames.join(', ')}.`
      : '';

    return this.buildSuccessfulCheckNarration(
      effect,
      targetLabel,
      itemLabel,
      pointLabel,
      visibleSummary
    );
  }

  private async buildMainCommandCheckResultMessageForOutcome(
    userId: string,
    sessionId: string,
    effect: MainCommandCheckEffect,
    outcome: ActionOutcome
  ): Promise<string> {
    if (outcome !== ActionOutcome.SUCCESS) {
      return this.buildMainCommandCheckResultMessage(effect, outcome);
    }

    try {
      if (this.isSocialInformationCheck(effect.intent)) {
        return await this.buildSocialInformationSuccessMessage(userId, sessionId, effect);
      }
      if (effect.intent === MainCommandIntent.READ_EMOTION) {
        return await this.buildReadEmotionSuccessMessage(userId, sessionId, effect);
      }
    } catch {
      return this.buildMainCommandCheckResultMessage(effect, outcome);
    }

    return this.buildMainCommandCheckResultMessage(effect, outcome);
  }

  private isSocialInformationCheck(intent: MainCommandIntent): boolean {
    return [
      MainCommandIntent.SOCIAL_PERSUADE,
      MainCommandIntent.SOCIAL_INTIMIDATE,
      MainCommandIntent.SOCIAL_DECEIVE,
    ].includes(intent);
  }

  private async buildSocialInformationSuccessMessage(
    userId: string,
    sessionId: string,
    effect: MainCommandCheckEffect
  ): Promise<string> {
    const aiResult = await this.aiService.runCheckResult(sessionId, userId, {
      outcome: 'SUCCESS',
      intent: effect.intent,
      playerText: effect.playerText,
      actionSummary: effect.actionSummary,
      targetName: effect.targetName,
      targetSummary: effect.targetSummary,
      targetDisposition: effect.targetDisposition,
      sceneSummary: effect.sceneText,
      publicClues: effect.publicClues,
      visibleEntities: effect.visibleEntityNames,
      outputMode: 'NPC_REPLY',
    });
    const narration = aiResult.parsed.narration.trim();
    return narration
      ? narration
      : this.buildMainCommandCheckResultMessage(effect, ActionOutcome.SUCCESS);
  }

  private async buildReadEmotionSuccessMessage(
    userId: string,
    sessionId: string,
    effect: MainCommandCheckEffect
  ): Promise<string> {
    const aiResult = await this.aiService.runCheckResult(sessionId, userId, {
      outcome: 'SUCCESS',
      intent: effect.intent,
      playerText: effect.playerText,
      actionSummary: effect.actionSummary,
      targetName: effect.targetName,
      targetSummary: effect.targetSummary,
      targetDisposition: effect.targetDisposition,
      sceneSummary: effect.sceneText,
      publicClues: effect.publicClues,
      visibleEntities: effect.visibleEntityNames,
      outputMode: 'OBSERVATION',
    });
    const narration = aiResult.parsed.narration.trim();
    return narration
      ? narration
      : this.buildMainCommandCheckResultMessage(effect, ActionOutcome.SUCCESS);
  }

  private formatCheckIntentLabel(intent: MainCommandIntent): string {
    switch (intent) {
      case MainCommandIntent.SOCIAL_PERSUADE:
        return '설득';
      case MainCommandIntent.SOCIAL_INTIMIDATE:
        return '협박';
      case MainCommandIntent.SOCIAL_DECEIVE:
        return '속이기';
      case MainCommandIntent.READ_EMOTION:
        return '눈치';
      default:
        return '행동';
    }
  }

  private buildSuccessfulCheckNarration(
    effect: MainCommandCheckEffect,
    targetLabel: string,
    itemLabel: string,
    pointLabel: string,
    visibleSummary: string
  ): string {
    switch (effect.intent) {
      case MainCommandIntent.OBSERVE_AREA:
        return `판정에 성공했습니다. ${pointLabel || '주변'}을 차분히 훑자 장면의 흐름과 눈에 띄는 단서가 또렷해집니다.${visibleSummary}`.trim();
      case MainCommandIntent.INVESTIGATE_OBJECT:
      case MainCommandIntent.INSPECT_STORY_OBJECT:
        return `판정에 성공했습니다. ${targetLabel}을(를) 꼼꼼히 조사해 겉보기만으로는 알 수 없던 흔적을 찾아냅니다.`;
      case MainCommandIntent.LISTEN:
        return '판정에 성공했습니다. 주변 소음 사이에서 의미 있는 기척과 방향을 구분해냅니다.';
      case MainCommandIntent.DETECT_DANGER:
        return '판정에 성공했습니다. 사소한 어긋남을 눈치채고 위험의 징후를 먼저 포착합니다.';
      case MainCommandIntent.SOCIAL_PERSUADE:
        return `판정에 성공했습니다. ${targetLabel}은(는) 말의 무게를 받아들이고 태도를 누그러뜨립니다.`;
      case MainCommandIntent.SOCIAL_INTIMIDATE:
        return `판정에 성공했습니다. ${targetLabel}은(는) 압박을 버티지 못하고 눈에 띄게 동요합니다.`;
      case MainCommandIntent.SOCIAL_DECEIVE:
        return `판정에 성공했습니다. ${targetLabel}은(는) 꾸며낸 말에 빈틈을 찾지 못하고 넘어갑니다.`;
      case MainCommandIntent.READ_EMOTION:
        return `판정에 성공했습니다. ${targetLabel}의 표정과 말 사이에서 감춰진 감정의 결을 읽어냅니다.`;
      case MainCommandIntent.SPECIAL_MOVE:
        return '판정에 성공했습니다. 아슬아슬한 움직임이 통하며 원하는 위치까지 몸을 실어냅니다.';
      case MainCommandIntent.INTERACT_OBJECT:
        return `판정에 성공했습니다. ${targetLabel}을(를) 조작하자 의도한 반응이 나타납니다.`;
      case MainCommandIntent.USE_TOOL:
      case MainCommandIntent.USE_ITEM_EXPLORE:
      case MainCommandIntent.USE_ITEM_COMBAT:
        return `판정에 성공했습니다. ${itemLabel} 활용이 제대로 맞아떨어져 상황을 유리하게 바꿉니다.`;
      case MainCommandIntent.COMBAT_MANEUVER:
        return '판정에 성공했습니다. 전투 기동이 먹혀들어 상대의 균형과 흐름을 흔듭니다.';
      case MainCommandIntent.ENVIRONMENT_USE:
        return `판정에 성공했습니다. ${targetLabel}을(를) 전술적으로 활용해 장면의 지형을 유리하게 끌어옵니다.`;
      case MainCommandIntent.IMPROVISED_ATTACK:
        return `판정에 성공했습니다. 즉석 공격이 허를 찌르며 ${targetLabel}에게 제대로 닿습니다.`;
      case MainCommandIntent.CALLED_SHOT:
        return `판정에 성공했습니다. 노린 지점이 정확히 맞아 ${targetLabel}의 움직임에 빈틈이 생깁니다.`;
      case MainCommandIntent.READY_ACTION:
        return '판정에 성공했습니다. 준비한 행동이 정확한 순간에 이어질 수 있게 자세를 잡습니다.';
      case MainCommandIntent.USE_SPELL_CREATIVELY:
        return '판정에 성공했습니다. 주문의 효과를 창의적으로 응용해 예상 밖의 돌파구를 만듭니다.';
      default:
        return `판정에 성공했습니다. 단서의 실마리가 분명히 드러납니다.`;
    }
  }

  private buildFailedCheckNarration(
    effect: MainCommandCheckEffect,
    targetLabel: string,
    itemLabel: string,
    pointLabel: string
  ): string {
    switch (effect.intent) {
      case MainCommandIntent.OBSERVE_AREA:
        return `판정에 실패했습니다. ${pointLabel || '주변'}을 살폈지만, 숨어 있는 위험은 아직 평범한 바닥과 그림자 속에 묻혀 있습니다.`;
      case MainCommandIntent.INVESTIGATE_OBJECT:
      case MainCommandIntent.INSPECT_STORY_OBJECT:
        return `판정에 실패했습니다. ${targetLabel}을(를) 살펴보지만 눈에 띄는 흔적은 끝내 드러나지 않습니다.`;
      case MainCommandIntent.LISTEN:
        return '판정에 실패했습니다. 소리와 기척이 주변 소음에 묻혀 뚜렷한 정보를 얻지 못합니다.';
      case MainCommandIntent.DETECT_DANGER:
        return `판정에 실패했습니다. ${targetLabel || pointLabel || '주변'}을 살폈지만, 숨어 있는 위험은 아직 평범한 바닥과 그림자 속에 묻혀 있습니다.`;
      case MainCommandIntent.SOCIAL_PERSUADE:
        return `판정에 실패했습니다. ${targetLabel}은(는) 말을 끝까지 듣지만 마음을 바꾸지는 않습니다.`;
      case MainCommandIntent.SOCIAL_INTIMIDATE:
        return `판정에 실패했습니다. ${targetLabel}은(는) 잠시 굳지만, 이내 버티듯 시선을 피하지 않습니다.`;
      case MainCommandIntent.SOCIAL_DECEIVE:
        return `판정에 실패했습니다. ${targetLabel}은(는) 말의 빈틈을 눈치채고 경계심을 높입니다.`;
      case MainCommandIntent.READ_EMOTION:
        return `판정에 실패했습니다. ${targetLabel}의 반응은 읽히는 듯하다가도 곧 흐려져 확신을 주지 않습니다.`;
      case MainCommandIntent.SPECIAL_MOVE:
        return '판정에 실패했습니다. 시도한 움직임은 이어지지만, 원하는 만큼 민첩하게 자리를 잡지는 못합니다.';
      case MainCommandIntent.INTERACT_OBJECT:
        return `판정에 실패했습니다. ${targetLabel}을(를) 건드려 보지만 기대한 반응은 일어나지 않습니다.`;
      case MainCommandIntent.USE_TOOL:
      case MainCommandIntent.USE_ITEM_EXPLORE:
      case MainCommandIntent.USE_ITEM_COMBAT:
        return `판정에 실패했습니다. ${itemLabel}을(를) 꺼내 써보지만 상황에 맞게 풀리지는 않습니다.`;
      case MainCommandIntent.COMBAT_MANEUVER:
        return '판정에 실패했습니다. 전투 기동은 상대의 대응에 막혀 흐름을 빼앗지 못합니다.';
      case MainCommandIntent.ENVIRONMENT_USE:
        return `판정에 실패했습니다. ${targetLabel}을(를) 이용하려 하지만 장면은 의도한 만큼 따라주지 않습니다.`;
      case MainCommandIntent.IMPROVISED_ATTACK:
        return `판정에 실패했습니다. 즉석 공격은 빗나가거나 힘이 실리지 않아 ${targetLabel}에게 결정타가 되지 못합니다.`;
      case MainCommandIntent.CALLED_SHOT:
        return `판정에 실패했습니다. 노린 지점은 어긋나고 ${targetLabel}은(는) 결정적인 빈틈을 내주지 않습니다.`;
      case MainCommandIntent.READY_ACTION:
        return '판정에 실패했습니다. 타이밍을 재려 했지만 전장의 흐름이 어긋나 준비가 흔들립니다.';
      case MainCommandIntent.USE_SPELL_CREATIVELY:
        return '판정에 실패했습니다. 주문의 응용은 가능성을 보이지만 원하는 효과로 이어지지는 않습니다.';
      default:
        return `판정에 실패했습니다. 조사를 진행했지만 아직 결정적인 실마리는 잡히지 않습니다.`;
    }
  }

  private describePlayerFacingCheckAttempt(effect: MainCommandCheckEffect): string {
    const actionSummary = effect.actionSummary?.trim();
    const playerText = effect.playerText?.trim();
    const internalLabels = new Set(['standard', 'normal', 'default', 'generic', 'unknown']);
    if (actionSummary && !internalLabels.has(actionSummary.toLowerCase())) {
      return actionSummary;
    }
    return playerText || this.describeCheckAttemptIntent(effect.intent);
  }

  private describeCheckAttemptIntent(intent: MainCommandIntent): string {
    switch (intent) {
      case MainCommandIntent.OBSERVE_AREA:
        return '주변 살피기';
      case MainCommandIntent.INVESTIGATE_OBJECT:
      case MainCommandIntent.INSPECT_STORY_OBJECT:
        return '대상 조사';
      case MainCommandIntent.LISTEN:
        return '소리 듣기';
      case MainCommandIntent.DETECT_DANGER:
        return '위험 감지';
      case MainCommandIntent.SOCIAL_PERSUADE:
        return '설득';
      case MainCommandIntent.SOCIAL_INTIMIDATE:
        return '협박';
      case MainCommandIntent.SOCIAL_DECEIVE:
        return '속이기';
      case MainCommandIntent.READ_EMOTION:
        return '감정 읽기';
      default:
        return '시도';
    }
  }

  private inferTargetLabel(effect: MainCommandCheckEffect): string {
    if (effect.mapPoint) {
      return `(${effect.mapPoint.x}, ${effect.mapPoint.y}) 지점`;
    }
    if (
      effect.intent === MainCommandIntent.SOCIAL_PERSUADE ||
      effect.intent === MainCommandIntent.SOCIAL_INTIMIDATE ||
      effect.intent === MainCommandIntent.SOCIAL_DECEIVE ||
      effect.intent === MainCommandIntent.READ_EMOTION
    ) {
      return '상대';
    }
    return '대상';
  }

  private async markScenarioStateChanged(sessionScenarioId: string): Promise<void> {
    await this.prisma.gameState.update({
      where: { sessionScenarioId },
      data: { version: { increment: 1 } },
    });
  }

  private buildEffectiveMainCommandData(dto: SubmitMainCommandDto): EffectiveMainCommandData {
    return {
      commandId: dto.commandId,
      category: dto.category,
      intent: dto.intent,
      screenType: dto.screenType,
      targetId: dto.targetId ?? null,
      targetType: dto.targetType ?? null,
      itemId: dto.itemId ?? null,
      spellId: dto.spellId ?? null,
    };
  }

  private resolvePersistedMainCommand(
    dto: SubmitMainCommandDto,
    response: MainCommandResponseDto
  ): EffectiveMainCommandData {
    const fallback = this.buildEffectiveMainCommandData(dto);
    const data = response.data;
    const effectiveMainCommand =
      data?.effectiveMainCommand && typeof data.effectiveMainCommand === 'object'
        ? (data.effectiveMainCommand as Partial<EffectiveMainCommandData>)
        : null;

    if (!effectiveMainCommand) {
      return fallback;
    }

    return {
      commandId:
        typeof effectiveMainCommand.commandId === 'string'
          ? effectiveMainCommand.commandId
          : fallback.commandId,
      category: effectiveMainCommand.category ?? fallback.category,
      intent: effectiveMainCommand.intent ?? fallback.intent,
      screenType: effectiveMainCommand.screenType ?? fallback.screenType,
      targetId:
        typeof effectiveMainCommand.targetId === 'string'
          ? effectiveMainCommand.targetId
          : effectiveMainCommand.targetId === null
            ? null
            : fallback.targetId,
      targetType: effectiveMainCommand.targetType ?? fallback.targetType,
      itemId:
        typeof effectiveMainCommand.itemId === 'string'
          ? effectiveMainCommand.itemId
          : effectiveMainCommand.itemId === null
            ? null
            : fallback.itemId,
      spellId:
        typeof effectiveMainCommand.spellId === 'string'
          ? effectiveMainCommand.spellId
          : effectiveMainCommand.spellId === null
            ? null
            : fallback.spellId,
    };
  }

  private async persistResult(
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    response: MainCommandResponseDto
  ) {
    const outcome = this.toActionOutcome(response);
    const persistedCommand = this.resolvePersistedMainCommand(dto, response);
    const turnLog = await this.turnLogsService.createTurnLog({
      sessionId: context.sessionId,
      sessionScenarioId: context.sessionScenarioId,
      actorUserId: userId,
      sessionCharacterId: context.sessionCharacterId,
      rawInput: this.getMainCommandRawInput(dto),
      structuredAction: {
        type: 'main_command',
        commandId: persistedCommand.commandId,
        category: persistedCommand.category,
        intent: persistedCommand.intent,
        screenType: persistedCommand.screenType,
        targetId: persistedCommand.targetId,
        targetType: persistedCommand.targetType,
        itemId: persistedCommand.itemId,
        spellId: persistedCommand.spellId,
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

  private withRevealedObjectContents(
    response: MainCommandResponseDto,
    revealedClues: Array<{ id: string; title: string; text: string | null }>,
    revealedItems: Array<{ id: string; name: string; quantity: number; description?: string | null }> = []
  ): MainCommandResponseDto {
    if (!revealedClues.length && !revealedItems.length) {
      return response;
    }

    const clueLines = revealedClues.map((clue) =>
      clue.text?.trim() ? `- ${clue.title}: ${clue.text.trim()}` : `- ${clue.title}`
    );
    const itemLines = revealedItems.map((item) => {
      const itemLabel = item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name;
      return item.description?.trim()
        ? `- ${itemLabel}: ${item.description.trim()}`
        : `- ${itemLabel}`;
    });
    const sections = [
      clueLines.length ? `새 단서를 발견했습니다.\n${clueLines.join('\n')}` : null,
      itemLines.length ? `아이템을 획득했습니다. 인벤토리에 추가되었습니다.\n${itemLines.join('\n')}` : null,
    ].filter((section): section is string => Boolean(section));

    return {
      ...response,
      status:
        response.status === MainCommandStatus.MESSAGE
          ? MainCommandStatus.RESOLVED
          : response.status,
      message: `${response.message.trim()}\n\n${sections.join('\n\n')}`,
      data: {
        ...(response.data ?? {}),
        revealedClues,
        revealedItems,
      },
    };
  }

  private getMainCommandRawInput(dto: SubmitMainCommandDto): string {
    // 슬래시 명령어는 처리용 본문과 사용자가 친 원문이 달라서 로그에는 원문을 우선 남긴다.
    return dto.rawInputText?.trim() || dto.playerText.trim();
  }

  private toActionOutcome(response: MainCommandResponseDto): ActionOutcome {
    return response.status === MainCommandStatus.IMPOSSIBLE
      ? ActionOutcome.IMPOSSIBLE
      : response.status === MainCommandStatus.RESOLVED
        ? ActionOutcome.SUCCESS
        : ActionOutcome.NO_ROLL;
  }

  private parseMainCommandCheckEffect(
    value: Record<string, unknown>
  ): MainCommandCheckEffect | null {
    if (value.type !== 'mainCommandCheck') {
      return null;
    }

    const requestId = this.readString(value.requestId);
    const nodeId = this.readString(value.nodeId);
    const intent = this.readString(value.intent);
    const screenType = this.readString(value.screenType);
    const playerText = this.readString(value.playerText);
    const actionSummary = this.readString(value.actionSummary) ?? playerText;
    if (
      !requestId ||
      !nodeId ||
      !intent ||
      !screenType ||
      !playerText ||
      !Object.values(MainCommandIntent).includes(intent as MainCommandIntent) ||
      !Object.values(MainCommandScreenType).includes(screenType as MainCommandScreenType)
    ) {
      return null;
    }

    const mapPoint = this.readPoint(value.mapPoint);
    const checkOption =
      value.checkOption && typeof value.checkOption === 'object'
        ? this.parseCheckOption(value.checkOption as Record<string, unknown>)
        : null;
    const actionCandidate =
      value.actionCandidate && typeof value.actionCandidate === 'object'
        ? this.parseActionCandidate(value.actionCandidate as Record<string, unknown>)
        : null;

    return {
      type: 'mainCommandCheck',
      requestId,
      nodeId,
      sessionCharacterId: this.readString(value.sessionCharacterId) ?? '',
      intent: intent as MainCommandIntent,
      screenType: screenType as MainCommandScreenType,
      playerText,
      actionSummary: actionSummary ?? playerText,
      targetId: this.readString(value.targetId),
      targetName: this.readString(value.targetName),
      targetSummary: this.readString(value.targetSummary),
      targetDisposition: this.readString(value.targetDisposition),
      itemId: this.readString(value.itemId),
      itemName: this.readString(value.itemName),
      mapPoint,
      checkOption,
      visibleEntityNames: this.readStringArray(value.visibleEntityNames),
      publicClues: this.readStringArray(value.publicClues),
      sceneText: this.readString(value.sceneText) ?? '',
      actionCandidate,
    };
  }

  private parseCheckOption(value: Record<string, unknown>): MainCommandCheckOptionDto | null {
    const reason = this.readString(value.reason);
    if (!reason) {
      return null;
    }

    return {
      ...(this.readString(value.ability)
        ? { ability: this.readString(value.ability) ?? undefined }
        : {}),
      ...(this.readString(value.skill) ? { skill: this.readString(value.skill) ?? undefined } : {}),
      ...(this.readDc(value.dc) ? { dc: this.readDc(value.dc) ?? undefined } : {}),
      reason,
    };
  }

  private parseActionCandidate(
    value: Record<string, unknown>
  ): MainCommandActionCandidateDto | null {
    const actorId = this.readString(value.actorId);
    const actionSummary = this.readString(value.actionSummary);
    if (!actorId || !actionSummary) {
      return null;
    }

    return {
      actorId,
      targetId: this.readString(value.targetId),
      actionSummary,
      declaredMethod: this.readString(value.declaredMethod),
    };
  }

  private parseVttDoorCheckEffect(value: Record<string, unknown>): VttDoorCheckEffect | null {
    const type = value.type;
    const doorId = value.doorId;
    const effect = value.effect;
    const nodeId = value.nodeId;
    const mapPoint = value.mapPoint;
    if (
      type !== 'vttDoor' ||
      typeof doorId !== 'string' ||
      typeof nodeId !== 'string' ||
      (effect !== 'open' && effect !== 'broken') ||
      !mapPoint ||
      typeof mapPoint !== 'object'
    ) {
      return null;
    }
    const point = mapPoint as Record<string, unknown>;
    if (typeof point.x !== 'number' || typeof point.y !== 'number') {
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

  private parseVttHazardCheckEffect(value: Record<string, unknown>): VttHazardCheckEffect | null {
    const type = value.type;
    const hazardId = value.hazardId;
    const effect = value.effect;
    const nodeId = value.nodeId;
    const mapPoint = value.mapPoint;
    if (
      type !== 'vttHazard' ||
      typeof hazardId !== 'string' ||
      typeof nodeId !== 'string' ||
      effect !== 'disarm' ||
      !mapPoint ||
      typeof mapPoint !== 'object'
    ) {
      return null;
    }
    const point = mapPoint as Record<string, unknown>;
    if (typeof point.x !== 'number' || typeof point.y !== 'number') {
      return null;
    }
    return {
      type,
      hazardId,
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
        if (!entry || typeof entry !== 'object') {
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
          disposition: this.readString(record.disposition) ?? 'neutral',
          kind,
        };
      })
      .filter((entry): entry is VisibleSceneEntity => Boolean(entry));
  }

  private resolveEntity(
    dto: SubmitMainCommandDto,
    entities: VisibleSceneEntity[],
    preferredType?: MainCommandTargetType
  ): VisibleSceneEntity | null {
    const filtered =
      preferredType &&
      preferredType !== MainCommandTargetType.POINT &&
      preferredType !== MainCommandTargetType.SELF
        ? entities.filter((entity) => entity.kind === preferredType)
        : entities;

    if (!filtered.length) {
      return null;
    }

    if (dto.targetId) {
      const normalizedTargetId = dto.targetId.trim().toLowerCase();
      const matchedById = filtered.find(
        (entity) => entity.id.trim().toLowerCase() === normalizedTargetId
      );
      if (matchedById) {
        return matchedById;
      }
    }

    const normalizedText = dto.playerText.trim().toLowerCase();
    const matchedByText = this.resolveEntityMentionedInText(normalizedText, filtered);
    if (matchedByText) {
      return matchedByText;
    }

    return filtered.length === 1 ? filtered[0] : null;
  }

  private resolveEntityMentionedInText(
    playerText: string,
    entities: VisibleSceneEntity[]
  ): VisibleSceneEntity | null {
    const normalizedText = playerText.trim().toLowerCase();
    const matched = entities.filter((entity) => {
      const normalizedName = entity.name.trim().toLowerCase();
      if (!normalizedName) {
        return false;
      }

      if (normalizedText.includes(normalizedName)) {
        return true;
      }

      // "밀라 보스턴"처럼 표시명이 길어도 사용자는 보통 "밀라"처럼 부르므로,
      // 공백으로 나뉜 고유 이름 조각이 하나만 매칭될 때는 명시 대상으로 인정한다.
      return normalizedName
        .split(/\s+/)
        .filter((part) => part.length >= 2)
        .some((part) => normalizedText.includes(part));
    });
    return matched.length === 1 ? matched[0] : null;
  }

  private canUseExplicitPlayerText(
    dto: SubmitMainCommandDto,
    options: { acceptsMapPoint?: boolean; acceptsTarget?: boolean } = {}
  ): boolean {
    const text = dto.playerText.trim();
    if (!text) {
      return false;
    }

    if (options.acceptsMapPoint && dto.mapPoint) {
      return true;
    }

    if (options.acceptsTarget || dto.targetId) {
      return text.length >= 3;
    }

    const normalized = text.replace(/\s+/g, '');
    if (normalized.length >= 8) {
      return true;
    }

    return /[?!.。！？]|한다|하겠다|말|묻|찾|살피|조사|협박|위협|압박|보여|열|뒤지|확인/.test(text);
  }

  private shouldRequireMainCommandCheck(
    action: { requiresRoll?: boolean | null },
    dto: SubmitMainCommandDto,
    needsClarification: boolean
  ): boolean {
    return (
      Boolean(action.requiresRoll) ||
      (needsClarification &&
        this.canUseExplicitPlayerText(dto, {
          acceptsMapPoint: true,
          acceptsTarget: Boolean(dto.targetId),
        }))
    );
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
      orderBy: { turnNumber: 'desc' },
      take: 12,
    });

    return rows
      .slice()
      .reverse()
      .map((row) => {
        const parts = [row.rawInput, row.narration].filter((value): value is string =>
          Boolean(value)
        );
        return parts.join(' => ').trim();
      })
      .filter((line) => Boolean(line));
  }

  private async loadTransitionCandidates(context: LoadedContext): Promise<TransitionCandidate[]> {
    const transitions = this.parseJson<Record<string, unknown>[]>(
      context.currentNodeTransitionsJson,
      []
    );
    const candidateStubs: Array<Omit<TransitionCandidate, 'title' | 'nodeType'>> = [];
    for (const transition of transitions) {
      const nextNodeId = this.readString(transition.nextNodeId);
      if (nextNodeId) {
        candidateStubs.push({
          transitionId: this.readString(transition.id),
          label: this.readString(transition.label),
          condition: this.readString(transition.condition),
          conditionRule: this.readTransitionConditionRule(transition.conditionRule),
          note: this.readString(transition.note),
          nodeId: nextNodeId,
          isFallback: false,
        });
      }
    }
    const hasExplicitTransition = candidateStubs.length > 0;
    if (context.currentNodeFallbackNodeId && !hasExplicitTransition) {
      candidateStubs.push({
        transitionId: null,
        label: '기본 이동',
        condition: 'default',
        conditionRule: {
          logic: 'ALL',
          requirements: [{ type: 'ALWAYS' }],
        },
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
    dto: SubmitMainCommandDto
  ): TransitionCandidate | null {
    if (dto.targetId) {
      const normalizedTargetId = dto.targetId.trim().toLowerCase();
      const direct = candidates.find((candidate) =>
        [candidate.nodeId, candidate.transitionId, candidate.label]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.trim().toLowerCase() === normalizedTargetId)
      );
      if (direct) {
        return direct;
      }
    }

    const normalizedText = dto.playerText.trim().toLowerCase();
    return (
      candidates.find((candidate) =>
        [
          candidate.nodeId,
          candidate.transitionId,
          candidate.title,
          candidate.label,
          candidate.condition,
        ]
          .filter((value): value is string => Boolean(value))
          .some((value) => normalizedText.includes(value.trim().toLowerCase()))
      ) ?? null
    );
  }

  private evaluateTransitionCondition(
    candidate: TransitionCandidate,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
    evidence?: TransitionEvidence
  ): TransitionConditionEvaluation {
    if (candidate.conditionRule && evidence) {
      return this.evaluateStructuredTransitionCondition(candidate, evidence);
    }

    const condition = candidate.condition?.trim() ?? '';
    if (this.isAutoTransitionCondition(condition)) {
      return {
        satisfied: true,
        needsReview: false,
        reason: '조건 없이 이동 가능한 연결입니다.',
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const normalizedCondition = this.normalizeTransitionConditionText(condition);
    const evidenceText = this.normalizeTransitionConditionText(
      [
        ...recentLogs.slice(-8).filter((line) => !this.isSceneTransitionLogLine(line)),
        ...publicClues,
      ]
        .filter((value): value is string => Boolean(value))
        .join(' ')
    );

    if (normalizedCondition && evidenceText.includes(normalizedCondition)) {
      return {
        satisfied: true,
        needsReview: false,
        reason: '장면 진행 조건을 만족했습니다.',
        matchedTerms: [condition],
        missingTerms: [],
      };
    }

    const alternatives = this.extractTransitionConditionAlternatives(condition);
    const candidateTermGroups = alternatives.length
      ? alternatives.map((alternative) => this.extractTransitionConditionTerms(alternative))
      : [this.extractTransitionConditionTerms(condition)];
    const nonEmptyTermGroups = candidateTermGroups.filter((terms) => terms.length > 0);
    const conditionTerms = this.dedupeTerms(nonEmptyTermGroups.flat());
    if (!conditionTerms.length) {
      return {
        satisfied: false,
        needsReview: true,
        reason: `장면 이동 조건 "${condition}"을 자동으로 판정하기 어렵습니다. GM 확인이 필요합니다.`,
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const evaluations = nonEmptyTermGroups.map((terms) => {
      const matchedTerms = terms.filter((term) => evidenceText.includes(term));
      const missingTerms = terms.filter((term) => !evidenceText.includes(term));
      const requiredMatchCount = terms.length <= 3 ? terms.length : Math.ceil(terms.length * 0.7);
      return {
        terms,
        matchedTerms,
        missingTerms,
        requiredMatchCount,
      };
    });
    const satisfiedEvaluation = evaluations.find(
      (evaluation) => evaluation.matchedTerms.length >= evaluation.requiredMatchCount
    );

    if (satisfiedEvaluation) {
      return {
        satisfied: true,
        needsReview: false,
        reason: '장면 진행 조건을 만족했습니다.',
        matchedTerms: satisfiedEvaluation.matchedTerms,
        missingTerms: satisfiedEvaluation.missingTerms,
      };
    }

    const bestEvaluation =
      evaluations
        .filter((evaluation) => evaluation.matchedTerms.length > 0)
        .sort((left, right) => {
          const leftScore = left.matchedTerms.length / left.terms.length;
          const rightScore = right.matchedTerms.length / right.terms.length;
          return rightScore - leftScore;
        })[0] ?? null;

    if (bestEvaluation) {
      return {
        satisfied: false,
        needsReview: true,
        reason: `장면 이동 조건 "${condition}"을 아직 만족하지 못했습니다. 조건을 만족하는 행동이나 단서가 기록되어 있는지 확인해주세요.`,
        matchedTerms: bestEvaluation.matchedTerms,
        missingTerms: bestEvaluation.missingTerms,
      };
    }

    return {
      satisfied: false,
      needsReview: false,
      reason: '아직 앞으로 나아갈 길을 찾지 못했습니다.',
      matchedTerms: [],
      missingTerms: conditionTerms,
    };
  }

  private async evaluateTransitionConditionWithRevealedClues(
    context: LoadedContext,
    candidate: TransitionCandidate,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    _publicClues: string[]
  ): Promise<TransitionConditionEvaluation> {
    const revealedClues = await this.loadRevealedClueSummaries(context.sessionScenarioId);
    return this.evaluateTransitionCondition(candidate, dto, recentLogs, revealedClues);
  }

  private async evaluateTransitionConditionWithEvidence(
    context: LoadedContext,
    candidate: TransitionCandidate,
    dto: SubmitMainCommandDto,
    recentLogs: string[]
  ): Promise<TransitionConditionEvaluation> {
    const evidence = await this.buildTransitionEvidence(context, recentLogs);
    return this.evaluateTransitionCondition(
      candidate,
      dto,
      recentLogs,
      evidence.revealedClues,
      evidence
    );
  }

  private async evaluateTransitionCandidatesWithRevealedClues(
    context: LoadedContext,
    candidates: TransitionCandidate[],
    dto: SubmitMainCommandDto,
    recentLogs: string[]
  ): Promise<EvaluatedTransitionCandidate[]> {
    const evidence = await this.buildTransitionEvidence(context, recentLogs);
    return candidates.map((candidate) => ({
      target: candidate,
      conditionResult: this.evaluateTransitionCondition(
        candidate,
        dto,
        recentLogs,
        evidence.revealedClues,
        evidence
      ),
    }));
  }

  private evaluateStructuredTransitionCondition(
    candidate: TransitionCandidate,
    evidence: TransitionEvidence
  ): TransitionConditionEvaluation {
    const rule = candidate.conditionRule;
    if (!rule || !rule.requirements.length) {
      return {
        satisfied: false,
        needsReview: true,
        reason: '장면 이동 조건을 구조화하지 못했습니다. GM 확인이 필요합니다.',
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const results = rule.requirements.map((requirement) => ({
      requirement,
      satisfied: this.evaluateStructuredTransitionRequirement(requirement, evidence),
      label: this.describeTransitionRequirement(requirement, evidence),
    }));
    const satisfied =
      rule.logic === 'ANY'
        ? results.some((result) => result.satisfied)
        : results.every((result) => result.satisfied);
    const matchedTerms = results.filter((result) => result.satisfied).map((result) => result.label);
    const missingTerms = results
      .filter((result) => !result.satisfied)
      .map((result) => result.label);
    const hasMissingGmApproval = results.some(
      (result) => result.requirement.type === 'GM_APPROVAL' && !result.satisfied
    );

    if (satisfied) {
      return {
        satisfied: true,
        needsReview: false,
        reason: '장면 진행 조건을 만족했습니다.',
        matchedTerms,
        missingTerms,
      };
    }

    return {
      satisfied: false,
      needsReview: hasMissingGmApproval,
      reason: hasMissingGmApproval
        ? '이 분기는 GM 승인이 필요합니다.'
        : '아직 앞으로 나아갈 길을 찾지 못했습니다.',
      matchedTerms,
      missingTerms,
    };
  }

  private evaluateStructuredTransitionRequirement(
    requirement: TransitionConditionRequirement,
    evidence: TransitionEvidence
  ): boolean {
    switch (requirement.type) {
      case 'ALWAYS':
        return true;
      case 'CLUE_REVEALED':
        return Boolean(
          requirement.targetId && evidence.revealedClueIds.includes(requirement.targetId)
        );
      case 'COMBAT_RESOLVED': {
        const targetNodeId = requirement.targetId || evidence.currentNodeId;
        const completedCombatNodeIds = Array.isArray(evidence.flags.completedCombatNodeIds)
          ? evidence.flags.completedCombatNodeIds.filter(
              (value): value is string => typeof value === 'string'
            )
          : [];
        return completedCombatNodeIds.includes(targetNodeId);
      }
      case 'NODE_VISITED': {
        const targetNodeId = requirement.targetId || evidence.currentNodeId;
        return evidence.visitedNodeIds.includes(targetNodeId);
      }
      case 'FLAG_SET': {
        if (!requirement.flagKey) return false;
        const value = evidence.flags[requirement.flagKey];
        if (
          requirement.flagValue === undefined ||
          requirement.flagValue === null ||
          requirement.flagValue === ''
        ) {
          return value !== undefined && value !== null && value !== false;
        }
        return String(value) === requirement.flagValue;
      }
      case 'GM_APPROVAL':
        return false;
      default:
        return false;
    }
  }

  private describeTransitionRequirement(
    requirement: TransitionConditionRequirement,
    evidence: TransitionEvidence
  ): string {
    switch (requirement.type) {
      case 'ALWAYS':
        return '항상 가능';
      case 'CLUE_REVEALED':
        return `단서 공개:${requirement.targetId ?? '미지정'}`;
      case 'COMBAT_RESOLVED':
        return `전투 종료:${requirement.targetId || evidence.currentNodeId}`;
      case 'NODE_VISITED':
        return `노드 방문:${requirement.targetId || evidence.currentNodeId}`;
      case 'FLAG_SET':
        return requirement.flagValue
          ? `상태 플래그:${requirement.flagKey ?? '미지정'}=${requirement.flagValue}`
          : `상태 플래그:${requirement.flagKey ?? '미지정'}`;
      case 'GM_APPROVAL':
        return 'GM 승인';
      default:
        return '알 수 없는 조건';
    }
  }

  private evaluateTransitionConditionContract(
    contract: TransitionConditionCandidateContract,
    evidence: TransitionEvidence
  ): TransitionConditionEvaluation {
    if (!contract.requirements.length) {
      return {
        satisfied: false,
        needsReview: true,
        reason: '장면 이동 조건을 구조화하지 못했습니다. GM 확인이 필요합니다.',
        matchedTerms: [],
        missingTerms: [],
      };
    }

    const results = contract.requirements.map((requirement) => {
      const satisfied = this.evaluateTransitionRequirement(requirement, evidence);
      return {
        requirement,
        satisfied,
        label: `${requirement.type}:${requirement.text}`,
      };
    });
    const satisfied =
      contract.logic === 'ANY'
        ? results.some((result) => result.satisfied)
        : results.every((result) => result.satisfied);
    const matchedTerms = results.filter((result) => result.satisfied).map((result) => result.label);
    const missingTerms = results
      .filter((result) => !result.satisfied)
      .map((result) => result.label);

    if (satisfied) {
      return {
        satisfied: true,
        needsReview: false,
        reason: '장면 진행 조건을 만족했습니다.',
        matchedTerms,
        missingTerms,
      };
    }

    const requiresGmApproval = results.some(
      (result) => result.requirement.type === 'GM_APPROVAL' || contract.confidence < 0.55
    );

    return {
      satisfied: false,
      needsReview: requiresGmApproval || matchedTerms.length > 0,
      reason: matchedTerms.length
        ? `장면 이동 조건을 일부만 확인했습니다. 부족한 조건: ${missingTerms.join(', ')}`
        : `아직 장면 이동 조건을 만족하지 못했습니다. 필요한 조건: ${missingTerms.join(', ')}`,
      matchedTerms,
      missingTerms,
    };
  }

  private evaluateTransitionRequirement(
    requirement: TransitionConditionContractRequirement,
    evidence: TransitionEvidence
  ): boolean {
    const polarity = requirement.polarity ?? 'MUST';
    const positiveResult = (() => {
      switch (requirement.type) {
        case 'ACTION_EVIDENCE':
        case 'OBJECT_STATE':
          return this.textEvidenceMatches(
            requirement.text,
            this.normalizeTransitionConditionText(evidence.recentLogs.join(' '))
          );
        case 'CLUE_REVEALED':
          return this.textEvidenceMatches(
            requirement.text,
            this.normalizeTransitionConditionText(evidence.revealedClues.join(' '))
          );
        case 'CLUE_NOT_REVEALED':
          return !this.textEvidenceMatches(
            requirement.text,
            this.normalizeTransitionConditionText(evidence.revealedClues.join(' '))
          );
        case 'COMBAT_RESOLVED':
          return (
            evidence.combatResolvedForCurrentNode ||
            this.textEvidenceMatches(
              requirement.text || '전투 종료',
              this.normalizeTransitionConditionText(evidence.recentLogs.join(' '))
            )
          );
        case 'FLAG_SET':
          return this.textEvidenceMatches(
            requirement.text,
            this.normalizeTransitionConditionText(JSON.stringify(evidence.flags))
          );
        case 'GM_APPROVAL':
          return false;
        default:
          return false;
      }
    })();

    return polarity === 'MUST_NOT' ? !positiveResult : positiveResult;
  }

  private isAutoTransitionCondition(condition: string): boolean {
    return AUTO_TRANSITION_CONDITIONS.has(this.normalizeTransitionConditionText(condition));
  }

  private normalizeTransitionConditionText(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private textEvidenceMatches(needle: string, normalizedEvidenceText: string): boolean {
    const normalizedNeedle = this.normalizeTransitionConditionText(needle);
    if (!normalizedNeedle) {
      return false;
    }
    if (normalizedEvidenceText.includes(normalizedNeedle)) {
      return true;
    }

    const terms = this.extractTransitionConditionTerms(normalizedNeedle);
    if (!terms.length) {
      return false;
    }
    const matchedCount = terms.filter((term) => normalizedEvidenceText.includes(term)).length;
    const requiredMatchCount = terms.length <= 3 ? terms.length : Math.ceil(terms.length * 0.7);
    return matchedCount >= requiredMatchCount;
  }

  private isSceneTransitionLogLine(line: string): boolean {
    const normalized = line.trim();
    return (
      normalized.includes('/장면진행') ||
      normalized.includes('화면으로 이동했습니다') ||
      normalized.includes('장면으로 이동했습니다')
    );
  }

  private extractTransitionConditionTerms(condition: string): string[] {
    return this.dedupeTerms(
      this.normalizeTransitionConditionText(condition)
        .split(' ')
        .map((term) => this.stripKoreanCaseMarker(term))
        .filter((term) => term.length >= 2)
        .filter((term) => !TRANSITION_CONDITION_STOP_WORDS.has(term))
    );
  }

  private extractTransitionConditionAlternatives(condition: string): string[] {
    return condition
      .split(/\b(?:or)\b|또는|혹은|아니면|하거나|거나|든지|던지/iu)
      .map((alternative) => alternative.trim())
      .filter(Boolean);
  }

  private dedupeTerms(terms: string[]): string[] {
    const seen = new Set<string>();
    return terms.filter((term) => {
      if (seen.has(term)) {
        return false;
      }
      seen.add(term);
      return true;
    });
  }

  private stripKoreanCaseMarker(term: string): string {
    return term
      .replace(
        /(해야만|해야|하여야|했으면|했을|했다|한다|했고|하고|하기|하거나|되었으면|되었을|되었다|되면|었으면|았으면|었을|았을|었다|았다|으면)$/u,
        ''
      )
      .replace(
        /(으로는|으로서|으로써|에서|에게|부터|까지|처럼|보다|으로|로|은|는|이|가|을|를|에|의|도|만|와|과)$/u,
        ''
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
      throw badRequest('MAIN_COMMAND_400', '이동 대상 노드를 찾을 수 없습니다.', {
        reason: 'TRANSITION_TARGET_NOT_FOUND',
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
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null;
    }

    const vttMap = (parsed as Record<string, unknown>).vttMap;
    if (!vttMap || typeof vttMap !== 'object' || Array.isArray(vttMap)) {
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

  private toExpectedMainScreenType(
    nodeType: string,
    flagsJson: string | null,
    nodeId: string
  ): MainCommandScreenType {
    const screenType = this.toMainScreenType(nodeType);
    if (screenType !== MainCommandScreenType.COMBAT) {
      return screenType;
    }

    const flags = this.parseJson<Record<string, unknown>>(flagsJson, {});
    const completedCombatNodeIds = Array.isArray(flags.completedCombatNodeIds)
      ? flags.completedCombatNodeIds.filter((value): value is string => typeof value === 'string')
      : [];

    return completedCombatNodeIds.includes(nodeId)
      ? MainCommandScreenType.EXPLORATION
      : MainCommandScreenType.COMBAT;
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
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readTransitionConditionRule(value: unknown): TransitionConditionRule | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const source = value as Record<string, unknown>;
    const logic = source.logic === 'ANY' ? 'ANY' : 'ALL';
    const rawRequirements = Array.isArray(source.requirements) ? source.requirements : [];
    const requirements: TransitionConditionRequirement[] = rawRequirements
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .reduce<TransitionConditionRequirement[]>((acc, item) => {
        const rawType = this.readString(item.type);
        const type = this.readTransitionRequirementType(rawType);
        if (!type) {
          return acc;
        }
        acc.push({
          type,
          targetId: this.readString(item.targetId),
          flagKey: this.readString(item.flagKey),
          flagValue: this.readString(item.flagValue),
        });
        return acc;
      }, []);

    return requirements.length ? { logic, requirements } : null;
  }

  private readTransitionRequirementType(
    value: string | null
  ): TransitionConditionRequirementType | null {
    switch (value) {
      case 'ALWAYS':
      case 'CLUE_REVEALED':
      case 'COMBAT_RESOLVED':
      case 'NODE_VISITED':
      case 'FLAG_SET':
      case 'GM_APPROVAL':
        return value;
      default:
        return null;
    }
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => this.readString(item)).filter((item): item is string => Boolean(item))
      : [];
  }

  private readDc(value: unknown): number | null {
    const dc = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isInteger(dc) && dc >= 5 && dc <= 30 ? dc : null;
  }

  private clampHintNumber(value: unknown, min: number, max: number, fallback: number): number {
    const parsed =
      typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.floor(parsed), min), max);
  }

  private readPoint(value: unknown): { x: number; y: number } | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const point = value as Record<string, unknown>;
    return typeof point.x === 'number' &&
      Number.isFinite(point.x) &&
      typeof point.y === 'number' &&
      Number.isFinite(point.y)
      ? { x: point.x, y: point.y }
      : null;
  }
}
