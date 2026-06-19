import { Injectable, NotFoundException } from "@nestjs/common";
import {
  ClassDefinitionResponseDto,
  ItemResponseDto,
  SPELLCASTING_PROGRESSION,
  StartingEquipmentDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(): Promise<ItemResponseDto[]> {
    const items = await this.prisma.item.findMany({ orderBy: { key: "asc" } });
    return items.map((item) => ({
      id: item.id,
      key: item.key,
      koName: item.koName,
      category: item.category,
    }));
  }

  async listClasses(): Promise<ClassDefinitionResponseDto[]> {
    const classes = await this.prisma.classDefinition.findMany({ orderBy: { key: "asc" } });
    return classes.map((c) => ({
      id: c.id,
      key: c.key,
      koName: c.koName,
      hitDie: c.hitDie,
      startingEquipment: JSON.parse(c.startingEquipmentJson) as StartingEquipmentDto,
      startingCantripCount: c.startingCantripCount,
      startingSpellCount: c.startingSpellCount,
      skillChoices: JSON.parse(c.skillChoicesJson) as string[],
      skillChoiceCount: c.skillChoiceCount,
      spellcastingProgression: [...(SPELLCASTING_PROGRESSION[c.key] ?? [])],
    }));
  }

  async findClassByKey(key: string) {
    return this.prisma.classDefinition.findUnique({ where: { key } });
  }

  async findClassByKeyOrThrow(key: string) {
    const klass = await this.findClassByKey(key);
    if (!klass) {
      throw new NotFoundException(`Class ${key} was not found.`);
    }
    return klass;
  }
}
