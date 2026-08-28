import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ApiCreatedResponse, ApiOkResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import {
  AuthTokenResponseDto,
  ConvertGuestToLocalUserDto,
  ChangePasswordDto,
  ConfirmPasswordResetDto,
  CreateGuestUserDto,
  DeleteMeDto,
  EmailCheckResponseDto,
  LoginResponseDto,
  LoginUserDto,
  OAuthLoginDto,
  OAuthReauthResponseDto,
  OAuthUrlResponseDto,
  PaginatedResponse,
  PublicUserResponseDto,
  RegisterUserDto,
  RecordProductEventDto,
  RequestPasswordResetDto,
  SessionListItemResponseDto,
  SessionListQueryDto,
  UpdateUserProductProgressDto,
  UpdateMeDto,
  UserProductProgressResponseDto,
  UserResponseDto,
} from "@trpg/shared-types";
import { apiResponse, ApiResponse } from "../../common/api-response";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { getRefreshTokenExpiresInMs } from "../../common/auth/token.utils";
import { Public } from "../../common/auth/public.decorator";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import {
  getRefreshCookieName,
  getRefreshCookieSameSite,
  isTrustedBrowserRequestOrigin,
} from "../../common/security/browser-security";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "./users.service";
import { ProductEventsService } from "./product-events.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly productEvents: ProductEventsService,
  ) {}

  @Post("guest")
  @Public()
  @ApiCreatedResponse({ type: LoginResponseDto })
  async createGuest(
    @Body() dto: CreateGuestUserDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LoginResponseDto>> {
    this.assertTrustedBrowserRequest(request);
    const result = await this.usersService.createGuest(dto);
    this.setRefreshCookie(response, result.refreshToken);
    return apiResponse("USER_201", "게스트 계정이 생성되었습니다.", result.body);
  }

  @Post("register")
  @Public()
  @ApiCreatedResponse({ type: UserResponseDto })
  async register(@Body() dto: RegisterUserDto): Promise<ApiResponse<UserResponseDto>> {
    const user = await this.usersService.register(dto);
    return apiResponse("USER_201", "회원가입이 완료되었습니다.", user);
  }

  @Post("guest/convert-local")
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResponseDto })
  async convertGuestToLocal(
    @CurrentUserId() userId: string,
    @Body() dto: ConvertGuestToLocalUserDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LoginResponseDto>> {
    this.assertTrustedBrowserRequest(request);
    const result = await this.usersService.convertGuestToLocal(userId, dto);
    this.setRefreshCookie(response, result.refreshToken);
    return apiResponse("USER_200", "게스트 계정을 회원 계정으로 저장했습니다.", result.body);
  }

  @Get("email-check")
  @Public()
  @ApiOkResponse({ type: EmailCheckResponseDto })
  async checkEmail(@Query("email") email = ""): Promise<ApiResponse<EmailCheckResponseDto>> {
    const result = await this.usersService.checkEmail(email);
    return apiResponse("USER_200", "이메일 중복 확인이 완료되었습니다.", result);
  }

  @Post("login")
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body() dto: LoginUserDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LoginResponseDto>> {
    this.assertTrustedBrowserRequest(request);
    const result = await this.usersService.login(dto);
    this.setRefreshCookie(response, result.refreshToken);
    return apiResponse("USER_200", "로그인에 성공했습니다.", result.body);
  }

  @Post("logout")
  @HttpCode(200)
  @ApiSecurity("bearer")
  async logout(
    @CurrentUserId() userId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<null>> {
    this.assertTrustedBrowserRequest(request);
    await this.usersService.logout(
      userId,
      this.getRefreshToken(request),
      this.getSingleHeaderValue(request.headers["x-csrf-token"]),
    );
    this.clearRefreshCookie(response);
    return apiResponse("USER_200", "로그아웃이 완료되었습니다.", null);
  }

  @Post("reissue")
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: AuthTokenResponseDto })
  async reissue(@Req() request: Request): Promise<ApiResponse<AuthTokenResponseDto>> {
    this.assertTrustedBrowserRequest(request);
    const result = await this.usersService.reissue(
      this.getRefreshToken(request),
      this.getSingleHeaderValue(request.headers["x-csrf-token"]),
    );
    return apiResponse("USER_200", "Access Token이 재발급되었습니다.", result);
  }

  @Get("me")
  @ApiSecurity("bearer")
  @ApiOkResponse({ type: UserResponseDto })
  async getMe(@CurrentUserId() userId: string): Promise<ApiResponse<UserResponseDto>> {
    return apiResponse("USER_200", "내 정보 조회에 성공했습니다.", await this.usersService.getMe(userId));
  }

  @Patch("me")
  @HttpCode(200)
  @ApiSecurity("bearer")
  @ApiOkResponse({ type: UserResponseDto })
  async updateMe(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateMeDto,
  ): Promise<ApiResponse<UserResponseDto>> {
    return apiResponse("USER_200", "닉네임이 변경되었습니다.", await this.usersService.updateMe(userId, dto));
  }

  @Post("logout-all")
  @HttpCode(200)
  @ApiSecurity("bearer")
  async logoutAll(
    @CurrentUserId() userId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<null>> {
    this.assertTrustedBrowserRequest(request);
    await this.usersService.logoutAll(
      userId,
      this.getRefreshToken(request),
      this.getSingleHeaderValue(request.headers["x-csrf-token"]),
    );
    this.clearRefreshCookie(response);
    return apiResponse("USER_200", "모든 기기에서 로그아웃했습니다.", null);
  }

  @Patch("me/password")
  @HttpCode(200)
  @ApiSecurity("bearer")
  async changePassword(
    @CurrentUserId() userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<ApiResponse<null>> {
    await this.usersService.changePassword(userId, dto);
    return apiResponse("USER_200", "비밀번호가 변경되었습니다. 다시 로그인해주세요.", null);
  }

  @Post("password-reset/request")
  @Public()
  @HttpCode(200)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<ApiResponse<null>> {
    await this.usersService.requestPasswordReset(dto);
    return apiResponse("USER_200", "계정이 존재하고 메일 발송이 가능한 경우 재설정 안내를 보냈습니다.", null);
  }

  @Post("password-reset/confirm")
  @Public()
  @HttpCode(200)
  async confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto): Promise<ApiResponse<null>> {
    await this.usersService.confirmPasswordReset(dto);
    return apiResponse("USER_200", "비밀번호가 재설정되었습니다.", null);
  }

  @Post("me/product-events")
  @HttpCode(202)
  @ApiSecurity("bearer")
  recordProductEvent(
    @CurrentUserId() userId: string,
    @Body() dto: RecordProductEventDto,
  ): ApiResponse<null> {
    this.productEvents.record(userId, dto);
    return apiResponse("USER_202", "제품 이벤트를 기록했습니다.", null);
  }

  @Get("me/product-progress")
  @ApiSecurity("bearer")
  @ApiOkResponse({ type: UserProductProgressResponseDto })
  async getProductProgress(
    @CurrentUserId() userId: string,
  ): Promise<ApiResponse<UserProductProgressResponseDto>> {
    return apiResponse(
      "USER_200",
      "사용자 안내 진행 상태를 조회했습니다.",
      await this.usersService.getProductProgress(userId),
    );
  }

  @Patch("me/product-progress")
  @HttpCode(200)
  @ApiSecurity("bearer")
  @ApiOkResponse({ type: UserProductProgressResponseDto })
  async updateProductProgress(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateUserProductProgressDto,
  ): Promise<ApiResponse<UserProductProgressResponseDto>> {
    return apiResponse(
      "USER_200",
      "사용자 안내 진행 상태를 저장했습니다.",
      await this.usersService.updateProductProgress(userId, dto),
    );
  }

  @Get("public/:publicId")
  @Public()
  @ApiOkResponse({ type: PublicUserResponseDto })
  async getPublicProfile(
    @Param("publicId") publicId: string,
  ): Promise<ApiResponse<PublicUserResponseDto>> {
    return apiResponse("USER_200", "공개 프로필 조회에 성공했습니다.", await this.usersService.getPublicProfile(publicId));
  }

  @Delete("me")
  @HttpCode(200)
  @ApiSecurity("bearer")
  async deleteMe(
    @CurrentUserId() userId: string,
    @Body() dto: DeleteMeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<null>> {
    await this.usersService.deleteMe(userId, dto);
    this.clearRefreshCookie(response);
    return apiResponse("USER_200", "회원 탈퇴가 완료되었습니다.", null);
  }

  @Post("me/reauth/:provider")
  @HttpCode(200)
  @ApiSecurity("bearer")
  @ApiOkResponse({ type: OAuthReauthResponseDto })
  async reauthenticateOAuth(
    @CurrentUserId() userId: string,
    @Param("provider") providerParam: string,
    @Body() dto: OAuthLoginDto,
  ): Promise<ApiResponse<OAuthReauthResponseDto>> {
    const provider = providerParam.toLowerCase();
    if (provider !== "kakao" && provider !== "discord") {
      throw new BadRequestException("지원하지 않는 OAuth 제공자입니다.");
    }
    return apiResponse(
      "USER_200",
      "소셜 계정 재인증이 완료되었습니다.",
      await this.usersService.reauthenticateOAuth(userId, provider.toUpperCase() as "KAKAO" | "DISCORD", dto),
    );
  }

  @Get("oauth/kakao/url")
  @Public()
  @ApiOkResponse({ type: OAuthUrlResponseDto })
  async getKakaoUrl(
    @Query("redirectUri") redirectUri = "",
    @Query("intent") intent = "login",
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiResponse<OAuthUrlResponseDto>> {
    return apiResponse(
      "USER_200",
      "요청이 성공했습니다.",
      await this.usersService.getOAuthUrl(
        "KAKAO",
        redirectUri,
        this.readOAuthIntent(intent),
        request.accessTokenAuth?.userId,
      ),
    );
  }

  @Post("oauth/kakao/login")
  @Public()
  @HttpCode(200)
  async kakaoLogin(
    @Body() dto: OAuthLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LoginResponseDto>> {
    this.assertTrustedBrowserRequest(request);
    const result = await this.usersService.oauthLogin("KAKAO", dto);
    this.setRefreshCookie(response, result.refreshToken);
    return apiResponse("USER_200", "요청이 성공했습니다.", result.body);
  }

  @Get("oauth/discord/url")
  @Public()
  @ApiOkResponse({ type: OAuthUrlResponseDto })
  async getDiscordUrl(
    @Query("redirectUri") redirectUri = "",
    @Query("intent") intent = "login",
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiResponse<OAuthUrlResponseDto>> {
    return apiResponse(
      "USER_200",
      "요청이 성공했습니다.",
      await this.usersService.getOAuthUrl(
        "DISCORD",
        redirectUri,
        this.readOAuthIntent(intent),
        request.accessTokenAuth?.userId,
      ),
    );
  }

  @Post("oauth/discord/login")
  @Public()
  @HttpCode(200)
  async discordLogin(
    @Body() dto: OAuthLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LoginResponseDto>> {
    this.assertTrustedBrowserRequest(request);
    const result = await this.usersService.oauthLogin("DISCORD", dto);
    this.setRefreshCookie(response, result.refreshToken);
    return apiResponse("USER_200", "요청이 성공했습니다.", result.body);
  }

  @Get("me/sessions")
  @ApiSecurity("bearer")
  @ApiOkResponse({ type: [SessionListItemResponseDto] })
  async listMySessions(
    @CurrentUserId() userId: string,
    @Query() query: SessionListQueryDto,
  ): Promise<ApiResponse<PaginatedResponse<SessionListItemResponseDto>>> {
    const currentPage = query.page ?? 0;
    const pageSize = query.size ?? 10;
    const result = await this.sessionsService.listMySessions(userId, {
      query: query.query,
      status: query.status,
      activityStatus: query.activityStatus,
      gmMode: query.gmMode,
      scenarioId: query.scenarioId,
      ruleSetId: query.ruleSetId,
      role: query.role,
      sort: query.sort,
      page: currentPage,
      size: pageSize,
    });

    return apiResponse<PaginatedResponse<SessionListItemResponseDto>>(
      "SESSION_200",
      "요청이 성공했습니다.",
      this.toSessionPage(result.items, result.totalElements, currentPage, pageSize),
    );
  }

  private setRefreshCookie(
    response: Response,
    refreshToken: string,
  ): void {
    const sameSite = getRefreshCookieSameSite();
    response.cookie(getRefreshCookieName(), refreshToken, {
      httpOnly: true,
      secure: sameSite === "none" || process.env.NODE_ENV === "production",
      sameSite,
      path: "/",
      maxAge: getRefreshTokenExpiresInMs(),
    });
  }

  private getSingleHeaderValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  private readOAuthIntent(value: string): "login" | "reauth" {
    if (value === "login" || value === "reauth") {
      return value;
    }
    throw new BadRequestException("지원하지 않는 OAuth 요청 목적입니다.");
  }

  private assertTrustedBrowserRequest(request: Request): void {
    if (
      !isTrustedBrowserRequestOrigin(
        this.getSingleHeaderValue(request.headers.origin),
        this.getSingleHeaderValue(request.headers.referer),
      )
    ) {
      throw new ForbiddenException("허용되지 않은 요청 출처입니다.");
    }
  }

  private clearRefreshCookie(response: Response): void {
    const baseOptions = {
      httpOnly: true,
      path: "/",
    } as const;

    response.clearCookie(getRefreshCookieName(), {
      ...baseOptions,
      secure: process.env.NODE_ENV === "production" || getRefreshCookieSameSite() === "none",
      sameSite: getRefreshCookieSameSite(),
    });

    // 이전 이름과 속성으로 발급된 쿠키도 마이그레이션 기간에 함께 정리한다.
    response.clearCookie("refreshToken", {
      ...baseOptions,
      secure: false,
      sameSite: "strict",
    });
    response.clearCookie("refreshToken", {
      ...baseOptions,
      secure: true,
      sameSite: "strict",
    });
    response.clearCookie("refreshToken", {
      ...baseOptions,
      secure: true,
      sameSite: "none",
    });
  }

  private getRefreshToken(request: Request): string | undefined {
    const cookies = request.headers.cookie?.split(";").map((cookie) => cookie.trim()) ?? [];
    for (const name of [getRefreshCookieName(), "refreshToken"] as const) {
      const prefix = `${name}=`;
      const value = cookies.find((cookie) => cookie.startsWith(prefix))?.slice(prefix.length);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private toSessionPage(
    items: SessionListItemResponseDto[],
    totalElements: number,
    page: number,
    size: number,
  ): PaginatedResponse<SessionListItemResponseDto> {
    return {
      content: items,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
    };
  }

}
