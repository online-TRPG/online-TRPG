export type HumanGmAssistLogLike = {
  title?: string | null;
  message?: string | null;
};

export type HumanGmAssistPublicClueLike = {
  id: string;
};

export function buildRecentHumanGmAssistLogSnippets(
  logs: HumanGmAssistLogLike[],
  limit = 5,
  maxLength = 220
): string[] {
  return logs
    .slice(-limit)
    .map((log) =>
      [log.title, log.message]
        .flatMap((value) => (value ? [value] : []))
        .join(': ')
        .slice(0, maxLength)
    );
}

export function buildHumanGmAssistPublicClueIdSignature(
  clues: HumanGmAssistPublicClueLike[] | null | undefined
): string {
  return (clues ?? [])
    .map((clue) => clue.id)
    .sort()
    .join('|');
}
