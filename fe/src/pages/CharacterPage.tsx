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
  localizeAbilityText,
  localizeSrdTermText,
  loadClassOptions,
  loadRaceData,
  loadSpellCatalog,
  normalizeClassValue,
  type ClassOption,
  type ClassOptionValue,
  type RaceAbilityBonus,
  type RaceData,
  type StaticSpellCatalogEntry,
} from '../services/staticSrd';
import { getPreferredScenario, splitScenariosBySource } from '../data/sessionVisuals';
import type { CharacterPayload } from '../hooks/useSession';
import type { PersistentCharacter, Scenario, SessionSnapshot, StoredUser } from '../types/session';
import type {
  ClassDefinitionResponseDto,
  ItemResponseDto,
  LevelUpCharacterDto,
  RaceResponseDto,
  RuleCatalogReferenceDto,
  StartingSpellsDto,
  UpdatePreparedSpellsDto,
} from '@trpg/shared-types';
import { InventoryItemInfo } from '../features/sessionPlay/components/InventoryItemInfo';
import {
  SpellSelectionGrid,
  type SpellSelectionGridDetail,
  type SpellSelectionGridOption,
} from '../features/spells/SpellSelectionGrid';
import { listItems, listRuleCatalog } from '../services/api';
import './CharacterPage.css';

// shared-types(CJS) value import 가 rollup 추적 실패 케이스라(메모) inline 동일값.
const POINT_BUY_TOTAL = 27;
const POINT_BUY_MIN_BASE = 8;
const POINT_BUY_MAX_BASE = 15;
const POINT_BUY_COST: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
const WIZARD_STARTING_SPELLBOOK_SPELL_COUNT = 6;
const WIZARD_SPELLBOOK_SPELLS_PER_LEVEL = 2;

// shared-types/src/constants/skills.ts 와 동기화 유지 — BE seed (be/src/database/seed/classes.ts ALL_SKILLS) 가 정답.
// 영문 코드/한국어 어느 쪽 입력도 한국어 정규형으로 normalize 한다.
const DND5E_SKILLS_INLINE: ReadonlyArray<{ code: string; ko: string }> = [
  { code: 'Acrobatics', ko: '곡예' },
  { code: 'AnimalHandling', ko: '동물 조련' },
  { code: 'Arcana', ko: '비전학' },
  { code: 'Athletics', ko: '운동' },
  { code: 'Deception', ko: '기만' },
  { code: 'History', ko: '역사' },
  { code: 'Insight', ko: '통찰' },
  { code: 'Intimidation', ko: '위협' },
  { code: 'Investigation', ko: '조사' },
  { code: 'Medicine', ko: '의학' },
  { code: 'Nature', ko: '자연' },
  { code: 'Perception', ko: '감지' },
  { code: 'Performance', ko: '공연' },
  { code: 'Persuasion', ko: '설득' },
  { code: 'Religion', ko: '종교' },
  { code: 'SleightOfHand', ko: '손재주' },
  { code: 'Stealth', ko: '은신' },
  { code: 'Survival', ko: '생존' },
];
const SKILL_KO_BY_CODE_INLINE = new Map(
  DND5E_SKILLS_INLINE.map((s) => [s.code.toLowerCase(), s.ko])
);
const SKILL_KO_SET_INLINE = new Set(DND5E_SKILLS_INLINE.map((s) => s.ko));
function normalizeSkillToKo(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (SKILL_KO_SET_INLINE.has(trimmed)) return trimmed;
  return SKILL_KO_BY_CODE_INLINE.get(trimmed.toLowerCase()) ?? null;
}

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
  onCreateCharacter: (payload: CharacterPayload) => Promise<boolean>;
  onCloneCharacter: (characterId: string) => void | Promise<void>;
  onUpdateCharacter: (characterId: string, payload: CharacterPayload) => Promise<boolean>;
  onLevelUpCharacter: (characterId: string, payload: LevelUpCharacterDto) => Promise<boolean>;
  onUpdatePreparedSpells: (
    characterId: string,
    payload: UpdatePreparedSpellsDto
  ) => Promise<boolean>;
  onDeleteCharacter: (characterId: string) => void | Promise<void>;
  autoOpenCreate?: boolean;
  sessionReturnTitle?: string | null;
  onReturnToSession?: () => void;
}

type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
type ScalingAbilityKey = 'str' | 'dex' | 'int';
type CharacterCreateStepKey = 'profile' | 'stats' | 'features' | 'equipment' | 'spells';

const ASI_LEVELS = [4, 8, 12, 14, 16, 19] as const;

function createEmptyAbilityScoreIncreases(): Record<AbilityKey, number> {
  return { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
}

function getCrossedAsiLevels(
  classKey: string,
  currentLevel: number,
  targetLevel: number
): number[] {
  const classSpecificLevels = classKey === 'fighter' ? [6] : [];
  return [...ASI_LEVELS, ...classSpecificLevels]
    .filter((level) => level > currentLevel && level <= targetLevel)
    .sort((left, right) => left - right);
}

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

const CHARACTER_CREATE_STEPS: ReadonlyArray<{
  key: CharacterCreateStepKey;
  label: string;
  helper: string;
}> = [
  { key: 'profile', label: '기본 정보', helper: '이름, 시나리오, 초상화를 정합니다.' },
  { key: 'stats', label: '코어 스탯', helper: '레벨과 능력치를 배분합니다.' },
  { key: 'features', label: '기술과 특성', helper: '숙련 기술과 직업 기능을 고릅니다.' },
  { key: 'equipment', label: '장비', helper: '시작 장비와 인벤토리를 확인합니다.' },
  { key: 'spells', label: '주문', helper: '캔트립과 시작 주문을 고릅니다.' },
] as const;

type ClassName = ClassOptionValue;
type ImplementedSpellOption = { id: string; label: string; level?: number | null };

const defaultAncestry = 'Human';

const implementedCantrips = [
  { id: 'spell.chill_touch', label: 'Chill Touch / 냉기의 손길' },
  { id: 'spell.fire_bolt', label: 'Fire Bolt / 화염 화살' },
  { id: 'spell.light', label: 'Light / 빛' },
  { id: 'spell.ray_of_frost', label: 'Ray of Frost / 서리 광선' },
  { id: 'spell.sacred_flame', label: 'Sacred Flame / 신성한 불꽃' },
  { id: 'spell.acid_splash', label: 'Acid Splash / 산성 물보라' },
  { id: 'spell.guidance', label: 'Guidance / 인도' },
  { id: 'spell.mage_hand', label: 'Mage Hand / 마법사의 손' },
  { id: 'spell.minor_illusion', label: 'Minor Illusion / 하급 환영' },
  { id: 'spell.shocking_grasp', label: 'Shocking Grasp / 전격의 손길' },
  { id: 'spell.blade_ward', label: 'Blade Ward / 칼날 방호' },
  { id: 'spell.dancing_lights', label: 'Dancing Lights / 춤추는 빛' },
  { id: 'spell.eldritch_blast', label: 'Eldritch Blast / 섬뜩한 방출' },
  { id: 'spell.friends', label: 'Friends / 친구' },
  { id: 'spell.mending', label: 'Mending / 수선' },
  { id: 'spell.message', label: 'Message / 전언' },
  { id: 'spell.poison_spray', label: 'Poison Spray / 독 분사' },
  { id: 'spell.produce_flame', label: 'Produce Flame / 불꽃 생성' },
  { id: 'spell.resistance', label: 'Resistance / 저항' },
  { id: 'spell.spare_the_dying', label: 'Spare the Dying / 빈사 안정화' },
];

const implementedLevel1Spells = [
  { id: 'spell.bane', label: 'Bane / 파멸' },
  { id: 'spell.bless', label: 'Bless / 축복' },
  { id: 'spell.burning_hands', label: 'Burning Hands / 타오르는 손길' },
  { id: 'spell.command', label: 'Command / 명령' },
  { id: 'spell.cure_wounds', label: 'Cure Wounds / 상처 치료' },
  { id: 'spell.detect_magic', label: 'Detect Magic / 마법 탐지' },
  { id: 'spell.entangle', label: 'Entangle / 휘감기' },
  { id: 'spell.guiding_bolt', label: 'Guiding Bolt / 인도하는 화살' },
  { id: 'spell.healing_word', label: 'Healing Word / 치유의 언어' },
  { id: 'spell.inflict_wounds', label: 'Inflict Wounds / 상처 가하기' },
  { id: 'spell.magic_missile', label: 'Magic Missile / 마법 화살' },
  { id: 'spell.shield', label: 'Shield / 방패' },
  { id: 'spell.sleep', label: 'Sleep / 수면' },
  { id: 'spell.thunderwave', label: 'Thunderwave / 천둥파' },
  { id: 'spell.charm_person', label: 'Charm Person / 인간형 매혹' },
  { id: 'spell.faerie_fire', label: 'Faerie Fire / 요정의 불꽃' },
  { id: 'spell.feather_fall', label: 'Feather Fall / 깃털 낙하' },
  { id: 'spell.fog_cloud', label: 'Fog Cloud / 안개 구름' },
  { id: 'spell.grease', label: 'Grease / 기름칠' },
  { id: 'spell.heroism', label: 'Heroism / 영웅심' },
  { id: 'spell.hunters_mark', label: "Hunter's Mark / 사냥꾼의 표식" },
  { id: 'spell.longstrider', label: 'Longstrider / 활보' },
  { id: 'spell.alarm', label: 'Alarm / 경보' },
  { id: 'spell.animal_friendship', label: 'Animal Friendship / 동물 친화' },
  { id: 'spell.armor_of_agathys', label: 'Armor of Agathys / 아가티스의 갑옷' },
  { id: 'spell.color_spray', label: 'Color Spray / 색채 분사' },
  { id: 'spell.comprehend_languages', label: 'Comprehend Languages / 언어 이해' },
  { id: 'spell.create_or_destroy_water', label: 'Create or Destroy Water / 물 생성·파괴' },
  { id: 'spell.expeditious_retreat', label: 'Expeditious Retreat / 신속 후퇴' },
  { id: 'spell.false_life', label: 'False Life / 거짓 생명' },
  { id: 'spell.find_familiar', label: 'Find Familiar / 사역마 찾기' },
  { id: 'spell.goodberry', label: 'Goodberry / 굿베리' },
  { id: 'spell.jump', label: 'Jump / 도약' },
  { id: 'spell.mage_armor', label: 'Mage Armor / 마법 갑옷' },
];

const implementedLevel2Spells = [
  { id: 'spell.hold_person', label: 'Hold Person / 인간형 포박' },
  { id: 'spell.misty_step', label: 'Misty Step / 안개 걸음' },
  { id: 'spell.scorching_ray', label: 'Scorching Ray / 작열 광선' },
  { id: 'spell.web', label: 'Web / 거미줄' },
  { id: 'spell.aid', label: 'Aid / 원조' },
  { id: 'spell.blindness_deafness', label: 'Blindness/Deafness / 실명·청각상실' },
  { id: 'spell.darkness', label: 'Darkness / 어둠' },
  { id: 'spell.invisibility', label: 'Invisibility / 투명화' },
  { id: 'spell.lesser_restoration', label: 'Lesser Restoration / 하급 회복' },
  { id: 'spell.moonbeam', label: 'Moonbeam / 달빛 광선' },
  { id: 'spell.spiritual_weapon', label: 'Spiritual Weapon / 영체 무기' },
  { id: 'spell.alter_self', label: 'Alter Self / 자기 변형' },
  { id: 'spell.blur', label: 'Blur / 흐릿함' },
  { id: 'spell.darkvision', label: 'Darkvision / 암시야' },
  { id: 'spell.enhance_ability', label: 'Enhance Ability / 능력 강화' },
  { id: 'spell.enlarge_reduce', label: 'Enlarge/Reduce / 확대·축소' },
  { id: 'spell.flaming_sphere', label: 'Flaming Sphere / 화염 구체' },
  { id: 'spell.gust_of_wind', label: 'Gust of Wind / 돌풍' },
  { id: 'spell.heat_metal', label: 'Heat Metal / 금속 가열' },
  { id: 'spell.levitate', label: 'Levitate / 공중 부양' },
  { id: 'spell.locate_object', label: 'Locate Object / 물체 탐지' },
  { id: 'spell.mirror_image', label: 'Mirror Image / 거울상' },
  { id: 'spell.spider_climb', label: 'Spider Climb / 거미 등반' },
];

const implementedLevel3Spells = [
  { id: 'spell.dispel_magic', label: 'Dispel Magic / 마법 해제' },
  { id: 'spell.fireball', label: 'Fireball / 화염구' },
  { id: 'spell.counterspell', label: 'Counterspell / 주문 무효화' },
  { id: 'spell.fly', label: 'Fly / 비행' },
  { id: 'spell.haste', label: 'Haste / 가속' },
  { id: 'spell.lightning_bolt', label: 'Lightning Bolt / 번개 화살' },
  { id: 'spell.revivify', label: 'Revivify / 소생' },
  { id: 'spell.call_lightning', label: 'Call Lightning / 번개 소환' },
  { id: 'spell.fear', label: 'Fear / 공포' },
  { id: 'spell.gaseous_form', label: 'Gaseous Form / 기체 형태' },
  { id: 'spell.plant_growth', label: 'Plant Growth / 식물 성장' },
  { id: 'spell.protection_from_energy', label: 'Protection from Energy / 에너지 보호' },
  { id: 'spell.sleet_storm', label: 'Sleet Storm / 진눈깨비 폭풍' },
  { id: 'spell.slow', label: 'Slow / 둔화' },
  { id: 'spell.water_walk', label: 'Water Walk / 수면 보행' },
];

const implementedLevel4Spells = [
  { id: 'spell.blight', label: 'Blight / 황폐화' },
  { id: 'spell.death_ward', label: 'Death Ward / 죽음 방호' },
  { id: 'spell.dimension_door', label: 'Dimension Door / 차원문' },
  { id: 'spell.freedom_of_movement', label: 'Freedom of Movement / 이동의 자유' },
  { id: 'spell.ice_storm', label: 'Ice Storm / 얼음 폭풍' },
  { id: 'spell.locate_creature', label: 'Locate Creature / 생물 탐지' },
  { id: 'spell.phantasmal_killer', label: 'Phantasmal Killer / 환영 살인자' },
  { id: 'spell.wall_of_fire', label: 'Wall of Fire / 화염 장벽' },
];

const implementedSpellClasses = new Set([
  'bard',
  'cleric',
  'druid',
  'paladin',
  'ranger',
  'sorcerer',
  'warlock',
  'wizard',
]);

const implementedSubclassOptions: Record<string, Array<{ value: string; label: string }>> = {
  barbarian: [{ value: 'berserker', label: 'Berserker / 광전사' }],
  bard: [{ value: 'lore', label: 'College of Lore / 지식 학파' }],
  cleric: [{ value: 'life', label: 'Life Domain / 생명 권역' }],
  druid: [{ value: 'land', label: 'Circle of the Land / 대지의 회합' }],
  fighter: [{ value: 'champion', label: 'Champion / 챔피언' }],
  monk: [{ value: 'open_hand', label: 'Way of the Open Hand / 열린 손의 길' }],
  paladin: [{ value: 'devotion', label: 'Oath of Devotion / 헌신의 맹세' }],
  ranger: [{ value: 'hunter', label: 'Hunter / 사냥꾼' }],
  rogue: [{ value: 'thief', label: 'Thief / 도둑' }],
  sorcerer: [{ value: 'draconic_bloodline', label: 'Draconic Bloodline / 용 혈통' }],
  warlock: [{ value: 'fiend', label: 'Fiend / 악마 후원자' }],
  wizard: [{ value: 'evocation', label: 'Evocation / 방출학파' }],
};

const subclassChoiceLevelByClass: Readonly<Record<string, number>> = {
  barbarian: 3,
  bard: 3,
  cleric: 1,
  druid: 2,
  fighter: 3,
  monk: 3,
  paladin: 3,
  ranger: 3,
  rogue: 3,
  sorcerer: 1,
  warlock: 1,
  wizard: 2,
};

function getImplementedSpellOptions(
  className: string | null | undefined,
  kind: 'cantrip' | 'slot',
  level = 1,
  ruleCatalog: RuleCatalogReferenceDto[] = []
): ImplementedSpellOption[] {
  const classKey = normalizeClassValue(className ?? '').toLowerCase();
  if (!implementedSpellClasses.has(classKey)) return [];
  const maxSpellLevel = getMaximumImplementedSpellLevel(classKey, level);
  const catalogOptions = getCatalogSpellOptions(ruleCatalog, kind, maxSpellLevel);
  if (catalogOptions.length) {
    return classKey === 'paladin' || classKey === 'ranger'
      ? kind === 'cantrip'
        ? []
        : catalogOptions
      : catalogOptions;
  }
  if (kind === 'cantrip') {
    return classKey === 'paladin' || classKey === 'ranger' ? [] : implementedCantrips;
  }
  return [
    ...implementedLevel1Spells,
    ...(maxSpellLevel >= 2 ? implementedLevel2Spells : []),
    ...(maxSpellLevel >= 3 ? implementedLevel3Spells : []),
    ...(maxSpellLevel >= 4 ? implementedLevel4Spells : []),
  ];
}

function getMaximumImplementedSpellLevel(classKey: string, level: number) {
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  if (['bard', 'cleric', 'druid', 'sorcerer', 'wizard'].includes(classKey)) {
    if (normalizedLevel >= 17) return 9;
    if (normalizedLevel >= 15) return 8;
    if (normalizedLevel >= 13) return 7;
    if (normalizedLevel >= 11) return 6;
    if (normalizedLevel >= 9) return 5;
    if (normalizedLevel >= 7) return 4;
    if (normalizedLevel >= 5) return 3;
    if (normalizedLevel >= 3) return 2;
    return 1;
  }
  if (classKey === 'warlock') {
    if (normalizedLevel >= 17) return 9;
    if (normalizedLevel >= 15) return 8;
    if (normalizedLevel >= 13) return 7;
    if (normalizedLevel >= 11) return 6;
    if (normalizedLevel >= 9) return 5;
    if (normalizedLevel >= 7) return 4;
    if (normalizedLevel >= 5) return 3;
    if (normalizedLevel >= 3) return 2;
    return 1;
  }
  if (classKey === 'paladin' || classKey === 'ranger') {
    if (normalizedLevel >= 17) return 5;
    if (normalizedLevel >= 13) return 4;
    if (normalizedLevel >= 9) return 3;
    if (normalizedLevel >= 5) return 2;
    if (normalizedLevel >= 2) return 1;
  }
  return 0;
}

function getCatalogSpellOptions(
  ruleCatalog: RuleCatalogReferenceDto[],
  kind: 'cantrip' | 'slot',
  maxSpellLevel: number
): ImplementedSpellOption[] {
  if (!ruleCatalog.length) return [];
  const normalizedMaxSpellLevel =
    kind === 'slot' ? Math.max(0, Math.min(9, Math.floor(maxSpellLevel))) : 0;
  return ruleCatalog
    .filter((entry) => entry.kind === 'spell_definitions' && entry.executable)
    .map((entry) => ({
      id: entry.id,
      label: entry.label ? `${entry.label} / ${entry.id}` : formatSpellIdLabel(entry.id),
      level: getCatalogSpellLevel(entry),
    }))
    .filter((spell) =>
      kind === 'cantrip'
        ? spell.level === 0
        : typeof spell.level === 'number' &&
          spell.level >= 1 &&
          spell.level <= normalizedMaxSpellLevel
    )
    .sort((left, right) => {
      const leftLevel = left.level ?? 99;
      const rightLevel = right.level ?? 99;
      if (leftLevel !== rightLevel) return leftLevel - rightLevel;
      return left.label.localeCompare(right.label);
    });
}

function getCatalogSpellLevel(entry: RuleCatalogReferenceDto): number | null {
  if (typeof entry.spellLevel === 'number') return entry.spellLevel;
  const tag = entry.runtimeTags?.find((item) => item.startsWith('spell_level:'));
  if (!tag) return null;
  const level = Number(tag.slice('spell_level:'.length));
  return Number.isInteger(level) ? level : null;
}

function formatSpellIdLabel(spellId: string) {
  const raw = spellId.includes('.') ? spellId.slice(spellId.lastIndexOf('.') + 1) : spellId;
  const label = raw
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return `${label || spellId} / ${spellId}`;
}

function getImplementedSpellLabel(
  spellId: string,
  ruleCatalog: RuleCatalogReferenceDto[] = []
) {
  const catalogEntry = ruleCatalog.find((entry) => entry.id === spellId);
  if (catalogEntry) {
    return catalogEntry.label ? `${catalogEntry.label} / ${spellId}` : formatSpellIdLabel(spellId);
  }
  return (
    [
      ...implementedCantrips,
      ...implementedLevel1Spells,
      ...implementedLevel2Spells,
      ...implementedLevel3Spells,
      ...implementedLevel4Spells,
    ].find((spell) => spell.id === spellId)?.label ?? spellId
  );
}

function getPreparedSpellAbilityKey(className: string | null | undefined): AbilityKey | null {
  const classKey = normalizeClassValue(className ?? '').toLowerCase();
  if (classKey === 'wizard') return 'int';
  if (classKey === 'cleric' || classKey === 'druid') return 'wis';
  if (classKey === 'paladin') return 'cha';
  return null;
}

function getAbilityModifier(score: number | null | undefined) {
  return Math.floor(((score ?? 10) - 10) / 2);
}

function getPreparedSpellLimit(
  className: string | null | undefined,
  level: number | null | undefined,
  abilities: Partial<Record<AbilityKey, number>> | null | undefined
) {
  const abilityKey = getPreparedSpellAbilityKey(className);
  if (!abilityKey) return null;
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level ?? 1)));
  const abilityModifier = getAbilityModifier(abilities?.[abilityKey]);
  const classKey = normalizeClassValue(className ?? '').toLowerCase();
  const levelBase = classKey === 'paladin' ? Math.floor(normalizedLevel / 2) : normalizedLevel;
  return Math.max(1, levelBase + abilityModifier);
}

