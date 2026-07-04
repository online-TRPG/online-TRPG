import { useMemo } from 'react';
import type { SessionSnapshot } from '../../../types/session';

type SessionScenario = SessionSnapshot['sessionScenarios'][number];

type UseActiveSessionScenarioProjectionParams = {
  sessionScenarios?: SessionScenario[];
};

export function useActiveSessionScenarioProjection({
  sessionScenarios = [],
}: UseActiveSessionScenarioProjectionParams) {
  const activeScenario = useMemo(
    () =>
      sessionScenarios.find((item) => item.status === 'ACTIVE') ??
      sessionScenarios[0],
    [sessionScenarios],
  );

  return {
    activeScenario,
    scenarioTitle: activeScenario?.scenario.title,
    scenarioDescription: activeScenario?.scenario.description,
    scenarioStartLevel: activeScenario?.scenario.startLevel,
    scenarioRecommendedEndLevel: activeScenario?.scenario.recommendedEndLevel,
    quickCreateLevel: activeScenario?.scenario.startLevel ?? 1,
    quickCreateScenarioId: activeScenario?.scenario.id ?? null,
  };
}
