type CharacterFeatureDisplayInfo = {
  label: string;
  description: string;
  sourceLabel: string;
  tone: 'race' | 'class' | 'subclass' | 'choice' | 'feat' | 'unknown';
};

type CanonicalClassFeatureEntry = {
  id: string;
  nameKo: string;
  category: 'class' | 'subclass' | 'asi' | 'choice' | string;
  summaryKo: string;
  aliases?: string[];
};

type RaceTraitDisplayEntry = {
  name: string;
  summary: string;
  aliases?: string[];
};

const skillLabelMap: Map<string, string> = new Map([
  ['Acrobatics', '곡예'],
  ['Arcana', '비전학'],
  ['Athletics', '운동'],
  ['Deception', '기만'],
  ['Intimidation', '위협'],
  ['History', '역사'],
  ['Insight', '통찰'],
  ['Investigation', '조사'],
  ['Medicine', '의학'],
  ['Nature', '자연'],
  ['Perception', '인지능력'],
  ['Performance', '공연'],
  ['Persuasion', '설득'],
  ['Religion', '종교'],
  ['Sleight of Hand', '손재주'],
  ['Stealth', '은신'],
  ['Survival', '생존'],
  ['Animal Handling', '동물 조련'],
]);

const fightingStyleLabelMap: Record<string, string> = {
  archery: '궁술',
  defense: '방어술',
  dueling: '결투술',
  great_weapon_fighting: '대형 무기 전투술',
  protection: '보호술',
  two_weapon_fighting: '쌍수 전투술',
};

const fightingStyleDescriptionMap: Record<string, string> = {
  archery: '원거리 무기 공격 명중 굴림에 +2 보너스를 받습니다.',
  defense: '갑옷을 착용하고 있을 때 방어도에 +1 보너스를 받습니다.',
  dueling: '한 손 근접 무기 하나만 들고 싸울 때 피해 굴림에 +2 보너스를 받습니다.',
  great_weapon_fighting: '양손 또는 겸용 근접 무기 피해 주사위가 1 또는 2이면 다시 굴릴 수 있습니다.',
  protection: '방패를 들고 있을 때 5ft 이내 아군을 향한 공격에 reaction으로 불리점을 줄 수 있습니다.',
  two_weapon_fighting: '쌍수 보조 공격 피해에도 능력 수정치를 더합니다.',
};

const favoredEnemyLabelMap: Record<string, string> = {
  aberrations: '변이체',
  beasts: '야수',
  celestials: '천상체',
  constructs: '구조체',
  dragons: '용',
  elementals: '정령',
  fey: '요정',
  fiends: '악마',
  giants: '거인',
  monstrosities: '괴수',
  oozes: '점액체',
  plants: '식물',
  undead: '언데드',
  humanoid: '인간형',
};

const favoredHumanoidLabelMap: Record<string, string> = {
  dwarves: '드워프',
  elves: '엘프',
  halflings: '하플링',
  humans: '인간',
  dragonborn: '드래곤본',
  gnomes: '노움',
  'half-elves': '하프엘프',
  'half-orcs': '하프오크',
  tieflings: '티플링',
  gnolls: '놀',
  goblins: '고블린',
  hobgoblins: '홉고블린',
  kobolds: '코볼드',
  lizardfolk: '리자드포크',
  orcs: '오크',
};

const draconicAncestryLabelMap: Record<string, string> = {
  black: '블랙 드래곤',
  blue: '블루 드래곤',
  brass: '브라스 드래곤',
  bronze: '브론즈 드래곤',
  copper: '코퍼 드래곤',
  gold: '골드 드래곤',
  green: '그린 드래곤',
  red: '레드 드래곤',
  silver: '실버 드래곤',
  white: '화이트 드래곤',
};

const abilityLabelMap: Record<string, string> = {
  str: '근력',
  dex: '민첩',
  con: '건강',
  int: '지능',
  wis: '지혜',
  cha: '매력',
};

const featureInfoMap: Record<string, Omit<CharacterFeatureDisplayInfo, 'tone'>> = {
  'feat.alert': {
    label: 'Alert / 경계',
    sourceLabel: 'Feat',
    description: '기습에 대비하고 전투 시작 반응성이 뛰어난 캐릭터를 표현하는 특성입니다.',
  },
  'feature.fighter.fighting_style': {
    label: '전투 방식',
    sourceLabel: '직업 특성',
    description: '선택한 전투 방식에 따라 공격, 방어, 쌍수 전투 등에 보너스를 줍니다.',
  },
  'feature.rogue.expertise': {
    label: '전문화',
    sourceLabel: '직업 특성',
    description: '선택한 숙련 기술의 숙련 보너스를 두 배로 적용합니다.',
  },
  'feature.rogue.sneak_attack': {
    label: '암습',
    sourceLabel: '직업 특성',
    description: '조건을 만족한 무기 공격에 턴당 한 번 추가 피해를 줍니다.',
  },
  'feature.ranger.favored_enemy': {
    label: '주적',
    sourceLabel: '직업 특성',
    description: '선택한 적 유형을 추적하거나 관련 정보를 판정할 때 쓰이는 레인저 특성입니다.',
  },
};

