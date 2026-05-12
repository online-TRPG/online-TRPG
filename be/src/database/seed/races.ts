import { PrismaClient } from "@prisma/client";

type AbilityIncreases = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

const zeroIncreases: AbilityIncreases = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

function add(a: AbilityIncreases, b: Partial<AbilityIncreases>): AbilityIncreases {
  return {
    str: a.str + (b.str ?? 0),
    dex: a.dex + (b.dex ?? 0),
    con: a.con + (b.con ?? 0),
    int: a.int + (b.int ?? 0),
    wis: a.wis + (b.wis ?? 0),
    cha: a.cha + (b.cha ?? 0),
  };
}

// 룰북 ai/translated/races/*.md 의 ability_score_increase 메모 기준
// 하위 종족은 별도 row, abilityIncreases는 상위 종족 보정 + 하위 종족 추가분을 합산한 final 값
interface RaceSeed {
  key: string;
  koName: string;
  size: "Medium" | "Small";
  baseSpeed: number;
  abilityIncreases: AbilityIncreases;
  languages: string[];
  parentKey?: string;
}

const HUMAN = add(zeroIncreases, { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 });
const ELF = add(zeroIncreases, { dex: 2 });
const DWARF = add(zeroIncreases, { con: 2 });
const GNOME = add(zeroIncreases, { int: 2 });
const HALF_ELF = add(zeroIncreases, { cha: 2 });
const HALF_ORC = add(zeroIncreases, { str: 2, con: 1 });
const HALFLING = add(zeroIncreases, { dex: 2 });
const DRAGONBORN = add(zeroIncreases, { str: 2, cha: 1 });
const TIEFLING = add(zeroIncreases, { int: 1, cha: 2 });

const raceSeeds: RaceSeed[] = [
  { key: "human", koName: "인간", size: "Medium", baseSpeed: 30, abilityIncreases: HUMAN, languages: ["Common"] },
  { key: "elf", koName: "엘프", size: "Medium", baseSpeed: 30, abilityIncreases: ELF, languages: ["Common", "Elvish"] },
  { key: "high-elf", koName: "하이 엘프", size: "Medium", baseSpeed: 30, abilityIncreases: add(ELF, { int: 1 }), languages: ["Common", "Elvish"], parentKey: "elf" },
  { key: "dwarf", koName: "드워프", size: "Medium", baseSpeed: 25, abilityIncreases: DWARF, languages: ["Common", "Dwarvish"] },
  { key: "hill-dwarf", koName: "언덕 드워프", size: "Medium", baseSpeed: 25, abilityIncreases: add(DWARF, { wis: 1 }), languages: ["Common", "Dwarvish"], parentKey: "dwarf" },
  { key: "gnome", koName: "노움", size: "Small", baseSpeed: 25, abilityIncreases: GNOME, languages: ["Common", "Gnomish"] },
  { key: "rock-gnome", koName: "바위 노움", size: "Small", baseSpeed: 25, abilityIncreases: add(GNOME, { con: 1 }), languages: ["Common", "Gnomish"], parentKey: "gnome" },
  { key: "half-elf", koName: "하프엘프", size: "Medium", baseSpeed: 30, abilityIncreases: HALF_ELF, languages: ["Common", "Elvish"] },
  { key: "half-orc", koName: "하프오크", size: "Medium", baseSpeed: 30, abilityIncreases: HALF_ORC, languages: ["Common", "Orc"] },
  { key: "halfling", koName: "하플링", size: "Small", baseSpeed: 25, abilityIncreases: HALFLING, languages: ["Common", "Halfling"] },
  { key: "lightfoot-halfling", koName: "라이트풋 하플링", size: "Small", baseSpeed: 25, abilityIncreases: add(HALFLING, { cha: 1 }), languages: ["Common", "Halfling"], parentKey: "halfling" },
  { key: "dragonborn", koName: "드래곤본", size: "Medium", baseSpeed: 30, abilityIncreases: DRAGONBORN, languages: ["Common", "Draconic"] },
  { key: "tiefling", koName: "티플링", size: "Medium", baseSpeed: 30, abilityIncreases: TIEFLING, languages: ["Common", "Infernal"] },
];

export async function seedRaces(prisma: PrismaClient): Promise<void> {
  for (const race of raceSeeds.filter((r) => !r.parentKey)) {
    await prisma.race.upsert({
      where: { key: race.key },
      update: {
        koName: race.koName,
        size: race.size,
        baseSpeed: race.baseSpeed,
        abilityIncreasesJson: JSON.stringify(race.abilityIncreases),
        languagesJson: JSON.stringify(race.languages),
        parentRaceId: null,
      },
      create: {
        key: race.key,
        koName: race.koName,
        size: race.size,
        baseSpeed: race.baseSpeed,
        abilityIncreasesJson: JSON.stringify(race.abilityIncreases),
        languagesJson: JSON.stringify(race.languages),
      },
    });
  }

  for (const race of raceSeeds.filter((r) => r.parentKey)) {
    const parent = await prisma.race.findUnique({ where: { key: race.parentKey! } });
    if (!parent) {
      throw new Error(`Parent race not found for subrace ${race.key}: ${race.parentKey}`);
    }
    await prisma.race.upsert({
      where: { key: race.key },
      update: {
        koName: race.koName,
        size: race.size,
        baseSpeed: race.baseSpeed,
        abilityIncreasesJson: JSON.stringify(race.abilityIncreases),
        languagesJson: JSON.stringify(race.languages),
        parentRaceId: parent.id,
      },
      create: {
        key: race.key,
        koName: race.koName,
        size: race.size,
        baseSpeed: race.baseSpeed,
        abilityIncreasesJson: JSON.stringify(race.abilityIncreases),
        languagesJson: JSON.stringify(race.languages),
        parentRaceId: parent.id,
      },
    });
  }
}
