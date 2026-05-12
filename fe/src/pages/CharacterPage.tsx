/*
 * CharacterPage
 * 역할: 플레이어 캐릭터 목록, 상세 정보, 생성/수정/삭제 모달을 관리하는 페이지입니다.
 * 읽는 순서:
 * 1) 상단 상수/헬퍼: D&D풍 캐릭터 기본값, 능력치 계산, 직업/종족/초상화 매핑
 * 2) CharacterPageProps: 부모가 넘기는 캐릭터 데이터와 생성/수정/삭제 콜백
 * 3) 컴포넌트 state: 선택 캐릭터, 모달 열림 여부, 생성/수정 폼 값
 * 4) handler 함수: 모달 열기/닫기, 폼 제출, 능력치/스킬/인벤토리 수정
 * 5) JSX: 좌측 메뉴, 캐릭터 카드 그리드, 선택 캐릭터 상세, 생성/삭제 모달
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import defaultArcherImage from '../assets/images/Profile_Default_Archer.webp';
import defaultRogueImage from '../assets/images/Profile_Default_Rouge.webp';
import defaultWarriorImage from '../assets/images/Profile_Default_Warrior.webp';
import defaultWizardImage from '../assets/images/Profile_Default_Wizard.webp';
import parchmentScrollImage from '../assets/images/parchment_scroll.webp';
import boxBulletinNarrowFrame from '../components/Box_Bulletin_Narrow_Frame.webp';
import boxBulletinNarrowPlanks from '../components/Box_Bulletin_Narrow_Planks.webp';
import profileBorderCharacter from '../components/Profile_Border_Character.webp';
import profileBorderStats from '../components/Profile_Border_Stats.webp';
import sidePanelImage from '../components/Side_Panel.webp';
import {
  getClassLabel,
  loadClassOptions,
  loadRaceData,
  normalizeClassValue,
  type ClassOption,
  type ClassOptionValue,
  type RaceAbilityBonus,
  type RaceData,
} from '../services/staticSrd';
import type { CharacterPayload } from '../hooks/useSession';
import type { PersistentCharacter, Scenario, SessionSnapshot, StoredUser } from '../types/session';
import type { ClassDefinitionResponseDto, ItemResponseDto, RaceResponseDto } from '@trpg/shared-types';
import { listItems } from '../services/api';
import './CharacterPage.css';

// shared-types(CJS) value import 가 rollup 추적 실패 케이스라(메모) inline 동일값.
const POINT_BUY_TOTAL = 27;
const POINT_BUY_MIN_BASE = 8;
const POINT_BUY_MAX_BASE = 15;
const POINT_BUY_COST: Readonly<Record<number, number>> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

// 부모 컴포넌트가 이 페이지에 주입하는 데이터와 이벤트 콜백입니다.
interface CharacterPageProps {
  user: StoredUser;
  characters: PersistentCharacter[];
  scenarios: Scenario[];
  races: RaceResponseDto[];
  classDefinitions: ClassDefinitionResponseDto[];
  snapshot: SessionSnapshot | null;
  busy: boolean;
  error: string | null;
  onCreateCharacter: (payload: CharacterPayload) => void | Promise<void>;
  onCloneCharacter: (characterId: string) => void | Promise<void>;
  onUpdateCharacter: (characterId: string, payload: CharacterPayload) => void | Promise<void>;
  onDeleteCharacter: (characterId: string) => void | Promise<void>;
}

type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
type ScalingAbilityKey = 'str' | 'dex' | 'int';

interface InventoryDraftItem {
  id: string;
  name: string;
  quantity: number;
}

interface ClassStatProfile {
  base: {
    maxHp: number;
    armorClass: number;
    speed: number;
    abilities: Record<ScalingAbilityKey, number>;
  };
  growth: {
    maxHp: number;
    armorClass: number;
    abilities: Record<ScalingAbilityKey, number>;
  };
}

type ClassName = ClassOptionValue;

const defaultAncestry = 'Human';

// 직업별 기본 초상화 프리셋입니다. 사용자가 이미지를 올리기 전 기본 이미지로 씁니다.
const avatarPresets = [
  { id: 'preset_wizard', label: '위자드', image: defaultWizardImage },
  { id: 'preset_archer', label: '레인저', image: defaultArcherImage },
  { id: 'preset_rogue', label: '로그', image: defaultRogueImage },
  { id: 'preset_warrior', label: '파이터', image: defaultWarriorImage },
] as const;

// 직업별 추천 HP/AC/공격 보너스/능력치 성장 기준입니다.
const classStatProfiles: Record<ClassName, ClassStatProfile> = {
  Fighter: {
    base: {
      maxHp: 20,
      armorClass: 20,
      speed: 28,
      abilities: {
        str: 14,
        dex: 10,
        int: 8,
      },
    },
    growth: {
      maxHp: 2,
      armorClass: 0.5,
      abilities: {
        str: 0.5,
        dex: 0,
        int: 0,
      },
    },
  },
  Ranger: {
    base: {
      maxHp: 16,
      armorClass: 16,
      speed: 32,
      abilities: {
        str: 10,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 1.5,
      armorClass: 0.35,
      abilities: {
        str: 0,
        dex: 0.5,
        int: 0,
      },
    },
  },
  Rogue: {
    base: {
      maxHp: 14,
      armorClass: 14,
      speed: 36,
      abilities: {
        str: 9,
        dex: 15,
        int: 11,
      },
    },
    growth: {
      maxHp: 1.2,
      armorClass: 0.25,
      abilities: {
        str: 0,
        dex: 0.4,
        int: 0.2,
      },
    },
  },
  Wizard: {
    base: {
      maxHp: 12,
      armorClass: 10,
      speed: 30,
      abilities: {
        str: 8,
        dex: 10,
        int: 15,
      },
    },
    growth: {
      maxHp: 1,
      armorClass: 0.1,
      abilities: {
        str: 0,
        dex: 0,
        int: 0.5,
      },
    },
  },
};

const abilityDisplayLabels: Record<AbilityKey, string> = {
  str: '근력',
  dex: '민첩',
  con: '건강',
  int: '지능',
  wis: '지혜',
  cha: '매력',
};

const suggestedSkillOptions = [
  { value: 'Acrobatics', label: '곡예' },
  { value: 'Arcana', label: '비전학' },
  { value: 'Athletics', label: '운동' },
  { value: 'History', label: '역사' },
  { value: 'Insight', label: '통찰' },
  { value: 'Investigation', label: '조사' },
  { value: 'Perception', label: '인지능력' },
  { value: 'Persuasion', label: '설득' },
  { value: 'Stealth', label: '은신' },
  { value: 'Survival', label: '생존' },
] as const;
const skillLabelMap: Map<string, string> = new Map(
  suggestedSkillOptions.map((option) => [option.value, option.label])
);
const presetIdByClassName: Map<string, string> = new Map([
  ['Wizard', 'preset_wizard'],
  ['Ranger', 'preset_archer'],
  ['Rogue', 'preset_rogue'],
  ['Fighter', 'preset_warrior'],
  ['Archer', 'preset_archer'],
  ['Warrior', 'preset_warrior'],
]);
const classNameByPresetId: Map<string, string> = new Map([
  ['preset_wizard', 'Wizard'],
  ['preset_archer', 'Ranger'],
  ['preset_rogue', 'Rogue'],
  ['preset_warrior', 'Fighter'],
]);

// D&D식 능력치 보정치 계산 함수입니다. 예: 14 -> +2, 8 -> -1.
function calcModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function formatModifier(score: number) {
  const modifier = calcModifier(score);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

function getAbilityModifierTooltip(ability: AbilityKey, score: number) {
  const label = abilityDisplayLabels[ability];
  const modifier = formatModifier(score);
  return `실제 ${label} 관련 액션을 할 때 ${modifier} 값만큼 보정됩니다.`;
}

function roundStat(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeComputedStat(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeIntegerValue(value: number, min = 0) {
  return Math.max(min, Math.round(Number(value) || 0));
}

function formatStat(value: number) {
  return Number.isInteger(value) ? `${value}` : `${roundStat(value).toFixed(1)}`;
}

function normalizeLevel(value: number) {
  return Math.max(1, Number(value) || 1);
}

function getProficiencyBonusForLevel(level: number) {
  const normalizedLevel = normalizeLevel(level);
  if (normalizedLevel >= 17) return 6;
  if (normalizedLevel >= 13) return 5;
  if (normalizedLevel >= 9) return 4;
  if (normalizedLevel >= 5) return 3;
  return 2;
}

function getClassStatProfile(className: string): ClassStatProfile {
  return classStatProfiles[normalizeClassValue(className)];
}

// 직업과 레벨을 기준으로 HP/AC/공격 보너스/피해 보너스 추천값을 계산합니다.
function getRecommendedStats(className: string, level: number) {
  const normalizedLevel = normalizeLevel(level);
  const profile = getClassStatProfile(className);
  const growthSteps = normalizedLevel - 1;

  return {
    maxHp: normalizeIntegerValue(
      normalizeComputedStat(profile.base.maxHp + profile.growth.maxHp * growthSteps),
      1
    ),
    armorClass: normalizeIntegerValue(
      normalizeComputedStat(profile.base.armorClass + profile.growth.armorClass * growthSteps),
      1
    ),
    speed: normalizeIntegerValue(profile.base.speed, 0),
    proficiencyBonus: getProficiencyBonusForLevel(normalizedLevel),
  };
}

function getRecommendedAbilities(
  className: string,
  level: number,
  currentAbilities?: CharacterPayload['abilities']
) {
  const normalizedLevel = normalizeLevel(level);
  const profile = getClassStatProfile(className);
  const growthSteps = normalizedLevel - 1;

  return {
    str: normalizeIntegerValue(
      normalizeComputedStat(
        profile.base.abilities.str + profile.growth.abilities.str * growthSteps
      ),
      1
    ),
    dex: normalizeIntegerValue(
      normalizeComputedStat(
        profile.base.abilities.dex + profile.growth.abilities.dex * growthSteps
      ),
      1
    ),
    con: normalizeIntegerValue(currentAbilities?.con ?? 10, 1),
    int: normalizeIntegerValue(
      normalizeComputedStat(
        profile.base.abilities.int + profile.growth.abilities.int * growthSteps
      ),
      1
    ),
    wis: normalizeIntegerValue(currentAbilities?.wis ?? 10, 1),
    cha: normalizeIntegerValue(currentAbilities?.cha ?? 10, 1),
  };
}

function applyLevelDeltaStats(
  current: Pick<CharacterPayload, 'className' | 'maxHp' | 'armorClass' | 'proficiencyBonus'>,
  levelDelta: number,
  nextLevel: number
) {
  const profile = getClassStatProfile(current.className);

  return {
    maxHp: normalizeIntegerValue(
      normalizeComputedStat(
        (current.maxHp ?? profile.base.maxHp) + profile.growth.maxHp * levelDelta
      ),
      1
    ),
    armorClass: normalizeIntegerValue(
      normalizeComputedStat(
        (current.armorClass ?? profile.base.armorClass) + profile.growth.armorClass * levelDelta
      ),
      1
    ),
    proficiencyBonus: getProficiencyBonusForLevel(nextLevel),
  };
}

function applyLevelDeltaAbilities(
  current: Pick<CharacterPayload, 'className' | 'abilities'>,
  levelDelta: number
) {
  const profile = getClassStatProfile(current.className);
  const abilities = current.abilities ?? {
    str: profile.base.abilities.str,
    dex: profile.base.abilities.dex,
    con: 10,
    int: profile.base.abilities.int,
    wis: 10,
    cha: 10,
  };

  return {
    ...abilities,
    str: normalizeIntegerValue(
      normalizeComputedStat(abilities.str + profile.growth.abilities.str * levelDelta),
      1
    ),
    dex: normalizeIntegerValue(
      normalizeComputedStat(abilities.dex + profile.growth.abilities.dex * levelDelta),
      1
    ),
    int: normalizeIntegerValue(
      normalizeComputedStat(abilities.int + profile.growth.abilities.int * levelDelta),
      1
    ),
    con: normalizeIntegerValue(abilities.con, 1),
    wis: normalizeIntegerValue(abilities.wis, 1),
    cha: normalizeIntegerValue(abilities.cha, 1),
  };
}

// 새 캐릭터 모달을 열 때 사용할 기본 캐릭터 payload를 생성합니다.
function createDefaultCharacter(): CharacterPayload {
  const defaultClassName: ClassName = 'Wizard';
  const recommendedStats = getRecommendedStats(defaultClassName, 1);

  // Point Buy 출발 상태: 모든 base = 8 (cost 0). 사용자가 +로 27포인트 채움.
  // ancestry 가 빈 값(=종족 미선택)이므로 race bonus 없음.
  const baseEightAbilities = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };

  return {
    name: '',
    ancestry: '',
    className: defaultClassName,
    avatarType: 'PRESET',
    avatarPresetId: 'preset_wizard',
    avatarUrl: null,
    scenarioId: null,
    level: 1,
    abilities: baseEightAbilities,
    proficiencyBonus: recommendedStats.proficiencyBonus,
    proficientSkills: [],
    maxHp: recommendedStats.maxHp,
    armorClass: recommendedStats.armorClass,
    speed: recommendedStats.speed,
    inventory: [],
  };
}

// 직업명 문자열을 보고 어울리는 기본 캐릭터 이미지를 고릅니다.
function getCharacterArt(className: string) {
  const normalized = className.toLowerCase();
  if (
    normalized.includes('wizard') ||
    normalized.includes('mage') ||
    normalized.includes('sorcer')
  ) {
    return defaultWizardImage;
  }
  if (
    normalized.includes('archer') ||
    normalized.includes('ranger') ||
    normalized.includes('bow')
  ) {
    return defaultArcherImage;
  }
  if (
    normalized.includes('rogue') ||
    normalized.includes('rouge') ||
    normalized.includes('thief')
  ) {
    return defaultRogueImage;
  }
  if (
    normalized.includes('fighter') ||
    normalized.includes('warrior') ||
    normalized.includes('knight')
  ) {
    return defaultWarriorImage;
  }
  return defaultWizardImage;
}

function getAvatarPresetImage(avatarPresetId?: string | null) {
  return avatarPresets.find((preset) => preset.id === avatarPresetId)?.image ?? null;
}

function getCharacterImage(character: Pick<PersistentCharacter, 'avatarPresetId' | 'className'>) {
  return getAvatarPresetImage(character.avatarPresetId) ?? getCharacterArt(character.className);
}

function getCharacterClassLabel(className: string) {
  const normalized = className.trim();
  return getClassLabel(normalized || '모험가');
}

function getCharacterAncestryLabel(ancestry: string, ancestryLabelMap: Map<string, string>) {
  const normalized = ancestry.trim();
  return ancestryLabelMap.get(normalized) ?? (normalized || '미정');
}

function getSkillLabel(skill: string) {
  const normalized = skill.trim();
  return skillLabelMap.get(normalized) ?? normalized;
}

function getPresetIdForClassName(className: string) {
  return presetIdByClassName.get(className) ?? 'preset_wizard';
}

function getClassNameForPresetId(presetId: string) {
  return classNameByPresetId.get(presetId) ?? 'Wizard';
}

function getRaceByValue(raceCatalog: RaceData[], value: string): RaceData | null {
  return raceCatalog.find((option) => option.value === value) ?? null;
}

function getClassOptionByValue(classCatalog: ClassOption[], value: string): ClassOption | null {
  const normalized = normalizeClassValue(value);
  return classCatalog.find((option) => option.value === normalized) ?? null;
}

function formatAbilityBonus(abilityBonus: RaceAbilityBonus) {
  if (abilityBonus.ability === 'any') {
    return `자유 능력치 +${abilityBonus.amount}${abilityBonus.note ? ` (${abilityBonus.note})` : ''}`;
  }

  const abilityLabel = abilityDisplayLabels[abilityBonus.ability];
  return `${abilityLabel} +${abilityBonus.amount}${abilityBonus.note ? ` (${abilityBonus.note})` : ''}`;
}

function localizeAbilityText(value: string) {
  return value
    .replace(/Strength/g, '근력')
    .replace(/Dexterity/g, '민첩')
    .replace(/Constitution/g, '건강')
    .replace(/Intelligence/g, '지능')
    .replace(/Wisdom/g, '지혜')
    .replace(/Charisma/g, '매력');
}

// 페이지 컴포넌트 본체입니다. 위에서 상태/이벤트를 만들고 아래 JSX에서 화면을 그립니다.
export function CharacterPage({
  characters,
  scenarios,
  races,
  classDefinitions,
  snapshot,
  busy,
  error,
  onCreateCharacter,
  onCloneCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
}: CharacterPageProps) {
  // 모달/선택/폼 상태입니다. 생성과 수정 모달이 같은 formState를 공유합니다.
  const [classCatalog, setClassCatalog] = useState<ClassOption[]>([]);
  const [raceCatalog, setRaceCatalog] = useState<RaceData[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState('');
  const [inventoryDraft, setInventoryDraft] = useState<InventoryDraftItem[]>([]);
  const [formState, setFormState] = useState<CharacterPayload>(() => createDefaultCharacter());
  const [itemCatalog, setItemCatalog] = useState<ItemResponseDto[]>([]);
  // 인벤토리 편집 영역 DOM 참조입니다. 필요 시 스크롤/포커스 제어에 씁니다.
  const inventoryEditorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listItems()
      .then(setItemCatalog)
      .catch(() => undefined);
  }, []);

  const itemKoNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of itemCatalog) {
      map.set(item.key, item.koName);
    }
    return map;
  }, [itemCatalog]);

  // className → ClassDefinition(시드) 룩업. 매칭되면 시작 장비 강제.
  const selectedClass = useMemo<ClassDefinitionResponseDto | null>(() => {
    const className = (formState.className ?? '').trim().toLowerCase();
    if (!className) return null;
    return classDefinitions.find((c) => c.key === className) ?? null;
  }, [formState.className, classDefinitions]);

  // ancestry → race(시드)룩업. ancestry 가 race.key 또는 race.koName 와 매칭되면 보정 적용.
  const selectedRace = useMemo<RaceResponseDto | null>(() => {
    const ancestry = (formState.ancestry ?? '').trim();
    if (!ancestry) return null;
    const lower = ancestry.toLowerCase();
    return (
      races.find((r) => r.key === lower) ??
      races.find((r) => r.koName === ancestry) ??
      null
    );
  }, [formState.ancestry, races]);

  // Point Buy 계산 결과(base/cost/총비용/남은 포인트). selectedRace 없으면 검증 비활성화.
  const pointBuyState = useMemo(() => {
    const finals = formState.abilities ?? {
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    };
    const increases = selectedRace?.abilityIncreases ?? {
      str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0,
    };
    const bases = {
      str: finals.str - increases.str,
      dex: finals.dex - increases.dex,
      con: finals.con - increases.con,
      int: finals.int - increases.int,
      wis: finals.wis - increases.wis,
      cha: finals.cha - increases.cha,
    };
    const costs = {
      str: POINT_BUY_COST[bases.str] ?? null,
      dex: POINT_BUY_COST[bases.dex] ?? null,
      con: POINT_BUY_COST[bases.con] ?? null,
      int: POINT_BUY_COST[bases.int] ?? null,
      wis: POINT_BUY_COST[bases.wis] ?? null,
      cha: POINT_BUY_COST[bases.cha] ?? null,
    };
    const totalCost = (Object.values(costs) as Array<number | null>).reduce<number>(
      (sum, c) => sum + (c ?? 0),
      0,
    );
    const hasInvalid = Object.values(costs).some((c) => c === null);
    return {
      bases,
      costs,
      totalCost,
      remaining: POINT_BUY_TOTAL - totalCost,
      isValid: !hasInvalid && totalCost === POINT_BUY_TOTAL,
      enforced: Boolean(selectedRace),
    };
  }, [formState.abilities, selectedRace]);

  // 레벨별 자동 계산: 시드된 클래스일 때 proficiencyBonus/maxHp 강제. BE와 동일 공식.
  const derivedLevelStats = useMemo(() => {
    if (!selectedClass) return null;
    const hdMaxAvg: Record<string, { max: number; avg: number }> = {
      d6: { max: 6, avg: 4 },
      d8: { max: 8, avg: 5 },
      d10: { max: 10, avg: 6 },
      d12: { max: 12, avg: 7 },
    };
    const hd = hdMaxAvg[selectedClass.hitDie];
    if (!hd) return null;
    const level = formState.level ?? 1;
    const con = formState.abilities?.con ?? 10;
    const conMod = Math.floor((con - 10) / 2);
    const proficiencyBonus = Math.floor((level - 1) / 4) + 2;
    const maxHp = hd.max + conMod + (level - 1) * (hd.avg + conMod);
    return { proficiencyBonus, maxHp };
  }, [selectedClass, formState.level, formState.abilities?.con]);

  // derivedLevelStats 가 바뀌면 formState 의 prof/maxHp 동기화 (사용자가 못 바꾸는 값).
  useEffect(() => {
    if (!derivedLevelStats) return;
    setFormState((current) => {
      if (
        current.proficiencyBonus === derivedLevelStats.proficiencyBonus &&
        current.maxHp === derivedLevelStats.maxHp
      ) {
        return current;
      }
      return {
        ...current,
        proficiencyBonus: derivedLevelStats.proficiencyBonus,
        maxHp: derivedLevelStats.maxHp,
      };
    });
  }, [derivedLevelStats]);

  // base(8~15) 를 1 증가시키면 final = base+1+bonus 로 갱신. 비용 한도 + 상/하한 검증.
  function adjustAbilityBase(ability: AbilityKey, delta: 1 | -1): void {
    setFormState((current) => {
      const currentFinal = current.abilities?.[ability] ?? 10;
      const bonus = selectedRace?.abilityIncreases[ability] ?? 0;
      const currentBase = currentFinal - bonus;
      const nextBase = currentBase + delta;
      if (nextBase < POINT_BUY_MIN_BASE || nextBase > POINT_BUY_MAX_BASE) {
        return current;
      }
      const currentAbilities = current.abilities ?? {
        str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      };
      return {
        ...current,
        abilities: { ...currentAbilities, [ability]: nextBase + bonus },
      };
    });
  }

  useEffect(() => {
    let ignore = false;
    setCatalogError(null);

    Promise.all([loadClassOptions(), loadRaceData()])
      .then(([loadedClasses, loadedRaces]) => {
        if (ignore) {
          return;
        }
        setClassCatalog(loadedClasses);
        setRaceCatalog(loadedRaces);
      })
      .catch((caught) => {
        if (!ignore) {
          setCatalogError(
            caught instanceof Error
              ? caught.message
              : '정적 SRD 직업/종족 데이터를 불러오지 못했습니다.',
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!isCreateModalOpen) return undefined;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isCreateModalOpen]);

  useEffect(() => {
    if (!deleteWarning) return undefined;

    const timeout = window.setTimeout(() => {
      setDeleteWarning(null);
    }, 4200);

    return () => window.clearTimeout(timeout);
  }, [deleteWarning]);

  useEffect(() => {
    if (!characters.length) {
      setSelectedCharacterId(null);
      return;
    }

    setSelectedCharacterId((current) =>
      current && characters.some((character) => character.id === current)
        ? current
        : characters[0].id
    );
  }, [characters]);

  useEffect(() => {
    const node = inventoryEditorRef.current;
    if (!node || !inventoryDraft.length) return;
    node.scrollTop = node.scrollHeight;
  }, [inventoryDraft.length]);

  // 선택된 캐릭터와 선택 폼에서 쓰는 종족/직업 정보를 메모이즈합니다.
  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId]
  );
  const ancestryOptions = useMemo(
    () => raceCatalog.map(({ value, label }) => ({ value, label })),
    [raceCatalog]
  );
  const ancestryLabelMap = useMemo(
    () => new Map(ancestryOptions.map((option) => [option.value, option.label])),
    [ancestryOptions]
  );
  const selectedRaceInfo = useMemo(
    () => getRaceByValue(raceCatalog, formState.ancestry),
    [formState.ancestry, raceCatalog]
  );
  const selectedClassInfo = useMemo(
    () => getClassOptionByValue(classCatalog, formState.className),
    [classCatalog, formState.className]
  );

  const usedCharacterIds = useMemo(() => {
    const ids = new Set<string>();

    snapshot?.participants.forEach((participant) => {
      if (participant.characterId) ids.add(participant.characterId);
    });

    characters.forEach((character) => {
      if (character.activeSessionId) ids.add(character.id);
    });

    return ids;
  }, [characters, snapshot]);

  // 생성/수정 폼을 기본값으로 되돌립니다.
  function resetCreateForm() {
    setEditingCharacterId(null);
    const defaults = createDefaultCharacter();
    const defaultScenario = scenarios[0] ?? null;
    const defaultClass = classDefinitions.find(
      (c) => c.key === (defaults.className ?? '').toLowerCase(),
    );
    const startingEquipmentSelection = defaultClass
      ? new Array(defaultClass.startingEquipment.slots.length).fill(0)
      : undefined;
    const startingSpells = defaultClass && (defaultClass.startingCantripCount > 0 || defaultClass.startingSpellCount > 0)
      ? {
          cantrips: new Array(defaultClass.startingCantripCount).fill(''),
          spells: new Array(defaultClass.startingSpellCount).fill(''),
        }
      : undefined;
    setFormState({
      ...defaults,
      scenarioId: defaultScenario?.id ?? null,
      level: defaultScenario ? normalizeLevel(defaultScenario.startLevel) : defaults.level,
      startingEquipmentSelection,
      startingSpells,
    });
    setInventoryDraft([]);
    setSkillInput('');
  }

  // 새 캐릭터 생성 모달을 여는 함수입니다.
  function openCreateModal() {
    resetCreateForm();
    setCreateModalOpen(true);
  }

  // 선택한 캐릭터 정보를 formState에 복사해 수정 모달을 여는 함수입니다.
  function openEditModal() {
    if (!selectedCharacter) return;

    setEditingCharacterId(selectedCharacter.id);
    setFormState({
      name: selectedCharacter.name,
      ancestry: selectedCharacter.ancestry,
      className: selectedCharacter.className,
      avatarType: selectedCharacter.avatarType,
      avatarPresetId:
        selectedCharacter.avatarPresetId ?? getPresetIdForClassName(selectedCharacter.className),
      avatarUrl: selectedCharacter.avatarUrl ?? null,
      scenarioId: selectedCharacter.scenarioId ?? null,
      level: selectedCharacter.level,
      abilities: { ...selectedCharacter.abilities },
      proficiencyBonus: selectedCharacter.proficiencyBonus,
      proficientSkills: [...selectedCharacter.proficientSkills],
      maxHp: selectedCharacter.maxHp,
      armorClass: selectedCharacter.armorClass,
      speed: selectedCharacter.speed,
      inventory: selectedCharacter.inventory.map((item) => ({ ...item })),
    });
    setInventoryDraft(selectedCharacter.inventory.map((item) => ({ ...item })));
    setSkillInput('');
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    resetCreateForm();
  }

  async function submitCreateCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      ...formState,
      proficientSkills: formState.proficientSkills?.filter(Boolean) ?? [],
      inventory: inventoryDraft.filter((item) => item.name.trim()),
      assignToSession: false,
    };

    if (editingCharacterId) {
      await onUpdateCharacter(editingCharacterId, payload);
    } else {
      await onCreateCharacter(payload);
    }
    closeCreateModal();
  }

  async function handleCloneSelectedCharacter() {
    if (!selectedCharacter) return;
    await onCloneCharacter(selectedCharacter.id);
  }

  async function handleDeleteSelectedCharacter() {
    if (!selectedCharacter) return;
    if (usedCharacterIds.has(selectedCharacter.id)) {
      setDeleteWarning(
        "\uC774 \uCE90\uB9AD\uD130\uB294 \uC138\uC158\uC5D0\uC11C \uC0AC\uC6A9 \uC911\uC785\uB2C8\uB2E4.\n\uC0AC\uC6A9 \uC911\uC778 \uC138\uC158\uC744 \uC885\uB8CC\uD558\uACE0 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."
      );
      return;
    }
    setDeleteModalOpen(true);
  }

  async function confirmDeleteSelectedCharacter() {
    if (!selectedCharacter) return;
    await onDeleteCharacter(selectedCharacter.id);
    setDeleteModalOpen(false);
  }

  // 능력치 입력값을 1~30 범위로 보정해 formState에 반영합니다.
  function updateAbility(ability: AbilityKey, value: number) {
    setFormState((current) => ({
      ...current,
      abilities: {
        ...current.abilities!,
        [ability]: value,
      },
    }));
  }

  function addSkill(skill: string) {
    const normalized = skill.trim();
    if (!normalized) return;

    setFormState((current) => ({
      ...current,
      proficientSkills: Array.from(new Set([...(current.proficientSkills ?? []), normalized])),
    }));
    setSkillInput('');
  }

  function removeSkill(skill: string) {
    setFormState((current) => ({
      ...current,
      proficientSkills: (current.proficientSkills ?? []).filter((entry) => entry !== skill),
    }));
  }

  // 인벤토리 편집 테이블에 빈 행을 추가합니다.
  function addInventoryRow() {
    setInventoryDraft((current) => [
      ...current,
      {
        id: `item-${crypto.randomUUID()}`,
        name: '',
        quantity: 1,
      },
    ]);
  }

  function updateInventoryRow(id: string, field: 'name' | 'quantity', value: string | number) {
    setInventoryDraft((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === 'quantity' ? Math.max(1, Number(value) || 1) : value,
            }
          : item
      )
    );
  }

  function removeInventoryRow(id: string) {
    setInventoryDraft((current) => current.filter((item) => item.id !== id));
  }

  return (
    <main className="character-page fantasy-character-page">
      {/* 좌측 사이드바: 캐릭터 생성 버튼과 안내 영역입니다. */}
      <section className="fantasy-character-layout">
        <aside className="fantasy-character-sidebar">
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={openCreateModal}
          >
            새 캐릭터 생성
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={() => void handleCloneSelectedCharacter()}
            disabled={!selectedCharacter || busy}
          >
            캐릭터 복제
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={openEditModal}
            disabled={!selectedCharacter || busy}
          >
            캐릭터 수정
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={() => void handleDeleteSelectedCharacter()}
            disabled={!selectedCharacter || busy}
          >
            캐릭터 삭제
          </button>
        </aside>

        {/* 캐릭터 카드 목록과 선택 캐릭터 상세 정보를 보여주는 메인 보드입니다. */}
        <section className="fantasy-character-board">
          <div
            className="fantasy-character-board-planks"
            style={{ backgroundImage: `url(${boxBulletinNarrowPlanks})` }}
            aria-hidden="true"
          />
          <div className="fantasy-character-board-scroll fantasy-scroll-hidden">
            {/* 보유 캐릭터 카드 목록입니다. 카드 선택 시 상세 패널이 바뀝니다. */}
            <div className="fantasy-character-grid">
              {characters.map((character) => {
                const isSelected = character.id === selectedCharacterId;
                const isInUse = usedCharacterIds.has(character.id);
                const art = getCharacterImage(character);

                return (
                  <button
                    type="button"
                    key={character.id}
                    className={`fantasy-character-card${isSelected ? ' selected' : ''}`}
                    onClick={() => setSelectedCharacterId(character.id)}
                  >
                    <div
                      className="fantasy-character-card-frame"
                      style={{ ['--frame-image' as string]: `url(${profileBorderCharacter})` }}
                    >
                      <img src={art} alt={character.name} className="fantasy-character-card-art" />
                      {isInUse ? (
                        <div className="fantasy-character-card-overlay">사용 중...</div>
                      ) : null}
                      <div className="fantasy-character-card-nameplate">{character.name}</div>
                      <div className="fantasy-character-card-class">
                        {getCharacterClassLabel(character.className)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div
            className="fantasy-character-board-frame"
            style={{ backgroundImage: `url(${boxBulletinNarrowFrame})` }}
            aria-hidden="true"
          />
        </section>

        <section className="fantasy-character-detail">
          {selectedCharacter ? (
            <>
              <article
                className="fantasy-character-profile-frame"
                style={{ ['--frame-image' as string]: `url(${profileBorderCharacter})` }}
              >
                <img
                  src={getCharacterImage(selectedCharacter)}
                  alt={selectedCharacter.name}
                  className="fantasy-character-profile-art"
                />
                <div className="fantasy-character-profile-name">{selectedCharacter.name}</div>
                <div className="fantasy-character-profile-class">
                  {getCharacterClassLabel(selectedCharacter.className)}
                </div>
              </article>

              <article
                className="fantasy-character-stats-frame"
                style={{ ['--frame-image' as string]: `url(${profileBorderStats})` }}
              >
                <div className="fantasy-character-stats-scroll fantasy-scroll-hidden">
                  <div className="fantasy-character-stats-content">
                    <h2>{selectedCharacter.name}</h2>

                    <dl className="fantasy-character-summary-list">
                      <div>
                        <dt>종족</dt>
                        <dd>{getCharacterAncestryLabel(selectedCharacter.ancestry, ancestryLabelMap)}</dd>
                      </div>
                      <div>
                        <dt>직업</dt>
                        <dd>{getCharacterClassLabel(selectedCharacter.className)}</dd>
                      </div>
                      <div>
                        <dt>레벨</dt>
                        <dd>{selectedCharacter.level}</dd>
                      </div>
                      <div>
                        <dt>HP</dt>
                        <dd>
                          {formatStat(selectedCharacter.maxHp)}/
                          {formatStat(selectedCharacter.maxHp)}
                        </dd>
                      </div>
                      <div>
                        <dt>방어도</dt>
                        <dd>{formatStat(selectedCharacter.armorClass)}</dd>
                      </div>
                      <div>
                        <dt>속도</dt>
                        <dd>{formatStat(selectedCharacter.speed)}</dd>
                      </div>
                      <div>
                        <dt>숙련도</dt>
                        <dd>{formatStat(selectedCharacter.proficiencyBonus)}</dd>
                      </div>
                    </dl>

                    <section className="fantasy-character-stats-section">
                      <h3>능력치</h3>
                      <div className="fantasy-character-abilities-grid">
                        {(Object.keys(abilityDisplayLabels) as AbilityKey[]).map((ability) => (
                          <div key={ability}>
                            <strong>{abilityDisplayLabels[ability]}</strong>
                            <span className="fantasy-character-ability-value">
                              {formatStat(selectedCharacter.abilities[ability])} (
                              {formatModifier(selectedCharacter.abilities[ability])})
                            </span>
                            <span
                              className="fantasy-character-ability-help"
                              tabIndex={0}
                              role="note"
                              aria-label={getAbilityModifierTooltip(
                                ability,
                                selectedCharacter.abilities[ability]
                              )}
                            >
                              ?
                              <span className="fantasy-character-ability-tooltip" role="tooltip">
                                {getAbilityModifierTooltip(
                                  ability,
                                  selectedCharacter.abilities[ability]
                                )}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>기술 숙련</h3>
                      {selectedCharacter.proficientSkills.length ? (
                        <ul className="fantasy-character-text-list">
                          {selectedCharacter.proficientSkills.map((skill) => (
                            <li key={skill}>{getSkillLabel(skill)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>선택된 기술이 없습니다.</p>
                      )}
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>인벤토리</h3>
                      {selectedCharacter.inventory.length ? (
                        <ul className="fantasy-character-text-list">
                          {selectedCharacter.inventory.map((item) => (
                            <li key={item.id}>
                              {item.name} x{item.quantity}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>비어 있음</p>
                      )}
                    </section>
                  </div>
                </div>
              </article>
            </>
          ) : (
            <article className="character-focus-card character-focus-card-empty">
              {/* 선택된 캐릭터의 스탯, 능력치, 스킬, 인벤토리 상세 패널입니다. */}
              <h2>캐릭터를 생성해 보세요</h2>
            </article>
          )}
        </section>
      </section>

      {catalogError ? <p className="panel-error">{catalogError}</p> : null}
      {error ? <p className="panel-error">{error}</p> : null}
      {deleteWarning ? (
        <button
          type="button"
          className="page-error-toast"
          onClick={() => setDeleteWarning(null)}
        >
          {deleteWarning}
        </button>
      ) : null}

      {/* 캐릭터 생성/수정 모달입니다. editingCharacterId가 있으면 수정 모드로 동작합니다. */}
      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCreateModal}>
          <div
            className="modal-card modal-card-wide character-create-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  {editingCharacterId ? '캐릭터 수정' : '캐릭터 생성'}
                </span>
                <h2>{editingCharacterId ? '캐릭터 수정' : '새 캐릭터'}</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeCreateModal}>
                닫기
              </button>
            </div>

            <form className="modal-form character-create-form" onSubmit={submitCreateCharacter}>
              <div className="character-create-form-left">
                <section className="character-form-section">
                  <div className="section-heading compact">
                    <div>
                      <span className="eyebrow">기본 정보</span>
                      <h2>프로필</h2>
                    </div>
                  </div>

                  <div className="field-row">
                    <div>
                      <label htmlFor="character-name-create">이름</label>
                      <input
                        id="character-name-create"
                        value={formState.name}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, name: event.target.value }))
                        }
                        maxLength={50}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="character-scenario-create">시나리오</label>
                      <select
                        id="character-scenario-create"
                        value={formState.scenarioId ?? ''}
                        onChange={(event) =>
                          setFormState((current) => {
                            const nextScenarioId = event.target.value || null;
                            const nextScenario = scenarios.find((s) => s.id === nextScenarioId);
                            const nextLevel = normalizeLevel(nextScenario?.startLevel ?? 1);
                            const currentLevel = normalizeLevel(current.level ?? 1);
                            const nextStats = applyLevelDeltaStats(
                              current,
                              nextLevel - currentLevel,
                              nextLevel
                            );
                            const nextAbilities = applyLevelDeltaAbilities(
                              current,
                              nextLevel - currentLevel
                            );

                            return {
                              ...current,
                              scenarioId: nextScenarioId,
                              level: nextLevel,
                              maxHp: nextStats.maxHp,
                              armorClass: nextStats.armorClass,
                              proficiencyBonus: nextStats.proficiencyBonus,
                              abilities: nextAbilities,
                            };
                          })
                        }
                        required
                      >
                        <option value="" disabled>
                          {scenarios.length === 0
                            ? '사용 가능한 시나리오가 없습니다'
                            : '시나리오를 선택하세요'}
                        </option>
                        {scenarios.map((scenario) => (
                          <option key={scenario.id} value={scenario.id}>
                            {scenario.title} (시작 {scenario.startLevel}레벨)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="character-level-create">레벨 (시나리오 고정)</label>
                      <input
                        id="character-level-create"
                        type="number"
                        value={formState.level ?? 1}
                        readOnly
                        disabled
                      />
                    </div>
                  </div>

                  <div className="field-row">
                    <div>
                      <label htmlFor="character-ancestry-create">종족</label>
                      <select
                        id="character-ancestry-create"
                        value={formState.ancestry}
                        onChange={(event) => {
                          const nextAncestry = event.target.value;
                          const nextRace = races.find(
                            (r) => r.key === nextAncestry.toLowerCase() || r.koName === nextAncestry,
                          );
                          const currentRace = races.find(
                            (r) =>
                              r.key === (formState.ancestry ?? '').toLowerCase() ||
                              r.koName === formState.ancestry,
                          );
                          setFormState((current) => {
                            const currentFinals = current.abilities ?? {
                              str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
                            };
                            const currentBonus = currentRace?.abilityIncreases ?? {
                              str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0,
                            };
                            const nextBonus = nextRace?.abilityIncreases ?? {
                              str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0,
                            };
                            const nextAbilities = {
                              str: currentFinals.str - currentBonus.str + nextBonus.str,
                              dex: currentFinals.dex - currentBonus.dex + nextBonus.dex,
                              con: currentFinals.con - currentBonus.con + nextBonus.con,
                              int: currentFinals.int - currentBonus.int + nextBonus.int,
                              wis: currentFinals.wis - currentBonus.wis + nextBonus.wis,
                              cha: currentFinals.cha - currentBonus.cha + nextBonus.cha,
                            };
                            return { ...current, ancestry: nextAncestry, abilities: nextAbilities };
                          });
                        }}
                        required
                      >
                        <option value="" disabled>
                          {races.length === 0 ? '종족 로딩 중…' : '종족을 선택하세요'}
                        </option>
                        {races
                          .filter((r) => !r.parentRaceId)
                          .map((race) => (
                            <option key={race.id} value={race.key}>
                              {race.koName}
                            </option>
                          ))}
                        {races
                          .filter((r) => r.parentRaceId)
                          .map((race) => (
                            <option key={race.id} value={race.key}>
                              └ {race.koName}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="character-class-create">직업</label>
                      <select
                        id="character-class-create"
                        value={formState.className}
                        onChange={(event) =>
                          setFormState((current) => {
                            const className = event.target.value;
                            const recommendedStats = getRecommendedStats(
                              className,
                              current.level ?? 1
                            );
                            // Point Buy 도입 후: 클래스 변경해도 abilities 는 사용자가 배분한 값 유지.
                            // HP/AC/이동속도/숙련 보너스만 클래스 변경에 따라 재계산.
                            // 시작 장비 선택은 슬롯 개수에 맞춰 모두 0(첫 옵션)으로 초기화.
                            const nextClass = classDefinitions.find(
                              (c) => c.key === className.toLowerCase(),
                            );
                            const nextSelection = nextClass
                              ? new Array(nextClass.startingEquipment.slots.length).fill(0)
                              : undefined;
                            const nextSpells = nextClass && (nextClass.startingCantripCount > 0 || nextClass.startingSpellCount > 0)
                              ? {
                                  cantrips: new Array(nextClass.startingCantripCount).fill(''),
                                  spells: new Array(nextClass.startingSpellCount).fill(''),
                                }
                              : undefined;
                            return {
                              ...current,
                              className,
                              avatarType: 'PRESET',
                              avatarPresetId: getPresetIdForClassName(className),
                              avatarUrl: null,
                              maxHp: recommendedStats.maxHp,
                              armorClass: recommendedStats.armorClass,
                              speed: recommendedStats.speed,
                              proficiencyBonus: recommendedStats.proficiencyBonus,
                              startingEquipmentSelection: nextSelection,
                              startingSpells: nextSpells,
                            };
                          })
                        }
                        required
                      >
                        {classCatalog.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                <section className="character-form-section">
                  <div className="section-heading compact">
                    <div>
                      <span className="eyebrow">전투 수치</span>
                      <h2>코어 스탯</h2>
                    </div>
                  </div>

                  <div className="field-row field-row-4">
                    <div>
                      <label htmlFor="character-hp-create">
                        HP {derivedLevelStats ? '(레벨/Con 자동)' : ''}
                      </label>
                      <input
                        id="character-hp-create"
                        type="number"
                        min={1}
                        step={1}
                        value={formState.maxHp ?? 12}
                        readOnly={Boolean(derivedLevelStats)}
                        disabled={Boolean(derivedLevelStats)}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            maxHp: normalizeIntegerValue(Number(event.target.value), 1),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor="character-ac-create">방어도</label>
                      <input
                        id="character-ac-create"
                        type="number"
                        min={1}
                        step={1}
                        value={formState.armorClass ?? 10}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            armorClass: normalizeIntegerValue(Number(event.target.value), 1),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor="character-speed-create">이동속도</label>
                      <input
                        id="character-speed-create"
                        type="number"
                        min={0}
                        value={formState.speed ?? 30}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            speed: normalizeIntegerValue(Number(event.target.value), 0),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor="character-prof-create">
                        숙련도 {derivedLevelStats ? '(레벨 자동)' : ''}
                      </label>
                      <input
                        id="character-prof-create"
                        type="number"
                        min={0}
                        step={1}
                        value={formState.proficiencyBonus ?? 2}
                        readOnly={Boolean(derivedLevelStats)}
                        disabled={Boolean(derivedLevelStats)}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            proficiencyBonus: normalizeIntegerValue(Number(event.target.value), 0),
                          }))
                        }
                      />
                    </div>
                  </div>
                </section>

                <section className="character-form-section">
                  <div className="section-heading compact">
                    <div>
                      <span className="eyebrow">능력치</span>
                      <h2>능력치 (Point Buy 27)</h2>
                    </div>
                    {pointBuyState.enforced ? (
                      <div style={{ fontSize: '0.9rem' }}>
                        남은 포인트: <strong style={{ color: pointBuyState.isValid ? 'inherit' : '#d04040' }}>
                          {pointBuyState.remaining}
                        </strong>{' '}
                        / {POINT_BUY_TOTAL}
                        {!pointBuyState.isValid && (
                          <span style={{ marginLeft: 8, color: '#d04040' }}>
                            ({pointBuyState.totalCost > POINT_BUY_TOTAL ? '초과' : '미달'})
                          </span>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                        종족 미선택 시 Point Buy 검증 비활성
                      </div>
                    )}
                  </div>

                  <div className="field-row field-row-3">
                    {(Object.keys(abilityDisplayLabels) as AbilityKey[]).map((ability) => {
                      const base = pointBuyState.bases[ability];
                      const bonus = selectedRace?.abilityIncreases[ability] ?? 0;
                      const finalScore = formState.abilities?.[ability] ?? 10;
                      const cost = pointBuyState.costs[ability];
                      const canDec = pointBuyState.enforced && base > POINT_BUY_MIN_BASE;
                      const canInc = pointBuyState.enforced && base < POINT_BUY_MAX_BASE;
                      return (
                        <div key={ability}>
                          <label htmlFor={`character-${ability}`}>
                            {abilityDisplayLabels[ability]}
                            {bonus > 0 && (
                              <span style={{ marginLeft: 6, color: '#3a7' }}>(+{bonus} 종족)</span>
                            )}
                          </label>
                          {pointBuyState.enforced ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => adjustAbilityBase(ability, -1)}
                                disabled={!canDec}
                                aria-label={`${abilityDisplayLabels[ability]} 감소`}
                              >
                                −
                              </button>
                              <div style={{ minWidth: 90, textAlign: 'center' }}>
                                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                  base {base} → {finalScore}
                                </div>
                                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                                  비용 {cost ?? '?'}p
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => adjustAbilityBase(ability, 1)}
                                disabled={!canInc}
                                aria-label={`${abilityDisplayLabels[ability]} 증가`}
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <input
                              id={`character-${ability}`}
                              type="number"
                              min={1}
                              step={1}
                              value={finalScore}
                              onChange={(event) =>
                                updateAbility(
                                  ability,
                                  normalizeIntegerValue(Number(event.target.value), 1)
                                )
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="character-form-section">
                  <div className="section-heading compact">
                    <div>
                      <span className="eyebrow">기술</span>
                      <h2>숙련 기술</h2>
                    </div>
                  </div>

                  <div className="character-skill-picker">
                    <input
                      value={skillInput}
                      onChange={(event) => setSkillInput(event.target.value)}
                      placeholder="기술 이름 입력"
                    />
                    <button type="button" onClick={() => addSkill(skillInput)}>
                      추가
                    </button>
                  </div>

                  <div className="character-chip-row" style={{ marginTop: '14px' }}>
                    {suggestedSkillOptions.map((skill) => (
                      <button
                        key={skill.value}
                        type="button"
                        className="character-skill-chip"
                        onClick={() => addSkill(skill.value)}
                      >
                        {skill.label}
                      </button>
                    ))}
                  </div>

                  <div className="character-chip-row" style={{ marginTop: '12px' }}>
                    {(formState.proficientSkills ?? []).length ? (
                      (formState.proficientSkills ?? []).map((skill) => (
                        <span
                          key={skill}
                          className="character-selected-chip"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}
                        >
                          {getSkillLabel(skill)}
                          <button
                            type="button"
                            onClick={() => removeSkill(skill)}
                            aria-label={`${getSkillLabel(skill)} 제거`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '1.22rem',
                              height: '1.22rem',
                              padding: 0,
                              lineHeight: 1,
                              fontSize: '0.95rem',
                              flexShrink: 0,
                              transform: 'translateY(-1px)',
                            }}
                          >
                            x
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="status-chip muted">선택된 기술이 없습니다</span>
                    )}
                  </div>
                </section>

                {selectedClass ? (
                  <section className="character-form-section">
                    <div className="section-heading compact">
                      <div>
                        <span className="eyebrow">시작 장비</span>
                        <h2>슬롯 선택 (룰북 강제)</h2>
                      </div>
                    </div>
                    {selectedClass.startingEquipment.slots.map((slot, slotIndex) => {
                      const selectedOptionIndex =
                        formState.startingEquipmentSelection?.[slotIndex] ?? 0;
                      const formatOption = (option: typeof slot.options[number]) =>
                        option.items
                          .map((it) => {
                            const ko = itemKoNameByKey.get(it.itemKey) ?? it.itemKey;
                            return it.quantity > 1 ? `${ko} ×${it.quantity}` : ko;
                          })
                          .join(' + ');
                      return (
                        <div key={slotIndex} style={{ marginBottom: 12 }}>
                          <label htmlFor={`starting-equipment-${slotIndex}`}>
                            슬롯 {slotIndex + 1}
                          </label>
                          {slot.options.length === 1 ? (
                            <div style={{ padding: '6px 10px', opacity: 0.85 }}>
                              {formatOption(slot.options[0]!)} (고정)
                            </div>
                          ) : (
                            <select
                              id={`starting-equipment-${slotIndex}`}
                              value={selectedOptionIndex}
                              onChange={(event) => {
                                const idx = Number(event.target.value);
                                setFormState((current) => {
                                  const base =
                                    current.startingEquipmentSelection ??
                                    new Array(selectedClass.startingEquipment.slots.length).fill(0);
                                  const next = [...base];
                                  next[slotIndex] = idx;
                                  return { ...current, startingEquipmentSelection: next };
                                });
                              }}
                            >
                              {slot.options.map((option, optIdx) => (
                                <option key={optIdx} value={optIdx}>
                                  {formatOption(option)}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </section>
                ) : null}

                {selectedClass && (selectedClass.startingCantripCount > 0 || selectedClass.startingSpellCount > 0) ? (
                  <section className="character-form-section">
                    <div className="section-heading compact">
                      <div>
                        <span className="eyebrow">시작 주문</span>
                        <h2>
                          캔트립 {selectedClass.startingCantripCount}개 + 주문 {selectedClass.startingSpellCount}개 (룰북 강제)
                        </h2>
                      </div>
                    </div>
                    {selectedClass.startingCantripCount > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', marginBottom: 6 }}>캔트립</label>
                        {Array.from({ length: selectedClass.startingCantripCount }).map((_, idx) => (
                          <input
                            key={`cantrip-${idx}`}
                            value={formState.startingSpells?.cantrips[idx] ?? ''}
                            onChange={(event) => {
                              const v = event.target.value;
                              setFormState((current) => {
                                const base = current.startingSpells ?? {
                                  cantrips: new Array(selectedClass.startingCantripCount).fill(''),
                                  spells: new Array(selectedClass.startingSpellCount).fill(''),
                                };
                                const cantrips = [...base.cantrips];
                                cantrips[idx] = v;
                                return { ...current, startingSpells: { ...base, cantrips } };
                              });
                            }}
                            placeholder={`캔트립 ${idx + 1} 이름`}
                            style={{ marginRight: 6, marginBottom: 4 }}
                          />
                        ))}
                      </div>
                    )}
                    {selectedClass.startingSpellCount > 0 && (
                      <div>
                        <label style={{ display: 'block', marginBottom: 6 }}>1레벨 주문</label>
                        {Array.from({ length: selectedClass.startingSpellCount }).map((_, idx) => (
                          <input
                            key={`spell-${idx}`}
                            value={formState.startingSpells?.spells[idx] ?? ''}
                            onChange={(event) => {
                              const v = event.target.value;
                              setFormState((current) => {
                                const base = current.startingSpells ?? {
                                  cantrips: new Array(selectedClass.startingCantripCount).fill(''),
                                  spells: new Array(selectedClass.startingSpellCount).fill(''),
                                };
                                const spells = [...base.spells];
                                spells[idx] = v;
                                return { ...current, startingSpells: { ...base, spells } };
                              });
                            }}
                            placeholder={`주문 ${idx + 1} 이름`}
                            style={{ marginRight: 6, marginBottom: 4 }}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ) : null}

                <section className="character-form-section">
                  <div className="section-heading compact">
                    <div>
                      <span className="eyebrow">인벤토리</span>
                      <h2>아이템 {selectedClass ? '(시작 장비 자동 — 수동 입력 무시됨)' : ''}</h2>
                    </div>
                    <button type="button" onClick={addInventoryRow} disabled={Boolean(selectedClass)}>
                      아이템 추가
                    </button>
                  </div>

                  <div
                    ref={inventoryEditorRef}
                    className="character-inventory-editor fantasy-scroll-hidden"
                  >
                    {inventoryDraft.length ? (
                      inventoryDraft.map((item) => (
                        <div key={item.id} className="character-inventory-row">
                          <input
                            value={item.name}
                            onChange={(event) =>
                              updateInventoryRow(item.id, 'name', event.target.value)
                            }
                            placeholder="아이템 이름"
                          />
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(event) =>
                              updateInventoryRow(item.id, 'quantity', event.target.value)
                            }
                            placeholder="수량"
                          />
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => removeInventoryRow(item.id)}
                          >
                            삭제
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="character-empty-note">아직 추가된 아이템이 없습니다.</p>
                    )}
                  </div>
                </section>
              </div>
              <div className="character-create-form-right">
                <section className="character-form-section">
                  <div className="character-avatar-picker">
                    <label>초상화</label>
                    <div
                      className="character-avatar-grid"
                      role="radiogroup"
                      aria-label="캐릭터 초상화 선택"
                    >
                      {avatarPresets.map((preset) => {
                        const isSelected = formState.avatarPresetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className={`character-avatar-option${isSelected ? ' selected' : ''}`}
                            onClick={() =>
                              setFormState((current) => {
                                const className = getClassNameForPresetId(preset.id);
                                const recommendedStats = getRecommendedStats(
                                  className,
                                  current.level ?? 1
                                );
                                const recommendedAbilities = getRecommendedAbilities(
                                  className,
                                  current.level ?? 1,
                                  current.abilities
                                );

                                return {
                                  ...current,
                                  className,
                                  avatarType: 'PRESET',
                                  avatarPresetId: preset.id,
                                  avatarUrl: null,
                                  maxHp: recommendedStats.maxHp,
                                  armorClass: recommendedStats.armorClass,
                                  speed: recommendedStats.speed,
                                  proficiencyBonus: recommendedStats.proficiencyBonus,
                                  abilities: recommendedAbilities,
                                };
                              })
                            }
                            aria-pressed={isSelected}
                          >
                            <img
                              src={preset.image}
                              alt={preset.label}
                              className="character-avatar-option-image"
                            />
                            <span>{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
                <div className="character-insight-box">
                  <div className="fantasy-insight-content">
                    <div className="fantasy-insight-section">
                      <strong className="fantasy-insight-title">
                        {selectedRaceInfo?.label ?? '종족 정보'}
                      </strong>
                      <p>
                        능력치 보너스:{' '}
                        {(selectedRaceInfo?.abilityBonuses ?? [])
                          .map((bonus) => formatAbilityBonus(bonus))
                          .join(', ') || '정보 없음'}
                      </p>
                      <p>
                        이동속도: {selectedRaceInfo ? `${selectedRaceInfo.speed} ft.` : '정보 없음'}
                      </p>
                      <p>크기: {selectedRaceInfo?.size ?? '정보 없음'}</p>
                      <ul className="fantasy-character-text-list">
                        {(selectedRaceInfo?.traitSummaries ?? []).slice(0, 3).map((trait) => (
                          <li key={`${selectedRaceInfo?.value}-${trait.name}`}>
                            <strong>{trait.name}</strong>: {trait.summary}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <hr className="fantasy-insight-divider" />

                    <div className="fantasy-insight-section">
                      <strong className="fantasy-insight-title">
                        {selectedClassInfo?.label ?? '직업 정보'}
                      </strong>
                      <p>{selectedClassInfo?.summary ?? '직업 설명이 없습니다.'}</p>
                      <p>
                        주 능력치:{' '}
                        {selectedClassInfo
                          ? localizeAbilityText(selectedClassInfo.primaryAbilitiesRaw)
                          : '정보 없음'}
                      </p>
                      <p>히트다이: {selectedClassInfo?.hitDieRaw ?? '정보 없음'}</p>
                      <p>주문 사용: {selectedClassInfo?.spellcastingAbility ? '사용' : '없음'}</p>
                      <ul className="fantasy-character-text-list">
                        {(selectedClassInfo?.levelFeatureSummary ?? [])
                          .slice(0, 3)
                          .map((feature) => (
                            <li key={`${selectedClassInfo?.value}-${feature.level}`}>
                              <strong>{feature.level}레벨</strong>: {feature.features}
                            </li>
                          ))}
                      </ul>
                      <p>
                        시작 장비:{' '}
                        {(selectedClassInfo?.startingEquipment ?? []).slice(0, 2).join(' / ') ||
                          '정보 없음'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <button type="submit" className="primary" disabled={busy}>
                {editingCharacterId ? '저장' : '생성'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* 삭제 확인 모달입니다. 실수 삭제를 막기 위해 별도 확인을 받습니다. */}
      {isDeleteModalOpen && selectedCharacter ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setDeleteModalOpen(false)}
        >
          <div
            className="modal-card character-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="character-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="character-delete-preview">
              <div
                className="character-delete-preview-frame"
                style={{ ['--frame-image' as string]: `url(${profileBorderCharacter})` }}
              >
                <img
                  src={getCharacterImage(selectedCharacter)}
                  alt={selectedCharacter.name}
                  className="character-delete-preview-art"
                />
                <div className="character-delete-preview-name">{selectedCharacter.name}</div>
                <div className="character-delete-preview-class">
                  {getCharacterClassLabel(selectedCharacter.className)}
                </div>
              </div>
            </div>

            <p className="character-delete-copy">
              <strong>{selectedCharacter.name}</strong>{" 을(를) 정말 삭제할까요?"}
            </p>
            <p className="character-delete-subcopy">{"삭제 후에는 되돌릴 수 없습니다."}</p>

            <div className="character-delete-actions">
              <button
                type="button"
                className="danger-button character-delete-confirm"
                onClick={() => void confirmDeleteSelectedCharacter()}
                disabled={busy}
              >
                삭제
              </button>
              <button
                type="button"
                className="ghost character-delete-cancel"
                onClick={() => setDeleteModalOpen(false)}
                disabled={busy}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
