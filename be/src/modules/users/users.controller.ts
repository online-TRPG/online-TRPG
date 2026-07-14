import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { getRefreshTokenExpiresInMs } from "../../common/auth/token.utils";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
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
  @ApiCreatedResponse({ type: UserResponseDto })
  createGuest(@Body() dto: CreateGuestUserDto): Promise<UserResponseDto> {
    return this.usersService.createGuest(dto);
  }

  @Post("register")
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
    const result = await this.usersService.convertGuestToLocal(userId, dto);
    this.setRefreshCookie(response, result.refreshToken, this.resolveRefreshCookieSameSite(request));
    return apiResponse("USER_200", "게스트 계정을 회원 계정으로 저장했습니다.", result.body);
  }

  @Get("email-check")
  @ApiOkResponse({ type: EmailCheckResponseDto })
  async checkEmail(@Query("email") email = ""): Promise<ApiResponse<EmailCheckResponseDto>> {
    const result = await this.usersService.checkEmail(email);
    return apiResponse("USER_200", "이메일 중복 확인이 완료되었습니다.", result);
  }

  @Post("login")
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body() dto: LoginUserDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LoginResponseDto>> {
    const result = await this.usersService.login(dto);
    this.setRefreshCookie(response, result.refreshToken, this.resolveRefreshCookieSameSite(request));
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
    await this.usersService.logout(userId, this.getRefreshToken(request));
    this.clearRefreshCookie(response);
    return apiResponse("USER_200", "로그아웃이 완료되었습니다.", null);
  }

  @Post("reissue")
  @HttpCode(200)
  @ApiOkResponse({ type: AuthTokenResponseDto })
  async reissue(@Req() request: Request): Promise<ApiResponse<AuthTokenResponseDto>> {
    const result = await this.usersService.reissue(this.getRefreshToken(request));
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
  @HttpCode(200)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<ApiResponse<null>> {
    await this.usersService.requestPasswordReset(dto);
    return apiResponse("USER_200", "계정이 존재하고 메일 발송이 가능한 경우 재설정 안내를 보냈습니다.", null);
  }

  @Post("password-reset/confirm")
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
  @ApiOkResponse({ type: UserResponseDto })
  async getPublicProfile(@Param("publicId") publicId: string): Promise<ApiResponse<UserResponseDto>> {
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
  @ApiOkResponse({ type: OAuthUrlResponseDto })
  getKakaoUrl(
    @Query("redirectUri") redirectUri = "",
    @Query("state") state?: string,
  ): ApiResponse<OAuthUrlResponseDto> {
    return apiResponse(
      "USER_200",
      "요청이 성공했습니다.",
      this.usersService.getOAuthUrl("KAKAO", redirectUri, state),
    );
  }

  @Post("oauth/kakao/login")
  @HttpCode(200)
  async kakaoLogin(
    @Body() dto: OAuthLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LoginResponseDto>> {
    const result = await this.usersService.oauthLogin("KAKAO", dto);
    this.setRefreshCookie(response, result.refreshToken, "none");
    return apiResponse("USER_200", "요청이 성공했습니다.", result.body);
  }

  @Get("oauth/discord/url")
  @ApiOkResponse({ type: OAuthUrlResponseDto })
  getDiscordUrl(
    @Query("redirectUri") redirectUri = "",
    @Query("state") state?: string,
  ): ApiResponse<OAuthUrlResponseDto> {
    return apiResponse(
      "USER_200",
      "요청이 성공했습니다.",
      this.usersService.getOAuthUrl("DISCORD", redirectUri, state),
    );
  }

  @Post("oauth/discord/login")
  @HttpCode(200)
  async discordLogin(
    @Body() dto: OAuthLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LoginResponseDto>> {
    const result = await this.usersService.oauthLogin("DISCORD", dto);
    this.setRefreshCookie(response, result.refreshToken, "none");
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
    sameSite: "strict" | "none" = "strict",
  ): void {
    response.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: sameSite === "none" || process.env.NODE_ENV === "production",
      sameSite,
      path: "/",
      maxAge: getRefreshTokenExpiresInMs(),
    });
  }

  private resolveRefreshCookieSameSite(request: Request): "strict" | "none" {
    const origin = this.getSingleHeaderValue(request.headers.origin);
    if (!origin) {
      return "strict";
    }

    const originHostname = this.getHostname(origin);
    const requestHostname = this.getRequestHostname(request);
    if (!originHostname || !requestHostname) {
      return "strict";
    }

    // 로컬 프론트가 배포 API를 바라보는 경우처럼 사이트가 다르면 Strict 쿠키가 재발급 요청에 실리지 않는다.
    // 이때만 SameSite=None으로 발급해서 refresh token 쿠키가 credentials 요청에 포함되게 한다.
    return originHostname === requestHostname ? "strict" : "none";
  }

  private getRequestHostname(request: Request): string | null {
    const forwardedHost = this.getSingleHeaderValue(request.headers["x-forwarded-host"]);
    const host = forwardedHost ?? this.getSingleHeaderValue(request.headers.host);
    return host ? this.getHostname(`http://${host}`) : null;
  }

  private getHostname(value: string): string | null {
    try {
      return new URL(value).hostname;
    } catch {
      return null;
    }
  }

  private getSingleHeaderValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  private clearRefreshCookie(response: Response): void {
    // refreshToken은 일반 로그인과 OAuth 로그인에서 SameSite/Secure 조합이 달라질 수 있다.
    // 브라우저가 기존 쿠키와 같은 조건의 삭제 Set-Cookie를 요구하는 경우를 피하려고,
    // 우리가 발급할 수 있는 조합을 모두 만료시켜 로그아웃 후 쿠키가 남지 않게 한다.
    const baseOptions = {
      httpOnly: true,
      path: "/",
    } as const;

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
    return request.headers.cookie
      ?.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("refreshToken="))
      ?.slice("refreshToken=".length);
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
