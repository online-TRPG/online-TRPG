import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { InventoryItemCharacterReaderService } from "./inventory-item-character-reader.service";
import { isPackLikeInventoryItem } from "./inventory-item-policy";
import { InventoryPackRuntimeService } from "./inventory-pack-runtime.service";
import {
  buildSrdPackAddedSummary,
  resolveSrdPackRecord,
} from "./srd-equipment-policy";

type InventoryPackItemDefinition = {
  id: string;
  name: string;
  itemType: string;
  propertiesJson: string | null;
};
type InventoryPackResponseCharacter = Awaited<
  ReturnType<InventoryItemCharacterReaderService["getMappedSessionCharacter"]>
>;

@Injectable()
export class InventoryPackUseRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryItemCharacterReader: InventoryItemCharacterReaderService,
    private readonly inventoryPackRuntime: InventoryPackRuntimeService,
  ) {}

  async tryUsePack(params: {
    sessionCharacterId: string;
    itemEntryId: string;
    itemDefinition: InventoryPackItemDefinition;
  }): Promise<{
    message: string;
    responseCharacter: InventoryPackResponseCharacter;
  } | null> {
    const catalogItem = await this.prisma.item.findUnique({
      where: { id: params.itemDefinition.id },
    });
    const pack = resolveSrdPackRecord(
      params.itemDefinition,
      catalogItem?.key ?? null,
    );
    if (pack?.contents?.length) {
      await this.inventoryPackRuntime.unpackInventoryPack({
        sessionCharacterId: params.sessionCharacterId,
        packEntryId: params.itemEntryId,
        pack,
      });
      const responseCharacter =
        await this.inventoryItemCharacterReader.getMappedSessionCharacter(
          params.sessionCharacterId,
        );
      const addedSummary = buildSrdPackAddedSummary(pack);

      return {
        message: `${responseCharacter.name}이(가) ${params.itemDefinition.name}을(를) 풀어 내용물을 획득했습니다: ${addedSummary}`,
        responseCharacter,
      };
    }
    if (isPackLikeInventoryItem(params.itemDefinition)) {
      throw badRequest("INVENTORY_400", "꾸러미 내용물 데이터를 찾을 수 없습니다.", {
        reason: "PACK_CONTENTS_NOT_FOUND",
      });
    }

    return null;
  }
}
