import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  AiHumanGmAssistSuggestionRequestDto,
  CreateHumanGmAiAssistSuggestionDto,
  HumanGmAiAssistSuggestionDto,
  PlayerScenarioNodeDto,
  RestActionDto,
  SessionCharacterResponseDto,
} from '@trpg/shared-types';
import {
  getCharacterClassLabel,
  getCharacterImage,
} from '../utils/characterVisuals';
import quillImage from '../../../components/quill.webp';
import storyNodeBadge from '../../../components/node_badge_story.webp';
import { CharacterDetailModal } from './CharacterDetailModal';
import { HumanGmAiAssistPanel } from './HumanGmAiAssistPanel';
import { NodeHeaderScroll } from './NodeHeaderScroll';
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
  isBusy?: boolean;
  onRequestRest?: (
    restType: RestActionDto['restType'],
    characterId?: string,
    hitDiceToSpend?: number
  ) => Promise<void> | void;
  gmNodeMoveOptions?: StoryNodeMoveOption[];
  onGmNodeMove?: (nodeId: string) => Promise<void> | void;
  onGmMessage?: (payload: {
    content: string;
    speakerName?: string | null;
    asNpc?: boolean;
    privateNote?: string | null;
  }) => Promise<void> | void;
  isGmMessagePending?: boolean;
  gmAiAssistSuggestions?: HumanGmAiAssistSuggestionDto[];
  onGmAiAssistCreate?: (
    payload: CreateHumanGmAiAssistSuggestionDto
  ) => Promise<void> | void;
  onGmAiAssistGenerate?: (
    payload: AiHumanGmAssistSuggestionRequestDto
  ) => Promise<void> | void;
  onGmAiAssistAccept?: (
    suggestion: HumanGmAiAssistSuggestionDto
  ) => Promise<void> | void;
  isGmAiAssistPending?: boolean;
  recentGmAiAssistLogs?: string[];
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

