import { BattleMap } from "../components/BattleMap";
import { Icon } from "../components/Icon";
import { LogPanel } from "../components/LogPanel";
import type { LogEntry, SessionSnapshot, StoredUser } from "../types/session";

const quickActions = [
  { label: "동굴 조사", icon: "eye" },
  { label: "방어 태세", icon: "shield" },
  { label: "마법 탐지", icon: "spark" },
  { label: "휴식", icon: "rest" },
];

interface PlayPageProps {
  user: StoredUser;
  snapshot: SessionSnapshot | null;
  logs: LogEntry[];
  socketConnected: boolean;
  onAction: (label: string) => void;
}

export function PlayPage({ user, snapshot, logs, socketConnected, onAction }: PlayPageProps) {
  const characters = snapshot?.characters ?? [];
  const participants = snapshot?.participants ?? [];
  const myCharacter = characters.find((c) => c.ownerUserId === user.id);

  return (
    <main className="play-layout">
      <section className="initiative-panel">
        <h2>우선권</h2>
        <div className="initiative-list">
          {characters.length ? (
            characters.map((character, index) => (
              <div className="initiative-item" key={character.id}>
                <div className={`portrait mini tone-${(index % 4) + 1}`}>
                  {character.name.slice(0, 1)}
                </div>
                <div>
                  <strong>{character.name}</strong>
                  <span>
                    HP {character.currentHp ?? character.maxHp}/{character.maxHp}
                  </span>
                </div>
                <b>{21 - index * 3}</b>
              </div>
            ))
          ) : (
            <p className="empty-text">로비에서 캐릭터를 만들면 여기에 표시됩니다.</p>
          )}
        </div>
      </section>

      <section className="scene-panel">
        <div className="scene-header">
          <div>
            <span className="eyebrow">
              {snapshot?.session.title ?? "세션을 선택하세요"} ·{" "}
              {socketConnected ? "온라인" : "대기"}
            </span>
            <h2>얼어붙은 협곡</h2>
          </div>
          <span className="round-pill">턴 4 · 라운드 2</span>
        </div>
        <BattleMap characters={characters} />
        <div className="scene-bottom">
          <article className="scene-text">
            <h3>{myCharacter?.name ?? "파티"}</h3>
            <p>
              매서운 바람 사이로 오래된 룬 문양이 희미하게 빛납니다. 동료들과 현재 세션 상태를
              공유하고, 아래 행동 버튼으로 로그를 남기며 흐름을 확인하세요.
            </p>
            <div className="action-row">
              {quickActions.map((action) => (
                <button type="button" key={action.label} onClick={() => onAction(action.label)}>
                  <Icon name={action.icon} />
                  {action.label}
                </button>
              ))}
            </div>
          </article>
          <div className="party-strip">
            {participants.map((p) => (
              <div className="party-member" key={p.id}>
                <strong>{p.user.displayName}</strong>
                <span>
                  {p.role} · {p.connectionStatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="log-dock">
        <LogPanel logs={logs} />
      </aside>
    </main>
  );
}
