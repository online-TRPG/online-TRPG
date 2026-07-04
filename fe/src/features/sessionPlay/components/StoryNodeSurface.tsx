import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  type AiHumanGmAssistSuggestionRequestDto,
  type CreateHumanGmAiAssistSuggestionDto,
  type HumanGmAiAssistSuggestionDto,
  type PlayerScenarioNodeDto,
  type RestActionDto,
  type SessionCharacterResponseDto,
} from '@trpg/shared-types';
import {
  HUMAN_GM_MESSAGE_CONTENT_MAX_LENGTH,
  HUMAN_GM_PRIVATE_NOTE_MAX_LENGTH,
} from '@trpg/shared-types/frontend';
import {
  getCharacterClassLabel,
  getCharacterImage,
} from '../utils/characterVisuals';
import type { StoryRpUtterance } from '../utils/storyRpPresentation';
import {
  getStoryCharacterHpPercent,
  useStoryNodeSurfacePresentation,
} from '../hooks/useStoryNodeSurfacePresentation';
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
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ?? null;
  const myCharacter = characters.find((character) => character.userId === currentUserId) ?? null;
  const restTargetCharacter = (isGmView ? selectedCharacter : myCharacter) ?? myCharacter;
  const storyPresentation = useStoryNodeSurfacePresentation({
    nodeTitle: node?.title,
    scenarioTitle,
    phase,
    sceneText: node?.sceneText,
    isGmView,
    restTargetCharacterName: restTargetCharacter?.name,
    isGmNpcMessage,
    isGmMessagePending,
  });
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
            alt={storyPresentation.storyNodeBadgeAlt}
            className="session-node-type-badge"
          />
          <h1 className="node-header-scroll-title">{storyPresentation.titleText}</h1>
        </div>
        <div className="story-node-status-row" aria-label={storyPresentation.statusRowAriaLabel}>
          <span>{storyPresentation.phaseLabel}</span>
          <span>{storyPresentation.viewModeLabel}</span>
        </div>
      </NodeHeaderScroll>

      <div className="story-node-content">
        <section className="story-node-main" aria-label={storyPresentation.mainSectionAriaLabel}>
          <div className="story-scene-visual">
            {node?.imageUrl ? (
              <img src={node.imageUrl} alt={node.title} className="story-scene-image" />
            ) : (
              <div className="story-scene-empty">
                <span>{storyPresentation.sceneImageEyebrow}</span>
                <strong>{storyPresentation.sceneImageFallbackTitle}</strong>
              </div>
            )}
            <div className="story-scene-caption">
              <span>{storyPresentation.sceneCaptionEyebrow}</span>
              <strong>{storyPresentation.sceneCaptionTitle}</strong>
            </div>
          </div>

          <section className="story-scene-text" aria-label={storyPresentation.sceneTextAriaLabel}>
            <img
              src={quillImage}
              alt=""
              aria-hidden="true"
              className="story-scene-quill"
            />
            {storyPresentation.sceneParagraphs.map((paragraph, index) => (
              <p key={`${paragraph}-${index}`}>{paragraph}</p>
            ))}
          </section>
        </section>
      </div>

      {onRequestRest ? (
        <section className="story-rest-actions" aria-label={storyPresentation.restActionsAriaLabel}>
          <span className="story-rest-actions-label">
            {storyPresentation.restTargetLabel}
          </span>
          <button
            type="button"
            className="story-rest-action-button"
            disabled={isBusy || !restTargetCharacterId}
            onClick={() =>
              void onRequestRest('short', restTargetCharacterId, clampedShortRestHitDiceToSpend)
            }
          >
            {storyPresentation.shortRestLabel}
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
              aria-label={storyPresentation.shortRestHitDiceAriaLabel}
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
            {storyPresentation.longRestLabel}
          </button>
        </section>
      ) : null}

      {shouldShowGmControls ? (
        <aside className="story-gm-panel" aria-label={storyPresentation.gmPanelAriaLabel}>
          <section className="story-gm-card story-gm-message">
            <span className="story-node-eyebrow">{storyPresentation.gmMessageEyebrow}</span>
            <label className="story-gm-message-mode">
              <input
                type="checkbox"
                checked={isGmNpcMessage}
                onChange={(event) => setGmNpcMessage(event.target.checked)}
              />
              {storyPresentation.gmNpcMessageLabel}
            </label>
            {isGmNpcMessage ? (
              <input
                className="story-gm-input"
                value={gmMessageSpeaker}
                placeholder={storyPresentation.gmSpeakerPlaceholder}
                onChange={(event) => setGmMessageSpeaker(event.target.value)}
              />
            ) : null}
            <textarea
              className="story-gm-textarea"
              value={gmMessageContent}
              placeholder={storyPresentation.gmMessagePlaceholder}
              rows={3}
              maxLength={HUMAN_GM_MESSAGE_CONTENT_MAX_LENGTH}
              onChange={(event) => setGmMessageContent(event.target.value)}
            />
            <input
              className="story-gm-input"
              value={gmMessagePrivateNote}
              placeholder={storyPresentation.gmPrivateNotePlaceholder}
              maxLength={HUMAN_GM_PRIVATE_NOTE_MAX_LENGTH}
              onChange={(event) => setGmMessagePrivateNote(event.target.value)}
            />
            <button
              type="button"
              disabled={isBusy || isGmMessagePending || !onGmMessage || !gmMessageContent.trim()}
              onClick={() => void handleGmMessageSubmit()}
            >
              {storyPresentation.gmSubmitLabel}
            </button>
          </section>

          <section className="story-gm-card story-gm-node-move">
            <span className="story-node-eyebrow">{storyPresentation.gmNodeMoveEyebrow}</span>
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
                      {option.isFallback ? storyPresentation.gmDefaultMoveSuffix : ''}
                      {option.nodeType ? ` · ${option.nodeType}` : ''}
                    </span>
                    {option.condition ? <small>{option.condition}</small> : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="story-gm-empty-text">{storyPresentation.gmNodeMoveEmptyText}</p>
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

      <section className="story-party-strip" aria-label={storyPresentation.partyStripAriaLabel}>
        <div className="story-party-list">
          {Array.from({ length: 4 }).map((_, index) => {
            const character = characters[index] ?? null;

            if (!character) {
              return (
                <div className="story-party-card-wrap empty" key={`empty-${index}`}>
                  <div className="story-party-card placeholder" aria-hidden="true">
                    <StoryPartyFrameCorners />
                    <span className="story-party-empty-label">
                      {storyPresentation.emptyPartySlotLabel}
                    </span>
                  </div>
                </div>
              );
            }

            const isMine = character.userId === currentUserId;
            const isSelected = selectedCharacter?.id === character.id;
            const hpPercent = getStoryCharacterHpPercent(character);
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
                    aria-label={storyPresentation.rpSpeechBubbleAriaLabel}
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
                      {isMine ? <em>{storyPresentation.currentUserBadgeLabel}</em> : null}
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
