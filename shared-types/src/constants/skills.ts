// D&D 5e 표준 18개 스킬 한국어/영문 매핑.
// BE seed (be/src/database/seed/classes.ts ALL_SKILLS) 의 한국어 명칭을 정답으로 둔다.
// FE 캐릭터 생성 셀렉터, BE validateProficientSkills, AI 룰북 검증 모두 같은 출처를 본다.

export interface Dnd5eSkillEntry {
  /** 영문 코드 (FE select value 로 송신해도 정상 normalize 됨) */
  readonly code: string;
  /** 한국어 표기 (DB ClassDefinition.skillChoicesJson, Character.proficientSkillsJson 의 정규형) */
  readonly ko: string;
}

export const DND5E_SKILLS: readonly Dnd5eSkillEntry[] = [
  { code: "Acrobatics", ko: "곡예" },
  { code: "AnimalHandling", ko: "동물 조련" },
  { code: "Arcana", ko: "비전학" },
  { code: "Athletics", ko: "운동" },
  { code: "Deception", ko: "기만" },
  { code: "History", ko: "역사" },
  { code: "Insight", ko: "통찰" },
  { code: "Intimidation", ko: "위협" },
  { code: "Investigation", ko: "조사" },
  { code: "Medicine", ko: "의학" },
  { code: "Nature", ko: "자연" },
  { code: "Perception", ko: "감지" },
  { code: "Performance", ko: "공연" },
  { code: "Persuasion", ko: "설득" },
  { code: "Religion", ko: "종교" },
  { code: "SleightOfHand", ko: "손재주" },
  { code: "Stealth", ko: "은신" },
  { code: "Survival", ko: "생존" },
] as const;

const SKILL_KO_BY_CODE = new Map(DND5E_SKILLS.map((s) => [s.code.toLowerCase(), s.ko] as const));
const SKILL_KO_BY_KO = new Set(DND5E_SKILLS.map((s) => s.ko));

/**
 * 영문 코드("Arcana") · 한국어("비전학") 어느 쪽으로 들어와도 한국어 정규형으로 반환.
 * 매칭 실패 시 null. 공백/대소문자 차이는 흡수.
 */
export function normalizeSkillToKo(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (SKILL_KO_BY_KO.has(trimmed)) {
    return trimmed;
  }
  return SKILL_KO_BY_CODE.get(trimmed.toLowerCase()) ?? null;
}