function getSpellcastingProgressionEntry(
  klass: ClassDefinitionResponseDto | null | undefined,
  level: number
) {
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  return (
    klass?.spellcastingProgression?.find((entry) => entry.classLevel === normalizedLevel) ?? null
  );
}

function getMvpStartingSlotSpellCount(
  klass: ClassDefinitionResponseDto | null | undefined,
  className: string | null | undefined,
  level: number,
  ruleCatalog: RuleCatalogReferenceDto[] = []
) {
  if (!klass) return 0;
  const classKey = normalizeClassValue(className ?? '').toLowerCase();
  const progression = getSpellcastingProgressionEntry(klass, level);
  if (
    getPreparedSpellAbilityKey(className) &&
    classKey !== 'wizard' &&
    progression
  ) {
    return getImplementedSpellOptions(className, 'slot', level, ruleCatalog).length;
  }
  if (typeof progression?.spellsKnown === 'number') {
    return Math.min(
      progression.spellsKnown,
      getImplementedSpellOptions(className, 'slot', level, ruleCatalog).length
    );
  }
  const seededCount =
    classKey === 'wizard'
      ? getWizardStartingSpellbookSpellCount(level)
      : klass.startingSpellCount;
  return Math.min(
    seededCount,
    getImplementedSpellOptions(className, 'slot', level, ruleCatalog).length
  );
}

function buildSpellSelectionDetail(
  option: ImplementedSpellOption,
  ruleCatalog: RuleCatalogReferenceDto[],
  spellCatalogById: Map<string, StaticSpellCatalogEntry>
): SpellSelectionGridDetail {
  const srdSpell = spellCatalogById.get(option.id);
  const catalogEntry = ruleCatalog.find((entry) => entry.id === option.id);
  const specs = [
    formatSpellLevelLabel(srdSpell?.level ?? option.level ?? catalogEntry?.spellLevel ?? null),
    srdSpell?.schoolKo ?? null,
    srdSpell?.castingTime?.raw ? `시전 ${srdSpell.castingTime.raw}` : null,
    srdSpell?.range?.raw
      ? `거리 ${srdSpell.range.raw}`
      : typeof catalogEntry?.rangeFt === 'number'
        ? `거리 ${catalogEntry.rangeFt}ft`
        : null,
    catalogEntry?.targetingType ? formatTargetingType(catalogEntry.targetingType) : null,
    srdSpell?.duration?.raw ? `지속 ${srdSpell.duration.raw}` : null,
    srdSpell?.components?.raw ? `구성 ${srdSpell.components.raw}` : null,
    srdSpell?.concentration ? '집중' : null,
    srdSpell?.ritual ? '의식' : null,
  ].filter((spec): spec is string => Boolean(spec));

  return {
    specs,
    summary: srdSpell?.playReference ?? buildRuntimeTagSummary(catalogEntry?.runtimeTags ?? []),
    higherLevel: srdSpell?.higherLevel ?? null,
    scaling: srdSpell?.scaling ?? null,
    tags: normalizeRuntimeTagsForDisplay(catalogEntry?.runtimeTags ?? []),
  };
}

function attachSpellDetails(
  options: ImplementedSpellOption[],
  ruleCatalog: RuleCatalogReferenceDto[],
  spellCatalogById: Map<string, StaticSpellCatalogEntry>
): SpellSelectionGridOption[] {
  return options.map((option) => ({
    ...option,
    detail: buildSpellSelectionDetail(option, ruleCatalog, spellCatalogById),
  }));
}

function formatSpellLevelLabel(level: number | null | undefined) {
  if (level === 0) return '캔트립';
  if (typeof level === 'number') return `${level}레벨`;
  return null;
}

function formatTargetingType(targetingType: string) {
  const labels: Record<string, string> = {
    self: '대상 자신',
    creature: '대상 크리처',
    area: '범위 효과',
    point: '지점 지정',
    none: '대상 없음',
  };
  return labels[targetingType] ?? `대상 ${targetingType}`;
}

function normalizeRuntimeTagsForDisplay(tags: string[]) {
  return tags
    .filter((tag) => !tag.startsWith('spell_level:'))
    .map((tag) => tag.replace(/_/g, ' '))
    .slice(0, 8);
}

function buildRuntimeTagSummary(tags: string[]) {
  const usefulTags = normalizeRuntimeTagsForDisplay(tags).slice(0, 5);
  if (!usefulTags.length) {
    return '상세 설명이 준비되지 않은 주문입니다. 카드의 레벨, 거리, 태그를 기준으로 선택하세요.';
  }
  return `주요 효과: ${usefulTags.join(', ')}`;
}

function getWizardStartingSpellbookSpellCount(level: number) {
  const normalizedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  return (
    WIZARD_STARTING_SPELLBOOK_SPELL_COUNT +
    (normalizedLevel - 1) * WIZARD_SPELLBOOK_SPELLS_PER_LEVEL
  );
}

function getMvpStartingCantripCount(
  klass: ClassDefinitionResponseDto | null | undefined,
  className: string | null | undefined,
  level: number,
  ruleCatalog: RuleCatalogReferenceDto[] = []
) {
  if (!klass) return 0;
  const progression = getSpellcastingProgressionEntry(klass, level);
  return Math.min(
    progression?.cantripsKnown ?? klass.startingCantripCount,
    getImplementedSpellOptions(className, 'cantrip', level, ruleCatalog).length
  );
}

// 직업별 기본 초상화 프리셋입니다. 사용자가 이미지를 올리기 전 기본 이미지로 씁니다.
const avatarPresets = [
  { id: 'preset_wizard', label: '위자드', image: defaultWizardImage },
  { id: 'preset_archer', label: '레인저', image: defaultArcherImage },
  { id: 'preset_rogue', label: '로그', image: defaultRogueImage },
  { id: 'preset_warrior', label: '파이터', image: defaultWarriorImage },
] as const;

