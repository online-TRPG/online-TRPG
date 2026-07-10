import { Injectable, NotFoundException } from "@nestjs/common";
import {
  ClassDefinitionResponseDto,
  ItemResponseDto,
  RuleCatalogReferenceDto,
  StartingEquipmentDto,
  isRecord,
} from "@trpg/shared-types";
import { getSrdClassDefinition } from "@trpg/srd-data/rules";
import {
  parseJsonOrFallback,
  parseJsonStringArrayOrFallback,
} from "../../common/utils/json-runtime";
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
        "rangeFt" in entry.targeting && isNonNegativeFiniteNumber(entry.targeting.rangeFt)
          ? entry.targeting.rangeFt
          : null,
    }));
  }

  private parseSpellLevel(tags: string[]): number | null {
    const levelTag = tags.find((tag) => tag.startsWith("spell_level:"));
    if (!levelTag) return null;
    const level = Number(levelTag.slice("spell_level:".length));
    return Number.isInteger(level) && level >= 0 && level <= 9 ? level : null;
  }

  private formatRuleCatalogLabel(id: string): string {
    const raw = id.includes(".") ? id.slice(id.lastIndexOf(".") + 1) : id;
    return raw
      .split("_")
      .filter((part) => part.length > 0)
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
      startingEquipment: parseJsonOrFallback(
        c.startingEquipmentJson,
        { slots: [] },
        decodeStartingEquipment,
      ),
      startingCantripCount: c.startingCantripCount,
      startingSpellCount: c.startingSpellCount,
      skillChoices: parseJsonStringArrayOrFallback(c.skillChoicesJson, []),
      skillChoiceCount: c.skillChoiceCount,
      spellcastingProgression: [...(getSrdClassDefinition(c.key)?.spellcastingProgression ?? [])],
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

function decodeStartingEquipment(value: unknown): StartingEquipmentDto {
  if (!isRecord(value)) {
    throw new Error("starting equipment must be an object.");
  }
  const slots = value.slots;
  if (!Array.isArray(slots)) {
    throw new Error("starting equipment slots must be an array.");
  }
  return {
    slots: slots.map((slot) => {
      if (!isRecord(slot)) {
        return { options: [] };
      }
      const options = slot.options;
      return {
        options: Array.isArray(options)
          ? options.map((option) => {
              if (!isRecord(option)) {
                return { items: [] };
              }
              const items = option.items;
              return {
                items: Array.isArray(items)
                  ? items.flatMap((item) => {
                      if (!isRecord(item)) {
                        return [];
                      }
                      const record = item;
                      return typeof record.itemKey === "string" && isPositiveInteger(record.quantity)
                        ? [{ itemKey: record.itemKey, quantity: record.quantity }]
                        : [];
                    })
                  : [],
              };
            })
          : [],
      };
    }),
  };
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
