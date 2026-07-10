import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  isRecord,
  parseJsonWithDecoder,
} from "@trpg/shared-types";

export type SrdEquipmentContent = {
  itemId: string;
  quantity: number;
};

export type SrdEquipmentRecord = {
  id: string;
  name?: {
    en?: string;
    ko?: string;
    aliases?: string[];
  };
  category?: {
    kind?: string;
    equipmentCategory?: string;
  };
  economy?: {
    weight?: {
      lb?: number;
    } | null;
  };
  weapon?: {
    rangeRaw?: string;
    damage?: {
      dice?: string;
    };
    damageType?: string;
    properties?: Array<{ id?: string; raw?: string }>;
  };
  armor?: {
    category?: string;
    armorClass?: {
      base?: number;
      bonus?: number;
      raw?: string;
    };
    strengthRequirement?:
      | number
      | {
          minimum?: number;
        }
      | null;
    stealthDisadvantage?: boolean;
  };
  use?: {
    damage?: {
      dice?: string;
      raw?: string;
    };
    damageType?: string;
  };
  contents?: SrdEquipmentContent[];
};

let srdEquipmentCache: SrdEquipmentRecord[] | null = null;

export function toItemDefinitionData(record: SrdEquipmentRecord): {
  name: string;
  itemType: string;
  weightLb: number | null;
  description: string | null;
  damageDice: string | null;
  damageType: string | null;
  armorClassBase: number | null;
  armorClassBonus: number | null;
  armorStrengthRequirement: number | null;
  armorStealthDisadvantage: boolean | null;
  useEffect: string | null;
  packContentsJson: string | null;
  propertiesJson: string;
} {
  const properties = [
    "srd-engine",
    record.category?.equipmentCategory,
    ...buildSrdWeaponRangeProperties(record.weapon?.rangeRaw),
    ...(record.weapon?.properties ?? []).map((property) => property.id ?? property.raw),
  ].flatMap((property) => (property ? [property] : []));

  return {
    name: getSrdEquipmentName(record, record.id),
    itemType: record.category?.kind ?? "gear",
    weightLb: readNonNegativeFiniteNumber(record.economy?.weight?.lb) ?? null,
    description: buildSrdEquipmentDescription(record),
    damageDice: record.weapon?.damage?.dice ?? null,
    damageType: record.weapon?.damageType ?? null,
    armorClassBase: readNonNegativeInteger(record.armor?.armorClass?.base) ?? null,
    armorClassBonus: readFiniteNumber(record.armor?.armorClass?.bonus) ?? null,
    armorStrengthRequirement: readArmorStrengthRequirement(record),
    armorStealthDisadvantage: record.armor?.stealthDisadvantage ?? null,
    useEffect: buildSrdEquipmentUseEffect(record),
    packContentsJson: buildSrdPackContentsJson(record),
    propertiesJson: JSON.stringify([...new Set(properties)]),
  };
}

function buildSrdWeaponRangeProperties(rangeRaw: string | null | undefined): string[] {
  const [normalRaw, longRaw] = rangeRaw?.split("/") ?? [];
  const normal = Number(normalRaw?.trim());
  const long = Number(longRaw?.trim());
  return [
    Number.isInteger(normal) && normal >= 0 ? `range:${normal}` : null,
    Number.isInteger(long) && long >= 0 ? `range_long:${long}` : null,
  ].flatMap((property) => (property ? [property] : []));
}

export function buildSrdPackAddedSummary(pack: SrdEquipmentRecord): string {
  return (pack.contents ?? [])
    .map((content) => {
      const contentRecord = findSrdEquipmentById(content.itemId);
      return `${getSrdEquipmentName(contentRecord, content.itemId)} x${content.quantity}`;
    })
    .join(", ");
}

export function resolveSrdPackRecord(
  item: { id: string; name: string; itemType: string; propertiesJson: string | null },
  catalogKey: string | null,
): SrdEquipmentRecord | null {
  const keyCandidates = [
    item.id,
    item.name,
    catalogKey,
    catalogKey ? catalogKey.replace(/-/g, " ") : null,
  ]
    .flatMap((value) => (value ? [value] : []))
    .map((value) => normalizeEquipmentLookupKey(value));

  return (
    loadSrdEquipment().find((record) => {
      if (!record.contents?.length) {
        return false;
      }
      const recordCandidates = [
        record.id,
        record.name?.en,
        record.name?.ko,
        ...(record.name?.aliases ?? []),
      ].map((value) => normalizeEquipmentLookupKey(value ?? ""));
      return keyCandidates.some((candidate) => recordCandidates.includes(candidate));
    }) ?? null
  );
}

export function findSrdEquipmentById(itemId: string): SrdEquipmentRecord | null {
  return loadSrdEquipment().find((record) => record.id === itemId) ?? null;
}

export function getSrdEquipmentName(
  record: SrdEquipmentRecord | null | undefined,
  fallback: string,
): string {
  return record?.name?.ko?.trim() || record?.name?.en?.trim() || fallback;
}

