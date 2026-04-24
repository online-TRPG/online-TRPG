import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import {
  CreateGuestUserDto,
  SessionListItemResponseDto,
  UserResponseDto,
} from "@trpg/shared-types";
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

  @Get("me/sessions")
  @ApiSecurity("x-user-id")
  @ApiOkResponse({ type: [SessionListItemResponseDto] })
  listMySessions(@CurrentUserId() userId: string): Promise<SessionListItemResponseDto[]> {
    return this.sessionsService.listMySessions(userId);
  }
}
