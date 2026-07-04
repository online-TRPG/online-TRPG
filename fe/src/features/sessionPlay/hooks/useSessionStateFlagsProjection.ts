import { useMemo } from 'react';

type SessionStateFlags = Record<string, unknown> | undefined;

function getObjectFlag(flags: SessionStateFlags, key: string): object | null {
  const value = flags?.[key];
  return value && typeof value === 'object' ? value : null;
}

type UseSessionStateFlagsProjectionParams = {
  flags: SessionStateFlags;
};

export function useSessionStateFlagsProjection({
  flags,
}: UseSessionStateFlagsProjectionParams) {
  return useMemo(
    () => ({
      economyState: getObjectFlag(flags, 'economy'),
      campaignCalendarState: getObjectFlag(flags, 'campaignCalendar'),
      snapshotVttMap: flags?.vttMap,
      isPartyDefeated: flags?.partyDefeated === true,
    }),
    [flags],
  );
}
