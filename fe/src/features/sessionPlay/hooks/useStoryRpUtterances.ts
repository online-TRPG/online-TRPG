import { useMemo } from 'react';
import type { Character, LogEntry, Participant } from '../../../types/session';
import { buildStoryRpUtterances } from '../utils/storyRpPresentation';

type UseStoryRpUtterancesParams = {
  logs: LogEntry[];
  participants: Participant[];
  sessionCharacters: Character[];
};

export function useStoryRpUtterances(params: UseStoryRpUtterancesParams) {
  const { logs, participants, sessionCharacters } = params;

  return useMemo(
    () => buildStoryRpUtterances({ logs, participants, sessionCharacters }),
    [logs, participants, sessionCharacters],
  );
}
