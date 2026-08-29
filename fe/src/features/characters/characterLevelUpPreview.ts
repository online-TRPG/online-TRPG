import type { PersistentCharacter } from '../../types/session';
import type { CanonicalClassFeatureEntry, ClassOption } from '../../services/staticSrd';
import { abilityDisplayLabels } from './characterBuildRules';
import {
  featOptionById,
  getAbilityFromAsiChoiceId,
} from './characterFeatureChoices';
import {
  buildClassFeaturePreviewItem,
  isAbilityScoreImprovementLabel,
  splitClassFeatureSummary,
  type CharacterFeaturePreviewItem,
} from './characterFeaturePreview';

export type CharacterLevelUpPreviewRow = {
  label: string;
  value: string;
};

type InventoryItem = PersistentCharacter['inventory'][number];

function findInventoryItemById(
  inventory: InventoryItem[],
  itemId: string | null | undefined
) {
  if (!itemId) return null;
  return inventory.find((item) => item.id === itemId || item.itemDefinitionId === itemId) ?? null;
}

function hasConcentrationCondition(conditions: string[]) {
  return conditions.some(
    (condition) => condition.toLowerCase().includes('concentration') || condition.includes('집중')
  );
}

export function buildCharacterLevelUpPreviewRows(params: {
  character: PersistentCharacter | null | undefined;
  knownSlotSpellCount: number;
  currentCantripCount: number;
  preparedSpellCount: number;
  preparedSpellLimit: number | null;
  getItemName: (item: InventoryItem) => string;
}): CharacterLevelUpPreviewRow[] {
  const { character } = params;
  if (!character) return [];

  const previewContext = character.levelUpPreviewContext ?? null;
  const activeConditions = character.activeSessionConditions ?? [];
  const hasActiveConcentration = hasConcentrationCondition(activeConditions);
  const equippedWeapon = findInventoryItemById(character.inventory, character.equippedWeaponId);
  const offhandWeapon = findInventoryItemById(character.inventory, character.offhandWeaponId);

  return [
    {
      label: '진행 중 세션',
      value: previewContext?.activeSessionId
        ? `참가 중 · 현재 장면 ${previewContext.currentNodeId ? '있음' : '없음'}`
        : '진행 중 세션 없음',
    },
    {
      label: '조건/집중',
      value: previewContext
        ? `조건 ${previewContext.activeConditionCount}개${
            previewContext.hasActiveConcentration ? ' · 집중 효과 있음' : ''
          }`
        : activeConditions.length
          ? `${activeConditions.slice(0, 4).join(', ')}${
              activeConditions.length > 4 ? ' 외' : ''
            }${hasActiveConcentration ? ' · 집중 유지/종료 영향 확인 필요' : ''}`
          : '활성 조건 없음',
    },
    {
      label: '장비',
      value: `소지품 ${previewContext?.inventoryItemCount ?? character.inventory.length}개 · 주무기 ${
        equippedWeapon ? params.getItemName(equippedWeapon) : '없음'
      } · 보조 ${offhandWeapon ? params.getItemName(offhandWeapon) : '없음'}`,
    },
    {
      label: '준비 주문',
      value: character.spells
        ? `알고 있는 주문 ${
            previewContext?.knownSpellCount ??
            params.knownSlotSpellCount + params.currentCantripCount
          }개 · 준비 ${params.preparedSpellCount}/${
            params.preparedSpellLimit ?? '제한 없음'
          }개 예정`
        : '주문 없음',
    },
    {
      label: '휴식기 활동',
      value: previewContext
        ? `진행/일시정지 ${previewContext.activeDowntimeTaskCount}개 · 완료 ${previewContext.completedDowntimeTaskCount}개 · 경제 상태 ${
            previewContext.hasEconomyState ? '있음' : '없음'
          }`
        : '세션에 참가하면 휴식기 활동 영향을 확인할 수 있습니다.',
    },
    {
      label: '캠페인 기록 / 이관',
      value: previewContext
        ? `완결 기록 ${previewContext.campaignArchiveAvailable ? '있음' : '없음'} · 이관 ${
            previewContext.transferEligibility === 'transfer_allowed'
              ? '허용'
              : previewContext.transferEligibility === 'transfer_blocked'
                ? '차단'
                : '미보관'
          }`
        : '완료된 캠페인 기록 없음',
    },
  ];
}

export function buildLevelUpFeaturePreviewItems(params: {
  character: PersistentCharacter | null | undefined;
  classInfo: ClassOption | null | undefined;
  classKey: string;
  targetLevel: number;
  subclassChoiceLevel: number | null;
  isSubclassRequired: boolean;
  selectedSubclassName: string | null;
  crossedAsiLevels: number[];
  asiFeatChoices: string[];
  classFeatureManifest: CanonicalClassFeatureEntry[];
}): CharacterFeaturePreviewItem[] {
  const { character } = params;
  if (!character) return [];

  const classItems: CharacterFeaturePreviewItem[] = (params.classInfo?.levelFeatureSummary ?? [])
    .filter(
      (feature) => feature.level > character.level && feature.level <= params.targetLevel
    )
    .flatMap((feature) =>
      splitClassFeatureSummary(feature.features)
        .filter((label) => !isAbilityScoreImprovementLabel(label))
        .map((label, index) =>
          buildClassFeaturePreviewItem({
            classInfo: params.classInfo,
            classKey: params.classKey,
            label,
            level: feature.level,
            index,
            idPrefix: 'level-up.class',
            status: 'automatic',
            summaryFallback: `${feature.level}레벨에 새로 획득하는 직업 특성입니다.`,
            classFeatureManifest: params.classFeatureManifest,
          })
        )
    );

  const subclassItem: CharacterFeaturePreviewItem[] =
    params.isSubclassRequired && !character.subclassName
      ? [
          {
            id: `level-up.choice.${params.classKey}.subclass`,
            label: 'Subclass / 서브클래스',
            source: 'subclass',
            level: params.subclassChoiceLevel ?? params.targetLevel,
            summary: params.selectedSubclassName
              ? `선택한 서브클래스: ${params.selectedSubclassName}`
              : '이번 레벨업에서 서브클래스를 선택해야 합니다.',
            status: params.selectedSubclassName ? 'selected' : 'required',
          },
        ]
      : [];

  const asiItems: CharacterFeaturePreviewItem[] = params.crossedAsiLevels.map(
    (asiLevel, index) => {
      const selectedChoiceId = params.asiFeatChoices[index] ?? '';
      const selectedFeat = selectedChoiceId.startsWith('feat.')
        ? featOptionById.get(selectedChoiceId)
        : null;
      const selectedAsiAbility = getAbilityFromAsiChoiceId(selectedChoiceId);

      return {
        id: `level-up.choice.${params.classKey || 'unknown'}.asi.${asiLevel}`,
        label: selectedFeat
          ? `${asiLevel}레벨 Feat: ${selectedFeat.label}`
          : selectedAsiAbility
            ? `${asiLevel}레벨 ASI: ${abilityDisplayLabels[selectedAsiAbility]} +2`
            : `${asiLevel}레벨 Ability Score Improvement / Feat`,
        source: 'asi',
        level: asiLevel,
        summary: selectedFeat
          ? selectedFeat.summary
          : selectedAsiAbility
            ? `${abilityDisplayLabels[selectedAsiAbility]} 능력치를 2 상승시킵니다.`
            : '능력치 하나를 +2 하거나 Alert / 경계 같은 Feat를 선택해야 합니다.',
        status: selectedFeat || selectedAsiAbility ? 'selected' : 'required',
      };
    }
  );

  return [...classItems, ...subclassItem, ...asiItems];
}