// 직업별 추천 HP/AC/공격 보너스/능력치 성장 기준입니다.
const classStatProfiles: Record<ClassName, ClassStatProfile> = {
  Barbarian: {
    base: {
      maxHp: 14,
      armorClass: 14,
      speed: 30,
      abilities: {
        str: 15,
        dex: 12,
        int: 8,
      },
    },
    growth: {
      maxHp: 7,
      armorClass: 0,
      abilities: {
        str: 0.3,
        dex: 0,
        int: 0,
      },
    },
  },
  Bard: {
    base: {
      maxHp: 10,
      armorClass: 13,
      speed: 30,
      abilities: {
        str: 8,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.2,
        int: 0,
      },
    },
  },
  Cleric: {
    base: {
      maxHp: 10,
      armorClass: 16,
      speed: 30,
      abilities: {
        str: 12,
        dex: 10,
        int: 8,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0,
        int: 0,
      },
    },
  },
  Druid: {
    base: {
      maxHp: 10,
      armorClass: 13,
      speed: 30,
      abilities: {
        str: 8,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.2,
        int: 0,
      },
    },
  },
  Fighter: {
    base: {
      maxHp: 20,
      armorClass: 18,
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
  Monk: {
    base: {
      maxHp: 10,
      armorClass: 15,
      speed: 30,
      abilities: {
        str: 10,
        dex: 15,
        int: 8,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.4,
        int: 0,
      },
    },
  },
  Paladin: {
    base: {
      maxHp: 12,
      armorClass: 18,
      speed: 30,
      abilities: {
        str: 15,
        dex: 8,
        int: 8,
      },
    },
    growth: {
      maxHp: 6,
      armorClass: 0,
      abilities: {
        str: 0.3,
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
  Sorcerer: {
    base: {
      maxHp: 8,
      armorClass: 12,
      speed: 30,
      abilities: {
        str: 8,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 4,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.2,
        int: 0,
      },
    },
  },
  Warlock: {
    base: {
      maxHp: 10,
      armorClass: 13,
      speed: 30,
      abilities: {
        str: 8,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 5,
      armorClass: 0,
      abilities: {
        str: 0,
        dex: 0.2,
        int: 0,
      },
    },
  },
  Wizard: {
    base: {
      maxHp: 12,
      armorClass: 12,
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

// 클래스 시드의 skillChoices 가 한국어이므로 표시·전송 모두 한국어를 정규형으로 사용한다.
const allSkillsKo: readonly string[] = DND5E_SKILLS_INLINE.map((entry) => entry.ko);
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

const fightingStyleOptions = [
  { value: 'archery', label: 'Archery', effect: '원거리 무기 공격 명중 굴림 +2' },
  { value: 'defense', label: 'Defense', effect: '갑옷 착용 중 AC +1' },
  {
    value: 'dueling',
    label: 'Dueling',
    effect: '한 손 근접 무기 하나만 들고 싸우면 피해 +2',
  },
  {
    value: 'great_weapon_fighting',
    label: 'Great Weapon Fighting',
    effect: '양손/겸용 근접 무기 피해 주사위 1 또는 2 재굴림',
  },
  {
    value: 'protection',
    label: 'Protection',
    effect: '방패 착용 중 5ft 이내 아군 피격 시 reaction으로 공격 불리점 부여',
  },
  {
    value: 'two_weapon_fighting',
    label: 'Two-Weapon Fighting',
    effect: '쌍수 보조 공격 피해에도 능력 수정치 추가',
  },
];

const favoredEnemyOptions = [
  { value: 'aberrations', label: '변이체' },
  { value: 'beasts', label: '야수' },
  { value: 'celestials', label: '천상체' },
  { value: 'constructs', label: '구조체' },
  { value: 'dragons', label: '용' },
  { value: 'elementals', label: '정령' },
  { value: 'fey', label: '요정' },
  { value: 'fiends', label: '악마' },
  { value: 'giants', label: '거인' },
  { value: 'monstrosities', label: '괴수' },
  { value: 'oozes', label: '점액체' },
  { value: 'plants', label: '식물' },
  { value: 'undead', label: '언데드' },
  { value: 'humanoid', label: '인간형 2종' },
];

const favoredHumanoidOptions = [
  { value: 'dwarves', label: '드워프' },
  { value: 'elves', label: '엘프' },
  { value: 'halflings', label: '하플링' },
  { value: 'humans', label: '인간' },
  { value: 'dragonborn', label: '드래곤본' },
  { value: 'gnomes', label: '노움' },
  { value: 'half-elves', label: '하프엘프' },
  { value: 'half-orcs', label: '하프오크' },
  { value: 'tieflings', label: '티플링' },
  { value: 'gnolls', label: '놀' },
  { value: 'goblins', label: '고블린' },
  { value: 'hobgoblins', label: '홉고블린' },
  { value: 'kobolds', label: '코볼드' },
  { value: 'lizardfolk', label: '리자드포크' },
  { value: 'orcs', label: '오크' },
];

const draconicAncestryOptions = [
  { value: 'black', label: 'Black / 산성' },
  { value: 'blue', label: 'Blue / 번개' },
  { value: 'brass', label: 'Brass / 화염' },
  { value: 'bronze', label: 'Bronze / 번개' },
  { value: 'copper', label: 'Copper / 산성' },
  { value: 'gold', label: 'Gold / 화염' },
  { value: 'green', label: 'Green / 독' },
  { value: 'red', label: 'Red / 화염' },
  { value: 'silver', label: 'Silver / 냉기' },
  { value: 'white', label: 'White / 냉기' },
];

const startingEquipmentConcreteChoiceOptions = {
  simpleWeapon: {
    label: '단순 무기',
    options: [
      { value: 'dagger', label: '단검' },
      { value: 'dart', label: '다트' },
      { value: 'handaxe', label: '핸드액스' },
      { value: 'javelin', label: '재블린' },
      { value: 'light-crossbow', label: '라이트 크로스보우' },
      { value: 'mace', label: '메이스' },
      { value: 'quarterstaff', label: '쿼터스태프' },
      { value: 'shortbow', label: '쇼트보우' },
    ],
  },
  simpleMeleeWeapon: {
    label: '단순 근접 무기',
    options: [
      { value: 'dagger', label: '단검' },
      { value: 'handaxe', label: '핸드액스' },
      { value: 'javelin', label: '재블린' },
      { value: 'mace', label: '메이스' },
      { value: 'quarterstaff', label: '쿼터스태프' },
    ],
  },
  martialWeapon: {
    label: '군용 무기',
    options: [
      { value: 'greataxe', label: '그레이트액스' },
      { value: 'longsword', label: '롱소드' },
      { value: 'longbow', label: '롱보우' },
      { value: 'rapier', label: '레이피어' },
      { value: 'scimitar', label: '시미터' },
      { value: 'shortsword', label: '쇼트소드' },
      { value: 'warhammer', label: '워해머' },
    ],
  },
  martialMeleeWeapon: {
    label: '군용 근접 무기',
    options: [
      { value: 'greataxe', label: '그레이트액스' },
      { value: 'longsword', label: '롱소드' },
      { value: 'rapier', label: '레이피어' },
      { value: 'scimitar', label: '시미터' },
      { value: 'shortsword', label: '쇼트소드' },
      { value: 'warhammer', label: '워해머' },
    ],
  },
  instrument: {
    label: '악기',
    options: [{ value: 'lute', label: '류트' }],
  },
} as const;

type StartingEquipmentConcreteChoice =
  (typeof startingEquipmentConcreteChoiceOptions)[keyof typeof startingEquipmentConcreteChoiceOptions];

const classFeatureIdsByClassKey: Record<string, string[]> = {
  barbarian: ['class.barbarian.feature.rage', 'class.barbarian.feature.unarmored_defense'],
  bard: ['class.bard.feature.spellcasting', 'class.bard.feature.bardic_inspiration'],
  cleric: ['class.cleric.feature.spellcasting', 'class.cleric.feature.divine_domain'],
  druid: ['class.druid.feature.druidic', 'class.druid.feature.spellcasting'],
  fighter: ['class.fighter.feature.second_wind', 'class.fighter.feature.fighting_style'],
  monk: ['class.monk.feature.unarmored_defense', 'class.monk.feature.martial_arts'],
  paladin: ['class.paladin.feature.divine_sense', 'class.paladin.feature.lay_on_hands'],
  ranger: ['class.ranger.feature.favored_enemy', 'class.ranger.feature.natural_explorer'],
  rogue: [
    'class.rogue.feature.expertise',
    'class.rogue.feature.sneak_attack',
    'class.rogue.feature.thieves_cant',
  ],
  sorcerer: ['class.sorcerer.feature.spellcasting', 'class.sorcerer.feature.sorcerous_origin'],
  warlock: ['class.warlock.feature.otherworldly_patron', 'class.warlock.feature.pact_magic'],
  wizard: ['class.wizard.feature.spellcasting', 'class.wizard.feature.arcane_recovery'],
};
const managedClassFeatureIds = new Set(Object.values(classFeatureIdsByClassKey).flat());

const classChoiceFeaturePrefixes = [
  'fighting_style:',
  'favored_enemy:',
  'favored_enemy_humanoid:',
  'expertise:',
];

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

function clampAbilitiesToPointBuyRange(
  abilities: Record<AbilityKey, number>,
  abilityIncreases: Record<AbilityKey, number>
) {
  const clampBase = (ability: AbilityKey) =>
    Math.min(
      POINT_BUY_MAX_BASE,
      Math.max(POINT_BUY_MIN_BASE, abilities[ability] - abilityIncreases[ability])
    ) + abilityIncreases[ability];

  return {
    str: clampBase('str'),
    dex: clampBase('dex'),
    con: clampBase('con'),
    int: clampBase('int'),
    wis: clampBase('wis'),
    cha: clampBase('cha'),
  };
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
    subclassName: null,
    avatarType: 'PRESET',
    avatarPresetId: 'preset_wizard',
    avatarUrl: null,
    scenarioId: null,
    level: 1,
    abilities: baseEightAbilities,
    proficiencyBonus: recommendedStats.proficiencyBonus,
    proficientSkills: [],
    features: [],
    startingEquipmentItemSelections: {},
    maxHp: recommendedStats.maxHp,
    armorClass: recommendedStats.armorClass,
    speed: recommendedStats.speed,
    inventory: [],
    equippedWeaponId: null,
    offhandWeaponId: null,
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
  // 영문 코드("Arcana")로 저장된 legacy 캐릭터도 한국어로 표시되도록 normalize.
  // 매칭 실패 시 입력값 그대로 (예측 못한 한국어 변형 보존).
  const trimmed = skill.trim();
  return normalizeSkillToKo(trimmed) ?? trimmed;
}

function getPresetIdForClassName(className: string) {
  return presetIdByClassName.get(className) ?? 'preset_wizard';
}

function getClassNameForPresetId(presetId: string) {
  return classNameByPresetId.get(presetId) ?? 'Wizard';
}

function getFeatureValue(features: string[] | undefined, prefix: string) {
  return (features ?? []).find((feature) => feature.startsWith(prefix))?.slice(prefix.length) ?? '';
}

function getFeatureValues(features: string[] | undefined, prefix: string) {
  return (features ?? [])
    .filter((feature) => feature.startsWith(prefix))
    .map((feature) => feature.slice(prefix.length));
}

function replaceFeatureTags(
  features: string[] | undefined,
  removedPrefixes: string[],
  addedFeatures: string[]
) {
  const next = (features ?? []).filter(
    (feature) => !removedPrefixes.some((prefix) => feature.startsWith(prefix))
  );
  return Array.from(new Set([...next, ...addedFeatures.filter(Boolean)]));
}

function buildClassFeaturesForSubmit(className: string, features: string[] | undefined) {
  const classKey = normalizeClassValue(className).toLowerCase();
  const baseFeatures = classFeatureIdsByClassKey[classKey] ?? [];
  const unmanagedFeatures = (features ?? []).filter(
    (feature) =>
      !managedClassFeatureIds.has(feature) &&
      !classChoiceFeaturePrefixes.some((prefix) => feature.startsWith(prefix))
  );
  const choiceFeatures = (features ?? []).filter((feature) =>
    classChoiceFeaturePrefixes.some((prefix) => feature.startsWith(prefix))
  );
  return Array.from(new Set([...unmanagedFeatures, ...baseFeatures, ...choiceFeatures]));
}

function hasRequiredClassFeatureChoices(className: string, features: string[] | undefined) {
  const classKey = normalizeClassValue(className).toLowerCase();
  if (classKey === 'fighter') {
    return Boolean(getFeatureValue(features, 'fighting_style:'));
  }
  if (classKey === 'ranger') {
    const favoredEnemy = getFeatureValue(features, 'favored_enemy:');
    if (!favoredEnemy) return false;
    if (favoredEnemy !== 'humanoid') return true;
    const humanoidRaces = getFeatureValues(features, 'favored_enemy_humanoid:');
    return humanoidRaces.length === 2 && new Set(humanoidRaces).size === 2;
  }
  if (classKey === 'rogue') {
    return getFeatureValues(features, 'expertise:').length === 2;
  }
  return true;
}

function hasRequiredRaceFeatureChoices(
  ancestry: string,
  features: string[] | undefined
) {
  if (ancestry.trim().toLowerCase().replace(/_/g, '-') === 'dragonborn') {
    return Boolean(getFeatureValue(features, 'draconic_ancestry:'));
  }
  return true;
}

function getStartingEquipmentItemSelectionKey(slotIndex: number, itemIndex: number) {
  return `${slotIndex}:${itemIndex}`;
}

function getStartingEquipmentConcreteChoice(
  itemKey: string
): StartingEquipmentConcreteChoice | null {
  switch (itemKey) {
    case 'simple-weapon-1':
    case 'simple-weapon-2':
      return startingEquipmentConcreteChoiceOptions.simpleWeapon;
    case 'simple-melee-weapon-1':
    case 'simple-melee-weapon-2':
      return startingEquipmentConcreteChoiceOptions.simpleMeleeWeapon;
    case 'martial-weapon-1':
    case 'martial-weapon-2':
      return startingEquipmentConcreteChoiceOptions.martialWeapon;
    case 'martial-melee-weapon-1':
      return startingEquipmentConcreteChoiceOptions.martialMeleeWeapon;
    case 'musical-instrument-1':
      return startingEquipmentConcreteChoiceOptions.instrument;
    default:
      return null;
  }
}

function clearStartingEquipmentItemSelectionsForSlot(
  selections: Record<string, string> | undefined,
  slotIndex: number
) {
  if (!selections) return {};
  return Object.fromEntries(
    Object.entries(selections).filter(([key]) => !key.startsWith(`${slotIndex}:`))
  );
}

function hasRequiredStartingEquipmentItemSelections(
  selectedClass: ClassDefinitionResponseDto | null | undefined,
  payload: CharacterPayload
) {
  if (!selectedClass) return true;
  return getClassStartingEquipmentSlots(selectedClass).every((slot, slotIndex) => {
    const selectedOptionIndex = payload.startingEquipmentSelection?.[slotIndex] ?? 0;
    const selectedOption = slot.options[selectedOptionIndex] ?? slot.options[0];
    if (!selectedOption) return false;

    return selectedOption.items.every((item, itemIndex) => {
      const choice = getStartingEquipmentConcreteChoice(item.itemKey);
      if (!choice) return true;
      const selectionKey = getStartingEquipmentItemSelectionKey(slotIndex, itemIndex);
      return Boolean(payload.startingEquipmentItemSelections?.[selectionKey]);
    });
  });
}

function getClassStartingEquipmentSlots(selectedClass: ClassDefinitionResponseDto) {
  if (selectedClass.key !== 'fighter') {
    return selectedClass.startingEquipment.slots;
  }

  return selectedClass.startingEquipment.slots.map((slot) => ({
    ...slot,
    options: slot.options.filter(
      (option) => !option.items.some((item) => item.itemKey === 'martial-weapon-2')
    ),
  }));
}

function normalizeRaceLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
}

function getRaceByValue(raceCatalog: RaceData[], value: string): RaceData | null {
  const normalizedValue = normalizeRaceLookupValue(value);
  if (!normalizedValue) return null;
  return (
    raceCatalog.find((option) =>
      [
        option.value,
        option.label,
        option.id,
        option.id.includes('.') ? option.id.slice(option.id.lastIndexOf('.') + 1) : option.id,
      ].some((candidate) => normalizeRaceLookupValue(candidate) === normalizedValue)
    ) ?? null
  );
}

function buildRaceAbilityBonusesFromIncreases(
  abilityIncreases: RaceResponseDto['abilityIncreases']
): RaceAbilityBonus[] {
  return (Object.entries(abilityIncreases) as Array<[AbilityKey, number]>)
    .filter(([, amount]) => amount !== 0)
    .map(([ability, amount]) => ({ ability, amount }));
}

function buildSelectedRaceInfo(
  selectedRace: RaceResponseDto | null,
  staticRaceInfo: RaceData | null
): RaceData | null {
  if (!selectedRace) return staticRaceInfo;
  return {
    id: selectedRace.id,
    value: selectedRace.key,
    label: selectedRace.koName,
    size: selectedRace.size,
    speed: selectedRace.baseSpeed,
    speedRaw: `${selectedRace.baseSpeed} ft.`,
    abilityScoreIncreaseRaw: buildRaceAbilityBonusesFromIncreases(selectedRace.abilityIncreases)
      .map(formatAbilityBonus)
      .join(', '),
    abilityBonuses: buildRaceAbilityBonusesFromIncreases(selectedRace.abilityIncreases),
    languages: selectedRace.languages,
    traitSummaries: staticRaceInfo?.traitSummaries ?? [],
  };
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
  onLevelUpCharacter,
  onUpdatePreparedSpells,
  onDeleteCharacter,
  autoOpenCreate = false,
  sessionReturnTitle = null,
  onReturnToSession,
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
  const [formValidationError, setFormValidationError] = useState<string | null>(null);
  const [createToast, setCreateToast] = useState<{ id: number; message: string } | null>(null);
  const [createStepIndex, setCreateStepIndex] = useState(0);
  const [isStatsReferenceOpen, setStatsReferenceOpen] = useState(false);
  const [itemCatalog, setItemCatalog] = useState<ItemResponseDto[]>([]);
  const [ruleCatalog, setRuleCatalog] = useState<RuleCatalogReferenceDto[]>([]);
  const [spellCatalog, setSpellCatalog] = useState<StaticSpellCatalogEntry[]>([]);
  const [levelUpDraft, setLevelUpDraft] = useState<{
    targetLevel: number;
    subclassName: string;
    cantrips: string[];
    knownSpells: string[];
    forgottenCantrips: string[];
    forgottenSpells: string[];
    preparedSpells: string[];
    abilityScoreIncreases: Record<AbilityKey, number>;
  }>({
    targetLevel: 2,
    subclassName: '',
    cantrips: [],
    knownSpells: [],
    forgottenCantrips: [],
    forgottenSpells: [],
    preparedSpells: [],
    abilityScoreIncreases: createEmptyAbilityScoreIncreases(),
  });
  // 인벤토리 편집 영역 DOM 참조입니다. 필요 시 스크롤/포커스 제어에 씁니다.
  const inventoryEditorRef = useRef<HTMLDivElement | null>(null);
  const didAutoOpenCreateRef = useRef(false);
  const createToastTimeoutRef = useRef<number | null>(null);

  function clearCreateToastTimer() {
    if (createToastTimeoutRef.current) {
      window.clearTimeout(createToastTimeoutRef.current);
      createToastTimeoutRef.current = null;
    }
  }

  function showCreateToast(message: string) {
    const nextToast = { id: Date.now(), message };
    setCreateToast(nextToast);
    clearCreateToastTimer();
    createToastTimeoutRef.current = window.setTimeout(() => {
      setCreateToast((current) => (current?.id === nextToast.id ? null : current));
      createToastTimeoutRef.current = null;
    }, 3000);
  }

  useEffect(() => {
    listItems()
      .then(setItemCatalog)
      .catch(() => undefined);
    listRuleCatalog()
      .then(setRuleCatalog)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isCreateModalOpen) {
      clearCreateToastTimer();
      setCreateToast(null);
      return;
    }
    if (formValidationError) {
      showCreateToast(formValidationError);
    }
  }, [formValidationError, isCreateModalOpen]);

  useEffect(() => {
    if (!isCreateModalOpen || !error) return;
    showCreateToast(error);
  }, [error, isCreateModalOpen]);

  useEffect(() => () => clearCreateToastTimer(), []);

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
  const resolvedStartingEquipmentSummary = useMemo(() => {
    if (!selectedClass) return [];

    return getClassStartingEquipmentSlots(selectedClass).flatMap((slot, slotIndex) => {
      const selectedOptionIndex = formState.startingEquipmentSelection?.[slotIndex] ?? 0;
      const selectedOption = slot.options[selectedOptionIndex] ?? slot.options[0];
      if (!selectedOption) return [];

      return selectedOption.items.map((item, itemIndex) => {
        const concreteChoice = getStartingEquipmentConcreteChoice(item.itemKey);
        const selectionKey = getStartingEquipmentItemSelectionKey(slotIndex, itemIndex);
        const selectedConcreteKey = formState.startingEquipmentItemSelections?.[selectionKey];
        const concreteLabel = concreteChoice
          ? (concreteChoice.options.find((option) => option.value === selectedConcreteKey)?.label ??
            `${concreteChoice.label} 미선택`)
          : null;
        const label = concreteLabel ?? itemKoNameByKey.get(item.itemKey) ?? item.itemKey;

        return {
          key: `${slotIndex}:${itemIndex}:${item.itemKey}`,
          label,
          quantity: item.quantity,
          pending: Boolean(concreteChoice && !selectedConcreteKey),
        };
      });
    });
  }, [
    formState.startingEquipmentItemSelections,
    formState.startingEquipmentSelection,
    itemKoNameByKey,
    selectedClass,
  ]);
  const selectedCreateClassKey = normalizeClassValue(formState.className ?? '').toLowerCase();
  const selectedCreateSubclassOptions =
    implementedSubclassOptions[selectedCreateClassKey] ?? [];
  const selectedCreateSubclassChoiceLevel =
    subclassChoiceLevelByClass[selectedCreateClassKey] ?? null;
  const isCreateSubclassRequired =
    selectedCreateSubclassChoiceLevel !== null &&
    (formState.level ?? 1) >= selectedCreateSubclassChoiceLevel;
  const spellCatalogById = useMemo(
    () => new Map(spellCatalog.map((spell) => [spell.id, spell] as const)),
    [spellCatalog]
  );
  const cantripOptions = useMemo(
    () => getImplementedSpellOptions(formState.className, 'cantrip', formState.level ?? 1, ruleCatalog),
    [formState.className, formState.level, ruleCatalog]
  );
  const detailedCantripOptions = useMemo(
    () => attachSpellDetails(cantripOptions, ruleCatalog, spellCatalogById),
    [cantripOptions, ruleCatalog, spellCatalogById]
  );
  const selectedStartingCantripCount = getMvpStartingCantripCount(
    selectedClass,
    formState.className,
    formState.level ?? 1,
    ruleCatalog
  );
  const slotSpellOptions = useMemo(
    () => getImplementedSpellOptions(formState.className, 'slot', formState.level ?? 1, ruleCatalog),
    [formState.className, formState.level, ruleCatalog]
  );
  const detailedSlotSpellOptions = useMemo(
    () => attachSpellDetails(slotSpellOptions, ruleCatalog, spellCatalogById),
    [slotSpellOptions, ruleCatalog, spellCatalogById]
  );
  const selectedStartingSlotSpellCount = getMvpStartingSlotSpellCount(
    selectedClass,
    formState.className,
    formState.level ?? 1,
    ruleCatalog
  );
  const startingPreparedSpellLimit = useMemo(
    () => getPreparedSpellLimit(formState.className, formState.level, formState.abilities),
    [formState.abilities, formState.className, formState.level]
  );
  const selectedStartingSlotSpells = useMemo(
    () =>
      Array.from(
        new Set((formState.startingSpells?.spells ?? []).map((spell) => spell.trim()).filter(Boolean))
      ),
    [formState.startingSpells?.spells]
  );
  const selectedStartingPreparedSpells = formState.startingSpells?.preparedSpells ?? [];

  // ancestry → race(시드)룩업. ancestry 가 race.key 또는 race.koName 와 매칭되면 보정 적용.
  const selectedRace = useMemo<RaceResponseDto | null>(() => {
    const ancestry = (formState.ancestry ?? '').trim();
    if (!ancestry) return null;
    const lower = ancestry.toLowerCase();
    return races.find((r) => r.key === lower) ?? races.find((r) => r.koName === ancestry) ?? null;
  }, [formState.ancestry, races]);

  // Point Buy 계산 결과(base/cost/총비용/남은 포인트). selectedRace 없으면 검증 비활성화.
  const pointBuyState = useMemo(() => {
    const finals = formState.abilities ?? {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    };
    const increases = selectedRace?.abilityIncreases ?? {
      str: 0,
      dex: 0,
      con: 0,
      int: 0,
      wis: 0,
      cha: 0,
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
      0
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
    const hpBonus =
      (selectedRace?.key === 'hill-dwarf' ? level : 0) +
      (selectedClass.key === 'sorcerer' && formState.subclassName === 'draconic_bloodline'
        ? level
        : 0);
    const maxHp = hd.max + conMod + (level - 1) * Math.max(hd.avg + conMod, 1) + hpBonus;
    return { proficiencyBonus, maxHp, hpBonus };
  }, [
    selectedClass,
    selectedRace?.key,
    formState.level,
    formState.abilities?.con,
    formState.subclassName,
  ]);

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
      if (delta > 0) {
        const currentAbilities = current.abilities ?? {
          str: 10,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
        };
        const currentBases = {
          str: currentAbilities.str - (selectedRace?.abilityIncreases.str ?? 0),
          dex: currentAbilities.dex - (selectedRace?.abilityIncreases.dex ?? 0),
          con: currentAbilities.con - (selectedRace?.abilityIncreases.con ?? 0),
          int: currentAbilities.int - (selectedRace?.abilityIncreases.int ?? 0),
          wis: currentAbilities.wis - (selectedRace?.abilityIncreases.wis ?? 0),
          cha: currentAbilities.cha - (selectedRace?.abilityIncreases.cha ?? 0),
        };
        const currentTotalCost = (Object.values(currentBases) as number[]).reduce(
          (sum, base) => sum + (POINT_BUY_COST[base] ?? 0),
          0
        );
        const nextCost = POINT_BUY_COST[nextBase] ?? 0;
        const currentCost = POINT_BUY_COST[currentBase] ?? 0;
        const stepCost = nextCost - currentCost;
        const remaining = POINT_BUY_TOTAL - currentTotalCost;
        if (stepCost > remaining) {
          return current;
        }
      }
      const currentAbilities = current.abilities ?? {
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
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

    Promise.all([loadClassOptions(), loadRaceData(), loadSpellCatalog()])
      .then(([loadedClasses, loadedRaces, loadedSpells]) => {
        if (ignore) {
          return;
        }
        setClassCatalog(loadedClasses);
        setRaceCatalog(loadedRaces);
        setSpellCatalog(loadedSpells);
      })
      .catch((caught) => {
        if (!ignore) {
          setCatalogError(
            caught instanceof Error
              ? caught.message
              : '정적 SRD 직업/종족/주문 데이터를 불러오지 못했습니다.'
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
  const selectedCharacterClassKey = normalizeClassValue(selectedCharacter?.className ?? '').toLowerCase();
  const selectedCharacterClassDefinition =
    classDefinitions.find((klass) => klass.key === selectedCharacterClassKey) ?? null;
  const selectedSubclassOptions = selectedCharacter
    ? (implementedSubclassOptions[selectedCharacterClassKey] ?? [])
    : [];
  const selectedSubclassChoiceLevel =
    subclassChoiceLevelByClass[selectedCharacterClassKey] ?? null;
  const isSelectedCharacterPreparedCaster =
    getPreparedSpellAbilityKey(selectedCharacter?.className) !== null;
  const isSelectedCharacterWizard = selectedCharacterClassKey === 'wizard';
  const selectedCurrentCantrips = selectedCharacter?.spells?.cantrips ?? [];
  const currentSpellcastingProgression = selectedCharacter
    ? getSpellcastingProgressionEntry(
        selectedCharacterClassDefinition,
        selectedCharacter.level
      )
    : null;
  const targetSpellcastingProgression = getSpellcastingProgressionEntry(
    selectedCharacterClassDefinition,
    levelUpDraft.targetLevel
  );
  const levelUpLevelDelta = selectedCharacter
    ? Math.max(0, levelUpDraft.targetLevel - selectedCharacter.level)
    : 0;
  const cantripLearnAllowance =
    Math.max(
      0,
      (targetSpellcastingProgression?.cantripsKnown ?? 0) -
        (currentSpellcastingProgression?.cantripsKnown ?? 0)
    ) + levelUpDraft.forgottenCantrips.length;
  const knownSpellLearnAllowance =
    (isSelectedCharacterWizard
      ? levelUpLevelDelta * 2
      : Math.max(
          0,
          (targetSpellcastingProgression?.spellsKnown ?? 0) -
            (currentSpellcastingProgression?.spellsKnown ?? 0)
        )) + levelUpDraft.forgottenSpells.length;
  const canSelectKnownSpellGrowth =
    isSelectedCharacterWizard ||
    typeof targetSpellcastingProgression?.spellsKnown === 'number';
  const isLevelUpSubclassRequired = Boolean(
    selectedCharacter &&
      !selectedCharacter.subclassName &&
      selectedSubclassChoiceLevel !== null &&
      levelUpDraft.targetLevel >= selectedSubclassChoiceLevel
  );
  const selectedKnownSlotSpells = useMemo(
    () => selectedCharacter?.spells?.spells ?? [],
    [selectedCharacter]
  );
  const selectedLevelUpLearnableSlotSpells = useMemo(() => {
    if (!selectedCharacter || !canSelectKnownSpellGrowth) return [];
    const known = new Set(selectedKnownSlotSpells);
    return getImplementedSpellOptions(
      selectedCharacter.className,
      'slot',
      levelUpDraft.targetLevel,
      ruleCatalog
    ).filter((spell) => !known.has(spell.id));
  }, [
    canSelectKnownSpellGrowth,
    levelUpDraft.targetLevel,
    ruleCatalog,
    selectedCharacter,
    selectedKnownSlotSpells,
  ]);
  const selectedLevelUpLearnableCantrips = useMemo(() => {
    if (
      !selectedCharacter ||
      typeof targetSpellcastingProgression?.cantripsKnown !== 'number'
    ) return [];
    const known = new Set(selectedCurrentCantrips);
    return getImplementedSpellOptions(
      selectedCharacter.className,
      'cantrip',
      levelUpDraft.targetLevel,
      ruleCatalog
    ).filter(
      (spell) => !known.has(spell.id)
    );
  }, [
    levelUpDraft.targetLevel,
    ruleCatalog,
    selectedCharacter,
    selectedCurrentCantrips,
    targetSpellcastingProgression?.cantripsKnown,
  ]);
  const selectedPreparedCandidateSlotSpells = useMemo(
    () =>
      isSelectedCharacterPreparedCaster
        ? Array.from(new Set([...selectedKnownSlotSpells, ...levelUpDraft.knownSpells]))
        : [],
    [
      isSelectedCharacterPreparedCaster,
      levelUpDraft.knownSpells,
      selectedKnownSlotSpells,
    ]
  );
  const selectedPreparedSpells = useMemo(
    () => selectedCharacter?.spells?.preparedSpells ?? [],
    [selectedCharacter]
  );
  const selectedPreviewContext = selectedCharacter?.levelUpPreviewContext ?? null;
  const selectedActiveSessionConditions = selectedCharacter?.activeSessionConditions ?? [];
  const selectedHasActiveConcentration = selectedActiveSessionConditions.some((condition) =>
    condition.toLowerCase().includes('concentration') || condition.includes('집중')
  );
  const selectedEquippedWeapon = selectedCharacter?.inventory.find(
    (item) =>
      item.id === selectedCharacter.equippedWeaponId ||
      item.itemDefinitionId === selectedCharacter.equippedWeaponId
  );
  const selectedOffhandWeapon = selectedCharacter?.inventory.find(
    (item) =>
      item.id === selectedCharacter.offhandWeaponId ||
      item.itemDefinitionId === selectedCharacter.offhandWeaponId
  );
  const crossedAsiLevels = selectedCharacter
    ? getCrossedAsiLevels(
        selectedCharacterClassKey,
        selectedCharacter.level,
        levelUpDraft.targetLevel
      )
    : [];
  const requiredAsiPoints = crossedAsiLevels.length * 2;
  const allocatedAsiPoints = (Object.values(levelUpDraft.abilityScoreIncreases) as number[]).reduce(
    (sum, value) => sum + value,
    0
  );
  const remainingAsiPoints = requiredAsiPoints - allocatedAsiPoints;
  const levelUpAbilities = selectedCharacter
    ? (Object.fromEntries(
        (Object.keys(abilityDisplayLabels) as AbilityKey[]).map((ability) => [
          ability,
          selectedCharacter.abilities[ability] + levelUpDraft.abilityScoreIncreases[ability],
        ])
      ) as Record<AbilityKey, number>)
    : null;
  const selectedLevelUpPreparedSpellLimit = selectedCharacter
    ? getPreparedSpellLimit(
        selectedCharacter.className,
        levelUpDraft.targetLevel,
        levelUpAbilities
      )
    : null;
  const isLevelUpPreparedSpellLimitExceeded =
    selectedLevelUpPreparedSpellLimit !== null &&
    levelUpDraft.preparedSpells.length > selectedLevelUpPreparedSpellLimit;
  const isLevelUpSpellReplacementIncomplete =
    levelUpDraft.knownSpells.length < levelUpDraft.forgottenSpells.length ||
    levelUpDraft.cantrips.length < levelUpDraft.forgottenCantrips.length;
  const levelUpPreviewRows = selectedCharacter
    ? [
        {
          label: '진행 중 세션',
          value: selectedPreviewContext?.activeSessionId
            ? `세션 ${selectedPreviewContext.activeSessionId} · ${selectedPreviewContext.activeSessionStatus ?? '상태 미확인'} · 현재 노드 ${
                selectedPreviewContext.currentNodeId ?? '없음'
              }`
            : '진행 중 세션 없음',
        },
        {
          label: '조건/집중',
          value: selectedPreviewContext
            ? `조건 ${selectedPreviewContext.activeConditionCount}개${
                selectedPreviewContext.hasActiveConcentration ? ' · 집중 효과 있음' : ''
              }`
            : selectedActiveSessionConditions.length
              ? `${selectedActiveSessionConditions.slice(0, 4).join(', ')}${
                  selectedActiveSessionConditions.length > 4 ? ' 외' : ''
                }${selectedHasActiveConcentration ? ' · 집중 유지/종료 영향 확인 필요' : ''}`
            : '활성 조건 없음',
        },
        {
          label: '장비',
          value: `소지품 ${selectedPreviewContext?.inventoryItemCount ?? selectedCharacter.inventory.length}개 · 주무기 ${
            selectedEquippedWeapon?.name ?? selectedPreviewContext?.equippedWeaponId ?? selectedCharacter.equippedWeaponId ?? '없음'
          } · 보조 ${
            selectedOffhandWeapon?.name ?? selectedPreviewContext?.offhandWeaponId ?? selectedCharacter.offhandWeaponId ?? '없음'
          }`,
        },
        {
          label: '준비 주문',
          value: selectedCharacter.spells
            ? `알고 있는 주문 ${selectedPreviewContext?.knownSpellCount ?? selectedKnownSlotSpells.length + selectedCurrentCantrips.length}개 · 준비 ${
                levelUpDraft.preparedSpells.length
              }/${selectedLevelUpPreparedSpellLimit ?? '제한 없음'}개 예정`
            : '주문 없음',
        },
        {
          label: 'Downtime',
          value: selectedPreviewContext
            ? `진행/일시정지 ${selectedPreviewContext.activeDowntimeTaskCount}개 · 완료 ${selectedPreviewContext.completedDowntimeTaskCount}개 · 경제 상태 ${
                selectedPreviewContext.hasEconomyState ? '있음' : '없음'
              }`
            : '세션 배정 후 downtime 영향 확인 가능',
        },
        {
          label: 'Archive / 이관',
          value: selectedPreviewContext
            ? `archive ${selectedPreviewContext.campaignArchiveAvailable ? '있음' : '없음'} · 이관 ${
                selectedPreviewContext.transferEligibility === 'transfer_allowed'
                  ? '허용'
                  : selectedPreviewContext.transferEligibility === 'transfer_blocked'
                    ? '차단'
                    : '미보관'
              }`
            : '완료 캠페인 archive 없음',
        },
      ]
    : [];

  useEffect(() => {
    if (!selectedCharacter) {
      setLevelUpDraft({
        targetLevel: 2,
        subclassName: '',
        cantrips: [],
        knownSpells: [],
        forgottenCantrips: [],
        forgottenSpells: [],
        preparedSpells: [],
        abilityScoreIncreases: createEmptyAbilityScoreIncreases(),
      });
      return;
    }

    setLevelUpDraft({
      targetLevel: Math.min(20, Math.max(2, selectedCharacter.level + 1)),
      subclassName: selectedCharacter.subclassName ?? '',
      cantrips: [],
      knownSpells: [],
      forgottenCantrips: [],
      forgottenSpells: [],
      preparedSpells: selectedPreparedSpells,
      abilityScoreIncreases: createEmptyAbilityScoreIncreases(),
    });
  }, [selectedCharacter, selectedPreparedSpells]);

  const ancestryOptions = useMemo(
    () => raceCatalog.map(({ value, label }) => ({ value, label })),
    [raceCatalog]
  );
  const ancestryLabelMap = useMemo(
    () => new Map(ancestryOptions.map((option) => [option.value, option.label])),
    [ancestryOptions]
  );
  const selectedRaceInfo = useMemo(() => {
    const staticRaceInfo = getRaceByValue(raceCatalog, formState.ancestry);
    return buildSelectedRaceInfo(selectedRace, staticRaceInfo);
  }, [formState.ancestry, raceCatalog, selectedRace]);
  const selectedClassInfo = useMemo(
    () => getClassOptionByValue(classCatalog, formState.className),
    [classCatalog, formState.className]
  );
  const currentCreateStep = CHARACTER_CREATE_STEPS[createStepIndex] ?? CHARACTER_CREATE_STEPS[0];
  const isProfileStep = currentCreateStep.key === 'profile';
  const isStatsStep = currentCreateStep.key === 'stats';
  const isFeaturesStep = currentCreateStep.key === 'features';
  const isEquipmentStep = currentCreateStep.key === 'equipment';
  const isSpellsStep = currentCreateStep.key === 'spells';
  const isFinalCreateStep = createStepIndex === CHARACTER_CREATE_STEPS.length - 1;
  const currentStatSelectionLabel = `${selectedRaceInfo?.label ?? '종족 미선택'} (${selectedClassInfo?.label ?? '직업 미선택'})`;

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
  const scenarioGroups = useMemo(() => splitScenariosBySource(scenarios), [scenarios]);

  useEffect(() => {
    if (!isCreateModalOpen || editingCharacterId || formState.scenarioId || !scenarios.length)
      return;
    const defaultScenario = getPreferredScenario(scenarios);
    if (!defaultScenario) return;

    // 시나리오 목록이 모달보다 늦게 로드되어도 생성 폼은 기본 제공 시나리오로 맞춥니다.
    setFormState((current) => ({
      ...current,
      scenarioId: defaultScenario.id,
      level: normalizeLevel(defaultScenario.startLevel),
    }));
  }, [editingCharacterId, formState.scenarioId, isCreateModalOpen, scenarios]);

  // 생성/수정 폼을 기본값으로 되돌립니다.
  function resetCreateForm() {
    setEditingCharacterId(null);
    setCreateStepIndex(0);
    setStatsReferenceOpen(false);
    const defaults = createDefaultCharacter();
    const defaultScenario = getPreferredScenario(scenarios);
    const defaultClass = classDefinitions.find(
      (c) => c.key === (defaults.className ?? '').toLowerCase()
    );
    const startingEquipmentSelection = defaultClass
      ? new Array(defaultClass.startingEquipment.slots.length).fill(0)
      : undefined;
    const defaultStartingSlotSpellCount = getMvpStartingSlotSpellCount(
      defaultClass,
      defaultClass?.key,
      defaultScenario?.startLevel ?? defaults.level ?? 1,
      ruleCatalog
    );
    const defaultStartingCantripCount = getMvpStartingCantripCount(
      defaultClass,
      defaultClass?.key,
      defaultScenario?.startLevel ?? defaults.level ?? 1,
      ruleCatalog
    );
    const startingSpells =
      defaultClass && (defaultStartingCantripCount > 0 || defaultStartingSlotSpellCount > 0)
        ? {
            cantrips: new Array(defaultStartingCantripCount).fill(''),
            spells: new Array(defaultStartingSlotSpellCount).fill(''),
            ...(getPreparedSpellAbilityKey(defaultClass.key) ? { preparedSpells: [] } : {}),
          }
        : undefined;
    setFormState({
      ...defaults,
      scenarioId: defaultScenario?.id ?? null,
      level: defaultScenario ? normalizeLevel(defaultScenario.startLevel) : defaults.level,
      startingEquipmentSelection,
      startingEquipmentItemSelections: {},
      startingSpells,
    });
    setInventoryDraft([]);
    setSkillInput('');
    setFormValidationError(null);
    setCreateToast(null);
    clearCreateToastTimer();
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
    setCreateStepIndex(0);
    setFormState({
      name: selectedCharacter.name,
      ancestry: selectedCharacter.ancestry,
      className: selectedCharacter.className,
      subclassName: selectedCharacter.subclassName ?? null,
      avatarType: selectedCharacter.avatarType,
      avatarPresetId:
        selectedCharacter.avatarPresetId ?? getPresetIdForClassName(selectedCharacter.className),
      avatarUrl: selectedCharacter.avatarUrl ?? null,
      scenarioId: selectedCharacter.scenarioId ?? null,
      level: selectedCharacter.level,
      abilities: { ...selectedCharacter.abilities },
      proficiencyBonus: selectedCharacter.proficiencyBonus,
      proficientSkills: [...selectedCharacter.proficientSkills],
      features: [...selectedCharacter.features],
      maxHp: selectedCharacter.maxHp,
      armorClass: selectedCharacter.armorClass,
      speed: selectedCharacter.speed,
      inventory: selectedCharacter.inventory.map((item) => ({ ...item })),
      equippedWeaponId: selectedCharacter.equippedWeaponId ?? null,
      offhandWeaponId: selectedCharacter.offhandWeaponId ?? null,
      startingEquipmentItemSelections: {},
    });
    setInventoryDraft(selectedCharacter.inventory.map((item) => ({ ...item })));
    setSkillInput('');
    setStatsReferenceOpen(false);
    setFormValidationError(null);
    setCreateToast(null);
    clearCreateToastTimer();
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    resetCreateForm();
  }

  function dismissCreateModal() {
    const shouldReturnToSession = !editingCharacterId && Boolean(onReturnToSession);
    closeCreateModal();
    if (shouldReturnToSession) {
      onReturnToSession?.();
    }
  }

  useEffect(() => {
    if (!autoOpenCreate || didAutoOpenCreateRef.current) {
      return;
    }

    didAutoOpenCreateRef.current = true;
    openCreateModal();
  }, [autoOpenCreate]);

  function goToPreviousCreateStep() {
    setFormValidationError(null);
    setCreateStepIndex((current) => Math.max(0, current - 1));
  }

  function goToNextCreateStep() {
    if (isProfileStep) {
      if (
        !formState.name.trim() ||
        !formState.scenarioId ||
        !formState.ancestry ||
        !formState.className
      ) {
        setFormValidationError(
          '이름, 시나리오, 종족, 직업을 먼저 입력해야 다음 장으로 넘어갈 수 있습니다.'
        );
        return;
      }
      if (isCreateSubclassRequired && !formState.subclassName) {
        setFormValidationError('현재 시작 레벨에서는 서브클래스를 선택해야 합니다.');
        return;
      }
    }

    if (isStatsStep && pointBuyState.enforced && !pointBuyState.isValid) {
      setFormValidationError(
        '능력치 Point Buy 27 포인트를 정확히 맞춰야 다음 장으로 넘어갈 수 있습니다.'
      );
      return;
    }

    if (
      isFeaturesStep &&
      classDefinitions.length > 0 &&
      (!hasRequiredClassFeatureChoices(formState.className, formState.features) ||
        !hasRequiredRaceFeatureChoices(formState.ancestry, formState.features))
    ) {
      setFormValidationError(
        '선택한 종족과 직업의 기능 선택을 완료해야 다음 장으로 넘어갈 수 있습니다.'
      );
      return;
    }

    setFormValidationError(null);
    setCreateStepIndex((current) => Math.min(CHARACTER_CREATE_STEPS.length - 1, current + 1));
  }

  async function submitCreateCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (classDefinitions.length === 0) {
      setFormValidationError('클래스 정의를 불러오는 중입니다. 잠시만 기다려 주세요.');
      return;
    }

    if (
      !hasRequiredClassFeatureChoices(formState.className, formState.features) ||
      !hasRequiredRaceFeatureChoices(formState.ancestry, formState.features)
    ) {
      setFormValidationError(
        '선택한 종족과 직업의 기능 선택을 완료해야 캐릭터를 생성할 수 있습니다.'
      );
      return;
    }

    if (isCreateSubclassRequired && !formState.subclassName) {
      setFormValidationError('현재 시작 레벨에서는 서브클래스를 선택해야 합니다.');
      return;
    }

    if (!hasRequiredStartingEquipmentItemSelections(selectedClass, formState)) {
      setFormValidationError(
        '시작 장비의 자유 선택 항목에서 실제 아이템을 선택해야 캐릭터를 생성할 수 있습니다.'
      );
      return;
    }

    if (selectedClass && (selectedStartingCantripCount > 0 || selectedStartingSlotSpellCount > 0)) {
      const requiredCantripCount = selectedStartingCantripCount;
      const requiredSpellCount = selectedStartingSlotSpellCount;
      const cantrips = formState.startingSpells?.cantrips ?? [];
      const spells = formState.startingSpells?.spells ?? [];
      const filledCantripCount = cantrips
        .slice(0, requiredCantripCount)
        .filter((value) => value.trim().length > 0).length;
      const filledSpellCount = spells
        .slice(0, requiredSpellCount)
        .filter((value) => value.trim().length > 0).length;
      if (filledCantripCount < requiredCantripCount || filledSpellCount < requiredSpellCount) {
        setFormValidationError(
          `${selectedClass.koName} 클래스는 시작 주문을 모두 선택해야 캐릭터를 생성할 수 있습니다. ` +
            `(캔트립 ${requiredCantripCount}개, 슬롯 주문 ${requiredSpellCount}개)`
        );
        return;
      }
      const selectedCantrips = cantrips
        .slice(0, requiredCantripCount)
        .map((value) => value.trim())
        .filter(Boolean);
      const selectedSpells = spells
        .slice(0, requiredSpellCount)
        .map((value) => value.trim())
        .filter(Boolean);
      if (
        new Set(selectedCantrips).size !== selectedCantrips.length ||
        new Set(selectedSpells).size !== selectedSpells.length
      ) {
        setFormValidationError('시작 주문은 같은 주문을 중복해서 선택할 수 없습니다.');
        return;
      }
      const preparedSpells = Array.from(
        new Set(
          (formState.startingSpells?.preparedSpells ?? [])
            .map((value) => value.trim())
            .filter(Boolean)
        )
      );
      const unknownPreparedSpell = preparedSpells.find(
        (spellId) => !selectedSpells.includes(spellId)
      );
      if (unknownPreparedSpell) {
        setFormValidationError('준비 주문은 선택한 슬롯 주문 중에서만 고를 수 있습니다.');
        return;
      }
      if (
        startingPreparedSpellLimit !== null &&
        preparedSpells.length > startingPreparedSpellLimit
      ) {
        setFormValidationError(
          `준비 주문은 최대 ${startingPreparedSpellLimit}개까지 선택할 수 있습니다.`
        );
        return;
      }
    }

    setFormValidationError(null);

    const payload = {
      ...formState,
      proficientSkills: formState.proficientSkills?.filter(Boolean) ?? [],
      features: buildClassFeaturesForSubmit(formState.className, formState.features),
      inventory: inventoryDraft.filter((item) => item.name.trim()),
      assignToSession: !editingCharacterId && Boolean(onReturnToSession),
    };

    // 검증 실패 시 모달을 유지해서 사용자가 입력한 폼 상태를 보존한다.
    // useSession 의 setError 가 props.error 로 전달돼 모달 내부에 인라인 표시된다.
    const succeeded = editingCharacterId
      ? await onUpdateCharacter(editingCharacterId, payload)
      : await onCreateCharacter(payload);

    if (succeeded) {
      closeCreateModal();
      if (!editingCharacterId && onReturnToSession) {
        onReturnToSession();
      }
    }
  }

  async function handleCloneSelectedCharacter() {
    if (!selectedCharacter) return;
    await onCloneCharacter(selectedCharacter.id);
  }

  async function handleLevelUpSelectedCharacter() {
    if (!selectedCharacter || selectedCharacter.level >= 20) return;
    const targetLevel = Math.min(20, Math.max(selectedCharacter.level + 1, levelUpDraft.targetLevel));
    await onLevelUpCharacter(selectedCharacter.id, {
      targetLevel,
      hpMode: 'average',
      applyToActiveSessions: usedCharacterIds.has(selectedCharacter.id),
      ...(levelUpDraft.subclassName ? { subclassName: levelUpDraft.subclassName } : {}),
      ...(requiredAsiPoints
        ? { abilityScoreIncreases: levelUpDraft.abilityScoreIncreases }
        : {}),
      ...(levelUpDraft.knownSpells.length ? { knownSpells: levelUpDraft.knownSpells } : {}),
      ...(levelUpDraft.cantrips.length ? { cantrips: levelUpDraft.cantrips } : {}),
      ...(levelUpDraft.forgottenSpells.length
        ? { forgottenSpells: levelUpDraft.forgottenSpells }
        : {}),
      ...(levelUpDraft.forgottenCantrips.length
        ? { forgottenCantrips: levelUpDraft.forgottenCantrips }
        : {}),
      ...(isSelectedCharacterPreparedCaster
        ? { preparedSpells: levelUpDraft.preparedSpells.filter(Boolean) }
        : {}),
    });
  }

  function adjustLevelUpAbilityScore(ability: AbilityKey, delta: -1 | 1) {
    if (!selectedCharacter) return;
    setLevelUpDraft((current) => {
      const currentIncrease = current.abilityScoreIncreases[ability];
      const currentTotal = Object.values(current.abilityScoreIncreases).reduce(
        (sum, value) => sum + value,
        0
      );
      const nextIncrease = currentIncrease + delta;
      if (nextIncrease < 0) return current;
      if (delta > 0 && currentTotal >= requiredAsiPoints) return current;
      if (selectedCharacter.abilities[ability] + nextIncrease > 20) return current;
      return {
        ...current,
        abilityScoreIncreases: {
          ...current.abilityScoreIncreases,
          [ability]: nextIncrease,
        },
      };
    });
  }

  async function handleSavePreparedSpells() {
    if (!selectedCharacter) return;
    await onUpdatePreparedSpells(selectedCharacter.id, {
      preparedSpells: levelUpDraft.preparedSpells.filter(Boolean),
    });
  }

  function togglePreparedSpell(spellId: string) {
    setLevelUpDraft((current) => {
      const isSelected = current.preparedSpells.includes(spellId);
      if (
        !isSelected &&
        selectedLevelUpPreparedSpellLimit !== null &&
        current.preparedSpells.length >= selectedLevelUpPreparedSpellLimit
      ) {
        return current;
      }
      return {
        ...current,
        preparedSpells: isSelected
          ? current.preparedSpells.filter((id) => id !== spellId)
          : [...current.preparedSpells, spellId],
      };
    });
  }

  function toggleLevelUpKnownSpell(spellId: string) {
    setLevelUpDraft((current) => {
      const isSelected = current.knownSpells.includes(spellId);
      if (!isSelected && current.knownSpells.length >= knownSpellLearnAllowance) {
        return current;
      }
      return {
        ...current,
        knownSpells: isSelected
          ? current.knownSpells.filter((id) => id !== spellId)
          : [...current.knownSpells, spellId],
        preparedSpells: isSelected
          ? current.preparedSpells.filter((id) => id !== spellId)
          : current.preparedSpells,
      };
    });
  }

  function toggleLevelUpCantrip(spellId: string) {
    setLevelUpDraft((current) => {
      const isSelected = current.cantrips.includes(spellId);
      if (!isSelected && current.cantrips.length >= cantripLearnAllowance) {
        return current;
      }
      return {
        ...current,
        cantrips: isSelected
          ? current.cantrips.filter((id) => id !== spellId)
          : [...current.cantrips, spellId],
      };
    });
  }

  function toggleForgottenSpell(spellId: string) {
    setLevelUpDraft((current) => {
      const isSelected = current.forgottenSpells.includes(spellId);
      if (!isSelected && current.forgottenSpells.length >= levelUpLevelDelta) {
        return current;
      }
      const forgottenSpells = isSelected
        ? current.forgottenSpells.filter((id) => id !== spellId)
        : [...current.forgottenSpells, spellId];
      const baseAllowance = isSelectedCharacterWizard
        ? levelUpLevelDelta * 2
        : Math.max(
            0,
            (targetSpellcastingProgression?.spellsKnown ?? 0) -
              (currentSpellcastingProgression?.spellsKnown ?? 0)
          );
      return {
        ...current,
        forgottenSpells,
        knownSpells: current.knownSpells.slice(0, baseAllowance + forgottenSpells.length),
        preparedSpells: isSelected
          ? current.preparedSpells
          : current.preparedSpells.filter((id) => id !== spellId),
      };
    });
  }

  function toggleForgottenCantrip(spellId: string) {
    setLevelUpDraft((current) => {
      const isSelected = current.forgottenCantrips.includes(spellId);
      if (!isSelected && current.forgottenCantrips.length >= levelUpLevelDelta) {
        return current;
      }
      const forgottenCantrips = isSelected
        ? current.forgottenCantrips.filter((id) => id !== spellId)
        : [...current.forgottenCantrips, spellId];
      const baseAllowance = Math.max(
        0,
        (targetSpellcastingProgression?.cantripsKnown ?? 0) -
          (currentSpellcastingProgression?.cantripsKnown ?? 0)
      );
      return {
        ...current,
        forgottenCantrips,
        cantrips: current.cantrips.slice(0, baseAllowance + forgottenCantrips.length),
      };
    });
  }

  async function handleDeleteSelectedCharacter() {
    if (!selectedCharacter) return;
    if (usedCharacterIds.has(selectedCharacter.id)) {
      setDeleteWarning(
        '\uC774 \uCE90\uB9AD\uD130\uB294 \uC138\uC158\uC5D0\uC11C \uC0AC\uC6A9 \uC911\uC785\uB2C8\uB2E4.\n\uC0AC\uC6A9 \uC911\uC778 \uC138\uC158\uC744 \uC885\uB8CC\uD558\uACE0 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.'
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
    // 입력값을 한국어로 정규화 — 영문 칩(Arcana)도 한국어(비전학)로 통일해 BE 검증·DB 저장 형식과 맞춘다.
    // 매칭 실패 시 trim 한 원문 그대로 두면 BE 가 unknown 으로 거부 → 사용자 인라인 에러로 노출된다.
    const trimmed = skill.trim();
    if (!trimmed) return;
    const normalized = normalizeSkillToKo(trimmed) ?? trimmed;

    // 클래스가 정해져 있으면 시드 기반 갯수 제한을 그대로 강제한다 (BE 와 동일 정책).
    const limit = selectedClass?.skillChoiceCount ?? null;
    setFormState((current) => {
      const existing = current.proficientSkills ?? [];
      if (existing.includes(normalized)) {
        return current;
      }
      if (limit !== null && existing.length >= limit) {
        return current;
      }
      return {
        ...current,
        proficientSkills: [...existing, normalized],
      };
    });
    setSkillInput('');
  }

  function removeSkill(skill: string) {
    setFormState((current) => ({
      ...current,
      proficientSkills: (current.proficientSkills ?? []).filter((entry) => entry !== skill),
      features: replaceFeatureTags(current.features, [`expertise:${skill}`], []),
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
          {onReturnToSession ? (
            <button
              type="button"
              className="fantasy-character-sidebutton"
              style={{ backgroundImage: `url(${sidePanelImage})` }}
              onClick={onReturnToSession}
            >
              {sessionReturnTitle ? `${sessionReturnTitle} 세션으로` : '세션으로'} 돌아가기
            </button>
          ) : null}
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
                        <dd>
                          {getCharacterAncestryLabel(selectedCharacter.ancestry, ancestryLabelMap)}
                        </dd>
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
                      <h3>성장</h3>
                      <div className="character-growth-panel">
                        <label htmlFor="character-level-up-target">목표 레벨</label>
                        <div className="character-growth-row">
                          <input
                            id="character-level-up-target"
                            type="number"
                            min={selectedCharacter.level + 1}
                            max={20}
                            value={levelUpDraft.targetLevel}
                            disabled={busy || selectedCharacter.level >= 20}
                            onChange={(event) =>
                              setLevelUpDraft((current) => ({
                                ...current,
                                targetLevel: Number(event.target.value),
                                cantrips: [],
                                knownSpells: [],
                                forgottenCantrips: [],
                                forgottenSpells: [],
                              }))
                            }
                          />
                          <button
                            type="button"
                            onClick={() => void handleLevelUpSelectedCharacter()}
                            disabled={
                              busy ||
                              selectedCharacter.level >= 20 ||
                              remainingAsiPoints !== 0 ||
                              (isLevelUpSubclassRequired && !levelUpDraft.subclassName) ||
                              isLevelUpPreparedSpellLimitExceeded ||
                              isLevelUpSpellReplacementIncomplete
                            }
                          >
                            레벨업
                          </button>
                        </div>
                        {levelUpPreviewRows.length ? (
                          <dl className="fantasy-character-summary-list">
                            {levelUpPreviewRows.map((row) => (
                              <div key={row.label}>
                                <dt>{row.label}</dt>
                                <dd>{row.value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                        {requiredAsiPoints ? (
                          <div className="character-asi-panel">
                            <div className="character-asi-heading">
                              <strong>능력치 상승</strong>
                              <span>
                                남은 점수 {remainingAsiPoints} / {requiredAsiPoints}
                              </span>
                            </div>
                            <div className="character-asi-grid">
                              {(Object.keys(abilityDisplayLabels) as AbilityKey[]).map((ability) => {
                                const increase = levelUpDraft.abilityScoreIncreases[ability];
                                const score = selectedCharacter.abilities[ability];
                                return (
                                  <div key={ability} className="character-asi-control">
                                    <span>{abilityDisplayLabels[ability]}</span>
                                    <button
                                      type="button"
                                      aria-label={`${abilityDisplayLabels[ability]} 상승치 감소`}
                                      disabled={busy || increase <= 0}
                                      onClick={() => adjustLevelUpAbilityScore(ability, -1)}
                                    >
                                      -
                                    </button>
                                    <strong>
                                      {score + increase}
                                      {increase ? ` (+${increase})` : ''}
                                    </strong>
                                    <button
                                      type="button"
                                      aria-label={`${abilityDisplayLabels[ability]} 상승치 증가`}
                                      disabled={
                                        busy ||
                                        remainingAsiPoints <= 0 ||
                                        score + increase >= 20
                                      }
                                      onClick={() => adjustLevelUpAbilityScore(ability, 1)}
                                    >
                                      +
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                            <small>{crossedAsiLevels.join(', ')}레벨 성장 보너스</small>
                          </div>
                        ) : null}
                        {selectedSubclassOptions.length ? (
                          <div>
                            <label htmlFor="character-level-up-subclass">서브클래스</label>
                            <select
                              id="character-level-up-subclass"
                              value={levelUpDraft.subclassName}
                              disabled={busy || Boolean(selectedCharacter.subclassName)}
                              onChange={(event) =>
                                setLevelUpDraft((current) => ({
                                  ...current,
                                  subclassName: event.target.value,
                                }))
                              }
                            >
                              <option value="">
                                {isLevelUpSubclassRequired ? '필수 선택' : '필요 시 선택'}
                              </option>
                              {selectedSubclassOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        {selectedLevelUpLearnableSlotSpells.length ? (
                          <div>
                            <label>
                              새 주문 습득 {levelUpDraft.knownSpells.length}/{knownSpellLearnAllowance}
                            </label>
                            <div className="character-prepared-spell-list">
                              {selectedLevelUpLearnableSlotSpells.map((spell) => (
                                <label key={spell.id} className="character-prepared-spell-option">
                                  <input
                                    type="checkbox"
                                    checked={levelUpDraft.knownSpells.includes(spell.id)}
                                    disabled={
                                      busy ||
                                      (!levelUpDraft.knownSpells.includes(spell.id) &&
                                        levelUpDraft.knownSpells.length >=
                                          knownSpellLearnAllowance)
                                    }
                                    onChange={() => toggleLevelUpKnownSpell(spell.id)}
                                  />
                                  <span>{spell.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {!isSelectedCharacterPreparedCaster &&
                        selectedKnownSlotSpells.length &&
                        levelUpLevelDelta ? (
                          <div>
                            <label>
                              교체할 주문 {levelUpDraft.forgottenSpells.length}/{levelUpLevelDelta}
                            </label>
                            <div className="character-prepared-spell-list">
                              {selectedKnownSlotSpells.map((spellId) => (
                                <label key={spellId} className="character-prepared-spell-option">
                                  <input
                                    type="checkbox"
                                    checked={levelUpDraft.forgottenSpells.includes(spellId)}
                                    disabled={
                                      busy ||
                                      (!levelUpDraft.forgottenSpells.includes(spellId) &&
                                        levelUpDraft.forgottenSpells.length >= levelUpLevelDelta)
                                    }
                                    onChange={() => toggleForgottenSpell(spellId)}
                                  />
                                  <span>{getImplementedSpellLabel(spellId, ruleCatalog)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {selectedLevelUpLearnableCantrips.length &&
                        cantripLearnAllowance > 0 ? (
                          <div>
                            <label>
                              새 캔트립 {levelUpDraft.cantrips.length}/{cantripLearnAllowance}
                            </label>
                            <div className="character-prepared-spell-list">
                              {selectedLevelUpLearnableCantrips.map((spell) => (
                                <label key={spell.id} className="character-prepared-spell-option">
                                  <input
                                    type="checkbox"
                                    checked={levelUpDraft.cantrips.includes(spell.id)}
                                    disabled={
                                      busy ||
                                      (!levelUpDraft.cantrips.includes(spell.id) &&
                                        levelUpDraft.cantrips.length >= cantripLearnAllowance)
                                    }
                                    onChange={() => toggleLevelUpCantrip(spell.id)}
                                  />
                                  <span>{spell.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {selectedCurrentCantrips.length && levelUpLevelDelta ? (
                          <div>
                            <label>
                              교체할 캔트립 {levelUpDraft.forgottenCantrips.length}/
                              {levelUpLevelDelta}
                            </label>
                            <div className="character-prepared-spell-list">
                              {selectedCurrentCantrips.map((spellId) => (
                                <label key={spellId} className="character-prepared-spell-option">
                                  <input
                                    type="checkbox"
                                    checked={levelUpDraft.forgottenCantrips.includes(spellId)}
                                    disabled={
                                      busy ||
                                      (!levelUpDraft.forgottenCantrips.includes(spellId) &&
                                        levelUpDraft.forgottenCantrips.length >=
                                          levelUpLevelDelta)
                                    }
                                    onChange={() => toggleForgottenCantrip(spellId)}
                                  />
                                  <span>{getImplementedSpellLabel(spellId, ruleCatalog)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {isSelectedCharacterPreparedCaster &&
                    selectedPreparedCandidateSlotSpells.length ? (
                      <section className="fantasy-character-stats-section">
                        <h3>
                          준비 주문
                          {selectedLevelUpPreparedSpellLimit !== null
                            ? ` ${levelUpDraft.preparedSpells.length}/${selectedLevelUpPreparedSpellLimit}`
                            : ''}
                        </h3>
                        <div className="character-prepared-spell-list">
                          {selectedPreparedCandidateSlotSpells.map((spellId) => (
                            <label key={spellId} className="character-prepared-spell-option">
                              <input
                                type="checkbox"
                                checked={levelUpDraft.preparedSpells.includes(spellId)}
                                disabled={
                                  busy ||
                                  (!levelUpDraft.preparedSpells.includes(spellId) &&
                                    selectedLevelUpPreparedSpellLimit !== null &&
                                    levelUpDraft.preparedSpells.length >=
                                      selectedLevelUpPreparedSpellLimit)
                                }
                                onChange={() => togglePreparedSpell(spellId)}
                              />
                              <span>{getImplementedSpellLabel(spellId, ruleCatalog)}</span>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSavePreparedSpells()}
                          disabled={busy || levelUpDraft.knownSpells.length > 0}
                        >
                          준비 주문 저장
                        </button>
                      </section>
                    ) : null}

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
                              <InventoryItemInfo item={item} /> x{item.quantity}
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
      {error && !isCreateModalOpen ? <p className="panel-error">{error}</p> : null}
      {deleteWarning ? (
        <button type="button" className="page-error-toast" onClick={() => setDeleteWarning(null)}>
          {deleteWarning}
        </button>
      ) : null}

      {/* 캐릭터 생성/수정 모달입니다. editingCharacterId가 있으면 수정 모드로 동작합니다. */}
      {isCreateModalOpen ? (
        <div
          className="modal-backdrop character-create-backdrop"
          role="presentation"
          onClick={dismissCreateModal}
        >
          <div
            className="character-create-visual-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="modal-card modal-card-wide character-create-modal"
              role="dialog"
              aria-modal="true"
            >
            {createToast ? (
              <div
                key={createToast.id}
                className="character-create-toast"
                role="status"
                aria-live="assertive"
              >
                {createToast.message}
              </div>
            ) : null}
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  {editingCharacterId ? '캐릭터 수정' : '캐릭터 생성'}
                </span>
                <h2>{editingCharacterId ? '캐릭터 수정' : '새 캐릭터'}</h2>
              </div>
              <button type="button" className="modal-close" onClick={dismissCreateModal}>
                닫기
              </button>
            </div>

            <form
              className={`modal-form character-create-form character-create-form--${currentCreateStep.key}`}
              onSubmit={submitCreateCharacter}
            >
              <div className="character-create-stepper" aria-label="캐릭터 생성 단계">
                {CHARACTER_CREATE_STEPS.map((step, index) => {
                  const isActive = index === createStepIndex;
                  const isCompleted = index < createStepIndex;

                  return (
                    <div
                      key={step.key}
                      className={`character-create-step${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}
                    >
                      <span className="character-create-step-index">{index + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        <span>{step.helper}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                className={`character-create-form-body${
                  isEquipmentStep || isSpellsStep ? ' character-create-form-body--scrollable' : ''
                }${isSpellsStep ? ' character-create-form-body--single-column' : ''}`}
              >
                <div className="character-create-form-left">
                  {isProfileStep ? (
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
                                const currentClassKey = normalizeClassValue(
                                  current.className ?? ''
                                ).toLowerCase();
                                const subclassChoiceLevel =
                                  subclassChoiceLevelByClass[currentClassKey] ?? null;
                                const currentClass = classDefinitions.find(
                                  (klass) => klass.key === currentClassKey
                                );
                                const startingSlotSpellCount = getMvpStartingSlotSpellCount(
                                  currentClass,
                                  current.className,
                                  nextLevel,
                                  ruleCatalog
                                );
                                const startingCantripCount = getMvpStartingCantripCount(
                                  currentClass,
                                  current.className,
                                  nextLevel,
                                  ruleCatalog
                                );
                                const startingSpells =
                                  currentClass &&
                                  (startingCantripCount > 0 ||
                                    startingSlotSpellCount > 0)
                                    ? {
                                        cantrips: new Array(startingCantripCount).fill(''),
                                        spells: new Array(startingSlotSpellCount).fill(''),
                                        ...(getPreparedSpellAbilityKey(current.className)
                                          ? { preparedSpells: [] }
                                          : {}),
                                      }
                                    : undefined;

                                return {
                                  ...current,
                                  scenarioId: nextScenarioId,
                                  level: nextLevel,
                                  subclassName:
                                    subclassChoiceLevel !== null &&
                                    nextLevel >= subclassChoiceLevel
                                      ? current.subclassName
                                      : null,
                                  maxHp: nextStats.maxHp,
                                  armorClass: nextStats.armorClass,
                                  proficiencyBonus: nextStats.proficiencyBonus,
                                  abilities: nextAbilities,
                                  startingSpells,
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
                            {scenarioGroups.provided.length ? (
                              <optgroup label="기본 제공 시나리오">
                                {scenarioGroups.provided.map((scenario) => (
                                  <option key={scenario.id} value={scenario.id}>
                                    {scenario.title} (시작 {scenario.startLevel}레벨)
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            {scenarioGroups.custom.length ? (
                              <optgroup label="내가 만든 시나리오">
                                {scenarioGroups.custom.map((scenario) => (
                                  <option key={scenario.id} value={scenario.id}>
                                    {scenario.title} (시작 {scenario.startLevel}레벨)
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
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
                                (r) =>
                                  r.key === nextAncestry.toLowerCase() || r.koName === nextAncestry
                              );
                              const currentRace = races.find(
                                (r) =>
                                  r.key === (formState.ancestry ?? '').toLowerCase() ||
                                  r.koName === formState.ancestry
                              );
                              setFormState((current) => {
                                const currentFinals = current.abilities ?? {
                                  str: 10,
                                  dex: 10,
                                  con: 10,
                                  int: 10,
                                  wis: 10,
                                  cha: 10,
                                };
                                const currentBonus = currentRace?.abilityIncreases ?? {
                                  str: 0,
                                  dex: 0,
                                  con: 0,
                                  int: 0,
                                  wis: 0,
                                  cha: 0,
                                };
                                const nextBonus = nextRace?.abilityIncreases ?? {
                                  str: 0,
                                  dex: 0,
                                  con: 0,
                                  int: 0,
                                  wis: 0,
                                  cha: 0,
                                };
                                const nextAbilities = {
                                  str: currentFinals.str - currentBonus.str + nextBonus.str,
                                  dex: currentFinals.dex - currentBonus.dex + nextBonus.dex,
                                  con: currentFinals.con - currentBonus.con + nextBonus.con,
                                  int: currentFinals.int - currentBonus.int + nextBonus.int,
                                  wis: currentFinals.wis - currentBonus.wis + nextBonus.wis,
                                  cha: currentFinals.cha - currentBonus.cha + nextBonus.cha,
                                };
                                return {
                                  ...current,
                                  ancestry: nextAncestry,
                                  features:
                                    nextAncestry.toLowerCase() === 'dragonborn'
                                      ? current.features
                                      : replaceFeatureTags(
                                          current.features,
                                          ['draconic_ancestry:'],
                                          []
                                        ),
                                  abilities: clampAbilitiesToPointBuyRange(
                                    nextAbilities,
                                    nextBonus
                                  ),
                                };
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
                                  (c) => c.key === className.toLowerCase()
                                );
                                const nextSelection = nextClass
                                  ? new Array(nextClass.startingEquipment.slots.length).fill(0)
                                  : undefined;
                                const raceBonus = selectedRace?.abilityIncreases ?? {
                                  str: 0,
                                  dex: 0,
                                  con: 0,
                                  int: 0,
                                  wis: 0,
                                  cha: 0,
                                };
                                const nextAbilities = clampAbilitiesToPointBuyRange(
                                  current.abilities ?? {
                                    str: 8,
                                    dex: 8,
                                    con: 8,
                                    int: 8,
                                    wis: 8,
                                    cha: 8,
                                  },
                                  raceBonus
                                );
                                const nextSpells =
                                  nextClass &&
                                  (getMvpStartingCantripCount(
                                    nextClass,
                                    className,
                                    current.level ?? 1,
                                    ruleCatalog
                                  ) > 0 ||
                                    getMvpStartingSlotSpellCount(
                                      nextClass,
                                      className,
                                      current.level ?? 1,
                                      ruleCatalog
                                    ) > 0)
                                    ? {
                                        cantrips: new Array(
                                          getMvpStartingCantripCount(
                                            nextClass,
                                            className,
                                            current.level ?? 1,
                                            ruleCatalog
                                          )
                                        ).fill(''),
                                        spells: new Array(
                                          getMvpStartingSlotSpellCount(
                                            nextClass,
                                            className,
                                            current.level ?? 1,
                                            ruleCatalog
                                          )
                                        ).fill(''),
                                        ...(getPreparedSpellAbilityKey(className)
                                          ? { preparedSpells: [] }
                                          : {}),
                                      }
                                    : undefined;
                                return {
                                  ...current,
                                  className,
                                  subclassName: null,
                                  avatarType: 'PRESET',
                                  avatarPresetId: getPresetIdForClassName(className),
                                  avatarUrl: null,
                                  maxHp: recommendedStats.maxHp,
                                  armorClass: recommendedStats.armorClass,
                                  speed: recommendedStats.speed,
                                  proficiencyBonus: recommendedStats.proficiencyBonus,
                                  abilities: nextAbilities,
                                  startingEquipmentSelection: nextSelection,
                                  startingEquipmentItemSelections: {},
                                  startingSpells: nextSpells,
                                  proficientSkills: [],
                                  features: [],
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
                      {selectedCreateSubclassOptions.length &&
                      selectedCreateSubclassChoiceLevel !== null &&
                      (formState.level ?? 1) >= selectedCreateSubclassChoiceLevel ? (
                        <div className="field-row">
                          <div>
                            <label htmlFor="character-subclass-create">서브클래스</label>
                            <select
                              id="character-subclass-create"
                              value={formState.subclassName ?? ''}
                              onChange={(event) =>
                                setFormState((current) => ({
                                  ...current,
                                  subclassName: event.target.value || null,
                                }))
                              }
                              required={isCreateSubclassRequired}
                            >
                              <option value="">
                                {isCreateSubclassRequired ? '필수 선택' : '서브클래스 선택'}
                              </option>
                              {selectedCreateSubclassOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {isStatsStep ? (
                    <section className="character-form-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">전투 수치</span>
                          <h2>코어 스탯</h2>
                        </div>
                        <div className="character-create-stats-trigger-row">
                          <span className="character-create-inline-trigger">
                            <span className="character-create-inline-trigger-text">
                              {currentStatSelectionLabel}
                            </span>
                          </span>
                          <div className="character-create-stats-help-anchor">
                            <button
                              type="button"
                              className="character-create-help-trigger"
                              aria-label="종족 및 직업 정보 보기"
                              aria-expanded={isStatsReferenceOpen}
                              onClick={() => setStatsReferenceOpen((current) => !current)}
                            >
                              ?
                            </button>
                            {isStatsReferenceOpen ? (
                              <div
                                className="character-create-stats-popover"
                                role="dialog"
                                aria-label="종족 및 직업 정보"
                              >
                                <div className="character-create-stats-popover-head">
                                  <strong>{currentStatSelectionLabel}</strong>
                                  <button
                                    type="button"
                                    className="character-create-stats-popover-close"
                                    onClick={() => setStatsReferenceOpen(false)}
                                  >
                                    닫기
                                  </button>
                                </div>
                                <div className="character-create-stats-popover-body">
                                  <section className="fantasy-insight-section">
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
                                      이동속도:{' '}
                                      {selectedRaceInfo
                                        ? `${selectedRaceInfo.speed} ft.`
                                        : '정보 없음'}
                                    </p>
                                    <p>크기: {selectedRaceInfo?.size ?? '정보 없음'}</p>
                                  </section>
                                  <section className="fantasy-insight-section">
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
                                    <p>히트 다이스: {selectedClassInfo?.hitDieRaw ?? '정보 없음'}</p>
                                    <p>
                                      주문시전 능력치:{' '}
                                      {selectedClassInfo?.spellcastingAbility
                                        ? localizeSrdTermText(selectedClassInfo.spellcastingAbility)
                                        : '없음'}
                                    </p>
                                  </section>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {isFeaturesStep ? (
                    <section className="character-form-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">기술</span>
                          <h2>숙련 기술</h2>
                        </div>
                      </div>

                      {(() => {
                        const selectedSkills = formState.proficientSkills ?? [];
                        const requiredCount = selectedClass?.skillChoiceCount ?? null;
                        const choices = selectedClass?.skillChoices ?? allSkillsKo;
                        const limitReached =
                          requiredCount !== null && selectedSkills.length >= requiredCount;
                        return (
                          <>
                            {selectedClass && requiredCount ? (
                              <p
                                style={{
                                  margin: '0 0 12px 0',
                                  fontSize: '0.9rem',
                                  opacity: 0.85,
                                }}
                              >
                                <strong>{selectedClass.koName}</strong> 클래스는 아래{' '}
                                {choices.length}개 중 <strong>{requiredCount}개</strong>를 선택해야
                                합니다 (현재 <strong>{selectedSkills.length}</strong>개 선택).
                              </p>
                            ) : null}

                            <div className="character-chip-row" style={{ marginTop: '14px' }}>
                              {choices.map((skill) => {
                                const already = selectedSkills.includes(skill);
                                const disabled = already || limitReached;
                                return (
                                  <button
                                    key={skill}
                                    type="button"
                                    className="character-skill-chip"
                                    onClick={() => addSkill(skill)}
                                    disabled={disabled}
                                    style={
                                      disabled
                                        ? { opacity: 0.45, cursor: 'not-allowed' }
                                        : undefined
                                    }
                                    title={
                                      already
                                        ? '이미 선택됨'
                                        : limitReached
                                          ? `${requiredCount}개까지만 선택 가능`
                                          : undefined
                                    }
                                  >
                                    {skill}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}

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
                  ) : null}

                  {isFeaturesStep
                    ? (() => {
                        const classKey = normalizeClassValue(formState.className).toLowerCase();
                        const ancestryKey = formState.ancestry
                          .trim()
                          .toLowerCase()
                          .replace(/_/g, '-');
                        const features = formState.features ?? [];
                        const draconicAncestry = getFeatureValue(
                          features,
                          'draconic_ancestry:'
                        );
                        const fightingStyle = getFeatureValue(features, 'fighting_style:');
                        const selectedFightingStyle = fightingStyleOptions.find(
                          (option) => option.value === fightingStyle
                        );
                        const favoredEnemy = getFeatureValue(features, 'favored_enemy:');
                        const humanoidRaces = getFeatureValues(features, 'favored_enemy_humanoid:');
                        const expertiseSelections = getFeatureValues(features, 'expertise:');
                        const expertiseChoices = [
                          ...(formState.proficientSkills ?? []),
                          'thieves_tools',
                        ];

                        if (
                          ancestryKey !== 'dragonborn' &&
                          !['fighter', 'ranger', 'rogue'].includes(classKey)
                        ) {
                          return null;
                        }

                        return (
                          <section className="character-form-section">
                            <div className="section-heading compact">
                              <div>
                                <span className="eyebrow">종족/직업 기능</span>
                                <h2>1레벨 선택</h2>
                              </div>
                            </div>

                            {ancestryKey === 'dragonborn' ? (
                              <div>
                                <label htmlFor="character-draconic-ancestry">
                                  Draconic Ancestry
                                </label>
                                <select
                                  id="character-draconic-ancestry"
                                  value={draconicAncestry}
                                  required
                                  onChange={(event) =>
                                    setFormState((current) => ({
                                      ...current,
                                      features: replaceFeatureTags(
                                        current.features,
                                        ['draconic_ancestry:'],
                                        event.target.value
                                          ? [`draconic_ancestry:${event.target.value}`]
                                          : []
                                      ),
                                    }))
                                  }
                                >
                                  <option value="" disabled>
                                    용 혈통 선택
                                  </option>
                                  {draconicAncestryOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <p className="field-help">
                                  선택한 혈통이 브레스 피해 유형과 피해 저항을 함께 결정합니다.
                                </p>
                              </div>
                            ) : null}

                            {classKey === 'fighter' ? (
                              <div>
                                <label htmlFor="character-fighting-style">Fighting Style</label>
                                <select
                                  id="character-fighting-style"
                                  value={fightingStyle}
                                  required
                                  onChange={(event) =>
                                    setFormState((current) => ({
                                      ...current,
                                      features: replaceFeatureTags(
                                        current.features,
                                        ['fighting_style:'],
                                        event.target.value
                                          ? [`fighting_style:${event.target.value}`]
                                          : []
                                      ),
                                    }))
                                  }
                                >
                                  <option value="" disabled>
                                    전투 유파 선택
                                  </option>
                                  {fightingStyleOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label} - {option.effect}
                                    </option>
                                  ))}
                                </select>
                                {selectedFightingStyle ? (
                                  <p
                                    style={{
                                      margin: '8px 0 0 0',
                                      fontSize: '0.9rem',
                                      opacity: 0.85,
                                    }}
                                  >
                                    <strong>{selectedFightingStyle.label}</strong>:{' '}
                                    {selectedFightingStyle.effect}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}

                            {classKey === 'ranger' ? (
                              <div>
                                <label htmlFor="character-favored-enemy">Favored Enemy</label>
                                <select
                                  id="character-favored-enemy"
                                  value={favoredEnemy}
                                  required
                                  onChange={(event) =>
                                    setFormState((current) => ({
                                      ...current,
                                      features: replaceFeatureTags(
                                        current.features,
                                        ['favored_enemy:', 'favored_enemy_humanoid:'],
                                        event.target.value
                                          ? [`favored_enemy:${event.target.value}`]
                                          : []
                                      ),
                                    }))
                                  }
                                >
                                  <option value="" disabled>
                                    주적 선택
                                  </option>
                                  {favoredEnemyOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                {favoredEnemy === 'humanoid' ? (
                                  <div className="field-row" style={{ marginTop: 10 }}>
                                    {[0, 1].map((index) => (
                                      <div key={index}>
                                        <label htmlFor={`character-favored-humanoid-${index}`}>
                                          인간형 종족 {index + 1}
                                        </label>
                                        <select
                                          id={`character-favored-humanoid-${index}`}
                                          value={humanoidRaces[index] ?? ''}
                                          required
                                          onChange={(event) => {
                                            const nextRaces = [...humanoidRaces];
                                            nextRaces[index] = event.target.value;
                                            setFormState((current) => ({
                                              ...current,
                                              features: replaceFeatureTags(
                                                current.features,
                                                ['favored_enemy:', 'favored_enemy_humanoid:'],
                                                [
                                                  'favored_enemy:humanoid',
                                                  ...nextRaces
                                                    .filter(Boolean)
                                                    .map(
                                                      (race) => `favored_enemy_humanoid:${race}`
                                                    ),
                                                ]
                                              ),
                                            }));
                                          }}
                                        >
                                          <option value="" disabled>
                                            인간형 종족 선택
                                          </option>
                                          {favoredHumanoidOptions.map((option) => (
                                            <option
                                              key={option.value}
                                              value={option.value}
                                              disabled={humanoidRaces.some(
                                                (race, raceIndex) =>
                                                  raceIndex !== index && race === option.value
                                              )}
                                            >
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {classKey === 'rogue' ? (
                              <div>
                                <p
                                  style={{
                                    margin: '0 0 12px 0',
                                    fontSize: '0.9rem',
                                    opacity: 0.85,
                                  }}
                                >
                                  숙련 기술 2개, 또는 숙련 기술 1개와 Thieves' tools를 선택합니다
                                  (현재 {expertiseSelections.length}/2).
                                </p>
                                <div className="character-chip-row">
                                  {expertiseChoices.map((choice) => {
                                    const selected = expertiseSelections.includes(choice);
                                    const disabled = !selected && expertiseSelections.length >= 2;
                                    return (
                                      <button
                                        key={choice}
                                        type="button"
                                        className="character-skill-chip"
                                        aria-pressed={selected}
                                        disabled={disabled}
                                        onClick={() =>
                                          setFormState((current) => {
                                            const currentSelections = getFeatureValues(
                                              current.features,
                                              'expertise:'
                                            );
                                            const nextSelections = currentSelections.includes(
                                              choice
                                            )
                                              ? currentSelections.filter(
                                                  (entry) => entry !== choice
                                                )
                                              : [...currentSelections, choice].slice(0, 2);
                                            return {
                                              ...current,
                                              features: replaceFeatureTags(
                                                current.features,
                                                ['expertise:'],
                                                nextSelections.map((entry) => `expertise:${entry}`)
                                              ),
                                            };
                                          })
                                        }
                                      >
                                        {choice === 'thieves_tools'
                                          ? "Thieves' tools"
                                          : getSkillLabel(choice)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </section>
                        );
                      })()
                    : null}

                  {isEquipmentStep && selectedClass ? (
                    <section className="character-form-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">시작 장비</span>
                          <h2>슬롯 선택 (룰북 강제)</h2>
                        </div>
                      </div>
                      {getClassStartingEquipmentSlots(selectedClass).map((slot, slotIndex) => {
                        const selectedOptionIndex =
                          formState.startingEquipmentSelection?.[slotIndex] ?? 0;
                        const selectedOption = slot.options[selectedOptionIndex] ?? slot.options[0];
                        const formatOption = (option: (typeof slot.options)[number]) =>
                          option.items
                            .map((it) => {
                              const concreteChoice = getStartingEquipmentConcreteChoice(it.itemKey);
                              const ko = concreteChoice
                                ? `${concreteChoice.label} 선택`
                                : (itemKoNameByKey.get(it.itemKey) ?? it.itemKey);
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
                                      new Array(
                                        getClassStartingEquipmentSlots(selectedClass).length
                                      ).fill(0);
                                    const next = [...base];
                                    next[slotIndex] = idx;
                                    return {
                                      ...current,
                                      startingEquipmentSelection: next,
                                      startingEquipmentItemSelections:
                                        clearStartingEquipmentItemSelectionsForSlot(
                                          current.startingEquipmentItemSelections,
                                          slotIndex
                                        ),
                                    };
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
                            {selectedOption?.items.map((item, itemIndex) => {
                              const concreteChoice = getStartingEquipmentConcreteChoice(
                                item.itemKey
                              );
                              if (!concreteChoice) return null;
                              const selectionKey = getStartingEquipmentItemSelectionKey(
                                slotIndex,
                                itemIndex
                              );
                              return (
                                <div key={selectionKey} style={{ marginTop: 8 }}>
                                  <label htmlFor={`starting-equipment-item-${selectionKey}`}>
                                    {item.quantity > 1
                                      ? `${concreteChoice.label} ${item.quantity}개`
                                      : concreteChoice.label}
                                  </label>
                                  <select
                                    id={`starting-equipment-item-${selectionKey}`}
                                    value={
                                      formState.startingEquipmentItemSelections?.[selectionKey] ??
                                      ''
                                    }
                                    required
                                    onChange={(event) =>
                                      setFormState((current) => ({
                                        ...current,
                                        startingEquipmentItemSelections: {
                                          ...(current.startingEquipmentItemSelections ?? {}),
                                          [selectionKey]: event.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="" disabled>
                                      {concreteChoice.label} 선택
                                    </option>
                                    {concreteChoice.options.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </section>
                  ) : null}

                  {isEquipmentStep ? (
                    <section className="character-form-section">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">인벤토리</span>
                          <h2>
                            아이템 {selectedClass ? '(시작 장비 자동 — 수동 입력 무시됨)' : ''}
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={addInventoryRow}
                          disabled={Boolean(selectedClass)}
                        >
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
                  ) : null}
                </div>
                <div className="character-create-form-right">
                  {isEquipmentStep ? (
                    <section className="character-form-section character-create-equipment-summary">
                      <div className="section-heading compact">
                        <div>
                          <span className="eyebrow">장비 요약</span>
                          <h2>생성 시 지급될 장비</h2>
                        </div>
                      </div>
                      {resolvedStartingEquipmentSummary.length ? (
                        <ul className="character-create-equipment-summary-list">
                          {resolvedStartingEquipmentSummary.map((item) => (
                            <li
                              key={item.key}
                              className={item.pending ? 'pending' : undefined}
                            >
                              <span>{item.label}</span>
                              {item.quantity > 1 ? <strong>×{item.quantity}</strong> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="character-empty-note">
                          직업을 선택하면 시작 장비 목록이 여기에 표시됩니다.
                        </p>
                      )}
                      <p className="character-create-equipment-summary-help">
                        왼쪽에서 선택지를 바꾸면 이 목록이 즉시 갱신됩니다. “미선택” 항목은
                        생성 전에 구체 장비를 골라야 합니다.
                      </p>
                    </section>
                  ) : null}
                  {isProfileStep ? (
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
                                    const raceBonus = selectedRace?.abilityIncreases ?? {
                                      str: 0,
                                      dex: 0,
                                      con: 0,
                                      int: 0,
                                      wis: 0,
                                      cha: 0,
                                    };
                                    const recommendedAbilitiesWithRace = {
                                      ...recommendedAbilities,
                                      str: recommendedAbilities.str + raceBonus.str,
                                      dex: recommendedAbilities.dex + raceBonus.dex,
                                      int: recommendedAbilities.int + raceBonus.int,
                                    };
                                    const nextClass = classDefinitions.find(
                                      (c) => c.key === className.toLowerCase()
                                    );
                                    const nextSelection = nextClass
                                      ? new Array(nextClass.startingEquipment.slots.length).fill(0)
                                      : undefined;

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
                                      abilities: clampAbilitiesToPointBuyRange(
                                        recommendedAbilitiesWithRace,
                                        raceBonus
                                      ),
                                      features: [],
                                      proficientSkills: [],
                                      startingEquipmentSelection: nextSelection,
                                      startingEquipmentItemSelections: {},
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
                  ) : null}
                  {isStatsStep ? (
                    <section className="character-form-section character-create-stats-strip-section">
                      <div className="character-create-stat-summary">
                        <article className="character-create-stat-card">
                          <span className="character-create-stat-card-label">HP</span>
                          <strong className="character-create-stat-card-value">
                            {formState.maxHp ?? 12}
                          </strong>
                          {derivedLevelStats && selectedClass ? (
                            (() => {
                              const level = formState.level ?? 1;
                              const con = formState.abilities?.con ?? 10;
                              const conMod = Math.floor((con - 10) / 2);
                              const hdMax =
                                { d6: 6, d8: 8, d10: 10, d12: 12 }[selectedClass.hitDie] ?? 0;
                              const hdAvg =
                                { d6: 4, d8: 5, d10: 6, d12: 7 }[selectedClass.hitDie] ?? 0;
                              const modText = conMod >= 0 ? `+${conMod}` : `${conMod}`;
                              const levelGain = Math.max(hdAvg + conMod, 1);
                              const bonusText =
                                derivedLevelStats.hpBonus > 0
                                  ? ` + 보정 ${derivedLevelStats.hpBonus}`
                                  : '';
                              return (
                                <span className="character-create-stat-card-help">
                                  {level === 1
                                    ? `${selectedClass.hitDie}(max ${hdMax}) + Con(${modText})${bonusText}`
                                    : `${selectedClass.hitDie}(max ${hdMax}) + ${level - 1}x(${levelGain})${bonusText}`}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="character-create-stat-card-help">
                              레벨과 건강 기반 자동 계산
                            </span>
                          )}
                        </article>
                        <article className="character-create-stat-card">
                          <span className="character-create-stat-card-label">방어도</span>
                          <strong className="character-create-stat-card-value">
                            {formState.armorClass ?? 10}
                          </strong>
                          <span className="character-create-stat-card-help">
                            장비와 민첩 보정 반영
                          </span>
                        </article>
                        <article className="character-create-stat-card">
                          <span className="character-create-stat-card-label">이동속도</span>
                          <strong className="character-create-stat-card-value">
                            {formState.speed ?? 30}
                          </strong>
                          <span className="character-create-stat-card-help">
                            종족/직업 보정 포함
                          </span>
                        </article>
                        <article className="character-create-stat-card">
                          <span className="character-create-stat-card-label">숙련도</span>
                          <strong className="character-create-stat-card-value">
                            {formState.proficiencyBonus ?? 2}
                          </strong>
                          <span className="character-create-stat-card-help">
                            {derivedLevelStats
                              ? `레벨 ${formState.level ?? 1} 기준 자동`
                              : '레벨에 따라 자동 상승'}
                          </span>
                        </article>
                      </div>
                    </section>
                  ) : null}
                  {!isEquipmentStep && !isSpellsStep && !isStatsStep ? (
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
                            이동속도:{' '}
                            {selectedRaceInfo ? `${selectedRaceInfo.speed} ft.` : '정보 없음'}
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
                          <p>히트 다이스: {selectedClassInfo?.hitDieRaw ?? '정보 없음'}</p>
                          <p>
                            주문시전 능력치:{' '}
                            {selectedClassInfo?.spellcastingAbility
                              ? localizeSrdTermText(selectedClassInfo.spellcastingAbility)
                              : '없음'}
                          </p>
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
                  ) : isSpellsStep && selectedClass ? (
                    (() => {
                      const renderedCantripCount = selectedStartingCantripCount;
                      const renderedSpellCount = selectedStartingSlotSpellCount;
                      const hasStartingSpells = renderedCantripCount > 0 || renderedSpellCount > 0;
                      return (
                        <section className="character-form-section character-create-loadout-spells">
                          <div className="section-heading compact">
                            <div>
                              <span className="eyebrow">시작 주문</span>
                              <h2>
                                {hasStartingSpells
                                  ? `캔트립 ${renderedCantripCount}개 + 주문 ${renderedSpellCount}개`
                                  : '선택할 시작 주문 없음'}
                              </h2>
                            </div>
                          </div>
                          {!hasStartingSpells ? (
                            <p className="character-empty-note">
                              현재 선택한 직업과 레벨에서는 캐릭터 생성 시 고를 시작 주문이
                              없습니다. 장비 탭까지 확인했다면 바로 생성할 수 있습니다.
                            </p>
                          ) : null}
                          {renderedCantripCount > 0 && (
                            <SpellSelectionGrid
                              title="캔트립"
                              helper="항상 사용할 수 있는 소마법을 고릅니다."
                              options={detailedCantripOptions}
                              selectedIds={(formState.startingSpells?.cantrips ?? [])
                                .map((spell) => spell.trim())
                                .filter(Boolean)}
                              maxSelected={renderedCantripCount}
                              onChange={(cantrips) => {
                                setFormValidationError(null);
                                setFormState((current) => {
                                  const base: StartingSpellsDto = current.startingSpells ?? {
                                    cantrips: [],
                                    spells: new Array(selectedStartingSlotSpellCount).fill(''),
                                  };
                                  return {
                                    ...current,
                                    startingSpells: { ...base, cantrips },
                                  };
                                });
                              }}
                            />
                          )}
                          {renderedSpellCount > 0 && (
                            <SpellSelectionGrid
                              title="슬롯 주문"
                              helper="주문책/습득 주문에 넣을 시작 주문을 고릅니다."
                              options={detailedSlotSpellOptions}
                              selectedIds={(formState.startingSpells?.spells ?? [])
                                .map((spell) => spell.trim())
                                .filter(Boolean)}
                              maxSelected={renderedSpellCount}
                              onChange={(spells) => {
                                setFormValidationError(null);
                                setFormState((current) => {
                                  const base: StartingSpellsDto = current.startingSpells ?? {
                                    cantrips: new Array(selectedStartingCantripCount).fill(''),
                                    spells: [],
                                  };
                                  const preparedSpells = (base.preparedSpells ?? []).filter(
                                    (spellId) => spells.includes(spellId)
                                  );
                                  return {
                                    ...current,
                                    startingSpells: {
                                      ...base,
                                      spells,
                                      ...(getPreparedSpellAbilityKey(current.className)
                                        ? { preparedSpells }
                                        : {}),
                                    },
                                  };
                                });
                              }}
                            />
                          )}
                          {startingPreparedSpellLimit !== null &&
                            selectedStartingSlotSpells.length > 0 && (
                              <SpellSelectionGrid
                                title="준비 주문"
                                helper="선택한 슬롯 주문 중 오늘 바로 사용할 주문을 고릅니다."
                                options={selectedStartingSlotSpells.map((spellId) => ({
                                  id: spellId,
                                  label: getImplementedSpellLabel(spellId, ruleCatalog),
                                  level: slotSpellOptions.find((spell) => spell.id === spellId)?.level,
                                  detail: buildSpellSelectionDetail(
                                    slotSpellOptions.find((spell) => spell.id === spellId) ?? {
                                      id: spellId,
                                      label: getImplementedSpellLabel(spellId, ruleCatalog),
                                      level: null,
                                    },
                                    ruleCatalog,
                                    spellCatalogById
                                  ),
                                }))}
                                selectedIds={selectedStartingPreparedSpells}
                                maxSelected={startingPreparedSpellLimit}
                                onChange={(preparedSpells) => {
                                  setFormValidationError(null);
                                  setFormState((current) => {
                                    const base: StartingSpellsDto = current.startingSpells ?? {
                                      cantrips: new Array(selectedStartingCantripCount).fill(''),
                                      spells: new Array(selectedStartingSlotSpellCount).fill(''),
                                    };
                                    return {
                                      ...current,
                                      startingSpells: {
                                        ...base,
                                        preparedSpells,
                                      },
                                    };
                                  });
                                }}
                              />
                            )}
                        </section>
                      );
                    })()
                  ) : null}
                </div>
                {isStatsStep ? (
                  <section className="character-form-section character-create-point-buy-section">
                    <div className="section-heading compact">
                      <div>
                        <span className="eyebrow">능력치</span>
                        <h2>능력치 (Point Buy 27)</h2>
                      </div>
                      {pointBuyState.enforced ? (
                        <div className="character-create-point-buy-summary">
                          남은 포인트:{' '}
                          <strong style={{ color: pointBuyState.isValid ? 'inherit' : '#d04040' }}>
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
                        <div className="character-create-point-buy-summary muted">
                          종족을 먼저 선택해 주세요!
                        </div>
                      )}
                    </div>

                    <div className="character-create-point-buy-grid">
                      {(Object.keys(abilityDisplayLabels) as AbilityKey[]).map((ability) => {
                        const base = pointBuyState.bases[ability];
                        const bonus = selectedRace?.abilityIncreases[ability] ?? 0;
                        const finalScore = formState.abilities?.[ability] ?? 10;
                        const cost = pointBuyState.costs[ability];
                        const canDec = pointBuyState.enforced && base > POINT_BUY_MIN_BASE;
                        const nextBaseCost =
                          pointBuyState.enforced && base < POINT_BUY_MAX_BASE
                            ? (POINT_BUY_COST[base + 1] ?? cost ?? 0)
                            : null;
                        const previousBaseCost = canDec
                          ? (POINT_BUY_COST[base - 1] ?? cost ?? 0)
                          : null;
                        const nextStepCost =
                          cost !== null && nextBaseCost !== null ? nextBaseCost - cost : null;
                        const refundStepCost =
                          canDec && cost !== null && previousBaseCost !== null
                            ? cost - previousBaseCost
                            : null;
                        const canInc =
                          pointBuyState.enforced &&
                          base < POINT_BUY_MAX_BASE &&
                          nextStepCost !== null &&
                          nextStepCost <= pointBuyState.remaining;
                        return (
                          <div key={ability} className="character-create-point-buy-card">
                            <label htmlFor={`character-${ability}`}>
                              {abilityDisplayLabels[ability]}
                              {bonus > 0 && (
                                <span style={{ marginLeft: 6, color: '#3a7' }}>
                                  (+{bonus} 종족)
                                </span>
                              )}
                            </label>
                            {pointBuyState.enforced ? (
                              <div className="character-create-point-buy-control">
                                <button
                                  type="button"
                                  onClick={() => adjustAbilityBase(ability, -1)}
                                  disabled={!canDec}
                                  aria-label={`${abilityDisplayLabels[ability]} 감소`}
                                  title={
                                    refundStepCost !== null
                                      ? `${refundStepCost}포인트 환급`
                                      : undefined
                                  }
                                >
                                  −
                                </button>
                                <div className="character-create-point-buy-value">
                                  <div className="character-create-point-buy-main">
                                    base {base} → {finalScore}
                                  </div>
                                  <div className="character-create-point-buy-cost">
                                    {canInc && nextStepCost !== null
                                      ? `비용 ${nextStepCost}p`
                                      : canDec && refundStepCost !== null
                                        ? `비용 ${refundStepCost}p`
                                        : '비용 0p'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => adjustAbilityBase(ability, 1)}
                                  disabled={!canInc}
                                  aria-label={`${abilityDisplayLabels[ability]} 증가`}
                                  title={
                                    nextStepCost !== null ? `${nextStepCost}포인트 소비` : undefined
                                  }
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
                ) : null}
              </div>
              <div className="character-create-step-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={goToPreviousCreateStep}
                  disabled={createStepIndex === 0}
                >
                  이전 장
                </button>
                <div className="character-create-step-actions-center">
                  <strong>
                    {createStepIndex + 1} / {CHARACTER_CREATE_STEPS.length}
                  </strong>
                  <span>{currentCreateStep.label}</span>
                </div>
                {isFinalCreateStep ? (
                  <button
                    type="submit"
                    className="primary"
                    disabled={busy || classDefinitions.length === 0}
                  >
                    {editingCharacterId ? '저장' : '생성'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={goToNextCreateStep}
                    disabled={busy}
                  >
                    다음 장
                  </button>
                )}
              </div>
            </form>
            </div>
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
              <strong>{selectedCharacter.name}</strong>
              {' 을(를) 정말 삭제할까요?'}
            </p>
            <p className="character-delete-subcopy">{'삭제 후에는 되돌릴 수 없습니다.'}</p>

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
