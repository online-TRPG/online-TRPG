import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// 클래스 시작 장비에 등장하는 unique 아이템 카탈로그 + placeholder("단순 무기 하나" 등) 항목.
// 룰북 ai/translated/classes/*.md 추출 결과 기준.
interface ItemSeed {
  key: string;
  koName: string;
  category: string;
}

type SrdEquipmentContent = {
  itemId: string;
  quantity: number;
};

type SrdEquipmentRecord = {
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
    };
    damageType?: string;
  };
  contents?: SrdEquipmentContent[];
};

const itemSeeds: ItemSeed[] = [
  { key: "arrow", koName: "화살", category: "ammunition" },
  { key: "arcane-focus", koName: "비전 초점구", category: "focus" },
  { key: "bolt", koName: "볼트", category: "ammunition" },
  { key: "burglar-pack", koName: "도둑 꾸러미", category: "pack" },
  { key: "chain-mail", koName: "체인 메일", category: "armor-heavy" },
  { key: "component-pouch", koName: "구성요소 파우치", category: "focus" },
  { key: "dagger", koName: "단검", category: "weapon-melee-simple" },
  { key: "dart", koName: "다트", category: "weapon-ranged-simple" },
  { key: "diplomat-pack", koName: "외교관 꾸러미", category: "pack" },
  { key: "druid-focus", koName: "드루이드 초점구", category: "focus" },
  { key: "dungeoneer-pack", koName: "던전 탐험가 꾸러미", category: "pack" },
  { key: "entertainer-pack", koName: "연예인 꾸러미", category: "pack" },
  { key: "explorer-pack", koName: "탐험가 꾸러미", category: "pack" },
  { key: "greataxe", koName: "그레이트액스", category: "weapon-melee-martial" },
  { key: "handaxe", koName: "핸드액스", category: "weapon-melee-simple" },
  { key: "holy-symbol", koName: "성표", category: "focus" },
  { key: "javelin", koName: "재블린", category: "weapon-melee-simple" },
  { key: "leather-armor", koName: "가죽 갑옷", category: "armor-light" },
  { key: "light-crossbow", koName: "라이트 크로스보우", category: "weapon-ranged-simple" },
  { key: "longsword", koName: "롱소드", category: "weapon-melee-martial" },
  { key: "longbow", koName: "롱보우", category: "weapon-ranged-martial" },
  { key: "lute", koName: "류트", category: "instrument" },
  { key: "mace", koName: "메이스", category: "weapon-melee-simple" },
  { key: "priest-pack", koName: "사제 꾸러미", category: "pack" },
  { key: "quarterstaff", koName: "쿼터스태프", category: "weapon-melee-simple" },
  { key: "rapier", koName: "레이피어", category: "weapon-melee-martial" },
  { key: "scale-mail", koName: "스케일 메일", category: "armor-medium" },
  { key: "scimitar", koName: "시미터", category: "weapon-melee-martial" },
  { key: "scholar-pack", koName: "학자 꾸러미", category: "pack" },
  { key: "shield", koName: "방패", category: "shield" },
  { key: "shortbow", koName: "쇼트보우", category: "weapon-ranged-simple" },
  { key: "shortsword", koName: "쇼트소드", category: "weapon-melee-martial" },
  { key: "spellbook", koName: "주문책", category: "misc" },
  { key: "thieves-tools", koName: "도둑 도구", category: "tool" },
  { key: "warhammer", koName: "워해머", category: "weapon-melee-martial" },
  // placeholder — 룰북상 "단순 무기 하나" 등 자유 선택 슬롯. 일단 별도 아이템으로 시드.
  { key: "simple-weapon-1", koName: "단순 무기 하나", category: "placeholder-weapon-simple" },
  { key: "simple-weapon-2", koName: "단순 무기 하나(다른 자리)", category: "placeholder-weapon-simple" },
  { key: "simple-melee-weapon-1", koName: "단순 근접 무기 하나", category: "placeholder-weapon-simple-melee" },
  { key: "simple-melee-weapon-2", koName: "단순 근접 무기 2개", category: "placeholder-weapon-simple-melee" },
  { key: "martial-weapon-1", koName: "군용 무기", category: "placeholder-weapon-martial" },
  { key: "martial-weapon-2", koName: "군용 무기 2개", category: "placeholder-weapon-martial" },
  { key: "martial-melee-weapon-1", koName: "군용 근접 무기 하나", category: "placeholder-weapon-martial-melee" },
  { key: "musical-instrument-1", koName: "원하는 악기 하나", category: "placeholder-instrument" },
];

