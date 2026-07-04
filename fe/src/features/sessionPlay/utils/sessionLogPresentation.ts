import type { Character, LogEntry, Participant } from '../../../types/session';

export type MainLogTone =
  | 'gm-narration'
  | 'npc-dialogue'
  | 'system-result'
  | 'player-command'
  | 'player-rp';

export type MainLogPresentation = {
  tone: MainLogTone | null;
  label: string | null;
  speakerKind?: 'gm' | 'npc' | null;
  speakerName?: string | null;
  displayMessage?: string | null;
};

export type MessageLogTab = 'Main' | 'Chat';

export type RenderedSessionLogRow = LogEntry & {
  isPendingAction: boolean;
  showDateSeparator: boolean;
  dateLabel: string;
  rowClass: 'incoming' | 'outgoing' | 'notice';
  logTone: MainLogTone | null;
  logToneLabel: string | null;
  speakerKind: 'gm' | 'npc' | null;
  speakerName: string | null;
  senderLabel: string;
};

export type MainCommandVisibleTargetLike = {
  id: string;
  name?: string | null;
};

export type VttMapTokenLike = {
  id: string;
  npcId?: string | null;
  name?: string | null;
};

const TALK_TO_NPC_INTENT = 'TALK_TO_NPC';
const COMBAT_TALK_INTENT = 'COMBAT_TALK';

export function stripScopePrefix(message: string) {
  return message.replace(/^\[(MAIN|CHAT)\]/, '').trim();
}

export function isChatScoped(message: string) {
  return message.startsWith('[CHAT]');
}

export function getMessageLogTab(log: LogEntry): MessageLogTab | null {
  if (log.kind !== 'action') return null;
  return isChatScoped(log.message) ? 'Chat' : 'Main';
}

