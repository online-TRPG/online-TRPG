import { useMemo, useState } from 'react';
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
}

function getHpPercent(character: SessionCharacterResponseDto) {
  if (character.maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((character.currentHp / character.maxHp) * 100)));
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
}: StoryNodeSurfaceProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isSummaryOpen, setSummaryOpen] = useState(false);
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ?? characters[0] ?? null;

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

              return (
                <button
                  type="button"
                  key={character.id}
                  className={`story-party-card${isSelected ? ' selected' : ''}`}
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
              );
            })
          ) : (
            <p className="story-empty-text">파티 캐릭터 정보가 아직 없습니다.</p>
          )}
        </div>

        {selectedCharacter ? (
          <div className="story-party-detail">
            <span className="story-node-eyebrow">캐릭터 요약</span>
            <strong>{selectedCharacter.name}</strong>
            <p>
              AC {selectedCharacter.armorClass} · 이동 {selectedCharacter.speed} · 상태{' '}
              {selectedCharacter.conditions.length ? selectedCharacter.conditions.join(', ') : '정상'}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
