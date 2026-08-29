import { Injectable } from "@nestjs/common";
import {
  MainCommandActionCandidateDto,
  MainCommandCheckOptionDto,
  MainCommandIntent,
  MainCommandResponseDto,
  MainCommandStatus,
  MainCommandTargetType,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { AiService } from "../ai/ai.service";
import type { InterpreterRequestPayload } from "../ai/ai.client";
import { SessionsService } from "../sessions/sessions.service";
import { MainCommandApprovalPolicyService } from "./main-command-approval-policy.service";
import type { MainCommandCheckAction } from "./main-command-check-builder.service";
import { MAIN_COMMAND_CONFIDENCE } from "./main-command-policy.constants";
import type { InterpreterParsedForRouting, LoadedContext, VisibleSceneEntity } from "./main-commands.service";

export type MainCommandIntentHandlersRuntime = {
  aiService: AiService;
  sessionsService: SessionsService;
  buildActionCandidate: (context: LoadedContext, dto: SubmitMainCommandDto, actionSummary: string) => MainCommandActionCandidateDto;
  buildCheckOptions: (action: MainCommandCheckAction) => MainCommandCheckOptionDto[];
  buildDangerDetectionCheckOptions: (action: MainCommandCheckAction) => MainCommandCheckOptionDto[];
  buildDeceptionCheckOptions: (action: MainCommandCheckAction, targetName: string) => MainCommandCheckOptionDto[];
  buildInsightCheckOptions: (action: MainCommandCheckAction, targetName: string) => MainCommandCheckOptionDto[];
  buildInterpreterPayload: (
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs?: string[],
  ) => InterpreterRequestPayload;
  buildIntimidationCheckOptions: (action: MainCommandCheckAction, targetName: string) => MainCommandCheckOptionDto[];
  buildInvestigationCheckOptions: (action: MainCommandCheckAction, targetName: string) => MainCommandCheckOptionDto[];
  buildItemExploreCheckOptions: (
    action: MainCommandCheckAction,
    itemName: string,
    targetName?: string,
  ) => MainCommandCheckOptionDto[];
  buildObjectInteractionCheckOptions: (action: MainCommandCheckAction, targetName: string) => MainCommandCheckOptionDto[];
  buildPerceptionCheckOptions: (action: MainCommandCheckAction) => MainCommandCheckOptionDto[];
  buildPersuasionCheckOptions: (action: MainCommandCheckAction, targetName: string) => MainCommandCheckOptionDto[];
  buildSpecialMoveCheckOptions: (action: MainCommandCheckAction) => MainCommandCheckOptionDto[];
  buildToolUseCheckOptions: (
    action: MainCommandCheckAction,
    toolName: string,
    targetName?: string,
  ) => MainCommandCheckOptionDto[];
  canUseExplicitPlayerText: (
    dto: SubmitMainCommandDto,
    options: { acceptsMapPoint?: boolean; acceptsTarget?: boolean },
  ) => boolean;
  handleNpcDialogue: (
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ) => Promise<MainCommandResponseDto>;
  handleRuleQuery: (
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ) => Promise<MainCommandResponseDto>;
  handleSceneInfo: (
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ) => MainCommandResponseDto;
  handleSceneTransition: (
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
  ) => Promise<MainCommandResponseDto>;
  handleSummary: (
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
  ) => Promise<MainCommandResponseDto>;
  handleTacticQuery: (
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ) => Promise<MainCommandResponseDto>;
  resolveEntity: (
    dto: SubmitMainCommandDto,
    entities: VisibleSceneEntity[],
    preferredType?: MainCommandTargetType,
  ) => VisibleSceneEntity | null;
  resolveOwnedItemName: (context: LoadedContext, itemId?: string | null) => string;
  shouldRequireMainCommandCheck: (
    action: InterpreterParsedForRouting["action"],
    dto: SubmitMainCommandDto,
    needsClarification: boolean,
  ) => boolean;
};

@Injectable()
export class MainCommandIntentHandlersService {
  constructor(private readonly mainCommandApprovalPolicy: MainCommandApprovalPolicyService) {}

  create(runtime: MainCommandIntentHandlersRuntime): MainCommandIntentHandlersRunner {
    return new MainCommandIntentHandlersRunner(runtime, this.mainCommandApprovalPolicy);
  }
}

export class MainCommandIntentHandlersRunner {
  constructor(
    private readonly runtime: MainCommandIntentHandlersRuntime,
    private readonly mainCommandApprovalPolicy: MainCommandApprovalPolicyService,
  ) {}

  private get aiService(): AiService {
    return this.runtime.aiService;
  }

  private get sessionsService(): SessionsService {
    return this.runtime.sessionsService;
  }

  private buildActionCandidate(context: LoadedContext, dto: SubmitMainCommandDto, actionSummary: string): MainCommandActionCandidateDto {
    return this.runtime.buildActionCandidate(context, dto, actionSummary);
  }

  private buildCheckOptions(action: MainCommandCheckAction): MainCommandCheckOptionDto[] {
    return this.runtime.buildCheckOptions(action);
  }

  private buildDangerDetectionCheckOptions(action: MainCommandCheckAction): MainCommandCheckOptionDto[] {
    return this.runtime.buildDangerDetectionCheckOptions(action);
  }

  private buildDeceptionCheckOptions(action: MainCommandCheckAction, targetName: string): MainCommandCheckOptionDto[] {
    return this.runtime.buildDeceptionCheckOptions(action, targetName);
  }

  private buildInsightCheckOptions(action: MainCommandCheckAction, targetName: string): MainCommandCheckOptionDto[] {
    return this.runtime.buildInsightCheckOptions(action, targetName);
  }

  private buildInterpreterPayload(
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs?: string[],
  ): InterpreterRequestPayload {
    return this.runtime.buildInterpreterPayload(context, dto, visibleEntities, recentLogs);
  }

  private buildIntimidationCheckOptions(action: MainCommandCheckAction, targetName: string): MainCommandCheckOptionDto[] {
    return this.runtime.buildIntimidationCheckOptions(action, targetName);
  }

  private buildInvestigationCheckOptions(action: MainCommandCheckAction, targetName: string): MainCommandCheckOptionDto[] {
    return this.runtime.buildInvestigationCheckOptions(action, targetName);
  }

  private buildItemExploreCheckOptions(
    action: MainCommandCheckAction,
    itemName: string,
    targetName?: string,
  ): MainCommandCheckOptionDto[] {
    return this.runtime.buildItemExploreCheckOptions(action, itemName, targetName);
  }

  private buildObjectInteractionCheckOptions(action: MainCommandCheckAction, targetName: string): MainCommandCheckOptionDto[] {
    return this.runtime.buildObjectInteractionCheckOptions(action, targetName);
  }

  private buildPerceptionCheckOptions(action: MainCommandCheckAction): MainCommandCheckOptionDto[] {
    return this.runtime.buildPerceptionCheckOptions(action);
  }

  private buildPersuasionCheckOptions(action: MainCommandCheckAction, targetName: string): MainCommandCheckOptionDto[] {
    return this.runtime.buildPersuasionCheckOptions(action, targetName);
  }

  private buildSpecialMoveCheckOptions(action: MainCommandCheckAction): MainCommandCheckOptionDto[] {
    return this.runtime.buildSpecialMoveCheckOptions(action);
  }

  private buildToolUseCheckOptions(
    action: MainCommandCheckAction,
    toolName: string,
    targetName?: string,
  ): MainCommandCheckOptionDto[] {
    return this.runtime.buildToolUseCheckOptions(action, toolName, targetName);
  }

  private canUseExplicitPlayerText(
    dto: SubmitMainCommandDto,
    options: { acceptsMapPoint?: boolean; acceptsTarget?: boolean },
  ): boolean {
    return this.runtime.canUseExplicitPlayerText(dto, options);
  }

  private handleNpcDialogue(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    return this.runtime.handleNpcDialogue(requestId, userId, context, dto, visibleEntities, recentLogs);
  }

  private handleRuleQuery(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    return this.runtime.handleRuleQuery(requestId, userId, context, dto, visibleEntities);
  }

  private handleSceneInfo(
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): MainCommandResponseDto {
    return this.runtime.handleSceneInfo(requestId, context, dto, visibleEntities);
  }

  private handleSceneTransition(
    requestId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    return this.runtime.handleSceneTransition(requestId, context, dto, recentLogs);
  }

  private handleSummary(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    return this.runtime.handleSummary(requestId, userId, context, dto, recentLogs);
  }

  private handleTacticQuery(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    recentLogs: string[],
    publicClues: string[],
  ): Promise<MainCommandResponseDto> {
    return this.runtime.handleTacticQuery(requestId, userId, context, dto, recentLogs, publicClues);
  }

  private resolveEntity(
    dto: SubmitMainCommandDto,
    entities: VisibleSceneEntity[],
    preferredType?: MainCommandTargetType,
  ): VisibleSceneEntity | null {
    return this.runtime.resolveEntity(dto, entities, preferredType);
  }

  private resolveOwnedItemName(context: LoadedContext, itemId?: string | null): string {
    return this.runtime.resolveOwnedItemName(context, itemId);
  }

  private shouldRequireMainCommandCheck(
    action: InterpreterParsedForRouting["action"],
    dto: SubmitMainCommandDto,
    needsClarification: boolean,
  ): boolean {
    return this.runtime.shouldRequireMainCommandCheck(action, dto, needsClarification);
  }

  async handleCombatTalk(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

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
        message: interpreter.parsed.clarificationQuestion ?? "누구에게 어떤 말투와 의도로 말하는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || interpreter.parsed.action.type || dto.playerText;
    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${actionSummary}에는 판정이 필요합니다.`,
        checkOptions: this.buildCheckOptions(interpreter.parsed.action),
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    if (this.mainCommandApprovalPolicy.requiresGmApproval(dto.intent)) {
      return {
        requestId,
        status: MainCommandStatus.GM_APPROVAL_REQUIRED,
        message: `${actionSummary}은(는) 상황 확인 또는 추가 검증이 필요합니다.`,
        actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
      };
    }

    return this.handleNpcDialogue(requestId, userId, context, dto, visibleEntities, recentLogs);
  }

  async handleSocialPersuade(
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

    const interpreter = await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

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
        message: interpreter.parsed.clarificationQuestion ?? `${npc.name}을(를) 어떤 근거로 설득하려는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const normalizedDisposition = npc.disposition.trim().toLowerCase();
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${npc.name} 설득에는 판정이 필요합니다.`,
        checkOptions: this.buildPersuasionCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (normalizedDisposition === "hostile" && confidence < MAIN_COMMAND_CONFIDENCE.HOSTILE_PERSUASION_REJECT_THRESHOLD) {
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

  async handleSocialIntimidate(
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

    const interpreter = await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

    const bypassClarification = this.canUseExplicitPlayerText(dto, {
      acceptsTarget: true,
    });
    if (interpreter.parsed.needsClarification && !bypassClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: interpreter.parsed.clarificationQuestion ?? `${npc.name}에게 어떤 위협이나 압박을 가하는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const normalizedDisposition = npc.disposition.trim().toLowerCase();
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${npc.name} 압박에는 판정이 필요합니다.`,
        checkOptions: this.buildIntimidationCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (confidence < MAIN_COMMAND_CONFIDENCE.INTIMIDATE_MINIMUM) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: `${npc.name}에게 통할 만한 위협 근거가 부족합니다. 더 직접적인 압박 수단이나 위험 요소를 제시해야 합니다.`,
        actionCandidate,
      };
    }

    if (normalizedDisposition === "friendly" && confidence < MAIN_COMMAND_CONFIDENCE.FRIENDLY_INTIMIDATION_REJECT_THRESHOLD) {
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

  async handleSocialDeceive(
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

    const interpreter = await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

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
        message: interpreter.parsed.clarificationQuestion ?? `${npc.name}에게 어떤 거짓 정보나 신분을 제시하는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);
    const confidence = interpreter.parsed.action.confidence ?? 0;

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${npc.name} 속이기에는 판정이 필요합니다.`,
        checkOptions: this.buildDeceptionCheckOptions(interpreter.parsed.action, npc.name),
        actionCandidate,
      };
    }

    if (confidence < MAIN_COMMAND_CONFIDENCE.DECEPTION_MINIMUM) {
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

  async handleReadEmotion(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-6)),
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
        message: interpreter.parsed.clarificationQuestion ?? `${npc.name}의 어떤 감정이나 반응을 읽고 싶은지 조금 더 구체적으로 적어주세요.`,
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

  async handleInspectStoryObject(
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

    const interpreter = await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

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
        message: interpreter.parsed.clarificationQuestion ?? `${objectTarget.name}의 어떤 부분을 살펴보는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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

  handleDeclareRpAction(requestId: string, context: LoadedContext, dto: SubmitMainCommandDto): MainCommandResponseDto {
    const actionSummary = dto.playerText.trim();

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: "RP 행동을 기록했습니다.",
      actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
    };
  }

  async handleObserveArea(requestId: string, context: LoadedContext, dto: SubmitMainCommandDto): Promise<MainCommandResponseDto> {
    const actionSummary = dto.playerText.trim() || "주변을 살핀다";

    return {
      requestId,
      status: MainCommandStatus.CHECK_REQUIRED,
      message: "주변을 면밀하게 살피려면 판정이 필요합니다.",
      checkOptions: this.buildPerceptionCheckOptions({
        ability: "wis",
        skill: "perception",
        approach: actionSummary,
        suggestedDifficulty: "medium",
      }),
      actionCandidate: this.buildActionCandidate(context, dto, actionSummary),
    };
  }

  async handleInvestigateObject(
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

    const investigationTargets = visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.OBJECT || entity.kind === MainCommandTargetType.AREA);
    const target = dto.targetId ? this.resolveEntity(dto, investigationTargets, dto.targetType) : null;

    const interpreter = interpreted
      ? { parsed: interpreted }
      : await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

    const bypassClarification = this.canUseExplicitPlayerText(dto, {
      acceptsMapPoint: true,
      acceptsTarget: Boolean(target),
    });
    if (interpreter.parsed.needsClarification && !bypassClarification) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: interpreter.parsed.clarificationQuestion ?? "무엇을 어떻게 조사하는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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
      message: "조사할 대상이나 위치를 지정하지 않았습니다.",
      actionCandidate,
    };
  }

  async handleListen(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const listenTargets = visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.OBJECT || entity.kind === MainCommandTargetType.AREA);
    const target = dto.targetId ? this.resolveEntity(dto, listenTargets, dto.targetType) : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
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
        message: interpreter.parsed.clarificationQuestion ?? "어느 쪽이나 어떤 지점을 향해 귀를 기울이는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "미세한 소리나 기척을 알아내려면 판정이 필요합니다.",
        checkOptions: this.buildPerceptionCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const pointSummary = dto.mapPoint ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 부근에 귀를 기울였습니다.` : "";
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

  async handleDetectDanger(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
    recentLogs: string[],
  ): Promise<MainCommandResponseDto> {
    const dangerTargets = visibleEntities.filter((entity) => entity.kind === MainCommandTargetType.OBJECT || entity.kind === MainCommandTargetType.AREA);
    const target = dto.targetId ? this.resolveEntity(dto, dangerTargets, dto.targetType) : null;

    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
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
        message: interpreter.parsed.clarificationQuestion ?? "어느 위치의 어떤 위험을 경계하는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "숨은 위험이나 매복을 감지하려면 판정이 필요합니다.",
        checkOptions: this.buildDangerDetectionCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const targetSummary = target ? ` ${target.name} 부근에서 즉시 드러난 위험은 보이지 않습니다.` : " 즉시 드러난 위험 신호는 보이지 않습니다.";
    const pointSummary = dto.mapPoint ? ` (${dto.mapPoint.x}, ${dto.mapPoint.y}) 주변을 경계했습니다.` : "";

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${context.currentNodeTitle}.${pointSummary}${targetSummary}`.trim(),
      actionCandidate,
    };
  }

  async handleSpecialMove(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

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
        message: interpreter.parsed.clarificationQuestion ?? "어느 위치로 어떤 방식으로 이동하려는지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (
      this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification) ||
      interpreter.parsed.action.confidence < 0.8
    ) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "특수 이동을 시도하려면 판정이 필요합니다.",
        checkOptions: this.buildSpecialMoveCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    if (!dto.mapPoint) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: "특수 이동을 시도하려면 위치가 필요합니다.",
        checkOptions: this.buildSpecialMoveCheckOptions(interpreter.parsed.action),
        actionCandidate,
      };
    }

    const mapPoint = dto.mapPoint;
    const itemSummary = dto.itemId ? ` 도구 ${dto.itemId} 사용을 함께 고려합니다.` : "";
    const moveResult = await this.sessionsService.moveSessionCharacterTokenToMapPoint({
      sessionId: context.sessionId,
      sessionCharacterId: context.sessionCharacterId,
      mapPoint,
    });

    return {
      requestId,
      status: moveResult.status,
      message:
        moveResult.status === MainCommandStatus.RESOLVED
          ? `(${mapPoint.x}, ${mapPoint.y}) 방향 특수 이동에 성공했습니다.${itemSummary}\n\n${moveResult.message}`
          : moveResult.message,
      actionCandidate,
    };
  }

  async handleInteractObject(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
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
      MainCommandTargetType.OBJECT,
    );

    if (!objectTarget) {
      return {
        requestId,
        status: MainCommandStatus.IMPOSSIBLE,
        message: "조작할 오브젝트를 지정하지 않았습니다. 공개된 문, 상자, 장치 중 하나를 골라주세요.",
      };
    }

    const interpreter = await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

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
        message: interpreter.parsed.clarificationQuestion ?? `${objectTarget.name}을(를) 어떤 방식으로 조작하는지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${objectTarget.name}을(를) 조작하려면 판정이 필요합니다.`,
        checkOptions: this.buildObjectInteractionCheckOptions(interpreter.parsed.action, objectTarget.name),
        actionCandidate,
      };
    }

    if (interpreter.parsed.action.confidence < MAIN_COMMAND_CONFIDENCE.TOOL_OR_OBJECT_GM_REVIEW_THRESHOLD) {
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
    return /(함정|덫|트랩|위험|장치).*(해제|무력화|분해|제거)|(해제|무력화|분해|제거).*(함정|덫|트랩|위험|장치)/.test(text);
  }

  async handleUseTool(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const toolName = this.resolveOwnedItemName(context, dto.itemId);
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? "어디에";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: interpreter.parsed.clarificationQuestion ?? `${toolName}을(를) ${targetLabel} 어떤 방식으로 사용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
      return {
        requestId,
        status: MainCommandStatus.CHECK_REQUIRED,
        message: `${toolName} 사용에는 판정이 필요합니다.`,
        checkOptions: this.buildToolUseCheckOptions(interpreter.parsed.action, toolName, target?.name),
        actionCandidate,
      };
    }

    if (interpreter.parsed.action.confidence < MAIN_COMMAND_CONFIDENCE.TOOL_OR_OBJECT_GM_REVIEW_THRESHOLD) {
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
      message: targetLabel ? `${toolName}을(를) ${targetLabel}에 사용해볼 수 있습니다.` : `${toolName}을(를) 사용해볼 수 있습니다.`,
      actionCandidate,
    };
  }

  async handleUseItemExplore(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const target = dto.targetId ? this.resolveEntity(dto, visibleEntities, dto.targetType) : null;
    const itemName = this.resolveOwnedItemName(context, dto.itemId);
    const locationLabel = dto.mapPoint ? `(${dto.mapPoint.x}, ${dto.mapPoint.y}) 지점` : null;

    const interpreter = await this.aiService.runInterpreter(context.sessionId, userId, this.buildInterpreterPayload(context, dto, visibleEntities));

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? "어디에";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: interpreter.parsed.clarificationQuestion ?? `${itemName}을(를) ${targetLabel} 어떤 방식으로 활용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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

  async handleSplitPartyTask(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-6)),
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
        message: interpreter.parsed.clarificationQuestion ?? "누가 무엇을 맡을지 조금 더 분명하게 적어주세요.",
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < MAIN_COMMAND_CONFIDENCE.DEFAULT_GM_REVIEW_THRESHOLD) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: "분담 계획은 이해했지만 역할 구분이 아직 모호합니다. 각 인원이 맡을 일을 더 구체적으로 적어주세요.",
        actionCandidate,
      };
    }

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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

  async handleCombatManeuver(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
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
        message: interpreter.parsed.clarificationQuestion ?? "어떤 전투 기동을 시도할지 조금 더 구체적으로 적어주세요.",
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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

  async handleEnvironmentUse(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? "주변 환경";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: interpreter.parsed.clarificationQuestion ?? `${targetLabel}을(를) 전투에 어떻게 활용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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

  async handleImprovisedAttack(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
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
        message: interpreter.parsed.clarificationQuestion ?? `${target.name}을(를) 어떤 식으로 즉석 공격할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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

  async handleCalledShot(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
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
        message: interpreter.parsed.clarificationQuestion ?? `${target.name}의 어느 부위를 어떻게 노릴지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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

  async handleReadyAction(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
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
        message: interpreter.parsed.clarificationQuestion ?? "어떤 상황이 오면 무엇을 할지 더 분명하게 적어주세요.",
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < MAIN_COMMAND_CONFIDENCE.DEFAULT_GM_REVIEW_THRESHOLD) {
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
      checkOptions: this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)
        ? this.buildCheckOptions(interpreter.parsed.action)
        : undefined,
      actionCandidate,
    };
  }

  async handleReactionRequest(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
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
        message: interpreter.parsed.clarificationQuestion ?? "어떤 상황에 반응하려는지와 어떤 반응을 하려는지 더 분명하게 적어주세요.",
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < MAIN_COMMAND_CONFIDENCE.DEFAULT_GM_REVIEW_THRESHOLD) {
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
      checkOptions: this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)
        ? this.buildCheckOptions(interpreter.parsed.action)
        : undefined,
      actionCandidate,
    };
  }

  async handleUseItemCombat(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? "어디에";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: interpreter.parsed.clarificationQuestion ?? `${itemName}을(를) ${targetLabel} 어떻게 전투에 사용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < MAIN_COMMAND_CONFIDENCE.DEFAULT_GM_REVIEW_THRESHOLD) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: "전투 아이템 사용 방식이 아직 모호합니다. 대상과 사용 방식을 더 구체적으로 적어주세요.",
        actionCandidate,
      };
    }

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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

  async handleUseSpellCreatively(
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
      this.buildInterpreterPayload(context, dto, visibleEntities, recentLogs.slice(-4)),
    );

    if (
      interpreter.parsed.needsClarification &&
      !this.canUseExplicitPlayerText(dto, {
        acceptsMapPoint: true,
        acceptsTarget: Boolean(dto.targetId),
      })
    ) {
      const targetLabel = target?.name ?? locationLabel ?? "어디에";
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: interpreter.parsed.clarificationQuestion ?? `${spellName}을(를) ${targetLabel} 어떻게 창의적으로 사용할지 조금 더 구체적으로 적어주세요.`,
      };
    }

    const actionSummary = interpreter.parsed.action.approach?.trim() || dto.playerText;
    const actionCandidate = this.buildActionCandidate(context, dto, actionSummary);

    if (interpreter.parsed.action.confidence < MAIN_COMMAND_CONFIDENCE.DEFAULT_GM_REVIEW_THRESHOLD) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: "주문 활용 방식이 아직 모호합니다. 대상과 의도를 더 구체적으로 적어주세요.",
        actionCandidate,
      };
    }

    if (this.shouldRequireMainCommandCheck(interpreter.parsed.action, dto, interpreter.parsed.needsClarification)) {
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
}
