import type { LogEntry } from "../types/session";

export function LogPanel({ logs, compact = false }: { logs: LogEntry[]; compact?: boolean }) {
  return (
    <section className={compact ? "log-panel compact" : "log-panel"}>
      <div className="log-tabs">
        <strong>게임 로그</strong>
        <span>{logs.length}</span>
      </div>
      <div className="log-list">
        {logs.length ? (
          logs.map((log) => (
            <article className={`log-entry ${log.kind}`} key={log.id}>
              <div>
                <strong>{log.title}</strong>
                <time>{log.time}</time>
              </div>
              <p>{log.message}</p>
            </article>
          ))
        ) : (
          <p className="empty-text">API 응답과 실시간 이벤트가 여기에 쌓입니다.</p>
        )}
      </div>
    </section>
  );
}
