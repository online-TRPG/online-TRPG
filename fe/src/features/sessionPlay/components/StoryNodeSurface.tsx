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
import { CharacterDetailModal } from './CharacterDetailModal';
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
          {Array.from({ length: 4 }).map((_, index) => {
            const character = characters[index] ?? null;

            if (!character) {
              return (
                <div className="story-party-card-wrap empty" key={`empty-${index}`}>
                  <div className="story-party-card placeholder" aria-hidden="true">
                    <span className="story-party-empty-label">빈 슬롯</span>
                  </div>
                </div>
              );
            }

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
          })}
        </div>
      </section>

      {selectedCharacter ? (
        <CharacterDetailModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacterId(null)}
        />
      ) : null}
    </div>
  );
}