function buildSrdEquipmentDescription(record: SrdEquipmentRecord): string {
  const name = getSrdEquipmentName(record, record.id);
  if (record.contents?.length) {
    return `${name}입니다. 사용하면 꾸러미를 풀어 포함된 장비들을 인벤토리에 추가합니다.`;
  }
  if (record.weapon) {
    const damage = record.weapon.damage?.dice
      ? `${record.weapon.damage.dice}${record.weapon.damageType ? ` ${record.weapon.damageType}` : ""} 피해`
      : "무기 피해";
    const range = record.weapon.rangeRaw ? ` 사거리 ${record.weapon.rangeRaw}.` : "";
    return `${name} 무기입니다. 명중 시 ${damage}를 줍니다.${range}`;
  }
  if (record.armor) {
    const armorClass = record.armor.armorClass?.raw
      ? `AC ${record.armor.armorClass.raw}`
      : record.armor.armorClass?.base
        ? `기본 AC ${record.armor.armorClass.base}`
        : record.armor.armorClass?.bonus
          ? `AC +${record.armor.armorClass.bonus}`
          : "AC 보너스";
    return `${name} 방어구입니다. 장착하면 ${armorClass}를 적용합니다.`;
  }
  const useEffect = buildSrdEquipmentUseEffect(record);
  if (useEffect) {
    return useEffect;
  }
  return `${name}입니다. 세션 중 보유하거나 상황에 따라 사용할 수 있는 SRD 장비입니다.`;
}

function readArmorStrengthRequirement(record: SrdEquipmentRecord): number | null {
  const requirement = record.armor?.strengthRequirement;
  const directRequirement = readNonNegativeInteger(requirement);
  if (directRequirement !== undefined) {
    return directRequirement;
  }
  if (isRecord(requirement)) {
    return readNonNegativeInteger(requirement.minimum) ?? null;
  }
  return null;
}

function buildSrdEquipmentUseEffect(record: SrdEquipmentRecord): string | null {
  const key = normalizeEquipmentLookupKey(
    [record.id, record.name?.en, record.name?.ko, record.category?.equipmentCategory]
      .flatMap((value) => value ? [value] : [])
      .join(" "),
  );
  if (key.includes("potionofhealing") || key.includes("치유물약")) {
    return "사용하면 HP를 평균 7점 회복합니다.";
  }
  if (record.use?.damage?.dice) {
    return `사용하면 ${record.use.damage.dice}${record.use.damageType ? ` ${record.use.damageType}` : ""} 피해 효과를 적용합니다.`;
  }
  return null;
}

function buildSrdPackContentsJson(record: SrdEquipmentRecord): string | null {
  if (!record.contents?.length) {
    return null;
  }
  return JSON.stringify(
    record.contents.map((content) => {
      const contentRecord = findSrdEquipmentById(content.itemId);
      return {
        itemId: content.itemId,
        name: getSrdEquipmentName(contentRecord, content.itemId),
        quantity: content.quantity,
      };
    }),
  );
}

function loadSrdEquipment(): SrdEquipmentRecord[] {
  if (srdEquipmentCache) {
    return srdEquipmentCache;
  }

  const candidates = [
    join(process.cwd(), "srd-data", "generated", "srd-engine", "equipment.jsonl"),
    join(process.cwd(), "..", "srd-data", "generated", "srd-engine", "equipment.jsonl"),
    join(process.cwd(), "..", "..", "srd-data", "generated", "srd-engine", "equipment.jsonl"),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    srdEquipmentCache = [];
    return srdEquipmentCache;
  }

  srdEquipmentCache = readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => decodeSrdEquipmentLineOrEmpty(line));
  return srdEquipmentCache;
}

function decodeSrdEquipmentLineOrEmpty(line: string): SrdEquipmentRecord[] {
  try {
    const record = parseJsonWithDecoder(line, decodeSrdEquipmentRecord, "srd equipment record");
    return record ? [record] : [];
  } catch {
    return [];
  }
}

function decodeSrdEquipmentRecord(value: unknown): SrdEquipmentRecord | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }
  return {
    id: value.id,
    ...(isRecord(value.name) ? { name: decodeEquipmentName(value.name) } : {}),
    ...(isRecord(value.category) ? { category: decodeEquipmentCategory(value.category) } : {}),
    ...(isRecord(value.economy) ? { economy: decodeEquipmentEconomy(value.economy) } : {}),
    ...(isRecord(value.weapon) ? { weapon: decodeEquipmentWeapon(value.weapon) } : {}),
    ...(isRecord(value.armor) ? { armor: decodeEquipmentArmor(value.armor) } : {}),
    ...(isRecord(value.use) ? { use: decodeEquipmentUse(value.use) } : {}),
    ...(Array.isArray(value.contents) ? { contents: decodeEquipmentContents(value.contents) } : {}),
  };
}

function decodeEquipmentName(value: Record<string, unknown>): NonNullable<SrdEquipmentRecord["name"]> {
  const aliases = Array.isArray(value.aliases) ? decodeStringArray(value.aliases) : undefined;
  return {
    ...(typeof value.en === "string" ? { en: value.en } : {}),
    ...(typeof value.ko === "string" ? { ko: value.ko } : {}),
    ...(aliases ? { aliases } : {}),
  };
}

