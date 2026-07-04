import { Injectable } from "@nestjs/common";
import {
  MainCommandActionCandidateDto,
  MainCommandCheckOptionDto,
  MainCommandResponseDto,
  MainCommandStatus,
  SubmitMainCommandDto,
} from "@trpg/shared-types";
import { MainCommandInterpreterRouterService } from "./main-command-interpreter-router.service";
import type { ResolvedInterpreterActionRoute } from "./main-command-interpreter-router.service";
import { MainCommandPersistenceService } from "./main-command-persistence.service";

@Injectable()
export class MainCommandInterpreterRouteResponseService {
  constructor(
    private readonly mainCommandInterpreterRouter: MainCommandInterpreterRouterService,
    private readonly mainCommandPersistence: MainCommandPersistenceService,
  ) {}

  buildNonMainCommandRouteResponse(requestId: string, route: ResolvedInterpreterActionRoute): MainCommandResponseDto | null {
    if (route.config.route === "MAIN_COMMAND") {
      return null;
    }

    if (route.config.route === "GAME_META_QUESTION") {
      return {
        requestId,
        status: MainCommandStatus.MESSAGE,
        message:
          "TRPG는 플레이어가 캐릭터의 말과 행동을 선언하면 GM이 장면과 결과를 이어가는 역할극 게임입니다. " +
          "이 화면에서는 자유롭게 행동을 적거나 `/명령어`를 붙여 더 빠르게 요청할 수 있습니다.",
        data: {
          interpreterRoute: this.mainCommandInterpreterRouter.buildInterpreterRouteData(route),
        },
      };
    }

    return {
      requestId,
      status: MainCommandStatus.IMPOSSIBLE,
      message: route.config.message,
      data: {
        interpreterRoute: this.mainCommandInterpreterRouter.buildInterpreterRouteData(route),
      },
    };
  }

  buildMissingRequirementResponse(
    requestId: string,
    message: string,
    route: ResolvedInterpreterActionRoute,
  ): MainCommandResponseDto {
    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message,
      data: {
        interpreterRoute: this.mainCommandInterpreterRouter.buildInterpreterRouteData(route),
      },
    };
  }

  buildClarificationResponse(requestId: string, question?: string | null): MainCommandResponseDto {
    return {
      requestId,
      status: MainCommandStatus.MESSAGE,
      message: question ?? "어떤 행동이나 요청을 하려는지 조금 더 구체적으로 적어주세요.",
    };
  }

  buildCheckRequiredResponse(
    requestId: string,
    actionSummary: string,
    checkOptions: MainCommandCheckOptionDto[],
    actionCandidate: MainCommandActionCandidateDto,
  ): MainCommandResponseDto {
    return {
      requestId,
      status: MainCommandStatus.CHECK_REQUIRED,
      message: `${actionSummary}에는 판정이 필요합니다.`,
      checkOptions,
      actionCandidate,
    };
  }

  buildLowConfidenceApprovalResponse(
    requestId: string,
    actionSummary: string,
    actionCandidate: MainCommandActionCandidateDto,
  ): MainCommandResponseDto {
    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `${actionSummary}은(는) 상황 확인 또는 추가 검증이 필요합니다.`,
      actionCandidate,
    };
  }

  buildRecordedCandidateResponse(
    requestId: string,
    actionSummary: string,
    actionCandidate: MainCommandActionCandidateDto,
  ): MainCommandResponseDto {
    return {
      requestId,
      status: MainCommandStatus.GM_APPROVAL_REQUIRED,
      message: `행동 후보로 기록했습니다: ${actionSummary}. 결과는 아직 확정되지 않았습니다.`,
      actionCandidate,
    };
  }

  withRoutedMainCommandData(
    response: MainCommandResponseDto,
    routedDto: SubmitMainCommandDto,
    route: ResolvedInterpreterActionRoute,
  ): MainCommandResponseDto {
    const effectiveMainCommand = this.mainCommandPersistence.buildEffectiveMainCommandData(routedDto);

    return {
      ...response,
      data: {
        ...(response.data ?? {}),
        effectiveMainCommand,
        interpreterRoute: this.mainCommandInterpreterRouter.buildInterpreterRouteData(route),
      },
    };
  }
}
