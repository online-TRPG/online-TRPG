import { PrismaClient } from "@prisma/client";

// 클래스 시작 장비에 등장하는 unique 아이템 카탈로그 + placeholder("단순 무기 하나" 등) 항목.
// 룰북 ai/translated/classes/*.md 추출 결과 기준.
interface ItemSeed {
  key: string;
  koName: string;
  category: string;
}

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
  for (const item of itemSeeds) {
    await prisma.item.upsert({
      where: { key: item.key },
      update: { koName: item.koName, category: item.category },
      create: { key: item.key, koName: item.koName, category: item.category },
    });
  }
}
