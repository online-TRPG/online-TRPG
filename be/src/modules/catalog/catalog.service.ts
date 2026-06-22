import { Injectable, NotFoundException } from "@nestjs/common";
import {
  ClassDefinitionResponseDto,
  ItemResponseDto,
  RuleCatalogReferenceDto,
  SPELLCASTING_PROGRESSION,
  StartingEquipmentDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleCatalog: RuleCatalogService,
  ) {}

  listRuleCatalog(): RuleCatalogReferenceDto[] {
    return this.ruleCatalog.listEntries().map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      executable:
        entry.runtimeEffect.type !== "resolver_pending" &&
        (entry.kind !== "monster_abilities" || entry.cost.type !== "none"),
    }));
  }

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