export type StoryNodeMoveOption = {
  nodeId: string;
  title: string;
  nodeType: string;
  label?: string | null;
  condition?: string | null;
  note?: string | null;
  isFallback?: boolean;
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

function StoryPartyFrameCorners() {
  return (
    <>
      <span className="story-party-frame-corner top-left" aria-hidden="true" />
      <span className="story-party-frame-corner top-right" aria-hidden="true" />
      <span className="story-party-frame-corner bottom-left" aria-hidden="true" />
      <span className="story-party-frame-corner bottom-right" aria-hidden="true" />
    </>
  );
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
  isBusy = false,
  onRequestRest,
  gmNodeMoveOptions = [],
  onGmNodeMove,
  onGmMessage,
  isGmMessagePending = false,
  gmAiAssistSuggestions = [],
  onGmAiAssistCreate,
  onGmAiAssistGenerate,
  onGmAiAssistAccept,
  isGmAiAssistPending = false,
  recentGmAiAssistLogs = [],
}: StoryNodeSurfaceProps) {
  const [shortRestHitDiceToSpend, setShortRestHitDiceToSpend] = useState(0);
  const [isGmNpcMessage, setGmNpcMessage] = useState(false);
  const [gmMessageSpeaker, setGmMessageSpeaker] = useState('');
  const [gmMessageContent, setGmMessageContent] = useState('');
  const [gmMessagePrivateNote, setGmMessagePrivateNote] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
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
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const restTargetCharacter = (isGmView ? selectedCharacter : myCharacter) ?? myCharacter;
  const restTargetCharacterId = restTargetCharacter?.id;
  const restHitDiceMaximum = Math.max(
    restTargetCharacter?.hitDiceRemaining ?? restTargetCharacter?.level ?? 0,
    0
  );
  const clampedShortRestHitDiceToSpend = Math.min(
    Math.max(shortRestHitDiceToSpend, 0),
    restHitDiceMaximum
  );
  const shouldShowGmControls =
    isGmView && Boolean(onGmMessage || onGmNodeMove || onGmAiAssistCreate || onGmAiAssistAccept);
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
    if (shortRestHitDiceToSpend > restHitDiceMaximum) {
      setShortRestHitDiceToSpend(restHitDiceMaximum);
    }
  }, [restHitDiceMaximum, shortRestHitDiceToSpend]);

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

  async function handleGmMessageSubmit() {
    const content = gmMessageContent.trim();
    if (!content || !onGmMessage || isGmMessagePending) {
      return;
    }

    await onGmMessage({
      content,
      speakerName: gmMessageSpeaker.trim() || null,
      asNpc: isGmNpcMessage,
      privateNote: gmMessagePrivateNote.trim() || null,
    });
    setGmMessageContent('');
    setGmMessagePrivateNote('');
  }

  return (
    <div className="story-node-surface">
      <NodeHeaderScroll variant="story" className="story-node-header">
        <div className="story-node-title-row">
          <img
            src={storyNodeBadge}
            alt="스토리 노드"
            className="session-node-type-badge"
          />
          <h1 className="node-header-scroll-title">{node?.title ?? scenarioTitle ?? '진행 중인 장면'}</h1>
        </div>
        <div className="story-node-status-row" aria-label="장면 상태">
          <span>{getPhaseLabel(phase)}</span>
          {isGmView ? <span>GM 화면</span> : <span>플레이어 화면</span>}
        </div>
      </NodeHeaderScroll>

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
            <img
              src={quillImage}
              alt=""
              aria-hidden="true"
              className="story-scene-quill"
            />
            {sceneParagraphs.map((paragraph, index) => (
              <p key={`${paragraph}-${index}`}>{paragraph}</p>
            ))}
          </section>
        </section>
      </div>

      {onRequestRest ? (
        <section className="story-rest-actions" aria-label="휴식 행동">
          <span className="story-rest-actions-label">
            휴식 대상 {restTargetCharacter?.name ?? '캐릭터 미선택'}
          </span>
          <button
            type="button"
            className="story-rest-action-button"
            disabled={isBusy || !restTargetCharacterId}
            onClick={() =>
              void onRequestRest('short', restTargetCharacterId, clampedShortRestHitDiceToSpend)
            }
          >
            짧은 휴식
          </button>
          <label className="story-rest-hit-dice-control">
            <span>HD {restHitDiceMaximum}</span>
            <input
              type="number"
              min={0}
              max={restHitDiceMaximum}
              step={1}
              value={clampedShortRestHitDiceToSpend}
              disabled={isBusy || !restTargetCharacterId}
              aria-label="스토리 노드 짧은 휴식 히트 다이스 사용 수"
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                setShortRestHitDiceToSpend(
                  Number.isInteger(nextValue)
                    ? Math.min(Math.max(nextValue, 0), restHitDiceMaximum)
                    : 0
                );
              }}
            />
          </label>
          <button
            type="button"
            className="story-rest-action-button"
            disabled={isBusy || !restTargetCharacterId}
            onClick={() => void onRequestRest('long', restTargetCharacterId)}
          >
            긴 휴식
          </button>
        </section>
      ) : null}

      {shouldShowGmControls ? (
        <aside className="story-gm-panel" aria-label="HUMAN GM 조작">
          <section className="story-gm-card story-gm-message">
            <span className="story-node-eyebrow">장면/NPC 전송</span>
            <label className="story-gm-message-mode">
              <input
                type="checkbox"
                checked={isGmNpcMessage}
                onChange={(event) => setGmNpcMessage(event.target.checked)}
              />
              NPC 대사로 전송
            </label>
            {isGmNpcMessage ? (
              <input
                className="story-gm-input"
                value={gmMessageSpeaker}
                placeholder="화자 이름"
                onChange={(event) => setGmMessageSpeaker(event.target.value)}
              />
            ) : null}
            <textarea
              className="story-gm-textarea"
              value={gmMessageContent}
              placeholder={
                isGmNpcMessage
                  ? 'NPC 대사를 입력하세요.'
                  : '플레이어에게 공개할 장면 묘사를 입력하세요.'
              }
              rows={3}
              maxLength={2000}
              onChange={(event) => setGmMessageContent(event.target.value)}
            />
            <input
              className="story-gm-input"
              value={gmMessagePrivateNote}
              placeholder="비공개 GM 메모"
              maxLength={1000}
              onChange={(event) => setGmMessagePrivateNote(event.target.value)}
            />
            <button
              type="button"
              disabled={isBusy || isGmMessagePending || !onGmMessage || !gmMessageContent.trim()}
              onClick={() => void handleGmMessageSubmit()}
            >
              {isGmMessagePending ? '전송 중' : '전송'}
            </button>
          </section>

          <section className="story-gm-card story-gm-node-move">
            <span className="story-node-eyebrow">장면 이동</span>
            {gmNodeMoveOptions.length ? (
              <div className="story-gm-node-list">
                {gmNodeMoveOptions.map((option) => (
                  <button
                    type="button"
                    key={`${option.nodeId}-${option.label ?? option.condition ?? option.title}`}
                    disabled={isBusy || !onGmNodeMove}
                    onClick={() => void onGmNodeMove?.(option.nodeId)}
                  >
                    <strong>{option.label?.trim() || option.title}</strong>
                    <span>
                      {option.title}
                      {option.isFallback ? ' · 기본 이동' : ''}
                      {option.nodeType ? ` · ${option.nodeType}` : ''}
                    </span>
                    {option.condition ? <small>{option.condition}</small> : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="story-gm-empty-text">현재 노드에서 바로 이동 가능한 노드가 없습니다.</p>
            )}
          </section>

          <HumanGmAiAssistPanel
            className="story-gm-card story-gm-ai-assist"
            nodeId={node?.id}
            suggestions={gmAiAssistSuggestions}
            nodeMoveOptions={gmNodeMoveOptions}
            onCreate={onGmAiAssistCreate}
            onGenerate={onGmAiAssistGenerate}
            onAccept={onGmAiAssistAccept}
            isBusy={isBusy}
            isPending={isGmAiAssistPending}
            sceneSummary={node?.sceneText ?? node?.title ?? scenarioTitle}
            recentLogs={recentGmAiAssistLogs}
          />
        </aside>
      ) : null}

      <section className="story-party-strip" aria-label="파티 캐릭터">
        <div className="story-party-list">
          {Array.from({ length: 4 }).map((_, index) => {
            const character = characters[index] ?? null;

            if (!character) {
              return (
                <div className="story-party-card-wrap empty" key={`empty-${index}`}>
                  <div className="story-party-card placeholder" aria-hidden="true">
                    <StoryPartyFrameCorners />
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
                  <StoryPartyFrameCorners />
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
