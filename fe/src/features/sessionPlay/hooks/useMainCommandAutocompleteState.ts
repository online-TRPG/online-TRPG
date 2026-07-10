import { useEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { reconcileMainCommandAutocompleteIndex } from '../utils/mainCommandModel';

type UseMainCommandAutocompleteStateParams = {
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  commandEntryCount: number;
  slashToken: string;
};

type UseMainCommandAutocompleteStateResult = {
  mainCommandAutocompleteRef: RefObject<HTMLDivElement>;
};

export function useMainCommandAutocompleteState(
  params: UseMainCommandAutocompleteStateParams,
): UseMainCommandAutocompleteStateResult {
  const { activeIndex, setActiveIndex, commandEntryCount, slashToken } = params;
  const mainCommandAutocompleteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveIndex((current) =>
      reconcileMainCommandAutocompleteIndex(current, commandEntryCount),
    );
  }, [commandEntryCount, setActiveIndex, slashToken]);

  useEffect(() => {
    const activeOption = mainCommandAutocompleteRef.current?.querySelector<HTMLElement>(
      '[data-autocomplete-active="true"]',
    );
    activeOption?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return {
    mainCommandAutocompleteRef,
  };
}
