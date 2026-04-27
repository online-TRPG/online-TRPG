import type { Character } from "../types/session";

export function BattleMap({ characters }: { characters: Character[] }) {
  return (
    <div className="battle-map" aria-label="세션 맵">
      <svg viewBox="0 0 900 520" role="img" aria-label="얼어붙은 협곡 지도">
        <rect width="900" height="520" rx="22" />
        <path d="M50 380C150 330 220 360 310 286C390 220 460 240 540 170C640 80 740 130 850 80" />
        <path d="M92 160C190 120 270 160 350 130C450 92 520 110 610 130C706 150 750 210 840 190" />
        <path d="M180 420C250 390 315 414 380 360C442 310 500 326 565 290C650 240 715 255 790 232" />
        {[140, 240, 330, 520, 610, 720].map((x, index) => (
          <g key={x} transform={`translate(${x} ${index % 2 ? 210 : 300})`}>
            <path d="M0 42l28-70 40 70z" />
            <path d="M30 42l24-58 36 58z" />
          </g>
        ))}
        <line x1="530" y1="265" x2="318" y2="214" />
        <text x="382" y="226">15 ft</text>
      </svg>
      {characters.slice(0, 4).map((character, index) => (
        <div
          className={`map-token tone-${index + 1}`}
          style={{ left: `${42 + index * 9}%`, top: `${48 - index * 8}%` }}
          key={character.id}
          title={character.name}
        >
          {character.name.slice(0, 1)}
        </div>
      ))}
      <div className="map-token hostile">!</div>
    </div>
  );
}
