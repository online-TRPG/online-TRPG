import type { ClassDefinitionResponseDto } from '@trpg/shared-types';

type UseQuickCreateModalPresentationParams = {
  quickCreateConfigReady: boolean;
  busy: boolean;
  level: number;
  maxHp: number;
  armorClass: number;
  speed: number;
  selectedClass: ClassDefinitionResponseDto | null;
};

export function useQuickCreateModalPresentation({
  quickCreateConfigReady,
  busy,
  level,
  maxHp,
  armorClass,
  speed,
  selectedClass,
}: UseQuickCreateModalPresentationParams) {
  const selectDisabled = !quickCreateConfigReady;
  const submitDisabled = busy || !quickCreateConfigReady;
  const statusChips = [
    `LV ${level}`,
    `HP ${maxHp}`,
    `AC ${armorClass}`,
    `이동 ${speed}ft`,
  ];
  const proficientSkillText = selectedClass
    ? selectedClass.skillChoiceCount > 0
      ? selectedClass.skillChoices
          .slice(0, selectedClass.skillChoiceCount)
          .join(', ')
      : '자동 선택 없음'
    : null;

  return {
    eyebrow: '캐릭터 생성',
    title: '새 캐릭터 생성',
    closeLabel: 'Close',
    description:
      '종족, 직업, 시작 장비, 주문, 능력치는 현재 규칙에 맞는 기본값으로 자동 완성됩니다.',
    nameLabel: 'Name',
    ancestryLabel: 'Ancestry',
    classLabel: 'Class',
    selectDisabled,
    submitDisabled,
    statusChips,
    proficientSkillDescription: proficientSkillText
      ? `숙련 기술은 ${proficientSkillText}으로 적용됩니다.`
      : null,
    cancelLabel: 'Cancel',
    submitLabel: 'Save',
  };
}
