import { Injectable } from "@nestjs/common";
import { mapSessionCharacter } from "../../common/mappers/domain.mapper";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class InventoryItemCharacterReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async getMappedSessionCharacter(sessionCharacterId: string) {
    return mapSessionCharacter(
      await this.prisma.sessionCharacter.findUniqueOrThrow({
        where: { id: sessionCharacterId },
        include: {
          character: true,
          inventoryEntries: {
            include: { itemDefinition: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    );
  }
}
