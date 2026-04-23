import { Body, Controller, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { CreateGuestUserDto, UserResponseDto } from "@trpg/shared-types";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("guest")
  @ApiCreatedResponse({ type: UserResponseDto })
  createGuest(@Body() dto: CreateGuestUserDto): Promise<UserResponseDto> {
    return this.usersService.createGuest(dto);
  }
}
