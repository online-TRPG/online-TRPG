import { useEffect } from 'react';
import type { SessionCharacterResponseDto } from '@trpg/shared-types';
import {
  getCharacterClassLabel,
  getCharacterImage,
} from '../utils/characterVisuals';
import { InventoryItemInfo, getInventoryMetaLabel } from './InventoryItemInfo';
import './StoryNodeSurface.css';

interface CharacterDetailModalProps {
  character: SessionCharacterResponseDto;
  onClose: () => void;
  onEquipInventoryItem?: (item: SessionCharacterResponseDto['inventory'][number]) => void;
  isEquipmentBusy?: boolean;
}

type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

const abilityKeys: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const abilityDisplayLabels: Record<AbilityKey, string> = {
  str: '근력',
  dex: '민첩',
  con: '건강',
  int: '지능',
  wis: '지혜',
  cha: '매력',
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

const featureInfoMap: Record<string, { label: string; description: string }> = {
  'class.fighter.feature.second_wind': {
    label: '재기의 바람',
    description: '전투 중 보조행동으로 1d10 + 파이터 레벨만큼 HP를 회복합니다. 휴식 전까지 한 번 사용할 수 있습니다.',
  },
  'class.fighter.feature.action_surge': {
    label: '액션 서지',
    description: '자기 턴에 추가 행동 하나를 얻습니다. 휴식 전까지 한 번 사용할 수 있습니다.',
  },
  'class.fighter.feature.fighting_style': {
    label: '전투 방식',
    description: '파이터가 선택한 전투 방식입니다. 선택한 방식에 따라 공격, 방어, 쌍수 전투 등에 보너스를 줍니다.',
  },
  'feature.fighter.fighting_style': {
    label: '전투 방식',
    description: '파이터가 선택한 전투 방식입니다. 선택한 방식에 따라 공격, 방어, 쌍수 전투 등에 보너스를 줍니다.',
  },
  'class.rogue.feature.expertise': {
    label: '전문화',
    description: '선택한 숙련 기술 2개의 숙련 보너스를 두 배로 적용합니다.',
  },
  'feature.rogue.expertise': {
    label: '전문화',
    description: '선택한 숙련 기술 2개의 숙련 보너스를 두 배로 적용합니다.',
  },
  'class.rogue.feature.sneak_attack': {
    label: '암습',
    description: '턴당 한 번, finesse 또는 원거리 무기 공격이 명중했을 때 추가 피해를 줍니다. 공격에 불리점이 없어야 하며, 공격에 이점이 있어야합니다.',
  },
  'feature.rogue.sneak_attack': {
    label: '암습',
    description: '턴당 한 번, finesse 또는 원거리 무기 공격이 명중했을 때 추가 피해를 줍니다. 공격에 불리점이 없어야 하며, 공격에 이점이 있어야합니다.',
  },
  'class.rogue.feature.cunning_action': {
    label: '교활한 행동',
    description: '보조행동으로 질주, 이탈, 숨기 행동을 할 수 있습니다.',
  },
  'class.ranger.feature.favored_enemy': {
    label: '주적',
    description: '선택한 적 유형을 추적하거나 관련 정보를 판정할 때 유리한 단서를 얻는 레인저 특성입니다.',
  },
  'feature.ranger.favored_enemy': {
    label: '주적',
    description: '선택한 적 유형을 추적하거나 관련 정보를 판정할 때 유리한 단서를 얻는 레인저 특성입니다.',
  },
  'class.barbarian.feature.rage': {
    label: '격노',
    description: '전투 중 격노하여 근력 기반 공격 피해와 내구 관련 이점을 얻는 바바리안 특성입니다.',
  },
  'class.barbarian.subclass_feature.frenzy': {
    label: '광란',
    description: '격노 중 추가 보조행동 근접 공격을 가능하게 하는 광전사 특성입니다.',
  },
};

function getHpPercent(character: SessionCharacterResponseDto) {
  if (character.maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((character.currentHp / character.maxHp) * 100)));
}

function calcModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function formatModifier(score: number) {
  const modifier = calcModifier(score);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

function formatStat(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number.isInteger(value) ? `${value}` : `${Math.round(value * 10) / 10}`;
}

function getSkillLabel(skill: string) {
  const normalized = skill.trim();
  return skillLabelMap.get(normalized) ?? normalized;
}

function formatFeatureTokenValue(value: string) {
  const normalized = value.trim();
  return (
    skillLabelMap.get(normalized) ??
    fightingStyleLabelMap[normalized] ??
    favoredEnemyLabelMap[normalized] ??
    favoredHumanoidLabelMap[normalized] ??
    normalized
  );
}

function getFeatureDisplayInfo(feature: string) {
  const normalized = feature.trim();
  const staticInfo = featureInfoMap[normalized];
  if (staticInfo) return staticInfo;

  if (normalized.startsWith('expertise:')) {
    const skill = formatFeatureTokenValue(normalized.slice('expertise:'.length));
    return {
      label: `전문화: ${skill}`,
      description: `${skill} 판정에 숙련 보너스를 두 배로 적용합니다.`,
    };
  }

  if (normalized.startsWith('fighting_style:')) {
    const style = normalized.slice('fighting_style:'.length);
    const label = fightingStyleLabelMap[style] ?? style;
    return {
      label: `전투 방식: ${label}`,
      description: fightingStyleDescriptionMap[style] ?? `${label} 전투 방식이 적용됩니다.`,
    };
  }

  if (normalized.startsWith('favored_enemy:')) {
    const enemy = formatFeatureTokenValue(normalized.slice('favored_enemy:'.length));
    return {
      label: `주적: ${enemy}`,
      description: `${enemy} 유형의 적에 대한 추적, 지식, 단서 판정에 쓰이는 레인저 특성입니다.`,
    };
  }

  if (normalized.startsWith('favored_enemy_humanoid:')) {
    const race = formatFeatureTokenValue(normalized.slice('favored_enemy_humanoid:'.length));
    return {
      label: `주적 인간형: ${race}`,
      description: `주적 인간형 선택에 포함된 ${race}입니다.`,
    };
  }

  return {
    label: normalized,
    description: '아직 표시명이 등록되지 않은 특성입니다.',
  };
}

function getConditionLabel(character: SessionCharacterResponseDto) {
  return character.conditions.length ? character.conditions.join(', ') : '정상';
}

export function CharacterDetailModal({
  character,
  onClose,
  onEquipInventoryItem,
  isEquipmentBusy = false,
}: CharacterDetailModalProps) {
  const characterImage = getCharacterImage(character);
  const equippedWeapon =
    character.inventory.find(
      (item) =>
        item.id === character.equippedWeaponId ||
        item.itemDefinitionId === character.equippedWeaponId
    ) ?? null;
  const offhandWeapon =
    character.inventory.find(
      (item) =>
        item.id === character.offhandWeaponId ||
        item.itemDefinitionId === character.offhandWeaponId
    ) ?? null;
  const equippedArmor =
    character.inventory.find((item) => isArmorItem(item)) ?? null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="story-character-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="story-character-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-character-modal-title"
      >
        <header className="story-character-modal-header">
          <div className="story-character-modal-identity">
            <span className="story-character-modal-avatar">
              <img src={characterImage} alt={character.name} />
            </span>
            <div>
              <span className="story-node-eyebrow">현재 캐릭터 상태</span>
              <h2 id="story-character-modal-title">{character.name}</h2>
              <p>
                {character.ancestry || '종족 미정'} ·{' '}
                {getCharacterClassLabel(character.className)} Lv {character.level}
                {character.subclassName ? ` · ${character.subclassName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="story-character-modal-close"
            onClick={onClose}
            aria-label="캐릭터 상세 닫기"
          >
            닫기
          </button>
        </header>

        <div className="story-character-modal-body">
          <section className="story-character-modal-panel story-character-modal-vitals">
            <h3>전투 및 현재 상태</h3>
            <div className="story-character-hp-summary">
              <div>
                <span>현재 HP</span>
                <strong>
                  {formatStat(character.currentHp)} / {formatStat(character.maxHp)}
                </strong>
                <small>임시 HP {formatStat(character.tempHp)}</small>
              </div>
              <div className="story-character-hp-bar" aria-label="현재 HP 비율">
                <span style={{ width: `${getHpPercent(character)}%` }} />
              </div>
            </div>
            <dl className="story-character-stat-grid">
              <div>
                <dt>방어도</dt>
                <dd>{formatStat(character.armorClass)}</dd>
              </div>
              <div>
                <dt>이동</dt>
                <dd>{formatStat(character.speed)}</dd>
              </div>
              <div>
                <dt>숙련 보너스</dt>
                <dd>+{formatStat(character.proficiencyBonus)}</dd>
              </div>
              <div>
                <dt>이니셔티브</dt>
                <dd>{formatStat(character.initiative)}</dd>
              </div>
              <div>
                <dt>세션 상태</dt>
                <dd>{character.status}</dd>
              </div>
              <div>
                <dt>상태 이상</dt>
                <dd>{getConditionLabel(character)}</dd>
              </div>
            </dl>
          </section>

          <section className="story-character-modal-panel">
            <h3>능력치</h3>
            <div className="story-character-abilities-grid">
              {abilityKeys.map((ability) => (
                <div key={ability}>
                  <span>{abilityDisplayLabels[ability]}</span>
                  <strong>{formatStat(character.abilities[ability])}</strong>
                  <small>{formatModifier(character.abilities[ability])}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="story-character-modal-panel">
            <h3>기술 숙련</h3>
            {character.proficientSkills.length ? (
              <div className="story-character-chip-list">
                {character.proficientSkills.map((skill) => (
                  <span key={skill}>{getSkillLabel(skill)}</span>
                ))}
              </div>
            ) : (
              <p className="story-character-empty">선택된 기술 숙련이 없습니다.</p>
            )}
          </section>

          <section className="story-character-modal-panel">
            <h3>특성</h3>
            {character.features.length ? (
              <ul className="story-character-text-list">
                {character.features.map((feature) => {
                  const info = getFeatureDisplayInfo(feature);
                  return (
                    <li key={feature}>
                      <span
                        className="story-character-feature-item"
                        tabIndex={0}
                        title={info.description}
                      >
                        {info.label}
                        <span className="story-character-feature-tooltip" role="tooltip">
                          {info.description}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="story-character-empty">등록된 특성이 없습니다.</p>
            )}
          </section>

          <section className="story-character-modal-panel story-character-modal-wide">
            <h3>인벤토리</h3>
            <dl className="story-character-equipment-slots" aria-label="장착 부위">
              <div>
                <dt>오른손</dt>
                <dd>{equippedWeapon ? <strong>{equippedWeapon.name}</strong> : '비어 있음'}</dd>
              </div>
              <div>
                <dt>왼손</dt>
                <dd>{offhandWeapon ? <strong>{offhandWeapon.name}</strong> : '비어 있음'}</dd>
              </div>
              <div>
                <dt>몸통</dt>
                <dd>{equippedArmor ? <strong>{equippedArmor.name}</strong> : '비어 있음'}</dd>
              </div>
            </dl>
            {character.inventory.length ? (
              <div className="story-character-inventory-list">
                {character.inventory.flatMap((item) => {
                  const isHandEquipment = isWeaponItem(item) || isShieldItem(item);
                  const equippedCount = isHandEquipment
                    ? Number(isEquippedItem(item, character.equippedWeaponId)) +
                      Number(isEquippedItem(item, character.offhandWeaponId))
                    : 0;
                  const availableCount = Math.max(0, item.quantity - equippedCount);
                  if (!equippedCount) {
                    return [{ item, equipmentDisplayState: 'available' as const }];
                  }

                  const rows: Array<{
                    item: SessionCharacterResponseDto['inventory'][number];
                    equipmentDisplayState: 'equipped' | 'available';
                  }> = [
                    {
                      item: { ...item, quantity: equippedCount },
                      equipmentDisplayState: 'equipped' as const,
                    },
                  ];
                  if (availableCount > 0) {
                    rows.push({
                      item: { ...item, quantity: availableCount },
                      equipmentDisplayState: 'available' as const,
                    });
                  }
                  return rows;
                }).map(({ item, equipmentDisplayState }) => {
                  const isWeapon = isWeaponItem(item);
                  const isShield = isShieldItem(item);
                  const isArmor = isArmorItem(item);
                  const isBodyArmor =
                    equippedArmor &&
                    (item.id === equippedArmor.id ||
                      (Boolean(item.itemDefinitionId) &&
                        item.itemDefinitionId === equippedArmor.itemDefinitionId));
                  const isEquipped =
                    equipmentDisplayState === 'equipped' ||
                    Boolean(isBodyArmor);
                  const equipmentActionItem = {
                    ...item,
                    __equipmentDisplayState: equipmentDisplayState,
                  } as SessionCharacterResponseDto['inventory'][number];
                  return (
                    <article
                      key={`${item.id}-${equipmentDisplayState}`}
                      className={`story-character-inventory-item${isEquipped ? ' equipped' : ''}`}
                    >
                      <div>
                        <strong className="inventory-item-info-host">
                          <InventoryItemInfo item={item} />
                        </strong>
                        <small>{getInventoryMetaLabel(item)}</small>
                      </div>
                      <span>x{item.quantity}</span>
                      {isWeapon || isShield || isArmor ? (
                        <button
                          type="button"
                          disabled={isArmor || isEquipmentBusy || !onEquipInventoryItem}
                          title={
                            isArmor
                              ? '몸통 방어구는 현재 캐릭터 AC에 반영되어 있습니다.'
                              : isEquipped
                                ? `${item.name} 착용 해제`
                                : `${item.name} 착용`
                          }
                          onClick={() => onEquipInventoryItem?.(equipmentActionItem)}
                        >
                          {isEquipped ? '해제' : '착용'}
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="story-character-empty">인벤토리가 비어 있습니다.</p>
            )}
          </section>

          <section className="story-character-modal-panel">
            <h3>소개</h3>
            <p className="story-character-bio">
              {character.bio?.trim() || '아직 등록된 캐릭터 소개가 없습니다.'}
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

function isEquippedItem(
  item: SessionCharacterResponseDto['inventory'][number],
  equippedWeaponId: string | null | undefined,
) {
  return (
    item.id === equippedWeaponId ||
    item.itemDefinitionId === equippedWeaponId
  );
}

function isArmorItem(item: SessionCharacterResponseDto['inventory'][number]) {
  if (isShieldItem(item)) return false;
  const key = getItemSearchKey(item);
  return item.itemType === 'armor' || key.includes('armor-') || key.includes('갑옷');
}

function isShieldItem(item: SessionCharacterResponseDto['inventory'][number]) {
  const key = getItemSearchKey(item);
  return item.itemType === 'shield' || key.includes('shield') || key.includes('방패');
}

function isWeaponItem(item: SessionCharacterResponseDto['inventory'][number]) {
  const key = getItemSearchKey(item);
  return item.itemType === 'weapon' || Boolean(item.damageDice) || key.includes('weapon');
}

function getItemSearchKey(item: SessionCharacterResponseDto['inventory'][number]) {
  return [item.id, item.itemDefinitionId, item.name, item.itemType, ...(item.properties ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
