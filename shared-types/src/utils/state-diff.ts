import type { StateDiffResponseDto } from "../dto/api/gameplay.dto";

export type CharacterStateDiffPatch = {
  sessionCharacterId: string | null;
  combatParticipantId: string | null;
  currentHp?: number;
  tempHp?: number;
  conditions?: string[];
  markDead?: boolean;
};

type CharacterPatchSource = "characters" | "sessionCharacters" | "combatParticipants";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalFiniteNumber(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseCharacterStateDiff(
  stateDiff: Pick<StateDiffResponseDto, "diff">,
): CharacterStateDiffPatch[] | null {
  const patches: CharacterStateDiffPatch[] = [];
  const sources: Array<[CharacterPatchSource, unknown]> = [
    ["characters", stateDiff.diff.characters],
    ["sessionCharacters", stateDiff.diff.sessionCharacters],
    ["combatParticipants", stateDiff.diff.combatParticipants],
  ];
  let foundSupportedArray = false;

  for (const [source, values] of sources) {
    if (values === undefined) continue;
    if (!Array.isArray(values)) return null;
    if (values.length) foundSupportedArray = true;
    for (const value of values) {
      const patch = parseCharacterPatch(value, source);
      if (!patch) return null;
      patches.push(patch);
    }
  }

  return foundSupportedArray ? patches : null;
}

function parseCharacterPatch(
  value: unknown,
  source: CharacterPatchSource,
): CharacterStateDiffPatch | null {
  if (!isRecord(value)) return null;

  const sessionCharacterId =
    typeof value.sessionCharacterId === "string"
      ? value.sessionCharacterId
      : typeof value.id === "string"
        ? value.id
        : null;
  const combatParticipantId =
    typeof value.combatParticipantId === "string" ? value.combatParticipantId : null;
  if (source === "sessionCharacters" && !sessionCharacterId) return null;
  if (source === "combatParticipants" && !combatParticipantId) return null;
  if (!sessionCharacterId && !combatParticipantId) return null;

  const currentHp = optionalFiniteNumber(value.currentHp);
  const tempHp = optionalFiniteNumber(value.tempHp);
  if (currentHp === null || tempHp === null) return null;

  let conditions: string[] | undefined;
  if (value.conditions !== undefined) {
    if (!Array.isArray(value.conditions) || value.conditions.some((item) => typeof item !== "string")) {
      return null;
    }
    conditions = value.conditions;
  }
  if (value.markDead !== undefined && typeof value.markDead !== "boolean") return null;
  if (value.isAlive !== undefined && typeof value.isAlive !== "boolean") return null;
  if (
    typeof value.markDead === "boolean" &&
    typeof value.isAlive === "boolean" &&
    value.markDead === value.isAlive
  ) {
    return null;
  }
  const markDead =
    typeof value.markDead === "boolean"
      ? value.markDead
      : typeof value.isAlive === "boolean"
        ? !value.isAlive
        : undefined;

  return {
    sessionCharacterId,
    combatParticipantId,
    ...(currentHp === undefined ? {} : { currentHp }),
    ...(tempHp === undefined ? {} : { tempHp }),
    ...(conditions === undefined ? {} : { conditions }),
    ...(markDead === undefined ? {} : { markDead }),
  };
}
