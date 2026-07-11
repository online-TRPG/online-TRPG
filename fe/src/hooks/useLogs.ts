import { useCallback, useMemo, useReducer } from 'react';
import type { LogEntry } from '../types/session';

const MAX_STORED_LOG_ENTRIES = 10_000;

export type LogWriteInput = {
  kind: LogEntry['kind'];
  title: string;
  message: string;
  id?: string;
  createdAt?: string;
  metadata?: LogEntry['metadata'];
};

export type AppendLogsFn = (entries: LogWriteInput[]) => void;

type LogState = {
  orderedIds: string[];
  byId: Map<string, LogEntry>;
};

type LogAction =
  | { type: 'upsert_newest'; entries: LogEntry[] }
  | { type: 'upsert_oldest'; entries: LogEntry[] }
  | { type: 'remove'; id: string }
  | { type: 'clear_session' };

function normalizeLogCreatedAt(value?: string): string {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return safeDate.toISOString();
}

function formatLogTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function stripMainScope(value: string): string {
  return value.trim().replace(/^\[MAIN\]/, '').trimStart();
}

function looksLikeTurnLogDump(message: string): boolean {
  const body = stripMainScope(message);
  const hasTurnLogHeader = /^TurnLog\b/.test(body);
  const internalFieldCount = [
    'turnLogId:',
    'turnNumber:',
    'playerActionId:',
    'actorUserId:',
    'sessionCharacterId:',
    'rawInput:',
    'structuredAction',
    'diceResult',
    'stateDiff',
  ].filter((field) => body.includes(field)).length;

  return hasTurnLogHeader && internalFieldCount >= 3;
}

function createLogEntry(input: LogWriteInput): LogEntry | null {
  if (input.kind === 'action' && looksLikeTurnLogDump(input.message)) {
    return null;
  }

  const normalizedCreatedAt = normalizeLogCreatedAt(input.createdAt);
  return {
    id: input.id ?? crypto.randomUUID(),
    kind: input.kind,
    title: input.title,
    message: input.message,
    time: formatLogTime(normalizedCreatedAt),
    createdAt: normalizedCreatedAt,
    metadata: input.metadata,
  };
}

function trimState(orderedIds: string[], byId: Map<string, LogEntry>): LogState {
  const nextOrderedIds = orderedIds.slice(0, MAX_STORED_LOG_ENTRIES);
  if (nextOrderedIds.length === byId.size) {
    return { orderedIds: nextOrderedIds, byId };
  }

  const retainedIds = new Set(nextOrderedIds);
  for (const id of byId.keys()) {
    if (!retainedIds.has(id)) {
      byId.delete(id);
    }
  }
  return { orderedIds: nextOrderedIds, byId };
}

function upsertEntries(
  state: LogState,
  entries: LogEntry[],
  position: 'newest' | 'oldest',
): LogState {
  if (!entries.length) return state;

  const byId = new Map(state.byId);
  const insertedIds: string[] = [];
  for (const entry of entries) {
    if (!byId.has(entry.id)) {
      insertedIds.push(entry.id);
    }
    byId.set(entry.id, entry);
  }
  const orderedIds =
    position === 'newest'
      ? [...insertedIds, ...state.orderedIds]
      : [...state.orderedIds, ...insertedIds];
  return trimState(orderedIds, byId);
}

function logReducer(state: LogState, action: LogAction): LogState {
  switch (action.type) {
    case 'upsert_newest':
      return upsertEntries(state, action.entries, 'newest');
    case 'upsert_oldest':
      return upsertEntries(state, action.entries, 'oldest');
    case 'remove': {
      if (!state.byId.has(action.id)) return state;
      const byId = new Map(state.byId);
      byId.delete(action.id);
      return {
        orderedIds: state.orderedIds.filter((id) => id !== action.id),
        byId,
      };
    }
    case 'clear_session': {
      const orderedIds = state.orderedIds.filter((id) => state.byId.get(id)?.kind !== 'action');
      const byId = new Map<string, LogEntry>();
      for (const id of orderedIds) {
        const entry = state.byId.get(id);
        if (entry) byId.set(id, entry);
      }
      return { orderedIds, byId };
    }
  }
}

function createInitialState(): LogState {
  const initial = createLogEntry({
    kind: 'system',
    title: '준비 완료',
    message: '로그인 후 세션을 만들거나 초대 코드로 참가하세요.',
  });
  if (!initial) {
    return { orderedIds: [], byId: new Map() };
  }
  return {
    orderedIds: [initial.id],
    byId: new Map([[initial.id, initial]]),
  };
}

export function useLogs() {
  const [state, dispatch] = useReducer(logReducer, undefined, createInitialState);
  const logs = useMemo(
    () => state.orderedIds.flatMap((id) => {
      const entry = state.byId.get(id);
      return entry ? [entry] : [];
    }),
    [state],
  );

  const appendLog = useCallback(
    (
      kind: LogEntry['kind'],
      title: string,
      message: string,
      id?: string,
      createdAt?: string,
      metadata?: LogEntry['metadata'],
    ) => {
      const entry = createLogEntry({ kind, title, message, id, createdAt, metadata });
      if (entry) dispatch({ type: 'upsert_newest', entries: [entry] });
    },
    [],
  );

  const appendOlderLogs = useCallback<AppendLogsFn>((inputs) => {
    const entries = inputs.flatMap((input) => {
      const entry = createLogEntry(input);
      return entry ? [entry] : [];
    });
    if (entries.length) dispatch({ type: 'upsert_oldest', entries });
  }, []);

  const removeLog = useCallback((id: string) => {
    dispatch({ type: 'remove', id });
  }, []);

  const clearSessionLogs = useCallback(() => {
    dispatch({ type: 'clear_session' });
  }, []);

  return { logs, appendLog, appendOlderLogs, removeLog, clearSessionLogs };
}
