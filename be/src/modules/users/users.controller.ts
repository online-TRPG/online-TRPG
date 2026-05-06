import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ApiCreatedResponse, ApiOkResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import {
  AuthTokenResponseDto,
  CreateGuestUserDto,
  DeleteMeDto,
  EmailCheckResponseDto,
  LoginResponseDto,
  LoginUserDto,
  OAuthLoginDto,
  OAuthUrlResponseDto,
  ParticipantRole,
  RegisterUserDto,
  SessionListItemResponseDto,
  SessionStatus,
  UserResponseDto,
} from "@trpg/shared-types";
import { apiResponse, ApiResponse } from "../../common/api-response";
import { getRefreshTokenExpiresInMs } from "../../common/auth/token.utils";
import { CurrentUserId } from "../../common/decorators/current-user-id.decorator";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
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
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LoginResponseDto>> {
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
    @Query("status") status?: string,
    @Query("role") role?: string,
    @Query("page") page = "0",
    @Query("size") size = "10",
  ): Promise<ApiResponse<Record<string, unknown>>> {
    const currentPage = this.toPageNumber(page);
    const pageSize = this.toPageSize(size);
    const result = await this.sessionsService.listMySessions(userId, {
      status: this.toSessionStatus(status),
      role: this.toParticipantRole(role),
      page: currentPage,
      size: pageSize,
    });

    return apiResponse(
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

  private clearRefreshCookie(response: Response): void {
    response.cookie("refreshToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
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
  ): Record<string, unknown> {
    return {
      content: items,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
    };
  }

  private toSessionStatus(value: string | undefined): SessionStatus | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value.toLowerCase();
    const match = Object.values(SessionStatus).find((status) => status === normalized);
    if (!match) {
      throw new BadRequestException("status 형식이 올바르지 않습니다.");
    }
    return match;
  }

  private toParticipantRole(value: string | undefined): ParticipantRole | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value.toUpperCase();
    const match = Object.values(ParticipantRole).find((role) => role === normalized);
    if (!match) {
      throw new BadRequestException("role 형식이 올바르지 않습니다.");
    }
    return match;
  }

  private toPageNumber(value: string): number {
    const page = Number(value);
    if (!Number.isInteger(page) || page < 0) {
      throw new BadRequestException("page 형식이 올바르지 않습니다.");
    }
    return page;
  }

  private toPageSize(value: string): number {
    const size = Number(value);
    if (!Number.isInteger(size) || size < 1 || size > 100) {
      throw new BadRequestException("size 형식이 올바르지 않습니다.");
    }
    return size;
  }
}
