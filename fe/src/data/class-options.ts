export interface ClassOption {
  value: "Wizard" | "Ranger" | "Rogue" | "Fighter";
  label: string;
  id: string;
  hitDie: number;
  hitDieRaw: string;
  primaryAbilitiesRaw: string;
  savingThrowsRaw: string;
  armorProficienciesRaw: string;
  weaponProficienciesRaw: string;
  toolProficienciesRaw: string;
  skillChoicesRaw: string;
  startingEquipment: string[];
  spellcastingAbility: string | null;
  spellcastingSummary: string[];
  subclassRaw: string | null;
  levelFeatureSummary: Array<{
    level: number;
    features: string;
  }>;
  summary: string;
}

export const classOptions: readonly ClassOption[] = [
  {
    value: "Wizard",
    label: "위자드",
    id: "class.wizard",
    hitDie: 6,
    hitDieRaw: "d6",
    primaryAbilitiesRaw: "Intelligence",
    savingThrowsRaw: "Intelligence, Wisdom",
    armorProficienciesRaw: "없음",
    weaponProficienciesRaw: "단검, 다트, 슬링, 쿼터스태프, 라이트 크로스보우",
    toolProficienciesRaw: "없음",
    skillChoicesRaw: "비전학, 역사, 통찰, 조사, 의학, 종교 중 2개",
    startingEquipment: [
      "쿼터스태프 또는 단검",
      "구성요소 파우치 또는 비전 초점구",
      "학자 꾸러미 또는 탐험가 꾸러미",
      "주문책",
    ],
    spellcastingAbility: "Intelligence",
    spellcastingSummary: [
      "주문 내성 DC = 8 + 숙련 보너스 + 지능 수정치",
      "주문 공격 수정치 = 숙련 보너스 + 지능 수정치",
      "준비 주문 수 = 위저드 레벨 + 지능 수정치",
    ],
    subclassRaw: "School of Evocation",
    levelFeatureSummary: [
      { level: 1, features: "주문시전, 비전 회복" },
      { level: 2, features: "비전 전통" },
      { level: 4, features: "능력치 향상" },
      { level: 18, features: "주문 숙련" },
      { level: 20, features: "대표 주문" },
    ],
    summary:
      "지능 기반 순수 주문시전자입니다. 주문책과 준비형 주문 구조를 사용하며, 다양한 주문 선택과 강한 후반 확장성이 특징입니다.",
  },
  {
    value: "Ranger",
    label: "레인저",
    id: "class.ranger",
    hitDie: 10,
    hitDieRaw: "d10",
    primaryAbilitiesRaw: "Dexterity, Wisdom",
    savingThrowsRaw: "Strength, Dexterity",
    armorProficienciesRaw: "경장, 평장, 방패",
    weaponProficienciesRaw: "단순 무기, 군용 무기",
    toolProficienciesRaw: "없음",
    skillChoicesRaw: "동물 조련, 운동, 통찰, 조사, 자연, 감지, 은신, 생존 중 3개",
    startingEquipment: [
      "스케일 메일 또는 가죽 갑옷",
      "쇼트소드 2개 또는 단순 근접 무기 2개",
      "던전 탐험가 꾸러미 또는 탐험가 꾸러미",
      "롱보우와 화살 20개",
    ],
    spellcastingAbility: "Wisdom",
    spellcastingSummary: [
      "주문 내성 DC = 8 + 숙련 보너스 + 지혜 수정치",
      "주문 공격 수정치 = 숙련 보너스 + 지혜 수정치",
      "2레벨부터 주문을 시전합니다.",
    ],
    subclassRaw: "Hunter",
    levelFeatureSummary: [
      { level: 1, features: "숙적, 자연 탐험가" },
      { level: 2, features: "전투 방식, 주문시전" },
      { level: 3, features: "레인저 아키타입, 원초적 감지" },
      { level: 5, features: "추가 공격" },
      { level: 20, features: "숙적 처단자" },
    ],
    summary:
      "민첩과 지혜를 활용하는 추적형 하이브리드 클래스입니다. 활과 생존, 탐험, 제한적 주문 운용이 강점입니다.",
  },
  {
    value: "Rogue",
    label: "로그",
    id: "class.rogue",
    hitDie: 8,
    hitDieRaw: "d8",
    primaryAbilitiesRaw: "Dexterity",
    savingThrowsRaw: "Dexterity, Intelligence",
    armorProficienciesRaw: "경장",
    weaponProficienciesRaw: "단순 무기, 핸드 크로스보우, 롱소드, 레이피어, 쇼트소드",
    toolProficienciesRaw: "도둑 도구",
    skillChoicesRaw: "곡예, 운동, 기만, 통찰, 위협, 조사, 감지, 공연, 설득, 손재주, 은신 중 4개",
    startingEquipment: [
      "레이피어 또는 쇼트소드",
      "쇼트보우와 화살 20개 또는 쇼트소드",
      "도둑 꾸러미, 던전 탐험가 꾸러미, 탐험가 꾸러미 중 하나",
      "가죽 갑옷, 단검 2개, 도둑 도구",
    ],
    spellcastingAbility: null,
    spellcastingSummary: [],
    subclassRaw: "Thief",
    levelFeatureSummary: [
      { level: 1, features: "전문화, 암습, 도둑의 은어" },
      { level: 2, features: "교활한 행동" },
      { level: 3, features: "로그 아키타입" },
      { level: 5, features: "불가사의한 회피" },
      { level: 20, features: "행운의 일격" },
    ],
    summary:
      "민첩 중심의 기동형 클래스입니다. 암습, 은신, 전문화, 도구 활용으로 상황을 유리하게 만드는 데 특화되어 있습니다.",
  },
  {
    value: "Fighter",
    label: "파이터",
    id: "class.fighter",
    hitDie: 10,
    hitDieRaw: "d10",
    primaryAbilitiesRaw: "Strength or Dexterity, Constitution",
    savingThrowsRaw: "Strength, Constitution",
    armorProficienciesRaw: "모든 방어구, 방패",
    weaponProficienciesRaw: "단순 무기, 군용 무기",
    toolProficienciesRaw: "없음",
    skillChoicesRaw: "곡예, 동물 조련, 운동, 역사, 통찰, 위협, 감지, 생존 중 2개",
    startingEquipment: [
      "체인 메일 또는 가죽 갑옷, 롱보우, 화살 20개",
      "군용 무기와 방패 또는 군용 무기 2개",
      "라이트 크로스보우와 볼트 20개 또는 핸드액스 2개",
      "던전 탐험가 꾸러미 또는 탐험가 꾸러미",
    ],
    spellcastingAbility: null,
    spellcastingSummary: [],
    subclassRaw: "Champion",
    levelFeatureSummary: [
      { level: 1, features: "전투 방식, 재기의 숨결" },
      { level: 2, features: "행동 연쇄 1회" },
      { level: 3, features: "무예 아키타입" },
      { level: 5, features: "추가 공격 1회" },
      { level: 20, features: "추가 공격 3회" },
    ],
    summary:
      "높은 생존력과 안정적인 무기 운용을 가진 정통 전사 클래스입니다. 방어구 선택 폭이 넓고 전면전에서 가장 다루기 쉽습니다.",
  },
] as const;

export type ClassOptionValue = (typeof classOptions)[number]["value"];

const classLabelMap = new Map(classOptions.map((option) => [option.value, option.label]));
const legacyClassLabelMap = new Map<string, string>([
  ["Archer", "레인저"],
  ["Warrior", "파이터"],
]);

export function normalizeClassValue(value: string): ClassOptionValue {
  if (value === "Archer") return "Ranger";
  if (value === "Warrior") return "Fighter";
  if (value === "Wizard" || value === "Ranger" || value === "Rogue" || value === "Fighter") {
    return value;
  }

  return "Wizard";
}

export function getClassLabel(value: string) {
  return classLabelMap.get(value as ClassOptionValue) ?? legacyClassLabelMap.get(value) ?? value;
}
