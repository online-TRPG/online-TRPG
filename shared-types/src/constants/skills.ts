// D&D 5e 표준 18개 스킬 한국어/영문 매핑.
// BE seed (be/src/database/seed/classes.ts ALL_SKILLS) 의 한국어 명칭을 정답으로 둔다.
// FE 캐릭터 생성 셀렉터, BE validateProficientSkills, AI 룰북 검증 모두 같은 출처를 본다.

/** D&D 5e 6대 능력치 코드 */
export type AbilityCode = "str" | "dex" | "con" | "int" | "wis" | "cha";

/** 능력치 코드 → 한국어 표기 */
export const ABILITY_KO: Readonly<Record<AbilityCode, string>> = {
  str: "근력",
  dex: "민첩",
  con: "건강",
  int: "지능",
  wis: "지혜",
  cha: "매력",
} as const;

export interface Dnd5eSkillEntry {
  /** 영문 코드 (FE select value 로 송신해도 정상 normalize 됨) */
  readonly code: string;
  /** 한국어 표기 (DB ClassDefinition.skillChoicesJson, Character.proficientSkillsJson 의 정규형) */
  readonly ko: string;
  /** 이 스킬이 사용하는 능력치 (판정 보정 계산·UI 부제 표기에 사용) */
  readonly ability: AbilityCode;
}

export const DND5E_SKILLS: readonly Dnd5eSkillEntry[] = [
  { code: "Acrobatics", ko: "곡예", ability: "dex" },
  { code: "AnimalHandling", ko: "동물 조련", ability: "wis" },
  { code: "Arcana", ko: "비전학", ability: "int" },
  { code: "Athletics", ko: "운동", ability: "str" },
  { code: "Deception", ko: "기만", ability: "cha" },
  { code: "History", ko: "역사", ability: "int" },
  { code: "Insight", ko: "통찰", ability: "wis" },
  { code: "Intimidation", ko: "위협", ability: "cha" },
  { code: "Investigation", ko: "조사", ability: "int" },
  { code: "Medicine", ko: "의학", ability: "wis" },
  { code: "Nature", ko: "자연", ability: "int" },
  { code: "Perception", ko: "감지", ability: "wis" },
  { code: "Performance", ko: "공연", ability: "cha" },
  { code: "Persuasion", ko: "설득", ability: "cha" },
  { code: "Religion", ko: "종교", ability: "int" },
  { code: "SleightOfHand", ko: "손재주", ability: "dex" },
  { code: "Stealth", ko: "은신", ability: "dex" },
  { code: "Survival", ko: "생존", ability: "wis" },
] as const;

const SKILL_BY_CODE = new Map(DND5E_SKILLS.map((s) => [s.code.toLowerCase(), s] as const));
const SKILL_BY_KO = new Map(DND5E_SKILLS.map((s) => [s.ko, s] as const));

/**
 * 영문 코드("Arcana") · 한국어("비전학") 어느 쪽으로 들어와도 한국어 정규형으로 반환.
 * 매칭 실패 시 null. 공백/대소문자 차이는 흡수.
 */
export function normalizeSkillToKo(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (SKILL_BY_KO.has(trimmed)) {
    return trimmed;
  }
  return SKILL_BY_CODE.get(trimmed.toLowerCase())?.ko ?? null;
}

/**
 * 스킬명(영문 코드 또는 한국어)으로 해당 스킬이 쓰는 능력치를 반환.
 * 매칭 실패 시 null — 호출부에서 폴백 처리한다.
 */
export function resolveSkillAbility(
  input: string,
): { abilityCode: AbilityCode; abilityKo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const entry = SKILL_BY_KO.get(trimmed) ?? SKILL_BY_CODE.get(trimmed.toLowerCase());
  if (!entry) {
    return null;
  }
  return { abilityCode: entry.ability, abilityKo: ABILITY_KO[entry.ability] };
}
