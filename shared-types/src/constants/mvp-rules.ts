export const MVP_CHARACTER_LEVEL = 2 as const;

export const MVP_RACES = [
  { value: "Human", label: "인간" },
] as const;

export const MVP_CLASSES = [
  { value: "Fighter", label: "파이터" },
  { value: "Rogue", label: "로그" },
  { value: "Ranger", label: "레인저" },
  { value: "Wizard", label: "위저드" },
] as const;

export type MvpRace = (typeof MVP_RACES)[number]["value"];
export type MvpClass = (typeof MVP_CLASSES)[number]["value"];

export const MVP_CLASS_VALUES = MVP_CLASSES.map((option) => option.value);
export const MVP_RACE_VALUES = MVP_RACES.map((option) => option.value);
