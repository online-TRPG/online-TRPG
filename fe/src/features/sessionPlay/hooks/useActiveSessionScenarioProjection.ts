import { useMemo } from 'react';
import { isActiveSessionScenarioStatus } from '@trpg/shared-types/frontend';
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
      sessionScenarios.find((item) => isActiveSessionScenarioStatus(item.status)) ??
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