function formatFeatureTokenValue(value: string) {
  const normalized = value.trim();
  return (
    skillLabelMap.get(normalized) ??
    fightingStyleLabelMap[normalized] ??
    favoredEnemyLabelMap[normalized] ??
    favoredHumanoidLabelMap[normalized] ??
    draconicAncestryLabelMap[normalized] ??
    normalized
  );
}

function humanizeFeatureId(featureId: string) {
  const meaningfulPart =
    featureId.split('.feature.').at(-1) ??
    featureId.split('.trait.').at(-1) ??
    featureId.split('.subclass_feature.').at(-1) ??
    featureId;

  return meaningfulPart
    .split(/[._:-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeLooseToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .trim();
}

function getFeatureTone(featureId: string): CharacterFeatureDisplayInfo['tone'] {
  if (featureId.startsWith('feat.')) return 'feat';
  if (featureId.startsWith('asi:')) return 'feat';
  if (featureId.startsWith('race.') || /^race\s+.+\s+trait\s+/i.test(featureId)) return 'race';
  if (featureId.startsWith('subclass.')) return 'subclass';
  if (featureId.includes(':')) return 'choice';
  if (featureId.startsWith('class.') || featureId.startsWith('feature.')) return 'class';
  return 'unknown';
}

function getFeatureSourceLabel(featureId: string) {
  const tone = getFeatureTone(featureId);
  if (tone === 'feat') return 'Feat';
  if (tone === 'race') return '종족 특성';
  if (tone === 'subclass') return '서브클래스 특성';
  if (tone === 'choice') return '선택 특성';
  if (tone === 'class') return '직업 특성';
  return '특성';
}

function getCanonicalClassFeatureDisplayInfo(
  feature: string,
  canonicalClassFeatures: CanonicalClassFeatureEntry[] | undefined
): CharacterFeatureDisplayInfo | null {
  if (!canonicalClassFeatures?.length) {
    return null;
  }

  const normalizedFeature = normalizeLooseToken(feature);
  const canonicalFeature =
    canonicalClassFeatures.find((classFeature) => classFeature.id === feature) ??
    canonicalClassFeatures.find((classFeature) =>
      (classFeature.aliases ?? []).some((alias) => normalizeLooseToken(alias) === normalizedFeature)
    ) ??
    canonicalClassFeatures.find((classFeature) => normalizeLooseToken(classFeature.nameKo) === normalizedFeature);
  if (!canonicalFeature) {
    return null;
  }

  const staticInfo = featureInfoMap[canonicalFeature.id] ?? featureInfoMap[feature];
  const tone = canonicalFeature.category === 'subclass' ? 'subclass' : getFeatureTone(canonicalFeature.id);
  return {
    label: canonicalFeature.nameKo || staticInfo?.label || humanizeFeatureId(canonicalFeature.id),
    sourceLabel:
      canonicalFeature.category === 'subclass'
        ? '서브클래스 특성'
        : staticInfo?.sourceLabel ?? getFeatureSourceLabel(canonicalFeature.id),
    tone,
    description:
      canonicalFeature.summaryKo ||
      staticInfo?.description ||
      'SRD class feature manifest에 등록된 캐릭터 특성입니다.',
  };
}

function extractRaceTraitName(featureId: string) {
  const dotTrait = featureId.split('.trait.').at(-1);
  if (dotTrait && dotTrait !== featureId) return dotTrait;

  const legacyTrait = /^race\s+.+?\s+trait\s+(.+)$/i.exec(featureId);
  if (legacyTrait?.[1]) return legacyTrait[1];

  return null;
}

function findRaceTraitSummary(
  raceTraitName: string,
  raceTraitSummaries: RaceTraitDisplayEntry[] | undefined
) {
  if (!raceTraitSummaries?.length) return null;

  const normalizedTraitName = normalizeLooseToken(raceTraitName);
  return (
    raceTraitSummaries.find((trait) => normalizeLooseToken(trait.name) === normalizedTraitName) ??
    raceTraitSummaries.find((trait) =>
      (trait.aliases ?? []).some((alias) => normalizeLooseToken(alias) === normalizedTraitName)
    ) ??
    raceTraitSummaries.find((trait) => {
      const normalizedNames = [trait.name, ...(trait.aliases ?? [])].map(normalizeLooseToken);
      return normalizedNames.some(
        (normalizedName) =>
          normalizedTraitName.includes(normalizedName) || normalizedName.includes(normalizedTraitName)
      );
    }) ??
    null
  );
}

function getRaceTraitDisplayInfo(
  featureId: string,
  raceTraitSummaries: RaceTraitDisplayEntry[] | undefined
): CharacterFeatureDisplayInfo | null {
  const traitName = extractRaceTraitName(featureId);
  if (!traitName) return null;

  const label = humanizeFeatureId(traitName);
  const matchedTrait = findRaceTraitSummary(label, raceTraitSummaries);
  if (matchedTrait) {
    return {
      label: matchedTrait.name,
      sourceLabel: '종족 특성',
      tone: 'race',
      description: matchedTrait.summary,
    };
  }

  const normalizedTraitName = normalizeLooseToken(label);
  if (normalizedTraitName === 'base traits') {
    const summary = raceTraitSummaries?.length
      ? raceTraitSummaries
          .slice(0, 4)
          .map((trait) => `${trait.name}: ${trait.summary}`)
          .join(' · ')
      : '선택한 종족에서 자동으로 얻는 기본 특성입니다.';

    return {
      label: '종족 기본 특성',
      sourceLabel: '종족 특성',
      tone: 'race',
      description: summary,
    };
  }

  return {
    label,
    sourceLabel: '종족 특성',
    tone: 'race',
    description: '선택한 종족에서 자동으로 얻거나 선택한 종족 특성입니다.',
  };
}

export function getCharacterFeatureDisplayInfo(
  feature: string,
  canonicalClassFeatures?: CanonicalClassFeatureEntry[],
  raceTraitSummaries?: RaceTraitDisplayEntry[]
): CharacterFeatureDisplayInfo {
  const normalized = feature.trim();
  const canonicalInfo = getCanonicalClassFeatureDisplayInfo(normalized, canonicalClassFeatures);
  if (canonicalInfo) {
    return canonicalInfo;
  }

  const raceInfo = getRaceTraitDisplayInfo(normalized, raceTraitSummaries);
  if (raceInfo) {
    return raceInfo;
  }

  const staticInfo = featureInfoMap[normalized];
  if (staticInfo) {
    return {
      ...staticInfo,
      tone: getFeatureTone(normalized),
    };
  }

  if (normalized.startsWith('expertise:')) {
    const skill = formatFeatureTokenValue(normalized.slice('expertise:'.length));
    return {
      label: `전문화: ${skill}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: `${skill} 판정에 숙련 보너스를 두 배로 적용합니다.`,
    };
  }

  if (normalized.startsWith('fighting_style:')) {
    const style = normalized.slice('fighting_style:'.length);
    const label = fightingStyleLabelMap[style] ?? style;
    return {
      label: `전투 방식: ${label}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: fightingStyleDescriptionMap[style] ?? `${label} 전투 방식이 적용됩니다.`,
    };
  }

  if (normalized.startsWith('favored_enemy:')) {
    const enemy = formatFeatureTokenValue(normalized.slice('favored_enemy:'.length));
    return {
      label: `주적: ${enemy}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: `${enemy} 유형의 적에 대한 추적, 지식, 단서 판정에 쓰이는 레인저 특성입니다.`,
    };
  }

  if (normalized.startsWith('favored_enemy_humanoid:')) {
    const race = formatFeatureTokenValue(normalized.slice('favored_enemy_humanoid:'.length));
    return {
      label: `주적 인간형: ${race}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: `주적 인간형 선택에 포함된 ${race}입니다.`,
    };
  }

  if (normalized.startsWith('draconic_ancestry:')) {
    const ancestry = formatFeatureTokenValue(normalized.slice('draconic_ancestry:'.length));
    return {
      label: `드래곤 선조: ${ancestry}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: `${ancestry} 혈통에 따른 피해 유형과 저항을 표현하는 드래곤본 특성입니다.`,
    };
  }

  if (normalized.startsWith('asi:')) {
    const ability = normalized.slice('asi:'.length);
    const label = abilityLabelMap[ability] ?? ability;
    return {
      label: `ASI: ${label} +2`,
      sourceLabel: 'ASI/Feat',
      tone: 'feat',
      description: `${label} 능력치를 2점 올리는 능력치 상승 선택입니다. 같은 ASI 지점에서 Feat 대신 선택합니다.`,
    };
  }

  return {
    label: humanizeFeatureId(normalized),
    sourceLabel: getFeatureSourceLabel(normalized),
    tone: getFeatureTone(normalized),
    description: '자동 획득했거나 선택한 캐릭터 특성입니다.',
  };
}

export function summarizeCharacterFeatures(
  features: string[] | null | undefined,
  limit = 4,
  canonicalClassFeatures?: CanonicalClassFeatureEntry[],
  raceTraitSummaries?: RaceTraitDisplayEntry[]
) {
  return (features ?? [])
    .filter((feature) => feature.trim().length > 0)
    .map((feature) =>
      getCharacterFeatureDisplayInfo(feature, canonicalClassFeatures, raceTraitSummaries)
    )
    .slice(0, Math.max(0, limit));
}
