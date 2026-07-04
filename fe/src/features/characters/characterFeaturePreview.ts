import { normalizeSrdCharacterClassKey } from '@trpg/srd-data/rules';
import type {
  CanonicalClassFeatureEntry,
  ClassFeatureReference,
  ClassOption,
  RaceData,
} from '../../services/staticSrd';
import { abilityDisplayLabels, normalizeLevel } from './characterBuildRules';
import {
  buildChoiceFeaturePreviewItems,
  featOptionById,
  getAbilityFromAsiChoiceId,
  getCreationAsiLevels,
  getSelectedAsiFeatChoiceIds,
} from './characterFeatureChoices';
import { getCharacterFeatureDisplayInfo } from './characterFeaturePresentation';

export type CharacterFeaturePreviewSource = 'race' | 'class' | 'subclass' | 'choice' | 'asi';

export type CharacterFeaturePreviewItem = {
  id: string;
  label: string;
  source: CharacterFeaturePreviewSource;
  summary: string;
  level?: number | null;
  status: 'automatic' | 'required' | 'selected' | 'pending';
};

export type CharacterFeatureTimelineGroup = {
  level: number;
  items: CharacterFeaturePreviewItem[];
};

export const featureSourceLabels: Record<CharacterFeaturePreviewSource, string> = {
  race: '종족',
  class: '직업',
  subclass: '서브클래스',
  choice: '선택',
  asi: 'ASI/Feat',
};

export const featureStatusLabels: Record<CharacterFeaturePreviewItem['status'], string> = {
  automatic: '자동 획득',
  required: '선택 필요',
  selected: '선택 완료',
  pending: '대기',
};

const featureStatusSortOrder: Record<CharacterFeaturePreviewItem['status'], number> = {
  required: 0,
  selected: 1,
  pending: 2,
  automatic: 3,
};

export function splitClassFeatureSummary(summary: string): string[] {
  return summary
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeFeatureLookupLabel(label: string) {
  return label
    .trim()
    .replace(/\s+d\d+$/i, '')
    .replace(/\s+\d+회$/i, '')
    .replace(/\s+\d+\/휴식$/i, '')
    .replace(/\s+CR\s*[\d/]+$/i, '')
    .replace(/\s+/g, ' ');
}

function normalizeFeatureAliasKey(label: string) {
  return normalizeFeatureLookupLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isAbilityScoreImprovementLabel(label: string) {
  const normalizedLabel = normalizeFeatureLookupLabel(label).toLowerCase();
  return (
    normalizedLabel === '능력치 향상' ||
    normalizedLabel === 'ability score improvement' ||
    normalizedLabel === 'asi'
  );
}

function findCanonicalClassFeature(
  classFeatureManifest: CanonicalClassFeatureEntry[],
  classKey: string,
  label: string,
  level: number
): CanonicalClassFeatureEntry | null {
  const normalizedLabel = normalizeFeatureLookupLabel(label);
  const aliasKey = normalizeFeatureAliasKey(label);
  const levelCandidates = classFeatureManifest.filter(
    (feature) =>
      feature.classKey === classKey &&
      (feature.level === level ||
        feature.availableAtLevels.includes(level) ||
        feature.availableAtLevels.length === 0)
  );
  const candidates = levelCandidates.length
    ? levelCandidates
    : classFeatureManifest.filter((feature) => feature.classKey === classKey);

  return (
    candidates.find((feature) => feature.aliases.includes(aliasKey)) ??
    candidates.find((feature) => normalizeFeatureLookupLabel(feature.nameKo) === normalizedLabel) ??
    candidates.find((feature) => normalizedLabel.startsWith(normalizeFeatureLookupLabel(feature.nameKo))) ??
    candidates.find((feature) => normalizeFeatureLookupLabel(feature.nameKo).startsWith(normalizedLabel)) ??
    null
  );
}

function inferClassFeatureDisplayId(
  classKey: string,
  label: string,
  level: number,
  classFeatureManifest: CanonicalClassFeatureEntry[]
) {
  if (isAbilityScoreImprovementLabel(label)) {
    return `class.${classKey || 'unknown'}.feature.ability_score_improvement`;
  }

  const canonicalFeature = findCanonicalClassFeature(classFeatureManifest, classKey, label, level);
  if (canonicalFeature) return canonicalFeature.id;

  return null;
}

function findClassFeatureReference(
  classInfo: ClassOption | null | undefined,
  label: string,
  level: number
): ClassFeatureReference | null {
  if (!classInfo) return null;
  const normalizedLabel = normalizeFeatureLookupLabel(label);
  const references = classInfo.featureReferences ?? [];
  const levelMatches = references.filter(
    (reference) =>
      reference.availableAtLevels.length === 0 || reference.availableAtLevels.includes(level)
  );
  const candidates = levelMatches.length ? levelMatches : references;
  return (
    candidates.find((reference) => normalizeFeatureLookupLabel(reference.nameKo) === normalizedLabel) ??
    candidates.find((reference) => normalizedLabel.startsWith(normalizeFeatureLookupLabel(reference.nameKo))) ??
    candidates.find((reference) => normalizeFeatureLookupLabel(reference.nameKo).startsWith(normalizedLabel)) ??
    null
  );
}

function buildSpellcastingFeatureDescription(classInfo: ClassOption | null | undefined) {
  if (!classInfo?.spellcastingSummary.length) return null;
  return classInfo.spellcastingSummary.join(' ');
}

export function buildClassFeaturePreviewItem(params: {
  classInfo: ClassOption | null | undefined;
  classKey: string;
  label: string;
  level: number;
  index: number;
  idPrefix: string;
  status: CharacterFeaturePreviewItem['status'];
  summaryFallback: string;
  classFeatureManifest: CanonicalClassFeatureEntry[];
}): CharacterFeaturePreviewItem {
  const canonicalFeature = findCanonicalClassFeature(
    params.classFeatureManifest,
    params.classKey,
    params.label,
    params.level
  );
  const reference = findClassFeatureReference(params.classInfo, params.label, params.level);
  const isSpellcastingLabel =
    params.label === '주문시전' || params.label === '계약 마법' || params.label === 'Pact Magic';
  const inferredDisplayId = inferClassFeatureDisplayId(
    params.classKey,
    params.label,
    params.level,
    params.classFeatureManifest
  );
  const displayInfo = getCharacterFeatureDisplayInfo(
    canonicalFeature?.id ?? reference?.id ?? inferredDisplayId ?? ''
  );
  const spellcastingDescription = isSpellcastingLabel
    ? buildSpellcastingFeatureDescription(params.classInfo)
    : null;

  return {
    id:
      canonicalFeature?.id ??
      reference?.id ??
      inferredDisplayId ??
      `${params.idPrefix}.${params.classKey || 'unknown'}.${params.level}.${params.index}`,
    label: canonicalFeature?.nameKo ?? reference?.nameKo ?? displayInfo?.label ?? params.label,
    source:
      canonicalFeature?.category === 'subclass' || reference?.category === 'subclass'
        ? 'subclass'
        : 'class',
    level: params.level,
    summary:
      canonicalFeature?.summaryKo ||
      reference?.summaryKo ||
      spellcastingDescription ||
      displayInfo?.description ||
      params.summaryFallback,
    status: params.status,
  };
}

export function groupFeaturePreviewItemsByLevel(
  items: CharacterFeaturePreviewItem[]
): CharacterFeatureTimelineGroup[] {
  const groups = new Map<number, CharacterFeaturePreviewItem[]>();
  for (const item of items) {
    const level = item.level && item.level > 0 ? item.level : 1;
    groups.set(level, [...(groups.get(level) ?? []), item]);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .map(([level, groupedItems]) => ({
      level,
      items: [...groupedItems].sort((left, right) => {
        const statusDiff = featureStatusSortOrder[left.status] - featureStatusSortOrder[right.status];
        if (statusDiff !== 0) return statusDiff;
        return left.label.localeCompare(right.label, 'ko');
      }),
    }));
}

export function countFeaturePreviewStatuses(items: CharacterFeaturePreviewItem[]) {
  return items.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status] += 1;
      return acc;
    },
    {
      total: 0,
      automatic: 0,
      required: 0,
      selected: 0,
      pending: 0,
    } as Record<CharacterFeaturePreviewItem['status'] | 'total', number>
  );
}