export async function seedItems(prisma: PrismaClient): Promise<void> {
  const srdEquipment = loadSrdEquipment();
  for (const item of itemSeeds) {
    const srdRecord = findSrdEquipmentRecord(srdEquipment, item);
    const itemDefinitionData = srdRecord
      ? toSrdItemDefinitionData(srdRecord, srdEquipment)
      : {
          name: item.koName,
          itemType: toRuntimeItemType(item.category),
          weightLb: null,
          volumeCuFt: null,
          damageDice: null,
          damageType: null,
          description: null,
          armorClassBase: null,
          armorClassBonus: null,
          armorStrengthRequirement: null,
          armorStealthDisadvantage: null,
          useEffect: null,
          packContentsJson: null,
          propertiesJson: JSON.stringify(toRuntimeProperties(item.category)),
        };
    const catalogItem = await prisma.item.upsert({
      where: { key: item.key },
      update: { koName: item.koName, category: item.category },
      create: { key: item.key, koName: item.koName, category: item.category },
    });

    await prisma.itemDefinition.upsert({
      where: { id: catalogItem.id },
      update: itemDefinitionData,
      create: {
        id: catalogItem.id,
        ...itemDefinitionData,
      },
    });
  }
}

function loadSrdEquipment(): SrdEquipmentRecord[] {
  const candidates = [
    join(process.cwd(), "srd-data", "generated", "srd-engine", "equipment.jsonl"),
    join(process.cwd(), "..", "srd-data", "generated", "srd-engine", "equipment.jsonl"),
    join(process.cwd(), "..", "..", "srd-data", "generated", "srd-engine", "equipment.jsonl"),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    return [];
  }
  return readFileSync(filePath, "utf8")
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
}

function findSrdEquipmentRecord(records: SrdEquipmentRecord[], item: ItemSeed): SrdEquipmentRecord | null {
  const candidates = [
    item.key,
    item.key.replace(/-/g, "_"),
    item.koName,
    item.koName.replace(/\(.+\)$/, ""),
  ].map(normalizeEquipmentLookupKey);
  return (
    records.find((record) =>
      [
        record.id,
        record.id.replace(/^equipment\./, ""),
        record.name?.en,
        record.name?.ko,
        ...(record.name?.aliases ?? []),
      ]
        .map((value) => normalizeEquipmentLookupKey(value ?? ""))
        .some((value) => candidates.includes(value)),
    ) ?? null
  );
}

function toSrdItemDefinitionData(record: SrdEquipmentRecord, records: SrdEquipmentRecord[]) {
  const properties = [
    "srd-engine",
    record.category?.equipmentCategory,
    ...(record.weapon?.properties ?? []).map((property) => property.id ?? property.raw),
  ].filter((property): property is string => Boolean(property));

  return {
    name: getSrdEquipmentName(record, record.id),
    itemType: record.category?.kind ?? "gear",
    weightLb: typeof record.economy?.weight?.lb === "number" ? record.economy.weight.lb : null,
    volumeCuFt: null,
    damageDice: record.weapon?.damage?.dice ?? null,
    damageType: record.weapon?.damageType ?? null,
    description: buildSrdEquipmentDescription(record),
    armorClassBase: record.armor?.armorClass?.base ?? null,
    armorClassBonus: record.armor?.armorClass?.bonus ?? null,
    armorStrengthRequirement: readArmorStrengthRequirement(record),
    armorStealthDisadvantage: record.armor?.stealthDisadvantage ?? null,
    useEffect: buildSrdEquipmentUseEffect(record),
    packContentsJson: buildSrdPackContentsJson(record, records),
    propertiesJson: JSON.stringify([...new Set(properties)]),
  };
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

function buildSrdPackContentsJson(record: SrdEquipmentRecord, records: SrdEquipmentRecord[]): string | null {
  if (!record.contents?.length) {
    return null;
  }
  return JSON.stringify(
    record.contents.map((content) => {
      const contentRecord = records.find((candidate) => candidate.id === content.itemId);
      return {
        itemId: content.itemId,
        name: getSrdEquipmentName(contentRecord, content.itemId),
        quantity: content.quantity,
      };
    }),
  );
}

function getSrdEquipmentName(record: SrdEquipmentRecord | null | undefined, fallback: string): string {
  return record?.name?.ko?.trim() || record?.name?.en?.trim() || fallback;
}

function normalizeEquipmentLookupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^equipment[._-]/, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "")
    .replace(/s(?=pack$)/g, "");
}

function toRuntimeItemType(category: string): string {
  if (category.startsWith("weapon-")) {
    return "weapon";
  }
  if (category.startsWith("armor-")) {
    return "armor";
  }
  return category;
}

function toRuntimeProperties(category: string): string[] {
  const properties: string[] = [];
  if (category.includes("ranged")) {
    properties.push("ranged");
  }
  if (category.includes("melee")) {
    properties.push("melee");
  }
  return properties;
}
