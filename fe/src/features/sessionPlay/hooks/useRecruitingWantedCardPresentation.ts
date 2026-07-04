import { useMemo } from 'react';
import {
  getCharacterClassLabel,
  getCharacterImage,
} from '../utils/characterVisuals';
import type { JoinableRecruitingCharacter } from '../utils/recruitingPresentation';

type UseRecruitingWantedCardPresentationParams = {
  character: JoinableRecruitingCharacter | null;
  emptySlotImage: string;
  hasActiveScenario: boolean;
  scenarioLevelLabel: string;
};

export function useRecruitingWantedCardPresentation({
  character,
  emptySlotImage,
  hasActiveScenario,
  scenarioLevelLabel,
}: UseRecruitingWantedCardPresentationParams) {
  return useMemo(() => {
    const levelRestrictionWarning = character?.levelRestrictionReason
      ? `${character.levelRestrictionReason} 현재 캐릭터는 ${character.level}레벨입니다.`
      : null;

    return {
      headerTitle: character ? 'Character Info' : 'Select Character',
      portraitSrc: character ? getCharacterImage(character) : emptySlotImage,
      portraitAlt: character?.name ?? '빈 캐릭터 슬롯',
      portraitClassName: `recruiting-wanted-portrait${character ? '' : ' empty'}`,
      portraitName: character?.name ?? 'EMPTY',
      identityLabel: character
        ? `${character.ancestry} / ${getCharacterClassLabel(character.className)}`
        : '캐릭터를 선택해 주세요',
      stats: {
        level: { label: 'LV', value: character?.level ?? '-' },
        maxHp: { label: 'HP', value: character?.maxHp ?? '-' },
        armorClass: { label: 'AC', value: character?.armorClass ?? '-' },
        speed: { label: 'SPD', value: character?.speed ?? '-' },
      },
      abilitySummaryEmptyText: '선택한 캐릭터의 능력치가 이곳에 표시됩니다.',
      featureSummaryAriaLabel: '핵심 특성 요약',
      featureSummaryLabel: '핵심 특성',
      featureSummaryEmptyText: '캐릭터를 선택하면 주요 특성이 표시됩니다.',
      levelRestrictionWarning,
      scenarioLevelHint:
        !levelRestrictionWarning && hasActiveScenario
          ? `권장 레벨: ${scenarioLevelLabel}`
          : null,
      hasCharacter: Boolean(character),
    };
  }, [character, emptySlotImage, hasActiveScenario, scenarioLevelLabel]);
}
