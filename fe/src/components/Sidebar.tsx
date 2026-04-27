import type { AuthMode } from "../types/auth";
import type { StoredUser } from "../types/session";
import { Icon } from "./Icon";

export function Sidebar({
  user,
  authMode,
  activeView,
  onViewChange,
  onLogout,
}: {
  user: StoredUser;
  authMode: AuthMode | null;
  activeView: "lobby" | "play";
  onViewChange: (view: "lobby" | "play") => void;
  onLogout: () => void;
}) {
  const roleLabel = authMode === "member" ? "멤버" : "게스트 모험가";

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Icon name="logo" />
        <span>모두의 TRPG</span>
      </div>
      <div className="profile">
        <div className="portrait">{user.displayName.slice(0, 1)}</div>
        <div>
          <strong>{user.displayName}</strong>
          <span>{roleLabel}</span>
        </div>
      </div>
      <nav className="side-nav" aria-label="주 메뉴">
        <button
          type="button"
          className={activeView === "lobby" ? "active" : ""}
          onClick={() => onViewChange("lobby")}
        >
          <Icon name="eye" />
          로비
        </button>
        <button
          type="button"
          className={activeView === "play" ? "active" : ""}
          onClick={() => onViewChange("play")}
        >
          <Icon name="spark" />
          세션
        </button>
      </nav>
      <button type="button" className="logout-button" onClick={onLogout}>
        <Icon name="logout" />
        로그아웃
      </button>
    </aside>
  );
}
