import type { Character, LogEntry, Participant } from '../../../types/session';
import { stripScopePrefix } from './sessionLogPresentation';

export interface StoryRpUtterance {
  id: string;
  characterId: string;
  message: string;
  createdAt: string;
}

export function buildStoryRpUtterances(params: {
  logs: LogEntry[];
  participants: Participant[];
  sessionCharacters: Character[];
  nowMs?: number;
  freshWindowMs?: number;
}): StoryRpUtterance[] {
  const {
    logs,
    participants,
    sessionCharacters,
    nowMs = Date.now(),
    freshWindowMs = 5_000,
  } = params;

  return logs
    .slice()
    .reverse()
    .filter((log) => isFreshStoryRpLog(log, nowMs, freshWindowMs))
    .map((log) => {
      const participant = participants.find((item) => item.user.displayName === log.title);
      const character = participant
        ? sessionCharacters.find((item) => item.userId === participant.userId)
        : null;

      if (!character) return null;

      return {
        id: log.id,
        characterId: character.id,
        message: stripScopePrefix(log.message),
        createdAt: log.createdAt,
      };
    })
    .filter((utterance): utterance is StoryRpUtterance => Boolean(utterance));
}

function isFreshStoryRpLog(log: LogEntry, nowMs: number, freshWindowMs: number): boolean {
  if (log.kind !== 'action') return false;
  if (!log.message.startsWith('[MAIN]')) return false;
  if (
    log.id.startsWith('turn-log:') ||
    log.id.startsWith('player-action:') ||
    log.id.startsWith('main-command:') ||
    log.id.startsWith('system-message:')
  ) {
    return false;
  }

  const createdAt = new Date(log.createdAt).getTime();
  return Number.isFinite(createdAt) && nowMs - createdAt <= freshWindowMs;
}
