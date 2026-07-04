import { existsSync, readFileSync } from "fs";
import { join } from "path";

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
  ].filter((property): property is string => Boolean(property));

  return {
    name: getSrdEquipmentName(record, record.id),
    itemType: record.category?.kind ?? "gear",
    weightLb: typeof record.economy?.weight?.lb === "number" ? record.economy.weight.lb : null,
    description: buildSrdEquipmentDescription(record),
    damageDice: record.weapon?.damage?.dice ?? null,
    damageType: record.weapon?.damageType ?? null,
    armorClassBase: record.armor?.armorClass?.base ?? null,
    armorClassBonus: record.armor?.armorClass?.bonus ?? null,
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
  ].filter((property): property is string => Boolean(property));
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
    .filter((value): value is string => Boolean(value))
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
  if (typeof requirement === "number") {
    return requirement;
  }
  if (requirement && typeof requirement.minimum === "number") {
    return requirement.minimum;
  }
  return null;
}

function buildSrdEquipmentUseEffect(record: SrdEquipmentRecord): string | null {
  const key = normalizeEquipmentLookupKey(
    [record.id, record.name?.en, record.name?.ko, record.category?.equipmentCategory]
      .filter(Boolean)
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
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as SrdEquipmentRecord;
      } catch {
        return null;
      }
    })
    .filter((record): record is SrdEquipmentRecord => Boolean(record?.id));
  return srdEquipmentCache;
}

function normalizeEquipmentLookupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/equipment[._-]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "")
    .replace(/s(?=pack$)/g, "");
}
