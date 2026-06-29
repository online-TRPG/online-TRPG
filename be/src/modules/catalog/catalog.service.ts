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
      executable: entry.kind !== "monster_abilities" || entry.cost.type !== "none",
      label: entry.displayNameKo ?? this.formatRuleCatalogLabel(entry.id),
      runtimeTags: [...entry.runtimeEffect.tags],
      spellLevel:
        entry.kind === "spell_definitions"
          ? this.parseSpellLevel(entry.runtimeEffect.tags)
          : null,
      targetingType: "type" in entry.targeting ? entry.targeting.type : null,
      rangeFt:
        "rangeFt" in entry.targeting && typeof entry.targeting.rangeFt === "number"
          ? entry.targeting.rangeFt
          : null,
    }));
  }

  private parseSpellLevel(tags: string[]): number | null {
    const levelTag = tags.find((tag) => tag.startsWith("spell_level:"));
    if (!levelTag) return null;
    const level = Number(levelTag.slice("spell_level:".length));
    return Number.isInteger(level) ? level : null;
  }

  private formatRuleCatalogLabel(id: string): string {
    const raw = id.includes(".") ? id.slice(id.lastIndexOf(".") + 1) : id;
    return raw
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
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
