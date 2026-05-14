import { DND5E_SKILLS, normalizeSkillToKo } from "@trpg/shared-types";

describe("normalizeSkillToKo", () => {
  it.each([
    ["Arcana", "비전학"],
    ["arcana", "비전학"],
    ["ARCANA", "비전학"],
    ["비전학", "비전학"],
    ["AnimalHandling", "동물 조련"],
    ["SleightOfHand", "손재주"],
    ["Survival", "생존"],
    ["  Arcana  ", "비전학"],
    ["  비전학  ", "비전학"],
  ])("'%s' → '%s'", (input, expected) => {
    expect(normalizeSkillToKo(input)).toBe(expected);
  });

  it.each(["", "   ", "Foo", "NotASkill", "인지능력"])(
    "'%s' → null (unknown)",
    (input) => {
      expect(normalizeSkillToKo(input)).toBeNull();
    },
  );

  it("18개 스킬을 모두 영/한 양방향으로 매핑한다", () => {
    expect(DND5E_SKILLS).toHaveLength(18);
    for (const entry of DND5E_SKILLS) {
      expect(normalizeSkillToKo(entry.code)).toBe(entry.ko);
      expect(normalizeSkillToKo(entry.ko)).toBe(entry.ko);
    }
  });
});
