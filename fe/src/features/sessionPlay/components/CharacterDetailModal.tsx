import { useEffect } from 'react';
import type { SessionCharacterResponseDto } from '@trpg/shared-types';
import {
  getCharacterClassLabel,
  getCharacterImage,
} from '../utils/characterVisuals';
import './StoryNodeSurface.css';

interface CharacterDetailModalProps {
  character: SessionCharacterResponseDto;
  onClose: () => void;
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
  ['History', '역사'],
  ['Insight', '통찰'],
  ['Investigation', '조사'],
  ['Perception', '인지능력'],
  ['Persuasion', '설득'],
  ['Stealth', '은신'],
  ['Survival', '생존'],
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

function getInventoryMetaLabel(item: SessionCharacterResponseDto['inventory'][number]) {
  const parts = [
    item.itemType,
    item.damageDice
      ? `${item.damageDice}${item.damageType ? ` ${item.damageType}` : ''}`
      : null,
    item.weightLb !== undefined ? `${formatStat(item.weightLb)} lb` : null,
    item.volumeCuFt !== undefined ? `${formatStat(item.volumeCuFt)} cu ft` : null,
    item.properties?.length ? item.properties.join(', ') : null,
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : '추가 속성 없음';
}

export function CharacterDetailModal({ character, onClose }: CharacterDetailModalProps) {
  const characterImage = getCharacterImage(character);
  const equippedWeapon =
    character.inventory.find(
      (item) =>
        item.id === character.equippedWeaponId ||
        item.itemDefinitionId === character.equippedWeaponId
    ) ?? null;
  const equippedArmor =
    character.inventory.find((item) => isArmorItem(item)) ?? null;
  const equippedShield =
    character.inventory.find((item) => isShieldItem(item)) ?? null;

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
                {character.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            ) : (
              <p className="story-character-empty">등록된 특성이 없습니다.</p>
            )}
          </section>

          <section className="story-character-modal-panel story-character-modal-wide">
            <h3>인벤토리</h3>
            {equippedWeapon ? (
              <p className="story-character-equipped">
                장착 무기: <strong>{equippedWeapon.name}</strong>
              </p>
            ) : (
              <p className="story-character-equipped">장착 무기 없음</p>
            )}
            {equippedArmor || equippedShield ? (
              <p className="story-character-equipped">
                장착 방어구:{' '}
                <strong>
                  {[equippedArmor?.name, equippedShield?.name].filter(Boolean).join(' + ')}
                </strong>
              </p>
            ) : (
              <p className="story-character-equipped">장착 방어구 없음</p>
            )}
            {character.inventory.length ? (
              <div className="story-character-inventory-list">
                {character.inventory.map((item) => (
                  <article
                    key={item.id}
                    className={`story-character-inventory-item${
                      isEquippedItem(item, character.equippedWeaponId) ? ' equipped' : ''
                    }`}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <small>{getInventoryMetaLabel(item)}</small>
                    </div>
                    <span>x{item.quantity}</span>
                  </article>
                ))}
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

          <section className="story-character-modal-panel">
            <h3>세션 메타</h3>
            <dl className="story-character-meta-list">
              <div>
                <dt>캐릭터 ID</dt>
                <dd>{character.characterId}</dd>
              </div>
              <div>
                <dt>세션 캐릭터 ID</dt>
                <dd>{character.id}</dd>
              </div>
              <div>
                <dt>생성</dt>
                <dd>{new Date(character.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>수정</dt>
                <dd>{new Date(character.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
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
    item.itemDefinitionId === equippedWeaponId ||
    isArmorItem(item) ||
    isShieldItem(item)
  );
}

function isArmorItem(item: SessionCharacterResponseDto['inventory'][number]) {
  const key = getItemSearchKey(item);
  return item.itemType === 'armor' || key.includes('armor-') || key.includes('갑옷');
}

function isShieldItem(item: SessionCharacterResponseDto['inventory'][number]) {
  const key = getItemSearchKey(item);
  return item.itemType === 'shield' || key.includes('shield') || key.includes('방패');
}

function getItemSearchKey(item: SessionCharacterResponseDto['inventory'][number]) {
  return [item.id, item.itemDefinitionId, item.name, item.itemType, ...(item.properties ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
