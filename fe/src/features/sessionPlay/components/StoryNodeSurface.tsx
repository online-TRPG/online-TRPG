import { useMemo, useState } from 'react';
import type {
  PlayerScenarioClueDto,
  PlayerScenarioNodeDto,
  PlayerVisibleTargetDto,
  SessionCharacterResponseDto,
} from '@trpg/shared-types';
import { getClassLabel } from '../../../services/staticSrd';
import './StoryNodeSurface.css';

interface StoryNodeSurfaceProps {
  node: PlayerScenarioNodeDto | null;
  scenarioTitle?: string | null;
  phase?: string | null;
  characters: SessionCharacterResponseDto[];
  currentUserId: string;
  isGmView?: boolean;
}

const targetTypeLabels: Partial<Record<PlayerVisibleTargetDto['targetType'], string>> = {
  NPC: 'NPC',
  OBJECT: '오브젝트',
  ACTOR: '인물',
  AREA: '장소',
  POINT: '좌표',
  SELF: '나',
};

function getTargetTypeLabel(targetType: PlayerVisibleTargetDto['targetType']) {
  return targetTypeLabels[targetType] ?? targetType;
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

function getClueImportanceLabel(clue: PlayerScenarioClueDto) {
  if (!clue.importance) return '공개 단서';
  if (clue.importance === 'critical') return '중요 단서';
  if (clue.importance === 'minor') return '보조 단서';
  return clue.importance;
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
  const sceneParagraphs = useMemo(() => splitSceneParagraphs(node?.sceneText), [node?.sceneText]);
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ?? characters[0] ?? null;
  // 현재 DTO에서 바로 쓸 수 있는 공개 정보만 사용해 플레이어에게 비공개 단서가 새지 않게 합니다.
  const visibleTargets = node?.visibleTargets ?? [];
  const publicClues = node?.publicClues ?? [];

  return (
    <div className="story-node-surface">
      <header className="story-node-header">
        <div>
          <span className="story-node-eyebrow">스토리 노드</span>
          <h1>{node?.title ?? scenarioTitle ?? '진행 중인 장면'}</h1>
        </div>
        <div className="story-node-status-row" aria-label="장면 상태">
          <span>{getNodeTypeLabel(node)}</span>
          <span>{getPhaseLabel(phase)}</span>
          {isGmView ? <span>GM 화면</span> : <span>플레이어 화면</span>}
        </div>
      </header>

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

        <aside className="story-node-aside" aria-label="장면 정보">
          <section className="story-node-panel">
            <div className="story-panel-heading">
              <span className="story-node-eyebrow">장면 요소</span>
              <strong>현재 등장 요소</strong>
            </div>
            {visibleTargets.length ? (
              <div className="story-element-list">
                {visibleTargets.map((target) => (
                  <article key={target.id} className="story-element-item">
                    <span>{getTargetTypeLabel(target.targetType)}</span>
                    <strong>{target.name}</strong>
                    {target.summary ? <p>{target.summary}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="story-empty-text">현재 공개된 NPC, 오브젝트, 장소 정보가 없습니다.</p>
            )}
          </section>

          <section className="story-node-panel">
            <div className="story-panel-heading">
              <span className="story-node-eyebrow">단서</span>
              <strong>공개 단서</strong>
            </div>
            {publicClues.length ? (
              <div className="story-clue-list">
                {publicClues.map((clue) => (
                  <article key={clue.id} className="story-clue-item">
                    <span>{getClueImportanceLabel(clue)}</span>
                    <strong>{clue.title}</strong>
                    <p>{clue.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="story-empty-text">아직 공개된 단서가 없습니다.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="story-party-strip" aria-label="파티 캐릭터">
        <div className="story-party-list">
          {characters.length ? (
            characters.map((character) => {
              const isMine = character.userId === currentUserId;
              const isSelected = selectedCharacter?.id === character.id;
              const hpPercent = getHpPercent(character);

              return (
                <button
                  type="button"
                  key={character.id}
                  className={`story-party-card${isSelected ? ' selected' : ''}`}
                  onClick={() => setSelectedCharacterId(character.id)}
                >
                  <span className="story-party-avatar">{character.name.slice(0, 1)}</span>
                  <span className="story-party-body">
                    <strong>
                      {character.name}
                      {isMine ? <em>나</em> : null}
                    </strong>
                    <small>{getClassLabel(character.className)} / Lv {character.level}</small>
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
