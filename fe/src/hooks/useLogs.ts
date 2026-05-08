import { useCallback, useState } from "react";
import type { LogEntry } from "../types/session";

function nowTime(): string {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    {
      id: crypto.randomUUID(),
      kind: "system",
      title: "준비 완료",
      message: "로그인 후 세션을 만들거나 초대 코드로 참가하세요.",
      time: nowTime(),
    },
  ]);

  const appendLog = useCallback((kind: LogEntry["kind"], title: string, message: string, id?: string) => {
    const nextId = id ?? crypto.randomUUID();
    setLogs((current) =>
      current.some((log) => log.id === nextId)
        ? current
        : [{ id: nextId, kind, title, message, time: nowTime() }, ...current].slice(0, 30),
    );
  }, []);

  const removeLog = useCallback((id: string) => {
    setLogs((current) => current.filter((log) => log.id !== id));
  }, []);

  return { logs, appendLog, removeLog };
}
