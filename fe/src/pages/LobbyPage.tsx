import { FormEvent, useState } from "react";
import { Icon } from "../components/Icon";
import { LogPanel } from "../components/LogPanel";
import type {
  AvailableSessionListItem,
  LogEntry,
  Scenario,
  SessionSnapshot,
  StoredUser,
} from "../types/session";

const STATUS_LABEL: Record<string, string> = {
  lobby: "참가 가능",
  playing: "진행 중",
  paused: "일시정지",
  completed: "완료",
};

interface LobbyPageProps {
  user: StoredUser;
  scenarios: Scenario[];
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  logs: LogEntry[];
  busy: boolean;
  error: string | null;
  onCreateSession: (title: string, scenarioId?: string) => void;
  onJoinSession: (inviteCode: string) => void;
  onCreateCharacter: (payload: {
    name: string;
    ancestry: string;
    className: string;
    maxHp?: number;
  }) => void;
  onOpenPlay: () => void;
}

export function LobbyPage({
  user,
  scenarios,
  snapshot,
  sessionList,
  logs,
  busy,
  error,
  onCreateSession,
  onJoinSession,
  onCreateCharacter,
  onOpenPlay,
}: LobbyPageProps) {
  const [sessionTitle, setSessionTitle] = useState("얼어붙은 황무지의 메아리");
  const [scenarioId, setScenarioId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [characterName, setCharacterName] = useState(`${user.displayName}의 캐릭터`);
  const [ancestry, setAncestry] = useState("Human");
  const [className, setClassName] = useState("Rogue");

  const myCharacter = snapshot?.characters.find((c) => c.ownerUserId === user.id);

  function submitSession(e: FormEvent) {
    e.preventDefault();
    onCreateSession(sessionTitle, scenarioId || undefined);
  }

  function submitJoin(e: FormEvent) {
    e.preventDefault();
    onJoinSession(inviteCode);
  }

  function submitCharacter(e: FormEvent) {
    e.preventDefault();
    onCreateCharacter({ name: characterName, ancestry, className, maxHp: 12 });
  }

  return (
    <main className="content-grid">
      <section className="lobby-main">
        <div className="page-title">
          <div>
            <span className="eyebrow">로비 탐색기</span>
            <h2>진행 중인 모험을 발견하거나 새 세션을 시작하세요.</h2>
          </div>
          {snapshot ? (
            <button type="button" className="primary small" onClick={onOpenPlay}>
              <Icon name="enter" />
              세션 입장
            </button>
          ) : null}
        </div>

        <article className="featured-room">
          <div>
            <span className="badge">{snapshot ? "내 세션" : "추천 캠페인"}</span>
            <h3>{snapshot?.session.title ?? "얼어붙은 황무지의 메아리"}</h3>
            <p>
              {snapshot
                ? "초대 코드를 공유해 동료를 초대하고, 캐릭터를 선택하면 플레이를 시작할 수 있습니다."
                : "초대 코드로 동료를 불러오고, 캐릭터를 만든 뒤 같은 세션 상태와 실시간 변경 이벤트를 확인할 수 있습니다."}
            </p>
            <div className="meta-row">
              <span>참가자 {snapshot?.participants.length ?? 0}명</span>
              <span>캐릭터 {snapshot?.characters.length ?? 0}명</span>
              <span>{snapshot?.state?.phase ?? "대기 중"}</span>
            </div>
          </div>
          {snapshot ? (
            <button
              type="button"
              className="ghost"
              onClick={() => void navigator.clipboard.writeText(snapshot.session.inviteCode)}
            >
              <Icon name="copy" />
              {snapshot.session.inviteCode}
            </button>
          ) : null}
        </article>

        <div className="room-list">
          {sessionList.length > 0 ? (
            sessionList.map((item) => (
              <article className="room-card" key={item.sessionId}>
                <div className="room-top">
                  <span>{item.scenarioTitle}</span>
                  <strong style={{ color: "var(--gold)" }}>
                    {item.currentPlayers} / {item.maxPlayers}
                  </strong>
                </div>
                <h3>{item.title}</h3>
                <p>{STATUS_LABEL[item.status] ?? item.status}</p>
                <button type="button" style={{ color: "var(--cyan)" }}>
                  상세 보기
                </button>
              </article>
            ))
          ) : (
            <p className="empty-text" style={{ gridColumn: "1 / -1", padding: "24px 0" }}>
              공개 세션이 없습니다. 새 세션을 만들거나 초대 코드로 참가해보세요.
            </p>
          )}
        </div>
      </section>

      <aside className="control-panel">
        <form className="action-card" onSubmit={submitSession}>
          <h3>새 세션</h3>
          <label htmlFor="sessionTitle">세션 제목</label>
          <input
            id="sessionTitle"
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.target.value)}
            maxLength={100}
          />
          <label htmlFor="scenarioId">시나리오</label>
          <select
            id="scenarioId"
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
          >
            <option value="">기본 시나리오</option>
            {scenarios.map((s) => (
              <option value={s.id} key={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={busy}>
            <Icon name="plus" />
            세션 만들기
          </button>
        </form>

        <form className="action-card" onSubmit={submitJoin}>
          <h3>초대 코드 참가</h3>
          <label htmlFor="inviteCode">초대 코드</label>
          <input
            id="inviteCode"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={12}
          />
          <button type="submit" disabled={busy}>
            <Icon name="enter" />
            참가하기
          </button>
        </form>

        {snapshot ? (
          <form className="action-card" onSubmit={submitCharacter}>
            <h3>{myCharacter ? "내 캐릭터" : "캐릭터 생성"}</h3>
            {myCharacter ? (
              <div className="character-summary">
                <strong>{myCharacter.name}</strong>
                <span>
                  {myCharacter.ancestry} · {myCharacter.className} · HP {myCharacter.currentHp}/
                  {myCharacter.maxHp}
                </span>
              </div>
            ) : (
              <>
                <label htmlFor="characterName">이름</label>
                <input
                  id="characterName"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  maxLength={50}
                />
                <div className="form-pair">
                  <div>
                    <label htmlFor="ancestry">종족</label>
                    <input
                      id="ancestry"
                      value={ancestry}
                      onChange={(e) => setAncestry(e.target.value)}
                      maxLength={50}
                    />
                  </div>
                  <div>
                    <label htmlFor="className">직업</label>
                    <input
                      id="className"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      maxLength={50}
                    />
                  </div>
                </div>
                <button type="submit" className="primary" disabled={busy}>
                  <Icon name="spark" />
                  캐릭터 생성
                </button>
              </>
            )}
          </form>
        ) : null}

        {error ? <p className="panel-error">{error}</p> : null}
        <LogPanel logs={logs} compact />
      </aside>
    </main>
  );
}
