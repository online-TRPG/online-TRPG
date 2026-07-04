import { useCallback, useMemo } from 'react';

type CharacterLevelLike = {
  level: number;
};

type UseScenarioLevelPolicyParams = {
  startLevel?: number | null;
  recommendedEndLevel?: number | null;
};

export function useScenarioLevelPolicy(params: UseScenarioLevelPolicyParams) {
  const { startLevel, recommendedEndLevel } = params;

  const scenarioLevelRange = useMemo(() => {
    const minLevel = Math.max(startLevel ?? 1, 1);
    const maxLevel = Math.max(recommendedEndLevel ?? minLevel, minLevel);
    return { minLevel, maxLevel };
  }, [recommendedEndLevel, startLevel]);

  const scenarioLevelLabel =
    scenarioLevelRange.minLevel === scenarioLevelRange.maxLevel
      ? `${scenarioLevelRange.minLevel}레벨`
      : `${scenarioLevelRange.minLevel}-${scenarioLevelRange.maxLevel}레벨`;

  const isCharacterLevelAllowedForScenario = useCallback(
    (character: CharacterLevelLike | null | undefined) =>
      Boolean(
        character &&
          character.level >= scenarioLevelRange.minLevel &&
          character.level <= scenarioLevelRange.maxLevel,
      ),
    [scenarioLevelRange.maxLevel, scenarioLevelRange.minLevel],
  );

  return {
    scenarioLevelRange,
    scenarioLevelLabel,
    isCharacterLevelAllowedForScenario,
  };
}
