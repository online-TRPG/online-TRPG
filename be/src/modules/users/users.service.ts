import { Injectable, NotFoundException } from "@nestjs/common";
import { UserResponseDto, CreateGuestUserDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { mapUser } from "../../common/mappers/domain.mapper";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createGuest(dto: CreateGuestUserDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.create({
      data: {
        displayName: dto.displayName.trim(),
      },
    });

    return mapUser(user);
  }

  async getUserEntityOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} was not found.`);
    }

    return user;
  }
}
