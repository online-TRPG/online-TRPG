import { useMemo } from 'react';
import { getNodeLabel } from '../utils/playPagePresentation';

type UseCurrentNodeInfoPresentationParams<TCheckOption> = {
  scenarioTitle?: string | null;
  checkOptions: TCheckOption[];
};

export function useCurrentNodeInfoPresentation<TCheckOption>({
  scenarioTitle,
  checkOptions,
}: UseCurrentNodeInfoPresentationParams<TCheckOption>) {
  const labeledCheckOptions = useMemo(
    () =>
      checkOptions.map((option, index) => ({
        option,
        label: getNodeLabel(option) ?? `Check ${index + 1}`,
      })),
    [checkOptions]
  );

  return {
    scenarioEyebrow: '현재 시나리오',
    sceneDescriptionEyebrow: '현재 장면 설명',
    publicCluesEyebrow: '밝혀진 단서',
    publicCluesEmptyText: '현재 씬에 공개 단서가 없습니다.',
    checkOptionsEyebrow: '판정 가이드',
    checkOptionsEmptyText: '설정된 판정 가이드가 없습니다.',
    scenarioDescriptionEyebrow: '시나리오 설명',
    scenarioTitleText: scenarioTitle ?? '시나리오가 없습니다',
    labeledCheckOptions,
  };
}
