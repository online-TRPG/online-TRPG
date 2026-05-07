export interface RaceOption {
  value: string;
  label: string;
}

export interface RaceTraitSummary {
  name: string;
  summary: string;
}

export interface RaceAbilityBonus {
  ability: "str" | "dex" | "con" | "int" | "wis" | "cha" | "any";
  amount: number;
  note?: string;
}

export interface RaceData extends RaceOption {
  id: string;
  size: string;
  speed: number;
  speedRaw: string;
  abilityScoreIncreaseRaw: string;
  abilityBonuses: RaceAbilityBonus[];
  languages: string[];
  traitSummaries: RaceTraitSummary[];
}

export const raceData: RaceData[] = [
  {
    id: "race.gnome",
    value: "Gnome",
    label: "노움",
    size: "Small",
    speed: 25,
    speedRaw: "25 ft.",
    abilityScoreIncreaseRaw: "Intelligence +2",
    abilityBonuses: [
      { ability: "int", amount: 2 },
      { ability: "con", amount: 1, note: "바위 노움 서브레이스 기준" },
    ],
    languages: ["Common", "Gnomish"],
    traitSummaries: [
      { name: "능력치 증가", summary: "지능이 2 증가하고, 바위 노움 기준 건강이 1 증가합니다." },
      { name: "이동속도", summary: "기본 보행 이동속도는 25피트입니다." },
      { name: "암시야", summary: "60피트 범위의 어둠과 희미한 빛을 더 잘 볼 수 있습니다." },
      { name: "노움의 재치", summary: "마법에 저항하는 지능, 지혜, 매력 내성 굴림에 유리함을 얻습니다." },
    ],
  },
  {
    id: "race.dragonborn",
    value: "Dragonborn",
    label: "드래곤본",
    size: "Medium",
    speed: 30,
    speedRaw: "30 ft.",
    abilityScoreIncreaseRaw: "Strength +2, Charisma +1",
    abilityBonuses: [
      { ability: "str", amount: 2 },
      { ability: "cha", amount: 1 },
    ],
    languages: ["Common", "Draconic"],
    traitSummaries: [
      { name: "능력치 증가", summary: "근력이 2, 매력이 1 증가합니다." },
      { name: "이동속도", summary: "기본 보행 이동속도는 30피트입니다." },
      { name: "드래곤 혈통", summary: "혈통에 따라 숨결 무기와 피해 저항이 달라집니다." },
      { name: "숨결 무기", summary: "행동으로 원뿔 또는 직선 범위의 속성 피해를 줄 수 있습니다." },
    ],
  },
  {
    id: "race.dwarf",
    value: "Dwarf",
    label: "드워프",
    size: "Medium",
    speed: 25,
    speedRaw: "25 ft.",
    abilityScoreIncreaseRaw: "Constitution +2",
    abilityBonuses: [
      { ability: "con", amount: 2 },
      { ability: "wis", amount: 1, note: "언덕 드워프 서브레이스 기준" },
    ],
    languages: ["Common", "Dwarvish"],
    traitSummaries: [
      { name: "능력치 증가", summary: "건강이 2 증가하고, 언덕 드워프 기준 지혜가 1 증가합니다." },
      { name: "이동속도", summary: "기본 보행 이동속도는 25피트이며 중갑을 입어도 감소하지 않습니다." },
      { name: "드워프의 회복력", summary: "독 관련 내성 굴림에 유리함을 얻고 독 피해에 저항합니다." },
      { name: "드워프의 강인함", summary: "언덕 드워프 기준 최대 HP가 1 증가하고 레벨업 때마다 추가 HP를 얻습니다." },
    ],
  },
  {
    id: "race.elf",
    value: "Elf",
    label: "엘프",
    size: "Medium",
    speed: 30,
    speedRaw: "30 ft.",
    abilityScoreIncreaseRaw: "Dexterity +2",
    abilityBonuses: [
      { ability: "dex", amount: 2 },
      { ability: "int", amount: 1, note: "하이 엘프 서브레이스 기준" },
    ],
    languages: ["Common", "Elvish"],
    traitSummaries: [
      { name: "능력치 증가", summary: "민첩이 2 증가하고, 하이 엘프 기준 지능이 1 증가합니다." },
      { name: "이동속도", summary: "기본 보행 이동속도는 30피트입니다." },
      { name: "예리한 감각", summary: "감지 기술에 숙련됩니다." },
      { name: "무아지경", summary: "잠 대신 4시간 명상으로 휴식을 대체할 수 있습니다." },
    ],
  },
  {
    id: "race.human",
    value: "Human",
    label: "인간",
    size: "Medium",
    speed: 30,
    speedRaw: "30 ft.",
    abilityScoreIncreaseRaw: "All ability scores +1",
    abilityBonuses: [
      { ability: "str", amount: 1 },
      { ability: "dex", amount: 1 },
      { ability: "con", amount: 1 },
      { ability: "int", amount: 1 },
      { ability: "wis", amount: 1 },
      { ability: "cha", amount: 1 },
    ],
    languages: ["Common", "One extra language"],
    traitSummaries: [
      { name: "능력치 증가", summary: "모든 능력치가 각각 1씩 증가합니다." },
      { name: "이동속도", summary: "기본 보행 이동속도는 30피트입니다." },
      { name: "언어", summary: "공용어와 원하는 언어 하나를 추가로 사용할 수 있습니다." },
    ],
  },
  {
    id: "race.tiefling",
    value: "Tiefling",
    label: "티플링",
    size: "Medium",
    speed: 30,
    speedRaw: "30 ft.",
    abilityScoreIncreaseRaw: "Intelligence +1, Charisma +2",
    abilityBonuses: [
      { ability: "int", amount: 1 },
      { ability: "cha", amount: 2 },
    ],
    languages: ["Common", "Infernal"],
    traitSummaries: [
      { name: "능력치 증가", summary: "지능이 1 증가하고 매력이 2 증가합니다." },
      { name: "이동속도", summary: "기본 보행 이동속도는 30피트입니다." },
      { name: "지옥의 저항력", summary: "화염 피해에 저항합니다." },
      { name: "지옥의 유산", summary: "레벨이 오를수록 지옥 혈통 주문을 사용할 수 있습니다." },
    ],
  },
  {
    id: "race.half_elf",
    value: "Half-Elf",
    label: "하프엘프",
    size: "Medium",
    speed: 30,
    speedRaw: "30 ft.",
    abilityScoreIncreaseRaw: "Charisma +2, two other ability scores +1",
    abilityBonuses: [
      { ability: "cha", amount: 2 },
      { ability: "any", amount: 1, note: "서로 다른 두 능력치 선택" },
    ],
    languages: ["Common", "Elvish", "One extra language"],
    traitSummaries: [
      { name: "능력치 증가", summary: "매력이 2 증가하고, 다른 두 능력치를 각각 1씩 선택해 올립니다." },
      { name: "이동속도", summary: "기본 보행 이동속도는 30피트입니다." },
      { name: "요정 혈통", summary: "매혹 저항에 유리하며 마법으로 잠들지 않습니다." },
      { name: "다재다능한 기술", summary: "원하는 기술 두 개에 숙련됩니다." },
    ],
  },
  {
    id: "race.half_orc",
    value: "Half-Orc",
    label: "하프오크",
    size: "Medium",
    speed: 30,
    speedRaw: "30 ft.",
    abilityScoreIncreaseRaw: "Strength +2, Constitution +1",
    abilityBonuses: [
      { ability: "str", amount: 2 },
      { ability: "con", amount: 1 },
    ],
    languages: ["Common", "Orc"],
    traitSummaries: [
      { name: "능력치 증가", summary: "근력이 2 증가하고 건강이 1 증가합니다." },
      { name: "이동속도", summary: "기본 보행 이동속도는 30피트입니다." },
      { name: "위협적 존재", summary: "위협 기술에 숙련됩니다." },
      { name: "끈질긴 인내", summary: "HP가 0이 되어도 한 번은 HP 1로 버틸 수 있습니다." },
    ],
  },
  {
    id: "race.halfling",
    value: "Halfling",
    label: "하플링",
    size: "Small",
    speed: 25,
    speedRaw: "25 ft.",
    abilityScoreIncreaseRaw: "Dexterity +2",
    abilityBonuses: [
      { ability: "dex", amount: 2 },
      { ability: "cha", amount: 1, note: "라이트풋 하플링 서브레이스 기준" },
    ],
    languages: ["Common", "Halfling"],
    traitSummaries: [
      { name: "능력치 증가", summary: "민첩이 2 증가하고, 라이트풋 하플링 기준 매력이 1 증가합니다." },
      { name: "이동속도", summary: "기본 보행 이동속도는 25피트입니다." },
      { name: "행운", summary: "d20 결과가 1이면 한 번 더 굴릴 수 있습니다." },
      { name: "타고난 은신성", summary: "라이트풋 하플링은 큰 크리처 뒤에 숨어도 숨기를 시도할 수 있습니다." },
    ],
  },
];

export const raceOptions: RaceOption[] = raceData.map(({ value, label }) => ({ value, label }));

const raceLabelMap = new Map(raceOptions.map((option) => [option.value, option.label]));

export function getRaceLabel(value: string) {
  return raceLabelMap.get(value) ?? value;
}
