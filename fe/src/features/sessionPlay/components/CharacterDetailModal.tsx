import { useEffect, useState } from 'react';
import type { SessionCharacterResponseDto } from '@trpg/shared-types';
import {
  getCharacterClassLabel,
  getCharacterImage,
} from '../utils/characterVisuals';
import { getUserFacingItemName } from '../utils/displayNames';
import { getCharacterFeatureDisplayInfo } from '../../characters/characterFeaturePresentation';
import {
  loadClassFeatureManifest,
  type CanonicalClassFeatureEntry,
} from '../../../services/staticSrd';
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

function getConditionLabel(character: SessionCharacterResponseDto) {
  return character.conditions.length ? character.conditions.join(', ') : '정상';
}

export function CharacterDetailModal({
  character,
  onClose,
  onEquipInventoryItem,
  isEquipmentBusy = false,
}: CharacterDetailModalProps) {
  const [classFeatureManifest, setClassFeatureManifest] = useState<CanonicalClassFeatureEntry[]>([]);
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
  const preparedSpellSet = new Set(character.spells?.preparedSpells ?? []);

  useEffect(() => {
    let cancelled = false;
    loadClassFeatureManifest()
      .then((manifest) => {
        if (!cancelled) {
          setClassFeatureManifest(manifest);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClassFeatureManifest([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
                  const info = getCharacterFeatureDisplayInfo(feature, classFeatureManifest);
                  return (
                    <li key={feature}>
                      <span
                        className={`story-character-feature-item tone-${info.tone}`}
                        tabIndex={0}
                        title={info.description}
                      >
                        <small>{info.sourceLabel}</small>
                        <strong>{info.label}</strong>
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

          {character.spells ? (
            <section className="story-character-modal-panel">
              <h3>주문</h3>
              {character.spells.cantrips.length ? (
                <>
                  <small>캔트립</small>
                  <div className="story-character-chip-list">
                    {character.spells.cantrips.map((spell) => (
                      <span key={spell}>{spell}</span>
                    ))}
                  </div>
                </>
              ) : null}
              {character.spells.spells.length ? (
                <>
                  <small>슬롯 주문</small>
                  <ul className="story-character-text-list">
                    {character.spells.spells.map((spell) => (
                      <li key={spell}>
                        {spell}
                        {preparedSpellSet.has(spell) ? ' · 준비됨' : ''}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="story-character-empty">등록된 슬롯 주문이 없습니다.</p>
              )}
            </section>
          ) : null}

          <section className="story-character-modal-panel story-character-modal-wide">
            <h3>인벤토리</h3>
            <dl className="story-character-equipment-slots" aria-label="장착 부위">
              <div>
                <dt>오른손</dt>
                <dd>{equippedWeapon ? <strong>{getUserFacingItemName(equippedWeapon)}</strong> : '비어 있음'}</dd>
              </div>
              <div>
                <dt>왼손</dt>
                <dd>{offhandWeapon ? <strong>{getUserFacingItemName(offhandWeapon)}</strong> : '비어 있음'}</dd>
              </div>
              <div>
                <dt>몸통</dt>
                <dd>{equippedArmor ? <strong>{getUserFacingItemName(equippedArmor)}</strong> : '비어 있음'}</dd>
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
                  const itemDisplayName = getUserFacingItemName(item);
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
                                ? `${itemDisplayName} 착용 해제`
                                : `${itemDisplayName} 착용`
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
