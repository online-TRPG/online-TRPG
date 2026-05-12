import { PrismaClient } from "@prisma/client";

// 클래스별 시작 장비 슬롯 구조 — 룰북 ai/translated/classes/*.md `## 시작 장비` 섹션 기준
// 각 slot.options 중 정확히 1개 선택, option.items 는 그 옵션 골랐을 때 모두 받음
interface StartingEquipmentItem {
  itemKey: string;
  quantity: number;
}
interface StartingEquipmentOption {
  items: StartingEquipmentItem[];
}
interface StartingEquipmentSlot {
  options: StartingEquipmentOption[];
}
interface ClassDefinitionSeed {
  key: string;
  koName: string;
  hitDie: string;
  startingEquipment: { slots: StartingEquipmentSlot[] };
}

// 1레벨 시점 시작 캔트립/주문 수 (룰북 ai/translated/classes/*.md 추출)
// druid/cleric/paladin은 준비 주문이 매일 동적이라 startingSpellCount=0
const spellCounts: Record<string, { cantrips: number; spells: number }> = {
  barbarian: { cantrips: 0, spells: 0 },
  bard: { cantrips: 2, spells: 4 },
  cleric: { cantrips: 3, spells: 0 },
  druid: { cantrips: 2, spells: 0 },
  fighter: { cantrips: 0, spells: 0 },
  monk: { cantrips: 0, spells: 0 },
  paladin: { cantrips: 0, spells: 0 },
  ranger: { cantrips: 0, spells: 0 },
  rogue: { cantrips: 0, spells: 0 },
  sorcerer: { cantrips: 4, spells: 2 },
  warlock: { cantrips: 2, spells: 2 },
  wizard: { cantrips: 3, spells: 6 },
};

