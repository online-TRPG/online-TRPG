import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  PlayerScenarioNodeDto,
  SessionCharacterResponseDto,
} from '@trpg/shared-types';
import {
  getCharacterClassLabel,
  getCharacterImage,
} from '../utils/characterVisuals';
import './StoryNodeSurface.css';

interface StoryNodeSurfaceProps {
  node: PlayerScenarioNodeDto | null;
  scenarioTitle?: string | null;
  phase?: string | null;
  characters: SessionCharacterResponseDto[];
  currentUserId: string;
  isGmView?: boolean;
  rpUtterances?: StoryRpUtterance[];
  onRpUtteranceClick?: () => void;
  getCharacterColorStyle?: (character: SessionCharacterResponseDto) => CSSProperties;
}

export interface StoryRpUtterance {
  id: string;
  characterId: string;
  message: string;
  createdAt: string;
}

type VisibleStoryRpUtterance = StoryRpUtterance & {
  isFading: boolean;
};

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

function getNodeTypeLabel(node: PlayerScenarioNodeDto | null) {
  if (!node) return 'STORY';
  return node.nodeType.toUpperCase();
}

function getPhaseLabel(phase: string | null | undefined) {
  if (!phase) return '상태 미확인';
  if (phase === 'dialogue') return '진행: 대화';
  if (phase === 'exploration') return '진행: 탐색';
  if (phase === 'combat') return '진행: 전투';
  if (phase === 'lobby') return '진행: 대기';
  if (phase === 'rest') return '진행: 휴식';
  return `진행: ${phase}`;
}

function splitSceneParagraphs(sceneText: string | undefined) {
  // 서버가 내려주는 sceneText를 그대로 살리되, 줄 단위 서술은 읽기 쉬운 문단으로 나눕니다.
  const paragraphs = (sceneText ?? '')
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : ['현재 장면 설명이 아직 준비되지 않았습니다.'];
}