function decodeStringArray(value: readonly unknown[]): string[] {
  return value.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
}

function decodeEquipmentCategory(value: Record<string, unknown>): NonNullable<SrdEquipmentRecord["category"]> {
  return {
    ...(typeof value.kind === "string" ? { kind: value.kind } : {}),
    ...(typeof value.equipmentCategory === "string" ? { equipmentCategory: value.equipmentCategory } : {}),
  };
}

function decodeEquipmentEconomy(value: Record<string, unknown>): NonNullable<SrdEquipmentRecord["economy"]> {
  const weightLb = isRecord(value.weight) ? readNonNegativeFiniteNumber(value.weight.lb) : undefined;
  const weight = weightLb !== undefined ? { lb: weightLb } : value.weight === null ? null : undefined;
  return {
    ...(weight !== undefined ? { weight } : {}),
  };
}

function decodeEquipmentWeapon(value: Record<string, unknown>): NonNullable<SrdEquipmentRecord["weapon"]> {
  const damage = isRecord(value.damage) && typeof value.damage.dice === "string" ? { dice: value.damage.dice } : undefined;
  const properties = Array.isArray(value.properties)
    ? decodeEquipmentProperties(value.properties)
    : undefined;
  return {
    ...(typeof value.rangeRaw === "string" ? { rangeRaw: value.rangeRaw } : {}),
    ...(damage ? { damage } : {}),
    ...(typeof value.damageType === "string" ? { damageType: value.damageType } : {}),
    ...(properties ? { properties } : {}),
  };
}

function decodeEquipmentProperty(value: unknown): NonNullable<NonNullable<SrdEquipmentRecord["weapon"]>["properties"]>[number] | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(typeof value.raw === "string" ? { raw: value.raw } : {}),
  };
}

function decodeEquipmentProperties(value: unknown[]): NonNullable<NonNullable<SrdEquipmentRecord["weapon"]>["properties"]> {
  return value.flatMap((entry) => {
    const property = decodeEquipmentProperty(entry);
    return property ? [property] : [];
  });
}

function decodeEquipmentArmor(value: Record<string, unknown>): NonNullable<SrdEquipmentRecord["armor"]> {
  const armorClassBase = isRecord(value.armorClass) ? readNonNegativeInteger(value.armorClass.base) : undefined;
  const armorClassBonus = isRecord(value.armorClass) ? readFiniteNumber(value.armorClass.bonus) : undefined;
  const armorClass = isRecord(value.armorClass)
    ? {
        ...(armorClassBase !== undefined ? { base: armorClassBase } : {}),
        ...(armorClassBonus !== undefined ? { bonus: armorClassBonus } : {}),
        ...(typeof value.armorClass.raw === "string" ? { raw: value.armorClass.raw } : {}),
      }
    : undefined;
  const directStrengthRequirement = readNonNegativeInteger(value.strengthRequirement);
  const nestedStrengthRequirement = isRecord(value.strengthRequirement)
    ? readNonNegativeInteger(value.strengthRequirement.minimum)
    : undefined;
  const strengthRequirement = value.strengthRequirement === null
    ? null
    : directStrengthRequirement !== undefined
      ? directStrengthRequirement
      : nestedStrengthRequirement !== undefined
        ? { minimum: nestedStrengthRequirement }
        : undefined;
  return {
    ...(typeof value.category === "string" ? { category: value.category } : {}),
    ...(armorClass ? { armorClass } : {}),
    ...(strengthRequirement !== undefined ? { strengthRequirement } : {}),
    ...(typeof value.stealthDisadvantage === "boolean" ? { stealthDisadvantage: value.stealthDisadvantage } : {}),
  };
}

function decodeEquipmentUse(value: Record<string, unknown>): NonNullable<SrdEquipmentRecord["use"]> {
  const damage = isRecord(value.damage)
    ? {
        ...(typeof value.damage.dice === "string" ? { dice: value.damage.dice } : {}),
        ...(typeof value.damage.raw === "string" ? { raw: value.damage.raw } : {}),
      }
    : undefined;
  return {
    ...(damage ? { damage } : {}),
    ...(typeof value.damageType === "string" ? { damageType: value.damageType } : {}),
  };
}

function decodeEquipmentContent(value: unknown): SrdEquipmentContent | null {
  if (!isRecord(value) || typeof value.itemId !== "string") {
    return null;
  }
  const quantity = readPositiveInteger(value.quantity);
  if (quantity === undefined) {
    return null;
  }
  return {
    itemId: value.itemId,
    quantity,
  };
}

function decodeEquipmentContents(value: unknown[]): SrdEquipmentContent[] {
  return value.flatMap((entry) => {
    const content = decodeEquipmentContent(entry);
    return content ? [content] : [];
  });
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNonNegativeFiniteNumber(value: unknown): number | undefined {
  const parsed = readFiniteNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : undefined;
}

function normalizeEquipmentLookupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/equipment[._-]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "")
    .replace(/s(?=pack$)/g, "");
}
