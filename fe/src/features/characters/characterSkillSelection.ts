import type { CharacterPayload } from '../../hooks/useSession';
import { normalizeSkillToKo } from './characterCreateDefaults';
import { replaceFeatureTags } from './characterFeatureChoices';

export function addProficientSkillToCharacter(
  character: CharacterPayload,
  skill: string,
  limit: number | null
): CharacterPayload {
  const trimmed = skill.trim();
  if (!trimmed) return character;

  const normalized = normalizeSkillToKo(trimmed) ?? trimmed;
  const existing = character.proficientSkills ?? [];
  if (existing.includes(normalized)) return character;
  if (limit !== null && existing.length >= limit) return character;

  return {
    ...character,
    proficientSkills: [...existing, normalized],
  };
}

export function removeProficientSkillFromCharacter(
  character: CharacterPayload,
  skill: string
): CharacterPayload {
  return {
    ...character,
    proficientSkills: (character.proficientSkills ?? []).filter((entry) => entry !== skill),
    features: replaceFeatureTags(character.features, [`expertise:${skill}`], []),
  };
}
