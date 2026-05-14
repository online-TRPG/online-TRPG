import { useCallback, useState } from "react";
import type { LogEntry } from "../types/session";

function normalizeLogCreatedAt(value?: string): string {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return safeDate.toISOString();
}

function formatLogTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function createLogEntry(
  kind: LogEntry["kind"],
  title: string,
  message: string,
  id: string,
  createdAt?: string,
): LogEntry {
  const normalizedCreatedAt = normalizeLogCreatedAt(createdAt);

  return {
    id,
    kind,
    title,
    message,
    time: formatLogTime(normalizedCreatedAt),
    createdAt: normalizedCreatedAt,
  };
}

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    createLogEntry(
      "system",
      "\uC900\uBE44 \uC644\uB8CC",
      "\uB85C\uADF8\uC778 \uD6C4 \uC138\uC158\uC744 \uB9CC\uB4E4\uAC70\uB098 \uCD08\uB300 \uCF54\uB4DC\uB85C \uCC38\uAC00\uD558\uC138\uC694.",
      crypto.randomUUID(),
    ),
  ]);

  const appendLog = useCallback((kind: LogEntry["kind"], title: string, message: string, id?: string, createdAt?: string) => {
    const nextId = id ?? crypto.randomUUID();
    const nextLog = createLogEntry(kind, title, message, nextId, createdAt);

    setLogs((current) =>
      current.some((log) => log.id === nextId)
        ? current.map((log) => (log.id === nextId ? nextLog : log))
        : [nextLog, ...current],
    );
  }, []);

  const appendOlderLog = useCallback((kind: LogEntry["kind"], title: string, message: string, id?: string, createdAt?: string) => {
    const nextId = id ?? crypto.randomUUID();
    const nextLog = createLogEntry(kind, title, message, nextId, createdAt);

    setLogs((current) =>
      current.some((log) => log.id === nextId)
        ? current.map((log) => (log.id === nextId ? nextLog : log))
        : [...current, nextLog],
    );
  }, []);

  const removeLog = useCallback((id: string) => {
    setLogs((current) => current.filter((log) => log.id !== id));
  }, []);

  const clearSessionLogs = useCallback(() => {
    setLogs((current) => current.filter((log) => log.kind !== "action"));
  }, []);

  return { logs, appendLog, appendOlderLog, removeLog, clearSessionLogs };
}
