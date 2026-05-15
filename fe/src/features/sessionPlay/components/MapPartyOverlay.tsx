import type { CSSProperties } from 'react';
import type { SessionCharacterResponseDto } from '@trpg/shared-types';
import { getCharacterClassLabel, getCharacterImage } from '../utils/characterVisuals';
import './MapPartyOverlay.css';

interface MapPartyOverlayProps {
  characters: SessionCharacterResponseDto[];
  currentUserId: string;
  getCharacterColorStyle?: (character: SessionCharacterResponseDto) => CSSProperties;
}

function getHpPercent(character: SessionCharacterResponseDto) {
  if (character.maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((character.currentHp / character.maxHp) * 100)));
}

export function MapPartyOverlay({
  characters,
  currentUserId,
  getCharacterColorStyle,
}: MapPartyOverlayProps) {
  return (
    <aside className="map-party-overlay" aria-label="파티 상태">
      <div className="map-party-list">
        {characters.length ? (
          characters.map((character) => {
            const hpPercent = getHpPercent(character);
            const isMine = character.userId === currentUserId;
            const characterImage = getCharacterImage(character);
            // 메인챗/파티 카드와 같은 참가자 색상값을 받아 맵 오버레이도 한 기준으로 맞춥니다.
            const characterColorStyle = getCharacterColorStyle?.(character);

            return (
              <article
                key={character.id}
                className={`map-party-card${isMine ? ' mine' : ''}`}
                style={characterColorStyle}
                title={`${character.name} / ${getCharacterClassLabel(character.className)} Lv ${character.level} / HP ${character.currentHp}/${character.maxHp}`}
              >
                <div className="map-party-avatar">
                  <img src={characterImage} alt={character.name} />
                  <span
                    className="map-party-damage"
                    style={{ height: `${100 - hpPercent}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="map-party-body">
                  <div className="map-party-line">
                    <strong>{character.name}</strong>
                    <span>Lv {character.level}</span>
                  </div>
                  <span className="map-party-hp">
                    {character.currentHp}/{character.maxHp}
                  </span>
                </div>
              </article>
            );
          })
        ) : (
          <p className="map-party-empty-text">파티 캐릭터 정보가 아직 없습니다.</p>
        )}
      </div>
    </aside>
  );
}