const classSeeds: ClassDefinitionSeed[] = [
  {
    key: "barbarian", koName: "바바리안", hitDie: "d12",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "greataxe", quantity: 1 }] }, { items: [{ itemKey: "martial-melee-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "handaxe", quantity: 2 }] }, { items: [{ itemKey: "simple-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "explorer-pack", quantity: 1 }, { itemKey: "javelin", quantity: 4 }] }] },
    ]},
  },
  {
    key: "bard", koName: "바드", hitDie: "d8",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "rapier", quantity: 1 }] }, { items: [{ itemKey: "longsword", quantity: 1 }] }, { items: [{ itemKey: "simple-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "diplomat-pack", quantity: 1 }] }, { items: [{ itemKey: "entertainer-pack", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "lute", quantity: 1 }] }, { items: [{ itemKey: "musical-instrument-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "leather-armor", quantity: 1 }, { itemKey: "dagger", quantity: 1 }] }] },
    ]},
  },
  {
    key: "cleric", koName: "클레릭", hitDie: "d8",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "mace", quantity: 1 }] }, { items: [{ itemKey: "warhammer", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "scale-mail", quantity: 1 }] }, { items: [{ itemKey: "leather-armor", quantity: 1 }] }, { items: [{ itemKey: "chain-mail", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "light-crossbow", quantity: 1 }, { itemKey: "bolt", quantity: 20 }] }, { items: [{ itemKey: "simple-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "priest-pack", quantity: 1 }] }, { items: [{ itemKey: "explorer-pack", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "shield", quantity: 1 }, { itemKey: "holy-symbol", quantity: 1 }] }] },
    ]},
  },
  {
    key: "druid", koName: "드루이드", hitDie: "d8",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "shield", quantity: 1 }] }, { items: [{ itemKey: "simple-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "scimitar", quantity: 1 }] }, { items: [{ itemKey: "simple-melee-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "leather-armor", quantity: 1 }, { itemKey: "explorer-pack", quantity: 1 }, { itemKey: "druid-focus", quantity: 1 }] }] },
    ]},
  },
  {
    key: "fighter", koName: "파이터", hitDie: "d10",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "chain-mail", quantity: 1 }, { itemKey: "longbow", quantity: 1 }, { itemKey: "arrow", quantity: 20 }] }, { items: [{ itemKey: "leather-armor", quantity: 1 }, { itemKey: "longbow", quantity: 1 }, { itemKey: "arrow", quantity: 20 }] }] },
      { options: [{ items: [{ itemKey: "martial-weapon-1", quantity: 1 }, { itemKey: "shield", quantity: 1 }] }, { items: [{ itemKey: "martial-weapon-2", quantity: 2 }] }] },
      { options: [{ items: [{ itemKey: "light-crossbow", quantity: 1 }, { itemKey: "bolt", quantity: 20 }] }, { items: [{ itemKey: "handaxe", quantity: 2 }] }] },
      { options: [{ items: [{ itemKey: "dungeoneer-pack", quantity: 1 }] }, { items: [{ itemKey: "explorer-pack", quantity: 1 }] }] },
    ]},
  },
  {
    key: "monk", koName: "몽크", hitDie: "d8",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "shortsword", quantity: 1 }] }, { items: [{ itemKey: "simple-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "dungeoneer-pack", quantity: 1 }] }, { items: [{ itemKey: "explorer-pack", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "dart", quantity: 10 }] }] },
    ]},
  },
  {
    key: "paladin", koName: "팔라딘", hitDie: "d10",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "martial-weapon-1", quantity: 1 }, { itemKey: "shield", quantity: 1 }] }, { items: [{ itemKey: "martial-weapon-2", quantity: 2 }] }] },
      { options: [{ items: [{ itemKey: "javelin", quantity: 5 }] }, { items: [{ itemKey: "simple-melee-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "priest-pack", quantity: 1 }] }, { items: [{ itemKey: "explorer-pack", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "chain-mail", quantity: 1 }, { itemKey: "holy-symbol", quantity: 1 }] }] },
    ]},
  },
  {
    key: "ranger", koName: "레인저", hitDie: "d10",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "scale-mail", quantity: 1 }] }, { items: [{ itemKey: "leather-armor", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "shortsword", quantity: 2 }] }, { items: [{ itemKey: "simple-melee-weapon-2", quantity: 2 }] }] },
      { options: [{ items: [{ itemKey: "dungeoneer-pack", quantity: 1 }] }, { items: [{ itemKey: "explorer-pack", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "longbow", quantity: 1 }, { itemKey: "arrow", quantity: 20 }] }] },
    ]},
  },
  {
    key: "rogue", koName: "로그", hitDie: "d8",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "rapier", quantity: 1 }] }, { items: [{ itemKey: "shortsword", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "shortbow", quantity: 1 }, { itemKey: "arrow", quantity: 20 }] }, { items: [{ itemKey: "shortsword", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "burglar-pack", quantity: 1 }] }, { items: [{ itemKey: "dungeoneer-pack", quantity: 1 }] }, { items: [{ itemKey: "explorer-pack", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "leather-armor", quantity: 1 }, { itemKey: "dagger", quantity: 2 }, { itemKey: "thieves-tools", quantity: 1 }] }] },
    ]},
  },
  {
    key: "sorcerer", koName: "소서러", hitDie: "d6",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "light-crossbow", quantity: 1 }, { itemKey: "bolt", quantity: 20 }] }, { items: [{ itemKey: "simple-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "component-pouch", quantity: 1 }] }, { items: [{ itemKey: "arcane-focus", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "dungeoneer-pack", quantity: 1 }] }, { items: [{ itemKey: "explorer-pack", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "dagger", quantity: 2 }] }] },
    ]},
  },
  {
    key: "warlock", koName: "워락", hitDie: "d8",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "light-crossbow", quantity: 1 }, { itemKey: "bolt", quantity: 20 }] }, { items: [{ itemKey: "simple-weapon-1", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "component-pouch", quantity: 1 }] }, { items: [{ itemKey: "arcane-focus", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "scholar-pack", quantity: 1 }] }, { items: [{ itemKey: "dungeoneer-pack", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "leather-armor", quantity: 1 }, { itemKey: "simple-weapon-2", quantity: 1 }, { itemKey: "dagger", quantity: 2 }] }] },
    ]},
  },
  {
    key: "wizard", koName: "위저드", hitDie: "d6",
    startingEquipment: { slots: [
      { options: [{ items: [{ itemKey: "quarterstaff", quantity: 1 }] }, { items: [{ itemKey: "dagger", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "component-pouch", quantity: 1 }] }, { items: [{ itemKey: "arcane-focus", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "scholar-pack", quantity: 1 }] }, { items: [{ itemKey: "explorer-pack", quantity: 1 }] }] },
      { options: [{ items: [{ itemKey: "spellbook", quantity: 1 }] }] },
    ]},
  },
];

export async function seedClasses(prisma: PrismaClient): Promise<void> {
  for (const c of classSeeds) {
    const counts = spellCounts[c.key] ?? { cantrips: 0, spells: 0 };
    await prisma.classDefinition.upsert({
      where: { key: c.key },
      update: {
        koName: c.koName,
        hitDie: c.hitDie,
        startingEquipmentJson: JSON.stringify(c.startingEquipment),
        startingCantripCount: counts.cantrips,
        startingSpellCount: counts.spells,
      },
      create: {
        key: c.key,
        koName: c.koName,
        hitDie: c.hitDie,
        startingEquipmentJson: JSON.stringify(c.startingEquipment),
        startingCantripCount: counts.cantrips,
        startingSpellCount: counts.spells,
      },
    });
  }
}
