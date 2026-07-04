import { useMemo } from 'react';
import {
  getAbilitySummary,
  summarizeCharacterFeatures,
} from '../../characters/characterFeaturePresentation';

type RecruitingCharacterSummarySource = {
  abilities: Parameters<typeof getAbilitySummary>[0]['abilities'];
  features?: string[] | null;
} | null | undefined;

type UseRecruitingCharacterSummaryParams = {
  character: RecruitingCharacterSummarySource;
  classFeatureManifest: Parameters<typeof summarizeCharacterFeatures>[2];
};

export function useRecruitingCharacterSummary(
  params: UseRecruitingCharacterSummaryParams,
) {
  const { character, classFeatureManifest } = params;

  const selectedCharacterAbilitySummary = useMemo(
    () => (character ? getAbilitySummary(character) : []),
    [character],
  );

  const wantedCarouselFeatureSummary = useMemo(
    () => summarizeCharacterFeatures(character?.features, 5, classFeatureManifest),
    [classFeatureManifest, character?.features],
  );

  return {
    selectedCharacterAbilitySummary,
    wantedCarouselFeatureSummary,
  };
}