export function buildCreateFeaturePreviewItems(params: {
  ancestryKey: string;
  className: string;
  level: number | null | undefined;
  features: string[] | undefined;
  proficientSkills: string[] | undefined;
  subclassRequired: boolean;
  subclassName: string | null | undefined;
  raceInfo: RaceData | null | undefined;
  classInfo: ClassOption | null | undefined;
  classFeatureManifest: CanonicalClassFeatureEntry[];
}): CharacterFeaturePreviewItem[] {
  const classKey = normalizeSrdCharacterClassKey(params.className);
  const level = normalizeLevel(params.level ?? 1);
  const raceItems: CharacterFeaturePreviewItem[] = (
    params.raceInfo?.traitSummaries ?? []
  ).map((trait) => ({
    id: `race.${params.ancestryKey || 'unknown'}.trait.${trait.name}`,
    label: trait.name,
    source: 'race',
    summary: trait.summary,
    status: 'automatic',
  }));
  const classItems: CharacterFeaturePreviewItem[] = (
    params.classInfo?.levelFeatureSummary ?? []
  )
    .filter((feature) => feature.level > 0 && feature.level <= level)
    .flatMap((feature) =>
      splitClassFeatureSummary(feature.features)
        .filter((label) => !isAbilityScoreImprovementLabel(label))
        .map((label, index) =>
          buildClassFeaturePreviewItem({
            classInfo: params.classInfo,
            classKey,
            label,
            level: feature.level,
            index,
            idPrefix: 'class',
            status: 'automatic',
            summaryFallback: `${feature.level}레벨에 획득하는 직업 특성입니다.`,
            classFeatureManifest: params.classFeatureManifest,
          })
        )
    );
  const choiceItems = buildChoiceFeaturePreviewItems({
    ancestryKey: params.ancestryKey,
    classKey,
    level,
    features: params.features ?? [],
    proficientSkills: params.proficientSkills ?? [],
    subclassRequired: params.subclassRequired,
    subclassName: params.subclassName,
  });
  const selectedAsiFeatChoiceIds = getSelectedAsiFeatChoiceIds(params.features);
  const asiItems: CharacterFeaturePreviewItem[] = getCreationAsiLevels(classKey, level).map(
    (asiLevel, index) => {
      const selectedChoiceId = selectedAsiFeatChoiceIds[index];
      const selectedFeat = selectedChoiceId?.startsWith('feat.')
        ? featOptionById.get(selectedChoiceId)
        : null;
      const selectedAsiAbility = selectedChoiceId
        ? getAbilityFromAsiChoiceId(selectedChoiceId)
        : null;

      return {
        id: `choice.${classKey || 'unknown'}.asi.${asiLevel}`,
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

  return [...raceItems, ...classItems, ...choiceItems, ...asiItems];
}