export function StoryNodeSurface({
  node,
  scenarioTitle,
  phase,
  characters,
  currentUserId,
  isGmView = false,
  rpUtterances = [],
  onRpUtteranceClick,
  getCharacterColorStyle,
}: StoryNodeSurfaceProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const [speechBubbles, setSpeechBubbles] = useState<VisibleStoryRpUtterance[]>([]);
  const [highlightedCharacterIds, setHighlightedCharacterIds] = useState<Set<string>>(
    () => new Set()
  );
  const bubbleTimersRef = useRef<
    Map<
      string,
      {
        fadeTimer: number;
        removeTimer: number;
      }
    >
  >(new Map());
  const highlightTimersRef = useRef<Map<string, number>>(new Map());
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ?? null;
  const selectedCharacterImage = selectedCharacter ? getCharacterImage(selectedCharacter) : null;
  const selectedEquippedWeapon =
    selectedCharacter?.inventory.find((item) => item.id === selectedCharacter.equippedWeaponId) ??
    null;
  const speechBubbleByCharacterId = useMemo(() => {
    const next = new Map<string, VisibleStoryRpUtterance>();
    speechBubbles.forEach((bubble) => {
      next.set(bubble.characterId, bubble);
    });
    return next;
  }, [speechBubbles]);

  useEffect(() => {
    rpUtterances.forEach((utterance) => {
      if (bubbleTimersRef.current.has(utterance.id)) return;

      setSpeechBubbles((current) => [
        ...current.filter((bubble) => bubble.characterId !== utterance.characterId),
        { ...utterance, isFading: false },
      ]);
      setHighlightedCharacterIds((current) => {
        const next = new Set(current);
        next.add(utterance.characterId);
        return next;
      });

      const activeHighlightTimer = highlightTimersRef.current.get(utterance.characterId);
      if (activeHighlightTimer) {
        window.clearTimeout(activeHighlightTimer);
      }
      const highlightTimer = window.setTimeout(() => {
        setHighlightedCharacterIds((current) => {
          const next = new Set(current);
          next.delete(utterance.characterId);
          return next;
        });
        highlightTimersRef.current.delete(utterance.characterId);
      }, 2000);

      const fadeTimer = window.setTimeout(() => {
        setSpeechBubbles((current) =>
          current.map((bubble) =>
            bubble.id === utterance.id ? { ...bubble, isFading: true } : bubble
          )
        );
      }, 4200);
      const removeTimer = window.setTimeout(() => {
        setSpeechBubbles((current) => current.filter((bubble) => bubble.id !== utterance.id));
        bubbleTimersRef.current.delete(utterance.id);
      }, 5000);

      highlightTimersRef.current.set(utterance.characterId, highlightTimer);
      bubbleTimersRef.current.set(utterance.id, { fadeTimer, removeTimer });
    });
  }, [rpUtterances]);

  useEffect(
    () => () => {
      bubbleTimersRef.current.forEach(({ fadeTimer, removeTimer }) => {
        window.clearTimeout(fadeTimer);
        window.clearTimeout(removeTimer);
      });
      highlightTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      bubbleTimersRef.current.clear();
      highlightTimersRef.current.clear();
    },
    []
  );

  useEffect(() => {
    if (!selectedCharacterId) return;
    if (characters.some((character) => character.id === selectedCharacterId)) return;
    setSelectedCharacterId(null);
  }, [characters, selectedCharacterId]);

  useEffect(() => {
    if (!selectedCharacter) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedCharacterId(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCharacter]);

  return (
    <div className="story-node-surface">
      <header className="story-node-header">
        <div className="story-node-title-row">
          <span className="story-node-eyebrow">스토리 노드</span>
          <h1>{node?.title ?? scenarioTitle ?? '진행 중인 장면'}</h1>
          <button
            type="button"
            className={`story-node-summary-button${isSummaryOpen ? ' active' : ''}`}
            onClick={() => setSummaryOpen((current) => !current)}
            aria-expanded={isSummaryOpen}
            aria-controls="story-node-summary-popover"
          >
            장면 설명
          </button>
        </div>
        <div className="story-node-status-row" aria-label="장면 상태">
          <span>{getNodeTypeLabel(node)}</span>
          <span>{getPhaseLabel(phase)}</span>
          {isGmView ? <span>GM 화면</span> : <span>플레이어 화면</span>}
        </div>
      </header>

      {isSummaryOpen ? (
        <div
          id="story-node-summary-popover"
          className="story-node-summary-popover"
          role="dialog"
          aria-label="장면 설명"
        >
          <div className="story-node-summary-popover-head">
            <strong>장면 설명</strong>
            <button type="button" onClick={() => setSummaryOpen(false)}>
              닫기
            </button>
          </div>
          <div className="story-node-summary-popover-body">
            {sceneParagraphs.map((paragraph, index) => (
              <p key={`${paragraph.slice(0, 20)}-${index}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="story-node-content">
        <section className="story-node-main" aria-label="스토리 장면">
          <div className="story-scene-visual">
            {node?.imageUrl ? (
              <img src={node.imageUrl} alt={node.title} className="story-scene-image" />
            ) : (
              <div className="story-scene-empty">
                <span>장면 이미지</span>
                <strong>{node?.title ?? scenarioTitle ?? '장면 이미지 없음'}</strong>
              </div>
            )}
            <div className="story-scene-caption">
              <span>현재 장면</span>
              <strong>{node?.title ?? '스토리 노드'}</strong>
            </div>
          </div>

          <section className="story-scene-text" aria-label="장면 설명">
            <span className="story-node-eyebrow">GM 내레이션</span>
            {sceneParagraphs.map((paragraph, index) => (
              <p key={`${paragraph}-${index}`}>{paragraph}</p>
            ))}
          </section>
        </section>
      </div>

      <section className="story-party-strip" aria-label="파티 캐릭터">
        <div className="story-party-list">
          {characters.length ? (
            characters.map((character) => {
              const isMine = character.userId === currentUserId;
              const isSelected = selectedCharacter?.id === character.id;
              const hpPercent = getHpPercent(character);
              const characterImage = getCharacterImage(character);
              const speechBubble = speechBubbleByCharacterId.get(character.id) ?? null;
              const isHighlighted = highlightedCharacterIds.has(character.id);
              const partyColorStyle = getCharacterColorStyle?.(character);

              return (
                <div
                  className={`story-party-card-wrap${isHighlighted ? ' highlighted' : ''}`}
                  key={character.id}
                >
                  {speechBubble ? (
                    <button
                      type="button"
                      className={`story-speech-bubble${speechBubble.isFading ? ' fading' : ''}`}
                      onClick={onRpUtteranceClick}
                      aria-label="메인 채팅에서 RP 대사 보기"
                    >
                      {speechBubble.message}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`story-party-card${isSelected ? ' selected' : ''}`}
                    style={partyColorStyle}
                    onClick={() => setSelectedCharacterId(character.id)}
                  >
                    <span className="story-party-avatar">
                      <img src={characterImage} alt={character.name} />
                    </span>
                    <span className="story-party-body">
                      <strong>
                        {character.name}
                        {isMine ? <em>나</em> : null}
                      </strong>
                      <small>{getCharacterClassLabel(character.className)} / Lv {character.level}</small>
                      <span
                        className="story-hp-track"
                        aria-label={`HP ${character.currentHp}/${character.maxHp}`}
                      >
                        <span style={{ width: `${hpPercent}%` }} />
                      </span>
                    </span>
                    <span className="story-party-hp">
                      {character.currentHp}/{character.maxHp}
                    </span>
                  </button>
                </div>
              );
            })
          ) : (
            <p className="story-empty-text">파티 캐릭터 정보가 아직 없습니다.</p>
          )}
        </div>
      </section>

      {selectedCharacter ? (
        <div
          className="story-character-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedCharacterId(null);
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
                  {selectedCharacterImage ? (
                    <img src={selectedCharacterImage} alt={selectedCharacter.name} />
                  ) : null}
                </span>
                <div>
                  <span className="story-node-eyebrow">현재 캐릭터 상태</span>
                  <h2 id="story-character-modal-title">{selectedCharacter.name}</h2>
                  <p>
                    {selectedCharacter.ancestry || '종족 미정'} ·{' '}
                    {getCharacterClassLabel(selectedCharacter.className)} Lv {selectedCharacter.level}
                    {selectedCharacter.subclassName ? ` · ${selectedCharacter.subclassName}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="story-character-modal-close"
                onClick={() => setSelectedCharacterId(null)}
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
                      {formatStat(selectedCharacter.currentHp)} / {formatStat(selectedCharacter.maxHp)}
                    </strong>
                    <small>임시 HP {formatStat(selectedCharacter.tempHp)}</small>
                  </div>
                  <div className="story-character-hp-bar" aria-label="현재 HP 비율">
                    <span style={{ width: `${getHpPercent(selectedCharacter)}%` }} />
                  </div>
                </div>
                <dl className="story-character-stat-grid">
                  <div>
                    <dt>방어도</dt>
                    <dd>{formatStat(selectedCharacter.armorClass)}</dd>
                  </div>
                  <div>
                    <dt>이동</dt>
                    <dd>{formatStat(selectedCharacter.speed)}</dd>
                  </div>
                  <div>
                    <dt>숙련 보너스</dt>
                    <dd>+{formatStat(selectedCharacter.proficiencyBonus)}</dd>
                  </div>
                  <div>
                    <dt>이니셔티브</dt>
                    <dd>{formatStat(selectedCharacter.initiative)}</dd>
                  </div>
                  <div>
                    <dt>세션 상태</dt>
                    <dd>{selectedCharacter.status}</dd>
                  </div>
                  <div>
                    <dt>상태 이상</dt>
                    <dd>{getConditionLabel(selectedCharacter)}</dd>
                  </div>
                </dl>
              </section>

              <section className="story-character-modal-panel">
                <h3>능력치</h3>
                <div className="story-character-abilities-grid">
                  {abilityKeys.map((ability) => (
                    <div key={ability}>
                      <span>{abilityDisplayLabels[ability]}</span>
                      <strong>{formatStat(selectedCharacter.abilities[ability])}</strong>
                      <small>{formatModifier(selectedCharacter.abilities[ability])}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="story-character-modal-panel">
                <h3>기술 숙련</h3>
                {selectedCharacter.proficientSkills.length ? (
                  <div className="story-character-chip-list">
                    {selectedCharacter.proficientSkills.map((skill) => (
                      <span key={skill}>{getSkillLabel(skill)}</span>
                    ))}
                  </div>
                ) : (
                  <p className="story-character-empty">선택된 기술 숙련이 없습니다.</p>
                )}
              </section>

              <section className="story-character-modal-panel">
                <h3>특성</h3>
                {selectedCharacter.features.length ? (
                  <ul className="story-character-text-list">
                    {selectedCharacter.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="story-character-empty">등록된 특성이 없습니다.</p>
                )}
              </section>

              <section className="story-character-modal-panel story-character-modal-wide">
                <h3>인벤토리</h3>
                {selectedEquippedWeapon ? (
                  <p className="story-character-equipped">
                    장착 무기: <strong>{selectedEquippedWeapon.name}</strong>
                  </p>
                ) : (
                  <p className="story-character-equipped">장착 무기 없음</p>
                )}
                {selectedCharacter.inventory.length ? (
                  <div className="story-character-inventory-list">
                    {selectedCharacter.inventory.map((item) => (
                      <article
                        key={item.id}
                        className={`story-character-inventory-item${
                          item.id === selectedCharacter.equippedWeaponId ? ' equipped' : ''
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
                  {selectedCharacter.bio?.trim() || '아직 등록된 캐릭터 소개가 없습니다.'}
                </p>
              </section>

              <section className="story-character-modal-panel">
                <h3>세션 메타</h3>
                <dl className="story-character-meta-list">
                  <div>
                    <dt>캐릭터 ID</dt>
                    <dd>{selectedCharacter.characterId}</dd>
                  </div>
                  <div>
                    <dt>세션 캐릭터 ID</dt>
                    <dd>{selectedCharacter.id}</dd>
                  </div>
                  <div>
                    <dt>생성</dt>
                    <dd>{new Date(selectedCharacter.createdAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>수정</dt>
                    <dd>{new Date(selectedCharacter.updatedAt).toLocaleString()}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
