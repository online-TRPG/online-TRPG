import { Injectable } from "@nestjs/common";
import {
  MainCommandResponseDto,
  MainCommandStatus,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { AiService } from "../ai/ai.service";
import type { LoadedContext } from "./main-commands.service";
import { MainCommandInterpreterPayloadService } from "./main-command-interpreter-payload.service";
import { MainCommandRuleFragmentService } from "./main-command-rule-fragment.service";
import type { RuleFragmentSummary } from "./main-command-rule-fragment.service";
import type { VisibleSceneEntity } from "./main-command-scene-entity.service";

@Injectable()
export class MainCommandRuleQueryService {
  constructor(
    private readonly aiService: AiService,
    private readonly mainCommandInterpreterPayload: MainCommandInterpreterPayloadService,
    private readonly mainCommandRuleFragments: MainCommandRuleFragmentService,
  ) {}

  async handleRuleQuery(
    requestId: string,
    userId: string,
    context: LoadedContext,
    dto: SubmitMainCommandDto,
    visibleEntities: VisibleSceneEntity[],
  ): Promise<MainCommandResponseDto> {
    const interpreter = await this.aiService.runInterpreter(
      context.sessionId,
      userId,
      this.mainCommandInterpreterPayload.buildInterpreterPayload(context, dto, visibleEntities),
    );
    const requiredRuleCheckIds = interpreter.parsed.requiredRuleCheckIds ?? [];
    const matchingRules = this.mainCommandRuleFragments.loadRuleFragments().filter((fragment) => requiredRuleCheckIds.includes(fragment.id));

    return this.buildRuleQueryResponse(requestId, dto, matchingRules);
  }

  private buildRuleQueryResponse(requestId: string, dto: SubmitMainCommandDto, matchingRules: RuleFragmentSummary[]): MainCommandResponseDto {
    if (!matchingRules.length) {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message: "지금 질문에서 바로 연결할 규칙 조각을 찾지 못했습니다. 행동, 대상, 주문 이름을 조금 더 구체적으로 적어주세요.",
      };
    }

    const relatedIntentText = dto.relatedIntent ? `관련 명령: ${dto.relatedIntent}. ` : "";
    const lines = matchingRules.slice(0, 3).map((fragment) => `${fragment.titleKo}: ${fragment.summaryKo}`);

    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: `${relatedIntentText}${lines.join(" / ")}`,
    };
  }
}