function getLogDate(createdAt: string): Date {
  const date = new Date(createdAt);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function getLogDateKey(createdAt: string): string {
  const date = getLogDate(createdAt);

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getLogDateLabel(createdAt: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(getLogDate(createdAt));
}

export function parseNpcDialogueMessage(message: string) {
  const lines = message.trim().split(/\r?\n/);
  const firstLine = lines[0] ?? '';
  const match = firstLine.match(/^([^\s:：][^:：\n]{0,32})[:：]\s*(.+)$/);

  if (!match) return null;
  if (
    /^(TurnLog|rawInput|outcome|narration|diceResult|stateDiff|structuredAction)$/i.test(
      match[1].trim()
    )
  ) {
    return null;
  }

  return {
    speakerName: match[1].trim(),
    displayMessage: [match[2].trim(), ...lines.slice(1)].join('\n').trim(),
  };
}

export function normalizeNpcSpeakerKey(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSimilarNpcSpeakerName(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeNpcSpeakerKey(left);
  const normalizedRight = normalizeNpcSpeakerKey(right);

  if (!normalizedLeft || !normalizedRight) return false;
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

export function isSessionLogTitle(title: string) {
  const normalizedTitle = title.trim().toLowerCase();
  return normalizedTitle === '세션 로그' || normalizedTitle === 'session log';
}

export function isSessionLogProfile(title: string, logTone?: string | null) {
  return (
    isSessionLogTitle(title) ||
    logTone === 'gm-narration' ||
    logTone === 'system-result'
  );
}

export function getLogSenderLabel(
  title: string,
  rowClass: 'incoming' | 'outgoing' | 'notice',
  presentation?: MainLogPresentation | null
) {
  if (presentation?.speakerKind === 'npc') return presentation.speakerName?.trim() || 'NPC';
  if (
    rowClass === 'notice' ||
    presentation?.speakerKind === 'gm' ||
    presentation?.tone === 'gm-narration' ||
    presentation?.tone === 'system-result' ||
    isSessionLogTitle(title)
  ) {
    return 'GM';
  }
  return title || '알 수 없음';
}

export function getMainCommandNpcSpeakerName(
  log: LogEntry,
  visibleTargets: MainCommandVisibleTargetLike[],
  mapTokens: VttMapTokenLike[]
) {
  const mainCommand = log.metadata?.mainCommand;
  const metadataSpeakerName = mainCommand?.npcDialogue?.speakerName?.trim();
  if (metadataSpeakerName) return metadataSpeakerName;

  const targetId = mainCommand?.npcDialogue?.npcId ?? mainCommand?.targetId;
  if (!targetId) return null;

  return (
    visibleTargets.find((target) => target.id === targetId)?.name ??
    mapTokens.find((token) => token.npcId === targetId || token.id === targetId)?.name ??
    null
  );
}

export function getLogDisplaySenderLabel(params: {
  log: LogEntry;
  rowClass: 'incoming' | 'outgoing' | 'notice';
  presentation?: MainLogPresentation | null;
  participants: Participant[];
  sessionCharacters: Character[];
}): string {
  const { log, rowClass, presentation, participants, sessionCharacters } = params;
  const baseLabel = getLogSenderLabel(log.title, rowClass, presentation);

  if (baseLabel !== log.title) {
    return baseLabel;
  }

  const participant = participants.find((item) => item.user.displayName === log.title) ?? null;
  if (!participant) return baseLabel;

  const character = sessionCharacters.find((item) => item.userId === participant.userId) ?? null;

  return character ? `${character.name} (${participant.user.displayName})` : baseLabel;
}

export function buildRenderedSessionLogRows(params: {
  logs: LogEntry[];
  activeTab: MessageLogTab | string;
  userDisplayName: string;
  participants: Participant[];
  sessionCharacters: Character[];
  visibleTargets: MainCommandVisibleTargetLike[];
  mapTokens: VttMapTokenLike[];
}): RenderedSessionLogRow[] {
  const {
    logs,
    activeTab,
    userDisplayName,
    participants,
    sessionCharacters,
    visibleTargets,
    mapTokens,
  } = params;
  let previousDateKey: string | null = null;

  return [...logs].reverse().map((log) => {
    const normalizedMessage = stripScopePrefix(log.message);
    const isMine = log.title === userDisplayName;
    const rowClass = log.kind === 'system' ? 'notice' : isMine ? 'outgoing' : 'incoming';
    const presentation =
      activeTab === 'Main'
        ? getMainLogPresentation(
            log,
            normalizedMessage,
            getMainCommandNpcSpeakerName(log, visibleTargets, mapTokens)
          )
        : null;
    const dateKey = getLogDateKey(log.createdAt);
    const showDateSeparator = dateKey !== previousDateKey;
    previousDateKey = dateKey;

    return {
      ...log,
      message: presentation?.displayMessage ?? normalizedMessage,
      isPendingAction: log.id.endsWith(':pending'),
      showDateSeparator,
      dateLabel: getLogDateLabel(log.createdAt),
      rowClass,
      logTone: presentation?.tone ?? null,
      logToneLabel: presentation?.label ?? null,
      speakerKind: presentation?.speakerKind ?? null,
      speakerName: presentation?.speakerName ?? null,
      senderLabel: getLogDisplaySenderLabel({
        log,
        rowClass,
        presentation,
        participants,
        sessionCharacters,
      }),
    };
  });
}

export function isNpcDialogueMainCommandLog(log: LogEntry) {
  const mainCommand = log.metadata?.mainCommand;
  if (mainCommand?.npcDialogue) return true;
  if (!mainCommand?.targetId) return false;

  return (
    mainCommand.intent === TALK_TO_NPC_INTENT ||
    mainCommand.intent === COMBAT_TALK_INTENT
  );
}

export function isCombatResultLogMessage(message: string) {
  return (
    /공격\s+(명중|빗나감)/.test(message) ||
    /\bvs\s+AC\s+\d+/i.test(message) ||
    /에게\s+\d+\s*피해/.test(message)
  );
}

export function getMainLogPresentation(
  log: LogEntry,
  message: string,
  npcSpeakerName?: string | null
): MainLogPresentation {
  if (log.message.startsWith('[CHAT]')) {
    return { tone: null, label: null };
  }

  if (log.id.startsWith('turn-log:') && log.id.endsWith(':raw')) {
    return { tone: 'player-command', label: 'GM 요청' };
  }

  if (log.id.startsWith('turn-log:') && log.id.endsWith(':rp-raw')) {
    return { tone: 'player-rp', label: 'RP 행동' };
  }

  if (log.id.startsWith('main-command:') && log.id.endsWith(':raw')) {
    return { tone: 'player-command', label: 'GM 요청' };
  }

  if (log.id.startsWith('main-command:') && log.id.endsWith(':rp-raw')) {
    return { tone: 'player-rp', label: 'RP 행동' };
  }

  if (log.id.startsWith('player-action:') && log.id.endsWith(':raw')) {
    return { tone: 'player-rp', label: 'RP 대사' };
  }

  if (
    log.kind === 'action' &&
    log.message.startsWith('[MAIN]') &&
    !log.id.startsWith('turn-log:')
  ) {
    if (isSessionLogTitle(log.title)) {
      return { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' };
    }

    return { tone: 'player-rp', label: 'RP 대사' };
  }

  if (log.id.startsWith('system-message:') || log.id.endsWith(':pending')) {
    return { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' };
  }

  if (log.id.startsWith('turn-log:')) {
    const compact = message.trim();
    if (isCombatResultLogMessage(compact)) {
      return { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' };
    }

    if (isNpcDialogueMainCommandLog(log)) {
      const dialogueBody = compact.replace(/^\[MAIN\]/, '').trim();
      const npcDialogue = parseNpcDialogueMessage(dialogueBody);

      return {
        tone: 'npc-dialogue',
        label: null,
        speakerKind: 'npc',
        speakerName: npcDialogue?.speakerName ?? npcSpeakerName ?? 'NPC',
        displayMessage: npcDialogue?.displayMessage ?? dialogueBody,
      };
    }

    if (compact.startsWith('[MAIN]')) {
      const looksLikeSystemMainResult =
        compact.includes('판정') ||
        compact.includes('주사위') ||
        compact.includes('실패') ||
        compact.includes('성공') ||
        isCombatResultLogMessage(compact);
      return looksLikeSystemMainResult
        ? { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' }
        : { tone: 'gm-narration', label: null, speakerKind: 'gm' };
    }
    const looksLikeSystemResult =
      compact.includes('TurnLog') ||
      compact.includes('diceResult') ||
      compact.includes('stateDiff') ||
      compact.includes('outcome:') ||
      compact.includes('RP 행동을 기록했습니다.') ||
      compact.includes('판정') ||
      compact.includes('주사위') ||
      compact.includes('실패') ||
      compact.includes('성공');

    if (looksLikeSystemResult) {
      return { tone: 'system-result', label: '시스템 로그', speakerKind: 'gm' };
    }

    return { tone: 'gm-narration', label: null, speakerKind: 'gm' };
  }

  return { tone: null, label: null };
}
